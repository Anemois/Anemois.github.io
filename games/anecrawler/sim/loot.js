import {RARITIES, RARITY, WEAPON, WEAPONS, LEVEL_DAMAGE, FLOORS_PER_WORLD, UPGRADE_BASE, UPGRADE_GROWTH} from "./data.js";


// A weapon item is plain data: {uid, type, level}. Everything else comes
// from its type (data.js) and level, so items are tiny to save or send.

export const rarityOf = item =>
    RARITY[WEAPON[item.type].rarity];


// Stats of one item; lobby weapons are free to fire. Worked out once per
// type and level, then reused (items are often fresh copies of the same
// weapon, e.g. on a guest's machine): treat the result as read-only.
const statsCache = new Map();

export function weaponStats(item, free = false){

    const key = item.type + "|" + item.level;

    let entry = statsCache.get(key);

    if(!entry){

        const def = WEAPON[item.type];
        const paid = {...def, dmg: def.dmg * LEVEL_DAMAGE ** (item.level - 1)};

        entry = {paid, free: {...paid, energy: 0}};

        statsCache.set(key, entry);

    }

    return free ? entry.free : entry.paid;

}


// rough damage per second, for sorting and comparing
export function weaponPower(item){

    const s = weaponStats(item);

    // void orbs tick about three times on a target; sword waves add a hit;
    // a boomerang hits going and coming; about half of a split's pieces and
    // of a pool's time land on someone; sparks jump on for a share
    const hits = (s.count ?? 1) * (s.burst ?? 1) * (s.rain ?? 1) * (s.storm ?? 1) * (s.tick ? 3 : 1) * (s.wave ? 1.6 : 1) *
        (s.returns ? 1.8 : 1) *
        (s.split ? 1 + s.split.count * s.split.dmg * 0.5 : 1) *
        (s.zone ? 1 + s.zone.dps * s.zone.life * 0.5 : 1) *
        (s.zap ? 1 + s.zap * 0.42 : 1) *
        (s.poison ? 1 + s.poison * 0.6 : 1);

    const perSecond =
        s.kind === "beam" ? 1 :
        s.kind === "charge" ? 1 / (1 / s.rate + s.charge) :
        s.spin ? s.rate * 0.85 :
        s.rate;

    return s.dmg * hits * perSecond * (1 + s.crit);

}


/* ---------------- Drops ---------------- */

// rarity weights for a source; deeper floors and bosses shift them up
function rarityWeights(source, floor){

    const depth = Math.min(1, (floor - 1) / 15);
    const weights = {};

    for(const r of RARITIES){

        const tier = RARITY[r.id].tier;

        let weight = r.weight * (1 + depth * tier * 0.6);

        if(source === "boss")
            weight *= tier === 0 ? 0 : 1 + tier * 0.8;

        weights[r.id] = weight;

    }

    return weights;

}


const ofRarity = rarity =>
    WEAPONS.filter(w => w.rarity === rarity);


// what a chest or boss gives (no uid yet: the profile hands those out)
export function rollWeapon(rng, {floor, source}){

    const rarity = rng.weighted(rarityWeights(source, floor));
    const type = rng.pick(ofRarity(rarity)).id;

    const level = Math.max(1, floor + rng.int(-1, 1) + (source === "boss" ? 2 : 0));

    return {type, level};

}


// filler for the case strip: random looking items around the real one
export function caseStrip(winner, length, winIndex, floor, random = Math.random){

    const weights = rarityWeights("chest", floor);
    const total = Object.values(weights).reduce((a, b) => a + b, 0);

    const pickRarity = () => {

        let roll = random() * total;

        for(const [id, w] of Object.entries(weights)){

            roll -= w;

            if(roll < 0)
                return id;

        }

        return "common";

    };

    return Array.from({length}, (_, i) => {

        if(i === winIndex)
            return winner;

        const pool = ofRarity(pickRarity());

        return {type: pool[Math.floor(random() * pool.length)].id, level: winner.level};

    });

}


/* ---------------- Meta ---------------- */

export const upgradeCost = item =>
    Math.ceil(UPGRADE_BASE * UPGRADE_GROWTH ** (item.level - 1) * (1 + rarityOf(item).tier * 0.5));

// salvaging pays the rarity's value plus part of what levels cost
export const salvageValue = item =>
    Math.floor(rarityOf(item).salvage * (1 + (item.level - 1) * 0.35));


export function floorName(floor){

    const world = Math.ceil(floor / FLOORS_PER_WORLD);
    const level = (floor - 1) % FLOORS_PER_WORLD + 1;

    return `${world}-${level}`;

}

export const isBossFloor = floor =>
    floor % FLOORS_PER_WORLD === 0;
