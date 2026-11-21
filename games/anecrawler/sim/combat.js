import {TILE} from "./data.js";
import {blocksAt, tileAt, CRATE} from "./map.js";
import {weaponStats} from "./loot.js";
import {near} from "./grid.js";
import {DEG, angleDiff, castRay, segmentDistance, clamp} from "./physics.js";
import {hash01} from "./rng.js";
import {addZone} from "./ground.js";
import {lobFields, boomerang, turnBack, shards} from "./flight.js";
import {
    emit, newId, isActive, nearestEnemy,
    damageEnemy, damagePlayer, explode, smashCrate, breakCrates
} from "./world.js";


const BEAM_TICK = 0.1;          // beams hurt ten times a second
export const SWING_TIME = 0.16; // a swing deflects bullets for this long
export const MUZZLE = 12;       // bullets start this far past the body's edge
const CHAIN_RANGE = 150;
export const HOMING_RANGE = 280;
const PULL_SPEED = 80;
const ZAP_RANGE = 130;          // how far a spark jumps to the next enemy
const ZAP_SHARE = 0.6;          // ...and how much of the hit it carries
const CHILL_FREEZE = 3;         // chilling hits that freeze an enemy solid
const FREEZE_TIME = 1.4;
const POISON_STACKS = 6;
const STORM_REACH = 170;        // storm bolts find enemies this close to the cursor

// result lists for grid lookups, one per place that loops while dealing
// damage (see grid.js)
const swingList = [];
const bulletList = [];
const lineList = [];
const pellets = [];


/* ---------------- Player weapons ---------------- */

// Uses the held weapon for one input's worth of time. `fire` is whether
// the trigger is down.
export function updateWeapon(state, p, fire, dt){

    coolDown(p, dt);

    if(p.swing){

        p.swing.t -= dt;

        deflect(state, p);

        if(p.swing.t <= 0)
            p.swing = null;

    }

    const item = p.weapons[p.slot];

    if(!item){

        p.beam = null;

        return;

    }

    const s = weaponStats(item, state.mode === "lobby");

    trigger(p, s, fire, dt, {
        pay: cost => spend(state, p, cost),
        shoot: () => shoot(state, p, s),
        swing: () => swing(state, p, s),
        release: power => release(state, p, s, power),
        beam: () => beam(state, p, s, dt)
    });

}


// Both weapons cool down all the time: the one in hand (p.reload) and the
// one put away (p.cool[other slot]), so swapping never skips a cooldown.
export function coolDown(p, dt){

    p.reload -= dt;

    const other = 1 - p.slot;

    if(p.cool && p.cool[other] > 0)
        p.cool[other] -= dt;

}


// When a weapon goes off: reloading, bursts, charging and energy. Only
// timing lives here; what going off does is `act`'s business:
//   act.pay(cost) -> bool    act.shoot()    act.swing()
//   act.release(power)       act.beam()
// A guest's machine runs this same function for its own player with
// harmless stand-ins (net/predict.js), so shots show the moment the trigger
// is pulled and still match what the host decides. `p` needs reload,
// burst, burstT, charge and beam.
export function trigger(p, s, fire, dt, act){

    // the rest of a burst
    if(p.burst > 0){

        p.burstT -= dt;

        if(p.burstT <= 0){

            act.shoot();

            p.burst--;
            p.burstT = s.burstGap;

        }

    }

    if(s.kind !== "beam")
        p.beam = null;

    switch(s.kind){

        case "gun":

            // a spinning gun winds up while the trigger is held, from a
            // third of its rate to all of it, and winds down when let go
            if(s.spin)
                p.spin = fire ? Math.min(1, p.spin + dt / s.spin) : Math.max(0, p.spin - dt * 2 / s.spin);

            if(fire && p.reload <= 0 && p.burst === 0 && act.pay(s.energy)){

                p.reload = 1 / (s.rate * (s.spin ? 0.3 + 0.7 * p.spin : 1));

                act.shoot();

                if(s.burst){

                    p.burst = s.burst - 1;
                    p.burstT = s.burstGap;

                }

            }

            break;

        case "melee":

            if(fire && p.reload <= 0 && act.pay(s.energy)){

                p.reload = 1 / s.rate;

                act.swing();

            }

            break;

        case "charge":

            if(fire && p.reload <= 0){

                p.charge = Math.min(s.charge, Math.max(0, p.charge) + dt);

            }
            else if(!fire && p.charge >= 0){

                if(p.charge >= s.minCharge && act.pay(s.energy)){

                    p.reload = 1 / s.rate;

                    act.release(p.charge / s.charge);

                }

                p.charge = -1;

            }

            break;

        case "beam":

            if(fire && act.pay(s.energy * dt))
                act.beam();
            else
                p.beam = null;

            break;

    }

}


