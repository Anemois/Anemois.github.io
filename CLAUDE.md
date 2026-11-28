# Anemois's Website

A site of small browser games: plain ES modules and canvas, with no build
step and no dependencies. It is served from the NTU CSIE web space at
https://www.csie.ntu.edu.tw/~b14902029/ and pushed to
`github.com/Anemois/site`. The multiplayer relay (`server/`) runs on Render's
free tier at `wss://anemois-game-server.onrender.com/ws`.

Use the maps below to find your way. Grep for the name you need and read
only those lines, instead of reading whole files (most are 500–1800 lines).

## Ground rules

- **Never commit or push.** The owner commits and pushes themselves. Don't
  run git commands that change history or the working tree (commit, push,
  pull, stash, checkout, reset, merge). `git status`, `git diff` and
  `git log` are fine.
- Don't touch uncommitted changes the owner made unless asked. Look at
  `git status` / `git diff` before editing a file someone else may be
  editing.
- Keep file and folder names lowercase.
- Ask before deleting files.
- Code style:
  - 4-space indent.
  - A blank line after `{` and before `}` of multi-line blocks.
  - `if(x)` with no space.
  - Two blank lines between functions.
  - A short plain-English comment on anything not obvious.
  - Clean, modular, minimal code.
- After a change, say briefly what changed and what to try, and remind the
  owner it isn't committed. When the multiplayer format changes, mention
  that everyone in a co-op game must reload, because old and new copies
  can't play together.

## Site map

| path | what |
| --- | --- |
| `index.html/.css/.js` | The page. `GAMES` in index.js lists each game (`name`, `column` 0/1 or `full`, `order`). It loads `games/<name>/<name>.html/.css/.js`, calls the module's `init(container)`, and shows the page once all games have loaded. |
| `lib/fx.js` | Shared: `createFx` (particles, rings, bolts, floating text, `shake`/`setShake`), `alpha`, `mix`, `formatNumber`. |
| `lib/savebox.js` | `showSave`/`askSave`: the export/import save dialog (in the page, never `prompt`/`alert`; `load` may be async). |
| `lib/savecode.js` | Saves that can't be read or edited by hand (scrambled with the game's name and a salt, checksummed). `encodeCode`/`decodeCode` (async, deflated): the export codes; AneCrawler packs its bag into rows first. `storeSave`/`loadStored` (sync): what AneFK, AneTD and AneCrawler keep in localStorage, under `<key>-sealed`; an old plain save is moved over once, then plain JSON is ignored. Old plain-base64 codes are refused on purpose: they were how players cheated. |
| `lib/sound.js` | `createSound`: sound effects made in code (Web Audio, no files). `play(v => v.tone(...).noise(...), {group, gain, pan, key, gap})`, `loop()`, a volume per group, a limiter, and `unlock()` after the first click. |
| `games/click_speed`, `reaction_time`, `tetris`, `anetan` | Small games, one file each. |
| `games/anefk/` | AneFK, an idle blob-clicker: `data`, `economy`, `shop`, `orbs`, `seekers`, `golden`, `tree(-data)`, `save`, `amounts`. |
| `games/anetd/` | AneTD, a balloon tower defence: `game`, `battle`, `waves`, `map`, `shop`, `economy`, `sky(-data)`, `inspect`, `render`, `save`, `data`. |
| `games/anecrawler/` | AneCrawler, a co-op dungeon crawler (below). |
| `games/brainstorm-card/` | 午後激盪, a Godot card battler by the owner and friends. `brainstorm-card.js` opens the Godot web export in `games/brainstorm/` in an iframe when Play is pressed (it is ~45 MB), passing the online server as `?server=`. `games/brainstorm/` is generated: never edit it, re-export it (Testing). The Godot project is a separate repo at `~/Desktop/afternoon-brainstorm`; its `script/net/net_transport.gd` picks WebSocket on the web. |
| `server/` | The relay: `server.js` and `websocket.js`, no dependencies, ES modules. It only pairs host and guests, and carries messages when a direct line fails. `render.yaml` deploys it. |
| `server/brainstorm/` | 午後激盪's own dedicated server for web players: a Dockerfile running Godot headless on `games/brainstorm/index.pck` with `transport=websocket`, a second Render service in `render.yaml` (`.dockerignore` at the top keeps its build small). See its readme. |
| `dev/` | The test kit (see Testing). The site never loads it. |

