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


## Put it online

The site is served over https, so browsers will only connect to the game
server over https too (`wss://`). The simplest way: a small Linux server
(VPS) with Caddy in front, which gets the certificate for you.

1. **Get a small VPS** (any provider; the cheapest plan, Ubuntu 24.04).

2. **Point a subdomain at it.** At your domain registrar add an `A` record:
   name `play`, value = the server's IP address. (Any name works; the steps
   below say `play.example.com`.)

3. **Install Node and Caddy** on the server:

       sudo apt update
       sudo apt install -y nodejs caddy

   (If `caddy` is not found, follow https://caddyserver.com/docs/install.)

4. **Copy this folder** to the server, from your computer:

       scp -r server root@YOUR_SERVER_IP:/opt/game-server

5. **Start it as a service** (starts on boot, restarts if it stops):

       sudo cp /opt/game-server/game-server.service /etc/systemd/system/
       sudo systemctl enable --now game-server

   If your site will also live somewhere else than www.csie.ntu.edu.tw, add
   that address to `ALLOWED_ORIGINS` in the service file (comma-separated),
   then `sudo systemctl daemon-reload && sudo systemctl restart game-server`.

6. **Give it https**: put your subdomain into `Caddyfile`, then

       sudo cp /opt/game-server/Caddyfile /etc/caddy/Caddyfile
       sudo systemctl reload caddy

   If the server has a firewall: `sudo ufw allow 80,443/tcp`.

7. **Check**: https://play.example.com/health should say `game server ok`.

8. **Tell the game where it is**: in `games/anecrawler/net/config.js` set

       const PUBLIC_SERVER = "wss://play.example.com/ws";

   and upload the site as usual.

Logs: `journalctl -u game-server -f`.


## Settings

Environment variables (set in `game-server.service`):

- `PORT`: where to listen (default 8787; Caddy talks to it there).
- `ALLOWED_ORIGINS`: the websites allowed to connect, comma-separated.
  Unset means any website can use your server.

Limits are at the top of `server.js`: 200 rooms, 4 players a room,
messages up to 256 KB, and slow or silent connections are dropped.


## Files

- `server.js`: rooms and codes, and passing messages along
- `websocket.js`: the WebSocket protocol on Node's own http server
- `game-server.service`, `Caddyfile`: the two setup files used above
