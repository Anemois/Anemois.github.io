/* ---------------- Tuning ---------------- */
// Everything that sets the feel of the game lives here.

export const STEP = 1 / 60;             // simulation step, seconds
export const TILE = 32;                 // world units per tile

export const PLAYER = {
    radius: 11,
    speed: 175,
    hp: 6,
    shield: 4,
    energy: 200,
    shieldDelay: 3,                     // seconds without damage before the shield refills
    shieldRate: 1.2,                    // seconds per shield point
    energyRegen: 1.5,                   // energy per second during a run
    hurtTime: 0.7,                      // invulnerable after a hit
    dashSpeed: 560,
    dashTime: 0.16,
    dashCooldown: 0.9,
    pickupRange: 90,                    // energy orbs and shards fly to you from here
    reviveRange: 44,                    // stand this close to a fallen friend...
    reviveTime: 2.5,                    // ...for this long to get them up
    reviveHp: 3
};

// Run structure: floors come in worlds of three, the third has the boss.
export const FLOORS_PER_WORLD = 3;
export const ENEMY_HP_GROWTH = 1.14;    // per floor
export const LEVEL_DAMAGE = 1.12;       // weapon damage per level
export const CRIT_MULTIPLIER = 2;
export const SHARD_DROP = 0.25;         // chance an enemy drops a shard

// world colours: floor tint and wall tint, cycling after the last one
export const WORLDS = [
    {name: "Crypt",   floor: "#101010", line: "#171717", wall: "#1f1f1f", top: "#2b2b2b"},
    {name: "Grove",   floor: "#0d120e", line: "#142017", wall: "#1a241c", top: "#25352a"},
    {name: "Abyss",   floor: "#0f0d14", line: "#1a1622", wall: "#211c2b", top: "#2f2840"},
    {name: "Furnace", floor: "#140f0c", line: "#21170f", wall: "#2a1d14", top: "#3b291c"}
];


/* ---------------- Rarities ---------------- */
// Higher rarities are rarer, better and flashier (see sprites.js and the
// weapon list below). Drop weights are adjusted per source in loot.js.

export const RARITIES = [
    {id: "common",    name: "Common",    color: "#b0b4bb", weight: 46,  salvage: 4},
    {id: "uncommon",  name: "Uncommon",  color: "#63d69f", weight: 28,  salvage: 8},
    {id: "rare",      name: "Rare",      color: "#61a8ff", weight: 15,  salvage: 16},
    {id: "epic",      name: "Epic",      color: "#c58cff", weight: 7.5, salvage: 32},
    {id: "legendary", name: "Legendary", color: "#facc15", weight: 2.6, salvage: 70},
    {id: "mythic",    name: "Mythic",    color: "#ff5c7a", weight: 0.7, salvage: 160}
];

export const RARITY = Object.fromEntries(RARITIES.map((r, i) => [r.id, {...r, tier: i}]));


/* ---------------- Weapons ---------------- */
// kind:
//   gun     fires projectiles while held
//   melee   swings an arc; swings also knock enemy bullets out of the air
//   charge  hold to charge, release to fire (damage scales with charge)
//   beam    a continuous ray while held (energy per second)
// projectile fields: count, spread (degrees), speed, size, life (seconds),
//   pierce, bounce, explode (radius), homing (turn rate), slow, burn,
//   pull (radius), burst (shots per trigger) and burstGap
// melee fields: range, arc (degrees), wave (also throws a slash), shock (radius)
// dmg is per hit at level 1; rate is attacks per second; energy per attack
// (per second for beams). Lobby weapons never use energy.
//
// shape: how it is drawn, pointing right from the grip, as primitives:
//   ["rect", x, y, w, h, colour] | ["poly", [[x, y]...], colour] | ["circle", x, y, r, colour]
//   colour: "body" (light), "dark", "accent" (the rarity colour) or a hex value

