// All three districts share the same stonework. Their sky, glass and vegetation age differently.
const PALETTES = [
    { sky: ['#071623', '#20424b', '#71837a'], haze: '#9ab5a5', moon: '#d9e6bc', far: '#38565c', city: '#27424b', ruin: '#1b323c', edge: '#426262', stone: '#14292e', trim: '#788b76', glass: '#aec9a2', accent: '#dca982', flower: '#bacb9b' },
    { sky: ['#181829', '#49374d', '#937071'], haze: '#d2a8aa', moon: '#efcfab', far: '#624d60', city: '#413748', ruin: '#302a3c', edge: '#695666', stone: '#282331', trim: '#947b86', glass: '#d8adb5', accent: '#e5ad85', flower: '#d8849c' },
    { sky: ['#211b25', '#644448', '#be8266'], haze: '#e8b697', moon: '#f4ddb1', far: '#775454', city: '#513d43', ruin: '#3a2e36', edge: '#796162', stone: '#2c272e', trim: '#b09276', glass: '#f0c08c', accent: '#f4ba7c', flower: '#e8af80' }
];
const TILE = 1152;
const HEIGHT = 540;
const paths = new Map();
const scenes = new Map();


function shape(ctx, data, fill, stroke, width = 1) {

    let path = paths.get(data);
    if(!path) {

        path = new Path2D(data);
        paths.set(data, path);

    }
    if(fill) {

        ctx.fillStyle = fill;
        ctx.fill(path);

    }
    if(stroke) {

        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.stroke(path);

    }

}


function oval(ctx, x, y, rx, ry, color) {

    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

}


function line(ctx, x, y, ex, ey, color, weight = 1) {

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.lineWidth = weight;
    ctx.strokeStyle = color;
    ctx.stroke();

}


function random(seed, index) {

    let n = Math.imul((seed | 0) ^ Math.imul(index + 1, 374761393), 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;

}


function glow(ctx, x, y, radius, center, edge) {

    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, center);
    g.addColorStop(1, edge);
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

}


