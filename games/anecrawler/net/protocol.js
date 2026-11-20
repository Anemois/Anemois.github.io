import {ENEMIES, BOSSES, ELITE, CHAMPION, WEAPONS, PLAYER, STEP} from "../sim/data.js";
import {buildMap} from "../sim/sim.js";
import {breakCrate} from "../sim/map.js";
import {createPredictor} from "./predict.js";


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
// real one, so the renderer cannot tell the difference.
//
// Everything but your own character is shown a short, steady moment in the
// past, sliding between the two snapshots around that moment. Snapshots
// never arrive perfectly evenly, so the mirror watches how uneven they are
// and keeps just enough of them queued to always have the next one.
//
// Your own character (and what it fires) is shown ahead of all this, the
// moment you press a key: see predict.js. The host says which input it has
// reached and exactly how you stood then, and leaves your own bullets out
// (your machine already drew them).

export const SNAP_EVERY = 2;                    // steps between snapshots (30 a second)

const NEAR = 900;                               // how far around a player the host describes
const TICKS = 1 / STEP;                         // simulation steps a second
const ARRIVALS = 60;                            // snapshot arrivals watched for unevenness (about 2 s)
const MIN_DELAY = SNAP_EVERY + 1;               // steps behind the newest snapshot, at least
const MAX_DELAY = 30;                           // ...and at most (half a second)
const KEEP = 40;                                // snapshots remembered
const SLIDE_LIMIT = 160;                        // anything moving further between snapshots jumps there

const TYPES = [...Object.keys(ENEMIES), ...BOSSES.map(b => b.id), "dummy"];
const MODES = [
    "move", "aim", "wind", "charge", "stun", "fuse", "blink", "swoop",
    "bones", "fade", "lunge", "raise", "puff", "focus", "beam", "under", "rise", "up", "whip", "sink"
];
const ZONE_KINDS = ["fire", "spore"];
const STRIKE_LOOKS = [undefined, "fire", "bone", "meteor", "slam"];     // enemy strikes, by -1 - index
const PICKUPS = ["energy", "shard", "heart"];
const WEAPON_IDS = WEAPONS.map(w => w.id);

// enemy flag bits
const ELITE_BIT = 1, CHAMPION_BIT = 2, ASLEEP = 4, HIDDEN = 8, ENRAGED = 16,
    SLOWED = 32, BURNING = 64, FLASH = 128, ALERT = 256, SHOOTS = 512;

// bullet flag bits (OWN: fired by the player this snapshot is for)
const SLASH = 1, ARROW = 2, OWN = 4;

// what a guest's own machine already showed of its own doing (see predict.js)
const SHOWN_HERE = new Set(["shot", "swing", "rail", "shock", "dash"]);

// events that must reach everyone, wherever they are standing
const GLOBAL = new Set([
    "crate", "floor", "lobby", "runStart", "runEnd", "join", "leave",
    "boss", "bossDown", "bossReset", "loot", "lootDone", "down", "revive", "pickup", "empty", "unsealed"
]);

const round = value => Math.round(value);


/* ---------------- Host side ---------------- */

