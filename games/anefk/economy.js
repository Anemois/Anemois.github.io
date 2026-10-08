import {
    HELPERS,
    HELPER_GROWTH,
    FASTER_BONUS,
    ORB_SECONDS,
    GOLDEN_SECONDS,
    GOLDEN_WEIGHT_SECONDS,
    SEEKER_CAP,
    PRESTIGE_MIN
} from "./data.js";


// All functions are pure: (save, mods) in, number out.
// `mods` is the aggregated skill tree (see tree.js computeModifiers).

const level = (save, id) => save.upgrades[id] || 0;


/* ---------------- Income ---------------- */

export function production(save, mods){

    let base = 0;

    for(const helper of HELPERS)
        base += save.helpers[helper.id] * helper.power;

    return (
        base *
        Math.pow(FASTER_BONUS, level(save, "faster")) *
        mods.helper *
        mods.all
    );

}


// small and steady: what seekers and ordinary clicks give
export function orbValue(save, mods){

    return mods.all + production(save, mods) * ORB_SECONDS;

}


// big and rare: only the player can collect it
export function goldenValue(save, mods){

    const seconds =
        GOLDEN_SECONDS +
        GOLDEN_WEIGHT_SECONDS * level(save, "heavy") +
        mods.goldenSeconds;

    return (
        (mods.all + production(save, mods) * seconds) *
        mods.golden
    );

}


/* ---------------- Costs ---------------- */

// Total price of `count` consecutive levels, starting at a price of `first`
// and growing by `growth` per level (geometric series, rounded once).
function bulkCost(first, growth, count){

    return Math.ceil(
        first * (Math.pow(growth, count) - 1) / (growth - 1)
    );

}


export function helperCost(save, mods, helper, count = 1){

    return bulkCost(
        helper.base *
        Math.pow(HELPER_GROWTH, save.helpers[helper.id]) *
        mods.helperCost,
        HELPER_GROWTH,
        count
    );

}


export function upgradeCost(save, upgrade, count = 1){

    return bulkCost(
        upgrade.base *
        Math.pow(upgrade.growth, save.upgrades[upgrade.id]),
        upgrade.growth,
        count
    );

}


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


/* ---------------- Entities and prestige ---------------- */

export function seekerCount(save, mods){

    return Math.min(
        SEEKER_CAP,
        level(save, "seekers") + mods.seekers
    );

}


export function orbCount(save, mods){

    return 1 + level(save, "cluster") + mods.orbs;

}


// based on blobs earned this run, so spending blobs never lowers the payout
export function prestigeGain(save, mods){

    if(save.runBlobs < PRESTIGE_MIN)
        return 0;

    return Math.floor(
        Math.sqrt(save.runBlobs / PRESTIGE_MIN) *
        mods.goldGain
    );

}