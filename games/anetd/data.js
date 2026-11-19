/* ---------------- Timing ---------------- */
// Pacing in one place: change a number here and the whole game follows.

export const STEP = 1 / 60;             // simulation step, in game seconds
export const TICK_MS = 250;             // background tick: catch-up, header, autosave
export const SAVE_EVERY_MS = 10000;
export const CONFIRM_MS = 3000;         // ascend button stays armed this long

// Short gaps (throttled background tab) are simulated; longer ones (closed tab,
// sleeping laptop) pay out a share of the recent gold rate instead.
export const OFFLINE_AFTER = 120;       // seconds
export const OFFLINE_CAP = 12 * 3600;   // seconds
export const OFFLINE_SHARE = 0.5;

export const BUY_AMOUNTS = [1, 10, 100];
export const AUTOBUY_EVERY = 3;         // game seconds between autobuyer purchases (Quartermaster)
export const AUTOBUY_SHARE = 0.5;       // share of gold the autobuyer may spend each time


/* ---------------- Waves ---------------- */
// Every wave is a level: clear it to move on, lose all lives and it restarts.
// Gold from pops is kept either way, so a wall is also a farm.

export const HP_GROWTH = 1.22;          // balloon layer health per wave
export const BOUNTY_GROWTH = 1.15;      // gold per popped layer, per wave
export const CLEAR_BONUS = 0.3;         // clearing pays this share of the wave's pop gold again
export const LIVES = 20;
export const BOSS_EVERY = 10;

export const START_DELAY = 0.6;         // seconds before the first balloon
export const CLEAR_PAUSE = 1.4;         // breather between waves
export const FAIL_PAUSE = 2;


/* ---------------- Balloons ---------------- */
// Layers work like the original: popping the outer layer reveals the next.
// Leaking costs one life per layer left, a boss costs every life.

export const BASE_SPEED = 92;           // world units per second
export const LAYER_SPEED = 0.06;        // each extra layer is this much faster
export const LAYER_RADIUS = 1.1;
export const ARMOR_RESIST = 0.25;       // share of light damage that reaches armor
export const ENEMY_ATTACK = 0.25;       // layer-healths per second a blocked balloon deals to a guard, per layer

// outermost colour last: a 3-layer balloon is green, then blue, then red
export const LAYER_COLORS = ["#ff7185", "#61a8ff", "#63d69f", "#ffd35a", "#ff9a5a", "#c58cff"];

// armor and boss hp are in layer-healths; regen is seconds to regrow a layer;
// a boss pays `gold` layers' worth and bursts into `children` thick balloons
// (early bosses have less health, see battle.js spawn)
export const ENEMIES = {
    pop:     {speed: 1,    radius: 7},
    swift:   {speed: 1.65, radius: 5.5},
    armored: {speed: 0.75, radius: 7, armor: 3},
    regen:   {speed: 0.95, radius: 7, regen: 2.5},
    boss:    {speed: 0.5,  radius: 22, hp: 100, gold: 60, children: 6}
};


/* ---------------- Towers ---------------- */
// Towers are placed anywhere off the path. Two things make them stronger:
//  - the type level, shared by every tower of that type (Towers tab): every
//    level adds damage and every MILESTONE levels doubles it (economy.power)
//  - upgrade paths, bought per tower by clicking it: 3 paths of 5 tiers.
//    Like the original, only two paths can be upgraded and only one of them
//    past tier 2. A tier needs the type at TIER_LEVELS and costs TIER_COSTS.

export const LEVEL_BASE = 10;           // price of the first type level
export const LEVEL_GROWTH = 1.15;       // level cost growth (type levels, guard weapons and armor)
export const LEVEL_POWER = 1.04;        // damage growth per level, on top of the level itself
export const MILESTONE = 25;            // x2 damage every this many levels

export const TIER_LEVELS = [5, 15, 30, 60, 100];
export const TIER_COSTS = [80, 350, 2600, 1.8e5, 5e7];
export const MAX_TIER = 5;
export const MINOR_TIER = 2;            // the second upgraded path stops here