// [weapon index (players) or -1 - look (enemies), x, y, r, delay, total, (from x, from y)]
function encodeStrike(s){

    const row = [
        s.team === "p" ? WEAPON_IDS.indexOf(s.weapon) : -1 - Math.max(0, STRIKE_LOOKS.indexOf(s.look)),
        round(s.x), round(s.y), s.r, round(s.delay * 100), round(s.total * 100)
    ];

    if(s.from)
        row.push(round(s.from.x), round(s.from.y));

    return row;

}



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
            (b.kind === "slash" ? SLASH : 0) | (b.kind === "arrow" ? ARROW : 0) | (b.pid === pid ? OWN : 0)
        ]);

    }

    // the receiving player's own body and hands, exact, for their prediction
    const Y = me && {
        x: me.x, y: me.y, dt: me.dashT, dc: me.dashCd, dx: me.dashX, dy: me.dashY, h: me.held.dash,
        sl: me.slot, en: me.energy, rl: me.reload, bu: me.burst, bt: me.burstT, ch: me.charge,
        bm: me.beam ? 1 : 0, sh: me.shots, hf: me.held.fire, hs: me.held.swap
    };

    const vote = state.vote && {to: state.vote.travel.to, floor: state.vote.travel.floor, from: state.vote.from, ready: state.vote.ready, left: Math.round(state.vote.left * 10) / 10};

    return {
        k: state.tick,
        Y,
        V: vote,
        m: state.mode === "run" ? 1 : 0,
        f: state.floor,
        r: state.runs,
        t: round(state.time * 100) / 100,
        bc: state.map.broken.length,
        P: state.players.map(encodePlayer),
        E,
        B,
        S: state.strikes.filter(s => close(s)).map(encodeStrike),
        L: state.lasers.map(l => [round(l.x), round(l.y), round(l.angle * 1000), round(l.length), l.warn > 0 ? 1 : 0, l.tint ?? 2, l.width ?? 7]),
        Z: state.zones.filter(z => close(z)).map(z => [ZONE_KINDS.indexOf(z.kind), round(z.x), round(z.y), round(z.r), round(z.life / z.max * 100)]),
        I: state.pickups.filter(pk => close(pk, 700)).map(pk => [pk.id, PICKUPS.indexOf(pk.kind), round(pk.x), round(pk.y)]),
        O: state.props.map(prop => ({id: prop.id, kind: prop.kind, x: prop.x, y: prop.y, target: prop.target, source: prop.source, floor: prop.floor, opened: prop.opened, locked: prop.locked || undefined}))
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
        reviving: p.reviving ?? undefined,
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
        zones: [],
        pickups: [],
        props: [],
        vote: null
    };

    let me = null;
    let needSync = false;
    let newest = -1;                    // the latest snapshot's step

    // the steady clock things are shown by
    const snaps = [];                   // {k, at: Map(key -> [x, y])}, oldest first
    const arrivals = [];                // our clock minus the host's, per arrival, in steps
    let clock = 0;                      // our own time, in steps
    let shown = null;                   // the host step being shown now

    // our own character, shown ahead (predict.js)
    const own = createPredictor();
    const at = {map: null, mine: null, lobby: true, enemies: null, zones: null};

    let hostBullets = [];               // everyone else's bullets, from the host
    const drawn = [];                   // ...plus our own, as drawn


    // what predict.js needs to know about the world
    function world(){

        at.map = state.map;
        at.mine = state.players.find(p => p.id === me) ?? null;
        at.lobby = state.mode === "lobby";
        at.enemies = state.enemies;
        at.zones = state.zones;

        return at;

    }


    // Takes a snapshot ({...encode(), a: last input used, ev: events}) and
    // returns its events. `broken` is a full list of broken crates, if sent.
    function apply(snap, broken){

        const mode = snap.m ? "run" : "lobby";
        const sameFloor = mode === state.mode && snap.f === state.floor && snap.r === state.runs;

        // An older snapshot than one already used (it came the slow way
        // while the line moved from the server to a direct one): only what
        // happened counts.
        if(snap.k <= newest){

            if(sameFloor)
                for(const event of snap.ev ?? [])
                    if(event.type === "crate")
                        breakCrate(state.map, event.tile);

            return ownFilter(snap.ev ?? []);

        }

        newest = snap.k;

        state.mode = mode;
        state.floor = snap.f;
        state.runs = snap.r;
        state.time = snap.t;
        state.tick = snap.k;
        state.vote = snap.V ?? null;

        if(!sameFloor){

            state.map = buildMap(state);

            // nothing from the last floor slides into this one
            snaps.length = 0;
            shown = null;

        }

        if(broken)
            for(const index of broken)
                breakCrate(state.map, index);

        for(const event of snap.ev ?? [])
            if(event.type === "crate" && sameFloor)
                breakCrate(state.map, event.tile);

        needSync = state.map.broken.length !== snap.bc;

        state.players = snap.P.map(p => ({...p, r: PLAYER.radius, hostBeam: p.beam}));
        state.enemies = snap.E.map(decodeEnemy);
        state.pickups = snap.I.map(([id, kind, x, y]) => ({id, kind: PICKUPS[kind], x, y}));
        state.strikes = snap.S.map(([w, x, y, r, delay, total, fx, fy]) => ({
            team: w < 0 ? "e" : "p", weapon: WEAPON_IDS[w], look: w < 0 ? STRIKE_LOOKS[-1 - w] : undefined,
            x, y, r, delay: delay / 100, start: delay / 100, total: total / 100, k: snap.k,
            from: fx === undefined ? null : {x: fx, y: fy}
        }));
        state.lasers = snap.L.map(([x, y, angle, length, warn, tint, width]) => ({x, y, angle: angle / 1000, length, warn, tint, width}));
        state.zones = (snap.Z ?? []).map(([kind, x, y, r, life]) => ({kind: ZONE_KINDS[kind], x, y, r, life: life / 100, max: 1}));
        // (props only come when they change, see host.js)
        if(snap.O)
            state.props = snap.O.map(prop => ({...prop, opened: prop.opened ?? []}));
        else if(!sameFloor)
            state.props = [];

        // our own bullets are already flying on this screen
        hostBullets = [];

        for(const row of snap.B)
            if(!(row[8] & OWN) || !own.placed)
                hostBullets.push(decodeBullet(row, snap.k));

        remember(snap);

        if(snap.Y)
            own.correct(snap.Y, snap.a ?? 0, world(), !sameFloor);

        place();

        return ownFilter(snap.ev ?? []);

    }


    // Leaves out what our machine already showed of our own doing, and
    // keeps the hit numbers of our own bullets without a second impact.
    function ownFilter(events){

        if(!own.placed)
            return events;

        return events.filter(event => {

            if(event.pid !== me)
                return true;

            if(SHOWN_HERE.has(event.type))
                return false;

            if(event.shot && (event.type === "spark" || event.type === "boom"))
                return false;

            if(event.shot && event.type === "hit")
                event.quiet = true;

            return true;

        });

    }


    // where everything was at this snapshot's step, for sliding later
    function remember(snap){

        const at = new Map();

        for(const p of state.players)
            at.set("p" + p.id, [p.x, p.y]);

        for(const e of state.enemies)
            at.set("e" + e.id, [e.x, e.y]);

        for(const pk of state.pickups)
            at.set("i" + pk.id, [pk.x, pk.y]);

        snaps.push({k: snap.k, at});

        if(snaps.length > KEEP)
            snaps.shift();

        arrivals.push(clock - snap.k);

        if(arrivals.length > ARRIVALS)
            arrivals.shift();

    }


    // The host step to show now: as recent as the line allows. The fastest
    // arrival tells where the host's clock is; how much slower the slowest
    // was tells how far back to stay so the next snapshot is always in.
    function target(){

        let fast = Infinity;
        let slow = -Infinity;

        for(const value of arrivals){

            fast = Math.min(fast, value);
            slow = Math.max(slow, value);

        }

        const delay = Math.max(MIN_DELAY, Math.min(MAX_DELAY, slow - fast + SNAP_EVERY + 1));

        return clock - fast - delay;

    }


    // One input step on this machine (call once per simulation step, in
    // order): our character acts on it at once.
    function predict(seq, intent){

        own.input(seq, intent, world());

    }


    /* ---- each frame ---- */

    // Moves the picture forward. `intent` (optional) aims our character;
    // `now` is our own time in steps (the last input's number and the part
    // of a step since), which our own bullets fly by.
    function advance(seconds, intent, now){

        clock += seconds * TICKS;

        const goal = target();

        // follow the goal smoothly; jump only when far off (a stall, a new floor)
        if(shown === null || Math.abs(goal - shown) > 20)
            shown = goal;
        else
            shown += seconds * TICKS + (goal - shown) * Math.min(1, seconds * 2);

        for(const p of state.players){

            if(p.swing && p.id !== me)
                p.swing.t = Math.max(0.001, p.swing.t - seconds);

        }

        if(now !== undefined)
            own.advance(seconds, now, state.map, state.enemies);

        place(intent);

    }


    // puts everything where it was at the step being shown
    function place(intent){

        const time = shown ?? state.tick;

        let a = null;
        let b = null;

        for(const snap of snaps){

            if(snap.k <= time)
                a = snap;
            else if(!b)
                b = snap;

        }

        const position = (key, thing) => {

            const from = a?.at.get(key);
            const to = b?.at.get(key);

            let x, y;

            if(from && to && Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]) < SLIDE_LIMIT){

                const t = (time - a.k) / (b.k - a.k);

                x = from[0] + (to[0] - from[0]) * t;
                y = from[1] + (to[1] - from[1]) * t;

            }
            else if(from){

                [x, y] = from;

            }
            else if(to){

                [x, y] = to;

            }
            else{

                return;

            }

            thing.x = x;
            thing.y = y;

        };

        for(const p of state.players)
            if(p.id !== me)
                position("p" + p.id, p);

        for(const e of state.enemies)
            position("e" + e.id, e);

        for(const pk of state.pickups)
            position("i" + pk.id, pk);

        // bullets fly in straight lines (homing ones close enough) from where
        // the newest snapshot saw them
        drawn.length = 0;

        for(const bullet of hostBullets){

            const t = (time - bullet.k) / TICKS;

            bullet.x = bullet.x0 + bullet.vx * t;
            bullet.y = bullet.y0 + bullet.vy * t;
            bullet.life = bullet.life0 - Math.max(0, t);

            drawn.push(bullet);

        }

        for(const flyer of own.flyers)
            drawn.push(flyer);

        state.bullets = drawn;

        for(const strike of state.strikes)
            strike.delay = strike.start - (time - strike.k) / TICKS;

        const mine = state.players.find(p => p.id === me);

        if(mine)
            own.show(mine, intent, state.map, state.enemies);

    }


    return {
        state,
        apply,
        advance,
        predict,
        take: () => own.take(),

        setMe(id){

            me = id;

            own.setId(id);

        },

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


function decodeBullet([id, w, x, y, vx, vy, r, life, flags], k){

    const weapon = w >= 0 ? WEAPONS[w] : null;

    return {
        id,
        team: weapon ? "p" : "e",
        weapon: weapon?.id,
        tint: weapon ? 0 : -1 - w,
        x,
        y,
        x0: x,
        y0: y,
        k,
        vx,
        vy,
        r: r / 10,
        life: life / 100,
        life0: life / 100,
        kind: flags & SLASH ? "slash" : flags & ARROW ? "arrow" : null,
        pull: flags & (SLASH | ARROW) ? 0 : weapon?.pull ?? 0,
        burn: weapon?.burn ?? 0
    };

}
