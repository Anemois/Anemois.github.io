export function init(container) {
    const game =
        container.id === "reaction"
            ? container
            : container.querySelector("#reaction");

    if (!game || game.dataset.initialized) {
        return;
    }

    game.dataset.initialized = "true";

    setupReactionTest(game);
}


function setupReactionTest(game) {

    const clickBox =
        game.querySelector("#reaction-click");

    const clickText =
        clickBox.querySelector("span");

    const highscoreText =
        game.querySelector("#reaction-highscore");


    const HIGH_SCORE_KEY =
        "reaction-highest-speed";


    let state = "idle";
    let timeout = null;
    let startTime = 0;

    let bestTime =
        Number(localStorage.getItem(HIGH_SCORE_KEY)) || null;


    updateHighscore();


    clickBox.addEventListener("click", () => {

        if (state === "idle") {
            startTest();
            return;
        }


        if (state === "ready") {
            falseStart();
            return;
        }


        if (state === "go") {
            recordReaction();
        }
    });


    game.addEventListener("mouseleave", () => {

        if (state === "ready" || state === "go") {
            cancelTest();
        }
    });


    function startTest() {

        state = "ready";

        clickText.textContent =
            "Get Ready...";

        clickBox.classList.remove(
            "reaction-go",
            "reaction-result",
            "reaction-false-start"
        );

        clickBox.classList.add(
            "reaction-ready"
        );


        const delay =
            1500 +
            Math.random() * 2500;


        timeout = setTimeout(() => {

            state = "go";

            startTime =
                performance.now();

            clickText.textContent =
                "CLICK";

            clickBox.classList.remove(
                "reaction-ready"
            );

            clickBox.classList.add(
                "reaction-go"
            );

        }, delay);
    }


    function falseStart() {

        clearTimeout(timeout);
        timeout = null;

        state = "cooldown";

        clickText.textContent =
            "Too Soon!";

        clickBox.classList.remove(
            "reaction-ready"
        );

        clickBox.classList.add(
            "reaction-false-start"
        );


        setTimeout(() => {

            if (!game.matches(":hover")) {
                reset();
                return;
            }

            reset();

        }, 1000);
    }


    function recordReaction() {

        const reactionTime =
            performance.now() - startTime;

        state = "cooldown";

        const roundedTime =
            Math.round(reactionTime);


        clickText.textContent =
            `${roundedTime} ms`;

        clickBox.classList.remove(
            "reaction-go"
        );

        clickBox.classList.add(
            "reaction-result"
        );


        if (
            bestTime === null ||
            roundedTime < bestTime
        ) {
            bestTime = roundedTime;

            localStorage.setItem(
                HIGH_SCORE_KEY,
                bestTime
            );

            updateHighscore();
        }


        setTimeout(() => {

            reset();

        }, 1500);
    }


    function cancelTest() {

        clearTimeout(timeout);
        timeout = null;

        state = "idle";

        clickText.textContent =
            "Click To Start";

        clickBox.classList.remove(
            "reaction-ready",
            "reaction-go",
            "reaction-result",
            "reaction-false-start"
        );
    }


    function reset() {

        clearTimeout(timeout);
        timeout = null;

        state = "idle";

        clickText.textContent =
            "Click To Start";

        clickBox.classList.remove(
            "reaction-ready",
            "reaction-go",
            "reaction-result",
            "reaction-false-start"
        );
    }


    function updateHighscore() {

        if (bestTime === null) {
            highscoreText.textContent =
                "Fastest: -- ms";

            return;
        }

        highscoreText.textContent =
            `Fastest: ${bestTime} ms`;
    }
}