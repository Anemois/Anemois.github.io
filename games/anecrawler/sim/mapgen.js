import {TILE, WORLDS} from "./data.js";
import {createMap, markWide, walkable, FLOOR, WALL, CRATE, WATER, CHASM, LAVA, DECOR} from "./map.js";


// Every floor is one continuous cave: a handful of chambers carved out of
// solid rock, joined by winding tunnels (a spanning tree plus a few loops),
// then roughened. Each world carves its own way (WORLDS.terrain): the Crypt
// and the Furnace cut square halls with straight walls, the Grove and the
// Abyss grow round caves; then each adds its ground (ponds, chasms, lava
// rivers), vents and decorations. The same seed always gives the same
// floor, so every player can build it locally.

const EDGE = 3;                 // rock kept around the outside, tiles
const QUIET = 14;               // no enemies this close (in steps) to the start
const TAU = Math.PI * 2;

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const VENT_PERIOD = 4.2;         // seconds between a vent's eruptions
export const VENT_WARN = 0.9;           // ...it glows this long before
export const VENT_BLAST = 0.25;         // ...and burns this long

const GROUNDS = {water: WATER, chasm: CHASM, lava: LAVA};

const DECOR_KIND = {
    bones: DECOR.BONES, candle: DECOR.CANDLE, crack: DECOR.CRACK, tomb: DECOR.TOMB, cobweb: DECOR.COBWEB,
    grass: DECOR.GRASS, flower: DECOR.FLOWER, mushroom: DECOR.MUSHROOM, root: DECOR.ROOT,
    crystal: DECOR.CRYSTAL, rune: DECOR.RUNE, shard: DECOR.SHARD,
    grate: DECOR.GRATE, ash: DECOR.ASH
};

// decorations that only sit against rock
const BY_WALL = new Set(["candle", "cobweb", "root", "mushroom", "crystal"]);


// world: the floor's world index (data.js worldIndex)
export function generateFloor(rng, {floor, boss, world = 0}){

    const style = WORLDS[((world % WORLDS.length) + WORLDS.length) % WORLDS.length].terrain;

    for(let attempt = 0; attempt < 40; attempt++){

        const map = build(rng, floor, boss, style);

        if(map)
            return map;

    }

    throw new Error("could not build a floor");

}


function build(rng, floor, boss, style){

    const w = Math.min(120, 84 + floor * 3);
    const h = Math.min(88, 62 + floor * 2);
    const map = createMap(w, h);

    const chambers = placeChambers(rng, map, floor, boss);

    if(chambers.length < 5)
        return null;

    const edges = connect(rng, chambers, Math.max(w, h));

    for(const c of chambers)
        carveChamber(rng, map, c, style);

    for(const [a, b] of edges)
        carveTunnel(rng, map, chambers[a], chambers[b], style);

    const nooks = carveNooks(rng, map, 3 + Math.floor(floor / 3));

    roughen(rng, map, style.rough);

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
            decorate(rng, map, c, style);

    }

    markWide(map);

    if(style.ground)
        lay(rng, map, chambers, start, GROUNDS[style.ground], floor);

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

    if(style.vents)
        placeVents(rng, map, dist, floor);

    sprinkle(rng, map, style.decor);

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


