import {TILE} from "../sim/data.js";
import {FLOOR, CRATE, WALL, WATER, CHASM, LAVA, VOID} from "../sim/map.js";

// minimap colours per tile
const MINIMAP = {[FLOOR]: "#4b4b52", [CRATE]: "#6b5d4f", [WATER]: "#2f6f78", [CHASM]: "#120c1c", [LAVA]: "#c2410c"};

// ground you could walk on but have not seen yet, next to ground you have:
// the edges of the explored cave, where there is more to find
export const FRONTIER = "#3a3a48";

const walkish = tile => tile === FLOOR || tile === CRATE || tile === WATER;


// What this player has explored. A tile is "seen" once it has ever been in
// view (it stays on the map) and "visible" while it is in view right now.
// Sight is cast in straight lines from the player and stops at rock, so
// you cannot see round corners. Each player keeps their own fog.

const SIGHT = 11;               // tiles


export function createFog(){

    const mini = document.createElement("canvas");
    const mctx = mini.getContext("2d");

    let map = null;
    let seen = new Uint8Array(0);
    let lit = new Uint32Array(0);       // the stamp of the last look that saw each tile
    let stamp = 0;
    let lastTile = -1;
    let lastBroken = 0;
    let box = null;                     // the explored area, in tiles: {x0, y0, x1, y1}


    // a new floor: forget everything (the lobby is known from the start)
    function reset(next){

        map = next;
        seen = new Uint8Array(map.w * map.h);
        lit = new Uint32Array(map.w * map.h);
        stamp = 1;
        lastTile = -1;
        lastBroken = 0;
        box = null;

        mini.width = map.w;
        mini.height = map.h;

        if(map.lobby){

            for(let i = 0; i < seen.length; i++)
                reveal(i);

        }

    }


    function reveal(i){

        lit[i] = stamp;

        if(seen[i])
            return;

        seen[i] = 1;

        const tile = map.tiles[i];
        const x = i % map.w;
        const y = (i - x) / map.w;

        mctx.fillStyle = MINIMAP[tile] ?? "#1f1f23";
        mctx.fillRect(x, y, 1, 1);

        if(!box)
            box = {x0: x, y0: y, x1: x, y1: y};
        else{

            box.x0 = Math.min(box.x0, x);
            box.y0 = Math.min(box.y0, y);
            box.x1 = Math.max(box.x1, x);
            box.y1 = Math.max(box.y1, y);

        }

        // the unseen ground around it is the edge of what you know
        if(tile === WALL || tile === VOID)
            return;

        mctx.fillStyle = FRONTIER;

        for(let dy = -1; dy <= 1; dy++){

            for(let dx = -1; dx <= 1; dx++){

                const nx = x + dx;
                const ny = y + dy;
                const n = ny * map.w + nx;

                if(nx >= 0 && ny >= 0 && nx < map.w && ny < map.h && !seen[n] && walkish(map.tiles[n]))
                    mctx.fillRect(nx, ny, 1, 1);

            }

        }

    }


    // looks around from a world point; cheap unless the player changed tile
    function look(x, y){

        const tx = Math.floor(x / TILE);
        const ty = Math.floor(y / TILE);
        const here = ty * map.w + tx;

        if(here === lastTile && map.broken.length === lastBroken)
            return;

        // broken crates change what the map shows
        for(let i = lastBroken; i < map.broken.length; i++){

            const index = map.broken[i];

            if(seen[index]){

                mctx.fillStyle = "#4b4b52";
                mctx.fillRect(index % map.w, Math.floor(index / map.w), 1, 1);

            }

        }

        lastTile = here;
        lastBroken = map.broken.length;

        if(map.lobby)
            return;

        stamp++;

        reveal(here);

        // a ray to every tile on the edge of the sight square
        for(let i = -SIGHT; i <= SIGHT; i++){

            ray(tx, ty, tx + i, ty - SIGHT);
            ray(tx, ty, tx + i, ty + SIGHT);
            ray(tx, ty, tx - SIGHT, ty + i);
            ray(tx, ty, tx + SIGHT, ty + i);

        }

    }


    // walks a line of tiles (Bresenham), revealing until rock stops it
    function ray(x0, y0, x1, y1){

        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;

        let error = dx - dy;
        let x = x0;
        let y = y0;

        for(let guard = 0; guard < SIGHT * 2 + 2; guard++){

            if(x < 0 || y < 0 || x >= map.w || y >= map.h)
                return;

            if((x - x0) ** 2 + (y - y0) ** 2 > SIGHT * SIGHT)
                return;

            const i = y * map.w + x;

            reveal(i);

            // sight crosses everything but rock (water, chasms, lava, crates)
            if(map.tiles[i] === WALL || map.tiles[i] === VOID)
                return;

            if(x === x1 && y === y1)
                return;

            const twice = error * 2;

            if(twice > -dy){

                error -= dy;
                x += sx;

            }

            if(twice < dx){

                error += dx;
                y += sy;

            }

        }

    }


    return {
        reset,
        look,
        seen: i => seen[i] === 1,
        visible: i => lit[i] === stamp,

        // unseen ground you could walk to, right next to ground you have seen
        frontier(i){

            if(seen[i] || !walkish(map.tiles[i]))
                return false;

            const x = i % map.w;
            const y = (i - x) / map.w;

            for(let dy = -1; dy <= 1; dy++){

                for(let dx = -1; dx <= 1; dx++){

                    const nx = x + dx;
                    const ny = y + dy;
                    const n = ny * map.w + nx;

                    if(nx >= 0 && ny >= 0 && nx < map.w && ny < map.h && seen[n] && map.tiles[n] !== WALL && map.tiles[n] !== VOID)
                        return true;

                }

            }

            return false;

        },

        // is the tile under a world point in view right now?
        sees(x, y){

            const tx = Math.floor(x / TILE);
            const ty = Math.floor(y / TILE);

            return tx >= 0 && ty >= 0 && tx < map.w && ty < map.h && lit[ty * map.w + tx] === stamp;

        },

        knows(x, y){

            return seen[Math.floor(y / TILE) * map.w + Math.floor(x / TILE)] === 1;

        },

        // the explored area in tiles, or null before anything is seen
        bounds: () => box,

        get map(){ return map; },
        get mini(){ return mini; }
    };

}