// Where the pellets of one shot go, in radians from the aim. The scatter
// comes from the player and how many shots they have fired, not from the
// world's dice, so a guest's machine can draw the very same pellets the
// moment it fires (see net/predict.js).
export function pelletAngles(s, key, shots, out = []){

    const count = s.count ?? 1;
    const spread = s.spread ?? 0;

    out.length = 0;

    for(let i = 0; i < count; i++){

        const fan = count > 1 ? (i / (count - 1) - 0.5) * spread : 0;
        const jitter = (hash01(key, shots, i) - 0.5) * (count > 1 ? spread * 0.2 : spread);

        out.push((fan + jitter) * DEG);

    }

    return out;

}


// pays energy; an empty tank says so once per trigger pull
function spend(state, p, cost){

    if(cost <= 0)
        return true;

    if(p.energy >= cost){

        p.energy -= cost;

        return true;

    }

    if(!p.held.fire)
        emit(state, "empty", {pid: p.id});

    return false;

}


// a bullet is plain data; how it looks comes from its weapon (see render)
function playerBullet(state, p, s, angle, extra){

    const muzzle = p.r + MUZZLE;

    const bullet = {
        id: newId(state),
        team: "p",
        pid: p.id,
        weapon: s.id,
        kind: null,
        x: p.x + Math.cos(angle) * muzzle,
        y: p.y + Math.sin(angle) * muzzle,
        vx: Math.cos(angle) * s.speed,
        vy: Math.sin(angle) * s.speed,
        r: s.size,
        dmg: s.dmg,
        life: s.life,
        pierce: s.pierce ?? 0,
        bounce: s.bounce ?? 0,
        explode: s.explode ?? 0,
        homing: s.homing ?? 0,
        slow: s.slow ?? 0,
        burn: s.burn ?? 0,
        pull: s.pull ?? 0,
        tick: s.tick ?? 0,
        tickT: 0,
        split: s.split ?? null,
        zap: s.zap ?? 0,
        chill: s.chill ?? 0,
        poison: s.poison ?? 0,
        zone: s.zone ?? null,
        lob: 0,
        crit: s.crit,
        hits: null,
        age: 0,
        dead: false
    };

    if(extra)
        Object.assign(bullet, extra);

    state.bullets.push(bullet);

}


function shotEvent(state, p, s, power){

    const reach = p.r + 14;

    emit(state, "shot", {
        pid: p.id,
        x: p.x + Math.cos(p.aim) * reach,
        y: p.y + Math.sin(p.aim) * reach,
        angle: p.aim,
        weapon: s.id,
        power
    });

}


function shoot(state, p, s){

    p.shots++;

    for(const offset of pelletAngles(s, p.key, p.shots, pellets))
        playerBullet(state, p, s, p.aim + offset, extraFor(state.map, p, s, p.aim + offset));

    shotEvent(state, p, s);

}


