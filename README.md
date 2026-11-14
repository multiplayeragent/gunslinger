# Gunslinger

Gunslinger is a first-person browser combat game with two maps, picked on the title screen:

- **Harbor** — a container terminal at first light. Modes: Mission (cut three uplinks and extract) and Holdout (endless waves of machines).
- **Churchyard** — a ruined church, its graveyard and the pine forest around it, at night in the rain. Mode: Crystal Vigil (wave defense against the dead).

Run `npm start`, then open http://localhost:8080. It needs Node 18 or newer (for the small local server and the tests) and a desktop browser with WebGL 2. There is nothing to install or build. Google Fonts is optional; system fallbacks work offline.

Hosted copy: https://gunslinger.play.multiplayeragent.com/ (the Harbor by default; add `?room=OPEN` to land in the Churchyard's open co-op room).

Changing the map on the title screen reloads the page, because a map is a whole world: level, sky, ground and enemies. The choice is remembered, and `?map=harbor` or `?map=vigil` in the address selects one directly.

## Crystal Vigil

You defend a crystal on the dais of a ruined church. The dead come out of the forest through the four gates and four collapsed stretches of the graveyard wall, and from wave 3 some climb out of the graves. You lose when the crystal breaks.

- **Classes** (picked on the title screen). Soldier: carbine, +15% damage, Adrenaline. Medic: fast CQB kit, health regeneration, Sanctify. Engineer: buckshot kit, cheaper and stronger defenses, a free turret, Overclock. Scout: marksman kit, faster, stronger headshots, Flare Shot.
- **Money.** Every kill pays, headshots pay more, and clearing a wave pays a bonus. Kills by guards and turrets pay 60%.
- **Armory (B).** Rifle kits and ammunition; grenades, flares, medkits, mines, armor, crystal repair and respawns; ability upgrades and passive perks; guards, turrets and floodlights. The fight pauses while it is open. Defenses are set down after you close it: aim, left click to place, right click to cancel for a refund.
- **Going down.** You start with one respawn. Without one you watch from above until the wave ends, so the guards and turrets have to hold.
- **The dead.** Walkers, runners, acid-spitters, brutes, and an abomination every fifth wave. Zombies you shoot come after you; the rest go for the crystal.
- **Limbs.** Arms and legs have their own health. Enough damage takes one off at the elbow, knee, shoulder or hip, and a grenade or mine can take several. A zombie that loses a leg drops and drags itself on by its arms, slower and lower; one that loses its arms bites; one with neither writhes for a few seconds and dies. Brutes can be crippled the same way. The abomination cannot be brought down by its legs.
- **Bodies.** The dead fall as ragdolls from whatever pose they were in, pushed by what killed them, and lie where they land for a while. A blast throws bodies and severed limbs that are already down.
- **Breaking things.** Gravestones, crosses, urns, the font, pews, chairs, the pulpit, benches, crates and casks break. Stone chips where it is hit, then snaps and leaves a stump low enough to step over; timber splits into lengths. Explosions break what is near them, and brutes smash what stands in their way. Everything is whole again on a new run.
- **Stacking waves.** Enter starts the next wave at once. Pressed during a wave it adds the next one on top, as many times as you like: five presses on wave 1 puts waves 1 to 5 in play together. The round ends when the last zombie of all of them is down, and each extra wave cleared in the same round adds 15% to the bonus.

### Playing together