function sky(ctx, p, region, seed) {

    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    p.sky.forEach((color, i) => grad.addColorStop(i / 2, color));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, TILE, HEIGHT);
    for(let i = 0; i < 120; i++) {

        const x = random(seed, i) * TILE;
        const y = random(seed + 5, i) * 265;
        const size = random(seed + 11, i);
        ctx.globalAlpha = .2 + size * .45;
        oval(ctx, x, y, size + .25, size + .25, p.moon);
        if(i % 15 === 0) {

            line(ctx, x - 3, y, x + 3, y, p.moon, .6);
            line(ctx, x, y - 4, x, y + 4, p.moon, .7);

        }

    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(773 + random(seed, 3) * 34, 94 + region * 4);
    glow(ctx, 0, 0, 148, p.moon + '48', p.moon + '00');
    oval(ctx, 0, 0, 39, 39, p.moon);
    ctx.beginPath();
    ctx.arc(0, 0, 39, 0, Math.PI * 2);
    ctx.clip();
    shape(ctx, 'M-41 -13Q-29 -6 -17 -22Q-8 -31 1 -23Q0 -13 -12 -10T-26 8Q-31 19 -40 14ZM5 11Q11 -1 24 -3Q21 7 35 14Q17 22 12 32Q4 25 5 11Z', p.far + '26');
    for(let i = 0; i < 34; i++) {

        const x = random(seed + 7, i) * 84 - 42;
        const y = random(seed + 8, i) * 84 - 42;
        oval(ctx, x, y, 1 + random(seed + 9, i) * 3, .65, p.far + '36');

    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = .13;
    for(let i = 0; i < 16; i++) {

        const x = random(seed + 13, i) * TILE;
        const y = 76 + random(seed + 15, i) * 158;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(.45 + random(seed, i) * 1.5, .6);
        shape(ctx, 'M-90 2Q-55 -2 -36 -8Q-9 -20 19 -11Q42 -5 87 -5Q63 0 27 1Q-24 8 -90 2Z', p.haze);
        ctx.restore();

    }
    ctx.restore();

}


// A lancet window with leaded lozenges and a small roundel, drawn in a 30 by 75 frame.
function windowGlass(ctx, x, y, sx, sy, p, lit) {

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    shape(ctx, 'M-15 73V24Q-14 12 0 0Q14 12 15 24V73Z', lit ? p.glass : p.city, p.edge, 1.8);
    if(lit) {

        shape(ctx, 'M-10 69V28Q-10 18 0 8Q10 18 10 28V69ZM0 9V70M-10 35L0 23L10 35L0 48ZM-10 59L0 48L10 59L0 71Z', null, p.ruin, 1.6);
        oval(ctx, 0, 21, 3.1, 3.1, p.accent);

    }
    ctx.restore();

}


function roseWindow(ctx, x, y, radius, p) {

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(radius / 26, radius / 26);
    oval(ctx, 0, 0, 27, 27, p.edge);
    oval(ctx, 0, 0, 24, 24, p.ruin);
    for(let i = 0; i < 8; i++) {

        ctx.rotate(Math.PI / 4);
        shape(ctx, 'M0 -6Q-8 -12 -5 -17Q-3 -22 0 -23Q7 -19 6 -15Q7 -11 0 -6Z', i % 2 ? p.glass : p.accent);
        line(ctx, 0, -8, 0, -21, p.ruin, .9);

    }
    oval(ctx, 0, 0, 5.3, 5.3, p.moon);
    ctx.restore();

}


function spire(ctx, x, base, size, p, near) {

    ctx.save();
    ctx.translate(x, base);
    ctx.scale(size, size);
    const body = near ? p.ruin : p.city;
    shape(ctx, 'M-33 0L-30 -62L-25 -71V-125L-28 -130L-18 -144L-16 -158L-13 -151Q-6 -170 0 -205Q4 -170 14 -151L17 -160L19 -145L28 -130L25 -124V-69L31 -62L33 0Z', body);
    shape(ctx, 'M0 -206Q-2 -170 -15 -140L-21 -131L0 -133ZM-26 -125H24L20 -121H-23ZM-30 -65H29L25 -61H-25Z', near ? p.edge : p.far);
    line(ctx, 0, -204, 0, -218, body, 2);
    line(ctx, -4, -213, 4, -213, body, 1.5);
    for(let i = -1; i <= 1; i++) windowGlass(ctx, i * 12, -116, .25, .51, p, near || !i);
    shape(ctx, 'M-22 -5V-46Q-15 -63 -7 -47V-5ZM6 -5V-46Q14 -63 21 -47V-5Z', near ? p.city : p.far);
    ctx.restore();

}


function cemetery(ctx, p, seed, region) {

    ctx.beginPath();
    ctx.moveTo(0, HEIGHT);
    for(let x = 0; x <= TILE; x += 16) {

        const wave = Math.sin(x / TILE * 2 * Math.PI);
        const ridge = Math.cos(x / TILE * 6 * Math.PI);
        const jag = x === 0 || x === TILE ? 0 : random(seed, x) * 12;
        ctx.lineTo(x, 239 + 37 * wave + 21 * ridge - jag);

    }
    ctx.lineTo(TILE, HEIGHT);
    ctx.fillStyle = p.far;
    ctx.fill();
    for(let i = 0; i < 15; i++) {

        const x = 40 + i * 76;
        const base = 347 + Math.sin(i) * 16;
        const size = .32 + random(seed, i) * .48;
        ctx.fillStyle = p.city;
        ctx.fillRect(x - 35, base - 47, 72, 130);
        spire(ctx, x, base, size, p, false);

    }
    // The horizon dissolves into coloured fog under the distant roofs.
    const mist = ctx.createLinearGradient(0, 235, 0, 438);
    mist.addColorStop(0, p.haze + '00');
    mist.addColorStop(.68, p.haze + '36');
    mist.addColorStop(1, p.city);
    ctx.fillStyle = mist;
    ctx.fillRect(0, 235, TILE, 305);
    ctx.save();
    ctx.translate(region === 1 ? 303 : 473, 385);
    shape(ctx, 'M-194 89V-46L-168 -70L-105 -61L-84 -84L-30 -87L0 -149L19 -107L31 -86L92 -79L104 -96L136 -74L166 -87L194 -54V89Z', p.ruin);
    shape(ctx, 'M-167 -73L-113 -67L-83 -91L-36 -94L0 -153L34 -91L91 -84L103 -100L137 -79L166 -91L194 -59L194 -54L164 -85L135 -73L102 -92L91 -76L29 -82L0 -140L-29 -83L-83 -83L-106 -60L-166 -66L-194 -42L-194 -47Z', p.edge);
    for(let i = -3; i <= 3; i++) {

        if(i) windowGlass(ctx, i * 42, -44 - (3 - Math.abs(i)) * 7, .56, .98, p, i % 3 !== 0);

    }
    roseWindow(ctx, 0, -83, 17, p);
    windowGlass(ctx, 0, -53, .85, 1.55, p, false);
    spire(ctx, -130, 14, .8, p, true);
    spire(ctx, 128, 14, .94, p, true);
    spire(ctx, -54, 3, .56, p, true);
    ctx.restore();

}


function arch(ctx, x, y, s, p, broken) {

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    // The open centre is real negative space so the skyline shows through it.
    const upright = 'M-61 173V-13L-64 -19L-60 -22V-35L-52 -52L-50 -76L-47 -54L-42 -47L-43 -33L-31 -24L-34 -17V173Z';
    shape(ctx, upright, p.ruin, p.edge, 1.3);
    shape(ctx, 'M-56 161V-19M-50 161V-25M-41 155V-19M-63 -18H-34M-61 -12H-34M-58 -32H-43', null, p.edge, 1.5);
    if(!broken) {

        ctx.save();
        ctx.scale(-1, 1);
        shape(ctx, upright, p.ruin, p.edge, 1.3);
        shape(ctx, 'M-55 161V-18M-48 161V-26M-64 -17H-34M-61 -12H-34', null, p.edge, 1.5);
        ctx.restore();
        shape(ctx, 'M-54 -29Q-52 -80 0 -118Q51 -81 54 -29L39 -19Q38 -66 0 -99Q-38 -66 -39 -19Z', p.ruin, p.edge, 1.6);
        shape(ctx, 'M-46 -26Q-44 -75 0 -109Q44 -74 46 -26M-48 -64L-37 -59M-27 -92L-21 -84M22 -93L16 -85M44 -66L35 -61', null, p.edge, 1.4);

    } else {

        shape(ctx, 'M-54 -31Q-53 -65 -30 -88L-23 -85L-17 -88L-19 -78L-15 -75Q-39 -48 -39 -20Z', p.ruin, p.edge, 1.6);

    }
    ctx.restore();

}


function bough(ctx, x, y, scale, p) {

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, Math.abs(scale));
    shape(ctx, 'M-18 97Q3 59 -3 34Q-15 11 -12 -13Q-23 -29 -47 -34Q-27 -34 -17 -26L-31 -44Q-13 -31 -9 -25Q-1 -40 2 -70L7 -82Q3 -62 4 -51Q15 -60 24 -77L18 -59L37 -69Q24 -55 6 -46L-3 -20Q-7 -1 4 13Q21 1 30 -26L42 -44L35 -24L52 -29Q38 -19 33 -17L26 4L46 -7L65 -9L48 -3Q40 8 23 13Q8 20 9 42Q15 74 23 97Z', p.ruin);
    shape(ctx, 'M-8 81Q8 48 0 29Q-10 6 -7 -14M9 14Q25 4 32 -16', null, p.edge, 1.1);
    ctx.restore();

}


