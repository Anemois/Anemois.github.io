import {STEP, TILE, PLAYER, WORLDS, worldIndex} from "./data.js";
import {createRng, randomSeed, hashText} from "./rng.js";
import {generateFloor, generateLobby} from "./mapgen.js";
import {createGrid} from "./grid.js";
import {createNav, updateNav} from "./nav.js";
import {moveBody, lineOfSight} from "./physics.js";
import {rollWeapon, isBossFloor} from "./loot.js";
import {emit, newId, addProp} from "./world.js";
import {updateWeapon, updateBullets, updateStrikes, updateLasers} from "./combat.js";
import {populate, refreshLive, updateEnemies, makeDummy} from "./enemies.js";
import {groundSpeed, updateZones, updateVents} from "./ground.js";


// The whole game world as plain data, stepped at a fixed rate. Nothing in
// this folder touches the page, the clock or Math.random, so the same seed
// and inputs always give the same game: whoever hosts (a player's browser
// or a Node server) runs this for everyone and sends out what happened.
//
//   const state = createSim({seed})
//   addPlayer(state, {id, name, loadout: [item, item]})
//   step(state, {[id]: intent})      // once per STEP
//   command(state, id, {type, ...})  // loot choices, loadout, start, quit
//   state.events                     // what happened, cleared by the caller
//
// intent: {moveX, moveY (-1..1), aimX, aimY (world point), fire, dash,
//          swap, interact (booleans, held)}

const INTERACT_RANGE = 46;
const PORTAL_RANGE = 30;
const PORTAL_GUARD = 300;       // enemies this close to a portal keep it sealed
const RUN_OVER_DELAY = 1.6;
const VOTE_TIME = 10;           // seconds to say "not yet" before the group goes anyway

export const IDLE = {moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, dash: false, swap: false, interact: false};


export function createSim({seed = randomSeed()} = {}){

    const state = {
        seed,
        rng: createRng(seed),
        runs: 0,
        mode: "lobby",
        floor: 1,
        time: 0,
        tick: 0,
        nextId: 1,
        map: null,
        grid: null,
        nav: null,
        players: [],
        enemies: [],
        live: [],               // enemies in play this step (see enemies.js)
        alarms: [],             // sleepers about to wake
        bullets: [],
        strikes: [],
        lasers: [],
        zones: [],
        pickups: [],
        props: [],
        events: [],
        run: null,
        overT: 0,
        bossDown: null,
        vote: null              // {travel, from, ready: [ids], left} while players decide
    };

    enterLobby(state);

    return state;

}


// The map for a mode and floor. It depends only on these four numbers, so
// every player's machine can build the same one for itself.
export function buildMap({seed, runs, floor, mode}){

    if(mode === "lobby")
        return generateLobby();

    const mapSeed = (seed ^ Math.imul(runs * 7919 + floor, 0x9e3779b1)) >>> 0;
    const map = generateFloor(createRng(mapSeed), {floor, boss: isBossFloor(floor), world: worldIndex(floor)});

    map.world = worldIndex(floor) % WORLDS.length;

    return map;

}


function setMap(state){

    const map = buildMap(state);

    state.vote = null;

    state.map = map;
    state.grid = createGrid(map.w * TILE, map.h * TILE);
    state.nav = createNav(map);

    state.enemies = [];
    state.live = [];
    state.alarms = [];
    state.bullets = [];
    state.strikes = [];
    state.zones = [];
    state.lasers = [];
    state.pickups = [];
    state.props = [];
    state.time = 0;
    state.overT = 0;
    state.bossDown = null;

}


/* ---------------- Players ---------------- */