// what a thrown weapon's shot needs on top of a plain bullet (the guest's
// guess uses this too, see net/predict.js)
export function extraFor(map, p, s, angle){

    if(s.lob)
        return lobFields(map, p, s, angle);

    if(s.returns)
        return {range: s.range, travel: 0, back: false, speed0: s.speed, pierce: 999};

    return null;

}


// a melee swing: hits everything in its arc once, breaks crates and bullets
function swing(state, p, s){

    const range = s.range + p.r;
    const arc = s.arc * DEG;
    const hit = [];

    p.swing = {t: SWING_TIME, dur: SWING_TIME, angle: p.aim, arc, range, weapon: s.id, reflect: s.reflect ? s.dmg * s.reflect : 0};

    for(const e of near(state.grid, p.x, p.y, range, swingList)){

        if(!isActive(e))
            continue;

        const d = Math.hypot(e.x - p.x, e.y - p.y);

        if(d - e.r > range)
            continue;

        const leeway = Math.atan2(e.r, Math.max(d, 1));

        if(Math.abs(angleDiff(p.aim, Math.atan2(e.y - p.y, e.x - p.x))) > arc / 2 + leeway)
            continue;

        damageEnemy(state, e, s.dmg, {pid: p.id, crit: s.crit, knock: p.aim, push: s.stagger ? 420 : 220});

        // a heavy blow leaves it reeling for a moment (not bosses)
        if(s.stagger && !e.boss && !e.dead){

            e.staggerT = Math.max(e.staggerT ?? 0, s.stagger);

            emit(state, "stagger", {id: e.id, x: e.x, y: e.y, r: e.r});

        }

        hit.push(e.id);

    }

    // a reaping blade feeds its wielder's energy, a little per thing it cuts
    if(s.leech && hit.length){

        p.energy = Math.min(p.maxEnergy, p.energy + s.leech * hit.length);

        emit(state, "leech", {pid: p.id, x: p.x, y: p.y, count: hit.length});

    }

    swingCrates(state, p, range, arc);

    deflect(state, p);

    if(s.shock){

        const x = p.x + Math.cos(p.aim) * range * 0.75;
        const y = p.y + Math.sin(p.aim) * range * 0.75;

        for(const e of near(state.grid, x, y, s.shock, swingList)){

            if(isActive(e) && !hit.includes(e.id) && Math.hypot(e.x - x, e.y - y) < s.shock + e.r)
                damageEnemy(state, e, s.dmg * 0.5, {pid: p.id, crit: s.crit, knock: Math.atan2(e.y - y, e.x - x), kind: "shock"});

        }

        emit(state, "shock", {pid: p.id, x, y, r: s.shock, weapon: s.id});

    }

    if(s.wave)
        playerBullet(state, p, {...s, speed: 470, size: 15, life: 0.5, pierce: 99}, p.aim, {dmg: s.dmg * 0.6, kind: "slash"});

    emit(state, "swing", {pid: p.id, weapon: s.id});

}


function swingCrates(state, p, range, arc){

    const reach = Math.ceil(range / TILE) + 1;
    const cx = Math.floor(p.x / TILE);
    const cy = Math.floor(p.y / TILE);

    for(let ty = cy - reach; ty <= cy + reach; ty++){

        for(let tx = cx - reach; tx <= cx + reach; tx++){

            if(tileAt(state.map, tx, ty) !== CRATE)
                continue;

            const x = (tx + 0.5) * TILE;
            const y = (ty + 0.5) * TILE;

            if(Math.hypot(x - p.x, y - p.y) - TILE / 2 > range)
                continue;

            if(Math.abs(angleDiff(p.aim, Math.atan2(y - p.y, x - p.x))) < arc / 2 + 0.3)
                smashCrate(state, tx, ty);

        }

    }

}


