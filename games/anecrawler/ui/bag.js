import {WEAPON} from "../sim/data.js";
import {rarityOf, weaponPower, upgradeCost, salvageValue} from "../sim/loot.js";
import {weaponIcon} from "../view/sprites.js";
import {describeWeapon, weaponTags, powerText} from "./describe.js";
import {findItem, commons, canUpgrade, MAX_LEVEL} from "../profile.js";
import {setText} from "../util.js";


const SORTS = {
    Power: (a, b) => weaponPower(b) - weaponPower(a),
    Rarity: (a, b) => rarityOf(b).tier - rarityOf(a).tier || weaponPower(b) - weaponPower(a),
    Level: (a, b) => b.level - a.level || weaponPower(b) - weaponPower(a),
    New: (a, b) => b.at - a.at
};

const CONFIRM_MS = 3000;


// The bag panel: your two slots, the selected weapon and every weapon you
// own. Changing weapons, upgrading and salvaging only happen in the lobby.
//
// hooks: profile(), hands() (the two weapons in hand), slot() (the active
//        slot), inLobby(), equip(uid), hold(slot), upgrade(uid), salvage(uid),
//        salvageCommons()
export function createBag(element, hooks){

    element.innerHTML =
        `
        <div class="ac-loadout">
            <button class="ac-slot" data-slot="0"></button>
            <button class="ac-slot" data-slot="1"></button>
        </div>

        <div class="ac-detail"></div>

        <div class="ac-row ac-bag-head">
            <span class="ac-bag-count"></span>
            <button class="ac-sort" title="Sort the bag">Power</button>
        </div>

        <div class="ac-bag"></div>

        <button class="ac-bulk"></button>
        `;

    const $ = selector => element.querySelector(selector);

    const slots = [...element.querySelectorAll(".ac-slot")];
    const detail = $(".ac-detail");
    const list = $(".ac-bag");
    const count = $(".ac-bag-count");
    const sort = $(".ac-sort");
    const bulk = $(".ac-bulk");

    let selected = null;        // uid
    let order = "Power";
    let armed = null;           // {button, timer} waiting for a second click

    const rows = new Map();     // uid -> row element


    slots.forEach((button, slot) => button.onclick = () => {

        const uid = hooks.hands()[slot]?.uid;

        hooks.hold(slot);

        if(uid !== undefined)
            select(uid);

    });

    sort.onclick = () => {

        const names = Object.keys(SORTS);

        order = names[(names.indexOf(order) + 1) % names.length];

        refresh();

    };

    bulk.onclick = () => confirm(bulk, hooks.salvageCommons);


    // second click within a few seconds does it; the first turns the button red
    function confirm(button, action){

        if(armed?.button === button){

            disarm();
            action();

            return;

        }

        disarm();

        button.classList.add("armed");

        armed = {button, timer: setTimeout(disarm, CONFIRM_MS)};

        update();

    }


    function disarm(){

        if(!armed)
            return;

        clearTimeout(armed.timer);

        armed.button.classList.remove("armed");
        armed = null;

        update();

    }


    function select(uid){

        selected = uid;

        const item = findItem(hooks.profile(), uid);

        if(item?.fresh){

            item.fresh = false;

            rows.get(uid)?.classList.remove("fresh");

        }

        for(const [id, row] of rows)
            row.classList.toggle("selected", id === uid);

        buildDetail();

    }


    /* ---------------- Rebuilds (when the bag changes) ---------------- */

    function refresh(){

        const profile = hooks.profile();
        const items = profile.bag.slice().sort(SORTS[order]);

        if(!findItem(profile, selected))
            selected = profile.loadout[hooks.slot()] ?? profile.loadout[0] ?? null;

        rows.clear();

        list.replaceChildren(...items.map(item => {

            const row = document.createElement("button");
            const rarity = rarityOf(item);

            row.className = "ac-item";
            row.style.setProperty("--rarity", rarity.color);

            row.innerHTML =
                `
                <img alt="">
                <span class="ac-item-name"></span>
                <small class="ac-item-level"></small>
                <small class="ac-item-tag"></small>
                `;

            row.querySelector("img").src = weaponIcon(item.type, 32);
            row.querySelector(".ac-item-name").textContent = WEAPON[item.type].name;

            row.classList.toggle("fresh", Boolean(item.fresh));
            row.classList.toggle("selected", item.uid === selected);

            if(rarity.tier >= 4)
                row.classList.add("shiny");

            row.onclick = () => select(item.uid);

            rows.set(item.uid, row);

            return row;

        }));

        setText(sort, order);

        buildDetail();
        update();

    }


    function buildDetail(){

        const profile = hooks.profile();
        const item = findItem(profile, selected);

        if(!item){

            detail.replaceChildren();

            return;

        }

        const rarity = rarityOf(item);

        detail.style.setProperty("--rarity", rarity.color);

        detail.innerHTML =
            `
            <div class="ac-detail-head">
                <img alt="">
                <div>
                    <strong></strong>
                    <small class="ac-detail-rarity"></small>
                </div>
            </div>
            <small class="ac-detail-stats"></small>
            <div class="ac-tags"></div>
            <div class="ac-row ac-detail-actions">
                <button class="ac-equip"></button>
                <button class="ac-upgrade"></button>
                <button class="ac-salvage"></button>
            </div>
            <small class="ac-detail-note"></small>
            `;

        detail.querySelector("img").src = weaponIcon(item.type, 56);
        detail.querySelector("strong").textContent = WEAPON[item.type].name;
        detail.querySelector("strong").style.color = rarity.color;

        detail.querySelector(".ac-tags").replaceChildren(...weaponTags(item).map(tag => {

            const span = document.createElement("span");

            span.textContent = tag;

            return span;

        }));

        detail.querySelector(".ac-equip").onclick = () => {

            const slot = profile.loadout.indexOf(item.uid);

            if(slot === -1)
                hooks.equip(item.uid);
            else
                hooks.hold(slot);

        };

        detail.querySelector(".ac-upgrade").onclick = () => hooks.upgrade(item.uid);

        const salvageButton = detail.querySelector(".ac-salvage");

        salvageButton.onclick = () => confirm(salvageButton, () => hooks.salvage(item.uid));

        updateDetail();

    }


    /* ---------------- Updates (cheap, often) ---------------- */

    function update(){

        const profile = hooks.profile();
        const lobby = hooks.inLobby();
        const items = hooks.hands();

        slots.forEach((button, slot) => {

            const item = items[slot];

            button.classList.toggle("active", slot === hooks.slot());
            button.style.setProperty("--rarity", item ? rarityOf(item).color : "#555");

            const key = item ? `${item.uid}:${item.type}:${item.level}` : "empty";

            if(button.dataset.key === key)
                return;

            button.dataset.key = key;

            button.innerHTML = item
                ? `<img alt="" src="${weaponIcon(item.type, 40)}"><span><b></b><small></small></span>`
                : `<span><small>Empty slot</small></span>`;

            if(item){

                button.querySelector("b").textContent = WEAPON[item.type].name;
                button.querySelector("small").textContent = `Lv ${item.level} · slot ${slot + 1}`;

            }

        });

        setText(count, `Bag · ${profile.bag.length}`);

        for(const [uid, row] of rows){

            const item = findItem(profile, uid);

            if(!item)
                continue;

            const slot = profile.loadout.indexOf(uid);

            setText(row.querySelector(".ac-item-level"), `Lv ${item.level}`);
            setText(row.querySelector(".ac-item-tag"), slot === -1 ? "" : `slot ${slot + 1}`);

        }

        const extra = commons(profile);
        const value = extra.reduce((sum, item) => sum + salvageValue(item), 0);

        bulk.hidden = !lobby || extra.length === 0;

        setText(bulk, bulk.classList.contains("armed")
            ? `Salvage ${extra.length} commons? Click again`
            : `Salvage spare commons (${extra.length}) · +${value} shards`);

        updateDetail();

    }


    function updateDetail(){

        const profile = hooks.profile();
        const item = findItem(profile, selected);

        if(!item || !detail.firstElementChild)
            return;

        const lobby = hooks.inLobby();
        const slot = profile.loadout.indexOf(item.uid);
        const equip = detail.querySelector(".ac-equip");
        const upgrade = detail.querySelector(".ac-upgrade");
        const salvage = detail.querySelector(".ac-salvage");

        setText(detail.querySelector(".ac-detail-rarity"), `${rarityOf(item).name} · Lv ${item.level} · ${powerText(item)}`);
        setText(detail.querySelector(".ac-detail-stats"), describeWeapon(item));

        if(slot === -1)
            setText(equip, `Equip to slot ${hooks.slot() + 1}`);
        else
            setText(equip, slot === hooks.slot() ? `In hand · slot ${slot + 1}` : `Hold · slot ${slot + 1}`);

        equip.disabled = !lobby || slot === hooks.slot();

        const cost = upgradeCost(item);

        setText(upgrade, item.level >= MAX_LEVEL ? "Max level" : `Upgrade · ${cost} shards`);
        upgrade.disabled = !lobby || !canUpgrade(profile, item);

        salvage.hidden = slot !== -1;

        setText(salvage, salvage.classList.contains("armed") ? "Click again" : `Salvage · +${salvageValue(item)}`);
        salvage.disabled = !lobby;

        setText(detail.querySelector(".ac-detail-note"), lobby
            ? (slot === -1 ? "Try it on the dummies: equip it, then attack." : "What you hold when you enter the portal comes with you.")
            : "Swap, upgrade and salvage weapons back in the lobby.");

    }


    return {refresh, update, select};

}