// how path effects combine with the base stats
export const EFFECT_MODES = {
    dmg: "mul", rate: "mul", range: "mul", splash: "mul", slowTime: "mul", boss: "mul", gold: "mul",
    targets: "add", pierce: "add", chain: "add", slow: "add", brittle: "add", stun: "add", burn: "add",
    falloff: "set", heavy: "set"
};

export const TARGET_MODES = ["first", "last", "strong", "close"];

// effects:  pierce = extra balloons hit next to the target, stun = seconds,
//           burn = share of the hit dealt again every second for BURN_TIME,
//           gold = multiplier on gold from this tower's pops, heavy = cracks armor
export const TOWERS = {

    dart: {
        name: "Dart", color: "#e5e5e5", unlock: 1,
        desc: "Quick darts at single balloons",
        dmg: 1, rate: 1.6, range: 125,
        paths: [
            {name: "Sharp", tiers: [
                {name: "Sharp Darts",  desc: "+1 pierce",                    effects: {pierce: 1}},
                {name: "Razor Tips",   desc: "x1.4 damage",                  effects: {dmg: 1.4}},
                {name: "Heavy Darts",  desc: "cracks armor, x1.4 damage",    effects: {heavy: true, dmg: 1.4}},
                {name: "Spike Storm",  desc: "+2 pierce, x1.6 damage",       effects: {pierce: 2, dmg: 1.6}},
                {name: "Juggernaut",   desc: "+3 pierce, x2.5 damage",       effects: {pierce: 3, dmg: 2.5}}
            ]},
            {name: "Volley", tiers: [
                {name: "Quick Hands",  desc: "x1.25 attack speed",           effects: {rate: 1.25}},
                {name: "Twin Darts",   desc: "+1 target",                    effects: {targets: 1}},
                {name: "Triple Darts", desc: "+1 target, x1.2 attack speed", effects: {targets: 1, rate: 1.2}},
                {name: "Fan of Darts", desc: "+2 targets",                   effects: {targets: 2}},
                {name: "Dart Tempest", desc: "+2 targets, x2 attack speed",  effects: {targets: 2, rate: 2}}
            ]},
            {name: "Bounty", tiers: [
                {name: "Long Shot",    desc: "x1.2 range",                   effects: {range: 1.2}},
                {name: "Eagle Eye",    desc: "x1.15 range, x1.3 damage",     effects: {range: 1.15, dmg: 1.3}},
                {name: "Plunder",      desc: "x1.5 gold from its pops",      effects: {gold: 1.5}},
                {name: "Treasure Hunt", desc: "x1.5 gold, x1.3 damage",      effects: {gold: 1.5, dmg: 1.3}},
                {name: "Golden Darts", desc: "x2 gold, x1.5 damage",         effects: {gold: 2, dmg: 1.5}}
            ]}
        ]
    },

    cannon: {
        name: "Cannon", color: "#ff9a5a", unlock: 5,
        desc: "Shells that splash groups and crack armor",
        dmg: 1.9, rate: 0.6, range: 120, splash: 42, heavy: true,
        paths: [
            {name: "Blast", tiers: [
                {name: "Bigger Bombs", desc: "x1.25 blast radius",           effects: {splash: 1.25}},
                {name: "Heavy Shells", desc: "x1.4 damage",                  effects: {dmg: 1.4}},
                {name: "Impact",       desc: "blasts stun balloons",         effects: {stun: 0.35}},
                {name: "Bigger Boom",  desc: "x1.3 radius, x1.5 damage",     effects: {splash: 1.3, dmg: 1.5}},
                {name: "Megaton",      desc: "x2.5 damage",                  effects: {dmg: 2.5}}
            ]},
            {name: "Barrage", tiers: [
                {name: "Fast Reload",  desc: "x1.25 attack speed",           effects: {rate: 1.25}},
                {name: "Long Barrel",  desc: "x1.25 range",                  effects: {range: 1.25}},
                {name: "Rapid Fire",   desc: "x1.4 attack speed",            effects: {rate: 1.4}},
                {name: "Twin Cannons", desc: "+1 target",                    effects: {targets: 1}},
                {name: "Bombardment",  desc: "+1 target, x1.8 attack speed", effects: {targets: 1, rate: 1.8}}
            ]},
            {name: "Fire", tiers: [
                {name: "Hot Shells",   desc: "burns 15% of a hit per second", effects: {burn: 0.15}},
                {name: "Incendiary",   desc: "+15% burn",                    effects: {burn: 0.15}},
                {name: "Napalm",       desc: "+10% burn, x1.3 damage",       effects: {burn: 0.1, dmg: 1.3}},
                {name: "Firestorm",    desc: "+10% burn, x1.3 blast radius", effects: {burn: 0.1, splash: 1.3}},
                {name: "Inferno",      desc: "+25% burn, x2 damage",         effects: {burn: 0.25, dmg: 2}}
            ]}
        ]
    },

    frost: {
        name: "Frost", color: "#7dd3fc", unlock: 10,
        desc: "Pulses that slow everything nearby",
        dmg: 1, rate: 0.8, range: 105, slow: 0.3, slowTime: 1.2, area: true,
        paths: [
            {name: "Freeze", tiers: [
                {name: "Deep Freeze",  desc: "+15% slow",                    effects: {slow: 0.15}},
                {name: "Ice Shards",   desc: "x1.6 damage",                  effects: {dmg: 1.6}},
                {name: "Permafrost",   desc: "+10% slow, lasts longer",      effects: {slow: 0.1, slowTime: 1.5}},
                {name: "Flash Freeze", desc: "pulses freeze balloons",       effects: {stun: 0.4}},
                {name: "Absolute Zero", desc: "longer freeze, x2.5 damage",  effects: {stun: 0.4, dmg: 2.5}}
            ]},
            {name: "Brittle", tiers: [
                {name: "Cold Snap",    desc: "x1.4 damage",                  effects: {dmg: 1.4}},
                {name: "Brittle",      desc: "slowed balloons take +20% damage", effects: {brittle: 0.2}},
                {name: "Shatter",      desc: "+20% brittle",                 effects: {brittle: 0.2}},
                {name: "Cryo Spikes",  desc: "cracks armor, x1.6 damage",    effects: {heavy: true, dmg: 1.6}},
                {name: "Glacial Ruin", desc: "+40% brittle, x1.5 damage",    effects: {brittle: 0.4, dmg: 1.5}}
            ]},
            {name: "Blizzard", tiers: [
                {name: "Wide Chill",   desc: "x1.2 range",                   effects: {range: 1.2}},
                {name: "Arctic Wind",  desc: "x1.25 attack speed",           effects: {rate: 1.25}},
                {name: "Blizzard",     desc: "x1.15 range, x1.25 speed",     effects: {range: 1.15, rate: 1.25}},
                {name: "Polar Vortex", desc: "x1.5 damage, x1.2 speed",      effects: {dmg: 1.5, rate: 1.2}},
                {name: "Ice Age",      desc: "x1.2 range, x1.6 speed",       effects: {range: 1.2, rate: 1.6}}
            ]}
        ]
    },

    sniper: {
        name: "Sniper", color: "#63d69f", unlock: 15,
        desc: "Hits anything on the map, cracks armor",
        dmg: 2, rate: 0.45, range: Infinity, heavy: true, target: "strong",
        paths: [
            {name: "Caliber", tiers: [
                {name: "Full Metal",   desc: "x1.4 damage",                  effects: {dmg: 1.4}},
                {name: "Large Caliber", desc: "x1.4 damage",                 effects: {dmg: 1.4}},
                {name: "Deadly Aim",   desc: "x1.8 damage",                  effects: {dmg: 1.8}},
                {name: "Maim",         desc: "shots stun balloons",          effects: {stun: 0.5}},
                {name: "Cripple",      desc: "x2.5 damage, x2 to bosses",    effects: {dmg: 2.5, boss: 2}}
            ]},
            {name: "Rapid", tiers: [
                {name: "Night Scope",  desc: "x1.25 attack speed",           effects: {rate: 1.25}},
                {name: "Fast Bolt",    desc: "x1.3 attack speed",            effects: {rate: 1.3}},
                {name: "Semi-Auto",    desc: "x1.6 attack speed",            effects: {rate: 1.6}},
                {name: "Full Auto",    desc: "x1.5 attack speed",            effects: {rate: 1.5}},
                {name: "Elite Sniper", desc: "x1.6 speed, x1.5 damage",      effects: {rate: 1.6, dmg: 1.5}}
            ]},
            {name: "Rail", tiers: [
                {name: "Ricochet",     desc: "hits 1 more balloon",          effects: {pierce: 1}},
                {name: "Bounce Shot",  desc: "hits 1 more balloon",          effects: {pierce: 1}},
                {name: "Railgun",      desc: "hits 2 more, x1.3 damage",     effects: {pierce: 2, dmg: 1.3}},
                {name: "Executioner",  desc: "x3 damage to bosses",          effects: {boss: 3}},
                {name: "Annihilator",  desc: "hits 3 more, x2 damage",       effects: {pierce: 3, dmg: 2}}
            ]}
        ]
    },

    tesla: {
        name: "Tesla", color: "#c58cff", unlock: 25,
        desc: "Lightning that jumps between balloons",
        dmg: 3.4, rate: 0.9, range: 115, chain: 3, falloff: 0.75,
        paths: [
            {name: "Arc", tiers: [
                {name: "Arc",          desc: "+1 jump",                      effects: {chain: 1}},
                {name: "Fork",         desc: "+2 jumps",                     effects: {chain: 2}},
                {name: "Overcharge",   desc: "jumps barely weaken",          effects: {falloff: 0.9}},
                {name: "Storm Cell",   desc: "+3 jumps, x1.4 damage",        effects: {chain: 3, dmg: 1.4}},
                {name: "Zeus",         desc: "+4 jumps, x2 damage",          effects: {chain: 4, dmg: 2}}
            ]},
            {name: "Voltage", tiers: [
                {name: "High Voltage", desc: "x1.4 damage",                  effects: {dmg: 1.4}},
                {name: "Capacitor",    desc: "x1.3 attack speed",            effects: {rate: 1.3}},
                {name: "Plasma",       desc: "x1.7 damage",                  effects: {dmg: 1.7}},
                {name: "Shock",        desc: "bolts stun balloons",          effects: {stun: 0.3}},
                {name: "Ion Storm",    desc: "x2 speed, x1.5 damage",        effects: {rate: 2, dmg: 1.5}}
            ]},
            {name: "Static", tiers: [
                {name: "Conductor",    desc: "x1.2 range",                   effects: {range: 1.2}},
                {name: "Static Field", desc: "bolts slow 20%",               effects: {slow: 0.2}},
                {name: "Ground Wire",  desc: "cracks armor, x1.3 damage",    effects: {heavy: true, dmg: 1.3}},
                {name: "Lightning Rod", desc: "x1.2 range, +15% slow",       effects: {range: 1.2, slow: 0.15}},
                {name: "Thunder God",  desc: "x1.8 speed, x1.5 damage",      effects: {rate: 1.8, dmg: 1.5}}
            ]}
        ]
    },

    nova: {
        name: "Nova", color: "#f0abfc", unlock: 35,
        desc: "Blasts every balloon in range",
        dmg: 1.9, rate: 0.7, range: 92, area: true,
        paths: [
            {name: "Radiance", tiers: [
                {name: "Bright",       desc: "x1.4 damage",                  effects: {dmg: 1.4}},
                {name: "Flare",        desc: "x1.4 damage",                  effects: {dmg: 1.4}},
                {name: "Solar Wind",   desc: "burns 30% of a hit per second", effects: {burn: 0.3}},
                {name: "Radiant",      desc: "x1.8 damage",                  effects: {dmg: 1.8}},
                {name: "Hypernova",    desc: "x2.5 damage",                  effects: {dmg: 2.5}}
            ]},
            {name: "Pulse", tiers: [
                {name: "Pulse",        desc: "x1.25 attack speed",           effects: {rate: 1.25}},
                {name: "Throb",        desc: "x1.25 attack speed",           effects: {rate: 1.25}},
                {name: "Heartbeat",    desc: "x1.4 attack speed",            effects: {rate: 1.4}},
                {name: "Quasar",       desc: "x1.3 speed, x1.4 damage",      effects: {rate: 1.3, dmg: 1.4}},
                {name: "Magnetar",     desc: "x2 attack speed",              effects: {rate: 2}}
            ]},
            {name: "Gravity", tiers: [
                {name: "Expanse",      desc: "x1.15 range",                  effects: {range: 1.15}},
                {name: "Gravity Well", desc: "blasts slow 20%",              effects: {slow: 0.2}},
                {name: "Warp Field",   desc: "x1.15 range, +15% slow",       effects: {range: 1.15, slow: 0.15}},
                {name: "Singularity",  desc: "blasts stun briefly",          effects: {stun: 0.3}},
                {name: "Event Horizon", desc: "x1.2 range, x2 damage",       effects: {range: 1.2, dmg: 2}}
            ]}
        ]
    }

};

