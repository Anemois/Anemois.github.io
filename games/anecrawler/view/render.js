import {TILE, WORLDS, FLOORS_PER_WORLD} from "../sim/data.js";
import {VOID, FLOOR, WALL, CRATE} from "../sim/map.js";
import {floorName} from "../sim/loot.js";
import {alpha, mix, createLightLayer} from "../../../lib/fx.js";
import {createEffects} from "./effects.js";
import {createFog} from "./fog.js";
import {createActors} from "./actors.js";
import {createHud} from "./hud.js";
import {weaponLook} from "./sprites.js";
import {circle, shadow, roundRect, diamond, label, FONT} from "./draw.js";


const VIEW_W = 528;                 // world units across the screen
const SIGHT_LIGHT = 230;            // how far a player's own light reaches
const DARKNESS = 0.62;              // how dark the unlit cave is (0..1)
const MAX_BULLET_LIGHTS = 40;

const LOBBY = {name: "Lobby", floor: "#111111", line: "#151515", wall: "#1c1c1c", top: "#262626"};

const PORTALS = {
    run:  {colour: "#63d69f", label: "Start run"},
    next: {colour: "#61a8ff", label: "Next floor"},
    home: {colour: "#9ca3af", label: "Go home"}
};

const TAU = Math.PI * 2;


export const worldOf = floor =>
    WORLDS[(Math.ceil(floor / FLOORS_PER_WORLD) - 1) % WORLDS.length];


// the colours a floor is drawn with, worked out once per palette
const shadeCache = new WeakMap();

function shadesOf(palette){

    let shades = shadeCache.get(palette);

    if(!shades){

        shades = {
            floors: [palette.floor, mix(palette.floor, palette.line, 0.45), mix(palette.floor, palette.line, 0.9), palette.floor],
            top: palette.top,
            face: palette.wall,
            edge: mix(palette.top, "#ffffff", 0.08),
            pebble: mix(palette.line, "#ffffff", 0.05)
        };

        shadeCache.set(palette, shades);

    }

    return shades;

}


