import {
    HELPERS,
    UPGRADES,
    TICK_MS,
    SAVE_EVERY_TICKS,
    SEEKER_SPEED,
    PRESTIGE_MIN,
    PRESTIGE_CONFIRM_MS,
    BUY_AMOUNTS
} from "./data.js";

import * as economy from "./economy.js";
import {computeModifiers, createTree} from "./tree.js";
import {createShop} from "./shop.js";
import {createAmountPicker} from "./amounts.js";
import {createOrbs} from "./orbs.js";
import {createGolden} from "./golden.js";
import {createSeekers} from "./seekers.js";
import {loadSave, newSave, writeSave, encodeSave, decodeSave, zeroLevels} from "./save.js";
import {format, setText} from "./util.js";


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
            level: helper => save.helpers[helper.id],
            cost: (helper, count) => economy.helperCost(save, mods, helper, count),
            quantity: amount.get,
            onBuy: buyHelper
        })

    ];


    $("#open-tree").onclick = tree.open;
    $("#export-save").onclick = () => prompt("Save code", encodeSave(save));
    $("#import-save").onclick = importSave;
    ui.prestige.onclick = onPrestigeClick;

    root.addEventListener("mouseenter", () => hovered = true);
    root.addEventListener("mouseleave", () => hovered = false);

    window.addEventListener("beforeunload", () => writeSave(save));


    syncEntities();
    updateUI();
    startLoops();


    /* ---------------- Loops ---------------- */

    function startLoops(){

        // economy: setInterval keeps running in background tabs
        let lastTick = Date.now();
        let ticks = 0;

        setInterval(() => {

            const now = Date.now();

            addBlobs(economy.production(save, mods) * (now - lastTick) / 1000);

            lastTick = now;

            orbs.fill(economy.orbCount(save, mods));

            golden.update(hovered && !document.hidden);

            updateUI();

            if(++ticks % SAVE_EVERY_TICKS === 0)
                writeSave(save);

        }, TICK_MS);


        // seekers: smooth movement, only matters while the page is visible
        let lastFrame = performance.now();

        requestAnimationFrame(function frame(now){

            const dt = Math.min((now - lastFrame) / 1000, 0.1);

            lastFrame = now;

            seekers.update(dt, SEEKER_SPEED * mods.seekerSpeed);

            requestAnimationFrame(frame);

        });

    }


    /* ---------------- State changes ---------------- */

    function addBlobs(value){

        save.blobs += value;

        // prestige gold is based on blobs earned this run
        save.runBlobs += value;

    }


    function onOrbCollected(isGolden){

        addBlobs(
            isGolden
                ? economy.goldenValue(save, mods)
                : economy.orbValue(save, mods)
        );

        orbs.fill(economy.orbCount(save, mods));

        updateUI();

    }


    // seekers / orb count can change from upgrades, the tree, prestige or import
    function syncEntities(){

        seekers.setCount(economy.seekerCount(save, mods));

        orbs.fill(economy.orbCount(save, mods));

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


    function importSave(){

        const code = prompt("Import save (0 resets the game)");

        if(!code)
            return;

        try{

            save = code.trim() === "0"
                ? newSave()
                : decodeSave(code);

        }
        catch{

            alert("Invalid save");

            return;

        }

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

    function updateUI(){

        setText(ui.blobs, `${format(save.blobs)} blobs`);
        setText(ui.rate, `${format(economy.production(save, mods))}/s`);
        setText(ui.orb, `${format(economy.orbValue(save, mods))}/orb`);
        setText(ui.golden, `${format(economy.goldenValue(save, mods))} golden`);
        setText(ui.gold, `${format(save.gold)} gold`);

        for(const shop of shops)
            shop.update(save.blobs);

        updatePrestigeButton();

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