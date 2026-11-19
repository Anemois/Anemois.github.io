import {WEAPON, TINTS} from "../sim/data.js";
import {createFx, mix} from "../../../lib/fx.js";
import {weaponLook} from "./sprites.js";


// Turns what happened in the world (simulation events) into things to
// look at, using the shared effects library. Nothing here feeds back into
// the game, so every player's screen can do this for itself.

const STREAMS = ["beam", "burn", "tick"];     // damage kinds merged into one number
const PICKUP_COLOURS = {energy: "#61a8ff", shard: "#c4b5fd", heart: "#ff5c7a"};


export function createEffects(){

    const fx = createFx({max: 900});

    const view = {
        banner: null,           // {title, sub, life, max, colour}
        hurt: 0,                // red edge flash, 1..0
        recoil: new Map()       // player id -> 1..0
    };


    function banner(title, sub = "", {life = 2.2, colour = "#ffffff"} = {}){

        view.banner = {title, sub, life, max: life, colour};

    }


    const shotColour = event =>
        event.weapon ? weaponLook(event.weapon).colour : TINTS[event.tint ?? 0];


    // one simulation event; `me` is the local player id, `alone` whether
    // this is a single-player game (only then may the action freeze)
    function handle(event, me, alone){

        switch(event.type){

            case "hit": {

                const stream = STREAMS.includes(event.kind);
                const colour = event.crit ? "#facc15" : event.kind === "burn" ? "#ff9a5a" : "#ffffff";

                fx.text(event.x, event.y - event.r, event.dmg, {
                    colour,
                    size: event.crit ? 12 : 9,
                    pop: event.crit,
                    key: stream ? `${event.id}:${event.kind}` : null
                });

                if(stream)
                    break;

                if(event.angle !== null && event.angle !== undefined)
                    fx.impact(event.x - Math.cos(event.angle) * event.r * 0.7, event.y - Math.sin(event.angle) * event.r * 0.7, event.angle, {colour: mix(event.color, "#ffffff", 0.45), big: event.crit});
                else
                    fx.burst(event.x, event.y, {count: 4, colour: mix(event.color, "#ffffff", 0.45), speed: 110, life: 0.25, shape: "spark", glow: true});

                break;

            }

            case "death":

                fx.shatter(event.x, event.y, event.r, event.color, {big: event.boss});

                if(event.boss){

                    fx.ring(event.x, event.y, 260, {colour: "#ffffff", life: 0.9, width: 5});
                    fx.flash(event.x, event.y, 320, {colour: event.color, life: 0.6});
                    fx.shake(10);

                    if(alone)
                        fx.freeze(0.35);

                }
                else if(event.big){

                    fx.shake(3);

                }

                break;

            case "boom":

                fx.explosion(event.x, event.y, event.r, event.team === "p" ? {} : {colour: "#ff5c7a", hot: "#ffd1d9"});
                fx.shake(event.r > 50 ? 2.8 : 1.4);

                break;

            case "shot": {

                const def = WEAPON[event.weapon];
                const look = weaponLook(event.weapon);

                view.recoil.set(event.pid, 1);

                if(def.rain)
                    fx.sparkle(event.x, event.y, look.colour, {count: 5, spread: 6});
                else
                    fx.muzzle(event.x, event.y, event.angle, look.colour, {big: Boolean(def.explode || def.rail || (def.count ?? 1) > 3)});

                break;

            }

            case "rail": {

                const look = weaponLook(event.weapon);
                const angle = Math.atan2(event.y2 - event.y1, event.x2 - event.x1);

                fx.bolt(event.x1, event.y1, event.x2, event.y2, {colour: look.colour, width: event.width, life: 0.4});
                fx.impact(event.x2, event.y2, angle, {colour: look.colour, big: true});
                fx.shake(3.5);

                break;

            }

            case "shock": {

                const colour = weaponLook(event.weapon).colour;

                fx.ring(event.x, event.y, event.r, {colour, life: 0.3, width: 3, fill: 0.15});
                fx.flash(event.x, event.y, event.r * 1.3, {colour, life: 0.15});

                for(let i = 0; i < 3; i++){

                    const a = Math.random() * Math.PI * 2;

                    fx.bolt(event.x, event.y, event.x + Math.cos(a) * event.r, event.y + Math.sin(a) * event.r, {colour, width: 1.5, life: 0.18, jag: 8});

                }

                fx.shake(2.5);

                break;

            }

            case "spark":

                fx.impact(event.x, event.y, event.angle, {colour: shotColour(event), count: 3, speed: 120});

                break;

            case "deflect":

                fx.burst(event.x, event.y, {count: 5, colour: "#ffffff", speed: 130, life: 0.2, shape: "spark", glow: true});
                fx.ring(event.x, event.y, 9, {colour: "#ffffff", life: 0.15, width: 1.5});

                break;

            case "crate":

                fx.burst(event.x, event.y, {count: 10, colour: "#6b5d4f", speed: 150, life: 0.6, size: 4, shape: "shard", drag: 3});
                fx.burst(event.x, event.y, {count: 4, colour: "#3a342c", speed: 40, life: 0.6, size: 7, shape: "smoke", grow: 1.2, drag: 2});

                break;

            case "crateHit":

                fx.burst(event.x, event.y, {count: 3, colour: "#6b5d4f", speed: 90, life: 0.3, size: 3, shape: "shard"});

                break;

            case "spawn":

                fx.ring(event.x, event.y, 26, {colour: "#9ca3af", life: 0.9, from: 1.2, width: 1});

                break;

            case "alert":

                fx.text(event.x, event.y - event.r - 8, "!", {colour: "#facc15", size: 13, pop: true, life: 0.7, rise: 14});

                break;

            case "blink":

                fx.ring(event.x, event.y, 30, {colour: event.color, life: 0.4});
                fx.burst(event.x, event.y, {count: 10, colour: event.color, speed: 90, life: 0.4, shape: "dot", glow: true});

                break;

            case "thud":

                fx.shake(event.big ? 6 : 2);
                fx.burst(event.x, event.y, {count: event.big ? 8 : 3, colour: "#4a4a4a", speed: event.big ? 90 : 50, life: 0.7, size: event.big ? 9 : 6, shape: "smoke", grow: 1.2, drag: 2.5});

                if(event.big)
                    fx.ring(event.x, event.y, 70, {colour: "#e5e5e5", life: 0.4, width: 3});

                break;

            case "hurt":

                if(event.pid === me){

                    view.hurt = 1;

                    fx.shake(3.5);

                }

                fx.burst(event.x, event.y, {count: 9, colour: event.shield ? "#9ca3af" : "#ff5c7a", speed: 130, life: 0.35, shape: "spark", glow: !event.shield});

                break;

            case "down":

                fx.shatter(event.x, event.y, 12, "#ff5c7a");

                if(event.pid === me)
                    banner("You are down", alone ? "" : "a friend standing by you gets you back up", {colour: "#ff5c7a"});

                break;

            case "revive":

                fx.ring(event.x, event.y, 40, {colour: "#63d69f", life: 0.5, width: 3});
                fx.sparkle(event.x, event.y, "#63d69f", {count: 10, spread: 14});

                if(event.pid === me)
                    banner("Back on your feet", "", {colour: "#63d69f"});

                break;

            case "pickup": {

                const colour = PICKUP_COLOURS[event.kind];

                fx.sparkle(event.x, event.y, colour, {count: 2, spread: 3});

                if(event.kind !== "energy" && event.pid === me)
                    fx.text(event.x, event.y - 8, event.kind === "shard" ? `+${event.value}` : "+1", {colour, size: 9});

                break;

            }

            case "dash":

                fx.burst(event.x, event.y, {count: 6, colour: "#9ca3af", speed: 70, life: 0.3, size: 5, shape: "smoke", grow: 1, drag: 3});

                break;

            case "empty":

                if(event.pid === me)
                    banner("", "out of energy: swap to a free weapon or pick up blue orbs", {life: 1.2});

                break;

            case "boss":

                banner(event.name, "", {life: 2.6, colour: "#ff5c7a"});

                fx.ring(event.x, event.y, 200, {colour: "#ff5c7a", life: 0.8, width: 4});
                fx.shake(5);

                break;

            case "bossReset":

                banner(`${event.name} sleeps again`, "it heals when everyone leaves its lair", {life: 2.4});

                break;

            case "bossDown":

                banner("Boss defeated", "open the chest, then take a portal", {life: 3.2, colour: "#facc15"});

                break;

            case "enrage":

                fx.ring(event.x, event.y, 110, {colour: "#ff5c7a", life: 0.6, width: 4});
                fx.flash(event.x, event.y, 180, {colour: "#ff5c7a", life: 0.35});
                fx.shake(4);

                break;

            case "chestDrop":

                fx.ring(event.x, event.y, 50, {colour: "#facc15", life: 0.5, width: 2});
                fx.sparkle(event.x, event.y, "#facc15", {count: 12, spread: 12});
                fx.text(event.x, event.y - 24, "Chest!", {colour: "#facc15", size: 10, pop: true, life: 1.2, rise: 16});

                break;

            case "loot":

                fx.sparkle(event.x, event.y, event.source === "boss" ? "#facc15" : "#e5e5e5", {count: 16, spread: 10});
                fx.flash(event.x, event.y, 60, {colour: "#facc15", life: 0.3});

                break;

            case "floor":
            case "lobby":

                fx.clear();

                break;

        }

    }


    function update(dt){

        fx.update(dt);

        view.hurt = Math.max(0, view.hurt - dt * 2.5);

        if(view.banner && (view.banner.life -= dt) <= 0)
            view.banner = null;

        for(const [id, value] of view.recoil)
            view.recoil.set(id, Math.max(0, value - dt * 9));

    }


    return {fx, view, handle, update, banner};

}
