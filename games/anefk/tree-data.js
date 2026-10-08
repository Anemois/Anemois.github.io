/*
 * SKILL TREE DATA  (data only, no logic)
 *
 * To add a node, append an entry to TREE:
 *
 *   { id, name, desc, cost, x, y, requires, effects }
 *
 *   x, y      grid position. (0,0) is the centre, +x right, +y down.
 *             The map and its scroll area grow automatically.
 *   requires  ids of linked nodes; the node unlocks when ANY of them is owned.
 *             Use [] for the root. Links are drawn automatically.
 *   effects   { stat: value } using the stats below.
 *             "mul" stats multiply (1.5 = +50%, 0.9 = -10%), "add" stats add.
 *
 * To add a new stat, define it in TREE_STATS and read it from `mods`
 * (e.g. mods.myStat in economy.js).
 */

export const TREE_STATS = {

    all:           {mode:"mul"},   // production and every orb
    helper:        {mode:"mul"},   // helper output
    golden:        {mode:"mul"},   // golden orb value
    helperCost:    {mode:"mul"},   // helper prices (<1 is cheaper)
    seekerSpeed:   {mode:"mul"},
    goldGain:      {mode:"mul"},   // gold earned on prestige
    goldenDelay:   {mode:"mul"},   // time between golden orbs (<1 is sooner)

    goldenSeconds: {mode:"add"},   // extra seconds of production in golden orbs
    seekers:       {mode:"add"},
    orbs:          {mode:"add"},   // extra orbs on screen
    startBlobs:    {mode:"add"}    // blobs to start each run with

};


export const TREE = [

    // centre
    {id:"core", name:"Blob Core", desc:"x1.25 everything",
     cost:1, x:0, y:0, requires:[], effects:{all:1.25}},


    // left arm: helpers
    {id:"workers", name:"Efficient Workers", desc:"x1.5 helper output",
     cost:2, x:-1, y:0, requires:["core"], effects:{helper:1.5}},

    {id:"bulk", name:"Bulk Orders", desc:"Helpers cost 10% less",
     cost:5, x:-2, y:0, requires:["workers"], effects:{helperCost:0.9}},

    {id:"automation", name:"Automation", desc:"x2 helper output",
     cost:15, x:-3, y:0, requires:["bulk"], effects:{helper:2}},


    // right arm: golden orbs
    {id:"sharp", name:"Sharper Orbs", desc:"x2 golden orb value",
     cost:2, x:1, y:0, requires:["core"], effects:{golden:2}},

    {id:"focus", name:"Deep Focus", desc:"+30s of production in golden orbs",
     cost:6, x:2, y:0, requires:["sharp"], effects:{goldenSeconds:30}},

    {id:"surge", name:"Orb Surge", desc:"x3 golden orb value",
     cost:18, x:3, y:0, requires:["focus"], effects:{golden:3}},

    {id:"midas", name:"Midas Lure", desc:"Golden orbs appear 25% sooner",
     cost:14, x:2, y:-1, requires:["wide", "focus"], effects:{goldenDelay:0.75}},


    // top arm: seekers
    {id:"drive", name:"Seeker Drive", desc:"Seekers move 50% faster",
     cost:3, x:0, y:-1, requires:["core"], effects:{seekerSpeed:1.5}},

    {id:"twin", name:"Twin Seekers", desc:"+1 seeker",
     cost:10, x:0, y:-2, requires:["drive"], effects:{seekers:1}},


    // bottom arm: economy
    {id:"headstart", name:"Head Start", desc:"Start each run with 100K blobs",
     cost:3, x:0, y:1, requires:["core"], effects:{startBlobs:1e5}},

    {id:"rush", name:"Gold Rush", desc:"x1.5 gold from prestige",
     cost:8, x:0, y:2, requires:["headstart"], effects:{goldGain:1.5}},


    // diagonals: link two arms together
    {id:"synergy", name:"Synergy", desc:"x1.25 everything",
     cost:8, x:-1, y:-1, requires:["workers", "drive"], effects:{all:1.25}},

    {id:"wide", name:"Wide Field", desc:"+1 orb on screen",
     cost:8, x:1, y:-1, requires:["sharp", "drive"], effects:{orbs:1}},

    {id:"nest", name:"Nest Egg", desc:"Start each run with +2M blobs",
     cost:12, x:-1, y:1, requires:["workers", "headstart"], effects:{startBlobs:2e6}},

    {id:"lucky", name:"Lucky Orbs", desc:"x1.25 gold from prestige",
     cost:10, x:1, y:1, requires:["sharp", "headstart"], effects:{goldGain:1.25}}

];
