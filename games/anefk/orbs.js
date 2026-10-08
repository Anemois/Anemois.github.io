// Manages the orbs inside the field.
//  - regular orbs: kept at a fixed count, seekers can collect them
//  - golden orb: at most one, temporary, only the player can click it
// Everything goes through collect(), which calls onCollect(isGolden).
export function createOrbs(field, onCollect){

    const regular = new Set();      // {el, x, y, r, golden}  (x, y = centre)
    const byElement = new Map();    // every orb, for click lookup

    let golden = null;


    field.addEventListener(
        "mousedown",
        event => event.preventDefault()
    );

    field.addEventListener(
        "click",
        event => {

            const orb = byElement.get(event.target);

            if(orb)
                collect(orb);

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
            golden: isGolden
        };

        byElement.set(el, orb);

        return orb;

    }


    function remove(orb){

        if(orb.golden){

            if(golden !== orb)
                return false;

            golden = null;

            clearTimeout(orb.timer);

        }
        else if(!regular.delete(orb)){

            return false;

        }

        byElement.delete(orb.el);
        orb.el.remove();

        return true;

    }


    function collect(orb){

        if(remove(orb))
            onCollect(orb.golden);

    }


    // keeps exactly `count` regular orbs on screen (needs a visible field to measure)
    function fill(count){

        if(!field.clientWidth)
            return;

        while(regular.size < count)
            regular.add(create(false));

        for(const orb of regular){

            if(regular.size <= count)
                break;

            remove(orb);

        }

    }


    // returns false if one already exists or the field can't be measured
    function spawnGolden(lifetimeMs){

        if(golden || !field.clientWidth)
            return false;

        const orb = create(true);

        orb.timer = setTimeout(() => remove(orb), lifetimeMs);

        golden = orb;

        return true;

    }


    // closest regular orb to (x, y), preferring ones not in `claimed`
    // (golden orbs are never returned, so seekers ignore them)
    function nearest(x, y, claimed){

        let best = null;
        let bestDistance = Infinity;
        let fallback = null;
        let fallbackDistance = Infinity;

        for(const orb of regular){

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
        fill,
        nearest,
        spawnGolden,
        hasGolden: () => golden !== null
    };

}
