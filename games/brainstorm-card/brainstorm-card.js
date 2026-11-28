// 午後激盪 (Afternoon Brainstorming): a card battler made in Godot by Anemois
// and friends (github.com/RobinLiu69/AfternoonBrainstorming started it).
// The deploy replaces games/brainstorm with the Godot export. The export is
// big, so it only loads when Play is pressed, and runs in an iframe: the
// engine expects a page of its own.


// The online server for web players: the game's own dedicated server, run on
// Render with transport=websocket (see server/brainstorm/readme.md). From
// localhost the game looks for one on this computer instead.
const PUBLIC_SERVER = "wss://afternoon-brainstorm-server.onrender.com";

const LOCAL_SERVER = "ws://localhost:24242";

const local = ["localhost", "127.0.0.1"].includes(location.hostname);

const SERVER_URL = local ? LOCAL_SERVER : PUBLIC_SERVER;

// a free Render server sleeps after 15 quiet minutes, which would end a match
const WAKE_EVERY_MS = 8 * 60000;

// the game's own size: it only ever draws it at a whole scale (crisp pixels)
const GAME_WIDTH = 640;


export function init(container){

    const card =
        container.querySelector(".brainstorm");

    const field =
        card.querySelector(".ab-field");

    const cover =
        card.querySelector(".ab-cover");

    const close =
        card.querySelector(".ab-close");

    let frame = null;

    let awake = null;


    new ResizeObserver(
        () => frame && fit(field, frame)
    ).observe(field);


    card.querySelector(".ab-play").addEventListener(
        "click",
        () => {

            frame = openGame(field);

            fit(field, frame);

            cover.hidden = true;

            close.hidden = false;

            wake();

            awake = setInterval(wake, WAKE_EVERY_MS);

        }
    );


    close.addEventListener(
        "click",
        () => {

            frame?.remove();

            frame = null;

            clearInterval(awake);

            cover.hidden = false;

            close.hidden = true;

        }
    );

}


// The game's page, told which server to use (?server=, read by the game's
// net_transport.gd).
function openGame(field){

    const frame =
        document.createElement("iframe");

    const page =
        new URL("../brainstorm/index.html", import.meta.url);

    page.searchParams.set(
        "server",
        SERVER_URL
    );

    frame.src = page.href;

    frame.title = "午後激盪";

    frame.allow = "fullscreen; autoplay";


    // keys go to the game from the start
    frame.addEventListener(
        "load",
        () => frame.focus()
    );


    field.appendChild(
        frame
    );

    return frame;

}


// The game picks the biggest whole scale that fits its page, which would
// leave a black frame in most fields. So its page is made as big as the next
// whole scale up, and shrunk to fit the field: the picture fills it.
function fit(field, frame){

    const ratio =
        devicePixelRatio || 1;

    const scale =
        Math.max(1, Math.ceil(field.clientWidth * ratio / GAME_WIDTH));

    const width =
        scale * GAME_WIDTH / ratio;


    frame.style.width = `${width}px`;

    frame.style.height = `${width * 9 / 16}px`;

    frame.style.transform = `scale(${field.clientWidth / width})`;

}


// Nudges a server that may be asleep, without waiting for it. The game
// server only speaks WebSocket, so the request itself fails, but it still
// wakes the server (or keeps it up).
function wake(){

    if(local){

        return;

    }


    fetch(
        PUBLIC_SERVER.replace(/^ws/, "http"),
        {mode: "no-cors", cache: "no-store"}
    ).catch(() => {});

}
