import {ENEMIES, ELITE, CHAMPION, ENEMY_HP_GROWTH, WAKE} from "./data.js";
import {spotNear} from "./map.js";
import {moveBody, lineOfSight, angleTo, DEG} from "./physics.js";
import {near, fillGrid} from "./grid.js";
import {navAngle} from "./nav.js";
import {
    emit, newId, damagePlayer, damageEnemy, killEnemy, enemyBullet, ring
} from "./world.js";
import {spawnBoss, updateBoss} from "./bosses.js";


const SPAWN_TIME = 0.9;         // the warning swirl before a summoned enemy appears
const KNOCK_DECAY = 0.82;       // per step
const LOSE_RANGE = 1000;        // awake enemies this far from everyone...
const LOSE_TIME = 6;            // ...for this long doze off again
const TURRET_RANGE = 520;

const pushList = [];
const wakeList = [];


/* ---------------- Packs ---------------- */

// health multiplier for this floor and party size
export const hpScale = state =>
    ENEMY_HP_GROWTH ** (state.floor - 1) * (1 + (state.players.length - 1) * 0.45);


// fills a fresh floor with its sleeping packs (and its boss)
export function populate(state){

    state.map.camps.forEach((camp, pack) => spawnPack(state, camp, pack));

    if(state.map.arena)
        spawnBoss(state);

}


function spawnPack(state, camp, pack){

    const rng = state.rng;
    const types = Object.keys(ENEMIES).filter(id => ENEMIES[id].from <= state.floor);

    // newer enemy types show up a little more than old ones
    const weights = Object.fromEntries(types.map(id => [id, 1 + (ENEMIES[id].from - 1) * 0.15]));

    const party = 1 + (state.players.length - 1) * 0.5;

    let left = camp.budget * party;
    let guard = 40;

    const place = (type, options) => {

        const spot = spotNear(rng, state.map, camp.x, camp.y, 0, 96);

        state.enemies.push(makeEnemy(state, type, spot.x, spot.y, {...options, pack, asleep: true, spawn: 0}));

    };

    if(camp.kind === "champion"){

        // the toughest kind around, grown large
        const type = types.reduce((a, b) => ENEMIES[b].cost >= ENEMIES[a].cost ? b : a);

        place(type, {champion: true});

        left -= 4;

    }

    while(left > 0 && guard-- > 0){

        const type = rng.weighted(weights);
        const def = ENEMIES[type];
        const elite = state.floor >= ELITE.from && rng.chance(ELITE.chance * (camp.kind === "guard" ? 2 : 1)) && left >= def.cost + ELITE.cost;

        if(def.cost > left && left < 3)
            break;

        left -= def.cost + (elite ? ELITE.cost : 0);

        place(type, {elite});

    }

}


// options: elite, champion, minion (summoned: no loot), owner (boss id),
// pack, asleep, spawn (seconds of warning swirl; 0 = already there)
export function makeEnemy(state, type, x, y, {
    elite = false, champion = false, minion = false, owner = null,
    pack = null, asleep = false, spawn = SPAWN_TIME
} = {}){

    const def = ENEMIES[type];
    const rng = state.rng;
    const tough = champion ? CHAMPION.hp : elite ? ELITE.hp : 1;
    const big = champion ? CHAMPION.radius : elite ? ELITE.radius : 1;
    const hp = def.hp * hpScale(state) * tough;

    if(spawn > 0)
        emit(state, "spawn", {x, y});

    return {
        id: newId(state),
        type,
        ai: def.ai,
        name: def.name,
        x,
        y,
        r: def.radius * big,
        hp,
        maxHp: hp,
        speed: def.speed,
        color: def.color,
        elite: elite || champion,
        champion,
        minion,
        owner,
        boss: null,
        dummy: false,
        pack,
        asleep,
        alert: 0,
        lost: 0,
        far: false,
        target: null,
        sees: false,
        spawn,
        spawnTime: spawn || SPAWN_TIME,
        dead: false,
        hidden: false,
        mode: "move",
        modeT: 0,
        t: rng.range(0, 6),
        fireT: def.fire ? rng.range(0.8, def.fire + 0.6) : 0,
        cool: rng.range(0.5, 1.5),
        volley: 0,
        angle: rng.range(0, Math.PI * 2),
        side: rng.chance(0.5) ? 1 : -1,
        kx: 0,
        ky: 0,
        slow: 0,
        slowT: 0,
        burnDps: 0,
        burnT: 0,
        burnTick: 0,
        burnBy: null,
        flash: 0,
        bombDmg: 22 * hpScale(state)
    };

}


