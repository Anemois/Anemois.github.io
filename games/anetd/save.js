import {TOWERS, TOWER_IDS, TARGET_MODES, TROOP_UPGRADES, UPGRADES, MAX_TIER} from "./data.js";
import {WIDTH, HEIGHT, RALLY_DEFAULT, RALLY_RANGE} from "./map.js";
import {SKY} from "./sky-data.js";


const KEY = "anetd-save";
const VERSION = 2;

const SKY_IDS = new Set(SKY.map(node => node.id));

// version 1 had fixed pads: their towers move to the same spots
const OLD_PADS = [
    [336, 330], [576, 210], [336, 200], [576, 340], [108, 210], [810, 340],
    [108, 380], [336, 500], [156, 40], [576, 40], [810, 500], [810, 190]
];

const START_TOWER = {type: "dart", x: 336, y: 330};


const num = value =>
    Number.isFinite(value) && value > 0 ? value : 0;

const int = value =>
    Math.floor(num(value));

const clamp = (value, low, high) =>
    Math.min(Math.max(value, low), high);


// levels are stored by id so reordering or adding items never corrupts a save
function levelsFrom(items, source){

    return Object.fromEntries(
        items.map(item => {

            const level = Math.max(item.start ?? 0, int(source?.[item.id]));

            return [item.id, item.max === undefined ? level : Math.min(level, item.max)];

        })
    );

}


function makeTower(id, type, x, y, target, paths = [0, 0, 0], spent = 0){

    return {
        id,
        type,
        x: clamp(Number(x) || 0, 0, WIDTH),
        y: clamp(Number(y) || 0, 0, HEIGHT),
        target: TARGET_MODES.includes(target) ? target : TOWERS[type].target ?? "first",
        paths: [0, 1, 2].map(p => clamp(int(paths?.[p]), 0, MAX_TIER)),
        spent: num(spent)
    };

}


// placed towers, renumbered 1..n; version 1 pads become towers on their spot
function towersFrom(data){

    const source = data.version === 1
        ? (data.pads ?? []).map((pad, i) => pad?.type && OLD_PADS[i] && {type: pad.type, x: OLD_PADS[i][0], y: OLD_PADS[i][1], target: pad.target})
        : data.towers;

    if(!Array.isArray(source))
        return null;

    return source
        .filter(tower => TOWER_IDS.includes(tower?.type))
        .map((tower, i) => makeTower(i + 1, tower.type, tower.x, tower.y, tower.target, tower.paths, tower.spent));

}


// Everything ascending resets. One Dart starts on the field.
export function freshRun(startGold = 0){

    return {
        gold: startGold,
        wave: 1,
        best: 0,
        levels: Object.fromEntries(TOWER_IDS.map(id => [id, 1])),
        towers: [makeTower(1, START_TOWER.type, START_TOWER.x, START_TOWER.y)],
        nextId: 2,
        troops: levelsFrom(TROOP_UPGRADES, {}),
        upgrades: levelsFrom(UPGRADES, {}),
        rally: RALLY_DEFAULT
    };

}


function migrate(raw){

    const data = raw?.version === VERSION || raw?.version === 1 ? raw : {};
    const run = freshRun();

    const best = int(data.best);
    const towers = towersFrom(data) ?? run.towers;

    return {
        version: VERSION,

        // this run
        gold: num(data.gold),
        wave: Math.min(Math.max(1, int(data.wave)), best + 1),
        best,
        levels: Object.fromEntries(
            TOWER_IDS.map(id => [id, Math.max(1, int(data.levels?.[id]))])
        ),
        towers,
        nextId: towers.length + 1,
        troops: levelsFrom(TROOP_UPGRADES, data.troops),
        upgrades: levelsFrom(UPGRADES, data.upgrades),
        rally: Number.isFinite(data.rally)
            ? clamp(data.rally, RALLY_RANGE[0], RALLY_RANGE[1])
            : RALLY_DEFAULT,

        // kept forever
        bestEver: Math.max(best, int(data.bestEver)),
        stars: num(data.stars),
        starsEarned: num(data.starsEarned),
        sky: [...new Set(Array.isArray(data.sky) ? data.sky : [])].filter(id => SKY_IDS.has(id)),
        ascensions: int(data.ascensions),

        // settings and bookkeeping
        auto: data.auto !== false,
        autobuy: data.autobuy !== false,
        speed: Math.max(1, int(data.speed)),
        rate: num(data.rate),               // recent gold per second, for offline gains
        savedAt: num(data.savedAt) || Date.now()
    };

}


export const newSave = () => migrate({});


export function loadSave(){

    try{

        return migrate(JSON.parse(localStorage.getItem(KEY)));

    }
    catch{

        return newSave();

    }

}


export function writeSave(save){

    save.savedAt = Date.now();

    try{

        localStorage.setItem(KEY, JSON.stringify(save));

    }
    catch{
        // storage full or blocked: the game keeps running, it just won't persist
    }

}


export function encodeSave(save){

    return btoa(JSON.stringify(save));

}


// throws on anything that isn't a save code (old codes still work)
export function decodeSave(code){

    const data = JSON.parse(atob(code));

    if(data?.version !== VERSION && data?.version !== 1)
        throw new Error("Invalid save");

    return migrate(data);

}
