import {GOLDEN_DELAY, GOLDEN_LIFETIME} from "./data.js";


// Schedules golden orbs: a random delay after the last one is gone.
// getDelayScale() lets the skill tree shorten the delay.
export function createGolden(orbs, getDelayScale){

    let nextAt = schedule();
    let active = false;


    function schedule(){

        const [min, max] = GOLDEN_DELAY;

        const seconds = min + Math.random() * (max - min);

        return Date.now() + seconds * 1000 * getDelayScale();

    }


    // call every tick; `visible` is false while the game card is collapsed,
    // so a golden orb never appears (and expires) where nobody can see it
    function update(visible){

        if(orbs.hasGolden()){

            active = true;

            return;

        }

        if(active){

            active = false;

            nextAt = schedule();

            return;

        }

        if(visible && Date.now() >= nextAt)
            active = orbs.spawnGolden(GOLDEN_LIFETIME * 1000);

    }


    return {update};

}
