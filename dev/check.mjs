// Checks every script on the site in a few seconds:
//   - it parses as an ES module
//   - every relative import points at a file that exists
//
//   node dev/check.mjs            (whole site)
//   node dev/check.mjs games/anecrawler
//
// (`node --check file.js` is not enough here: with no package.json at the
// top of the site, node can let a broken file through without a word.)

import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv[2] ? path.resolve(root, process.argv[2]) : root;

const files = [];

(function walk(dir){

    for(const entry of fs.readdirSync(dir, {withFileTypes: true})){

        if(entry.name.startsWith(".") || entry.name === "node_modules")
            continue;

        const full = path.join(dir, entry.name);

        if(entry.isDirectory())
            walk(full);
        else if(/\.(js|mjs)$/.test(entry.name))
            files.push(full);

    }

})(only);

const IMPORT = /(?:import|export)\s[^;]*?from\s*["'](\.{1,2}\/[^"']+)["']|import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;

let bad = 0;

for(const file of files){

    const source = fs.readFileSync(file, "utf8");
    const parsed = spawnSync(process.execPath, ["--input-type=module", "--check"], {input: source, encoding: "utf8"});
    const name = path.relative(root, file);

    if(parsed.status !== 0){

        bad++;

        const where = parsed.stderr.split("\n").find(line => /^\[stdin\]:\d+/.test(line)) ?? "";
        const what = parsed.stderr.split("\n").find(line => /Error/.test(line)) ?? parsed.stderr.trim();

        console.log(`BAD  ${name}${where.replace("[stdin]", "")}  ${what}`);

        continue;

    }

    for(const match of source.matchAll(IMPORT)){

        const target = match[1] ?? match[2];

        if(!fs.existsSync(path.resolve(path.dirname(file), target))){

            bad++;

            console.log(`BAD  ${name}  imports ${target}, which does not exist`);

        }

    }

}

console.log(bad ? `${bad} problem(s) in ${files.length} files` : `ok: ${files.length} files`);

process.exit(bad ? 1 : 0);
