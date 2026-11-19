// skips the DOM write when nothing changed (the panel refreshes often)
export function setText(element, text){

    if(element.textContent !== text)
        element.textContent = text;

}


// seconds -> "1h 05m", "4m 10s" or "12s"
export function duration(seconds){

    const whole = Math.floor(seconds);
    const h = Math.floor(whole / 3600);
    const m = Math.floor(whole / 60) % 60;
    const s = whole % 60;

    if(h > 0)
        return `${h}h ${String(m).padStart(2, "0")}m`;

    if(m > 0)
        return `${m}m ${String(s).padStart(2, "0")}s`;

    return `${s}s`;

}