## AneCrawler: how it is put together

The host's browser runs the whole game. Guests send inputs and draw
snapshots. A guest's own character is predicted, so it moves and fires at
once.

```
sim/  the rules: deterministic, fixed steps (STEP = 1/60), seeded rng only
      (state.rng, never Math.random), no DOM. step(state, inputs) moves
      everything and pushes events to state.events, which the caller empties.
net/  host.js runs sim.step and sends snapshots (protocol.js encode, then
      compress per guest). client.js sends numbered inputs. predict.js
      replays the guest's own unanswered inputs on its copy of the player.
      p2p.js is the WebRTC data channel; relay.js is the room-code server
      fallback.
view/ draws a state: render.js (frame order, camera, map, props, strikes,
      lasers, light), actors.js (enemies, players, bullets, SHOT_LOOKS),
      effects.js (events -> particles, banners), sounds.js (events ->
      sounds), hud.js (incl. the M map), fog.js (explored tiles, minimap
      canvas), lighting.js, terrain.js (world looks, zones, air), sprites.js
      (weapons), draw.js (shapes, labels), input.js (keys/mouse -> intent)
ui/   DOM panels: bag (loadout), case (chest roll + rarity reveal), coop
      (host/join), vote, describe (weapon tags), settings (volumes, shake)
anecrawler.js  init(): wires session + renderer + sound + UI, the frame loop,
               UI keys (onKey: M map, Esc pause). With ?dev in the address,
               window.anecrawler = {session, profile, renderer, sound, settings}.
profile.js     the save (bag, loadout, shards, stats)
```

**The sim files.** `data.js` holds every table: `PLAYER`, `WORLDS`,
`WEAPONS`, `ENEMIES`, `BOSSES`, `TINT(S)`, `ZONES`, `WAKE`, `ELITE`,
`CHAMPION` and the growth constants.

