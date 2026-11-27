import {WIDTH, HEIGHT, spawnOrb} from "./orbs.js";
import {speed} from "./orbits.js";


export const DASH_COOLDOWN = 4;
const STEP = 1 / 60;


function newSeeker(i){

    return {
        x: WIDTH * 0.36, y: HEIGHT * 0.5 + i * 20, angle: i - 0.25,
        target: null, through: 0, dash: 0, hits: 0, touching: new Set(), trail: []
    };

}


export function createFlight(orbit, field, random = Math.random){

    const flight = {orbit, field, random, orbs: [], seekers: [newSeeker(0)], cooldown: 0, remainder: 0};

    for(let i = 0; i < 12; i++)
        flight.orbs.push(spawnOrb(flight));

    return flight;

}


export function dash(flight, x, y){

    if(flight.cooldown > 0)
        return false;

    const lead = flight.seekers[0];

    lead.angle = Math.atan2(y - lead.y, x - lead.x);
    lead.dash = 0.45;
    lead.hits = 0;
    lead.target = null;
    flight.cooldown = DASH_COOLDOWN;
    return true;

}


function steer(flight, seeker, velocity){

    if(!seeker.target || !flight.orbs.includes(seeker.target)){

        let best = Infinity;

        for(const orb of flight.orbs){

            if(seeker.touching.has(orb))
                continue;

            const distance = Math.hypot(orb.x - seeker.x, orb.y - seeker.y);
            const shared = flight.seekers.some(other => other !== seeker && other.target === orb);
            const score = distance + (shared ? 100 : 0);

            if(score < best){

                best = score;
                seeker.target = orb;

            }

        }

    }

    if(!seeker.target)
        return;

    const dx = seeker.target.x - seeker.x;
    const dy = seeker.target.y - seeker.y;
    const turn = Math.atan2(dy, dx) - seeker.angle;
    const limit = STEP * (4 + velocity / Math.max(5, Math.hypot(dx, dy)) * 2);

    seeker.angle += Math.max(-limit, Math.min(limit, Math.atan2(Math.sin(turn), Math.cos(turn))));

}


function move(flight, seeker, velocity, onHit){

    const rushing = seeker.dash > 0;
    const travel = STEP * (rushing ? 650 : velocity);

    if(!rushing && seeker.through <= 0)
        steer(flight, seeker, velocity);

    seeker.through -= STEP;
    seeker.dash -= STEP;
    seeker.x += Math.cos(seeker.angle) * travel;
    seeker.y += Math.sin(seeker.angle) * travel;

    // Reflect off the glass, including during a dash or a follow-through.
    if(seeker.x < 7 || seeker.x > WIDTH - 7)
        seeker.angle = Math.PI - seeker.angle;

    if(seeker.y < 7 || seeker.y > HEIGHT - 7)
        seeker.angle = -seeker.angle;

    seeker.x = Math.max(7, Math.min(WIDTH - 7, seeker.x));
    seeker.y = Math.max(7, Math.min(HEIGHT - 7, seeker.y));

    for(let i = 0; i < flight.orbs.length; i++){

        const orb = flight.orbs[i];

        if(Math.hypot(orb.x - seeker.x, orb.y - seeker.y) > orb.r + 4){

            seeker.touching.delete(orb);
            continue;

        }

        if(seeker.touching.has(orb))
            continue;

        orb.hp = Math.max(0, orb.hp - 1 - flight.field.pierce - Number(rushing));
        orb.flash = 0.18;
        seeker.target = null;
        seeker.through = 0.21;

        if(rushing)
            seeker.hits++;

        let reward = 0;

        if(orb.hp === 0){

            reward = orb.value + (rushing ? seeker.hits - 1 : 0);
            flight.field.balance += reward;
            flight.field.earned += reward;
            flight.orbs[i] = spawnOrb(flight);

            for(const other of flight.seekers)
                other.touching.delete(orb);

        }
        else
            seeker.touching.add(orb);

        onHit?.(orb, seeker, reward, rushing);

    }

}


// Visible and background fields use the same flight paths and collision steps.
export function advance(flight, seconds, stars = 0, onHit = null, trails = false){

    while(flight.seekers.length <= flight.field.wing)
        flight.seekers.push(newSeeker(flight.seekers.length));

    const velocity = speed(flight.field, stars);
    flight.remainder += seconds;

    while(flight.remainder >= STEP){

        flight.remainder -= STEP;
        flight.cooldown = Math.max(0, flight.cooldown - STEP);

        for(const orb of flight.orbs)
            orb.flash = Math.max(0, orb.flash - STEP);

        for(const seeker of flight.seekers){

            move(flight, seeker, velocity, onHit);

            if(trails){

                seeker.trail.push({x: seeker.x, y: seeker.y});

                if(seeker.trail.length > 19)
                    seeker.trail.shift();

            }
            else if(seeker.trail.length)
                seeker.trail.length = 0;

        }

    }

}
