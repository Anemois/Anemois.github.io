import {WEAPON} from "../sim/data.js";
import {weaponStats, weaponPower} from "../sim/loot.js";
import {formatNumber} from "../../../lib/fx.js";


const KINDS = {gun: "Gun", melee: "Melee", charge: "Charged", beam: "Beam"};


// one line of numbers for a weapon
export function describeWeapon(item, free = false){

    const s = weaponStats(item, free);
    const hits = (s.count ?? 1) * (s.burst ?? 1);

    const parts = [
        s.kind === "beam"
            ? `${formatNumber(s.dmg)} dmg/s`
            : `${formatNumber(s.dmg)}${hits > 1 ? ` x${hits}` : ""}${s.rain || s.storm ? ` x${s.rain || s.storm}` : ""} dmg`,
        s.kind === "beam" ? "" : `${s.rate}/s`,
        s.energy > 0 ? `${s.energy}${s.kind === "beam" ? "/s" : ""} energy` : "no energy"
    ];

    return parts.filter(Boolean).join(" · ");

}


// what makes it special, as short tags
export function weaponTags(item){

    const s = WEAPON[item.type];
    const tags = [KINDS[s.kind]];

    if(s.kind === "melee")
        tags.push(s.reflect ? "reflects bullets" : "deflects bullets");

    if(s.kind === "charge")
        tags.push("hold to charge");

    if(s.pierce && s.pierce < 99)
        tags.push(`pierce ${s.pierce}`);

    if(s.pierce >= 99)
        tags.push("passes through");

    if(s.bounce)
        tags.push(`bounces ${s.bounce}x`);

    if(s.explode)
        tags.push("explodes");

    if(s.homing)
        tags.push("homing");

    if(s.slow)
        tags.push(`slows ${Math.round(s.slow * 100)}%`);

    if(s.burn)
        tags.push("burns");

    if(s.pull)
        tags.push("pulls enemies");

    if(s.chain)
        tags.push(`chains ${s.chain}`);

    if(s.shock)
        tags.push("shockwave");

    if(s.wave)
        tags.push("sword wave");

    if(s.rain)
        tags.push("star rain");

    if(s.rail)
        tags.push("instant line");

    if(s.returns)
        tags.push("comes back");

    if(s.lob)
        tags.push("thrown over walls");

    if(s.zone)
        tags.push(s.zone.kind === "acid" ? "acid pool" : "burning ground");

    if(s.split)
        tags.push(`splits in ${s.split.count}`);

    if(s.spin)
        tags.push("spins up");

    if(s.zap)
        tags.push(`sparks jump ${s.zap}`);

    if(s.chill)
        tags.push("freezes");

    if(s.poison)
        tags.push("poison stacks");

    if(s.stagger)
        tags.push("staggers");

    if(s.leech)
        tags.push("hits restore energy");

    if(s.storm)
        tags.push("lightning bolts");

    tags.push(`crit ${Math.round(s.crit * 100)}%`);

    return tags;

}


export const powerText = item =>
    `${formatNumber(weaponPower(item))} dps`;
