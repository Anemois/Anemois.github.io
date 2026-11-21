import {TILE, PLAYER, CRIT_MULTIPLIER, SHARD_DROP, ENEMIES} from "./data.js";
import {hitCrate, tileAt, CRATE} from "./map.js";
import {near} from "./grid.js";
import {addZone} from "./ground.js";
import {makeEnemy} from "./enemies.js";

const RISE_TIME = 3.2;          // a fallen skeleton lies this long before it gets up


// Shared rules every system uses: events, ids, finding things, damage.
// The simulation never touches the page; what the screen needs to show
// (hits, deaths, loot) goes out as events.

export function emit(state, type, data){

    const event = data ?? {};

    event.type = type;

    state.events.push(event);

}

export const newId = state =>
    state.nextId++;


// enemies that can be hit (not still appearing, not out of reach)
export const isActive = e =>
    !e.dead && e.spawn <= 0 && !e.hidden;


// the closest hittable enemy within range; `skip` is a list of ids to pass over
export function nearestEnemy(state, from, range, skip = null){

    let best = null;
    let bestD = range * range;

    for(const e of near(state.grid, from.x, from.y, range)){

        if(!isActive(e) || (skip && skip.includes(e.id)))
            continue;

        const d = (e.x - from.x) ** 2 + (e.y - from.y) ** 2;

        if(d < bestD){

            best = e;
            bestD = d;

        }

    }

    return best;

}


export function addProp(state, kind, x, y, extra){

    const prop = {id: newId(state), kind, x, y, ...extra};

    state.props.push(prop);

    return prop;

}


/* ---------------- Pickups ---------------- */

export function dropPickup(state, kind, x, y, value){

    const angle = state.rng.range(0, Math.PI * 2);
    const speed = state.rng.range(60, 160);

    state.pickups.push({
        id: newId(state),
        kind,
        x,
        y,
        r: 4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        value,
        age: 0
    });

}


/* ---------------- Damage ---------------- */

// Hurts a player: shield first, then health, then a moment of safety.
// Dashing players and the lobby are safe. Returns true if it landed.
export function damagePlayer(state, p, amount){

    if(p.dead || p.hurt > 0 || p.dashT > 0 || state.mode !== "run")
        return false;

    const absorbed = Math.min(p.shield, amount);

    p.shield -= absorbed;
    p.hp = Math.max(0, p.hp - (amount - absorbed));
    p.hurt = PLAYER.hurtTime;
    p.shieldWait = 0;
    p.shieldTick = 0;

    emit(state, "hurt", {pid: p.id, x: p.x, y: p.y, shield: absorbed === amount});

    if(p.hp <= 0){

        p.dead = true;
        p.loot = null;
        p.beam = null;
        p.charge = -1;
        p.revive = 0;

        emit(state, "down", {pid: p.id, x: p.x, y: p.y});

    }

    return true;

}


// Hurts an enemy. `crit` is a chance; `knock` an angle to push it along.
// Sleeping enemies wake up (and the blow that wakes them always crits).
// Dummies keep a log instead of losing health.
// `shot`: a bullet's own hit (a guest's machine already showed the impact)
// knocks an enemy back (big ones move less)
export function shove(e, angle, push){

    const scale = push / Math.sqrt(e.r / 12);

    e.kx += Math.cos(angle) * scale;
    e.ky += Math.sin(angle) * scale;

}


export function damageEnemy(state, e, amount, {pid = null, crit = 0, knock = null, push = 90, kind = "hit", shot = false} = {}){

    if(!isActive(e))
        return false;

    const ambush = e.asleep && kind === "hit";
    const critical = ambush || (crit > 0 && state.rng.chance(crit));
    const dmg = amount * (critical ? CRIT_MULTIPLIER : 1);

    e.flash = 0.08;

    // (fields left undefined are left out of what is sent)
    emit(state, "hit", {id: e.id, pid: pid ?? undefined, shot: shot || undefined, x: e.x, y: e.y, r: e.r, dmg, crit: critical, kind, angle: knock, color: e.color});

    const player = pid === null ? null : state.players.find(p => p.id === pid);

    if(player)
        player.dealt += dmg;

    if(e.dummy){

        e.log.push([state.time, dmg]);

        return true;

    }

    if(e.asleep)
        state.alarms.push(e);

    if(knock !== null && !e.boss)
        shove(e, knock, push);

    e.hp -= dmg;

    if(e.hp <= 0)
        killEnemy(state, e, player);

    return true;

}


