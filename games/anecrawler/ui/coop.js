import {SERVER_URL, SERVER_READY} from "../net/config.js";
import {hostRoom, joinRoom, wake} from "../net/relay.js";
import {setText} from "../util.js";


// The "Play together" part of the panel.
//
// Host: opens a room on the game server and shows its code (say, K7QM).
// Join: a box for the code appears right here (no browser popup, which
// would knock the game out of full screen). Up to four players.
//
// hooks: session() -> the current session,
//        join(end) -> switches to a guest session over that connection,
//        leave()   -> back to playing alone
export function createCoop(element, hooks){

    element.innerHTML =
        `
        <div class="ac-row ac-coop-head">
            <span>Play together</span>
            <small class="ac-coop-status"></small>
        </div>
        <div class="ac-coop-code" hidden>
            <span>Room code</span>
            <strong></strong>
            <button class="ac-coop-copy">Copy</button>
        </div>
        <form class="ac-coop-form" hidden>
            <input class="ac-coop-input" maxlength="4" placeholder="CODE" aria-label="Room code"
                autocomplete="off" autocapitalize="characters" spellcheck="false">
            <button type="submit">Join</button>
            <button type="button" class="ac-coop-cancel">Cancel</button>
        </form>
        <div class="ac-row ac-coop-buttons">
            <button class="ac-coop-host">Host</button>
            <button class="ac-coop-join">Join</button>
            <button class="ac-coop-leave"></button>
        </div>
        `;

    const $ = selector => element.querySelector(selector);

    const status = $(".ac-coop-status");
    const codeBox = $(".ac-coop-code");
    const codeText = $(".ac-coop-code strong");
    const copy = $(".ac-coop-copy");
    const hostButton = $(".ac-coop-host");
    const joinButton = $(".ac-coop-join");
    const leave = $(".ac-coop-leave");
    const form = $(".ac-coop-form");
    const input = $(".ac-coop-input");

    let mode = "solo";          // solo | asking | busy | hosting | guest
    let room = null;            // {code, close} while hosting
    let note = SERVER_READY ? "" : "no game server set up yet";
    let warmed = false;

    // the free server sleeps when nobody plays; this is shown while it wakes
    const waiting = () => settle("busy", "waking the game server, up to a minute…");

    hostButton.onclick = host;
    joinButton.onclick = ask;
    leave.onclick = stop;

    $(".ac-coop-cancel").onclick = () => settle("solo", "");

    form.onsubmit = event => {

        event.preventDefault();

        join(input.value);

    };

    // only letters and digits, shown in capitals; Esc gives up
    input.oninput = () => input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");

    input.onkeydown = event => {

        if(event.key === "Escape"){

            event.preventDefault();

            settle("solo", "");

        }

    };

    copy.onclick = () => {

        navigator.clipboard?.writeText(room?.code ?? "").catch(() => {});

        setText(copy, "Copied");

        setTimeout(() => setText(copy, "Copy"), 1500);

    };


    async function host(){

        mode = "busy";
        note = "opening a room…";

        update();

        try{

            room = await hostRoom(SERVER_URL, {
                game: "anecrawler",
                onGuest: end => hooks.session().accept(end),

                // The server went away. Guests on a direct line can stay
                // (nobody new can join); otherwise play on alone.
                onClose: reason => {

                    room = null;

                    if(mode !== "hosting")
                        return;

                    if((hooks.session().players ?? 1) > 1)
                        settle("hosting", "lost the game server, so nobody new can join");
                    else
                        settle("solo", reason);

                },

                onWaiting: waiting
            });

            settle("hosting", "share the code with your friends");

        }
        catch(error){

            settle("solo", error.message);

        }

    }


    // shows the code box
    function ask(){

        input.value = "";

        settle("asking", "type the code the host sees");

        input.focus();

    }


    async function join(code){

        code = code.trim();

        if(code.length < 4){

            note = "the code has 4 letters";

            update();

            input.focus();

            return;

        }

        mode = "busy";
        note = "joining…";

        update();

        try{

            hooks.join(await joinRoom(SERVER_URL, code.trim(), {onWaiting: waiting}));

            settle("guest", "");

        }
        catch(error){

            settle("solo", error.message);

        }

    }


    function stop(){

        room?.close();
        room = null;

        hooks.leave();

        settle("solo", "");

    }


    // the host went away while we were their guest
    function lost(reason){

        settle("solo", reason);

    }


    function settle(next, text){

        mode = next;
        note = text;

        update();

    }


    function update(){

        const players = hooks.session().players ?? 1;

        hostButton.hidden = joinButton.hidden = mode !== "solo";
        form.hidden = mode !== "asking";
        hostButton.disabled = joinButton.disabled = !SERVER_READY;
        leave.hidden = mode !== "hosting" && mode !== "guest";
        codeBox.hidden = mode !== "hosting" || !room;

        setText(leave, mode === "hosting" ? "Stop hosting" : "Leave");
        setText(codeText, room?.code ?? "");

        const text = {
            solo: "alone",
            asking: "",
            busy: "",
            hosting: `hosting · ${players} player${players === 1 ? "" : "s"}`,
            guest: `joined · ${players} players`
        }[mode];

        // once someone has joined, the reminder to share the code can go
        const shown = mode === "hosting" && players > 1 && room ? "" : note;

        setText(status, [text, line(), shown].filter(Boolean).join(" · "));

    }


    // how the others are connected: straight to each other, or through
    // the server (while a direct line is being set up, or if a network
    // will not allow one)
    function line(){

        if(mode !== "hosting" && mode !== "guest")
            return "";

        const routes = hooks.session().routes ?? [];

        if(!routes.length)
            return "";

        const direct = routes.filter(route => route === "direct").length;

        if(direct === routes.length)
            return "direct";

        if(direct === 0)
            return "through the server";

        return `${direct} direct, ${routes.length - direct} through the server`;

    }


    // someone opened the game: give a sleeping server a head start
    function warm(){

        if(warmed || !SERVER_READY)
            return;

        warmed = true;

        wake(SERVER_URL);

    }


    return {update, lost, warm, get mode(){ return mode; }};

}
