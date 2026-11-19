import {GOLDEN_DELAY, GOLDEN_STORE} from "./data.js";


// Schedules golden orbs. One arrives after a random delay and waits for the
// player, up to GOLDEN_STORE at once: nothing is lost by being away until the
// store is full. While it is full the clock is paused (it restarts as soon as
// a slot frees up). getDelayScale() lets the skill tree shorten the delay.
export function createGolden(orbs, getDelayScale){

    let nextAt = schedule();


    function schedule(){

        const [min, max] = GOLDEN_DELAY;

        const seconds = min + Math.random() * (max - min);

        return Date.now() + seconds * 1000 * getDelayScale();

    }


    const isFull = () => orbs.goldenCount() >= GOLDEN_STORE;


    // call every tick
    function update(){

        if(isFull())
            nextAt = schedule();

        else if(Date.now() >= nextAt && orbs.spawnGolden())
            nextAt = schedule();

    }


    // seconds until the next orb, or null while the store is full
    function secondsLeft(){

        return isFull()
            ? null
            : Math.max(0, (nextAt - Date.now()) / 1000);

    }


    return {update, secondsLeft};

}
