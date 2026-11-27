import {alpha, createFx} from "../../lib/fx.js";
import {WIDTH, HEIGHT} from "./orbs.js";


const TAU = Math.PI * 2;
export const NODES = [[0.19, 0.65], [0.49, 0.31], [0.80, 0.53]];
export const GOLD = "#f1cf8b";


function circle(ctx, x, y, r){

    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);

}


function sky(ctx, ink){

    // Fixed stars and fine orbital tracks stay still behind the flight paths.
    let seed = 467;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    for(let i = 0; i < 130; i++){

        const x = random() * WIDTH;
        const y = random() * HEIGHT;
        ctx.fillStyle = alpha(ink, 0.14 + random() * 0.38);
        ctx.fillRect(x, y, i % 9 ? 1 : 2, 1);

    }

    ctx.save();
    ctx.translate(WIDTH * 0.49, HEIGHT * 0.55);
    ctx.rotate(-0.31);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = alpha(ink, 0.10);

    for(const radius of [68, 132, 198, 275, 365]){

        ctx.beginPath();
        ctx.ellipse(0, 0, radius, radius * 0.65, 0, 0, TAU);
        ctx.stroke();

    }

    ctx.restore();

}


function shell(ctx, orb, ink, glow){

    const {x, y, r, tier, hp, max} = orb;
    const colour = orb.flash > 0 ? "#ffffff" : ink;

    ctx.fillStyle = alpha(glow, 0.075);
    circle(ctx, x, y, r + 5);
    ctx.fill();

    ctx.fillStyle = alpha(ink, 0.14);
    ctx.strokeStyle = alpha(ink, 0.76);
    ctx.lineWidth = 1;

    if(tier === 2){

        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();

    }
    else
        circle(ctx, x, y, r - 1);

    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colour;
    circle(ctx, x, y, tier ? 3.3 : 2.5);
    ctx.fill();

    if(max <= 1)
        return;

    // One bright segment per intact layer. Damage leaves a readable gap.
    ctx.lineWidth = 1.7;

    for(let i = 0; i < max; i++){

        const start = -Math.PI / 2 + i * TAU / max;
        ctx.strokeStyle = alpha(colour, i < hp ? 0.88 : 0.12);
        ctx.beginPath();
        ctx.arc(x, y, r + 2, start + 0.10, start + TAU / max - 0.10);
        ctx.stroke();

    }

}


function ship(ctx, seeker, ink, glow){

    const {x, y, angle, trail} = seeker;
    const rushing = seeker.dash > 0;

    ctx.lineCap = "round";

    for(let i = 1; i < trail.length; i++){

        const fade = i / trail.length;
        ctx.lineWidth = fade * (rushing ? 6 : 4);
        ctx.strokeStyle = alpha(glow, fade * 0.65);
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();

    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.shadowColor = glow;
    ctx.shadowBlur = rushing ? 15 : 8;
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-7, 5);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-7, -5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

}


export function createView(canvas){

    const ctx = canvas.getContext("2d");
    const fx = createFx({max: 240, maxText: 20});
    const back = document.createElement("canvas");
    back.width = WIDTH;
    back.height = HEIGHT;

    let backdrop = "";
    let width = 0;
    let height = 0;

    new ResizeObserver(([entry]) => {

        width = entry.contentRect.width;
        height = entry.contentRect.height;

    }).observe(canvas);


    function draw(flight, progress, dt, aim){

        if(!width || !height)
            return;

        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.round(width * ratio);
        const h = Math.round(height * ratio);

        if(canvas.width !== w || canvas.height !== h){

            canvas.width = w;
            canvas.height = h;

        }

        const {ink, glow} = flight.orbit;
        const chart = progress !== null;
        const tint = chart ? GOLD : ink;

        if(backdrop !== tint){

            const bg = back.getContext("2d");
            bg.clearRect(0, 0, WIDTH, HEIGHT);
            sky(bg, tint);
            backdrop = tint;

        }

        ctx.setTransform(w / WIDTH, 0, 0, h / HEIGHT, 0, 0);
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        ctx.drawImage(back, 0, 0);

        if(chart){

            for(let i = 1; i < NODES.length; i++){

                ctx.strokeStyle = alpha(GOLD, i < progress ? 0.94 : 0.34);
                ctx.lineWidth = i < progress ? 1.8 : 1;
                ctx.setLineDash(i < progress ? [] : [2, 6]);
                ctx.beginPath();
                ctx.moveTo(NODES[i - 1][0] * WIDTH, NODES[i - 1][1] * HEIGHT);
                ctx.lineTo(NODES[i][0] * WIDTH, NODES[i][1] * HEIGHT);
                ctx.stroke();

            }

            ctx.setLineDash([]);

        }
        else{

            if(aim && flight.cooldown <= 0){

                const lead = flight.seekers[0];
                const angle = Math.atan2(aim.y - lead.y, aim.x - lead.x);
                ctx.setLineDash([2, 7]);
                ctx.strokeStyle = alpha(ink, 0.25);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(lead.x, lead.y);
                ctx.lineTo(lead.x + Math.cos(angle) * 290, lead.y + Math.sin(angle) * 290);
                ctx.stroke();
                ctx.setLineDash([]);

            }

            for(const orb of flight.orbs)
                shell(ctx, orb, ink, glow);

            for(const seeker of flight.seekers)
                ship(ctx, seeker, ink, glow);

        }

        fx.update(dt);
        fx.draw(ctx);
        fx.drawText(ctx);

    }


    function hit(orb, seeker, reward, rushing, orbit){

        const {x, y, r} = orb;

        if(reward){

            fx.shatter(x, y, r * 0.75, orbit.glow, {splat: false});
            fx.text(x, y - 12, "+" + reward, {colour: orbit.ink, size: 12, pop: rushing});

        }
        else{

            fx.impact(x, y, seeker.angle, {colour: orbit.ink, count: 4, speed: 70});
            fx.ring(x, y, r + 7, {colour: orbit.glow, width: 1});

        }

        if(rushing && seeker.hits > 1)
            fx.text(x, y + 17, seeker.hits + " chain", {colour: GOLD, size: 11});

    }


    function light(x, y, colour, big = false){

        fx.ring(x, y, big ? 115 : 39, {colour, life: 0.8, width: 1.5});
        fx.burst(x, y, {colour, count: big ? 80 : 22, speed: big ? 190 : 82, size: 2, life: 1.05, glow: true});

    }


    return {draw, hit, light, clear: fx.clear};

}
