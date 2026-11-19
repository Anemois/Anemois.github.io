import {
    TICK_MS,
    SAVE_EVERY_MS,
    CONFIRM_MS,
    OFFLINE_AFTER,
    BUY_AMOUNTS,
    TOWERS,
    TOWER_IDS,
    TOWER_RADIUS,
    TROOP_UPGRADES,
    TROOP_UNLOCK,
    UPGRADES,
    BOUNTY_STEP,
    OVERCLOCK_STEP,
    ASCEND_MIN
} from "./data.js";

import * as economy from "./economy.js";
import {createGame} from "./game.js";
import {createRenderer, towerIcon} from "./render.js";
import {createShop, createAmountPicker} from "./shop.js";
import {createInspector, describe} from "./inspect.js";
import {createSky} from "./sky.js";
import {loadSave, newSave, writeSave, encodeSave, decodeSave} from "./save.js";
import {PATH, LANE} from "./map.js";
import {format, duration, setText} from "./util.js";


export function init(container){

    const $ = selector => container.querySelector(selector);
    const $$ = selector => container.querySelectorAll(selector);

    const root = $(".anetd");
    const canvas = $(".td-canvas");

    const ui = {
        wave: $(".td-stat-wave"),
        gold: $(".td-stat-gold"),
        rate: $(".td-stat-rate"),
        stars: $(".td-stat-stars"),
        waveLabel: $(".td-wave-label"),
        prev: $(".td-prev"),
        next: $(".td-next"),
        auto: $(".td-auto"),
        speed: $(".td-speed"),
        ascend: $(".td-ascend"),
        troopSummary: $(".td-troop-summary"),
        troopList: $(".td-troop-list"),
        autobuyRow: $(".td-autobuy-row"),
        autobuy: $(".td-autobuy")
    };

    const game = createGame(loadSave());
    const renderer = createRenderer(canvas);

    // touch screens have no hover: the card simply stays open
    const touch = matchMedia("(hover: none)").matches;

    let hovered = touch;
    let frameId = 0;
    let lastFrame = 0;
    let confirmTimer = null;
    let tab = "towers";

    // field interaction
    let selected = null;        // tower id
    let hover = null;           // tower id under the cursor
    let placing = null;         // tower type being placed
    let ghost = null;           // where it would go: {type, x, y, ok, range}
    let shiftPlaced = false;    // placed with Shift held: letting go of Shift stops placing
    let placingRally = false;
    let rallyGhost = null;
    let notice = null;

    // clocks: performance.now() for simulation, Date.now() to notice sleep
    let lastPump = performance.now();
    let lastWall = Date.now();
    let lastRate = lastPump;
    let lastSave = lastWall;

    const save = () => game.save;

    const isVisible = () =>
        hovered && !document.hidden && !sky.isOpen();


    /* ---------------- Panel parts ---------------- */

    const amount = createAmountPicker($(".td-buy"), BUY_AMOUNTS, updatePanel);

    const inspector = createInspector($(".td-inspect"), game, {
        onChange: commit,
        onClose: () => select(null)
    });

    const shops = {

        towers: createShop(
            $(".td-tower-list"),
            TOWER_IDS.map(id => ({id, ...TOWERS[id]})),
            {
                icon: item => towerIcon(item.id),
                level: item => save().levels[item.id],
                desc: towerSummary,
                note: item => economy.levelNote(save().levels[item.id]),
                locked: item => game.towerUnlocked(item.id) ? null : `Unlocks at wave ${item.unlock}`,
                verb: () => "Level",
                action: {
                    text: item => placing === item.id ? "Cancel" : `Place · ${format(economy.placeCost(save(), game.mods))}`,
                    disabled: item => placing !== item.id && save().gold < economy.placeCost(save(), game.mods),
                    active: item => placing === item.id,
                    onClick: item => startPlacing(placing === item.id ? null : item.id)
                },
                cost: (item, count) => economy.levelCost(save(), game.mods, item.id, count),
                quantity: amount.get,
                onBuy: (item, count) => game.buyTypeLevel(item.id, count) && commit()
            }
        ),

        troops: createShop(
            $(".td-troop-list"),
            TROOP_UPGRADES,
            {
                level: item => save().troops[item.id],
                levelText: item => item.max === undefined
                    ? `Lv ${save().troops[item.id]}`
                    : `${save().troops[item.id]} / ${item.max}`,
                desc: troopDesc,
                note: item => item.id === "recruits" || item.id === "drills" ? item.desc : "",
                locked: () => game.troopsUnlocked() ? null : `Troops unlock at wave ${TROOP_UNLOCK}`,
                cost: (item, count) => economy.upgradeCost(save().troops[item.id], item, count),
                quantity: amount.get,
                onBuy: (item, count) => game.buyTroop(item.id, count) && commit()
            }
        ),

        upgrades: createShop(
            $('.td-tab[data-tab="upgrades"]'),
            UPGRADES,
            {
                level: item => save().upgrades[item.id],
                levelText: item => item.max === undefined
                    ? `Lv ${save().upgrades[item.id]}`
                    : `${save().upgrades[item.id]} / ${item.max}`,
                desc: upgradeDesc,
                note: item => `${item.desc} per level`,
                cost: (item, count) => economy.upgradeCost(save().upgrades[item.id], item, count),
                quantity: amount.get,
                onBuy: (item, count) => game.buyUpgrade(item.id, count) && commit()
            }
        )

    };

    const sky = createSky(root, {
        getOwned: () => new Set(save().sky),
        getStars: () => save().stars,
        onBuy: node => {

            game.buySky(node);

            sky.refresh();

            commit();

        },
        onToggle: () => startFrames()       // the field comes back into view on close
    });


    /* ---------------- Wiring ---------------- */

    $(".td-export").onclick = () => prompt("Save code", encodeSave(save()));
    $(".td-import").onclick = importSave;
    $(".td-open-sky").onclick = sky.open;
    ui.ascend.onclick = onAscendClick;

    ui.prev.onclick = () => game.setWave(game.battle.state.wave - 1);
    ui.next.onclick = () => game.setWave(game.battle.state.wave + 1);
    ui.auto.onclick = () => game.setAuto(!save().auto);
    ui.autobuy.onclick = () => game.setAutobuy(!save().autobuy);
    ui.speed.onclick = () => game.setSpeed(save().speed % game.maxSpeed() + 1);

    for(const button of $$(".td-tabs button"))
        button.onclick = () => showTab(button.dataset.tab);

    $(".td-troop-summary").addEventListener("click", event => {

        if(event.target.closest(".td-rally")){

            placingRally = !placingRally;
            rallyGhost = null;
            placing = ghost = null;

            updatePanel();

        }

    });

    canvas.addEventListener("mousemove", onFieldMove);
    canvas.addEventListener("mouseleave", () => hover = ghost = rallyGhost = null);
    canvas.addEventListener("click", onFieldClick);

    // right click or Escape stops placing (and closes the selected tower)
    canvas.addEventListener("contextmenu", event => {

        if(placing || placingRally){

            event.preventDefault();

            cancelField();

        }

    });

    document.addEventListener("keydown", event => {

        if(event.key === "Escape" && hovered)
            cancelField();

    });

    document.addEventListener("keyup", event => {

        if(event.key === "Shift" && placing && shiftPlaced)
            startPlacing(null);

    });

    root.addEventListener("mouseenter", () => {

        hovered = true;

        updatePanel();      // the panel does not refresh while collapsed

        startFrames();

    });

    root.addEventListener("mouseleave", () => {

        hovered = touch;

        hover = ghost = rallyGhost = null;

    });

    // controls react right away instead of on the next tick
    root.addEventListener("click", () => queueMicrotask(updatePanel));

    document.addEventListener("visibilitychange", () => {

        if(document.hidden)
            writeSave(save());
        else
            startFrames();

    });

    window.addEventListener("beforeunload", () => writeSave(save()));

    new ResizeObserver(() => isVisible() && draw()).observe(canvas);


    showTab(tab);
    welcomeBack((Date.now() - save().savedAt) / 1000);
    updateHeader();
    updatePanel();
    startLoops();
    startFrames();


    /* ---------------- Loops ---------------- */

    // runs the game up to now; a long gap (sleep, closed laptop) pays offline
    // gold instead of being simulated
    function pump(){

        const now = performance.now();
        const wall = Date.now();

        const real = (now - lastPump) / 1000;
        const away = (wall - lastWall) / 1000;

        lastPump = now;
        lastWall = wall;

        if(away > OFFLINE_AFTER){

            welcomeBack(away);

            return;

        }

        game.advance(Math.min(real, OFFLINE_AFTER) * save().speed);

    }


    // economy and header: setInterval keeps running in background tabs
    function startLoops(){

        setInterval(() => {

            if(!frameId)
                pump();

            const now = performance.now();
            const sinceRate = (now - lastRate) / 1000;

            lastRate = now;

            // a gap that paid offline gold would drag the average to zero
            if(sinceRate < OFFLINE_AFTER)
                game.trackRate(sinceRate);

            updateHeader();

            if(hovered)
                updatePanel();

            if(Date.now() - lastSave > SAVE_EVERY_MS){

                writeSave(save());

                lastSave = Date.now();

            }

        }, TICK_MS);

    }


    // animation: runs only while the field is on screen, then stops by itself
    function startFrames(){

        if(frameId || !isVisible())
            return;

        game.battle.setVisual(true);

        lastFrame = performance.now();
        frameId = requestAnimationFrame(frame);

    }


    function frame(now){

        if(!isVisible()){

            frameId = 0;

            game.battle.setVisual(false);

            return;

        }

        pump();

        if(notice){

            notice.left -= (now - lastFrame) / 1000;

            if(notice.left <= 0)
                notice = null;

        }

        lastFrame = now;

        draw();

        frameId = requestAnimationFrame(frame);

    }


    function draw(){

        if(!renderer.resize())
            return;

        const rally = PATH.at(save().rally * PATH.length, {});

        renderer.draw(game.battle, {
            selected,
            hover,
            ghost,
            rallyGhost,
            rally,
            troops: game.stats.troops.count,
            bonus: game.lastBonus,
            notice
        });

    }


    /* ---------------- Field ---------------- */

    function towerAt({x, y}){

        const tower = save().towers.find(t => Math.hypot(t.x - x, t.y - y) <= TOWER_RADIUS + 3);

        return tower ? tower.id : null;

    }


    function startPlacing(type){

        placing = type;
        ghost = null;
        shiftPlaced = false;
        placingRally = false;

        if(type)
            select(null);

        canvas.classList.toggle("placing", Boolean(type));

        updatePanel();

    }


    function cancelField(){

        if(placing)
            startPlacing(null);
        else if(placingRally){

            placingRally = false;
            rallyGhost = null;

            updatePanel();

        }
        else
            select(null);

    }


    function onFieldMove(event){

        const point = renderer.toWorld(event);

        if(placingRally){

            const {s, distance} = PATH.project(point.x, point.y);

            rallyGhost = distance <= LANE
                ? {...PATH.at(s, {}), share: s / PATH.length}
                : null;

        }

        if(placing){

            const reason =
                game.placeError(point.x, point.y) ??
                (save().gold < economy.placeCost(save(), game.mods) ? "not enough gold" : null);

            const range = economy.towerStats({type: placing, paths: [0, 0, 0]}, save(), game.mods).range;

            ghost = {type: placing, x: point.x, y: point.y, ok: !reason, reason, range};

        }

        hover = placing || placingRally ? null : towerAt(point);

        canvas.classList.toggle("pointer", hover !== null);
        canvas.classList.toggle("placing", Boolean(placing) || placingRally);

    }


    function onFieldClick(event){

        const point = renderer.toWorld(event);

        if(placingRally){

            if(rallyGhost)
                game.setRally(rallyGhost.share);

            placingRally = false;
            rallyGhost = null;

            canvas.classList.remove("placing");

            updatePanel();

            return;

        }

        if(placing){

            const tower = game.placeTower(placing, point.x, point.y);

            if(!tower)
                return;

            commit();

            // holding Shift keeps placing the same type until it is let go
            if(event.shiftKey)
                shiftPlaced = true;
            else{

                startPlacing(null);

                select(tower.id);

            }

            onFieldMove(event);

            return;

        }

        const id = towerAt(point);

        select(id === selected ? null : id);

    }


    function select(id){

        selected = id;

        inspector.show(id);

        updatePanel();

    }


    /* ---------------- State changes ---------------- */

    function commit(){

        writeSave(save());

        updateHeader();
        updatePanel();

        return true;

    }


    function welcomeBack(seconds){

        if(seconds <= OFFLINE_AFTER)
            return;

        const gold = game.offline(seconds);

        if(gold >= 1)
            notice = {text: `Welcome back: +${format(gold)} gold for ${duration(seconds)} away`, left: 10};

    }


    function importSave(){

        const code = prompt("Import save (0 resets the game)");

        if(!code)
            return;

        let next;

        try{

            next = code.trim() === "0" ? newSave() : decodeSave(code.trim());

        }
        catch{

            alert("Invalid save");

            return;

        }

        disarmAscend();

        game.load(next);

        select(null);

        sky.refresh();

        commit();

    }


    /* ---------------- Ascension ---------------- */

    // first click arms the button (red, 3 seconds), second click confirms
    function onAscendClick(){

        if(economy.starsFor(save(), game.mods) < 1)
            return;

        if(confirmTimer === null){

            confirmTimer = setTimeout(disarmAscend, CONFIRM_MS);

            updateAscend();

            return;

        }

        disarmAscend();

        const gain = game.ascend();

        notice = {text: `Ascended: +${gain} stars`, left: 6};

        select(null);
        commit();

        sky.open();

    }


    function disarmAscend(){

        clearTimeout(confirmTimer);

        confirmTimer = null;

        updateAscend();

    }


    /* ---------------- UI ---------------- */

    function showTab(name){

        tab = name;

        for(const button of $$(".td-tabs button"))
            button.classList.toggle("active", button.dataset.tab === name);

        for(const panel of $$(".td-tab"))
            panel.classList.toggle("shown", panel.dataset.tab === name);

        updatePanel();

    }


    // the header is always visible; the panel only needs refreshing while open
    function updateHeader(){

        const {state} = game.battle;

        setText(ui.wave, save().best ? `Wave ${state.wave} · best ${save().best}` : `Wave ${state.wave}`);
        setText(ui.gold, `${format(save().gold)} gold`);
        setText(ui.rate, `${format(game.rate)}/s`);
        setText(ui.stars, `${format(save().stars)} stars`);

    }


    function updatePanel(){

        shops[tab].update(save().gold);

        inspector.update(
            placing && `Placing a ${TOWERS[placing].name}: click the field. Hold Shift to place several, right click to stop.`
        );

        updateControls();
        updateAscend();

        if(tab === "troops")
            updateTroops();

    }


    function updateControls(){

        const {best, auto, speed} = save();
        const {wave} = game.battle.state;

        setText(ui.waveLabel, `Wave ${wave}`);

        ui.prev.disabled = wave <= 1;
        ui.next.disabled = wave > best;

        ui.auto.classList.toggle("active", auto);

        ui.autobuyRow.hidden = game.mods.autobuy < 1;
        ui.autobuy.classList.toggle("active", save().autobuy);
        setText(ui.autobuy, save().autobuy ? "Autobuy: on" : "Autobuy: off");

        ui.auto.title = auto
            ? "Auto: moves on after a clear (click to farm this wave)"
            : "Farming: repeats this wave (click to move on after clears)";

        const max = game.maxSpeed();

        setText(ui.speed, `x${speed}`);

        ui.speed.disabled = max < 2;
        ui.speed.title = max < 2 ? "Light Time Warp in the constellation to speed up" : "Game speed";

    }


    function updateAscend(){

        const gain = economy.starsFor(save(), game.mods);
        const armed = confirmTimer !== null;

        ui.ascend.disabled = gain < 1;
        ui.ascend.classList.toggle("armed", armed);

        setText(
            ui.ascend,
            gain < 1
                ? `Ascend at wave ${ASCEND_MIN}`
                : armed
                    ? `Confirm? (+${gain} stars)`
                    : `Ascend (+${gain} stars)`
        );

    }


    function updateTroops(){

        const unlocked = game.troopsUnlocked();
        const {count, dmg, hp} = game.stats.troops;

        ui.troopList.hidden = !unlocked;

        const html = !unlocked
            ? `<div class="td-hint">Guards block balloons on the path. They unlock at wave ${TROOP_UNLOCK}.</div>`
            : count === 0
                ? `<div class="td-hint">Hire a recruit: guards stand at the flag and block one balloon each.</div>`
                : `<div class="td-hint">${count} ${count === 1 ? "guard" : "guards"} · ${format(dmg)} per hit · ${format(hp)} health</div>` +
                  `<div class="td-row"><button class="td-rally${placingRally ? " active" : ""}">` +
                  `${placingRally ? "Click the path…" : "Move rally flag"}</button></div>`;

        // rebuilt only when it changes, so the button keeps working
        if(ui.troopSummary.dataset.html !== html){

            ui.troopSummary.innerHTML = html;
            ui.troopSummary.dataset.html = html;

        }

    }


    // base stats of a type at its current level (paths are per tower)
    function towerSummary(item){

        const base = economy.towerStats({type: item.id, paths: [0, 0, 0]}, save(), game.mods);
        const placed = save().towers.filter(tower => tower.type === item.id).length;

        return `${describe(base)} · ${placed} placed`;

    }


    function troopDesc(item){

        const troops = game.stats.troops;

        switch(item.id){

            case "recruits":
                return `${troops.count} on the path`;

            case "weapons":
                return `${format(troops.dmg)} damage per hit`;

            case "armor":
                return `${format(troops.hp)} health`;

            default:
                return `back in ${troops.respawn.toFixed(1)}s`;

        }

    }


    function upgradeDesc(item){

        const level = save().upgrades[item.id];

        switch(item.id){

            case "bounty":
                return `x${format(BOUNTY_STEP ** level)} gold`;

            case "overclock":
                return `+${Math.round(OVERCLOCK_STEP * level * 100)}% attack speed`;

            default:
                return `${game.stats.lives} lives`;

        }

    }

}
