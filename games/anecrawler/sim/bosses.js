import {BOSS, ENEMY_HP_GROWTH, FLOORS_PER_WORLD, TINT, worldOf} from "./data.js";
import {spotNear} from "./map.js";
import {moveBody, angleTo, castRay, DEG} from "./physics.js";
import {emit, newId, enemyBullet, ring} from "./world.js";
import {addZone} from "./ground.js";
import {makeEnemy} from "./enemies.js";


const MAX_MINIONS = 6;
const LEAVE_RANGE = 320;        // everyone this far outside the lair...
const LEAVE_TIME = 3;           // ...for this long, and the boss resets


// A boss sleeps in the middle of its lair (map.arena) until someone walks
// in. It picks one of four attack patterns at a time, rests a moment, then
// picks another. Below half health it gets angry: faster, denser attacks.
// It never leaves the lair; run away and it goes back to sleep, healed.
// Each world has its own boss (or a choice of them: WORLDS.bosses).

export function spawnBoss(state){

    const def = BOSS[state.rng.pick(worldOf(state.floor).bosses)];
    const arena = state.map.arena;
    const hp = def.hp * ENEMY_HP_GROWTH ** (state.floor - FLOORS_PER_WORLD) * (1 + (state.players.length - 1) * 0.6);

    state.enemies.push({
        ...makeEnemy(state, "slime", arena.x, arena.y, {asleep: true, spawn: 0}),
        splits: 0,
        lives: 0,
        type: def.id,
        ai: "boss",
        boss: def.id,
        name: def.name,
        shape: def.shape,
        r: def.radius,
        hp,
        maxHp: hp,
        speed: def.speed,
        color: def.color,
        pattern: null,
        last: null,
        rest: 0.6,
        spin: 0,
        away: 0,
        enraged: false,
        telegraph: null
    });

}


export function updateBoss(state, e, target, dt, slow){

    const arena = state.map.arena;

    if(Math.hypot(target.x - arena.x, target.y - arena.y) > arena.r + LEAVE_RANGE){

        e.away += dt;

        if(e.away > LEAVE_TIME)
            return reset(state, e);

    }
    else{

        e.away = 0;

    }

    if(!e.enraged && e.hp < e.maxHp / 2){

        e.enraged = true;

        emit(state, "enrage", {id: e.id, x: e.x, y: e.y});

    }

    if(e.pattern){

        e.pattern.t += dt;

        if(PATTERNS[e.pattern.name](state, e, target, dt, e.pattern)){

            e.pattern = null;
            e.rest = e.enraged ? 0.45 : 0.9;
            e.telegraph = null;
            e.hidden = false;
            e.mode = "move";

        }

    }
    else{

        e.rest -= dt;

        roam(state, e, target, dt, slow);

        if(e.rest <= 0){

            // any pattern but the last one
            const name = state.rng.pick(BOSS[e.boss].patterns.filter(other => other !== e.last));

            e.last = name;
            e.pattern = {name, t: 0, step: 0, wait: 0, count: 0, fire: 0};

        }

    }

    leash(e, arena);

}


// keeps the boss inside its lair
function leash(e, arena){

    const d = Math.hypot(e.x - arena.x, e.y - arena.y);
    const limit = arena.r - e.r * 0.5;

    if(d > limit){

        e.x = arena.x + (e.x - arena.x) / d * limit;
        e.y = arena.y + (e.y - arena.y) / d * limit;

    }

}


function reset(state, e){

    const arena = state.map.arena;

    e.x = arena.x;
    e.y = arena.y;
    e.hp = e.maxHp;
    e.asleep = true;
    e.enraged = false;
    e.pattern = null;
    e.telegraph = null;
    e.hidden = false;
    e.mode = "move";
    e.away = 0;
    e.rest = 0.6;

    state.lasers = state.lasers.filter(l => l.owner !== e.id);

    emit(state, "bossReset", {id: e.id, name: e.name});

}


