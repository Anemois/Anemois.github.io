import crypto from "node:crypto";


// A small WebSocket server (RFC 6455) on top of Node's own http module, so
// the game server needs nothing installed besides Node. It does what the
// game needs: text messages, any size up to a limit, split (fragmented)
// messages, ping/pong to spot dead connections, and a clean close.
//
//   attach(httpServer, {path, maxMessage, allowOrigin, onConnection})
//
// onConnection(socket, request) gets a socket with:
//   socket.send(text)     socket.close(code, reason)
//   socket.onMessage = text => {}     socket.onClose = () => {}
//   socket.backlog        bytes waiting to go out (slow connections)

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";   // fixed by the standard (RFC 6455)

const CONTINUATION = 0x0;
const TEXT = 0x1;
const BINARY = 0x2;
const CLOSE = 0x8;
const PING = 0x9;
const PONG = 0xa;

const HEARTBEAT_MS = 25000;     // ping this often; no answer by the next ping = gone


export function attach(server, {path = "/ws", maxMessage = 256 * 1024, allowOrigin = () => true, onConnection}){

    const sockets = new Set();

    server.on("upgrade", (request, raw, head) => {

        const url = new URL(request.url, "http://host");
        const key = request.headers["sec-websocket-key"];
        const upgrade = (request.headers.upgrade ?? "").toLowerCase();

        if(url.pathname !== path || upgrade !== "websocket" || !key){

            raw.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");

            return;

        }

        if(!allowOrigin(request.headers.origin ?? "")){

            raw.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");

            return;

        }

        const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");

        raw.write(
            "HTTP/1.1 101 Switching Protocols\r\n" +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
        );

        raw.setNoDelay(true);

        const socket = wrap(raw, maxMessage, () => sockets.delete(socket));

        sockets.add(socket);

        onConnection(socket, request);

        if(head?.length)
            socket.feed(head);

    });

    // drop connections that stopped answering
    const heartbeat = setInterval(() => {

        for(const socket of sockets)
            socket.heartbeat();

    }, HEARTBEAT_MS);

    heartbeat.unref();

    return {
        sockets,
        close(){

            clearInterval(heartbeat);

            for(const socket of sockets)
                socket.close(1001, "server shutting down");

        }
    };

}


function wrap(raw, maxMessage, forget){

    let buffer = Buffer.alloc(0);
    let parts = [];             // pieces of a split message
    let partsSize = 0;
    let partsType = 0;
    let open = true;
    let answered = true;

    const socket = {
        onMessage: null,
        onClose: null,

        get backlog(){ return raw.writableLength; },

        send(text){

            if(open)
                raw.write(frame(TEXT, Buffer.from(text)));

        },

        close(code = 1000, reason = ""){

            if(!open)
                return;

            const why = Buffer.from(reason.slice(0, 120));
            const body = Buffer.alloc(2 + why.length);

            body.writeUInt16BE(code, 0);
            why.copy(body, 2);

            raw.write(frame(CLOSE, body));
            raw.end();

            finish();

        },

        heartbeat(){

            if(!answered)
                return raw.destroy();

            answered = false;

            if(open)
                raw.write(frame(PING, Buffer.alloc(0)));

        },

        feed
    };


    function finish(){

        if(!open)
            return;

        open = false;

        forget();

        socket.onClose?.();

    }


    // a protocol error: say why and hang up
    function fail(code, reason){

        socket.close(code, reason);
        raw.destroy();

    }


    function feed(chunk){

        buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;

        while(open){

            if(buffer.length < 2)
                return;

            const first = buffer[0];
            const second = buffer[1];
            const fin = (first & 0x80) !== 0;
            const opcode = first & 0x0f;
            const masked = (second & 0x80) !== 0;

            let length = second & 0x7f;
            let offset = 2;

            if(length === 126){

                if(buffer.length < 4)
                    return;

                length = buffer.readUInt16BE(2);
                offset = 4;

            }
            else if(length === 127){

                if(buffer.length < 10)
                    return;

                const high = buffer.readUInt32BE(2);

                length = buffer.readUInt32BE(6);
                offset = 10;

                if(high !== 0)
                    return fail(1009, "message too big");

            }

            // browsers always mask what they send; anything else is not one
            if(!masked)
                return fail(1002, "frames from a client must be masked");

            if(length > maxMessage)
                return fail(1009, "message too big");

            if(buffer.length < offset + 4 + length)
                return;

            const mask = buffer.subarray(offset, offset + 4);
            const payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + length));

            for(let i = 0; i < payload.length; i++)
                payload[i] ^= mask[i & 3];

            buffer = buffer.subarray(offset + 4 + length);
            answered = true;

            handle(fin, opcode, payload);

        }

    }


    function handle(fin, opcode, payload){

        switch(opcode){

            case PING:

                raw.write(frame(PONG, payload));

                return;

            case PONG:

                return;

            case CLOSE:

                raw.write(frame(CLOSE, payload.subarray(0, 2)));
                raw.end();

                finish();

                return;

            case TEXT:
            case BINARY:
            case CONTINUATION: {

                if(opcode !== CONTINUATION){

                    if(parts.length)
                        return fail(1002, "a new message started before the last one ended");

                    partsType = opcode;

                }
                else if(!parts.length){

                    return fail(1002, "a continuation with nothing to continue");

                }

                parts.push(payload);
                partsSize += payload.length;

                if(partsSize > maxMessage)
                    return fail(1009, "message too big");

                if(!fin)
                    return;

                const whole = parts.length === 1 ? parts[0] : Buffer.concat(parts);

                parts = [];
                partsSize = 0;

                // the game only speaks text
                if(partsType !== TEXT)
                    return fail(1003, "only text messages");

                socket.onMessage?.(whole.toString("utf8"));

                return;

            }

            default:

                fail(1002, "unknown frame type");

        }

    }


    raw.on("data", feed);

    // the other side hung up without a goodbye (http servers keep such
    // sockets half open, so finish them here)
    raw.on("end", () => {

        raw.end();

        finish();

    });

    raw.on("close", finish);
    raw.on("error", () => raw.destroy());

    return socket;

}


// one unmasked frame (servers never mask)
function frame(opcode, payload){

    const length = payload.length;

    let header;

    if(length < 126){

        header = Buffer.from([0x80 | opcode, length]);

    }
    else if(length < 65536){

        header = Buffer.alloc(4);
        header[0] = 0x80 | opcode;
        header[1] = 126;
        header.writeUInt16BE(length, 2);

    }
    else{

        header = Buffer.alloc(10);
        header[0] = 0x80 | opcode;
        header[1] = 127;
        header.writeUInt32BE(0, 2);
        header.writeUInt32BE(length, 6);

    }

    return Buffer.concat([header, payload]);

}
