document.addEventListener("DOMContentLoaded", () => {
    init();
});


async function loadGame(gameName, columnIndex) {

    const gamePath = `games/${gameName}`;

    const htmlResponse = await fetch(
        `${gamePath}/${gameName}.html`
    );

    if (!htmlResponse.ok) {
        throw new Error(
            `Could not load ${gameName}.html`
        );
    }

    const html = await htmlResponse.text();

    const container = document.createElement("div");

    container.innerHTML = html;


    const columns =
        document.querySelectorAll("#games .game-column");

    columns[columnIndex].appendChild(container);


    const css = document.createElement("link");

    css.rel = "stylesheet";
    css.href = `${gamePath}/${gameName}.css`;

    document.head.appendChild(css);


    const gameModule = await import(
        `./${gamePath}/${gameName}.js`
    );

    if (typeof gameModule.init === "function") {
        gameModule.init(container);
    }
}


async function init() {

    await loadGame("click_speed", 0);
    await loadGame("reaction_time", 0);

    await loadGame("tetris", 1);
}