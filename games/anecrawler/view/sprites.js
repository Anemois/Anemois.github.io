import {WEAPON, RARITY} from "../sim/data.js";
import {mix} from "../../../lib/fx.js";


// Weapons are drawn from the primitives in data.js, pointing right with
// the grip at (0, 0). Rarer weapons glow, then shimmer, then pulse.

const COLOURS = {body: "#d4d4d8", dark: "#4b4b52"};


function colourOf(name, accent){

    if(name === "accent")
        return accent;

    return COLOURS[name] ?? name;

}


// the accent colour, alive for legendary and mythic weapons
export function accentOf(type, time = 0){

    const rarity = RARITY[WEAPON[type].rarity];

    if(rarity.tier >= 5)
        return mix(rarity.color, "#ffffff", 0.25 + 0.25 * Math.sin(time * 4));

    if(rarity.tier >= 4)
        return mix(rarity.color, "#ffffff", 0.15 + 0.15 * Math.sin(time * 3));

    return rarity.color;

}


export function drawWeapon(ctx, type, {time = 0, glow = true} = {}){

    const def = WEAPON[type];
    const tier = RARITY[def.rarity].tier;
    const accent = accentOf(type, time);

    ctx.save();

    if(glow && tier >= 3){

        ctx.shadowColor = accent;
        ctx.shadowBlur = 4 + tier * 2;

    }

    for(const part of def.shape){

        const [kind] = part;

        if(kind === "rect"){

            const [, x, y, w, h, colour] = part;

            ctx.fillStyle = colourOf(colour, accent);
            ctx.fillRect(x, y, w, h);

        }
        else if(kind === "poly"){

            const [, points, colour] = part;

            ctx.fillStyle = colourOf(colour, accent);
            ctx.beginPath();

            points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));

            ctx.closePath();
            ctx.fill();

        }
        else if(kind === "circle"){

            const [, x, y, r, colour] = part;

            ctx.fillStyle = colourOf(colour, accent);
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();

        }

    }

    ctx.restore();

}


const boxes = new Map();

// the box a weapon's shape covers
export function weaponBounds(type){

    if(boxes.has(type))
        return boxes.get(type);

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;

    const add = (x, y) => {

        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);

    };

    for(const part of WEAPON[type].shape){

        if(part[0] === "rect"){

            add(part[1], part[2]);
            add(part[1] + part[3], part[2] + part[4]);

        }
        else if(part[0] === "poly"){

            for(const [x, y] of part[1])
                add(x, y);

        }
        else{

            add(part[1] - part[3], part[2] - part[3]);
            add(part[1] + part[3], part[2] + part[3]);

        }

    }

    const box = {x: x0, y: y0, w: x1 - x0, h: y1 - y0};

    boxes.set(type, box);

    return box;

}


/* ---------------- Icons ---------------- */

const icons = new Map();


// a square picture of a weapon (cached), as a data URL for <img>
export function weaponIcon(type, size = 48){

    const key = `${type}:${size}`;

    if(icons.has(key))
        return icons.get(key);

    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const canvas = document.createElement("canvas");

    canvas.width = canvas.height = Math.round(size * dpr);

    const ctx = canvas.getContext("2d");
    const box = weaponBounds(type);
    const pad = size * 0.12;

    // tilted a little, like it is lying on a shelf
    const tilt = 0.35;
    const w = box.w * Math.cos(tilt) + box.h * Math.sin(tilt);
    const h = box.w * Math.sin(tilt) + box.h * Math.cos(tilt);
    const scale = Math.min((size - pad * 2) / w, (size - pad * 2) / h, size / 22);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-tilt);
    ctx.scale(scale, scale);
    ctx.translate(-(box.x + box.w / 2), -(box.y + box.h / 2));

    drawWeapon(ctx, type, {time: 0.4});

    const url = canvas.toDataURL();

    icons.set(key, url);

    return url;

}


/* ---------------- Looks ---------------- */

const looks = new Map();

// how a weapon's shots and swings are coloured: {colour, tier}
export function weaponLook(id){

    let look = looks.get(id);

    if(!look){

        const def = WEAPON[id];
        const rarity = RARITY[def.rarity];

        look = {colour: def.color ?? rarity.color, tier: rarity.tier};

        looks.set(id, look);

    }

    return look;

}
