// Runs the site on this computer for testing:
//   http://localhost:8765/            the site (add ?dev to reach the game
//                                     from the console: window.anecrawler)
//   ws://localhost:8787/ws            the game server (multiplayer); the
//                                     games use it instead of the real one
//                                     when the site is opened from localhost
//
//   node dev/serve.mjs                (Ctrl+C stops both)
//   SITE_PORT=9000 node dev/serve.mjs
//   NO_SERVER=1 node dev/serve.mjs   (just the site)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_PORT = Number(process.env.SITE_PORT ?? 8765);
const GAME_PORT = Number(process.env.GAME_PORT ?? 8787);

const TYPES = {
    ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
    ".css": "text/css", ".json": "application/json", ".png": "image/png",
    ".svg": "image/svg+xml", ".ico": "image/x-icon", ".md": "text/plain"
};

const site = http.createServer((req, res) => {

    const url = new URL(req.url, "http://localhost");
    let file = path.join(root, decodeURIComponent(url.pathname));

    if(!file.startsWith(root)){

        res.writeHead(403).end();

        return;

    }

    if(fs.existsSync(file) && fs.statSync(file).isDirectory())
        file = path.join(file, "index.html");

    fs.readFile(file, (error, body) => {

        if(error){

            res.writeHead(404).end("not found");

            return;

        }

        res.writeHead(200, {"content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store"});
        res.end(body);

    });

});

site.listen(SITE_PORT, () => console.log(`site         http://localhost:${SITE_PORT}/?dev`));

let game = null;

if(!process.env.NO_SERVER){

    game = spawn(process.execPath, ["server.js"], {cwd: path.join(root, "server"), env: {...process.env, PORT: String(GAME_PORT)}, stdio: "inherit"});

    console.log(`game server  ws://localhost:${GAME_PORT}/ws`);

}

const stop = () => {

    game?.kill();
    process.exit(0);

};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
