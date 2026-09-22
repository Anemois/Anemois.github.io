export function init(container) {
    const clickBox = container.querySelector("#click");
    const clickText = clickBox.querySelector(".readonly");
    const timeContainer = container.querySelector("#time");
    const highscoreText = container.querySelector(".highscore");

    let selectedTime = 10;
    let clicks = 0;
    let startTime = 0;
    let timer = null;

    let running = false;
    let cooldown = false;

    createTimeOptions();
    updateHighscore();

    const timeOptions = timeContainer.querySelectorAll(".click-box");

    timeOptions.forEach(box => {
        box.addEventListener("click", () => {
            if (running || cooldown) {
                return;
            }

            selectedTime = Number(box.dataset.time);

            timeOptions.forEach(option => {
                option.classList.remove("selected");
            });

            box.classList.add("selected");

            updateHighscore();
        });

        if (Number(box.dataset.time) === selectedTime) {
            box.classList.add("selected");
        }
    });

    clickBox.addEventListener("click", () => {
        if (cooldown) {
            return;
        }

        if (!running) {
            startGame();
        } else {
            clicks++;
        }
    });

    function createTimeOptions() {
        const times = [1, 5, 10, 20, 30, 60];

        times.forEach(time => {
            const box = document.createElement("div");

            box.classList.add("click-box", "hover-appear");

            box.dataset.time = time;

            const text = document.createElement("span");

            text.classList.add("readonly");
            text.textContent = time;

            box.appendChild(text);

            timeContainer.appendChild(box);
        });
    }

    function startGame() {
        running = true;

        clicks = 1;

        startTime = performance.now();

        clickText.textContent =
            `0.00s | 1`;

        timer = setInterval(() => {
            updateDisplay();

            const elapsed =
                (performance.now() - startTime) / 1000;

            if (elapsed >= selectedTime) {
                endGame();
            }
        }, 10);
    }

    function updateDisplay() {
        const elapsed =
            (performance.now() - startTime) / 1000;

        const remaining =
            Math.max(0, selectedTime - elapsed);

        clickText.textContent =
            `${remaining.toFixed(2)}s | ${clicks}`;
    }

    function endGame() {
        clearInterval(timer);

        timer = null;

        running = false;
        cooldown = true;

        const cps = clicks / selectedTime;

        clickText.textContent =
            `${clicks} clicks | ${cps.toFixed(2)} CPS`;

        saveHighscore(cps);

        setTimeout(() => {
            cooldown = false;

            clickText.textContent =
                "Click To Start";
        }, 2000);
    }

    function getStorageKey() {
        return `click-speed-highscore-${selectedTime}`;
    }

    function getHighscore() {
        const saved = localStorage.getItem(
            getStorageKey()
        );

        if (saved === null) {
            return 0;
        }

        return Number(saved);
    }

    function saveHighscore(cps) {
        const currentHighscore = getHighscore();

        if (cps > currentHighscore) {
            localStorage.setItem(
                getStorageKey(),
                cps.toString()
            );

            updateHighscore();
        }
    }

    function updateHighscore() {
        const highscore = getHighscore();

        highscoreText.textContent =
            `Highscore: ${highscore.toFixed(2)} CPS`;
    }
}