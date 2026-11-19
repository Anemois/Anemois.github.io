import {WIDTH, HEIGHT, LANE, PATH} from "./map.js";
import {LAYER_COLORS, TOWERS, TOWER_RADIUS} from "./data.js";
import {format} from "./util.js";
import {createFx, mix} from "../../lib/fx.js";


// Tower outlines as SVG path data around (0, 0): the canvas strokes them on
// the field and the panel uses the same shapes as icons.
const SHAPES = {
    dart:   "M -8 0 A 8 8 0 1 0 8 0 A 8 8 0 1 0 -8 0 Z",
    cannon: "M -7.5 -7.5 H 7.5 V 7.5 H -7.5 Z",
    frost:  hexagon(9.5),
    sniper: "M 0 -10.5 L 10.5 0 L 0 10.5 L -10.5 0 Z",
    tesla:  "M 0 -10 L 9.5 7 L -9.5 7 Z",
    nova:   "M 0 -11 L 3.2 -3.2 L 11 0 L 3.2 3.2 L 0 11 L -3.2 3.2 L -11 0 L -3.2 -3.2 Z"
};

// towers that turn to face their target, and how long their barrel is
const BARRELS = {dart: 13, cannon: 12, sniper: 17};

const PATHS = Object.fromEntries(
    Object.entries(SHAPES).map(([id, d]) => [id, new Path2D(d)])
);

const TOWER_SCALE = 1.2;
const THEMES = {boss: "boss", rush: "rush", armored: "armored column"};
const GUARD_SIZE = 8;
const FONT = "Arial, Helvetica, sans-serif";


function hexagon(r){

    const points = [];

    for(let i = 0; i < 6; i++){

        const angle = Math.PI / 6 + i * Math.PI / 3;

        points.push(`${(r * Math.cos(angle)).toFixed(2)} ${(r * Math.sin(angle)).toFixed(2)}`);

    }

    return `M ${points.join(" L ")} Z`;

}


// small inline SVG of a tower type, for the panel
export function towerIcon(id){

    const color = TOWERS[id].color;

    return `<svg class="td-icon" viewBox="-13 -13 26 26" aria-hidden="true">` +
        `<path d="${SHAPES[id]}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>` +
        `<circle r="2" fill="${color}"/></svg>`;

}


