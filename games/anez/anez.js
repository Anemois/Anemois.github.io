import {createSound} from "../../lib/sound.js";
import {createRun, step, choose, advanceIfReady, STEP} from "./sim.js";
import {REGIONS, WEAPONS, WEAPON_TEXT, RELICS, BOSSES} from "./world.js";
import {createNetwork} from "./network.js";
import {createView} from "./view.js";
import {drawEnemy} from "./art.js";

const JOURNAL = [
    ["husk", "Mossbound Husk", "Roots keep its broken limbs in motion. Step back as it folds its shoulders, then strike after its lunge."],
    ["moth", "Funeral Moth", "Carrion wings carry a single ember. Jump its shot and strike while the moth drifts low."],
    ["gravedigger", "The Gravedigger", "Its spade sends a tremor through the stone. Jump the ripple or dash through it."],
    ["sexton", BOSSES[0], "The first keeper rings a double knell. Jump the first wave, then dash through its echo."],
    ["widow", BOSSES[1], "She hovers above the place she intends to bury. Leave the marked column and close in after she lands."],
    ["saint", BOSSES[2], "A crown of embers falls in three columns. Watch the gaps and punish the saint between invocations."]
];
const KEYS = {
    ArrowLeft:"left", KeyA:"left", ArrowRight:"right", KeyD:"right", Space:"jump", KeyW:"jump",
    ArrowUp:"jump", KeyS:"drop", ArrowDown:"drop", KeyJ:"attack", KeyZ:"attack", KeyK:"dash", KeyX:"dash", ShiftLeft:"dash"
};
const button = (action, label, gold = false) =>
    '<button data-action="' + action + '"' + (gold ? ' class="az-gold"' : '') + '>' + label + '</button>';


