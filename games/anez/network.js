import {SERVER_URL} from "../anecrawler/net/config.js";
import {hostRoom, joinRoom} from "../anecrawler/net/relay.js";

const TAG = "anez-1";

// Only an AneZ handshake admits the second pilgrim. Both games share the relay.
export function createNetwork(hooks){

    let generation = 0, serial = 0, received = -1;
    let room = null, peer = null, timer = 0;
    let role = "solo", ready = false;

    function stop(){

        generation++;
        clearTimeout(timer);
        if(peer)
            peer.onClose = null;
        peer?.close();
        room?.close();
        room = peer = null;
        role = "solo";
        ready = false;
        received = -1;

    }

    function attach(end, host){

        peer = end;
        ready = false;
        received = -1;
        serial = 0;
        const lost = () => {

            if(end !== peer)
                return;
            clearTimeout(timer);
            peer = null;
            const wasReady = ready;
            ready = false;
            if(!host)
                role = "solo";
            hooks.lost(host, wasReady);

        };
        end.onClose = lost;
        end.onMessage = m => {

            if(m?.game !== TAG)
                return;
            if(!ready){

                if(m.type !== (host ? "hello" : "welcome"))
                    return;
                ready = true;
                clearTimeout(timer);
                if(host)
                    send("welcome");
                hooks.connected(host);
                return;

            }
            if(!Number.isSafeInteger(m.seq) || m.seq <= received)
                return;
            received = m.seq;
            hooks.message(m.type, m.payload);

        };
        timer = setTimeout(() => {

            if(!ready && end === peer){

                lost();
                end.close();

            }

        }, 9000);
        if(!host)
            send("hello");

    }

    function send(type, payload){

        peer?.send({game:TAG, type, seq:serial++, payload});

    }

    async function host(){

        stop();
        const current = generation;
        role = "host";
        const opened = await hostRoom(SERVER_URL, {
            game:"anez",
            onGuest(end){

                if(current !== generation || peer || !hooks.accepting())
                    end.close();
                else
                    attach(end, true);

            },
            onWaiting:() => current === generation && hooks.status("Waking the room server…"),
            onClose(reason){

                if(current !== generation)
                    return;
                room = null;
                if(!peer)
                    role = "solo";
                hooks.roomClosed(reason);

            }
        });
        if(current !== generation){

            opened.close();
            return;

        }
        room = opened;
        hooks.code(room.code);

    }

    async function join(code){

        stop();
        const current = generation;
        role = "guest";
        const end = await joinRoom(SERVER_URL, code, {
            onWaiting:() => current === generation && hooks.status("Waking the room server…")
        });
        if(current !== generation){

            end.close();
            return;

        }
        attach(end, false);

    }

    return {host, join, stop, send, get ready(){ return ready; }, get role(){ return role; },
        get busy(){ return peer?.busy; }, get code(){ return room?.code || ""; }};

}
