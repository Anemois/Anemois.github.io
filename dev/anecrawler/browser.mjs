// AneCrawler in a real (headless) browser, for what only a browser shows:
// drawing, the HUD, keys, and two players joining through the game server.
//
//   node dev/anecrawler/browser.mjs        a quick look: one player, then two
//                                          (starts dev/serve.mjs by itself if
//                                          the site is not up; pictures go to
//                                          $OUT, default /tmp/anecrawler-shots)
//
// Or import the helpers for a test of your own:
//
//   import {launch, serve, open, aim, coop, start, startTogether, fps, shot} from "./browser.mjs";
//   const server = await serve();                   // null if already up
//   const browser = await launch();
//   const a = await open(browser);                  // a page, game ready
//   await start(a, 4);                              // floor 4
//   await a.page.evaluate(() => anecrawler.session.state.players[0].hp = 99);
//   console.log(await shot(a, "floor4"));           // the picture's path
//   await browser.close(); server?.kill();
//
// In the page, window.anecrawler is {session, profile, renderer} (the
// site is opened with ?dev, see the end of anecrawler.js).

import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.SITE ?? "http://localhost:8765";

export const OUT = process.env.OUT ?? path.join(os.tmpdir(), "anecrawler-shots");


export async function launch(){

    let playwright = null;

    for(const load of [
        () => import("playwright"),
        () => createRequire(import.meta.url)("playwright"),
        () => import("/opt/npm-tools/node_modules/playwright/index.mjs")
    ]){

        try { playwright = await load(); break; } catch { /* next */ }

    }

    if(!playwright)
        throw new Error("playwright is not installed here");

    return (playwright.chromium ?? playwright.default.chromium).launch();

}


// is the site up? if not, start dev/serve.mjs (returned so it can be stopped)
export async function serve(){

    const up = async () => {

        try { return (await fetch(SITE + "/index.html")).ok; } catch { return false; }

    };

    if(await up())
        return null;

    const child = spawn(process.execPath, [path.join(here, "..", "serve.mjs")], {stdio: "ignore"});

    for(let i = 0; i < 50 && !await up(); i++)
        await new Promise(resolve => setTimeout(resolve, 100));

    return child;

}


// a page with the game ready and the keyboard on it; errors collects
// anything that went wrong on the page
export async function open(browser, {width = 1280, height = 2400, profile = null, context = null} = {}){

    context ??= await browser.newContext({viewport: {width, height}});

    const page = await context.newPage();
    const errors = [];

    page.on("console", m => { if(m.type() === "error" && !/ERR_CONNECTION|WebSocket/.test(m.text())) errors.push(m.text()); });
    page.on("pageerror", e => errors.push(e.message + " " + (e.stack ?? "").split("\n")[1]));

    if(profile)
        await page.addInitScript(p => localStorage.setItem("anecrawler-save", JSON.stringify(p)), profile);

    await page.goto(SITE + "/index.html?dev");
    await page.waitForFunction(() => window.anecrawler, null, {timeout: 10000});

    const tab = {page, context, errors};

    await aim(tab);

    return tab;

}


// Puts the mouse over the game (at `x`, `y` of the way across and down)
// so keys reach it. Keys only count while the mouse is over the game, and
// the page shifts when a run starts, so call it again after anything that
// changes the layout (start() and startTogether() do).
export async function aim(tab, x = 0.62, y = 0.5){

    await tab.page.locator(".ac-canvas").scrollIntoViewIfNeeded();

    // the nearest point to (x, y) where the game really is the thing under
    // the mouse (parts of it can be covered by the rest of the page)
    const point = await tab.page.evaluate(([x, y]) => {

        const root = document.querySelector(".anecrawler");
        const box = document.querySelector(".ac-canvas").getBoundingClientRect();
        let best = null;

        for(let i = 0; i <= 20; i++){

            for(let j = 0; j <= 20; j++){

                const px = box.x + box.width * (0.05 + 0.9 * i / 20);
                const py = box.y + box.height * (0.05 + 0.9 * j / 20);
                const d = Math.hypot(px - (box.x + box.width * x), py - (box.y + box.height * y));

                if(root.contains(document.elementFromPoint(px, py)) && (!best || d < best.d))
                    best = {x: px, y: py, d};

            }

        }

        return best ?? {x: box.x + box.width * x, y: box.y + box.height * y};

    }, [x, y]);

    await tab.page.mouse.move(point.x - 5, point.y - 5);
    await tab.page.mouse.move(point.x, point.y);

    tab.box = await tab.page.locator(".ac-canvas").boundingBox();

}


// into a run on `floor` (alone; with company use coop(), then start())
export async function start(tab, floor = 1){

    await tab.page.evaluate(f => anecrawler.session.send({type: "start", floor: f}), floor);
    await tab.page.waitForFunction(() => anecrawler.session.state.mode === "run", null, {timeout: 15000});
    await tab.page.waitForTimeout(300);
    await aim(tab);

}


