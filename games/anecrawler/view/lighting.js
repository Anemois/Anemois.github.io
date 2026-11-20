import {TILE} from "../sim/data.js";
import {blocksAt} from "../sim/map.js";
import {alpha} from "../../../lib/fx.js";


// The light in the caves, drawn in two small layers over the picture:
//
//   the dark      a sheet of near-black that lights cut holes in. A
//                 player's own light is cut to what it can reach: rock
//                 and crates throw real shadows.
//   colour        soft coloured glows (lava orange, crystal violet, a
//                 green necromancer's staff...) added on top, so light
//                 has a colour, not just a brightness.
//
// Both are a quarter of the screen's size, which also softens them.
// Everything takes screen pixels; sight() works in world units.

const RAYS = 220;               // rays cast for a shadowed light
const STEP = 5;                 // world units a ray moves per check
const INTO_WALL = 12;           // light spills this far onto the rock it hits
const NEAR = 14;                // never cut closer than this


export function createLighting({scale = 0.25} = {}){

    const dark = layer();
    const tint = layer();

    // one soft white blob, reused for every hole in the dark
    const blob = document.createElement("canvas");

    blob.width = blob.height = 128;

    {

        const b = blob.getContext("2d");
        const gradient = b.createRadialGradient(64, 64, 0, 64, 64, 64);

        gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
        gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.7)");
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

        b.fillStyle = gradient;
        b.fillRect(0, 0, 128, 128);

    }

    const glows = new Map();        // colour -> soft coloured blob

    let width = 0;
    let height = 0;


    function layer(){

        const canvas = document.createElement("canvas");

        return {canvas, ctx: canvas.getContext("2d")};

    }


    function glowOf(colour){

        let sprite = glows.get(colour);

        if(!sprite){

            sprite = document.createElement("canvas");
            sprite.width = sprite.height = 64;

            const g = sprite.getContext("2d");
            const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);

            gradient.addColorStop(0, alpha(colour, 1));
            gradient.addColorStop(0.35, alpha(colour, 0.45));
            gradient.addColorStop(1, alpha(colour, 0));

            g.fillStyle = gradient;
            g.fillRect(0, 0, 64, 64);

            glows.set(colour, sprite);

        }

        return sprite;

    }


    const onScreen = (x, y, r) =>
        x + r > 0 && y + r > 0 && x - r < width && y - r < height;


    // a fresh frame; shade is the colour of the dark as "r, g, b"
    function begin(w, h, darkness, shade){

        width = w;
        height = h;

        const cw = Math.max(1, Math.ceil(w * scale));
        const ch = Math.max(1, Math.ceil(h * scale));

        for(const l of [dark, tint]){

            if(l.canvas.width !== cw || l.canvas.height !== ch){

                l.canvas.width = cw;
                l.canvas.height = ch;

            }

            l.ctx.setTransform(1, 0, 0, 1, 0, 0);
            l.ctx.globalAlpha = 1;
            l.ctx.globalCompositeOperation = "source-over";
            l.ctx.clearRect(0, 0, cw, ch);

        }

        dark.ctx.fillStyle = `rgba(${shade}, ${darkness})`;
        dark.ctx.fillRect(0, 0, cw, ch);
        dark.ctx.globalCompositeOperation = "destination-out";

        tint.ctx.globalCompositeOperation = "lighter";

    }


    // cuts a soft round hole in the dark
    function lamp(x, y, r, strength = 1){

        if(r <= 0 || strength <= 0.01 || !onScreen(x, y, r))
            return;

        dark.ctx.globalAlpha = Math.min(1, strength);
        dark.ctx.drawImage(blob, (x - r) * scale, (y - r) * scale, r * 2 * scale, r * 2 * scale);

    }


    // a lamp that only reaches inside `shape` (screen points [x0, y0, x1, y1...])
    function shadowed(x, y, r, strength, shape){

        if(!onScreen(x, y, r))
            return;

        const c = dark.ctx;

        c.save();
        c.beginPath();
        c.moveTo(shape[0] * scale, shape[1] * scale);

        for(let i = 2; i < shape.length; i += 2)
            c.lineTo(shape[i] * scale, shape[i + 1] * scale);

        c.closePath();
        c.clip();

        lamp(x, y, r, strength);

        c.restore();

    }


    // coloured light
    function colour(x, y, r, hue, strength = 0.5){

        if(r <= 0 || strength <= 0.01 || !onScreen(x, y, r))
            return;

        tint.ctx.globalAlpha = Math.min(1, strength);
        tint.ctx.drawImage(glowOf(hue), (x - r) * scale, (y - r) * scale, r * 2 * scale, r * 2 * scale);

    }


    // a long soft streak of coloured light (a beam, a light shaft)
    function streak(x1, y1, x2, y2, r, hue, strength = 0.5){

        const length = Math.hypot(x2 - x1, y2 - y1);
        const steps = Math.max(1, Math.ceil(length / (r * 0.8)));

        for(let i = 0; i <= steps; i++){

            const t = i / steps;

            colour(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, r, hue, strength);

        }

    }


    // lays both layers over the picture
    function end(target, glowStrength = 1){

        target.save();
        target.setTransform(1, 0, 0, 1, 0, 0);
        target.globalAlpha = 1;
        target.globalCompositeOperation = "source-over";
        target.drawImage(dark.canvas, 0, 0, width, height);

        target.globalCompositeOperation = "lighter";
        target.globalAlpha = glowStrength;
        target.drawImage(tint.canvas, 0, 0, width, height);

        target.restore();

    }


    return {begin, lamp, shadowed, colour, streak, end};

}


// What a light at (x, y) reaches within `radius`, as a ring of points
// (world units, [x0, y0, x1, y1...]): rays stop at rock and crates, a
// little way into them, so the faces of the walls it hits are lit too.
export function sight(map, x, y, radius, out = []){

    out.length = 0;

    for(let i = 0; i < RAYS; i++){

        const a = (i / RAYS) * Math.PI * 2;
        const dx = Math.cos(a);
        const dy = Math.sin(a);

        let d = 0;

        // (the first few units are always lit, so a light pressed right
        // against a crate or wall is never snuffed out)
        while(d < radius){

            d += STEP;

            if(d > NEAR && blocksAt(map, Math.floor((x + dx * d) / TILE), Math.floor((y + dy * d) / TILE)))
                break;

        }

        d = Math.min(radius, d + INTO_WALL);

        out.push(x + dx * d, y + dy * d);

    }

    return out;

}
