// Each orbit spends only its own orbs. Discoveries count everything earned this run.
export const ORBITS = [
    {id: "white", name: "White", ink: "#dcefff", glow: "#86bbdf", unlock: 0, shell: 1, scale: 1},
    {id: "green", name: "Green", ink: "#b0f6cc", glow: "#53c899", unlock: 2200, shell: 2, scale: 1.35},
    {id: "violet", name: "Violet", ink: "#efd0ff", glow: "#bb87ef", unlock: 12000, shell: 3, scale: 1.65}
];

export const UPGRADES = [
    {id: "drive", name: "Velocity", base: 8, growth: 1.85, max: 8},
    {id: "pierce", name: "Pierce", base: 36, growth: 2.7, max: 4},
    {id: "wing", name: "Wingmate", base: 145, growth: 3.25, max: 2}
];

export const SHELLS = [
    {at: 0, name: "Core", layers: 0, value: 1},
    {at: 28, name: "Halo", layers: 2, value: 5},
    {at: 155, name: "Prism", layers: 4, value: 12}
];

export const STAR_COST = 24000;


export function openOrbit(save, index){

    return index === 0 || save.fields[ORBITS[index - 1].id].earned >= ORBITS[index].unlock;

}


export function cost(orbit, field, upgrade){

    return Math.ceil(upgrade.base * orbit.scale * upgrade.growth ** field[upgrade.id]);

}


export function buy(save, index, upgrade){

    const orbit = ORBITS[index];
    const field = save.fields[orbit.id];
    const price = cost(orbit, field, upgrade);

    if(!openOrbit(save, index) || field[upgrade.id] >= upgrade.max || field.balance < price)
        return false;

    field.balance -= price;
    field[upgrade.id]++;
    return true;

}


export function speedBonus(stars){

    return Math.round(15 * Math.sqrt(stars));

}


export function speed(field, stars){

    return (65 + 17 * field.drive) * (1 + speedBonus(stars) / 100);

}


export function prestigeGain(save){

    return Math.floor(Math.sqrt(save.fields.violet.earned / STAR_COST));

}