// while a swing is out, enemy bullets inside its arc are knocked away;
// arrows are not: the blade glances off them and they fly on. A mirror
// blade sends the orbs back where its wielder aims, as their own shots.
function deflect(state, p){

    const {angle, arc, range, reflect} = p.swing;
    const reach = (range + 10) ** 2;

    for(const b of state.bullets){

        if(b.team !== "e" || b.dead)
            continue;

        const dx = b.x - p.x;
        const dy = b.y - p.y;

        if(dx * dx + dy * dy > reach)
            continue;

        if(Math.abs(angleDiff(angle, Math.atan2(dy, dx))) > arc / 2 + 0.25)
            continue;

        if(b.kind === "arrow"){

            if(!b.glanced){

                b.glanced = true;

                emit(state, "glance", {x: b.x, y: b.y, tint: b.tint});

            }

            continue;

        }

        if(reflect){

            const speed = Math.max(380, Math.hypot(b.vx, b.vy) * 1.6);

            Object.assign(b, {
                team: "p", pid: p.id, weapon: p.swing.weapon, reflected: true,
                vx: Math.cos(p.aim) * speed, vy: Math.sin(p.aim) * speed,
                dmg: reflect, life: 1.2, homing: 0, pierce: 0, hits: null, crit: 0.1
            });

            emit(state, "reflect", {x: b.x, y: b.y, angle: p.aim, weapon: p.swing.weapon});

            continue;

        }

        b.dead = true;

        emit(state, "deflect", {x: b.x, y: b.y});

    }

}


// letting go of a charged weapon; power is 0..1 of full charge
function release(state, p, s, power){

    const scale = 0.3 + 0.7 * power;
    const full = power >= 1;

    if(s.rain){

        // stars fall around the cursor, a little apart in time
        const reach = Math.min(320, Math.hypot(p.aimX - p.x, p.aimY - p.y));
        const x = p.x + Math.cos(p.aim) * reach;
        const y = p.y + Math.sin(p.aim) * reach;
        const count = full ? s.rain + 2 : s.rain;

        for(let i = 0; i < count; i++){

            const a = state.rng.range(0, Math.PI * 2);
            const r = state.rng.range(0, 64);

            state.strikes.push({
                id: newId(state),
                team: "p",
                pid: p.id,
                weapon: s.id,
                x: x + Math.cos(a) * r,
                y: y + Math.sin(a) * r,
                r: s.explode,
                delay: 0.3 + i * 0.07,
                total: 0.3 + i * 0.07,
                dmg: s.dmg * scale,
                crit: s.crit,
                dead: false
            });

        }

    }
    else if(s.rail){

        rail(state, p, s, s.dmg * scale, full);

    }
    else if(s.storm){

        storm(state, p, s, s.dmg * scale, s.storm + (full ? 2 : 0));

    }
    else{

        playerBullet(state, p, s, p.aim, {
            dmg: s.dmg * scale,
            vx: Math.cos(p.aim) * s.speed * (0.55 + 0.45 * power),
            vy: Math.sin(p.aim) * s.speed * (0.55 + 0.45 * power),
            pierce: (s.pierce ?? 0) + (full ? 1 : 0),
            kind: "arrow"
        });

    }

    shotEvent(state, p, s, power);

}


// enemies whose bodies a line from the player touches
function alongLine(state, p, length, width){

    const mid = length / 2;

    near(state.grid, p.x + Math.cos(p.aim) * mid, p.y + Math.sin(p.aim) * mid, mid + 40, lineList);

    const hits = [];

    for(const e of lineList){

        if(!isActive(e))
            continue;

        const where = segmentDistance(p.x, p.y, p.aim, length, e);

        if(where.distance < e.r + width)
            hits.push({e, along: where.along});

    }

    return hits;

}


// an instant line through every enemy up to the first wall
function rail(state, p, s, dmg, full){

    const ray = castRay(state.map, p.x, p.y, p.aim, s.rail);
    const width = full ? 10 : 6;

    for(const hit of alongLine(state, p, ray.length, width))
        damageEnemy(state, hit.e, dmg, {pid: p.id, crit: s.crit, knock: p.aim, push: 260});

    if(ray.crate)
        smashCrate(state, ray.crate.tx, ray.crate.ty, 3);

    emit(state, "rail", {
        pid: p.id,
        x1: p.x,
        y1: p.y,
        x2: p.x + Math.cos(p.aim) * ray.length,
        y2: p.y + Math.sin(p.aim) * ray.length,
        weapon: s.id,
        width
    });

}


