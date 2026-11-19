import {
    STEP,
    OFFLINE_CAP,
    OFFLINE_SHARE,
    AUTOBUY_EVERY,
    AUTOBUY_SHARE,
    TOWER_IDS,
    TOWERS,
    TOWER_RADIUS,
    TARGET_MODES,
    TROOP_UPGRADES,
    TROOP_UNLOCK,
    UPGRADES
} from "./data.js";

import * as economy from "./economy.js";
import {createBattle} from "./battle.js";
import {computeModifiers} from "./sky.js";
import {freshRun} from "./save.js";
import {RALLY_RANGE, placementError} from "./map.js";


const RATE_WINDOW = 60;         // seconds the gold rate averages over

const TROOPS = new Map(TROOP_UPGRADES.map(item => [item.id, item]));
const GOLD_UPGRADES = new Map(UPGRADES.map(item => [item.id, item]));


// The whole game without any DOM: save, battle and every action a player
// can take. The page (anetd.js) and headless balance tests both drive this.
export function createGame(initialSave){

    let save = initialSave;
    let mods = computeModifiers(save.sky);
    let stats = economy.battleStats(save, mods);

    let carry = 0;              // game time not yet simulated (less than one step)
    let autobuyIn = AUTOBUY_EVERY;
    let lastBonus = 0;          // gold from the last clear, for the banner
    let earned = 0;             // gold since the last rate update
    let rate = save.rate;

    // gold per popped layer, cached until the wave or a gold bonus changes
    let popGold = 0;
    let popGoldWave = 0;


    const battle = createBattle({
        getStats: () => stats,
        getTowers: () => save.towers,
        getRally: () => save.rally,
        getSpawnScale: wave => mods.blitz > 0 && wave < save.bestEver / 2 ? 0.5 : 1,
        onPop,
        onEnd
    });

    battle.syncTowers();
    battle.start(save.wave);


    /* ---------------- Battle hooks ---------------- */

    function onPop(layers){

        const wave = battle.state.wave;

        if(popGoldWave !== wave){

            popGold = economy.popGold(save, mods, wave);
            popGoldWave = wave;

        }

        earn(layers * popGold);

    }


    // clearing pays a bonus and moves on (or repeats, with auto off);
    // failing just restarts the same wave
    function onEnd(cleared, wave, plan){

        if(!cleared)
            return wave;

        lastBonus = economy.clearGold(save, mods, wave, plan.layers);

        earn(lastBonus);

        save.best = Math.max(save.best, wave);
        save.bestEver = Math.max(save.bestEver, wave);

        save.wave = save.auto ? wave + 1 : wave;

        return save.wave;

    }


    function earn(gold){

        save.gold += gold;
        earned += gold;

    }


    /* ---------------- Time ---------------- */

    // runs `seconds` of game time in fixed steps (any leftover carries over)
    function advance(seconds){

        carry += seconds;

        while(carry >= STEP){

            battle.step(STEP);

            carry -= STEP;

            if(mods.autobuy > 0 && save.autobuy && (autobuyIn -= STEP) <= 0){

                autobuyIn = AUTOBUY_EVERY;

                autobuy();

            }

        }

    }


    // Quartermaster: levels the placed tower types, cheapest first, with up
    // to half the gold on hand (the rest stays for towers and upgrades)
    function autobuy(){

        const placed = TOWER_IDS.filter(id => save.towers.some(tower => tower.type === id));

        let budget = save.gold * AUTOBUY_SHARE;
        let bought = false;

        for(;;){

            let cheapest = null;
            let price = Infinity;

            for(const id of placed){

                const cost = economy.levelCost(save, mods, id);

                if(cost < price){

                    cheapest = id;
                    price = cost;

                }

            }

            if(!cheapest || price > budget)
                break;

            save.gold -= price;
            save.levels[cheapest]++;

            budget -= price;
            bought = true;

        }

        if(bought)
            refresh();

    }


    // moving average of gold per real second (header, offline gains)
    function trackRate(realSeconds){

        if(realSeconds <= 0)
            return;

        rate += (earned / realSeconds - rate) * Math.min(1, realSeconds / RATE_WINDOW);

        earned = 0;

        save.rate = rate;

    }


    // pays for time away; returns the gold
    function offline(seconds){

        const gold = rate * Math.min(seconds, OFFLINE_CAP) * OFFLINE_SHARE * mods.offline;

        save.gold += gold;

        return gold;

    }


    /* ---------------- Changes ---------------- */

    // after anything that changes stats, towers, troops or the constellation
    function refresh(){

        mods = computeModifiers(save.sky);
        stats = economy.battleStats(save, mods);

        popGoldWave = 0;

        save.speed = Math.min(save.speed, maxSpeed());

        battle.syncTowers();
        battle.syncGuards();

    }


    function spend(cost, apply){

        if(save.gold < cost)
            return false;

        save.gold -= cost;

        apply();

        refresh();

        return true;

    }


    // wanted === Infinity means "buy max": as many as gold allows, up to `limit`
    function resolveCount(wanted, costOf, limit = Infinity){

        const capped = Math.min(wanted, limit);

        return wanted === Infinity
            ? economy.maxAffordable(costOf, save.gold, capped)
            : capped;

    }


    const towerUnlocked = id =>
        save.bestEver + 1 >= TOWERS[id].unlock;

    const troopsUnlocked = () =>
        save.bestEver + 1 >= TROOP_UNLOCK;

    const maxSpeed = () =>
        1 + mods.speed;


    const findTower = id =>
        save.towers.find(tower => tower.id === id);


    // why a tower can't go at (x, y), or null
    const placeError = (x, y) =>
        placementError(x, y, save.towers, TOWER_RADIUS);


    // the shared level of a tower type
    function buyTypeLevel(type, wanted){

        const count = resolveCount(wanted, n => economy.levelCost(save, mods, type, n));

        if(count < 1)
            return false;

        return spend(economy.levelCost(save, mods, type, count), () => {
            save.levels[type] += count;
        });

    }


    // returns the new tower, or null if it can't be placed or afforded
    function placeTower(type, x, y){

        const cost = economy.placeCost(save, mods);

        if(!towerUnlocked(type) || placeError(x, y) || save.gold < cost)
            return null;

        const tower = {
            id: save.nextId++,
            type,
            x,
            y,
            target: TOWERS[type].target ?? "first",
            paths: [0, 0, 0],
            spent: cost
        };

        spend(cost, () => save.towers.push(tower));

        return tower;

    }


    function sellTower(id){

        const tower = findTower(id);

        if(!tower)
            return false;

        save.gold += economy.sellValue(tower);
        save.towers = save.towers.filter(other => other !== tower);

        refresh();

        return true;

    }


    // next tier of path `p` on one tower
    function buyTier(id, p){

        const tower = findTower(id);

        if(!tower || economy.tierStatus(tower, p, save).state !== "buy")
            return false;

        const cost = economy.tierCost(mods, tower.paths[p] + 1);

        return spend(cost, () => {

            tower.paths[p]++;
            tower.spent += cost;

        });

    }


    function cycleTarget(id){

        const tower = findTower(id);

        if(!tower)
            return;

        tower.target = TARGET_MODES[(TARGET_MODES.indexOf(tower.target) + 1) % TARGET_MODES.length];

        refresh();

    }


    // troop and gold upgrades: levels live in save[group][id]
    function buyLevel(group, item, wanted){

        const level = save[group][item.id];
        const room = item.max === undefined ? Infinity : item.max - level;

        const count = resolveCount(
            wanted,
            n => economy.upgradeCost(level, item, n),
            room
        );

        if(count < 1)
            return false;

        return spend(economy.upgradeCost(level, item, count), () => {
            save[group][item.id] += count;
        });

    }


    const buyTroop = (id, wanted) =>
        troopsUnlocked() && buyLevel("troops", TROOPS.get(id), wanted);

    const buyUpgrade = (id, wanted) =>
        buyLevel("upgrades", GOLD_UPGRADES.get(id), wanted);


    // the sky view only calls this after checking unlock state and stars
    function buySky(node){

        save.stars -= node.cost;
        save.sky.push(node.id);

        refresh();

    }


    function ascend(){

        const gain = economy.starsFor(save, mods);

        if(gain < 1)
            return 0;

        save.stars += gain;
        save.starsEarned += gain;
        save.ascensions++;

        Object.assign(save, freshRun(mods.startGold));

        // the old gold rate means nothing for a fresh run (it also pays offline gold)
        rate = save.rate = 0;
        earned = 0;

        refresh();

        battle.start(1);

        return gain;

    }


    function setWave(wave){

        save.wave = Math.min(Math.max(1, wave), save.best + 1);

        battle.start(save.wave);

    }


    function setRally(share){

        save.rally = Math.min(Math.max(share, RALLY_RANGE[0]), RALLY_RANGE[1]);

        battle.syncGuards();

    }


    // swaps in another save (import, reset)
    function load(next){

        save = next;
        rate = save.rate;

        refresh();

        battle.start(save.wave);

    }


    return {
        get save(){ return save; },
        get mods(){ return mods; },
        get stats(){ return stats; },
        get rate(){ return rate; },
        get lastBonus(){ return lastBonus; },

        battle,

        advance,
        trackRate,
        offline,

        towerUnlocked,
        troopsUnlocked,
        maxSpeed,

        findTower,
        placeError,
        buyTypeLevel,
        placeTower,
        sellTower,
        buyTier,
        cycleTarget,
        buyTroop,
        buyUpgrade,
        buySky,
        ascend,
        setWave,
        setRally,
        load,

        setAuto: on => save.auto = on,
        setAutobuy: on => save.autobuy = on,
        setSpeed: speed => save.speed = Math.min(Math.max(1, speed), maxSpeed())
    };

}