export function addPlayer(state, {id, name = "Player", loadout = []}){

    const p = {
        id,
        name,
        x: 0,
        y: 0,
        r: PLAYER.radius,
        hp: PLAYER.hp,
        maxHp: PLAYER.hp,
        shield: PLAYER.shield,
        maxShield: PLAYER.shield,
        energy: PLAYER.energy,
        maxEnergy: PLAYER.energy,
        shieldWait: 0,
        shieldTick: 0,
        hurt: 0,
        dashT: 0,
        dashCd: 0,
        dashX: 0,
        dashY: 0,
        aim: 0,
        aimX: 0,
        aimY: 0,
        moving: false,
        loadout: loadout.slice(0, 2),
        weapons: [],
        slot: 0,
        reload: 0,
        spin: 0,                // how wound up a spinning gun is, 0..1
        cool: [0, 0],           // cooldown left on the weapon put away, per slot
        burst: 0,
        burstT: 0,
        charge: -1,
        beam: null,
        beamT: 0,
        swing: null,
        shots: 0,                   // shots fired, for the scatter of the next (see combat.js)
        key: hashText(id),
        held: {...IDLE},
        dead: false,
        revive: 0,
        reviving: null,             // the fallen friend this player is helping up
        loot: null,
        near: null,
        kills: 0,
        dealt: 0,
        shards: 0,
        found: 0
    };

    p.weapons = p.loadout.map(item => ({...item}));

    state.players.push(p);

    placePlayers(state, [p], state.players.length - 1);

    emit(state, "join", {pid: id, name});

    return p;

}


export function removePlayer(state, id){

    state.players = state.players.filter(p => p.id !== id);

    emit(state, "leave", {pid: id});

}


function refill(p){

    p.hp = p.maxHp;
    p.shield = p.maxShield;
    p.energy = p.maxEnergy;
    p.dead = false;
    p.hurt = 0;
    p.loot = null;

}


// a weapon change drops whatever the hands were doing (also used by a
// guest's machine for its own guess, see net/predict.js)
export function resetHands(p){

    p.slot = Math.max(0, Math.min(p.slot, p.weapons.length - 1));
    p.reload = 0;
    p.spin = 0;
    p.cool = [0, 0];
    p.burst = 0;
    p.charge = -1;
    p.beam = null;
    p.swing = null;

}


// Takes the other weapon out. Its cooldown carries on from where it was
// (it kept cooling while put away), and the one put away keeps its own:
// swapping back and forth never fires a weapon sooner. A burst, a charge
// or a swing in progress is dropped.
export function switchSlot(p, slot){

    if(slot === p.slot)
        return;

    p.cool ??= [0, 0];
    p.cool[p.slot] = Math.max(0, p.reload);
    p.slot = slot;
    p.reload = p.cool[slot];
    p.cool[slot] = 0;
    p.spin = 0;
    p.burst = 0;
    p.charge = -1;
    p.beam = null;
    p.swing = null;

}


// puts players around the start of the current map
function placePlayers(state, players = state.players, offset = 0){

    const start = state.map.start;

    players.forEach((p, i) => {

        const n = i + offset;
        const angle = n * 2.4;

        p.x = start.x + (n ? Math.cos(angle) * 28 : 0);
        p.y = start.y + (n ? Math.sin(angle) * 28 : 0);
        p.aimX = p.x + 100;
        p.aimY = p.y;

    });

}


// `moves`: the inputs to walk by this step, in order. Usually just
// [intent]; a guest's machine may send several at once (see net/host.js),
// or none yet, in which case they stand still until their inputs arrive.
function updatePlayer(state, p, intent, dt, moves = [intent]){

    const pressed = key => intent[key] && !p.held[key];

    p.aimX = intent.aimX;
    p.aimY = intent.aimY;

    if(p.dead){

        beRevived(state, p, dt);
        remember(p, intent);

        return;

    }

    p.hurt = Math.max(0, p.hurt - dt);

    // shield comes back a point at a time after a quiet spell
    p.shieldWait += dt;

    if(p.shieldWait >= PLAYER.shieldDelay && p.shield < p.maxShield){

        p.shieldTick += dt;

        if(p.shieldTick >= PLAYER.shieldRate){

            p.shieldTick = 0;
            p.shield++;

        }

    }

    if(state.mode === "run")
        p.energy = Math.min(p.maxEnergy, p.energy + PLAYER.energyRegen * dt);
    else
        p.energy = p.maxEnergy;

    p.aim = Math.atan2(intent.aimY - p.y, intent.aimX - p.x);

    // choosing loot: stand still
    if(p.loot){

        p.moving = false;
        p.charge = -1;
        p.beam = null;

        remember(p, intent);

        return;

    }

    // Each input walks, swaps and uses the weapon for one step, in that
    // order, exactly as a guest's machine guesses it (net/predict.js). A
    // guest whose inputs are late does none of it until they arrive.
    for(const m of moves){

        p.aim = Math.atan2(m.aimY - p.y, m.aimX - p.x);
        p.aimX = m.aimX;
        p.aimY = m.aimY;

        if(movePlayer(state.map, p, m, dt, m.dash && !p.held.dash, state.zones))
            emit(state, "dash", {pid: p.id, x: p.x, y: p.y});

        if(m.swap && !p.held.swap && p.weapons.length > 1){

            switchSlot(p, 1 - p.slot);

            emit(state, "swap", {pid: p.id});

        }

        updateWeapon(state, p, m.fire, dt);

        p.held.fire = m.fire;
        p.held.dash = m.dash;
        p.held.swap = m.swap;

    }

    if(!moves.length)
        p.moving = false;

    // E by a fallen friend helps them up (hold it); otherwise E uses
    // whatever is closest: a chest, a portal
    const fallen = nearestFallen(state, p);

    p.reviving = fallen && intent.interact ? fallen.id : null;

    const prop = fallen ? null : nearestProp(state, p);

    p.near = prop ? prop.id : null;

    if(prop && pressed("interact"))
        interact(state, p, prop);

    // (the other buttons were followed input by input above)
    p.held.interact = intent.interact;

}


