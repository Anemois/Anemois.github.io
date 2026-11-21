// Settings: how loud the game is (all of it, the action, the menus and
// chests) and whether the screen shakes. A quick volume slider sits in the
// side panel; the rest is in a small window over the game. Kept in this
// browser only (not in the save you export).

const KEY = "anecrawler-settings";

const DEFAULTS = {master: 0.6, fx: 1, ui: 0.8, shake: true};

const SLIDERS = [
    ["master", "Volume"],
    ["fx", "Action"],
    ["ui", "Menus & chests"]
];


function load(){

    try {

        return {...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY))};

    }
    catch {

        return {...DEFAULTS};

    }

}


export function createSettings(row, overlay, {sound, renderer, onClose = () => {}}){

    const settings = load();

    row.innerHTML =
        `
        <label class="ac-volume">Sound <input type="range" min="0" max="100" step="1" aria-label="Volume"></label>
        <button class="ac-settings-open">Settings</button>
        `;

    overlay.innerHTML =
        `
        <div class="ac-overlay-box ac-settings-box">
            <strong>Settings</strong>
            ${SLIDERS.map(([key, name]) => `
                <label class="ac-setting">
                    <span>${name}</span>
                    <input type="range" min="0" max="100" step="1" data-key="${key}">
                    <output></output>
                </label>`).join("")}
            <label class="ac-setting ac-setting-check">
                <input type="checkbox" data-key="shake">
                <span>Screen shake</span>
            </label>
            <button class="ac-settings-close">Done <kbd>Esc</kbd></button>
        </div>
        `;

    overlay.hidden = true;

    const quick = row.querySelector("input");
    const sliders = [...overlay.querySelectorAll("input[type=range]")];
    const shake = overlay.querySelector("input[type=checkbox]");


    function save(){

        try {

            localStorage.setItem(KEY, JSON.stringify(settings));

        }
        catch {

            // (private windows may not keep it: the settings still work now)

        }

    }


    // puts the settings into the game and onto the controls
    function apply(){

        for(const [key] of SLIDERS)
            sound.setVolume(key, settings[key]);

        renderer.setShake(settings.shake ? 1 : 0);

        quick.value = Math.round(settings.master * 100);

        for(const input of sliders){

            input.value = Math.round(settings[input.dataset.key] * 100);
            input.nextElementSibling.textContent = `${input.value}%`;

        }

        shake.checked = settings.shake;

    }


    function set(key, value){

        settings[key] = value;

        apply();
        save();

    }


    quick.oninput = () => set("master", quick.value / 100);

    for(const input of sliders)
        input.oninput = () => set(input.dataset.key, input.value / 100);

    // a blip at the new level, so you hear what you chose
    for(const input of [quick, ...sliders])
        input.onchange = () => {

            sound.unlock();
            sound.play(v => v.tone({type: "triangle", freq: 660, time: 0.12, gain: 0.15}), {group: input.dataset.key === "fx" ? "fx" : "ui"});

        };

    shake.onchange = () => set("shake", shake.checked);

    row.querySelector(".ac-settings-open").onclick = open;
    overlay.querySelector(".ac-settings-close").onclick = close;

    // keys pressed in the window stay in it (arrows move a slider), and
    // Esc closes it from anywhere in it
    overlay.addEventListener("keydown", event => {

        event.stopPropagation();

        if(event.key === "Escape"){

            event.preventDefault();

            close();

        }

    });


    function open(){

        apply();

        overlay.hidden = false;

    }


    function close(){

        if(overlay.hidden)
            return;

        overlay.hidden = true;

        onClose();

    }


    apply();


    return {
        open,
        close,
        isOpen: () => !overlay.hidden
    };

}
