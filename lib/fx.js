// fx.js: a small canvas effects library shared by the games on this site.
//
//   const fx = createFx();
//   fx.explosion(x, y, 60);              // anywhere in game code
//   fx.update(dt);                       // once per frame
//   fx.drawUnder(ctx);                   // floor marks, before the game's things
//   fx.draw(ctx);                        // particles, rings, bolts, after them
//   fx.drawText(ctx);                    // floating numbers, on top
//
// Everything is drawn in whatever coordinates the canvas is set up for, so
// a game with a camera calls these inside its camera transform. Nothing
// here ever feeds back into game rules: it is safe to use Math.random.
//
// Particles live in a fixed pool (no garbage while playing); when the pool
// is full new ones are dropped, so a busy screen degrades instead of lagging.

const TAU = Math.PI * 2;
const FONT = "Arial, Helvetica, sans-serif";

const rand = (low, high) => low + Math.random() * (high - low);


/* ---------------- Colour ---------------- */

const rgbCache = new Map();

function rgb(colour){

    let value = rgbCache.get(colour);

    if(!value){

        const hex = colour.length === 4
            ? colour.replace(/#(.)(.)(.)/, "#$1$1$2$2$3$3")
            : colour;

        value = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

        rgbCache.set(colour, value);

    }

    return value;

}


// A hex colour with transparency. Called many times a frame, so the
// strings are made once per colour and hundredth of opacity, then reused.
const alphaCache = new Map();

export function alpha(colour, a){

    let steps = alphaCache.get(colour);

    if(!steps){

        steps = new Array(101);

        alphaCache.set(colour, steps);

    }

    const step = Math.round(Math.max(0, Math.min(1, a)) * 100);

    if(steps[step] === undefined){

        const [r, g, b] = rgb(colour);

        steps[step] = `rgba(${r}, ${g}, ${b}, ${step / 100})`;

    }

    return steps[step];

}


const mixCache = new Map();

// between two hex colours: t = 0 gives a, 1 gives b
export function mix(a, b, t){

    const step = Math.round(Math.max(0, Math.min(1, t)) * 32);
    const key = a + b + step;

    let value = mixCache.get(key);

    if(!value){

        const ca = rgb(a);
        const cb = rgb(b);

        value = "#" + ca.map((v, i) => Math.round(v + (cb[i] - v) * step / 32).toString(16).padStart(2, "0")).join("");

        if(mixCache.size > 4000)
            mixCache.clear();

        mixCache.set(key, value);

    }

    return value;

}


// 1234 -> "1.2K"; small numbers keep one decimal
export function formatNumber(value){

    if(value >= 1e6)
        return `${(value / 1e6).toFixed(1)}M`;

    if(value >= 10000)
        return `${(value / 1000).toFixed(0)}K`;

    if(value >= 1000)
        return `${(value / 1000).toFixed(1)}K`;

    if(value >= 10)
        return Math.round(value).toString();

    return value.toFixed(1).replace(/\.0$/, "");

}


/* ---------------- Effects ---------------- */

// particle shapes
const SQUARE = 0;       // a little square (the default)
const DOT = 1;          // a round dot
const SPARK = 2;        // a streak along its direction of travel
const SHARD = 3;        // a tumbling triangle
const SMOKE = 4;        // a soft growing puff

const SHAPES = {square: SQUARE, dot: DOT, spark: SPARK, shard: SHARD, smoke: SMOKE};


export function createFx({max = 800, maxText = 60, maxDecals = 48, font = FONT} = {}){

    // the pool: particles [0, live) are alive
    const pool = Array.from({length: max}, () => ({
        x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, colour: "#ffffff",
        drag: 0, gravity: 0, shape: SQUARE, rot: 0, spin: 0, glow: false, grow: 0
    }));

    let live = 0;

    let rings = [];
    let bolts = [];
    let flashes = [];
    let ghosts = [];
    let decals = [];
    let texts = [];

    let shakeAmount = 0;
    let shakeScale = 1;             // 0 turns screen shake off (a setting)
    let freezeLeft = 0;
    let offsetX = 0;
    let offsetY = 0;


    /* ---- emitters ---- */

    // count particles thrown out from a point.
    // angle + spread aim them (spread is the full cone, radians);
    // speed is the fastest (each gets 30..100% of it); gravity pulls down
    // (negative floats up); glow draws them additively, like light.
    function burst(x, y, {
        count = 8, colour = "#ffffff", speed = 120, life = 0.45, size = 2.2,
        drag = 4, gravity = 0, angle = 0, spread = TAU, shape = "square",
        glow = false, grow = 0, scatter = 0
    } = {}){

        const kind = SHAPES[shape] ?? SQUARE;

        for(let i = 0; i < count && live < max; i++){

            const p = pool[live++];
            const a = angle + rand(-0.5, 0.5) * spread;
            const v = rand(0.3, 1) * speed;

            p.x = x + (scatter ? rand(-scatter, scatter) : 0);
            p.y = y + (scatter ? rand(-scatter, scatter) : 0);
            p.vx = Math.cos(a) * v;
            p.vy = Math.sin(a) * v;
            p.max = rand(0.6, 1) * life;
            p.life = p.max;
            p.size = rand(0.6, 1) * size;
            p.colour = colour;
            p.drag = drag;
            p.gravity = gravity;
            p.shape = kind;
            p.rot = rand(0, TAU);
            p.spin = kind === SHARD ? rand(-12, 12) : 0;
            p.glow = glow;
            p.grow = grow;

        }

    }


    // an expanding circle (a shockwave); fill tints the inside
    function ring(x, y, r, {colour = "#ffffff", life = 0.35, width = 2, from = 0.3, fill = 0} = {}){

        rings.push({x, y, r, from, colour, life, max: life, width, fill});

    }


    // a soft burst of light that fades (also lights up the dark, see lights())
    function flash(x, y, r, {colour = "#ffffff", life = 0.18, strength = 0.8} = {}){

        flashes.push({x, y, r, colour, life, max: life, strength});

    }


    // a line between two points: jag > 0 makes it a lightning bolt
    function bolt(x1, y1, x2, y2, {colour = "#ffffff", width = 2, life = 0.2, jag = 0, core = true} = {}){

        const length = Math.hypot(x2 - x1, y2 - y1);
        const steps = jag ? Math.max(2, Math.round(length / 16)) : 1;
        const points = [];

        for(let i = 0; i <= steps; i++){

            const t = i / steps;
            const edge = i === 0 || i === steps;

            points.push(
                x1 + (x2 - x1) * t + (edge ? 0 : rand(-jag, jag)),
                y1 + (y2 - y1) * t + (edge ? 0 : rand(-jag, jag))
            );

        }

        bolts.push({points, colour, width, life, max: life, core});

    }


    // a number or word that floats up and fades. Numbers given the same
    // `key` shortly after each other add up into one (beams, burning).
    function text(x, y, value, {colour = "#ffffff", size = 9, key = null, life = 0.75, pop = false, rise = 38} = {}){

        if(key !== null){

            for(const old of texts){

                if(old.key === key && old.life > 0.25 && typeof old.value === "number"){

                    old.value += value;
                    old.life = Math.max(old.life, 0.5);

                    return;

                }

            }

        }

        if(texts.length >= maxText)
            texts.shift();

        texts.push({x: x + rand(-4, 4), y, vy: -rise, value, colour, size, key, life, max: life, pop});

    }


    // a fading copy of a round thing (dash trails)
    function ghost(x, y, r, {colour = "#ffffff", life = 0.25, strength = 0.35} = {}){

        ghosts.push({x, y, r, colour, life, max: life, strength});

    }


    // a mark on the floor (scorch, splat) that slowly fades
    function decal(x, y, r, {colour = "#000000", life = 14, strength = 0.35} = {}){

        if(decals.length >= maxDecals)
            decals.shift();

        decals.push({x, y, r, colour, life, max: life, strength, squash: rand(0.7, 1), rot: rand(0, TAU)});

    }


    /* ---- presets ---- */

    // a blast: light, shockwave, fire, smoke and a scorch mark
    function explosion(x, y, r, {colour = "#ffb35a", smoke = true, scorch = true, hot = "#fff1c9"} = {}){

        flash(x, y, r * 1.6, {colour, life: 0.22});
        ring(x, y, r, {colour, life: 0.3, width: 3, fill: 0.12});

        burst(x, y, {count: Math.min(26, 8 + r / 4), colour: hot, speed: r * 4.5, life: 0.35, size: 2.4, shape: "spark", glow: true, drag: 5});
        burst(x, y, {count: Math.min(14, 4 + r / 8), colour, speed: r * 2.2, life: 0.6, size: 3, drag: 3, gravity: -30, glow: true});

        if(smoke)
            burst(x, y, {count: Math.min(8, 3 + r / 16), colour: "#3a3a3a", speed: r * 0.7, life: 0.9, size: r * 0.28, shape: "smoke", drag: 2.5, gravity: -22, grow: 1.4, scatter: r * 0.3});

        if(scorch)
            decal(x, y, r * 0.75, {colour: "#000000", strength: 0.3});

    }


    // sparks flying back from something that was hit, along `angle`
    // (the direction the hit was travelling)
    function impact(x, y, angle, {colour = "#ffffff", count = 5, speed = 170, big = false} = {}){

        burst(x, y, {
            count: big ? count * 2 : count,
            colour,
            speed: big ? speed * 1.4 : speed,
            life: 0.22,
            size: big ? 2.6 : 2,
            angle: angle + Math.PI,
            spread: 1.9,
            shape: "spark",
            glow: true,
            drag: 6
        });

        if(big)
            flash(x, y, 26, {colour, life: 0.12, strength: 0.6});

    }


    // something of radius r breaking apart
    function shatter(x, y, r, colour, {big = false, splat = true} = {}){

        const scale = big ? 2.2 : 1;

        burst(x, y, {count: Math.round(7 * scale + r / 4), colour, speed: 150 * scale, life: 0.55 * scale, size: Math.max(2.5, r * 0.32), shape: "shard", drag: 3.2, scatter: r * 0.4});
        burst(x, y, {count: Math.round(8 * scale), colour: mix(colour, "#ffffff", 0.5), speed: 210 * scale, life: 0.35 * scale, size: 2, shape: "spark", glow: true, drag: 5});

        ring(x, y, r * 2.2 * scale, {colour, life: 0.3 * scale, width: big ? 4 : 2});
        flash(x, y, r * 2.4 * scale, {colour, life: 0.16 * scale, strength: 0.55});

        if(splat)
            decal(x, y, r * (big ? 1.6 : 0.9), {colour, strength: 0.14});

    }


    // one or two glints (treasure, rare things)
    function sparkle(x, y, colour, {count = 1, spread = 0} = {}){

        burst(x, y, {count, colour, speed: 24, life: 0.55, size: 1.7, drag: 1, shape: "dot", glow: true, scatter: spread, gravity: -14});

    }


    // the flash at the end of a barrel
    function muzzle(x, y, angle, colour, {big = false} = {}){

        flash(x, y, big ? 34 : 20, {colour, life: 0.07, strength: 0.7});

        burst(x, y, {count: big ? 7 : 3, colour, speed: big ? 230 : 150, life: 0.14, size: 2, angle, spread: 0.7, shape: "spark", glow: true, drag: 7});

    }


    /* ---- camera feel ---- */

    // shake the screen: add to your camera what offset() returns
    function shake(amount){

        shakeAmount = Math.min(12, shakeAmount + amount * shakeScale);

    }

    // hold the action for a moment: multiply your game's dt by speed()
    function freeze(seconds){

        freezeLeft = Math.max(freezeLeft, seconds);

    }


    /* ---- frame ---- */

    function update(dt){

        // freezes run on real time, everything else follows the action
        freezeLeft = Math.max(0, freezeLeft - dt);

        for(let i = 0; i < live; i++){

            const p = pool[i];

            p.life -= dt;

            if(p.life <= 0){

                // swap the last live particle into this slot
                live--;
                pool[i] = pool[live];
                pool[live] = p;
                i--;

                continue;

            }

            const drag = Math.exp(-p.drag * dt);

            p.vx *= drag;
            p.vy = p.vy * drag + p.gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += p.spin * dt;

            if(p.grow)
                p.size += p.size * p.grow * dt;

        }

        for(const t of texts){

            t.life -= dt;
            t.y += t.vy * dt;
            t.vy *= Math.exp(-3 * dt);

        }

        rings = age(rings, dt);
        bolts = age(bolts, dt);
        flashes = age(flashes, dt);
        ghosts = age(ghosts, dt);
        decals = age(decals, dt);

        if(texts.length && texts[0].life <= 0)
            texts = texts.filter(t => t.life > 0);

        shakeAmount = Math.max(0, shakeAmount - dt * 30);

        offsetX = (Math.random() - 0.5) * shakeAmount;
        offsetY = (Math.random() - 0.5) * shakeAmount;

    }


    function age(list, dt){

        let dead = false;

        for(const item of list){

            item.life -= dt;

            if(item.life <= 0)
                dead = true;

        }

        return dead ? list.filter(item => item.life > 0) : list;

    }


    // floor marks: call before drawing the things that stand on the floor
    function drawUnder(ctx){

        for(const d of decals){

            ctx.fillStyle = alpha(d.colour, d.strength * Math.min(1, d.life / d.max * 3));
            ctx.beginPath();
            ctx.ellipse(d.x, d.y, d.r, d.r * d.squash, d.rot, 0, TAU);
            ctx.fill();

        }

    }


    function draw(ctx){

        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        for(const g of ghosts){

            ctx.fillStyle = alpha(g.colour, g.strength * g.life / g.max);
            ctx.beginPath();
            ctx.arc(g.x, g.y, g.r, 0, TAU);
            ctx.fill();

        }

        drawParticles(ctx, false);

        for(const r of rings){

            const k = 1 - r.life / r.max;
            const radius = Math.max(0.1, r.r * (r.from + (1 - r.from) * (1 - (1 - k) ** 2)));

            ctx.beginPath();
            ctx.arc(r.x, r.y, radius, 0, TAU);

            if(r.fill){

                ctx.fillStyle = alpha(r.colour, r.fill * (1 - k));
                ctx.fill();

            }

            ctx.strokeStyle = alpha(r.colour, 1 - k);
            ctx.lineWidth = r.width * (1 - k * 0.6);
            ctx.stroke();

        }

        // light: everything from here adds to what is under it
        ctx.globalCompositeOperation = "lighter";

        for(const f of flashes){

            const k = f.life / f.max;
            const gradient = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);

            gradient.addColorStop(0, alpha(f.colour, f.strength * k));
            gradient.addColorStop(1, alpha(f.colour, 0));

            ctx.fillStyle = gradient;
            ctx.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);

        }

        for(const b of bolts){

            const k = b.life / b.max;

            ctx.beginPath();
            ctx.moveTo(b.points[0], b.points[1]);

            for(let i = 2; i < b.points.length; i += 2)
                ctx.lineTo(b.points[i], b.points[i + 1]);

            ctx.strokeStyle = alpha(b.colour, 0.45 * k);
            ctx.lineWidth = b.width * 3 * k;
            ctx.stroke();

            if(b.core){

                ctx.strokeStyle = alpha("#ffffff", k);
                ctx.lineWidth = Math.max(1, b.width * 0.6 * k);
                ctx.stroke();

            }

        }

        drawParticles(ctx, true);

        ctx.restore();

    }


    function drawParticles(ctx, glow){

        for(let i = 0; i < live; i++){

            const p = pool[i];

            if(p.glow !== glow)
                continue;

            const k = p.life / p.max;

            ctx.globalAlpha = p.shape === SMOKE ? 0.28 * k : Math.min(1, k * 1.6);

            switch(p.shape){

                case SPARK: {

                    const stretch = 0.035 + p.size * 0.004;

                    ctx.strokeStyle = p.colour;
                    ctx.lineWidth = p.size * 0.7;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x - p.vx * stretch, p.y - p.vy * stretch);
                    ctx.stroke();

                    break;

                }

                case SHARD: {

                    const c = Math.cos(p.rot) * p.size;
                    const s = Math.sin(p.rot) * p.size;

                    ctx.fillStyle = p.colour;
                    ctx.beginPath();
                    ctx.moveTo(p.x + c, p.y + s);
                    ctx.lineTo(p.x - s * 0.6, p.y + c * 0.6);
                    ctx.lineTo(p.x - c * 0.5 + s * 0.5, p.y - s * 0.5 - c * 0.5);
                    ctx.fill();

                    break;

                }

                case DOT:
                case SMOKE:

                    ctx.fillStyle = p.colour;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size * (p.shape === DOT ? 0.6 : 1), 0, TAU);
                    ctx.fill();

                    break;

                default:

                    ctx.fillStyle = p.colour;
                    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);

            }

        }

        ctx.globalAlpha = 1;

    }


    // floating numbers and words, on top of everything
    function drawText(ctx){

        if(!texts.length)
            return;

        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // setting a font is slow: only when the size changes (half pixels)
        let lastSize = -1;

        for(const t of texts){

            const shown = typeof t.value === "number" ? formatNumber(t.value) : t.value;
            const age = t.max - t.life;
            const size = Math.round((t.pop ? t.size * (1 + 0.7 * Math.max(0, 1 - age / 0.14)) : t.size) * 2) / 2;
            const fade = Math.min(1, t.life / t.max * 2.2);

            if(size !== lastSize){

                ctx.font = `bold ${size}px ${font}`;

                lastSize = size;

            }

            ctx.fillStyle = alpha("#000000", 0.65 * fade);
            ctx.fillText(shown, t.x + 0.8, t.y + 0.8);

            ctx.fillStyle = alpha(t.colour, fade);
            ctx.fillText(shown, t.x, t.y);

        }

        ctx.restore();

    }


    // what is giving off light right now: fn(x, y, radius, strength)
    // calls fn(x, y, r, strength, colour) for everything lighting up right now
    function lights(fn){

        for(const f of flashes)
            fn(f.x, f.y, f.r * 1.3, f.strength * f.life / f.max, f.colour);

    }


    function clear(){

        live = 0;
        rings = [];
        bolts = [];
        flashes = [];
        ghosts = [];
        decals = [];
        texts = [];
        shakeAmount = 0;
        freezeLeft = 0;

    }


    return {
        burst, ring, flash, bolt, text, ghost, decal,
        explosion, impact, shatter, sparkle, muzzle,
        shake, freeze,
        update, drawUnder, draw, drawText, lights, clear,

        // how strongly the screen shakes, 0..1
        setShake: k => shakeScale = k,

        offset: () => [offsetX, offsetY],
        speed: () => freezeLeft > 0 ? 0.08 : 1,

        get count(){ return live; }
    };

}
