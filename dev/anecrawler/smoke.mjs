// AneCrawler's checks without a browser (about half a minute in all):
//
//   node dev/anecrawler/smoke.mjs                  everything
//   node dev/anecrawler/smoke.mjs rules net        only some parts
//
//   floors   a bot fights through every floor; nothing may throw
//   bosses   every boss uses all four of its attacks; nothing may throw
//   rules    game rules that broke before or are easy to break:
//            cooldowns survive swapping, arrows go through swings, reviving
//            needs E, sealed portals
//   weapons  every weapon fires without errors; each special one does its
//            thing (thrown, returning, splitting, spinning, sparks, ice,
//            poison, stagger, leech, mirror, storm)
//   net      a host and a guest over a laggy fake network: joining,
//            starting a run, moving, instant shots, staying in step
//
// Add a check here whenever a bug is fixed, so it stays fixed.

import {game, link, checks, openWay, STEP} from "./kit.mjs";
import {enemyBullet} from "../../games/anecrawler/sim/world.js";
import {PLAYER, WORLDS, BOSS, WEAPONS} from "../../games/anecrawler/sim/data.js";
import {castRay} from "../../games/anecrawler/sim/physics.js";
import {encode} from "../../games/anecrawler/net/protocol.js";

const parts = process.argv.slice(2);
const want = name => !parts.length || parts.includes(name);
const c = checks();
const t0 = performance.now();


/* ---------------- floors ---------------- */

if(want("floors")){

    for(let floor = 1; floor <= 12; floor++){

        const g = game({floor, seed: 1000 + floor * 37, loadout: [{uid: 1, type: "smg", level: 25}, {uid: 2, type: "sword", level: 25}]});
        const p = g.p;
        const stops = [...g.state.map.camps, ...(g.state.map.arena ? [g.state.map.arena] : [])];
        const kinds = new Set();
        let errors = 0;
        let first = "";

        for(let i = 0; i < 60 * 25; i++){

            p.dead = false;
            p.hp = Math.max(p.hp, 3);

            if(i % 300 === 0){

                const stop = stops[(i / 300) % stops.length];

                p.x = stop.x;
                p.y = stop.y;

            }

            let best = null;
            let bestD = 400;

            for(const e of g.state.enemies){

                if(e.dead || e.hidden || e.spawn > 0)
                    continue;

                kinds.add(e.type);

                const d = Math.hypot(e.x - p.x, e.y - p.y);

                if(d < bestD){

                    best = e;
                    bestD = d;

                }

            }

            try {

                g.step(1, {p1: {aimX: best ? best.x : p.x + 1, aimY: best ? best.y : p.y, fire: Boolean(best), moveX: Math.sin(i / 40), moveY: Math.cos(i / 53)}});

            }
            catch(error){

                errors++;
                first ||= error.stack.split("\n").slice(0, 3).join(" | ");

            }

            g.take();

        }

        c.ok(`floor ${floor} (${WORLDS[Math.floor((floor - 1) / 3) % WORLDS.length].name}) plays without errors`, errors === 0, errors ? first : [...kinds].join(" "));

    }

}


/* ---------------- bosses ---------------- */

if(want("bosses")){

    const homes = {warden: 3, lich: 3, queen: 6, eclipse: 9, forgeheart: 12};

    for(const [id, floor] of Object.entries(homes)){

        const g = game({floor, seed: 77 + floor, alive: true});
        const b = g.makeBoss(id);
        const p = g.p;
        const used = new Set();
        let errors = 0;
        let first = "";

        p.x = g.state.map.arena.x + 120;
        p.y = g.state.map.arena.y;

        for(let i = 0; i < 60 * 60; i++){

            if(i === 60 * 30)
                b.hp = b.maxHp * 0.4;           // angry for the second half

            p.hurt = 0;

            try {

                g.step(1, {p1: {aimX: b.x, aimY: b.y, moveX: Math.sin(i / 50), moveY: Math.cos(i / 70)}});

            }
            catch(error){

                errors++;
                first ||= error.stack.split("\n").slice(0, 3).join(" | ");

            }

            if(b.pattern)
                used.add(b.pattern.name);

            g.take();

        }

        const all = BOSS[id].patterns;

        c.ok(`${BOSS[id].name} uses all its attacks without errors`, errors === 0 && all.every(name => used.has(name)), errors ? first : `used ${[...used].join(", ")}`);

    }

}


