import {TILE} from "../sim/data.js";
import {weaponStats, rarityOf, floorName} from "../sim/loot.js";
import {drawWeapon, weaponBounds} from "./sprites.js";
import {label, diamond} from "./draw.js";


// Everything drawn on top of the world, in screen pixels: health bars,
// weapon slots, the map of what you have explored, the boss bar, banners.

const MAP_W = 132;              // minimap size on screen
const MAP_H = 100;
const MAP_ZOOM = 2;             // screen pixels per tile
const BIG_PAD = 6;              // tiles of dark kept round the explored part on the full map
const BIG_ZOOM = 9;             // the full map never zooms in further than this


export function createHud(ctx, effects, fog){

    let mapOpen = false;
    let mapFade = 0;

    function panel(x, y, w, h){

        ctx.fillStyle = "rgba(11, 11, 11, 0.72)";
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x + 0.5, y + 0.5, w, h, 8);
        ctx.fill();
        ctx.stroke();

    }


    // view: {W, H, time, world (the floor's palette), toScreen(x, y)}
    function draw(state, me, view){

        const {W, H} = view;

        if(effects.view.hurt > 0){

            const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);

            g.addColorStop(0, "rgba(255, 92, 122, 0)");
            g.addColorStop(1, `rgba(255, 92, 122, ${0.35 * effects.view.hurt})`);

            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);

        }

        if(!me)
            return;

        if(me.dead){

            ctx.fillStyle = "rgba(11, 11, 11, 0.45)";
            ctx.fillRect(0, 0, W, H);

        }

        vitals(me);
        slots(me, state, view);
        topLabel(state, view);
        bossBar(state, view);
        banner(view);

        if(state.mode === "run"){

            mapFade = Math.max(0, Math.min(1, mapFade + (mapOpen ? 0.2 : -0.25)));

            if(mapFade < 1){

                minimap(state, me, view);
                compass(state, me, view);

            }

            if(mapFade > 0)
                fullMap(state, me, view);

        }
        else{

            mapOpen = false;

            label(ctx, "WASD move · mouse aim · click attack · Space dash · Q swap · E use", 12, H - 14, {colour: "#6b7280", size: 11, align: "left"});

        }

    }


    function vitals(me){

        const rows = [
            ["#ff5c7a", me.hp, me.maxHp],
            ["#9ca3af", me.shield, me.maxShield],
            ["#61a8ff", me.energy, me.maxEnergy]
        ];

        panel(10, 10, 158, 58);

        rows.forEach(([colour, value, max], i) => {

            const y = 19 + i * 15;

            ctx.fillStyle = "#1d1d1d";
            ctx.fillRect(18, y, 104, 9);

            ctx.fillStyle = colour;
            ctx.fillRect(18, y, 104 * Math.max(0, value / max), 9);

            label(ctx, `${Math.floor(value)}/${max}`, 160, y + 5, {colour: "#d4d4d8", size: 10, align: "right"});

        });

    }


    function slots(me, state, view){

        const w = 86;
        const h = 50;
        const y = view.H - h - 12;

        [1, 0].forEach((slot, i) => {

            const x = view.W - 12 - w - i * (w + 6);
            const item = me.weapons[slot];
            const active = slot === me.slot;

            panel(x, y, w, h);

            if(!item){

                label(ctx, "empty", x + w / 2, y + h / 2, {colour: "#555", size: 10});

                return;

            }

            const rarity = rarityOf(item);
            const stats = weaponStats(item, state.mode === "lobby");

            if(active){

                ctx.strokeStyle = rarity.color;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.roundRect(x + 0.5, y + 0.5, w, h, 8);
                ctx.stroke();

            }

            ctx.globalAlpha = active ? 1 : 0.5;

            const box = weaponBounds(item.type);
            const s = Math.min(54 / box.w, 22 / box.h, 1.6);

            ctx.save();
            ctx.translate(x + w / 2 - (box.x + box.w / 2) * s, y + 19 - (box.y + box.h / 2) * s);
            ctx.scale(s, s);

            drawWeapon(ctx, item.type, {time: view.time});

            ctx.restore();

            const cost = stats.energy > 0 ? `${stats.energy}${stats.kind === "beam" ? "/s" : ""}` : "free";

            label(ctx, `Lv ${item.level}`, x + 8, y + h - 10, {colour: rarity.color, size: 10, align: "left"});
            label(ctx, cost, x + w - 8, y + h - 10, {colour: "#61a8ff", size: 10, align: "right"});

            ctx.globalAlpha = 1;

        });

        if(me.weapons.length > 1)
            label(ctx, "Q", view.W - 12 - w - 3, y - 8, {colour: "#6b7280", size: 10});

    }


    function topLabel(state, view){

        const x = view.W / 2;

        if(state.mode === "lobby"){

            label(ctx, "Lobby", x, 22, {colour: "#d4d4d8", size: 13, bold: true});
            label(ctx, "try your weapons on the dummies · walk into the portal to start", x, 39, {colour: "#6b7280", size: 11});

            return;

        }

        label(ctx, `${floorName(state.floor)} · ${view.world.name}`, x, 22, {colour: "#d4d4d8", size: 13, bold: true});

    }


    // The explored part of the floor around you. Chests and the way out
    // show once you have seen where they are.
    function minimap(state, me, view){

        const map = state.map;
        const left = view.W - 12 - MAP_W;
        const top = 10;

        panel(left, top, MAP_W, MAP_H);

        const cols = MAP_W / MAP_ZOOM;
        const rows = MAP_H / MAP_ZOOM;
        const px = me.x / TILE;
        const py = me.y / TILE;
        const sx = px - cols / 2;
        const sy = py - rows / 2;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(left + 1, top + 1, MAP_W - 1, MAP_H - 1, 7);
        ctx.clip();

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(fog.mini, sx, sy, cols, rows, left, top, MAP_W, MAP_H);
        ctx.imageSmoothingEnabled = true;

        const mark = (x, y, colour, size = 4) => {

            ctx.fillStyle = colour;
            ctx.fillRect(left + (x / TILE - sx) * MAP_ZOOM - size / 2, top + (y / TILE - sy) * MAP_ZOOM - size / 2, size, size);

        };

        for(const prop of state.props){

            if(!fog.knows(prop.x, prop.y))
                continue;

            if(prop.kind === "chest" && !prop.opened.includes(me.id))
                mark(prop.x, prop.y, prop.source === "boss" ? "#facc15" : "#e5e5e5");

            if(prop.kind === "portal"){

                if(prop.locked > 0)
                    mark(prop.x, prop.y, "#ff5c7a", 8);

                mark(prop.x, prop.y, prop.target === "home" ? "#9ca3af" : "#61a8ff", 5);

            }

        }

        if(map.arena && fog.knows(map.arena.x, map.arena.y) && state.enemies.some(e => e.boss))
            mark(map.arena.x, map.arena.y, "#ff5c7a", 6);

        for(const p of state.players){

            ctx.fillStyle = p === me ? "#ffffff" : "#63d69f";
            ctx.beginPath();
            ctx.arc(left + (p.x / TILE - sx) * MAP_ZOOM, top + (p.y / TILE - sy) * MAP_ZOOM, p === me ? 2.5 : 2, 0, Math.PI * 2);
            ctx.fill();

        }

        ctx.restore();

    }


    // The whole explored floor (M): the same picture as the minimap, as big
    // as the screen allows, with everything you know of marked and named.
    function fullMap(state, me, view){

        const map = state.map;
        const box = fog.bounds();
        const {W, H} = view;

        ctx.save();
        ctx.globalAlpha = mapFade;

        ctx.fillStyle = "rgba(6, 6, 9, 0.84)";
        ctx.fillRect(0, 0, W, H);

        label(ctx, `${floorName(state.floor)} · ${view.world.name}`, W / 2, 26, {colour: "#e5e5e5", size: 15, bold: true});
        label(ctx, "M or Esc to close", W / 2, 44, {colour: "#6b7280", size: 11});

        if(!box){

            ctx.restore();

            return;

        }

        // what to show, in tiles: the explored part with a margin, kept
        // inside the floor
        const x0 = Math.max(0, box.x0 - BIG_PAD);
        const y0 = Math.max(0, box.y0 - BIG_PAD);
        const x1 = Math.min(map.w, box.x1 + 1 + BIG_PAD);
        const y1 = Math.min(map.h, box.y1 + 1 + BIG_PAD);
        const cols = x1 - x0;
        const rows = y1 - y0;

        const room = {x: 24, y: 60, w: W - 48, h: H - 60 - 64};
        let zoom = Math.min(room.w / cols, room.h / rows, BIG_ZOOM);

        if(zoom >= 2)
            zoom = Math.floor(zoom);

        const mw = cols * zoom;
        const mh = rows * zoom;
        const left = Math.round(room.x + (room.w - mw) / 2);
        const top = Math.round(room.y + (room.h - mh) / 2);

        const sx = x => left + (x / TILE - x0) * zoom;
        const sy = y => top + (y / TILE - y0) * zoom;

        panel(left - 8, top - 8, mw + 16, mh + 16);

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(fog.mini, x0, y0, cols, rows, left, top, mw, mh);
        ctx.imageSmoothingEnabled = true;

        // the unexplored edges get a dot each, so they stand out from rock
        if(zoom >= 3){

            const dot = Math.max(1.5, zoom * 0.34);

            ctx.fillStyle = "rgba(196, 196, 214, 0.55)";

            for(let ty = y0; ty < y1; ty++)
                for(let tx = x0; tx < x1; tx++)
                    if(fog.frontier(ty * map.w + tx))
                        ctx.fillRect(left + (tx - x0 + 0.5) * zoom - dot / 2, top + (ty - y0 + 0.5) * zoom - dot / 2, dot, dot);

        }

        const s = Math.max(3, Math.min(7, zoom * 0.9));       // marker size

        // what is in view right now: enemies you can see
        ctx.fillStyle = "#ff5c7a";

        for(const e of state.enemies){

            if(e.dead || e.dummy || !fog.sees(e.x, e.y))
                continue;

            ctx.beginPath();
            ctx.arc(sx(e.x), sy(e.y), e.boss ? s * 0.9 : s * 0.45, 0, Math.PI * 2);
            ctx.fill();

        }

        for(const prop of state.props){

            if(!fog.knows(prop.x, prop.y))
                continue;

            const x = sx(prop.x);
            const y = sy(prop.y);

            if(prop.kind === "chest" && !prop.opened.includes(me.id)){

                ctx.fillStyle = prop.source === "boss" ? "#facc15" : "#e5e5e5";
                ctx.fillRect(x - s * 0.6, y - s * 0.45, s * 1.2, s * 0.9);

            }

            if(prop.kind === "portal"){

                const home = prop.target === "home";
                const colour = home ? "#9ca3af" : "#61a8ff";

                ctx.strokeStyle = colour;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, s * 1.1, 0, Math.PI * 2);
                ctx.stroke();

                ctx.fillStyle = colour;
                ctx.beginPath();
                ctx.arc(x, y, s * 0.45, 0, Math.PI * 2);
                ctx.fill();

                if(prop.locked > 0){

                    ctx.strokeStyle = "#ff5c7a";
                    ctx.setLineDash([3, 3]);
                    ctx.beginPath();
                    ctx.arc(x, y, s * 1.7, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);

                }

                const text = home ? "way home" : "way on";
                const note = prop.locked > 0 ? ` · sealed (${prop.locked})` : "";

                label(ctx, text + note, x, y - s * 1.7 - 9, {colour: prop.locked > 0 ? "#fda4af" : colour, size: 10, bold: true});

            }

        }

        if(map.arena && fog.knows(map.arena.x, map.arena.y) && state.enemies.some(e => e.boss && !e.dead)){

            const x = sx(map.arena.x);
            const y = sy(map.arena.y);

            ctx.fillStyle = "#ff5c7a";
            diamond(ctx, x, y, s * 1.1, s * 1.1);

            label(ctx, "boss", x, y - s * 1.1 - 9, {colour: "#ff5c7a", size: 10, bold: true});

        }

        for(const p of state.players){

            const x = sx(p.x);
            const y = sy(p.y);
            const colour = p === me ? "#ffffff" : "#63d69f";

            if(p.dead){

                ctx.strokeStyle = "#ff5c7a";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x - s * 0.7, y - s * 0.7);
                ctx.lineTo(x + s * 0.7, y + s * 0.7);
                ctx.moveTo(x + s * 0.7, y - s * 0.7);
                ctx.lineTo(x - s * 0.7, y + s * 0.7);
                ctx.stroke();

            }
            else{

                // which way they face
                const a = p.aim ?? 0;

                ctx.fillStyle = colour;
                ctx.beginPath();
                ctx.moveTo(x + Math.cos(a) * s * 1.4, y + Math.sin(a) * s * 1.4);
                ctx.lineTo(x + Math.cos(a + 2.5) * s * 0.9, y + Math.sin(a + 2.5) * s * 0.9);
                ctx.lineTo(x + Math.cos(a - 2.5) * s * 0.9, y + Math.sin(a - 2.5) * s * 0.9);
                ctx.closePath();
                ctx.fill();

                ctx.strokeStyle = "#0b0b0b";
                ctx.lineWidth = 1;
                ctx.stroke();

            }

            if(state.players.length > 1 || p.dead)
                label(ctx, p === me ? "you" : p.dead ? `${p.name} (down)` : p.name, x, y + s * 1.4 + 9, {colour: p.dead ? "#fda4af" : colour, size: 10, bold: p === me});

        }

        // what the colours mean
        const keys = [
            ["you", "#ffffff", "dot"],
            ...state.players.length > 1 ? [["friend", "#63d69f", "dot"]] : [],
            ["chest", "#e5e5e5", "box"],
            ["way on", "#61a8ff", "ring"],
            ["way home", "#9ca3af", "ring"],
            ["enemy in sight", "#ff5c7a", "dot"],
            ["unexplored edge", "#3a3a48", "edge"]
        ];

        ctx.font = `11px Arial, Helvetica, sans-serif`;

        const widths = keys.map(([text]) => ctx.measureText(text).width + 26);
        const total = widths.reduce((a, b) => a + b, 0);
        let kx = (W - total) / 2;
        const ky = H - 26;

        keys.forEach(([text, colour, shape], i) => {

            ctx.fillStyle = colour;
            ctx.strokeStyle = colour;
            ctx.lineWidth = 2;

            if(shape === "dot"){

                ctx.beginPath();
                ctx.arc(kx + 6, ky, 4, 0, Math.PI * 2);
                ctx.fill();

            }
            else if(shape === "box")
                ctx.fillRect(kx + 1, ky - 4, 10, 8);
            else if(shape === "edge"){

                ctx.fillRect(kx + 1, ky - 4, 10, 8);
                ctx.fillStyle = "rgba(196, 196, 214, 0.75)";
                ctx.fillRect(kx + 5, ky - 1, 2, 2);

            }
            else{

                ctx.beginPath();
                ctx.arc(kx + 6, ky, 4.5, 0, Math.PI * 2);
                ctx.stroke();

            }

            label(ctx, text, kx + 16, ky, {colour: "#9ca3af", size: 11, align: "left"});

            kx += widths[i];

        });

        ctx.restore();

    }


    // an arrow at the edge of the screen towards the way out (or the boss)
    function compass(state, me, view){

        const map = state.map;
        const boss = state.enemies.some(e => e.boss);
        const portal = state.props.find(prop => prop.kind === "portal" && prop.target === "next");
        const goal = boss ? map.arena : portal;

        if(!goal)
            return;

        const [sx, sy] = view.toScreen(goal.x, goal.y);
        const margin = 46;

        // on screen already: no arrow needed
        if(sx > margin && sy > margin && sx < view.W - margin && sy < view.H - margin)
            return;

        const cx = view.W / 2;
        const cy = view.H / 2;
        const angle = Math.atan2(sy - cy, sx - cx);

        // where the line from the centre leaves a box inset from the edges
        const k = Math.min((cx - margin) / Math.abs(Math.cos(angle) || 1e-6), (cy - margin) / Math.abs(Math.sin(angle) || 1e-6));
        const x = cx + Math.cos(angle) * k;
        const y = cy + Math.sin(angle) * k;
        const colour = boss ? "#ff5c7a" : "#61a8ff";
        const pulse = 0.55 + 0.25 * Math.sin(view.time * 3);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.globalAlpha = pulse;

        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(11, 0);
        ctx.lineTo(-6, -7);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-6, 7);
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        const far = Math.round(Math.hypot(goal.x - me.x, goal.y - me.y) / TILE);

        label(ctx, `${boss ? "boss" : "way out"} · ${far}`, x - Math.cos(angle) * 26, y - Math.sin(angle) * 26, {colour, size: 10});

    }


    function bossBar(state, view){

        const boss = state.enemies.find(e => e.boss && !e.dead && !e.asleep);

        if(!boss)
            return;

        const w = Math.min(420, view.W * 0.5);
        const x = (view.W - w) / 2;
        const y = view.H - 30;

        label(ctx, boss.name, view.W / 2, y - 10, {colour: "#e5e5e5", size: 12, bold: true});

        ctx.fillStyle = "#1d1d1d";
        ctx.fillRect(x, y, w, 8);

        ctx.fillStyle = boss.enraged ? "#ff5c7a" : "#e5e5e5";
        ctx.fillRect(x, y, w * Math.max(0, boss.hp / boss.maxHp), 8);

        ctx.strokeStyle = "#555";
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 0.5, y - 0.5, w + 1, 9);

    }


    function banner(view){

        const b = effects.view.banner;

        if(!b)
            return;

        const k = b.life / b.max;

        ctx.globalAlpha = Math.min(1, k * 4, (1 - k) * 8);

        if(b.title)
            label(ctx, b.title, view.W / 2, view.H * 0.3, {colour: b.colour, size: 24, bold: true});

        if(b.sub)
            label(ctx, b.sub, view.W / 2, view.H * 0.3 + 24, {colour: "#9ca3af", size: 12});

        ctx.globalAlpha = 1;

    }


    return {
        draw,
        toggleMap: () => mapOpen = !mapOpen,
        closeMap: () => mapOpen = false,
        mapOpen: () => mapOpen
    };

}