// lobby training dummies: never die, keep a log of the damage they take.
// `shoots`: a sparring dummy that fires slow rings at anyone close, to
// practise dodging and deflecting (nothing hurts in the lobby)
export function makeDummy(state, x, y, {r = 14, strafe = 0, label = "Dummy", shoots = false} = {}){

    return {
        ...makeEnemy(state, "slime", x, y, {spawn: 0}),
        type: "dummy",
        ai: "dummy",
        name: label,
        home: {x, y},
        r,
        hp: 1,
        maxHp: 1,
        speed: 0,
        color: "#9ca3af",
        dummy: true,
        strafe,
        shoots,
        fireT: 1,
        t: 0,
        log: [],
        dps: 0
    };

}


/* ---------------- Who is in play ---------------- */

// Works out, for every enemy, the nearest living player; skips sleepers
// that are far from everyone; and files the rest in the grid so weapons
// can find them fast. Call once at the start of each step.
export function refreshLive(state){

    const live = state.live;
    const far = WAKE.simulate * WAKE.simulate;

    live.length = 0;

    for(const e of state.enemies){

        if(e.dead)
            continue;

        let best = null;
        let bestD = Infinity;

        for(const p of state.players){

            if(p.dead)
                continue;

            const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;

            if(d < bestD){

                best = p;
                bestD = d;

            }

        }

        e.target = best;
        e.targetD = bestD;
        e.far = e.asleep && bestD > far;

        if(!e.far)
            live.push(e);

    }

    fillGrid(state.grid, live);

}


// A sleeper that was hit or saw someone wakes, and takes its pack and any
// sleeper near it along. state.alarms holds who needs waking.
function soundAlarms(state){

    const queue = state.alarms;

    while(queue.length){

        const e = queue.pop();

        if(!e.asleep || e.dead)
            continue;

        e.asleep = false;
        e.lost = 0;
        e.alert = e.boss ? 1.4 : WAKE.alert * state.rng.range(0.7, 1.4);

        emit(state, e.boss ? "boss" : "alert", {id: e.id, x: e.x, y: e.y, r: e.r, name: e.name});

        if(e.boss)
            continue;

        for(const other of near(state.grid, e.x, e.y, WAKE.spread, wakeList)){

            if(other.asleep && !other.boss && (other.pack === e.pack || Math.hypot(other.x - e.x, other.y - e.y) < WAKE.spread))
                queue.push(other);

        }

    }

}


/* ---------------- Behaviour ---------------- */

