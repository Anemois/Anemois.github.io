const GAMES = [
    {
        name: "click_speed",
        column: 0,
        order: 0
    },

    {
        name: "reaction_time",
        column: 0,
        order: 1
    },

    {
        name: "tetris",
        column: 1,
        order: 0
    }
];


const GAME_ROOT =
    new URL(
        "./games/",
        import.meta.url
    );


document.addEventListener(
    "DOMContentLoaded",
    init
);


async function init() {
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


    try {
        const gamePromises =
            GAMES.map(
                game =>
                    loadGame(
                        game,
                        columns
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
    } catch (error) {
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
    columns
) {
    const {
        name,
        column
    } = game;


    const targetColumn =
        columns[column];


    if (!targetColumn) {
        throw new Error(
            `Game "${name}" references invalid column ${column}.`
        );
    }


    const gameContainer =
        document.createElement(
            "div"
        );


    gameContainer.className =
        "game-slot";


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


    const htmlPromise =
        loadHTML(
            htmlURL
        );


    const cssPromise =
        loadCSS(
            cssURL
        );


    const modulePromise =
        import(
            jsURL.href
        );


    const [
        html,
        ,
        gameModule
    ] =
        await Promise.all([
            htmlPromise,
            cssPromise,
            modulePromise
        ]);


    gameContainer.innerHTML =
        html;


    if (
        typeof gameModule.init !==
        "function"
    ) {
        throw new Error(
            `Game "${name}" does not export init().`
        );
    }


    gameModule.init(
        gameContainer
    );
}


async function loadHTML(url) {
    const response =
        await fetch(url);


    if (!response.ok) {
        throw new Error(
            `Could not load HTML: ${url.href} (${response.status})`
        );
    }


    return response.text();
}


function loadCSS(url) {
    return new Promise(
        (resolve, reject) => {
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
                () => {
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