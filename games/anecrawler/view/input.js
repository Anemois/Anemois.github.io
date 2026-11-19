// Keyboard and mouse to an intent for the simulation. Keys only count while
// the game is active (hovered or focused), so the rest of the page keeps
// its keys. Taps shorter than a simulation step are kept as pulses until a
// step has seen them.

const MOVE = {
    KeyW: [0, -1], ArrowUp: [0, -1],
    KeyS: [0, 1], ArrowDown: [0, 1],
    KeyA: [-1, 0], ArrowLeft: [-1, 0],
    KeyD: [1, 0], ArrowRight: [1, 0]
};

const ACTIONS = {
    Space: "dash",
    ShiftLeft: "dash",
    ShiftRight: "dash",
    KeyQ: "swap",
    KeyE: "interact",
    KeyF: "interact"
};

// keys the page should not also react to (scrolling) while playing
const CAPTURED = new Set([...Object.keys(MOVE), ...Object.keys(ACTIONS)]);


export function createInput(canvas, {isActive, onKey}){

    const keys = new Set();
    const pulses = new Set();

    let fire = false;
    let dashButton = false;
    let mouse = {x: canvas.clientWidth / 2 + 60, y: canvas.clientHeight / 2};


    function release(){

        keys.clear();

        fire = false;
        dashButton = false;

    }


    document.addEventListener("keydown", event => {

        if(!isActive() || event.ctrlKey || event.metaKey || event.altKey)
            return;

        // typing into a field (save import prompt etc.)
        if(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
            return;

        if(onKey(event))
            return event.preventDefault();

        if(!CAPTURED.has(event.code))
            return;

        event.preventDefault();

        if(!event.repeat && ACTIONS[event.code])
            pulses.add(ACTIONS[event.code]);

        keys.add(event.code);

    });

    document.addEventListener("keyup", event => keys.delete(event.code));

    window.addEventListener("blur", release);


    canvas.addEventListener("mousemove", event => {

        const box = canvas.getBoundingClientRect();

        mouse = {x: event.clientX - box.left, y: event.clientY - box.top};

    });

    canvas.addEventListener("mousedown", event => {

        if(event.button === 0){

            fire = true;
            pulses.add("fire");

        }

        if(event.button === 2){

            dashButton = true;
            pulses.add("dash");

        }

    });

    // let go anywhere, even outside the canvas
    document.addEventListener("mouseup", event => {

        if(event.button === 0)
            fire = false;

        if(event.button === 2)
            dashButton = false;

    });

    canvas.addEventListener("contextmenu", event => event.preventDefault());

    canvas.addEventListener("wheel", event => {

        if(!isActive())
            return;

        event.preventDefault();

        pulses.add("swap");

    }, {passive: false});


    // the intent for the next steps; toWorld turns canvas pixels into world units
    function intent(toWorld){

        let mx = 0;
        let my = 0;

        for(const code of keys){

            if(MOVE[code]){

                mx += MOVE[code][0];
                my += MOVE[code][1];

            }

        }

        const held = action => [...keys].some(code => ACTIONS[code] === action) || pulses.has(action);
        const aim = toWorld(mouse.x, mouse.y);

        return {
            moveX: Math.sign(mx),
            moveY: Math.sign(my),
            aimX: aim.x,
            aimY: aim.y,
            fire: fire || pulses.has("fire"),
            dash: dashButton || held("dash"),
            swap: held("swap"),
            interact: held("interact")
        };

    }


    return {
        intent,
        release,
        consume: () => pulses.clear(),
        mouse: () => mouse
    };

}
