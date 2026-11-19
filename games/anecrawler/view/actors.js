import {WEAPON, RARITY, TINTS} from "../sim/data.js";
import {alpha, mix, formatNumber} from "../../../lib/fx.js";
import {drawWeapon, accentOf, weaponBounds, weaponLook} from "./sprites.js";
import {circle, shadow, roundRect, eyes, aimLine, label} from "./draw.js";


// Draws everything that moves: enemies, bosses, dummies, players (with the
// weapon in their hands) and bullets. All in world coordinates.

const PLAYER_COLOURS = ["#e5e5e5", "#61a8ff", "#63d69f", "#facc15"];
const TAU = Math.PI * 2;


export function createActors(ctx, effects){

    const fx = effects.fx;

    let time = 0;


    /* ---------------- Enemies ---------------- */

    function enemy(e, state){

        if(e.dummy)
            return dummy(e);

        if(e.spawn > 0)
            return swirl(e);

        const target = e.target ?? nearestTo(state.players, e);
        const look = target && !e.asleep ? Math.atan2(target.y - e.y, target.x - e.x) : e.angle;

        // warnings first, under the body
        if(e.mode === "aim" && target)
            aimLine(ctx, time, e.x, e.y, look, 140, e.color);

        if(e.mode === "wind")
            aimLine(ctx, time, e.x, e.y, e.angle, 240, "#ff5c7a");

        if(e.telegraph)
            aimLine(ctx, time, e.x, e.y, e.telegraph.angle, e.telegraph.length, "#ff5c7a", 3);

        if(e.hidden){

            ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
            ctx.beginPath();
            ctx.ellipse(e.x, e.y + e.r * 0.8, e.r * 0.5, e.r * 0.2, 0, 0, TAU);
            ctx.fill();

            return;

        }

        shadow(ctx, e.x, e.y, e.r);

        let colour = e.color;

        if(e.asleep)
            colour = mix(colour, "#0b0b0b", 0.35);

        if(e.slowT > 0)
            colour = mix(colour, "#7dd3fc", 0.45);

        if(e.mode === "fuse" && Math.floor(time * 14) % 2)
            colour = "#ffffff";

        if(e.flash > 0)
            colour = "#ffffff";

        if(e.burnT > 0 && Math.random() < 0.3)
            fx.burst(e.x, e.y - e.r * 0.4, {count: 1, colour: "#ff9a5a", speed: 20, life: 0.45, size: 2.4, gravity: -60, glow: true, scatter: e.r * 0.6});

        // startled: a little jump
        const jump = e.alert > 0 ? -Math.abs(Math.sin(e.alert * 14)) * 4 : 0;

        ctx.save();
        ctx.translate(e.x, e.y + jump);

        if(e.boss)
            boss(e, colour, look);
        else
            BODIES[e.type](e, colour, look);

        if(e.elite){

            ctx.strokeStyle = "#facc15";
            ctx.lineWidth = e.champion ? 2.5 : 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, e.r + 4, 0, TAU);
            ctx.stroke();

        }

        if(e.champion)
            crown(e.r);

        if(!e.boss)
            eyes(ctx, 0, -e.r * 0.1, look, e.r, e.asleep);

        ctx.restore();

        if(!e.boss && e.hp < e.maxHp){

            const w = e.r * 2 + 6;

            ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
            ctx.fillRect(e.x - w / 2, e.y - e.r - 9, w, 3);

            ctx.fillStyle = e.elite ? "#facc15" : "#ff5c7a";
            ctx.fillRect(e.x - w / 2, e.y - e.r - 9, w * Math.max(0, e.hp / e.maxHp), 3);

        }

    }


    // the warning before a summoned enemy appears
    function swirl(e){

        const k = Math.max(0, 1 - e.spawn / e.spawnTime);

        ctx.strokeStyle = alpha(e.color, 0.3 + 0.5 * k);
        ctx.lineWidth = 1.5;

        for(let i = 0; i < 3; i++){

            const a = time * 5 + i * TAU / 3;

            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r * (1.6 - k * 0.6), a, a + 1.2);
            ctx.stroke();

        }

        circle(ctx, e.x, e.y, e.r * k, alpha(e.color, 0.15 * k));

    }


    function crown(r){

        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, -r - 5);
        ctx.lineTo(-r * 0.5, -r - 12);
        ctx.lineTo(-r * 0.2, -r - 8);
        ctx.lineTo(0, -r - 13);
        ctx.lineTo(r * 0.2, -r - 8);
        ctx.lineTo(r * 0.5, -r - 12);
        ctx.lineTo(r * 0.5, -r - 5);
        ctx.closePath();
        ctx.fill();

    }


    // bodies are drawn around (0, 0)
    const BODIES = {

        slime(e, colour){

            const squash = e.asleep ? 0.12 : Math.sin(time * 6 + e.id) * 0.1;

            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.ellipse(0, e.r * squash * 0.5, e.r * (1 + squash), e.r * (0.9 - squash), 0, 0, TAU);
            ctx.fill();

            circle(ctx, -e.r * 0.35, -e.r * 0.4, e.r * 0.2, "rgba(255, 255, 255, 0.35)");

        },

        bat(e, colour){

            const flap = e.asleep ? -0.6 : Math.sin(time * 18 + e.id) * 0.5;

            ctx.fillStyle = mix(colour, "#000000", 0.25);

            for(const side of [-1, 1]){

                ctx.beginPath();
                ctx.moveTo(side * e.r * 0.5, -2);
                ctx.lineTo(side * e.r * 2, -e.r * (0.9 + flap));
                ctx.lineTo(side * e.r * 1.4, e.r * 0.4);
                ctx.closePath();
                ctx.fill();

            }

            circle(ctx, 0, 0, e.r * 0.85, colour);

        },

        archer(e, colour, look){

            circle(ctx, 0, 0, e.r, colour);

            ctx.strokeStyle = "#d4d4d8";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(Math.cos(look) * e.r * 0.5, Math.sin(look) * e.r * 0.5, e.r * 0.9, look - 1, look + 1);
            ctx.stroke();

        },

        turret(e, colour, look){

            ctx.fillStyle = mix(colour, "#000000", 0.35);
            ctx.fillRect(-e.r, -e.r, e.r * 2, e.r * 2);

            ctx.save();
            ctx.rotate(look);
            ctx.fillStyle = "#4b4b52";
            ctx.fillRect(0, -3, e.r + 6, 6);
            ctx.restore();

            circle(ctx, 0, 0, e.r * 0.7, colour);

        },

        bomber(e, colour){

            circle(ctx, 0, 0, e.r, colour);

            ctx.strokeStyle = "#a3a3a3";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(e.r * 0.3, -e.r * 0.8);
            ctx.quadraticCurveTo(e.r * 0.9, -e.r * 1.4, e.r * 0.5, -e.r * 1.7);
            ctx.stroke();

            if(!e.asleep)
                circle(ctx, e.r * 0.5, -e.r * 1.7, 2 + Math.random() * 1.5, "#ff9a5a");

        },

        brute(e, colour){

            const jitter = e.mode === "wind" ? (Math.random() - 0.5) * 3 : 0;

            ctx.fillStyle = colour;
            roundRect(ctx, -e.r + jitter, -e.r * 0.9, e.r * 2, e.r * 1.8, e.r * 0.45);
            ctx.fill();

            ctx.fillStyle = mix(colour, "#ffffff", 0.4);

            for(const side of [-1, 1]){

                ctx.beginPath();
                ctx.moveTo(side * e.r * 0.55 + jitter, -e.r * 0.8);
                ctx.lineTo(side * e.r * 0.85 + jitter, -e.r * 1.35);
                ctx.lineTo(side * e.r * 0.25 + jitter, -e.r * 0.85);
                ctx.fill();

            }

            if(e.mode === "stun")
                for(let i = 0; i < 3; i++)
                    circle(ctx, Math.cos(time * 6 + i * 2.1) * e.r * 0.7, -e.r * 1.2 + Math.sin(time * 6 + i * 2.1) * 3, 1.8, "#facc15");

        },

        mage(e, colour){

            ctx.globalAlpha = e.mode === "blink" ? 0.3 + 0.3 * Math.sin(time * 30) : 1;

            circle(ctx, 0, 0, e.r, colour);

            ctx.fillStyle = mix(colour, "#000000", 0.4);
            ctx.beginPath();
            ctx.moveTo(-e.r * 1.05, -e.r * 0.45);
            ctx.lineTo(e.r * 0.2, -e.r * 2);
            ctx.lineTo(e.r * 1.05, -e.r * 0.45);
            ctx.closePath();
            ctx.fill();

            circle(ctx, e.r * 0.2, -e.r * 2, 2, "#facc15");

            ctx.globalAlpha = 1;

        }

    };


    function boss(e, colour, look){

        const r = e.r;

        if(e.enraged)
            circle(ctx, 0, 0, r * 1.5, alpha("#ff5c7a", 0.12 + 0.08 * Math.sin(time * 8)));

        if(e.shape === "square"){

            ctx.save();
            ctx.rotate(e.asleep ? 0 : Math.sin(time * 0.8) * 0.15);

            ctx.fillStyle = mix(colour, "#000000", 0.55);
            roundRect(ctx, -r, -r, r * 2, r * 2, 8);
            ctx.fill();

            ctx.fillStyle = colour;
            roundRect(ctx, -r * 0.75, -r * 0.75, r * 1.5, r * 1.5, 6);
            ctx.fill();

            ctx.fillStyle = mix(colour, "#000000", 0.65);
            ctx.fillRect(-r * 0.55, -r * 0.18, r * 1.1, r * 0.36);

            if(!e.asleep){

                ctx.fillStyle = e.enraged ? "#ff5c7a" : "#61a8ff";
                ctx.fillRect(-r * 0.4 + Math.cos(look) * r * 0.12, -r * 0.08, r * 0.8, r * 0.16);

            }

            ctx.restore();

        }
        else if(e.shape === "diamond"){

            const flap = e.asleep ? 0 : Math.sin(time * 16) * 0.25;

            ctx.fillStyle = alpha(mix(colour, "#ffffff", 0.3), 0.5);

            for(const side of [-1, 1]){

                ctx.beginPath();
                ctx.ellipse(side * r * 0.9, -r * 0.5, r * 0.9, r * (0.35 + flap * 0.2), side * (0.5 + flap), 0, TAU);
                ctx.fill();

            }

            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.moveTo(0, -r * 1.15);
            ctx.lineTo(r * 0.85, 0);
            ctx.lineTo(0, r * 1.15);
            ctx.lineTo(-r * 0.85, 0);
            ctx.closePath();
            ctx.fill();

            eyes(ctx, 0, -r * 0.1, look, r * 0.8, e.asleep);

        }
        else{

            circle(ctx, 0, 0, r * 1.25, alpha(colour, 0.2));

            for(let i = 0; i < 10; i++){

                const a = (e.asleep ? 0 : time * 0.9) + i * Math.PI / 5;

                circle(ctx, Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15, 2.5, colour);

            }

            circle(ctx, 0, 0, r, colour);
            circle(ctx, Math.cos(look) * r * 0.25, Math.sin(look) * r * 0.25, r * 0.72, "#0b0b0b");

            if(!e.asleep)
                circle(ctx, Math.cos(look) * r * 0.35, Math.sin(look) * r * 0.35, r * 0.16, e.enraged ? "#ff5c7a" : "#fff7cc");

        }

        if(e.flash > 0){

            ctx.globalCompositeOperation = "lighter";

            circle(ctx, 0, 0, r, "rgba(255, 255, 255, 0.35)");

            ctx.globalCompositeOperation = "source-over";

        }

    }


    function dummy(e){

        const tilt = e.flash > 0 ? Math.sin(time * 60) * 0.12 : 0;

        shadow(ctx, e.x, e.y + e.r * 0.3, e.r);

        ctx.save();
        ctx.translate(e.x, e.y + e.r);
        ctx.rotate(tilt);

        ctx.fillStyle = "#3a3a40";
        ctx.fillRect(-2, -e.r, 4, e.r);
        ctx.fillRect(-e.r * 0.9, -e.r * 1.15, e.r * 1.8, 3);

        circle(ctx, 0, -e.r * 1.2, e.r * 0.8, e.flash > 0 ? "#ffffff" : "#9ca3af");

        ctx.strokeStyle = e.shoots ? "#61a8ff" : "#ff5c7a";
        ctx.lineWidth = Math.max(1, e.r * 0.1);
        ctx.beginPath();
        ctx.arc(0, -e.r * 1.2, e.r * 0.42, 0, TAU);
        ctx.stroke();

        ctx.restore();

        if(e.shoots)
            label(ctx, "sparring", e.x, e.y + e.r * 1.6, {colour: "#6b7280", size: 7});

    }


    // damage per second over a dummy (the pack of small ones shares one)
    function dummyLabel(e, state){

        if(e.name === "Pack"){

            const pack = state.enemies.filter(other => other.name === "Pack");

            if(pack[0] !== e)
                return;

            const dps = pack.reduce((sum, other) => sum + other.dps, 0);

            if(dps > 0)
                label(ctx, `${formatNumber(dps)} dps`, e.x + 8, e.y - 34, {colour: "#facc15", size: 9, bold: true});

            return;

        }

        if(e.dps > 0)
            label(ctx, `${formatNumber(e.dps)} dps`, e.x, e.y - e.r * 2.2 - 8, {colour: "#facc15", size: 9, bold: true});

    }


    /* ---------------- Players ---------------- */

    function player(p, index, state){

        const colour = PLAYER_COLOURS[index % PLAYER_COLOURS.length];
        const item = p.weapons[p.slot];

        if(p.dead)
            return fallen(p, state);

        const blink = p.hurt > 0 && Math.floor(time * 20) % 2;

        ctx.globalAlpha = blink ? 0.35 : 1;

        if(p.dashT > 0)
            fx.ghost(p.x, p.y, p.r, {colour, life: 0.22});

        shadow(ctx, p.x, p.y, p.r);

        const behind = Math.sin(p.aim) < -0.2;

        if(behind && item)
            held(p, item);

        const bob = p.moving ? Math.abs(Math.sin(time * 12)) * 1.5 : 0;

        circle(ctx, p.x, p.y - bob, p.r, colour);
        circle(ctx, p.x - p.r * 0.35, p.y - bob - p.r * 0.4, p.r * 0.2, "rgba(255, 255, 255, 0.4)");

        eyes(ctx, p.x, p.y - bob - 1, p.aim, p.r);

        if(!behind && item)
            held(p, item);

        if(p.swing)
            swing(p);

        if(p.charge >= 0 && item)
            charge(p, item);

        if(p.beam)
            beam(p, state);

        ctx.globalAlpha = 1;

        if(state.players.length > 1)
            label(ctx, p.name, p.x, p.y - p.r - 10, {colour: "#9ca3af", size: 7});

    }


    function fallen(p, state){

        ctx.globalAlpha = 0.5;

        shadow(ctx, p.x, p.y, p.r);
        circle(ctx, p.x, p.y, p.r, "#4b4b52");

        ctx.strokeStyle = "#0b0b0b";
        ctx.lineWidth = 1.5;

        for(const side of [-1, 1]){

            ctx.beginPath();
            ctx.moveTo(p.x + side * 4 - 2, p.y - 4);
            ctx.lineTo(p.x + side * 4 + 2, p.y);
            ctx.moveTo(p.x + side * 4 + 2, p.y - 4);
            ctx.lineTo(p.x + side * 4 - 2, p.y);
            ctx.stroke();

        }

        ctx.globalAlpha = 1;

        // being helped up: a ring that fills
        if(p.revive > 0){

            ctx.strokeStyle = "#63d69f";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r + 7, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p.revive / 2.5));
            ctx.stroke();

        }

        if(state.players.length > 1)
            label(ctx, `${p.name} · stand here to revive`, p.x, p.y - p.r - 12, {colour: "#63d69f", size: 7});

    }


    function held(p, item){

        const def = WEAPON[item.type];
        const tier = RARITY[def.rarity].tier;
        const facing = Math.cos(p.aim) >= 0 ? 1 : -1;
        const recoil = effects.view.recoil.get(p.id) ?? 0;

        let angle = p.aim;

        if(def.kind === "melee"){

            // raised at rest, sweeping through the arc while swinging
            if(p.swing){

                const k = 1 - p.swing.t / p.swing.dur;

                angle = p.aim + facing * (-p.swing.arc / 2 + p.swing.arc * (1 - (1 - k) ** 3));

            }
            else{

                angle = p.aim - facing * 0.9;

            }

        }

        const hand = p.r * 0.55 - (def.kind === "melee" ? 0 : recoil * 3);
        const hx = p.x + Math.cos(p.aim) * hand;
        const hy = p.y + Math.sin(p.aim) * hand + 2;

        ctx.save();
        ctx.translate(hx, hy);
        ctx.rotate(angle);

        if(facing < 0)
            ctx.scale(1, -1);

        drawWeapon(ctx, item.type, {time});

        ctx.restore();

        // legendary and mythic weapons throw off sparkles
        if(tier >= 4 && Math.random() < (tier === 5 ? 0.5 : 0.25)){

            const box = weaponBounds(item.type);
            const along = box.x + Math.random() * box.w;

            fx.sparkle(hx + Math.cos(angle) * along, hy + Math.sin(angle) * along, accentOf(item.type, time));

        }

    }


    function swing(p){

        const {angle, arc, range, t, dur} = p.swing;
        const look = weaponLook(p.swing.weapon);
        const k = 1 - t / dur;
        const facing = Math.cos(p.aim) >= 0 ? 1 : -1;
        const start = angle - facing * arc / 2;
        const end = start + facing * arc * (1 - (1 - k) ** 3);

        ctx.lineCap = "round";

        // rarer blades leave a wider, brighter trail
        ctx.strokeStyle = alpha(look.colour, 0.55 * (1 - k * 0.6));
        ctx.lineWidth = 7 + look.tier;
        ctx.beginPath();
        ctx.arc(p.x, p.y, range * 0.82, Math.min(start, end), Math.max(start, end));
        ctx.stroke();

        ctx.strokeStyle = alpha("#ffffff", 0.5 * (1 - k));
        ctx.lineWidth = 2;
        ctx.stroke();

    }


    function charge(p, item){

        const def = WEAPON[item.type];
        const k = Math.min(1, p.charge / def.charge);
        const ready = p.charge >= def.minCharge;
        const colour = weaponLook(item.type).colour;

        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 6, 0, TAU);
        ctx.stroke();

        ctx.strokeStyle = k >= 1 ? (Math.floor(time * 12) % 2 ? "#ffffff" : colour) : alpha(colour, ready ? 1 : 0.5);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 6, -Math.PI / 2, -Math.PI / 2 + k * TAU);
        ctx.stroke();

        if(k >= 1 && Math.random() < 0.4)
            fx.sparkle(p.x, p.y, colour, {spread: p.r + 6});

        if(def.rail)
            aimLine(ctx, time, p.x, p.y, p.aim, 120 + k * 200, colour, 1);

    }


    function beam(p, state){

        const {length, chain, weapon} = p.beam;
        const colour = weaponLook(weapon).colour;
        const width = WEAPON[weapon].chain ? 5 : 4;
        const muzzle = p.r + 14;
        const x1 = p.x + Math.cos(p.aim) * muzzle;
        const y1 = p.y + Math.sin(p.aim) * muzzle;
        const x2 = p.x + Math.cos(p.aim) * length;
        const y2 = p.y + Math.sin(p.aim) * length;
        const wobble = 1 + Math.sin(time * 40) * 0.15;

        ctx.save();
        ctx.lineCap = "round";
        ctx.globalCompositeOperation = "lighter";

        ctx.strokeStyle = alpha(colour, 0.35);
        ctx.lineWidth = width * 3 * wobble;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.strokeStyle = mix(colour, "#ffffff", 0.6);
        ctx.lineWidth = width * 0.8;
        ctx.stroke();

        let from = {x: x2, y: y2};

        for(const id of chain){

            const e = state.enemies.find(other => other.id === id);

            if(!e)
                continue;

            ctx.strokeStyle = alpha(colour, 0.9);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);

            // a jagged little lightning line
            for(let i = 1; i < 5; i++){

                const t = i / 5;

                ctx.lineTo(from.x + (e.x - from.x) * t + (Math.random() - 0.5) * 10, from.y + (e.y - from.y) * t + (Math.random() - 0.5) * 10);

            }

            ctx.lineTo(e.x, e.y);
            ctx.stroke();

            from = e;

        }

        ctx.restore();

        if(Math.random() < 0.6)
            fx.burst(x2, y2, {count: 1, colour, speed: 90, life: 0.2, size: 2, shape: "spark", glow: true});

    }


    /* ---------------- Bullets ---------------- */

    function bullet(b){

        if(b.team === "e"){

            const colour = TINTS[b.tint] ?? TINTS[0];

            circle(ctx, b.x, b.y, b.r + 2, alpha(colour, 0.3));
            circle(ctx, b.x, b.y, b.r, colour);
            circle(ctx, b.x, b.y, b.r * 0.5, "#ffe4e6");

            return;

        }

        const {colour, tier} = weaponLook(b.weapon);
        const heading = Math.atan2(b.vy, b.vx);

        if(b.kind === "slash"){

            const fade = Math.min(1, b.life * 3);

            ctx.lineCap = "round";
            ctx.strokeStyle = alpha(colour, fade);
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(b.x - Math.cos(heading) * b.r, b.y - Math.sin(heading) * b.r, b.r * 1.2, heading - 1.1, heading + 1.1);
            ctx.stroke();

            ctx.strokeStyle = alpha("#ffffff", fade);
            ctx.lineWidth = 1.5;
            ctx.stroke();

            return;

        }

        if(b.kind === "arrow"){

            ctx.strokeStyle = "#d4d4d8";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(b.x - Math.cos(heading) * 14, b.y - Math.sin(heading) * 14);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();

            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.moveTo(b.x + Math.cos(heading) * 4, b.y + Math.sin(heading) * 4);
            ctx.lineTo(b.x + Math.cos(heading + 2.5) * 4, b.y + Math.sin(heading + 2.5) * 4);
            ctx.lineTo(b.x + Math.cos(heading - 2.5) * 4, b.y + Math.sin(heading - 2.5) * 4);
            ctx.fill();

            return;

        }

        if(b.pull){

            circle(ctx, b.x, b.y, b.pull, alpha(colour, 0.035));

            ctx.strokeStyle = alpha(colour, 0.12);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.pull, 0, TAU);
            ctx.stroke();

            circle(ctx, b.x, b.y, b.r + 3, alpha(colour, 0.4));
            circle(ctx, b.x, b.y, b.r, "#0b0b0b");

            ctx.strokeStyle = colour;
            ctx.lineWidth = 2;

            for(let i = 0; i < 3; i++){

                const a = time * 6 + i * TAU / 3;

                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r * 0.75, a, a + 1.3);
                ctx.stroke();

            }

            return;

        }

        // every shot leaves a short streak; rarer ones a longer, glowing one
        const tail = 0.018 + tier * 0.006;

        ctx.lineCap = "round";
        ctx.strokeStyle = alpha(colour, 0.22 + tier * 0.04);
        ctx.lineWidth = b.r * (1.1 + tier * 0.1);
        ctx.beginPath();
        ctx.moveTo(b.x - b.vx * tail, b.y - b.vy * tail);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        if(tier >= 2)
            circle(ctx, b.x, b.y, b.r * 2.1, alpha(colour, 0.18));

        circle(ctx, b.x, b.y, b.r, colour);

        if(tier >= 1)
            circle(ctx, b.x, b.y, b.r * 0.45, "#ffffff");

        // burning shots shed embers
        if(b.burn && Math.random() < 0.25)
            fx.burst(b.x, b.y, {count: 1, colour: "#ffd27a", speed: 30, life: 0.3, size: 2, gravity: -50, glow: true});

    }


    return {
        enemy, dummyLabel, player, bullet,
        tick: now => time = now
    };

}


function nearestTo(players, from){

    let best = null;
    let bestD = Infinity;

    for(const p of players){

        if(p.dead)
            continue;

        const d = (p.x - from.x) ** 2 + (p.y - from.y) ** 2;

        if(d < bestD){

            best = p;
            bestD = d;

        }

    }

    return best;

}
