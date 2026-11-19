// Player to player over the internet with WebRTC, with no game server.
//
// Browsers can talk directly once they have swapped a short description of
// how to reach each other. Here that swap is done by hand with two codes:
//
//   1. the joining player makes a join code and sends it to the host
//      (any chat app will do)
//   2. the host pastes it and gets a reply code back, which it sends back
//   3. the joining player pastes the reply: connected
//
// A public STUN server helps each side find its own internet address. Most
// home networks connect fine this way; a few strict ones (some phone
// networks, offices) would need a relay (TURN) server as well.
//
// With a server of your own, the two codes would be passed along by it
// automatically instead: nothing else here would change.

const ICE = [{urls: "stun:stun.l.google.com:19302"}, {urls: "stun:stun1.l.google.com:19302"}];
const GATHER_MS = 4000;         // longest to wait for network addresses


/* ---------------- Codes ---------------- */

// a session description squeezed into a copy-pasteable string
async function pack(description){

    const text = JSON.stringify({t: description.type, s: description.sdp});

    if(typeof CompressionStream === "undefined")
        return "J" + btoa(text);

    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());

    let binary = "";

    for(const byte of bytes)
        binary += String.fromCharCode(byte);

    return "Z" + btoa(binary);

}


async function unpack(code){

    code = code.trim().replace(/\s+/g, "");

    let text;

    if(code[0] === "Z"){

        const bytes = Uint8Array.from(atob(code.slice(1)), c => c.charCodeAt(0));
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));

        text = await new Response(stream).text();

    }
    else if(code[0] === "J"){

        text = atob(code.slice(1));

    }
    else{

        throw new Error("not a game code");

    }

    const {t, s} = JSON.parse(text);

    return {type: t, sdp: s};

}


// waits until the browser has found its network addresses (or gives up
// waiting: whatever it has by then usually works)
function gathered(peer){

    if(peer.iceGatheringState === "complete")
        return Promise.resolve();

    return new Promise(resolve => {

        const done = () => {

            if(peer.iceGatheringState === "complete")
                resolve();

        };

        peer.addEventListener("icegatheringstatechange", done);

        setTimeout(resolve, GATHER_MS);

    });

}


/* ---------------- Ends ---------------- */

// wraps an open data channel as a transport end (see transport.js)
function channelEnd(peer, channel){

    const end = {
        open: true,
        onMessage: null,
        onClose: null,

        send(message){

            if(end.open && channel.readyState === "open")
                channel.send(JSON.stringify(message));

        },

        close(){

            if(!end.open)
                return;

            end.open = false;

            channel.close();
            peer.close();

        }
    };

    const lost = () => {

        if(!end.open)
            return;

        end.open = false;

        peer.close();

        end.onClose?.();

    };

    channel.onmessage = ({data}) => end.onMessage?.(JSON.parse(data));
    channel.onclose = lost;

    peer.addEventListener("connectionstatechange", () => {

        if(["failed", "closed", "disconnected"].includes(peer.connectionState))
            lost();

    });

    return end;

}


function opened(channel){

    return new Promise((resolve, reject) => {

        if(channel.readyState === "open")
            return resolve();

        channel.onopen = () => resolve();
        channel.onerror = () => reject(new Error("the connection failed"));

    });

}


/* ---------------- The two sides ---------------- */

// Joining player, step 1. Returns {code, finish(replyCode) -> Promise<end>}.
export async function makeJoinCode(){

    const peer = new RTCPeerConnection({iceServers: ICE});
    const channel = peer.createDataChannel("game");

    await peer.setLocalDescription(await peer.createOffer());
    await gathered(peer);

    return {
        code: await pack(peer.localDescription),

        async finish(reply){

            await peer.setRemoteDescription(await unpack(reply));
            await opened(channel);

            return channelEnd(peer, channel);

        },

        cancel: () => peer.close()
    };

}


// Host, step 2. Returns {code (the reply), end: Promise<end>}.
export async function answerJoinCode(joinCode){

    const peer = new RTCPeerConnection({iceServers: ICE});

    const channel = new Promise(resolve => {

        peer.ondatachannel = ({channel}) => resolve(channel);

    });

    await peer.setRemoteDescription(await unpack(joinCode));
    await peer.setLocalDescription(await peer.createAnswer());
    await gathered(peer);

    return {
        code: await pack(peer.localDescription),

        end: channel.then(async c => {

            await opened(c);

            return channelEnd(peer, c);

        })
    };

}
