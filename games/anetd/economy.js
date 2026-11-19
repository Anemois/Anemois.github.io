import {
    HP_GROWTH,
    BOUNTY_GROWTH,
    CLEAR_BONUS,
    LIVES,
    TOWERS,
    EFFECT_MODES,
    LEVEL_BASE,
    LEVEL_GROWTH,
    LEVEL_POWER,
    MILESTONE,
    TIER_LEVELS,
    TIER_COSTS,
    MAX_TIER,
    MINOR_TIER,
    PLACE_BASE,
    PLACE_GROWTH,
    SELL_REFUND,
    TROOP_DMG,
    TROOP_HP,
    TROOP_INTERVAL,
    TROOP_RESPAWN,
    TROOP_CAP,
    BOUNTY_STEP,
    OVERCLOCK_STEP,
    WALL_LIVES,
    ASCEND_MIN,
    STAR_OFFSET,
    STAR_DIVISOR,
    STAR_POWER,
    STAR_DAMAGE
} from "./data.js";


// All functions are pure: (save, mods) in, value out.
// `mods` is the folded constellation (see sky.js computeModifiers).


/* ---------------- Scaling ---------------- */

export const hpAt = wave => HP_GROWTH ** (wave - 1);

const bountyAt = wave => BOUNTY_GROWTH ** (wave - 1);

// The shared damage curve of towers and guards: grows with every level and
// doubles at every milestone. power(1) = 1.
export const power = level =>
    level * LEVEL_POWER ** (level - 1) * 2 ** Math.floor(level / MILESTONE);

const starMultiplier = save =>
    1 + STAR_DAMAGE * save.starsEarned;

const goldMultiplier = (save, mods) =>
    BOUNTY_STEP ** save.upgrades.bounty * mods.gold;


/* ---------------- Stats ---------------- */

// Combat stats of one placed tower ({type, paths}): the type's base stats,
// scaled by the shared type level, then every bought path tier applied.
export function towerStats(tower, save, mods){

    const def = TOWERS[tower.type];
    const level = save.levels[tower.type];

    const stats = {
        dmg: def.dmg,
        rate: def.rate,
        range: def.range,
        targets: 1,
        splash: def.splash ?? 0,
        slow: def.slow ?? 0,
        slowTime: def.slowTime ?? 1,
        brittle: 0,
        stun: 0,
        burn: 0,
        chain: def.chain ?? 0,
        falloff: def.falloff ?? 0,
        pierce: 0,
        boss: 1,
        gold: 1,
        heavy: Boolean(def.heavy)
    };

    def.paths.forEach((path, p) => {

        for(const tier of path.tiers.slice(0, tower.paths[p])){

            for(const [key, value] of Object.entries(tier.effects)){

                const mode = EFFECT_MODES[key];

                if(mode === "mul")
                    stats[key] *= value;
                else if(mode === "add")
                    stats[key] += value;
                else
                    stats[key] = value;

            }

        }

    });

    stats.dmg *=
        power(level) *
        mods.dmg *
        mods[`${tower.type}Dmg`] *
        starMultiplier(save);

    stats.rate *= (1 + OVERCLOCK_STEP * save.upgrades.overclock) * mods.rate;
    stats.range *= mods.range;

    if(tower.type === "frost")
        stats.slow += mods.slow;

    stats.slow = Math.min(0.8, stats.slow);

    return stats;

}


export function troopStats(save, mods){

    const {recruits, weapons, armor, drills} = save.troops;

    return {
        count: Math.min(TROOP_CAP, recruits + (recruits > 0 ? mods.troops : 0)),
        dmg: TROOP_DMG * power(weapons) * mods.troopDmg * starMultiplier(save),
        hp: TROOP_HP * power(armor) * mods.troopHp * starMultiplier(save),
        interval: TROOP_INTERVAL,
        respawn: TROOP_RESPAWN * 0.9 ** drills
    };

}


// Everything the battle reads every step, folded once per change.
// towers: tower id -> stats
export function battleStats(save, mods){

    const towers = new Map(
        save.towers.map(tower => [tower.id, towerStats(tower, save, mods)])
    );

    return {
        towers,
        troops: troopStats(save, mods),
        lives: LIVES + WALL_LIVES * save.upgrades.walls + mods.lives,
        boss: mods.boss
    };

}


