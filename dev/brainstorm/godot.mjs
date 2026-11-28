// 午後激盪 (games/brainstorm) from its Godot project:
//
//   node dev/brainstorm/godot.mjs export    export the web build into games/brainstorm
//   node dev/brainstorm/godot.mjs server    run its dedicated server on ws://localhost:24242,
//                                           the one the game uses when the site is opened from localhost
//
// Where things are (override with environment variables):
//   GODOT     the Godot 4.7.2 editor binary (it needs the 4.7.2 web export templates installed)
//   PROJECT   the game's Godot project (the folder with project.godot)

import {spawnSync, spawn} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GODOT = process.env.GODOT ?? path.join(os.homedir(), "Desktop/danStuff/Godot/Godot.app/Contents/MacOS/Godot");
const PROJECT = process.env.PROJECT ?? path.join(os.homedir(), "Desktop/afternoon-brainstorm");
const WEB = path.join(root, "games/brainstorm");
const PORT = Number(process.env.PORT ?? 24242);

const command = process.argv[2];


if(command === "export"){

    exportWeb();

}
else if(command === "server"){

    serve();

}
else{

    console.log("usage: node dev/brainstorm/godot.mjs export | server");

    process.exit(1);

}


function exportWeb(){

    need(GODOT, "set GODOT");
    need(path.join(PROJECT, "project.godot"), "set PROJECT");

    fs.mkdirSync(WEB, {recursive: true});

    // an import first picks up new or renamed classes (the project's docs ask for it)
    run([
        "--headless", "--path", PROJECT, "--import"
    ]);

    run([
        "--headless", "--path", PROJECT, "--export-release", "Web", path.join(WEB, "index.html")
    ]);

    for(const name of fs.readdirSync(WEB).sort()){

        const size = fs.statSync(path.join(WEB, name)).size;

        console.log(`${(size / 1e6).toFixed(2).padStart(8)} MB  games/brainstorm/${name}`);

    }

}


// Runs the server from the exported index.pck, the way Render does, so it is
// always the same version as the web build.
function serve(){

    need(GODOT, "set GODOT");
    need(path.join(WEB, "index.pck"), "run export first");

    const server = spawn(
        GODOT,
        [
            "--headless", "--main-pack", path.join(WEB, "index.pck"),
            "-s", "res://script/net/server_main.gd", "--",
            "transport=websocket", `port=${PORT}`, "save_replays=false"
        ],
        {stdio: "inherit"}
    );

    process.on("SIGINT", () => server.kill());

}


function run(args){

    const result = spawnSync(GODOT, args, {encoding: "utf8"});

    // Godot prints its progress bars to stdout; only errors are worth showing
    const errors = `${result.stdout}\n${result.stderr}`
        .split("\n")
        .filter(line => /ERROR|SCRIPT ERROR/.test(line));

    if(errors.length){

        console.log(errors.join("\n"));

    }


    if(result.status !== 0){

        console.log(`godot ${args.join(" ")} failed (exit ${result.status})`);

        process.exit(1);

    }

}


function need(file, hint){

    if(!fs.existsSync(file)){

        console.log(`not found: ${file} (${hint})`);

        process.exit(1);

    }

}