// Draws the field. resize() whenever the canvas changes size, draw() per frame.
// view: {selected, hover (tower ids), ghost ({type, x, y, ok, reason, range}
//        while placing), rally, rallyGhost, troops, bonus, notice}
export function createRenderer(canvas){

    const ctx = canvas.getContext("2d");
    const background = document.createElement("canvas");

    // the battle records what happened; this turns it into particles
    const fx = createFx({max: 600});

    let lastFrame = 0;

    let scale = 1;


    // returns false while the canvas has no size (card collapsed, sky open)
    function resize(){

        const width = canvas.clientWidth;

        if(!width)
            return false;

        const dpr = window.devicePixelRatio || 1;
        const pixels = Math.round(width * dpr);

        if(canvas.width !== pixels){

            canvas.width = pixels;
            canvas.height = Math.round(pixels * HEIGHT / WIDTH);

            scale = canvas.width / WIDTH;

            paintBackground();

        }

        return true;

    }


    // the path never changes, so it is painted once per size
    function paintBackground(){

        background.width = canvas.width;
        background.height = canvas.height;

        const g = background.getContext("2d");

        g.setTransform(scale, 0, 0, scale, 0, 0);

        g.fillStyle = "#0b0b0b";
        g.fillRect(0, 0, WIDTH, HEIGHT);

        g.lineJoin = "round";

        tracePath(g);
        g.strokeStyle = "#232323";
        g.lineWidth = LANE + 2;
        g.stroke();

        tracePath(g);
        g.strokeStyle = "#151515";
        g.lineWidth = LANE;
        g.stroke();

        tracePath(g);
        g.setLineDash([5, 11]);
        g.strokeStyle = "#202020";
        g.lineWidth = 1.5;
        g.stroke();
        g.setLineDash([]);

        // the gate the balloons must not reach
        const y = PATH.points[PATH.points.length - 1][1];

        g.fillStyle = "#1d1d1d";
        g.fillRect(WIDTH - 10, y - LANE / 2 - 4, 10, LANE + 8);

    }


    function tracePath(g){

        g.beginPath();

        PATH.points.forEach(([x, y], i) =>
            i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)
        );

    }


    /* ---------------- Frame ---------------- */

    function draw(battle, view){

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(background, 0, 0);
        ctx.setTransform(scale, 0, 0, scale, 0, 0);

        drawRange(battle, view);
        drawTowers(battle, view);
        drawGhost(view.ghost);
        drawRally(battle, view);
        drawEnemies(battle.enemies);
        drawGuards(battle.guards);
        drawProjectiles(battle.projectiles);
        drawEffects(battle.effects);
        drawHud(battle, view);

    }


    function circle(x, y, r){

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);

    }


    // range of the tower being placed, else of the selected or hovered one
    function drawRange(battle, {ghost, selected, hover}){

        let x, y, range, ok = true;

        if(ghost){

            ({x, y, range, ok} = ghost);

        }
        else{

            const id = selected ?? hover;
            const tower = battle.towers.find(t => t.id === id);

            if(!tower)
                return;

            ({x, y} = tower);
            range = tower.stats.range;

        }

        if(!Number.isFinite(range))
            return;

        circle(x, y, range);

        ctx.fillStyle = ok ? "rgba(255, 255, 255, 0.035)" : "rgba(255, 113, 133, 0.06)";
        ctx.fill();
        ctx.strokeStyle = ok ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 113, 133, 0.45)";
        ctx.lineWidth = 1;
        ctx.stroke();

    }


    // the outline of one tower type at (x, y)
    function drawShape(type, x, y, color, angle, kick){

        const barrel = BARRELS[type];

        // turning towers recoil, the others swell for a moment
        const scale = TOWER_SCALE * (barrel ? 1 : 1 + 0.18 * kick);

        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);

        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.strokeStyle = color;

        if(barrel){

            const length = barrel * (1 - 0.3 * kick);

            ctx.lineWidth = type === "cannon" ? 4 : 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
            ctx.stroke();

            ctx.lineWidth = 2;

        }

        ctx.fillStyle = "#121212";
        ctx.fill(PATHS[type]);
        ctx.stroke(PATHS[type]);

        ctx.fillStyle = color;
        circle(0, 0, 2);
        ctx.fill();

        ctx.restore();

    }


    function drawTowers(battle, {selected, hover}){

        for(const tower of battle.towers){

            if(tower.id === selected || tower.id === hover){

                circle(tower.x, tower.y, TOWER_RADIUS + 3);
                ctx.strokeStyle = tower.id === selected ? "#e5e5e5" : "#666";
                ctx.lineWidth = 1.5;
                ctx.stroke();

            }

            drawShape(tower.type, tower.x, tower.y, TOWERS[tower.type].color, tower.angle, tower.kick);

            drawTiers(tower);

        }

        ctx.lineCap = "butt";

    }


    // small dots under a tower: one per bought tier, its main path brighter
    function drawTiers(tower){

        const tiers = tower.paths;
        const total = tiers[0] + tiers[1] + tiers[2];

        if(total === 0)
            return;

        const main = Math.max(...tiers);

        let x = tower.x - (total - 1) * 2.5;

        const y = tower.y + TOWER_RADIUS + 4;

        for(const count of [...tiers].sort((a, b) => b - a)){

            ctx.fillStyle = count === main ? "#e5e5e5" : "#666";

            for(let i = 0; i < count; i++){

                ctx.fillRect(x - 1, y - 1, 2, 2);

                x += 5;

            }

        }

    }


    // the tower about to be placed, red where it can't go
    function drawGhost(ghost){

        if(!ghost)
            return;

        ctx.globalAlpha = 0.75;

        drawShape(ghost.type, ghost.x, ghost.y, ghost.ok ? TOWERS[ghost.type].color : "#ff7185", -Math.PI / 2, 0);

        ctx.globalAlpha = 1;

        if(ghost.reason){

            ctx.font = `13px ${FONT}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = "#ff7185";
            ctx.fillText(ghost.reason, ghost.x, ghost.y + TOWER_RADIUS + 8);
            ctx.textAlign = "left";

        }

    }


    function drawRally(battle, {rallyGhost, rally, troops}){

        if(rallyGhost)
            flag(rallyGhost.x, rallyGhost.y, "#e5e5e5");

        else if(troops > 0)
            flag(rally.x, rally.y, "#555");

    }


    // a little flag beside the path
    function flag(x, y, color){

        const fx = x + LANE / 2 + 4;
        const fy = y - LANE / 2 - 2;

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.moveTo(fx, fy + 12);
        ctx.lineTo(fx, fy - 6);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(fx, fy - 6);
        ctx.lineTo(fx + 9, fy - 3);
        ctx.lineTo(fx, fy);
        ctx.fill();

    }


    function drawEnemies(enemies){

        for(const e of enemies){

            if(e.boss){

                drawBoss(e);

                continue;

            }

            const color = LAYER_COLORS[e.layers - 1];

            // swift balloons leave a short streak
            if(e.kind === "swift" && !e.blocker){

                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.35;
                ctx.lineWidth = e.r;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(e.x - e.dx * e.r * 2.6, e.y - e.dy * e.r * 2.6);
                ctx.lineTo(e.x, e.y);
                ctx.stroke();
                ctx.globalAlpha = 1;
                ctx.lineCap = "butt";

            }

            circle(e.x, e.y, e.r);
            ctx.fillStyle = color;
            ctx.fill();

            if(e.armor > 0){

                circle(e.x, e.y, e.r + 2.5);
                ctx.strokeStyle = "#9ca3af";
                ctx.lineWidth = 1 + 2 * e.armor / e.armorMax;
                ctx.stroke();

            }
            else if(e.stunT > 0 || e.burnT > 0 || e.slowT > 0){

                // frozen white, burning orange, slowed blue
                circle(e.x, e.y, e.r + 2);
                ctx.strokeStyle = e.stunT > 0 ? "#ffffff" : e.burnT > 0 ? "#ff9a5a" : "#7dd3fc";
                ctx.lineWidth = e.stunT > 0 ? 2 : 1;
                ctx.stroke();

            }

            // regrowers carry a small dark core
            if(e.kind === "regen"){

                circle(e.x, e.y, 2.2);
                ctx.fillStyle = "#0b0b0b";
                ctx.fill();

            }

        }

    }


    function drawBoss(e){

        const angle = Math.atan2(e.dy, e.dx);

        ctx.save();
        ctx.translate(e.x, e.y);

        ctx.save();
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.ellipse(0, 0, e.r * 1.3, e.r * 0.85, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#d4d4d4";
        ctx.fill();

        if(e.slowT > 0){

            ctx.strokeStyle = "#7dd3fc";
            ctx.lineWidth = 2;
            ctx.stroke();

        }

        ctx.fillStyle = "#0b0b0b";
        ctx.fillRect(-e.r * 0.55, -1.5, e.r * 1.1, 3);

        ctx.restore();

        // health bar
        const width = 46;
        const share = Math.max(0, e.hp / e.hpMax);

        ctx.fillStyle = "#2a2a2a";
        ctx.fillRect(-width / 2, -e.r - 12, width, 4);
        ctx.fillStyle = "#ff7185";
        ctx.fillRect(-width / 2, -e.r - 12, width * share, 4);

        ctx.restore();

    }


    function drawGuards(guards){

        guards.forEach((guard, i) => {

            // stand beside the path, alternating sides, so a held balloon stays visible
            const side = i % 2 === 0 ? 1 : -1;

            PATH.at(guard.s, scratch);

            const x = guard.x - scratch.dy * side * 11;
            const y = guard.y + scratch.dx * side * 11;
            const half = GUARD_SIZE / 2;

            if(!guard.alive){

                ctx.strokeStyle = "#3a3a3a";
                ctx.lineWidth = 1;
                ctx.strokeRect(x - half, y - half, GUARD_SIZE, GUARD_SIZE);

                return;

            }

            ctx.fillStyle = guard.target ? "#ffffff" : "#d4d4d4";
            ctx.fillRect(x - half, y - half, GUARD_SIZE, GUARD_SIZE);

            if(guard.target){

                ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(guard.target.x, guard.target.y);
                ctx.stroke();

            }

            if(guard.hp < guard.hpMax){

                ctx.fillStyle = "#2a2a2a";
                ctx.fillRect(x - 6, y - half - 5, 12, 2);
                ctx.fillStyle = "#63d69f";
                ctx.fillRect(x - 6, y - half - 5, 12 * Math.max(0, guard.hp / guard.hpMax), 2);

            }

        });

    }


    function drawProjectiles(projectiles){

        ctx.lineCap = "round";

        for(const p of projectiles){

            if(p.kind === "cannon"){

                circle(p.x, p.y, 3.5);
                ctx.fillStyle = TOWERS.cannon.color;
                ctx.fill();

                continue;

            }

            const dx = p.tx - p.x;
            const dy = p.ty - p.y;
            const length = Math.hypot(dx, dy) || 1;

            ctx.strokeStyle = "#e5e5e5";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p.x - dx / length * 7, p.y - dy / length * 7);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();

        }

        ctx.lineCap = "butt";

    }


    // New battle effects become particles, rings and bolts (lib/fx.js).
    // Each is turned once (`shown`); the battle drops them when they expire.
    function drawEffects(effects){

        const now = performance.now();
        const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0;

        lastFrame = now;

        for(const f of effects){

            if(!f.shown){

                f.shown = true;

                show(f);

            }

        }

        fx.update(dt);

        fx.drawUnder(ctx);
        fx.draw(ctx);
        fx.drawText(ctx);

    }


    function show(f){

        switch(f.kind){

            // a balloon layer bursting: rubber bits and a quick ring
            case "pop":

                fx.burst(f.x, f.y, {count: 5, colour: f.color, speed: 120, life: 0.4, size: Math.max(2.5, f.radius * 0.35), shape: "shard", drag: 4});
                fx.ring(f.x, f.y, f.radius + 9, {colour: f.color, life: 0.22, width: 2, from: 0.7});

                break;

            case "ring":

                // cannon shells explode; a boss bursting gets a big flash
                if(f.color === TOWERS.cannon.color){

                    fx.explosion(f.x, f.y, f.radius, {colour: f.color, scorch: false});

                }
                else if(f.radius >= 60){

                    fx.ring(f.x, f.y, f.radius, {colour: f.color, life: 0.6, width: 3, fill: 0.1});
                    fx.flash(f.x, f.y, f.radius * 1.6, {colour: f.color, life: 0.3});
                    fx.burst(f.x, f.y, {count: 18, colour: "#ffffff", speed: 220, life: 0.5, shape: "spark", glow: true});

                }
                else{

                    fx.ring(f.x, f.y, f.radius, {colour: f.color, life: f.life, width: 2});

                }

                break;

            // a sniper shot: a bright line and sparks where it lands
            case "line":

                fx.bolt(f.x1, f.y1, f.x2, f.y2, {colour: f.color, width: 1.6, life: 0.18});
                fx.impact(f.x2, f.y2, Math.atan2(f.y2 - f.y1, f.x2 - f.x1), {colour: mix(f.color, "#ffffff", 0.4), count: 4});

                break;

            // tesla lightning through every target it jumps to
            case "bolt":

                if(!f.points)
                    break;

                for(let i = 2; i < f.points.length; i += 2){

                    const x = f.points[i];
                    const y = f.points[i + 1];

                    fx.bolt(f.points[i - 2], f.points[i - 1], x, y, {colour: f.color, width: 1.6, life: 0.2, jag: 7});
                    fx.burst(x, y, {count: 3, colour: f.color, speed: 90, life: 0.2, shape: "spark", glow: true});

                }

                break;

        }

    }


    /* ---------------- Overlay ---------------- */

    function drawHud(battle, {notice, bonus}){

        const {wave, theme, lives, livesMax, phase, pause, spawned, total} = battle.state;

        ctx.textBaseline = "top";
        ctx.textAlign = "left";

        ctx.font = `bold 17px ${FONT}`;
        ctx.fillStyle = "#e5e5e5";
        ctx.fillText(`Wave ${wave}`, 14, 12);

        if(theme){

            const x = 14 + ctx.measureText(`Wave ${wave}`).width + 8;

            ctx.font = `13px ${FONT}`;
            ctx.fillStyle = theme === "boss" ? "#ff7185" : "#888";
            ctx.fillText(THEMES[theme], x, 15);

        }

        ctx.font = `15px ${FONT}`;
        ctx.fillStyle = lives <= livesMax / 4 ? "#ff7185" : "#888";
        ctx.fillText(`♥ ${Math.max(0, Math.ceil(lives))} / ${livesMax}`, 14, 34);

        // wave progress: share of the wave spawned and gone
        const left = battle.enemies.length + (total - spawned);
        const share = total ? 1 - left / total : 0;

        ctx.fillStyle = "#1f1f1f";
        ctx.fillRect(14, 56, 96, 4);
        ctx.fillStyle = "#555";
        ctx.fillRect(14, 56, 96 * Math.min(1, Math.max(0, share)), 4);

        if(phase !== "run"){

            const failed = phase === "fail";

            ctx.globalAlpha = Math.min(1, pause * 2.5);

            banner(
                failed ? `Wave ${wave} failed, retrying` : `Wave ${wave} cleared`,
                failed ? "#ff7185" : "#e5e5e5",
                failed ? "gold from pops is kept" : `+${format(bonus)} gold`
            );

            ctx.globalAlpha = 1;

        }

        if(notice){

            ctx.globalAlpha = Math.min(1, notice.left);

            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.font = `16px ${FONT}`;
            ctx.fillStyle = "#facc15";
            ctx.fillText(notice.text, WIDTH / 2, HEIGHT - 12);
            ctx.textBaseline = "top";

            ctx.globalAlpha = 1;

        }

    }


    function banner(text, color, detail){

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.font = `bold 24px ${FONT}`;

        const width = ctx.measureText(text).width + 56;

        ctx.fillStyle = "rgba(11, 11, 11, 0.85)";
        ctx.fillRect(WIDTH / 2 - width / 2, HEIGHT / 2 - 34, width, 68);

        ctx.fillStyle = color;
        ctx.fillText(text, WIDTH / 2, HEIGHT / 2 - 8);

        ctx.font = `14px ${FONT}`;
        ctx.fillStyle = "#888";
        ctx.fillText(detail, WIDTH / 2, HEIGHT / 2 + 18);

        ctx.textBaseline = "top";
        ctx.textAlign = "left";

    }


    // canvas pixels -> world units
    function toWorld(event){

        const rect = canvas.getBoundingClientRect();

        return {
            x: (event.clientX - rect.left) / rect.width * WIDTH,
            y: (event.clientY - rect.top) / rect.height * HEIGHT
        };

    }


    return {resize, draw, toWorld};

}


const scratch = {x: 0, y: 0, dx: 0, dy: 0};
