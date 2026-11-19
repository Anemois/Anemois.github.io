import {STEP} from "../sim/data.js";
import {randomSeed} from "../sim/rng.js";
import {createMirror} from "./protocol.js";
import {FIRE, DASH, SWAP, INTERACT} from "./host.js";


// The session of a player who joined someone else's world. It has the
// same shape as the host's (see host.js), but nothing is decided here:
// inputs go to the host, and the world we draw is rebuilt from the
// snapshots it sends back (see protocol.js).
//
// Inputs are taken once per simulation step, numbered, used at once to move
// our own character and fire its weapon (see predict.js), and sent in pairs
// (30 messages a second).

const MAX_CATCH_UP = 0.25;      // seconds of inputs made up after a slow frame
const SEND_AFTER = 2;           // inputs per message
const SYNC_MS = 1000;


export function createClientSession(end, {name, loadout, onClose}){

    let mirror = createMirror(randomSeed());
    let me = null;
    let carry = 0;
    let seq = 0;
    let outbox = [];            // inputs not sent yet
    let inbox = [];             // events received, waiting for the page
    let closed = false;
    let lastSync = -Infinity;

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

                // our crates disagree with the host's: ask for the list (once
                // a second at most; the answer takes a moment to come)
                if(mirror.needSync && performance.now() - lastSync > SYNC_MS){

                    lastSync = performance.now();

                    end.send({t0: "sync"});

                }

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

        let steps = 0;

        if(me !== null){

            carry = Math.min(carry + seconds, MAX_CATCH_UP);

            // whole numbers for the aim: exactly what the host will get
            const input = {...intent, aimX: Math.round(intent.aimX), aimY: Math.round(intent.aimY)};

            const buttons =
                (input.fire ? FIRE : 0) | (input.dash ? DASH : 0) |
                (input.swap ? SWAP : 0) | (input.interact ? INTERACT : 0);

            while(carry >= STEP){

                carry -= STEP;
                seq++;
                steps++;

                mirror.predict(seq, input);

                outbox.push([seq, input.moveX, input.moveY, input.aimX, input.aimY, buttons]);

            }

            if(outbox.length >= SEND_AFTER){

                end.send({t0: "in", i: outbox});

                outbox = [];

            }

        }

        mirror.advance(seconds, intent, seq + carry / STEP);

        // what our own hands did shows at once; the host's news after it
        const events = mirror.take();

        if(inbox.length){

            events.push(...inbox);

            inbox = [];

        }

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
        get routes(){ return [end.route ?? "server"]; },

        online: true,
        role: "guest"
    };

}