// gold for one popped layer on a wave
export const popGold = (save, mods, wave) =>
    bountyAt(wave) * goldMultiplier(save, mods);

export const clearGold = (save, mods, wave, layers) =>
    popGold(save, mods, wave) * layers * CLEAR_BONUS * mods.clear;


/* ---------------- Costs ---------------- */

// Total price of `count` consecutive levels, starting at a price of `first`
// and growing by `growth` per level (geometric series, rounded once).
function bulkCost(first, growth, count){

    return Math.ceil(
        first * (growth ** count - 1) / (growth - 1)
    );

}


// price of the next `count` levels of a tower type (shared by all its towers)
export const levelCost = (save, mods, type, count = 1) =>
    bulkCost(
        LEVEL_BASE * LEVEL_GROWTH ** (save.levels[type] - 1) * mods.levelCost,
        LEVEL_GROWTH,
        count
    );


// the first tower is free, every one after costs more
export const placeCost = (save, mods) =>
    save.towers.length === 0
        ? 0
        : Math.ceil(PLACE_BASE * PLACE_GROWTH ** (save.towers.length - 1) * mods.placeCost);


// tier is 1-5
export const tierCost = (mods, tier) =>
    Math.ceil(TIER_COSTS[tier - 1] * mods.levelCost);


export const sellValue = tower =>
    Math.floor(tower.spent * SELL_REFUND);


// Can `tower` take the next tier of path `p`? Returns
//   {state: "buy" | "level" | "closed" | "max", tier, level}
// "level" means the type level is too low (`level` is what it needs),
// "closed" means the crosspath rule blocks it: two paths at most, and only
// one of them past MINOR_TIER.
export function tierStatus(tower, p, save){

    const tier = tower.paths[p] + 1;

    if(tier > MAX_TIER)
        return {state: "max", tier: MAX_TIER, level: 0};

    const others = tower.paths.filter((t, i) => i !== p);

    const tooMany = tower.paths[p] === 0 && others.filter(t => t > 0).length >= 2;
    const tooHigh = tier > MINOR_TIER && others.some(t => t > MINOR_TIER);

    if(tooMany || tooHigh)
        return {state: "closed", tier, level: 0};

    const level = TIER_LEVELS[tier - 1];

    if(save.levels[tower.type] < level)
        return {state: "level", tier, level};

    return {state: "buy", tier, level};

}


// troop and gold upgrades share one formula; `start` is the free first level
export const upgradeCost = (level, upgrade, count = 1) =>
    bulkCost(
        upgrade.base * upgrade.growth ** (level - (upgrade.start ?? 0)),
        upgrade.growth,
        count
    );


// Largest count (up to `limit`) whose total cost fits in `currency`.
// costOf(count) must increase with count; doubling then binary search.
export function maxAffordable(costOf, currency, limit = Infinity){

    let low = 0;
    let high = 1;

    while(high <= limit && costOf(high) <= currency){

        low = high;
        high *= 2;

    }

    high = Math.min(high, limit + 1);

    while(high - low > 1){

        const middle = Math.floor((low + high) / 2);

        if(costOf(middle) <= currency)
            low = middle;
        else
            high = middle;

    }

    return low;

}


/* ---------------- Notes and ascension ---------------- */

// what the next type levels bring: the next x2 and the next tier they open
export function levelNote(level){

    const doubling = (Math.floor(level / MILESTONE) + 1) * MILESTONE;
    const index = TIER_LEVELS.findIndex(gate => gate > level);

    const parts = [`x2 damage at Lv ${doubling}`];

    if(index >= 0)
        parts.push(`tier ${index + 1} upgrades at Lv ${TIER_LEVELS[index]}`);

    return parts.join(" · ");

}


export function starsFor(save, mods){

    if(save.best < ASCEND_MIN)
        return 0;

    return Math.floor(
        ((save.best - STAR_OFFSET) / STAR_DIVISOR) ** STAR_POWER *
        mods.stars
    );

}
