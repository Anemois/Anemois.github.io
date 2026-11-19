// A transport carries messages between two players' machines. Whatever is
// underneath, each end looks the same:
//
//   end.send(message)          any JSON-like object
//   end.onMessage = fn         called with each message from the other end
//   end.onClose = fn           the other end went away
//   end.close()
//
// Two are here: an in-memory pair (for tests), and one that links browser
// tabs on the same computer with a BroadcastChannel, which needs no server
// at all. A WebRTC data channel (player to player over the internet) or a
// WebSocket (through a server) would be wrapped the same way.


function makeEnd(deliver, shut){

    const end = {
        open: true,
        onMessage: null,
        onClose: null,

        send(message){

            if(end.open)
                deliver(message);

        },

        close(){

            if(!end.open)
                return;

            end.open = false;

            shut();

        }
    };

    return end;

}


// Two ends wired to each other in memory. With a delay, messages wait in a
// queue until advance(ms) has moved time far enough: the tests use that to
// play with lag.
export function loopbackPair({delay = 0, jitter = 0, random = Math.random} = {}){

    const queue = [];

    let now = 0;
    let a = null;
    let b = null;

    const post = to => message => {

        // through JSON, like a real wire: nothing is shared by accident
        const copy = JSON.parse(JSON.stringify(message));

        if(delay <= 0 && jitter <= 0){

            to().onMessage?.(copy);

            return;

        }

        queue.push({at: now + delay + random() * jitter, to, copy});

    };

    const shut = other => () => {

        const end = other();

        if(end.open){

            end.open = false;
            end.onClose?.();

        }

    };

    a = makeEnd(post(() => b), shut(() => b));
    b = makeEnd(post(() => a), shut(() => a));

    function advance(ms){

        now += ms;

        queue.sort((x, y) => x.at - y.at);

        while(queue.length && queue[0].at <= now){

            const {to, copy} = queue.shift();

            if(to().open)
                to().onMessage?.(copy);

        }

    }

    return {a, b, advance};

}


/* ---------------- Tabs on one computer ---------------- */

const SILENCE = 5000;           // ms without a word before an end counts as gone

const channelName = room => `anecrawler:${room}`;


// The host's side: calls onClient(end) for every tab that joins.
// Returns a function that stops hosting.
export function hostTabs(room, onClient){

    const channel = new BroadcastChannel(channelName(room));
    const clients = new Map();          // tab id -> {end, heard}

    const drop = id => {

        const client = clients.get(id);

        if(!client)
            return;

        clients.delete(id);

        if(client.end.open){

            client.end.open = false;
            client.end.onClose?.();

        }

    };

    channel.onmessage = ({data}) => {

        if(data.to !== "host")
            return;

        if(data.kind === "hello" && !clients.has(data.from)){

            const end = makeEnd(
                body => channel.postMessage({to: data.from, from: "host", kind: "msg", body}),
                () => {

                    channel.postMessage({to: data.from, from: "host", kind: "bye"});

                    clients.delete(data.from);

                }
            );

            clients.set(data.from, {end, heard: Date.now()});

            onClient(end);

        }

        const client = clients.get(data.from);

        if(!client)
            return;

        client.heard = Date.now();

        if(data.kind === "msg")
            client.end.onMessage?.(data.body);

        if(data.kind === "bye")
            drop(data.from);

    };

    const watch = setInterval(() => {

        for(const [id, client] of clients)
            if(Date.now() - client.heard > SILENCE)
                drop(id);

    }, 1000);

    return () => {

        clearInterval(watch);

        for(const client of [...clients.values()])
            client.end.close();

        channel.close();

    };

}


// A joining tab's side: one end that talks to the host.
export function joinTabs(room){

    const channel = new BroadcastChannel(channelName(room));
    const id = Math.random().toString(36).slice(2, 10);

    let heard = Date.now();

    const end = makeEnd(
        body => channel.postMessage({to: "host", from: id, kind: "msg", body}),
        () => {

            channel.postMessage({to: "host", from: id, kind: "bye"});

            clearInterval(watch);
            channel.close();

        }
    );

    const lost = () => {

        if(!end.open)
            return;

        end.open = false;

        clearInterval(watch);
        channel.close();

        end.onClose?.();

    };

    channel.onmessage = ({data}) => {

        if(data.to !== id)
            return;

        heard = Date.now();

        if(data.kind === "msg")
            end.onMessage?.(data.body);

        if(data.kind === "bye")
            lost();

    };

    const watch = setInterval(() => {

        if(Date.now() - heard > SILENCE)
            lost();

    }, 1000);

    channel.postMessage({to: "host", from: id, kind: "hello"});

    return end;

}
