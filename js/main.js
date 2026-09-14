document.addEventListener("DOMContentLoaded", () => {
    init();
});


function init() {

    setupClickSpeedTest();
}

function setupClickSpeedTest() {
    createTimeOptions()

    const clickBox = document.getElementById("click");
    const clickText = clickBox.querySelector("span");
    const timeOptions = document.querySelectorAll("#time .click-box");

    let selectedTime = 10;
    let clicks = 0;
    let startTime = 0;
    let timer = null;

    let running = false;
    let cooldown = false;

    timeOptions.forEach(box => {
        box.addEventListener("click", () => {
            if (running || cooldown) {
                return;
            }

            selectedTime = Number(box.textContent);

            timeOptions.forEach(option => {
                option.classList.remove("selected");
            });

            box.classList.add("selected");
        });

        if(box.dataset.time == selectedTime){
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

        const timeContainer = document.getElementById("time");

        times.forEach(time => {
            const box = document.createElement("div");

            box.classList.add("click-box", "hover-appear");
            box.dataset.time = time;
            box.style.width = "32px"
            box.style.height = "18px"
            box.style.borderRadius = "10px"

            const text = document.createElement("span");
            text.classList.add("readonly");
            text.textContent = time;

            box.appendChild(text);
            timeContainer.appendChild(box);

            box.addEventListener("click", () => {
                console.log(`Selected ${time} seconds`);
            });
        });
    }

    function startGame() {
        running = true;
        clicks = 1;
        startTime = performance.now();

        clickText.textContent = "0.00s | 1";

        timer = setInterval(() => {
            updateDisplay();

            const elapsed = (performance.now() - startTime) / 1000;

            if (elapsed >= selectedTime) {
                endGame();
            }
        }, 10);
    }

    function updateDisplay() {
        const elapsed = (performance.now() - startTime) / 1000;
        const remaining = Math.max(0, selectedTime - elapsed);

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

        // Prevent restarting for 2 seconds
        setTimeout(() => {
            cooldown = false;

            clickText.textContent = "Click To Start";
        }, 2000);
    }
}