import {STEP} from "../sim/data.js";
import {randomSeed} from "../sim/rng.js";
import {createSim, addPlayer, removePlayer, step, command} from "../sim/sim.js";
import {encode, eventsFor, compress, createMemory, trimEvent, SNAP_EVERY} from "./protocol.js";


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
//
// A guest's inputs are numbered, one per simulation step on their machine.
// Each step here uses the next one, so each step of walking matches a step
// the guest already took on their own screen, and the snapshot tells them
// which input number it has reached (see protocol.js).
//
// Inputs arrive in uneven bunches, so each guest has a queue that is kept
// just deep enough for how uneven their line has been lately: deep enough
// that it does not run dry (which would make them stop and go), no deeper
// (every queued input is delay). If it runs dry anyway they stand still
// until it refills; if it grows too deep, a few are used at once.

const MAX_CATCH_UP = 0.25;      // seconds; longer gaps are dropped, not replayed...
const MAX_CATCH_UP_ONLINE = 1;  // ...unless others play here (a hidden tab ticks once a second)
const PROPS_EVERY = 30;         // props are sent when they change, and at least this often
const MAX_GUESTS = 3;
const WATCH = 120;              // inputs watched to judge how uneven a line is (2 s)
const MAX_DEPTH = 8;            // never queue more than this on purpose (130 ms)
const CATCH_UP = 3;             // most extra inputs used in one step when behind
const MAX_QUEUE = 60;           // a second of inputs; more than that and we skip ahead

const WAITING = {moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, dash: false, swap: false, interact: false};

const clampAxis = value =>
    Math.max(-1, Math.min(1, Number(value) || 0));

// button bits in an input message
export const FIRE = 1, DASH = 2, SWAP = 4, INTERACT = 8;