// `final`: no getting back up (its summoner died, or it fell off the map)
export function killEnemy(state, e, player = null, {final = false} = {}){

    if(e.dead)
        return;

    // a skeleton falls apart, and soon pulls itself together again
    if(e.lives > 0 && !final){

        e.lives--;
        e.hidden = true;
        e.mode = "bones";
        e.modeT = RISE_TIME;
        e.kx = e.ky = 0;
        e.burnT = 0;
        e.slowT = 0;

        emit(state, "collapse", {id: e.id, x: e.x, y: e.y, r: e.r, color: e.color});

        return;

    }

    e.dead = true;
    e.hp = 0;

    emit(state, "death", {id: e.id, x: e.x, y: e.y, r: e.r, color: e.color, boss: Boolean(e.boss), big: e.elite, kind: e.type});

    if(player)
        player.kills++;

    if(state.run)
        state.run.kills++;

    const def = ENEMIES[e.type];

    // a bomber goes off however it dies (and only shoves its friends);
    // a boomshroom leaves a cloud of spores where it stood
    if(e.ai === "bomber"){

        explode(state, e.x, e.y, 64, e.bombDmg, {team: "both", allies: 0, look: def?.cloud ? "spore" : "fire"});

        if(def?.cloud)
            addZone(state, "spore", e.x, e.y, 58, 3.5);

    }

    // an ember imp bursts into a patch of fire
    if(e.ai === "ember")
        addZone(state, "fire", e.x, e.y, 30, 2.5);

    // a slime breaks into little ones
    for(let i = 0; i < e.splits; i++){

        const angle = (i / e.splits) * Math.PI * 2 + state.rng.range(0, 1);
        const little = makeEnemy(state, "slimelet", e.x + Math.cos(angle) * 6, e.y + Math.sin(angle) * 6, {minion: true, spawn: 0});

        little.alert = 0.25;

        shove(little, angle, 200);

        state.enemies.push(little);

    }

    // whatever it raised or summoned goes with it
    if(state.enemies.some(other => other.owner === e.id))
        for(const other of state.enemies)
            if(other.owner === e.id)
                killEnemy(state, other, null, {final: true});

    state.lasers = state.lasers.filter(l => l.owner !== e.id);

    if(e.minion)
        return;

    const rng = state.rng;

    if(e.boss){

        for(let i = 0; i < 24; i++)
            dropPickup(state, "energy", e.x, e.y, 6);

        for(let i = 0; i < 10; i++)
            dropPickup(state, "shard", e.x, e.y, shardValue(state) * 2);

        state.run.bosses++;
        state.bossDown = {x: e.x, y: e.y};

        emit(state, "bossDown", {x: e.x, y: e.y, name: e.name});

        return;

    }

    const orbs = rng.int(1, 3) + (e.elite ? 3 : 0);

    for(let i = 0; i < orbs; i++)
        dropPickup(state, "energy", e.x, e.y, 3);

    if(rng.chance(e.elite ? 1 : SHARD_DROP))
        dropPickup(state, "shard", e.x, e.y, shardValue(state) * (e.elite ? 3 : 1));

    if(rng.chance(e.elite ? 0.25 : 0.025))
        dropPickup(state, "heart", e.x, e.y, 1);

    // champions carry a chest
    if(e.champion){

        addProp(state, "chest", e.x, e.y, {source: "chest", opened: []});

        emit(state, "chestDrop", {x: e.x, y: e.y});

    }

}


export const shardValue = state =>
    1 + Math.floor((state.floor - 1) / 3);