function shrine(ctx, x, ground, p) {

    ctx.save();
    ctx.translate(x, ground);
    shape(ctx, 'M-23 1L-21 -6L-16 -8V-14L-12 -15V-54L-16 -56L-16 -60L-12 -62L-10 -70L0 -78L11 -69L12 -63L17 -59L16 -55L12 -54L13 -16L17 -14L18 -9L22 -6L24 1Z', p.ruin, p.edge, 1.4);
    windowGlass(ctx, 0, -55, .61, .49, p, false);
    shape(ctx, 'M-5 -34Q-7 -44 0 -46Q8 -46 7 -38Q7 -34 4 -33L4 -29L-1 -28L-4 -30Z', p.trim);
    oval(ctx, -1.6, -37.5, 2, 1.6, p.ruin);
    oval(ctx, 3.8, -38, 1.7, 1.5, p.ruin);
    shape(ctx, 'M-16 -9Q-10 -13 -7 -20Q-7 -32 -10 -36M-9 -19Q-15 -22 -18 -30M-7 -23Q-1 -23 3 -30', null, p.trim, 1.4);
    for(let i = 0; i < 5; i++) {

        const dx = -13 + Math.sin(i * 2.4) * 5;
        const dy = -16 - i * 3.4;
        oval(ctx, dx, dy, 2, 1.6, p.flower);

    }
    ctx.restore();

}


function belfry(ctx, x, y, p, scale) {

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    shape(ctx, 'M-53 -22Q-28 -5 0 -14Q26 -8 51 -22M-50 -19Q-24 3 0 -9Q25 -1 49 -18M-47 -15Q-30 12 -4 -3', null, p.trim, .8);
    line(ctx, 0, -14, 0, 29, p.edge, 1.5);
    shape(ctx, 'M-2 29Q-5 23 0 23Q5 23 2 29Q12 31 12 44L15 52L19 55L18 58Q0 62 -19 58L-18 55L-14 51Q-12 44 -11 38Q-9 30 -2 29Z', p.edge, p.ruin, 1.6);
    shape(ctx, 'M-9 45Q-10 33 -3 33L-6 48ZM-13 52Q0 55 13 52M-17 56Q0 59 17 56', null, p.trim, 1.4);
    oval(ctx, 0, 61, 2.7, 4.4, p.trim);
    ctx.restore();

}


function standard(ctx, x, y, p, mirror) {

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(mirror, 1);
    shape(ctx, 'M0 -2Q18 3 40 -4Q38 26 34 34L36 48L31 45L31 60L23 54L20 70L14 59L9 66L9 49L5 53L7 33Q10 18 0 -2Z', '#855653', p.ruin, 1.6);
    shape(ctx, 'M7 3Q22 8 36 0M13 8Q22 12 32 6M16 55L17 38M28 49Q25 45 29 32', null, p.trim, 1.1);
    shape(ctx, 'M21 16L24 23L29 22L25 27L26 34L21 30L17 35L18 28L14 24L19 24Z', p.accent);
    line(ctx, -4, -3, 43, -5, p.trim, 2);
    ctx.restore();

}


function middle(ctx, p, seed, region) {

    ctx.save();
    ctx.globalAlpha = .86;
    arch(ctx, 88, 327, 1.14, p, false);
    arch(ctx, 238, 345, .95, p, true);
    arch(ctx, 979, 346, 1.26, p, region === 2);
    if(region === 0) {

        shrine(ctx, 375, 409, p);
        shrine(ctx, 792, 405, p);

    } else if(region === 1) {

        belfry(ctx, 88, 231, p, 1.02);
        belfry(ctx, 979, 241, p, 1.15);

    } else {

        standard(ctx, 122, 284, p, -1);
        standard(ctx, 931, 312, p, 1);

    }
    bough(ctx, 688, 373, -1, p);
    bough(ctx, 846, 396, .66, p);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(0, 540);
    for(let x = 0; x <= TILE; x += 24) ctx.lineTo(x, 404 + 12 * Math.sin(x / TILE * Math.PI * 4));
    ctx.lineTo(TILE, 540);
    ctx.fillStyle = p.ruin;
    ctx.fill();
    for(let i = 0; i < 42; i++) {

        const x = 12 + i * 27;
        const y = 411 + 12 * Math.sin(x / TILE * Math.PI * 4);
        const h = 7 + random(seed, i) * 16;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((random(seed + 3, i) - .5) * .36);
        ctx.scale(h / 20, h / 20);
        shape(ctx, i % 3 ? 'M-5 2V-13Q-5 -18 0 -21Q6 -18 6 -13V2Z' : 'M-3 2V-12H-9V-16H-3V-21H2V-16H8V-12H2V2Z', p.ruin);
        ctx.restore();

    }
    const shade = ctx.createLinearGradient(0, 406, 0, 540);
    shade.addColorStop(0, p.stone + '00');
    shade.addColorStop(1, p.stone);
    ctx.fillStyle = shade;
    ctx.fillRect(0, 405, TILE, 135);

}


