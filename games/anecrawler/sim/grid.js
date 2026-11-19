// A coarse grid over the world that remembers which enemies are in which
// cell, rebuilt every step. Asking "what is near this point?" then only
// looks at a few cells instead of every enemy on the floor.

const CELL = 96;                // world units; a bit bigger than the biggest enemy


export function createGrid(width, height){

    const cols = Math.ceil(width / CELL) + 1;
    const rows = Math.ceil(height / CELL) + 1;

    return {
        cols,
        rows,
        cells: Array.from({length: cols * rows}, () => []),
        used: [],               // cells holding something, to clear quickly
        found: []               // reused result list
    };

}


export function fillGrid(grid, things){

    for(const cell of grid.used)
        cell.length = 0;

    grid.used.length = 0;

    for(const thing of things){

        const cx = Math.max(0, Math.min(grid.cols - 1, Math.floor(thing.x / CELL)));
        const cy = Math.max(0, Math.min(grid.rows - 1, Math.floor(thing.y / CELL)));
        const cell = grid.cells[cy * grid.cols + cx];

        if(!cell.length)
            grid.used.push(cell);

        cell.push(thing);

    }

}


// Everything whose cell touches the circle (x, y, r). The caller still
// checks real distances. The list is reused: pass your own `found` array
// if anything you do while looping might ask the grid again (damage can
// set off explosions, which do).
export function near(grid, x, y, r, found = grid.found){

    found.length = 0;

    const reach = r + CELL / 2;
    const x0 = Math.max(0, Math.floor((x - reach) / CELL));
    const x1 = Math.min(grid.cols - 1, Math.floor((x + reach) / CELL));
    const y0 = Math.max(0, Math.floor((y - reach) / CELL));
    const y1 = Math.min(grid.rows - 1, Math.floor((y + reach) / CELL));

    for(let cy = y0; cy <= y1; cy++){

        for(let cx = x0; cx <= x1; cx++){

            const cell = grid.cells[cy * grid.cols + cx];

            for(let i = 0; i < cell.length; i++)
                found.push(cell[i]);

        }

    }

    return found;

}