// two pages: a host and a guest who joined with the room code
export async function coop(browser){

    const host = await open(browser);
    const guest = await open(browser);

    await aim(host);
    await host.page.click(".ac-coop-host");
    await host.page.waitForSelector(".ac-coop-code:not([hidden])");

    const code = (await host.page.textContent(".ac-coop-code strong")).trim();

    await aim(guest);
    await guest.page.click(".ac-coop-join");
    await guest.page.keyboard.type(code);
    await guest.page.keyboard.press("Enter");
    await guest.page.waitForFunction(() => anecrawler.session.role === "guest" && anecrawler.session.state?.players.length === 2, null, {timeout: 15000});

    return {host, guest, code};

}


// both into a run: the host asks, the guest agrees
export async function startTogether({host, guest}, floor = 1){

    await host.page.evaluate(f => anecrawler.session.send({type: "start", floor: f}), floor);
    await guest.page.waitForFunction(() => anecrawler.session.state.vote, null, {timeout: 10000});
    await guest.page.evaluate(() => anecrawler.session.send({type: "vote", agree: true}));

    for(const tab of [host, guest]){

        await tab.page.waitForFunction(() => anecrawler.session.state.mode === "run", null, {timeout: 15000});
        await aim(tab);

    }

    await host.page.waitForTimeout(400);

}


// frames drawn in `ms` (needs the mouse over the game)
export async function fps(tab, ms = 2000){

    return tab.page.evaluate(ms => new Promise(resolve => {

        let frames = 0;
        const t0 = performance.now();
        const tick = () => { frames++; performance.now() - t0 < ms ? requestAnimationFrame(tick) : resolve(frames * 1000 / ms); };

        requestAnimationFrame(tick);

    }), ms);

}


// a picture of the game area; returns the file's path
export async function shot(tab, name){

    fs.mkdirSync(OUT, {recursive: true});

    const file = path.join(OUT, name + ".png");
    const box = await tab.page.locator(".ac-field").boundingBox();

    await tab.page.screenshot({path: file, clip: box});

    return file;

}


/* ---------------- run directly: a quick look ---------------- */

if(process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])){

    const server = await serve();
    const browser = await launch();
    const pictures = [];
    let failed = 0;

    const ok = (name, condition, detail = "") => {

        condition || failed++;
        console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail === "" ? "" : "  " + detail}`);

    };

    try {

        // alone
        const a = await open(browser);

        await start(a, 4);
        await a.page.evaluate(() => { const s = anecrawler.session.state; setInterval(() => s.players.forEach(p => { p.hp = p.maxHp; p.dead = false; }), 50); });

        const x0 = await a.page.evaluate(() => anecrawler.session.state.players[0].x);

        await a.page.keyboard.down("KeyD");
        await a.page.waitForTimeout(800);
        await a.page.keyboard.up("KeyD");

        const x1 = await a.page.evaluate(() => anecrawler.session.state.players[0].x);
        const rate = await fps(a);

        ok("one player: a run starts and draws smoothly", rate > 45, `${rate.toFixed(0)} fps`);
        ok("D walks right", x1 - x0 > 20, `moved ${(x1 - x0).toFixed(0)}`);
        ok("sound is on after the first click", await a.page.evaluate(() => anecrawler.sound.context?.state === "running"));

        await a.page.click(".ac-settings-open");

        const settingsShown = await a.page.isVisible(".ac-settings-box");

        await a.page.keyboard.press("Escape");

        ok("Settings opens and Esc closes it", settingsShown && !(await a.page.isVisible(".ac-settings-box")));
        await aim(a);
        pictures.push(await shot(a, "alone"));

        await a.page.keyboard.press("KeyM");
        await a.page.waitForTimeout(400);

        ok("M opens the full map", await a.page.evaluate(() => anecrawler.renderer.mapOpen()));
        pictures.push(await shot(a, "map"));

        await a.page.keyboard.press("Escape");
        ok("no errors on the page", a.errors.length === 0, a.errors.slice(0, 3).join(" | "));
        await a.context.close();

        // two players
        const pair = await coop(browser);

        await startTogether(pair, 2);

        const route = await pair.guest.page.evaluate(() => anecrawler.session.routes.join());

        ok("two players join and start a run", true, `connected: ${route}`);

        const before = await pair.host.page.evaluate(() => anecrawler.session.state.players[1].x);

        await aim(pair.guest);
        await pair.guest.page.keyboard.down("KeyA");
        await pair.guest.page.waitForTimeout(700);
        await pair.guest.page.keyboard.up("KeyA");
        await pair.guest.page.waitForTimeout(400);

        const after = await pair.host.page.evaluate(() => anecrawler.session.state.players[1].x);

        ok("the guest walks and the host sees it", Math.abs(after - before) > 40, `moved ${Math.abs(after - before).toFixed(0)}`);
        pictures.push(await shot(pair.host, "host"), await shot(pair.guest, "guest"));
        ok("no errors on either page", !pair.host.errors.length && !pair.guest.errors.length, [...pair.host.errors, ...pair.guest.errors].slice(0, 3).join(" | "));

    }
    catch(error){

        failed++;
        console.log("FAIL", error.message.split("\n")[0]);

    }

    await browser.close();
    server?.kill();

    console.log("pictures:\n  " + pictures.join("\n  "));
    console.log(failed ? `${failed} failed` : "all passed");

    process.exitCode = failed ? 1 : 0;

}