// Lightning out of the sky: a bolt on each of the enemies nearest the
// cursor (any left over strike the ground around it)
function storm(state, p, s, dmg, bolts){

    const reach = Math.min(320, Math.hypot(p.aimX - p.x, p.aimY - p.y));
    const cx = p.x + Math.cos(p.aim) * reach;
    const cy = p.y + Math.sin(p.aim) * reach;

    const targets = near(state.grid, cx, cy, STORM_REACH, lineList)
        .filter(e => isActive(e) && Math.hypot(e.x - cx, e.y - cy) < STORM_REACH + e.r)
        .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));

    for(let i = 0; i < bolts; i++){

        const e = targets[i];
        const a = state.rng.range(0, Math.PI * 2);
        const r = state.rng.range(10, 70);
        const x = e ? e.x : cx + Math.cos(a) * r;
        const y = e ? e.y : cy + Math.sin(a) * r;

        for(const hit of near(state.grid, x, y, 34, bulletList))
            if(isActive(hit) && Math.hypot(hit.x - x, hit.y - y) < 34 + hit.r)
                damageEnemy(state, hit, hit === e ? dmg : dmg * 0.4, {pid: p.id, crit: s.crit, kind: "shock"});

        breakCrates(state, x, y, 20);

        emit(state, "thunder", {pid: p.id, x, y, weapon: s.id, delay: i * 0.05});

    }

}


// A beam reaches the first wall or its range, passing through `pierce`
// enemies. Prism beams then jump between enemies.
function beam(state, p, s, dt){

    const ray = castRay(state.map, p.x, p.y, p.aim, s.range);
    const pierce = s.pierce ?? 0;

    const hits = alongLine(state, p, ray.length, 5)
        .sort((a, b) => a.along - b.along)
        .slice(0, pierce + 1);

    const blocked = hits.length > pierce;
    const length = blocked ? hits[hits.length - 1].along : ray.length;

    const chain = [];

    if(s.chain && hits.length){

        let from = hits[hits.length - 1].e;
        const skip = hits.map(h => h.e.id);

        for(let i = 0; i < s.chain; i++){

            const next = nearestEnemy(state, from, CHAIN_RANGE, skip);

            if(!next)
                break;

            chain.push(next);
            skip.push(next.id);

            from = next;

        }

    }

    p.beamT -= dt;

    if(p.beamT <= 0){

        p.beamT = BEAM_TICK;

        for(const h of hits)
            damageEnemy(state, h.e, s.dmg * BEAM_TICK, {pid: p.id, crit: s.crit, kind: "beam"});

        for(const e of chain)
            damageEnemy(state, e, s.dmg * BEAM_TICK * 0.7, {pid: p.id, crit: s.crit, kind: "beam"});

        if(!blocked && ray.crate)
            smashCrate(state, ray.crate.tx, ray.crate.ty);

    }

    p.beam = {length, chain: chain.map(e => e.id), weapon: s.id};

}


/* ---------------- Projectiles ---------------- */

export function updateBullets(state, dt){

    const bullets = state.bullets;

    // (explosions add nothing to this list, so its length is safe to hold)
    for(let i = 0; i < bullets.length; i++){

        if(!bullets[i].dead)
            moveBullet(state, bullets[i], dt);

    }

    // drop the dead ones without making a new list
    let kept = 0;

    for(let i = 0; i < bullets.length; i++){

        if(!bullets[i].dead)
            bullets[kept++] = bullets[i];

    }

    bullets.length = kept;

}


