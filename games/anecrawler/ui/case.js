import {WEAPON} from "../sim/data.js";
import {rarityOf, caseStrip, weaponPower} from "../sim/loot.js";
import {weaponIcon} from "../view/sprites.js";
import {describeWeapon} from "./describe.js";


const CARDS = 56;
const WIN_INDEX = 48;
const SPIN_TIME = 4.6;          // seconds (boss chests spin a little longer)
const CARD_STEP = 118;          // card width + gap, px (matches the CSS)


// The chest popup: a strip of weapons spins past a marker and slows down
// on the one you got, then you choose to use it now or keep it in the bag.
// onChoose("equip" | "bag") is called once per opening.
export function createCase(element, {onChoose}){

    element.innerHTML =
        `
        <div class="ac-case-box">
            <div class="ac-case-title"></div>
            <div class="ac-case-window">
                <div class="ac-case-track"></div>
                <div class="ac-case-marker"></div>
            </div>
            <div class="ac-case-result">
                <img class="ac-case-icon" alt="">
                <div class="ac-case-info">
                    <strong class="ac-case-name"></strong>
                    <small class="ac-case-rarity"></small>
                    <small class="ac-case-stats"></small>
                    <small class="ac-case-compare"></small>
                </div>
            </div>
            <div class="ac-case-actions">
                <button class="ac-case-use">Use now <kbd>F</kbd></button>
                <button class="ac-case-bag">Put in bag <kbd>B</kbd></button>
                <button class="ac-case-skip">Skip <kbd>Space</kbd></button>
            </div>
        </div>
        `;

    const $ = selector => element.querySelector(selector);

    const track = $(".ac-case-track");
    const marker = $(".ac-case-marker");
    const result = $(".ac-case-result");
    const use = $(".ac-case-use");
    const bag = $(".ac-case-bag");
    const skip = $(".ac-case-skip");

    let spin = null;
    let frame = 0;

    element.hidden = true;


    use.onclick = () => choose("equip");
    bag.onclick = () => choose("bag");
    skip.onclick = () => finish();


    // item: {type, level}; current: the weapon in hand, to compare against
    function open({item, source, floor, current}){

        const boss = source === "boss";
        const strip = caseStrip(item, CARDS, WIN_INDEX, floor);

        $(".ac-case-title").textContent = boss ? "Boss chest" : "Weapon chest";

        track.replaceChildren(...strip.map(card));
        track.style.transform = "translateX(0px)";

        element.hidden = false;
        element.classList.toggle("boss", boss);
        element.classList.remove("done");

        result.style.setProperty("--rarity", rarityOf(item).color);

        $(".ac-case-icon").src = weaponIcon(item.type, 64);
        $(".ac-case-name").textContent = WEAPON[item.type].name;
        $(".ac-case-name").style.color = rarityOf(item).color;
        $(".ac-case-rarity").textContent = `${rarityOf(item).name} · Lv ${item.level}`;
        $(".ac-case-stats").textContent = describeWeapon(item);
        $(".ac-case-compare").textContent = compare(item, current);

        use.disabled = bag.disabled = true;
        skip.hidden = false;

        // land somewhere on the winning card, not always dead centre
        const width = element.querySelector(".ac-case-window").clientWidth || 600;
        const inside = 14 + Math.random() * (CARD_STEP - 36);

        spin = {
            start: performance.now(),
            time: (boss ? SPIN_TIME + 0.8 : SPIN_TIME) * 1000,
            to: width / 2 - (WIN_INDEX * CARD_STEP + inside),
            passed: 0
        };

        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(animate);

    }


    function card(item){

        const rarity = rarityOf(item);
        const div = document.createElement("div");

        div.className = "ac-card";
        div.style.setProperty("--rarity", rarity.color);

        div.innerHTML = `<img alt=""><span></span>`;
        div.querySelector("img").src = weaponIcon(item.type, 56);
        div.querySelector("span").textContent = WEAPON[item.type].name;

        if(rarity.tier >= 4)
            div.classList.add("shiny");

        return div;

    }


    function animate(now){

        if(!spin)
            return;

        const t = Math.min(1, (now - spin.start) / spin.time);

        // fast at first, a long slow crawl at the end
        const eased = 1 - (1 - t) ** 4;
        const x = spin.to * eased;

        track.style.transform = `translateX(${x}px)`;

        // the marker flicks each time a card goes past it
        const passed = Math.floor(-x / CARD_STEP);

        if(passed !== spin.passed){

            spin.passed = passed;

            marker.classList.remove("tick");
            void marker.offsetWidth;
            marker.classList.add("tick");

        }

        if(t >= 1)
            return finish();

        frame = requestAnimationFrame(animate);

    }


    function finish(){

        if(!spin)
            return;

        cancelAnimationFrame(frame);

        track.style.transform = `translateX(${spin.to}px)`;

        spin = null;

        track.children[WIN_INDEX]?.classList.add("won");

        element.classList.add("done");

        use.disabled = bag.disabled = false;
        skip.hidden = true;

    }


    function choose(choice){

        if(spin || element.hidden)
            return;

        element.hidden = true;

        onChoose(choice);

    }


    // keys while the popup is up; returns true if it used the key
    function key(event){

        if(element.hidden)
            return false;

        if(event.code === "Space" || event.code === "Escape"){

            finish();

            return true;

        }

        if(event.code === "KeyF" || event.code === "Enter" || event.code === "KeyE"){

            choose("equip");

            return true;

        }

        if(event.code === "KeyB"){

            choose("bag");

            return true;

        }

        return true;

    }


    // put away without choosing (switching games)
    function close(){

        cancelAnimationFrame(frame);

        spin = null;
        element.hidden = true;

    }


    return {open, key, close, isOpen: () => !element.hidden};

}


function compare(item, current){

    if(!current)
        return "Your other hand is free: using it fills it.";

    const mine = weaponPower(current);
    const theirs = weaponPower(item);
    const change = Math.round((theirs / mine - 1) * 100);
    const name = `${WEAPON[current.type].name} Lv ${current.level}`;

    if(Math.abs(change) < 3)
        return `About as strong as your ${name}.`;

    return `${change > 0 ? "+" : ""}${change}% damage per second vs your ${name}.`;

}