function makeLayer(paint, p, seed, region) {

    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(TILE, HEIGHT) : document.createElement('canvas');
    canvas.width = TILE;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    paint(ctx, p, seed, region);
    return canvas;

}


export function drawBackdrop(ctx, region, cameraX, time, width, height, seed = 1) {

    const p = PALETTES[region] || PALETTES[0];
    const key = region + '/' + seed;
    let layers = scenes.get(key);
    if(!layers) {

        layers = [
            makeLayer((g, palette, s, r) => sky(g, palette, r, s), p, seed, region),
            makeLayer(cemetery, p, seed, region),
            makeLayer(middle, p, seed, region)
        ];
        if(scenes.size >= 3) scenes.delete(scenes.keys().next().value);
        scenes.set(key, layers);

    }
    ctx.save();
    ctx.scale(height / HEIGHT, height / HEIGHT);
    const span = width * HEIGHT / height;
    const parallax = [.045, .19, .41];
    layers.forEach((layer, i) => {

        const offset = ((cameraX * parallax[i] % TILE) + TILE) % TILE;
        for(let x = -offset; x < span; x += TILE) ctx.drawImage(layer, x, 0);

    });
    for(let i = 0; i < 28; i++) {

        const x = ((random(seed, i) * span + Math.sin(time * .42 + i) * 18 - cameraX * .56) % span + span) % span;
        const y = 145 + random(seed + 6, i) * 270 + Math.sin(time * .64 + i * 2.3) * 10;
        ctx.globalAlpha = .3 + .3 * (Math.sin(time * 1.2 + i) + 1);
        oval(ctx, x, y, i % 4 ? .8 : 1.5, i % 4 ? .8 : 1.5, p.moon);

    }
    ctx.restore();

}


function weed(ctx, x, y, h, p, bloom) {

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(h / 16, h / 16);
    shape(ctx, 'M-2 0Q-4 -9 -10 -13Q-2 -10 0 -3Q4 -12 2 -18Q7 -10 3 -1Q8 -9 14 -10Q8 -4 7 0Z', p.trim);
    if(bloom) {

        line(ctx, 0, -2, -4, -18, p.trim);
        shape(ctx, 'M-4 -15Q-10 -16 -10 -21Q-6 -21 -4 -18Q-6 -23 -2 -26Q0 -21 -2 -18Q1 -20 4 -20Q2 -14 -4 -15Z', p.flower);

    }
    ctx.restore();

}


export function drawPlatform(ctx, platform, region) {

    const p = PALETTES[region] || PALETTES[0];
    const {x, y, w, h, kind} = platform;
    const ledge = kind === 'ledge';
    const lip = Math.min(h, ledge ? 7 : 10);
    const key = Math.floor(x + y * 31);
    ctx.save();
    ctx.translate(x, y);
    if(ledge) {

        const depth = Math.min(27, Math.max(h, 17));
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(w, 0);
        ctx.lineTo(w - 2, depth * .5);
        for(let dx = w - 8; dx > 4; dx -= 13) ctx.lineTo(dx, depth * (.58 + .42 * random(key, dx | 0)));
        ctx.lineTo(2, depth * .6);
        ctx.closePath();
        ctx.fillStyle = p.stone;
        ctx.fill();
        if(w > 65) {

            ctx.save();
            ctx.translate(w * .5, depth - 2);
            shape(ctx, 'M-21 -6Q-10 0 -4 -1L0 11L4 -1Q10 0 21 -6L0 -4Z', p.edge);
            shape(ctx, 'M-4 -4L0 -7L4 -4L0 2Z', p.trim);
            ctx.restore();

        }

    } else {

        ctx.fillStyle = p.stone;
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        for(let row = 0; row * 19 < h; row++) {

            let dx = row % 2 ? -17 : -3;
            let i = 0;
            while(dx < w) {

                const bw = 21 + Math.floor(random(key + row, i++) * 28);
                const dy = 10 + row * 19;
                ctx.fillStyle = row % 3 ? p.ruin + '85' : p.ruin;
                ctx.fillRect(dx + 1, dy + 1, bw - 2, 16);
                line(ctx, dx + 2, dy + 2, dx + bw - 4, dy + 2, p.edge + '55');
                if(i % 4 === 0) line(ctx, dx + bw * .7, dy + 3, dx + bw * .58, dy + 8, p.stone);
                dx += bw;

            }

        }
        ctx.restore();

    }
    ctx.fillStyle = p.edge;
    ctx.fillRect(0, 0, w, lip);
    ctx.fillStyle = p.trim;
    ctx.fillRect(1, 0, Math.max(0, w - 2), 2);
    for(let i = 1; i * 21 < w - 2; i++) {

        const dx = i * 21 + random(key, i) * 5;
        line(ctx, dx, 1, dx - 2.5, lip - 1, p.stone, 1.5);
        if(!ledge && i % 3 === 0) weed(ctx, dx - 10, .5, 6 + random(key, i + 1) * 8, p, i % 2 === 0);

    }
    if(ledge && w > 50) weed(ctx, 12, 0, 7, p, key % 2 === 0);
    ctx.restore();

}


