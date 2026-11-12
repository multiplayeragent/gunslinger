# Gunslinger

Gunslinger is a first-person browser combat game with a procedural harbor, detailed weapons, synthesized audio, and a complete mission loop.

Run `npm start`, then open http://localhost:8080. Requires a desktop browser with WebGL 2. No package install or build is required. Google Fonts is optional; system fallbacks work offline.

## Combat changes

- Swept projectiles with travel time, gravity, range limits, damage falloff, and collision against moving targets and cover. Rifle rounds travel at 820 m/s, pistol rounds at 360 m/s, enemy rounds at 620 m/s. Cover stops rounds; there is no penetration simulation yet.
- Rifle defaults to automatic fire at 720 RPM. Hold **LMB** for sustained fire; **V** switches semi / auto. **F** is melee; **V** no longer shares that binding. **Q** swaps sidearm; **R** reloads. A compact ammunition count is visible in the HUD.
- Health does not regenerate. Hold **B** while stationary for three seconds to use one of two dressings (+35 health). Incoming damage interrupts treatment. Critical injuries slow walking.
- Sprinting drains endurance; resting or crouching restores it. Exhaustion increases shot instability. Near misses suppress the player and disturb aim.
- Hold **Alt** while aiming to steady breath for a limited time. Breathing recovers when released.
- **WASD** move, mouse look, **LMB** fire, **RMB** aim, **Shift** sprint, **C/Ctrl** crouch, **E** interact, **Esc** pause. The inherited controller/touch support works for base controls; new realism controls currently require a keyboard.

Cut three uplinks and extract, or choose the inherited holdout mode. Settings retain graphics, sensitivity, audio, and difficulty controls. Difficulty changes preserve the realism movement/health rules.

## Source

`src/ballistics.js` is the renderer independent projectile solver. `src/gunslinger.js` owns the new combat rules and HUD. `src/gunslinger.css` owns the HUD treatment. `src/visuals.js` controls renderer tuning, the local concrete texture and persistent impact marks. `vendor/gunslinger-engine.js` is the supplied bundled engine, extracted with minimal integration changes. It is not hand maintained game source. `index.html` hosts the game and retains the base UI styles.

`npm test` checks flight, gravity, thin cover collision, damage, range, pause/reset, fire selection, exhaustion, dressing use, and regeneration rules. `npm run check` validates syntax.

## Provenance and limits

The supplied prototype credits Felix for improvements to a Claude generated game. Its renderer, procedural meshes, materials, animations, and audio are reused here. The original prototype HTML and embedded legacy snapshot are not included in this repository.

This build advances combat mechanics; it is not yet a photorealistic production game. Characters remain the prototype's machines, geometry is procedural, hit volumes are approximations, and there are no imported scanned environments, human animation sets, wound simulation, armor penetration, or network play. Those require an art/animation and simulation production pass.

## Validation status

Syntax checks and eleven automated tests pass, including the actual bundled weapon implementation: sustained 720 RPM fire at 60 and 20 FPS, semi trigger edges, selector changes, reloads, and sidearm behavior. Ground shader integration and renderer tuning targets are checked without a GPU. Live WebGL rendering and audio still need browser verification; browser automation fails during navigation. The local server runs on port 8080.

## Visual revision

Neutral daylight replaces the strong orange sky/sun palette. Exposure, haze, bloom and optical effects now use the renderer's actual `tune` interface (the first version mistakenly wrote these to transient `post` state). Rain and wetness are reduced. A local generated concrete albedo adds fine surface detail while retaining ground markings and wet reflections. World impacts leave a bounded pool of 96 surface marks.

`assets/materials/dock-concrete-albedo.png` was generated with the imagegen skill for this project, rather than downloaded from a scanned-material library. It is a base-color texture, not a full scanned PBR material set. Geometry and enemies are still inherited from the prototype; this revision does not meet a hyperrealistic art target.
