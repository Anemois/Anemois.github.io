const GAMES = [

    {
        name:"click_speed",
        column:0,
        order:0
    },


    {
        name:"reaction_time",
        column:0,
        order:1
    },


    {
        name:"tetris",
        column:1,
        order:0
    },


    {
        name:"anetan",
        column:1,
        order:1
    },


    {
        name:"anefk",
        full:true,
        order:0
    },


    {
        name:"anetd",
        full:true,
        order:1
    },


    {
        name:"anecrawler",
        full:true,
        order:2
    }

];


const GAME_ROOT =
    new URL(
        "./games/",
        import.meta.url
    );


// what a game hears when the mouse leaves it (AneTAN uses pointer events)
const LEAVE_EVENTS = [
    "mouseleave",
    "pointerleave"
];


// the game slot that was clicked, kept open until a click lands outside it
let focused = null;


document.addEventListener(
    "DOMContentLoaded",
    init
);


async function init(){

    const games =
        document.querySelector(
            "#games"
        );


    const loading =
        document.querySelector(
            "#games-loading"
        );


    const wrapper =
        document.querySelector(
            "#games-wrapper"
        );


    const columns =
        document.querySelectorAll(
            "#games .game-column"
        );


    const fullContainer =
        document.querySelector(
            "#games-full"
        );


    try{

        const gamePromises =
            GAMES.map(
                game =>
                    loadGame(
                        game,
                        columns,
                        fullContainer
                    )
            );


        await Promise.all(
            gamePromises
        );


        games.classList.remove(
            "loading"
        );


        wrapper.classList.add(
            "ready"
        );


        document.addEventListener(
            "pointerdown",
            onPointerDown
        );


        for(const type of ["fullscreenchange", "webkitfullscreenchange"]){

            document.addEventListener(
                type,
                updateFullscreenButtons
            );

        }


    }

    catch(error){

        console.error(
            "Failed to load games:",
            error
        );


        games.classList.remove(
            "loading"
        );


        wrapper.classList.add(
            "error"
        );


        loading.textContent =
            "Failed to load games.";

    }

}


async function loadGame(
    game,
    columns,
    fullContainer
){

    const {
        name,
        column,
        full
    } = game;


    let targetColumn;


    if(full){

        targetColumn =
            fullContainer;

    }

    else{

        targetColumn =
            columns[column];

    }


    if(!targetColumn){

        throw new Error(
            `Game "${name}" has invalid placement.`
        );

    }


    const gameContainer =
        document.createElement(
            "div"
        );


    gameContainer.className =
        full ? "game-slot full" : "game-slot";


    // registered before the game's own listeners, so it runs first
    holdLeaveWhileFocused(
        gameContainer
    );


    targetColumn.appendChild(
        gameContainer
    );


    const gameRoot =
        new URL(
            `${name}/`,
            GAME_ROOT
        );


    const htmlURL =
        new URL(
            `${name}.html`,
            gameRoot
        );


    const cssURL =
        new URL(
            `${name}.css`,
            gameRoot
        );


    const jsURL =
        new URL(
            `${name}.js`,
            gameRoot
        );


    const [
        html,
        ,
        gameModule
    ] =
        await Promise.all([

            loadHTML(
                htmlURL
            ),

            loadCSS(
                cssURL
            ),

            import(
                jsURL.href
            )

        ]);


    gameContainer.innerHTML =
        html;


    if(
        typeof gameModule.init !==
        "function"
    ){

        throw new Error(
            `Game "${name}" does not export init().`
        );

    }


    gameModule.init(
        gameContainer
    );


    addFullscreenButton(
        gameContainer
    );

}


async function loadHTML(url){

    const response =
        await fetch(url);


    if(!response.ok){

        throw new Error(
            `Could not load HTML: ${url.href}`
        );

    }


    return response.text();

}


function loadCSS(url){

    return new Promise(
        (resolve,reject)=>{

            const link =
                document.createElement(
                    "link"
                );


            link.rel =
                "stylesheet";


            link.href =
                url.href;


            link.onload =
                resolve;


            link.onerror =
                ()=>{

                    reject(
                        new Error(
                            `Could not load CSS: ${url.href}`
                        )
                    );

                };


            document.head.appendChild(
                link
            );

        }
    );

}


