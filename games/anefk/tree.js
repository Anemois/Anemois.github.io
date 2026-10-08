import {TREE, TREE_STATS} from "./tree-data.js";
import {format, setText} from "./util.js";


const NODES = new Map(TREE.map(node => [node.id, node]));

// px per grid unit, and empty space around the outermost nodes
const UNIT = {x:140, y:84};
const PADDING = {x:60, y:40};

const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_INFO = "Hover a node for details.";


/* ---------------- Modifiers ---------------- */

// Folds every owned node into one { stat: value } object.
export function computeModifiers(ownedIds){

    const mods = {};

    for(const [stat, {mode}] of Object.entries(TREE_STATS))
        mods[stat] = mode === "mul" ? 1 : 0;

    for(const id of ownedIds){

        const effects = NODES.get(id)?.effects ?? {};

        for(const [stat, value] of Object.entries(effects)){

            if(!(stat in mods))
                continue;

            mods[stat] = TREE_STATS[stat].mode === "mul"
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

// root: the .anefk element. Options: getOwned() -> Set, getGold(), onBuy(node)
export function createTree(root, {getOwned, getGold, onBuy}){

    const $ = selector => root.querySelector(selector);

    const viewport = $("#tree-viewport");
    const map = $("#tree-map");
    const info = $("#tree-info");
    const goldText = $("#tree-gold");

    const nodeEls = new Map();
    const links = [];

    const maxX = Math.max(...TREE.map(n => Math.abs(n.x)));
    const maxY = Math.max(...TREE.map(n => Math.abs(n.y)));

    const width = 2 * (maxX * UNIT.x + PADDING.x);
    const height = 2 * (maxY * UNIT.y + PADDING.y);

    const place = node => ({
        x: width / 2 + node.x * UNIT.x,
        y: height / 2 + node.y * UNIT.y
    });


    build();

    $("#tree-close").onclick = close;

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

        svg.setAttribute("class", "tree-links");
        svg.setAttribute("width", width);
        svg.setAttribute("height", height);

        for(const node of TREE){

            for(const parentId of node.requires){

                const from = place(NODES.get(parentId));
                const to = place(node);

                const line = document.createElementNS(SVG_NS, "line");

                line.setAttribute("x1", from.x);
                line.setAttribute("y1", from.y);
                line.setAttribute("x2", to.x);
                line.setAttribute("y2", to.y);

                svg.appendChild(line);

                links.push({line, from:parentId, to:node.id});

            }

        }

        map.appendChild(svg);

        for(const node of TREE){

            const {x, y} = place(node);

            const button = document.createElement("button");

            button.className = "tree-node";
            button.dataset.id = node.id;
            button.style.left = x + "px";
            button.style.top = y + "px";

            button.innerHTML =
                `<span>${node.name}</span><small></small>`;

            map.appendChild(button);

            nodeEls.set(node.id, button);

        }

    }


    function nodeAt(event){

        const id = event.target.closest(".tree-node")?.dataset.id;

        return NODES.get(id);

    }


    function canBuy(node){

        const owned = getOwned();

        return (
            !owned.has(node.id) &&
            isUnlocked(node, owned) &&
            getGold() >= node.cost
        );

    }


    // cheap: only toggles classes, call after any ownership/gold change
    function refresh(){

        const owned = getOwned();
        const gold = getGold();

        setText(goldText, `${format(gold)} gold`);

        for(const node of TREE){

            const element = nodeEls.get(node.id);

            const isOwned = owned.has(node.id);
            const isOpen = !isOwned && isUnlocked(node, owned);

            element.classList.toggle("owned", isOwned);
            element.classList.toggle("open", isOpen);
            element.classList.toggle("can-buy", isOpen && gold >= node.cost);

            setText(
                element.querySelector("small"),
                isOwned ? "Owned" : `${node.cost} gold`
            );

        }

        for(const {line, from, to} of links){

            const fromOwned = owned.has(from);

            line.classList.toggle("owned", fromOwned && owned.has(to));
            line.classList.toggle("open", fromOwned && !owned.has(to));

        }

    }


    function open(){

        root.classList.add("tree-open");

        refresh();

        setText(info, DEFAULT_INFO);

        // start centred on the root node
        viewport.scrollLeft = (map.offsetWidth - viewport.clientWidth) / 2;
        viewport.scrollTop = (map.offsetHeight - viewport.clientHeight) / 2;

    }


    function close(){

        root.classList.remove("tree-open");

    }


    return {open, close, refresh};

}
