// Seeded random numbers (mulberry32). The state is one integer, so a run
// can be replayed or kept in sync across machines from the seed alone.
export function createRng(seed){

    let state = seed >>> 0;

    function next(){

        state = (state + 0x6d2b79f5) | 0;

        let x = Math.imul(state ^ (state >>> 15), 1 | state);

        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;

        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;

    }


    return {
        next,
        range: (low, high) => low + next() * (high - low),
        int: (low, high) => low + Math.floor(next() * (high - low + 1)),
        pick: list => list[Math.floor(next() * list.length)],
        chance: p => next() < p,

        // picks a key of `weights` ({key: weight}) in proportion to its weight
        weighted(weights){

            const entries = Object.entries(weights).filter(([, w]) => w > 0);
            const total = entries.reduce((sum, [, w]) => sum + w, 0);

            let roll = next() * total;

            for(const [key, weight] of entries){

                roll -= weight;

                if(roll < 0)
                    return key;

            }

            return entries[entries.length - 1][0];

        },

        get state(){ return state; },
        set state(value){ state = value >>> 0; }
    };

}


export const randomSeed = () =>
    Math.floor(Math.random() * 4294967296);


// A random number in [0, 1) made only from the numbers given, the same on
// every machine. Used where a guest's machine must guess exactly what the
// host's will roll (the scatter of a shot, see combat.js).
export function hash01(a, b, c = 0){

    let x = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d);

    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    x ^= x >>> 16;

    return (x >>> 0) / 4294967296;

}


// a whole number for a string (a player id), for hash01
export function hashText(text){

    let x = 2166136261;

    for(let i = 0; i < text.length; i++)
        x = Math.imul(x ^ text.charCodeAt(i), 16777619);

    return x >>> 0;

}
