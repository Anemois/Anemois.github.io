import {STEP} from "../sim/data.js";
import {randomSeed} from "../sim/rng.js";
import {createSim, addPlayer, removePlayer, step, command} from "../sim/sim.js";
import {encode, eventsFor, SNAP_EVERY} from "./protocol.js";


// A session is how the page talks to a game world:
//
//   session.me                    the local player's id
//   session.state                 the world to draw (read only)
//   session.update(seconds, intent) -> {events, steps}
//   session.send(cmd)             loot choices, loadout, start, quit
//   session.online                is anyone else in this world?
//
// This one runs the simulation on this machine. Played alone that is the
// whole story. Other players can also be let in with accept(transport):
// each sends its inputs here and gets snapshots back (see protocol.js), so
// this machine is the one that decides what really happened. A dedicated
// server would be this same file running under Node with no local player.

const MAX_CATCH_UP = 0.25;      // seconds; longer gaps are dropped, not replayed
const MAX_GUESTS = 3;

const IDLE = [0, 0, 0, 0, 0];   // moveX, moveY, aimX, aimY, buttons

// button bits in an input message
export const FIRE = 1, DASH = 2, SWAP = 4, INTERACT = 8;


export function createHostSession({name, loadout, seed = randomSeed()}){

    const state = createSim({seed});
    const me = "p1";
    const guests = new Map();           // player id -> {end, input, pulses, events}

    let carry = 0;
    let count = 1;
    let sinceSnap = 0;
    let local = [];                     // events for this machine's screen

    addPlayer(state, {id: me, name: "Player 1", loadout});

    state.events.length = 0;


    // hands what just happened to our own screen and to every guest
    function share(){

        if(!state.events.length)
            return;

        local.push(...state.events);

        for(const [id, guest] of guests)
            guest.events.push(...eventsFor(state.events, state, id));

        state.events.length = 0;

    }


    function unpack(input, pulses){

        const buttons = input[4] | pulses;

        return {
            moveX: input[0],
            moveY: input[1],
            aimX: input[2],
            aimY: input[3],
            fire: Boolean(buttons & FIRE),
            dash: Boolean(buttons & DASH),
            swap: Boolean(buttons & SWAP),
            interact: Boolean(buttons & INTERACT)
        };

    }


    function update(seconds, intent){

        carry = Math.min(carry + seconds, MAX_CATCH_UP);

        let steps = 0;

        while(carry >= STEP){

            carry -= STEP;

            const inputs = {[me]: intent};

            for(const [id, guest] of guests){

                inputs[id] = unpack(guest.input, guest.pulses);

                // a tap that came and went between steps still counts once
                guest.pulses = 0;

            }

            step(state, inputs);
            share();

            steps++;

            if(++sinceSnap >= SNAP_EVERY){

                sinceSnap = 0;

                broadcast();

            }

        }

        const events = local;

        local = [];

        return {events, steps};

    }


    function broadcast(){

        for(const [id, guest] of guests){

            const snap = encode(state, id);

            snap.t0 = "s";
            snap.ev = guest.events;

            guest.events = [];
            guest.end.send(snap);

        }

    }


    // our own commands; what they caused comes back at once
    function send(cmd){

        command(state, me, cmd);
        share();

        const events = local;

        local = [];

        return events;

    }


    // lets another player in over a transport (see transport.js)
    function accept(end){

        let id = null;

        end.onMessage = message => {

            if(message.t0 === "join" && id === null){

                if(guests.size >= MAX_GUESTS){

                    end.send({t0: "full"});
                    end.close();

                    return;

                }

                id = `p${++count}`;

                guests.set(id, {end, input: IDLE, pulses: 0, events: []});

                addPlayer(state, {id, name: `Player ${count}`, loadout: cleanLoadout(message.loadout)});

                end.send({t0: "welcome", id, seed: state.seed, broken: state.map.broken});

                share();

                return;

            }

            const guest = guests.get(id);

            if(!guest)
                return;

            if(message.t0 === "in"){

                guest.input = message.i;
                guest.pulses |= message.i[4] & (DASH | SWAP | INTERACT | FIRE);

            }
            else if(message.t0 === "cmd"){

                if(message.c.type === "loadout")
                    message.c.items = cleanLoadout(message.c.items);

                command(state, id, message.c);
                share();

            }
            else if(message.t0 === "sync"){

                end.send({t0: "broken", broken: state.map.broken});

            }

        };

        end.onClose = () => {

            if(id === null || !guests.has(id))
                return;

            guests.delete(id);

            removePlayer(state, id);
            share();

        };

    }


    function close(){

        for(const guest of [...guests.values()])
            guest.end.close();

        guests.clear();

    }


    return {
        me,
        state,
        update,
        send,
        accept,
        close,

        get online(){ return guests.size > 0; },
        get players(){ return state.players.length; },

        role: "host"
    };

}


// only what a weapon is made of crosses the wire
function cleanLoadout(items){

    if(!Array.isArray(items))
        return [];

    return items.slice(0, 2)
        .filter(item => item && typeof item.type === "string" && Number.isFinite(item.level))
        .map(({uid, type, level}) => ({uid, type, level: Math.max(1, Math.min(99, Math.floor(level)))}));

}
