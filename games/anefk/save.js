import {HELPERS, UPGRADES} from "./data.js";
import {TREE} from "./tree-data.js";


const KEY = "anefk-save";
const VERSION = 4;

const TREE_IDS = new Set(TREE.map(node => node.id));


const num = value =>
    Number.isFinite(value) && value > 0 ? value : 0;


export const zeroLevels = items =>
    Object.fromEntries(items.map(item => [item.id, 0]));


// levels are stored by id so reordering or adding items never corrupts a save
function levelsFrom(items, source){

    return Object.fromEntries(
        items.map(item => {

            const levelValue = Math.floor(num(source?.[item.id]));

            return [
                item.id,
                item.max === undefined ? levelValue : Math.min(levelValue, item.max)
            ];

        })
    );

}


// Saves from before version 4 were made under the old, much faster balance:
// their levels and gold would skip the new curve, so they start over.
function migrate(raw){

    const data = raw?.version === VERSION ? raw : {};

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

        const raw = localStorage.getItem(KEY);
        const data = JSON.parse(raw);

        // keep an old save under another key before it gets replaced
        if(data && data.version !== VERSION)
            localStorage.setItem(`${KEY}-backup`, raw);

        return migrate(data);

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


// throws on anything that isn't a current save code
export function decodeSave(code){

    const data = JSON.parse(atob(code));

    if(data?.version !== VERSION)
        throw new Error("Invalid save");

    return migrate(data);

}
