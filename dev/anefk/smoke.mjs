// Run with node dev/anefk/smoke.mjs. Pacing assumes prompt purchases and no manual dashes.
import assert from "node:assert/strict";
import {ORBITS, UPGRADES, STAR_COST, buy, cost, openOrbit, prestigeGain, speed} from "../../games/anefk/orbits.js";
import {advance, createFlight, dash} from "../../games/anefk/seekers.js";
import {ascend, decodeSave, encodeSave, loadSave, newSave, writeSave} from "../../games/anefk/save.js";
import {spawnOrb} from "../../games/anefk/orbs.js";
import {encodeCode, loadStored, storeSave} from "../../lib/savecode.js";


function random(seed){

    return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

}


function fixture(){

    const save = newSave();
    const field = save.fields.white;
    const flight = createFlight(ORBITS[0], field, random(42));
    return {save, field, flight, lead: flight.seekers[0]};

}


function orb(x, y, hp = 1){

    return {x, y, hp, max: hp, r: 9, flash: 0, value: 1, tier: 0};

}


{

    const {lead, flight, field} = fixture();
    const hard = orb(lead.x + 12, lead.y, 3);
    lead.angle = 0;
    flight.orbs = [hard];
    advance(flight, 0.1);
    assert.equal(hard.hp, 2, "one layer lost per pass");
    assert.equal(field.balance, 0, "only breaks pay out");
    assert.ok(lead.x > hard.x - 8, "seeker flies onward through contact");

    for(let i = 0; i < 600 && !field.earned; i++)
        advance(flight, 1 / 60);

    assert.equal(field.earned, 1, "the seeker returns and breaks the remaining layers");
    flight.orbs = [];
    const x = lead.x;
    advance(flight, 0.25);
    assert.notEqual(lead.x, x, "no target still means continuous flight");

}


{

    const {save, lead, flight, field} = fixture();
    field.earned = field.balance = 1000;
    const originalSpeed = speed(field, 0);
    const price = cost(ORBITS[0], field, UPGRADES[0]);
    assert.ok(buy(save, 0, UPGRADES[0]));
    assert.equal(field.earned - field.balance, price);
    assert.ok(speed(field, 0) > originalSpeed);
    assert.ok(buy(save, 0, UPGRADES[1]));

    flight.orbs = [orb(lead.x + 10, lead.y, 2)];
    advance(flight, 0.05);
    assert.equal(field.earned, 1001, "pierce cuts through two layers");
    assert.ok(buy(save, 0, UPGRADES[2]));
    advance(flight, 1 / 60);
    assert.equal(flight.seekers.length, 2);
    field.drive = UPGRADES[0].max;
    assert.equal(buy(save, 0, UPGRADES[0]), false, "upgrade cap");
    assert.equal(buy(save, 1, UPGRADES[0]), false, "locked field");

    assert.ok(Array.from({length: 100}, () => spawnOrb(flight)).some(o => o.tier === 2 && o.hp === 5), "prisms spawn after discovery");

}


{

    const {lead, flight, field} = fixture();
    flight.orbs = [35, 80, 135].map(offset => orb(lead.x + offset, lead.y, 2));
    assert.ok(dash(flight, lead.x + 200, lead.y));
    assert.equal(dash(flight, 0, 0), false);
    advance(flight, 0.25);
    assert.ok(lead.hits >= 3);
    assert.ok(field.earned >= 6, "a lined-up dash breaks tougher orbs and rewards consecutive hits");
    advance(flight, 4);
    assert.ok(dash(flight, 0, 0), "dash recharges");

}


{

    const a = fixture();
    const b = fixture();

    for(let i = 0; i < 600; i++)
        advance(a.flight, 1 / 60, 0, null, true);

    advance(b.flight, 10);
    assert.equal(a.field.earned, b.field.earned);
    assert.ok(Math.abs(a.lead.x - b.lead.x) < 2, "background and visible motion agree to one step");

}


{

    const {save} = fixture();
    assert.equal(ascend(save), save);
    save.fields.white.earned = ORBITS[1].unlock;
    save.fields.green.earned = ORBITS[2].unlock;
    save.fields.violet.earned = 4 * STAR_COST;
    save.fields.white.drive = 3;
    save.active = "violet";
    assert.ok(openOrbit(save, 1) && openOrbit(save, 2));
    assert.deepEqual(await decodeSave(await encodeSave(save)), save);
    assert.equal(prestigeGain(save), 2);
    const reborn = ascend(save);
    assert.deepEqual(reborn, {...newSave(), stars: 2});
    assert.ok(speed(reborn.fields.white, reborn.stars) > speed(newSave().fields.white, 0));
    const legacy = {version: 4, runBlobs: 5e9, tree: ["root"], gold: 8};
    const converted = await decodeSave(await encodeCode("anefk", legacy));
    assert.equal(converted.stars, 1);
    assert.equal(converted.fields.white.balance, 12);

    const store = new Map();
    globalThis.localStorage = {
        getItem: key => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, value),
        removeItem: key => store.delete(key)
    };
    storeSave("anefk-save", "anefk", legacy);
    assert.deepEqual(loadSave(), converted);
    assert.deepEqual(loadStored("anefk-save-backup-v4", "anefk"), legacy);
    writeSave(converted);
    assert.deepEqual(loadSave(), converted, "legacy credit applied once");

}


for(const seed of [11, 29, 53]){

    const save = newSave();
    const flights = [];
    const times = {};
    const rng = random(seed);

    for(let t = 0; t < 3600; t++){

        for(const [index, orbit] of ORBITS.entries()){

            if(!openOrbit(save, index))
                continue;

            if(!flights[index]){

                flights[index] = createFlight(orbit, save.fields[orbit.id], rng);
                times[orbit.id] = t;

            }

            advance(flights[index], 1);

            for(const upgrade of UPGRADES){

                if(buy(save, index, upgrade))
                    times.firstBuy ??= t;

            }

        }

        if(prestigeGain(save)){

            times.prestige = t;
            break;

        }

    }

    assert.ok(times.firstBuy >= 3 && times.firstBuy < 40);
    assert.ok(times.green > 180 && times.violet > times.green + 240);
    assert.ok(times.prestige > times.violet + 300 && times.prestige < 2400);
    console.log("Seed", seed, "milestones in seconds", times);

}

console.log("AneFK flight, upgrades, discoveries, prestige, saves and pacing passed.");
