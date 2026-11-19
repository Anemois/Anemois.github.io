import {ENEMIES, BOSSES, ELITE, CHAMPION, WEAPONS, PLAYER, STEP} from "../sim/data.js";
import {buildMap} from "../sim/sim.js";
import {breakCrate} from "../sim/map.js";
import {moveBody} from "../sim/physics.js";


// What the host sends to each other player, and how their machine turns it
// back into a world to draw.
//
// A snapshot is the part of the world near one player, packed small:
// enemies and bullets go as short number arrays (what they look like is
// looked up from their type, not sent), the map is never sent at all (it is
// rebuilt from the seed), and everything that "happened" rides along as the
// same events the host's own screen uses.
//
// The receiving side (the mirror) keeps a world object shaped like the
// real one, so the renderer cannot tell the difference. Between snapshots
// it slides things from where they were to where they are now, lets
// bullets fly on at their speed, and moves your own character at once
// (prediction) while gently pulling it to where the host says you are.

export const SNAP_EVERY = 4;                    // steps between snapshots (15 a second)

const SNAP_TIME = SNAP_EVERY * STEP;
const NEAR = 900;                               // how far around a player the host describes
const PREDICT_SNAP = 90;                        // further off than this: jump to the host's position
const PREDICT_PULL = 0.14;                      // otherwise close this much of the gap per snapshot

const TYPES = [...Object.keys(ENEMIES), ...BOSSES.map(b => b.id), "dummy"];
const MODES = ["move", "aim", "wind", "charge", "stun", "fuse", "blink", "swoop"];
const PICKUPS = ["energy", "shard", "heart"];
const WEAPON_IDS = WEAPONS.map(w => w.id);

// enemy flag bits
const ELITE_BIT = 1, CHAMPION_BIT = 2, ASLEEP = 4, HIDDEN = 8, ENRAGED = 16,
    SLOWED = 32, BURNING = 64, FLASH = 128, ALERT = 256, SHOOTS = 512;

// bullet flag bits
const SLASH = 1, ARROW = 2;

// events that must reach everyone, wherever they are standing
const GLOBAL = new Set([
    "crate", "floor", "lobby", "runStart", "runEnd", "join", "leave",
    "boss", "bossDown", "bossReset", "loot", "lootDone", "down", "revive", "pickup", "empty"
]);

const round = value => Math.round(value);


/* ---------------- Host side ---------------- */

// the world as player `pid` needs to see it right now
export function encode(state, pid){

    const me = state.players.find(p => p.id === pid);
    const cx = me ? me.x : state.map.start.x;
    const cy = me ? me.y : state.map.start.y;
    const close = (thing, range = NEAR) =>
        Math.abs(thing.x - cx) < range && Math.abs(thing.y - cy) < range;

    const E = [];

    for(const e of state.enemies){

        if(e.dead || !(close(e) || (e.boss && !e.asleep)))
            continue;

        const flags =
            (e.elite ? ELITE_BIT : 0) | (e.champion ? CHAMPION_BIT : 0) | (e.asleep ? ASLEEP : 0) |
            (e.hidden ? HIDDEN : 0) | (e.enraged ? ENRAGED : 0) | (e.slowT > 0 ? SLOWED : 0) |
            (e.burnT > 0 ? BURNING : 0) | (e.flash > 0 ? FLASH : 0) | (e.alert > 0 ? ALERT : 0) |
            (e.shoots ? SHOOTS : 0);

        const row = [e.id, TYPES.indexOf(e.type), flags, round(e.x), round(e.y), round(e.hp / e.maxHp * 1000), MODES.indexOf(e.mode), round(e.angle * 100)];

        // the uncommon extras ride in one small object
        if(e.spawn > 0 || e.telegraph || e.dummy){

            const extra = {};

            if(e.spawn > 0)
                extra.sp = round(e.spawn / e.spawnTime * 100);

            if(e.telegraph)
                extra.tg = [round(e.telegraph.angle * 100), round(e.telegraph.length)];

            if(e.dummy){

                extra.r = e.r;
                extra.n = e.name;
                extra.dps = round(e.dps * 10) / 10;

            }

            row.push(extra);

        }

        E.push(row);

    }

    const B = [];

    for(const b of state.bullets){

        if(b.dead || !close(b))
            continue;

        B.push([
            b.id,
            b.team === "p" ? WEAPON_IDS.indexOf(b.weapon) : -1 - b.tint,
            round(b.x), round(b.y), round(b.vx), round(b.vy),
            round(b.r * 10),
            round(b.life * 100),
            (b.kind === "slash" ? SLASH : 0) | (b.kind === "arrow" ? ARROW : 0)
        ]);

    }

    return {
        k: state.tick,
        m: state.mode === "run" ? 1 : 0,
        f: state.floor,
        r: state.runs,
        t: round(state.time * 100) / 100,
        bc: state.map.broken.length,
        P: state.players.map(encodePlayer),
        E,
        B,
        S: state.strikes.filter(s => close(s)).map(s => [s.team === "p" ? WEAPON_IDS.indexOf(s.weapon) : -1, round(s.x), round(s.y), s.r, round(s.delay * 100), round(s.total * 100)]),
        L: state.lasers.map(l => [round(l.x), round(l.y), round(l.angle * 1000), round(l.length), l.warn > 0 ? 1 : 0]),
        I: state.pickups.filter(pk => close(pk, 700)).map(pk => [pk.id, PICKUPS.indexOf(pk.kind), round(pk.x), round(pk.y)]),
        O: state.props.map(prop => ({id: prop.id, kind: prop.kind, x: prop.x, y: prop.y, target: prop.target, source: prop.source, floor: prop.floor, opened: prop.opened}))
    };

}


