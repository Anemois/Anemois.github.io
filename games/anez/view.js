import {createFx} from "../../lib/fx.js";
import {drawBackdrop, drawPlatform, drawHero, drawEnemy} from "./art.js";
import {BOSSES, WEAPONS} from "./world.js";

const W = 960, H = 540;
const warm = "#e9bf82", cold = "#a6dfcf", danger = "#ff9478";
const clamp = (n,min,max) => Math.max(min, Math.min(max,n));


function gate(ctx, {x,y}, open, time){

    ctx.save();
    ctx.translate(x,y);
    const gradient = ctx.createRadialGradient(0,-45,4,0,-45,83);
    gradient.addColorStop(0, open ? "#9adbcf59" : "#d9ad8820");
    gradient.addColorStop(1, "#18232500");
    ctx.fillStyle = gradient;
    ctx.fillRect(-85,-139,170,165);
    for(let i = 0; i < 2; i++){

        const w = 26 + 5 * i;
        ctx.beginPath();
        ctx.moveTo(-w,0);
        ctx.lineTo(-w,-49);
        ctx.quadraticCurveTo(-w,-75,0,-91-i*7);
        ctx.quadraticCurveTo(w,-75,w,-49);
        ctx.lineTo(w,0);
        ctx.fillStyle = open ? "#234a47" : "#172225";
        if(i === 0) ctx.fill();
        ctx.lineWidth = i === 0 ? 3 : 1;
        ctx.strokeStyle = open ? cold : "#ab9a75";
        ctx.stroke();

    }
    ctx.strokeStyle = open ? "#b0ffe4" : "#98876b";
    for(let i = -2; i <= 2; i++){

        const dx = i * 8;
        ctx.beginPath();
        ctx.moveTo(dx,-8);
        ctx.lineTo(dx,open ? -38 + Math.sin(i + time * 2) * 16 : -72 + Math.abs(dx) * .6);
        ctx.stroke();

    }
    ctx.restore();

}


function warning(ctx, e, time){

    if(e.mode !== "warn")
        return;
    ctx.save();
    const x = e.x + e.w / 2;
    ctx.strokeStyle = danger;
    ctx.fillStyle = "#ff896c22";
    ctx.lineWidth = 2;
    ctx.setLineDash([5,5]);
    if(e.move === "cinders" || e.move === "dive"){

        for(const mark of (e.move === "dive" ? [e.aimX] : e.marks)){

            ctx.fillRect(mark-15, 130, 30, e.floor-130);
            ctx.strokeRect(mark-15, 130, 30, e.floor-130);

        }

    }
    else if(e.move === "charge" || e.move === "lunge"){

        ctx.beginPath();
        ctx.moveTo(x, e.floor-5);
        ctx.lineTo(x + e.face * (e.boss ? 240 : 85), e.floor-5);
        ctx.stroke();

    }
    ctx.setLineDash([]);
    ctx.fillStyle = danger;
    ctx.translate(x, e.y-14);
    ctx.rotate(Math.PI/4);
    const size = 4 + Math.sin(time*19)*1.3;
    ctx.fillRect(-size,-size,size*2,size*2);
    ctx.restore();

}


function swing(ctx, p){

    if(!p.attack)
        return;
    const weapon = WEAPONS[p.weapon];
    const fraction = p.attack / weapon.window;
    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.scale(p.face, 1);
    ctx.globalAlpha = Math.min(1, fraction * 2);
    ctx.strokeStyle = "#fff0c9";
    ctx.lineWidth = p.weapon === "cleaver" ? 5 : 2.5;
    ctx.beginPath();
    if(p.weapon === "pike"){

        ctx.moveTo(14,6);
        ctx.lineTo(weapon.reach,-3);
        ctx.lineTo(weapon.reach - 12,1);

    }
    else{

        ctx.ellipse(0,0,weapon.reach,40,0,-1.2 + (1-fraction)*0.7,1.1 - fraction*0.7);

    }
    ctx.stroke();
    ctx.restore();

}


function caption(ctx, text, x, y){

    ctx.font = "15px Georgia, serif";
    ctx.textAlign = "center";
    const width = ctx.measureText(text).width + 24;
    ctx.fillStyle = "#0e181ce8";
    ctx.fillRect(x-width/2,y-17,width,24);
    ctx.fillStyle = "#f1dfb6";
    ctx.fillText(text,x,y);
    ctx.textAlign = "left";

}


