// Exercise the homepage loader through the browser, including a missing game asset.
import assert from "node:assert/strict";
import {launch, serve} from "../anecrawler/browser.mjs";


const site = process.env.SITE ?? "http://localhost:8765";
const server = await serve();
let browser;

try{

    browser = await launch();
    const page = await browser.newPage();
    const exports = [];

    page.on("request", request => {

        if(new URL(request.url()).pathname.includes("/games/brainstorm/"))
            exports.push(request.url());

    });

    await page.goto(site);
    await page.waitForSelector("#games-wrapper.ready");
    assert.equal(await page.locator(".game-load-error").count(), 0);
    assert.equal(await page.locator(".game-slot .fullscreen-button").count(), 8);
    assert.equal(await page.locator(".af-name").textContent(), "White orbit");
    assert.equal(exports.length, 0, "the Godot export loads only after Play");

    await page.locator(".brainstorm").hover();
    const loaded = page.waitForResponse(response =>
        new URL(response.url()).pathname.endsWith("/games/brainstorm/index.html"));
    await page.locator(".ab-play").click();
    assert.ok((await loaded).ok());
    await page.locator(".ab-close").click();
    assert.equal(await page.locator(".ab-field iframe").count(), 0);

    await page.route("**/games/brainstorm-card/brainstorm-card.html", route => route.fulfill({status: 404}));
    await page.reload();
    await page.waitForSelector("#games-wrapper.ready");
    assert.match(await page.locator(".game-load-error").textContent(), /午後激盪/);
    assert.equal(await page.locator(".game-slot .fullscreen-button").count(), 7);
    await page.locator(".anefk").hover();
    await page.locator(".af-chart").click();
    assert.equal(await page.locator(".af-name").textContent(), "Constellation");
    console.log("All games load, Brainstorm opens on demand, and AneFK stays playable after a missing asset.");

}
finally{

    await browser?.close();
    server?.kill();

}
