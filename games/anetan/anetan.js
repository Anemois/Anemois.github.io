const BOARD_WIDTH = 360;
const BOARD_HEIGHT = 540;

const COLS = 8;
const ROWS = 12;
const CELL_SIZE = 40;

const GRID_LEFT = 20;
const GRID_TOP = 24;
const GRID_WIDTH = COLS * CELL_SIZE;
const GRID_HEIGHT = ROWS * CELL_SIZE;

const LAUNCHER_Y = 516;
const BALL_RETURN_Y = 520;
const BALL_RADIUS = 5;

const BALL_SPEED = 290;
const BALL_INTERVAL = 70;
const BALL_RETURN_SPEED = 1400;

const SPEEDUP_INTERVAL = 3500;
const SPEEDUP_FACTOR = 1.4;
const MAX_BALL_SPEED = 1400;

const HIGH_SCORE_KEY =
    "anetan-highscore";

const MIN_AIM_ANGLE =
    -Math.PI + Math.PI / 18;

const MAX_AIM_ANGLE =
    -Math.PI / 18;


export function init(container) {
    const game =
        container.querySelector("#anetan");

    if (!game || game.dataset.initialized) {
        return;
    }

    game.dataset.initialized =
        "true";


    const boardCanvas =
        game.querySelector("#anetan-board");

    const context =
        boardCanvas.getContext("2d");

    const scoreElement =
        game.querySelector("#anetan-score");

    const ballsElement =
        game.querySelector("#anetan-balls");

    const highscoreElement =
        game.querySelector("#anetan-highscore");


    let board =
        createBoard();

    let score = 0;

    let highscore =
        loadHighscore();

    let ballCount = 1;
    let pendingBalls = 0;

    let round = 0;

    let launcherX =
        BOARD_WIDTH / 2;


    let aim = {
        x: BOARD_WIDTH / 2,
        y: 100
    };


    let balls = [];

    let state = "ready";

    let hovered = false;
    let aiming = false;

    let activePointerId = null;


    let shotTotal = 0;
    let firedCount = 0;

    let launchTimer = 0;

    let firstLandingX = null;


    let animationFrame = null;
    let lastTime = 0;


    populateInitialBoard();

    updateStats();
    updateHighscore();

    render();


    function createBoard() {
        return Array.from(
            {
                length: ROWS
            },
            () => Array(COLS).fill(null)
        );
    }


    function populateInitialBoard() {
        board[0] =
            createRow(0);
    }


    function createRow(difficultyRound) {
        const row =
            Array(COLS).fill(null);

        const columns =
            shuffledColumns();

        const occupiedCount =
            randomInt(1, 6);

        const selectedColumns =
            columns.slice(
                0,
                occupiedCount
            );


        for (const column of selectedColumns) {
            row[column] = {
                type: "brick",

                hp:
                    getBrickHealth(
                        difficultyRound
                    ),

                flashUntil: 0
            };
        }


        const emptyColumns =
            columns.filter(
                column => !row[column]
            );


        const ballColumn =
            emptyColumns[
                Math.floor(
                    Math.random()
                    * emptyColumns.length
                )
            ];


        row[ballColumn] = {
            type: "ball"
        };


        return row;
    }


    function getBrickHealth(difficultyRound) {
        const maxHealth =
            Math.max(
                2,
                difficultyRound * 8 + 2
            );


        const randomValue =
            Math.pow(
                Math.random(),
                1.35
            );


        return (
            1
            + Math.floor(
                randomValue
                * maxHealth
            )
        );
    }


    function shuffledColumns() {
        const columns =
            Array.from(
                {
                    length: COLS
                },
                (_, index) => index
            );


        for (
            let i = columns.length - 1;
            i > 0;
            i--
        ) {
            const j =
                Math.floor(
                    Math.random()
                    * (i + 1)
                );


            [
                columns[i],
                columns[j]
            ] = [
                columns[j],
                columns[i]
            ];
        }


        return columns;
    }


    function randomInt(min, max) {
        return (
            Math.floor(
                Math.random()
                * (max - min + 1)
            )
            + min
        );
    }


    function updateStats() {
        scoreElement.textContent =
            `Score: ${score.toLocaleString()}`;

        ballsElement.textContent =
            `Balls: ${ballCount}`;
    }


    function loadHighscore() {
        try {
            const saved =
                Number(
                    localStorage.getItem(
                        HIGH_SCORE_KEY
                    )
                );


            return Number.isFinite(saved)
                ? saved
                : 0;

        } catch {
            return 0;
        }
    }


    function updateHighscore() {
        highscoreElement.textContent =
            `Highscore: ${highscore.toLocaleString()}`;
    }


    function saveHighscoreIfNeeded() {
        if (score <= highscore) {
            return;
        }


        highscore = score;


        try {
            localStorage.setItem(
                HIGH_SCORE_KEY,
                highscore.toString()
            );

        } catch {
            // Local storage may be unavailable.
        }


        updateHighscore();
    }


    function resetGame() {
        stopLoop();


        board =
            createBoard();

        populateInitialBoard();


        score = 0;
        ballCount = 1;
        pendingBalls = 0;
        round = 0;


        launcherX =
            BOARD_WIDTH / 2;


        aim = {
            x: BOARD_WIDTH / 2,
            y: 100
        };


        balls = [];


        state = "ready";

        aiming = false;
        activePointerId = null;


        shotTotal = 0;
        firedCount = 0;

        launchTimer = 0;

        firstLandingX = null;


        updateStats();
        render();
    }


    function updateAim(clientX, clientY) {
        const rect =
            boardCanvas.getBoundingClientRect();


        if (!rect.width || !rect.height) {
            return;
        }


        const scaleX =
            BOARD_WIDTH / rect.width;

        const scaleY =
            BOARD_HEIGHT / rect.height;


        aim = {
            x: clamp(
                (clientX - rect.left)
                * scaleX,

                0,
                BOARD_WIDTH
            ),

            y: clamp(
                (clientY - rect.top)
                * scaleY,

                0,
                BOARD_HEIGHT
            )
        };
    }


    function getAimDirection() {
        let dx =
            aim.x - launcherX;

        let dy =
            aim.y - LAUNCHER_Y;


        if (dy >= -20) {
            dy = -20;
        }


        let angle =
            Math.atan2(dy, dx);


        angle =
            clamp(
                angle,
                MIN_AIM_ANGLE,
                MAX_AIM_ANGLE
            );


        return {
            x: Math.cos(angle),
            y: Math.sin(angle)
        };
    }


    function startTurn() {
        if (state !== "ready") {
            return;
        }


        const direction =
            getAimDirection();


        shotTotal =
            ballCount;

        firedCount = 0;

        launchTimer = 0;

        firstLandingX = null;


        balls = [];


        state = "firing";


        fireBall(direction);

        firedCount++;


        lastTime =
            performance.now();


        startLoop();

        render();
    }


    function fireBall(direction) {
        const startY =
            LAUNCHER_Y - 8;


        balls.push({
            x: launcherX,
            y: startY,

            prevX: launcherX,
            prevY: startY,

            vx:
                direction.x
                * BALL_SPEED,

            vy:
                direction.y
                * BALL_SPEED,

            flightTime: 0,

            phase: "flying",

            targetX: null
        });
    }


    function update(time) {
        animationFrame = null;


        if (
            !hovered
            || state !== "firing"
        ) {
            return;
        }


        const deltaTime =
            Math.min(
                0.025,

                Math.max(
                    0,
                    (time - lastTime)
                    / 1000
                )
            );


        lastTime = time;


        launchTimer +=
            deltaTime * 1000;


        while (
            firedCount < shotTotal
            && launchTimer >= BALL_INTERVAL
        ) {
            launchTimer -=
                BALL_INTERVAL;


            fireBall(
                getAimDirection()
            );


            firedCount++;
        }


        updateBalls(deltaTime);


        if (
            firedCount === shotTotal
            && balls.length > 0
            && balls.every(
                ball => ball.phase === "settled"
            )
        ) {
            completeTurn();
        }


        render();


        if (
            hovered
            && state === "firing"
        ) {
            animationFrame =
                requestAnimationFrame(
                    update
                );
        }
    }


    function updateBalls(deltaTime) {
        for (const ball of balls) {
            if (ball.phase === "settled") {
                continue;
            }


            if (ball.phase === "returning") {
                updateBallReturn(
                    ball,
                    deltaTime
                );

                continue;
            }


            ball.flightTime +=
                deltaTime * 1000;


            updateBallSpeed(ball);


            ball.prevX = ball.x;
            ball.prevY = ball.y;


            ball.x +=
                ball.vx * deltaTime;

            ball.y +=
                ball.vy * deltaTime;


            handleWallCollision(ball);

            handleBrickCollisions(ball);


            if (
                ball.y >= BALL_RETURN_Y
                && ball.vy > 0
            ) {
                beginBallReturn(ball);
            }
        }
    }


    function beginBallReturn(ball) {
        ball.y =
            BALL_RETURN_Y;

        ball.vx = 0;
        ball.vy = 0;


        if (firstLandingX === null) {
            firstLandingX =
                clamp(
                    ball.x,

                    GRID_LEFT
                        + BALL_RADIUS,

                    GRID_LEFT
                        + GRID_WIDTH
                        - BALL_RADIUS
                );
        }


        ball.targetX =
            firstLandingX;

        ball.phase =
            "returning";


        updateBallReturn(
            ball,
            0
        );
    }


    function updateBallReturn(
        ball,
        deltaTime
    ) {
        const distance =
            ball.targetX - ball.x;

        const step =
            BALL_RETURN_SPEED
            * deltaTime;


        if (
            Math.abs(distance)
            <= step
        ) {
            ball.x =
                ball.targetX;

            ball.phase =
                "settled";

            return;
        }


        ball.x +=
            Math.sign(distance)
            * step;
    }


    function updateBallSpeed(ball) {
        const speedSteps =
            Math.floor(
                ball.flightTime
                / SPEEDUP_INTERVAL
            );


        const targetSpeed =
            Math.min(
                MAX_BALL_SPEED,

                BALL_SPEED
                * Math.pow(
                    SPEEDUP_FACTOR,
                    speedSteps
                )
            );


        const currentSpeed =
            Math.hypot(
                ball.vx,
                ball.vy
            );


        if (currentSpeed <= 0) {
            return;
        }


        const scale =
            targetSpeed
            / currentSpeed;


        ball.vx *= scale;
        ball.vy *= scale;
    }


    function handleWallCollision(ball) {
        const leftLimit =
            BALL_RADIUS;

        const rightLimit =
            BOARD_WIDTH
            - BALL_RADIUS;

        const topLimit =
            BALL_RADIUS;


        if (ball.x < leftLimit) {
            ball.x = leftLimit;


            if (ball.vx < 0) {
                ball.vx =
                    -ball.vx;
            }
        }


        if (ball.x > rightLimit) {
            ball.x = rightLimit;


            if (ball.vx > 0) {
                ball.vx =
                    -ball.vx;
            }
        }


        if (ball.y < topLimit) {
            ball.y = topLimit;


            if (ball.vy < 0) {
                ball.vy =
                    -ball.vy;
            }
        }
    }


    function handleBrickCollisions(ball) {
        let collisionHandled =
            false;


        for (
            let row = 0;
            row < ROWS;
            row++
        ) {
            for (
                let column = 0;
                column < COLS;
                column++
            ) {
                const brick =
                    board[row][column];


                if (!brick) {
                    continue;
                }


                const rect =
                    getCellRect(
                        row,
                        column
                    );


                if (
                    !circleIntersectsRect(
                        ball,
                        rect
                    )
                ) {
                    continue;
                }


                const normal =
                    getCollisionNormal(
                        ball,
                        rect
                    );


                reflectBall(
                    ball,
                    normal
                );


                pushBallOut(
                    ball,
                    rect,
                    normal
                );


                if (brick.type === "ball") {
                    pendingBalls++;

                    score += 5;


                    board[row][column] =
                        null;

                } else {
                    brick.hp--;

                    brick.flashUntil =
                        performance.now()
                        + 80;


                    score++;


                    if (brick.hp <= 0) {
                        board[row][column] =
                            null;
                    }
                }


                saveHighscoreIfNeeded();
                updateStats();


                collisionHandled =
                    true;

                break;
            }


            if (collisionHandled) {
                break;
            }
        }
    }


    function getCellRect(row, column) {
        return {
            x:
                GRID_LEFT
                + column * CELL_SIZE
                + 2,

            y:
                GRID_TOP
                + row * CELL_SIZE
                + 2,

            width:
                CELL_SIZE - 4,

            height:
                CELL_SIZE - 4
        };
    }


    function circleIntersectsRect(ball, rect) {
        const closestX =
            clamp(
                ball.x,

                rect.x,

                rect.x
                + rect.width
            );


        const closestY =
            clamp(
                ball.y,

                rect.y,

                rect.y
                + rect.height
            );


        const dx =
            ball.x - closestX;

        const dy =
            ball.y - closestY;


        return (
            dx * dx
            + dy * dy
            <= BALL_RADIUS
            * BALL_RADIUS
        );
    }


    function getCollisionNormal(ball, rect) {
        const previousX =
            ball.prevX;

        const previousY =
            ball.prevY;


        if (
            previousY <= rect.y
            && ball.y > rect.y
        ) {
            return {
                x: 0,
                y: -1
            };
        }


        if (
            previousY >=
                rect.y
                + rect.height
            && ball.y <
                rect.y
                + rect.height
        ) {
            return {
                x: 0,
                y: 1
            };
        }


        if (
            previousX <= rect.x
            && ball.x > rect.x
        ) {
            return {
                x: -1,
                y: 0
            };
        }


        if (
            previousX >=
                rect.x
                + rect.width
            && ball.x <
                rect.x
                + rect.width
        ) {
            return {
                x: 1,
                y: 0
            };
        }


        const closestX =
            clamp(
                ball.x,

                rect.x,

                rect.x
                + rect.width
            );


        const closestY =
            clamp(
                ball.y,

                rect.y,

                rect.y
                + rect.height
            );


        const dx =
            ball.x - closestX;

        const dy =
            ball.y - closestY;


        const distance =
            Math.hypot(
                dx,
                dy
            );


        if (distance > 0) {
            return {
                x: dx / distance,
                y: dy / distance
            };
        }


        const left =
            ball.x - rect.x;

        const right =
            rect.x
            + rect.width
            - ball.x;

        const top =
            ball.y - rect.y;

        const bottom =
            rect.y
            + rect.height
            - ball.y;


        const smallest =
            Math.min(
                left,
                right,
                top,
                bottom
            );


        if (smallest === left) {
            return {
                x: -1,
                y: 0
            };
        }


        if (smallest === right) {
            return {
                x: 1,
                y: 0
            };
        }


        if (smallest === top) {
            return {
                x: 0,
                y: -1
            };
        }


        return {
            x: 0,
            y: 1
        };
    }


    function reflectBall(ball, normal) {
        const dot =
            ball.vx * normal.x
            + ball.vy * normal.y;


        if (dot >= 0) {
            return;
        }


        ball.vx -=
            2
            * dot
            * normal.x;

        ball.vy -=
            2
            * dot
            * normal.y;
    }


    function pushBallOut(
        ball,
        rect,
        normal
    ) {
        const penetration =
            BALL_RADIUS + 0.5;


        ball.x +=
            normal.x
            * penetration;

        ball.y +=
            normal.y
            * penetration;
    }


    function completeTurn() {
        state = "resolving";


        if (firstLandingX !== null) {
            launcherX =
                firstLandingX;
        }


        ballCount +=
            pendingBalls;


        pendingBalls = 0;

        balls = [];


        round++;


        for (
            let row = ROWS - 1;
            row > 0;
            row--
        ) {
            board[row] =
                board[row - 1];
        }


        board[0] =
            createRow(round);


        if (
            board[ROWS - 1].some(
                cell => cell !== null
            )
        ) {
            state = "gameover";


            saveHighscoreIfNeeded();

            stopLoop();

            updateStats();
            render();

            return;
        }


        state = "ready";


        updateStats();
        render();
    }


    function startLoop() {
        if (
            animationFrame !== null
            || !hovered
            || state !== "firing"
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
        if (animationFrame === null) {
            return;
        }


        cancelAnimationFrame(
            animationFrame
        );


        animationFrame = null;
    }


    function drawGrid() {
        context.strokeStyle =
            "rgba(255,255,255,0.035)";

        context.lineWidth = 1;


        for (
            let column = 0;
            column <= COLS;
            column++
        ) {
            const x =
                GRID_LEFT
                + column * CELL_SIZE
                + 0.5;


            context.beginPath();

            context.moveTo(
                x,
                GRID_TOP
            );

            context.lineTo(
                x,
                GRID_TOP
                + GRID_HEIGHT
            );

            context.stroke();
        }


        for (
            let row = 0;
            row <= ROWS;
            row++
        ) {
            const y =
                GRID_TOP
                + row * CELL_SIZE
                + 0.5;


            context.beginPath();

            context.moveTo(
                GRID_LEFT,
                y
            );

            context.lineTo(
                GRID_LEFT
                + GRID_WIDTH,
                y
            );

            context.stroke();
        }
    }


    function drawBrick(
        row,
        column,
        brick
    ) {
        const rect =
            getCellRect(
                row,
                column
            );


        if (brick.type === "ball") {
            context.fillStyle =
                "#111111";

            context.strokeStyle =
                "#b7e3ff";

            context.lineWidth = 1.5;


            roundedRect(
                context,

                rect.x,
                rect.y,

                rect.width,
                rect.height,

                1
            );


            context.fill();
            context.stroke();


            context.fillStyle =
                "#b7e3ff";

            context.font =
                "bold 18px Arial";

            context.textAlign =
                "center";

            context.textBaseline =
                "middle";


            context.fillText(
                "+",

                rect.x
                + rect.width / 2,

                rect.y
                + rect.height / 2
            );


            return;
        }


        const flash =
            brick.flashUntil
            > performance.now();


        context.fillStyle =
            flash
                ? "#ffffff"
                : "#232323";


        context.strokeStyle =
            flash
                ? "#ffffff"
                : "#555555";


        context.lineWidth = 1;


        roundedRect(
            context,

            rect.x,
            rect.y,

            rect.width,
            rect.height,

            1
        );


        context.fill();
        context.stroke();


        context.fillStyle =
            flash
                ? "#000000"
                : "#ffffff";


        context.font =
            brick.hp >= 100
                ? "bold 11px Arial"

                : brick.hp >= 10
                    ? "bold 14px Arial"

                    : "bold 16px Arial";


        context.textAlign =
            "center";

        context.textBaseline =
            "middle";


        context.fillText(
            brick.hp.toString(),

            rect.x
            + rect.width / 2,

            rect.y
            + rect.height / 2
        );
    }


    function drawAimGuide() {
        if (
            state !== "ready"
            || !hovered
        ) {
            return;
        }


        const direction =
            getAimDirection();


        context.save();


        context.strokeStyle =
            "rgba(255,255,255,0.32)";

        context.lineWidth = 1;

        context.setLineDash([
            4,
            7
        ]);


        context.beginPath();


        context.moveTo(
            launcherX,
            LAUNCHER_Y
        );


        context.lineTo(
            launcherX
            + direction.x * 480,

            LAUNCHER_Y
            + direction.y * 480
        );


        context.stroke();


        context.restore();
    }


    function drawLauncher() {
        context.beginPath();


        context.arc(
            launcherX,
            LAUNCHER_Y,
            6,
            0,
            Math.PI * 2
        );


        context.fillStyle =
            "#ffffff";

        context.fill();


        context.beginPath();


        context.arc(
            launcherX,
            LAUNCHER_Y,
            10,
            0,
            Math.PI * 2
        );


        context.strokeStyle =
            "rgba(255,255,255,0.16)";

        context.lineWidth = 1;

        context.stroke();
    }


    function drawBall(ball) {
        context.beginPath();


        context.arc(
            ball.x,
            ball.y,

            BALL_RADIUS,

            0,
            Math.PI * 2
        );


        context.fillStyle =
            "#ffffff";

        context.fill();
    }


    function drawOverlay() {
        context.fillStyle =
            "rgba(0,0,0,0.68)";


        context.fillRect(
            0,
            0,

            BOARD_WIDTH,
            BOARD_HEIGHT
        );


        context.fillStyle =
            "#ffffff";


        context.textAlign =
            "center";

        context.textBaseline =
            "middle";


        context.font =
            "bold 32px Arial";


        context.fillText(
            "GAME OVER",

            BOARD_WIDTH / 2,

            BOARD_HEIGHT / 2 - 12
        );


        context.font =
            "14px Arial";


        context.fillStyle =
            "#aaaaaa";


        context.fillText(
            "Click to restart",

            BOARD_WIDTH / 2,

            BOARD_HEIGHT / 2 + 20
        );
    }


    function render() {
        context.setTransform(
            1,
            0,
            0,
            1,
            0,
            0
        );


        context.fillStyle =
            "#0b0b0b";


        context.fillRect(
            0,
            0,

            BOARD_WIDTH,
            BOARD_HEIGHT
        );


        drawGrid();


        for (
            let row = 0;
            row < ROWS;
            row++
        ) {
            for (
                let column = 0;
                column < COLS;
                column++
            ) {
                const brick =
                    board[row][column];


                if (brick) {
                    drawBrick(
                        row,
                        column,
                        brick
                    );
                }
            }
        }


        drawAimGuide();


        for (const ball of balls) {
            drawBall(ball);
        }


        drawLauncher();


        if (state === "gameover") {
            drawOverlay();
        }
    }


    function roundedRect(
        target,
        x,
        y,
        width,
        height,
        radius
    ) {
        const r =
            Math.min(
                radius,

                width / 2,
                height / 2
            );


        target.beginPath();


        target.moveTo(
            x + r,
            y
        );


        target.arcTo(
            x + width,
            y,

            x + width,
            y + height,

            r
        );


        target.arcTo(
            x + width,
            y + height,

            x,
            y + height,

            r
        );


        target.arcTo(
            x,
            y + height,

            x,
            y,

            r
        );


        target.arcTo(
            x,
            y,

            x + width,
            y,

            r
        );


        target.closePath();
    }


    function clamp(
        value,
        min,
        max
    ) {
        return Math.max(
            min,
            Math.min(
                max,
                value
            )
        );
    }


    function handlePointerDown(event) {
        if (
            event.pointerType === "mouse"
            && event.button !== 0
        ) {
            return;
        }


        hovered = true;


        if (state === "gameover") {
            resetGame();
            return;
        }


        if (state !== "ready") {
            return;
        }


        updateAim(
            event.clientX,
            event.clientY
        );


        aiming = true;


        activePointerId =
            event.pointerId;


        boardCanvas.setPointerCapture(
            event.pointerId
        );


        boardCanvas.focus();

        render();
    }


    function handlePointerMove(event) {
        if (state !== "ready") {
            return;
        }


        updateAim(
            event.clientX,
            event.clientY
        );


        render();
    }


    function handlePointerUp(event) {
        if (
            !aiming
            || event.pointerId
                !== activePointerId
        ) {
            return;
        }


        aiming = false;

        activePointerId = null;


        if (
            boardCanvas.hasPointerCapture(
                event.pointerId
            )
        ) {
            boardCanvas.releasePointerCapture(
                event.pointerId
            );
        }


        if (state === "ready") {
            startTurn();
        }
    }


    game.addEventListener(
        "pointerenter",
        () => {
            hovered = true;

            render();
            startLoop();
        }
    );


    game.addEventListener(
        "pointerleave",
        () => {
            hovered = false;

            stopLoop();
        }
    );


    boardCanvas.addEventListener(
        "pointerdown",
        handlePointerDown
    );


    boardCanvas.addEventListener(
        "pointermove",
        handlePointerMove
    );


    boardCanvas.addEventListener(
        "pointerup",
        handlePointerUp
    );


    boardCanvas.addEventListener(
        "pointercancel",
        () => {
            aiming = false;
            activePointerId = null;
        }
    );


    boardCanvas.addEventListener(
        "click",
        () => {
            boardCanvas.focus();
        }
    );


    document.addEventListener(
        "keydown",
        event => {
            if (
                !game.isConnected
                || !hovered
            ) {
                return;
            }


            if (event.code === "KeyR") {
                event.preventDefault();

                resetGame();

                return;
            }


            if (event.code === "Space") {
                event.preventDefault();


                if (state === "gameover") {
                    resetGame();
                    return;
                }


                if (state === "ready") {
                    startTurn();
                }
            }
        }
    );
}