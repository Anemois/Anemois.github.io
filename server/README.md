# Game server

Lets people play the site's multiplayer games together (AneCrawler for now).

One player hosts: the game runs in their browser, and this server gives them
a short room code. Friends type the code into Join. From then on the server
just passes messages between the host and the guests. It runs no game
itself, so it needs very little: the smallest server plan anywhere is plenty.

Plain Node, nothing to install (Node 18 or newer).


## Try it on your own computer

    node server/server.js

then open the site from `localhost` (for example run `python3 -m http.server`
in the site folder and open http://localhost:8000). On localhost the game
uses this local server by itself. Open the site in two browsers (or one
normal and one private window): Host in one, Join with the code in the other.

http://localhost:8787/health should say `game server ok`.


## Put it online (Render, free)

`render.yaml` at the top of the repo tells Render how to run this folder.

1. Sign up at https://render.com with your GitHub account.
2. **New > Blueprint**, pick the `Anemois/site` repo, and confirm. Render
   reads `render.yaml` and creates `anemois-game-server` (free, Singapore).
3. When it is live, copy its address (`https://anemois-game-server-xxxx.onrender.com`)
   and check that `/health` on it says `game server ok`.
4. In `games/anecrawler/net/config.js` set

       const PUBLIC_SERVER = "wss://anemois-game-server-xxxx.onrender.com/ws";

   (your address, `wss://` instead of `https://`, `/ws` on the end), then
   commit, push and upload the site as usual.

Every push to `main` redeploys the server by itself.

The free plan sleeps after 15 minutes without players. The game wakes it as
soon as someone opens AneCrawler, and Host/Join wait for it (up to about a
minute) instead of failing. Render may also restart it now and then, which
ends any game in progress; just host again.


## Or on your own Linux server (never sleeps)

1. Point a subdomain (say `play.example.com`) at the server's IP address.
2. Install Node and Caddy: `sudo apt install -y nodejs caddy`
   (if `caddy` is not found: https://caddyserver.com/docs/install).
3. Copy this folder over: `scp -r server root@YOUR_SERVER_IP:/opt/game-server`
4. Start it as a service:

       sudo cp /opt/game-server/game-server.service /etc/systemd/system/
       sudo systemctl enable --now game-server

5. Put your subdomain into `Caddyfile` (Caddy fetches the https certificate), then

       sudo cp /opt/game-server/Caddyfile /etc/caddy/Caddyfile
       sudo systemctl reload caddy

6. Check https://play.example.com/health, then put
   `wss://play.example.com/ws` into `games/anecrawler/net/config.js`.

Logs: `journalctl -u game-server -f`.


## Settings

Environment variables (set in `render.yaml` or `game-server.service`):

- `PORT`: where to listen (default 8787; Caddy talks to it there).
- `ALLOWED_ORIGINS`: the websites allowed to connect, comma-separated.
  Unset means any website can use your server.

Limits are at the top of `server.js`: 200 rooms, 4 players a room,
messages up to 256 KB, and slow or silent connections are dropped.


## Files

- `server.js`: rooms and codes, and passing messages along
- `websocket.js`: the WebSocket protocol on Node's own http server
- `game-server.service`, `Caddyfile`: for running it on your own server
- `../render.yaml`: for running it on Render