// between attacks: the Warden and Forgeheart plod after you, the Queen
// circles you, Eclipse drifts around the middle of its lair, the Lich
// keeps its distance
function roam(state, e, target, dt, slow){

    const d = Math.hypot(target.x - e.x, target.y - e.y);
    const toward = angleTo(e, target);

    let angle = toward;

    if(e.boss === "queen")
        angle = d < 160 ? toward + Math.PI * 0.6 : toward + Math.PI * 0.35;

    if(e.boss === "eclipse"){

        const arena = state.map.arena;

        angle = angleTo(e, {x: arena.x + Math.cos(e.t * 0.7) * 90, y: arena.y + Math.sin(e.t * 0.7) * 60});

    }

    if(e.boss === "lich")
        angle = d < 200 ? toward + Math.PI * 0.75 : d > 300 ? toward : toward + Math.PI / 2;

    if((e.boss === "warden" || e.boss === "forgeheart") && d < e.r + 30)
        return;

    e.angle = angle;

    moveBody(state.map, e, Math.cos(angle) * e.speed * slow * dt, Math.sin(angle) * e.speed * slow * dt);

}


function inLair(state, minR, maxR){

    const arena = state.map.arena;

    return spotNear(state.rng, state.map, arena.x, arena.y, minR, Math.min(maxR, arena.r - 40));

}


function summon(state, e, type, count){

    const alive = state.enemies.filter(m => m.owner === e.id && !m.dead).length;

    for(let i = 0; i < Math.min(count, MAX_MINIONS - alive); i++){

        const spot = inLair(state, 60, 400);

        state.enemies.push(makeEnemy(state, type, spot.x, spot.y, {minion: true, owner: e.id}));

    }

}


