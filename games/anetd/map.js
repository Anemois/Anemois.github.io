// World units: the field is always WIDTH x HEIGHT, the canvas scales it to fit.
export const WIDTH = 960;
export const HEIGHT = 540;

export const LANE = 34;                 // path width

// The path enters on the left and snakes right. The U-bends are the strong
// spots: a tower inside one covers three stretches of path.
const POINTS = [
    [-24, 96], [216, 96], [216, 444], [456, 444],
    [456, 96], [696, 96], [696, 444], [984, 444]
];

// the overlay in the top-left corner (wave, lives) stays clear of towers
const HUD = {width: 124, height: 66};

export const RALLY_DEFAULT = 0.9;       // share of the path where guards stand
export const RALLY_RANGE = [0.08, 0.97];


export const PATH = createPath(POINTS);


// Why a tower can't stand at (x, y), or null if it can. `towers` are the
// placed ones ({x, y}); `radius` is the footprint of one tower.
export function placementError(x, y, towers, radius){

    if(x < radius || y < radius || x > WIDTH - radius || y > HEIGHT - radius)
        return "outside the field";

    if(x < HUD.width + radius && y < HUD.height + radius)
        return "under the wave counter";

    if(PATH.project(x, y).distance < LANE / 2 + radius - 2)
        return "on the path";

    if(towers.some(tower => Math.hypot(tower.x - x, tower.y - y) < radius * 2))
        return "too close to another tower";

    return null;

}


function createPath(points){

    const segments = [];

    let length = 0;

    for(let i = 1; i < points.length; i++){

        const [x1, y1] = points[i - 1];
        const [x2, y2] = points[i];

        const len = Math.hypot(x2 - x1, y2 - y1);

        segments.push({x1, y1, dx: (x2 - x1) / len, dy: (y2 - y1) / len, start: length, len});

        length += len;

    }


    // writes the point `s` units along the path into `out` (no allocation:
    // this runs for every balloon, every step)
    function at(s, out){

        let segment = segments[segments.length - 1];

        for(const candidate of segments){

            if(s < candidate.start + candidate.len){
                segment = candidate;
                break;
            }

        }

        const d = Math.min(Math.max(s - segment.start, 0), segment.len);

        out.x = segment.x1 + segment.dx * d;
        out.y = segment.y1 + segment.dy * d;
        out.dx = segment.dx;
        out.dy = segment.dy;

        return out;

    }


    // closest spot on the path to (x, y): {s, distance}
    function project(x, y){

        let best = {s: 0, distance: Infinity};

        for(const {x1, y1, dx, dy, start, len} of segments){

            const t = Math.min(Math.max((x - x1) * dx + (y - y1) * dy, 0), len);
            const distance = Math.hypot(x1 + dx * t - x, y1 + dy * t - y);

            if(distance < best.distance)
                best = {s: start + t, distance};

        }

        return best;

    }


    return {points, length, at, project};

}
