import {SKY, SKY_STATS} from "./sky-data.js";
import {format, setText} from "./util.js";


const NODES = new Map(SKY.map(node => [node.id, node]));

// px per grid unit, and empty space around the outermost stars
const UNIT = {x: 108, y: 56};
const PADDING = {x: 56, y: 40};

const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_INFO = "Hover a star for details. Every star you have ever earned also adds 5% damage.";


/* ---------------- Modifiers ---------------- */

// Folds every owned star into one { stat: value } object.
export function computeModifiers(ownedIds){

    const mods = {};

    for(const [stat, {mode}] of Object.entries(SKY_STATS))
        mods[stat] = mode === "mul" ? 1 : 0;

    for(const id of ownedIds){

        const effects = NODES.get(id)?.effects ?? {};

        for(const [stat, value] of Object.entries(effects)){

            if(!(stat in mods))
                continue;

            mods[stat] = SKY_STATS[stat].mode === "mul"
                ? mods[stat] * value
                : mods[stat] + value;

        }

    }

    return mods;

}


const isUnlocked = (node, owned) =>
    node.requires.length === 0 ||
    node.requires.some(id => owned.has(id));


/* ---------------- View ---------------- */

// root: the .anetd element.
// Options: getOwned() -> Set, getStars(), onBuy(node), onToggle() after open/close
export function createSky(root, {getOwned, getStars, onBuy, onToggle}){

    const $ = selector => root.querySelector(selector);

    const viewport = $(".td-sky-viewport");
    const map = $(".td-sky-map");
    const info = $(".td-sky-info");
    const starsText = $(".td-sky-stars");

    const nodeEls = new Map();
    const links = [];

    const maxX = Math.max(...SKY.map(n => Math.abs(n.x)));
    const maxY = Math.max(...SKY.map(n => Math.abs(n.y)));

    const width = 2 * (maxX * UNIT.x + PADDING.x);
    const height = 2 * (maxY * UNIT.y + PADDING.y);

    const place = node => ({
        x: width / 2 + node.x * UNIT.x,
        y: height / 2 + node.y * UNIT.y
    });


    build();

    $(".td-sky-close").onclick = close;

    map.addEventListener("click", event => {

        const node = nodeAt(event);

        if(node && canBuy(node))
            onBuy(node);

    });

    map.addEventListener("mouseover", event => {

        const node = nodeAt(event);

        if(node)
            setText(info, `${node.name}: ${node.desc}`);

    });


    function build(){

        map.style.width = width + "px";
        map.style.height = height + "px";

        const svg = document.createElementNS(SVG_NS, "svg");

        svg.setAttribute("class", "td-sky-links");
        svg.setAttribute("width", width);
        svg.setAttribute("height", height);

        // faint background stars, the same every time
        let seed = 7;

        const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

        for(let i = 0; i < 90; i++){

            const dot = document.createElementNS(SVG_NS, "circle");

            dot.setAttribute("cx", random() * width);
            dot.setAttribute("cy", random() * height);
            dot.setAttribute("r", random() < 0.15 ? 1.4 : 0.8);
            dot.setAttribute("class", "td-sky-dust");

            svg.appendChild(dot);

        }

        for(const node of SKY){

            for(const parentId of node.requires){

                const from = place(NODES.get(parentId));
                const to = place(node);

                const line = document.createElementNS(SVG_NS, "line");

                line.setAttribute("x1", from.x);
                line.setAttribute("y1", from.y);
                line.setAttribute("x2", to.x);
                line.setAttribute("y2", to.y);

                svg.appendChild(line);

                links.push({line, from: parentId, to: node.id});

            }

        }

        map.appendChild(svg);

        for(const node of SKY){

            const {x, y} = place(node);

            const button = document.createElement("button");

            button.className = "td-star";
            button.dataset.id = node.id;
            button.style.left = x + "px";
            button.style.top = y + "px";

            button.innerHTML = `<i></i><span>${node.name}</span><small></small>`;

            map.appendChild(button);

            nodeEls.set(node.id, button);

        }

    }


    function nodeAt(event){

        const id = event.target.closest(".td-star")?.dataset.id;

        return NODES.get(id);

    }


    function canBuy(node){

        const owned = getOwned();

        return (
            !owned.has(node.id) &&
            isUnlocked(node, owned) &&
            getStars() >= node.cost
        );

    }


    // cheap: only toggles classes, call after any ownership/star change
    function refresh(){

        const owned = getOwned();
        const stars = getStars();

        setText(starsText, `${format(stars)} stars`);

        for(const node of SKY){

            const element = nodeEls.get(node.id);

            const isOwned = owned.has(node.id);
            const isOpen = !isOwned && isUnlocked(node, owned);

            element.classList.toggle("owned", isOwned);
            element.classList.toggle("open", isOpen);
            element.classList.toggle("can-buy", isOpen && stars >= node.cost);

            setText(
                element.querySelector("small"),
                isOwned ? "lit" : `${node.cost} ${node.cost === 1 ? "star" : "stars"}`
            );

        }

        for(const {line, from, to} of links){

            const fromOwned = owned.has(from);
            const toOwned = owned.has(to);

            line.classList.toggle("owned", fromOwned && toOwned);
            line.classList.toggle("open", fromOwned !== toOwned);

        }

    }


    function open(){

        root.classList.add("sky-open");

        refresh();

        setText(info, DEFAULT_INFO);

        // start centred on Polaris
        viewport.scrollLeft = (map.offsetWidth - viewport.clientWidth) / 2;
        viewport.scrollTop = (map.offsetHeight - viewport.clientHeight) / 2;

        onToggle();

    }


    function close(){

        root.classList.remove("sky-open");

        onToggle();

    }


    return {open, close, refresh, isOpen: () => root.classList.contains("sky-open")};

}