// every pattern: (state, boss, target, dt, P) -> true when finished.
// P is the pattern's scratch space: {t, step, wait, count, fire}
const PATTERNS = {

    /* ---- The Warden ---- */

    spiral(state, e, target, dt, P){

        P.fire -= dt;

        if(P.fire <= 0){

            const arms = e.enraged ? 6 : 4;

            P.fire = 0.11;
            e.spin += 0.21;

            for(let k = 0; k < arms; k++)
                enemyBullet(state, e, e.spin + k * Math.PI * 2 / arms, 135);

        }

        return P.t > 3.2;

    },


    // leaps onto you: a marked circle, then a landing ring of bullets
    slam(state, e, target, dt, P){

        if(P.step === 0){

            P.count = e.enraged ? 3 : 2;
            P.step = 1;

        }

        if(P.step === 1){

            // lands on you, but never outside the lair
            const arena = state.map.arena;
            const d = Math.hypot(target.x - arena.x, target.y - arena.y);
            const k = Math.min(1, (arena.r - e.r) / Math.max(d, 1));

            P.to = {x: arena.x + (target.x - arena.x) * k, y: arena.y + (target.y - arena.y) * k};
            P.wait = 0.85;
            P.step = 2;
            e.hidden = true;

            state.strikes.push({id: newId(state), team: "e", x: P.to.x, y: P.to.y, r: 60, delay: 0.85, total: 0.85, dmg: 2, dead: false});

            return false;

        }

        P.wait -= dt;

        if(P.wait > 0)
            return false;

        if(P.step === 2){

            e.x = P.to.x;
            e.y = P.to.y;
            e.hidden = false;

            ring(state, e, e.enraged ? 20 : 14, 150, state.rng.range(0, 1));

            emit(state, "thud", {x: e.x, y: e.y, big: true});

            P.count--;
            P.step = 3;
            P.wait = 0.4;

            return false;

        }

        if(P.count > 0){

            P.step = 1;

            return false;

        }

        return true;

    },


    summon(state, e, target, dt, P){

        if(P.step === 0){

            summon(state, e, "skeleton", e.enraged ? 4 : 3);

            P.step = 1;

        }

        return P.t > 0.8;

    },


    // walls of bullets with one gap to slip through
    walls(state, e, target, dt, P){

        P.fire -= dt;

        if(P.fire <= 0 && P.count < 3){

            P.fire = e.enraged ? 0.6 : 0.8;
            P.count++;

            const angle = angleTo(e, target);
            const across = angle + Math.PI / 2;
            const size = 17;
            const gap = state.rng.int(3, size - 6);

            for(let i = 0; i < size; i++){

                if(i >= gap && i < gap + 3)
                    continue;

                const offset = (i - (size - 1) / 2) * 28;

                enemyBullet(state, e, angle, 130, {from: {x: e.x + Math.cos(across) * offset, y: e.y + Math.sin(across) * offset}});

            }

        }

        return P.count >= 3 && P.fire <= -0.4;

    },


    /* ---- Hive Queen ---- */

    // three (four) telegraphed dashes at you
    dash(state, e, target, dt, P){

        if(P.step === 0){

            P.count = e.enraged ? 4 : 3;
            P.step = 1;

        }

        if(P.step === 1){

            P.angle = angleTo(e, target);
            P.wait = e.enraged ? 0.32 : 0.45;
            P.step = 2;

            e.telegraph = {angle: P.angle, length: castRay(state.map, e.x, e.y, P.angle, 300).length};

            return false;

        }

        if(P.step === 2){

            P.wait -= dt;

            if(P.wait <= 0){

                P.step = 3;
                P.wait = 0.4;
                e.telegraph = null;
                e.mode = "charge";

            }

            return false;

        }

        P.wait -= dt;

        const blocked = moveBody(state.map, e, Math.cos(P.angle) * 560 * dt, Math.sin(P.angle) * 560 * dt);

        if(P.wait > 0 && !blocked)
            return false;

        e.mode = "move";

        if(e.enraged)
            ring(state, e, 8, 160, P.angle);

        P.count--;
        P.step = 1;

        return P.count <= 0;

    },


    spray(state, e, target, dt, P){

        P.fire -= dt;

        if(P.fire <= 0){

            P.fire = e.enraged ? 0.05 : 0.07;

            enemyBullet(state, e, angleTo(e, target) + state.rng.range(-0.45, 0.45), state.rng.range(170, 230), {r: 4});

        }

        return P.t > 2.2;

    },


    brood(state, e, target, dt, P){

        if(P.step === 0){

            summon(state, e, "wasp", e.enraged ? 5 : 4);

            P.step = 1;

        }

        return P.t > 0.8;

    },


    // four spinning arms that bloom like petals
    flower(state, e, target, dt, P){

        P.fire -= dt;

        if(P.fire <= 0){

            P.fire = 0.09;
            e.spin += 0.32;

            for(const base of [0, Math.PI]){

                enemyBullet(state, e, base + e.spin, 125, {color: 3});
                enemyBullet(state, e, base - e.spin, 125, {color: 3});

            }

        }

        return P.t > (e.enraged ? 3 : 2.4);

    },


    /* ---- Eclipse ---- */

    // sweeping laser lines, shown as thin warnings first
    lasers(state, e, target, dt, P){

        if(P.step === 0){

            const n = e.enraged ? 6 : 4;
            const base = angleTo(e, target) + Math.PI / n;
            const spin = (state.rng.chance(0.5) ? 1 : -1) * (e.enraged ? 0.7 : 0.5);

            for(let k = 0; k < n; k++){

                const angle = base + k * Math.PI * 2 / n;

                state.lasers.push({
                    id: newId(state),
                    owner: e.id,
                    x: e.x,
                    y: e.y,
                    angle,
                    length: castRay(state.map, e.x, e.y, angle, 900).length,
                    warn: 1,
                    live: 1.7,
                    spin,
                    dead: false
                });

            }

            P.step = 1;

        }

        return P.t > 2.9;

    },


    // rings with a gap; the gap moves each ring
    rings(state, e, target, dt, P){

        P.fire -= dt;

        if(P.fire <= 0 && P.count < 3){

            P.fire = 0.7;
            P.count++;

            const n = 28;
            const aim = angleTo(e, target) + state.rng.range(-0.8, 0.8);

            for(let i = 3; i <= n - 3; i++)
                enemyBullet(state, e, aim + (i / n) * Math.PI * 2, e.enraged ? 155 : 135, {color: 2});

        }

        return P.count >= 3 && P.fire <= -0.3;

    },


    orbs(state, e, target, dt, P){

        if(P.step === 0){

            const n = e.enraged ? 9 : 6;

            for(let i = 0; i < n; i++)
                enemyBullet(state, e, (i / n) * Math.PI * 2, 115, {r: 8, homing: 1.2, life: 5.5, color: 2});

            P.step = 1;

        }

        return P.t > 1;

    },


    // vanishes, reappears somewhere else and fires three fans at you
    blink(state, e, target, dt, P){

        if(P.step === 0){

            let spot = inLair(state, 0, 400);

            for(let tries = 0; tries < 10 && Math.hypot(spot.x - target.x, spot.y - target.y) < 170; tries++)
                spot = inLair(state, 0, 400);

            P.to = spot;
            P.wait = 0.5;
            P.step = 1;
            e.hidden = true;

            emit(state, "blink", {x: e.x, y: e.y, color: e.color});

            return false;

        }

        if(P.step === 1){

            P.wait -= dt;

            if(P.wait > 0)
                return false;

            e.x = P.to.x;
            e.y = P.to.y;
            e.hidden = false;

            emit(state, "blink", {x: e.x, y: e.y, color: e.color});

            P.step = 2;
            P.fire = 0.15;

            return false;

        }

        P.fire -= dt;

        if(P.fire <= 0 && P.count < 3){

            P.fire = 0.25;
            P.count++;

            for(let i = -2; i <= 2; i++)
                enemyBullet(state, e, angleTo(e, target) + i * 12 * DEG, 190, {color: 2});

        }

        return P.count >= 3 && P.fire <= 0;

    },


    /* ---- The Lich ---- */

    // raises a ring of skeletons around the lair
    raise(state, e, target, dt, P){

        if(P.step === 0){

            summon(state, e, "skeleton", e.enraged ? 4 : 3);

            emit(state, "chant", {id: e.id, x: e.x, y: e.y, color: e.color, big: true});

            P.step = 1;

        }

        return P.t > 1;

    },


    // waves of slow souls that home in on you
    souls(state, e, target, dt, P){

        P.fire -= dt;

        if(P.fire <= 0 && P.count < 2){

            P.fire = 1;
            P.count++;

            const n = e.enraged ? 9 : 6;
            const turn = P.count * 0.3;

            for(let i = 0; i < n; i++)
                enemyBullet(state, e, turn + (i / n) * Math.PI * 2, 105, {r: 7, homing: 1.5, life: 5, color: TINT.soul});

        }

        return P.count >= 2 && P.fire <= -0.6;

    },


    // lines of bone spikes burst from the floor towards everyone, one
    // after another (a ring marks each before it breaks the surface)
    spikes(state, e, target, dt, P){

        if(P.step === 0){

            const fans = e.enraged ? [-0.4, 0, 0.4] : [0];

            for(const p of state.players){

                if(p.dead)
                    continue;

                for(const fan of fans){

                    const angle = angleTo(e, p) + fan;
                    const length = castRay(state.map, e.x, e.y, angle, 460).length;

                    for(let d = e.r + 20, i = 0; d < length; d += 34, i++){

                        state.strikes.push({
                            id: newId(state), team: "e", look: "bone",
                            x: e.x + Math.cos(angle) * d, y: e.y + Math.sin(angle) * d,
                            r: 22, delay: 0.55 + i * 0.07, total: 0.55 + i * 0.07, dmg: 1, dead: false
                        });

                    }

                }

            }

            P.step = 1;

        }

        return P.t > 1.6;

    },


    // vanishes to the middle of the lair, then two rings with a gap each
    nova(state, e, target, dt, P){

        if(P.step === 0){

            const arena = state.map.arena;

            P.to = spotNear(state.rng, state.map, arena.x, arena.y, 0, 60);
            P.wait = 0.45;
            P.step = 1;
            e.hidden = true;

            emit(state, "blink", {x: e.x, y: e.y, color: e.color});

            return false;

        }

        if(P.step === 1){

            P.wait -= dt;

            if(P.wait > 0)
                return false;

            e.x = P.to.x;
            e.y = P.to.y;
            e.hidden = false;
            P.step = 2;
            P.fire = 0.35;

            emit(state, "blink", {x: e.x, y: e.y, color: e.color});

            return false;

        }

        P.fire -= dt;

        if(P.fire <= 0 && P.count < 2){

            P.fire = 0.55;
            P.count++;

            const n = 30;
            const aim = angleTo(e, target) + (P.count === 2 ? Math.PI : 0) + state.rng.range(-0.5, 0.5);

            for(let i = 3; i <= n - 3; i++)
                enemyBullet(state, e, aim + (i / n) * Math.PI * 2, e.enraged ? 150 : 130, {color: TINT.soul});

        }

        return P.count >= 2 && P.fire <= -0.3;

    },


    /* ---- Forgeheart ---- */

    // molten rock rains around everyone; where it lands, the floor burns
    eruption(state, e, target, dt, P){

        P.fire -= dt;

        if(P.fire <= 0 && P.t < 2.4){

            P.fire = e.enraged ? 0.12 : 0.18;

            const living = state.players.filter(p => !p.dead);
            const p = living.length ? state.rng.pick(living) : target;
            const spot = spotNear(state.rng, state.map, p.x, p.y, 0, 150);

            state.strikes.push({
                id: newId(state), team: "e", look: "meteor",
                x: spot.x, y: spot.y, r: 40, delay: 0.95, total: 0.95, dmg: 1, dead: false,
                zone: {kind: "fire", r: 34, life: 2.6}
            });

        }

        return P.t > 3.4;

    },


    // a sweeping cone of fire
    flame(state, e, target, dt, P){

        if(P.step === 0){

            P.base = angleTo(e, target);
            P.step = 1;

        }

        P.fire -= dt;

        while(P.fire <= 0){

            P.fire += 0.035;

            const sweep = Math.sin(P.t * (e.enraged ? 2.4 : 1.8)) * 1.05;

            enemyBullet(state, e, P.base + sweep + state.rng.range(-0.08, 0.08), state.rng.range(190, 240), {r: 6, life: 1.1, color: TINT.fire});

        }

        return P.t > (e.enraged ? 3.2 : 2.6);

    },


    // brings its fists down: a ring of fire bullets, and burning lines
    // that run out across the floor (they turn a little each time)
    hammer(state, e, target, dt, P){

        if(P.step === 0){

            P.count = e.enraged ? 3 : 2;
            P.step = 1;

        }

        if(P.step === 1){

            P.wait = 0.85;
            P.step = 2;

            state.strikes.push({id: newId(state), team: "e", look: "slam", x: e.x, y: e.y, r: e.r + 60, delay: 0.85, total: 0.85, dmg: 2, dead: false});

            return false;

        }

        P.wait -= dt;

        if(P.wait > 0)
            return false;

        if(P.step === 2){

            ring(state, e, e.enraged ? 22 : 16, 150, state.rng.range(0, 1), {color: TINT.fire});

            const lines = e.enraged ? 8 : 6;

            e.spin += Math.PI / lines;

            for(let k = 0; k < lines; k++){

                const angle = e.spin + k * Math.PI * 2 / lines;
                const length = castRay(state.map, e.x, e.y, angle, 320).length;

                for(let d = e.r + 30; d < length; d += 34)
                    addZone(state, "fire", e.x + Math.cos(angle) * d, e.y + Math.sin(angle) * d, 20, 2.2 + d / 400);

            }

            emit(state, "thud", {x: e.x, y: e.y, big: true});

            P.count--;
            P.step = 3;
            P.wait = 0.55;

            return false;

        }

        if(P.count > 0){

            P.step = 1;

            return false;

        }

        return true;

    },


    embers(state, e, target, dt, P){

        if(P.step === 0){

            summon(state, e, "ember", e.enraged ? 4 : 3);

            P.step = 1;

        }

        return P.t > 0.8;

    }

};