/* ---------------- rules ---------------- */

if(want("rules")){

    // swapping never skips a cooldown; the put-away weapon keeps cooling
    {

        const g = game({floor: 1, quiet: true, loadout: [{uid: 1, type: "shotgun", level: 1}, {uid: 2, type: "pistol", level: 1}]});
        const p = g.p;

        g.step(1, {p1: {fire: true}});
        g.step(1);
        g.step(1, {p1: {swap: true}});
        g.step(1);
        g.step(1, {p1: {swap: true}});
        g.take();
        g.step(2, {p1: {fire: true}});

        c.ok("swapping away and back does not reload a gun", g.count("shot") === 0 && p.slot === 0, `reload left ${p.reload.toFixed(2)} s`);

        g.step(60);
        g.take();
        g.step(1, {p1: {fire: true}});
        g.step(1, {p1: {swap: true}});
        g.step(Math.ceil(0.75 / STEP));
        g.step(1, {p1: {swap: true}});
        g.take();
        g.step(1, {p1: {fire: true}});

        c.ok("a put-away gun keeps cooling down", g.count("shot") > 0);

    }

    // arrows fly through a sword swing, orbs do not
    {

        const g = game({floor: 2, quiet: true, loadout: [{uid: 1, type: "sword", level: 1}]});
        const p = g.p;

        enemyBullet(g.state, {x: p.x + 60, y: p.y, r: 0}, Math.PI, 60, {arrow: true, r: 3});
        enemyBullet(g.state, {x: p.x + 60, y: p.y + 6, r: 0}, Math.PI, 60, {r: 5});

        const [arrow, orb] = g.state.bullets.slice(-2);

        g.step(20, i => {

            p.hurt = 1;

            return {p1: {aimX: p.x + 100, aimY: p.y, fire: i % 2 === 0}};

        });

        c.ok("a sword swing knocks an orb away", orb.dead && g.count("deflect") >= 1);
        c.ok("an arrow flies on through a swing", arrow.kind === "arrow" && !arrow.dead && g.count("glance") === 1);

    }

    // reviving a friend needs E held, standing close
    {

        const g = game({floor: 2, players: 2, quiet: true});
        const [a, b] = g.players;

        b.dead = true;
        b.hp = 0;

        const by = () => { a.x = b.x + 20; a.y = b.y; };

        by();
        g.step(60 * 3, () => (by(), {}));

        c.ok("standing over a fallen friend does not revive them", b.dead);

        g.step(Math.ceil((PLAYER.reviveTime + 0.2) / STEP), () => (by(), {p1: {interact: true}}));

        c.ok("holding E next to them does", !b.dead);

    }

    // a portal is sealed while an enemy in its sight is near
    {

        const g = game({floor: 2, players: 1, quiet: true});
        const portal = g.state.props.find(prop => prop.kind === "portal");

        g.step(12);

        c.ok("a portal with no enemies near is open", portal && !portal.locked);

        const at = g.spot(portal);
        const seen = g.spawn("wolf", at.x, at.y, {asleep: true});

        g.step(12);

        c.ok("an enemy in sight of it seals it", portal.locked === 1);

        g.p.x = portal.x;
        g.p.y = portal.y + 10;
        g.take();
        g.step(1, {p1: {interact: true}});

        c.ok("pressing E on a sealed portal goes nowhere", g.state.floor === 2 && g.count("sealed") === 1);

        g.kill(seen);
        g.take();
        g.step(12);

        c.ok("killing it opens the portal again", !portal.locked && g.count("unsealed") === 1);

        const hidden = g.spot(portal, {sight: false});

        if(hidden){

            g.spawn("wolf", hidden.x, hidden.y, {asleep: true});
            g.step(12);

            c.ok("an enemy behind rock does not seal it", !portal.locked);

        }

    }

}


