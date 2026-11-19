import {PATH, WIDTH} from "./map.js";
import {buildWave, topLayers} from "./waves.js";
import {hpAt} from "./economy.js";
import {
    ENEMIES,
    BASE_SPEED,
    LAYER_SPEED,
    LAYER_RADIUS,
    LAYER_COLORS,
    ARMOR_RESIST,
    ENEMY_ATTACK,
    TOWERS,
    PROJECTILE_SPEED,
    CHAIN_RANGE,
    PIERCE_RANGE,
    BURN_TIME,
    STUN_IMMUNE,
    MAX_SHOTS,
    START_DELAY,
    CLEAR_PAUSE,
    FAIL_PAUSE
} from "./data.js";


const GUARD_GAP = 16;           // spacing of guards along the path
const ENGAGE = 8;               // how close a balloon must be for a guard to block it
const GUARD_HEAL = 0.15;        // share of health an idle guard recovers per second
const MAX_EFFECTS = 260;

const point = {x: 0, y: 0, dx: 0, dy: 0};

// what a hit is: tower stats have the same two fields
const GUARD_HIT = {heavy: true, gold: 1};


// The fight on the field. Pure logic (no DOM), so it also runs headless.
//
// options:
//   getStats()           folded stats (economy.battleStats), cached by the game
//   getTowers()          placed towers: [{id, type, x, y, target}]
//   getRally()           where guards stand, as a share of the path
//   getSpawnScale(wave)  1 = normal spawn pace, 0.5 = twice as fast
//   onPop(layers)        balloons lost `layers` layers (the game pays the gold)
//   onEnd(cleared, wave, plan) -> the next wave to play
//
// Effects (pops, rings, bolts) are only recorded while state.visual is on.
export function createBattle({getStats, getTowers, getRally, getSpawnScale, onPop, onEnd}){

    const enemies = [];
    const projectiles = [];
    const effects = [];
    const guards = [];
    const towers = [];

    const state = {
        wave: 1,
        theme: "",              // "boss", "rush", "armored" or ""
        phase: "run",           // "run" | "clear" | "fail"
        pause: 0,               // seconds left before the next wave
        next: 1,
        lives: 0,
        livesMax: 0,
        spawned: 0,
        total: 0,
        visual: false
    };

    const exclude = new Set();  // scratch set for multi-target attacks

    let stats = getStats();
    let plan = null;
    let time = 0;
    let spawnScale = 1;
    let layerHp = 1;


    /* ---------------- Waves ---------------- */

    function start(wave){

        stats = getStats();
        plan = buildWave(wave);

        layerHp = hpAt(wave);
        spawnScale = getSpawnScale(wave);
        time = -START_DELAY;

        Object.assign(state, {
            wave,
            theme: plan.theme,
            phase: "run",
            spawned: 0,
            total: plan.spawns.length,
            lives: stats.lives,
            livesMax: stats.lives
        });

        enemies.length = 0;
        projectiles.length = 0;

        for(const tower of towers)
            tower.cd = 0;

        for(const guard of guards)
            Object.assign(guard, {alive: true, hp: stats.troops.hp, hpMax: stats.troops.hp, target: null, respawn: 0});

    }


    function finish(cleared){

        state.phase = cleared ? "clear" : "fail";
        state.pause = cleared ? CLEAR_PAUSE : FAIL_PAUSE;
        state.next = onEnd(cleared, state.wave, plan);

        enemies.length = 0;
        projectiles.length = 0;

        for(const guard of guards)
            guard.target = null;

    }


    function step(dt){

        stats = getStats();

        ageEffects(dt);

        if(state.phase !== "run"){

            state.pause -= dt;

            if(state.pause <= 0)
                start(state.next);

            return;

        }

        // Walls bought mid-wave count right away
        if(stats.lives !== state.livesMax){

            state.lives += stats.lives - state.livesMax;
            state.livesMax = stats.lives;

        }

        spawnDue(dt);
        moveEnemies(dt);
        guardsStep(dt);
        towersStep(dt);
        projectilesStep(dt);

        compact(enemies, e => !e.dead);

        if(state.lives <= 0)
            finish(false);
        else if(state.spawned >= state.total && enemies.length === 0)
            finish(true);

    }


    /* ---------------- Balloons ---------------- */

    function spawnDue(dt){

        time += dt;

        const spawns = plan.spawns;

        while(state.spawned < spawns.length && spawns[state.spawned].t * spawnScale <= time){

            const {kind, layers} = spawns[state.spawned++];

            spawn(kind, layers, 0);

        }

    }


    function spawn(kind, layers, s){

        const def = ENEMIES[kind];
        const boss = kind === "boss";

        // early bosses are gentler: the first one is an introduction, not a wall
        const hp = boss
            ? def.hp * layerHp * Math.min(1, 0.35 + state.wave / 50)
            : layerHp;
        const armor = (def.armor ?? 0) * layerHp;

        const enemy = {
            kind, def, boss,
            layers, top: layers,
            hp, hpMax: hp,
            armor, armorMax: armor,
            s, x: 0, y: 0, dx: 1, dy: 0, r: 0,
            slowT: 0, slowF: 0, brittle: 0,
            stunT: 0, stunImmune: 0,
            burn: 0, burnT: 0, burnHit: null,
            regenT: def.regen ?? 0,
            blocker: null,
            pending: 0,             // dart damage already in the air
            dead: false
        };

        resize(enemy);
        place(enemy);

        enemies.push(enemy);

        return enemy;

    }


    function resize(e){

        e.r = e.boss ? e.def.radius : e.def.radius + LAYER_RADIUS * e.layers;

    }


    function place(e){

        PATH.at(e.s, point);

        e.x = point.x;
        e.y = point.y;
        e.dx = point.dx;
        e.dy = point.dy;

    }


    function speedOf(e){

        let speed = BASE_SPEED * e.def.speed;

        if(!e.boss)
            speed *= 1 + LAYER_SPEED * (e.layers - 1);

        if(e.slowT > 0)
            speed *= 1 - (e.boss ? e.slowF / 2 : e.slowF);

        return speed;

    }


    function moveEnemies(dt){

        for(const e of enemies){

            if(e.dead)
                continue;

            if(e.slowT > 0)
                e.slowT -= dt;

            if(e.burnT > 0){

                e.burnT -= dt;

                damage(e, e.burn * dt, e.burnHit);

                if(e.dead)
                    continue;

            }

            // regrows one popped layer at a time
            if(e.def.regen && e.layers < e.top){

                e.regenT -= dt;

                if(e.regenT <= 0){

                    e.layers++;
                    e.hp = layerHp;
                    e.regenT = e.def.regen;

                    resize(e);

                }

            }

            if(e.stunImmune > 0)
                e.stunImmune -= dt;

            if(e.stunT > 0){

                e.stunT -= dt;

                if(e.stunT <= 0)
                    e.stunImmune = STUN_IMMUNE;

                continue;

            }

            if(e.blocker)
                continue;

            e.s += speedOf(e) * dt;

            if(e.s >= PATH.length)
                leak(e);
            else
                place(e);

        }

    }


    // one life per layer left (armor counts as one more), a boss takes them all
    function leak(e){

        e.dead = true;

        state.lives -= e.boss
            ? state.lives
            : e.layers + (e.armor > 0 ? 1 : 0);

        fx("ring", {x: WIDTH - 6, y: e.y, radius: 26, color: "#ff7185", life: 0.5});

    }


    // the remaining health a light hit has to chew through (armor resists it)
    function remaining(e){

        return e.boss
            ? e.hp
            : (e.layers - 1) * layerHp + e.hp + e.armor / ARMOR_RESIST;

    }


    // Overkill carries into the next layer, like a dart that pops several.
    // hit: {heavy, gold}. Heavy hits go through armor at full strength; gold
    // multiplies what the pops pay (a Plunder dart's bonus).
    function damage(e, amount, hit){

        if(e.dead)
            return;

        const heavy = hit.heavy;

        if(e.brittle && e.slowT > 0)
            amount *= 1 + e.brittle;

        if(e.armor > 0){

            const share = heavy ? 1 : ARMOR_RESIST;
            const dealt = amount * share;

            if(dealt < e.armor){

                e.armor -= dealt;

                return;

            }

            amount = (dealt - e.armor) / share;
            e.armor = 0;

            fx("ring", {x: e.x, y: e.y, radius: e.r + 8, color: "#9ca3af", life: 0.3});

        }

        if(e.boss){

            e.hp -= amount * stats.boss;

            if(e.hp <= 0)
                killBoss(e);

            return;

        }

        const color = LAYER_COLORS[e.layers - 1];

        let popped = 0;

        while(e.layers > 0 && amount >= e.hp){

            amount -= e.hp;

            e.layers--;
            e.hp = layerHp;

            popped++;

        }

        if(e.layers > 0)
            e.hp -= amount;

        if(popped === 0)
            return;

        onPop(popped * hit.gold);

        if(e.layers === 0)
            e.dead = true;
        else
            resize(e);

        fx("pop", {x: e.x, y: e.y, radius: e.r, color, life: 0.25});

    }


    // a boss bursts into a handful of the wave's thickest balloons
    function killBoss(e){

        e.dead = true;

        onPop(e.def.gold);

        const top = topLayers(state.wave);

        for(let i = 0; i < e.def.children; i++)
            spawn("pop", top, Math.max(0, e.s - i * 10));

        fx("ring", {x: e.x, y: e.y, radius: 70, color: "#e5e5e5", life: 0.6});

    }


    /* ---------------- Guards ---------------- */

    // keeps one guard per troop and spaces them around the rally point
    function syncGuards(){

        stats = getStats();

        const {count, hp} = stats.troops;

        while(guards.length < count)
            guards.push({s: 0, x: 0, y: 0, hp, hpMax: hp, alive: true, respawn: 0, target: null, cd: 0});

        while(guards.length > count){

            const guard = guards.pop();

            if(guard.target)
                guard.target.blocker = null;

        }

        const centre = getRally() * PATH.length;

        guards.forEach((guard, i) => {

            guard.s = centre + (i - (guards.length - 1) / 2) * GUARD_GAP;

            PATH.at(guard.s, point);

            guard.x = point.x;
            guard.y = point.y;

            // a moved guard lets go of whatever it was holding
            if(guard.target && Math.abs(guard.target.s - guard.s) > ENGAGE * 2){

                guard.target.blocker = null;
                guard.target = null;

            }

        });

    }


    function engageable(guard){

        for(const e of enemies){

            if(!e.dead && !e.blocker && !e.boss && Math.abs(e.s - guard.s) <= ENGAGE)
                return e;

        }

        return null;

    }


    function guardsStep(dt){

        const troops = stats.troops;

        if(guards.length !== troops.count)
            syncGuards();

        for(const guard of guards){

            guard.hpMax = troops.hp;

            if(!guard.alive){

                guard.respawn -= dt;

                if(guard.respawn <= 0){

                    guard.alive = true;
                    guard.hp = troops.hp;

                }

                continue;

            }

            let e = guard.target;

            if(e?.dead)
                e = guard.target = null;

            if(!e){

                e = engageable(guard);

                if(!e){

                    guard.hp = Math.min(troops.hp, guard.hp + troops.hp * GUARD_HEAL * dt);

                    continue;

                }

                guard.target = e;
                guard.cd = troops.interval / 2;

                e.blocker = guard;

            }

            guard.cd -= dt;

            while(guard.cd <= 0 && !e.dead){

                damage(e, troops.dmg, GUARD_HIT);

                guard.cd += troops.interval;

            }

            if(e.dead){

                guard.target = null;

                continue;

            }

            const weight = e.layers + (e.armor > 0 ? e.def.armor : 0);

            guard.hp -= ENEMY_ATTACK * layerHp * weight * dt;

            if(guard.hp <= 0){

                guard.alive = false;
                guard.respawn = troops.respawn;
                guard.target = null;

                e.blocker = null;

                fx("ring", {x: guard.x, y: guard.y, radius: 14, color: "#888", life: 0.4});

            }

        }

    }


    /* ---------------- Towers ---------------- */

    // rebuilds the towers from the save, keeping cooldown and aim of towers
    // that are still there; stats come folded per tower (paths differ).
    // Ids restart after ascending or a reload, so a tower is only reused
    // when its type and spot match too.
    function syncTowers(){

        stats = getStats();

        const old = new Map(towers.map(tower => [tower.id, tower]));

        towers.length = 0;

        for(const {id, type, x, y, target, paths} of getTowers()){

            const previous = old.get(id);

            const tower = previous?.type === type && previous.x === x && previous.y === y
                ? previous
                : {id, type, x, y, cd: 0, kick: 0, angle: -Math.PI / 2};

            tower.target = target;
            tower.paths = paths;
            tower.stats = stats.towers.get(id);

            towers.push(tower);

        }

    }


    function towersStep(dt){

        for(const tower of towers){

            const s = tower.stats;

            if(!s)
                continue;

            tower.cd -= dt;
            tower.kick = Math.max(0, tower.kick - dt * 8);

            for(let shots = 0; tower.cd <= 0; shots++){

                if(shots >= MAX_SHOTS || !FIRE[tower.type](tower, s)){

                    tower.cd = Math.max(tower.cd, 0);

                    break;

                }

                tower.cd += 1 / s.rate;
                tower.kick = 1;         // recoil, for the renderer

            }

        }

    }


    const inRange = (tower, e, range) => {

        const reach = range + e.r;

        return (e.x - tower.x) ** 2 + (e.y - tower.y) ** 2 <= reach * reach;

    };


    // best balloon for a target mode, skipping `exclude` and anything off-screen;
    // with `usePending`, also skips balloons already doomed by darts in the air
    function pick(tower, range, mode, usePending){

        let best = null;
        let bestScore = -Infinity;
        let bestS = 0;

        for(const e of enemies){

            if(e.dead || e.x < 0 || e.x > WIDTH || exclude.has(e) || !inRange(tower, e, range))
                continue;

            const left = remaining(e);

            if(usePending && e.pending >= left)
                continue;

            const score =
                mode === "first" ? e.s :
                mode === "last" ? -e.s :
                mode === "strong" ? left :
                -((e.x - tower.x) ** 2 + (e.y - tower.y) ** 2);

            if(score > bestScore || (score === bestScore && e.s > bestS)){

                best = e;
                bestScore = score;
                bestS = e.s;

            }

        }

        return best;

    }


    function nearestFree(x, y, range){

        let best = null;
        let bestD2 = range * range;

        for(const e of enemies){

            if(e.dead || exclude.has(e))
                continue;

            const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;

            if(d2 <= bestD2){

                best = e;
                bestD2 = d2;

            }

        }

        return best;

    }


    const aim = (tower, e) =>
        tower.angle = Math.atan2(e.y - tower.y, e.x - tower.x);


    // A tower hit: slow, stun and burn land first (so brittle counts on the
    // very hit that slows), then the damage. Bosses shrug off stuns.
    function strike(e, amount, s){

        if(s.slow > 0){

            e.slowF = e.slowT > 0 ? Math.max(e.slowF, s.slow) : s.slow;
            e.slowT = Math.max(e.slowT, s.slowTime);
            e.brittle = Math.max(e.brittle, s.brittle);

        }

        if(s.stun > 0 && !e.boss && e.stunImmune <= 0)
            e.stunT = Math.max(e.stunT, s.stun);

        if(s.burn > 0 && amount * s.burn >= e.burn * (e.burnT > 0)){

            e.burn = amount * s.burn;
            e.burnT = BURN_TIME;
            e.burnHit = s;

        }

        damage(e, e.boss ? amount * s.boss : amount, s);

    }


    // hits everything in range; returns false when nothing was there
    function pulse(tower, s, color){

        let hit = false;

        for(const e of enemies){

            if(e.dead || !inRange(tower, e, s.range))
                continue;

            hit = true;

            strike(e, s.dmg, s);

        }

        if(hit)
            fx("ring", {x: tower.x, y: tower.y, radius: s.range, color, life: 0.35});

        return hit;

    }


    // each returns whether the tower found something to shoot
    const FIRE = {

        dart: (tower, s) =>
            volley(tower, s, "dart"),

        cannon: (tower, s) =>
            volley(tower, s, "cannon"),

        frost: (tower, s) =>
            pulse(tower, s, TOWERS.frost.color),

        nova: (tower, s) =>
            pulse(tower, s, TOWERS.nova.color),

        sniper(tower, s){

            exclude.clear();

            for(let i = 0; i <= s.pierce; i++){

                const e = pick(tower, s.range, tower.target, false);

                if(!e)
                    break;

                if(i === 0)
                    aim(tower, e);

                exclude.add(e);

                fx("line", {x1: tower.x, y1: tower.y, x2: e.x, y2: e.y, color: TOWERS.sniper.color, life: 0.15});

                strike(e, s.dmg, s);

            }

            return exclude.size > 0;

        },

        tesla(tower, s){

            exclude.clear();

            let e = pick(tower, s.range, tower.target, false);

            if(!e)
                return false;

            aim(tower, e);

            const points = state.visual ? [tower.x, tower.y] : null;

            let dmg = s.dmg;

            for(let jump = 0; jump <= s.chain && e; jump++){

                exclude.add(e);

                points?.push(e.x, e.y);

                strike(e, dmg, s);

                dmg *= s.falloff;

                e = nearestFree(e.x, e.y, CHAIN_RANGE);

            }

            fx("bolt", {points, color: TOWERS.tesla.color, life: 0.18});

            return true;

        }

    };


    // one projectile at each of `targets` different balloons (darts skip
    // balloons that darts already in the air will finish)
    function volley(tower, s, kind){

        exclude.clear();

        for(let i = 0; i < s.targets; i++){

            const e = pick(tower, s.range, tower.target, kind === "dart");

            if(!e)
                break;

            exclude.add(e);

            launch(tower, e, s, kind);

        }

        return exclude.size > 0;

    }


    /* ---------------- Projectiles ---------------- */

    function launch(tower, e, s, kind){

        aim(tower, e);

        if(kind === "dart")
            e.pending += s.dmg;

        projectiles.push({
            kind,
            x: tower.x,
            y: tower.y,
            tx: e.x,
            ty: e.y,
            target: e,
            s,
            dmg: s.dmg,
            speed: PROJECTILE_SPEED[kind],
            done: false
        });

    }


    // homing; a dart whose balloon is gone flies on to the spot and fizzles
    function projectilesStep(dt){

        for(const p of projectiles){

            const e = p.target;
            const alive = !e.dead;

            if(alive){

                p.tx = e.x;
                p.ty = e.y;

            }

            const dx = p.tx - p.x;
            const dy = p.ty - p.y;
            const distance = Math.hypot(dx, dy);
            const travel = p.speed * dt;

            if(distance > travel + (alive ? e.r / 2 : 0)){

                p.x += dx / distance * travel;
                p.y += dy / distance * travel;

                continue;

            }

            p.done = true;

            if(p.kind === "dart"){

                e.pending -= p.dmg;

                if(alive){

                    strike(e, p.dmg, p.s);

                    pierce(e, p);

                }

            }
            else
                explode(p.tx, p.ty, p);

        }

        compact(projectiles, p => !p.done);

    }


    // a piercing dart carries on into the balloons right behind its target
    function pierce(target, p){

        if(p.s.pierce < 1)
            return;

        exclude.clear();
        exclude.add(target);

        for(let i = 0; i < p.s.pierce; i++){

            const e = nearestFree(p.tx, p.ty, PIERCE_RANGE);

            if(!e)
                break;

            exclude.add(e);

            strike(e, p.dmg, p.s);

        }

    }


    function explode(x, y, p){

        const radius = p.s.splash;

        for(const e of enemies){

            if(e.dead)
                continue;

            const reach = radius + e.r;

            if((e.x - x) ** 2 + (e.y - y) ** 2 <= reach * reach)
                strike(e, p.dmg, p.s);

        }

        fx("ring", {x, y, radius, color: TOWERS.cannon.color, life: 0.3});

    }


    /* ---------------- Effects ---------------- */

    function fx(kind, props){

        if(state.visual && effects.length < MAX_EFFECTS)
            effects.push({kind, t: 0, ...props});

    }


    function ageEffects(dt){

        if(!effects.length)
            return;

        for(const effect of effects)
            effect.t += dt;

        compact(effects, effect => effect.t < effect.life);

    }


    function setVisual(on){

        state.visual = on;

        if(!on)
            effects.length = 0;

    }


    return {
        state,
        enemies,
        projectiles,
        effects,
        guards,
        towers,
        start,
        step,
        syncTowers,
        syncGuards,
        setVisual
    };

}


// removes items in place (no new arrays in the hot loop)
function compact(list, keep){

    let kept = 0;

    for(const item of list){

        if(keep(item))
            list[kept++] = item;

    }

    list.length = kept;

}
