// Makes assets/ui/weapons.webp: the weapon silhouettes of the HUD's gun panel, two to a row, in the order of ORDER
// (src/gunslinger.js reads the same order: keep them in step).
//
//   node tools/hud-icons/build.mjs <folder with carbine.png, pdw.png, ...>     (needs `sharp`, found through NODE_PATH)
//
// Where the pictures come from: each weapon is drawn by the game itself, side on (an orthographic camera on the
// viewmodel layer, the arms hidden, black behind), and that render is handed to the image tool of a signed-in
// Codex CLI (tools/zombie-art/generate.mjs runs the jobs) with:
//   "Edit the attached image into a video-game HUD weapon icon. Keep the firearm outline, proportions, position and
//    orientation exactly as they are (muzzle pointing right). Fill the whole weapon solid off-white (#EDE7DA) with a
//    few thin dark interior lines that separate its main parts. Flat 2D graphic: no shading, no gradients, no glow,
//    no perspective. Pure black background. No text, no border, no hands, nothing else in the picture."
// So the outline is the game's own model and the drawing is generated. The 1536x1024 originals are not kept in the
// repository; this sheet is. Here the black becomes transparency (brightness is the alpha), each is trimmed and
// set in a 512x192 cell, the pistols smaller than the long guns.
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';

const sharp = createRequire(import.meta.url)('sharp');
const ORDER = ['carbine', 'pdw', 'breacher', 'marksman', 'support', 'pump', 'flak', 'rocket', 'sidearm', 'heavy'];
const SMALL = { sidearm: 0.46, heavy: 0.5 };
const CW = 512, CH = 192, COLS = 2;
const src = resolve(process.argv[2] || '.'), root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const cells = [];
for (let i = 0; i < ORDER.length; i++) {
  const id = ORDER[i], file = join(src, id + '.png');
  if (!existsSync(file)) throw new Error('missing ' + file);
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  // brightness is the alpha; the colour is one bone white
  const rgba = Buffer.alloc(info.width * info.height * 4);
  let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  for (let p = 0; p < info.width * info.height; p++) {
    const a = Math.max(0, Math.min(255, Math.round((data[p] - 36) * 255 / 150)));
    rgba[p * 4] = 237; rgba[p * 4 + 1] = 231; rgba[p * 4 + 2] = 218; rgba[p * 4 + 3] = a;
    if (a > 40) { const x = p % info.width, y = (p / info.width) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 <= x0 || y1 <= y0) throw new Error(id + ': nothing drawn');
  const k = SMALL[id] || 0.96;
  const cut = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .resize({ width: Math.round(CW * k), height: Math.round(CH * 0.92), fit: 'inside' }).png().toBuffer();
  const m = await sharp(cut).metadata();
  cells.push({ input: cut, left: (i % COLS) * CW + Math.round((CW - m.width) / 2), top: Math.floor(i / COLS) * CH + Math.round((CH - m.height) / 2) });
  console.log(id.padEnd(10), m.width + 'x' + m.height);
}
const out = join(root, 'assets', 'ui'); mkdirSync(out, { recursive: true });
await sharp({ create: { width: CW * COLS, height: CH * Math.ceil(ORDER.length / COLS), channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(cells).webp({ quality: 88, alphaQuality: 92, effort: 5 }).toFile(join(out, 'weapons.webp'));
console.log('assets/ui/weapons.webp');
