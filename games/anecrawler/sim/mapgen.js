import {TILE} from "./data.js";
import {createMap, markWide, FLOOR, WALL, CRATE} from "./map.js";


// Every floor is one continuous cave: a handful of lumpy chambers carved
// out of solid rock, joined by winding tunnels (a spanning tree plus a few
// loops), then roughened so nothing looks drawn with a ruler. The same
// seed always gives the same floor, so every player can build it locally.

const EDGE = 3;                 // rock kept around the outside, tiles
const QUIET = 14;               // no enemies this close (in steps) to the start
const TAU = Math.PI * 2;

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];


export function generateFloor(rng, {floor, boss}){

    for(let attempt = 0; attempt < 40; attempt++){

        const map = build(rng, floor, boss);

        if(map)
            return map;

    }

    throw new Error("could not build a floor");

}


function build(rng, floor, boss){

    const w = Math.min(120, 84 + floor * 3);
    const h = Math.min(88, 62 + floor * 2);
    const map = createMap(w, h);

    const chambers = placeChambers(rng, map, floor, boss);

    if(chambers.length < 5)
        return null;

    const edges = connect(rng, chambers, Math.max(w, h));

    for(const c of chambers)
        carveChamber(rng, map, c);

    for(const [a, b] of edges)
        carveTunnel(rng, map, chambers[a], chambers[b]);

    const nooks = carveNooks(rng, map, 3 + Math.floor(floor / 3));

    roughen(rng, map);

    // the two ends of the cave: the start and, as far from it as it gets, the way out
    let start, end;

    if(boss){

        end = chambers[0];
        start = farthest(map, chambers, distances(map, end), end);

    }
    else{

        const any = rng.pick(chambers);

        start = farthest(map, chambers, distances(map, any), any);
        end = farthest(map, chambers, distances(map, start), start);

    }

    start.kind = "start";
    end.kind = boss ? "arena" : "exit";

    const degree = chambers.map(() => 0);

    for(const [a, b] of edges){

        degree[a]++;
        degree[b]++;

    }

    // dead ends hold treasure
    const spare = chambers.filter(c => !c.kind);
    const leaves = spare.filter(c => degree[c.id] === 1);
    const hoards = (leaves.length ? leaves : spare).slice(0, rng.chance(0.5) ? 2 : 1);

    for(const c of hoards)
        c.kind = "treasure";

    for(const c of chambers){

        if(c.kind !== "arena")
            decorate(rng, map, c);

    }

    markWide(map);

    // everything that matters must be reachable by the widest enemies
    const dist = distances(map, start, true);

    if(chambers.some(c => dist[tile(map, c)] < 0))
        return null;

    map.start = centre(start);
    map.chambers = chambers.map(c => ({...centre(c), rx: c.rx * TILE, ry: c.ry * TILE, kind: c.kind ?? "den"}));

    if(boss)
        map.arena = {...centre(end), r: (end.rx - 0.5) * TILE};
    else
        map.exit = centre(end);

    map.chests = hoards.map(centre);

    // side passages end in a few crates; now and then one hides a chest
    const reachable = nooks.filter(n => dist[tile(map, n)] > QUIET);

    for(const n of reachable)
        stash(rng, map, n);

    if(reachable.length && rng.chance(0.5))
        map.chests.push(centre(rng.pick(reachable)));

    markWide(map);

    placeCamps(rng, map, chambers, dist, floor);

    return map;

}


const tile = (map, c) =>
    Math.floor(c.y) * map.w + Math.floor(c.x);

const centre = c => ({
    x: (Math.floor(c.x) + 0.5) * TILE,
    y: (Math.floor(c.y) + 0.5) * TILE
});


/* ---------------- Chambers and tunnels ---------------- */

// chambers: {id, x, y (tiles, centre), rx, ry, kind}
function placeChambers(rng, map, floor, boss){

    const wanted = Math.min(16, 10 + Math.floor(floor / 2));
    const chambers = [];

    for(let tries = 0; tries < 600 && chambers.length < wanted; tries++){

        const arena = boss && chambers.length === 0;
        const rx = arena ? 9.5 : rng.range(3.2, 8);
        const ry = arena ? 9.5 : rng.range(3, 6.5);

        const x = rng.range(rx + EDGE + 3, map.w - rx - EDGE - 3);
        const y = rng.range(ry + EDGE + 3, map.h - ry - EDGE - 3);

        if(chambers.some(c => Math.abs(c.x - x) < c.rx + rx + 5 && Math.abs(c.y - y) < c.ry + ry + 5))
            continue;

        chambers.push({id: chambers.length, x, y, rx, ry, kind: null});

    }

    return chambers;

}