export const WEAPONS = [

    // common
    {id: "pistol", name: "Pistol", rarity: "common", kind: "gun",
     dmg: 4, rate: 4, energy: 0, spread: 4, speed: 540, size: 4, life: 1.2, crit: 0.05,
     shape: [["rect", 0, -3, 15, 5, "body"], ["rect", 1, 1, 5, 7, "dark"], ["rect", 11, -3, 4, 2, "accent"]]},

    {id: "sword", name: "Short Sword", rarity: "common", kind: "melee",
     dmg: 7, rate: 2.6, energy: 0, range: 54, arc: 110, crit: 0.05,
     shape: [["rect", -2, -1.5, 8, 3, "dark"], ["rect", 6, -5, 2, 10, "accent"], ["poly", [[8, -2.5], [30, -1.5], [34, 0], [30, 1.5], [8, 2.5]], "body"]]},

    {id: "shotgun", name: "Old Shotgun", rarity: "common", kind: "gun",
     dmg: 2.6, rate: 1.5, energy: 2, count: 5, spread: 28, speed: 480, size: 3.5, life: 0.5, crit: 0.05,
     shape: [["rect", 0, -3, 24, 5, "body"], ["rect", -4, -2, 6, 6, "dark"], ["rect", 18, -4, 6, 2, "accent"]]},

    // uncommon
    {id: "smg", name: "SMG", rarity: "uncommon", kind: "gun",
     dmg: 2.6, rate: 9, energy: 0.5, spread: 11, speed: 560, size: 3, life: 0.9, crit: 0.05,
     shape: [["rect", 0, -3, 18, 5, "body"], ["rect", 5, 2, 3, 8, "dark"], ["rect", 1, 1, 3, 5, "dark"], ["rect", 14, -4, 4, 2, "accent"]]},

    {id: "bow", name: "Hunting Bow", rarity: "uncommon", kind: "charge",
     dmg: 22, rate: 1.6, energy: 1, charge: 0.6, minCharge: 0.3, speed: 640, size: 3.5, life: 1.2, pierce: 1, crit: 0.1,
     shape: [["poly", [[2, -14], [8, -8], [10, 0], [8, 8], [2, 14], [5, 8], [6, 0], [5, -8]], "body"], ["rect", 2, -13, 1, 26, "accent"]]},

    {id: "spear", name: "Spear", rarity: "uncommon", kind: "melee",
     dmg: 10, rate: 2, energy: 0, range: 80, arc: 34, crit: 0.08,
     shape: [["rect", -6, -1.5, 34, 3, "dark"], ["poly", [[28, -4], [42, 0], [28, 4]], "accent"]]},

    // rare
    {id: "rifle", name: "Assault Rifle", rarity: "rare", kind: "gun",
     dmg: 4.2, rate: 2.6, energy: 1, burst: 3, burstGap: 0.07, spread: 5, speed: 620, size: 3.5, life: 1.1, crit: 0.07,
     shape: [["rect", 0, -3, 26, 5, "body"], ["rect", -5, -2, 6, 6, "dark"], ["rect", 7, 2, 3, 7, "dark"], ["rect", 20, -4.5, 6, 2, "accent"]]},

    {id: "launcher", name: "Grenade Launcher", rarity: "rare", kind: "gun",
     dmg: 20, rate: 1.1, energy: 3, speed: 360, size: 6, life: 0.85, explode: 62, crit: 0.05,
     shape: [["rect", 0, -4, 22, 8, "body"], ["circle", 9, 0, 3, "dark"], ["rect", 3, 3, 4, 7, "dark"], ["rect", 18, -5, 4, 2, "accent"]]},

    {id: "twinblades", name: "Twin Blades", rarity: "rare", kind: "melee",
     dmg: 6, rate: 5, energy: 0, range: 50, arc: 150, crit: 0.12,
     shape: [["poly", [[2, -6], [26, -3], [2, -1]], "body"], ["poly", [[2, 1], [26, 3], [2, 6]], "body"], ["rect", -3, -2, 6, 4, "accent"]]},

    {id: "bouncer", name: "Ricochet", rarity: "rare", kind: "gun",
     dmg: 6, rate: 4, energy: 1, spread: 5, speed: 500, size: 4, life: 1.6, bounce: 3, crit: 0.06,
     shape: [["rect", 0, -3, 17, 6, "body"], ["circle", 17, 0, 3.5, "accent"], ["rect", 2, 2, 4, 6, "dark"]]},

    // epic
    {id: "laser", name: "Laser Rifle", rarity: "epic", kind: "beam",
     dmg: 30, rate: 1, energy: 9, range: 420, pierce: 3, crit: 0.05,
     shape: [["rect", 0, -3, 26, 6, "dark"], ["rect", 4, -1, 22, 2, "accent"], ["rect", 3, 3, 4, 6, "dark"]]},

    {id: "frost", name: "Frost Cannon", rarity: "epic", kind: "gun",
     dmg: 11, rate: 2, energy: 2, speed: 300, size: 7, life: 1.3, slow: 0.5, pierce: 1, crit: 0.06, color: "#7dd3fc",
     shape: [["rect", 0, -4, 20, 8, "body"], ["poly", [[20, -6], [27, 0], [20, 6]], "accent"], ["rect", 3, 3, 4, 6, "dark"]]},

    {id: "hammer", name: "Thunder Hammer", rarity: "epic", kind: "melee",
     dmg: 20, rate: 1.2, energy: 0, range: 62, arc: 120, shock: 90, crit: 0.08,
     shape: [["rect", -6, -1.5, 30, 3, "dark"], ["rect", 22, -9, 10, 18, "body"], ["rect", 24, -9, 2, 18, "accent"]]},

    {id: "seeker", name: "Seeker Pod", rarity: "epic", kind: "gun",
     dmg: 8.5, rate: 1.6, energy: 3, count: 3, spread: 40, speed: 330, size: 4.5, life: 2, homing: 5, explode: 34, crit: 0.06,
     shape: [["rect", 0, -5, 18, 10, "body"], ["circle", 6, -2, 1.6, "accent"], ["circle", 11, 2, 1.6, "accent"], ["circle", 16, -2, 1.6, "accent"]]},

    // legendary
    {id: "dragon", name: "Dragon's Breath", rarity: "legendary", kind: "gun",
     dmg: 3.4, rate: 14, energy: 0.6, count: 2, spread: 26, speed: 320, size: 6, life: 0.5, pierce: 99, burn: 0.6, crit: 0.05, color: "#ff9a5a",
     shape: [["rect", 0, -4, 20, 8, "dark"], ["poly", [[20, -6], [28, -3], [28, 3], [20, 6]], "accent"], ["rect", 5, -2, 10, 4, "#ff9a5a"]]},

    {id: "starfall", name: "Starfall", rarity: "legendary", kind: "charge",
     dmg: 16, rate: 1.1, energy: 4, charge: 0.8, minCharge: 0.4, rain: 6, explode: 46, crit: 0.1,
     shape: [["poly", [[2, -15], [9, -8], [11, 0], [9, 8], [2, 15], [6, 8], [7, 0], [6, -8]], "accent"], ["rect", 2, -14, 1, 28, "body"], ["circle", 12, 0, 2.5, "#ffffff"]]},

    {id: "railgun", name: "Railgun", rarity: "legendary", kind: "charge",
     dmg: 90, rate: 0.9, energy: 6, charge: 0.9, minCharge: 0.25, rail: 900, crit: 0.15,
     shape: [["rect", 0, -3, 34, 6, "dark"], ["rect", 6, -5, 26, 2, "accent"], ["rect", 6, 3, 26, 2, "accent"], ["rect", 3, 3, 4, 7, "dark"]]},

    // mythic
    {id: "void", name: "Void Scepter", rarity: "mythic", kind: "gun",
     dmg: 9, rate: 1.1, energy: 5, speed: 150, size: 12, life: 2.4, pierce: 999, pull: 110, tick: 0.2, crit: 0.08, color: "#8b5cf6",
     shape: [["rect", -6, -1.5, 30, 3, "dark"], ["circle", 28, 0, 6, "accent"], ["circle", 28, 0, 2.5, "#0b0b0b"]]},

    {id: "prism", name: "Prism", rarity: "mythic", kind: "beam",
     dmg: 48, rate: 1, energy: 10, range: 380, pierce: 1, chain: 4, crit: 0.08,
     shape: [["poly", [[4, -8], [22, 0], [4, 8]], "body"], ["poly", [[8, -4], [17, 0], [8, 4]], "accent"], ["rect", -4, -1.5, 8, 3, "dark"]]},

    {id: "excalibur", name: "Excalibur", rarity: "mythic", kind: "melee",
     dmg: 30, rate: 2.2, energy: 2, range: 70, arc: 130, wave: true, crit: 0.12,
     shape: [["rect", -3, -2, 9, 4, "dark"], ["rect", 6, -7, 3, 14, "accent"], ["poly", [[9, -3], [40, -2], [45, 0], [40, 2], [9, 3]], "#ffffff"]]}

];

