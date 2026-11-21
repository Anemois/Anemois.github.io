import {castRay} from "./physics.js";


// How the special shots move. Shared by the host (combat.js, which also
// deals the damage) and a guest's own guess of its shots (net/predict.js),
// so both draw them on the same path.
//
//   lob        thrown in an arc to the aimed spot: it flies over enemies
//              and walls and goes off where it lands
//   boomerang  flies out its range (or to a wall), then comes back to the
//              thrower, through anything, faster and faster, and is caught
//   split      breaks into a fan of smaller shots where it hits

const LOB_MIN = 50;             // the shortest throw
const CATCH = 10;               // a returning shot this close to the thrower is caught


// how far a lobbed shot flies: to the cursor, but never past the first
// wall that way or the weapon's range
export function lobReach(map, p, s, angle){

    const wanted = Math.hypot(p.aimX - p.x, p.aimY - p.y);
    const wall = castRay(map, p.x, p.y, angle, s.range).length - 6;

    return Math.max(LOB_MIN, Math.min(wanted, wall, s.range));

}


// the fields that make a shot lobbed: it lands after `lob` seconds
export function lobFields(map, p, s, angle){

    const reach = lobReach(map, p, s, angle);
    const flight = reach / s.speed;

    return {
        x: p.x,
        y: p.y,
        vx: Math.cos(angle) * s.speed,
        vy: Math.sin(angle) * s.speed,
        life: flight,
        lob: flight
    };

}


// how high a lobbed shot is above its shadow (for drawing)
export const lobHeight = b =>
    Math.sin(Math.PI * Math.min(1, Math.max(0, 1 - b.life / b.lob))) * Math.min(90, 40 + b.lob * 70);


// one step of a returning shot before it moves; true when caught
export function boomerang(b, owner, dt){

    if(!b.back){

        b.travel += Math.hypot(b.vx, b.vy) * dt;

        if(b.travel >= b.range)
            turnBack(b);

        return false;

    }

    const dx = owner.x - b.x;
    const dy = owner.y - b.y;
    const d = Math.hypot(dx, dy);

    if(d < owner.r + CATCH)
        return true;

    const speed = Math.min(b.speed0 * 1.7, Math.hypot(b.vx, b.vy) + 1100 * dt);

    b.vx = dx / d * speed;
    b.vy = dy / d * speed;

    return false;

}


// out of range, or it met a wall: it starts home, and may hit everything
// again on the way back
export function turnBack(b){

    b.back = true;
    b.hits = null;
    b.vx *= 0.25;
    b.vy *= 0.25;

}


// The shots a splitting shot breaks into where it hits: a fan around
// `heading` (straight on through an enemy, back off a wall). Fields for
// each new shot; the caller adds its own (ids, owner...).
export function shards(b, heading){

    const spec = b.split;
    const out = [];
    const fan = spec.fan ?? 1.6;

    for(let i = 0; i < spec.count; i++){

        const a = heading + (spec.count > 1 ? (i / (spec.count - 1) - 0.5) * fan : 0);

        out.push({
            kind: "shard",
            x: b.x,
            y: b.y,
            vx: Math.cos(a) * spec.speed,
            vy: Math.sin(a) * spec.speed,
            r: spec.size,
            dmg: b.dmg * spec.dmg,
            life: spec.life,
            pierce: 0,
            bounce: 0,
            explode: spec.explode ?? 0,
            homing: spec.homing ?? 0,
            split: null,
            zap: 0,
            hits: null
        });

    }

    return out;

}
