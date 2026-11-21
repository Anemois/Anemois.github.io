import {WEAPON, RARITY} from "../sim/data.js";
import {caseTime} from "../ui/case.js";


// AneCrawler's sounds, all made in code (lib/sound.js). Simulation events
// become sounds here, the way effects.js turns them into pictures: louder
// and more centred the closer they happen to you. Your own beam hums, a
// charging weapon rises, and a spinning gun whirrs.
//
//   const sounds = createSounds(sound);
//   sounds.events(events, state, me);   // each frame, with the frame's events
//   sounds.hands(player, playing);      // each frame: hums and whirrs
//   sounds.ui.tick() / .reveal(tier)    // the chest case

const HEAR = 900;               // past this far nothing is heard
const NEAR = 160;               // closer than this is full volume

// damage kinds that tick many times a second: the tick itself is quiet
const STREAMS = new Set(["beam", "burn", "tick", "poison"]);

const rand = (low, high) => low + Math.random() * (high - low);

// How loud each sound plays, evening them out (filtered noise comes out
// much quieter than a plain tone). Tune here: 1 = as built below.
const LOUDNESS = {
    gun: 4, heavy: 2.3, throw: 18, bow: 4, launch: 3, rocket: 5, zap: 5, ice: 4,
    flame: 5, void: 1.5, buzz: 4, rail: 1, chime: 1.5, storm: 5, swing: 13,
    hit: 5, crit: 3, death: 3, bossDown: 1, boom: 1.6, spark: 5, deflect: 4,
    reflect: 4, glance: 5, thunder: 2, chain: 5, freeze: 3, stagger: 4,
    leech: 5, catch: 4, split: 4, hurt: 3.5, shieldHit: 4, down: 1.5,
    revive: 1.5, dash: 12, swap: 2, empty: 4, energy: 4, shard: 2.5,
    heart: 1.5, crate: 5, crateHit: 4, chest: 5, chestDrop: 2, vent: 5,
    thud: 4, blink: 5, spawn: 4, howl: 5, collapse: 5, alert: 5, roar: 2.5,
    floor: 1.2, sealed: 2, unsealed: 1.5, vote: 2, tick: 5, reveal: 1
};


/* ---------------- The sounds ---------------- */
// Each is (v, o) => {...}: v makes the sound (tone / noise), o is extra
// (size, pitch...). Gains are small: many play at once.

