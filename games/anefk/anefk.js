import {
    HELPERS,
    UPGRADES,
    TICK_MS,
    SAVE_EVERY_TICKS,
    SEEKER_SPEED,
    PRESTIGE_MIN,
    PRESTIGE_CONFIRM_MS,
    BUY_AMOUNTS,
    MILESTONE_BONUS
} from "./data.js";

import * as economy from "./economy.js";
import {computeModifiers, createTree} from "./tree.js";
import {createShop} from "./shop.js";
import {createAmountPicker} from "./amounts.js";
import {createOrbs} from "./orbs.js";
import {createGolden} from "./golden.js";
import {createSeekers} from "./seekers.js";
import {loadSave, newSave, writeSave, encodeSave, decodeSave, zeroLevels} from "./save.js";
import {format, clock, setText} from "./util.js";
import {showSave, askSave} from "../../lib/savebox.js";


export function init(container){

    const $ = selector => container.querySelector(selector);

    const root = $(".anefk");

    const ui = {
        blobs: $("#anefk-blobs"),
        rate: $("#anefk-rate"),
        orb: $("#anefk-orb"),
        golden: $("#anefk-golden"),
        gold: $("#anefk-gold"),
        prestige: $("#prestige")
    };


    let save = loadSave();
    let mods = computeModifiers(save.tree);
    let confirmTimer = null;
    let hovered = false;
    let frameId = 0;
    let lastFrame = 0;

    // the card is only open (and worth animating) while hovered in a visible tab
    const isVisible = () => hovered && !document.hidden;

    const seekerSpeed = () => SEEKER_SPEED * mods.seekerSpeed;


    const orbs = createOrbs($("#orb-field"), onOrbCollected);
    const seekers = createSeekers($("#orb-field"), orbs);
    const golden = createGolden(orbs, () => mods.goldenDelay);

    const tree = createTree(root, {
        getOwned: () => new Set(save.tree),
        getGold: () => save.gold,
        onBuy: buyNode
    });

    const amount = createAmountPicker($("#buy-amount"), BUY_AMOUNTS, updateUI);

    const shops = [

        createShop($("#upgrades"), UPGRADES, {
            desc: upgrade => upgrade.desc,
            level: upgrade => save.upgrades[upgrade.id],
            cost: (upgrade, count) => economy.upgradeCost(save, upgrade, count),
            quantity: amount.get,
            onBuy: buyUpgrade
        }),

        createShop($("#helpers"), HELPERS, {
            desc: helper => `${format(helper.power)}/s each`,
            note: helperNote,
            level: helper => save.helpers[helper.id],
            cost: (helper, count) => economy.helperCost(save, mods, helper, count),
            quantity: amount.get,
            onBuy: buyHelper
        })

    ];


    $("#open-tree").onclick = tree.open;
    // (a box in the game, not a browser popup: those leave full screen)
    $("#export-save").onclick = async () => showSave(root, await encodeSave(save));
    $("#import-save").onclick = () => askSave(root, importSave);
    ui.prestige.onclick = onPrestigeClick;

    root.addEventListener("mouseenter", () => {

        hovered = true;

        updateUI();         // the panel was not refreshing while collapsed

        startFrames();

    });

    root.addEventListener("mouseleave", () => hovered = false);

    document.addEventListener("visibilitychange", startFrames);

    window.addEventListener("beforeunload", () => writeSave(save));


    syncEntities();
    updateUI();
    startLoops();


    /* ---------------- Loops ---------------- */

    // economy: setInterval keeps running in background tabs
    function startLoops(){

        let lastTick = Date.now();
        let ticks = 0;

        setInterval(() => {

            const now = Date.now();
            const dt = (now - lastTick) / 1000;

            lastTick = now;

            addBlobs(economy.production(save, mods) * dt);

            // collapsed card: seekers still collect, but without being drawn
            if(!isVisible())
                seekers.update(dt, seekerSpeed(), false);

            golden.update();

            updateUI();

            if(++ticks % SAVE_EVERY_TICKS === 0)
                writeSave(save);

        }, TICK_MS);

    }


    // animation: runs only while the card is open, then stops by itself
    function startFrames(){

        if(frameId || !isVisible())
            return;

        lastFrame = performance.now();

        frameId = requestAnimationFrame(frame);

    }


    function frame(now){

        if(!isVisible()){

            frameId = 0;

            return;

        }

        seekers.update(Math.min((now - lastFrame) / 1000, 0.1), seekerSpeed(), true);

        lastFrame = now;

        frameId = requestAnimationFrame(frame);

    }


    /* ---------------- State changes ---------------- */

    function addBlobs(value){

        save.blobs += value;

        // prestige gold is based on blobs earned this run
        save.runBlobs += value;

    }


    // pays out an orb and returns the amount (orbs.js floats it over the orb)
    function onOrbCollected(isGolden){

        const value = isGolden
            ? economy.goldenValue(save, mods)
            : economy.orbValue(save, mods);

        addBlobs(value);

        updateUI();

        return value;

    }


    // seekers / orb count can change from upgrades, the tree, prestige or import
    function syncEntities(){

        seekers.setCount(economy.seekerCount(save, mods));

        orbs.setCount(economy.orbCount(save, mods));

    }


    function commit(){

        syncEntities();

        writeSave(save);

        updateUI();

    }


    function spend(cost, apply){

        if(save.blobs < cost)
            return;

        save.blobs -= cost;

        apply();

        commit();

    }


    // wanted === Infinity means "buy max": as many as blobs allow, up to `limit`
    function resolveCount(wanted, costOf, limit = Infinity){

        const capped = Math.min(wanted, limit);

        return wanted === Infinity
            ? economy.maxAffordable(costOf, save.blobs, capped)
            : capped;

    }


    function buyHelper(helper, wanted){

        const count = resolveCount(
            wanted,
            n => economy.helperCost(save, mods, helper, n)
        );

        if(count < 1)
            return;

        spend(
            economy.helperCost(save, mods, helper, count),
            () => save.helpers[helper.id] += count
        );

    }


    function buyUpgrade(upgrade, wanted){

        const room = upgrade.max === undefined
            ? Infinity
            : upgrade.max - save.upgrades[upgrade.id];

        const count = resolveCount(
            wanted,
            n => economy.upgradeCost(save, upgrade, n),
            room
        );

        if(count < 1)
            return;

        spend(
            economy.upgradeCost(save, upgrade, count),
            () => save.upgrades[upgrade.id] += count
        );

    }


    // the tree only calls this after checking unlock state and gold
    function buyNode(node){

        save.gold -= node.cost;
        save.tree.push(node.id);

        mods = computeModifiers(save.tree);

        tree.refresh();

        commit();

    }


    // throws if the code cannot be read (the box says so); 0 starts over
    async function importSave(code){

        save = code === "0"
            ? newSave()
            : await decodeSave(code);

        disarmPrestige();

        mods = computeModifiers(save.tree);

        tree.refresh();

        commit();

    }


    /* ---------------- Prestige ---------------- */

    // first click arms the button (red, 3 seconds), second click confirms
    function onPrestigeClick(){

        if(economy.prestigeGain(save, mods) < 1)
            return;

        if(confirmTimer === null){

            confirmTimer = setTimeout(disarmPrestige, PRESTIGE_CONFIRM_MS);

            updatePrestigeButton();

            return;

        }

        disarmPrestige();

        prestige();

    }


    function disarmPrestige(){

        clearTimeout(confirmTimer);

        confirmTimer = null;

        updatePrestigeButton();

    }


    function prestige(){

        save.gold += economy.prestigeGain(save, mods);

        save.blobs = mods.startBlobs;
        save.runBlobs = 0;

        save.helpers = zeroLevels(HELPERS);
        save.upgrades = zeroLevels(UPGRADES);

        commit();

        tree.open();

    }


    /* ---------------- UI ---------------- */

    // the header is always visible; the panel only needs refreshing while open
    function updateUI(){

        updateHeader();

        if(!hovered)
            return;

        for(const shop of shops)
            shop.update(save.blobs);

        updatePrestigeButton();

    }


    function updateHeader(){

        setText(ui.blobs, `${format(save.blobs)} blobs`);
        setText(ui.rate, `${format(economy.production(save, mods))}/s`);
        setText(ui.orb, `${format(economy.orbValue(save, mods))}/orb`);
        setText(ui.golden, goldenText());
        setText(ui.gold, `${format(save.gold)} gold`);

    }


    // value of one golden orb, plus how many wait for you or when the next one comes
    function goldenText(){

        const value = `${format(economy.goldenValue(save, mods))} golden`;
        const ready = orbs.goldenCount();

        if(ready > 0)
            return `${value} · ${ready} ready`;

        return `${value} · in ${clock(golden.secondsLeft())}`;

    }


    function helperNote(helper){

        const next = economy.nextMilestone(save.helpers[helper.id]);

        return next === undefined
            ? "all milestones reached"
            : `x${MILESTONE_BONUS} output at level ${next}`;

    }


    function updatePrestigeButton(){

        const gain = economy.prestigeGain(save, mods);
        const armed = confirmTimer !== null;

        ui.prestige.disabled = gain < 1;
        ui.prestige.classList.toggle("armed", armed);

        setText(
            ui.prestige,
            gain < 1
                ? `Prestige at ${format(PRESTIGE_MIN)}`
                : armed
                    ? `Confirm? (+${gain} gold)`
                    : `Prestige (+${gain} gold)`
        );

    }

}