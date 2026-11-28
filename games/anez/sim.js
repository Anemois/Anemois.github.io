import {chamber, newPlayer, offerings, WEAPONS} from "./world.js";

export const STEP = 1 / 60;
const GRAVITY = 1580;
const center = body => body.x + body.w / 2;
const middle = body => body.y + body.h / 2;
const clamp = (n,min,max) => Math.max(min, Math.min(max,n));
const overlaps = (a,b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;


export function createRun(seed, count = 1){

    return {
        seed: seed >>> 0, room: 0, phase: "play", time: 0, enteredAt: 0, kills: 0, offers: [],
        players: Array.from({length:count}, (_, slot) => newPlayer(slot)),
        ...chamber(seed, 0, count), shots: [], events: []
    };

}


function emit(s, kind, body, extra = {}){

    s.events.push({kind, x:center(body), y:middle(body), ...extra});

}


export function weaponBox(p){

    const reach = WEAPONS[p.weapon].reach;
    return {x:p.face > 0 ? center(p) - 6 : center(p) - reach, y:p.y - 18, w:reach + 6, h:p.h + 36};

}


function damage(s, p, amount){

    if(!p.hp || p.hurt > 0 || p.dash > 0)
        return;
    p.hp = Math.max(0, p.hp - amount);
    p.hurt = 0.92;
    emit(s, "hurt", p);

}


function stepHero(s, p, input, dt){

    if(!p.hp)
        return;

    for(const key of ["attack","dash","hurt","swingCd","dashCd","buffer","coyote"])
        p[key] = Math.max(0, p[key] - dt);

    if(input.drop && p.grounded && s.platforms.some(floor => floor.kind === "ledge" &&
        Math.abs(p.y + p.h - floor.y) < 0.1 && p.x < floor.x + floor.w && p.x + p.w > floor.x)){

        p.y += 2;
        p.grounded = false;
        p.coyote = p.buffer = 0;

    }
    if(input.jump)
        p.buffer = 0.14;
    if(p.grounded)
        p.coyote = 0.10;
    if(input.axis && !p.dash)
        p.face = input.axis;

    if(input.dash && !p.dashCd){

        p.dash = 0.16;
        p.dashCd = 0.84 * p.recovery;
        emit(s, "dash", p);

    }
    if(p.buffer && p.coyote){

        p.vy = -640;
        p.grounded = false;
        p.buffer = p.coyote = 0;
        emit(s, "jump", p);

    }

    p.vx = p.dash ? p.face * 570 : (input.axis || 0) * 255;
    p.x = clamp(p.x + p.vx * dt, 0, s.width - p.w);
    const bottom = p.y + p.h;
    p.vy = p.dash ? 0 : p.vy + GRAVITY * dt;
    p.y += p.vy * dt;
    p.grounded = false;

    for(const floor of s.platforms){

        if(p.vy < 0 || bottom > floor.y + 0.01 || p.y + p.h < floor.y ||
            p.x + p.w <= floor.x || p.x >= floor.x + floor.w)
            continue;

        p.y = floor.y - p.h;
        p.vy = 0;
        p.grounded = true;
        if(floor.kind === "ground" && p.x > floor.x + 12 && p.x + p.w < floor.x + floor.w - 12){

            p.safeX = p.x;
            p.safeY = p.y;

        }

    }

    if(p.y > 555){

        p.x = p.safeX;
        p.y = p.safeY;
        p.vy = p.dash = p.hurt = 0;
        damage(s, p, 1);

    }

    if(input.attack && !p.swingCd){

        const weapon = WEAPONS[p.weapon];
        p.attack = weapon.window;
        p.swingCd = weapon.cooldown * p.haste;
        p.struck = [];
        emit(s, "swing", p);

    }
    if(!p.attack)
        return;

    const hitbox = weaponBox(p);
    for(const e of s.enemies){

        if(e.hp <= 0 || p.struck.includes(e.id) || !overlaps(hitbox, e))
            continue;
        p.struck.push(e.id);
        const amount = WEAPONS[p.weapon].power + p.power;
        e.hp -= amount;
        e.hit = 0.12;
        emit(s, "hit", e, {amount, face:p.face});
        if(e.hp <= 0){

            s.kills++;
            emit(s, "fall", e, {boss:e.boss});

        }

    }

}


function volley(s, e, target, count){

    const x = center(e), y = middle(e);
    const angle = Math.atan2(middle(target) - y, center(target) - x);
    for(let i = 0; i < count; i++){

        const a = angle + (i - (count - 1) / 2) * 0.24;
        s.shots.push({x, y, vx:Math.cos(a) * 232, vy:Math.sin(a) * 232, r:6, life:3.6, wave:false});

    }

}


function shockwave(s, e){

    for(const dir of [-1, 1])
        s.shots.push({x:center(e), y:e.floor - 11, vx:dir * 270, vy:0, r:11, life:3.2, wave:true});
    emit(s, "slam", e);

}


const PATTERNS = {
    sexton: ["charge","slam","knell","charge"],
    widow: ["volley","dive","volley","dive"],
    saint: ["cinders","charge","volley","slam"]
};


function startWarning(e, target){

    e.move = e.boss ? PATTERNS[e.kind][e.pattern++ % 4]
        : {moth:"volley", gravedigger:"slam", husk:"lunge"}[e.kind];
    e.mode = "warn";
    e.timer = (e.move === "slam" ? 0.88 : 0.63) * (e.boss && e.hp < e.maxHp / 2 ? 0.8 : 1);
    e.face = center(target) >= center(e) ? 1 : -1;
    e.hitSlots = [];
    e.aimX = clamp(center(target), e.left + e.w / 2, e.right - e.w / 2);
    e.startX = e.x;
    e.marks = e.move === "cinders" ? [-120, 0, 120].map(offset => e.aimX + offset) : [];

}


function stepEnemy(s, e, alive, dt){

    const target = alive.reduce((a,b) => Math.abs(center(e) - center(a)) < Math.abs(center(e) - center(b)) ? a : b);
    const dx = center(target) - center(e);
    e.hit = Math.max(0, e.hit - dt);
    e.timer -= dt;
    if(e.echo > 0){

        e.echo -= dt;
        if(e.echo <= 0)
            shockwave(s, e);

    }

    if(e.mode === "idle"){

        if(Math.abs(dx) > (e.boss ? 720 : 540))
            return;
        e.face = dx >= 0 ? 1 : -1;
        const reach = e.boss ? 345 : e.kind === "moth" ? 245 : e.kind === "gravedigger" ? 155 : 75;
        if(Math.abs(dx) > reach * 0.78)
            e.x += e.face * (e.boss ? 91 : e.kind === "moth" ? 68 : 62) * dt;
        if(e.timer <= 0 && Math.abs(dx) < reach)
            startWarning(e, target);

    }
    else if(e.mode === "warn"){

        if(e.move === "dive")
            e.y = Math.max(e.floor - e.h - 125, e.y - 255 * dt);
        if(e.timer > 0)
            return;

        e.mode = "strike";
        e.timer = e.move === "charge" ? 0.64 : e.move === "lunge" ? 0.31 : 0.2;
        if(e.move === "dive")
            e.timer = 0.38;
        if(e.move === "cinders"){

            for(const x of e.marks)
                s.shots.push({x, y:120, vx:0, vy:425, r:12, life:0.95, wave:false});

        }
        if(e.move === "knell"){

            shockwave(s, e);
            e.echo = 0.43;

        }
        if(e.move === "volley")
            volley(s, e, target, e.boss ? (e.hp < e.maxHp / 2 ? 7 : 5) : 1);
        if(e.move === "slam")
            shockwave(s, e);
        emit(s, "strike", e);

    }
    else if(e.mode === "strike"){

        if(e.move === "charge" || e.move === "lunge")
            e.x += e.face * (e.boss ? 435 : 280) * dt;
        if(e.move === "dive"){

            const t = clamp(1 - e.timer / 0.38, 0, 1);
            e.y = e.floor - e.h - 125 * (1 - t);
            e.x = e.startX + (e.aimX - e.w / 2 - e.startX) * t;

        }
        if(e.timer <= 0){

            e.mode = "recover";
            e.timer = e.boss ? 0.66 : 0.70;

        }

    }
    else if(e.mode === "recover" && e.timer <= 0){

        e.mode = "idle";
        e.timer = e.boss && e.hp < e.maxHp / 2 ? 0.26 : 0.48;

    }

    e.x = clamp(e.x, e.left, e.right - e.w);
    if(e.kind === "moth")
        e.y = e.floor - e.h - 47 + 20 * Math.sin(s.time * 3 + e.phase);
    if(e.mode !== "strike")
        return;

    const strike = {x:e.x - 9, y:e.y, w:e.w + 18, h:e.h};
    for(const p of alive){

        if(overlaps(p, strike) && !e.hitSlots.includes(p.slot)){

            e.hitSlots.push(p.slot);
            damage(s, p, e.boss ? 2 : 1);

        }

    }

}


function enterGate(s){

    if(s.room === 8){

        s.phase = "won";
        return;

    }
    s.phase = "reward";
    s.shots = [];
    s.offers = s.players.map(p => offerings(s.seed, s.room, p));
    s.choices = s.players.map(() => null);

}


export function advanceIfReady(s){

    if(s.phase !== "reward" || s.choices.some(choice => choice === null))
        return;

    s.room++;
    s.enteredAt = s.time;
    Object.assign(s, chamber(s.seed, s.room, s.players.length));
    s.shots = [];
    s.phase = "play";
    for(const p of s.players){

        const fresh = newPlayer(p.slot);
        Object.assign(p, fresh, {
            weapon:p.weapon, maxHp:p.maxHp, hp:Math.min(p.maxHp, (p.hp || 2) + 1),
            power:p.power, haste:p.haste, recovery:p.recovery
        });

    }

}


export function choose(s, slot, key, room){

    if(s.phase !== "reward" || room !== s.room || s.choices[slot] !== null || !s.offers[slot]?.includes(key))
        return;
    const p = s.players[slot];
    if(WEAPONS[key])
        p.weapon = key;
    else if(key === "heart"){

        p.maxHp += 2;
        p.hp = p.maxHp;

    }
    else if(key === "edge")
        p.power++;
    else if(key === "haste")
        p.haste *= 0.88;
    else if(key === "spur")
        p.recovery *= 0.85;
    s.choices[slot] = key;
    advanceIfReady(s);

}


export function step(s, inputs, dt = STEP){

    if(s.phase !== "play")
        return;

    s.time += dt;
    for(const p of s.players)
        stepHero(s, p, inputs[p.slot] || {}, dt);

    const alive = s.players.filter(p => p.hp > 0);
    s.enemies = s.enemies.filter(e => e.hp > 0);
    if(alive.length){

        for(const e of s.enemies)
            stepEnemy(s, e, alive, dt);

    }

    for(const shot of s.shots){

        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
        shot.life -= dt;
        for(const p of alive){

            if(!p.hp || p.dash || !overlaps({x:shot.x - shot.r, y:shot.y - shot.r, w:shot.r * 2, h:shot.r * 2}, p))
                continue;
            damage(s, p, 1);
            shot.life = 0;
            break;

        }

    }
    s.shots = s.shots.filter(b => b.life > 0 && b.x >= 0 && b.x < s.width);

    if(s.players.every(p => !p.hp))
        s.phase = "lost";
    else if(!s.enemies.length && alive.some(p => p.hp && Math.abs(center(p) - s.gate.x) < 48))
        enterGate(s);

}
