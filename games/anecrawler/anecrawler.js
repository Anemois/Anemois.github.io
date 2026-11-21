import {FLOORS_PER_WORLD} from "./sim/data.js";
import {IDLE} from "./sim/sim.js";
import {floorName, rarityOf} from "./sim/loot.js";
import {createHostSession} from "./net/host.js";
import {createClientSession} from "./net/client.js";
import {createRenderer} from "./view/render.js";
import {createInput} from "./view/input.js";
import {weaponIcon} from "./view/sprites.js";
import {createCase} from "./ui/case.js";
import {createBag} from "./ui/bag.js";
import {createCoop} from "./ui/coop.js";
import {createVoteBar} from "./ui/vote.js";
import {createSettings} from "./ui/settings.js";
import {createSounds} from "./view/sounds.js";
import {createSound} from "../../lib/sound.js";
import {setText, duration} from "./util.js";
import {showSave, askSave} from "../../lib/savebox.js";
import {
    loadProfile, writeProfile, encodeProfile, decodeProfile, newProfile,
    addItem, loadoutItems, equip, upgrade, salvage, salvageCommons
} from "./profile.js";


const PANEL_MS = 200;           // panel refresh while open
const SAVE_MS = 5000;           // at most this long between saves of small changes
const CONFIRM_MS = 3000;
const PLAYER_NAME = "You";
const BACKGROUND_MS = 16;       // a host keeps its world running even when folded away

const REASONS = {
    dead: floor => `Fell on ${floorName(floor)}`,
    home: () => "Made it home",
    quit: () => "Run abandoned"
};


