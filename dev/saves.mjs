// Checks the save codes of AneFK, AneTD and AneCrawler (lib/savecode.js) in
// a second, no browser:
//   - a save comes back unchanged through its code
//   - codes are short (an AneCrawler bag of 400 weapons)
//   - the code shows no readable JSON, and an edited code, another game's code
//     or an old plain base64 code is refused
//   - saves kept in localStorage are sealed too: an old plain save is moved
//     over once, and plain JSON put back afterwards (or an edited seal) is ignored
//
//   node dev/saves.mjs

// node has no localStorage: a plain in-memory one
const storage = new Map();

Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: key => storage.has(key) ? storage.get(key) : null,
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: key => storage.delete(key)
    }
});

import {encodeCode, decodeCode} from "../lib/savecode.js";
import * as anefk from "../games/anefk/save.js";
import * as anetd from "../games/anetd/save.js";
import {newProfile, addItem, encodeProfile, decodeProfile, loadProfile, writeProfile} from "../games/anecrawler/profile.js";
import {WEAPON} from "../games/anecrawler/sim/data.js";

let failed = 0;


function check(ok, what, detail = ""){

    console.log(`${ok ? "PASS" : "FAIL"} ${what}${detail ? `  ${detail}` : ""}`);

    if(!ok)
        failed++;

}


async function refused(promise){

    try{

        await promise;

        return false;

    }
    catch{

        return true;

    }

}


// one character changed in the middle of a code
function edited(code){

    const i = code.length >> 1;

    return code.slice(0, i) + (code[i] === "A" ? "B" : "A") + code.slice(i + 1);

}


// readable JSON anywhere in the decoded base64: a quoted key and its colon (scrambled bytes almost never spell one)
const readable = code =>
    /"[a-zA-Z]{3,}"\s*:/.test(atob(code.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(code.length / 4) * 4, "=")));


// a big AneCrawler bag, like after many runs
function bigProfile(count){

    const profile = newProfile();
    const types = Object.keys(WEAPON);
    let at = Date.now() - 30 * 86400000;

    for(let i = 0; i < count; i++){

        at += 1000 + (i * 7919 % 3600) * 1000 + 123;

        const item = addItem(profile, {type: types[i % types.length], level: 1 + i % 40}, ["chest", "boss", "case"][i % 3], i % 4 === 0);

        item.at = at;

    }

    profile.shards = 123456;

    return profile;

}


for(const [name, encode, decode, sample] of [
    ["anefk", anefk.encodeSave, anefk.decodeSave, anefk.newSave()],
    ["anetd", anetd.encodeSave, anetd.decodeSave, anetd.newSave()]
]){

    const code = await encode(sample);
    const back = await decode(code);

    check(JSON.stringify(back) === JSON.stringify(sample), `${name}: a save comes back unchanged`, `${code.length} chars`);
    check(!readable(code), `${name}: the code shows no readable JSON`);
    check(await refused(decode(edited(code))), `${name}: an edited code is refused`);
    check(await refused(decode(btoa(JSON.stringify(sample)))), `${name}: an old plain base64 code is refused`);

}


const profile = bigProfile(400);
const code = await encodeProfile(profile);
const back = await decodeProfile(code);
const old = btoa(JSON.stringify(profile));

const sameBag = back.bag.length === profile.bag.length && back.bag.every((item, i) => {

    const was = profile.bag[i];

    return item.uid === was.uid && item.type === was.type && item.level === was.level
        && item.from === was.from && item.fresh === was.fresh && item.at === Math.round(was.at / 1000) * 1000;

});

check(sameBag, "anecrawler: 400 weapons come back (pickup times to the second)");
check(back.shards === profile.shards && JSON.stringify(back.loadout) === JSON.stringify(profile.loadout), "anecrawler: shards and loadout come back");
check(code.length * 5 < old.length, "anecrawler: the code is much shorter than the old one", `${code.length} chars, was ${old.length}`);
check(!readable(code), "anecrawler: the code shows no readable JSON");
check(await refused(decodeProfile(edited(code))), "anecrawler: an edited code is refused");
check(await refused(decodeProfile(old)), "anecrawler: an old plain base64 code is refused");
check(await refused(decodeProfile(await anetd.encodeSave(anetd.newSave()))), "anecrawler: another game's code is refused");

// saves kept in the browser
for(const [name, key, write, load, sample] of [
    ["anefk", "anefk-save", anefk.writeSave, anefk.loadSave, anefk.newSave()],
    ["anetd", "anetd-save", anetd.writeSave, anetd.loadSave, anetd.newSave()]
]){

    write(sample);

    const kept = storage.get(`${key}-sealed`) ?? "";

    check(kept && !storage.has(key) && !readable(kept), `${name}: the stored save is sealed`, `${kept.length} chars`);
    check(JSON.stringify(load()) === JSON.stringify({...sample, savedAt: load().savedAt}), `${name}: the stored save loads back`);

}

storage.clear();

const plain = bigProfile(30);

storage.set("anecrawler-save", JSON.stringify(plain));

const moved = loadProfile();

check(moved.bag.length === plain.bag.length && storage.has("anecrawler-save-sealed") && !storage.has("anecrawler-save"),
    "anecrawler: an old plain save is read once and sealed");

storage.set("anecrawler-save", JSON.stringify({...plain, shards: 999999999}));

check(loadProfile().shards === plain.shards, "anecrawler: plain JSON put back after that is ignored");

writeProfile(moved);

const sealed = storage.get("anecrawler-save-sealed");
const i = sealed.length >> 1;

storage.set("anecrawler-save-sealed", sealed.slice(0, i) + (sealed[i] === "A" ? "B" : "A") + sealed.slice(i + 1));

check(loadProfile().bag.length !== moved.bag.length, "anecrawler: an edited sealed save is refused (fresh start)");

const a = await encodeCode("anefk", {x: 1});
const b = await encodeCode("anefk", {x: 1});

check(a !== b && (await decodeCode("anefk", a)).x === 1, "codes of the same save differ each time (random salt) and still load");

console.log(failed ? `${failed} failed` : "all passed");

process.exit(failed ? 1 : 0);
