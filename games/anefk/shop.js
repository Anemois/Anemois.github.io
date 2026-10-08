import {format, setText} from "./util.js";


// Builds one list of buyable cards inside `element`.
// items: [{id, name, max?}]
// options: desc(item), level(item), cost(item, count), quantity(), onBuy(item, count)
export function createShop(element, items, {desc, level, cost, quantity, onBuy}){

    // how many levels a click buys: the chosen amount, capped by the item's max
    function countFor(item){

        const wanted = quantity();

        return item.max === undefined
            ? wanted
            : Math.min(wanted, item.max - level(item));

    }


    const rows = items.map(item => {

        const card = document.createElement("div");

        card.className = "afk-card";

        card.innerHTML =
            `
            <strong>${item.name}</strong><br>
            <small>${desc(item)}</small><br>
            Level: <span class="level"></span><br>
            Cost: <span class="cost"></span><br>
            <button></button>
            `;

        const button = card.querySelector("button");

        button.title = "Shift-click: buy as many as you can afford";

        // Infinity means "as many as affordable"; the caller resolves it
        button.onclick = event =>
            onBuy(item, event.shiftKey ? Infinity : countFor(item));

        return {
            item,
            card,
            button,
            levelText: card.querySelector(".level"),
            costText: card.querySelector(".cost")
        };

    });

    element.replaceChildren(...rows.map(row => row.card));


    // `currency` is what the player can spend right now
    function update(currency){

        for(const {item, button, levelText, costText} of rows){

            const current = level(item);
            const count = countFor(item);

            if(count < 1){

                setText(levelText, `${current} (max)`);
                setText(costText, "-");
                setText(button, "Max");

                button.disabled = true;
                button.classList.remove("short");

                continue;

            }

            const price = cost(item, count);

            setText(levelText, String(current));
            setText(costText, format(price));
            setText(button, count > 1 ? `Buy ${count}` : "Buy");

            // disabled only when not even one level is affordable, so a
            // shift-click can still buy what you can afford; "short" dims the
            // button when the selected amount is out of reach
            button.disabled = currency < cost(item, 1);
            button.classList.toggle("short", currency < price);

        }

    }


    return {update};

}