/* ---------------- weapons ---------------- */

if(want("weapons")){

    const holding = type => [{uid: 1, type, level: 1}];

    // a quiet room, the player aiming down its longest open line, and a
    // turret (it never walks) `d` px along it
    const range = (type, d = 150, extra = {}) => {

        const g = game({floor: 5, quiet: true, alive: true, loadout: holding(type), ...extra});
        const p = g.p;
        const [dx, dy] = g.openWay(p);
        const at = (k, side = 0) => ({x: p.x + dx * k - dy * side, y: p.y + dy * k + dx * side});
        const target = d ? g.spawn("turret", at(d).x, at(d).y) : null;

        if(target)
            target.hp = target.maxHp = 1e6;        // it lasts the whole check

        p.energy = p.maxEnergy = 999;

        const aim = (k = d || 150) => ({aimX: Math.round(at(k).x), aimY: Math.round(at(k).y)});
        const hitsOn = e => g.log.filter(ev => ev.type === "hit" && ev.id === e.id);

        return {g, p, at, target, aim, hitsOn};

    };

    // every weapon, fired at a crowd for a while
    {

        let broken = [];

        for(const w of WEAPONS){

            const {g, p, aim} = range(w.id, 0);

            for(let i = 0; i < 6; i++)
                g.spawn("wolf", p.x + Math.cos(i) * 140, p.y + Math.sin(i) * 140);

            try {

                g.step(60 * 4, i => ({p1: {...aim(160), fire: i % 70 < 55}}));

            }
            catch(error){

                broken.push(`${w.id}: ${error.message}`);

            }

        }

        c.ok(`all ${WEAPONS.length} weapons fire without errors`, !broken.length, broken.slice(0, 3).join(" | "));

    }

    // thrown in an arc: over the enemy in the way, landing at the cursor in acid
    {

        const {g, p, at, aim, hitsOn} = range("flask", 0);
        const inWay = g.spawn("turret", at(70).x, at(70).y);
        const below = g.spawn("turret", at(200).x, at(200).y);

        g.step(1, {p1: {...aim(200), fire: true}});
        g.step(60 * 2, {p1: aim(200)});

        c.ok("a lobbed flask flies over enemies in the way", hitsOn(inWay).length === 0);
        c.ok("...and lands where aimed, leaving acid that keeps hurting", hitsOn(below).some(h => h.kind === "boom") && hitsOn(below).filter(h => h.kind === "poison").length >= 3,
            `${hitsOn(below).map(h => h.kind).join(",")}`);

    }

    // out and back, hitting on both legs
    {

        const {g, target, aim, hitsOn} = range("boomerang", 120);

        g.step(1, {p1: {...aim(), fire: true}});
        g.step(60 * 3, {p1: aim()});

        c.ok("a boomerang hits going out and coming back, then is caught", hitsOn(target).length === 2 && g.count("catch") === 1, `${hitsOn(target).length} hits, caught ${g.count("catch")}`);

    }

    // breaks into pieces where it hits
    {

        const {g, aim} = range("splinter", 150);
        let pieces = 0;

        g.step(1, {p1: {...aim(), fire: true}});
        g.step(40, () => (pieces = Math.max(pieces, g.state.bullets.filter(b => b.kind === "shard").length), {p1: aim()}));

        c.ok("a splinter slug breaks into 6 pieces", g.count("split") === 1 && pieces === 6, `${pieces} pieces`);

    }

    // spins up
    {

        const {g, aim} = range("minigun", 0);

        g.step(30, {p1: {...aim(), fire: true}});

        const early = g.count("shot");

        g.take();
        g.step(60 * 1.5, {p1: {...aim(), fire: true}});
        g.take();
        g.step(30, {p1: {...aim(), fire: true}});

        const late = g.count("shot");

        c.ok("a rotary gun fires faster the longer it is held", late > early * 1.8, `${early} -> ${late} shots per half second`);

    }

    // sparks jump to the next enemy
    {

        const {g, at, target, aim, hitsOn} = range("arcpistol", 150);
        const next = g.spawn("turret", at(150, 60).x, at(150, 60).y);

        g.step(1, {p1: {...aim(), fire: true}});
        g.step(40, {p1: aim()});

        c.ok("an arc pistol's spark jumps to the enemy beside", g.count("zap") >= 1 && hitsOn(next).some(h => h.kind === "shock") && hitsOn(target).length >= 1);

    }

    // cold builds up and freezes
    {

        const {g, target, aim} = range("glacier", 140);

        g.step(60 * 2, {p1: {...aim(), fire: true}});

        c.ok("glacier shots freeze an enemy solid", g.count("freeze") >= 1);

    }

    // poison stacks and ticks
    {

        const {g, target, aim, hitsOn} = range("hive", 140);

        g.step(60 * 2, {p1: {...aim(), fire: true}});
        g.step(60);

        c.ok("hive bees poison, and the poison stacks", hitsOn(target).filter(h => h.kind === "poison").length >= 3 && target.poisonStacks >= 2, `stacks ${target.poisonStacks}`);

    }

    // a heavy blow staggers; a reaper's swing feeds energy back
    {

        const {g, p, at, aim} = range("club", 0);
        const wolf = g.spawn("wolf", at(40).x, at(40).y);

        g.step(1, {p1: {...aim(40), fire: true}});

        c.ok("a club blow leaves an enemy reeling", wolf.staggerT > 0 && g.count("stagger") === 1);

        const r = range("scythe", 0);
        const wolves = [0, 1, 2].map(i => r.g.spawn("wolf", r.at(40, (i - 1) * 25).x, r.at(40, (i - 1) * 25).y));

        r.p.energy = 10;
        r.g.step(1, {p1: {...r.aim(40), fire: true}});

        c.ok("a scythe swing gives energy back per enemy cut", r.p.energy > 10 + 1.5 * 2 && wolves.every(w => r.hitsOn(w).length), `energy ${r.p.energy.toFixed(1)}`);

    }

    // a mirror blade sends orbs back as its wielder's shots
    {

        const {g, p, at, target, aim, hitsOn} = range("mirror", 160);

        enemyBullet(g.state, {x: at(60).x, y: at(60).y, r: 0}, Math.atan2(p.y - at(60).y, p.x - at(60).x), 90, {r: 5});

        const orb = g.state.bullets[g.state.bullets.length - 1];

        g.step(60, i => ({p1: {...aim(), fire: i % 6 === 0}}));

        c.ok("a mirror blade sends an orb back as its own shot", orb.reflected && orb.team === "p" && g.count("reflect") === 1);

    }

    // lightning on the enemies by the cursor
    {

        const {g, target, aim, hitsOn} = range("storm", 160);

        g.step(50, {p1: {...aim(), fire: true}});
        g.step(2, {p1: aim()});

        c.ok("Storm Caller brings lightning down on the enemy by the cursor", g.count("thunder") >= 3 && hitsOn(target).some(h => h.kind === "shock"));

    }

}


