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
