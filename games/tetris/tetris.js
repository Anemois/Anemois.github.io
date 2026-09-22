const COLS = 10;
const ROWS = 20;

let BLOCK_SIZE = 22;

const HIGH_SCORE_KEY =
    "tetris-highscore";

const LOCK_DELAY = 500;
const MAX_LOCK_RESETS = 15;


export function init(container) {
    if (container.dataset.initialized) {
        return;
    }

    container.dataset.initialized =
        "true";


    const boardCanvas =
        container.querySelector(
            "#tetris-board"
        );

    const boardContext =
        boardCanvas.getContext("2d");


    const nextCanvas =
        container.querySelector(
            "#tetris-next"
        );

    const nextContext =
        nextCanvas.getContext("2d");


    const holdCanvas =
        container.querySelector(
            "#tetris-hold"
        );

    const holdContext =
        holdCanvas.getContext("2d");


    const scoreElement =
        container.querySelector(
            "#tetris-score"
        );

    const linesElement =
        container.querySelector(
            "#tetris-lines"
        );

    const levelElement =
        container.querySelector(
            "#tetris-level"
        );

    const highscoreElement =
        container.querySelector(
            "#tetris-highscore"
        );

    const restartButton =
        container.querySelector(
            "#tetris-restart"
        );

    const tetrisContent =
        container.querySelector(
            ".tetris-content"
        );


    const gridCanvas =
        document.createElement("canvas");

    const gridContext =
        gridCanvas.getContext("2d");


    const colors = [
        null,
        "#b7e3ff",
        "#ffd35a",
        "#ff9a5a",
        "#61a8ff",
        "#c58cff",
        "#63d69f",
        "#ff7185"
    ];


    const pieceTypes = [
        "I",
        "O",
        "L",
        "J",
        "T",
        "S",
        "Z"
    ];


    let arena =
        createArena();

    let bag = [];


    let player = {
        pos: {
            x: 0,
            y: 0
        },

        matrix: null,

        type: null
    };


    let nextType = null;
    let holdType = null;


    let score = 0;
    let lines = 0;
    let level = 1;


    let dropCounter = 0;
    let dropInterval =
        getDropInterval(level);


    let lockCounter = 0;
    let lockResets = 0;

    let grounded = false;


    let combo = -1;
    let backToBack = false;

    let lastActionWasRotate =
        false;


    let lastTime = 0;


    let running = false;
    let hovered = false;
    let gameOver = false;

    let holdUsed = false;


    let animationFrame = null;


    function resizeBoard() {
        const gap = 12;


        const contentWidth =
            tetrisContent.clientWidth;


        const sidebarWidth =
            Math.max(
                52,
                Math.min(
                    68,
                    Math.floor(
                        contentWidth * 0.16
                    )
                )
            );


        container.style.setProperty(
            "--sidebar-width",
            `${sidebarWidth}px`
        );


        const availableWidth =
            contentWidth
            - sidebarWidth
            - gap;


        const widthLimit =
            availableWidth / COLS;


        const heightLimit =
            (window.innerHeight * 0.65)
            / ROWS;


        BLOCK_SIZE =
            Math.max(
                10,
                Math.floor(
                    Math.min(
                        22,
                        widthLimit,
                        heightLimit
                    )
                )
            );


        container.style.setProperty(
            "--block-size",
            `${BLOCK_SIZE}px`
        );


        const boardWidth =
            COLS * BLOCK_SIZE;

        const boardHeight =
            ROWS * BLOCK_SIZE;


        container.style.setProperty(
            "--board-width",
            `${boardWidth}px`
        );

        container.style.setProperty(
            "--board-height",
            `${boardHeight}px`
        );


        boardCanvas.width =
            boardWidth;

        boardCanvas.height =
            boardHeight;


        gridCanvas.width =
            boardWidth;

        gridCanvas.height =
            boardHeight;


        buildGrid();

        render();
    }


    function buildGrid() {
        gridContext.clearRect(
            0,
            0,
            gridCanvas.width,
            gridCanvas.height
        );


        gridContext.strokeStyle =
            "rgba(255,255,255,0.06)";

        gridContext.lineWidth = 1;


        for (
            let x = 0;
            x <= COLS;
            x++
        ) {
            gridContext.beginPath();

            gridContext.moveTo(
                x * BLOCK_SIZE + 0.5,
                0
            );

            gridContext.lineTo(
                x * BLOCK_SIZE + 0.5,
                ROWS * BLOCK_SIZE
            );

            gridContext.stroke();
        }


        for (
            let y = 0;
            y <= ROWS;
            y++
        ) {
            gridContext.beginPath();

            gridContext.moveTo(
                0,
                y * BLOCK_SIZE + 0.5
            );

            gridContext.lineTo(
                COLS * BLOCK_SIZE,
                y * BLOCK_SIZE + 0.5
            );

            gridContext.stroke();
        }
    }


    function createArena() {
        return Array.from(
            {
                length: ROWS
            },
            () =>
                Array(COLS).fill(0)
        );
    }


    function createPiece(type) {
        switch (type) {
            case "T":
                return [
                    [0, 0, 0],
                    [1, 1, 1],
                    [0, 1, 0]
                ];

            case "O":
                return [
                    [2, 2],
                    [2, 2]
                ];

            case "L":
                return [
                    [0, 3, 0],
                    [0, 3, 0],
                    [0, 3, 3]
                ];

            case "J":
                return [
                    [0, 4, 0],
                    [0, 4, 0],
                    [4, 4, 0]
                ];

            case "I":
                return [
                    [0, 5, 0, 0],
                    [0, 5, 0, 0],
                    [0, 5, 0, 0],
                    [0, 5, 0, 0]
                ];

            case "S":
                return [
                    [0, 6, 6],
                    [6, 6, 0],
                    [0, 0, 0]
                ];

            case "Z":
                return [
                    [7, 7, 0],
                    [0, 7, 7],
                    [0, 0, 0]
                ];

            default:
                return null;
        }
    }


    function refillBag() {
        bag =
            [...pieceTypes];


        for (
            let i = bag.length - 1;
            i > 0;
            i--
        ) {
            const j =
                Math.floor(
                    Math.random()
                    * (i + 1)
                );


            [
                bag[i],
                bag[j]
            ] =
            [
                bag[j],
                bag[i]
            ];
        }
    }


    function getNextType() {
        if (bag.length === 0) {
            refillBag();
        }

        return bag.pop();
    }


    function spawnPiece(type) {
        player.type = type;

        player.matrix =
            createPiece(type);


        player.pos.y = 0;


        player.pos.x =
            Math.floor(
                COLS / 2
                - player.matrix[0].length / 2
            );


        grounded = false;

        lockCounter = 0;

        lockResets = 0;

        lastActionWasRotate =
            false;


        if (collide()) {
            endGame();
        }
    }


    function resetPlayer() {
        const type =
            nextType;


        nextType =
            getNextType();


        spawnPiece(type);

        holdUsed = false;
    }


    function collide() {
        const matrix =
            player.matrix;

        const pos =
            player.pos;


        for (
            let y = 0;
            y < matrix.length;
            y++
        ) {
            for (
                let x = 0;
                x < matrix[y].length;
                x++
            ) {
                if (
                    matrix[y][x] !== 0
                    &&
                    (
                        arena[y + pos.y]
                        === undefined
                        ||
                        arena[y + pos.y][x + pos.x]
                        !== 0
                    )
                ) {
                    return true;
                }
            }
        }


        return false;
    }


    function isTouchingGround() {
        player.pos.y++;


        const result =
            collide();


        player.pos.y--;


        return result;
    }


    function updateGroundedState() {
        grounded =
            isTouchingGround();


        if (!grounded) {
            lockCounter = 0;
        }
    }


    function registerPlayerAction() {
        if (
            grounded
            &&
            lockResets <
                MAX_LOCK_RESETS
        ) {
            lockCounter = 0;

            lockResets++;
        }


        updateGroundedState();
    }


    function merge() {
        player.matrix.forEach(
            (row, y) => {
                row.forEach(
                    (value, x) => {
                        if (value !== 0) {
                            arena[
                                y + player.pos.y
                            ][
                                x + player.pos.x
                            ] = value;
                        }
                    }
                );
            }
        );
    }


    function playerMove(direction) {
        if (
            !running
            ||
            !hovered
            ||
            gameOver
        ) {
            return;
        }


        player.pos.x +=
            direction;


        if (collide()) {
            player.pos.x -=
                direction;

            return;
        }


        lastActionWasRotate =
            false;


        registerPlayerAction();

        render();
    }


    function playerDrop(manual = false) {
        if (
            !running
            ||
            !hovered
            ||
            gameOver
        ) {
            return;
        }


        player.pos.y++;


        if (collide()) {
            player.pos.y--;

            grounded = true;

            render();

            return;
        }


        if (manual) {
            score += 1;

            updateStats();
        }


        grounded = false;

        lockCounter = 0;

        dropCounter = 0;

        lastActionWasRotate =
            false;


        render();
    }


    function hardDrop() {
        if (
            !running
            ||
            !hovered
            ||
            gameOver
        ) {
            return;
        }


        let distance = 0;


        while (!collide()) {
            player.pos.y++;

            distance++;
        }


        player.pos.y--;

        distance--;


        if (distance > 0) {
            score +=
                distance * 2;
        }


        updateStats();


        lastActionWasRotate =
            false;


        lockPiece();
    }


    function holdPiece() {
        if (
            !running
            ||
            !hovered
            ||
            gameOver
            ||
            holdUsed
        ) {
            return;
        }


        const currentType =
            player.type;


        if (holdType === null) {
            holdType =
                currentType;

            resetPlayer();
        } else {
            const swapType =
                holdType;

            holdType =
                currentType;

            spawnPiece(
                swapType
            );
        }


        holdUsed = true;


        grounded = false;

        lockCounter = 0;

        lockResets = 0;

        dropCounter = 0;

        lastActionWasRotate =
            false;


        drawHoldPiece();

        drawNextPiece();

        render();
    }


    function playerRotate(direction) {
        if (
            !running
            ||
            !hovered
            ||
            gameOver
        ) {
            return;
        }


        const originalMatrix =
            player.matrix.map(
                row => [...row]
            );


        const originalX =
            player.pos.x;

        const originalY =
            player.pos.y;


        const rotatedMatrix =
            player.matrix.map(
                row => [...row]
            );


        rotateMatrix(
            rotatedMatrix,
            direction
        );


        player.matrix =
            rotatedMatrix;


        const kicks = [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 2, y: 0 },
            { x: -2, y: 0 },
            { x: 0, y: -1 },
            { x: 1, y: -1 },
            { x: -1, y: -1 },
            { x: 0, y: -2 }
        ];


        for (
            const kick of kicks
        ) {
            player.pos.x =
                originalX + kick.x;

            player.pos.y =
                originalY + kick.y;


            if (!collide()) {
                lastActionWasRotate =
                    true;

                registerPlayerAction();

                render();

                return;
            }
        }


        player.matrix =
            originalMatrix;

        player.pos.x =
            originalX;

        player.pos.y =
            originalY;

        lastActionWasRotate =
            false;
    }


    function rotateMatrix(
        matrix,
        direction
    ) {
        for (
            let y = 0;
            y < matrix.length;
            y++
        ) {
            for (
                let x = 0;
                x < y;
                x++
            ) {
                [
                    matrix[x][y],
                    matrix[y][x]
                ] =
                [
                    matrix[y][x],
                    matrix[x][y]
                ];
            }
        }


        if (direction > 0) {
            matrix.forEach(
                row => row.reverse()
            );
        } else {
            matrix.reverse();
        }
    }


    function isTSpin() {
        if (
            player.type !== "T"
            ||
            !lastActionWasRotate
        ) {
            return false;
        }


        const centerX =
            player.pos.x + 1;

        const centerY =
            player.pos.y + 1;


        const corners = [
            [
                centerX - 1,
                centerY - 1
            ],
            [
                centerX + 1,
                centerY - 1
            ],
            [
                centerX - 1,
                centerY + 1
            ],
            [
                centerX + 1,
                centerY + 1
            ]
        ];


        let occupied = 0;


        corners.forEach(
            ([x, y]) => {
                if (
                    x < 0
                    ||
                    x >= COLS
                    ||
                    y < 0
                    ||
                    y >= ROWS
                ) {
                    occupied++;

                    return;
                }


                if (
                    arena[y][x] !== 0
                ) {
                    occupied++;
                }
            }
        );


        return occupied >= 3;
    }


    function lockPiece() {
        const tSpin =
            isTSpin();


        merge();


        clearLines(tSpin);


        resetPlayer();


        grounded = false;

        lockCounter = 0;

        lockResets = 0;

        dropCounter = 0;

        lastActionWasRotate =
            false;


        drawNextPiece();

        drawHoldPiece();

        render();
    }


    function clearLines(tSpin = false) {
        let cleared = 0;


        outer:
        for (
            let y = arena.length - 1;
            y >= 0;
            y--
        ) {
            for (
                let x = 0;
                x < arena[y].length;
                x++
            ) {
                if (
                    arena[y][x] === 0
                ) {
                    continue outer;
                }
            }


            const row =
                arena.splice(y, 1)[0];


            row.fill(0);


            arena.unshift(row);


            y++;

            cleared++;
        }


        const difficultClear =
            tSpin
            ||
            cleared === 4;


        let baseScore = 0;


        if (tSpin) {
            const tSpinScores = [
                400,
                800,
                1200,
                1600
            ];


            baseScore =
                tSpinScores[cleared]
                ?? 400;
        } else {
            const lineScores = [
                0,
                100,
                300,
                500,
                800
            ];


            baseScore =
                lineScores[cleared]
                ?? 0;
        }


        if (
            difficultClear
            &&
            backToBack
        ) {
            baseScore =
                Math.floor(
                    baseScore * 1.5
                );
        }


        score +=
            baseScore * level;


        if (cleared > 0) {
            lines +=
                cleared;


            combo++;


            if (combo > 0) {
                score +=
                    50
                    * combo
                    * level;
            }


            level =
                Math.floor(
                    lines / 10
                ) + 1;


            dropInterval =
                getDropInterval(level);
        } else {
            combo = -1;
        }


        if (difficultClear) {
            backToBack = true;
        } else if (cleared > 0) {
            backToBack = false;
        }


        updateStats();

        saveHighscoreIfNeeded();
    }


    function getDropInterval(
        currentLevel
    ) {
        return Math.max(
            55,
            1000
            * Math.pow(
                0.82,
                currentLevel - 1
            )
        );
    }


    function getGhostY() {
        const originalY =
            player.pos.y;


        while (!collide()) {
            player.pos.y++;
        }


        player.pos.y--;


        const ghostY =
            player.pos.y;


        player.pos.y =
            originalY;


        return ghostY;
    }


    function drawMatrix(
        context,
        matrix,
        offset,
        cellSize
    ) {
        matrix.forEach(
            (row, y) => {
                row.forEach(
                    (value, x) => {
                        if (value === 0) {
                            return;
                        }


                        drawBlock(
                            context,

                            x * cellSize
                            + offset.x,

                            y * cellSize
                            + offset.y,

                            cellSize,

                            colors[value]
                        );
                    }
                );
            }
        );
    }


    function drawBlock(
        context,
        x,
        y,
        size,
        color
    ) {
        context.fillStyle =
            color;


        context.fillRect(
            x + 1,
            y + 1,
            size - 2,
            size - 2
        );


        context.strokeStyle =
            "rgba(255,255,255,0.28)";


        context.lineWidth = 1;


        context.strokeRect(
            x + 1.5,
            y + 1.5,
            size - 3,
            size - 3
        );
    }


    function drawGhost() {
        const ghostY =
            getGhostY();


        player.matrix.forEach(
            (row, y) => {
                row.forEach(
                    (value, x) => {
                        if (value === 0) {
                            return;
                        }


                        boardContext.fillStyle =
                            "rgba(255,255,255,0.10)";


                        boardContext.fillRect(
                            (
                                x
                                + player.pos.x
                            )
                            * BLOCK_SIZE
                            + 3,

                            (
                                y
                                + ghostY
                            )
                            * BLOCK_SIZE
                            + 3,

                            BLOCK_SIZE - 6,

                            BLOCK_SIZE - 6
                        );
                    }
                );
            }
        );
    }


    function drawBoard() {
        boardContext.fillStyle =
            "#0b0b0b";


        boardContext.fillRect(
            0,
            0,
            boardCanvas.width,
            boardCanvas.height
        );


        boardContext.drawImage(
            gridCanvas,
            0,
            0
        );


        drawMatrix(
            boardContext,
            arena,
            {
                x: 0,
                y: 0
            },
            BLOCK_SIZE
        );


        if (
            running
            &&
            !gameOver
        ) {
            drawGhost();
        }


        if (player.matrix) {
            drawMatrix(
                boardContext,
                player.matrix,
                {
                    x:
                        player.pos.x
                        * BLOCK_SIZE,

                    y:
                        player.pos.y
                        * BLOCK_SIZE
                },
                BLOCK_SIZE
            );
        }


        if (gameOver) {
            drawOverlay(
                "GAME OVER"
            );
        }
    }


    function drawOverlay(text) {
        boardContext.fillStyle =
            "rgba(0,0,0,0.65)";


        boardContext.fillRect(
            0,
            0,
            boardCanvas.width,
            boardCanvas.height
        );


        const widthLimit =
            boardCanvas.width * 0.85;


        const sizeLimit =
            BLOCK_SIZE * 1.5;


        const textWidthRatio =
            text.length * 0.65;


        const widthBasedSize =
            widthLimit
            / textWidthRatio;


        const fontSize =
            Math.max(
                10,
                Math.min(
                    sizeLimit,
                    widthBasedSize
                )
            );


        boardContext.fillStyle =
            "white";


        boardContext.font =
            `bold ${Math.floor(fontSize)}px Arial`;


        boardContext.textAlign =
            "center";


        boardContext.textBaseline =
            "middle";


        boardContext.fillText(
            text,

            boardCanvas.width / 2,

            boardCanvas.height / 2
        );
    }


    function drawPreview(
        context,
        canvas,
        type
    ) {
        context.fillStyle =
            "#0b0b0b";


        context.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
        );


        if (!type) {
            return;
        }


        const matrix =
            createPiece(type);


        const cellSize = 14;


        const width =
            matrix[0].length
            * cellSize;


        const height =
            matrix.length
            * cellSize;


        const offsetX =
            (
                canvas.width
                - width
            ) / 2;


        const offsetY =
            (
                canvas.height
                - height
            ) / 2;


        drawMatrix(
            context,
            matrix,
            {
                x: offsetX,
                y: offsetY
            },
            cellSize
        );
    }


    function drawNextPiece() {
        drawPreview(
            nextContext,
            nextCanvas,
            nextType
        );
    }


    function drawHoldPiece() {
        drawPreview(
            holdContext,
            holdCanvas,
            holdType
        );
    }


    function render() {
        drawBoard();
    }


    function updateStats() {
        scoreElement.textContent =
            score.toLocaleString();


        linesElement.textContent =
            lines.toString();


        levelElement.textContent =
            level.toString();
    }


    function getHighscore() {
        const saved =
            localStorage.getItem(
                HIGH_SCORE_KEY
            );


        if (saved === null) {
            return 0;
        }


        return Number(saved);
    }


    function saveHighscoreIfNeeded() {
        const highscore =
            getHighscore();


        if (score <= highscore) {
            return;
        }


        localStorage.setItem(
            HIGH_SCORE_KEY,
            score.toString()
        );


        updateHighscore();
    }


    function updateHighscore() {
        const highscore =
            getHighscore();


        highscoreElement.textContent =
            highscore.toLocaleString();
    }


    function startLoop() {
        if (
            animationFrame !== null
            ||
            !running
            ||
            !hovered
        ) {
            return;
        }


        lastTime =
            performance.now();


        animationFrame =
            requestAnimationFrame(
                update
            );
    }


    function stopLoop() {
        if (
            animationFrame === null
        ) {
            return;
        }


        cancelAnimationFrame(
            animationFrame
        );


        animationFrame = null;
    }


    function endGame() {
        gameOver = true;

        running = false;

        grounded = false;


        stopLoop();


        saveHighscoreIfNeeded();


        render();

        drawNextPiece();

        drawHoldPiece();
    }


    function startGame() {
        stopLoop();


        arena =
            createArena();


        bag = [];


        nextType =
            getNextType();


        holdType = null;


        score = 0;

        lines = 0;

        level = 1;


        dropCounter = 0;

        dropInterval =
            getDropInterval(level);


        lockCounter = 0;

        lockResets = 0;


        combo = -1;

        backToBack = false;


        lastActionWasRotate =
            false;


        holdUsed = false;


        lastTime =
            performance.now();


        gameOver = false;

        running = true;


        resetPlayer();


        updateStats();

        updateHighscore();


        drawNextPiece();

        drawHoldPiece();

        render();


        startLoop();
    }


    function update(time = 0) {
        animationFrame = null;


        if (
            !running
            ||
            !hovered
        ) {
            return;
        }


        const deltaTime =
            time - lastTime;


        lastTime = time;


        if (
            !gameOver
        ) {
            if (!grounded) {
                dropCounter +=
                    deltaTime;


                if (
                    dropCounter
                    >= dropInterval
                ) {
                    playerDrop();

                    dropCounter = 0;
                }


                updateGroundedState();
            } else {
                lockCounter +=
                    deltaTime;


                if (
                    lockCounter
                    >= LOCK_DELAY
                ) {
                    lockPiece();
                }
            }
        }


        if (
            running
            &&
            hovered
        ) {
            animationFrame =
                requestAnimationFrame(
                    update
                );
        }
    }


    container.addEventListener(
        "mouseenter",
        () => {
            hovered = true;

            lastTime =
                performance.now();

            boardCanvas.focus();

            render();

            startLoop();
        }
    );


    container.addEventListener(
        "mouseleave",
        () => {
            hovered = false;

            stopLoop();
        }
    );


    document.addEventListener(
        "keydown",
        event => {
            if (
                !container.isConnected
                ||
                !hovered
            ) {
                return;
            }


            switch (event.code) {
                case "ArrowLeft":
                    event.preventDefault();

                    playerMove(-1);

                    break;


                case "ArrowRight":
                    event.preventDefault();

                    playerMove(1);

                    break;


                case "ArrowDown":
                    event.preventDefault();

                    playerDrop(true);

                    break;


                case "ArrowUp":
                    event.preventDefault();

                    playerRotate(1);

                    break;


                case "Space":
                    event.preventDefault();

                    hardDrop();

                    break;


                case "KeyC":
                    event.preventDefault();

                    holdPiece();

                    break;


                case "ShiftLeft":
                case "ShiftRight":
                    event.preventDefault();

                    holdPiece();

                    break;


                case "KeyR":
                    event.preventDefault();

                    startGame();

                    break;
            }
        }
    );


    boardCanvas.addEventListener(
        "click",
        () => {
            boardCanvas.focus();
        }
    );


    restartButton.addEventListener(
        "click",
        event => {
            event.stopPropagation();

            startGame();

            boardCanvas.focus();
        }
    );


    const resizeObserver =
        new ResizeObserver(
            () => {
                resizeBoard();
            }
        );


    resizeObserver.observe(
        tetrisContent
    );


    window.addEventListener(
        "resize",
        resizeBoard
    );


    updateHighscore();

    resizeBoard();

    startGame();
}