export const WEAPON = Object.fromEntries(WEAPONS.map(w => [w.id, w]));

// what a new profile starts with (and the run loadout until changed)
export const STARTER_WEAPONS = ["pistol", "sword"];


/* ---------------- Enemies ---------------- */
// hp is at floor 1 (grows with ENEMY_HP_GROWTH); cost is how much of a
// pack's budget it uses; from = first floor it appears on.
// ai: chase | flutter | shooter | turret | charger | caster | bomber

export const ENEMIES = {
    slime:   {name: "Slime",   ai: "chase",   hp: 14, speed: 72,  radius: 12, cost: 1, from: 1, color: "#63d69f"},
    bat:     {name: "Bat",     ai: "flutter", hp: 8,  speed: 135, radius: 9,  cost: 1, from: 1, color: "#c58cff"},
    archer:  {name: "Archer",  ai: "shooter", hp: 16, speed: 62,  radius: 11, cost: 2, from: 1, color: "#ff7185", fire: 1.7, bullet: 175},
    turret:  {name: "Turret",  ai: "turret",  hp: 32, speed: 0,   radius: 13, cost: 2, from: 2, color: "#9ca3af", fire: 2.3, bullet: 140},
    bomber:  {name: "Bomber",  ai: "bomber",  hp: 12, speed: 98,  radius: 10, cost: 2, from: 2, color: "#facc15"},
    brute:   {name: "Brute",   ai: "charger", hp: 48, speed: 56,  radius: 16, cost: 3, from: 3, color: "#ff9a5a"},
    mage:    {name: "Mage",    ai: "caster",  hp: 26, speed: 52,  radius: 12, cost: 3, from: 4, color: "#61a8ff", fire: 3, bullet: 120}
};

