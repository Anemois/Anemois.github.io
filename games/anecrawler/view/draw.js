import {alpha} from "../../../lib/fx.js";


// Small canvas helpers shared by the drawing code.

export const FONT = "Arial, Helvetica, sans-serif";

const TAU = Math.PI * 2;


export function circle(ctx, x, y, r, colour){

    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();

}


// the soft oval under anything standing on the floor
export function shadow(ctx, x, y, r){

    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.85, r * 0.95, r * 0.38, 0, 0, TAU);
    ctx.fill();

}


export function roundRect(ctx, x, y, w, h, r){

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);

}


export function diamond(ctx, x, y, w, h){

    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x - w, y);
    ctx.closePath();
    ctx.fill();

}


// two eyes looking along `angle`; shut eyes are little dashes
export function eyes(ctx, x, y, angle, r, shut = false){

    const ex = Math.cos(angle) * r * 0.4;
    const ey = Math.sin(angle) * r * 0.25;
    const px = -Math.sin(angle) * r * 0.32;
    const py = Math.cos(angle) * r * 0.2;
    const size = Math.max(1.3, r * 0.14);

    ctx.fillStyle = "#0b0b0b";

    for(const side of [-1, 1]){

        const cx = x + ex + px * side;
        const cy = y + ey + py * side;

        if(shut){

            ctx.fillRect(cx - size * 1.3, cy - 0.6, size * 2.6, 1.2);

            continue;

        }

        ctx.beginPath();
        ctx.arc(cx, cy, size, 0, TAU);
        ctx.fill();

    }

}


// a flickering dashed line: "something is about to come along here"
export function aimLine(ctx, time, x, y, angle, length, colour, width = 1.5){

    ctx.strokeStyle = alpha(colour, 0.3 + 0.2 * Math.sin(time * 25));
    ctx.lineWidth = width;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
    ctx.setLineDash([]);

}


// text with a soft drop shadow
export function label(ctx, text, x, y, {colour = "#ffffff", size = 8, bold = false, align = "center"} = {}){

    ctx.font = `${bold ? "bold " : ""}${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";

    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillText(text, x + size * 0.08, y + size * 0.08);

    ctx.fillStyle = colour;
    ctx.fillText(text, x, y);

}