function weapon(ctx, kind, attack) {

    ctx.save();
    ctx.translate(9, -16);
    ctx.rotate(attack ? -.64 + Math.min(1, attack / .27) * 2.5 : .54);
    const steel = '#d8e6df';
    const shadow = '#749a9b';
    if(kind === 'pike') {

        line(ctx, -11, 10, 27, -25, '#563f3d', 2.9);
        line(ctx, -10, 9, 29, -27, '#c69d73', 1);
        shape(ctx, 'M22 -22L25 -30L41 -39L31 -23L24 -19L27 -25Z', steel, '#24343d', .8);
        shape(ctx, 'M6 -6Q13 -10 16 -15Q15 -10 18 -8L12 -6L14 -12Z', '#c77665');

    } else if(kind === 'cleaver') {

        shape(ctx, 'M2 -4L11 -15L15 -15L20 -23L29 -28L30 -17Q26 -6 10 -3L7 0Z', shadow, '#192831', 1.2);
        shape(ctx, 'M8 -2Q24 -6 30 -22L30 -16Q25 -5 9 0Z', steel);
        line(ctx, -3, 4, 7, -6, '#c1936e', 3.1);

    } else {

        shape(ctx, 'M3 -4Q12 -10 28 -24Q22 -11 5 0Z', steel, '#26363d', .9);
        shape(ctx, 'M5 -3L25 -21L7 -2Z', shadow);
        line(ctx, -4, 4, 5, -4, '#b88761', 2.8);
        shape(ctx, 'M-1 -7Q3 -3 10 -2L8 0L1 -2L-3 -5Z', '#e3ba7d');

    }
    ctx.restore();

}


export function drawHero(ctx, player, time) {

    const {x, y, w, h} = player;
    const warm = !player.slot;
    const mantle = warm ? '#e6daba' : '#a8e1db';
    const mid = warm ? '#ae9e82' : '#70a5ae';
    const ribbon = warm ? '#b9574e' : '#566aa2';
    const gait = player.grounded ? Math.sin(time * 15) * Math.min(1, Math.abs(player.vx || 0) / 72) : .46;
    ctx.save();
    ctx.translate(x + w * .5, y + h);
    ctx.scale((player.face === -1 ? -1 : 1) * w / 28, h / 44);
    if(player.hp <= 0) {

        ctx.globalAlpha = .52;
        ctx.scale(1, .5);

    } else if(player.hurt > 0 && Math.sin(time * 48) > .5) ctx.globalAlpha = .5;
    if(player.dash > 0) ctx.transform(1, 0, -.21, .86, 0, 0);
    ctx.lineJoin = 'round';
    line(ctx, -4, -11, -5 - 5 * gait, -1, '#18252d', 4.5);
    line(ctx, 4, -11, 4 + 5 * gait, -2, '#2c3e42', 4);
    line(ctx, -6 - 5 * gait, -.8, -2 - 5 * gait, -.8, '#bbad94', 1.8);
    line(ctx, 3 + 5 * gait, -1.4, 8 + 5 * gait, -1.4, '#ddd4b8', 1.8);
    ctx.translate(0, Math.abs(gait) * -.8 + Math.sin(time * 3) * .5);
    ctx.save();
    ctx.rotate(.07 * Math.sin(time * 5) - .12 * Math.abs(gait));
    shape(ctx, 'M-1 -28Q-11 -30 -15 -26Q-20 -23 -24 -25Q-20 -20 -16 -22Q-21 -17 -27 -15Q-16 -15 -11 -22Q-6 -26 -1 -24Z', ribbon, '#493b41', .8);
    ctx.restore();
    shape(ctx, 'M-5 -27Q-13 -22 -13 -13L-17 -6L-9 -7L-4 -3L0 -9L8 -5L11 -8L8 -18Q7 -25 2 -27Z', mantle, '#273439', 1.2);
    shape(ctx, 'M-6 -23Q-6 -14 -11 -8L-6 -10L-4 -6L1 -11L7 -7L4 -11L2 -24Z', mid);
    shape(ctx, 'M-9 -9Q-5 -12 -3 -19M1 -10Q3 -14 2 -18', null, '#eee3c7', .8);
    shape(ctx, 'M-9 -30Q-13 -35 -9 -40Q-8 -44 -2 -44L5 -41Q9 -39 11 -32L8 -27L0 -24L-8 -26Z', mantle, '#26363b', 1.2);
    shape(ctx, 'M-10 -39Q-3 -40 2 -35L-1 -29L-8 -27Q-12 -33 -10 -39Z', mid);
    shape(ctx, 'M0 -38Q7 -41 10 -35L12 -33L10 -30L4 -26L-1 -29L-3 -34Z', '#344348');
    shape(ctx, 'M-1 -36Q3 -40 8 -38L12 -34L10 -31L8 -32L6 -28L3 -29L1 -33L-2 -32Z', '#f4edcf');
    shape(ctx, 'M4 -35L8 -35L5.7 -32Z', '#223439');
    shape(ctx, 'M-9 -28Q-1 -29 7 -28L9 -25Q2 -23 -7 -25Z', ribbon);
    oval(ctx, .7, -24.3, 1.65, 1.65, '#efc982');
    weapon(ctx, player.weapon, player.attack);
    ctx.restore();

}