export const TOWER_IDS = Object.keys(TOWERS);

export const PROJECTILE_SPEED = {dart: 620, cannon: 380};
export const CHAIN_RANGE = 90;          // how far tesla lightning can jump
export const PIERCE_RANGE = 26;         // how far a piercing dart reaches past its target
export const BURN_TIME = 3;             // seconds a burn lasts
export const STUN_IMMUNE = 1;           // seconds a balloon can't be stunned again (bosses never are)
export const MAX_SHOTS = 8;             // shots one tower may fire in a single step


/* ---------------- Placing ---------------- */
// The first tower is free, every tower after costs more. Selling refunds
// part of what that tower cost (type levels stay, they are shared).

export const TOWER_RADIUS = 14;         // footprint: towers can't overlap each other or the path
export const PLACE_BASE = 40;
export const PLACE_GROWTH = 3;
export const SELL_REFUND = 0.7;


/* ---------------- Troops ---------------- */
// Guards stand on the path at the rally point and block one balloon each.

export const TROOP_DMG = 3;             // per hit
export const TROOP_HP = 8;
export const TROOP_INTERVAL = 0.5;      // seconds between hits
export const TROOP_RESPAWN = 6;         // seconds
export const TROOP_CAP = 8;
export const TROOP_UNLOCK = 8;          // wave

