import {STEP, TILE, PLAYER} from "../sim/data.js";
import {movePlayer, switchSlot} from "../sim/sim.js";
import {trigger, coolDown, extraFor, pelletAngles, SWING_TIME, MUZZLE, HOMING_RANGE} from "../sim/combat.js";
import {boomerang, turnBack, shards} from "../sim/flight.js";
import {weaponStats} from "../sim/loot.js";
import {castRay, segmentDistance, angleDiff, clamp, DEG} from "../sim/physics.js";
import {blocksAt} from "../sim/map.js";
import {isActive} from "../sim/world.js";
import {hashText} from "../sim/rng.js";


// Your own character on a guest's machine: it moves and shoots the moment
// you press a key, without waiting to hear from the host.
//
// Every input is numbered and used here at once with the same code the
// host runs (movePlayer, and trigger() for when a weapon goes off), in the
// same order: aim, walk, swap, weapon. The host says which input it has
// reached and exactly how your body and weapon stood then; the guess
// starts again from there and replays the inputs the host has not used
// yet, so it only differs when something really happened (a wall broke,
// you were knocked back). A difference in where you stand fades in.
//
// Shots are drawn here too, as "flyers": your bullets as this machine
// sees them, ahead of the host's copies (which are not drawn for you).
// Their scatter comes from how many shots you have fired, which both
// machines know, so they fly where the host's do. They stop at walls and
// at the enemies you can see; hit numbers still come from the host.
//
// An enemy you hit on this screen flashes and flinches at once, too. Only
// the look: how much it lost, and whether it died, wait for the host (it
// knows about crits, shields and who got there first), so nothing shown
// here ever has to be taken back.

const FADE = 14;                // a correction of your position fades at this rate (1/s)
const JUMP = 120;               // a correction bigger than this is a jump: no fading
const MAX_FLYERS = 300;
const MAX_PENDING = 600;        // inputs kept for replaying (10 s)
const FLINCH = 0.12;            // how long a hit enemy flashes here, seconds
const FLINCH_PUSH = 3.5;        // ...and how far it jerks back


