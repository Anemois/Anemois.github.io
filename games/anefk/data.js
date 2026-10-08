/* ---------------- Balance constants ---------------- */

export const TICK_MS = 100;
export const SAVE_EVERY_TICKS = 50;

export const HELPER_GROWTH = 1.25;      // helper cost growth per level
export const FASTER_BONUS = 1.1;        // helper output per "Faster Helpers" level

// Regular orbs are small (seekers collect them).
// Golden orbs are the big payout: only the player can collect them.
export const ORB_SECONDS = 0.1;                 // regular orb = this many seconds of production
export const GOLDEN_SECONDS = 60;               // golden orb base value, in seconds of production
export const GOLDEN_WEIGHT_SECONDS = 20;        // extra seconds per "Golden Weight" level
export const GOLDEN_DELAY = [30, 60];           // seconds between golden orbs (random in range)
export const GOLDEN_LIFETIME = 15;              // seconds a golden orb stays

export const SEEKER_SPEED = 260;        // px per second
export const SEEKER_CAP = 12;

export const PRESTIGE_MIN = 1e8;        // blobs earned in a run before prestige unlocks
export const PRESTIGE_CONFIRM_MS = 3000;

export const BUY_AMOUNTS = [1, 10, 100];


/* ---------------- Shop data ---------------- */
// cost of level n = ceil(base * growth^n); `max` is optional

export const HELPERS = [
    {id:"miner",       name:"Blob Miner",       power:1,      base:10},
    {id:"farm",        name:"Blob Farm",        power:6,      base:160},
    {id:"workshop",    name:"Blob Workshop",    power:30,     base:2500},
    {id:"factory",     name:"Blob Factory",     power:150,    base:40000},
    {id:"refinery",    name:"Blob Refinery",    power:750,    base:630000},
    {id:"reactor",     name:"Blob Reactor",     power:3700,   base:1e7},
    {id:"quantum",     name:"Quantum Blob",     power:18000,  base:1.6e8},
    {id:"singularity", name:"Blob Singularity", power:90000,  base:2.5e9}
];


// ids are used by economy.js
export const UPGRADES = [
    {id:"faster",  name:"Faster Helpers", desc:"+10% helper output",
     base:100, growth:2},

    {id:"heavy",   name:"Golden Weight",  desc:`+${GOLDEN_WEIGHT_SECONDS}s of production in golden orbs`,
     base:2000, growth:2.2, max:10},

    {id:"seekers", name:"Seekers",        desc:"+1 seeker that collects orbs",
     base:5000, growth:3.5, max:6},

    {id:"cluster", name:"Orb Cluster",    desc:"+1 orb on screen",
     base:2000, growth:2.5, max:6}
];