export const ELITE = {hp: 2.6, radius: 1.3, cost: 2, from: 4, chance: 0.12};

// one pack per floor is led by a champion: a big elite that drops a chest
export const CHAMPION = {hp: 5, radius: 1.45};

// enemy bullet colours, by index (bullets carry the index, not the colour)
export const TINTS = ["#ff5c7a", "#61a8ff", "#facc15", "#c58cff"];

// Packs sleep until someone comes close; then the whole pack (and any pack
// right next to it) wakes. Far-off sleeping enemies are not simulated.
export const WAKE = {
    sight: 240,                         // a player this close, in view, wakes a pack
    touch: 90,                          // this close wakes it even round a corner
    spread: 190,                        // waking enemies rouse sleepers this close
    alert: 0.45,                        // the "!" pause before a woken enemy acts
    simulate: 960                       // sleepers further than this from everyone are skipped
};

// bosses rotate by world; hp at their first appearance (floor 3)
export const BOSSES = [
    {id: "warden",  name: "The Warden", hp: 950,  radius: 34, speed: 70,  color: "#e5e5e5", shape: "square",
     patterns: ["spiral", "slam", "summon", "walls"]},
    {id: "queen",   name: "Hive Queen", hp: 850,  radius: 28, speed: 120, color: "#c58cff", shape: "diamond",
     patterns: ["dash", "spray", "brood", "flower"]},
    {id: "eclipse", name: "Eclipse",    hp: 1050, radius: 30, speed: 80,  color: "#facc15", shape: "ring",
     patterns: ["lasers", "rings", "orbs", "blink"]}
];


/* ---------------- Meta ---------------- */

export const UPGRADE_BASE = 12;         // shards for the first weapon level-up
export const UPGRADE_GROWTH = 1.22;
