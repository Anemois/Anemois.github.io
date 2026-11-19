import {TOWERS, MAX_TIER} from "./data.js";
import * as economy from "./economy.js";
import {towerIcon} from "./render.js";
import {format, setText} from "./util.js";


const CLOSED_TEXT = "Closed: only two paths can be upgraded";
const CAPPED_TEXT = "Capped: only one path can go past tier 2";
const HINT = "Place towers from Towers below, then click a tower to upgrade it.";


// The card for the selected tower: its three upgrade paths, target mode and
// sell button. onChange() runs after anything that changed the game;
// onClose() deselects.
export function createInspector(element, game, {onChange, onClose}){

    element.innerHTML =
        `
        <div class="td-hint td-insp-hint"></div>

        <div class="td-insp-box">
            <div class="td-insp-head">
                <span class="td-insp-icon"></span>
                <strong class="td-insp-name"></strong>
                <small class="td-insp-level"></small>
                <button class="td-insp-close" title="Close">&times;</button>
            </div>
            <small class="td-insp-stats"></small>
            <div class="td-paths"></div>
            <div class="td-insp-actions">
                <button class="td-insp-target"></button>
                <button class="td-insp-sell"></button>
            </div>
        </div>
        `;

    const $ = selector => element.querySelector(selector);

    const hint = $(".td-insp-hint");
    const box = $(".td-insp-box");
    const icon = $(".td-insp-icon");
    const name = $(".td-insp-name");
    const level = $(".td-insp-level");
    const statsText = $(".td-insp-stats");
    const target = $(".td-insp-target");
    const sell = $(".td-insp-sell");

    let id = null;
    let shownType = null;


    // one row per path: name, tier pips, next tier, buy button
    const rows = [0, 1, 2].map(p => {

        const row = document.createElement("div");

        row.className = "td-path";

        row.innerHTML =
            `
            <div class="td-path-head">
                <span class="td-path-name"></span>
                <span class="td-pips">${"<i></i>".repeat(MAX_TIER)}</span>
            </div>
            <small class="td-path-next"></small>
            <button class="td-path-buy"></button>
            `;

        const button = row.querySelector("button");

        button.onclick = () => {

            game.buyTier(id, p);

            onChange();

        };

        return {
            row,
            button,
            nameEl: row.querySelector(".td-path-name"),
            pips: [...row.querySelectorAll(".td-pips i")],
            next: row.querySelector(".td-path-next")
        };

    });

    $(".td-paths").replaceChildren(...rows.map(r => r.row));


    target.onclick = () => {

        game.cycleTarget(id);

        onChange();

    };

    sell.onclick = () => {

        game.sellTower(id);

        onClose();

        onChange();

    };

    $(".td-insp-close").onclick = onClose;


    function show(next){

        id = next;

        update();

    }


    // cheap: texts and states only, safe to call every tick;
    // `note` replaces the hint while nothing is selected (e.g. while placing)
    function update(note){

        const save = game.save;
        const tower = id === null ? null : game.findTower(id);

        hint.hidden = Boolean(tower);
        box.hidden = !tower;

        setText(hint, note || HINT);

        if(!tower)
            return;

        const def = TOWERS[tower.type];

        // the icon only changes with the type
        if(shownType !== tower.type){

            icon.innerHTML = towerIcon(tower.type);
            shownType = tower.type;

        }

        setText(name, def.name);
        setText(level, `Lv ${save.levels[tower.type]}`);
        setText(statsText, describe(game.stats.towers.get(tower.id)));

        def.paths.forEach((path, p) => updatePath(rows[p], tower, path, p, save));

        target.hidden = Boolean(def.area);

        setText(target, `Target: ${tower.target}`);
        setText(sell, `Sell · ${format(economy.sellValue(tower))}`);

    }


    function updatePath({row, button, nameEl, pips, next}, tower, path, p, save){

        const owned = tower.paths[p];
        const status = economy.tierStatus(tower, p, save);

        setText(nameEl, path.name);

        pips.forEach((pip, i) => {

            pip.classList.toggle("on", i < owned);
            pip.title = path.tiers[i].name;

        });

        row.classList.toggle("closed", status.state === "closed");

        if(status.state === "max"){

            setText(next, `Maxed: ${path.tiers[MAX_TIER - 1].name}`);

            button.hidden = true;

            return;

        }

        if(status.state === "closed"){

            setText(next, owned > 0 ? CAPPED_TEXT : CLOSED_TEXT);

            button.hidden = true;

            return;

        }

        const tier = path.tiers[status.tier - 1];
        const cost = economy.tierCost(game.mods, status.tier);

        setText(next, `${tier.name}: ${tier.desc}`);

        button.hidden = false;

        if(status.state === "level"){

            setText(button, `Needs ${TOWERS[tower.type].name} Lv ${status.level}`);

            button.disabled = true;

            return;

        }

        setText(button, `Buy · ${format(cost)}`);

        button.disabled = save.gold < cost;

    }


    return {show, update};

}


// a tower's stats in one line
export function describe(s){

    if(!s)
        return "";

    const parts = [
        `${format(s.dmg)} dmg`,
        `${format(s.rate)}/s`,
        Number.isFinite(s.range) ? `${Math.round(s.range)} range` : "whole map"
    ];

    if(s.targets > 1)
        parts.push(`${s.targets} targets`);

    if(s.pierce > 0)
        parts.push(`pierce ${s.pierce}`);

    if(s.chain > 0)
        parts.push(`${s.chain} jumps`);

    if(s.slow > 0)
        parts.push(`slow ${Math.round(s.slow * 100)}%`);

    if(s.stun > 0)
        parts.push(`stun ${s.stun.toFixed(1)}s`);

    if(s.burn > 0)
        parts.push(`burn ${Math.round(s.burn * 100)}%/s`);

    if(s.brittle > 0)
        parts.push(`brittle +${Math.round(s.brittle * 100)}%`);

    if(s.gold > 1)
        parts.push(`x${format(s.gold)} gold`);

    if(s.boss > 1)
        parts.push(`x${format(s.boss)} vs bosses`);

    return parts.join(" · ");

}