// which buttons were down, to tell a fresh press from a held one
function remember(p, intent){

    p.held.fire = intent.fire;
    p.held.dash = intent.dash;
    p.held.swap = intent.swap;
    p.held.interact = intent.interact;

}


// what a player does on a step with no input from them: stand and wait
function waiting(p){

    return {...IDLE, aimX: p.aimX, aimY: p.aimY, dash: p.held.dash, swap: p.held.swap, interact: p.held.interact};

}


// One input's worth of walking (and dashing) for a player: the same code
// runs on a guest's machine to predict their own movement, so it must only
// depend on the map, the body and the input. Returns true if a dash began.
// `zones`: the spore clouds about (they slow you, like water); optional
export function movePlayer(map, p, intent, dt, dash, zones = null){

    let mx = intent.moveX;
    let my = intent.moveY;

    const length = Math.hypot(mx, my);

    if(length > 1){

        mx /= length;
        my /= length;

    }

    p.moving = length > 0.1;
    p.dashCd -= dt;

    let dashed = false;

    if(dash && p.dashCd <= 0){

        const angle = p.moving ? Math.atan2(my, mx) : Math.atan2(intent.aimY - p.y, intent.aimX - p.x);

        p.dashX = Math.cos(angle);
        p.dashY = Math.sin(angle);
        p.dashT = PLAYER.dashTime;
        p.dashCd = PLAYER.dashCooldown;

        dashed = true;

    }

    if(p.dashT > 0){

        p.dashT -= dt;

        moveBody(map, p, p.dashX * PLAYER.dashSpeed * dt, p.dashY * PLAYER.dashSpeed * dt);

        return dashed;

    }

    if(p.moving){

        const speed = PLAYER.speed * groundSpeed(map, zones, p.x, p.y);

        moveBody(map, p, mx * speed * dt, my * speed * dt);

    }

    return dashed;

}


// a fallen player gets up when a friend holds E by them long enough
function beRevived(state, p, dt){

    const helped = state.players.some(other =>
        !other.dead && other.reviving === p.id && Math.hypot(other.x - p.x, other.y - p.y) < PLAYER.reviveRange + 8);

    p.revive = helped ? p.revive + dt : Math.max(0, p.revive - dt * 0.5);

    if(p.revive < PLAYER.reviveTime)
        return;

    p.dead = false;
    p.revive = 0;
    p.hp = PLAYER.reviveHp;
    p.hurt = 1.5;

    emit(state, "revive", {pid: p.id, x: p.x, y: p.y});

}


// How many enemies stand by each portal (alive, asleep or lying in
// pieces); while any do, it will not open. Says so when one comes free.
function guardPortals(state){

    for(const prop of state.props){

        if(prop.kind !== "portal")
            continue;

        let count = 0;

        // (only ones the portal can "see": an enemy in the next room
        // through the rock does not count, so a stray one stuck somewhere
        // can never seal the way out for good)
        for(const e of state.enemies)
            if(!e.dead && !e.dummy && (e.x - prop.x) ** 2 + (e.y - prop.y) ** 2 < PORTAL_GUARD * PORTAL_GUARD && lineOfSight(state.map, prop, e))
                count++;

        if(prop.locked > 0 && count === 0)
            emit(state, "unsealed", {x: prop.x, y: prop.y, target: prop.target});

        prop.locked = count;

    }

}