export function createPredictor(){

    // the body and the hands, shaped like a player so sim code can use it
    const me = {
        x: 0, y: 0, r: PLAYER.radius,
        dashT: 0, dashCd: 0, dashX: 0, dashY: 0, moving: false,
        aim: 0,
        aimX: 0,
        aimY: 0,
        weapons: [],
        slot: 0,
        energy: 0,
        reload: 0, spin: 0, cool: [0, 0], burst: 0, burstT: 0, charge: -1, beam: null, swing: null,
        shots: 0,
        held: {fire: false, dash: false, swap: false}
    };

    const pending = [];             // {seq, intent} the host has not used yet
    const flyers = [];
    const born = [];                // shards made while flyers move, added after
    const events = [];              // what our own hands did, for the screen
    const struck = new Map();       // enemy id -> {t, angle}: hit on this screen just now

    let id = null;
    let key = 0;
    let world = null;               // {map, mine, lobby, enemies} while working
    let live = false;               // false while replaying (nothing to show)
    let seq = 0;
    let swing = null;               // the swing being drawn
    let fadeX = 0;
    let fadeY = 0;
    let placed = false;
    let flyerId = 0;


    function setId(value){

        id = value;
        key = hashText(value);

    }


    // can our hands and feet do anything right now?
    const usable = mine =>
        Boolean(mine) && !mine.dead && !mine.loot;


    /* ---- one input ---- */

    // the host's way of paying for a shot, on our guess of the tank
    function pay(cost){

        if(cost <= 0)
            return true;

        if(me.energy < cost)
            return false;

        me.energy -= cost;

        return true;

    }

    let held = null;                // the weapon in hand while trigger() runs

    const act = {
        pay,

        shoot(){

            me.shots++;

            if(live)
                shootNow(held);

        },

        swing(){

            if(live)
                swingNow(held);

        },

        release(power){

            if(live)
                releaseNow(held, power);

        },

        beam(){

            me.beam = true;

        }
    };


    // aim, walk, swap, weapon: the order sim.js uses for each input
    function run(intent){

        const mine = world.mine;

        me.weapons = mine.weapons;
        me.aim = Math.atan2(intent.aimY - me.y, intent.aimX - me.x);
        me.aimX = intent.aimX;
        me.aimY = intent.aimY;

        if(movePlayer(world.map, me, intent, STEP, intent.dash && !me.held.dash, world.zones) && live)
            events.push({type: "dash", pid: id, x: me.x, y: me.y});

        if(intent.swap && !me.held.swap && mine.weapons.length > 1){

            switchSlot(me, 1 - me.slot);

            if(live)
                swing = null;

        }

        // the host tops the tank up a little every step of a run
        me.energy = world.lobby
            ? mine.maxEnergy
            : Math.min(mine.maxEnergy, me.energy + PLAYER.energyRegen * STEP);

        coolDown(me, STEP);

        const item = mine.weapons[me.slot];

        if(item){

            held = weaponStats(item, world.lobby);

            trigger(me, held, intent.fire, STEP, act);

        }
        else{

            me.beam = null;

        }

        me.held.fire = intent.fire;
        me.held.dash = intent.dash;
        me.held.swap = intent.swap;

    }


    // One input on this machine, at once (call once per simulation step,
    // in order). Returns nothing; what it showed is collected by take().
    function input(number, intent, at){

        seq = number;

        pending.push({seq: number, intent});

        // (the host has not answered for ages: it is gone or asleep)
        if(pending.length > MAX_PENDING)
            pending.shift();

        if(!placed || !usable(at.mine))
            return;

        world = at;
        live = true;

        run(intent);

        live = false;
        world = null;

    }


    // The host's word on us after input `ack` (snapshot.Y): start from
    // there and replay what it has not used yet.
    function correct(Y, ack, at, jumped){

        while(pending.length && pending[0].seq <= ack)
            pending.shift();

        const wasX = me.x + fadeX;
        const wasY = me.y + fadeY;

        me.x = Y.x;
        me.y = Y.y;
        me.dashT = Y.dt;
        me.dashCd = Y.dc;
        me.dashX = Y.dx;
        me.dashY = Y.dy;
        me.held.dash = Y.h;

        // older hosts send only the body
        if(Y.sl !== undefined){

            me.slot = Y.sl;
            me.energy = Y.en;
            me.reload = Y.rl;
            me.spin = Y.sp ?? 0;
            me.cool = [0, 0];
            me.cool[1 - Y.sl] = Y.co ?? 0;
            me.burst = Y.bu;
            me.burstT = Y.bt;
            me.charge = Y.ch;
            me.beam = Y.bm ? true : null;
            me.shots = Y.sh;
            me.held.fire = Y.hf;
            me.held.swap = Y.hs;

        }

        if(usable(at.mine)){

            world = at;

            for(const {intent} of pending)
                run(intent);

            world = null;

        }

        // keep showing where we were drawn and fade into the new answer,
        // unless it is a real jump (a portal, a new floor) or the first word
        const off = Math.hypot(wasX - me.x, wasY - me.y);

        if(jumped || !placed || off > JUMP){

            fadeX = fadeY = 0;

            if(jumped)
                flyers.length = 0;

        }
        else{

            fadeX = wasX - me.x;
            fadeY = wasY - me.y;

        }

        placed = true;

    }


    /* ---- what our hands did ---- */

    function shotEvent(s, power){

        const reach = me.r + 14;

        events.push({
            type: "shot",
            pid: id,
            x: me.x + Math.cos(me.aim) * reach,
            y: me.y + Math.sin(me.aim) * reach,
            angle: me.aim,
            weapon: s.id,
            power
        });

    }


    function shootNow(s){

        for(const offset of pelletAngles(s, key, me.shots, angles))
            addFlyer(s, me.aim + offset, extraFor(world.map, me, s, me.aim + offset));

        shotEvent(s);

    }


    function swingNow(s){

        const range = s.range + me.r;

        swing = {t: SWING_TIME, dur: SWING_TIME, angle: me.aim, arc: s.arc * DEG, range, weapon: s.id};

        // whatever it sweeps through flinches now
        for(const e of world.enemies){

            if(isActive(e) && Math.hypot(e.x - me.x, e.y - me.y) < range + e.r && Math.abs(angleDiff(me.aim, Math.atan2(e.y - me.y, e.x - me.x))) < s.arc * DEG / 2 + 0.2)
                strike(e, Math.atan2(e.y - me.y, e.x - me.x));

        }

        if(s.shock){

            events.push({
                type: "shock",
                pid: id,
                x: me.x + Math.cos(me.aim) * range * 0.75,
                y: me.y + Math.sin(me.aim) * range * 0.75,
                r: s.shock,
                weapon: s.id
            });

        }

        if(s.wave)
            addFlyer({...s, speed: 470, size: 15, life: 0.5, pierce: 99}, me.aim, {kind: "slash"});

    }


    function releaseNow(s, power){

        const full = power >= 1;

        if(s.rail){

            const ray = castRay(world.map, me.x, me.y, me.aim, s.rail);

            for(const e of world.enemies)
                if(isActive(e) && segmentDistance(me.x, me.y, me.aim, ray.length, e).distance < e.r + 6)
                    strike(e, me.aim);

            events.push({
                type: "rail",
                pid: id,
                x1: me.x,
                y1: me.y,
                x2: me.x + Math.cos(me.aim) * ray.length,
                y2: me.y + Math.sin(me.aim) * ray.length,
                weapon: s.id,
                width: full ? 10 : 6
            });

        }
        else if(!s.rain && !s.storm){

            const speed = s.speed * (0.55 + 0.45 * power);

            addFlyer(s, me.aim, {
                vx: Math.cos(me.aim) * speed,
                vy: Math.sin(me.aim) * speed,
                pierce: (s.pierce ?? 0) + (full ? 1 : 0),
                kind: "arrow"
            });

        }

        // (falling stars come from the host: they take a moment to land anyway)
        shotEvent(s, power);

    }


    /* ---- flyers ---- */

    const angles = [];

    function addFlyer(s, angle, extra){

        if(flyers.length >= MAX_FLYERS)
            return;

        const muzzle = me.r + MUZZLE;

        const f = {
            id: "f" + ++flyerId,
            team: "p",
            weapon: s.id,
            kind: null,
            x: me.x + Math.cos(angle) * muzzle,
            y: me.y + Math.sin(angle) * muzzle,
            vx: Math.cos(angle) * s.speed,
            vy: Math.sin(angle) * s.speed,
            r: s.size,
            life: s.life,
            pierce: s.pierce ?? 0,
            bounce: s.bounce ?? 0,
            explode: s.explode ?? 0,
            homing: s.homing ?? 0,
            pull: s.pull ?? 0,
            burn: s.burn ?? 0,
            split: s.split ?? null,
            dmg: 1,
            lob: 0,
            hits: null,
            t: seq,                 // our time it has been moved up to, in steps
            dead: false
        };

        if(extra)
            Object.assign(f, extra);

        // the host moves a bullet in the step it was fired
        fly(f, STEP, world.map, world.enemies);

        f.t = seq;

        if(!f.dead)
            flyers.push(f);

        hatch(seq);

    }


    // the pieces a splitting flyer broke into, as flyers of their own
    function breakUp(f, x, y, heading, skip = null){

        for(const shard of shards({...f, x, y}, heading)){

            born.push({...shard, id: "f" + ++flyerId, team: "p", weapon: f.weapon, pull: 0, burn: 0, hits: skip === null ? null : [skip], dead: false});

        }

    }


    function hatch(now){

        for(const f of born.splice(0)){

            f.t = now;

            if(flyers.length < MAX_FLYERS)
                flyers.push(f);

        }

    }


    // moves a flyer like combat.js moves a bullet, minus the damage
    function fly(f, dt, map, enemies){

        f.life -= dt;

        if(f.life <= 0){

            f.dead = true;

            if(f.explode){

                events.push({type: "boom", x: f.x, y: f.y, r: f.explode, team: "p"});

                if(f.split)
                    breakUp(f, f.x, f.y, Math.atan2(f.vy, f.vx));

            }

            return;

        }

        // in the air over everything until it lands
        if(f.lob){

            f.x += f.vx * dt;
            f.y += f.vy * dt;

            return;

        }

        if(f.range && boomerang(f, me, dt)){

            f.dead = true;

            return;

        }

        if(f.homing)
            steer(f, dt, enemies);

        const speed = Math.hypot(f.vx, f.vy);
        const steps = Math.max(1, Math.ceil(speed * dt / 6));

        for(let i = 0; i < steps; i++){

            const ox = f.x;
            const oy = f.y;

            f.x += f.vx * dt / steps;
            f.y += f.vy * dt / steps;

            const tx = Math.floor(f.x / TILE);
            const ty = Math.floor(f.y / TILE);

            if(!f.back && blocksAt(map, tx, ty)){

                const angle = Math.atan2(f.vy, f.vx);

                if(f.range){

                    f.x = ox;
                    f.y = oy;

                    turnBack(f);

                    events.push({type: "spark", x: ox, y: oy, angle, weapon: f.weapon});

                    continue;

                }

                if(f.bounce > 0){

                    const flipX = blocksAt(map, tx, Math.floor(oy / TILE));
                    const flipY = blocksAt(map, Math.floor(ox / TILE), ty);

                    if(flipX || !flipY)
                        f.vx = -f.vx;

                    if(flipY || !flipX)
                        f.vy = -f.vy;

                    f.x = ox;
                    f.y = oy;
                    f.bounce--;
                    f.hits = null;

                    events.push({type: "spark", x: ox, y: oy, angle, weapon: f.weapon});

                    continue;

                }

                f.dead = true;

                events.push(f.explode
                    ? {type: "boom", x: ox, y: oy, r: f.explode, team: "p"}
                    : {type: "spark", x: ox, y: oy, angle, weapon: f.weapon});

                if(f.split)
                    breakUp(f, ox, oy, angle + Math.PI);

                return;

            }

            if(touch(f, enemies))
                return;

        }

    }


    // an enemy we can see is in the way; true if the flyer is done
    function touch(f, enemies){

        // void orbs pass through everything (they hurt in ticks)
        if(f.pull)
            return false;

        for(const e of enemies){

            if(!isActive(e) || (f.hits && f.hits.includes(e.id)))
                continue;

            const dx = e.x - f.x;
            const dy = e.y - f.y;
            const reach = f.r + e.r;

            if(dx * dx + dy * dy > reach * reach)
                continue;

            if(f.explode){

                f.dead = true;

                events.push({type: "boom", x: f.x, y: f.y, r: f.explode, team: "p"});

                if(f.split)
                    breakUp(f, f.x, f.y, Math.atan2(f.vy, f.vx));

                return true;

            }

            if(f.kind !== "slash")
                events.push({type: "spark", x: f.x, y: f.y, angle: Math.atan2(f.vy, f.vx), weapon: f.weapon});

            strike(e, Math.atan2(f.vy, f.vx));

            if(f.pierce > 0){

                f.pierce--;

                (f.hits ??= []).push(e.id);

                continue;

            }

            f.dead = true;

            if(f.split)
                breakUp(f, f.x, f.y, Math.atan2(f.vy, f.vx), e.id);

            return true;

        }

        return false;

    }


    function steer(f, dt, enemies){

        let target = null;
        let best = HOMING_RANGE * HOMING_RANGE;

        for(const e of enemies){

            if(!isActive(e))
                continue;

            const d = (e.x - f.x) ** 2 + (e.y - f.y) ** 2;

            if(d < best){

                best = d;
                target = e;

            }

        }

        if(!target)
            return;

        const speed = Math.hypot(f.vx, f.vy);
        const heading = Math.atan2(f.vy, f.vx);
        const turn = clamp(angleDiff(heading, Math.atan2(target.y - f.y, target.x - f.x)), -f.homing * dt, f.homing * dt);

        f.vx = Math.cos(heading + turn) * speed;
        f.vy = Math.sin(heading + turn) * speed;

    }


    /* ---- each frame ---- */

    // Moves flyers and the swing up to `now` (our time in steps, with the
    // part of a step since the last input) and fades any correction.
    function advance(seconds, now, map, enemies){

        const fade = Math.exp(-FADE * seconds);

        fadeX *= fade;
        fadeY *= fade;

        for(const [id, hit] of struck)
            if((hit.t -= seconds) <= 0)
                struck.delete(id);

        if(swing && (swing.t -= seconds) <= 0)
            swing = null;

        let kept = 0;

        for(const f of flyers){

            if(now > f.t){

                fly(f, (now - f.t) * STEP, map, enemies);

                f.t = now;

            }

            if(!f.dead)
                flyers[kept++] = f;

        }

        flyers.length = kept;

        hatch(now);

    }


    // Dresses our player record (from the latest snapshot) with the guess:
    // where we stand, the hands, the tank.
    function show(mine, intent, map, enemies){

        // enemies we just hit: a flash and a little jerk back
        if(struck.size){

            for(const e of enemies){

                const hit = struck.get(e.id);

                if(!hit)
                    continue;

                const k = hit.t / FLINCH;

                e.flash = 1;
                e.x += Math.cos(hit.angle) * FLINCH_PUSH * k;
                e.y += Math.sin(hit.angle) * FLINCH_PUSH * k;

            }

        }

        if(!placed)
            return;

        mine.x = me.x + fadeX;
        mine.y = me.y + fadeY;
        mine.dashT = me.dashT > 0 ? 1 : 0;
        mine.moving = me.moving;

        if(!usable(mine))
            return;

        if(intent)
            mine.aim = Math.atan2(intent.aimY - mine.y, intent.aimX - mine.x);

        mine.slot = me.slot;
        mine.spin = me.spin;
        mine.reload = me.reload;
        mine.cool = me.cool;
        mine.energy = Math.round(me.energy);
        mine.charge = me.charge;
        mine.swing = swing;
        mine.beam = me.beam ? beamFrom(mine, map, enemies) : null;

    }


    // where our beam reaches: the first wall, or the enemy that stops it
    function beamFrom(mine, map, enemies){

        const item = mine.weapons[me.slot];

        if(!item)
            return null;

        const s = weaponStats(item);

        if(s.kind !== "beam")
            return null;

        const ray = castRay(map, mine.x, mine.y, mine.aim, s.range);
        const pierce = s.pierce ?? 0;
        const along = [];

        for(const e of enemies){

            if(!isActive(e))
                continue;

            const where = segmentDistance(mine.x, mine.y, mine.aim, ray.length, e);

            if(where.distance < e.r + 5)
                along.push(where.along);

        }

        along.sort((a, b) => a - b);

        // what the beam burns flickers
        const reach = along.length > pierce ? along[pierce] : ray.length;

        if(Math.random() < 0.5)
            for(const e of enemies)
                if(isActive(e) && segmentDistance(mine.x, mine.y, mine.aim, reach, e).distance < e.r + 5)
                    strike(e, mine.aim, 0.05);

        // the host's chain of jumps (Prism), as it last saw it
        const chain = mine.hostBeam?.chain ?? [];

        return {
            length: along.length > pierce ? along[pierce] : ray.length,
            chain,
            weapon: s.id
        };

    }


    // an enemy on this screen took a hit from us
    function strike(e, angle, time = FLINCH){

        struck.set(e.id, {t: time, angle});

    }


    // what our hands did since the last call
    function take(){

        if(!events.length)
            return [];

        const out = events.slice();

        events.length = 0;

        return out;

    }


    function reset(){

        pending.length = 0;
        flyers.length = 0;
        events.length = 0;
        struck.clear();
        swing = null;
        placed = false;
        fadeX = fadeY = 0;

    }


    return {
        setId,
        input,
        correct,
        advance,
        show,
        take,
        reset,
        flyers,
        get placed(){ return placed; }
    };

}