// which chambers get a tunnel between them: the shortest tree that joins
// them all, plus a few short extras so the cave has loops
function connect(rng, chambers, size){

    const n = chambers.length;
    const gap = (a, b) => Math.hypot(chambers[a].x - chambers[b].x, chambers[a].y - chambers[b].y);

    const joined = [0];
    const edges = [];

    while(joined.length < n){

        let best = null;

        for(const a of joined){

            for(let b = 0; b < n; b++){

                if(!joined.includes(b) && (!best || gap(a, b) < best[2]))
                    best = [a, b, gap(a, b)];

            }

        }

        edges.push([best[0], best[1]]);
        joined.push(best[1]);

    }

    let extra = Math.ceil(n / 3);

    for(let a = 0; a < n && extra > 0; a++){

        for(let b = a + 1; b < n && extra > 0; b++){

            const known = edges.some(([c, d]) => (c === a && d === b) || (c === b && d === a));

            if(!known && gap(a, b) < size * 0.33 && rng.chance(0.35)){

                edges.push([a, b]);

                extra--;

            }

        }

    }

    return edges;

}


function disc(map, cx, cy, r){

    const x0 = Math.max(EDGE, Math.floor(cx - r));
    const x1 = Math.min(map.w - EDGE - 1, Math.ceil(cx + r));
    const y0 = Math.max(EDGE, Math.floor(cy - r));
    const y1 = Math.min(map.h - EDGE - 1, Math.ceil(cy + r));

    for(let ty = y0; ty <= y1; ty++){

        for(let tx = x0; tx <= x1; tx++){

            if((tx + 0.5 - cx) ** 2 + (ty + 0.5 - cy) ** 2 <= r * r)
                map.tiles[ty * map.w + tx] = FLOOR;

        }

    }

}


// an ellipse with a few bulges on its rim (the boss arena stays round)
function carveChamber(rng, map, c){

    const x0 = Math.max(EDGE, Math.floor(c.x - c.rx));
    const x1 = Math.min(map.w - EDGE - 1, Math.ceil(c.x + c.rx));
    const y0 = Math.max(EDGE, Math.floor(c.y - c.ry));
    const y1 = Math.min(map.h - EDGE - 1, Math.ceil(c.y + c.ry));

    for(let ty = y0; ty <= y1; ty++){

        for(let tx = x0; tx <= x1; tx++){

            if(((tx + 0.5 - c.x) / c.rx) ** 2 + ((ty + 0.5 - c.y) / c.ry) ** 2 <= 1)
                map.tiles[ty * map.w + tx] = FLOOR;

        }

    }

    if(c.rx === c.ry && c.rx > 9)
        return;

    for(let i = rng.int(3, 6); i > 0; i--){

        const angle = rng.range(0, TAU);

        disc(map, c.x + Math.cos(angle) * c.rx * 0.85, c.y + Math.sin(angle) * c.ry * 0.85, rng.range(1.8, 3.4));

    }

}


// Tunnels bend through a point off to one side, so they curve instead of
// running straight from chamber to chamber.
function carveTunnel(rng, map, a, b){

    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const bend = rng.range(-0.3, 0.3) * length;
    const keep = (value, size) => Math.max(EDGE + 4, Math.min(size - EDGE - 5, value));

    const via = {
        x: keep((a.x + b.x) / 2 - (b.y - a.y) / length * bend, map.w),
        y: keep((a.y + b.y) / 2 + (b.x - a.x) / length * bend, map.h)
    };

    const width = rng.range(1.2, 1.75);

    dig(rng, map, a, via, width);
    dig(rng, map, via, b, width);

}


// a walker heads for a point, swaying, and digs as it goes; now and then
// the passage opens out into a small cave
function dig(rng, map, from, to, width, limit = 800){

    const sway = rng.range(0.5, 1.1);
    const pace = rng.range(0.25, 0.5);

    let x = from.x;
    let y = from.y;
    let phase = rng.range(0, TAU);

    for(let guard = 0; guard < limit; guard++){

        const left = Math.hypot(to.x - x, to.y - y);

        if(left < 1.5)
            break;

        phase += pace;

        const angle = Math.atan2(to.y - y, to.x - x) + Math.sin(phase) * sway * Math.min(1, left / 6);

        x += Math.cos(angle) * 0.7;
        y += Math.sin(angle) * 0.7;

        disc(map, x, y, rng.chance(0.03) ? rng.range(2.2, 3.2) : width + Math.sin(phase * 0.37) * 0.25);

    }

    return {x, y};

}