export function updateEnemies(state, dt){

    soundAlarms(state);

    for(const e of state.live){

        if(e.dead)
            continue;

        if(e.spawn > 0){

            e.spawn -= dt;

            continue;

        }

        e.flash = Math.max(0, e.flash - dt);
        e.t += dt;

        if(e.dummy){

            dummy(state, e, dt);

            continue;

        }

        statuses(state, e, dt);

        if(e.dead)
            continue;

        const target = e.target;

        if(e.asleep){

            sleep(state, e, target);

        }
        else if(e.alert > 0){

            e.alert -= dt;

        }
        else if(target){

            const slow = e.slowT > 0 ? 1 - e.slow : 1;

            // looking is costly, so each enemy only checks now and then
            if((state.tick + e.id) % 5 === 0)
                e.sees = lineOfSight(state.map, e, target);

            if(e.boss)
                updateBoss(state, e, target, dt, slow);
            else
                AI[e.ai](state, e, target, dt, slow);

            contact(state, e);

            if(!e.boss)
                drift(state, e, dt);

        }

        // knockback
        if(e.kx || e.ky){

            moveBody(state.map, e, e.kx * dt, e.ky * dt);

            e.kx *= KNOCK_DECAY;
            e.ky *= KNOCK_DECAY;

            if(Math.abs(e.kx) + Math.abs(e.ky) < 2)
                e.kx = e.ky = 0;

        }

    }

    soundAlarms(state);

    separate(state);

    // drop the dead without making a new list
    const enemies = state.enemies;

    let kept = 0;

    for(let i = 0; i < enemies.length; i++){

        if(!enemies[i].dead)
            enemies[kept++] = enemies[i];

    }

    enemies.length = kept;

}


// asleep: wake if someone is in view, or right on top of us
function sleep(state, e, target){

    if(!target || (state.tick + e.id) % 6)
        return;

    // bosses wake when someone steps into their lair
    if(e.boss){

        const arena = state.map.arena;

        if(Math.hypot(target.x - arena.x, target.y - arena.y) < arena.r - 24)
            state.alarms.push(e);

        return;

    }

    if(e.targetD < WAKE.touch ** 2 || (e.targetD < WAKE.sight ** 2 && lineOfSight(state.map, e, target)))
        state.alarms.push(e);

}


// enemies left far behind lose interest and doze off where they stand
function drift(state, e, dt){

    if(e.targetD < LOSE_RANGE ** 2){

        e.lost = 0;

        return;

    }

    e.lost += dt;

    if(e.lost > LOSE_TIME && !e.minion){

        e.asleep = true;
        e.mode = "move";

    }

}


function statuses(state, e, dt){

    if(e.slowT > 0)
        e.slowT -= dt;

    if(e.burnT > 0){

        e.burnT -= dt;
        e.burnTick -= dt;

        if(e.burnTick <= 0){

            e.burnTick = 0.25;

            damageEnemy(state, e, e.burnDps * 0.25, {pid: e.burnBy, kind: "burn"});

        }

        if(e.burnT <= 0)
            e.burnDps = 0;

    }

}


// touching an enemy hurts (charging brutes and bosses hit harder)
function contact(state, e){

    if(e.hidden)
        return;

    for(const p of state.players){

        if(!p.dead && Math.hypot(p.x - e.x, p.y - e.y) < p.r + e.r - 2)
            damagePlayer(state, p, e.mode === "charge" || e.boss ? 2 : 1);

    }

}


// a little room between neighbours
function separate(state){

    for(const a of state.live){

        if(a.dead || a.spawn > 0 || a.dummy || a.asleep)
            continue;

        for(const b of near(state.grid, a.x, a.y, a.r, pushList)){

            if(b.id <= a.id || b.dead || b.spawn > 0 || b.dummy)
                continue;

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const min = a.r + b.r;
            const d2 = dx * dx + dy * dy;

            if(d2 >= min * min || d2 === 0)
                continue;

            const d = Math.sqrt(d2);
            const push = (min - d) / 2;

            if(!a.boss)
                moveBody(state.map, a, -dx / d * push, -dy / d * push);

            if(!b.boss && !b.asleep)
                moveBody(state.map, b, dx / d * push, dy / d * push);

        }

    }

}


function walk(state, e, angle, speed, dt){

    e.angle = angle;

    return moveBody(state.map, e, Math.cos(angle) * speed * dt, Math.sin(angle) * speed * dt);

}