export function createView(canvas, sound){

    const ctx = canvas.getContext("2d");
    const fx = createFx({max:300});
    let camera = 0, chamberKey = "";
    let previous = null, lastPacket = 0;
    let previousEnemies = new Map();
    fx.setShake(matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 0.6);

    function snapshot(oldState, next){

        previous = oldState?.seed === next.seed && oldState?.room === next.room ? oldState : null;
        previousEnemies = new Map(previous?.enemies.map(e => [e.id,e]) || []);
        lastPacket = performance.now();

    }

    function effects(events){

        for(const e of events){

            const {x, y} = e;
            if(Math.abs(x - camera - W/2) > W * 0.65)
                continue;
            if(e.kind === "hit"){

                fx.impact(x, y, e.face === 1 ? 0 : Math.PI, {colour:warm, big:true});
                fx.text(x,y-18,e.amount,{colour:warm,size:13});
                sound.play(v => v.tone({freq:330,to:115,time:.09,gain:.12}),{key:"az-hit",gap:.032});

            }
            if(e.kind === "fall"){

                fx.shatter(x,y,e.boss ? 22 : 11,cold,{big:e.boss});
                fx.shake(e.boss ? 9 : 2);

            }
            if(e.kind === "dash" || e.kind === "jump")
                fx.burst(x,y+16,{shape:"spark",colour:cold,count:e.kind === "dash" ? 12 : 5,speed:130});
            if(e.kind === "hurt" || e.kind === "slam"){

                fx.ring(x,y,e.kind === "slam" ? 81 : 34,{colour:danger});
                fx.shake(e.kind === "slam" ? 6 : 4);
                sound.play(v => v.tone({freq:90,to:33,time:.24,gain:.29}), {key:"az-thud",gap:.08});

            }
            if(e.kind === "swing" || e.kind === "dash")
                sound.play(v => v.noise({type:"bandpass",freq:800,to:2500,time:.105,gain:.35}),{key:"az-swish",gap:.08});

        }

    }

    function draw(s, slot, dt, guest){

        const key = s.seed + "/" + s.room;
        const target = s.players[slot]?.hp ? s.players[slot] : s.players.find(p => p.hp) || s.players[0];
        const desired = clamp(target.x - W * 0.39,0,Math.max(0,s.width-W));
        if(key !== chamberKey){

            camera = desired;
            chamberKey = key;
            fx.clear();

        }
        camera += (desired - camera) * (1 - Math.exp(-dt*12));
        const t = s.time;
        const blend = guest && previous ? clamp((performance.now() - lastPacket)/52,0,1) : 1;
        function pose(body, old){

            if(!old || blend === 1 || Math.abs(old.x - body.x) > 110)
                return body;
            return {...body, x:old.x + (body.x-old.x)*blend, y:old.y + (body.y-old.y)*blend};

        }
        fx.update(dt);
        ctx.save();
        drawBackdrop(ctx,s.region,camera,t,W,H,s.seed);
        const [qx,qy] = fx.offset();
        ctx.translate(-Math.round(camera) + qx,qy);
        for(const floor of s.platforms){

            if(floor.x < camera + W + 20 && floor.x + floor.w > camera - 20)
                drawPlatform(ctx,floor,s.region);

        }
        gate(ctx,s.gate,!s.enemies.length,t);
        fx.drawUnder(ctx);
        for(const e of s.enemies){

            if(e.x + e.w < camera - 85 || e.x > camera + W + 85)
                continue;
            const body = pose(e,previousEnemies.get(e.id));
            drawEnemy(ctx,body,t);
            warning(ctx,body,t);
            if(!e.boss && e.hp < e.maxHp){

                ctx.fillStyle = "#182322";
                ctx.fillRect(body.x,body.y-6,e.w,3);
                ctx.fillStyle = warm;
                ctx.fillRect(body.x,body.y-6,e.w*e.hp/e.maxHp,3);

            }

        }
        for(const p of s.players){

            if(!p.hp)
                continue;
            const body = pose(p,previous?.players[p.slot]);
            ctx.save();
            if(p.hurt > 0 && Math.floor(p.hurt*13)%2)
                ctx.globalAlpha = .55;
            drawHero(ctx,body,t);
            swing(ctx,body);
            ctx.restore();

        }
        for(const shot of s.shots){

            ctx.fillStyle = shot.wave ? "#ecb17c" : "#fa8e74";
            ctx.beginPath();
            ctx.arc(shot.x,shot.y,shot.r,0,Math.PI*2);
            ctx.fill();
            ctx.fillStyle = "#fff2ce";
            ctx.beginPath();
            ctx.arc(shot.x-1,shot.y-1,shot.r*.48,0,Math.PI*2);
            ctx.fill();

        }
        fx.draw(ctx);
        fx.drawText(ctx);
        ctx.restore();
        const boss = s.enemies.find(e => e.boss);
        if(boss){

            caption(ctx,BOSSES[s.region],W/2,H-31);
            ctx.fillStyle = "#302722";
            ctx.fillRect(W/2-130,H-19,260,4);
            ctx.fillStyle = "#e0a383";
            ctx.fillRect(W/2-130,H-19,260*boss.hp/boss.maxHp,4);

        }
        else{

            let note = "";
            if(!s.players[slot]?.hp) note = "Fallen · return when your partner clears the gate";
            else if(!s.enemies.length) note = "The gate is open · travel right";
            else if(target.x > s.width - 190) note = "Gate sealed · " + s.enemies.length + " remaining";
            else if(s.room === 0 && s.time - s.enteredAt < 5) note = "Defeat the undead to open the gate";
            if(note) caption(ctx,note,W/2,H-23);

        }

    }

    return {draw, effects, snapshot};

}