| file | what |
| --- | --- |
| `sim.js` | `createSim`, `addPlayer`, `step`, `command` (loot, loadout, slot, start, quit, vote, startFloor), the player update (`movePlayer`, `switchSlot`, `resetHands`), props and portals (`PORTAL_GUARD` seals portals while enemies are near), revive (hold E), votes, travel. |
| `enemies.js` | `populate`, `makeEnemy`, `refreshLive`, statuses (burn, slow, chill/freeze, poison, stagger), and the `AI` table keyed by `ENEMIES[type].ai`. |
| `bosses.js` | `spawnBoss`, `updateBoss`, and the `PATTERNS` table. |
| `combat.js` | Weapons (`updateWeapon`, `trigger`, `coolDown`, `extraFor`, swings, `deflect`), bullets, splits, zaps, storm, strikes, lasers. |
| `flight.js` | Paths host and guest must agree on: lob, boomerang, split shards. |
| `world.js` | `emit`, `damagePlayer`/`damageEnemy`, `killEnemy`, `explode`, `enemyBullet` (options: r, dmg, life, homing, color, from, `arrow`), `ring`, pickups, crates. |
| map side | `mapgen.js` (floors, the lobby, vents), `map.js` (tiles FLOOR/WALL/CRATE/WATER/CHASM/LAVA, `walkable`/`solidAt`/`blocksAt`), `nav.js` (flow field), `grid.js` (`near()` lookups), `ground.js` (water, zones incl. the players' own acid/blaze, vents), `physics.js` (`moveBody`, `castRay`, `lineOfSight`), `loot.js` (`weaponStats`, `weaponPower`, `rollWeapon`, `floorName`, `isBossFloor`). |

**The wire (`net/protocol.js`).**

- Several lists travel as indexes: `TYPES` (built from ENEMIES + BOSSES),
  `MODES` (enemy modes), `ZONE_KINDS`, `STRIKE_LOOKS`, `PICKUPS` and
  `WEAPON_IDS`. Only ever append to them.
- Props are sent as an explicit field list (the `O:` rows).
- The guest's own body and hands come back in the `Y` row: slot, energy,
  reload, `co` (the put-away weapon's cooldown), `sp` (spin), burst,
  charge and so on.
- Players travel as plain objects (`encodePlayer`).
- Events reach a player only when they happen nearby, unless they are in
  `GLOBAL`.
- A guest drops its own `SHOWN_HERE` events (shot, swing, rail, shock,
  dash), because its screen already showed them.

**Trimmed snapshots.** `compress()` sends each guest only what changed since
its last snapshot:

- enemy rows;
- bullets, resent only when their course changes (the guest keeps moving
  them);
- zones, sent once (they burn down on the guest);
- pickups;
- the rarely changing player fields (`STATIC`), and player fields at their
  `RESTING` value.

A whole snapshot (`full`) goes every second and on every new floor. The
guest's `expand()` and its kept maps rebuild the rest. A new per-snapshot
list with an id first can use `delta()` the same way. `trimEvent` rounds the
numbers in events sent to guests.

## Recipes

Each recipe lists every place to touch. Missing one usually breaks only the
guest's screen, which a solo test won't show, so run the `net` smoke.

- **New enemy**:
  1. Add an `ENEMIES` entry in data.js: name, ai, hp, speed, radius, cost,
     `from` (first floor), color, plus fire/bullet if it shoots.
  2. Give it a weight in `WORLDS[i].enemies`.
  3. Write an `AI` function in enemies.js, or reuse one.
  4. Append any new `e.mode` to `MODES` in protocol.js.
  5. Add a body in `BODIES` in actors.js (missing ones fall back to the
     slime), an `EYES` colour, and a `glowOf` case if it should shine.
  6. Add death/attack events, effects and sounds as needed.
- **Enemy shot**: `enemyBullet(state, e, angle, speed, {r, color: TINT.x, arrow})`.
  Arrows can't be swatted by swings (`combat.js deflect`). They are drawn
  in actors.js `enemyArrow`.
- **New boss or boss attack**:
  - A boss is a `BOSSES` entry (id, name, hp, radius, speed, color, shape,
    patterns) plus an entry in `WORLDS[i].bosses`.
  - An attack is `PATTERNS.name(state, e, target, dt, P)` in bosses.js. It
    returns true when done. `P.t` is the time so far; `P.step`, `wait`,
    `count` and `fire` start at 0 for your use. Check `e.enraged` to make it
    harder.
  - A new `shape` is drawn in the boss branch of actors.js (square, diamond,
    lich, core).
  - New strike looks go in `STRIKE_LOOKS` and render.js `drawStrike`.
- **New weapon**:
  - Add a `WEAPONS` entry in data.js. Append it; don't insert into the list.
  - `kind` is gun, melee, charge or beam.
  - The stats are dmg, rate, energy and crit, then by kind: speed, size,
    life, spread, count, burst/burstGap (guns); range, arc, wave, shock
    (melee); charge, minCharge, rain, rail (charge).
  - Extras: pierce, bounce, explode, homing, pull, chain, slow, burn, tick.
  - Special behaviour fields (returns, lob, zone, split, spin, zap, chill,
    poison, stagger, leech, reflect, storm) are explained in a comment at
    the "second armoury" in data.js. Combine them before inventing new ones.
  - `look` picks how its shots are drawn (`SHOT_LOOKS` in actors.js), and
    `casing: true` ejects shells.
  - The held look is the `shape` list (rect/poly/circle parts, pointing
    right, grip at 0,0), drawn by sprites.js.
  - If it fires something new, mirror it in `net/predict.js` (flyers) so
    guests see it at once. Put shared paths in `flight.js`.
  - Add a line to `weaponPower` in loot.js if it adds damage, a tag in
    ui/describe.js, and check `voiceOf` in view/sounds.js picks a fitting
    sound.
- **New world**: a `WORLDS` entry (colours, `dark`, `light`, `terrain` options
  for mapgen, decor, ambience, enemies, bosses). Floors go in threes
  (`FLOORS_PER_WORLD`; the third is the boss floor). Its look comes from
  terrain.js and lighting.
- **Anything that changes how a player moves, swaps or fires**: change the
  sim *and* make predict.js run the same code. Share the function:
  predict.js imports `movePlayer`, `switchSlot`, `trigger`, `coolDown` and
  `extraFor`. Add any new hand or body state to the `Y` row and to
  predict.js `correct()`.
- **Player state other players need to see**: add it to `encodePlayer` in
  protocol.js. If it is usually some default value, add that to `RESTING`;
  if it rarely changes, add it to `STATIC`.
- **New event**:
  1. `emit(state, "name", {x, y, ...})` in the sim.
  2. A `case` in effects.js `handle`, or in render.js `handle` if it needs
     the state.
  3. Add it to `GLOBAL` if far-away players must get it.
  4. To make it heard: a sound in `SOUNDS` in view/sounds.js, a `case` in
     its `events`, and a `LOUDNESS` entry.
- **New prop**: `addProp(state, kind, x, y, extra)`. Add new fields to the
  `O:` rows in protocol.js, draw it in render.js `drawProp`, and make it
  usable through `nearestProp`/`interact` in sim.js.
- **Keys**:
  - Game actions go in input.js `ACTIONS` (they become intent flags such as
    fire, dash, swap and interact), and also in the `IDLE` intent in sim.js.
  - The button bits are defined in host.js (`FIRE`, `DASH`, `SWAP`,
    `INTERACT`), packed in client.js and unpacked in host.js.
  - UI-only keys go in anecrawler.js `onKey`.
- **HUD**: hud.js `draw` (screen space). The renderer exposes what
  anecrawler.js needs, for example `toggleMap`.
- **Settings**: ui/settings.js (saved in localStorage as
  `anecrawler-settings`, separate from the exported save).

## Testing (dev/)

```
node dev/check.mjs [folder]                parse + imports, whole site (seconds)
node dev/anecrawler/smoke.mjs [floors bosses rules weapons net]   a few seconds, no browser
node dev/anecrawler/browser.mjs            headless Chromium: solo run, sound, settings,
                                           M map, co-op join; starts dev/serve.mjs itself;
                                           pictures go to /tmp/anecrawler-shots
node dev/serve.mjs                         the site on http://localhost:8765/?dev and the
                                           game server on ws://localhost:8787/ws
node dev/saves.mjs                         saves of AneFK, AneTD, AneCrawler: codes and stored
                                           saves round trip, stay short, refuse edits (a second)
node dev/brainstorm/godot.mjs export       re-export 午後激盪 into games/brainstorm
                                           (needs Godot 4.7.2 + its web export templates)
node dev/brainstorm/godot.mjs server       午後激盪's server on ws://localhost:24242, used
                                           by the game when the site is on localhost
```

- Run check + smoke after every change, and browser.mjs when drawing or UI
  changed. browser.mjs needs Playwright (`npm i -D playwright` then
  `npx playwright install chromium`). Look at as few pictures as you can.
- Add a check to smoke.mjs for every bug fixed and every new mechanic.
- Helpers in `dev/anecrawler/kit.mjs`:
  - `game({floor, players, quiet, alive, loadout})` returns `g` with
    `step(n, intents)`, `take()`, `count(type)`,
    `spawn(type, x, y, {asleep})`, `kill(e)`, `clear()`, `makeBoss(id)`,
    `spot(from, {sight})` and `openWay(from)`.
  - `link({delay, jitter, host, guest})` gives a host and a guest over a
    fake wire, with `start(floor)`, `frame(guestIntent, hostIntent)`,
    `frames(n, ...)`, `mine` and `mineOnHost`.
- Helpers in `dev/anecrawler/browser.mjs`: `launch`, `serve`, `open`, `aim`,
  `start`, `coop`, `startTogether`, `fps` and `shot`.

## Pitfalls already met

- `node --check file.js` can pass a broken file here, because there is no
  package.json at the top. Use `dev/check.mjs` (`--input-type=module`).
- Keys only reach the game while the mouse is over it, and part of the
  canvas is covered by the page. In browser tests use `aim(tab)` after
  anything that changes the layout. Screenshots come out black when the
  mouse is elsewhere.
- Run only one `node server.js` at a time.
- In sim tests:
  - Slimes split and skeletons get up again: use `g.kill(e)` (final).
  - Two-player trips need a vote; kit `game()` handles it.
  - Exit portals stay sealed while an enemy in their sight is within 300 px.
  - A teleported body can land in rock: use `g.spot()`. To walk somewhere,
    use `openWay()`: a centre-line ray misses corners at the body's edge.
- Boss floors pick their boss by rng: use `g.makeBoss(id)`. Their home
  floors are warden/lich 3, queen 6, eclipse 9, forgeheart 12.
- Measure before optimizing. The idle page sits about 99% idle, and the sim
  takes about 0.5 ms a frame even with 200 enemies. The one known slow spot
  left is the first load: the page waits for all 92 files (about 1.6 s on a
  60 ms connection) before showing any game.