export function init(container){

    const root = container.querySelector(".anez");
    const $ = selector => root.querySelector(selector);
    const field = $(".az-field"), cover = $(".az-cover"), overlay = $(".az-overlay");
    const pauseButton = $(".az-tools [data-action=pause]");
    const body = $(".az-body"), sound = createSound(), view = createView(field,sound);
    let state = null, screen = "title", slot = 0, paused = false, audible = true, page = 0;
    let pending = 0, frameId = 0, previousTime = 0, accumulator = 0, wireTime = 0;
    let remote = {}, remoteAt = 0, outbox = [], lastUi = "", visible = true;
    const held = new Map(), taps = new Set();
    sound.setVolume("master",.42);

    const net = createNetwork({
        accepting:() => screen === "lobby" && !state,
        status, code:() => lobby(),
        connected:() => lobby(),
        roomClosed(reason){

            if(!state && !net.ready)
                coop(reason);

        },
        lost(host, wasReady){

            if(host && state){

                state.players.splice(1);
                if(state.phase === "reward"){

                    state.choices.splice(1);
                    state.offers.splice(1);
                    advanceIfReady(state);

                }
                remote = {};
                syncUi();
                return;

            }
            if(host && !state && net.code)
                lobby();
            else
                coop(wasReady ? "Your partner left the room." : "Could not enter this AneZ room. Check the code and try again.");

        },
        message(type, data){

            if(net.role === "guest"){

                if(type !== "state" || !data?.state || !Array.isArray(data.state.players) || !data.state.players[1])
                    return;
                slot = 1;
                view.snapshot(state,data.state);
                state = data.state;
                paused = data.paused;
                view.effects(data.events || []);
                syncUi();
                schedule();
                return;

            }
            if(!state || data?.seed !== state.seed || data?.room !== state.room)
                return;
            if(type === "input" && !paused && state.phase === "play"){

                remote = {
                    axis:[-1,1].includes(data.axis) ? data.axis : 0, attack:data.attack === true,
                    jump:remote.jump || data.jump === true, drop:remote.drop || data.drop === true, dash:remote.dash || data.dash === true,
                    strike:remote.strike || data.strike === true
                };
                remoteAt = performance.now();

            }
            else if(type === "choice"){

                choose(state,1,data.key,data.room);
                syncUi();
                broadcast();

            }
            else if(type === "pause" && state.phase === "play")
                setPaused(!paused);

        }
    });

    function panel(name, eyebrow, heading, html){

        screen = name;
        cover.inert = true;
        field.inert = true;
        overlay.hidden = false;
        $(".az-eyebrow").textContent = eyebrow;
        $("#az-panel-heading").textContent = heading;
        body.innerHTML = html;
        $("#az-panel-heading").focus({preventScroll:true});

    }

    function status(note){

        const line = $(".az-status");
        if(line)
            line.textContent = note;

    }

    field.inert = true;

    function cleanInput(){

        held.clear();
        taps.clear();

    }

    function title(){

        pending++;
        net.stop();
        state = null;
        slot = 0;
        remote = {};
        outbox = [];
        paused = false;
        lastUi = "";
        cleanInput();
        screen = "title";
        cover.hidden = false;
        cover.inert = false;
        field.inert = true;
        overlay.hidden = true;
        $(".az-hud").hidden = $(".az-touch").hidden = pauseButton.hidden = true;
        $('[data-action="solo"]').focus({preventScroll:true});

    }

    function coop(note = ""){

        title();
        panel("coop","Two-player co-op","Enter together",
            '<p>Host a room and share its four-character code, or enter your partner’s code below.</p>' +
            '<div class="az-actions">' + button("host","Host a room",true) + '</div>' +
            '<form><input maxlength="4" required minlength="4" pattern="[A-Za-z0-9]{4}" placeholder="CODE" aria-label="AneZ room code" autocomplete="off" spellcheck="false"><button type="submit">Join room</button></form>' +
            '<p class="az-status" role="status"></p>' + button("title","Back"));
        status(note);

    }

    async function connect(host, code){

        const id = ++pending;
        panel("lobby","Two-player co-op",host ? "Opening room" : "Joining room",
            '<p class="az-status" role="status">Contacting the room server…</p>' + button("title","Cancel"));
        try{

            if(host)
                await net.host();
            else
                await net.join(code);

        }
        catch(error){

            if(id === pending)
                coop(error.message || "The room server could not be reached.");

        }

    }

    function lobby(){

        const host = net.role === "host";
        panel("lobby","Two-player co-op",net.ready ? "Party assembled" : "Room open",
            (host && net.code ? '<span class="az-kicker">Room code</span><strong class="az-room-code"></strong>' : '') +
            '<p class="az-status" role="status"></p><div class="az-actions">' +
            (host && net.ready ? button("together","Begin co-op run",true) : '') + button("title","Leave room") + '</div>');
        if($(".az-room-code"))
            $(".az-room-code").textContent = net.code;
        status(net.ready ? (host ? "Both pilgrims are ready." : "Waiting for the host to begin.") : "Share this code with your partner.");

    }

    function journal(){

        const [kind,name,entry] = JOURNAL[page];
        panel("journal","Field journal · " + (page+1) + " / " + JOURNAL.length, name,
            '<canvas class="az-plate" width="132" height="132" aria-label="Creature illustration"></canvas>' +
            '<p></p><div class="az-actions az-journal-nav">' + button("prev","Previous") + button("next","Next") + button("title","Close") + '</div>');
        body.querySelector("p").textContent = entry;
        drawEnemy($(".az-plate").getContext("2d"),{kind,x:28,y:24,w:75,h:88,face:1,hp:1,maxHp:1,mode:"idle",move:"",hit:0,id:page+1,phase:0,timer:1,boss:page>=3},0);

    }

    function start(count){

        slot = 0;
        const seed = crypto.getRandomValues(new Uint32Array(1))[0];
        state = createRun(seed,count);
        paused = false;
        cleanInput();
        remote = {};
        outbox = [];
        accumulator = wireTime = 0;
        lastUi = "";
        previousTime = performance.now();
        syncUi();
        broadcast();
        schedule();

    }

    function setPaused(value){

        paused = value;
        cleanInput();
        remote = {};
        syncUi();
        broadcast();

    }

    function togglePause(){

        if(state?.phase !== "play")
            return;
        if(net.role === "guest")
            net.send("pause",stamp());
        else
            setPaused(!paused);

    }

    function stamp(){

        return {seed:state.seed, room:state.room};

    }

    function broadcast(){

        if(net.role !== "host" || !net.ready || net.busy || !state)
            return;
        net.send("state",{state,paused,events:outbox});
        outbox = [];

    }

    function syncUi(){

        if(!state)
            return;
        cover.hidden = true;
        $(".az-hud").hidden = false;
        const mine = state.players[slot];
        const playing = state.phase === "play" && !paused;
        const heading = (state.players.length === 2 ? "Co-op" : "Solo") + " · Chamber " + (state.room+1) + " / 9";
        const items = [
            [".az-chamber",heading], [".az-region",REGIONS[state.region]], [".az-weapon",WEAPONS[mine.weapon].name],
            [".az-health","♥ " + mine.hp + " / " + mine.maxHp]
        ];
        for(const [cls,value] of items){

            const element = $(cls);
            if(element.textContent !== value)
                element.textContent = value;

        }
        $(".az-touch").hidden = !playing;
        pauseButton.hidden = !playing;
        const key = [state.seed,state.room,state.phase,paused,state.choices?.[slot],net.role,state.players.length].join("/");
        if(key === lastUi)
            return;
        lastUi = key;
        cleanInput();
        if(playing){

            screen = "play";
            field.inert = false;
            overlay.hidden = true;
            field.focus({preventScroll:true});
            return;

        }
        if(paused && state.phase === "play"){

            panel("pause","Chamber " + (state.room+1),"Run paused",
                '<p>Clear the chamber, then enter the gate on the right. A dash carries you safely through an attack.</p><div class="az-actions">' +
                button("pause","Resume",true) + button("title",net.role === "guest" ? "Leave run" : "End run") + '</div>');
            return;

        }
        if(state.phase === "reward"){

            const picked = state.choices[slot] !== null;
            const options = state.offers[slot].map(key => {

                const weapon = WEAPONS[key];
                const [name,description] = weapon ? [weapon.name,WEAPON_TEXT[key]] : RELICS[key];
                return '<button data-pick="' + key + '"><strong>' + name + '</strong><small>' + description + '</small></button>';

            }).join("");
            panel("reward","Chamber " + (state.room+1) + " cleared","The reliquary",
                (picked ? '<p>Waiting for your partner to choose.</p>' : '<p>Take one gift for the rest of this run.</p><div class="az-offers">' + options + '</div>'));
            return;

        }
        panel("end",state.phase === "won" ? "The last gate opens" : REGIONS[state.region],
            state.phase === "won" ? "The vigil is over" : "The pilgrim falls",
            '<p>Chamber ' + (state.room+1) + ' of 9 · ' + state.kills + ' fallen foes.</p><div class="az-actions">' +
            (net.role === "guest" ? "<p>Waiting for the host to start a new run.</p>" : button("retry","New run",true)) +
            button("title","Title screen") + '</div>');

    }

    root.addEventListener("click", event => {

        const target = event.target.closest("button");
        if(!target)
            return;
        sound.unlock();
        const key = target.dataset.pick;
        if(key && state?.phase === "reward"){

            if(net.role === "guest")
                net.send("choice",{...stamp(),key});
            else{

                choose(state,slot,key,state.room);
                syncUi();
                broadcast();

            }
            return;

        }
        switch(target.dataset.action){

            case "solo": start(1); break;
            case "retry": start(net.ready ? 2 : 1); break;
            case "together": if(net.ready) start(2); break;
            case "coop": coop(); break;
            case "title": title(); break;
            case "journal": page = 0; journal(); break;
            case "next": page = (page+1) % JOURNAL.length; journal(); break;
            case "prev": page = (page+JOURNAL.length-1) % JOURNAL.length; journal(); break;
            case "host": connect(true); break;
            case "pause": togglePause(); break;
            case "sound":
                audible = !audible;
                sound.setVolume("master",audible ? .42 : 0);
                target.textContent = audible ? "Sound on" : "Sound off";
                target.setAttribute("aria-pressed",String(audible));
                if(screen === "play") field.focus({preventScroll:true});
                break;

        }

    });
    root.addEventListener("submit", event => {

        event.preventDefault();
        connect(false,event.target.querySelector("input").value.toUpperCase());

    });
    function press(id, action){

        if(!held.has(id))
            taps.add(action);
        held.set(id,action);

    }
    root.addEventListener("keydown", event => {

        if(!state || event.target.matches("input"))
            return;
        if((event.code === "Escape" || event.code === "KeyP") && state.phase === "play"){

            event.preventDefault();
            if(!event.repeat) togglePause();
            return;

        }
        if(screen !== "play" || !KEYS[event.code])
            return;
        event.preventDefault();
        press(event.code,KEYS[event.code]);

    });
    window.addEventListener("keyup", event => held.delete(event.code));
    root.addEventListener("pointerdown", event => {

        const control = event.target.closest("[data-key]");
        if(!control)
            return;
        event.preventDefault();
        control.setPointerCapture(event.pointerId);
        press(event.pointerId,control.dataset.key);

    });
    root.addEventListener("lostpointercapture", event => held.delete(event.pointerId));
    root.addEventListener("focusout", event => {

        if(!root.contains(event.relatedTarget))
            cleanInput();

    });
    function inactive(){

        cleanInput();
        if(state?.phase === "play" && !paused && !net.ready)
            setPaused(true);

    }
    window.addEventListener("blur", inactive);
    document.addEventListener("visibilitychange", () => {

        if(!document.hidden)
            return;
        inactive();
        // A background host loses its animation clock. Pause both screens together.
        if(net.ready && net.role === "host" && state?.phase === "play" && !paused)
            setPaused(true);

    });
    new IntersectionObserver(entries => {

        visible = entries[0].isIntersecting;
        if(!visible) inactive();

    }).observe(root);
    window.addEventListener("pagehide",() => net.stop());

    function readInput(){

        const down = new Set(held.values());
        const input = {axis:Number(down.has("right")) - Number(down.has("left")),
            attack:down.has("attack"), strike:taps.has("attack"), jump:taps.has("jump"), drop:taps.has("drop"), dash:taps.has("dash")};
        taps.clear();
        return input;

    }

    function schedule(){

        if(!frameId)
            frameId = requestAnimationFrame(frame);

    }

    function frame(now){

        frameId = 0;
        if(!state)
            return;
        const dt = Math.min(.10,Math.max(0,(now-previousTime)/1000));
        previousTime = now;
        accumulator += dt;
        wireTime += dt;
        const guest = net.role === "guest";
        if(guest){

            if(screen === "play" && (wireTime >= .05 || taps.size)){

                net.send("input",{...stamp(),...readInput()});
                wireTime = 0;

            }
            accumulator = 0;

        }
        else{

            while(accumulator >= STEP){

                accumulator -= STEP;
                if(paused || state.phase !== "play")
                    continue;
                const local = readInput();
                local.attack ||= local.strike;
                if(now - remoteAt > 350)
                    remote = {};
                step(state,[local,{...remote,attack:remote.attack || remote.strike}]);
                remote.jump = remote.drop = remote.dash = remote.strike = false;
                const events = state.events.splice(0);
                view.effects(events);
                if(net.ready && outbox.length < 128)
                    outbox.push(...events);

            }
            syncUi();
            if(wireTime >= (state.phase === "play" && !paused ? .05 : .8)){

                broadcast();
                wireTime = 0;

            }

        }
        if(visible && (screen === "play" || !field.dataset.painted))
            view.draw(state,slot,dt,guest);
        if(visible)
            field.dataset.painted = "true";
        schedule();

    }

    if(new URLSearchParams(location.search).has("dev"))
        window.anez = {get state(){ return state; }, get role(){ return net.role; }};

}
