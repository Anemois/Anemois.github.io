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
