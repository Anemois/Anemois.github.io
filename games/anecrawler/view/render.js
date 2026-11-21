import {TILE, TINTS, PLAYER, worldOf} from "../sim/data.js";
import {VOID, FLOOR, WALL, CRATE, WATER, CHASM, LAVA} from "../sim/map.js";
import {floorName} from "../sim/loot.js";
import {alpha, mix} from "../../../lib/fx.js";
import {createEffects} from "./effects.js";
import {createFog} from "./fog.js";
import {createActors} from "./actors.js";
import {createHud} from "./hud.js";
import {createTerrain} from "./terrain.js";
import {createLighting, sight} from "./lighting.js";
import {weaponLook} from "./sprites.js";
import {circle, shadow, roundRect, diamond, label, FONT} from "./draw.js";


const VIEW_W = 528;                 // world units across the screen
const SIGHT_LIGHT = 230;            // how far a player's own light reaches
const DARKNESS = 0.62;              // how dark the unlit cave is (0..1)
const MAX_BULLET_LIGHTS = 50;
const LOW_HP = 2;                   // at this much health your light beats with your heart

const LOBBY = {name: "Lobby", floor: "#111111", line: "#151515", wall: "#1c1c1c", top: "#262626"};

const PORTALS = {
    run:  {colour: "#63d69f", label: "Start run"},
    next: {colour: "#61a8ff", label: "Next floor"},
    home: {colour: "#9ca3af", label: "Go home"}
};

const TAU = Math.PI * 2;


