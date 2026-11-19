import {STARTER_WEAPONS, WEAPON} from "./sim/data.js";
import {upgradeCost, salvageValue, rarityOf} from "./sim/loot.js";


// What a player keeps between runs: the bag of weapons, the two they carry,
// shards and records. Plain JSON in localStorage for now; an online version
// would keep the same object on a server.

const KEY = "anecrawler-save";
const VERSION = 1;

const MAX_LEVEL = 99;


export function newProfile(){

    const profile = {
        v: VERSION,
        uid: 1,
        bag: [],
        loadout: [],
        shards: 0,
        startFloor: 1,
        stats: {runs: 0, deaths: 0, kills: 0, bosses: 0, found: 0, bestFloor: 0, time: 0}
    };

    profile.loadout = STARTER_WEAPONS.map(type => addItem(profile, {type, level: 1}, "start", false).uid);

    return profile;

}


// fills in anything an older (or hand-edited) save is missing
function migrate(data){

    const fresh = newProfile();

    if(!data || typeof data !== "object" || !Array.isArray(data.bag))
        return fresh;

    const profile = {
        ...fresh,
        ...data,
        stats: {...fresh.stats, ...data.stats}
    };

    // numbers from an old or hand-edited save must still be numbers
    const count = (value, otherwise) =>
        Number.isFinite(value) && value >= 0 ? Math.floor(value) : otherwise;

    profile.shards = count(profile.shards, 0);
    profile.uid = count(profile.uid, 1);
    profile.startFloor = Math.max(1, count(profile.startFloor, 1));

    if(!Array.isArray(profile.loadout))
        profile.loadout = [];

    profile.bag = profile.bag.filter(item => item && WEAPON[item.type] && Number.isFinite(item.uid));

    for(const item of profile.bag)
        item.level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(item.level) || 1));

    profile.uid = Math.max(profile.uid, ...profile.bag.map(item => item.uid + 1));
    profile.loadout = profile.loadout.filter(uid => findItem(profile, uid)).slice(0, 2);

    // never leave anyone empty-handed
    if(!profile.bag.length)
        return fresh;

    if(!profile.loadout.length)
        profile.loadout = [profile.bag[0].uid];

    return profile;

}


export function loadProfile(){

    try{

        return migrate(JSON.parse(localStorage.getItem(KEY)));

    }
    catch{

        return newProfile();

    }

}


export function writeProfile(profile){

    try{

        localStorage.setItem(KEY, JSON.stringify(profile));

    }
    catch{
        // private mode or full storage: the game keeps going unsaved
    }

}


export const encodeProfile = profile =>
    btoa(JSON.stringify(profile));


// throws on anything that is not a save code
export function decodeProfile(code){

    const data = JSON.parse(atob(code.trim()));

    if(!data || !Array.isArray(data.bag))
        throw new Error("not a save");

    return migrate(data);

}


/* ---------------- Bag ---------------- */

export const findItem = (profile, uid) =>
    profile.bag.find(item => item.uid === uid) ?? null;


export function addItem(profile, {type, level}, from = "chest", fresh = true){

    const item = {uid: profile.uid++, type, level, from, at: Date.now(), fresh};

    profile.bag.push(item);

    return item;

}


export const loadoutItems = profile =>
    profile.loadout.map(uid => findItem(profile, uid)).filter(Boolean);

// puts a bag weapon in slot 0 or 1 (swapping if it already sat in the other)
export function equip(profile, uid, slot){

    const loadout = profile.loadout.slice();
    const current = loadout.indexOf(uid);

    if(current === slot)
        return;

    if(current !== -1)
        loadout[current] = loadout[slot];

    loadout[Math.min(slot, loadout.length)] = uid;

    profile.loadout = loadout.filter(id => id !== undefined);

}


export function canUpgrade(profile, item){

    return item.level < MAX_LEVEL && profile.shards >= upgradeCost(item);

}


export function upgrade(profile, uid){

    const item = findItem(profile, uid);

    if(!item || !canUpgrade(profile, item))
        return false;

    profile.shards -= upgradeCost(item);
    item.level++;

    return true;

}


// carried weapons cannot be salvaged
export function salvage(profile, uid){

    const item = findItem(profile, uid);

    if(!item || profile.loadout.includes(uid))
        return 0;

    const value = salvageValue(item);

    profile.bag = profile.bag.filter(other => other !== item);
    profile.shards += value;

    return value;

}


export const commons = profile =>
    profile.bag.filter(item => rarityOf(item).tier === 0 && !profile.loadout.includes(item.uid));


export function salvageCommons(profile){

    return commons(profile).reduce((sum, item) => sum + salvage(profile, item.uid), 0);

}


export {MAX_LEVEL};
