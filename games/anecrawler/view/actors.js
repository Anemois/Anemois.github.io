import {WEAPON, RARITY, TINTS} from "../sim/data.js";
import {lobHeight} from "../sim/flight.js";
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
            aimLine(ctx, time, e.x, e.y, e.telegraph.angle, e.telegraph.length, e.type === "watcher" ? "#c4b5fd" : "#ff5c7a", 3);

        // a grasp about to whip: the arc it will sweep
        if(e.mode === "whip"){

            ctx.fillStyle = alpha("#ff5c7a", 0.12 + 0.08 * Math.sin(time * 30));
            ctx.beginPath();
            ctx.moveTo(e.x, e.y);
            ctx.arc(e.x, e.y, 110, e.angle - 65 * Math.PI / 180, e.angle + 65 * Math.PI / 180);
            ctx.closePath();
            ctx.fill();

        }

        // out of reach: underground, faded out, lying in pieces, mid-blink
        if(e.hidden){

            ctx.save();
            ctx.translate(e.x, e.y);

            if(HIDDEN[e.type])
                HIDDEN[e.type](e);
            else{

                ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
                ctx.beginPath();
                ctx.ellipse(0, e.r * 0.8, e.r * 0.5, e.r * 0.2, 0, 0, TAU);
                ctx.fill();

            }

            ctx.restore();

            return;

        }

        castShadow(e.x, e.y, e.r);

        let colour = e.color;

        if(e.asleep)
            colour = mix(colour, "#0b0b0b", 0.35);

        if(e.slowT > 0)
            colour = mix(colour, "#7dd3fc", 0.45);

        if(e.poisonT > 0)
            colour = mix(colour, "#84cc16", 0.35);

        if(e.frozenT > 0)
            colour = mix(colour, "#e0f2fe", 0.6);

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

        let ownEyes = false;

        if(e.boss)
            boss(e, colour, look);
        else
            ownEyes = (BODIES[e.type] ?? BODIES.slime)(e, colour, look) === OWN_EYES;

        if(e.elite){

            ctx.strokeStyle = "#facc15";
            ctx.lineWidth = e.champion ? 2.5 : 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, e.r + 4, 0, TAU);
            ctx.stroke();

        }

        if(e.champion)
            crown(e.r);

        if(!e.boss && !ownEyes)
            eyes(ctx, 0, -e.r * 0.1, look, e.r, e.asleep);

        statusMarks(e);

        ctx.restore();

        if(!e.boss && e.hp < e.maxHp){

            const w = e.r * 2 + 6;

            ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
            ctx.fillRect(e.x - w / 2, e.y - e.r - 9, w, 3);

            ctx.fillStyle = e.elite ? "#facc15" : "#ff5c7a";
            ctx.fillRect(e.x - w / 2, e.y - e.r - 9, w * Math.max(0, e.hp / e.maxHp), 3);

        }

    }


    // Frozen: a block of ice round it. Poisoned: green bubbles rising.
    // Reeling: stars circling its head. (drawn centred on the enemy)
    function statusMarks(e){

        if(e.frozenT > 0){

            const r = e.r + 4;

            ctx.fillStyle = "rgba(186, 230, 253, 0.28)";
            ctx.strokeStyle = "rgba(224, 242, 254, 0.85)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-r, -r * 0.4);
            ctx.lineTo(-r * 0.5, -r);
            ctx.lineTo(r * 0.6, -r * 0.9);
            ctx.lineTo(r, -r * 0.2);
            ctx.lineTo(r * 0.8, r * 0.8);
            ctx.lineTo(-r * 0.3, r);
            ctx.lineTo(-r * 0.95, r * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
            ctx.beginPath();
            ctx.moveTo(-r * 0.55, -r * 0.6);
            ctx.lineTo(-r * 0.15, -r * 0.75);
            ctx.stroke();

        }

        if(e.poisonT > 0 && Math.random() < 0.18)
            fx.burst(e.x + (Math.random() - 0.5) * e.r, e.y - e.r * 0.3, {count: 1, colour: Math.random() < 0.5 ? "#a3e635" : "#4d7c0f", speed: 12, life: 0.7, size: 2.4, gravity: -40, shape: "dot"});

        if(e.staggerT > 0){

            ctx.fillStyle = "#fde68a";

            for(let i = 0; i < 3; i++){

                const a = time * 7 + i * TAU / 3;
                const x = Math.cos(a) * (e.r * 0.8);
                const y = -e.r - 6 + Math.sin(a) * 3;

                star(x, y, 2.6);

            }

        }

    }


    function star(x, y, r){

        ctx.beginPath();

        for(let i = 0; i < 10; i++){

            const a = i * Math.PI / 5 - Math.PI / 2;
            const k = i % 2 ? r * 0.45 : r;

            i ? ctx.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k) : ctx.moveTo(x + Math.cos(a) * k, y + Math.sin(a) * k);

        }

        ctx.closePath();
        ctx.fill();

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

        },


        /* ---- Crypt ---- */

        skeleton(e, colour){

            const step = e.asleep ? 0 : Math.sin(time * 9 + e.id) * 2;

            // legs and arms: bones
            ctx.strokeStyle = mix(colour, "#000000", 0.25);
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(-3, e.r * 0.4);
            ctx.lineTo(-4 + step, e.r * 1.05);
            ctx.moveTo(3, e.r * 0.4);
            ctx.lineTo(4 - step, e.r * 1.05);
            ctx.moveTo(-e.r * 0.55, -e.r * 0.05);
            ctx.lineTo(-e.r * 0.95, e.r * 0.45 - step);
            ctx.moveTo(e.r * 0.55, -e.r * 0.05);
            ctx.lineTo(e.r * 0.95, e.r * 0.45 + step);
            ctx.stroke();

            // ribs
            ctx.fillStyle = colour;
            roundRect(ctx, -e.r * 0.55, -e.r * 0.15, e.r * 1.1, e.r * 0.65, 3);
            ctx.fill();

            ctx.fillStyle = "rgba(0, 0, 0, 0.45)";

            for(let k = 0; k < 3; k++)
                ctx.fillRect(-e.r * 0.4, -e.r * 0.02 + k * e.r * 0.17, e.r * 0.8, 1.2);

            // the skull, with a jaw that chatters
            circle(ctx, 0, -e.r * 0.45, e.r * 0.62, colour);

            ctx.fillStyle = mix(colour, "#000000", 0.2);
            ctx.fillRect(-e.r * 0.3, -e.r * 0.12 + (e.asleep ? 0 : Math.abs(Math.sin(time * 12 + e.id)) * 1.5), e.r * 0.6, e.r * 0.2);

            // hollow eyes with a glint
            for(const side of [-1, 1])
                circle(ctx, side * e.r * 0.24, -e.r * 0.5, e.r * 0.17, "#0b0b0b");

            if(!e.asleep)
                for(const side of [-1, 1])
                    circle(ctx, side * e.r * 0.24, -e.r * 0.5, e.r * 0.06, "#ff7185");

            return OWN_EYES;

        },


        shade(e, colour, look, fade = 1){

            const k = (0.65 + 0.15 * Math.sin(time * 4 + e.id)) * fade;

            ctx.globalAlpha = k;

            circle(ctx, 0, 0, e.r * 1.6, alpha(colour, 0.12));

            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.arc(0, -e.r * 0.2, e.r * 0.85, Math.PI, 0);

            // a ragged tail that ripples
            for(let i = 0; i <= 6; i++){

                const x = e.r * 0.85 - i * e.r * 0.283;
                const y = e.r * 0.75 + Math.sin(time * 8 + i * 1.7 + e.id) * 2.5 + (i % 2 ? -3 : 0);

                ctx.lineTo(x, y);

            }

            ctx.closePath();
            ctx.fill();

            ctx.globalAlpha = fade;

            // two cold points of light
            for(const side of [-1, 1])
                circle(ctx, side * e.r * 0.3, -e.r * 0.25, e.r * 0.14, e.asleep ? "#1e293b" : "#e0f2fe");

            ctx.globalAlpha = 1;

            return OWN_EYES;

        },


        necro(e, colour, look){

            // raising the dead: a ring of green runes underfoot
            if(e.mode === "raise"){

                ctx.strokeStyle = alpha(colour, 0.5 + 0.3 * Math.sin(time * 20));
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(0, e.r * 0.6, e.r * 2.2, 0, TAU);
                ctx.stroke();

                circle(ctx, 0, 0, e.r * 2, alpha(colour, 0.12));

            }

            // the staff
            const sx = Math.cos(look) > 0 ? e.r * 0.95 : -e.r * 0.95;

            ctx.strokeStyle = "#4b3a2a";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(sx, e.r * 0.9);
            ctx.lineTo(sx, -e.r * 1.5);
            ctx.stroke();

            circle(ctx, sx, -e.r * 1.6, 4.5, alpha(colour, 0.35));
            circle(ctx, sx, -e.r * 1.6, 2.6, "#d6d3c4");

            // a hooded robe
            ctx.fillStyle = mix(colour, "#000000", 0.6);
            ctx.beginPath();
            ctx.moveTo(0, -e.r * 1.25);
            ctx.lineTo(e.r * 0.95, e.r * 0.95);
            ctx.lineTo(-e.r * 0.95, e.r * 0.95);
            ctx.closePath();
            ctx.fill();

            circle(ctx, 0, -e.r * 0.35, e.r * 0.5, "#0b0b0b");

            if(!e.asleep)
                for(const side of [-1, 1])
                    circle(ctx, side * e.r * 0.18 + Math.cos(look) * 2, -e.r * 0.38, 1.6, colour);

            return OWN_EYES;

        },


        /* ---- Grove ---- */

        slimelet(e, colour){

            BODIES.slime(e, colour);

        },


        wasp(e, colour){

            const flap = Math.sin(time * 40 + e.id);

            ctx.fillStyle = "rgba(220, 240, 255, 0.45)";

            for(const side of [-1, 1]){

                ctx.beginPath();
                ctx.ellipse(side * e.r * 0.7, -e.r * 0.7, e.r * 0.8, e.r * (0.35 + 0.15 * flap), side * 0.6, 0, TAU);
                ctx.fill();

            }

            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.ellipse(0, 0, e.r * 0.8, e.r, 0, 0, TAU);
            ctx.fill();

            ctx.fillStyle = "#1c1917";
            ctx.fillRect(-e.r * 0.75, -e.r * 0.15, e.r * 1.5, e.r * 0.25);
            ctx.fillRect(-e.r * 0.65, e.r * 0.35, e.r * 1.3, e.r * 0.22);

            ctx.beginPath();
            ctx.moveTo(-2, e.r * 0.9);
            ctx.lineTo(0, e.r * 1.5);
            ctx.lineTo(2, e.r * 0.9);
            ctx.fill();

        },


        wolf(e, colour, look){

            const facing = e.mode === "move" ? e.angle : look;
            const run = e.asleep ? 0 : Math.sin(time * (e.mode === "lunge" ? 30 : 14) + e.id);

            ctx.save();
            ctx.rotate(facing);

            // tail, body, head, ears
            ctx.strokeStyle = mix(colour, "#000000", 0.2);
            ctx.lineWidth = 3;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(-e.r * 0.9, 0);
            ctx.quadraticCurveTo(-e.r * 1.4, run * 3, -e.r * 1.7, run * 5);
            ctx.stroke();

            // legs
            ctx.strokeStyle = mix(colour, "#000000", 0.35);
            ctx.lineWidth = 2;
            ctx.beginPath();

            for(const [lx, side] of [[e.r * 0.5, 1], [e.r * 0.5, -1], [-e.r * 0.5, 1], [-e.r * 0.5, -1]]){

                ctx.moveTo(lx, side * e.r * 0.4);
                ctx.lineTo(lx + run * side * 3, side * e.r * 0.85);

            }

            ctx.stroke();

            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.ellipse(0, 0, e.r * 1.05, e.r * 0.6, 0, 0, TAU);
            ctx.fill();

            // thorny back
            ctx.fillStyle = "#65a30d";

            for(let k = -2; k <= 1; k++){

                ctx.beginPath();
                ctx.moveTo(k * e.r * 0.35, -e.r * 0.2);
                ctx.lineTo(k * e.r * 0.35 + e.r * 0.12, -e.r * 0.62);
                ctx.lineTo(k * e.r * 0.35 + e.r * 0.25, -e.r * 0.2);
                ctx.fill();

            }

            circle(ctx, e.r * 0.95, 0, e.r * 0.5, colour);

            ctx.fillStyle = mix(colour, "#000000", 0.3);

            for(const side of [-1, 1]){

                ctx.beginPath();
                ctx.moveTo(e.r * 0.8, side * e.r * 0.25);
                ctx.lineTo(e.r * 0.85, side * e.r * 0.7);
                ctx.lineTo(e.r * 1.05, side * e.r * 0.3);
                ctx.fill();

            }

            // snout and eyes
            circle(ctx, e.r * 1.4, 0, e.r * 0.22, "#2b2b2b");

            for(const side of [-1, 1])
                circle(ctx, e.r * 1.08, side * e.r * 0.2, 1.6, e.asleep ? "#2b2b2b" : "#facc15");

            ctx.restore();

            return OWN_EYES;

        },


        sporecap(e, colour){

            const swell = e.mode === "puff" ? 1 + 0.25 * Math.abs(Math.sin(time * 18)) : 1;

            ctx.fillStyle = "#e7e2d4";
            roundRect(ctx, -e.r * 0.35, -e.r * 0.1, e.r * 0.7, e.r * 1.05, 3);
            ctx.fill();

            ctx.save();
            ctx.scale(swell, swell);

            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.ellipse(0, -e.r * 0.15, e.r * 1.15, e.r * 0.85, 0, Math.PI, 0);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = "rgba(255, 255, 255, 0.75)";

            for(const [dx, dy, r] of [[-0.55, -0.5, 0.16], [0.1, -0.75, 0.13], [0.6, -0.42, 0.15]]){

                ctx.beginPath();
                ctx.arc(dx * e.r, dy * e.r, r * e.r, 0, TAU);
                ctx.fill();

            }

            ctx.restore();

            if(e.mode === "puff" && Math.random() < 0.5)
                fx.burst(e.x, e.y - e.r * 0.5, {count: 1, colour: "#f0abfc", speed: 30, life: 0.5, size: 2, shape: "dot"});

        },


        boomshroom(e, colour){

            ctx.fillStyle = "#e7e2d4";
            ctx.fillRect(-e.r * 0.3, -e.r * 0.1, e.r * 0.6, e.r * 0.9);

            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.ellipse(0, -e.r * 0.1, e.r, e.r * 0.8, 0, Math.PI, 0);
            ctx.closePath();
            ctx.fill();

            // it glows hotter as it gets close
            ctx.strokeStyle = alpha("#fde68a", e.mode === "fuse" ? 0.9 : 0.35 + 0.2 * Math.sin(time * 6 + e.id));
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(-e.r * 0.6, -e.r * 0.3);
            ctx.lineTo(-e.r * 0.2, -e.r * 0.55);
            ctx.lineTo(e.r * 0.15, -e.r * 0.3);
            ctx.lineTo(e.r * 0.55, -e.r * 0.6);
            ctx.stroke();

        },


        beetle(e, colour, look){

            const facing = e.angle;
            const jitter = e.mode === "wind" ? (Math.random() - 0.5) * 3 : 0;

            ctx.save();
            ctx.rotate(facing);
            ctx.translate(jitter, 0);

            ctx.strokeStyle = "#134e4a";
            ctx.lineWidth = 2;
            ctx.beginPath();

            for(const lx of [-0.5, 0, 0.5]){

                const kick = e.asleep ? 0 : Math.sin(time * 16 + lx * 4) * 2;

                ctx.moveTo(lx * e.r, -e.r * 0.6);
                ctx.lineTo(lx * e.r + kick, -e.r * 1.05);
                ctx.moveTo(lx * e.r, e.r * 0.6);
                ctx.lineTo(lx * e.r - kick, e.r * 1.05);

            }

            ctx.stroke();

            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.ellipse(-e.r * 0.1, 0, e.r * 0.95, e.r * 0.75, 0, 0, TAU);
            ctx.fill();

            ctx.strokeStyle = mix(colour, "#000000", 0.45);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-e.r, 0);
            ctx.lineTo(e.r * 0.5, 0);
            ctx.stroke();

            // the horn
            ctx.fillStyle = "#e7e2d4";
            ctx.beginPath();
            ctx.moveTo(e.r * 0.7, -e.r * 0.2);
            ctx.lineTo(e.r * 1.55, -e.r * 0.45);
            ctx.lineTo(e.r * 0.8, e.r * 0.2);
            ctx.fill();

            circle(ctx, e.r * 0.75, 0, e.r * 0.35, mix(colour, "#000000", 0.35));

            ctx.restore();

            if(e.mode === "stun")
                for(let i = 0; i < 3; i++)
                    circle(ctx, Math.cos(time * 6 + i * 2.1) * e.r * 0.7, -e.r * 1.2 + Math.sin(time * 6 + i * 2.1) * 3, 1.8, "#facc15");

            return OWN_EYES;

        },


        /* ---- Abyss ---- */

        watcher(e, colour, look){

            const focus = e.mode === "focus" || e.mode === "beam";
            const aim = focus ? e.angle : look;
            const lid = e.asleep ? 1 : Math.max(0, Math.sin(time * 0.9 + e.id * 3) * 40 - 39);

            // wisps trailing beneath
            ctx.strokeStyle = alpha(colour, 0.5);
            ctx.lineWidth = 2;
            ctx.beginPath();

            for(let k = -1; k <= 1; k++){

                ctx.moveTo(k * e.r * 0.4, e.r * 0.7);
                ctx.quadraticCurveTo(k * e.r * 0.4 + Math.sin(time * 5 + k) * 4, e.r * 1.2, k * e.r * 0.5, e.r * 1.6);

            }

            ctx.stroke();

            if(focus)
                circle(ctx, 0, 0, e.r * 1.5, alpha(colour, 0.15 + 0.1 * Math.sin(time * 30)));

            circle(ctx, 0, 0, e.r, "#ede9fe");

            const ix = Math.cos(aim) * e.r * 0.38;
            const iy = Math.sin(aim) * e.r * 0.38;

            circle(ctx, ix, iy, e.r * 0.48, focus ? "#f0abfc" : colour);
            circle(ctx, ix * 1.15, iy * 1.15, e.r * 0.22, "#0b0b0b");

            // the eyelid
            if(lid > 0){

                ctx.fillStyle = mix(colour, "#000000", 0.45);
                ctx.beginPath();
                ctx.arc(0, 0, e.r + 0.5, Math.PI, 0);
                ctx.lineTo(e.r, -e.r + lid * e.r * 2);
                ctx.lineTo(-e.r, -e.r + lid * e.r * 2);
                ctx.fill();

            }

            ctx.strokeStyle = mix(colour, "#000000", 0.4);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, e.r, 0, TAU);
            ctx.stroke();

            return OWN_EYES;

        },


        imp(e, colour){

            const hop = e.asleep ? 0 : Math.abs(Math.sin(time * 10 + e.id)) * 2;

            ctx.translate(0, -hop);

            // a tail with a barb
            ctx.strokeStyle = mix(colour, "#000000", 0.3);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, e.r * 0.6);
            ctx.quadraticCurveTo(e.r * 1.1, e.r * 1.1, e.r * 1.2, e.r * 0.3 + Math.sin(time * 6) * 2);
            ctx.stroke();

            circle(ctx, 0, 0, e.r, colour);

            ctx.fillStyle = "#3b0764";

            for(const side of [-1, 1]){

                ctx.beginPath();
                ctx.moveTo(side * e.r * 0.35, -e.r * 0.75);
                ctx.lineTo(side * e.r * 0.75, -e.r * 1.5);
                ctx.lineTo(side * e.r * 0.75, -e.r * 0.55);
                ctx.fill();

            }

            if(e.mode === "aim")
                circle(ctx, 0, 0, e.r * 1.6, alpha("#c58cff", 0.2 + 0.15 * Math.sin(time * 40)));

        },


        grasp(e, colour, look){

            // the hole it comes out of
            ctx.fillStyle = "#07040d";
            ctx.beginPath();
            ctx.ellipse(0, e.r * 0.7, e.r * 1.1, e.r * 0.45, 0, 0, TAU);
            ctx.fill();

            const lean = e.mode === "whip" ? 0.7 : 0.35;
            const sway = Math.sin(time * 3 + e.id) * 0.3;
            const a = (e.mode === "whip" || e.mode === "up" ? e.angle : look) ;

            let x = 0;
            let y = e.r * 0.6;

            // a tapering tentacle bending towards you
            for(let k = 0; k < 6; k++){

                const r = e.r * (0.75 - k * 0.1);
                const bend = Math.sin(time * 4 + k * 0.8 + e.id) * 2;

                x += Math.cos(a) * lean * 5 + bend * 0.4 + sway;
                y += -5 + Math.sin(a) * lean * 3;

                circle(ctx, x, y, r, k % 2 ? mix(colour, "#000000", 0.2) : colour);

            }

            // suckers on the tip and an eye
            circle(ctx, x, y, e.r * 0.28, "#f5f3ff");
            circle(ctx, x + Math.cos(look) * 1.5, y + Math.sin(look) * 1.5, e.r * 0.13, "#0b0b0b");

            return OWN_EYES;

        },


        /* ---- Furnace ---- */

        ember(e, colour){

            const flick = Math.sin(time * 20 + e.id);

            circle(ctx, 0, 0, e.r * 1.7, alpha("#ff6a1a", 0.18));

            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.moveTo(-e.r, e.r * 0.3);
            ctx.quadraticCurveTo(-e.r * 0.9, -e.r * 0.6, -e.r * 0.2, -e.r * 1.1);
            ctx.lineTo(0, -e.r * (1.6 + 0.2 * flick));
            ctx.lineTo(e.r * 0.25, -e.r * 1.05);
            ctx.quadraticCurveTo(e.r * 0.9, -e.r * 0.6, e.r, e.r * 0.3);
            ctx.arc(0, e.r * 0.3, e.r, 0, Math.PI);
            ctx.fill();

            circle(ctx, 0, e.r * 0.1, e.r * 0.55, "#fde68a");

            if(Math.random() < 0.35)
                fx.burst(e.x, e.y - e.r, {count: 1, colour: "#ffb347", speed: 20, life: 0.4, size: 2, gravity: -60, glow: true, shape: "dot"});

        },


        cinder(e, colour, look){

            const aiming = e.mode === "aim";

            // a squat body with a glowing belly and a big mouth
            ctx.fillStyle = mix(colour, "#000000", 0.35);
            ctx.beginPath();
            ctx.ellipse(0, e.r * 0.15, e.r * 1.1, e.r * 0.85, 0, 0, TAU);
            ctx.fill();

            circle(ctx, 0, e.r * 0.3, e.r * 0.55, aiming ? "#fde68a" : "#ff8a3d");

            circle(ctx, Math.cos(look) * e.r * 0.5, -e.r * 0.25 + Math.sin(look) * e.r * 0.3, e.r * 0.45, colour);

            // the mouth glows before it spits
            circle(ctx, Math.cos(look) * e.r * 0.85, -e.r * 0.2 + Math.sin(look) * e.r * 0.5, aiming ? 4 : 2.5, aiming ? "#fff7cc" : "#3b1306");

            if(aiming && Math.random() < 0.5)
                fx.burst(e.x + Math.cos(look) * e.r, e.y + Math.sin(look) * e.r * 0.5, {count: 1, colour: "#ffb347", speed: 30, life: 0.3, size: 2, glow: true});

        },


        golem(e, colour){

            const jitter = e.mode === "wind" ? (Math.random() - 0.5) * 3 : 0;
            const heat = e.mode === "charge" || e.mode === "wind" ? 1 : 0.55 + 0.2 * Math.sin(time * 3 + e.id);

            ctx.translate(jitter, 0);

            // fists
            for(const side of [-1, 1])
                circle(ctx, side * e.r * 1.05, e.r * 0.25 + Math.sin(time * 4 + side) * 1.5, e.r * 0.42, "#3f2a1d");

            ctx.fillStyle = "#4a3222";
            roundRect(ctx, -e.r * 0.9, -e.r * 0.85, e.r * 1.8, e.r * 1.75, e.r * 0.35);
            ctx.fill();

            // molten cracks
            ctx.strokeStyle = alpha(colour, heat);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-e.r * 0.6, -e.r * 0.5);
            ctx.lineTo(-e.r * 0.1, -e.r * 0.1);
            ctx.lineTo(-e.r * 0.35, e.r * 0.45);
            ctx.moveTo(e.r * 0.55, -e.r * 0.6);
            ctx.lineTo(e.r * 0.15, e.r * 0.05);
            ctx.lineTo(e.r * 0.5, e.r * 0.55);
            ctx.stroke();

            circle(ctx, 0, -e.r * 0.25, e.r * 0.3, alpha("#fde68a", heat));

            if(e.mode === "stun")
                for(let i = 0; i < 3; i++)
                    circle(ctx, Math.cos(time * 6 + i * 2.1) * e.r * 0.7, -e.r * 1.2 + Math.sin(time * 6 + i * 2.1) * 3, 1.8, "#facc15");

            if(Math.random() < 0.15)
                fx.burst(e.x, e.y - e.r * 0.5, {count: 1, colour: "#ff9a5a", speed: 15, life: 0.5, size: 2, gravity: -40, glow: true, scatter: e.r * 0.6});

        }

    };


    // returned by a body that draws its own eyes (or has none)
    const OWN_EYES = 1;


    // the enemies you cannot touch right now, as you can see them
    const HIDDEN = {

        // a heap of bones that twitches before it stands up
        skeleton(e){

            const twitch = Math.sin(time * 30 + e.id) * (Math.sin(time * 2 + e.id) > 0.6 ? 1 : 0);

            ctx.strokeStyle = "#a8a29e";
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(-8, 4 + twitch);
            ctx.lineTo(6, 7);
            ctx.moveTo(-4, 9);
            ctx.lineTo(8, 2 - twitch);
            ctx.moveTo(-9, 8);
            ctx.lineTo(-2, 2);
            ctx.stroke();

            circle(ctx, 3 + twitch, 2, 4.5, "#d6d3c4");

            for(const side of [-1, 1])
                circle(ctx, 3 + side * 1.6 + twitch, 1.5, 1, "#0b0b0b");

        },

        // only a cold shimmer where it drifts
        shade(e){

            BODIES.shade(e, e.color, 0, 0.14 + 0.08 * Math.sin(time * 9 + e.id));

        },

        // a ripple in the floor; before it bursts out, a ring warns you
        grasp(e){

            ctx.strokeStyle = alpha(e.color, 0.35);
            ctx.lineWidth = 1.5;

            for(let k = 0; k < 2; k++){

                const r = ((time * 0.8 + k * 0.5 + e.id * 0.13) % 1) * e.r * 1.6;

                ctx.globalAlpha = 1 - r / (e.r * 1.6);
                ctx.beginPath();
                ctx.ellipse(0, e.r * 0.6, r, r * 0.45, 0, 0, TAU);
                ctx.stroke();

            }

            ctx.globalAlpha = 1;

            ctx.fillStyle = "rgba(10, 6, 20, 0.6)";
            ctx.beginPath();
            ctx.ellipse(0, e.r * 0.6, e.r * 0.6, e.r * 0.25, 0, 0, TAU);
            ctx.fill();

            if(e.mode === "rise" || e.mode === "sink"){

                ctx.strokeStyle = alpha("#ff5c7a", 0.5 + 0.3 * Math.sin(time * 30));
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, e.r * 1.6, 0, TAU);
                ctx.stroke();

            }

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
        else if(e.shape === "lich"){

            const bob = e.asleep ? 0 : Math.sin(time * 2) * 3;

            // souls circling it
            for(let i = 0; i < 3; i++){

                const a = time * 1.8 + i * TAU / 3;

                circle(ctx, Math.cos(a) * r * 1.6, Math.sin(a) * r * 0.9 + bob, 6, alpha(colour, 0.3));
                circle(ctx, Math.cos(a) * r * 1.6, Math.sin(a) * r * 0.9 + bob, 3, mix(colour, "#ffffff", 0.5));

            }

            ctx.translate(0, bob);

            // a tattered robe
            ctx.fillStyle = "#1f2d24";
            ctx.beginPath();
            ctx.moveTo(-r * 0.9, -r * 0.2);
            ctx.lineTo(0, -r * 1.3);
            ctx.lineTo(r * 0.9, -r * 0.2);

            for(let i = 0; i <= 6; i++)
                ctx.lineTo(r * 0.95 - i * r * 0.32, r * 1.1 + (i % 2 ? -6 : 0) + Math.sin(time * 6 + i) * 2);

            ctx.closePath();
            ctx.fill();

            // the skull in the hood, under a crown
            circle(ctx, 0, -r * 0.45, r * 0.55, "#0b0b0b");
            circle(ctx, 0, -r * 0.42, r * 0.42, "#d6d3c4");

            for(const side of [-1, 1])
                circle(ctx, side * r * 0.16, -r * 0.48, r * 0.1, e.asleep ? "#0b0b0b" : e.enraged ? "#ff5c7a" : colour);

            ctx.fillStyle = "#facc15";
            ctx.beginPath();
            ctx.moveTo(-r * 0.35, -r * 0.85);

            for(let i = 0; i <= 4; i++)
                ctx.lineTo(-r * 0.35 + i * r * 0.175, -r * (i % 2 ? 0.95 : 1.15));

            ctx.lineTo(r * 0.35, -r * 0.85);
            ctx.fill();

        }
        else if(e.shape === "core"){

            const beat = e.asleep ? 0.4 : 0.7 + 0.3 * Math.sin(time * (e.enraged ? 9 : 5));

            circle(ctx, 0, 0, r * 1.5, alpha("#ff6a1a", 0.12 * beat));

            // a shell of dark rock, split open
            ctx.fillStyle = "#3b2a1f";
            ctx.beginPath();

            for(let i = 0; i < 9; i++){

                const a = i / 9 * TAU + 0.2;
                const k = 1 + (i % 3) * 0.08;

                ctx.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k);

            }

            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = alpha("#ff8a3d", 0.5 + 0.5 * beat);
            ctx.lineWidth = 3;
            ctx.beginPath();

            for(let i = 0; i < 6; i++){

                const a = i / 6 * TAU + time * 0.2;

                ctx.moveTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
                ctx.lineTo(Math.cos(a + 0.2) * r * 0.95, Math.sin(a + 0.2) * r * 0.95);

            }

            ctx.stroke();

            // the molten heart, and an eye in it
            circle(ctx, 0, 0, r * 0.5, alpha("#ff6a1a", 0.9));
            circle(ctx, 0, 0, r * 0.32 * (0.9 + 0.1 * beat), "#fde68a");

            if(!e.asleep)
                circle(ctx, Math.cos(look) * r * 0.12, Math.sin(look) * r * 0.12, r * 0.12, e.enraged ? "#7f1d1d" : "#3b1306");

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

        if(state.players.length > 1 && p.id !== myId)
            label(ctx, `${p.name} · hold E by them to revive`, p.x, p.y - p.r - 12, {colour: "#63d69f", size: 7});

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

    // An enemy arrow: a long dark shaft with a bright head and fletching, so
    // it reads at a glance as something other than an orb (a swing cannot
    // stop it). A thin streak behind it shows where it is going.
    function enemyArrow(b, colour){

        const heading = Math.atan2(b.vy, b.vx);
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);
        const length = 15 + b.r * 2;
        const tailX = b.x - cos * length;
        const tailY = b.y - sin * length;

        // the streak
        ctx.lineCap = "round";
        ctx.strokeStyle = alpha(colour, 0.22);
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(tailX - cos * 10, tailY - sin * 10);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        // the shaft
        ctx.strokeStyle = "#2a2522";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        ctx.strokeStyle = mix(colour, "#d6d3d1", 0.5);
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // fletching
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1.6;
        ctx.beginPath();

        for(const side of [-1, 1]){

            ctx.moveTo(tailX + cos * 5, tailY + sin * 5);
            ctx.lineTo(tailX - cos * 1 - sin * side * 4, tailY - sin * 1 + cos * side * 4);

        }

        ctx.stroke();

        // the head
        const tip = b.r + 4;

        ctx.fillStyle = mix(colour, "#ffffff", 0.35);
        ctx.beginPath();
        ctx.moveTo(b.x + cos * tip, b.y + sin * tip);
        ctx.lineTo(b.x - cos * 2 - sin * 4, b.y - sin * 2 + cos * 4);
        ctx.lineTo(b.x - cos * 2 + sin * 4, b.y - sin * 2 - cos * 4);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "#1c1917";
        ctx.lineWidth = 0.8;
        ctx.stroke();

    }


    function bullet(b){

        if(b.team === "e"){

            const colour = TINTS[b.tint] ?? TINTS[0];

            if(b.kind === "arrow")
                return enemyArrow(b, colour);

            circle(ctx, b.x, b.y, b.r + 2, alpha(colour, 0.3));
            circle(ctx, b.x, b.y, b.r, colour);
            circle(ctx, b.x, b.y, b.r * 0.5, "#ffe4e6");

            return;

        }

        const {colour, tier} = weaponLook(b.weapon);
        const heading = Math.atan2(b.vy, b.vx);
        const shape = SHOT_LOOKS[b.kind === "shard" ? WEAPON[b.weapon]?.look === "rocket" ? "rocket" : "shard" : WEAPON[b.weapon]?.look];

        if(shape && b.kind !== "slash" && b.kind !== "arrow"){

            // lobbed: a shadow on the ground and the shot up in its arc
            const lift = b.lob ? lobHeight(b) : 0;

            if(b.lob)
                shadow(ctx, b.x, b.y - b.r * 0.8, b.r * (1 - lift / 180));

            ctx.save();
            ctx.translate(b.x, b.y - lift);
            shape(b, colour, heading);
            ctx.restore();

            return;

        }

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


    // How the shots of the second armoury look, by WEAPONS[].look. Each
    // draws at (0, 0), the shot's place; `heading` is where it flies.
    const SHOT_LOOKS = {

        knife(b, colour, heading){

            ctx.rotate(heading);
            ctx.fillStyle = "#e5e5e5";
            ctx.beginPath();
            ctx.moveTo(8, 0);
            ctx.lineTo(-2, -2.2);
            ctx.lineTo(-2, 2.2);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = colour;
            ctx.fillRect(-7, -1.2, 5, 2.4);

        },

        bolt(b, colour, heading){

            ctx.rotate(heading);
            ctx.strokeStyle = alpha(colour, 0.35);
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-26, 0);
            ctx.lineTo(0, 0);
            ctx.stroke();
            ctx.strokeStyle = "#a8a29e";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-12, 0);
            ctx.lineTo(4, 0);
            ctx.stroke();
            ctx.fillStyle = "#e5e5e5";
            ctx.beginPath();
            ctx.moveTo(9, 0);
            ctx.lineTo(3, -3);
            ctx.lineTo(3, 3);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = colour;
            ctx.fillRect(-13, -3, 4, 6);

        },

        boomerang(b, colour){

            ctx.rotate(time * 18);

            ctx.strokeStyle = alpha(colour, 0.25);
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(0, 0, b.r + 3, 0, TAU);
            ctx.stroke();

            ctx.fillStyle = "#c08a52";
            ctx.beginPath();
            ctx.moveTo(-b.r, -b.r * 0.9);
            ctx.lineTo(b.r * 0.4, 0);
            ctx.lineTo(-b.r, b.r * 0.9);
            ctx.lineTo(-b.r * 0.4, 0);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = colour;
            ctx.fillRect(-b.r, -b.r * 0.9, 3, 3);
            ctx.fillRect(-b.r, b.r * 0.9 - 3, 3, 3);

        },

        flask(b, colour){

            ctx.rotate(time * 9);
            circle(ctx, 0, 0, b.r + 1, "#e5e5e5");
            circle(ctx, 0, 1, b.r - 1, colour);
            ctx.fillStyle = "#a16207";
            ctx.fillRect(-2, -b.r - 4, 4, 4);

        },

        shell(b){

            circle(ctx, 0, 0, b.r + 2, alpha("#ff8a3d", 0.3));
            circle(ctx, 0, 0, b.r, "#3f3f46");
            circle(ctx, -b.r * 0.3, -b.r * 0.3, b.r * 0.35, "#a1a1aa");

            if(Math.random() < 0.4)
                fx.burst(b.x, b.y - lobHeight(b), {count: 1, colour: "#ffb347", speed: 10, life: 0.35, size: 2, glow: true, shape: "dot"});

        },

        spark(b, colour){

            circle(ctx, 0, 0, b.r * 2.6, alpha(colour, 0.2));
            circle(ctx, 0, 0, b.r, "#ffffff");

            ctx.strokeStyle = colour;
            ctx.lineWidth = 1.3;
            ctx.beginPath();

            for(let i = 0; i < 3; i++){

                const a = Math.random() * TAU;

                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(a) * (b.r + 5), Math.sin(a) * (b.r + 5));

            }

            ctx.stroke();

        },

        ice(b, colour, heading){

            ctx.rotate(heading);
            circle(ctx, 0, 0, b.r * 2, alpha(colour, 0.15));
            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.moveTo(b.r * 1.8, 0);
            ctx.lineTo(0, -b.r * 0.8);
            ctx.lineTo(-b.r * 1.4, 0);
            ctx.lineTo(0, b.r * 0.8);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(-b.r * 0.2, -1, b.r * 1.2, 2);

            if(Math.random() < 0.2)
                fx.burst(b.x, b.y, {count: 1, colour: "#e0f2fe", speed: 8, life: 0.4, size: 1.6, shape: "dot", glow: true});

        },

        rocket(b, colour, heading){

            ctx.rotate(heading);
            ctx.fillStyle = "#d4d4d8";
            ctx.fillRect(-b.r * 1.4, -b.r * 0.55, b.r * 2.2, b.r * 1.1);
            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.moveTo(b.r * 1.5, 0);
            ctx.lineTo(b.r * 0.8, -b.r * 0.55);
            ctx.lineTo(b.r * 0.8, b.r * 0.55);
            ctx.closePath();
            ctx.fill();

            if(Math.random() < 0.6)
                fx.burst(b.x - Math.cos(heading) * b.r * 1.5, b.y - Math.sin(heading) * b.r * 1.5, {count: 1, colour: Math.random() < 0.5 ? "#ffb347" : "#a1a1aa", speed: 20, life: 0.3, size: 2.2, glow: true, shape: "dot"});

        },

        shard(b, colour, heading){

            ctx.rotate(heading);
            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.moveTo(b.r * 1.8, 0);
            ctx.lineTo(-b.r, -b.r * 0.7);
            ctx.lineTo(-b.r * 0.5, 0);
            ctx.lineTo(-b.r, b.r * 0.7);
            ctx.closePath();
            ctx.fill();

        },

        bee(b, colour, heading){

            const wobble = Math.sin(time * 30 + b.x * 0.1) * 0.5;

            ctx.rotate(heading + wobble * 0.3);

            // wings, a blur
            ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
            ctx.beginPath();
            ctx.ellipse(-1, -3.5, 3, 2, -0.4, 0, TAU);
            ctx.ellipse(-1, 3.5, 3, 2, 0.4, 0, TAU);
            ctx.fill();

            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.ellipse(0, 0, 4.5, 3, 0, 0, TAU);
            ctx.fill();

            ctx.fillStyle = "#1c1917";
            ctx.fillRect(-1.5, -3, 1.4, 6);
            ctx.fillRect(1.2, -2.6, 1.2, 5.2);

        }

    };


    /* ---------------- Light ---------------- */

    // the players' lights, for shadows and for the eyes in the dark
    let lights = [];
    let myId = null;
    let reach = 230;

    // the lights to shade by (living players), and whose screen this is
    function setLights(players, radius, me = null){

        lights = players.filter(p => !p.dead);
        reach = radius;
        myId = me;

    }


    // the nearest light: [distance, dx, dy] (unit vector from it to here)
    function nearestLight(x, y){

        let best = Infinity;
        let bx = 0;
        let by = 1;

        for(const p of lights){

            const d = Math.hypot(x - p.x, y - p.y);

            if(d < best){

                best = d;
                bx = (x - p.x) / (d || 1);
                by = (y - p.y) / (d || 1);

            }

        }

        return [best, bx, by];

    }


    // a shadow thrown away from the nearest light: longer and darker close to it
    function castShadow(x, y, r){

        const [d, dx, dy] = nearestLight(x, y);

        if(d === Infinity)
            return shadow(ctx, x, y, r);

        const k = Math.max(0, 1 - d / (reach * 1.15));
        const push = 2 + 7 * k;

        ctx.fillStyle = `rgba(0, 0, 0, ${(0.2 + 0.22 * k).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(x + dx * push, y + r * 0.8 + dy * push * 0.6, r * (0.95 + 0.55 * k), r * 0.38, Math.atan2(dy * 0.6, dx), 0, TAU);
        ctx.fill();

    }


    // what an enemy lights up around itself: [radius, colour, strength] or null
    function glowOf(e){

        if(e.spawn > 0)
            return [e.r * 2.5, e.color, 0.4 * (1 - e.spawn / e.spawnTime)];

        if(e.boss){

            if(e.asleep)
                return [e.r * 2.5, e.color, 0.25];

            const beat = 0.75 + 0.25 * Math.sin(time * (e.enraged ? 9 : 4));

            return [e.r * 4, e.enraged ? mix(e.color, "#ff5c7a", 0.5) : e.color, 0.75 * beat];

        }

        if(e.asleep)
            return null;

        const flicker = 0.85 + 0.15 * Math.sin(time * 17 + e.id * 3) * Math.sin(time * 5 + e.id);

        switch(e.type){

            case "ember":      return [70, "#ff8a3d", 0.75 * flicker];
            case "golem":      return [e.mode === "charge" || e.mode === "wind" ? 110 : 80, "#ff6a1a", (e.mode === "charge" ? 0.95 : 0.55) * flicker];
            case "cinder":     return [e.mode === "aim" ? 85 : 50, "#ff8a3d", e.mode === "aim" ? 0.85 : 0.4];
            case "necro":      return [e.mode === "raise" ? 130 : 55, "#86efac", e.mode === "raise" ? 0.9 : 0.5];
            case "shade":      return e.hidden ? [40, "#7dd3fc", 0.15] : [65, "#7dd3fc", 0.5];
            case "watcher":    return e.mode === "focus" ? [95, "#c4b5fd", 0.85] : [50, "#c4b5fd", 0.4];
            case "imp":        return e.hidden ? null : [45, "#f472b6", e.mode === "aim" ? 0.75 : 0.35];
            case "grasp":      return e.hidden ? (e.mode === "rise" ? [55, "#8b5cf6", 0.5] : null) : [55, "#8b5cf6", 0.35];
            case "mage":       return [55, "#61a8ff", e.mode === "aim" ? 0.8 : 0.45];
            case "sporecap":   return [e.mode === "puff" ? 95 : 45, "#e879f9", e.mode === "puff" ? 0.7 : 0.3];
            case "boomshroom": return e.mode === "fuse" ? [80, "#fde68a", Math.floor(time * 14) % 2 ? 0.9 : 0.3] : [35, "#fb923c", 0.3];
            case "turret":     return e.mode === "aim" ? [45, "#ff5c7a", 0.6] : null;
            case "archer":     return e.mode === "aim" ? [40, "#ff7185", 0.5] : null;

        }

        return null;

    }


    // colour of each creature's eyes in the dark
    const EYES = {
        skeleton: "#ff7185", archer: "#ff7185", bat: "#fca5a5", shade: "#e0f2fe", necro: "#86efac",
        slime: "#d9f99d", slimelet: "#d9f99d", wasp: "#fde68a", wolf: "#facc15", sporecap: "#f5d0fe",
        boomshroom: "#fde68a", beetle: "#5eead4", watcher: "#f0abfc", imp: "#f9a8d4", grasp: "#ddd6fe",
        mage: "#bfdbfe", ember: "#fff7cc", turret: "#ff5c7a", cinder: "#fde68a", golem: "#fde68a"
    };


    // Out past the reach of your light the creatures are dark shapes, but
    // their eyes catch the light: two glints that blink now and then.
    // Drawn over the dark, for the enemies on screen.
    function eyesInDark(list){

        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        for(const e of list){

            if(e.hidden || e.boss || e.dummy || e.spawn > 0 || e.asleep)
                continue;

            const [d] = nearestLight(e.x, e.y);
            const k = Math.min(1, Math.max(0, (d - reach * 0.55) / (reach * 0.35)));

            if(k <= 0.02)
                continue;

            // a blink every few seconds
            if((time * 0.7 + e.id * 1.37) % 3.6 < 0.13)
                continue;

            const target = nearestTo(lights, e);
            const look = target ? Math.atan2(target.y - e.y, target.x - e.x) : e.angle;
            const colour = EYES[e.type] ?? "#ffd27a";
            const r = e.r;
            const ex = e.x + Math.cos(look) * r * 0.4;
            const ey = e.y - r * 0.1 + Math.sin(look) * r * 0.25;
            const px = -Math.sin(look) * r * 0.32;
            const py = Math.cos(look) * r * 0.2;
            const size = Math.max(1.2, r * 0.13);
            const pair = e.type === "watcher" || e.type === "grasp" || e.type === "shade" ? [0] : [-1, 1];

            for(const side of pair){

                const x = ex + px * side;
                const y = ey + py * side;

                circle(ctx, x, y, size * 3.2, alpha(colour, 0.12 * k));
                circle(ctx, x, y, size, alpha(colour, 0.85 * k));

            }

        }

        ctx.restore();

    }


    return {
        enemy, dummyLabel, player, bullet,
        setLights, glowOf, eyesInDark,
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