// The creatures use normalized sixty-four-unit portraits so their silhouettes follow their hitboxes.
function skull(ctx, x, y, size, bone, eye, longJaw = false) {

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    shape(ctx, 'M-9 -6Q-7 -15 2 -14Q10 -14 13 -8L12 -3L15 0L13 3L9 3L7 8L3 6L1 7L-4 3L-7 1Z', bone, '#352e35', 1.45);
    shape(ctx, 'M-6 -6Q-1 -9 4 -5L2 -1L-3 -1ZM7 -6L12 -6L10 -2L7 -2Z', '#342b37');
    shape(ctx, 'M5 -2L7 1L3 1Z', '#62535a');
    oval(ctx, .1, -4, 1.7, 1.35, eye);
    oval(ctx, 9, -4.1, 1, 1, eye);
    shape(ctx, longJaw ? 'M-4 3L1 8L8 7L12 3L10 11L3 13L-3 9Z' : 'M-3 3L1 6L8 5L12 3L9 8L3 10L-3 7Z', bone, '#473842', 1);
    line(ctx, 2.8, 5, 3.7, 7, '#59474c');
    line(ctx, 6.7, 5, 6.5, 7.4, '#59474c');
    ctx.restore();

}


function husk(ctx, time, warn) {

    const gait = Math.sin(time * 7);
    line(ctx, -7, -20, -12 + gait * 4, -3, '#57454c', 6);
    line(ctx, 2, -18, 6 - gait * 4, -2, '#7e7164', 4);
    shape(ctx, 'M-16 -4L-9 -5L-4 -2L-3 0L-15 0ZM4 -4L10 -4L14 -1L11 0L4 0Z', '#b9a298');
    shape(ctx, 'M-10 -42Q0 -49 8 -34L5 -24L9 -14L2 -16L-3 -13L-8 -18L-15 -16L-11 -27Z', '#66565f', '#302c35', 1.7);
    shape(ctx, 'M-6 -36L4 -39L7 -34L-3 -32ZM-7 -30L4 -33L5 -30L-5 -27ZM-6 -24L2 -27L3 -25L-4 -22Z', '#b6a48e');
    shape(ctx, 'M-17 -39Q-11 -48 -5 -46L3 -41L-1 -35L-12 -32L-14 -25L-17 -29Z', '#64776c', '#303337', 1.4);
    line(ctx, 4, -37, 13, warn ? -48 : -29, '#a69180', 4.2);
    line(ctx, 13, warn ? -48 : -29, 19, warn ? -51 : -31, '#bdad92', 3);
    skull(ctx, 4, -49, .95, '#c5b39a', '#f58f78', true);
    shape(ctx, 'M-4 -58Q-5 -67 1 -70Q2 -63 0 -59Q5 -63 8 -63Q7 -58 2 -57Z', '#a7b18a');

}


function moth(ctx, time, warn) {

    const flap = .76 + .23 * Math.sin(time * (warn ? 17 : 10));
    ctx.save();
    ctx.translate(-1, -39);
    ctx.scale(1, flap);
    for(const side of [-1, 1]) {

        ctx.save();
        ctx.scale(side, 1);
        shape(ctx, 'M1 2Q7 -22 23 -28Q27 -18 20 -9Q21 -3 15 1Q17 5 11 8L5 9Z', '#727b89', '#3c3949', 1.5);
        shape(ctx, 'M3 1Q11 -14 21 -23L13 -6L7 1ZM6 4L15 -3L11 4Z', '#c2b69f');
        shape(ctx, 'M4 5Q12 4 18 7Q15 14 8 19L8 13L4 14Z', '#9e7478');
        oval(ctx, 16.5, -15, 3.1, 4.7, '#6e525d');
        oval(ctx, 16.8, -15.5, 1.1, 2.1, '#efb29d');
        ctx.restore();

    }
    ctx.restore();
    shape(ctx, 'M-5 -40Q-10 -26 -5 -17L-3 -7L1 -13L2 -4L5 -17Q10 -26 6 -39Z', '#756069', '#342e3a', 1.6);
    shape(ctx, 'M-5 -30L4 -32L5 -29L-4 -27ZM-4 -24L5 -25L4 -23L-3 -21Z', '#cba59b');
    skull(ctx, 1, -40, .67, '#dbccb0', '#ffa390');
    shape(ctx, 'M-4 -47Q-13 -59 -10 -63M3 -48Q9 -56 7 -62', null, '#caab99', 1.4);

}