// area damage. team: "p" hurts enemies, "e" hurts players, "both" both
// `shot`: a bullet's own blast (a guest's machine already showed it)
// team: "p" (hurts enemies), "e" (hurts players) or "both". `allies`:
// how much of `dmg` a "both" blast does to enemies (0 = it only shoves
// them: a bomber should not wipe out its own pack). `look` picks how the
// blast is drawn ("fire", "bone", "void"...).
export function explode(state, x, y, radius, dmg, {team = "p", pid = null, crit = 0, playerDmg = 2, shot = false, allies = 1, look} = {}){

    if(team !== "e"){

        const share = team === "both" ? allies : 1;

        // copied: hurting things can kill, which may set off more blasts
        for(const e of near(state.grid, x, y, radius).slice()){

            if(!isActive(e) || Math.hypot(e.x - x, e.y - y) >= radius + e.r)
                continue;

            const angle = Math.atan2(e.y - y, e.x - x);

            if(share > 0)
                damageEnemy(state, e, dmg * share, {pid, crit, knock: angle, push: 160, kind: "boom"});
            else if(!e.boss)
                shove(e, angle, 160);

        }

    }

    if(team !== "p"){

        for(const p of state.players){

            if(Math.hypot(p.x - x, p.y - y) < radius + p.r * 0.6)
                damagePlayer(state, p, playerDmg);

        }

    }

    breakCrates(state, x, y, radius);

    emit(state, "boom", {x, y, r: radius, team, pid: pid ?? undefined, shot: shot || undefined, look});

}


export function breakCrates(state, x, y, radius){

    const map = state.map;
    const reach = Math.ceil(radius / TILE);
    const cx = Math.floor(x / TILE);
    const cy = Math.floor(y / TILE);

    for(let ty = cy - reach; ty <= cy + reach; ty++){

        for(let tx = cx - reach; tx <= cx + reach; tx++){

            if(tileAt(map, tx, ty) !== CRATE)
                continue;

            if(Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) < radius + TILE / 2)
                smashCrate(state, tx, ty, 3);

        }

    }

}


// `hits` blows on a crate; a broken crate sometimes leaves energy
export function smashCrate(state, tx, ty, hits = 1){

    const x = (tx + 0.5) * TILE;
    const y = (ty + 0.5) * TILE;

    for(let i = 0; i < hits; i++){

        if(!hitCrate(state.map, tx, ty))
            continue;

        emit(state, "crate", {x, y, tile: ty * state.map.w + tx});

        if(state.mode === "run" && state.rng.chance(0.3))
            dropPickup(state, "energy", x, y, 4);

        return;

    }

    emit(state, "crateHit", {x, y, tile: ty * state.map.w + tx, left: state.map.crates.get(ty * state.map.w + tx)});

}


/* ---------------- Enemy bullets ---------------- */

// `from` fires from another point than the enemy (bullet walls). An arrow
// is a thin, straight shot that a melee swing cannot knock away (orbs it
// can): the only answers are to step aside or dash through it.
export function enemyBullet(state, e, angle, speed, {r = 5, dmg = 1, life = 5, homing = 0, color = 0, from = null, arrow = false} = {}){

    const scale = Math.min(1.4, 1 + (state.floor - 1) * 0.02);
    const start = from ?? {x: e.x + Math.cos(angle) * e.r * 0.8, y: e.y + Math.sin(angle) * e.r * 0.8};

    state.bullets.push({
        id: newId(state),
        team: "e",
        x: start.x,
        y: start.y,
        vx: Math.cos(angle) * speed * scale,
        vy: Math.sin(angle) * speed * scale,
        r,
        dmg,
        life,
        homing,
        pierce: 0,
        bounce: 0,
        explode: 0,
        hits: null,
        age: 0,
        dead: false,
        tint: color,
        kind: arrow ? "arrow" : null
    });

}


// n bullets evenly round a circle, starting at `offset`
export function ring(state, e, n, speed, offset = 0, options = {}){

    for(let i = 0; i < n; i++)
        enemyBullet(state, e, offset + (i / n) * Math.PI * 2, speed, options);

}
