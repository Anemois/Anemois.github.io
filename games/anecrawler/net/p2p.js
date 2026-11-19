// A direct line between two players' browsers (a WebRTC data channel).
//
// The game server only introduces the two: right after someone joins, the
// host's browser and theirs swap a description of how to reach each other
// (an "offer", an "answer" and a few network addresses) through it. Once
// the direct line is open, the game talks over it, browser to browser, so
// nothing makes the trip to the server and back any more.
//
// Some networks (strict offices, some phone networks) do not let a direct
// line through. Then the game simply carries on through the server, as it
// did before; if a direct line drops later, it falls back the same way.
//
// direct(serverEnd, {starts}) wraps an end that goes through the server and
// returns one with the same shape (see transport.js), plus:
//
//   link.route        "server" until the direct line is open, then "direct"
//   link.busy         too much is waiting to go out (skip a snapshot)
//
// Setting-up messages are {t0: "rtc", ...} and never reach the game.

const ICE_SERVERS = [
    {urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]},
    {urls: "stun:stun.cloudflare.com:3478"}
];

const TRY_MS = 15000;           // no direct line by then: stay with the server
const SHAKY_MS = 6000;          // a direct line that stops answering this long is gone
const BUSY = 256 * 1024;        // bytes waiting to go out before the line counts as busy


export function direct(server, {starts}){

    const link = {
        open: true,
        route: "server",
        onMessage: null,
        onClose: null,

        send(message){

            if(!link.open)
                return;

            if(link.route === "direct"){

                try{

                    channel.send(JSON.stringify(message));

                    return;

                }
                catch{

                    // too big for the channel, or it just closed: the server can still take it
                    down();

                }

            }

            server.send(message);

        },

        close(){

            if(!link.open)
                return;

            link.open = false;

            stop();
            server.close();

        },

        get busy(){

            return link.route === "direct"
                ? channel.bufferedAmount > BUSY
                : Boolean(server.busy);

        }
    };

    let peer = null;
    let channel = null;
    let serverUp = true;
    let gaveUp = false;
    let shaky = 0;
    let signals = Promise.resolve();        // setting-up steps, one at a time

    const canTry = typeof RTCPeerConnection !== "undefined";

    const tryTimer = setTimeout(() => {

        if(link.route !== "direct")
            giveUp();

    }, TRY_MS);


    server.onMessage = message => {

        if(message && message.t0 === "rtc")
            signal(message);
        else
            link.onMessage?.(message);

    };

    server.onClose = () => {

        serverUp = false;

        // the direct line (if open) carries on without the server
        if(link.route !== "direct")
            lost();

    };


    /* ---- setting up ---- */

    function makePeer(){

        peer = new RTCPeerConnection({iceServers: ICE_SERVERS});

        peer.onicecandidate = ({candidate}) => {

            if(candidate && serverUp)
                server.send({t0: "rtc", ice: candidate.toJSON()});

        };

        peer.oniceconnectionstatechange = () => {

            const s = peer?.iceConnectionState;

            clearTimeout(shaky);

            if(s === "failed" || s === "closed")
                down();
            else if(s === "disconnected")
                shaky = setTimeout(down, SHAKY_MS);

        };

        peer.ondatachannel = ({channel: incoming}) => use(incoming);

    }


    function use(incoming){

        channel = incoming;

        channel.onopen = () => {

            if(!link.open || gaveUp)
                return;

            clearTimeout(tryTimer);

            link.route = "direct";

        };

        channel.onmessage = ({data}) => {

            let message;

            try{

                message = JSON.parse(data);

            }
            catch{

                return;

            }

            if(message?.t0 !== "rtc")
                link.onMessage?.(message);

        };

        channel.onclose = () => down();

    }


    // the other side's part of the setting up, in the order it was sent
    function signal(message){

        signals = signals.then(async () => {

            if(gaveUp || !link.open)
                return;

            // the other side cannot make direct lines
            if(message.no){

                giveUp();

                return;

            }

            if(!peer){

                if(!canTry){

                    server.send({t0: "rtc", no: 1});

                    giveUp();

                    return;

                }

                makePeer();

            }

            if(message.sdp){

                await peer.setRemoteDescription(message.sdp);

                if(message.sdp.type === "offer"){

                    await peer.setLocalDescription(await peer.createAnswer());

                    server.send({t0: "rtc", sdp: peer.localDescription.toJSON()});

                }

            }
            else if(message.ice){

                await peer.addIceCandidate(message.ice);

            }

        }).catch(() => {

            // a step went wrong: the server line still works
            giveUp();

        });

    }


    // the host's side opens the line as soon as someone has joined
    async function begin(){

        try{

            makePeer();
            use(peer.createDataChannel("game"));

            await peer.setLocalDescription(await peer.createOffer());

            server.send({t0: "rtc", sdp: peer.localDescription.toJSON()});

        }
        catch{

            giveUp();

        }

    }


    /* ---- endings ---- */

    // no direct line this time: keep using the server
    function giveUp(){

        if(gaveUp)
            return;

        gaveUp = true;

        clearTimeout(tryTimer);

        if(link.route !== "direct")
            stop();

    }


    // the direct line went away: back to the server if it is still there
    function down(){

        if(!peer)
            return;

        const wasDirect = link.route === "direct";

        stop();

        link.route = "server";
        gaveUp = true;

        if(wasDirect && !serverUp)
            lost();

    }


    function stop(){

        clearTimeout(tryTimer);
        clearTimeout(shaky);

        const old = peer;
        const oldChannel = channel;

        peer = null;
        channel = null;

        if(oldChannel){

            oldChannel.onopen = oldChannel.onmessage = oldChannel.onclose = null;
            oldChannel.close();

        }

        if(old){

            old.onicecandidate = old.oniceconnectionstatechange = old.ondatachannel = null;
            old.close();

        }

    }


    // the other player is gone for good
    function lost(){

        if(!link.open)
            return;

        link.open = false;

        stop();

        link.onClose?.();

    }


    if(starts){

        if(canTry)
            begin();
        else
            giveUp();

    }

    return link;

}
