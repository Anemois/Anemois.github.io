import {HELPERS, UPGRADES} from "./data.js";
import {TREE} from "./tree-data.js";


const KEY = "anefk-save";
const VERSION = 3;

const TREE_IDS = new Set(TREE.map(node => node.id));

// v2 gold shop: base costs, doubling per level (refunded as gold on migrate)
const LEGACY_GOLD_BASE = [1, 2, 5];


const num = value =>
    Number.isFinite(value) && value > 0 ? value : 0;


export const zeroLevels = items =>
    Object.fromEntries(items.map(item => [item.id, 0]));


// levels are stored by id so reordering or adding items never corrupts a save;
// old saves stored them as arrays, indexed in the same order as the item list
function levelsFrom(items, source){

    return Object.fromEntries(
        items.map((item, index) => {

            const raw = Array.isArray(source)
                ? source[index]
                : source?.[item.id];

            const levelValue = Math.floor(num(raw));

            return [
                item.id,
                item.max === undefined ? levelValue : Math.min(levelValue, item.max)
            ];

        })
    );

}


function migrate(raw){

    const data = {...raw};

    // v1: three helpers (Miner, Factory, Quantum), no per-run tracking
    if(!data.version){

        const helpers = data.helpers;

        if(Array.isArray(helpers) && helpers.length === 3)
            data.helpers = [helpers[0], 0, 0, helpers[1], 0, 0, helpers[2], 0];

        data.runBlobs ??= data.blobs;

    }

    // v2: seven upgrades in an array; only Faster Helpers still exists
    if(Array.isArray(data.upgrades))
        data.upgrades = {faster:data.upgrades[1]};

    // v2: multiplicative gold shop is gone, refund what was spent
    if(Array.isArray(data.goldUpgrades)){

        data.gold = num(data.gold) + data.goldUpgrades.reduce(
            (sum, level, i) =>
                sum + (LEGACY_GOLD_BASE[i] ?? 0) * (Math.pow(2, num(level)) - 1),
            0
        );

    }

    return {
        version: VERSION,
        blobs: num(data.blobs),
        runBlobs: num(data.runBlobs),
        gold: num(data.gold),
        helpers: levelsFrom(HELPERS, data.helpers),
        upgrades: levelsFrom(UPGRADES, data.upgrades),
        tree: [...new Set(Array.isArray(data.tree) ? data.tree : [])]
            .filter(id => TREE_IDS.has(id))
    };

}


export const newSave = () => migrate({});


export function loadSave(){

    try{

        return migrate(JSON.parse(localStorage.getItem(KEY)) ?? {});

    }
    catch{

        return newSave();

    }

}


export function writeSave(save){

    localStorage.setItem(KEY, JSON.stringify(save));

}


export function encodeSave(save){

    return btoa(JSON.stringify(save));

}


// throws on anything that isn't a save code
export function decodeSave(code){

    const data = JSON.parse(atob(code));

    if(!data || typeof data !== "object")
        throw new Error("Invalid save");

    return migrate(data);

}