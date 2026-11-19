import {randomSeed} from "../sim/rng.js";
import {createMirror} from "./protocol.js";
import {FIRE, DASH, SWAP, INTERACT} from "./host.js";


// The session of a player who joined someone else's world. It has the
// same shape as the host's (see host.js), but nothing is decided here:
// inputs go to the host, and the world we draw is rebuilt from the
// snapshots it sends back.

const SEND_EVERY = 1 / 30;      // seconds between input messages


export function createClientSession(end, {name, loadout, onClose}){

    let mirror = createMirror(randomSeed());
    let me = null;
    let sendIn = 0;
    let inbox = [];             // events received, waiting for the page
    let closed = false;

    end.onMessage = message => {

        switch(message.t0){

            case "welcome":

                me = message.id;

                mirror = createMirror(message.seed);
                mirror.setMe(me);
                mirror.pending = message.broken;

                break;

            case "s": {

                const events = mirror.apply(message, mirror.pending);

                mirror.pending = null;

                inbox.push(...events);

                if(mirror.needSync)
                    end.send({t0: "sync"});

                break;

            }

            case "broken":

                mirror.pending = message.broken;

                break;

            case "full":

                finish("That game is full.");

                break;

        }

    };

    end.onClose = () => finish("The host left.");

    end.send({t0: "join", name, loadout});


    function finish(reason){

        if(closed)
            return;

        closed = true;

        onClose?.(reason);

    }


    function update(seconds, intent){

        mirror.advance(seconds, intent);

        sendIn -= seconds;

        let steps = 0;

        if(sendIn <= 0 && me !== null){

            sendIn = SEND_EVERY;
            steps = 1;

            const buttons =
                (intent.fire ? FIRE : 0) | (intent.dash ? DASH : 0) |
                (intent.swap ? SWAP : 0) | (intent.interact ? INTERACT : 0);

            end.send({t0: "in", i: [intent.moveX, intent.moveY, Math.round(intent.aimX), Math.round(intent.aimY), buttons]});

        }

        const events = inbox;

        inbox = [];

        return {events, steps};

    }


    // commands go to the host; what they cause arrives with a later snapshot
    function send(cmd){

        end.send({t0: "cmd", c: cmd});

        return [];

    }


    function close(){

        closed = true;

        end.close();

    }


    return {
        update,
        send,
        close,

        get me(){ return me; },
        get state(){ return mirror.state; },
        get players(){ return mirror.state.players.length; },

        online: true,
        role: "guest"
    };

}
