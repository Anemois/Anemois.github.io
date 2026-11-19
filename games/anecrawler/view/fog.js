import {TILE} from "../sim/data.js";
import {FLOOR, CRATE} from "../sim/map.js";


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


    // a new floor: forget everything (the lobby is known from the start)
    function reset(next){

        map = next;
        seen = new Uint8Array(map.w * map.h);
        lit = new Uint32Array(map.w * map.h);
        stamp = 1;
        lastTile = -1;
        lastBroken = 0;

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

        mctx.fillStyle = tile === FLOOR ? "#4b4b52" : tile === CRATE ? "#6b5d4f" : "#1f1f23";
        mctx.fillRect(i % map.w, Math.floor(i / map.w), 1, 1);

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

            if(map.tiles[i] !== FLOOR && map.tiles[i] !== CRATE)
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

        // is the tile under a world point in view right now?
        sees(x, y){

            const tx = Math.floor(x / TILE);
            const ty = Math.floor(y / TILE);

            return tx >= 0 && ty >= 0 && tx < map.w && ty < map.h && lit[ty * map.w + tx] === stamp;

        },

        knows(x, y){

            return seen[Math.floor(y / TILE) * map.w + Math.floor(x / TILE)] === 1;

        },

        get map(){ return map; },
        get mini(){ return mini; }
    };

}
