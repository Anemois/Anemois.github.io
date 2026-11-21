import {WEAPON} from "../sim/data.js";
import {rarityOf, caseStrip, weaponPower} from "../sim/loot.js";
import {weaponIcon} from "../view/sprites.js";
import {describeWeapon} from "./describe.js";


const CARDS = 56;
const WIN_INDEX = 48;
const SPIN_TIME = 4.6;          // seconds (boss chests spin a little longer)
const CARD_STEP = 118;          // card width + gap, px (matches the CSS)

// how long a case spins: the world shows the find at the chest after this
export const caseTime = source =>
    source === "boss" ? SPIN_TIME + 0.8 : SPIN_TIME;


// The chest popup: a strip of weapons spins past a marker and slows down
// on the one you got. Then you either take it in hand, choosing which of
// your two weapons it replaces, or keep it in the bag.
// onChoose("equip", slot) or onChoose("bag") is called once per opening.
export function createCase(element, {onChoose, sounds = null}){

    element.innerHTML =
        `
        <div class="ac-case-box">
            <div class="ac-case-fx"></div>
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
                <div class="ac-case-slots"></div>
                <button class="ac-case-bag">Put in bag <kbd>B</kbd></button>
                <button class="ac-case-skip">Skip <kbd>Space</kbd></button>
            </div>
        </div>
        `;

    const $ = selector => element.querySelector(selector);

    const track = $(".ac-case-track");
    const marker = $(".ac-case-marker");
    const result = $(".ac-case-result");
    const slots = $(".ac-case-slots");
    const bag = $(".ac-case-bag");
    const skip = $(".ac-case-skip");
    const fxLayer = $(".ac-case-fx");

    let spin = null;
    let frame = 0;
    let tier = 0;               // how rare the find is (0 common .. 5 mythic)
    let found = "";
    let held = 0;               // the slot in hand: F takes the new weapon there
    let free = false;           // a hand is empty

    element.hidden = true;


    bag.onclick = () => choose("bag");
    skip.onclick = () => finish();


    // item: {type, level}; hands: the weapons in hand now; held: which one
    function open({item, source, floor, hands, held: holding}){

        const boss = source === "boss";
        const strip = caseStrip(item, CARDS, WIN_INDEX, floor);

        $(".ac-case-title").textContent = boss ? "Boss chest" : "Weapon chest";

        track.replaceChildren(...strip.map(card));
        track.style.transform = "translateX(0px)";

        element.hidden = false;
        element.classList.toggle("boss", boss);
        element.classList.remove("done", "tease", "tier-0", "tier-1", "tier-2", "tier-3", "tier-4", "tier-5");
        element.style.setProperty("--rarity", rarityOf(item).color);

        clearFx();

        tier = rarityOf(item).tier;
        found = rarityOf(item).name;

        result.style.setProperty("--rarity", rarityOf(item).color);

        $(".ac-case-icon").src = weaponIcon(item.type, 64);
        $(".ac-case-name").textContent = WEAPON[item.type].name;
        $(".ac-case-name").style.color = rarityOf(item).color;
        $(".ac-case-rarity").textContent = `${rarityOf(item).name} · Lv ${item.level}`;
        $(".ac-case-stats").textContent = describeWeapon(item);

        held = holding;
        free = hands.length < 2;

        $(".ac-case-compare").textContent = free
            ? "You have a free hand for it."
            : "Pick which weapon it replaces. The one you drop stays in your bag for later runs.";

        slots.replaceChildren(...choices(item, hands, holding));

        setReady(false);

        // land somewhere on the winning card, not always dead centre
        const width = element.querySelector(".ac-case-window").clientWidth || 600;
        const inside = 14 + Math.random() * (CARD_STEP - 36);

        spin = {
            start: performance.now(),
            time: caseTime(source) * 1000,
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

            sounds?.tick();

        }

        // something good is coming: the window starts to glow
        if(tier >= 3 && t > 0.8)
            element.classList.add("tease");

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

        element.classList.remove("tease");
        element.classList.add("done", `tier-${tier}`);

        celebrate();

        sounds?.reveal(tier);

        setReady(true);

    }


    // The reveal, as big as the find is rare: a ring for rare, light rays
    // for epic, and for legendary (gold) and mythic a flash, a name
    // banner, the box shaking and confetti raining down.
    function celebrate(){

        const add = (className, style = {}) => {

            const div = document.createElement("div");

            div.className = className;

            for(const [name, value] of Object.entries(style))
                div.style.setProperty(name.replace(/[A-Z]/g, c => "-" + c.toLowerCase()), value);

            fxLayer.append(div);

            return div;

        };

        if(tier >= 2)
            add("ac-case-ring");

        if(tier >= 3)
            add("ac-case-rays");

        if(tier < 4)
            return;

        add("ac-case-flash");

        // the name of the rarity goes over everything, cards included
        const banner = document.createElement("div");

        banner.className = "ac-case-banner";
        banner.textContent = found.toUpperCase() + "!";
        fxLayer.after(banner);

        const colours = tier >= 5
            ? ["#ff5c7a", "#c58cff", "#61a8ff", "#facc15", "#ffffff"]
            : ["#facc15", "#fde68a", "#ffffff", "#f59e0b"];

        for(let i = 0; i < (tier >= 5 ? 90 : 60); i++){

            add("ac-confetti", {
                left: `${Math.random() * 100}%`,
                background: colours[i % colours.length],
                animationDelay: `${Math.random() * 0.9}s`,
                animationDuration: `${1.6 + Math.random() * 1.6}s`,
                "--drift": `${(Math.random() - 0.5) * 120}px`,
                "--turn": `${(Math.random() - 0.5) * 1440}deg`
            });

        }

    }


    // the buttons wait until the strip has stopped
    function setReady(ready){

        for(const button of slots.children)
            button.disabled = !ready;

        bag.disabled = !ready;
        skip.hidden = ready;

    }


    // One button per weapon it could replace, with how much stronger (or
    // weaker) the new one is; with a free hand, just one "use now" button.
    function choices(item, hands, holding){

        if(hands.length < 2){

            const button = document.createElement("button");

            button.className = "ac-case-use";
            button.innerHTML = `Use now <kbd>F</kbd>`;
            button.onclick = () => choose("equip", hands.length);

            return [button];

        }

        return hands.map((weapon, slot) => {

            const button = document.createElement("button");

            button.className = "ac-case-use";
            button.innerHTML = `<span>Replace <b></b></span><small></small><kbd>${slot + 1}</kbd>`;

            button.querySelector("b").textContent = `${WEAPON[weapon.type].name} Lv ${weapon.level}`;
            button.querySelector("b").style.color = rarityOf(weapon).color;
            button.querySelector("small").textContent = compare(item, weapon) + (slot === holding ? " · in hand" : "");

            button.onclick = () => choose("equip", slot);

            return button;

        });

    }


    function choose(choice, slot){

        if(spin || element.hidden)
            return;

        element.hidden = true;

        onChoose(choice, slot);

    }


    // keys while the popup is up; returns true if it used the key
    function key(event){

        if(element.hidden)
            return false;

        if(event.code === "Space" || event.code === "Escape"){

            finish();

            return true;

        }

        // F: into the hand you are holding (or the free one)
        if(event.code === "KeyF" || event.code === "Enter" || event.code === "KeyE"){

            choose("equip", free ? undefined : held);

            return true;

        }

        // 1 / 2: replace that slot
        if((event.code === "Digit1" || event.code === "Digit2") && !free){

            choose("equip", event.code === "Digit1" ? 0 : 1);

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

        clearFx();

    }


    function clearFx(){

        fxLayer.replaceChildren();
        element.querySelector(".ac-case-banner")?.remove();

    }


    return {open, key, close, isOpen: () => !element.hidden};

}


// "+45% dps": the new weapon against one you have
function compare(item, current){

    const change = Math.round((weaponPower(item) / weaponPower(current) - 1) * 100);

    if(Math.abs(change) < 3)
        return "about the same dps";

    return `${change > 0 ? "+" : ""}${change}% dps`;

}

