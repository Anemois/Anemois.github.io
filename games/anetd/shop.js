import {format, setText} from "./util.js";


// Builds one list of buyable cards inside `element`.
// items: [{id, name, max?}]
// options:
//   level(item)            current level
//   levelText(item)        optional text for the level slot (default "Lv N")
//   desc(item)             line under the name
//   note(item)             optional second line (what the next levels bring)
//   locked(item)           optional: a reason while it can't be bought yet
//   verb(item)             optional button verb (default "Buy")
//   icon(item)             optional HTML before the name
//   action                 optional second button before the buy button:
//                          {text(item), disabled(item), active(item), onClick(item)}
//   cost(item, count), quantity(), onBuy(item, count)
export function createShop(element, items, options){

    const {level, desc, cost, quantity, onBuy} = options;

    const levelText = options.levelText ?? (item => `Lv ${level(item)}`);
    const note = options.note ?? (() => "");
    const locked = options.locked ?? (() => null);
    const verb = options.verb ?? (() => "Buy");
    const icon = options.icon ?? (() => "");
    const action = options.action;


    // how many levels a click buys: the chosen amount, capped by the item's max
    function countFor(item){

        const wanted = quantity();

        return item.max === undefined
            ? wanted
            : Math.min(wanted, item.max - level(item));

    }


    const rows = items.map(item => {

        const card = document.createElement("div");

        card.className = "td-card";

        card.innerHTML =
            `
            <div class="td-card-head">${icon(item)}<strong>${item.name}</strong><span class="td-card-level"></span></div>
            <small class="td-card-desc"></small>
            <small class="td-card-note"></small>
            <div class="td-card-buttons">
                ${action ? `<button class="td-card-action"></button>` : ""}
                <button class="td-card-buy"></button>
            </div>
            `;

        const button = card.querySelector(".td-card-buy");
        const actionButton = card.querySelector(".td-card-action");

        if(actionButton)
            actionButton.onclick = () => action.onClick(item);

        button.title = "Shift-click: buy as many as you can afford";

        // Infinity means "as many as affordable"; the caller resolves it
        button.onclick = event =>
            onBuy(item, event.shiftKey ? Infinity : countFor(item));

        return {
            item,
            card,
            button,
            actionButton,
            levelEl: card.querySelector(".td-card-level"),
            descEl: card.querySelector(".td-card-desc"),
            noteEl: card.querySelector(".td-card-note")
        };

    });

    element.replaceChildren(...rows.map(row => row.card));


    // `currency` is what the player can spend right now
    function update(currency){

        for(const {item, card, button, actionButton, levelEl, descEl, noteEl} of rows){

            const reason = locked(item);

            card.classList.toggle("locked", reason !== null);

            if(reason !== null){

                setText(descEl, reason);

                continue;

            }

            const count = countFor(item);

            setText(levelEl, levelText(item));
            setText(descEl, desc(item));
            setText(noteEl, note(item));

            if(actionButton){

                setText(actionButton, action.text(item));

                actionButton.disabled = action.disabled(item);
                actionButton.classList.toggle("active", action.active(item));

            }

            if(count < 1){

                setText(button, "Max");

                button.disabled = true;
                button.classList.remove("short");

                continue;

            }

            const price = cost(item, count);

            setText(button, `${verb(item)}${count > 1 ? ` ${count}` : ""} · ${format(price)}`);

            // disabled only when not even one level is affordable, so a
            // shift-click can still buy what you can afford; "short" dims the
            // button when the selected amount is out of reach
            button.disabled = currency < cost(item, 1);
            button.classList.toggle("short", currency < price);

        }

    }


    return {update};

}


// Row of "1x 10x 100x" toggle buttons. get() returns the selected amount.
export function createAmountPicker(element, amounts, onChange){

    let value = amounts[0];

    const buttons = amounts.map(amount => {

        const button = document.createElement("button");

        button.textContent = `${amount}x`;

        button.onclick = () => {

            value = amount;

            mark();

            onChange();

        };

        return button;

    });


    function mark(){

        buttons.forEach(
            (button, index) =>
                button.classList.toggle("active", amounts[index] === value)
        );

    }


    element.replaceChildren(...buttons);

    mark();


    return {get: () => value};

}