export function createHostSession({name, loadout, seed = randomSeed()}){

    const state = createSim({seed});
    const me = "p1";
    const guests = new Map();           // player id -> {end, queue, last, ack, events}

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

        if(guests.size){

            const trimmed = state.events.map(trimEvent);

            for(const [id, guest] of guests)
                guest.events.push(...eventsFor(trimmed, state, id));

        }

        state.events.length = 0;

    }


    // one queued input [seq, moveX, moveY, aimX, aimY, buttons] as an intent
    function unpack(input){

        const buttons = input[5];

        return {
            moveX: clampAxis(input[1]),
            moveY: clampAxis(input[2]),
            aimX: Number(input[3]) || 0,
            aimY: Number(input[4]) || 0,
            fire: Boolean(buttons & FIRE),
            dash: Boolean(buttons & DASH),
            swap: Boolean(buttons & SWAP),
            interact: Boolean(buttons & INTERACT)
        };

    }


    // How many inputs to keep queued for this guest: the spread between the
    // earliest and latest arrivals lately, in steps.
    function depth(guest){

        let early = Infinity;
        let late = -Infinity;

        for(const value of guest.lateness){

            early = Math.min(early, value);
            late = Math.max(late, value);

        }

        return Math.max(1, Math.min(MAX_DEPTH, late - early));

    }


    // The inputs a guest walks by this step, and the one intent the rest of
    // the step (weapons, doors, chests) uses: the latest, with any button
    // tapped in the batch still counted.
    function takeInputs(guest){

        const queue = guest.queue;
        const want = depth(guest);

        // dry, or refilling after running dry: stand, but keep aiming and
        // holding the trigger
        if(!queue.length || (guest.refilling && queue.length < want)){

            guest.refilling = true;

            return {intent: {...guest.last, moveX: 0, moveY: 0, swap: false, interact: false}, moves: []};

        }

        guest.refilling = false;

        let count = 1;

        if(queue.length > want + 2)
            count += Math.min(CATCH_UP, queue.length - want - 2);

        const taken = queue.splice(0, count);
        const moves = taken.map(unpack);
        const intent = {...moves[moves.length - 1]};

        // walking, swapping and shooting go input by input (see sim.js);
        // a door or chest only needs to know E was pressed in the batch
        for(const m of moves)
            intent.interact ||= m.interact;

        guest.ack = taken[taken.length - 1][0];
        guest.last = intent;

        return {intent, moves};

    }


    function update(seconds, intent){

        carry = Math.min(carry + seconds, guests.size ? MAX_CATCH_UP_ONLINE : MAX_CATCH_UP);

        let steps = 0;
        let due = false;

        while(carry >= STEP){

            carry -= STEP;

            const inputs = {[me]: intent};
            const moves = {};

            for(const [id, guest] of guests){

                const taken = takeInputs(guest);

                inputs[id] = taken.intent;
                moves[id] = taken.moves;

            }

            step(state, inputs, moves);
            share();

            steps++;

            if(++sinceSnap >= SNAP_EVERY){

                sinceSnap = 0;
                due = true;

            }

        }

        // one snapshot after a burst of steps is enough (events all go with it)
        if(due)
            broadcast();

        const events = local;

        local = [];

        return {events, steps};

    }


    function broadcast(){

        for(const [id, guest] of guests){

            // a line that has not caught up yet gets the next one instead
            // (what happened meanwhile waits for it)
            if(guest.end.busy)
                continue;

            const snap = encode(state, id);

            compress(snap, guest.memory);

            snap.t0 = "s";
            snap.a = guest.ack;
            snap.ev = guest.events;

            // chests and portals rarely change: only send them when they do
            // (and now and then, in case one went missing on the way)
            const props = JSON.stringify(snap.O);

            if(props === guest.props && ++guest.sinceProps < PROPS_EVERY){

                delete snap.O;

            }
            else{

                guest.props = props;
                guest.sinceProps = 0;

            }

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


    // Puts one input [seq, ...] in its place in the queue. Inputs normally
    // come in order; while a guest's line moves from the server to a direct
    // one, a few can come late, and still count if not yet passed.
    function queueInput(guest, input){

        if(!Array.isArray(input) || input.length !== 6 || !Number.isInteger(input[0]))
            return;

        const seq = input[0];

        if(seq <= guest.ack)
            return;

        if(seq > guest.newest){

            guest.newest = seq;
            guest.queue.push(input);

        }
        else{

            const at = guest.queue.findIndex(queued => queued[0] >= seq);

            if(at === -1 || guest.queue[at][0] === seq)
                return;

            guest.queue.splice(at, 0, input);

        }

        // how late this input is, against our own steps
        guest.lateness.push(state.tick - seq);

        if(guest.lateness.length > WATCH)
            guest.lateness.shift();

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

                guests.set(id, {end, queue: [], last: {...WAITING}, ack: 0, newest: 0, refilling: true, lateness: [], events: [], props: null, sinceProps: 0, memory: createMemory()});

                addPlayer(state, {id, name: `Player ${count}`, loadout: cleanLoadout(message.loadout)});

                end.send({t0: "welcome", id, seed: state.seed, broken: state.map.broken});

                share();

                return;

            }

            const guest = guests.get(id);

            if(!guest)
                return;

            // numbered inputs, oldest first: queue the ones we have not seen
            if(message.t0 === "in" && Array.isArray(message.i)){

                for(const input of message.i)
                    queueInput(guest, input);

                // far behind (the tab was asleep, the line stalled): skip ahead
                if(guest.queue.length > MAX_QUEUE){

                    guest.queue.splice(0, guest.queue.length - depth(guest));
                    guest.lateness.length = 0;

                }

            }
            else if(message.t0 === "cmd" && message.c && typeof message.c === "object"){

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


    // everyone else leaves this world (it carries on)
    function close(){

        for(const [id, guest] of guests){

            guest.end.close();

            removePlayer(state, id);

        }

        guests.clear();

        share();

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

        // how each guest is connected: "direct" or "server"
        get routes(){ return [...guests.values()].map(guest => guest.end.route ?? "server"); },

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
