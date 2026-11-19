import {STEP, TILE, PLAYER} from "./data.js";
import {createRng, randomSeed} from "./rng.js";
import {generateFloor, generateLobby} from "./mapgen.js";
import {createGrid} from "./grid.js";
import {createNav, updateNav} from "./nav.js";
import {moveBody} from "./physics.js";
import {rollWeapon, isBossFloor} from "./loot.js";
import {emit, newId, addProp} from "./world.js";
import {updateWeapon, updateBullets, updateStrikes, updateLasers} from "./combat.js";
import {populate, refreshLive, updateEnemies, makeDummy} from "./enemies.js";


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
const RUN_OVER_DELAY = 1.6;

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
        pickups: [],
        props: [],
        events: [],
        run: null,
        overT: 0,
        bossDown: null
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

    return generateFloor(createRng(mapSeed), {floor, boss: isBossFloor(floor)});

}


function setMap(state){

    const map = buildMap(state);

    state.map = map;
    state.grid = createGrid(map.w * TILE, map.h * TILE);
    state.nav = createNav(map);

    state.enemies = [];
    state.live = [];
    state.alarms = [];
    state.bullets = [];
    state.strikes = [];
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
        burst: 0,
        burstT: 0,
        charge: -1,
        beam: null,
        beamT: 0,
        swing: null,
        held: {...IDLE},
        dead: false,
        revive: 0,
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


function resetHands(p){

    p.slot = Math.min(p.slot, Math.max(0, p.weapons.length - 1));
    p.reload = 0;
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


function updatePlayer(state, p, intent, dt){

    const pressed = key => intent[key] && !p.held[key];

    p.aimX = intent.aimX;
    p.aimY = intent.aimY;

    if(p.dead){

        beRevived(state, p, dt);
        remember(p, intent);

        return;

    }

    p.hurt = Math.max(0, p.hurt - dt);
    p.dashCd -= dt;

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

    move(state, p, intent, dt, pressed("dash"));

    if(pressed("swap") && p.weapons.length > 1){

        p.slot = 1 - p.slot;

        resetHands(p);

        emit(state, "swap", {pid: p.id});

    }

    updateWeapon(state, p, intent.fire, dt);

    const prop = nearestProp(state, p);

    p.near = prop ? prop.id : null;

    if(prop && pressed("interact"))
        interact(state, p, prop);

    remember(p, intent);

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


function move(state, p, intent, dt, dash){

    let mx = intent.moveX;
    let my = intent.moveY;

    const length = Math.hypot(mx, my);

    if(length > 1){

        mx /= length;
        my /= length;

    }

    p.moving = length > 0.1;

    if(dash && p.dashCd <= 0){

        const angle = p.moving ? Math.atan2(my, mx) : p.aim;

        p.dashX = Math.cos(angle);
        p.dashY = Math.sin(angle);
        p.dashT = PLAYER.dashTime;
        p.dashCd = PLAYER.dashCooldown;

        emit(state, "dash", {pid: p.id, x: p.x, y: p.y});

    }

    if(p.dashT > 0){

        p.dashT -= dt;

        moveBody(state.map, p, p.dashX * PLAYER.dashSpeed * dt, p.dashY * PLAYER.dashSpeed * dt);

        return;

    }

    if(p.moving)
        moveBody(state.map, p, mx * PLAYER.speed * dt, my * PLAYER.speed * dt);

}


// a fallen player gets up when a friend stands by them long enough
function beRevived(state, p, dt){

    const helped = state.players.some(other =>
        !other.dead && Math.hypot(other.x - p.x, other.y - p.y) < PLAYER.reviveRange);

    p.revive = helped ? p.revive + dt : Math.max(0, p.revive - dt * 0.5);

    if(p.revive < PLAYER.reviveTime)
        return;

    p.dead = false;
    p.revive = 0;
    p.hp = PLAYER.reviveHp;
    p.hurt = 1.5;

    emit(state, "revive", {pid: p.id, x: p.x, y: p.y});

}


/* ---------------- Props ---------------- */
// chests (each player opens a chest once, for their own roll) and portals

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

        emit(state, "loot", {pid: p.id, item, source: prop.source, x: prop.x, y: prop.y});

        return;

    }

    if(prop.kind === "portal"){

        if(prop.target === "run")
            startRun(state, {floor: prop.floor ?? 1});
        else if(prop.target === "next")
            loadFloor(state, state.floor + 1);
        else if(prop.target === "home")
            endRun(state, "home");

    }

}


/* ---------------- Commands ---------------- */

export function command(state, pid, cmd){

    const p = state.players.find(player => player.id === pid);

    if(!p)
        return;

    switch(cmd.type){

        // a case finished spinning: "equip" puts it in hand, "bag" keeps it
        case "loot": {

            if(!p.loot)
                return;

            const item = {...p.loot.item, uid: cmd.uid ?? null};

            if(cmd.choice === "equip" && !p.dead){

                if(p.weapons.length < 2)
                    p.weapons.push(item);
                else
                    p.weapons[p.slot] = item;

                p.slot = p.weapons.indexOf(item);

                resetHands(p);

            }

            p.loot = null;

            emit(state, "lootDone", {pid, choice: cmd.choice});

            break;

        }

        // the lobby loadout (what you hold is what you bring)
        case "loadout":

            p.loadout = cmd.items.slice(0, 2).map(({uid, type, level}) => ({uid, type, level}));

            if(state.mode === "lobby"){

                p.weapons = p.loadout.map(item => ({...item}));

                if(cmd.slot !== undefined)
                    p.slot = Math.min(cmd.slot, p.weapons.length - 1);

                resetHands(p);

            }

            break;

        // which of the two weapons is in hand
        case "slot":

            if(cmd.slot < p.weapons.length && cmd.slot !== p.slot){

                p.slot = cmd.slot;

                resetHands(p);

            }

            break;

        case "start":

            if(state.mode === "lobby")
                startRun(state, {floor: cmd.floor ?? 1});

            break;

        case "quit":

            if(state.mode === "run")
                endRun(state, "quit");

            break;

        // which floor the lobby portal leads to
        case "startFloor":

            for(const prop of state.props)
                if(prop.kind === "portal" && prop.target === "run")
                    prop.floor = cmd.floor;

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

export function step(state, inputs = {}){

    const dt = STEP;

    state.tick++;
    state.time += dt;

    if(state.run)
        state.run.time += dt;

    refreshLive(state);

    for(const p of state.players)
        updatePlayer(state, p, inputs[p.id] ?? waiting(p), dt);

    updateNav(state);
    updateEnemies(state, dt);
    updateBullets(state, dt);
    updateStrikes(state, dt);
    updateLasers(state, dt);
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