function encodePlayer(p){

    return {
        id: p.id,
        name: p.name,
        x: round(p.x * 10) / 10,
        y: round(p.y * 10) / 10,
        hp: p.hp,
        maxHp: p.maxHp,
        shield: p.shield,
        maxShield: p.maxShield,
        energy: round(p.energy),
        maxEnergy: p.maxEnergy,
        hurt: p.hurt > 0 ? 1 : 0,
        dashT: p.dashT > 0 ? 1 : 0,
        aim: round(p.aim * 100) / 100,
        moving: p.moving,
        weapons: p.weapons.map(({uid, type, level}) => ({uid, type, level})),
        slot: p.slot,
        charge: round(p.charge * 100) / 100,
        beam: p.beam,
        swing: p.swing,
        dead: p.dead,
        revive: round(p.revive * 10) / 10,
        loot: Boolean(p.loot),
        near: p.near,
        kills: p.kills,
        shards: p.shards
    };

}


// the events a player should hear about: anything global, anything of
// their own, and whatever happened near them
export function eventsFor(events, state, pid){

    const me = state.players.find(p => p.id === pid);

    return events.filter(event => {

        if(GLOBAL.has(event.type) || event.pid === pid || event.x === undefined || !me)
            return true;

        return Math.abs(event.x - me.x) < NEAR && Math.abs(event.y - me.y) < NEAR;

    });

}


/* ---------------- Receiving side ---------------- */

