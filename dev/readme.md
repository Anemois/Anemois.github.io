# dev

Tools for working on the site. Nothing here is loaded by the site itself.
Everything runs with plain `node` (18 or newer); the browser checks also
need Playwright.

| command | what it does |
| --- | --- |
| `node dev/check.mjs [folder]` | every script parses, every relative import exists (a few seconds) |
| `node dev/serve.mjs` | the site on http://localhost:8765/?dev and the game server on ws://localhost:8787/ws |
| `node dev/anecrawler/smoke.mjs [floors bosses rules net]` | AneCrawler without a browser: every floor, every boss, game rules, host + guest over a laggy fake network (a few seconds) |
| `node dev/anecrawler/browser.mjs` | AneCrawler in a headless browser: one player, the map, two players joining; saves pictures |

`dev/anecrawler/kit.mjs` and `dev/anecrawler/browser.mjs` also export
helpers for writing a new check (a steppable game, a host + guest pair,
pages with the game ready). When a bug gets fixed, add a check for it to
`smoke.mjs` so it stays fixed.

Opening the site with `?dev` in the address puts the running AneCrawler at
`window.anecrawler` (`session`, `profile`, `renderer`) for the browser
console.