// cost of the next level = ceil(base * growth^level); `max` is optional
export const TROOP_UPGRADES = [
    {id: "recruits", name: "Recruits", desc: "+1 guard on the path",       base: 150, growth: 7,    max: 5},
    {id: "weapons",  name: "Weapons",  desc: "guard damage",               base: 60,  growth: LEVEL_GROWTH, start: 1},
    {id: "armor",    name: "Armor",    desc: "guard health",               base: 50,  growth: LEVEL_GROWTH, start: 1},
    {id: "drills",   name: "Drills",   desc: "guards return 10% sooner",   base: 400, growth: 3,    max: 10}
];


/* ---------------- Gold upgrades ---------------- */

export const UPGRADES = [
    {id: "bounty",    name: "Bounty",    desc: "x1.1 gold",             base: 250, growth: 2.4},
    {id: "overclock", name: "Overclock", desc: "+4% attack speed",      base: 400, growth: 2.1, max: 25},
    {id: "walls",     name: "Walls",     desc: "+5 lives",              base: 300, growth: 3,   max: 10}
];

export const BOUNTY_STEP = 1.1;
export const OVERCLOCK_STEP = 0.04;
export const WALL_LIVES = 5;


/* ---------------- Ascension ---------------- */
// Ascending trades the run (gold, levels, towers, troops, wave) for stars.
// Stars light up the constellation, and every star ever earned adds damage.

export const ASCEND_MIN = 30;           // best wave this run before ascending pays
export const STAR_OFFSET = 20;
export const STAR_DIVISOR = 6;
export const STAR_POWER = 1.6;
export const STAR_DAMAGE = 0.05;        // +5% damage per star earned (lifetime)
