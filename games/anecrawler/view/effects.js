import {WEAPON, TINTS} from "../sim/data.js";
import {createFx, mix} from "../../../lib/fx.js";
import {weaponLook} from "./sprites.js";


// Turns what happened in the world (simulation events) into things to
// look at, using the shared effects library. Nothing here feeds back into
// the game, so every player's screen can do this for itself.

const STREAMS = ["beam", "burn", "tick"];     // damage kinds merged into one number
const PICKUP_COLOURS = {energy: "#61a8ff", shard: "#c4b5fd", heart: "#ff5c7a"};


export function createEffects(){

    const fx = createFx({max: 1500});

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

                // (quiet: our own bullet, whose impact this screen already showed)
                if(stream || event.quiet)
                    break;

                if(event.angle !== null && event.angle !== undefined)
                    fx.impact(event.x - Math.cos(event.angle) * event.r * 0.7, event.y - Math.sin(event.angle) * event.r * 0.7, event.angle, {colour: mix(event.color, "#ffffff", 0.45), big: event.crit});
                else
                    fx.burst(event.x, event.y, {count: 4, colour: mix(event.color, "#ffffff", 0.45), speed: 110, life: 0.25, shape: "spark", glow: true});

                break;

            }

            case "death":

                fx.shatter(event.x, event.y, event.r, event.color, {big: event.boss});

                dying(event);

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

                blast(event);

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
                    banner("You are down", alone ? "" : "a friend can hold E by you to get you back up", {colour: "#ff5c7a"});

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

            // a portal will not open while enemies are near it
            case "sealed":

                // (the prompt over the portal already says why)
                fx.ring(event.x, event.y, 34, {colour: "#ff5c7a", life: 0.4, width: 2});
                fx.burst(event.x, event.y, {count: 8, colour: "#ff5c7a", speed: 70, life: 0.35, size: 2, shape: "dot", glow: true});

                break;

            case "unsealed":

                fx.ring(event.x, event.y, 70, {colour: "#61a8ff", life: 0.7, width: 3});
                fx.sparkle(event.x, event.y, "#61a8ff", {count: 18, spread: 18});
                fx.flash(event.x, event.y, 120, {colour: "#61a8ff", life: 0.5});

                fx.text(event.x, event.y - 34, "open", {colour: "#93c5fd", size: 11, pop: true, life: 1.4, rise: 18});

                break;

            // someone was not ready to go through a portal yet
            case "voteCancel":

                banner("", `${event.pid === me ? "You" : event.name} said not yet`, {life: 1.8});

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

            /* ---- the creatures of each world ---- */

            // a skeleton falls apart...
            case "collapse":

                fx.burst(event.x, event.y, {count: 10, colour: "#d6d3c4", speed: 110, life: 0.5, size: 3, shape: "shard", drag: 4});
                fx.burst(event.x, event.y + 4, {count: 4, colour: "#57534e", speed: 30, life: 0.7, size: 7, shape: "smoke", grow: 1.2, drag: 2});

                break;

            // ...and pulls itself back together
            case "rise":

                fx.ring(event.x, event.y, 26, {colour: "#d6d3c4", life: 0.4, from: 1.3, width: 1.5});
                fx.burst(event.x, event.y, {count: 6, colour: "#ff7185", speed: 40, life: 0.5, size: 2, shape: "dot", glow: true});

                break;

            case "fade":

                fx.burst(event.x, event.y, {count: 8, colour: event.color, speed: 40, life: 0.6, size: 6, shape: "smoke", grow: 1.4, drag: 2});

                break;

            case "wail":

                fx.ring(event.x, event.y, 50, {colour: event.color, life: 0.5, width: 2});
                fx.ring(event.x, event.y, 80, {colour: event.color, life: 0.7, width: 1});
                fx.burst(event.x, event.y, {count: 8, colour: event.color, speed: 60, life: 0.5, size: 5, shape: "smoke", grow: 1, drag: 3});

                break;

            case "chant":

                fx.ring(event.x, event.y, event.big ? 120 : 60, {colour: event.color, life: 0.8, from: 1.4, width: 2, fill: 0.08});
                fx.burst(event.x, event.y, {count: event.big ? 18 : 8, colour: event.color, speed: 50, life: 0.9, size: 2.2, shape: "dot", glow: true, gravity: -40, scatter: event.big ? 40 : 14});

                break;

            case "howl":

                for(let i = 0; i < 3; i++)
                    fx.ring(event.x, event.y, 60 + i * 50, {colour: "#b5c99a", life: 0.5 + i * 0.15, width: 1.5});

                break;

            case "puff":

                fx.burst(event.x, event.y, {count: 18, colour: "#f5d0fe", speed: event.r * 1.6, life: 0.9, size: 2.4, shape: "dot", glow: true, drag: 3});
                fx.ring(event.x, event.y, event.r, {colour: "#e879f9", life: 0.45, width: 2});

                break;

            case "zap":

                fx.flash(event.x, event.y, 50, {colour: "#c4b5fd", life: 0.2});
                fx.shake(1.2);

                break;

            case "rumble":

                fx.burst(event.x, event.y + event.r * 0.5, {count: 8, colour: "#3b3150", speed: 70, life: 0.5, size: 3, shape: "shard", drag: 3});

                break;

            case "emerge":

                fx.burst(event.x, event.y, {count: 12, colour: "#2e2440", speed: 120, life: 0.6, size: 3.5, shape: "shard", drag: 3});
                fx.ring(event.x, event.y, 34, {colour: event.color, life: 0.35, width: 2});
                fx.shake(2);

                break;

            case "whip": {

                const a = event.angle;

                for(let k = -2; k <= 2; k++)
                    fx.burst(event.x + Math.cos(a + k * 0.45) * event.r * 0.7, event.y + Math.sin(a + k * 0.45) * event.r * 0.7, {count: 2, colour: event.color, speed: 60, life: 0.3, size: 3, shape: "spark", angle: a + k * 0.45, spread: 0.4, glow: true});

                fx.shake(1.5);

                break;

            }

            case "lob":

                fx.burst(event.x, event.y - 6, {count: 6, colour: "#ff9a5a", speed: 70, life: 0.35, size: 2.5, glow: true, angle: -Math.PI / 2, spread: 1.2});

                break;

            case "vent":

                fx.burst(event.x, event.y, {count: 16, colour: "#ff8a3d", speed: 120, life: 0.6, size: 3.5, gravity: -140, glow: true, angle: -Math.PI / 2, spread: 0.9, shape: "dot"});
                fx.burst(event.x, event.y, {count: 6, colour: "#57534e", speed: 50, life: 1, size: 7, shape: "smoke", grow: 1.4, gravity: -30, drag: 2});
                fx.flash(event.x, event.y, 70, {colour: "#ff8a3d", life: 0.25});

                break;

        }

    }


    // how a blast looks: fire, a spore cloud, bone spikes, a falling rock...
    function blast(event){

        const r = event.r;

        switch(event.look){

            case "spore":

                fx.explosion(event.x, event.y, r * 0.7, {colour: "#fb923c", hot: "#fde68a"});
                fx.burst(event.x, event.y, {count: 20, colour: "#f5d0fe", speed: r * 2, life: 1, size: 2.6, shape: "dot", glow: true, drag: 3});

                break;

            case "fire":
            case "meteor":

                fx.explosion(event.x, event.y, r, {colour: "#ff6a1a", hot: "#fde68a"});
                fx.burst(event.x, event.y, {count: 10, colour: "#3b2a1f", speed: 120, life: 0.6, size: 3, shape: "shard"});

                break;

            case "bone":

                // spikes stab up out of the floor
                fx.burst(event.x, event.y, {count: 9, colour: "#e7e5e4", speed: 90, life: 0.45, size: 3.5, shape: "spark", angle: -Math.PI / 2, spread: 1.6});
                fx.burst(event.x, event.y, {count: 4, colour: "#57534e", speed: 30, life: 0.6, size: 6, shape: "smoke", grow: 1, drag: 2});
                fx.ring(event.x, event.y, r, {colour: "#e7e5e4", life: 0.25, width: 1.5});

                break;

            case "slam":

                fx.ring(event.x, event.y, r * 1.2, {colour: "#ff8a3d", life: 0.5, width: 4});
                fx.burst(event.x, event.y, {count: 14, colour: "#3b2a1f", speed: 160, life: 0.6, size: 4, shape: "shard"});

                break;

            default:

                fx.explosion(event.x, event.y, r, event.team === "p" ? {} : {colour: "#ff5c7a", hot: "#ffd1d9"});

        }

        fx.shake(r > 50 ? 2.8 : 1.4);

    }


    // each kind of creature dies in its own way
    function dying(event){

        switch(event.kind){

            case "slime":
            case "slimelet":

                fx.burst(event.x, event.y, {count: 10, colour: event.color, speed: 90, life: 0.5, size: 3.5, shape: "dot", gravity: 120});
                fx.decal(event.x, event.y, event.r * 1.2, {colour: event.color, strength: 0.25});

                break;

            case "skeleton":
            case "archer":

                fx.burst(event.x, event.y, {count: 8, colour: "#d6d3c4", speed: 120, life: 0.6, size: 3, shape: "shard", drag: 3});

                break;

            case "shade":
            case "watcher":
            case "mage":

                fx.burst(event.x, event.y, {count: 10, colour: event.color, speed: 50, life: 0.9, size: 7, shape: "smoke", grow: 1.5, drag: 2, gravity: -20});

                break;

            case "golem":
            case "ember":
            case "cinder":

                fx.burst(event.x, event.y, {count: 12, colour: "#ff8a3d", speed: 110, life: 0.7, size: 2.5, glow: true, gravity: -60, shape: "dot"});
                fx.burst(event.x, event.y, {count: 6, colour: "#3b2a1f", speed: 90, life: 0.6, size: 4, shape: "shard"});

                break;

            case "wasp":
            case "bat":

                fx.burst(event.x, event.y, {count: 6, colour: "#e5e7eb", speed: 40, life: 0.8, size: 2.5, shape: "shard", gravity: 40, drag: 2});

                break;

            case "grasp":

                fx.burst(event.x, event.y, {count: 10, colour: event.color, speed: 80, life: 0.6, size: 4, shape: "dot", gravity: 140});

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
