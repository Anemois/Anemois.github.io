import {TILE} from "./data.js";
import {walkable} from "./map.js";


// How enemies find their way through the cave: a "flow field". Every so
// often we flood outwards from the players and note, for each tile, how
// many steps it is from the nearest one. An enemy then just walks to
// whichever neighbouring tile has the smaller number. One flood serves
// every enemy, however many there are.

const REACH = 48;               // tiles the flood spreads from a player
const REFRESH = 12;             // steps between floods
const FAR = 65535;

// neighbours to step to: straight ones first, then diagonals
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];


export function createNav(map){

    return {
        dist: new Uint16Array(map.w * map.h).fill(FAR),
        queue: new Int32Array(map.w * map.h),
        age: REFRESH
    };

}


export function updateNav(state){

    const nav = state.nav;

    if(++nav.age < REFRESH)
        return;

    nav.age = 0;

    const {w, h, wide, tiles} = state.map;
    const {dist, queue} = nav;

    // enemies need room (wide tiles), but right around a player any floor
    // counts, so hiding in a crack does not make you unfindable
    const open = (n, d) => wide[n] === 1 || (d <= 3 && walkable(tiles[n]));

    let head = 0;
    let tail = 0;

    dist.fill(FAR);

    for(const p of state.players){

        if(p.dead)
            continue;

        const i = Math.floor(p.y / TILE) * w + Math.floor(p.x / TILE);

        if(dist[i] === FAR){

            dist[i] = 0;
            queue[tail++] = i;

        }

    }

    while(head < tail){

        const i = queue[head++];
        const d = dist[i] + 1;

        if(d > REACH)
            continue;

        const x = i % w;

        // the four neighbours (the map has a rock border, so no edge checks
        // are needed beyond staying inside the array)
        if(x + 1 < w && dist[i + 1] === FAR && open(i + 1, d)){ dist[i + 1] = d; queue[tail++] = i + 1; }
        if(x > 0 && dist[i - 1] === FAR && open(i - 1, d)){ dist[i - 1] = d; queue[tail++] = i - 1; }
        if(i + w < w * h && dist[i + w] === FAR && open(i + w, d)){ dist[i + w] = d; queue[tail++] = i + w; }
        if(i - w >= 0 && dist[i - w] === FAR && open(i - w, d)){ dist[i - w] = d; queue[tail++] = i - w; }

    }

}


// steps from this point to the nearest player, or Infinity if out of reach
// The direction (radians) to walk from (x, y) to get closer to a player,
// or null when there is no known way. Diagonal steps never cut a corner.
export function navAngle(state, x, y){

    const {w} = state.map;
    const dist = state.nav.dist;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const here = dist[ty * w + tx];

    let best = here;
    let bx = 0;
    let by = 0;

    for(const [dx, dy] of STEPS){

        const d = dist[(ty + dy) * w + tx + dx];

        if(d === undefined || d >= best)
            continue;

        if(dx && dy && (dist[ty * w + tx + dx] === FAR || dist[(ty + dy) * w + tx] === FAR))
            continue;

        best = d;
        bx = dx;
        by = dy;

    }

    if(!bx && !by)
        return null;

    // aim for the middle of that tile
    return Math.atan2((ty + by + 0.5) * TILE - y, (tx + bx + 0.5) * TILE - x);

}
