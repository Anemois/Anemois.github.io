import {encodeCode, decodeCode, storeSave, loadStored} from "../../lib/savecode.js";
import {ORBITS, UPGRADES, openOrbit, prestigeGain} from "./orbits.js";


const KEY = "anefk-save";
const VERSION = 5;

const whole = value => Number.isFinite(value) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value))) : 0;


export function newSave(){

    return {
        version: VERSION,
        stars: 0,
        active: "white",
        fields: Object.fromEntries(ORBITS.map(({id}) => [
            id, {balance: 0, earned: 0, drive: 0, pierce: 0, wing: 0}
        ]))
    };

}


function migrate(raw){

    const save = newSave();

    if(raw?.version === 4){

        // Old blobs and gold used a different scale. Keep a small head start.
        const credit = Math.min(12, Math.floor(Math.log2(1 + whole(raw.runBlobs))));
        save.fields.white.balance = credit;
        save.fields.white.earned = credit;
        save.stars = whole(raw.gold) || raw.tree?.length ? 1 : 0;
        return save;

    }

    if(raw?.version !== VERSION)
        return save;

    save.stars = whole(raw.stars);

    for(const {id} of ORBITS){

        const source = raw.fields?.[id];
        const field = save.fields[id];
        field.earned = whole(source?.earned);
        field.balance = Math.min(field.earned, whole(source?.balance));

        for(const upgrade of UPGRADES)
            field[upgrade.id] = Math.min(upgrade.max, whole(source?.[upgrade.id]));

    }

    const index = ORBITS.findIndex(orbit => orbit.id === raw.active);

    if(index >= 0 && openOrbit(save, index))
        save.active = raw.active;

    return save;

}


export function ascend(save){

    const gain = prestigeGain(save);

    if(!gain)
        return save;

    const next = newSave();
    next.stars = save.stars + gain;
    return next;

}


export function loadSave(){

    try{

        const data = loadStored(KEY, "anefk");

        if(data && data.version !== VERSION)
            storeSave(KEY + "-backup-v" + whole(data.version), "anefk", data);

        return migrate(data);

    }
    catch{

        return newSave();

    }

}


export function writeSave(save){

    storeSave(KEY, "anefk", save);

}


export const encodeSave = save => encodeCode("anefk", save);


export async function decodeSave(code){

    const data = await decodeCode("anefk", code);

    if(data?.version !== VERSION && data?.version !== 4)
        throw new Error("Invalid save");

    return migrate(data);

}
