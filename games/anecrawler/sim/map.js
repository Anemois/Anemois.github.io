import {TILE} from "./data.js";


// The map is one grid of tiles. Rock everywhere, with open floor carved
// out of it (see mapgen.js); crates are breakable cover on the floor.

export const VOID = 0;      // outside the grid
export const FLOOR = 1;
export const WALL = 2;
export const CRATE = 4;

const CRATE_HP = 3;         // hits (any weapon) to break a crate


// Besides the tiles a map carries what the generator decided:
//   start, exit {x, y}     world units
//   arena {x, y, r}        the boss lair, on boss floors
//   camps [{x, y, budget, kind}]   where enemy packs begin
//   chests [{x, y}]
export function createMap(w, h){

    return {
        w,
        h,
        tiles: new Uint8Array(w * h).fill(WALL),
        wide: new Uint8Array(w * h),        // 1 = part of a 2x2 open block (see markWide)
        crates: new Map(),                  // tile index -> hits left
        broken: [],                         // crates broken so far (tile indexes), for late joiners
        start: {x: 0, y: 0},
        exit: null,
        arena: null,
        camps: [],
        chests: []
    };

}


export const tileAt = (map, tx, ty) =>
    tx < 0 || ty < 0 || tx >= map.w || ty >= map.h ? VOID : map.tiles[ty * map.w + tx];

export const solidAt = (map, tx, ty) =>
    tx < 0 || ty < 0 || tx >= map.w || ty >= map.h || map.tiles[ty * map.w + tx] !== FLOOR;

export const solidAtPoint = (map, x, y) =>
    solidAt(map, Math.floor(x / TILE), Math.floor(y / TILE));

export const tileCentre = (tx, ty) => ({
    x: (tx + 0.5) * TILE,
    y: (ty + 0.5) * TILE
});


// Marks the tiles that sit in some fully open 2x2 block. Enemies only path
// through those, so nothing bigger than a tile gets wedged in a crack.
export function markWide(map){

    const {w, h, tiles, wide} = map;

    wide.fill(0);

    for(let y = 0; y < h - 1; y++){

        for(let x = 0; x < w - 1; x++){

            const i = y * w + x;

            if(tiles[i] === FLOOR && tiles[i + 1] === FLOOR && tiles[i + w] === FLOOR && tiles[i + w + 1] === FLOOR)
                wide[i] = wide[i + 1] = wide[i + w] = wide[i + w + 1] = 1;

        }

    }

}


// a crate hit by anything loses one hit point; returns true when it breaks
export function hitCrate(map, tx, ty){

    const index = ty * map.w + tx;
    const left = (map.crates.get(index) ?? CRATE_HP) - 1;

    if(left > 0){

        map.crates.set(index, left);

        return false;

    }

    breakCrate(map, index);

    return true;

}


export function breakCrate(map, index){

    if(map.tiles[index] !== CRATE)
        return;

    map.crates.delete(index);
    map.tiles[index] = FLOOR;
    map.broken.push(index);

    markWide(map);

}


// a random open spot between minR and maxR (world units) from a point,
// or the point itself if nothing turns up
export function spotNear(rng, map, x, y, minR, maxR){

    for(let tries = 0; tries < 30; tries++){

        const angle = rng.range(0, Math.PI * 2);
        const r = rng.range(minR, maxR);
        const tx = Math.floor((x + Math.cos(angle) * r) / TILE);
        const ty = Math.floor((y + Math.sin(angle) * r) / TILE);

        if(tx >= 0 && ty >= 0 && tx < map.w && ty < map.h && map.wide[ty * map.w + tx])
            return tileCentre(tx, ty);

    }

    return {x, y};

}
