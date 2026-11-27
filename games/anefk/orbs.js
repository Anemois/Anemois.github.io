import {SHELLS} from "./orbits.js";


export const WIDTH = 640;
export const HEIGHT = 352;


export function spawnOrb(flight){

    const {random, field, orbit} = flight;
    const roll = random();
    const tier = field.earned >= SHELLS[2].at && roll < 0.19 ? 2
        : field.earned >= SHELLS[1].at && roll < 0.55 ? 1 : 0;
    const shell = SHELLS[tier];
    const hp = orbit.shell + shell.layers;

    // Give every shell its own silhouette, even in a crowded field.
    let x, y;

    for(let attempt = 0; attempt < 16; attempt++){

        x = 31 + random() * (WIDTH - 62);
        y = 28 + random() * (HEIGHT - 56);

        if(flight.orbs.every(orb => Math.hypot(x - orb.x, y - orb.y) > 36))
            break;

    }

    return {x, y, hp, max: hp, tier, value: shell.value * orbit.shell, r: 8 + tier * 2, flash: 0};

}
