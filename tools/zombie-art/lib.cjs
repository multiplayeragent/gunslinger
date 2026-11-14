// Shared by the zombie art tools: loads the body builder outside the browser and draws triangles without a GPU.
// Needs the `sharp` package for reading and writing images (npm install --no-save sharp).
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');

function loadFigure() {
  const noop = () => {};
  const el = () => ({ style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop }, getContext: () => new Proxy({}, { get: () => noop }), addEventListener: noop, setAttribute: noop, appendChild: noop, querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ width: 1280, height: 720 }), width: 1, height: 1, textContent: '' });
  const window = { addEventListener: noop };
  const context = vm.createContext({ window, document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => el(), createElement: el, createElementNS: el, addEventListener: noop, documentElement: el(), body: el() },
    console: { log: noop, warn: noop, error: console.error }, AbortController, performance, URLSearchParams, URL, location: { search: '', hash: '', href: 'http://localhost/' }, navigator: { userAgent: 'tool' },
    localStorage: { getItem: () => null, setItem: noop }, addEventListener: noop, setTimeout: noop, requestAnimationFrame: noop, Image: class {}, Math, Float32Array, Uint8Array, Uint16Array, Int32Array });
  const engine = fs.readFileSync(path.join(ROOT, 'vendor/gunslinger-engine.js'), 'utf8').replace('cL().catch(n=>yT(n&&n.stack||n));', 'window.testEngine={THREE:ut};');
  vm.runInContext(engine, context);
  window.Vigil = { THREE: window.testEngine.THREE };
  for (const f of ['kit', 'figure']) vm.runInContext(fs.readFileSync(path.join(ROOT, `src/vigil/${f}.js`), 'utf8'), context, { filename: f });
  return { T: window.testEngine.THREE, V: window.Vigil };
}

// Draws triangles into a w × h target. tri(i) -> three screen points [x, y, depth]; larger depth is nearer.
// shade(i, b0, b1, b2, px, py) -> [r, g, b, a] or null. Returns the RGBA buffer.
function raster(w, h, count, tri, shade, bg = [0, 0, 0, 0]) {
  const out = new Float32Array(w * h * 4), zb = new Float32Array(w * h).fill(-Infinity);
  for (let i = 0; i < w * h; i++) { out[i * 4] = bg[0]; out[i * 4 + 1] = bg[1]; out[i * 4 + 2] = bg[2]; out[i * 4 + 3] = bg[3]; }
  for (let t = 0; t < count; t++) {
    const p = tri(t); if (!p) continue;
    const [a, b, c] = p;
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area, w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area, w2 = 1 - w0 - w1;
      if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
      const z = a[2] * w0 + b[2] * w1 + c[2] * w2, k = y * w + x;
      if (z <= zb[k]) continue;
      const col = shade(t, w0, w1, w2, px, py);
      if (!col) continue;
      zb[k] = z; out[k * 4] = col[0]; out[k * 4 + 1] = col[1]; out[k * 4 + 2] = col[2]; out[k * 4 + 3] = col[3];
    }
  }
  return out;
}

const toBytes = (f) => { const b = Buffer.alloc(f.length); for (let i = 0; i < f.length; i++) b[i] = Math.max(0, Math.min(255, Math.round(f[i] * 255))); return b; };
async function savePng(file, f, w, h, resize) {
  const sharp = require('sharp');
  let img = sharp(toBytes(f), { raw: { width: w, height: h, channels: 4 } });
  if (resize) img = img.resize(resize[0], resize[1], { kernel: 'lanczos3' });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await img.png().toFile(file);
}
async function loadImage(file, w, h) {
  const sharp = require('sharp');
  let img = sharp(file).ensureAlpha();
  if (w) img = img.resize(w, h, { fit: 'fill', kernel: 'lanczos3' });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

// The views the artwork is painted in, per body: where a posed point lands in each image.
// A view: { w, h, scale, cx, cy, flip } with x = w/2 + flip * (X - cx) * scale, y = h/2 - (Y - cy) * scale.
function views(F, geo, P) {
  const tubes = geo.userData.bake.tubes, tube = geo.userData.bake.tube, n = P.length / 3;
  const box = (pick) => { const b = [1e9, 1e9, -1e9, -1e9]; for (let i = 0; i < n; i++) { if (!pick(tubes[tube[i]])) continue; b[0] = Math.min(b[0], P[i * 3]); b[1] = Math.min(b[1], P[i * 3 + 1]); b[2] = Math.max(b[2], P[i * 3]); b[3] = Math.max(b[3], P[i * 3 + 1]); } return b; };
  const fit = (b, w, h, margin) => ({ w, h, scale: Math.min(w / ((b[2] - b[0]) * (1 + margin)), h / ((b[3] - b[1]) * (1 + margin))), cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2 });
  const body = fit(box(() => true), 1024, 1536, 0.07), head = fit(box((t) => t.group === 'head'), 1024, 1024, 0.3);
  return { bodyFront: { ...body, flip: 1 }, bodyBack: { ...body, flip: -1 }, headFront: { ...head, flip: 1 }, headBack: { ...head, flip: -1 } };
}
const project = (v, X, Y) => [v.w / 2 + v.flip * (X - v.cx) * v.scale, v.h / 2 - (Y - v.cy) * v.scale];

module.exports = { ROOT, loadFigure, raster, savePng, loadImage, views, project, toBytes };
