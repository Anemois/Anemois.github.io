// Names for every power of 1000. Past the last one, numbers switch to
// scientific notation (1.23e36), so shorten this list to switch sooner.
const UNITS = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];


export function format(value){

    if(value < 1000){

        return (value < 100 && !Number.isInteger(value))
            ? (Math.floor(value * 10) / 10).toString()
            : Math.floor(value).toString();

    }

    let tier = Math.floor(Math.log10(value) / 3);
    let scaled = value / 1000 ** tier;

    // 999.999K would round to "1000.00K": carry it over to the next unit
    if(scaled >= 999.995){

        tier++;
        scaled = 1;

    }

    return tier < UNITS.length
        ? scaled.toFixed(2) + UNITS[tier]
        : value.toExponential(2).replace("+", "");

}


// seconds -> "m:ss"
export function clock(seconds){

    const whole = Math.ceil(seconds);

    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;

}


// skips the DOM write when nothing changed (UI refreshes several times a second)
export function setText(element, text){

    if(element.textContent !== text)
        element.textContent = text;

}