// Walks towards the target: straight at it when it is in view, otherwise
// along the path the flow field gives (see nav.js).
function seek(state, e, target, speed, dt, wobble = 0){

    let angle = e.sees ? angleTo(e, target) : navAngle(state, e.x, e.y);

    if(angle === null)
        angle = angleTo(e, target);

    return walk(state, e, angle + wobble, speed, dt);

}


// aim a moment (the enemy flashes), then fire: returns true on the fire step
function windUp(e, dt, time){

    if(e.mode !== "aim"){

        e.mode = "aim";
        e.modeT = time;

        return false;

    }

    e.modeT -= dt;

    if(e.modeT > 0)
        return false;

    e.mode = "move";

    return true;

}


const AI = {

    chase(state, e, target, dt, slow){

        seek(state, e, target, e.speed * slow, dt);

    },


    // wobbles towards you, now and then swoops in fast
    flutter(state, e, target, dt, slow){

        e.cool -= dt;

        if(e.cool <= 0 && e.mode !== "swoop" && e.sees){

            e.mode = "swoop";
            e.modeT = 0.45;
            e.angle = angleTo(e, target);

        }

        if(e.mode === "swoop"){

            e.modeT -= dt;

            walk(state, e, e.angle, e.speed * 2.3 * slow, dt);

            if(e.modeT <= 0){

                e.mode = "move";
                e.cool = state.rng.range(1.8, 3.2);

            }

            return;

        }

        seek(state, e, target, e.speed * slow, dt, e.sees ? Math.sin(e.t * 3.2) * 1.1 : 0);

    },


    // keeps its distance and shoots; deeper down it fires a fan of three
    shooter(state, e, target, dt, slow){

        const def = ENEMIES[e.type];

        e.fireT -= dt;

        if(!e.sees){

            e.mode = "move";

            seek(state, e, target, e.speed * slow, dt);

            return;

        }

        if(e.fireT <= 0){

            if(!windUp(e, dt, 0.35))
                return;

            const a = angleTo(e, target);
            const fan = state.floor >= 4 || e.elite ? [-14, 0, 14] : [0];

            for(const offset of fan)
                enemyBullet(state, e, a + offset * DEG, def.bullet);

            e.fireT = def.fire * (e.elite ? 0.7 : 1) * state.rng.range(0.85, 1.2);

            return;

        }

        if(e.t % 1.6 < dt)
            e.side = -e.side;

        const d = Math.sqrt(e.targetD);
        const toward = angleTo(e, target);
        const angle = d < 130 ? toward + Math.PI : d > 240 ? toward : toward + e.side * Math.PI / 2;

        if(walk(state, e, angle, e.speed * slow, dt))
            e.side = -e.side;

    },


    // stands still, alternating aimed shots and rings
    turret(state, e, target, dt){

        const def = ENEMIES[e.type];

        e.fireT -= dt;

        if(e.fireT > 0 || !e.sees || e.targetD > TURRET_RANGE ** 2){

            e.mode = "move";

            return;

        }

        if(!windUp(e, dt, 0.45))
            return;

        e.volley++;

        if(e.volley % 2)
            ring(state, e, e.elite ? 12 : 8, def.bullet, e.volley * 0.2);
        else
            for(let i = -1; i <= 1; i++)
                enemyBullet(state, e, angleTo(e, target) + i * 10 * DEG, def.bullet * 1.3);

        e.fireT = def.fire * (e.elite ? 0.7 : 1);

    },


    // runs at you and goes off when close
    bomber(state, e, target, dt, slow){

        if(e.mode === "fuse"){

            e.modeT -= dt;

            if(e.modeT <= 0)
                killEnemy(state, e);

            return;

        }

        if(e.targetD < (42 + e.r) ** 2){

            e.mode = "fuse";
            e.modeT = 0.6;

            return;

        }

        seek(state, e, target, e.speed * slow, dt, Math.sin(e.t * 5) * 0.3);

    },


    // walks in, winds up, then charges in a straight line until a wall
    charger(state, e, target, dt, slow){

        e.cool -= dt;

        switch(e.mode){

            case "wind":

                e.modeT -= dt;

                if(e.modeT <= 0){

                    e.mode = "charge";
                    e.modeT = 0.75;

                }

                return;

            case "charge":

                e.modeT -= dt;

                if(walk(state, e, e.angle, 400 * slow, dt) || e.modeT <= 0){

                    e.mode = "stun";
                    e.modeT = 0.8;

                    if(e.elite)
                        ring(state, e, 10, 150);

                    emit(state, "thud", {x: e.x, y: e.y});

                }

                return;

            case "stun":

                e.modeT -= dt;

                if(e.modeT <= 0){

                    e.mode = "move";
                    e.cool = 1.8;

                }

                return;

        }

        if(e.cool <= 0 && e.sees && e.targetD < 260 * 260){

            e.mode = "wind";
            e.modeT = 0.6;
            e.angle = angleTo(e, target);

            return;

        }

        seek(state, e, target, e.speed * slow, dt);

    },


    // blinks around you, throws slow homing orbs and rings
    caster(state, e, target, dt, slow){

        const def = ENEMIES[e.type];

        if(e.mode === "blink"){

            e.modeT -= dt;

            if(e.modeT <= 0){

                emit(state, "blink", {x: e.x, y: e.y, color: e.color});

                e.x = e.blinkTo.x;
                e.y = e.blinkTo.y;
                e.mode = "move";
                e.sees = false;

                emit(state, "blink", {x: e.x, y: e.y, color: e.color});

            }

            return;

        }

        e.cool -= dt;
        e.fireT -= dt;

        if(e.cool <= 0){

            e.mode = "blink";
            e.modeT = 0.45;
            e.cool = state.rng.range(4, 6);
            e.blinkTo = spotNear(state.rng, state.map, target.x, target.y, 130, 250);

            return;

        }

        if(!e.sees){

            e.mode = "move";

            seek(state, e, target, e.speed * slow, dt);

            return;

        }

        if(e.fireT <= 0){

            if(!windUp(e, dt, 0.4))
                return;

            e.volley++;

            if(e.volley % 2){

                for(let i = -1; i <= 1; i++)
                    enemyBullet(state, e, angleTo(e, target) + i * 35 * DEG, def.bullet, {r: 7, homing: 1.4, life: 4, color: 1});

            }
            else{

                ring(state, e, e.elite ? 18 : 12, def.bullet * 1.1, state.rng.range(0, 1), {color: 1});

            }

            e.fireT = def.fire * (e.elite ? 0.7 : 1);

            return;

        }

        const toward = angleTo(e, target);

        walk(state, e, e.targetD < 180 * 180 ? toward + Math.PI : toward + e.side * Math.PI / 2, e.speed * slow, dt);

    }

};


// dummies sway back to their spot (and some strafe side to side)
function dummy(state, e, dt){

    const x = e.home.x + Math.sin(e.t * 1.3) * e.strafe;

    e.x += (x - e.x) * Math.min(1, dt * 10);
    e.y += (e.home.y - e.y) * Math.min(1, dt * 10);

    e.kx = e.ky = 0;

    while(e.log.length && e.log[0][0] < state.time - 5)
        e.log.shift();

    // damage per second over the last few seconds, for the readout
    if((state.tick + e.id) % 6 === 0){

        const since = state.time - 4;

        let total = 0;
        let first = state.time;

        for(const [t, dmg] of e.log){

            if(t > since){

                total += dmg;
                first = Math.min(first, t);

            }

        }

        e.dps = total / Math.max(1, state.time - first);

    }

    if(!e.shoots)
        return;

    e.fireT -= dt;

    if(e.target && e.fireT <= 0 && e.targetD < 230 * 230){

        e.fireT = 2.2;

        ring(state, e, 10, 105, e.t, {life: 3});

    }

}
