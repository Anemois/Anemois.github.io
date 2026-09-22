const GAMES = [
    {
        name: "click_speed",
        column: 0
    },

    {
        name: "reaction_time",
        column: 0
    },

    {
        name: "tetris",
        column: 1
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


    try {
        await Promise.all(
            GAMES.map(
                loadGame
            )
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


async function loadGame(game) {
    const {
        name,
        column
    } = game;


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
            loadHTML(htmlURL),
            loadCSS(cssURL),
            import(jsURL.href)
        ]);


    const columns =
        document.querySelectorAll(
            "#games .game-column"
        );


    const targetColumn =
        columns[column];


    if (!targetColumn) {
        throw new Error(
            `Game "${name}" references invalid column ${column}.`
        );
    }


    const container =
        document.createElement(
            "div"
        );


    container.innerHTML =
        html;


    targetColumn.appendChild(
        container
    );


    if (
        typeof gameModule.init !==
        "function"
    ) {
        throw new Error(
            `Game "${name}" does not export init().`
        );
    }


    gameModule.init(
        container
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