// is this world point open ground (not rock)?
function openAt(map, x, y){

    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);

    if(tx < 0 || ty < 0 || tx >= map.w || ty >= map.h)
        return false;

    const t = map.tiles[ty * map.w + tx];

    return t !== WALL && t !== VOID;

}


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

    // (every frame paints the whole canvas, so it needs no see-through:
    // the browser can skip blending it with the page)
    const ctx = canvas.getContext("2d", {alpha: false});
    const effects = createEffects();
    const fx = effects.fx;
    const fog = createFog();
    const light = createLighting({scale: 0.25});
    const shapes = [[], [], [], []];    // what each player's light reaches (sight())
    const drawn = [];                   // the enemies drawn this frame
    const actors = createActors(ctx, effects);
    const hud = createHud(ctx, effects, fog);
    const terrain = createTerrain(ctx, fx);

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

            // the way on opened somewhere off screen: say so
            if(event.type === "unsealed" && event.target === "next"){

                const mine = state.players.find(p => p.id === me);

                if(mine && Math.hypot(mine.x - event.x, mine.y - event.y) > 320)
                    effects.banner("", "the way onward is open", {life: 2, colour: "#93c5fd"});

            }

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
        const world = lobby ? null : worldOf(state.floor);
        const palette = world ?? LOBBY;

        if(fog.map !== state.map){

            fog.reset(state.map);
            terrain.reset(state.map, world);

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

        // on screen and found already
        const visible = (x, y, pad = 40) =>
            onScreen(x, y, pad) && fog.knows(x, y);

        drawMap(state.map, shadesOf(palette), left, top, right, bottom, state.time);

        actors.setLights(state.players, SIGHT_LIGHT, view.me);

        if(!lobby){

            terrain.zones(state.zones ?? [], time, dt, visible);
            terrain.air(dt, left, top, right, bottom, (x, y) => fog.knows(x, y) && openAt(state.map, x, y));

        }

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
        drawn.length = 0;

        for(const e of state.enemies){

            if(onScreen(e.x, e.y, 80) && (fog.sees(e.x, e.y) || (e.boss && !e.asleep))){

                actors.enemy(e, state);

                drawn.push(e);

            }

        }

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

        // a fallen friend close by: hold E to help them up
        if(me && !me.dead){

            const friend = state.players.find(p => p !== me && p.dead && Math.hypot(p.x - me.x, p.y - me.y) < PLAYER.reviveRange);

            if(friend)
                promptAt(me.reviving === friend.id ? `Reviving ${friend.name}…` : `Hold E  Revive ${friend.name}`, friend.x, friend.y + friend.r + 22);

        }

        fx.drawText(ctx);

        if(!lobby){

            drawLight(state, onScreen, visible, world);

            actors.eyesInDark(drawn);

            drawEdges(time);

        }

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
    // Unseen ground right next to ground you have seen: a faint grey haze
    // over the dark, so you can tell where the cave goes on from where it
    // ends in rock.
    const edges = [];

    function drawEdges(time){

        if(!edges.length)
            return;

        const pulse = 0.85 + Math.sin(time * 1.6) * 0.15;

        ctx.fillStyle = `rgba(150, 150, 168, ${0.11 * pulse})`;

        for(let i = 0; i < edges.length; i += 2)
            ctx.fillRect(edges[i] * TILE, edges[i + 1] * TILE, TILE, TILE);

        ctx.fillStyle = `rgba(170, 170, 190, ${0.22 * pulse})`;

        for(let i = 0; i < edges.length; i += 2){

            const x = edges[i] * TILE;
            const y = edges[i + 1] * TILE;

            ctx.fillRect(x + 8, y + 8, 3, 3);
            ctx.fillRect(x + 21, y + 21, 3, 3);

        }

    }


    function drawMap(map, shades, left, top, right, bottom, worldTime){

        const {w, h, tiles} = map;

        edges.length = 0;

        const tx0 = Math.max(0, Math.floor(left / TILE));
        const ty0 = Math.max(0, Math.floor(top / TILE));
        const tx1 = Math.min(w - 1, Math.floor(right / TILE));
        const ty1 = Math.min(h - 1, Math.floor(bottom / TILE));

        // anything but rock
        const open = (x, y) => {

            if(x < 0 || y < 0 || x >= w || y >= h)
                return false;

            const t = tiles[y * w + x];

            return t !== WALL && t !== VOID;

        };

        const kindAt = (x, y) =>
            x < 0 || y < 0 || x >= w || y >= h ? VOID : tiles[y * w + x];

        for(let ty = ty0; ty <= ty1; ty++){

            for(let tx = tx0; tx <= tx1; tx++){

                const i = ty * w + tx;

                if(!fog.seen(i)){

                    // the edge of what you have explored (drawn over the
                    // dark, after the lights)
                    if(fog.frontier(i))
                        edges.push(tx, ty);

                    continue;

                }

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

                    terrain.rock(x, y, (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0, ty, open(tx, ty + 1));

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
                else if(tile === WATER || tile === CHASM || tile === LAVA){

                    terrain.ground(tile, tx, ty, x, y, (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0, time, kindAt, shades);

                    if(tile === WATER && !open(tx, ty - 1)){

                        ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
                        ctx.fillRect(x, y, TILE, 6);

                    }

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
                    else if(map.decor[i])
                        terrain.decor(map.decor[i], x, y, noise, time, worldTime, kindAt, tx, ty);

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

    // The cave is dark. Each player carries a light that rock and crates
    // throw shadows in; everything else that glows lights it too, in its
    // own colour: lava, crystals, candles, shots, blasts, burning ground,
    // and the creatures that glow (embers, shades, a necromancer's staff).
    function drawLight(state, onScreen, visible, world){

        const mood = terrain.mood(time);

        light.begin(canvas.width, canvas.height, Math.max(0, Math.min(0.95, (world?.dark ?? DARKNESS) + mood.dark)), terrain.shade());

        // world point -> a light there (and its colour)
        const lamp = (x, y, r, strength, hue, glow = 0.4) => {

            const sx = screenX(x);
            const sy = screenY(y);

            light.lamp(sx, sy, r * scale, strength);

            if(hue)
                light.colour(sx, sy, r * scale * 0.85, hue, strength * glow);

        };

        const streak = (x1, y1, x2, y2, r, hue, strength) =>
            light.streak(screenX(x1), screenY(y1), screenX(x2), screenY(y2), r * scale, hue, strength);

        // the players' own lights, cut by the rock around them
        state.players.forEach((p, i) => {

            if(!onScreen(p.x, p.y, SIGHT_LIGHT + 80))
                return;

            const sway = 1 + 0.025 * Math.sin(time * 7.3 + i) * Math.sin(time * 3.1 + i * 2);

            let r = (p.dead ? SIGHT_LIGHT * 0.5 : SIGHT_LIGHT) * sway;

            // badly hurt: the light dims and reddens with each heartbeat
            if(!p.dead && p.hp <= LOW_HP){

                const beat = heartbeat(time);

                r *= 1 - 0.1 * beat;

                light.colour(screenX(p.x), screenY(p.y), 140 * scale, "#ff3b5c", 0.28 * beat);

            }

            const shape = sight(state.map, p.x, p.y, r, shapes[i % 4]);

            for(let k = 0; k < shape.length; k += 2){

                shape[k] = screenX(shape[k]);
                shape[k + 1] = screenY(shape[k + 1]);

            }

            light.shadowed(screenX(p.x), screenY(p.y), r * scale, 1, shape);

            // you can always see yourself and what is right beside you
            light.lamp(screenX(p.x), screenY(p.y), 38 * scale, 0.85);

            if(world)
                light.colour(screenX(p.x), screenY(p.y), r * scale * 0.45, world.light, 0.09);

        });

        // candles, glowing mushrooms, crystals, lava, vents, light shafts
        terrain.lights(lamp, streak, visible, time, state.time);

        for(const z of state.zones ?? []){

            if(!visible(z.x, z.y, z.r))
                continue;

            const fade = Math.min(1, (z.life / z.max) * 4);

            if(z.kind === "fire")
                lamp(z.x, z.y, z.r * 1.9, 0.55 * fade * (0.85 + 0.15 * Math.sin(time * 13 + z.x)), "#ff6a1a", 0.3);
            else
                lamp(z.x, z.y, z.r * 1.2, 0.2 * fade, "#e879f9", 0.6);

        }

        // shots light the walls they fly past, in their own colour
        let count = 0;

        for(const b of state.bullets){

            if(count >= MAX_BULLET_LIGHTS)
                break;

            if(onScreen(b.x, b.y)){

                lamp(b.x, b.y, b.r * 5 + 22, 0.55, b.team === "p" ? weaponLook(b.weapon).colour : TINTS[b.tint ?? 0], 0.3);

                count++;

            }

        }

        for(const prop of state.props){

            if(!onScreen(prop.x, prop.y, 120) || !fog.knows(prop.x, prop.y))
                continue;

            if(prop.kind === "portal")
                lamp(prop.x, prop.y, 115, 0.75 + 0.1 * Math.sin(time * 3), PORTALS[prop.target]?.colour, 0.5);
            else
                lamp(prop.x, prop.y, 70, 0.7, prop.source === "boss" ? "#facc15" : "#e5e5e5", 0.3);

        }

        for(const pk of state.pickups)
            if(pk.kind !== "energy" && onScreen(pk.x, pk.y) && fog.sees(pk.x, pk.y))
                lamp(pk.x, pk.y, 26, 0.35, pk.kind === "shard" ? "#c4b5fd" : "#ff5c7a", 0.6);

        for(const l of state.lasers){

            const colour = TINTS[l.tint ?? 2];
            const x2 = l.x + Math.cos(l.angle) * l.length;
            const y2 = l.y + Math.sin(l.angle) * l.length;

            if(l.warn > 0){

                streak(l.x, l.y, x2, y2, 14, colour, 0.06);

                continue;

            }

            for(let d = 0; d < l.length; d += 60)
                lamp(l.x + Math.cos(l.angle) * d, l.y + Math.sin(l.angle) * d, 70, 0.6);

            streak(l.x, l.y, x2, y2, 30, colour, 0.35);

        }

        for(const p of state.players){

            if(!p.beam)
                continue;

            const colour = weaponLook(p.beam.weapon).colour;

            for(let d = 40; d < p.beam.length; d += 60)
                lamp(p.x + Math.cos(p.aim) * d, p.y + Math.sin(p.aim) * d, 60, 0.6);

            streak(p.x, p.y, p.x + Math.cos(p.aim) * p.beam.length, p.y + Math.sin(p.aim) * p.beam.length, 26, colour, 0.3);

        }

        // the creatures that glow (and every boss)
        for(const e of drawn){

            const glow = actors.glowOf(e);

            if(glow)
                lamp(e.x, e.y, glow[0], glow[2], glow[1], 0.35);

        }

        // muzzle flashes, blasts, sparks: each in its colour
        fx.lights((x, y, r, strength, hue) => lamp(x, y, r, strength, hue, 0.35));

        // a world's own mood: the Furnace's heat, the Abyss surging
        if(mood.wash)
            light.colour(canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.8, mood.wash[0], mood.wash[1]);

        light.end(ctx, 0.8);

    }


    // 0..1, twice a beat, like a heart
    function heartbeat(t){

        const phase = (t * 1.25) % 1;

        return Math.max(Math.exp(-((phase - 0.08) ** 2) / 0.003), 0.7 * Math.exp(-((phase - 0.3) ** 2) / 0.003));

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

            // sealed while enemies are close: grey, slow, bound by red chains
            if(prop.locked > 0)
                return drawSealed(prop, look);

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


    function drawSealed(prop, look){

        const pulse = 0.5 + 0.5 * Math.sin(time * 4);

        ctx.fillStyle = "rgba(107, 114, 128, 0.12)";
        ctx.beginPath();
        ctx.ellipse(prop.x, prop.y, 20, 13, 0, 0, TAU);
        ctx.fill();

        for(let i = 0; i < 3; i++){

            const r = 18 - i * 5;
            const a = time * (0.4 + i * 0.2) + i;

            ctx.strokeStyle = alpha(mix(look.colour, "#6b7280", 0.7), 0.6 - i * 0.15);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(prop.x, prop.y, r, r * 0.62, 0, a, a + Math.PI * 1.4);
            ctx.stroke();

        }

        // the seal: crossed chains and a ring of runes
        ctx.strokeStyle = alpha("#ff5c7a", 0.55 + 0.3 * pulse);
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(prop.x - 22, prop.y - 14);
        ctx.lineTo(prop.x + 22, prop.y + 14);
        ctx.moveTo(prop.x + 22, prop.y - 14);
        ctx.lineTo(prop.x - 22, prop.y + 14);
        ctx.stroke();
        ctx.setLineDash([]);

        for(let i = 0; i < 6; i++){

            const a = -time * 0.8 + i * TAU / 6;

            circle(ctx, prop.x + Math.cos(a) * 27, prop.y + Math.sin(a) * 17, 1.8, alpha("#ff5c7a", 0.5 + 0.4 * pulse));

        }

        label(ctx, `Sealed · ${prop.locked} ${prop.locked === 1 ? "enemy" : "enemies"} near`, prop.x, prop.y + 26, {colour: "#ff8fa3", size: 8});

    }


    function drawPrompt(prop){

        const sealed = prop.kind === "portal" && prop.locked > 0;
        const verb = prop.kind === "portal" ? PORTALS[prop.target].label : "Open";
        const y = prop.y - (prop.kind === "portal" ? 30 : 26);
        const text = sealed ? `Kill the ${prop.locked} ${prop.locked === 1 ? "enemy" : "enemies"} nearby first` : `E  ${verb}`;

        promptAt(text, prop.x, y);

    }


    // a little dark tag with a key hint, centred over a point
    function promptAt(text, x, y){

        ctx.font = `bold 8px ${FONT}`;

        const w = ctx.measureText(text).width + 10;

        ctx.fillStyle = "rgba(11, 11, 11, 0.85)";
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 1;

        roundRect(ctx, x - w / 2, y - 7, w, 14, 4);

        ctx.fill();
        ctx.stroke();

        label(ctx, text, x, y, {size: 8, bold: true});

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


    // what each kind of enemy strike looks like while it is coming
    const STRIKE_COLOURS = {fire: "#ff8a3d", meteor: "#ff6a1a", bone: "#e7e5e4", slam: "#ff5c7a"};

    function drawStrike(s){

        // (on a guest's screen a strike can be newer than the moment shown)
        const k = Math.min(1, Math.max(0, 1 - s.delay / s.total));

        if(s.team === "e"){

            const colour = STRIKE_COLOURS[s.look] ?? "#ff5c7a";

            circle(ctx, s.x, s.y, s.r * k, alpha(colour, 0.08 + 0.15 * k));

            ctx.strokeStyle = alpha(colour, 0.6);
            ctx.lineWidth = s.look === "slam" ? 3 : 1.5;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, TAU);
            ctx.stroke();

            // a fireball arcing over from whoever threw it
            if(s.look === "fire" && s.from){

                const fx0 = s.from.x + (s.x - s.from.x) * k;
                const fy0 = s.from.y + (s.y - s.from.y) * k - Math.sin(k * Math.PI) * 70;

                circle(ctx, fx0, fy0 + Math.sin(k * Math.PI) * 70 * 0.4, 5, "rgba(0, 0, 0, 0.25)");
                circle(ctx, fx0, fy0, 6, "#ff8a3d");
                circle(ctx, fx0, fy0, 3, "#fde68a");

                if(Math.random() < 0.5)
                    fx.burst(fx0, fy0, {count: 1, colour: "#ff9a5a", speed: 12, life: 0.35, size: 2.5, glow: true, shape: "dot"});

            }

            // a rock falling out of the dark
            if(s.look === "meteor"){

                const height = (1 - k) * 260;

                ctx.strokeStyle = "rgba(255, 138, 61, 0.45)";
                ctx.lineWidth = 5;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(s.x + height * 0.35 + 18, s.y - height - 36);
                ctx.lineTo(s.x + height * 0.35, s.y - height);
                ctx.stroke();

                circle(ctx, s.x + height * 0.35, s.y - height, 6, "#3b1d0e");
                circle(ctx, s.x + height * 0.35, s.y - height, 3.5, "#ffb347");

            }

            // bone spikes about to break the surface
            if(s.look === "bone" && k > 0.6){

                ctx.fillStyle = alpha("#e7e5e4", (k - 0.6) * 1.5);

                for(let i = 0; i < 3; i++){

                    const a = i * 2.1 + s.x;
                    const bx = s.x + Math.cos(a) * 6;
                    const by = s.y + Math.sin(a) * 4;

                    ctx.beginPath();
                    ctx.moveTo(bx - 2.5, by + 2);
                    ctx.lineTo(bx, by - 6 * (k - 0.5));
                    ctx.lineTo(bx + 2.5, by + 2);
                    ctx.fill();

                }

            }

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

        const colour = TINTS[l.tint ?? 2];
        const width = l.width ?? 7;

        if(l.warn > 0){

            ctx.strokeStyle = alpha(colour, 0.18 + 0.12 * Math.sin(time * 20));
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(l.x, l.y);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.setLineDash([]);

            return;

        }

        ctx.strokeStyle = alpha(colour, 0.25);
        ctx.lineWidth = width * 2.3;
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.strokeStyle = mix(colour, "#ffffff", 0.75);
        ctx.lineWidth = width * 0.6;
        ctx.stroke();

    }


    return {
        resize, toWorld, handle, draw,
        banner: effects.banner,
        speed: () => fx.speed(),
        setShake: k => fx.setShake(k),
        toggleMap: hud.toggleMap,
        closeMap: hud.closeMap,
        mapOpen: hud.mapOpen
    };

}