// the nearest fallen friend close enough to help up
export function nearestFallen(state, p){

    let best = null;
    let bestD = PLAYER.reviveRange;

    for(const other of state.players){

        if(other === p || !other.dead)
            continue;

        const d = Math.hypot(other.x - p.x, other.y - p.y);

        if(d < bestD){

            best = other;
            bestD = d;

        }

    }

    return best;

}


/* ---------------- Props ---------------- */
// chests (each player opens a chest once, for their own roll) and portals.
// A portal with enemies close by is sealed until they are dead.

function canUse(prop, p){

    if(prop.kind === "chest")
        return !prop.opened.includes(p.id) && !p.loot;

    return true;

}


function nearestProp(state, p){

    let best = null;
    let bestD = Infinity;

    for(const prop of state.props){

        const d = Math.hypot(prop.x - p.x, prop.y - p.y);
        const range = prop.kind === "portal" ? PORTAL_RANGE + p.r : INTERACT_RANGE;

        if(d < range && d < bestD && canUse(prop, p)){

            best = prop;
            bestD = d;

        }

    }

    return best;

}


function interact(state, p, prop){

    if(prop.kind === "chest"){

        prop.opened.push(p.id);

        const item = rollWeapon(state.rng, {floor: state.floor, source: prop.source});

        p.loot = {item, source: prop.source};
        p.found++;

        if(state.run)
            state.run.found++;

        emit(state, "loot", {pid: p.id, name: p.name, item, source: prop.source, x: prop.x, y: prop.y});

        return;

    }

    if(prop.kind === "portal"){

        if(prop.locked > 0){

            emit(state, "sealed", {pid: p.id, x: prop.x, y: prop.y, count: prop.locked});

            return;

        }

        travel(state, p, {to: prop.target, floor: prop.floor ?? 1});

    }

}


/* ---------------- Going somewhere together ---------------- */
// Anything that moves everyone (a portal, starting or giving up a run) is
// asked of the group first when there is more than one player. Everyone
// ready: go now. Nobody says "not yet" within VOTE_TIME: go anyway. Anyone
// says "not yet": nothing happens.
//
// trip: {to: "run" | "next" | "home" | "quit", floor (for "run")}

function travel(state, p, trip){

    if(state.players.length <= 1)
        return go(state, trip);

    const vote = state.vote;

    if(vote){

        // walking into the same portal counts as saying yes
        if(vote.travel.to === trip.to && !vote.ready.includes(p.id))
            vote.ready.push(p.id);

        return;

    }

    state.vote = {travel: trip, from: p.id, ready: [p.id], left: VOTE_TIME};

    emit(state, "vote", {pid: p.id, to: trip.to});

}


function go(state, trip){

    state.vote = null;

    if(trip.to === "run")
        startRun(state, {floor: trip.floor});
    else if(trip.to === "next")
        loadFloor(state, state.floor + 1);
    else if(trip.to === "home")
        endRun(state, "home");
    else if(trip.to === "quit")
        endRun(state, "quit");

}


function countVote(state, dt){

    const vote = state.vote;

    vote.left -= dt;

    // people who left the game do not hold it up
    vote.ready = vote.ready.filter(id => state.players.some(p => p.id === id));

    if(vote.left <= 0 || state.players.every(p => vote.ready.includes(p.id)))
        go(state, vote.travel);

}


/* ---------------- Commands ---------------- */

// commands can come from another player's machine: a floor must be a floor
const floorNumber = value =>
    Number.isInteger(value) && value >= 1 ? Math.min(value, 999) : 1;


