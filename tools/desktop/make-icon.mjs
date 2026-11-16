// Draws tools/desktop/icon.ico, the desktop app's icon: a sight ring on a dark plate. Run once, by hand, when the
// drawing below changes (needs `sharp`, like tools/build-host.mjs):  node tools/desktop/make-icon.mjs
// The .ico holds 16 to 128 px as 32-bit bitmaps and 256 px as a PNG, which is what Windows expects.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const sharp = createRequire(import.meta.url)('sharp');
const here = dirname(fileURLToPath(import.meta.url));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2228"/><stop offset="1" stop-color="#0a0d10"/></linearGradient>
    <linearGradient id="brass" gradientUnits="userSpaceOnUse" x1="40" y1="40" x2="216" y2="216"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#d98a1f"/></linearGradient>
  </defs>
  <rect x="8" y="8" width="240" height="240" rx="52" fill="url(#plate)" stroke="#2c363e" stroke-width="4"/>
  <circle cx="128" cy="128" r="78" fill="none" stroke="url(#brass)" stroke-width="18"/>
  <g stroke="url(#brass)" stroke-width="16" stroke-linecap="round">
    <line x1="128" y1="26" x2="128" y2="74"/><line x1="128" y1="182" x2="128" y2="230"/>
    <line x1="26" y1="128" x2="74" y2="128"/><line x1="182" y1="128" x2="230" y2="128"/>
  </g>
  <circle cx="128" cy="128" r="15" fill="#ff5a3c"/>
</svg>`;

const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = [];
for (const size of sizes) {
  const img = sharp(Buffer.from(svg), { density: 72 * Math.max(1, size / 64) }).resize(size, size);
  if (size === 256) { images.push(await img.png({ compressionLevel: 9 }).toBuffer()); continue; }
  const rgba = await img.ensureAlpha().raw().toBuffer();
  const head = Buffer.alloc(40);
  head.writeUInt32LE(40, 0); head.writeInt32LE(size, 4); head.writeInt32LE(size * 2, 8);       // height counts the mask too
  head.writeUInt16LE(1, 12); head.writeUInt16LE(32, 14); head.writeUInt32LE(size * size * 4, 20);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {                              // bottom-up, BGRA
    const s = ((size - 1 - y) * size + x) * 4, d = (y * size + x) * 4;
    pixels[d] = rgba[s + 2]; pixels[d + 1] = rgba[s + 1]; pixels[d + 2] = rgba[s]; pixels[d + 3] = rgba[s + 3];
  }
  const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);                                  // all zero: the alpha channel decides
  images.push(Buffer.concat([head, pixels, mask]));
}
const dir = Buffer.alloc(6 + 16 * sizes.length);
dir.writeUInt16LE(1, 2); dir.writeUInt16LE(sizes.length, 4);
let offset = dir.length;
sizes.forEach((size, i) => {
  const e = 6 + 16 * i;
  dir[e] = size === 256 ? 0 : size; dir[e + 1] = size === 256 ? 0 : size;
  dir.writeUInt16LE(1, e + 4); dir.writeUInt16LE(32, e + 6); dir.writeUInt32LE(images[i].length, e + 8); dir.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
writeFileSync(join(here, 'icon.ico'), Buffer.concat([dir, ...images]));
if (process.argv[2]) writeFileSync(process.argv[2], images[images.length - 1]);            // a PNG to look at
console.log(`icon.ico: ${sizes.join(', ')} px, ${offset} bytes`);
