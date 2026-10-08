const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi"];


export function format(value){

    if(value < 1000){

        return (value < 100 && !Number.isInteger(value))
            ? (Math.floor(value * 10) / 10).toString()
            : Math.floor(value).toString();

    }

    const tier =
        Math.min(
            Math.floor(Math.log10(value) / 3),
            SUFFIXES.length - 1
        );

    return (
        (value / Math.pow(10, tier * 3)).toFixed(2)
        + SUFFIXES[tier]
    );

}


// skips the DOM write when nothing changed (UI refreshes 10x per second)
export function setText(element, text){

    if(element.textContent !== text)
        element.textContent = text;

}
