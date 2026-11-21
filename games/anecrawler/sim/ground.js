import {ZONES} from "./data.js";
import {wetAt, WATER_SLOW} from "./map.js";
import {VENT_PERIOD, VENT_BLAST} from "./mapgen.js";
import {emit, newId, damagePlayer, damageEnemy, isActive} from "./world.js";
import {near} from "./grid.js";


// What the ground does to whoever stands on it.
//
//   water      slows (map tiles, see map.js)
//   zones      burning ground and spore clouds that attacks leave behind
//              for a few seconds (state.zones); they hurt players standing
//              in them, and spores slow them too. Zones the players make
//              (ZONES[kind].team "p": acid, blaze) hurt enemies instead.
//   vents      the Furnace's floor vents: they glow, then burst into flame
//              (on a fixed beat from their phase, so every screen can show
//              the glow without being told)

const VENT_REACH = 30;          // how close to a vent's middle a burst hurts
const VENT_RANGE = 700;         // vents further than this from every player are skipped

const ventList = [];


// how fast someone can move here (1 = normal); `zones` may be left out
export function groundSpeed(map, zones, x, y){

    let k = wetAt(map, x, y) ? WATER_SLOW : 1;

    if(zones){

        for(const z of zones){

            const def = ZONES[z.kind];
            const slow = def.team === "p" ? 0 : def.slow;

            if(slow && (x - z.x) ** 2 + (y - z.y) ** 2 < z.r * z.r)
                k = Math.min(k, slow);

        }

    }

    return k;

}


const MAX_ZONES = 140;           // past this, the oldest burns out early


// leaves burning ground or a spore cloud (players' zones also carry
// {dps, pid}: how hard they hurt enemies, and who gets the kills)
export function addZone(state, kind, x, y, r, life, {dps = 0, pid = null} = {}){

    if(state.zones.length >= MAX_ZONES)
        state.zones.shift();

    state.zones.push({id: newId(state), kind, x, y, r, life, max: life, next: 0.15, dps, pid});

}


const zoneList = [];


export function updateZones(state, dt){

    if(!state.zones.length)
        return;

    for(const z of state.zones){

        z.life -= dt;
        z.next -= dt;

        if(z.next > 0)
            continue;

        const def = ZONES[z.kind];

        z.next = def.every;

        if(def.team === "p"){

            for(const e of near(state.grid, z.x, z.y, z.r, zoneList)){

                if(!isActive(e) || Math.hypot(e.x - z.x, e.y - z.y) > z.r + e.r * 0.5)
                    continue;

                damageEnemy(state, e, z.dps * def.every, {pid: z.pid, kind: def.hit});

                // acid clings: whatever stands in it wades through
                if(def.slow && !e.boss){

                    e.slow = Math.max(e.slowT > 0 ? e.slow : 0, def.slow);
                    e.slowT = Math.max(e.slowT, def.every + 0.1);

                }

            }

            continue;

        }

        for(const p of state.players){

            if(!p.dead && Math.hypot(p.x - z.x, p.y - z.y) < z.r + p.r * 0.4)
                damagePlayer(state, p, def.hurt);

        }

    }

    state.zones = state.zones.filter(z => z.life > 0);

}


// where a vent is in its beat: 0..VENT_PERIOD
export const ventCycle = (vent, time) =>
    ((time + vent.phase) % VENT_PERIOD + VENT_PERIOD) % VENT_PERIOD;


// Vents near a player that reach their burst this step go off: they
// scorch players and enemies standing on them alike.
export function updateVents(state, dt){

    const vents = state.map.vents;

    if(!vents.length)
        return;

    const start = VENT_PERIOD - VENT_BLAST;

    for(const v of vents){

        if(!state.players.some(p => Math.abs(p.x - v.x) < VENT_RANGE && Math.abs(p.y - v.y) < VENT_RANGE))
            continue;

        const now = ventCycle(v, state.time);
        const before = now - dt;

        if(!(before < start && now >= start))
            continue;

        emit(state, "vent", {x: v.x, y: v.y});

        for(const p of state.players){

            if(!p.dead && Math.hypot(p.x - v.x, p.y - v.y) < VENT_REACH + p.r * 0.5)
                damagePlayer(state, p, 1);

        }

        for(const e of near(state.grid, v.x, v.y, VENT_REACH + 20, ventList)){

            if(isActive(e) && !e.boss && Math.hypot(e.x - v.x, e.y - v.y) < VENT_REACH + e.r * 0.5)
                damageEnemy(state, e, e.maxHp * 0.2, {kind: "burn"});

        }

    }

}
