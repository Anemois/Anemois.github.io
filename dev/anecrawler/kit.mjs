// Helpers for testing AneCrawler without a browser: a game you can step,
// place things in and read events from, and a host + guest pair joined by
// a fake network with delay. Import what a test needs:
//
//   import {game, link, checks, IDLE} from "./kit.mjs";
//
//   const g = game({floor: 4, players: 2, quiet: true});
//   const e = g.spawn("archer", g.p.x + 150, g.p.y);
//   g.step(60, {p1: {fire: true}});            // a second of holding fire
//   g.count("death");                           // events seen since the last take()
//
// Everything runs on the real simulation code in games/anecrawler/sim.

import {createSim, addPlayer, step as simStep, command, IDLE} from "../../games/anecrawler/sim/sim.js";
import {makeEnemy, refreshLive} from "../../games/anecrawler/sim/enemies.js";
import {killEnemy} from "../../games/anecrawler/sim/world.js";
import {lineOfSight, castRay} from "../../games/anecrawler/sim/physics.js";
import {STEP, TILE, BOSS} from "../../games/anecrawler/sim/data.js";
import {FLOOR} from "../../games/anecrawler/sim/map.js";
import {createHostSession} from "../../games/anecrawler/net/host.js";
import {createClientSession} from "../../games/anecrawler/net/client.js";
import {loopbackPair} from "../../games/anecrawler/net/transport.js";

export {IDLE, STEP, TILE, command};

export const PISTOL = [{uid: 1, type: "pistol", level: 1}, {uid: 2, type: "sword", level: 1}];


