import {TILE, ZONES} from "../sim/data.js";
import {FLOOR, WALL, CRATE, WATER, CHASM, LAVA, VOID, DECOR} from "../sim/map.js";
import {VENT_PERIOD, VENT_WARN, VENT_BLAST} from "../sim/mapgen.js";
import {ventCycle} from "../sim/ground.js";
import {alpha} from "../../../lib/fx.js";


// What makes each world look like itself, beyond its colours: its ground
// (ponds, chasms, lava), the things lying about (bones and candles, grass
// and glowing mushrooms, crystals, grates and vents), the texture of its
// rock, its own lights, and what drifts in its air (dust, fireflies,
// rising motes, embers). Nothing here changes the game.

const TAU = Math.PI * 2;

// per world: the dark (rgb of the unlit cave) and what floats in the air
const AIR = {
    dust:      {shade: "7, 6, 5"},
    fireflies: {shade: "3, 8, 5"},
    motes:     {shade: "6, 3, 12"},
    embers:    {shade: "10, 4, 2"}
};

// lights that things in the world give off: lamp radius, strength, glow colour
const GLOWS = {
    [DECOR.CANDLE]:   {r: 85, strength: 0.6, colour: "#ffb347", flicker: 0.25},
    [DECOR.MUSHROOM]: {r: 60, strength: 0.5, colour: "#5eead4", pulse: 1.3},
    [DECOR.CRYSTAL]:  {r: 75, strength: 0.55, colour: "#a78bfa", pulse: 0.8},
    [DECOR.RUNE]:     {r: 40, strength: 0.4, colour: "#c4b5fd", pulse: 2}
};

const LAVA_GLOW = {r: 95, strength: 0.6, colour: "#ff7a1a", flicker: 0.15};

// molten rock from crusted to white-hot
const LAVA_SHADES = ["#7c2a0a", "#93330c", "#ab3f0e", "#c24d10", "#d65f14", "#e8761c", "#f59331", "#fbb04f"];


