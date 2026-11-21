// Saves that can't be read or edited by hand, for the export / import boxes
// and for what the games keep in the browser.
//
//   await encodeCode(game, data)    any JSON-able value -> a short save code
//   await decodeCode(game, code)    a code -> the value; throws on anything
//                                   that is not an untouched code of this game
//   storeSave(key, game, data)      keeps a save in localStorage
//   loadStored(key, game)           reads it back: the value, or null when
//                                   there is none or it was tampered with
//
// Both are sealed the same way: a checksum in front, every byte scrambled with
// a keystream drawn from the game's name and a random salt, base64url, behind
// a format byte. Codes are deflated first (the browser's CompressionStream,
// which is async); stored saves are not, so a game reads its save at once.
//
// This keeps honest players honest: decoding the base64 gives noise, and a
// changed byte (or another game's code) fails the checksum. Someone who reads
// this file can still forge a save; nothing in the browser can stop that.

const CODE = 2;        // format byte of a code (1 was the old plain base64 JSON, no longer accepted)
const STORED = 3;      // format byte of a stored save
const SALT = 2;        // bytes
const CHECK = 4;       // bytes


export async function encodeCode(game, data){

    return seal(game, CODE, await squeeze(json(data), "CompressionStream"));

}


export async function decodeCode(game, code){

    return JSON.parse(new TextDecoder().decode(await squeeze(unseal(game, CODE, code.trim()), "DecompressionStream")));

}


// Throws when the browser won't keep it (private mode, full storage): the
// games carry on unsaved.
export function storeSave(key, game, data){

    localStorage.setItem(`${key}-sealed`, seal(game, STORED, json(data)));

}


// A save from before saves were sealed (plain JSON under `key`) is read once,
// stored sealed, and the plain copy removed; from then on only the sealed one
// counts, so editing plain JSON back in does nothing.
export function loadStored(key, game){

    try{

        const sealed = localStorage.getItem(`${key}-sealed`);

        if(sealed !== null)
            return JSON.parse(new TextDecoder().decode(unseal(game, STORED, sealed)));

        const plain = localStorage.getItem(key);

        if(plain === null)
            return null;

        const data = JSON.parse(plain);

        storeSave(key, game, data);

        localStorage.removeItem(key);

        return data;

    }
    catch{

        return null;

    }

}


const json = data =>
    new TextEncoder().encode(JSON.stringify(data));


function seal(game, format, bytes){

    const salt = crypto.getRandomValues(new Uint8Array(SALT));

    const body = new Uint8Array(CHECK + bytes.length);

    body.set(word(checksum(game, salt, bytes)), 0);
    body.set(bytes, CHECK);

    scramble(body, game, salt);

    const all = new Uint8Array(1 + SALT + body.length);

    all[0] = format;
    all.set(salt, 1);
    all.set(body, 1 + SALT);

    return toBase64Url(all);

}


// the sealed bytes; throws on anything that isn't an untouched seal of this game and format
function unseal(game, format, text){

    const all = fromBase64Url(text);

    if(all.length < 1 + SALT + CHECK || all[0] !== format)
        throw new Error("not a save");

    const salt = all.slice(1, 1 + SALT);
    const body = all.slice(1 + SALT);

    scramble(body, game, salt);

    const bytes = body.slice(CHECK);

    if(!sameBytes(body.slice(0, CHECK), word(checksum(game, salt, bytes))))
        throw new Error("not a save");

    return bytes;

}


// deflate or inflate through the browser's streams
async function squeeze(bytes, kind){

    const stream = new Blob([bytes]).stream().pipeThrough(new globalThis[kind]("deflate-raw"));

    return new Uint8Array(await new Response(stream).arrayBuffer());

}


// XOR with a keystream; running it twice gives the bytes back
function scramble(bytes, game, salt){

    const next = keystream(hash(`${game}:${salt.join(".")}`));

    for(let i = 0; i < bytes.length; i++)
        bytes[i] ^= next();

}


// mulberry32: a small seeded generator, one byte at a time
function keystream(seed){

    let state = seed >>> 0;

    return () => {

        state = (state + 0x6D2B79F5) >>> 0;

        let t = state;

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) & 0xff;

    };

}


function checksum(game, salt, bytes){

    let h = hash(`check:${game}`);

    for(const b of salt)
        h = Math.imul(h ^ b, 0x01000193);

    for(const b of bytes)
        h = Math.imul(h ^ b, 0x01000193);

    return finish(h);

}


// FNV-1a over a string, finished with murmur3's mixer
function hash(text){

    let h = 0x811C9DC5;

    for(let i = 0; i < text.length; i++)
        h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);

    return finish(h);

}


function finish(h){

    h ^= h >>> 16;
    h = Math.imul(h, 0x85EBCA6B);
    h ^= h >>> 13;
    h = Math.imul(h, 0xC2B2AE35);

    return (h ^ (h >>> 16)) >>> 0;

}


const word = n =>
    Uint8Array.of(n >>> 24, n >>> 16 & 0xff, n >>> 8 & 0xff, n & 0xff);


const sameBytes = (a, b) =>
    a.length === b.length && a.every((value, i) => value === b[i]);


// base64url: no + / = in the code, so it survives being pasted anywhere
function toBase64Url(bytes){

    let text = "";

    // in slices: fromCharCode can't take a whole big save at once
    for(let i = 0; i < bytes.length; i += 8192)
        text += String.fromCharCode(...bytes.subarray(i, i + 8192));

    return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

}


function fromBase64Url(text){

    if(!/^[A-Za-z0-9_-]+$/.test(text))
        throw new Error("not a save");

    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));

    return Uint8Array.from(binary, ch => ch.charCodeAt(0));

}