// A world rebuilt from snapshots. `state` has the same shape the renderer
// reads from a real simulation.
export function createMirror(seed){

    const state = {
        seed,
        mode: "lobby",
        floor: 1,
        runs: 0,
        time: 0,
        tick: 0,
        map: buildMap({seed, runs: 0, floor: 1, mode: "lobby"}),
        players: [],
        enemies: [],
        bullets: [],
        strikes: [],
        lasers: [],
        pickups: [],
        props: []
    };

    let me = null;
    let since = 0;                      // seconds since the last snapshot
    let needSync = false;

    const body = {x: 0, y: 0, r: PLAYER.radius};        // where we predict we are


    function rebuild(){

        state.map = buildMap(state);

    }


    // Takes a snapshot ({...encode(), ev: events}) and returns its events.
    function apply(snap, broken){

        const mode = snap.m ? "run" : "lobby";
        const changed = mode !== state.mode || snap.f !== state.floor || snap.r !== state.runs;

        state.mode = mode;
        state.floor = snap.f;
        state.runs = snap.r;
        state.time = snap.t;
        state.tick = snap.k;

        if(changed)
            rebuild();

        // a full list of broken crates (on joining, or after asking for one)
        if(broken)
            for(const index of broken)
                breakCrate(state.map, index);

        for(const event of snap.ev ?? [])
            if(event.type === "crate" && !changed)
                breakCrate(state.map, event.tile);

        needSync = state.map.broken.length !== snap.bc;

        state.players = snap.P.map(p => slide({...p, r: PLAYER.radius}, state.players));
        state.enemies = snap.E.map(row => slide(decodeEnemy(row), state.enemies));
        state.pickups = snap.I.map(([id, kind, x, y]) => slide({id, kind: PICKUPS[kind], x, y}, state.pickups));

        state.bullets = snap.B.map(decodeBullet);

        state.strikes = snap.S.map(([w, x, y, r, delay, total]) => ({team: w < 0 ? "e" : "p", weapon: WEAPON_IDS[w], x, y, r, delay: delay / 100, total: total / 100}));
        state.lasers = snap.L.map(([x, y, angle, length, warn]) => ({x, y, angle: angle / 1000, length, warn}));
        state.props = snap.O.map(prop => ({...prop, opened: prop.opened ?? []}));

        since = 0;

        correct(changed);

        return snap.ev ?? [];

    }


    // remembers where a thing was drawn, so it can slide to its new place
    function slide(next, list){

        const old = list.find(item => item.id === next.id);

        next.tx = next.x;
        next.ty = next.y;
        next.fx = old ? old.x : next.x;
        next.fy = old ? old.y : next.y;

        // too far to be the same movement (a blink, a new floor): just jump
        if(Math.abs(next.tx - next.fx) + Math.abs(next.ty - next.fy) > 160){

            next.fx = next.tx;
            next.fy = next.ty;

        }

        next.x = next.fx;
        next.y = next.fy;

        return next;

    }


    // pull our predicted position towards what the host says
    function correct(jump){

        const mine = state.players.find(p => p.id === me);

        if(!mine)
            return;

        const dx = mine.tx - body.x;
        const dy = mine.ty - body.y;

        if(jump || mine.dead || mine.dashT || Math.hypot(dx, dy) > PREDICT_SNAP){

            body.x = mine.tx;
            body.y = mine.ty;

        }
        else{

            body.x += dx * PREDICT_PULL;
            body.y += dy * PREDICT_PULL;

        }

        mine.x = body.x;
        mine.y = body.y;

    }


    // moves the picture forward between snapshots
    function advance(seconds, intent){

        since += seconds;

        const k = Math.min(1, since / SNAP_TIME);

        for(const list of [state.players, state.enemies, state.pickups]){

            for(const item of list){

                item.x = item.fx + (item.tx - item.fx) * k;
                item.y = item.fy + (item.ty - item.fy) * k;

            }

        }

        for(const b of state.bullets){

            b.x += b.vx * seconds;
            b.y += b.vy * seconds;
            b.life -= seconds;

        }

        for(const s of state.strikes)
            s.delay -= seconds;

        for(const p of state.players){

            if(p.swing)
                p.swing.t = Math.max(0.001, p.swing.t - seconds);

        }

        // our own character answers the keys at once
        const mine = state.players.find(p => p.id === me);

        if(!mine)
            return;

        if(intent && !mine.dead && !mine.loot){

            const length = Math.hypot(intent.moveX, intent.moveY) || 1;

            if(!mine.dashT && (intent.moveX || intent.moveY))
                moveBody(state.map, body, intent.moveX / length * PLAYER.speed * seconds, intent.moveY / length * PLAYER.speed * seconds);

            mine.aim = Math.atan2(intent.aimY - body.y, intent.aimX - body.x);

        }

        if(!mine.dashT){

            mine.x = body.x;
            mine.y = body.y;

        }
        else{

            body.x = mine.x;
            body.y = mine.y;

        }

    }


    return {
        state,
        apply,
        advance,
        setMe(id){ me = id; },
        get needSync(){ return needSync; }
    };

}


function decodeEnemy(row){

    const [id, typeIndex, flags, x, y, hp, mode, angle, extra] = row;
    const type = TYPES[typeIndex];
    const boss = BOSSES.find(b => b.id === type) ?? null;
    const def = boss ?? ENEMIES[type] ?? {radius: 14, color: "#9ca3af", name: "Dummy"};
    const champion = Boolean(flags & CHAMPION_BIT);
    const elite = Boolean(flags & ELITE_BIT);

    return {
        id,
        type,
        x,
        y,
        r: extra?.r ?? def.radius * (boss ? 1 : champion ? CHAMPION.radius : elite ? ELITE.radius : 1),
        hp,
        maxHp: 1000,
        color: def.color,
        name: extra?.n ?? def.name,
        shape: boss?.shape,
        boss: boss ? boss.id : null,
        dummy: type === "dummy",
        shoots: Boolean(flags & SHOOTS),
        dps: extra?.dps ?? 0,
        elite,
        champion,
        asleep: Boolean(flags & ASLEEP),
        hidden: Boolean(flags & HIDDEN),
        enraged: Boolean(flags & ENRAGED),
        slowT: flags & SLOWED ? 1 : 0,
        burnT: flags & BURNING ? 1 : 0,
        flash: flags & FLASH ? 1 : 0,
        alert: flags & ALERT ? 0.2 : 0,
        mode: MODES[mode],
        angle: angle / 100,
        spawn: extra?.sp ? extra.sp / 100 : 0,
        spawnTime: 1,
        telegraph: extra?.tg ? {angle: extra.tg[0] / 100, length: extra.tg[1]} : null
    };

}


function decodeBullet([id, w, x, y, vx, vy, r, life, flags]){

    const weapon = w >= 0 ? WEAPONS[w] : null;

    return {
        id,
        team: weapon ? "p" : "e",
        weapon: weapon?.id,
        tint: weapon ? 0 : -1 - w,
        x,
        y,
        vx,
        vy,
        r: r / 10,
        life: life / 100,
        kind: flags & SLASH ? "slash" : flags & ARROW ? "arrow" : null,
        pull: flags & (SLASH | ARROW) ? 0 : weapon?.pull ?? 0,
        burn: weapon?.burn ?? 0
    };

}