export function createTerrain(ctx, fx){

    let map = null;
    let world = null;
    let sources = [];               // {x, y, r, strength, colour, flicker, pulse, seed}
    let shafts = [];                // {x, y, seed}: light falling through cracks above (Crypt, Grove)
    let rifts = [];                 // {x, y, seed}: chasm edges the deep light rises from (Abyss)
    let spawn = 0;                  // ambient particles owed

    const sprites = new Map();      // colour -> soft round glow


    // a soft round glow in one colour, drawn additively for coloured light
    function glowSprite(colour){

        let sprite = sprites.get(colour);

        if(!sprite){

            sprite = document.createElement("canvas");
            sprite.width = sprite.height = 64;

            const g = sprite.getContext("2d");
            const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);

            gradient.addColorStop(0, alpha(colour, 0.9));
            gradient.addColorStop(0.4, alpha(colour, 0.35));
            gradient.addColorStop(1, alpha(colour, 0));

            g.fillStyle = gradient;
            g.fillRect(0, 0, 64, 64);

            sprites.set(colour, sprite);

        }

        return sprite;

    }


    function glow(x, y, r, colour, strength){

        if(strength <= 0.01)
            return;

        ctx.globalAlpha = Math.min(1, strength);
        ctx.drawImage(glowSprite(colour), x - r, y - r, r * 2, r * 2);

    }


    // a new floor: find what glows in it
    function reset(newMap, newWorld){

        map = newMap;
        world = newWorld;
        sources = [];
        shafts = [];
        rifts = [];

        if(!map || !world)
            return;

        const {w, h, tiles, decor} = map;

        const open = (x, y) => tiles[y * w + x] === FLOOR;

        for(let i = 0; i < w * h; i++){

            const tx = i % w;
            const ty = (i - tx) / w;
            const x = (tx + 0.5) * TILE;
            const y = (ty + 0.5) * TILE;
            const seed = (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0;

            if(GLOWS[decor[i]])
                sources.push({x, y, seed, ...GLOWS[decor[i]]});

            // every few lava tiles light the cave around them
            if(tiles[i] === LAVA && (tx * 7 + ty * 13) % 4 === 0)
                sources.push({x, y, seed, ...LAVA_GLOW});

            // light through a crack in the ceiling, over open floor
            if((world.id === "crypt" || world.id === "grove") && seed % 211 === 0 &&
                tx > 1 && ty > 1 && tx < w - 2 && ty < h - 2 &&
                open(tx, ty) && open(tx - 1, ty) && open(tx + 1, ty) && open(tx, ty - 1) && open(tx, ty + 1))
                shafts.push({x, y, seed});

            // the Abyss glows faintly up out of its chasms
            if(tiles[i] === CHASM && seed % 5 === 0)
                rifts.push({x, y, seed});

        }

    }


    const level = (s, time) => {

        let k = s.strength;

        if(s.flicker)
            k *= 1 - s.flicker * (0.5 + 0.5 * Math.sin(time * 13 + s.seed % 97) * Math.sin(time * 7.3 + s.seed % 31));

        if(s.pulse)
            k *= 0.7 + 0.3 * Math.sin(time * s.pulse + s.seed % 57);

        return k;

    };


    /* ---- the dark ---- */

    const shade = () => AIR[world?.ambience]?.shade ?? "4, 4, 8";


    // Light from the world's own things: lamp(x, y, r, strength, colour)
    // cuts the dark and tints it. `streak` draws a long soft beam of
    // coloured light (for the shafts falling through the ceiling).
    function lights(lamp, streak, visible, time, worldTime){

        for(const s of sources)
            if(visible(s.x, s.y, s.r))
                lamp(s.x, s.y, s.r, level(s, time), s.colour);

        for(const v of map?.vents ?? []){

            if(!visible(v.x, v.y, 60))
                continue;

            const heat = ventHeat(v, worldTime);

            if(heat > 0.05)
                lamp(v.x, v.y, 30 + heat * 60, heat * 0.8, "#ff6a1a");

        }

        // shafts of light: a slanted beam through the air, a pool on the floor
        for(const s of shafts){

            if(!visible(s.x, s.y, 140))
                continue;

            const breathe = 0.75 + 0.25 * Math.sin(time * 0.4 + (s.seed & 63));
            const hue = world.id === "grove" ? "#e6f5a8" : "#ffe1b0";

            streak(s.x - 46, s.y - 120, s.x, s.y, 16, hue, 0.1 * breathe);
            lamp(s.x, s.y, 58, 0.5 * breathe, hue);

            // dust turning in the beam
            if(Math.random() < 0.05)
                fx.burst(s.x - 46 * Math.random(), s.y - 120 * Math.random(), {count: 1, colour: hue, speed: 4, life: 3, size: 1.3, gravity: 3, drag: 0.2, shape: "dot", glow: true});

        }

        // the deep light of the Abyss, swelling now and then
        const surge = abyssSurge(time);

        for(const r of rifts)
            if(visible(r.x, r.y, 60))
                lamp(r.x, r.y, 40 + surge * 40, (0.12 + 0.1 * Math.sin(time * 0.9 + (r.seed & 63))) + surge * 0.35, "#7c3aed");

    }


    // 0..1: the Abyss's slow surges of light from below (every 9-14 s)
    function abyssSurge(time){

        if(world?.id !== "abyss")
            return 0;

        const cycle = 11.5;
        const t = (time + 3) % cycle;

        return t < 1.6 ? Math.sin(t / 1.6 * Math.PI) ** 2 : 0;

    }


    // how each world's darkness moves: {dark: change in darkness, wash:
    // a colour over the whole view and how strong}
    function mood(time){

        switch(world?.id){

            case "grove":

                return {dark: 0.02 * Math.sin(time * 0.35), wash: null};

            case "abyss": {

                const surge = abyssSurge(time);

                return {dark: -0.1 * surge, wash: surge > 0.02 ? ["#7c3aed", 0.09 * surge] : null};

            }

            case "furnace": {

                // the lava's heat breathes, unevenly
                const heat = Math.sin(time * 1.3) * Math.sin(time * 0.37 + 1) * 0.5 + 0.5;

                return {dark: -0.04 * heat, wash: ["#ff6a1a", 0.025 + 0.025 * heat]};

            }

            default:

                return {dark: 0, wash: null};

        }

    }


    // 0..1: how hot a vent is right now (it glows, then bursts)
    function ventHeat(v, worldTime){

        const c = ventCycle(v, worldTime);
        const warm = VENT_PERIOD - VENT_BLAST - VENT_WARN;

        if(c < warm)
            return 0.08;

        if(c < VENT_PERIOD - VENT_BLAST)
            return 0.08 + 0.6 * (c - warm) / VENT_WARN;

        return 1;

    }


    /* ---- ground ---- */

    // the special tiles: water, chasm, lava. `open(tx, ty)`: not rock.
    function ground(tile, tx, ty, x, y, noise, time, kindAt, shades){

        if(tile === WATER){

            ctx.fillStyle = "#0a2326";
            ctx.fillRect(x, y, TILE, TILE);

            const t = time * 0.7 + (noise & 15);

            ctx.fillStyle = alpha("#7dd3c8", 0.1 + 0.07 * Math.sin(time * 2 + (noise & 31)));
            ctx.fillRect(x + (noise >>> 3) % 18 + Math.sin(t) * 3, y + (noise >>> 8) % 22 + 4, 9, 1);
            ctx.fillRect(x + (noise >>> 11) % 16 + Math.cos(t * 0.8) * 3, y + (noise >>> 15) % 20 + 7, 6, 1);

            // pale shoreline
            ctx.fillStyle = "rgba(125, 211, 200, 0.22)";
            shore(tx, ty, x, y, kindAt, other => other !== WATER, 2);

            return;

        }

        if(tile === CHASM){

            ctx.fillStyle = "#030206";
            ctx.fillRect(x, y, TILE, TILE);

            // the cliff face where the floor above drops away
            const above = kindAt(tx, ty - 1);

            if(above !== CHASM && above !== WALL && above !== VOID){

                ctx.fillStyle = shades.face;
                ctx.fillRect(x, y, TILE, 9);

                ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
                ctx.fillRect(x, y + 9, TILE, 6);

            }

            // far below, something glimmers
            if(noise % 9 === 0){

                ctx.fillStyle = alpha("#a78bfa", 0.15 + 0.15 * Math.sin(time * 1.7 + (noise & 63)));
                ctx.fillRect(x + (noise >>> 5) % 26 + 3, y + (noise >>> 10) % 22 + 8, 1.5, 1.5);

            }

            ctx.fillStyle = "rgba(167, 139, 250, 0.28)";
            shore(tx, ty, x, y, kindAt, other => other !== CHASM && other !== WALL && other !== VOID, 1);

            return;

        }

        if(tile === LAVA){

            // molten rock that churns: brightness flows across the pool in
            // slow waves (worked out per quarter tile, so it reads as one
            // pool and not a grid), with a dark crust drifting over it
            for(let q = 0; q < 4; q++){

                const qx = x + (q & 1) * 16;
                const qy = y + (q >> 1) * 16;
                const wx = qx + 8;
                const wy = qy + 8;
                const heat = 0.5 + 0.25 * Math.sin(wx * 0.045 + time * 0.9) + 0.25 * Math.sin(wy * 0.05 - time * 0.7 + wx * 0.02);

                ctx.fillStyle = LAVA_SHADES[Math.max(0, Math.min(LAVA_SHADES.length - 1, Math.round(heat * (LAVA_SHADES.length - 1))))];
                ctx.fillRect(qx, qy, 16, 16);

            }

            const drift = (time * 4 + (noise & 31)) % TILE;

            ctx.fillStyle = "rgba(60, 22, 8, 0.45)";
            ctx.beginPath();
            ctx.ellipse(x + drift * 0.8 + 4, y + (noise >>> 6) % 20 + 6, 6, 3, 0, 0, TAU);
            ctx.fill();

            ctx.fillStyle = alpha("#fde68a", 0.3 + 0.3 * Math.sin(time * 3 + (noise & 63)));
            ctx.fillRect(x + (noise >>> 9) % 22 + 4, y + (noise >>> 14) % 22 + 4, 5, 1.5);

            // a dark crust where it meets the floor
            ctx.fillStyle = "rgba(40, 14, 4, 0.8)";
            shore(tx, ty, x, y, kindAt, other => other !== LAVA && other !== WALL && other !== VOID, 3);

            // and now and then it spits
            if(Math.random() < 0.004)
                fx.burst(x + TILE / 2, y + TILE / 2, {count: 3, colour: "#fdba74", speed: 50, life: 0.6, size: 2, gravity: 120, glow: true, angle: -Math.PI / 2, spread: 1});

        }

    }


    // edge strips on the sides of (tx, ty) whose neighbour passes `test`
    function shore(tx, ty, x, y, kindAt, test, width){

        if(test(kindAt(tx, ty - 1)))
            ctx.fillRect(x, y, TILE, width);

        if(test(kindAt(tx, ty + 1)))
            ctx.fillRect(x, y + TILE - width, TILE, width);

        if(test(kindAt(tx - 1, ty)))
            ctx.fillRect(x, y, width, TILE);

        if(test(kindAt(tx + 1, ty)))
            ctx.fillRect(x + TILE - width, y, width, TILE);

    }


    /* ---- rock ---- */

    // a little texture on the rock tops, different in each world
    function rock(x, y, noise, ty, face){

        switch(world?.id){

            case "crypt":
            case "furnace": {

                // laid stone: mortar lines, offset every other row
                ctx.fillStyle = world.id === "crypt" ? "rgba(0, 0, 0, 0.22)" : "rgba(0, 0, 0, 0.3)";
                ctx.fillRect(x, y + TILE / 2, TILE, 1);

                const off = ty % 2 ? TILE / 2 : 0;

                ctx.fillRect(x + off, y, 1, TILE / 2);
                ctx.fillRect(x + (off + TILE / 2) % TILE, y + TILE / 2, 1, TILE / 2);

                // the Furnace's rock is hot inside
                if(world.id === "furnace" && face && noise % 5 === 0){

                    ctx.fillStyle = "rgba(255, 106, 26, 0.45)";
                    ctx.fillRect(x + (noise >>> 4) % 22 + 3, y + TILE - 8, 6, 1);
                    ctx.fillRect(x + (noise >>> 4) % 22 + 8, y + TILE - 6, 1, 3);

                }

                break;

            }

            case "grove":

                // moss along the rock
                if(noise % 3 === 0){

                    ctx.fillStyle = "rgba(74, 122, 58, 0.55)";
                    ctx.fillRect(x + (noise >>> 4) % 26, y + (noise >>> 9) % 26, 4, 3);
                    ctx.fillRect(x + (noise >>> 13) % 26, y + (noise >>> 17) % 26, 3, 2);

                }

                break;

            case "abyss":

                // glints of crystal in the stone
                if(noise % 6 === 0){

                    ctx.fillStyle = "rgba(167, 139, 250, 0.4)";
                    ctx.beginPath();
                    ctx.moveTo(x + 10 + (noise >>> 5) % 12, y + 8);
                    ctx.lineTo(x + 14 + (noise >>> 5) % 12, y + 16);
                    ctx.lineTo(x + 6 + (noise >>> 5) % 12, y + 16);
                    ctx.fill();

                }

                break;

        }

    }


    /* ---- things lying about ---- */

    function decor(kind, x, y, noise, time, worldTime, kindAt, tx, ty){

        const px = x + (noise >>> 5) % 18 + 7;
        const py = y + (noise >>> 10) % 18 + 7;

        switch(kind){

            case DECOR.BONES: {

                ctx.strokeStyle = "rgba(170, 164, 150, 0.55)";
                ctx.lineWidth = 1.5;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(px - 5, py - 2);
                ctx.lineTo(px + 5, py + 2);
                ctx.moveTo(px - 3, py + 4);
                ctx.lineTo(px + 3, py - 3);
                ctx.stroke();

                if(noise % 3 === 0){

                    ctx.fillStyle = "rgba(190, 184, 170, 0.6)";
                    ctx.beginPath();
                    ctx.arc(px + 6, py - 5, 3, 0, TAU);
                    ctx.fill();

                }

                break;

            }

            case DECOR.CANDLE: {

                const flame = 1 + 0.3 * Math.sin(time * 14 + (noise & 63));

                ctx.fillStyle = "#cfc6b4";
                ctx.fillRect(px - 1.5, py - 6, 3, 7);

                ctx.fillStyle = "#ffcf87";
                ctx.beginPath();
                ctx.ellipse(px, py - 8.5, 1.6, 2.6 * flame, 0, 0, TAU);
                ctx.fill();

                break;

            }

            case DECOR.CRACK: {

                ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x + 4, y + (noise >>> 3) % 20 + 6);
                ctx.lineTo(x + 12, y + (noise >>> 7) % 20 + 6);
                ctx.lineTo(x + 19, y + (noise >>> 11) % 20 + 6);
                ctx.lineTo(x + 28, y + (noise >>> 15) % 20 + 6);
                ctx.stroke();

                break;

            }

            case DECOR.TOMB: {

                ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
                ctx.fillRect(px - 6, py + 3, 12, 3);

                ctx.fillStyle = "#34343a";
                ctx.beginPath();
                ctx.moveTo(px - 6, py + 4);
                ctx.lineTo(px - 6, py - 5);
                ctx.arc(px, py - 5, 6, Math.PI, 0);
                ctx.lineTo(px + 6, py + 4);
                ctx.fill();

                ctx.fillStyle = "#1c1c20";
                ctx.fillRect(px - 0.75, py - 7, 1.5, 7);
                ctx.fillRect(px - 3, py - 5, 6, 1.5);

                break;

            }

            case DECOR.COBWEB: {

                // in the corner where the rock meets above and to one side
                const left = kindAt(tx - 1, ty) === WALL;
                const cx = left ? x : x + TILE;
                const dir = left ? 1 : -1;

                ctx.strokeStyle = "rgba(210, 210, 210, 0.13)";
                ctx.lineWidth = 0.8;
                ctx.beginPath();

                for(let k = 0; k < 4; k++){

                    const a = k / 3 * Math.PI / 2;

                    ctx.moveTo(cx, y);
                    ctx.lineTo(cx + dir * Math.cos(a) * 16, y + Math.sin(a) * 16);

                }

                for(const r of [6, 11]){

                    ctx.moveTo(cx + dir * r, y);
                    ctx.quadraticCurveTo(cx + dir * r * 0.55, y + r * 0.55, cx, y + r);

                }

                ctx.stroke();

                break;

            }

            case DECOR.GRASS:
            case DECOR.FLOWER: {

                const sway = Math.sin(time * 1.6 + (noise & 63)) * 1.2;

                ctx.strokeStyle = noise % 2 ? "rgba(74, 128, 62, 0.75)" : "rgba(98, 150, 70, 0.7)";
                ctx.lineWidth = 1;
                ctx.beginPath();

                for(let k = 0; k < 4; k++){

                    const bx = px - 5 + k * 3.2;

                    ctx.moveTo(bx, py + 3);
                    ctx.lineTo(bx + sway + (k - 1.5), py - 3 - (noise >>> k) % 4);

                }

                ctx.stroke();

                if(kind === DECOR.FLOWER){

                    ctx.fillStyle = ["#f9a8d4", "#fde68a", "#93c5fd"][noise % 3];
                    ctx.beginPath();
                    ctx.arc(px + sway, py - 6, 1.8, 0, TAU);
                    ctx.fill();

                }

                break;

            }

            case DECOR.MUSHROOM: {

                ctx.fillStyle = "#c9d6cf";
                ctx.fillRect(px - 1, py - 3, 2, 5);

                ctx.fillStyle = alpha("#5eead4", 0.75 + 0.25 * Math.sin(time * 1.3 + (noise & 63)));
                ctx.beginPath();
                ctx.ellipse(px, py - 3.5, 4.5, 2.6, 0, Math.PI, 0);
                ctx.fill();

                if(noise % 2){

                    ctx.beginPath();
                    ctx.ellipse(px + 6, py, 3, 1.8, 0, Math.PI, 0);
                    ctx.fill();

                }

                break;

            }

            case DECOR.ROOT: {

                ctx.strokeStyle = "rgba(68, 54, 38, 0.8)";
                ctx.lineWidth = 2;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(px - 4, y);
                ctx.quadraticCurveTo(px + 4, y + 8, px - 2, y + 14 + (noise >>> 3) % 8);
                ctx.stroke();

                break;

            }

            case DECOR.CRYSTAL: {

                const shine = 0.75 + 0.25 * Math.sin(time * 0.8 + (noise & 63));

                ctx.fillStyle = alpha("#7c3aed", shine);
                ctx.beginPath();
                ctx.moveTo(px - 4, py + 4);
                ctx.lineTo(px - 2, py - 7);
                ctx.lineTo(px + 1, py + 4);
                ctx.moveTo(px, py + 4);
                ctx.lineTo(px + 4, py - 4);
                ctx.lineTo(px + 6, py + 4);
                ctx.fill();

                ctx.fillStyle = alpha("#ddd6fe", 0.7 * shine);
                ctx.fillRect(px - 2, py - 4, 1, 4);

                break;

            }

            case DECOR.RUNE: {

                const k = 0.25 + 0.2 * Math.sin(time * 2 + (noise & 63));

                ctx.strokeStyle = alpha("#c4b5fd", k);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(x + TILE / 2, y + TILE / 2, 9, 0, TAU);
                ctx.moveTo(x + TILE / 2, y + TILE / 2 - 6);
                ctx.lineTo(x + TILE / 2 + 5, y + TILE / 2 + 4);
                ctx.lineTo(x + TILE / 2 - 5, y + TILE / 2 + 4);
                ctx.closePath();
                ctx.stroke();

                break;

            }

            case DECOR.SHARD: {

                ctx.fillStyle = "rgba(76, 62, 110, 0.8)";
                ctx.fillRect(px, py, 3, 2);
                ctx.fillRect(px + 5, py + 3, 2, 2);

                break;

            }

            case DECOR.GRATE: {

                ctx.fillStyle = "#2a211b";
                ctx.fillRect(x + 6, y + 6, TILE - 12, TILE - 12);

                ctx.fillStyle = "#4a3b30";

                for(let k = 0; k < 4; k++)
                    ctx.fillRect(x + 8 + k * 5, y + 7, 2, TILE - 14);

                break;

            }

            case DECOR.ASH: {

                ctx.fillStyle = "rgba(120, 110, 104, 0.35)";
                ctx.fillRect(px, py, 2, 2);
                ctx.fillRect(px + 5, py + 2, 3, 1.5);
                ctx.fillRect(px - 4, py + 4, 1.5, 1.5);

                break;

            }

            case DECOR.VENT: {

                const v = map.vents.find(vent => Math.abs(vent.x - (x + TILE / 2)) < 1 && Math.abs(vent.y - (y + TILE / 2)) < 1);
                const heat = v ? ventHeat(v, worldTime) : 0;

                ctx.fillStyle = "#1a120d";
                ctx.beginPath();
                ctx.arc(x + TILE / 2, y + TILE / 2, 10, 0, TAU);
                ctx.fill();

                ctx.fillStyle = alpha("#ff6a1a", 0.15 + heat * 0.85);
                ctx.beginPath();
                ctx.arc(x + TILE / 2, y + TILE / 2, 6 + heat * 2, 0, TAU);
                ctx.fill();

                ctx.strokeStyle = "#3b2a1f";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(x + TILE / 2 - 8, y + TILE / 2);
                ctx.lineTo(x + TILE / 2 + 8, y + TILE / 2);
                ctx.moveTo(x + TILE / 2, y + TILE / 2 - 8);
                ctx.lineTo(x + TILE / 2, y + TILE / 2 + 8);
                ctx.stroke();

                // it hisses before it bursts
                if(heat > 0.4 && Math.random() < heat * 0.25)
                    fx.burst(x + TILE / 2, y + TILE / 2, {count: 1, colour: "#ff9a5a", speed: 20, life: 0.5, size: 2, gravity: -60, glow: true, scatter: 5});

                break;

            }

        }

    }


    /* ---- zones on the ground ---- */

    function zones(list, time, dt, visible){

        for(const z of list){

            if(!visible(z.x, z.y, z.r))
                continue;

            const fade = Math.min(1, (z.life / z.max) * 4);

            if(z.kind === "fire"){

                ctx.globalCompositeOperation = "lighter";

                glow(z.x, z.y, z.r * 1.2, "#ff6a1a", 0.3 * fade * (0.85 + 0.15 * Math.sin(time * 11 + z.x)));

                ctx.globalAlpha = 1;
                ctx.globalCompositeOperation = "source-over";

                ctx.fillStyle = alpha("#3b1306", 0.35 * fade);
                ctx.beginPath();
                ctx.arc(z.x, z.y, z.r * 0.8, 0, TAU);
                ctx.fill();

                if(Math.random() < dt * z.r * 0.35 * fade)
                    fx.burst(z.x, z.y, {count: 1, colour: Math.random() < 0.5 ? "#ffb347" : "#ff6a1a", speed: 18, life: 0.55, size: 3.2, gravity: -70, glow: true, scatter: z.r * 0.6, shape: "dot"});

            }
            else{

                ctx.fillStyle = alpha(ZONES.spore.colour, 0.1 * fade);
                ctx.beginPath();
                ctx.arc(z.x, z.y, z.r, 0, TAU);
                ctx.fill();

                ctx.strokeStyle = alpha(ZONES.spore.colour, 0.3 * fade);
                ctx.lineWidth = 1.5;
                ctx.setLineDash([5, 7]);
                ctx.lineDashOffset = -time * 12;
                ctx.beginPath();
                ctx.arc(z.x, z.y, z.r, 0, TAU);
                ctx.stroke();
                ctx.setLineDash([]);

                if(Math.random() < dt * z.r * 0.1 * fade)
                    fx.burst(z.x, z.y, {count: 1, colour: "#f5d0fe", speed: 8, life: 1.6, size: 1.8, gravity: -5, scatter: z.r * 0.8, shape: "dot", glow: true, drag: 0.5});

            }

        }

    }


    /* ---- the air ---- */

    // drifting particles around the view, made where you can see
    function air(dt, left, top, right, bottom, showsAt){

        const kind = world?.ambience;

        if(!kind)
            return;

        spawn += dt * (kind === "fireflies" ? 5 : 9);

        while(spawn >= 1){

            spawn--;

            const x = left + Math.random() * (right - left);
            const y = top + Math.random() * (bottom - top);

            if(!showsAt(x, y))
                continue;

            switch(kind){

                case "dust":

                    fx.burst(x, y, {count: 1, colour: "#9a9384", speed: 5, life: 5, size: 1.4, gravity: 2, drag: 0.1, shape: "dot"});

                    break;

                case "fireflies":

                    if(Math.random() < 0.6)
                        fx.burst(x, y, {count: 1, colour: "#d9f99d", speed: 16, life: 4, size: 1.8, gravity: -3, drag: 0.2, shape: "dot", glow: true});
                    else
                        fx.burst(x, y, {count: 1, colour: Math.random() < 0.5 ? "#4d7c3a" : "#7a6a36", speed: 14, life: 4.5, size: 2.6, gravity: 9, drag: 0.6, shape: "shard"});

                    break;

                case "motes":

                    fx.burst(x, y, {count: 1, colour: Math.random() < 0.7 ? "#a78bfa" : "#67e8f9", speed: 6, life: 3.5, size: 1.6, gravity: -16, drag: 0.4, shape: "dot", glow: true});

                    break;

                case "embers":

                    if(Math.random() < 0.65)
                        fx.burst(x, y, {count: 1, colour: Math.random() < 0.5 ? "#ff8a3d" : "#fdba74", speed: 18, life: 2.2, size: 1.7, gravity: -34, drag: 0.5, shape: "dot", glow: true});
                    else
                        fx.burst(x, y, {count: 1, colour: "#5b5550", speed: 8, life: 4, size: 1.6, gravity: 8, drag: 0.3});

                    break;

            }

        }

    }


    return {reset, shade, lights, mood, ground, rock, decor, zones, air, glow, get map(){ return map; }};

}
