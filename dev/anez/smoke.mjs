// Run with node dev/anez/smoke.mjs. Exercises the same fixed-step rules as the browser.
import assert from "node:assert/strict";
import {createRun, step, choose} from "../../games/anez/sim.js";
import {chamber, WEAPONS} from "../../games/anez/world.js";


function climbAndDrop(){

    const state = createRun(2);
    const p = state.players[0];
    const ledge = state.platforms.find(floor => floor.kind === "ledge");
    state.enemies = [];
    p.x = ledge.x + 10;
    p.y = state.platforms[0].y - p.h;
    step(state,[{}]);
    step(state,[{jump:true}]);
    assert.ok(p.vy < 0);
    for(let i = 0; i < 65; i++)
        step(state,[{}]);
    assert.equal(p.y + p.h,ledge.y);
    step(state,[{drop:true}]);
    assert.ok(p.y + p.h > ledge.y);
    for(let i = 0; i < 60; i++)
        step(state,[{}]);
    assert.equal(p.y + p.h,state.platforms[0].y);

}


function sharedReliquary(){

    const state = createRun(9,2);
    state.players[1].hp = 0;
    state.enemies = [];
    state.players[0].x = state.gate.x - 10;
    step(state,[{}]);
    assert.equal(state.phase,"reward");
    const [a,b] = state.offers;
    choose(state,0,a[0],0);
    choose(state,0,a[1],0);
    assert.deepEqual(state.choices,[a[0],null]);
    choose(state,1,b[0],-1);
    assert.equal(state.room,0);
    choose(state,1,b[0],0);
    assert.equal(state.room,1);
    assert.ok(state.players[1].hp > 0);
    assert.equal(state.players[0].weapon,a[0]);
    assert.equal(state.players[1].weapon,b[0]);

}


// The autoplayer uses normal movement, attacks and reward choices through all nine chambers.
function fight(seed, count){

    const s = createRun(seed,count);
    const seen = new Set();
    for(let frame = 0; frame < 18000; frame++){

        seen.add(s.room);
        const inputs = s.players.map(p => {

            const cx = p.x + p.w / 2;
            const distance = e => Math.abs(e.x + e.w / 2 - cx);
            const e = s.enemies.reduce((best, candidate) => !best || distance(candidate) < distance(best) ? candidate : best,null);
            const dx = (e ? e.x + e.w / 2 : s.gate.x) - cx;
            const dir = Math.sign(dx);
            const floor = s.platforms.find(f => f.kind === "ground" && cx >= f.x && cx <= f.x+f.w);
            const lip = floor && (dir === 1 ? floor.x+floor.w-cx : cx-floor.x) < 34 && Math.abs(dx) > 45;
            const danger = s.shots.some(b => Math.abs(b.x-cx) < 65 &&
                Math.abs(b.y-p.y-p.h/2) < 50 && (b.x-cx)*b.vx < 0);
            return {
                axis:!e || Math.abs(dx) > WEAPONS[p.weapon].reach * .69 || p.face !== dir ? dir : 0,
                attack:true, drop:e && e.y > p.y + p.h + 12,
                jump:p.grounded && (lip || danger || e && e.y+e.h < p.y-4),
                dash:e && e.mode === "strike" && Math.abs(dx) < 80 && p.grounded && !p.dashCd
            };

        });
        step(s,inputs);
        s.events.length = 0;
        if(s.phase === "won"){

            assert.equal(seen.size,9);
            return;

        }
        assert.notEqual(s.phase,"lost");
        if(s.phase === "reward"){

            for(const p of s.players){

                const keys = s.offers[p.slot];
                const prefer = ["edge",p.hp < 4 ? "heart" : "", "pike"];
                choose(s,p.slot,prefer.find(key => keys.includes(key)) || keys[1],s.room);

            }

        }

    }
    assert.fail("run did not finish");

}


assert.deepEqual(chamber(42,4,2),chamber(42,4,2));
assert.notDeepEqual(chamber(42,4,2).platforms,chamber(43,4,2).platforms);
climbAndDrop();
sharedReliquary();
fight(6,1);
fight(2,2);
console.log("AneZ passed seeded generation, ledges, shared rewards, revival and complete solo/co-op runs.");