Crystal Vigil can be played by up to four people at once, through [Multiplayer Agent](https://multiplayeragent.com). On the title screen set **Squad** to **Co-op**: the game joins a room straight away and lists who else is in it. **Copy invite** gives a link that opens the same room on someone else's machine; **New room** makes a private one. Anyone can begin; later arrivals drop into the run in progress with extra cash to catch up.

- The waves, the crystal, the dead, what is broken and what has been placed are shared. Money, kit, perks, items and respawns are each player's own.
- A kill pays whoever made it (a turret's or guard's kill pays whoever placed it); clearing a wave pays everyone. Each extra player adds 60% more zombies to a wave.
- Nothing pauses. In the armory or the pause menu you are out of the fight: the dead ignore you and cannot hurt you, and the wave carries on.
- If the crystal falls, anyone's restart begins a new run for the room.
- The best wave you have cleared goes on a leaderboard, shown on the title screen.

Without a key (see `mp.config.js`) or a connection, the Squad row stays on Solo and the game is exactly the single-player one. The Harbor is single-player only.

| Key | Action |
| --- | --- |
| W A S D, mouse | Move, look |
| LMB / RMB | Fire (or place a defense) / aim (or cancel placing) |
| R, Q, 1, 2 | Reload, swap sidearm, rifle, pistol |
| 3 – 7 | Rifle kits you own: carbine, CQB, buckshot, marksman, belt-fed |
| B | Armory |
| E | Class ability |
| Z, X | Shockwave and Crystal Aegis, once bought |
| G / T / H / N | Grenade / flare / medkit / mine |
| F | Flashlight |
| V | Melee |
| Enter | Call the next wave now; during a wave, add another on top |
| Shift, C or Ctrl, Space, Alt | Sprint, crouch, jump, steady aim |
| Esc | Pause |

The rifle is one weapon with five kits rather than five gun models: a kit changes damage, rate of fire, magazine, spread, pellets and penetration, and keeps its own ammunition.

Debug address parameters: `&wave=5` starts at a later wave, `&money=5000` adds starting cash, `&q=low|medium|high|ultra` sets graphics quality.

## Harbor

- Swept projectiles with travel time, gravity, range limits, damage falloff, and collision against moving targets and cover. Rifle rounds travel at 820 m/s, pistol rounds at 360 m/s, enemy rounds at 620 m/s. Cover stops rounds; there is no penetration simulation on this map.
- Rifle defaults to automatic fire at 720 RPM. Hold **LMB** for sustained fire; **V** switches semi / auto. **F** is melee. **Q** swaps sidearm; **R** reloads.
- Health does not regenerate. Hold **B** while stationary for three seconds to use one of two dressings (+35 health). Incoming damage interrupts treatment. Critical injuries slow walking.
- Sprinting drains endurance; resting or crouching restores it. Exhaustion increases shot instability. Near misses suppress the player and disturb aim.
- Hold **Alt** while aiming to steady breath for a limited time.
- **E** cuts a relay. Cut three uplinks and extract, or choose Holdout.

Projectile flight, endurance and steady aim apply on both maps. Controller and touch support covers the base controls; the realism controls and Crystal Vigil's extra keys need a keyboard.

## Source

```
index.html              page and base UI styles
src/maps.js             map registry and selection (decided at load, before the engine parses)
src/menu.js             map, mode and class pickers on the title screen
src/ballistics.js       renderer-independent projectile solver
src/gunslinger.js       combat rules and HUD shared by both maps
src/visuals.js          harbor renderer tuning, concrete texture, impact marks
src/vigil/map.js        registers the churchyard: night sky, moon, world size, key bindings
src/vigil/kit.js        geometry kit: walls with arched openings, bevelled blocks, world-space UVs, merging
src/vigil/materials.js  scanned PBR sets run through the engine's wet-surface shader
src/vigil/church.js     the church: shell, tracery, buttresses, tower, roof, trusses, furnishings
src/vigil/yard.js       perimeter wall, gates, graves, mausoleums, dead trees, lanterns
src/vigil/forest.js     instanced pines, boulders, logs; the hills beyond the map
src/vigil/ground.js     terrain, mud / leaf / path blending, puddles, grass, rain, lightning
src/vigil/lighting.js   candles, lanterns, the crystal's light, flashlight and floodlight beams
src/vigil/crystal.js    the crystal
src/vigil/figure.js     bodies of the dead and the watchmen: skinned meshes with clothing, one texture atlas each, stumps hidden in every joint
src/vigil/zombies.js    the dead: animation, crawling, limb damage, hit zones, AI, flow-field pathing
src/vigil/ragdoll.js    what a body does when it dies
src/vigil/phys.js       loose rigid bodies (broken stone, split timber, severed limbs) and the collider lookup they use
src/vigil/destruct.js   breakable objects: cutting real geometry with planes, chips, stumps, rubble
src/vigil/defenses.js   guards, turrets, floodlights, mines, grenades, flares, placement
src/vigil/director.js   waves, crystal health, money, classes, kits, perks, going down
src/vigil/ui.js         Crystal Vigil HUD and the armory
src/vigil/audio.js      synthesised sounds for the churchyard
src/vigil/net.js        playing together: the room, who hosts, what is sent, the other players' bodies
mp.config.js            Multiplayer Agent endpoints and a placeholder key; the real key goes in mp.config.local.js (not committed)
vendor/gunslinger-engine.js   the bundled engine (renderer, weapons, hands, player, audio, harbor level)
tools/serve.mjs         local static server
tools/check.mjs         syntax check for every script
tools/build-host.mjs    makes dist/, the hosted build: one app.js, textures re-encoded as WebP (28 MB down to 9)
tools/zombie-art/       how the body textures are made (see below), with the source artwork
assets/zombies/         one painted atlas per body
assets/textures/        CC0 PBR textures from Poly Haven (see CREDITS.md)
```

`vendor/gunslinger-engine.js` is the supplied bundled engine. It is not hand-maintained game source; it carries a small number of integration changes, listed below.

### How a map plugs into the engine

A map is an object in `window.GunslingerMaps`. If it sets `engine: true`, `src/maps.js` makes it `window.GunslingerMap` before the engine script is parsed, and the engine consults it at ten places:

1. `configure(internals)` runs once, before boot, with the engine's own tables: world bounds, sun and sky colours, texture and material definitions, the sound table, key bindings, the rain factory, holdout tuning, and `setNav` to resize the navigation grid.
2. `createLevel`, `createBackdrop`, `createGround` and `createEnemies` replace the harbor's builders.
3. `skyFragment()` and `horizonGLSL` replace the sky shader and the horizon colour the fog uses.
4. `shadowBounds` sets the area the shadow map covers.
5. `bootText` renames the loading messages.

With no map selected none of these run and the engine behaves exactly as before. `tests/vigil.test.cjs` checks both cases.

### How co-op works

There is no game server. A Multiplayer Agent room relays state and events between the browsers in it, and one of them, the host, runs the game for the rest:

- **Each player** writes only their own entry in the room: position, aim, health, class, a few flags. The others draw a watchman's body there, with a rifle and a name.
- **The host** thinks for the dead, counts the waves, keeps the crystal and aims the guards and turrets. Ten times a second it writes every zombie on its feet into one string of room state, twelve characters each (id, kind, position to 3 cm, heading, limbs, health); four times a second the wave and crystal state; twice a second what has been placed and what is broken.
- **Everyone else** slides each zombie toward where the host last put it and animates it locally, so limbs, crawling and ragdolls look the same without being sent. Their shots are tested against those bodies on their own machine and sent to the host as hits; the host applies them and announces deaths, with who made the kill and what push the body took.
- **Things that break** are cut from a seed the host sends, so every machine breaks them along the same planes and their colliders match.
- **If the host leaves** or stops answering for three and a half seconds, the remaining player with the lowest session id takes over from what it was last shown: the dead keep their positions, health and missing limbs, and the spawn queue is rebuilt from the count the old host last gave.

This trusts the players' machines, which suits a co-op game against the dead and would not suit a competitive one.

To host a copy: put your own key in `mp.config.local.js` (`window.MP_CONFIG.key = 'pk_live_…';`), run `node tools/build-host.mjs` (it wants `sharp` for the textures), and publish the files in `dist/` to the game with Multiplayer Agent's `publish_game` (large files go through `create_upload` first; `dist/files.json` lists every path with its size).

## How the bodies are painted

The dead and the watchmen are meshes built in code (`src/vigil/figure.js`) and painted from generated artwork. `tools/zombie-art` does it in three steps:

1. `mannequin.cjs` draws each body as a plain grey figure on a magenta background: whole body and head, front and back, in the pose the mesh is painted in.
2. `generate.mjs` hands those pictures to an image generator with the descriptions in `prompts.cjs` and asks it to paint the character over the grey figure without moving anything. The pictures in `tools/zombie-art/art` are what came back; `concept/` holds the two concept sheets the designs were settled on first.
3. `bake.cjs` keys out the magenta, projects the front and back pictures onto the posed mesh (the head from its own close-ups), wraps them a little way round the sides, cuts tattered hems from what was painted, and writes one 2048 × 1024 atlas per body into `assets/zombies`.

Steps 1 and 3 need Node and the `sharp` package (`npm install --no-save sharp`). Step 2 uses the image tool of a signed-in Codex CLI; any image generator that can paint over a reference picture would do. If a body's shape changes in `figure.js`, repeat all three steps for that body, because the artwork is fitted to the mesh.

## Tests

`npm test` runs twenty-two tests: projectile flight, gravity, thin-cover collision, damage and range; pause, reset, fire selection, exhaustion, dressings and regeneration; the bundled weapon at 60 and 20 FPS; the harbor's ground shader and renderer tuning; map selection and the engine hooks; wave composition; the geometry kit; every body (valid skinning, an atlas with no overlaps, limbs that separate); cutting a solid (both halves closed, volume kept); breaking stone and timber and restoring them; loose bodies coming to rest; a ragdoll falling without stretching; the packed format zombies are sent in; and every synthesised churchyard sound. `npm run check` validates syntax.

## Provenance and limits

The supplied prototype credits Felix for improvements to a Claude generated game. Its renderer, procedural meshes, materials, animations and audio are reused here. The original prototype HTML and embedded legacy snapshot are not included in this repository.

Crystal Vigil's rules (classes, waves, prices, zombie types, defenses) come from the Crystal Vigil prototype. Its level and models were rebuilt for this engine rather than copied: the church, graveyard, forest, zombies, guards and turrets here are new geometry. Severed limbs, crawling, ragdolls, breakable objects, stacked waves and co-op are additions; the prototype had none of them.

Limits to know about:

- The churchyard downloads about 20 MB of textures; the harbor downloads one.
- The dead and the watchmen are meshes built in code and painted from generated artwork, not sculpted or scanned characters. The paint is projected from a front and a back picture, so detail is softer on the sides of a body than on its front. There is no facial animation beyond the jaw.
- Ragdolls and broken pieces collide with the ground and the level's colliders, not with each other, the player or the living dead. Pieces of a broken object that come to rest become scenery: you can walk through them.
- Stumps are the only thing left standing of a broken stone; a stump cannot be broken further.
- The churchyard is flat where you can walk; the engine's physics is boxes on a level floor.
- Only a few real lights exist at once. They follow the flames nearest the camera, so a distant lantern shows its glow but lights nothing until you approach.
- On the harbor, characters remain the prototype's machines and there is no armor penetration. The harbor has no network play.
- Co-op runs on one player's machine. If that browser tab is hidden its game stops and the room waits about four seconds before another player takes over. Hits are decided on the shooter's machine, so they land where you aimed even with lag, and a cheating client would be believed. Other players do not block shots, and nobody can be revived by a teammate: going down works as it does alone.
- Pieces thrown from a broken object fly differently on each machine; where the object was cut, and its collider afterwards, are the same.

## Validation status

Automated: syntax checks and twenty-two tests pass.

In headless Chrome with a real GPU, both maps boot without errors and were driven by script: the title screen and pickers on each map; a Crystal Vigil run with rifle fire, kills paying out, going down and respawning, the armory, placing a guard and a turret that then killed zombies, and the crystal breaking into the defeat card; and five waves stacked from wave 1, with 63 zombies on their feet at once, at 56 to 59 frames a second at 1280×720. Also driven by script and checked in screenshots: every body in the nave; arms and legs severed at each joint, with the stumps and the loose limbs; legless zombies crawling; bodies falling as ragdolls and being thrown by a blast; a gravestone chipped twice and then snapped to a stump; pews shot to pieces with the rifle; and a watchman placed through the armory's placement flow.

Co-op was driven by script in two separate browser sessions, locally and on the hosted copy: both joining one room from an invite link; one hosting and the other following; a wave started by either; the follower's shots killing the host's zombies and being paid for it; a zombie and a brute attacking the follower and taking its health; the follower's explosion and turret placement; a pew broken on one machine breaking on the other; the crystal falling and a restart from the follower; the host closing its tab and the follower carrying the wave on; and the leaderboard taking a score.

Not verified in co-op: more than two players at once, real people on different networks (latency and packet loss), and a host whose tab is merely hidden rather than closed.

Not verified: sound by ear (including the new tearing, stone and timber sounds), a person playing with the mouse captured, how the crawl and the ragdolls read in motion rather than in stills, touch and controller on the churchyard, and other GPUs or browsers.
