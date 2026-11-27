import {askSave, showSave} from "../../lib/savebox.js";
import {ORBITS, SHELLS, UPGRADES, STAR_COST, buy, cost, openOrbit, prestigeGain, speed, speedBonus} from "./orbits.js";
import {WIDTH, HEIGHT} from "./orbs.js";
import {advance, createFlight, dash} from "./seekers.js";
import {ascend, decodeSave, encodeSave, loadSave, newSave, writeSave} from "./save.js";
import {createView, GOLD, NODES} from "./view.js";
import {format, setText} from "./util.js";


export function init(container){

    const root = container.querySelector(".anefk");
    const $ = selector => root.querySelector(selector);
    const canvas = root.querySelector("canvas");
    const view = createView(canvas);
    const content = $(".anefk-content");
    const progress = $(".af-progress");
    const nodes = $(".af-nodes");
    const charge = $(".af-charge");
    const status = $(".af-status");
    const chartButton = $(".af-chart");
    const wallet = $(".af-wallet");

    let save = loadSave();
    let flights = new Map();
    let selected = 0;
    let chart = null;
    let visible = false;
    let inViewport = true;
    let frameId = 0;
    let last = performance.now();
    let lastUI = 0;
    let lastSave = last;
    let noticeUntil = 0;
    let aim = null;

    root.tabIndex = 0;


    function makeButton(parent, label, action){

        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.onclick = action;
        parent.append(button);
        return button;

    }


    const tabs = ORBITS.map((orbit, index) => {

        const button = makeButton($(".af-tabs"), orbit.name, () => select(index));
        button.prepend(document.createElement("i"));
        button.style.setProperty("--tab-ink", orbit.ink);
        return button;

    });

    const upgrades = UPGRADES.map(upgrade => {

        const button = makeButton($(".af-upgrades"), "", () => {

            if(!buy(save, selected, upgrade))
                return;

            const flight = current();
            const lead = flight.seekers[0];
            view.light(lead.x, lead.y, flight.orbit.ink);
            announce(upgrade.name + " upgraded.");
            commit();

        });

        const name = document.createElement("strong");
        const detail = document.createElement("small");
        const price = document.createElement("em");
        name.textContent = upgrade.name;
        button.append(name, detail, price);
        return {button, detail, price};

    });

    const stars = NODES.map(([x, y], index) => {

        const button = makeButton(nodes, "✦", () => {

            if(chart !== index || !prestigeGain(save))
                return;

            chart++;
            view.light(x * WIDTH, y * HEIGHT, GOLD, chart === NODES.length);
            update();

            if(chart === NODES.length)
                $(".af-ascend").focus();
            else
                stars[chart].focus();

        });

        button.style.left = x * 100 + "%";
        button.style.top = y * 100 + "%";
        button.setAttribute("aria-label", "Light star " + (index + 1));
        return button;

    });


    function current(){

        return flights.get(ORBITS[selected].id);

    }


    function discover(){

        for(const [index, orbit] of ORBITS.entries()){

            if(!flights.has(orbit.id) && openOrbit(save, index)){

                flights.set(orbit.id, createFlight(orbit, save.fields[orbit.id]));

                if(index)
                    announce(orbit.name + " orbit discovered.");

            }

        }

    }


    function restore(next){

        save = next;
        flights = new Map();
        discover();
        select(ORBITS.findIndex(orbit => orbit.id === save.active), false);

    }


    function select(index, persist = true){

        if(!openOrbit(save, index))
            return;

        selected = index;
        save.active = ORBITS[index].id;
        chart = null;
        aim = null;
        view.clear();
        update();

        if(persist)
            writeSave(save);

    }


    function announce(message){

        noticeUntil = performance.now() + 5500;
        setText(status, message);

    }


    function commit(){

        writeSave(save);
        update();

    }


    function takeAim(x, y){

        if(chart !== null || !dash(current(), x, y))
            return;

        const lead = current().seekers[0];
        view.light(lead.x, lead.y, ORBITS[selected].glow);
        update();

    }


    function cursor(event){

        const box = canvas.getBoundingClientRect();

        return {x: (event.clientX - box.left) * WIDTH / box.width, y: (event.clientY - box.top) * HEIGHT / box.height};

    }


    canvas.onpointermove = event => aim = event.pointerType === "touch" ? null : cursor(event);
    canvas.onpointerleave = () => aim = null;
    canvas.onpointerdown = event => {

        if(event.button !== 0)
            return;

        const point = cursor(event);
        takeAim(point.x, point.y);

    };

    canvas.onkeydown = event => {

        if(event.code !== "Space" && event.code !== "Enter")
            return;

        event.preventDefault();
        const flight = current();
        const lead = flight.seekers[0];
        const distance = orb => Math.hypot(orb.x - lead.x, orb.y - lead.y);
        const near = flight.orbs.reduce((a, b) => distance(a) < distance(b) ? a : b);
        takeAim(near.x, near.y);

    };

    chartButton.onclick = () => {

        chart = chart === null ? 0 : null;
        view.clear();
        update();

    };

    $(".af-return").onclick = () => select(selected);
    $(".af-ascend").onclick = () => {

        if(chart !== NODES.length || !prestigeGain(save))
            return;

        const gain = prestigeGain(save);
        restore(ascend(save));
        view.light(WIDTH * 0.36, HEIGHT * 0.5, GOLD, true);
        announce("New orbit · " + gain + (gain === 1 ? " star kept." : " stars kept."));
        commit();
        canvas.focus();

    };

    $(".af-export").onclick = async () => showSave(root, await encodeSave(save));
    $(".af-import").onclick = () => askSave(root, async code => {

        restore(code === "0" ? newSave() : await decodeSave(code));
        announce("Save loaded.");
        commit();

    });


    function update(){

        const orbit = ORBITS[selected];
        const field = save.fields[orbit.id];
        const gain = prestigeGain(save);
        const isChart = chart !== null;
        const count = field.wing + 1;

        root.style.setProperty("--ink", isChart ? GOLD : orbit.ink);
        root.style.setProperty("--glow", isChart ? GOLD : orbit.glow);
        setText($(".af-summary"), visible ? count + (count === 1 ? " seeker in flight" : " seekers in flight") : format(field.balance) + " " + orbit.id + " orbs");
        setText($(".af-sector"), isChart ? "Star chart" : "Seeker field " + String(selected + 1).padStart(2, "0"));
        setText($(".af-name"), isChart ? "Constellation" : orbit.name + " orbit");
        setText(wallet.querySelector("strong"), format(isChart ? save.stars : field.balance));
        setText(wallet.querySelector("small"), isChart ? "Stars kept" : orbit.id + " orbs");

        for(const [i, button] of tabs.entries()){

            button.disabled = !openOrbit(save, i);
            button.title = button.disabled ? "Earn " + ORBITS[i].unlock.toLocaleString() + " " + ORBITS[i - 1].id + " orbs" : ORBITS[i].name + " orbit";
            button.setAttribute("aria-pressed", String(!isChart && selected === i));

        }

        chartButton.setAttribute("aria-pressed", String(isChart));
        chartButton.dataset.ready = String(gain > 0);
        chartButton.title = gain ? "Your constellation is ready to light" : "Preview prestige";
        $(".af-workshop").hidden = isChart;
        $(".af-prestige").hidden = !isChart;
        nodes.hidden = !isChart;
        canvas.tabIndex = isChart ? -1 : 0;
        charge.hidden = isChart;

        if(performance.now() >= noticeUntil)
            setText(status, save.stars + (save.stars === 1 ? " star" : " stars") + " · +" + speedBonus(save.stars) + "% flight speed");

        if(isChart){

            for(const [i, star] of stars.entries()){

                star.disabled = i !== chart || !gain;
                star.dataset.lit = String(i < chart);

            }

            setText($(".af-guide"), gain ? chart + " / 3 stars lit" : "Earn " + STAR_COST.toLocaleString() + " violet orbs to light this chart.");
            const nextGain = (gain + 1) ** 2 * STAR_COST;
            const remaining = (nextGain - save.fields.violet.earned).toLocaleString();
            setText($(".af-ritual"), gain ? "Light the three stars in order to claim " + gain + (gain === 1 ? " permanent star." : " permanent stars.")
                : remaining + " violet orbs to your first prestige.");
            setText($(".af-bonus"), "+" + speedBonus(save.stars) + "% → +" + speedBonus(save.stars + Math.max(1, gain)) + "%");
            setText($(".af-reset-note"), "Starting a new orbit resets all three fields and their upgrades. Your stars carry over.");
            $(".af-ascend").hidden = chart !== NODES.length;
            return;

        }

        setText($(".af-guide"), "Click or tap to dash through a line of orbs.");
        const cd = current().cooldown;
        setText(charge, cd > 0 ? cd.toFixed(1) + "s" : "Dash ready");
        charge.dataset.ready = String(cd <= 0);

        const details = [
            Math.round(speed(field, save.stars)) + " units/s",
            (1 + field.pierce) + (field.pierce ? " layers / hit" : " layer / hit"),
            count + (count === 1 ? " seeker" : " seekers")
        ];

        for(const [i, upgrade] of UPGRADES.entries()){

            const {button, detail, price} = upgrades[i];
            const full = field[upgrade.id] >= upgrade.max;
            const amount = cost(orbit, field, upgrade);
            button.disabled = full || field.balance < amount;
            setText(detail, details[i] + (full ? "" : [" · +17 base", " · +1", " · +1"][i]));
            setText(price, full ? "Max" : "◦ " + format(amount));
            button.title = full ? "Fully upgraded" : amount + " " + orbit.id + " orbs";

        }

        const shell = SHELLS.find(item => item.at > field.earned);
        const next = ORBITS[selected + 1];
        const goal = shell?.at ?? next?.unlock ?? (gain + 1) ** 2 * STAR_COST;
        const label = shell ? shell.name + " shell" : next ? next.name + " orbit" : gain ? "Next prestige star" : "First constellation";
        setText($(".af-next"), !shell && next && field.earned >= goal ? next.name + " orbit open" : label);
        progress.value = Math.min(1, field.earned / goal);
        progress.setAttribute("aria-label", label);
        setText($(".af-goal"), Math.min(field.earned, goal).toLocaleString() + " / " + goal.toLocaleString() + " " + orbit.id + " earned");

    }


    function tick(now, animate){

        const dt = Math.max(0, Math.min(60, (now - last) / 1000));
        last = now;

        for(const flight of flights.values()){

            const seen = animate && chart === null && flight === current();
            const hit = seen ? (orb, seeker, reward, rushing) => view.hit(orb, seeker, reward, rushing, flight.orbit) : null;
            const before = flight.field.earned;
            advance(flight, dt, save.stars, hit, seen);

            if(seen){

                const shell = SHELLS.find(item => before < item.at && flight.field.earned >= item.at);

                if(flight.orbit.id === "violet" && before < STAR_COST && flight.field.earned >= STAR_COST)
                    announce("Constellation ready. Open the star chart to prestige.");

                if(shell)
                    announce(shell.name + " shells discovered · " + (shell.layers + flight.orbit.shell) + " layers.");

            }

        }

        discover();

        if(animate)
            view.draw(current(), chart, Math.min(0.08, dt), aim);

        if(now - lastUI > (animate ? 120 : 1000)){

            if(animate)
                update();
            else
                setText($(".af-summary"), format(current().field.balance) + " " + save.active + " orbs");

            lastUI = now;

        }

        if(now - lastSave > 10000){

            writeSave(save);
            lastSave = now;

        }

    }


    function frame(now){

        frameId = 0;
        tick(now, true);

        if(visible)
            frameId = requestAnimationFrame(frame);

    }


    function syncVisibility(){

        const open = root.matches(":hover,:focus-within") || container.matches(".focused,:fullscreen");
        content.inert = !open;
        visible = open && inViewport && !document.hidden;

        if(visible && !frameId){

            // Catch up quietly before the first painted frame.
            tick(performance.now(), false);
            update();
            frameId = requestAnimationFrame(frame);

        }
        else if(!visible && frameId){

            cancelAnimationFrame(frameId);
            frameId = 0;

        }

    }


    restore(save);

    for(const event of ["mouseenter", "mouseleave", "focusin", "focusout"])
        root.addEventListener(event, () => queueMicrotask(syncVisibility));

    new MutationObserver(syncVisibility).observe(container, {attributes: true, attributeFilter: ["class"]});
    new IntersectionObserver(([entry]) => {

        inViewport = entry.isIntersecting;
        syncVisibility();

    }).observe(root);

    document.addEventListener("visibilitychange", () => {

        syncVisibility();

        if(document.hidden)
            writeSave(save);

    });

    window.addEventListener("pagehide", () => writeSave(save));
    setInterval(() => {

        if(!visible)
            tick(performance.now(), false);

    }, 1000);

    syncVisibility();

}