/* ---------------- Focus ---------------- */
// Games open while hovered: their CSS uses :hover and their scripts listen
// for the mouse leaving. Clicking a game focuses it, so it stays open:
//  - its slot gets the "focused" class, which each game's CSS treats like
//    :hover (".game-slot.focused #game ..." next to "#game:hover ...")
//  - the leave events of its card never reach the game, so its scripts go
//    on as if the mouse were still there (keys keep working too)
// A click outside unfocuses it; if the mouse is elsewhere by then, the game
// gets the leave events it missed and closes as usual.


function onPointerDown(event){

    const slot =
        event.target.closest?.(
            ".game-slot"
        ) ?? null;


    if(slot !== focused){

        setFocus(
            slot
        );

    }

}


function setFocus(slot){

    const previous =
        focused;


    focused =
        slot;


    previous?.classList.remove(
        "focused"
    );


    slot?.classList.add(
        "focused"
    );


    if(
        previous
        && !previous.matches(":hover")
    ){

        sendLeave(
            previous
        );

    }

}


// Only the card's own leave events are held back (the slot and the game's
// root element): leaving a canvas or a button inside it still counts.
function holdLeaveWhileFocused(slot){

    for(const type of LEAVE_EVENTS){

        slot.addEventListener(
            type,
            event => {

                const card =
                    event.target === slot
                    || event.target === slot.firstElementChild;


                if(
                    slot === focused
                    && card
                    && event.isTrusted
                ){

                    event.stopImmediatePropagation();

                }

            },
            true
        );

    }

}


// games listen on the slot or on their root element, so both get them
function sendLeave(slot){

    for(const target of [slot, slot.firstElementChild]){

        if(!target){

            continue;

        }


        target.dispatchEvent(
            new MouseEvent("mouseleave")
        );


        target.dispatchEvent(
            new PointerEvent(
                "pointerleave",
                {pointerType: "mouse"}
            )
        );

    }

}


/* ---------------- Full screen ---------------- */
// Every game gets a small button in its top right corner that fills the
// screen with it. A game in full screen is also focused, so it stays open;
// Esc (or the button again) leaves full screen.


const EXPAND_ICON =
    `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/>
    </svg>`;

const SHRINK_ICON =
    `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4"/>
    </svg>`;


const fullscreenElement = () =>
    document.fullscreenElement
    ?? document.webkitFullscreenElement
    ?? null;


function addFullscreenButton(slot){

    // iPhones only allow videos to go full screen
    if(
        !document.fullscreenEnabled
        && !document.webkitFullscreenEnabled
    ){

        return;

    }


    const button =
        document.createElement(
            "button"
        );


    button.type =
        "button";

    button.className =
        "fullscreen-button";


    // the button sits on the slot, beside the game: keep its clicks from
    // reaching games that listen on their slot (click speed would count them)
    for(const type of ["pointerdown", "mousedown", "click"]){

        button.addEventListener(
            type,
            event => event.stopPropagation()
        );

    }


    button.addEventListener(
        "click",
        () => {

            // so Space and Enter go to the game, not back to this button
            button.blur();

            toggleFullscreen(
                slot
            );

        }
    );


    slot.appendChild(
        button
    );


    showFullscreenState(
        slot,
        button
    );

}


function toggleFullscreen(slot){

    if(fullscreenElement() === slot){

        (document.exitFullscreen ?? document.webkitExitFullscreen)
            ?.call(document);

        return;

    }


    setFocus(
        slot
    );


    const request =
        slot.requestFullscreen
        ?? slot.webkitRequestFullscreen;


    Promise.resolve(
        request?.call(slot)
    ).catch(
        () => {}
    );

}


function updateFullscreenButtons(){

    for(const button of document.querySelectorAll(".fullscreen-button")){

        showFullscreenState(
            button.parentElement,
            button
        );

    }


    // left full screen with the mouse elsewhere: close like a normal click outside
    const slot =
        fullscreenElement();


    if(slot){

        setFocus(
            slot
        );

    }

}


function showFullscreenState(slot, button){

    const on =
        fullscreenElement() === slot;


    button.innerHTML =
        on ? SHRINK_ICON : EXPAND_ICON;

    button.title =
        on ? "Exit full screen (Esc)" : "Full screen";

    button.setAttribute(
        "aria-label",
        button.title
    );

}