function moveBullet(state, b, dt){

    b.age += dt;
    b.life -= dt;

    if(b.life <= 0){

        b.dead = true;

        if(b.explode)
            burst(state, b, b.x, b.y, Math.atan2(b.vy, b.vx));

        return;

    }

    // in the air: over everything until it lands
    if(b.lob){

        b.x += b.vx * dt;
        b.y += b.vy * dt;

        return;

    }

    if(b.range){

        const owner = state.players.find(p => p.id === b.pid);

        if(!owner || owner.dead || boomerang(b, owner, dt)){

            b.dead = true;

            if(owner && !owner.dead)
                emit(state, "catch", {pid: b.pid, x: b.x, y: b.y, weapon: b.weapon});

            return;

        }

    }

    if(b.homing)
        steer(state, b, dt);

    if(b.pull)
        pull(state, b, dt);

    const speed = Math.hypot(b.vx, b.vy);
    const steps = Math.max(1, Math.ceil(speed * dt / 6));

    for(let i = 0; i < steps && !b.dead; i++){

        const ox = b.x;
        const oy = b.y;

        b.x += b.vx * dt / steps;
        b.y += b.vy * dt / steps;

        // (a returning shot comes home through anything)
        if(!b.back && hitWall(state, b, ox, oy))
            return;

        if(b.team === "p")
            hitEnemies(state, b, dt / steps);
        else
            hitPlayers(state, b);

    }

}


// returns true if the bullet is gone
function hitWall(state, b, ox, oy){

    const tx = Math.floor(b.x / TILE);
    const ty = Math.floor(b.y / TILE);

    if(!blocksAt(state.map, tx, ty))
        return false;

    if(tileAt(state.map, tx, ty) === CRATE)
        smashCrate(state, tx, ty);

    const angle = Math.atan2(b.vy, b.vx);

    if(b.range){

        b.x = ox;
        b.y = oy;

        turnBack(b);

        emit(state, "spark", {pid: b.pid, shot: true, x: ox, y: oy, angle, weapon: b.weapon});

        return false;

    }

    if(b.bounce > 0){

        // flip whichever direction crossed into the wall
        const flipX = blocksAt(state.map, tx, Math.floor(oy / TILE));
        const flipY = blocksAt(state.map, Math.floor(ox / TILE), ty);

        if(flipX || !flipY)
            b.vx = -b.vx;

        if(flipY || !flipX)
            b.vy = -b.vy;

        b.x = ox;
        b.y = oy;
        b.bounce--;
        b.hits = null;

        emit(state, "spark", {pid: b.pid, shot: b.team === "p" || undefined, x: ox, y: oy, angle, weapon: b.weapon, tint: b.tint});

        return false;

    }

    b.dead = true;

    if(b.explode)
        burst(state, b, ox, oy, angle + Math.PI);
    else
        emit(state, "spark", {pid: b.pid, shot: b.team === "p" || undefined, x: ox, y: oy, angle, weapon: b.weapon, tint: b.tint});

    if(b.split && !b.explode)
        splitAt(state, b, ox, oy, angle + Math.PI);

    return true;

}


