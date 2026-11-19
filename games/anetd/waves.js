import {BOSS_EVERY, ENEMIES} from "./data.js";


// Thickest balloon a wave can send: 1 layer at the start, 6 from wave 19.
export const topLayers = wave =>
    Math.min(6, 1 + Math.floor((wave + 1) / 4));


// Builds the spawn list for a wave: [{t, kind, layers}] sorted by time, plus
// `layers`, the number of layer pops the whole wave is worth (clear bonus),
// and `theme` ("boss", "rush", "armored" or "") for the overlay.
// Seeded by the wave number, so a restarted wave plays out exactly the same.
export function buildWave(wave){

    const random = seeded(wave * 7919 + 13);

    const boss = wave % BOSS_EVERY === 0;
    const top = topLayers(wave);
    const low = Math.max(1, top - 2);

    // themed waves now and then: a rush of swift ones, an armored column
    const rush = !boss && wave % 7 === 0;
    const column = !boss && !rush && wave % 9 === 0 && wave >= 12;

    let count = Math.min(10 + Math.floor(wave * 0.5), 60);

    if(boss)
        count = Math.ceil(count * 0.6);

    if(rush)
        count = Math.ceil(count * 1.3);

    const gap = Math.max(0.3, 0.85 - wave * 0.006) * (rush ? 0.6 : 1);
    const clump = wave >= 4 ? 0.22 : 0;

    const spawns = [];

    let t = 0;
    let layers = 0;

    for(let i = 0; i < count; i++){

        const kind = pickKind(wave, random(), rush, column);

        let n = low + Math.floor(random() * (top - low + 1));

        if(kind === "swift")
            n = Math.min(n, 3);

        spawns.push({t, kind, layers: n});

        layers += n;

        // clumps: a few arrive almost together (good cannon targets)
        t += random() < clump ? gap * 0.2 : gap;

    }

    if(boss){

        spawns.push({t: t + gap * 3, kind: "boss", layers: 1});

        layers += ENEMIES.boss.gold + ENEMIES.boss.children * top;

    }

    const theme = boss ? "boss" : rush ? "rush" : column ? "armored" : "";

    return {spawns, layers, boss, theme};

}


function pickKind(wave, roll, rush, column){

    if(wave < 6)
        return "pop";

    const swift = rush ? 0.6 : Math.min(0.22, 0.06 + (wave - 6) * 0.004);

    const armored = wave < 12
        ? 0
        : column ? 0.5 : Math.min(0.22, 0.05 + (wave - 12) * 0.004);

    const regen = wave < 20
        ? 0
        : Math.min(0.18, 0.04 + (wave - 20) * 0.003);

    if(roll < swift)
        return "swift";

    if(roll < swift + armored)
        return "armored";

    if(roll < swift + armored + regen)
        return "regen";

    return "pop";

}


// small deterministic PRNG (mulberry32)
function seeded(seed){

    return () => {

        seed = (seed + 0x6d2b79f5) | 0;

        let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);

        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;

        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;

    };

}
