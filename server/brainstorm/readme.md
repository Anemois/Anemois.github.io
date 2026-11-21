# 午後激盪 server (for the web build)

Lets people play 午後激盪 (`games/brainstorm`) online from the site.

The game has its own dedicated server (rooms, drafts, matches: the server
decides everything). The desktop game reaches it over ENet (UDP), which a
browser cannot do, so the web build talks to a copy of that server started
with `transport=websocket`. This folder runs that copy on Render, which
gives it a `wss://` address.

It runs straight out of `games/brainstorm/web/index.pck`, the same file the
site serves. So the server and the web build are always the same version,
and the game's version check lets them play.

Web players only meet other web players here. Desktop players stay on the
friends' own server.


## Try it on your own computer

    node dev/brainstorm/godot.mjs server

starts it on `ws://localhost:24242`. That's the address the game uses when
the site is opened from localhost (`node dev/serve.mjs`, then
http://localhost:8765). Open the game in two tabs to play yourself.


## Put it online (Render, free)

`render.yaml` at the top of the repo has an entry for it,
`afternoon-brainstorm-server`, next to the AneCrawler relay.

1. Push the repo. In Render, open the Blueprint made from this repo. It
   picks up the new service from `render.yaml` and asks you to confirm
   (or **New > Blueprint** again).
2. The first build takes a few minutes: it downloads Godot 4.7.2 for Linux.
   The log should end with
   `[server] Afternoon Brainstorm dedicated server started: port 10000 (WebSocket, TCP)`.
3. If Render gave it a different address than
   `https://afternoon-brainstorm-server.onrender.com`, put yours in
   `PUBLIC_SERVER` in `games/brainstorm/brainstorm.js` (`wss://` instead of
   `https://`, nothing on the end).

It only rebuilds when this folder or `games/brainstorm/web/index.pck`
changes. The AneCrawler relay is not touched.

The free plan sleeps after 15 minutes without visitors, and waking takes
about a minute. Pressing Play wakes it, and the page keeps it awake while
the game is open. If Connect says it can't reach the server, wait a moment
and try again. A restart (Render does that now and then) ends the matches
in progress.


## When the game changes

1. Pull the friends' project (`~/Desktop/afternoon-brainstorm`).
2. `node dev/brainstorm/godot.mjs export` rebuilds `games/brainstorm/web`.
3. Push (Render rebuilds the server from the new `index.pck`) and upload
   the site.

Do both: a server and a page from different versions refuse each other
("version differs").

A new Godot version needs a matching version everywhere: the editor, its
web export templates, and `GODOT_VERSION` + `GODOT_SHA512` in the
`Dockerfile`.
