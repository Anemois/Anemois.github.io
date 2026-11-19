import {ORB_RESPAWN, ORB_RESERVED} from "./data.js";
import {format} from "./util.js";


// Manages the orbs inside the field.
//  - regular orbs: kept at a target count, a collected one is replaced after
//    ORB_RESPAWN seconds. Seekers can collect them.
//  - golden orbs: added by the golden scheduler, they never expire and only
//    the player can click them.
// Everything goes through collect(). onCollect(isGolden) pays out and returns
// the amount, which is floated over the orb when the player clicked it.
export function createOrbs(field, onCollect){

    const regular = new Set();      // {el, x, y, r, golden}  (x, y = centre)
    const golden = new Set();
    const byElement = new Map();    // every orb, for click lookup

    let target = 0;


    field.addEventListener(
        "mousedown",
        event => event.preventDefault()
    );

    field.addEventListener(
        "click",
        event => {

            const orb = byElement.get(event.target);

            if(orb)
                collect(orb, true);

        }
    );


    function create(isGolden){

        const el = document.createElement("div");

        el.className = isGolden ? "orb golden" : "orb";

        field.appendChild(el);

        // measure the real size so the orb never spills out of the field
        const size = el.offsetWidth;

        const left = Math.random() * (field.clientWidth - size);
        const top = Math.random() * (field.clientHeight - size);

        el.style.left = left + "px";
        el.style.top = top + "px";

        const orb = {
            el,
            x: left + size / 2,
            y: top + size / 2,
            r: size / 2,
            golden: isGolden,
            born: Date.now()
        };

        (isGolden ? golden : regular).add(orb);
        byElement.set(el, orb);

        return orb;

    }


    function remove(orb){

        if(!(orb.golden ? golden : regular).delete(orb))
            return false;

        byElement.delete(orb.el);
        orb.el.remove();

        return true;

    }


    // floating "+value" where the player clicked
    function pop(orb, value){

        const el = document.createElement("div");

        el.className = orb.golden ? "pop golden" : "pop";
        el.textContent = "+" + format(value);
        el.style.left = orb.x + "px";
        el.style.top = orb.y + "px";

        el.addEventListener("animationend", () => el.remove());

        field.appendChild(el);

    }


    function collect(orb, byPlayer = false){

        if(!remove(orb))
            return;

        if(!orb.golden)
            setTimeout(respawn, ORB_RESPAWN * 1000);

        const value = onCollect(orb.golden);

        if(byPlayer)
            pop(orb, value);

    }


    // brings one regular orb back, and keeps trying while the field is short
    // (e.g. it can't be measured because the skill tree covers it)
    function respawn(){

        if(regular.size >= target)
            return;

        if(field.clientWidth)
            create(false);

        if(regular.size < target)
            setTimeout(respawn, ORB_RESPAWN * 1000);

    }


    // sets how many regular orbs the field holds; fills or trims right away
    function setCount(count){

        target = count;

        while(field.clientWidth && regular.size < target)
            create(false);

        for(const orb of regular){

            if(regular.size <= target)
                break;

            remove(orb);

        }

        respawn();

    }


    // returns false if the field can't be measured right now
    function spawnGolden(){

        if(!field.clientWidth)
            return false;

        create(true);

        return true;

    }


    // closest regular orb to (x, y), preferring ones not in `claimed`
    // (golden orbs and orbs still reserved for the player are never returned)
    function nearest(x, y, claimed){

        const ripe = Date.now() - ORB_RESERVED * 1000;

        let best = null;
        let bestDistance = Infinity;
        let fallback = null;
        let fallbackDistance = Infinity;

        for(const orb of regular){

            if(orb.born > ripe)
                continue;

            const distance = (orb.x - x) ** 2 + (orb.y - y) ** 2;

            if(distance < fallbackDistance){
                fallback = orb;
                fallbackDistance = distance;
            }

            if(distance < bestDistance && !claimed?.has(orb)){
                best = orb;
                bestDistance = distance;
            }

        }

        return best ?? fallback;

    }


    return {
        collect,
        setCount,
        nearest,
        spawnGolden,
        goldenCount: () => golden.size
    };

}
