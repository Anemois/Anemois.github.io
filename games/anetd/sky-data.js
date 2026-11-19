/*
 * CONSTELLATION DATA  (data only, no logic)
 *
 * Stars bought with ascension. To add one, append an entry to SKY:
 *
 *   { id, name, desc, cost, x, y, requires, effects }
 *
 *   x, y      grid position. (0,0) is the centre, +x right, +y down.
 *             The map and its scroll area grow automatically.
 *   requires  ids of linked stars; it unlocks when ANY of them is owned.
 *             Use [] for the root. Links are drawn automatically.
 *   effects   { stat: value } using the stats below.
 *             "mul" stats multiply (1.5 = +50%, 0.8 = -20%), "add" stats add.
 *
 * To add a new stat, define it in SKY_STATS and read it from `mods`.
 */

export const SKY_STATS = {

    dmg:        {mode: "mul"},  // every tower
    rate:       {mode: "mul"},  // attack speed
    range:      {mode: "mul"},
    boss:       {mode: "mul"},  // damage to bosses
    dartDmg:    {mode: "mul"},
    cannonDmg:  {mode: "mul"},
    frostDmg:   {mode: "mul"},
    sniperDmg:  {mode: "mul"},
    teslaDmg:   {mode: "mul"},
    novaDmg:    {mode: "mul"},
    troopDmg:   {mode: "mul"},
    troopHp:    {mode: "mul"},
    gold:       {mode: "mul"},
    clear:      {mode: "mul"},  // wave clear bonus
    levelCost:  {mode: "mul"},  // tower level and upgrade prices (<1 is cheaper)
    placeCost:  {mode: "mul"},  // price of placing a tower
    stars:      {mode: "mul"},  // stars from ascending
    offline:    {mode: "mul"},  // gold earned while away

    troops:     {mode: "add"},  // extra guards (once you have one)
    lives:      {mode: "add"},
    slow:       {mode: "add"},  // frost slow
    startGold:  {mode: "add"},  // gold to start each run with
    speed:      {mode: "add"},  // extra game speed settings (x2, x3)
    blitz:      {mode: "add"},  // 1 = waves below half your best spawn twice as fast
    autobuy:    {mode: "add"}   // 1 = tower levels buy themselves

};