// dead-end side passages off whatever is already dug, each ending in a
// small pocket. Returns the pockets ({x, y} in tiles).
function carveNooks(rng, map, count){

    const nooks = [];

    for(let tries = 0; tries < 200 && nooks.length < count; tries++){

        const x = rng.int(EDGE + 6, map.w - EDGE - 7);
        const y = rng.int(EDGE + 6, map.h - EDGE - 7);

        if(map.tiles[y * map.w + x] !== FLOOR)
            continue;

        const angle = rng.range(0, TAU);
        const reach = rng.range(9, 16);
        const keep = (value, size) => Math.max(EDGE + 4, Math.min(size - EDGE - 5, value));

        const end = {
            x: keep(x + Math.cos(angle) * reach, map.w),
            y: keep(y + Math.sin(angle) * reach, map.h)
        };

        // only into solid rock, so it really is a side passage
        if(map.tiles[Math.floor(end.y) * map.w + Math.floor(end.x)] !== WALL)
            continue;

        dig(rng, map, {x: x + 0.5, y: y + 0.5}, end, 1.2, 60);
        disc(map, end.x, end.y, rng.range(2.2, 3));

        nooks.push(end);

    }

    return nooks;

}


// a couple of crates in a pocket
function stash(rng, map, nook){

    const x = Math.floor(nook.x);
    const y = Math.floor(nook.y);

    for(const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]){

        const i = (y + dy) * map.w + x + dx;

        if(map.tiles[i] === FLOOR && rng.chance(0.55))
            map.tiles[i] = CRATE;

    }

}


// ragged edges: nibble at the walls, then tidy single-tile spikes and nubs
function roughen(rng, map){

    const {w, h, tiles} = map;

    const floors = (x, y, diagonal) => {

        let count = 0;

        for(let dy = -1; dy <= 1; dy++){

            for(let dx = -1; dx <= 1; dx++){

                if((dx || dy) && (diagonal || !dx || !dy) && tiles[(y + dy) * w + x + dx] === FLOOR)
                    count++;

            }

        }

        return count;

    };

    const each = fn => {

        const changes = [];

        for(let y = EDGE; y < h - EDGE; y++){

            for(let x = EDGE; x < w - EDGE; x++){

                const to = fn(x, y, tiles[y * w + x]);

                if(to)
                    changes.push(y * w + x, to);

            }

        }

        for(let i = 0; i < changes.length; i += 2)
            tiles[changes[i]] = changes[i + 1];

    };

    each((x, y, t) => t === WALL && floors(x, y, false) > 0 && rng.chance(0.12) ? FLOOR : 0);

    for(let pass = 0; pass < 2; pass++){

        each((x, y, t) => {

            if(t === WALL && floors(x, y, true) >= 5)
                return FLOOR;

            if(t === FLOOR && floors(x, y, false) <= 1 && floors(x, y, true) <= 2)
                return WALL;

            return 0;

        });

    }

}


/* ---------------- Distances ---------------- */

// steps from a chamber's centre to every tile (-1 = cannot get there);
// `wide` only walks where the biggest enemies fit
function distances(map, from, wide = false){

    const {w, h, tiles} = map;
    const dist = new Int32Array(w * h).fill(-1);
    const queue = new Int32Array(w * h);
    const open = i => wide ? map.wide[i] === 1 : tiles[i] === FLOOR;

    let head = 0;
    let tail = 0;

    queue[tail++] = tile(map, from);
    dist[queue[0]] = 0;

    while(head < tail){

        const i = queue[head++];
        const x = i % w;
        const y = (i - x) / w;

        for(const [dx, dy] of NEIGHBOURS){

            const nx = x + dx;
            const ny = y + dy;
            const n = ny * w + nx;

            if(nx < 0 || ny < 0 || nx >= w || ny >= h || dist[n] >= 0 || !open(n))
                continue;

            dist[n] = dist[i] + 1;
            queue[tail++] = n;

        }

    }

    return dist;

}