function digger(ctx, time, warn) {

    const gait = Math.sin(time * 5) * 2;
    line(ctx, -6, -22, -10 + gait, -2, '#56464e', 6.5);
    line(ctx, 5, -23, 10 - gait, -2, '#7b6962', 5);
    shape(ctx, 'M-16 -44Q-8 -55 3 -48Q12 -43 13 -28L17 -14L8 -15L3 -12L-1 -17L-12 -13L-11 -20L-18 -18Z', '#655863', '#302b34', 1.6);
    shape(ctx, 'M-9 -42L-1 -46L6 -39L10 -23L4 -18L-6 -21Z', '#98836d');
    shape(ctx, 'M-6 -32L7 -36M-4 -28L9 -31M-3 -24L9 -27', null, '#544a4a', 1.6);
    skull(ctx, 1, -49, .82, '#c2b197', '#ff9b78');
    shape(ctx, 'M-14 -54L-10 -56Q-12 -65 -5 -67L5 -65L9 -59L15 -58L15 -55L-9 -52Z', '#424653', '#89918a', 1.2);
    ctx.save();
    ctx.translate(9, -30);
    ctx.rotate(warn ? -.8 : -.17);
    line(ctx, -12, 17, 19, -26, '#c19a73', 3);
    shape(ctx, 'M11 -21L16 -21L24 -32L22 -39L13 -38L8 -29Z', '#a0a9a0', '#423e44', 1.4);
    shape(ctx, 'M11 -29L19 -37L13 -26Z', '#d4c9ac');
    ctx.restore();
    oval(ctx, 8, -29, 3.3, 2.8, '#c2b297');

}


function sexton(ctx, time, warn) {

    const brass = '#b59967';
    const shade = '#65574d';
    shape(ctx, 'M-14 -24L-7 -21L-9 -6L-15 -2H-19L-18 -7ZM3 -23L11 -24L13 -7L18 -3L15 0L6 -1Z', '#574953', '#302a35', 1.2);
    shape(ctx, 'M-14 -47Q-3 -54 9 -46Q16 -39 15 -31L20 -15L16 -16L18 -10L8 -13L6 -8L-2 -13L-7 -7L-10 -12L-18 -10L-15 -18L-21 -16L-17 -30Z', '#635662', '#322d36', 1.4);
    shape(ctx, 'M-7 -44L0 -46L8 -42L11 -17L5 -12L-2 -17Z', '#97795d');
    shape(ctx, 'M-6 -41L1 -43L6 -40L3 -37L8 -35L0 -32L7 -29L1 -26L8 -23L5 -19L-1 -17Z', '#b2a288', '#60504e', 1);
    shape(ctx, 'M-14 -40Q-21 -34 -21 -26L-16 -22L-11 -27L-12 -39Z', shade, '#302a35', 1.6);
    skull(ctx, 0, -48, .83, '#d5c1a2', '#ffc378', true);
    // An upturned funeral bell forms the Sexton's mitre.
    shape(ctx, 'M-15 -53Q-11 -55 -11 -59Q-11 -65 -4 -66L-2 -70L1 -69L4 -65Q12 -64 12 -58L15 -56L17 -53Q6 -50 -15 -53Z', shade, '#3e383b', 1.4);
    shape(ctx, 'M-9 -57Q-7 -64 -3 -64L-4 -56ZM1 -64Q6 -63 8 -56L6 -56Z', brass);
    shape(ctx, 'M-14 -54Q0 -52 15 -54', null, '#e0ca91', 1.2);
    ctx.save();
    ctx.translate(13, -36);
    ctx.rotate(warn ? -.65 : .06 * Math.sin(time * 3));
    line(ctx, -3, 5, 5, -8, '#bfaa88', 3);
    line(ctx, 5, -8, 12, -4, brass, 1.4);
    line(ctx, 12, -4, 14, 3, brass, 1.3);
    shape(ctx, 'M8 5Q13 0 18 4Q20 8 19 13L23 17Q17 20 5 17L9 12Z', shade, brass, 1.4);
    shape(ctx, 'M12 7Q14 4 15 6L13 14L11 15Z', '#c3a670');
    oval(ctx, 14.5, 18.6, 2, 2.5, brass);
    ctx.restore();

}


function widow(ctx, time, warn) {

    const joint = '#b89993';
    const pulse = Math.sin(time * (warn ? 9 : 3)) * 2;
    for(const side of [-1, 1]) {

        ctx.save();
        ctx.scale(side, 1);
        for(let i = 0; i < 3; i++) {

            const x = 13 + i * 4;
            const knee = -38 + i * 6 + pulse;
            ctx.beginPath();
            ctx.moveTo(3, -33);
            ctx.lineTo(x, knee - 10);
            ctx.lineTo(20 + i * 3, knee + 1);
            ctx.lineTo(18 + i * 2, -3 - i * 2);
            ctx.lineTo(23 + i * 2, -.5 - i * 2);
            ctx.strokeStyle = '#463647';
            ctx.lineWidth = 3.3;
            ctx.stroke();
            line(ctx, x, knee - 10, 20 + i * 3, knee + 1, joint, 1.15);
            oval(ctx, x, knee - 10, 1.5, 1.4, '#d8b7a8');

        }
        ctx.restore();

    }
    shape(ctx, 'M-6 -40Q-16 -37 -13 -26Q-20 -15 -17 -8L-12 -10L-10 -4L-4 -6L0 0L4 -7L9 -4L12 -11L17 -9Q18 -17 12 -25Q16 -38 7 -41Z', '#584159', '#322735', 1.5);
    shape(ctx, 'M-8 -17Q-7 -28 0 -34Q8 -28 9 -17L5 -11L0 -6L-5 -10Z', '#916075');
    shape(ctx, 'M-7 -19L0 -15L8 -20M-5 -14L0 -10L5 -15M0 -32V-9', null, '#d0a498', 1);
    shape(ctx, 'M-14 -41Q-15 -51 -9 -57Q-8 -65 0 -66Q9 -65 10 -58Q17 -49 14 -37L10 -41L8 -36L3 -42L-3 -38L-8 -42L-12 -36Z', '#846c81', '#402f40', 1.5);
    skull(ctx, 0, -49, .69, '#e7c6b9', '#f79eae');
    shape(ctx, 'M-11 -54Q-6 -59 -1 -62Q5 -60 11 -54L7 -56L9 -51L4 -55L1 -52L-3 -56L-8 -53L-7 -57Z', '#b79da6');
    for(let i = -2; i <= 2; i++) {

        const x = i * 3.8;
        const y = -62 + Math.abs(i);
        oval(ctx, x, y, 2.5, 2.6, '#a66577');
        oval(ctx, x + .6, y - .6, .9, .9, '#edb2a0');

    }
    ctx.save();
    ctx.translate(-12, -52);
    ctx.rotate(.07 * pulse);
    shape(ctx, 'M1 0Q-7 11 -6 25L-9 34L-7 33L-4 23L-2 27L-3 17L0 20L-1 10L3 4Z', '#ba9ca8');
    ctx.restore();

}


