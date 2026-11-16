# Credits

## Textures

Every texture in `assets/textures/` comes from [Poly Haven](https://polyhaven.com) and is released under [CC0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain). Each folder is named after the Poly Haven asset and holds its 1k diffuse, OpenGL normal and AO/roughness/metal maps:

- `medieval_blocks_02` (church and graveyard walls)
- `mossy_rock` (dressed stone, headstones, boulders)
- `slate_floor_02` (church floor, paving)
- `roof_slates_02` (roofs)
- `dark_wooden_planks` (doors, pews, beams, crates)
- `pine_bark` (tree trunks)
- `forest_leaves_03` (forest floor)
- `brown_mud_leaves_01` (graveyard ground, sandbags, cloth detail)

`assets/materials/dock-concrete-albedo.png` was generated for this project.

## Character artwork

The textures of the dead and the watchmen (`assets/zombies/`, sources in `tools/zombie-art/art/`) and the concept sheets in `tools/zombie-art/concept/` were generated for this project with OpenAI's image model, painted over renders of the game's own meshes. They depict no real person.

## Soldiers and their outfits

`vendor/warbash-soldier.js` is the soldier code of **War Bash** (skeleton, body, equipment, the outfit atlas, hands,
thirty outfits, simulated cloth and the procedural pose), assembled by `tools/soldier/import.mjs`. War Bash is a fork
of **Riposte: Frontline** by BenDBSS (https://github.com/BenDBSS/Riposte-Frontline-Source). Both are released under
the MIT License, whose notice is kept here:

> MIT License
>
> Copyright (c) 2026 BenDBSS
> Copyright (c) 2026 War Bash contributors
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
> documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
> rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
> permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of
> the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
> WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
> COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
> OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The same file carries `RoundedBoxGeometry` from the three.js examples (MIT, three.js authors). The two fabric scans in
`assets/soldier/` (a canvas, a knit and a leather: relief, roughness and tone) were made by War Bash from Poly Haven
textures, CC0. War Bash's soldier animations are not included: the soldiers here use its procedural pose. Those
animations are baked from Mixamo (Adobe), whose terms let an account holder use them in a game but not pass the files
on, and the baked copy Riposte: Frontline shipped is its author's, excluded from the MIT License. Clips you bake from
your own Mixamo account can be taken in with `node tools/soldier/import.mjs <War Bash> --anim`.

## Motion capture

`assets/zombies/motion.js`, the gait cycles the Churchyard's dead walk by, is adapted from **The 100STYLE Dataset** by
Ian Mason, Sebastian Starke and Taku Komura ("Real-Time Style Modelling of Human Locomotion via Feature-Wise
Transformations and Local Motion Phases", 2022), <https://www.ianxmason.com/100style/>, archived at
<https://zenodo.org/records/8127870>, licensed under
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

Changes made: single stride cycles and one standing passage were cut from the Zombie (forward walk, forward run,
idle), LimpLeft and DragLeftLeg (forward walk) recordings; the performer's turning was removed; each cycle was closed
into a loop; the rotations were carried over from the dataset's 23-joint skeleton to this game's 18-bone one; the limp
and the dragged leg were also mirrored; all of it was resampled and stored as 16-bit quaternions
(`tools/zombie-motion/build.mjs`). In play the game lengthens the stride and layers its own arm, head and attack
motion over it. The dataset's files themselves are not in this repository.

## Levels and announcements

The level curve, the eleven rank names, the announcement lane (the level-up banner and the unlock line) and the
experience pop-ups follow War Bash's (`src/06r-arsenal.js`, `src/09sa-grades.js`, `src/09s-rankup.js`, `src/09-game.js`
and the matching rules in its `shell.html`), under the MIT notice above. `assets/ui/ranks.webp`, the sheet of eleven
rank badges, is War Bash's `assets/ranks.webp`: its `NOTICE.md` records that the rank insignia were generated for War
Bash with an image model.

## Music

The four cues in `assets/music/` (The Vigil, The Dead Walk, Horde, Abomination) were generated for this game on
2026-11-14 with Suno (model V6 asked for, through the KIE API), instrumental, from written style prompts: a solo pipe
organ, and organ with heavy guitars at three intensities, all in D minor. A loop was cut from one take of each, levelled
to -18 LUFS and encoded by `tools/music/build.mjs`. They are not CC0 and not covered by the MIT notices above. KIE is
not Suno's own API and publishes no terms for what it returns, so what may be done with these files beyond shipping
them in this game's own builds has not been established: do not take them into another project, and replace them
before this repository is published under an open licence.

## HUD weapon silhouettes

`assets/ui/weapons.webp`: ten weapon icons. Each is this game's own weapon model rendered side on by the game, then redrawn as a flat icon by OpenAI's image generation (through the Codex CLI, 2026-11-15) with the outline kept; `tools/hud-icons/build.mjs` records the prompt and packs the sheet. The outlines are this project's models; the redrawing is machine-generated.

## Everything else

Models, the rest of the animation, sound effects and the remaining textures are generated in code.
