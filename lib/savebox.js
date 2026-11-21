// A small box over a game for save codes, used instead of the browser's
// prompt() and alert(): those are ugly, and they knock a game out of full
// screen. The box sits inside the game's own element.
//
//   showSave(root, code)      shows a save code to copy
//   askSave(root, load)       asks for one; load(code) runs on "Load" and
//                             throws (or rejects) if the code cannot be read
//
// `root` is the game's element (the box covers it). Esc or Close cancels.

let styled = false;

const STYLE = `
.save-box {
    position:absolute;
    inset:0;
    z-index:40;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:16px;
    background:rgba(0, 0, 0, 0.62);
}
.save-box[hidden] {
    display:none;
}
.save-box-panel {
    display:flex;
    flex-direction:column;
    gap:8px;
    width:min(100%, 440px);
    padding:14px;
    background:#141414;
    border:1px solid #333;
    border-radius:10px;
    color:#ddd;
    font-size:13px;
    text-align:left;
}
.save-box-panel strong {
    color:white;
    font-size:14px;
}
.save-box-text {
    box-sizing:border-box;
    width:100%;
    height:96px;
    padding:8px;
    resize:none;
    background:#0b0b0b;
    border:1px solid #444;
    border-radius:6px;
    color:white;
    font:12px/1.4 ui-monospace, Menlo, Consolas, monospace;
    word-break:break-all;
    user-select:text;
}
.save-box-text:focus {
    border-color:#63d69f;
    outline:none;
}
.save-box-note {
    min-height:1em;
    color:#888;
    font-size:12px;
}
.save-box-note.bad {
    color:#ff5c7a;
}
.save-box-row {
    display:flex;
    justify-content:flex-end;
    gap:6px;
}
`;


function addStyle(){

    if(styled)
        return;

    styled = true;

    const style = document.createElement("style");

    style.textContent = STYLE;

    document.head.appendChild(style);

}


// the one box for this game, made on first use
function boxFor(root){

    let box = root.querySelector(":scope > .save-box");

    if(box)
        return box;

    addStyle();

    if(getComputedStyle(root).position === "static")
        root.style.position = "relative";

    box = document.createElement("div");
    box.className = "save-box";
    box.hidden = true;

    box.innerHTML =
        `
        <form class="save-box-panel">
            <strong></strong>
            <textarea class="save-box-text" spellcheck="false" autocomplete="off"></textarea>
            <div class="save-box-note"></div>
            <div class="save-box-row">
                <button type="button" class="save-box-copy">Copy</button>
                <button type="submit" class="save-box-load">Load</button>
                <button type="button" class="save-box-close">Close</button>
            </div>
        </form>
        `;

    const close = () => box.hidden = true;

    box.querySelector(".save-box-close").onclick = close;

    // a click on the dark around the panel closes it too
    box.addEventListener("mousedown", event => {

        if(event.target === box)
            close();

    });

    box.addEventListener("keydown", event => {

        // the game under the box should not hear any of this
        event.stopPropagation();

        if(event.key === "Escape"){

            event.preventDefault();

            close();

        }

    });

    root.appendChild(box);

    return box;

}


function open(root, {title, text, note, editable}){

    const box = boxFor(root);
    const area = box.querySelector(".save-box-text");

    box.querySelector("strong").textContent = title;
    box.querySelector(".save-box-note").textContent = note;
    box.querySelector(".save-box-note").classList.remove("bad");
    box.querySelector(".save-box-copy").hidden = editable;
    box.querySelector(".save-box-load").hidden = !editable;

    area.value = text;
    area.readOnly = !editable;
    area.placeholder = editable ? "Paste a save code here" : "";

    box.hidden = false;

    area.focus();
    area.select();

    return box;

}


export function showSave(root, code){

    const box = open(root, {
        title: "Save code",
        text: code,
        note: "Keep this somewhere safe; Import it to get this save back.",
        editable: false
    });

    const copy = box.querySelector(".save-box-copy");
    const note = box.querySelector(".save-box-note");

    copy.onclick = () => {

        const area = box.querySelector(".save-box-text");

        area.select();

        (navigator.clipboard?.writeText(code) ?? Promise.reject())
            .then(() => note.textContent = "Copied.")
            .catch(() => note.textContent = "Selected: copy it with Ctrl+C / Cmd+C.");

    };

    box.querySelector("form").onsubmit = event => event.preventDefault();

}


export function askSave(root, load){

    const box = open(root, {
        title: "Import save",
        text: "",
        note: "Type 0 to start over from nothing.",
        editable: true
    });

    const area = box.querySelector(".save-box-text");
    const note = box.querySelector(".save-box-note");

    let busy = false;

    // load may be async (lib/savecode.js decodes in the background)
    const submit = async () => {

        const code = area.value.trim();

        if(!code || busy)
            return;

        busy = true;

        try{

            await load(code);

        }
        catch{

            note.textContent = "That save code could not be read.";
            note.classList.add("bad");

            area.focus();

            return;

        }
        finally{

            busy = false;

        }

        box.hidden = true;

    };

    box.querySelector("form").onsubmit = event => {

        event.preventDefault();

        submit();

    };

    // codes are one line: Enter loads
    area.onkeydown = event => {

        if(event.key === "Enter"){

            event.preventDefault();

            submit();

        }

    };

}