function saint(ctx, time, warn) {

    const gold = warn ? '#ffd394' : '#d29d6b';
    ctx.save();
    ctx.translate(0, -52);
    ctx.rotate(Math.sin(time * .7) * .08);
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 15, 0, 0, 2 * Math.PI);
    ctx.strokeStyle = gold;
    ctx.lineWidth = .95;
    ctx.stroke();
    for(let i = 0; i < 12; i++) {

        ctx.rotate(Math.PI / 6);
        shape(ctx, 'M-.8 -15L0 -20L1 -15Z', gold);

    }
    ctx.restore();
    for(const side of [-1, 1]) {

        ctx.save();
        ctx.scale(side, 1);
        ctx.rotate(.025 * Math.sin(time * 2));
        shape(ctx, 'M3 -43Q13 -47 20 -57L22 -63L22 -53L27 -58Q24 -49 20 -45L25 -47L18 -38L22 -40L15 -31L16 -36L9 -28L11 -37L5 -33Z', '#b59784', '#503b41', 1);
        shape(ctx, 'M6 -40Q15 -46 21 -55M11 -40L18 -48M14 -39L18 -44', null, '#edc69d', 1);
        ctx.restore();

    }
    shape(ctx, 'M-8 -44L5 -45Q13 -35 11 -24L15 -8L21 -2L13 -3L14 0L7 -3L6 0L0 -4L-9 0L-8 -3L-18 -1Q-12 -11 -13 -22Q-15 -36 -8 -44Z', '#78666a', '#45353d', 1.5);
    shape(ctx, 'M-2 -42L4 -44Q5 -28 8 -20L12 -6L4 -8L1 -20L-2 -10L-7 -6L-5 -21Z', '#d7b89a');
    shape(ctx, 'M-11 -40Q-8 -44 -6 -44L-2 -36L-2 -26L-8 -21L-14 -24Z', '#a58b77');
    shape(ctx, 'M-8 -37L5 -40L7 -37L-5 -34ZM-7 -31L5 -34L5 -32L-4 -29Z', '#e1c4a5');
    skull(ctx, 0, -49, .79, '#e7cfb2', '#ffb263', true);
    shape(ctx, 'M-8 -56L-10 -63L-5 -61L-7 -69L0 -61L4 -68L5 -62L10 -65L8 -57L2 -59Z', gold, '#6b5149', 1);
    ctx.save();
    ctx.translate(13, -30);
    ctx.rotate(warn ? -.43 : .08);
    line(ctx, 1, 27, 3, -28, gold, 1.7);
    shape(ctx, 'M3 -24Q-3 -25 -3 -31L0 -35L1 -30L3 -39L6 -33L7 -35Q12 -27 3 -24Z', '#d28561', '#815a4f', 1);
    shape(ctx, 'M2 -26Q0 -29 4 -33L5 -29L6 -31Q7 -27 2 -26Z', '#ffe2a6');
    ctx.restore();

}


const CREATURES = {husk, moth, gravedigger: digger, sexton, widow, saint};


export function drawEnemy(ctx, enemy, time) {

    const paint = CREATURES[enemy.kind];
    if(!paint || enemy.hp <= 0) return;
    const {x, y, w, h, mode} = enemy;
    const warn = mode === 'warn';
    const portraitWidth = enemy.kind === 'widow' || enemy.kind === 'saint' ? 54 : enemy.kind === 'moth' ? 48 : 42;
    ctx.save();
    ctx.translate(x + w * .5, y + h);
    ctx.scale((enemy.face === -1 ? -1 : 1) * w / portraitWidth, h / 67);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if(warn) {

        ctx.transform(1, 0, .075, .98, 0, 0);

    } else if(mode === 'strike') ctx.transform(1, 0, -.12, .94, 0, 0);
    else if(mode === 'recover') ctx.scale(1, .93);
    paint(ctx, time + (enemy.phase || 0), warn);
    ctx.restore();

}
