import {SERVER_URL, SERVER_READY} from "../net/config.js";
import {hostRoom, joinRoom} from "../net/relay.js";
import {setText} from "../util.js";


// The "Play together" part of the panel.
//
// Host: opens a room on the game server and shows its code (say, K7QM).
// Join: asks for a code and joins that room. Up to four players.
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

    let mode = "solo";          // solo | busy | hosting | guest
    let room = null;            // {code, close} while hosting
    let note = SERVER_READY ? "" : "no game server set up yet";

    hostButton.onclick = host;
    joinButton.onclick = join;
    leave.onclick = stop;

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

                // the server went away: everyone else is gone, play on alone
                onClose: reason => {

                    room = null;

                    if(mode === "hosting")
                        settle("solo", reason);

                }
            });

            settle("hosting", "share the code with your friends");

        }
        catch(error){

            settle("solo", error.message);

        }

    }


    async function join(){

        const code = prompt("Room code (ask the host for it):");

        if(!code?.trim())
            return;

        mode = "busy";
        note = "joining…";

        update();

        try{

            hooks.join(await joinRoom(SERVER_URL, code.trim()));

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
        hostButton.disabled = joinButton.disabled = !SERVER_READY;
        leave.hidden = mode !== "hosting" && mode !== "guest";
        codeBox.hidden = mode !== "hosting" || !room;

        setText(leave, mode === "hosting" ? "Stop hosting" : "Leave");
        setText(codeText, room?.code ?? "");

        const text = {
            solo: "alone",
            busy: "",
            hosting: `hosting · ${players} player${players === 1 ? "" : "s"}`,
            guest: `joined · ${players} players`
        }[mode];

        // once someone has joined, the reminder to share the code can go
        const shown = mode === "hosting" && players > 1 ? "" : note;

        setText(status, [text, shown].filter(Boolean).join(" · "));

    }


    return {update, lost, get mode(){ return mode; }};

}