// Draws the game for one player. resize() when the canvas may have changed
// size, handle() for each batch of events, draw() per frame.
export function createRenderer(canvas){

    const ctx = canvas.getContext("2d");
    const effects = createEffects();
    const fx = effects.fx;
    const fog = createFog();
    const dark = createLightLayer({scale: 0.25});
    const actors = createActors(ctx, effects);
    const hud = createHud(ctx, effects, fog);

    const camera = {x: 0, y: 0, snap: true};

    let dpr = 1;
    let scale = 1;
    let viewH = VIEW_W * 9 / 16;
    let time = 0;


    function resize(){

        const w = canvas.clientWidth;
        const h = canvas.clientHeight;

        if(!w || !h)
            return false;

        dpr = Math.min(2, window.devicePixelRatio || 1);

        const pw = Math.round(w * dpr);
        const ph = Math.round(h * dpr);

        if(canvas.width !== pw || canvas.height !== ph){

            canvas.width = pw;
            canvas.height = ph;

        }

        scale = canvas.width / VIEW_W;
        viewH = canvas.height / scale;

        return true;

    }


    // canvas pixels (CSS) to world units
    function toWorld(px, py){

        return {
            x: camera.x + (px * dpr - canvas.width / 2) / scale,
            y: camera.y + (py * dpr - canvas.height / 2) / scale
        };

    }

    // world units to canvas pixels (device)
    const screenX = x => (x - camera.x) * scale + canvas.width / 2;
    const screenY = y => (y - camera.y) * scale + canvas.height / 2;


    // events from the world; `alone` = single player (the action may freeze)
    function handle(events, state, me, alone = true){

        for(const event of events){

            if(event.type === "floor" || event.type === "lobby")
                camera.snap = true;

            effects.handle(event, me, alone);

            if(event.type === "floor")
                effects.banner(floorName(event.floor), worldOf(event.floor).name + (event.boss ? " · something big sleeps here" : ""), {life: 2.4});

        }

    }


    /* ---------------- Frame ---------------- */

    // view: {me, dt, aim: {x, y} world point of the cursor}
    function draw(state, view){

        const dt = Math.min(0.05, view.dt);

        time += dt;

        effects.update(dt);
        actors.tick(time);

        const me = state.players.find(p => p.id === view.me);
        const lobby = state.mode === "lobby";
        const palette = lobby ? LOBBY : worldOf(state.floor);

        if(fog.map !== state.map){

            fog.reset(state.map);

            camera.snap = true;

        }

        if(me)
            fog.look(me.x, me.y);

        moveCamera(me, view, dt);

        const [shakeX, shakeY] = fx.offset();

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#070707";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.setTransform(scale, 0, 0, scale, canvas.width / 2 - (camera.x + shakeX) * scale, canvas.height / 2 - (camera.y + shakeY) * scale);

        const left = camera.x - VIEW_W / 2 - TILE;
        const top = camera.y - viewH / 2 - TILE;
        const right = camera.x + VIEW_W / 2 + TILE;
        const bottom = camera.y + viewH / 2 + TILE;

        const onScreen = (x, y, pad = 40) =>
            x > left - pad && x < right + pad && y > top - pad && y < bottom + pad;

        drawMap(state.map, shadesOf(palette), left, top, right, bottom);

        fx.drawUnder(ctx);

        for(const s of state.strikes)
            drawStrike(s);

        for(const l of state.lasers)
            drawLaser(l);

        for(const prop of state.props)
            if(onScreen(prop.x, prop.y) && fog.knows(prop.x, prop.y))
                drawProp(prop, me);

        for(const pk of state.pickups)
            if(onScreen(pk.x, pk.y) && fog.sees(pk.x, pk.y))
                drawPickup(pk);

        // only what you can see right now (a woken boss shows through the dark)
        for(const e of state.enemies)
            if(onScreen(e.x, e.y, 80) && (fog.sees(e.x, e.y) || (e.boss && !e.asleep)))
                actors.enemy(e, state);

        state.players.forEach((p, i) => actors.player(p, i, state));

        for(const b of state.bullets)
            if(onScreen(b.x, b.y, 120))
                actors.bullet(b);

        fx.draw(ctx);

        if(lobby)
            for(const e of state.enemies)
                if(e.dummy)
                    actors.dummyLabel(e, state);

        if(me && me.near !== null){

            const prop = state.props.find(p => p.id === me.near);

            if(prop)
                drawPrompt(prop);

        }

        fx.drawText(ctx);

        if(!lobby)
            drawDarkness(state, onScreen);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        hud.draw(state, me, {
            W: canvas.width / dpr,
            H: canvas.height / dpr,
            time,
            world: palette,
            toScreen: (x, y) => [screenX(x) / dpr, screenY(y) / dpr]
        });

    }


    function moveCamera(me, view, dt){

        if(!me)
            return;

        // lead a little towards the cursor
        const lead = 0.22;
        const dx = Math.max(-90, Math.min(90, (view.aim.x - me.x) * lead));
        const dy = Math.max(-60, Math.min(60, (view.aim.y - me.y) * lead));

        const tx = me.x + dx;
        const ty = me.y + dy;

        if(camera.snap){

            camera.x = tx;
            camera.y = ty;
            camera.snap = false;

            return;

        }

        const k = 1 - Math.exp(-dt * 9);

        camera.x += (tx - camera.x) * k;
        camera.y += (ty - camera.y) * k;

    }


    /* ---------------- Map ---------------- */

    // Only explored tiles are drawn; ones out of view right now are dimmed.
    // Rock gets a lighter top and, where it meets floor below, a front face.
    function drawMap(map, shades, left, top, right, bottom){

        const {w, h, tiles} = map;

        const tx0 = Math.max(0, Math.floor(left / TILE));
        const ty0 = Math.max(0, Math.floor(top / TILE));
        const tx1 = Math.min(w - 1, Math.floor(right / TILE));
        const ty1 = Math.min(h - 1, Math.floor(bottom / TILE));

        const open = (x, y) => {

            if(x < 0 || y < 0 || x >= w || y >= h)
                return false;

            const t = tiles[y * w + x];

            return t === FLOOR || t === CRATE;

        };

        for(let ty = ty0; ty <= ty1; ty++){

            for(let tx = tx0; tx <= tx1; tx++){

                const i = ty * w + tx;

                if(!fog.seen(i))
                    continue;

                const tile = tiles[i];
                const x = tx * TILE;
                const y = ty * TILE;

                if(tile === WALL || tile === VOID){

                    // only the rock along the cave's edge is drawn: deeper
                    // rock stays black, which gives the cave its outline
                    if(!open(tx - 1, ty) && !open(tx + 1, ty) && !open(tx, ty - 1) && !open(tx, ty + 1) &&
                        !open(tx - 1, ty - 1) && !open(tx + 1, ty - 1) && !open(tx - 1, ty + 1) && !open(tx + 1, ty + 1))
                        continue;

                    ctx.fillStyle = shades.top;
                    ctx.fillRect(x, y, TILE, TILE);

                    // a front face where the rock meets the floor below
                    if(open(tx, ty + 1)){

                        ctx.fillStyle = shades.face;
                        ctx.fillRect(x, y + TILE - 9, TILE, 9);

                        ctx.fillStyle = shades.edge;
                        ctx.fillRect(x, y + TILE - 9, TILE, 1);

                    }

                    ctx.fillStyle = shades.edge;

                    if(open(tx - 1, ty))
                        ctx.fillRect(x, y, 1, TILE);

                    if(open(tx + 1, ty))
                        ctx.fillRect(x + TILE - 1, y, 1, TILE);

                    if(open(tx, ty - 1))
                        ctx.fillRect(x, y, TILE, 1);

                }
                else{

                    // uneven ground: each tile picks one of a few shades
                    const noise = (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0;

                    ctx.fillStyle = shades.floors[noise & 3];
                    ctx.fillRect(x, y, TILE, TILE);

                    if((noise >>> 4) % 7 === 0){

                        ctx.fillStyle = shades.pebble;
                        ctx.fillRect(x + (noise >>> 8) % 26 + 2, y + (noise >>> 13) % 26 + 2, 3, 2);

                    }

                    // soft shadow under rock
                    if(!open(tx, ty - 1)){

                        ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
                        ctx.fillRect(x, y, TILE, 6);

                    }

                    if(tile === CRATE)
                        drawCrate(x, y, map.crates.get(i) ?? 3);

                }

                if(!fog.visible(i)){

                    ctx.fillStyle = "rgba(7, 7, 7, 0.5)";
                    ctx.fillRect(x, y, TILE, TILE);

                }

            }

        }

    }


    function drawCrate(x, y, hits){

        const inset = 3;

        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.fillRect(x + inset, y + inset + 3, TILE - inset * 2, TILE - inset * 2);

        ctx.fillStyle = hits >= 3 ? "#2e2924" : hits === 2 ? "#29241f" : "#221e1a";
        ctx.fillRect(x + inset, y + inset, TILE - inset * 2, TILE - inset * 2);

        ctx.strokeStyle = "#4a4239";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + inset + 0.75, y + inset + 0.75, TILE - inset * 2 - 1.5, TILE - inset * 2 - 1.5);

        ctx.beginPath();
        ctx.moveTo(x + inset + 2, y + inset + 2);
        ctx.lineTo(x + TILE - inset - 2, y + TILE - inset - 2);

        if(hits >= 3){

            ctx.moveTo(x + TILE - inset - 2, y + inset + 2);
            ctx.lineTo(x + inset + 2, y + TILE - inset - 2);

        }

        ctx.stroke();

    }


    /* ---------------- Light ---------------- */

    // the cave is dark: players, shots, portals and blasts light it up
    function drawDarkness(state, onScreen){

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        dark.begin(canvas.width, canvas.height, DARKNESS);

        const lamp = (x, y, r, strength) => dark.light(screenX(x), screenY(y), r * scale, strength);

        for(const p of state.players)
            lamp(p.x, p.y, p.dead ? SIGHT_LIGHT * 0.5 : SIGHT_LIGHT, 1);

        let count = 0;

        for(const b of state.bullets){

            if(count >= MAX_BULLET_LIGHTS)
                break;

            if(onScreen(b.x, b.y)){

                lamp(b.x, b.y, b.r * 5 + 22, 0.55);

                count++;

            }

        }

        for(const prop of state.props)
            if(onScreen(prop.x, prop.y, 120) && fog.knows(prop.x, prop.y))
                lamp(prop.x, prop.y, prop.kind === "portal" ? 110 : 70, 0.7);

        for(const l of state.lasers){

            if(l.warn > 0)
                continue;

            for(let d = 0; d < l.length; d += 60)
                lamp(l.x + Math.cos(l.angle) * d, l.y + Math.sin(l.angle) * d, 70, 0.6);

        }

        for(const p of state.players){

            if(!p.beam)
                continue;

            for(let d = 40; d < p.beam.length; d += 60)
                lamp(p.x + Math.cos(p.aim) * d, p.y + Math.sin(p.aim) * d, 60, 0.6);

        }

        for(const e of state.enemies)
            if(e.boss && !e.asleep)
                lamp(e.x, e.y, e.r * 4, 0.7);

        fx.lights(lamp);

        dark.end(ctx);

    }


    /* ---------------- Things ---------------- */

    function drawProp(prop, me){

        if(prop.kind === "chest"){

            const open = me ? prop.opened.includes(me.id) : false;
            const boss = prop.source === "boss";
            const trim = boss ? "#facc15" : "#b0b4bb";

            shadow(ctx, prop.x, prop.y, 13);

            if(!open){

                circle(ctx, prop.x, prop.y, 22, alpha(trim, 0.1 + 0.08 * Math.sin(time * 4)));

                if(Math.random() < 0.06)
                    fx.sparkle(prop.x, prop.y - 4, trim, {spread: 12});

            }

            ctx.fillStyle = boss ? "#3a3120" : "#2f2f33";
            ctx.fillRect(prop.x - 13, prop.y - 6, 26, 15);

            ctx.fillStyle = open ? "#18181b" : boss ? "#4a3e26" : "#3c3c42";
            ctx.fillRect(prop.x - 13, open ? prop.y - 16 : prop.y - 11, 26, open ? 6 : 7);

            ctx.fillStyle = trim;
            ctx.fillRect(prop.x - 13, prop.y - 5, 26, 1.5);

            if(!open)
                ctx.fillRect(prop.x - 2, prop.y - 6, 4, 5);

            return;

        }

        if(prop.kind === "portal"){

            const look = PORTALS[prop.target];

            ctx.fillStyle = alpha(look.colour, 0.12 + 0.06 * Math.sin(time * 3));
            ctx.beginPath();
            ctx.ellipse(prop.x, prop.y, 20, 13, 0, 0, TAU);
            ctx.fill();

            for(let i = 0; i < 3; i++){

                const r = 18 - i * 5;
                const a = time * (1.5 + i) + i;

                ctx.strokeStyle = alpha(look.colour, 0.85 - i * 0.2);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(prop.x, prop.y, r, r * 0.62, 0, a, a + Math.PI * 1.4);
                ctx.stroke();

            }

            if(Math.random() < 0.15)
                fx.burst(prop.x, prop.y, {count: 1, colour: look.colour, speed: 16, life: 0.9, size: 1.8, shape: "dot", glow: true, gravity: -26, scatter: 14, drag: 0.5});

            label(ctx, prop.target === "run" ? `${look.label} · ${floorName(prop.floor ?? 1)}` : look.label, prop.x, prop.y + 26, {colour: "#9ca3af", size: 8});

        }

    }


    function drawPrompt(prop){

        const verb = prop.kind === "portal" ? PORTALS[prop.target].label : "Open";
        const y = prop.y - (prop.kind === "portal" ? 30 : 26);
        const text = `E  ${verb}`;

        ctx.font = `bold 8px ${FONT}`;

        const w = ctx.measureText(text).width + 10;

        ctx.fillStyle = "rgba(11, 11, 11, 0.85)";
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 1;

        roundRect(ctx, prop.x - w / 2, y - 7, w, 14, 4);

        ctx.fill();
        ctx.stroke();

        label(ctx, text, prop.x, y, {size: 8, bold: true});

    }


    function drawPickup(pk){

        const bob = Math.sin(time * 6 + pk.id) * 1.2;

        if(pk.kind === "energy"){

            circle(ctx, pk.x, pk.y + bob, 5, "rgba(97, 168, 255, 0.25)");

            ctx.fillStyle = "#93c5fd";
            diamond(ctx, pk.x, pk.y + bob, 2.6, 3.4);

            return;

        }

        if(pk.kind === "shard"){

            circle(ctx, pk.x, pk.y + bob, 6, "rgba(196, 181, 253, 0.25)");

            ctx.fillStyle = "#ddd6fe";
            diamond(ctx, pk.x, pk.y + bob, 3, 5);

            return;

        }

        // heart
        ctx.fillStyle = "#ff5c7a";
        ctx.beginPath();
        ctx.arc(pk.x - 2.2, pk.y + bob - 1, 2.6, 0, TAU);
        ctx.arc(pk.x + 2.2, pk.y + bob - 1, 2.6, 0, TAU);
        ctx.moveTo(pk.x - 4.6, pk.y + bob);
        ctx.lineTo(pk.x, pk.y + bob + 4.5);
        ctx.lineTo(pk.x + 4.6, pk.y + bob);
        ctx.fill();

    }


    function drawStrike(s){

        const k = 1 - Math.max(0, s.delay) / s.total;

        if(s.team === "e"){

            circle(ctx, s.x, s.y, s.r * k, alpha("#ff5c7a", 0.08 + 0.15 * k));

            ctx.strokeStyle = "rgba(255, 92, 122, 0.6)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, TAU);
            ctx.stroke();

            return;

        }

        // a star falling onto its circle
        const colour = weaponLook(s.weapon).colour;
        const height = (1 - k) * 220;

        ctx.strokeStyle = alpha(colour, 0.35);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 0.6, 0, TAU);
        ctx.stroke();

        ctx.strokeStyle = alpha(colour, 0.6);
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(s.x + height * 0.3, s.y - height - 26);
        ctx.lineTo(s.x + height * 0.27, s.y - height);
        ctx.stroke();

        circle(ctx, s.x + height * 0.27, s.y - height, 3, "#ffffff");

    }


    function drawLaser(l){

        const x2 = l.x + Math.cos(l.angle) * l.length;
        const y2 = l.y + Math.sin(l.angle) * l.length;

        ctx.lineCap = "round";

        if(l.warn > 0){

            ctx.strokeStyle = alpha("#facc15", 0.18 + 0.12 * Math.sin(time * 20));
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(l.x, l.y);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.setLineDash([]);

            return;

        }

        ctx.strokeStyle = "rgba(250, 204, 21, 0.25)";
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.strokeStyle = "#fff7cc";
        ctx.lineWidth = 4;
        ctx.stroke();

    }


    return {
        resize, toWorld, handle, draw,
        banner: effects.banner,
        speed: () => fx.speed()
    };

}
