/* ---------------- Balance constants ---------------- */
// Pacing in one place: change a number here and the whole game follows.

export const TICK_MS = 250;             // economy + header refresh (animation uses its own frame loop)
export const SAVE_EVERY_TICKS = 40;     // = every 10 seconds

export const HELPER_GROWTH = 1.2;       // helper cost growth per level
export const FASTER_BONUS = 1.1;        // helper output per "Faster Helpers" level

// Every helper doubles its output at these levels (Tap Titans style milestones).
export const MILESTONES = [10, 25, 50, 100, 200];
export const MILESTONE_BONUS = 2;

// Regular orbs: small and steady, worth a slice of production.
// A collected orb comes back after a short pause, so clicking is paced by aim, not by spam.
// A new orb is left alone for ORB_RESERVED seconds, so seekers never snipe
// everything before the player can reach it.
export const ORB_SECONDS = 0.3;
export const ORB_RESPAWN = 0.5;                 // seconds before a collected orb is replaced
export const ORB_RESERVED = 1.5;                // seconds a new orb is only for the player

// Golden orbs: a big bonus that never expires. One arrives every GOLDEN_DELAY
// seconds and waits, up to GOLDEN_STORE at once, so being away costs nothing
// until the store is full.
export const GOLDEN_SECONDS = 60;               // value, in seconds of production
export const GOLDEN_WEIGHT_SECONDS = 5;         // extra seconds per "Golden Weight" level
export const GOLDEN_DELAY = [150, 210];         // seconds between golden orbs (random in range)
export const GOLDEN_STORE = 3;

export const SEEKER_SPEED = 260;        // px per second
export const SEEKER_CAP = 12;

export const PRESTIGE_MIN = 1e9;        // blobs earned in a run before prestige unlocks
export const PRESTIGE_CONFIRM_MS = 3000;

export const BUY_AMOUNTS = [1, 10, 100];


/* ---------------- Shop data ---------------- */
// cost of level n = ceil(base * growth^n); `max` is optional

export const HELPERS = [
    {id:"miner",       name:"Blob Miner",       power:1,       base:15},
    {id:"farm",        name:"Blob Farm",        power:6,       base:360},
    {id:"workshop",    name:"Blob Workshop",    power:36,      base:8640},
    {id:"factory",     name:"Blob Factory",     power:216,     base:2.07e5},
    {id:"refinery",    name:"Blob Refinery",    power:1300,    base:5e6},
    {id:"reactor",     name:"Blob Reactor",     power:7800,    base:1.2e8},
    {id:"quantum",     name:"Quantum Blob",     power:47000,   base:2.9e9},
    {id:"singularity", name:"Blob Singularity", power:280000,  base:6.9e10}
];


// ids are used by economy.js
export const UPGRADES = [
    {id:"faster",  name:"Faster Helpers", desc:"+10% helper output",
     base:500, growth:2},

    {id:"heavy",   name:"Golden Weight",  desc:`+${GOLDEN_WEIGHT_SECONDS}s of production in golden orbs`,
     base:2e5, growth:2.1, max:10},

    {id:"seekers", name:"Seekers",        desc:"+1 seeker that collects orbs",
     base:2.5e5, growth:5, max:6},

    {id:"cluster", name:"Orb Cluster",    desc:"+1 orb on screen",
     base:1e5, growth:3, max:6}
];