export function init(container){

    const $ = selector => container.querySelector(selector);

    const root = $(".anecrawler");
    const canvas = $(".ac-canvas");

    const ui = {
        where: $(".ac-stat-where"),
        shards: $(".ac-stat-shards"),
        best: $(".ac-stat-best"),
        bagCount: $(".ac-stat-bag"),
        start: $(".ac-start"),
        world: $(".ac-world"),
        quit: $(".ac-quit"),
        pause: $(".ac-pause"),
        giveUp: $(".ac-giveup"),
        summary: $(".ac-summary")
    };

    const touch = matchMedia("(hover: none)").matches;

    let profile = loadProfile();
    let session = newSession();

    let hovered = touch;
    let paused = false;
    let summaryOpen = false;
    let frameId = 0;
    let lastFrame = 0;
    let lastPanel = 0;
    let lastSave = Date.now();
    let dirty = false;
    let slot = 0;               // the slot the bag equips into (follows Q)
    let lastSimSlot = 0;
    let pendingLoot = null;     // profile item the open chest gave
    let found = [];             // weapons found this run
    let armed = null;           // a give-up button waiting for its second click

    const state = () => session.state;
    const me = () => session.state.players.find(p => p.id === session.me) ?? null;
    const inLobby = () => session.state.mode === "lobby";

    const renderer = createRenderer(canvas);

    // all sound is made in code (lib/sound.js); browsers keep it off until
    // the first click or key on the page
    const sound = createSound({groups: ["fx", "ui"]});
    const sounds = createSounds(sound);

    const settings = createSettings($(".ac-sound-row"), $(".ac-settings"), {
        sound,
        renderer,
        onClose: () => lastFrame = performance.now()
    });

    const lootCase = createCase($(".ac-case"), {onChoose: chooseLoot, sounds: sounds.ui});

    const bag = createBag($(".ac-bag-panel"), {
        profile: () => profile,
        hands: () => inLobby() || !me() ? loadoutItems(profile) : me().weapons,
        slot: () => slot,
        inLobby,
        equip: equipItem,
        hold: holdSlot,
        upgrade: uid => upgrade(profile, uid) && changed({loadout: true}),
        salvage: uid => salvage(profile, uid) && changed(),
        salvageCommons: () => salvageCommons(profile) && changed()
    });

    const input = createInput(canvas, {
        isActive: () => hovered && !touch,
        onKey
    });

    const voteBar = createVoteBar($(".ac-vote"), {
        answer: agree => handle(session.send({type: "vote", agree}))
    });

    const coop = createCoop($(".ac-coop"), {
        session: () => session,
        join: joinGame,
        leave: playAlone
    });


    // Every game is hosted by someone; playing alone you host for yourself.
    function newSession(){

        return createHostSession({name: PLAYER_NAME, loadout: carried()});

    }


    // switches the page over to someone else's world
    function joinGame(end){

        const guest = createClientSession(end, {
            name: PLAYER_NAME,
            loadout: carried(),

            // the host went away: carry on alone
            onClose: reason => {

                if(session !== guest)
                    return;

                playAlone();
                coop.lost(reason);

            }
        });

        switchTo(guest);

        return guest;

    }


    // A guest goes back to a world of their own. A host carries on in
    // theirs, without the guests.
    function playAlone(){

        if(session.role === "guest"){

            session.close();

            switchTo(newSession());

        }
        else{

            session.close();

        }

    }


    function switchTo(next){

        session = next;
        slot = 0;
        lastSimSlot = 0;
        pendingLoot = null;
        found = [];

        lootCase.close();
        closeSummary();
        setPaused(false);

        renderer.handle([{type: "lobby"}], state(), session.me);

        bag.refresh();
        updatePanel();

    }


    // the loadout as the world needs it (no bag bookkeeping)
    function carried(){

        return loadoutItems(profile).map(({uid, type, level}) => ({uid, type, level}));

    }


    /* ---------------- Profile ---------------- */

    function save(){

        writeProfile(profile);

        dirty = false;
        lastSave = Date.now();

    }


    // after anything that changed the profile; `loadout` also tells the world
    function changed({loadout = false} = {}){

        if(loadout)
            syncLoadout();

        save();

        bag.refresh();
        updatePanel();

        return true;

    }


    function syncLoadout(hold){

        handle(session.send({type: "loadout", items: carried(), slot: hold}));

    }


    function equipItem(uid){

        if(!inLobby())
            return;

        equip(profile, uid, slot);

        slot = profile.loadout.indexOf(uid);

        syncLoadout(slot);
        changed();

    }


    function holdSlot(next){

        slot = next;

        if(me() && next < me().weapons.length)
            handle(session.send({type: "slot", slot: next}));

        bag.update();
        coop.update();

    }


    /* ---------------- Events from the world ---------------- */

    function handle(events){

        if(!events.length)
            return;

        renderer.handle(events, state(), session.me, !session.online);
        sounds.events(events, state(), session.me);

        for(const event of events){

            const mine = event.pid === undefined || event.pid === session.me;

            switch(event.type){

                case "loot":

                    if(mine)
                        openLoot(event);

                    break;

                case "pickup":

                    // shards are banked the moment you touch them
                    if(mine && event.kind === "shard"){

                        profile.shards += event.value;
                        dirty = true;

                    }

                    break;

                case "runStart":

                    found = [];

                    break;

                case "floor":

                    profile.stats.bestFloor = Math.max(profile.stats.bestFloor, event.floor);

                    save();

                    break;

                case "runEnd":

                    finishRun(event);

                    break;

            }

        }

    }


    function openLoot(event){

        pendingLoot = addItem(profile, event.item, event.source);

        found.push(pendingLoot);

        profile.stats.found++;

        save();
        bag.refresh();

        input.release();

        const player = me();

        lootCase.open({
            item: pendingLoot,
            source: event.source,
            floor: state().floor,
            hands: player.weapons,
            held: player.slot
        });

    }


    // choice: "equip" (into `slot`) or "bag"
    function chooseLoot(choice, slot){

        if(!pendingLoot)
            return;

        handle(session.send({type: "loot", choice, slot, uid: pendingLoot.uid}));

        pendingLoot = null;

        lastFrame = performance.now();

    }


    function finishRun(event){

        const mine = event.players.find(p => p.pid === session.me) ?? {kills: 0, shards: 0};
        const stats = profile.stats;

        stats.runs++;
        stats.deaths += event.reason === "dead" ? 1 : 0;
        stats.kills += mine.kills;
        stats.bosses += event.bosses;
        stats.time += event.time;
        stats.bestFloor = Math.max(stats.bestFloor, event.floor);

        save();

        paused = false;
        pendingLoot = null;
        slot = 0;

        showSummary(event, mine);

        bag.refresh();
        updatePanel();

    }


    function showSummary(event, mine){

        summaryOpen = true;

        ui.summary.hidden = false;
        ui.pause.hidden = true;

        setText($(".ac-summary-title"), REASONS[event.reason](event.floor));

        const parts = [
            event.start === event.floor ? floorName(event.floor) : `${floorName(event.start)} to ${floorName(event.floor)}`,
            duration(event.time),
            `${mine.kills} kill${mine.kills === 1 ? "" : "s"}`,
            event.bosses ? `${event.bosses} boss${event.bosses > 1 ? "es" : ""}` : "",
            `+${mine.shards} shards`
        ];

        setText($(".ac-summary-line"), parts.filter(Boolean).join(" · ") + (found.length ? "\nFound and kept in your bag:" : ""));

        $(".ac-summary-found").replaceChildren(...found.map(item => {

            const img = document.createElement("img");

            img.src = weaponIcon(item.type, 36);
            img.title = `${rarityOf(item).name} · Lv ${item.level}`;
            img.style.setProperty("--rarity", rarityOf(item).color);

            return img;

        }));

    }


    function closeSummary(){

        summaryOpen = false;
        ui.summary.hidden = true;

        lastFrame = performance.now();

    }


    /* ---------------- Controls ---------------- */

    function startRun(){

        if(inLobby())
            handle(session.send({type: "start", floor: profile.startFloor}));

        updatePanel();

    }


    function quitRun(){

        if(!inLobby())
            handle(session.send({type: "quit"}));

    }


    // worlds you can start in: any you have reached
    function startFloors(){

        const worlds = Math.max(1, Math.ceil(profile.stats.bestFloor / FLOORS_PER_WORLD));

        return Array.from({length: worlds}, (_, i) => i * FLOORS_PER_WORLD + 1);

    }


    function cycleStart(){

        const floors = startFloors();
        const next = floors[(floors.indexOf(profile.startFloor) + 1) % floors.length] ?? 1;

        profile.startFloor = next;

        handle(session.send({type: "startFloor", floor: next}));

        save();
        updatePanel();

    }


    // first click arms (red, a few seconds), second click does it
    function confirm(button, action){

        if(armed?.button === button){

            disarm();
            action();

            return;

        }

        disarm();

        button.classList.add("armed");
        button.dataset.text = button.textContent;
        button.textContent = "Click again";

        armed = {button, timer: setTimeout(disarm, CONFIRM_MS)};

    }


    function disarm(){

        if(!armed)
            return;

        clearTimeout(armed.timer);

        armed.button.classList.remove("armed");
        armed.button.textContent = armed.button.dataset.text;

        armed = null;

    }


    function setPaused(value){

        paused = value && !inLobby() && !session.online;

        ui.pause.hidden = !paused;

        if(paused)
            input.release();

        lastFrame = performance.now();

    }


    // keys the overlays use first; true = taken
    function onKey(event){

        if(settings.isOpen()){

            if(event.code === "Escape")
                settings.close();

            return true;

        }

        if(summaryOpen){

            if(["KeyE", "Enter", "Space", "Escape"].includes(event.code))
                closeSummary();

            return true;

        }

        if(lootCase.isOpen())
            return lootCase.key(event);

        if(voteBar.key(event))
            return true;

        // the full map: open over the game, which carries on underneath
        if(event.code === "KeyM" && !event.repeat && !paused && !inLobby()){

            renderer.toggleMap();

            return true;

        }

        if(event.code === "Escape" && renderer.mapOpen()){

            renderer.closeMap();

            return true;

        }

        if(event.code === "Escape"){

            setPaused(!paused);

            return true;

        }

        return paused;

    }


    ui.start.onclick = startRun;
    ui.world.onclick = cycleStart;
    ui.quit.onclick = () => confirm(ui.quit, quitRun);
    ui.giveUp.onclick = () => confirm(ui.giveUp, quitRun);

    $(".ac-resume").onclick = () => setPaused(false);
    $(".ac-pause-settings").onclick = () => settings.open();
    $(".ac-summary-close").onclick = closeSummary;

    // (a box in the game, not a browser popup: those leave full screen)
    $(".ac-export").onclick = () => {

        save();

        showSave(root, encodeProfile(profile));

    };

    $(".ac-import").onclick = () => askSave(root, importSave);


    // throws if the code cannot be read (the box says so)
    function importSave(code){

        profile = code === "0" ? newProfile() : decodeProfile(code);

        save();

        // a fresh world in the lobby with the imported weapons
        session.close();

        switchTo(newSession());

    }


    /* ---------------- Panel ---------------- */

    function updatePanel(){

        const lobby = inLobby();
        const stats = profile.stats;

        setText(ui.where, lobby ? "Lobby" : `Floor ${floorName(state().floor)}`);
        setText(ui.shards, `${profile.shards} shards`);
        setText(ui.best, stats.bestFloor ? `Best ${floorName(stats.bestFloor)}` : "Best -");
        setText(ui.bagCount, `${profile.bag.length} weapon${profile.bag.length === 1 ? "" : "s"}`);

        ui.start.hidden = !lobby;
        ui.world.hidden = !lobby;
        ui.quit.hidden = lobby;

        const floors = startFloors();

        if(!floors.includes(profile.startFloor))
            profile.startFloor = 1;

        setText(ui.world, `From ${floorName(profile.startFloor)}`);

        ui.world.disabled = floors.length < 2;

        bag.update();
        coop.update();

    }


    /* ---------------- Loop ---------------- */

    const isVisible = () =>
        hovered && !document.hidden;


    // While others play in this world it must not stop when the card folds
    // away, so a timer keeps it going (without drawing).
    setInterval(() => {

        if(frameId || !session.online)
            return;

        // (a hidden tab only ticks about once a second: make up all of it)
        const now = performance.now();
        const dt = Math.min(1, (now - lastFrame) / 1000);

        lastFrame = now;

        const player = me();

        handle(session.update(dt, player ? {...IDLE, aimX: player.aimX, aimY: player.aimY} : {...IDLE}).events);

    }, BACKGROUND_MS);


    function startFrames(){

        if(frameId || !isVisible())
            return;

        lastFrame = performance.now();
        frameId = requestAnimationFrame(frame);

    }


    function frame(now){

        if(!isVisible()){

            frameId = 0;

            input.release();

            if(dirty)
                save();

            return;

        }

        // asked for first, so one bad frame cannot stop the game
        frameId = requestAnimationFrame(frame);

        if(!renderer.resize())
            return;

        const dt = Math.min(0.1, (now - lastFrame) / 1000);

        lastFrame = now;

        // alone, the world waits while a menu or chest is open
        const blocked = paused || summaryOpen || lootCase.isOpen() || (settings.isOpen() && !session.online);
        const player = me();
        const mouse = input.mouse();
        const aim = renderer.toWorld(mouse.x, mouse.y);

        if(!blocked || session.online){

            const intent = blocked || touch || !player
                ? {...IDLE, aimX: player?.aimX ?? 0, aimY: player?.aimY ?? 0}
                : input.intent(renderer.toWorld);

            // a big boss kill holds the action for a heartbeat (alone only)
            const {events, steps} = session.update(dt * renderer.speed(), intent);

            if(steps)
                input.consume();

            handle(events);

        }

        // joining: nothing to show until the host has let us in
        if(!me()){

            renderer.draw(state(), {me: null, dt, aim});

            return;

        }

        // the bag follows Q presses
        if(me().slot !== lastSimSlot){

            lastSimSlot = me().slot;
            slot = lastSimSlot;

        }

        renderer.draw(state(), {me: session.me, dt, aim});

        sounds.hands(me(), !blocked);

        voteBar.update(state(), session.me);

        if(now - lastPanel > PANEL_MS){

            lastPanel = now;

            updatePanel();

        }

        if(dirty && Date.now() - lastSave > SAVE_MS)
            save();

    }


    root.addEventListener("mouseenter", () => {

        hovered = true;

        coop.warm();

        updatePanel();
        startFrames();

    });

    root.addEventListener("mouseleave", () => {

        hovered = touch;

    });

    document.addEventListener("visibilitychange", () => {

        if(document.hidden){

            save();
            sound.suspend();

        }
        else{

            startFrames();
            sound.resume();

        }

    });

    // the first click or key in the game turns sound on
    root.addEventListener("pointerdown", sound.unlock);
    window.addEventListener("keydown", () => hovered && sound.unlock());

    window.addEventListener("beforeunload", save);


    bag.refresh();
    updatePanel();
    startFrames();

    // with ?dev in the address the browser console, and the test kit in
    // dev/, can reach the running game
    if(new URLSearchParams(location.search).has("dev"))
        window.anecrawler = {get session(){ return session; }, get profile(){ return profile; }, renderer, sound, settings};

}