const SOUNDS = {

    // ---- weapons, by family (see voiceOf)
    gun: (v, o) => v
        .noise({type: "highpass", freq: 2400, to: 700, time: 0.06 * o.length, gain: 0.22})
        .tone({type: "square", freq: 240 * o.pitch, to: 80, time: 0.05 * o.length, gain: 0.1, filter: {freq: 1800}}),

    heavy: v => v
        .noise({type: "lowpass", freq: 3000, to: 300, time: 0.2, gain: 0.4})
        .tone({freq: 130, to: 42, time: 0.16, gain: 0.45}),

    throw: v => v
        .noise({type: "bandpass", freq: 700, to: 2600, q: 2, time: 0.12, gain: 0.16}),

    bow: (v, o) => v
        .tone({type: "triangle", freq: 520 * o.pitch, to: 240, time: 0.14, gain: 0.18})
        .noise({type: "bandpass", freq: 3200, q: 3, time: 0.05, gain: 0.08}),

    launch: v => v
        .tone({freq: 190, to: 65, time: 0.2, gain: 0.4})
        .noise({type: "lowpass", freq: 900, time: 0.12, gain: 0.16}),

    rocket: v => v
        .noise({type: "bandpass", freq: 1400, to: 380, q: 1.5, time: 0.32, gain: 0.2})
        .tone({type: "sawtooth", freq: 90, to: 150, time: 0.25, gain: 0.05, filter: {freq: 700}}),

    zap: v => v
        .tone({type: "sawtooth", freq: rand(800, 1100), to: 260, time: 0.1, gain: 0.08, vibrato: {rate: 60, depth: 200}, filter: {freq: 3000}})
        .noise({type: "highpass", freq: 4500, time: 0.05, gain: 0.08}),

    ice: v => v
        .tone({freq: 1900, to: 1400, time: 0.16, gain: 0.11})
        .tone({type: "triangle", freq: 2850, time: 0.08, gain: 0.05})
        .noise({type: "highpass", freq: 6000, time: 0.05, gain: 0.07}),

    flame: v => v
        .noise({type: "lowpass", freq: 1400, to: 700, time: 0.12, gain: 0.12}),

    void: v => v
        .tone({freq: 120, to: 55, time: 0.45, gain: 0.26})
        .tone({freq: 124, to: 57, time: 0.45, gain: 0.2})
        .tone({type: "triangle", freq: 600, to: 150, time: 0.3, gain: 0.04}),

    buzz: v => v
        .tone({type: "sawtooth", freq: 210, time: 0.16, gain: 0.05, vibrato: {rate: 32, depth: 18}, filter: {freq: 1200}})
        .tone({type: "sawtooth", freq: 224, time: 0.16, gain: 0.04, filter: {freq: 1200}}),

    rail: v => v
        .tone({type: "sawtooth", freq: 260, to: 2600, time: 0.07, gain: 0.12, filter: {freq: 4000}})
        .noise({type: "highpass", freq: 1800, to: 500, time: 0.3, gain: 0.3, delay: 0.05})
        .tone({freq: 90, to: 36, time: 0.35, gain: 0.45, delay: 0.05}),

    chime: v => {

        [1320, 1760, 2640].forEach((freq, i) => v.tone({freq, time: 0.35, gain: 0.07, delay: i * 0.035}));

    },

    storm: v => v
        .tone({type: "square", freq: 150, to: 60, time: 0.2, gain: 0.08, filter: {freq: 900}})
        .noise({type: "bandpass", freq: 2200, q: 2, time: 0.12, gain: 0.12}),

    swing: (v, o) => v
        .noise({type: "bandpass", freq: 500 * o.pitch, to: 2400 * o.pitch, q: 1.6, time: 0.13 * o.length, gain: 0.22}),

    // ---- hitting things
    hit: v => v
        .tone({type: "square", freq: rand(240, 300), to: 160, time: 0.035, gain: 0.06, filter: {freq: 1500}})
        .noise({type: "bandpass", freq: 2400, q: 2, time: 0.03, gain: 0.06}),

    crit: v => v
        .tone({freq: 1500, time: 0.09, gain: 0.08})
        .tone({type: "square", freq: 300, to: 150, time: 0.04, gain: 0.06, filter: {freq: 1500}}),

    death: (v, o) => v
        .noise({type: "lowpass", freq: 1000, to: 200, time: 0.16 * o.size, gain: 0.16})
        .tone({freq: 320 / o.size, to: 70, time: 0.14 * o.size, gain: 0.16}),

    bossDown: v => {

        v.noise({type: "lowpass", freq: 1500, to: 80, time: 1.6, gain: 0.6})
            .tone({freq: 70, to: 30, time: 1.4, gain: 0.6});

        [65, 98, 131, 196].forEach((freq, i) => v.tone({type: "triangle", freq, time: 2.6, gain: 0.12, delay: 0.3 + i * 0.05, curve: "lin"}));

    },

    boom: (v, o) => v
        .noise({type: "lowpass", freq: 1800, to: 120, time: 0.25 + o.size * 0.35, gain: 0.45})
        .tone({freq: 100, to: 32, time: 0.2 + o.size * 0.3, gain: 0.55}),

    spark: v => v
        .tone({type: "square", freq: rand(1100, 1500), time: 0.02, gain: 0.025, filter: {freq: 3000}}),

    deflect: v => v
        .tone({type: "square", freq: 1700, time: 0.05, gain: 0.06, filter: {freq: 5000}})
        .tone({type: "triangle", freq: 2550, time: 0.12, gain: 0.07}),

    reflect: v => v
        .tone({type: "triangle", freq: 2200, time: 0.1, gain: 0.08})
        .tone({freq: 500, to: 1500, time: 0.12, gain: 0.08}),

    glance: v => v
        .tone({type: "triangle", freq: 420, to: 300, time: 0.06, gain: 0.07})
        .noise({type: "bandpass", freq: 1300, q: 3, time: 0.05, gain: 0.06}),

    // ---- statuses and specials
    thunder: v => v
        .noise({type: "highpass", freq: 2500, time: 0.07, gain: 0.45})
        .noise({type: "lowpass", freq: 600, to: 90, time: 1, gain: 0.35, delay: 0.03})
        .tone({freq: 60, to: 35, time: 0.6, gain: 0.35, delay: 0.02}),

    chain: v => v
        .tone({type: "sawtooth", freq: rand(700, 1300), to: 400, time: 0.07, gain: 0.05, filter: {freq: 3500}}),

    freeze: v => v
        .noise({type: "highpass", freq: 5000, time: 0.14, gain: 0.12})
        .tone({freq: 2200, to: 1600, time: 0.22, gain: 0.08})
        .tone({type: "triangle", freq: 3300, time: 0.12, gain: 0.04, delay: 0.04}),

    stagger: v => v
        .tone({freq: 620, to: 190, time: 0.13, gain: 0.13}),

    leech: v => v
        .tone({freq: 420, to: 980, time: 0.2, gain: 0.07}),

    catch: v => v
        .tone({type: "triangle", freq: 760, time: 0.04, gain: 0.08}),

    split: v => v
        .noise({type: "highpass", freq: 3000, time: 0.05, gain: 0.12})
        .tone({type: "square", freq: 900, to: 500, time: 0.04, gain: 0.04}),

    // ---- you
    hurt: v => v
        .tone({freq: 230, to: 85, time: 0.2, gain: 0.32})
        .noise({type: "lowpass", freq: 700, time: 0.12, gain: 0.25}),

    shieldHit: v => v
        .tone({type: "triangle", freq: 950, to: 700, time: 0.12, gain: 0.12})
        .noise({type: "highpass", freq: 3500, time: 0.08, gain: 0.1}),

    down: v => {

        [440, 349, 262].forEach((freq, i) => v.tone({type: "triangle", freq, time: 0.28, gain: 0.12, delay: i * 0.18}));

    },

    revive: v => {

        [392, 523, 659, 784].forEach((freq, i) => v.tone({type: "triangle", freq, time: 0.25, gain: 0.1, delay: i * 0.07}));

    },

    dash: v => v
        .noise({type: "bandpass", freq: 380, to: 1700, q: 1.2, time: 0.12, gain: 0.12}),

    swap: v => v
        .tone({type: "square", freq: 520, time: 0.02, gain: 0.04, filter: {freq: 2000}})
        .tone({type: "square", freq: 820, time: 0.025, gain: 0.04, delay: 0.04, filter: {freq: 2000}}),

    empty: v => v
        .tone({type: "square", freq: 190, time: 0.05, gain: 0.05, filter: {freq: 900}}),

    energy: v => v
        .tone({freq: 620, to: 1240, time: 0.08, gain: 0.08}),

    shard: v => v
        .tone({freq: 1600, time: 0.1, gain: 0.06})
        .tone({freq: 2400, time: 0.12, gain: 0.05, delay: 0.04}),

    heart: v => v
        .tone({type: "triangle", freq: 523, time: 0.14, gain: 0.1})
        .tone({type: "triangle", freq: 784, time: 0.2, gain: 0.1, delay: 0.08}),

    // ---- the world
    crate: v => v
        .noise({type: "bandpass", freq: 850, q: 1.4, time: 0.14, gain: 0.26})
        .tone({type: "triangle", freq: 150, to: 80, time: 0.1, gain: 0.14}),

    crateHit: v => v
        .tone({type: "triangle", freq: 180, to: 140, time: 0.05, gain: 0.1})
        .noise({type: "bandpass", freq: 1200, q: 2, time: 0.04, gain: 0.07}),

    chest: v => v
        .tone({type: "sawtooth", freq: 140, to: 230, time: 0.18, gain: 0.04, filter: {freq: 800}})
        .noise({type: "lowpass", freq: 900, time: 0.1, gain: 0.1, delay: 0.12}),

    chestDrop: v => {

        [784, 988, 1175].forEach((freq, i) => v.tone({freq, time: 0.18, gain: 0.07, delay: i * 0.06}));

    },

    vent: v => v
        .noise({type: "lowpass", freq: 900, to: 400, time: 0.4, gain: 0.14}),

    thud: v => v
        .tone({freq: 110, to: 40, time: 0.16, gain: 0.22})
        .noise({type: "lowpass", freq: 500, time: 0.1, gain: 0.12}),

    blink: v => v
        .tone({freq: 1300, to: 300, time: 0.12, gain: 0.05}),

    spawn: v => v
        .tone({freq: 280, to: 620, time: 0.3, gain: 0.04, vibrato: {rate: 9, depth: 20}}),

    howl: v => v
        .tone({type: "sawtooth", freq: 320, to: 520, time: 0.35, gain: 0.04, filter: {freq: 900}, vibrato: {rate: 6, depth: 14}}),

    collapse: v => {

        for(let i = 0; i < 4; i++)
            v.noise({type: "bandpass", freq: rand(1600, 2600), q: 4, time: 0.03, gain: 0.07, delay: i * 0.04});

    },

    alert: v => v
        .tone({freq: 900, to: 1300, time: 0.05, gain: 0.03}),

    roar: (v, o) => v
        .tone({type: "sawtooth", freq: 75 * o.pitch, to: 52 * o.pitch, time: 1, gain: 0.22, filter: {freq: 420}, vibrato: {rate: 7, depth: 6}})
        .noise({type: "lowpass", freq: 320, time: 0.9, gain: 0.2}),

    floor: v => v
        .tone({freq: 55, time: 1.6, attack: 0.5, gain: 0.16, curve: "lin"})
        .tone({freq: 82.5, time: 1.4, attack: 0.6, gain: 0.1, curve: "lin"})
        .tone({type: "triangle", freq: 220, time: 1.2, attack: 0.3, gain: 0.03, curve: "lin"}),

    sealed: v => v
        .tone({type: "square", freq: 160, time: 0.08, gain: 0.06, filter: {freq: 800}})
        .tone({type: "square", freq: 140, time: 0.1, gain: 0.06, delay: 0.1, filter: {freq: 800}}),

    unsealed: v => {

        [880, 1175, 1760].forEach((freq, i) => v.tone({freq, time: 0.4, gain: 0.07, delay: i * 0.08}));

    },

    vote: v => v
        .tone({freq: 880, time: 0.5, gain: 0.08})
        .tone({freq: 1320, time: 0.4, gain: 0.05}),

    // ---- the chest case (interface)
    tick: v => v
        .tone({type: "square", freq: 2300, time: 0.012, gain: 0.035, filter: {freq: 5000}}),

    // what came out of a chest, grander the rarer it is
    reveal: (v, o) => {

        const tier = o.tier;
        const notes = [523, 659, 784, 1047, 1319, 1568];

        if(tier < 2){

            v.tone({type: "triangle", freq: tier ? 784 : 660, time: 0.25, gain: 0.1});

            if(tier)
                v.tone({type: "triangle", freq: 1047, time: 0.3, gain: 0.08, delay: 0.09});

            return;

        }

        // rare and epic: an arpeggio up, epic with a sparkle on top
        notes.slice(0, tier + 1).forEach((freq, i) =>
            v.tone({type: "triangle", freq, time: 0.4, gain: 0.09, delay: i * 0.07}));

        if(tier === 3)
            [2093, 2637, 3136].forEach((freq, i) => v.tone({freq, time: 0.3, gain: 0.03, delay: 0.4 + i * 0.05}));

        if(tier < 4)
            return;

        // gold and better: a brass chord swelling in, a boom, a shimmer
        const chord = tier >= 5 ? [262, 330, 392, 494, 523] : [262, 330, 392, 523];

        v.noise({type: "lowpass", freq: 1200, to: 100, time: 1.2, gain: 0.3, delay: 0.35});
        v.tone({freq: 65, to: 40, time: 1.2, gain: 0.35, delay: 0.35});

        for(const freq of chord){

            v.tone({type: "sawtooth", freq, time: 1.8, attack: 0.08, gain: 0.05, delay: 0.38, filter: {freq: 1800}, vibrato: {rate: 5, depth: 2}, curve: "lin"});
            v.tone({type: "sawtooth", freq: freq * 1.005, time: 1.8, attack: 0.08, gain: 0.04, delay: 0.38, filter: {freq: 1800}, curve: "lin"});

        }

        for(let i = 0; i < (tier >= 5 ? 16 : 10); i++)
            v.tone({freq: 1568 * 2 ** (rand(0, 1.3)), time: 0.2, gain: 0.025, delay: 0.5 + i * 0.07});

    }

};