// PASS/FAIL lines and a total; done() sets the exit code
export function checks(){

    let failed = 0;
    let passed = 0;

    return {

        ok(name, condition, detail = ""){

            condition ? passed++ : failed++;

            console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail === "" ? "" : "  " + detail}`);

            return Boolean(condition);

        },

        done(){

            console.log(failed ? `${failed} failed, ${passed} passed` : `all ${passed} passed`);

            process.exitCode = failed ? 1 : process.exitCode;

            return failed === 0;

        }

    };

}


// A game on `floor` (0 = stay in the lobby) with players p1, p2... in a run.
// quiet: no enemies (bosses too) so a test starts from a clean room.
// alive: players are kept at full health between steps.
export function game({floor = 1, players = 1, seed = 1, loadout = PISTOL, quiet = false, alive = false} = {}){

    const state = createSim({seed});
    const ids = [];

    for(let i = 1; i <= players; i++){

        ids.push(`p${i}`);

        addPlayer(state, {id: `p${i}`, name: `Player ${i}`, loadout: loadout.map(item => ({...item}))});

    }

    const log = [];

    const g = {

        state,
        ids,
        log,

        get p(){ return state.players[0]; },
        get players(){ return state.players; },
        get enemies(){ return state.enemies.filter(e => !e.dead); },
        get boss(){ return state.enemies.find(e => e.boss && !e.dead) ?? null; },

        // n steps; intents is {p1: {...}} (missing keys are IDLE, aim
        // defaults to straight right) or a function (i) -> that object
        step(n = 1, intents = {}){

            let last = [];

            for(let i = 0; i < n; i++){

                const given = typeof intents === "function" ? intents(i) : intents;
                const inputs = {};

                for(const p of state.players)
                    inputs[p.id] = {...IDLE, aimX: p.x + 100, aimY: p.y, ...given[p.id]};

                simStep(state, inputs);

                last = state.events.slice();
                log.push(...last);
                state.events.length = 0;

                if(alive)
                    for(const p of state.players){ p.hp = p.maxHp; p.dead = false; }

            }

            return last;

        },

        // events since the last take()
        take(){ return log.splice(0); },
        count(type){ return log.filter(e => e.type === type).length; },
        seen(type){ return log.find(e => e.type === type) ?? null; },

        send(pid, cmd){ command(state, pid, cmd); },

        // an enemy in play at once: awake, or asleep (stays put until
        // someone comes close)
        spawn(type, x, y, {asleep = false, ...options} = {}){

            const e = makeEnemy(state, type, x, y, {spawn: 0, asleep, ...options});

            if(!asleep)
                e.alert = 0;

            state.enemies.push(e);
            refreshLive(state);

            return e;

        },

        clear(){

            state.enemies = state.enemies.filter(e => e.dummy);
            state.bullets = [];
            refreshLive(state);

        },

        // dead for good (no splitting, no getting up again)
        kill(e){ killEnemy(state, e, null, {final: true}); },

        // turns this floor's boss into `id` (warden, lich, queen, eclipse, forgeheart)
        makeBoss(id){

            const b = state.enemies.find(e => e.boss);
            const def = BOSS[id];

            Object.assign(b, {boss: id, type: id, name: def.name, shape: def.shape, r: def.radius, speed: def.speed, color: def.color});

            return b;

        },

        // a floor tile within [min, max] units of `from`, in its line of
        // sight (sight: true) or hidden from it by rock (sight: false)
        spot(from, {min = 60, max = 260, sight = true} = {}){

            for(let r = min; r <= max; r += 16){

                for(let a = 0; a < Math.PI * 2; a += 0.25){

                    const at = {x: from.x + Math.cos(a) * r, y: from.y + Math.sin(a) * r};
                    const tx = Math.floor(at.x / TILE);
                    const ty = Math.floor(at.y / TILE);

                    if(state.map.tiles[ty * state.map.w + tx] === FLOOR && lineOfSight(state.map, from, at) === sight)
                        return at;

                }

            }

            return null;

        },

        place(p, x, y){

            p.x = x;
            p.y = y;

        },

        // the way with the most open floor ahead of `from`: [dx, dy]
        openWay(from){ return openWay(state.map, from); }

    };

    g.step();

    if(floor > 0){

        command(state, "p1", {type: "start", floor});

        for(let i = 0; i < 30 && state.mode !== "run"; i++){

            for(const id of ids.slice(1))
                if(state.vote)
                    command(state, id, {type: "vote", agree: true});

            g.step();

        }

        g.step(2);

    }

    if(quiet)
        g.clear();

    g.take();

    return g;

}


export function openWay(map, from){

    let best = [1, 0];
    let bestLength = -1;

    for(let i = 0; i < 16; i++){

        // (three rays a body's width apart, so a corner beside the middle
        // line counts too)
        const a = i / 16 * Math.PI * 2;
        const nx = -Math.sin(a) * 13;
        const ny = Math.cos(a) * 13;
        const length = Math.min(...[-1, 0, 1].map(k => castRay(map, from.x + nx * k, from.y + ny * k, a, 600).length));

        if(length > bestLength){

            best = [Math.cos(a), Math.sin(a)];
            bestLength = length;

        }

    }

    return best;

}


// A host and a guest joined by a fake wire (delay and jitter in ms, the
// same random sequence every time). frame() moves both one step.
export function link({delay = 60, jitter = 20, seed = 11, host = PISTOL, guest = PISTOL, ordered = true} = {}){

    let n = 7;
    const random = () => (n = (n * 16807) % 2147483647) / 2147483647;

    const hostSession = createHostSession({name: "Player 1", loadout: host, seed});
    const wire = loopbackPair({delay, jitter, random, ordered});

    hostSession.accept(wire.a);

    const guestSession = createClientSession(wire.b, {name: "Player 2", loadout: guest});
    const guestEvents = [];

    const l = {

        host: hostSession,
        guest: guestSession,
        wire,
        guestEvents,

        // the guest's own player as the guest draws it / as the host has it
        get mine(){ return guestSession.state?.players.find(p => p.id === guestSession.me); },
        get mineOnHost(){ return hostSession.state.players.find(p => p.id === guestSession.me); },

        frame(guestIntent = {}, hostIntent = {}){

            hostSession.update(STEP, {...IDLE, ...hostIntent});
            wire.advance(STEP * 1000);

            const result = guestSession.update(STEP, {...IDLE, ...guestIntent});

            guestEvents.push(...(result?.events ?? []));

            return result;

        },

        frames(count, guestIntent = {}, hostIntent = {}){

            for(let i = 0; i < count; i++)
                l.frame(typeof guestIntent === "function" ? guestIntent(i) : guestIntent, hostIntent);

        },

        // both into a run on `floor` (the guest agrees to the trip)
        start(floor = 1){

            l.frames(60);
            hostSession.send({type: "start", floor});
            l.frames(20);
            guestSession.send({type: "vote", agree: true});
            l.frames(60);

            return hostSession.state.mode === "run" && guestSession.state.mode === "run";

        }

    };

    return l;

}