// an ellipse with a few bulges on its rim (the boss arena stays round),
// or in hall worlds a squared-off room
function carveChamber(rng, map, c, style){

    if(style.halls && !(c.rx === c.ry && c.rx > 9))
        return carveHall(rng, map, c);

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


// A hall: a rectangle with its corners cut off, and a few alcoves set
// into its walls.
function carveHall(rng, map, c){

    const x0 = Math.max(EDGE, Math.round(c.x - c.rx));
    const x1 = Math.min(map.w - EDGE - 1, Math.round(c.x + c.rx) - 1);
    const y0 = Math.max(EDGE, Math.round(c.y - c.ry));
    const y1 = Math.min(map.h - EDGE - 1, Math.round(c.y + c.ry) - 1);
    const cut = rng.int(0, 1);

    for(let ty = y0; ty <= y1; ty++){

        for(let tx = x0; tx <= x1; tx++){

            const corner = Math.min(tx - x0, x1 - tx) + Math.min(ty - y0, y1 - ty);

            if(corner >= cut)
                map.tiles[ty * map.w + tx] = FLOOR;

        }

    }

    const open = (ax, ay, bx, by) => {

        for(let ty = Math.max(EDGE, ay); ty <= Math.min(map.h - EDGE - 1, by); ty++)
            for(let tx = Math.max(EDGE, ax); tx <= Math.min(map.w - EDGE - 1, bx); tx++)
                map.tiles[ty * map.w + tx] = FLOOR;

    };

    for(let i = rng.int(1, 3); i > 0; i--){

        const across = rng.int(2, 3);
        const deep = rng.int(1, 2);

        switch(rng.int(0, 3)){

            case 0: { const x = rng.int(x0 + 1, x1 - across); open(x, y0 - deep, x + across - 1, y0 - 1); break; }
            case 1: { const x = rng.int(x0 + 1, x1 - across); open(x, y1 + 1, x + across - 1, y1 + deep); break; }
            case 2: { const y = rng.int(y0 + 1, y1 - across); open(x0 - deep, y, x0 - 1, y + across - 1); break; }
            default: { const y = rng.int(y0 + 1, y1 - across); open(x1 + 1, y, x1 + deep, y + across - 1); break; }

        }

    }

}


// Tunnels bend through a point off to one side, so they curve instead of
// running straight from chamber to chamber.
function carveTunnel(rng, map, a, b, style){

    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const bend = rng.range(-0.3, 0.3) * length;
    const keep = (value, size) => Math.max(EDGE + 4, Math.min(size - EDGE - 5, value));

    const via = {
        x: keep((a.x + b.x) / 2 - (b.y - a.y) / length * bend, map.w),
        y: keep((a.y + b.y) / 2 + (b.x - a.x) / length * bend, map.h)
    };

    const width = rng.range(1.2, 1.75);

    dig(rng, map, a, via, width, 800, style.sway);
    dig(rng, map, via, b, width, 800, style.sway);

}


// a walker heads for a point, swaying, and digs as it goes; now and then
// the passage opens out into a small cave
function dig(rng, map, from, to, width, limit = 800, wander = 1){

    const sway = rng.range(0.5, 1.1) * wander;
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
function roughen(rng, map, nibble = 0.12){

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

    each((x, y, t) => t === WALL && floors(x, y, false) > 0 && rng.chance(nibble) ? FLOOR : 0);

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
    const open = i => wide ? map.wide[i] === 1 : walkable(tiles[i]);

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
function decorate(rng, map, c, style){

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

    const pillar = (x, y) => {

        for(const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]])
            tiles[(y + dy) * w + x + dx] = WALL;

    };

    // 2x2 pillars with two clear tiles all round, so there is always a way
    // past; halls stand theirs in mirrored pairs, like columns
    for(let i = c.rx >= 5 ? rng.int(0, style.pillars ?? 2) : 0; i > 0; i--){

        const [x, y] = somewhere(0.4, 0.75);

        if(style.halls){

            const mx = Math.floor(2 * c.x - x - 2);

            if(Math.abs(mx - x) > 3 && clear(x, y, 2) && clear(mx, y, 2)){

                pillar(x, y);
                pillar(mx, y);

            }

        }
        else if(clear(x, y, 2)){

            pillar(x, y);

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


/* ---------------- Ground, vents and decorations ---------------- */

// Lays a world's ground (ponds, chasms or lava) in blobs and rifts across
// the cave. Each piece is kept only if every chamber can still be reached
// by the biggest enemies; the middle of each chamber stays plain floor
// (chests, portals and packs stand there).
function lay(rng, map, chambers, start, kind, floor){

    const {w, h, tiles} = map;
    const centres = chambers.map(c => tile(map, c));

    const near = (tx, ty) => chambers.some(c => Math.abs(tx + 0.5 - c.x) < 2.5 && Math.abs(ty + 0.5 - c.y) < 2.5);

    // tries one piece; puts things back if it cut the cave apart
    const piece = cells => {

        const changed = [];

        for(const i of cells){

            const tx = i % w;
            const ty = (i - tx) / w;

            if(tiles[i] === FLOOR && !near(tx, ty)){

                changed.push(i);
                tiles[i] = kind;

            }

        }

        if(!changed.length)
            return;

        markWide(map);

        const dist = distances(map, start, true);

        if(centres.some(i => dist[i] < 0)){

            for(const i of changed)
                tiles[i] = FLOOR;

            markWide(map);

        }

    };

    const blob = (cx, cy, r) => {

        const cells = [];

        // a few overlapping discs, so no two look alike
        const parts = [[cx, cy, r]];

        for(let k = rng.int(1, 3); k > 0; k--){

            const a = rng.range(0, TAU);

            parts.push([cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7, r * rng.range(0.5, 0.85)]);

        }

        for(const [px, py, pr] of parts){

            for(let ty = Math.max(EDGE, Math.floor(py - pr)); ty <= Math.min(h - EDGE - 1, Math.ceil(py + pr)); ty++)
                for(let tx = Math.max(EDGE, Math.floor(px - pr)); tx <= Math.min(w - EDGE - 1, Math.ceil(px + pr)); tx++)
                    if((tx + 0.5 - px) ** 2 + (ty + 0.5 - py) ** 2 <= pr * pr)
                        cells.push(ty * w + tx);

        }

        piece(cells);

    };

    // pools in the chambers
    for(const c of chambers){

        if(c.kind === "start" || c.kind === "arena")
            continue;

        // (chasms eat in from the edges: the room drops away into the dark)
        const count = kind === WATER ? rng.int(1, 3) : kind === CHASM ? rng.int(2, 4) : rng.int(0, 2) + (c.rx > 6 ? 1 : 0);

        for(let i = 0; i < count; i++){

            const a = rng.range(0, TAU);
            const k = kind === CHASM ? rng.range(0.6, 1.05) : rng.range(0.35, 0.75);

            blob(c.x + Math.cos(a) * c.rx * k, c.y + Math.sin(a) * c.ry * k, kind === CHASM ? rng.range(2, 3.6) : rng.range(1.5, kind === WATER ? 3.2 : 2.8));

        }

    }

    // rifts: long thin runs across the cave (lava rivers, cracks into the dark)
    if(kind !== WATER){

        for(let i = 1 + Math.min(3, Math.floor(floor / 4)); i > 0; i--){

            const c = rng.pick(chambers);

            if(c.kind === "start" || c.kind === "arena")
                continue;

            const a = rng.range(0, TAU);
            const length = rng.range(8, 16);
            const cells = [];

            let x = c.x + Math.cos(a) * c.rx * 0.6;
            let y = c.y + Math.sin(a) * c.ry * 0.6;
            let heading = a + Math.PI / 2 + rng.range(-0.6, 0.6);

            for(let d = 0; d < length; d += 0.5){

                heading += rng.range(-0.25, 0.25);
                x += Math.cos(heading) * 0.5;
                y += Math.sin(heading) * 0.5;

                const tx = Math.floor(x);
                const ty = Math.floor(y);

                if(tx < EDGE || ty < EDGE || tx >= w - EDGE || ty >= h - EDGE)
                    break;

                cells.push(ty * w + tx);

                // chasms open wide; lava runs in narrower channels
                if(kind === CHASM || rng.chance(0.4))
                    cells.push(ty * w + tx + 1);

                if(kind === CHASM && rng.chance(0.5))
                    cells.push((ty + 1) * w + tx);

            }

            piece(cells);

        }

    }
    else{

        // and puddles along the tunnels
        for(let i = rng.int(4, 8); i > 0; i--){

            const tx = rng.int(EDGE, w - EDGE - 1);
            const ty = rng.int(EDGE, h - EDGE - 1);

            if(tiles[ty * w + tx] === FLOOR)
                blob(tx + 0.5, ty + 0.5, rng.range(1, 1.7));

        }

    }

    markWide(map);

}


// fire vents in the floor, none too near the start
function placeVents(rng, map, dist, floor){

    const wanted = 6 + Math.min(14, floor);

    for(let tries = 0; tries < 600 && map.vents.length < wanted; tries++){

        const tx = rng.int(EDGE, map.w - EDGE - 1);
        const ty = rng.int(EDGE, map.h - EDGE - 1);
        const i = ty * map.w + tx;

        if(map.tiles[i] !== FLOOR || dist[i] < QUIET || map.decor[i])
            continue;

        map.decor[i] = DECOR.VENT;
        map.vents.push({x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, phase: rng.range(0, VENT_PERIOD)});

    }

}


// things lying about: bones, grass, crystals... (only drawn)
function sprinkle(rng, map, decor){

    if(!decor)
        return;

    const {w, h, tiles} = map;
    const kinds = Object.entries(decor);

    const rock = (x, y) => tiles[y * w + x] === WALL;

    for(let ty = EDGE; ty < h - EDGE; ty++){

        for(let tx = EDGE; tx < w - EDGE; tx++){

            const i = ty * w + tx;

            if(tiles[i] !== FLOOR || map.decor[i])
                continue;

            const byWall = rock(tx, ty - 1) || rock(tx - 1, ty) || rock(tx + 1, ty) || rock(tx, ty + 1);
            const corner = rock(tx, ty - 1) && (rock(tx - 1, ty) || rock(tx + 1, ty));

            for(const [kind, share] of kinds){

                if(kind === "cobweb" ? !corner : BY_WALL.has(kind) && !byWall)
                    continue;

                if(rng.chance(share)){

                    map.decor[i] = DECOR_KIND[kind];

                    break;

                }

            }

        }

    }

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
