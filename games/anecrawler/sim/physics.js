import {TILE} from "./data.js";
import {solidAt, tileAt, CRATE} from "./map.js";


export const DEG = Math.PI / 180;

export const clamp = (value, low, high) =>
    Math.max(low, Math.min(high, value));

export const dist = (a, b) =>
    Math.hypot(b.x - a.x, b.y - a.y);

export const angleTo = (a, b) =>
    Math.atan2(b.y - a.y, b.x - a.x);

// signed difference from angle a to angle b, in -PI..PI
export function angleDiff(a, b){

    let d = (b - a) % (Math.PI * 2);

    if(d > Math.PI)
        d -= Math.PI * 2;

    if(d < -Math.PI)
        d += Math.PI * 2;

    return d;

}


/* ---------------- Bodies ---------------- */

// does a circle overlap any solid tile?
export function hitsWall(map, x, y, r){

    const x0 = Math.floor((x - r) / TILE);
    const x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - r) / TILE);
    const y1 = Math.floor((y + r) / TILE);

    for(let ty = y0; ty <= y1; ty++){

        for(let tx = x0; tx <= x1; tx++){

            if(!solidAt(map, tx, ty))
                continue;

            const nx = clamp(x, tx * TILE, (tx + 1) * TILE);
            const ny = clamp(y, ty * TILE, (ty + 1) * TILE);

            if((x - nx) ** 2 + (y - ny) ** 2 < r * r)
                return true;

        }

    }

    return false;

}


// Moves a body ({x, y, r}) and slides it along walls. A body that already
// overlaps a wall (a door shut on it) moves freely until it is out.
export function moveBody(map, body, dx, dy){

    const free = hitsWall(map, body.x, body.y, body.r);
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6));

    let blockedX = false;
    let blockedY = false;

    for(let i = 0; i < steps; i++){

        if(dx){

            body.x += dx / steps;

            if(!free && hitsWall(map, body.x, body.y, body.r)){

                body.x -= dx / steps;
                blockedX = true;

            }

        }

        if(dy){

            body.y += dy / steps;

            if(!free && hitsWall(map, body.x, body.y, body.r)){

                body.y -= dy / steps;
                blockedY = true;

            }

        }

    }

    return blockedX || blockedY;

}


/* ---------------- Rays ---------------- */

// Walks a ray until it meets a wall. Returns the length and, if it stopped
// on a crate, that crate's tile.
export function castRay(map, x, y, angle, maxLength){

    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    for(let d = 0; d < maxLength; d += 4){

        const tx = Math.floor((x + dx * d) / TILE);
        const ty = Math.floor((y + dy * d) / TILE);

        if(solidAt(map, tx, ty))
            return {length: d, crate: tileAt(map, tx, ty) === CRATE ? {tx, ty} : null};

    }

    return {length: maxLength, crate: null};

}


export function lineOfSight(map, a, b){

    const length = dist(a, b);

    return castRay(map, a.x, a.y, angleTo(a, b), length).length >= length - 4;

}


// distance from a point to the segment starting at (x, y), going `length`
// along `angle`; also how far along the segment the closest point is
export function segmentDistance(x, y, angle, length, point){

    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    const along = clamp((point.x - x) * dx + (point.y - y) * dy, 0, length);

    return {
        distance: Math.hypot(point.x - (x + dx * along), point.y - (y + dy * along)),
        along
    };

}
