// A run's seed determines its chambers, inhabitants and reliquary offerings.
export const REGIONS = ["The Moss Ossuary", "Widow's Belfry", "The Ash Basilica"];
export const BOSSES = ["The Hollow Sexton", "The Mourning Widow", "Saint of Cinders"];
export const WEAPONS = {
    sabre: {name: "Vigil Sabre", reach: 71, power: 2, cooldown: 0.32, window: 0.19},
    pike: {name: "Thorn Pike", reach: 116, power: 2, cooldown: 0.48, window: 0.24},
    cleaver: {name: "Ossuary Cleaver", reach: 83, power: 4, cooldown: 0.67, window: 0.29}
};
export const RELICS = {
    edge: ["Whetstone", "Every strike deals one more damage."],
    heart: ["Marrow Heart", "Gain two heart vessels and refill them."],
    spur: ["Pilgrim’s Spur", "Dash recovers 15% faster."],
    haste: ["Silver Thread", "Swing your weapon 12% faster."]
};
export const WEAPON_TEXT = {
    sabre: "A quick curved blade for close combat.",
    pike: "A long thrust that keeps the dead at a distance.",
    cleaver: "A heavy blade that deals double base damage."
};


function generator(seed){

    let a = seed >>> 0;
    return () => {

        a = (Math.imul(1664525, a) + 1013904223) >>> 0;
        return a / 4294967296;

    };

}


export function offerings(seed, room, player){

    const roll = generator(seed ^ Math.imul(room + 37, 2654435761) ^ (player.slot + 1));
    const weapons = Object.keys(WEAPONS).filter(key => key !== player.weapon);
    const relics = Object.keys(RELICS);
    const pick = list => list.splice(Math.floor(roll() * list.length), 1)[0];
    return [pick(weapons), pick(relics), pick(relics)];

}


const BODIES = {
    husk: [33, 48, 4], moth: [44, 35, 4], gravedigger: [46, 59, 7],
    sexton: [78, 105, 35], widow: [91, 88, 43], saint: [89, 124, 52]
};


function enemy(kind, id, x, floor, region, players, random){

    const [w,h,base] = BODIES[kind];
    const boss = ["sexton", "widow", "saint"].includes(kind);
    const maxHp = Math.round((base + (boss ? 0 : region * 1.5)) * (players === 2 ? 1.45 : 1));
    return {
        id, kind, boss, x, y: floor.y - h - (kind === "moth" ? 36 : 0),
        w, h, hp: maxHp, maxHp, face: -1, mode: "idle", timer: 0.4 + random(),
        move: "", pattern: Math.floor(random() * 3), left: floor.x, right: floor.x + floor.w,
        floor: floor.y, phase: random() * 6.28, hit: 0, hitSlots: []
    };

}


export function chamber(seed, room, players){

    const random = generator(seed ^ Math.imul(room + 1, 2246822519));
    const region = Math.floor(room / 3);
    const bossRoom = room % 3 === 2;
    const shape = generator(seed ^ Math.imul(room + 53, 3266489917));
    const platforms = [];
    const enemies = [];
    const ground = (x,y,w) => {

        const floor = {x,y,w,h: 580 - y,kind:"ground"};
        platforms.push(floor);
        return floor;

    };
    const ledge = (x,y,w) => platforms.push({x,y,w,h:19,kind:"ledge"});
    let width;

    if(bossRoom){

        width = 1100;
        const floor = ground(0, 455, width);
        ledge(225 + random() * 45, 363, 130);
        ledge(705 + random() * 45, 353, 135);
        enemies.push(enemy(["sexton","widow","saint"][region], 1, 740, floor, region, players, random));

    }
    else{

        let x = 0;
        const spans = 3 + region;
        for(let i = 0; i < spans; i++){

            const w = 335 + Math.floor(random() * 130);
            const y = i === 0 ? 455 : 427 + Math.floor(random() * 44);
            const floor = ground(x, y, w);
            const perch = {x:x + 102 + random() * 48, y:y - 73 - Math.floor(random() * 29), w:108 + random() * 52, h:19, kind:"ledge"};
            // Balconies, broken stairways and high galleries can share the same floor span.
            const layout = Math.floor(shape() * 3);
            if(layout === 1){

                perch.x = x + 34 + shape() * 20;
                ledge(x + w - 155, y - 137 - shape() * 16, 126);

            }
            else if(layout === 2){

                perch.x = x + w - perch.w - 26;
                ledge(x + 28, y - 48, 93);

            }
            platforms.push(perch);
            const kinds = i === 0 && region === 0 ? ["husk"] : ["husk","moth","gravedigger"];
            const kind = kinds[Math.floor(random() * kinds.length)];
            enemies.push(enemy(kind, enemies.length + 1, x + w - 105, floor, region, players, random));
            if((i + room) % 3 === 1)
                enemies.push(enemy("husk", enemies.length + 1, perch.x + 35, perch, region, players, random));

            x += w;
            if(i + 1 < spans)
                x += 48 + Math.floor(random() * 57);

        }
        width = x;

    }

    const last = platforms.filter(p => p.kind === "ground").at(-1);
    return {region, platforms, enemies, width, gate: {x: width - 55, y: last.y}};

}


export function newPlayer(slot){

    return {
        slot, x: 66 + slot * 42, y: 390, w: 28, h: 44, vx: 0, vy: 0,
        face: 1, grounded: false, hp: 8, maxHp: 8, weapon: "sabre",
        power: 0, haste: 1, recovery: 1, attack: 0, dash: 0, hurt: 0,
        swingCd: 0, dashCd: 0, coyote: 0, buffer: 0, struck: [], safeX: 66, safeY: 405
    };

}
