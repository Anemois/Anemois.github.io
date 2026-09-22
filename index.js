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


document.addEventListener(
    "DOMContentLoaded",
    init
);


async function init() {
    const games =
        document.querySelector("#games");

    const loading =
        document.querySelector("#games-loading");

    const wrapper =
        document.querySelector("#games-wrapper");


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

        loading.textContent =
            "Failed to load games.";
    }
}


async function loadGame(game) {
    const {
        name,
        column
    } = game;


    const gamePath =
        `games/${name}`;


    const htmlPath =
        `${gamePath}/${name}.html`;

    const cssPath =
        `${gamePath}/${name}.css`;

    const jsPath =
        `./${gamePath}/${name}.js`;


    const htmlPromise =
        loadHTML(htmlPath);

    const cssPromise =
        loadCSS(cssPath);

    const modulePromise =
        import(jsPath);


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


    const columns =
        document.querySelectorAll(
            "#games .game-column"
        );


    const targetColumn =
        columns[column];


    if (!targetColumn) {
        throw new Error(
            `Game column ${column} does not exist`
        );
    }


    const container =
        document.createElement("div");


    container.innerHTML =
        html;


    targetColumn.appendChild(
        container
    );


    if (
        typeof gameModule.init ===
        "function"
    ) {
        gameModule.init(
            container
        );
    }
}


async function loadHTML(path) {
    const response =
        await fetch(path);


    if (!response.ok) {
        throw new Error(
            `Could not load ${path}`
        );
    }


    return response.text();
}


function loadCSS(path) {
    return new Promise(
        (resolve, reject) => {
            const existing =
                document.querySelector(
                    `link[href="${path}"]`
                );


            if (existing) {
                resolve();

                return;
            }


            const link =
                document.createElement(
                    "link"
                );


            link.rel =
                "stylesheet";

            link.href =
                path;


            link.onload =
                resolve;


            link.onerror =
                () => {
                    reject(
                        new Error(
                            `Could not load ${path}`
                        )
                    );
                };


            document.head.appendChild(
                link
            );
        }
    );
}