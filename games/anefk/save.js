import {HELPERS, UPGRADES} from "./data.js";
import {encodeCode, decodeCode, storeSave, loadStored} from "../../lib/savecode.js";
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

        // scrambled, so it can't be edited by hand (lib/savecode.js)
        const data = loadStored(KEY, "anefk");

        // keep an old save under another key before it gets replaced
        if(data && data.version !== VERSION)
            storeSave(`${KEY}-backup`, "anefk", data);

        return migrate(data);

    }
    catch{

        return newSave();

    }

}


export function writeSave(save){

    storeSave(KEY, "anefk", save);

}


// a short code that can't be read or edited by hand (lib/savecode.js)
export const encodeSave = save =>
    encodeCode("anefk", save);


// throws on anything that isn't a current save code
export async function decodeSave(code){

    const data = await decodeCode("anefk", code);

    if(data?.version !== VERSION)
        throw new Error("Invalid save");

    return migrate(data);

}