function hitEnemies(state, b, dt){

    // a slow orb that hurts everything it touches every `tick` seconds
    if(b.tick){

        b.tickT -= dt;

        if(b.tickT > 0)
            return;

        b.tickT = b.tick;

        for(const e of near(state.grid, b.x, b.y, b.r, bulletList)){

            if(isActive(e) && Math.hypot(e.x - b.x, e.y - b.y) < b.r + e.r)
                damageEnemy(state, e, b.dmg, {pid: b.pid, crit: b.crit, kind: "tick"});

        }

        return;

    }

    for(const e of near(state.grid, b.x, b.y, b.r, bulletList)){

        if(!isActive(e) || (b.hits && b.hits.includes(e.id)))
            continue;

        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const reach = b.r + e.r;

        if(dx * dx + dy * dy > reach * reach)
            continue;

        // grenades and missiles hurt through their blast alone
        if(b.explode){

            b.dead = true;

            burst(state, b, b.x, b.y, Math.atan2(b.vy, b.vx));

            return;

        }

        damageEnemy(state, e, b.dmg, {pid: b.pid, crit: b.crit, knock: Math.atan2(b.vy, b.vx), push: 60, shot: !b.tick});

        if(b.chill)
            chill(state, e, b.chill);

        if(b.poison)
            poison(e, b.dmg * b.poison, b.pid);

        if(b.zap)
            zap(state, e, b.dmg * ZAP_SHARE, b.zap, b.pid, b.weapon);

        if(b.slow){

            e.slow = b.slow;
            e.slowT = 1.6;

        }

        if(b.burn){

            e.burnDps = Math.max(e.burnDps, b.dmg * b.burn * 4);
            e.burnT = 2;
            e.burnBy = b.pid;

        }

        if(b.pierce > 0){

            b.pierce--;

            (b.hits ??= []).push(e.id);

            continue;

        }

        b.dead = true;

        if(b.split)
            splitAt(state, b, b.x, b.y, Math.atan2(b.vy, b.vx), e.id);

        return;

    }

}


// a shot that goes off: its blast, the shots it breaks into, the ground it
// leaves burning or melting
function burst(state, b, x, y, heading){

    explode(state, x, y, b.explode, b.dmg, {pid: b.pid, crit: b.crit, shot: true});

    if(b.split)
        splitAt(state, b, x, y, heading);

    if(b.zone)
        addZone(state, b.zone.kind, x, y, b.zone.r, b.zone.life, {dps: b.dmg * b.zone.dps, pid: b.pid});

}


// the fan of smaller shots a splitting one breaks into
function splitAt(state, b, x, y, heading, skip = null){

    for(const shard of shards({...b, x, y}, heading)){

        state.bullets.push({
            ...shard,
            id: newId(state),
            team: "p",
            pid: b.pid,
            weapon: b.weapon,
            slow: 0, burn: 0, pull: 0, tick: 0, tickT: 0, chill: 0, poison: 0, zone: null, lob: 0,
            crit: b.crit,
            hits: skip === null ? null : [skip],
            age: 0,
            dead: false
        });

    }

    emit(state, "split", {pid: b.pid, shot: true, x, y, angle: heading, weapon: b.weapon});

}


// lightning jumps from a struck enemy to the next nearest ones
function zap(state, from, dmg, jumps, pid, weapon){

    const points = [[Math.round(from.x), Math.round(from.y)]];
    const skip = [from.id];
    let at = from;

    for(let i = 0; i < jumps; i++){

        const next = nearestEnemy(state, at, ZAP_RANGE, skip);

        if(!next)
            break;

        damageEnemy(state, next, dmg, {pid, kind: "shock"});

        points.push([Math.round(next.x), Math.round(next.y)]);
        skip.push(next.id);

        at = next;

    }

    if(points.length > 1)
        emit(state, "zap", {pid, points, weapon});

}


// cold builds up: enough of it and an enemy freezes solid for a moment
// (bosses only slow down)
function chill(state, e, amount){

    e.slow = Math.max(e.slowT > 0 ? e.slow : 0, 0.3);
    e.slowT = Math.max(e.slowT, 1.2);

    if(e.boss || e.dead || e.frozenT > 0)
        return;

    e.chill = (e.chillT > 0 ? e.chill ?? 0 : 0) + amount;
    e.chillT = 2;

    if(e.chill >= CHILL_FREEZE){

        e.chill = 0;
        e.frozenT = FREEZE_TIME;

        emit(state, "freeze", {id: e.id, x: e.x, y: e.y, r: e.r});

    }

}