export const SKY = [

    // centre
    {id: "polaris", name: "Polaris", desc: "x1.5 tower damage",
     cost: 1, x: 0, y: 0, requires: [], effects: {dmg: 1.5}},


    // left arm: towers
    {id: "whetstone", name: "Whetstone", desc: "x1.5 tower damage",
     cost: 2, x: -1, y: 0, requires: ["polaris"], effects: {dmg: 1.5}},

    {id: "trigger", name: "Hair Trigger", desc: "x1.25 attack speed",
     cost: 5, x: -2, y: 0, requires: ["whetstone"], effects: {rate: 1.25}},

    {id: "sight", name: "Long Sight", desc: "x1.15 tower range",
     cost: 6, x: -2, y: -1, requires: ["trigger", "fortress"], effects: {range: 1.15}},

    {id: "arsenal", name: "Arsenal", desc: "x2 tower damage",
     cost: 20, x: -3, y: 0, requires: ["trigger"], effects: {dmg: 2}},


    // far left: one specialist per tower type
    {id: "fletcher", name: "Fletcher", desc: "x3 Dart damage",
     cost: 12, x: -4, y: -2.5, requires: ["arsenal"], effects: {dartDmg: 3}},

    {id: "demolition", name: "Demolition", desc: "x3 Cannon damage",
     cost: 12, x: -4, y: -1.5, requires: ["arsenal"], effects: {cannonDmg: 3}},

    {id: "glacier", name: "Glacier", desc: "x3 Frost damage, +10% slow",
     cost: 12, x: -4, y: -0.5, requires: ["arsenal"], effects: {frostDmg: 3, slow: 0.1}},

    {id: "marksman", name: "Marksman", desc: "x3 Sniper damage",
     cost: 12, x: -4, y: 0.5, requires: ["arsenal"], effects: {sniperDmg: 3}},

    {id: "conductor", name: "Conductor", desc: "x3 Tesla damage",
     cost: 12, x: -4, y: 1.5, requires: ["arsenal"], effects: {teslaDmg: 3}},

    {id: "radiance", name: "Radiance", desc: "x3 Nova damage",
     cost: 12, x: -4, y: 2.5, requires: ["arsenal"], effects: {novaDmg: 3}},


    // top arm: troops
    {id: "drill", name: "Drill Sergeant", desc: "x1.5 guard damage and health",
     cost: 2, x: 0, y: -1, requires: ["polaris"], effects: {troopDmg: 1.5, troopHp: 1.5}},

    {id: "reinforce", name: "Reinforcements", desc: "+1 guard",
     cost: 6, x: 0, y: -2, requires: ["drill"], effects: {troops: 1}},

    {id: "bulwark", name: "Bulwark", desc: "x2 guard health",
     cost: 10, x: 0, y: -3, requires: ["reinforce"], effects: {troopHp: 2}},

    {id: "legion", name: "Legion", desc: "+1 guard, x2 guard damage",
     cost: 25, x: 0, y: -4, requires: ["bulwark"], effects: {troops: 1, troopDmg: 2}},


    // right arm: gold
    {id: "bounty", name: "Bounty Hunter", desc: "x1.5 gold",
     cost: 2, x: 1, y: 0, requires: ["polaris"], effects: {gold: 1.5}},

    {id: "headstart", name: "Head Start", desc: "Start each run with 5K gold",
     cost: 4, x: 2, y: 0, requires: ["bounty"], effects: {startGold: 5000}},

    {id: "windfall", name: "Windfall", desc: "x2 wave clear bonus",
     cost: 6, x: 2, y: -1, requires: ["headstart", "land"], effects: {clear: 2}},

    {id: "discount", name: "Discount", desc: "Tower levels and upgrades cost 20% less",
     cost: 8, x: 3, y: 0, requires: ["headstart"], effects: {levelCost: 0.8}},

    {id: "midas", name: "Midas", desc: "x2 gold",
     cost: 25, x: 4, y: 0, requires: ["discount"], effects: {gold: 2}},

    {id: "quartermaster", name: "Quartermaster", desc: "Spends half your gold on the cheapest tower type levels every few seconds (toggle in Towers)",
     cost: 10, x: 3, y: 1, requires: ["discount"], effects: {autobuy: 1}},


    // bottom arm: time and stars
    {id: "stargazer", name: "Stargazer", desc: "x1.25 stars from ascending",
     cost: 3, x: 0, y: 1, requires: ["polaris"], effects: {stars: 1.25}},

    {id: "warp", name: "Time Warp", desc: "Unlocks x2 game speed",
     cost: 6, x: 0, y: 2, requires: ["stargazer"], effects: {speed: 1}},

    {id: "blitz", name: "Blitz", desc: "Waves below half your best wave spawn twice as fast",
     cost: 8, x: 0, y: 3, requires: ["warp"], effects: {blitz: 1}},

    {id: "hyper", name: "Hyperdrive", desc: "Unlocks x3 game speed",
     cost: 30, x: 0, y: 4, requires: ["blitz"], effects: {speed: 1}},

    {id: "supernova", name: "Supernova", desc: "x1.5 stars from ascending",
     cost: 30, x: 1, y: 3, requires: ["blitz", "dreamer"], effects: {stars: 1.5}},


    // diagonals: link two arms together
    {id: "fortress", name: "Fortress", desc: "+10 lives",
     cost: 4, x: -1, y: -1, requires: ["whetstone", "drill"], effects: {lives: 10}},

    {id: "land", name: "Cheap Land", desc: "Placing towers costs 50% less",
     cost: 5, x: 1, y: -1, requires: ["bounty", "drill"], effects: {placeCost: 0.5}},

    {id: "slayer", name: "Giant Slayer", desc: "x2 damage to bosses",
     cost: 6, x: -1, y: 1, requires: ["whetstone", "stargazer"], effects: {boss: 2}},

    {id: "dreamer", name: "Dreamer", desc: "x2 gold while away",
     cost: 5, x: 1, y: 1, requires: ["bounty", "stargazer"], effects: {offline: 2}},


    // deep sky: long-term goals between the arms
    {id: "pulsar", name: "Pulsar", desc: "x1.5 attack speed",
     cost: 40, x: -2, y: 1, requires: ["trigger", "slayer"], effects: {rate: 1.5}},

    {id: "supergiant", name: "Supergiant", desc: "x3 tower damage",
     cost: 60, x: -3, y: 1, requires: ["arsenal", "pulsar"], effects: {dmg: 3}},

    {id: "phalanx", name: "Phalanx", desc: "x3 guard damage and health",
     cost: 40, x: 1, y: -2, requires: ["reinforce", "land"], effects: {troopDmg: 3, troopHp: 3}},

    {id: "blackhole", name: "Black Hole", desc: "x2 gold, x1.25 stars from ascending",
     cost: 80, x: 2, y: 2, requires: ["supernova", "quartermaster"], effects: {gold: 2, stars: 1.25}}

];