// which family of sound a weapon makes
function voiceOf(def){

    if(def.kind === "melee")
        return "swing";

    if(def.rail)
        return "rail";

    if(def.rain)
        return "chime";

    if(def.storm)
        return "storm";

    if(def.look === "knife" || def.look === "boomerang" || def.look === "flask")
        return "throw";

    if(def.look === "bolt" || def.kind === "charge")
        return "bow";

    if(def.look === "bee")
        return "buzz";

    if(def.homing && def.explode)
        return "rocket";

    if(def.explode)
        return "launch";

    if(def.zap)
        return "zap";

    if(def.chill || def.slow)
        return "ice";

    if(def.burn)
        return "flame";

    if(def.pull)
        return "void";

    if((def.count ?? 1) >= 4 || def.split)
        return "heavy";

    return "gun";

}


export function createSounds(sound){

    const voices = new Map();       // weapon id -> family, worked out once

    const voice = id => {

        if(!voices.has(id))
            voices.set(id, voiceOf(WEAPON[id]));

        return voices.get(id);

    };

    let listener = null;            // where you hear from (your player)


    // how loud and where: [gain, pan] for a world point
    function place(x, y){

        if(!listener || x === undefined)
            return [1, 0];

        const dx = x - listener.x;
        const d = Math.hypot(dx, y - listener.y);

        if(d > HEAR)
            return [0, 0];

        const gain = d < NEAR ? 1 : 1 - (d - NEAR) / (HEAR - NEAR);

        return [gain * gain, Math.max(-0.8, Math.min(0.8, dx / 450))];

    }


    function at(name, event, {gain = 1, key = name, gap = 0.03, ...o} = {}){

        const [loud, pan] = place(event?.x, event?.y);

        sound.play(v => SOUNDS[name](v, o), {gain: gain * loud * (LOUDNESS[name] ?? 3), pan, key, gap});

    }


    function weapon(event, mine){

        const def = WEAPON[event.weapon];

        if(!def)
            return;

        const family = voice(event.weapon);
        const fast = def.rate > 6;
        const big = def.kind === "melee" && (def.stagger || def.range > 70 || def.dmg > 15);

        at(family, event, {
            key: (mine ? "my-" : "") + family,
            gap: fast ? 0.045 : 0.02,
            gain: (mine ? 1 : 0.7) * (fast ? 0.7 : 1),
            pitch: family === "swing" ? (big ? 0.6 : 1) : Math.min(1.6, 0.7 + def.rate / 12),
            length: family === "swing" ? (big ? 1.5 : 1) : fast ? 0.7 : 1
        });

    }


    // one frame's events; me is your player id
    function events(list, state, me){

        listener = state.players.find(p => p.id === me) ?? listener;

        for(const event of list){

            const mine = event.pid === me;

            switch(event.type){

                case "shot":
                case "swing":
                    weapon(event, mine);
                    break;

                case "rail":
                    at("rail", {x: event.x1, y: event.y1});
                    break;

                case "shock":
                case "thud":
                    at("thud", event, {gain: 1.2});
                    break;

                case "hit":
                    if(STREAMS.has(event.kind))
                        break;
                    at(event.crit ? "crit" : "hit", event, {gap: 0.025, gain: event.pid === me ? 1 : 0.6});
                    break;

                case "death":
                    if(event.boss)
                        break;
                    at("death", event, {gap: 0.04, size: Math.max(0.8, Math.min(1.8, event.r / 12))});
                    break;

                case "bossDown":
                    at("bossDown", null);
                    break;

                case "boom":
                    at("boom", event, {gap: 0.05, size: Math.min(1.5, (event.r ?? 40) / 60)});
                    break;

                case "spark":
                    at("spark", event, {gap: 0.04});
                    break;

                case "deflect":
                case "reflect":
                case "glance":
                case "freeze":
                case "stagger":
                case "catch":
                case "split":
                case "crate":
                case "crateHit":
                case "vent":
                case "blink":
                case "spawn":
                case "howl":
                case "collapse":
                    at(event.type, event);
                    break;

                case "leech":
                    if(mine)
                        at("leech", event);
                    break;

                case "thunder":
                    setTimeout(() => at("thunder", event, {gap: 0.02}), (event.delay ?? 0) * 1000);
                    break;

                case "zap":
                    at("chain", {x: event.points[0][0], y: event.points[0][1]}, {gap: 0.05});
                    break;

                case "hurt":
                    if(mine)
                        at(event.shield ? "shieldHit" : "hurt", null);
                    break;

                case "down":
                    at("down", mine ? null : event);
                    break;

                case "revive":
                    at("revive", event);
                    break;

                case "dash":
                    at("dash", event, {gain: mine ? 1 : 0.5});
                    break;

                case "swap":
                    if(mine)
                        at("swap", null);
                    break;

                case "empty":
                    if(mine)
                        at("empty", null, {gap: 0.25});
                    break;

                case "pickup":
                    if(mine)
                        at(event.kind in SOUNDS ? event.kind : "energy", null, {gap: 0.05});
                    break;

                // the lid now; what came out when the case stops (for you
                // the case plays its own; everyone else hears it here)
                case "loot":
                    at("chest", event);
                    if(!mine)
                        setTimeout(() => at("reveal", event, {tier: RARITY[WEAPON[event.item.type].rarity].tier, gap: 0}), caseTime(event.source) * 1000);
                    break;

                case "chestDrop":
                    at("chestDrop", event);
                    break;

                case "alert":
                    at("alert", event, {gap: 0.12});
                    break;

                case "boss":
                    at("roar", null, {pitch: 1});
                    break;

                case "enrage":
                    at("roar", event, {pitch: 1.4});
                    break;

                case "floor":
                case "runStart":
                    at("floor", null, {gap: 1});
                    break;

                case "sealed":
                    at("sealed", event, {gap: 0.3});
                    break;

                case "unsealed":
                    at("unsealed", event);
                    break;

                case "vote":
                    sound.play(v => SOUNDS.vote(v), {group: "ui", gain: LOUDNESS.vote});
                    break;

            }

        }

    }


    // Your hands each frame: a beam hums, a charge rises, a spinning gun
    // whirrs. playing: false while paused or in a menu (all go quiet).
    let hum = null;
    let charge = null;
    let whirr = null;

    function hands(p, playing){

        const beam = playing && p && !p.dead && p.beam;
        const charging = playing && p && !p.dead && p.charge >= 0;
        const spin = playing && p && !p.dead ? p.spin ?? 0 : 0;

        if(beam && !hum)
            hum = sound.loop(v => {

                v.tone({type: "sawtooth", freq: 110, gain: 0.05, filter: {freq: 900}});
                v.tone({type: "sawtooth", freq: 111.5, gain: 0.05, filter: {freq: 900}});
                v.tone({freq: 220, gain: 0.05});

            });
        else if(!beam && hum){

            hum.stop();
            hum = null;

        }

        if(charging){

            charge ??= sound.loop(v => v.tone({type: "triangle", freq: 300, gain: 0.05}));

            const def = WEAPON[p.weapons[p.slot]?.type];
            const k = def?.charge ? Math.min(1, p.charge / def.charge) : 0;

            charge.set(1 + k * 2);
            charge.level(0.6 + k * 0.6);

        }
        else if(charge){

            charge.stop();
            charge = null;

        }

        if(spin > 0.05){

            whirr ??= sound.loop(v => {

                v.tone({type: "sawtooth", freq: 45, gain: 0.05, filter: {freq: 600}});
                v.tone({type: "square", freq: 90, gain: 0.015, filter: {freq: 500}});

            });

            whirr.set(1 + spin * 1.6);
            whirr.level(spin);

        }
        else if(whirr){

            whirr.stop();
            whirr = null;

        }

    }


    // the chest case's own sounds (interface volume)
    const ui = {
        tick: () => sound.play(v => SOUNDS.tick(v), {group: "ui", key: "tick", gap: 0.02, gain: LOUDNESS.tick}),
        reveal: tier => sound.play(v => SOUNDS.reveal(v, {tier}), {group: "ui", gain: LOUDNESS.reveal})
    };


    return {events, hands, ui, SOUNDS, LOUDNESS};

}
