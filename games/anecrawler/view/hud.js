import {TILE} from "../sim/data.js";
import {weaponStats, rarityOf, floorName} from "../sim/loot.js";
import {drawWeapon, weaponBounds} from "./sprites.js";
import {label} from "./draw.js";


// Everything drawn on top of the world, in screen pixels: health bars,
// weapon slots, the map of what you have explored, the boss bar, banners.

const MAP_W = 132;              // minimap size on screen
const MAP_H = 100;
const MAP_ZOOM = 2;             // screen pixels per tile


export function createHud(ctx, effects, fog){

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

            minimap(state, me, view);
            compass(state, me, view);

        }
        else{

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

            if(prop.kind === "portal")
                mark(prop.x, prop.y, prop.target === "home" ? "#9ca3af" : "#61a8ff", 5);

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


    return {draw};

}