function farthest(map, chambers, dist, from){

    let best = from;
    let bestD = -1;

    for(const c of chambers){

        const d = dist[tile(map, c)];

        if(d > bestD){

            best = c;
            bestD = d;

        }

    }

    return best;

}


/* ---------------- Furniture and enemies ---------------- */

// rock pillars and crates inside a chamber, away from its centre
function decorate(rng, map, c){

    const {w, tiles} = map;

    const clear = (x, y, reach) => {

        for(let dy = -reach; dy <= reach + 1; dy++){

            for(let dx = -reach; dx <= reach + 1; dx++){

                if(tiles[(y + dy) * w + x + dx] !== FLOOR)
                    return false;

            }

        }

        return true;

    };

    const somewhere = (low, high) => {

        const angle = rng.range(0, TAU);
        const r = rng.range(low, high);

        return [Math.floor(c.x + Math.cos(angle) * c.rx * r), Math.floor(c.y + Math.sin(angle) * c.ry * r)];

    };

    // 2x2 pillars with two clear tiles all round, so there is always a way past
    for(let i = c.rx >= 5 ? rng.int(0, 2) : 0; i > 0; i--){

        const [x, y] = somewhere(0.4, 0.75);

        if(clear(x, y, 2)){

            for(const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]])
                tiles[(y + dy) * w + x + dx] = WALL;

        }

    }

    if(c.kind === "start")
        return;

    for(let i = rng.int(1, 5); i > 0; i--){

        const [x, y] = somewhere(0.3, 0.9);

        // the middle stays free (chests and portals stand there)
        if(Math.abs(x - Math.floor(c.x)) <= 1 && Math.abs(y - Math.floor(c.y)) <= 1)
            continue;

        if(!clear(x, y, 1))
            continue;

        tiles[y * w + x] = CRATE;

        if(rng.chance(0.4))
            tiles[y * w + x + 1] = CRATE;

    }

}


// Where enemy packs begin. Every chamber but the first has one; a few more
// wait in the tunnels; the deepest ordinary pack is led by a champion.
function placeCamps(rng, map, chambers, dist, floor){

    const base = Math.min(20, 4 + floor * 1.15);
    const camps = [];

    for(const c of chambers){

        if(c.kind === "start" || c.kind === "arena")
            continue;

        const size = Math.max(0.7, Math.min(1.6, Math.PI * c.rx * c.ry / 70));
        const bonus = c.kind === "treasure" ? 1.35 : c.kind === "exit" ? 1.2 : 1;

        camps.push({
            ...centre(c),
            budget: Math.round(base * size * bonus),
            kind: c.kind === "treasure" ? "guard" : "pack",
            depth: dist[tile(map, c)],
            den: !c.kind
        });

    }

    const inChamber = (x, y) =>
        chambers.some(c => ((x - c.x) / (c.rx + 2)) ** 2 + ((y - c.y) / (c.ry + 2)) ** 2 < 1);

    let wanted = Math.min(8, 3 + Math.floor(floor / 2));

    for(let tries = 0; tries < 400 && wanted > 0; tries++){

        const x = rng.int(EDGE, map.w - EDGE - 1);
        const y = rng.int(EDGE, map.h - EDGE - 1);
        const depth = dist[y * map.w + x];
        const spot = {x: (x + 0.5) * TILE, y: (y + 0.5) * TILE};

        if(depth < QUIET + 2 || inChamber(x, y))
            continue;

        if(camps.some(camp => Math.hypot(camp.x - spot.x, camp.y - spot.y) < 10 * TILE))
            continue;

        camps.push({...spot, budget: Math.round(base * 0.55), kind: "pack", depth, den: false});

        wanted--;

    }

    if(floor >= 2){

        const dens = camps.filter(camp => camp.den).sort((a, b) => b.depth - a.depth);

        if(dens.length)
            dens[0].kind = "champion";

    }

    map.camps = camps.filter(camp => camp.depth >= QUIET);

}


/* ---------------- Lobby ---------------- */

// the hub: one big room
export function generateLobby(){

    const map = createMap(33, 21);

    for(let y = 2; y < 19; y++){

        for(let x = 2; x < 31; x++)
            map.tiles[y * map.w + x] = FLOOR;

    }

    markWide(map);

    map.start = {x: 10 * TILE, y: 10.5 * TILE};
    map.lobby = true;

    return map;

}