// poison stacks: each hit adds a dose, all of them hurt every half second
function poison(e, dps, pid){

    e.poisonStacks = Math.min(POISON_STACKS, (e.poisonT > 0 ? e.poisonStacks : 0) + 1);
    e.poisonDps = Math.max(e.poisonT > 0 ? e.poisonDps : 0, dps);
    e.poisonT = 3;
    e.poisonBy = pid;

}


function hitPlayers(state, b){

    for(const p of state.players){

        if(p.dead || p.dashT > 0)
            continue;

        const dx = p.x - b.x;
        const dy = p.y - b.y;
        const reach = b.r + p.r * 0.75;

        if(dx * dx + dy * dy > reach * reach)
            continue;

        // a player still flashing from a hit soaks the bullet harmlessly
        damagePlayer(state, p, b.dmg);

        b.dead = true;

        return;

    }

}


// turns a bullet towards the nearest target, `homing` radians per second
function steer(state, b, dt){

    let target = null;

    if(b.team === "p"){

        target = nearestEnemy(state, b, HOMING_RANGE);

    }
    else{

        let best = Infinity;

        for(const p of state.players){

            const d = (p.x - b.x) ** 2 + (p.y - b.y) ** 2;

            if(!p.dead && d < best){

                best = d;
                target = p;

            }

        }

    }

    if(!target)
        return;

    const speed = Math.hypot(b.vx, b.vy);
    const heading = Math.atan2(b.vy, b.vx);
    const turn = clamp(angleDiff(heading, Math.atan2(target.y - b.y, target.x - b.x)), -b.homing * dt, b.homing * dt);

    b.vx = Math.cos(heading + turn) * speed;
    b.vy = Math.sin(heading + turn) * speed;

}


// void orbs drag nearby enemies (not bosses) in
function pull(state, b, dt){

    for(const e of near(state.grid, b.x, b.y, b.pull, bulletList)){

        if(!isActive(e) || e.boss || e.dummy)
            continue;

        const d = Math.hypot(b.x - e.x, b.y - e.y);

        if(d < b.pull && d > 4){

            e.kx += (b.x - e.x) / d * PULL_SPEED * dt * 12;
            e.ky += (b.y - e.y) / d * PULL_SPEED * dt * 12;

        }

    }

}


/* ---------------- Delayed hits ---------------- */

// strikes: a marked circle that goes off after `delay` (stars, slams)
export function updateStrikes(state, dt){

    if(!state.strikes.length)
        return;

    for(const s of state.strikes){

        s.delay -= dt;

        if(s.delay > 0)
            continue;

        s.dead = true;

        if(s.team === "p")
            explode(state, s.x, s.y, s.r, s.dmg, {pid: s.pid, crit: s.crit});
        else
            explode(state, s.x, s.y, s.r, 0, {team: "e", playerDmg: s.dmg, look: s.look});

        // a fireball leaves the ground burning
        if(s.zone)
            addZone(state, s.zone.kind, s.x, s.y, s.zone.r, s.zone.life);

    }

    state.strikes = state.strikes.filter(s => !s.dead);

}


// boss lasers: a warning line, then a deadly one that may sweep
export function updateLasers(state, dt){

    if(!state.lasers.length)
        return;

    for(const l of state.lasers){

        const owner = state.enemies.find(e => e.id === l.owner);

        if(!owner || owner.dead){

            l.dead = true;

            continue;

        }

        if(l.warn > 0){

            l.warn -= dt;

            continue;

        }

        l.live -= dt;
        l.angle += l.spin * dt;

        if(l.live <= 0){

            l.dead = true;

            continue;

        }

        l.x = owner.x;
        l.y = owner.y;
        l.length = castRay(state.map, l.x, l.y, l.angle, l.reach ?? 900).length;

        for(const p of state.players){

            if(!p.dead && segmentDistance(l.x, l.y, l.angle, l.length, p).distance < (l.width ?? 7) + p.r * 0.6)
                damagePlayer(state, p, 1);

        }

    }

    state.lasers = state.lasers.filter(l => !l.dead);

}