export function command(state, pid, cmd){

    const p = state.players.find(player => player.id === pid);

    if(!p)
        return;

    switch(cmd.type){

        // A case finished spinning: "equip" puts it in hand, "bag" keeps it.
        // `slot` says which weapon it replaces; a free hand is filled first,
        // and with no slot given it replaces the weapon being held.
        case "loot": {

            if(!p.loot)
                return;

            const item = {...p.loot.item, uid: cmd.uid ?? null};

            if(cmd.choice === "equip" && !p.dead){

                const chosen = Number.isInteger(cmd.slot) && cmd.slot >= 0 && cmd.slot < p.weapons.length;

                if(p.weapons.length < 2 && !chosen)
                    p.weapons.push(item);
                else
                    p.weapons[chosen ? cmd.slot : p.slot] = item;

                p.slot = p.weapons.indexOf(item);

                resetHands(p);

            }

            p.loot = null;

            emit(state, "lootDone", {pid, choice: cmd.choice});

            break;

        }

        // the lobby loadout (what you hold is what you bring)
        case "loadout":

            if(!Array.isArray(cmd.items))
                return;

            p.loadout = cmd.items.slice(0, 2).map(({uid, type, level}) => ({uid, type, level}));

            if(state.mode === "lobby"){

                p.weapons = p.loadout.map(item => ({...item}));

                if(Number.isInteger(cmd.slot))
                    p.slot = cmd.slot;

                resetHands(p);

            }

            break;

        // which of the two weapons is in hand
        case "slot":

            if(Number.isInteger(cmd.slot) && cmd.slot >= 0 && cmd.slot < p.weapons.length && cmd.slot !== p.slot)
                switchSlot(p, cmd.slot);

            break;

        case "start":

            if(state.mode === "lobby")
                travel(state, p, {to: "run", floor: floorNumber(cmd.floor)});

            break;

        case "quit":

            if(state.mode === "run")
                travel(state, p, {to: "quit"});

            break;

        // an answer to the group's question: agree true = ready, false = not yet
        case "vote": {

            const vote = state.vote;

            if(!vote)
                return;

            if(cmd.agree){

                if(!vote.ready.includes(pid))
                    vote.ready.push(pid);

                return;

            }

            state.vote = null;

            emit(state, "voteCancel", {pid, name: p.name, to: vote.travel.to});

            break;

        }

        // which floor the lobby portal leads to
        case "startFloor":

            for(const prop of state.props)
                if(prop.kind === "portal" && prop.target === "run")
                    prop.floor = floorNumber(cmd.floor);

            break;

    }

}


/* ---------------- Modes ---------------- */

function enterLobby(state){

    state.mode = "lobby";
    state.floor = 1;
    state.run = null;

    setMap(state);

    const at = (tx, ty) => ({x: tx * TILE, y: ty * TILE});
    const portal = at(5, 10.5);

    addProp(state, "portal", portal.x, portal.y, {target: "run", floor: 1});

    // the training yard
    const yard = [
        [19.5, 6, {label: "Dummy"}],
        [25, 6, {r: 26, label: "Big dummy"}],
        [19.5, 15, {label: "Dummy"}],
        [25, 15, {strafe: 70, label: "Moving dummy"}],
        [28.5, 9.6, {r: 10, label: "Pack"}],
        [27.7, 11, {r: 10, label: "Pack"}],
        [29.3, 11.3, {r: 10, label: "Pack"}],
        [12, 4.5, {label: "Sparring", shoots: true}]
    ];

    for(const [tx, ty, options] of yard){

        const spot = at(tx, ty);

        state.enemies.push(makeDummy(state, spot.x, spot.y, options));

    }

    for(const p of state.players){

        refill(p);

        p.weapons = p.loadout.map(item => ({...item}));

        resetHands(p);

    }

    placePlayers(state);

    emit(state, "lobby");

}


function startRun(state, {floor = 1} = {}){

    state.runs++;
    state.run = {start: floor, kills: 0, found: 0, bosses: 0, time: 0};

    for(const p of state.players){

        refill(p);

        p.weapons = p.loadout.map(item => ({...item}));
        p.kills = 0;
        p.dealt = 0;
        p.shards = 0;
        p.found = 0;
        p.slot = 0;

        resetHands(p);

    }

    emit(state, "runStart", {floor});

    loadFloor(state, floor);

}


function loadFloor(state, floor){

    state.mode = "run";
    state.floor = floor;

    setMap(state);

    const map = state.map;

    for(const chest of map.chests)
        addProp(state, "chest", chest.x, chest.y, {source: "chest", opened: []});

    if(map.exit)
        addProp(state, "portal", map.exit.x, map.exit.y, {target: "next"});

    populate(state);
    guardPortals(state);

    for(const p of state.players){

        if(p.dead){

            p.dead = false;
            p.hp = PLAYER.reviveHp;

        }

        p.energy = p.maxEnergy;
        p.loot = null;
        p.revive = 0;

        resetHands(p);

    }

    placePlayers(state);

    emit(state, "floor", {floor, boss: isBossFloor(floor)});

}