/* ---------------- net ---------------- */

if(want("net")){

    const l = link({delay: 80, jitter: 30, guest: [{uid: 1, type: "pistol", level: 1}, {uid: 2, type: "sword", level: 1}]});

    c.ok("a guest joins and both start a run", l.start(2), `host ${l.host.state.mode}, guest ${l.guest.state?.mode}`);

    const from = {x: l.mineOnHost.x, y: l.mineOnHost.y};
    const [dx, dy] = openWay(l.host.state.map, from);

    l.frames(60, {moveX: dx, moveY: dy});
    l.frames(30);

    const walked = Math.hypot(l.mineOnHost.x - from.x, l.mineOnHost.y - from.y);

    c.ok("the guest walks and the host sees it", walked > 100, `moved ${walked.toFixed(0)} on the host`);
    c.ok("...and both agree where the guest stands", Math.hypot(l.mine.x - l.mineOnHost.x, l.mine.y - l.mineOnHost.y) < 2);

    // a shot shows on the guest's own screen the same frame
    const aim = {aimX: l.mine.x + 200, aimY: l.mine.y, fire: true};
    const ownShots = () => l.guest.state.bullets.filter(b => String(b.id).startsWith("f")).length;

    l.frame(aim);

    const drawnAtOnce = ownShots();

    l.frames(20, aim);
    l.frames(20);

    const onHost = l.host.state.bullets.length + l.host.state.players.find(p => p.id === l.guest.me).shots;

    c.ok("the guest's shot shows the frame the trigger is pulled", drawnAtOnce > 0);
    c.ok("...and the host fires it too", onHost > 0);

    // swapping on the guest: same frame on its screen, the host agrees
    const slot = l.mine.slot;

    l.frame({swap: true});

    const swappedHere = l.mine.slot !== slot;

    l.frames(30);

    c.ok("Q swaps at once on the guest's screen and the host agrees", swappedHere && l.mineOnHost.slot !== slot);

    // trimmed snapshots: a guest rebuilds exactly what a whole one says
    {

        const busy = link({delay: 50, jitter: 20, host: [{uid: 1, type: "mortar", level: 20}], guest: [{uid: 1, type: "flask", level: 20}]});

        busy.start(11);

        const whole = new Map();            // snapshot step -> what a whole snapshot would have said
        const send = busy.wire.a.send;
        let bytes = 0;

        busy.wire.a.send = m => {

            if(m.t0 === "s"){

                const full = encode(busy.host.state, busy.guest.me);

                whole.set(m.k, {
                    enemies: full.E.map(row => `${row[0]}:${row[5]}`).sort().join(),
                    names: full.P.map(p => p.name + p.weapons.length).join(),
                    zones: full.Z.length
                });

                bytes += JSON.stringify(m).length;

            }

            send(m);

        };

        const camp = busy.host.state.map.camps[0];
        let checked = 0;
        let wrong = 0;
        let detail = "";
        let flying = 0;
        let strayed = 0;

        for(let i = 0; i < 60 * 8; i++){

            for(const p of busy.host.state.players){

                p.hp = p.maxHp;
                p.dead = false;
                p.energy = 999;

                if(i === 0){

                    p.x = camp.x - 120;
                    p.y = camp.y;

                }

            }

            const target = busy.host.state.enemies.find(e => !e.dead);
            const aim = target ? {aimX: Math.round(target.x), aimY: Math.round(target.y)} : {};

            // homing orbs turn all the time: they must be sent again as they do
            if(target && i % 45 === 0)
                for(let k = 0; k < 3; k++)
                    enemyBullet(busy.host.state, target, k * 2, 120, {homing: 1.5, life: 4});

            busy.frame({...aim, fire: i % 40 < 3}, {...aim, fire: i % 50 < 3});

            const g = busy.guest.state;

            // the guest's picture must be one the host really sent whole
            const enemies = g.enemies.map(e => `${e.id}:${Math.round(e.hp / e.maxHp * 1000)}`).sort().join();
            const names = g.players.map(p => p.name + p.weapons.length).join();
            const match = [...whole.values()].some(w => w.enemies === enemies && w.names === names);

            // bullets sent once keep flying on the guest where the host has them
            // (a few steps behind: the guest shows the world a moment late)
            if(i > 120 && i % 15 === 0){

                for(const b of g.bullets){

                    const real = busy.host.state.bullets.find(h => h.id === b.id);

                    if(!real || String(b.id).startsWith("f"))
                        continue;

                    flying++;

                    if(Math.hypot(real.x - b.x, real.y - b.y) > Math.hypot(real.vx, real.vy) * 0.25 + 12)
                        strayed++;

                }

            }

            if(i > 120 && i % 10 === 0){

                checked++;

                if(!match){

                    wrong++;
                    detail ||= `frame ${i}: guest has ${g.enemies.length} enemies`;

                }

            }

        }

        c.ok("a guest rebuilds whole snapshots from trimmed ones", checked > 20 && wrong === 0, detail || `${checked} checks`);
        c.ok("...bullets sent once keep flying where the host's are", flying > 20 && strayed === 0, `${flying} checked, ${strayed} astray`);
        c.ok("...and burning ground still burns down on the guest", busy.guest.state.zones.every(z => z.life > 0 && z.life <= z.max));
        c.ok("...for less than 60 KB/s in a Furnace fight", bytes / 8 / 1024 < 60, `${(bytes / 8 / 1024).toFixed(1)} KB/s`);

    }

    // the new thrown shots: the guest's own copy flies the host's path
    const thrown = link({delay: 80, jitter: 30, guest: [{uid: 1, type: "flask", level: 1}, {uid: 2, type: "boomerang", level: 1}]});

    thrown.start(2);

    for(const e of thrown.host.state.enemies)
        e.asleep = true;

    const track = (list, pick) => {

        const seen = new Map();

        return {
            look(){ for(const b of list()) if(pick(b)) seen.set(b.id, {x: b.x, y: b.y, gone: false}); },
            ends(){ const now = new Set(list().map(b => b.id)); return [...seen].filter(([id]) => !now.has(id)).map(([, at]) => at); }
        };

    };

    const way = openWay(thrown.host.state.map, thrown.mineOnHost);
    const aimAt = k => ({aimX: Math.round(thrown.mine.x + way[0] * k), aimY: Math.round(thrown.mine.y + way[1] * k)});
    const flyer = track(() => thrown.guest.state.bullets, b => String(b.id).startsWith("f"));
    const real = track(() => thrown.host.state.bullets, b => b.pid === thrown.guest.me);

    thrown.frame({...aimAt(200), fire: true});

    for(let i = 0; i < 120; i++){

        thrown.frame(aimAt(200));
        flyer.look();
        real.look();

    }

    const [landedHere] = flyer.ends();
    const [landedThere] = real.ends();

    c.ok("a guest's lobbed flask lands where the host's does", landedHere && landedThere && Math.hypot(landedHere.x - landedThere.x, landedHere.y - landedThere.y) < 16,
        landedHere && landedThere ? `${Math.hypot(landedHere.x - landedThere.x, landedHere.y - landedThere.y).toFixed(1)} px apart` : "not seen");

    thrown.frame({swap: true});
    thrown.frames(30);

    const boomerangs = track(() => thrown.guest.state.bullets, b => String(b.id).startsWith("f"));
    const hostBoomerangs = track(() => thrown.host.state.bullets, b => b.pid === thrown.guest.me);

    thrown.frame({...aimAt(150), fire: true});

    for(let i = 0; i < 180; i++){

        thrown.frame(aimAt(150));
        boomerangs.look();
        hostBoomerangs.look();

    }

    const near = (at, p) => at && Math.hypot(at.x - p.x, at.y - p.y) < 40;

    c.ok("a guest's boomerang comes back to them on both screens", near(boomerangs.ends()[0], thrown.mine) && near(hostBoomerangs.ends()[0], thrown.mineOnHost));

}


console.log(`(${((performance.now() - t0) / 1000).toFixed(1)} s)`);
c.done();