function endRun(state, reason){

    const run = state.run;

    emit(state, "runEnd", {
        reason,
        floor: state.floor,
        start: run.start,
        kills: run.kills,
        found: run.found,
        bosses: run.bosses,
        time: run.time,
        players: state.players.map(p => ({pid: p.id, kills: p.kills, shards: p.shards, found: p.found, dealt: p.dealt}))
    });

    enterLobby(state);

}


// the boss fell: its chest and the ways onward appear in the lair
function afterBoss(state){

    const arena = state.map.arena;

    state.bossDown = null;

    let kept = 0;

    for(const b of state.bullets)
        if(b.team === "p")
            state.bullets[kept++] = b;

    state.bullets.length = kept;
    state.strikes = state.strikes.filter(s => s.team === "p");
    state.zones = [];
    state.lasers = [];

    addProp(state, "chest", arena.x, arena.y, {source: "boss", opened: []});
    addProp(state, "portal", arena.x - 80, arena.y + 70, {target: "next"});
    addProp(state, "portal", arena.x + 80, arena.y + 70, {target: "home"});

    for(const p of state.players){

        if(!p.dead)
            p.hp = Math.min(p.maxHp, p.hp + 2);

    }

}


/* ---------------- Pickups ---------------- */

function updatePickups(state, dt){

    const pickups = state.pickups;

    if(!pickups.length)
        return;

    const friction = Math.pow(0.02, dt);
    const range = PLAYER.pickupRange ** 2;

    let kept = 0;

    for(const pk of pickups){

        pk.age += dt;

        // the nearest living player
        let p = null;
        let d2 = Infinity;

        for(const other of state.players){

            const d = (other.x - pk.x) ** 2 + (other.y - pk.y) ** 2;

            if(!other.dead && d < d2){

                p = other;
                d2 = d;

            }

        }

        const wanted = p && (pk.kind !== "heart" || p.hp < p.maxHp);

        if(wanted && pk.age > 0.35 && d2 < range){

            const d = Math.sqrt(d2) || 1;
            const speed = 260 + pk.age * 60;

            pk.x += (p.x - pk.x) / d * speed * dt;
            pk.y += (p.y - pk.y) / d * speed * dt;
            pk.vx = pk.vy = 0;

            if(d < p.r + 8){

                collect(state, p, pk);

                continue;

            }

        }
        else if(Math.abs(pk.vx) + Math.abs(pk.vy) > 2){

            pk.vx *= friction;
            pk.vy *= friction;

            moveBody(state.map, pk, pk.vx * dt, pk.vy * dt);

        }

        pickups[kept++] = pk;

    }

    pickups.length = kept;

}


function collect(state, p, pk){

    if(pk.kind === "energy")
        p.energy = Math.min(p.maxEnergy, p.energy + pk.value);

    if(pk.kind === "shard")
        p.shards += pk.value;

    if(pk.kind === "heart")
        p.hp = Math.min(p.maxHp, p.hp + pk.value);

    emit(state, "pickup", {pid: p.id, kind: pk.kind, value: pk.value, x: pk.x, y: pk.y});

}


/* ---------------- Step ---------------- */

// inputs: {[player id]: intent}; moves (optional): {[player id]: [intent, ...]}
// for players whose walking comes in batches (guests, see net/host.js)
export function step(state, inputs = {}, moves = {}){

    const dt = STEP;

    state.tick++;
    state.time += dt;

    if(state.run)
        state.run.time += dt;

    refreshLive(state);

    for(const p of state.players){

        const intent = inputs[p.id] ?? waiting(p);

        updatePlayer(state, p, intent, dt, moves[p.id] ?? [intent]);

    }

    if(state.vote)
        countVote(state, dt);

    updateNav(state);
    updateEnemies(state, dt);
    updateBullets(state, dt);
    updateStrikes(state, dt);
    updateLasers(state, dt);
    updateZones(state, dt);
    updateVents(state, dt);

    if(state.tick % 10 === 0)
        guardPortals(state);
    updatePickups(state, dt);

    if(state.bossDown)
        afterBoss(state);

    // everyone down: a moment to see it, then home
    if(state.mode === "run" && state.players.length && state.players.every(p => p.dead)){

        state.overT += dt;

        if(state.overT > RUN_OVER_DELAY)
            endRun(state, "dead");

    }

}

