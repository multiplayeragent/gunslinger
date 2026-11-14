// Paints each zombie's texture atlas from the artwork: the front and back pictures are projected onto the posed
// body (the head from its own close-ups), wrapped a little way round the sides so nothing streaks, and written
// into the atlas the mesh is unwrapped to.  node bake.cjs <art dir> <out dir> [kind ...]   (--preview dir)
const path = require('node:path');
const fs = require('node:fs');
const { loadFigure, raster, savePng, loadImage, views, project, toBytes } = require('./lib.cjs');

const args = process.argv.slice(2), pv = args.indexOf('--preview'), previewDir = pv >= 0 ? path.resolve(args.splice(pv, 2)[1]) : null;
const art = path.resolve(args[0]), outDir = path.resolve(args[1]);
const { T, V } = loadFigure(), F = V.figure;
const kinds = args.length > 2 ? args.slice(2) : Object.keys(F.LOOKS);
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const noise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v; };

// The picture with its magenta background keyed out and the figure's colours spread outward into it.
async function keyed(file, w, h) {
  const img = await loadImage(file, w, h), n = w * h, col = new Float32Array(n * 3), mask = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = img.data[i * 4] / 255, g = img.data[i * 4 + 1] / 255, b = img.data[i * 4 + 2] / 255;
    const mag = Math.min(r, b) - g;                       // how magenta: the background is ~1, cloth and flesh below 0.1
    mask[i] = 1 - sstep(0.18, 0.42, mag);
    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
  }
  // pull the edge in two pixels so no magenta fringe survives, then push-pull fill outward
  const solid = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 1;
    for (let dy = -2; dy <= 2 && m > 0; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h || mask[yy * w + xx] < 0.9) { m = 0; break; } }
    solid[y * w + x] = m;
  }
  const levels = [{ w, h, c: new Float32Array(n * 3), a: solid }];
  for (let i = 0; i < n; i++) { const a = solid[i]; levels[0].c[i * 3] = col[i * 3] * a; levels[0].c[i * 3 + 1] = col[i * 3 + 1] * a; levels[0].c[i * 3 + 2] = col[i * 3 + 2] * a; }
  while (levels[levels.length - 1].w > 1 || levels[levels.length - 1].h > 1) {
    const p = levels[levels.length - 1], lw = Math.max(1, p.w >> 1), lh = Math.max(1, p.h >> 1), c = new Float32Array(lw * lh * 3), a = new Float32Array(lw * lh);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const xx = Math.min(p.w - 1, x * 2 + dx), yy = Math.min(p.h - 1, y * 2 + dy), k = yy * p.w + xx; sr += p.c[k * 3]; sg += p.c[k * 3 + 1]; sb += p.c[k * 3 + 2]; sa += p.a[k]; }
      const k = y * lw + x; c[k * 3] = sr; c[k * 3 + 1] = sg; c[k * 3 + 2] = sb; a[k] = sa;
    }
    for (let k = 0; k < lw * lh; k++) if (a[k] > 0) { c[k * 3] /= a[k]; c[k * 3 + 1] /= a[k]; c[k * 3 + 2] /= a[k]; a[k] = 1; }
    levels.push({ w: lw, h: lh, c, a });
  }
  for (let l = levels.length - 2; l >= 0; l--) {
    const p = levels[l], q = levels[l + 1];
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const k = y * p.w + x; if (p.a[k] >= 1) continue;
      const j = Math.min(q.h - 1, y >> 1) * q.w + Math.min(q.w - 1, x >> 1), a = p.a[k];
      p.c[k * 3] = p.c[k * 3] + q.c[j * 3] * (1 - a); p.c[k * 3 + 1] = p.c[k * 3 + 1] + q.c[j * 3 + 1] * (1 - a); p.c[k * 3 + 2] = p.c[k * 3 + 2] + q.c[j * 3 + 2] * (1 - a);
    }
  }
  const filled = levels[0].c;
  const at = (arr, ch, x, y, c) => { const x0 = Math.max(0, Math.min(w - 1, Math.floor(x - 0.5))), y0 = Math.max(0, Math.min(h - 1, Math.floor(y - 0.5))), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = Math.max(0, Math.min(1, x - 0.5 - x0)), fy = Math.max(0, Math.min(1, y - 0.5 - y0)); return (arr[(y0 * w + x0) * ch + c] * (1 - fx) + arr[(y0 * w + x1) * ch + c] * fx) * (1 - fy) + (arr[(y1 * w + x0) * ch + c] * (1 - fx) + arr[(y1 * w + x1) * ch + c] * fx) * fy; };
  return { rgb: (x, y) => [at(filled, 3, x, y, 0), at(filled, 3, x, y, 1), at(filled, 3, x, y, 2)], alpha: (x, y) => at(mask, 1, x, y, 0) };
}

const WRAP = 0.42, INSET = 0.93;
(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  for (const kind of kinds) {
    const { geo } = F.build(T, V.kit, kind), S = F.posed(T, geo, F.APOSE), P = S.position, C = S.centre, N = S.normal, ix = geo.index.array, uv = geo.attributes.uv.array;
    const bk = geo.userData.bake, tubes = bk.tubes, tube = bk.tube, W = bk.atlas.w, H = bk.atlas.h, vw = views(F, geo, P);
    const img = {};
    for (const name of Object.keys(vw)) {
      const file = ['png', 'webp'].map((e) => path.join(art, `${kind}-${name}.${e}`)).find((f) => fs.existsSync(f));
      img[name] = file ? await keyed(file, vw[name].w, vw[name].h) : null;
    }
    if (!img.bodyFront) { console.log(kind, 'skipped: no artwork'); continue; }
    if (!img.bodyBack) img.bodyBack = img.bodyFront;
    if (!img.headFront) { img.headFront = img.bodyFront; vw.headFront = vw.bodyFront; }
    if (!img.headBack) { img.headBack = img.bodyBack; vw.headBack = vw.bodyBack; }
    // which end of each tube hangs free
    for (const t of tubes) { const S1 = t.n + 1, a = t.base, b = t.base + (t.rings - 1) * S1; t.hemFirst = P[a * 3 + 1] < P[b * 3 + 1]; }
    const sample = (view, pic, px, py, cx, cy, ro) => {
      const ox = px - cx, oy = py - cy, l = Math.hypot(ox, oy);
      let k = INSET;
      if (ro > 1e-5 && l > 1e-6) { const s = Math.min(1, l / ro), f = (1 - WRAP) * s + WRAP * (1 - 2 * Math.acos(s) / Math.PI); k = (f / s) * INSET; }
      const q = project(view, cx + ox * k, cy + oy * k);
      return [pic.rgb(q[0], q[1]), pic.alpha(q[0], q[1])];
    };
    const atlas = raster(W, H, ix.length / 3, (t) => [0, 1, 2].map((j) => { const i = ix[t * 3 + j]; return [uv[i * 2] * W, (1 - uv[i * 2 + 1]) * H, 0]; }), (t, w0, w1, w2, sx, sy) => {
      const a = ix[t * 3], b = ix[t * 3 + 1], c = ix[t * 3 + 2], tb = tubes[tube[a]], r = tb.rect;
      const mix3 = (arr, o) => arr[a * 3 + o] * w0 + arr[b * 3 + o] * w1 + arr[c * 3 + o] * w2;
      const u = (sx - r.x) / r.w, v = 1 - (sy - r.y) / r.h;
      if (tb.flag === 'dark') return [0.05, 0.012, 0.012, 1];
      if (tb.flag === 'gore') {
        const n = noise(u * 24, v * 9), n2 = noise(u * 70, v * 30);
        if (v > 0.62) { const k = 0.7 + 0.3 * n2; return [0.62 * k, 0.56 * k, 0.44 * k, 1]; }           // bone
        const k = 0.55 + 0.6 * n; return [(0.34 + 0.14 * n2) * k, 0.035 * k, 0.03 * k, 1];                 // meat
      }
      const px = mix3(P, 0), py = mix3(P, 1), cx = mix3(C, 0), cy = mix3(C, 1), cz = mix3(C, 2), pz = mix3(P, 2);
      let nz = mix3(N, 2), nl = Math.hypot(mix3(N, 0), mix3(N, 1), nz) || 1; nz /= nl;
      const ro = Math.hypot(px - cx, py - cy, pz - cz), wf = sstep(-0.22, 0.22, nz), head = tb.group === 'head';
      const [fc, fa] = sample(head ? vw.headFront : vw.bodyFront, head ? img.headFront : img.bodyFront, px, py, cx, cy, ro);
      const [bc, ba] = sample(head ? vw.headBack : vw.bodyBack, head ? img.headBack : img.bodyBack, px, py, cx, cy, ro);
      const col = [fc[0] * wf + bc[0] * (1 - wf), fc[1] * wf + bc[1] * (1 - wf), fc[2] * wf + bc[2] * (1 - wf)];
      let alpha = 1;
      if (tb.ragged > 0) {
        const hem = (tb.hemFirst ? v : 1 - v) / tb.ragged;            // 0 at the free edge, 1 where the tatters stop
        if (hem < 1) {
          const painted = fa * wf + ba * (1 - wf);
          const notch = 0.5 * noise(u * tb.rect.w / 9, 3.7) + 0.35 * noise(u * tb.rect.w / 3.5, 9.1);
          alpha = Math.min(1, painted + sstep(0.65, 1, hem)) * (hem < notch * 0.75 ? 0 : 1);
        }
      }
      return [col[0], col[1], col[2], alpha];
    }, [0, 0, 0, -1]);
    // spread texels a few pixels past the edge of every rectangle so filtering never reaches an empty one
    const n = W * H;
    for (let pass = 0; pass < 6; pass++) {
      const src = atlas.slice();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = y * W + x; if (src[k * 4 + 3] >= 0) continue;
        let r = 0, g = 0, b = 0, a = 0, c = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (src[j * 4 + 3] < 0) continue; r += src[j * 4]; g += src[j * 4 + 1]; b += src[j * 4 + 2]; a += src[j * 4 + 3]; c++; }
        if (c) { atlas[k * 4] = r / c; atlas[k * 4 + 1] = g / c; atlas[k * 4 + 2] = b / c; atlas[k * 4 + 3] = a / c; }
      }
    }
    for (let k = 0; k < n; k++) if (atlas[k * 4 + 3] < 0) { atlas[k * 4] = 0.2; atlas[k * 4 + 1] = 0.19; atlas[k * 4 + 2] = 0.17; atlas[k * 4 + 3] = 1; }
    const sharp = require('sharp');
    await sharp(toBytes(atlas), { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 88, alphaQuality: 90, effort: 5 }).toFile(path.join(outDir, `${kind}.webp`));
    console.log(kind, 'baked', W + 'x' + H);

    if (previewDir) {
      // the body as the game will show it, turned through four views
      const texel = (uu, vv) => { const x = Math.max(0, Math.min(W - 1, Math.floor(uu * W))), y = Math.max(0, Math.min(H - 1, Math.floor((1 - vv) * H))), k = (y * W + x) * 4; return [atlas[k], atlas[k + 1], atlas[k + 2], atlas[k + 3]]; };
      const pw = 512, ph = 768, yaws = [0, 0.9, Math.PI / 2, Math.PI], sheet = new Float32Array(pw * yaws.length * ph * 4);
      const v0 = vw.bodyFront, sc = v0.scale * (ph / v0.h);
      yaws.forEach((yaw, vi) => {
        const cs = Math.cos(yaw), sn = Math.sin(yaw), R = (i) => [P[i * 3] * cs + P[i * 3 + 2] * sn, P[i * 3 + 1], -P[i * 3] * sn + P[i * 3 + 2] * cs];
        const buf = raster(pw, ph, ix.length / 3, (t) => [0, 1, 2].map((j) => { const p = R(ix[t * 3 + j]); return [pw / 2 + (p[0] - v0.cx * cs) * sc, ph / 2 - (p[1] - v0.cy) * sc, p[2]]; }), (t, w0, w1, w2) => {
          const a = ix[t * 3], b = ix[t * 3 + 1], c = ix[t * 3 + 2];
          const tx = texel(uv[a * 2] * w0 + uv[b * 2] * w1 + uv[c * 2] * w2, uv[a * 2 + 1] * w0 + uv[b * 2 + 1] * w1 + uv[c * 2 + 1] * w2);
          if (tx[3] < 0.5) return null;
          let nx = N[a * 3] * w0 + N[b * 3] * w1 + N[c * 3] * w2, ny = N[a * 3 + 1] * w0 + N[b * 3 + 1] * w1 + N[c * 3 + 1] * w2, nzz = N[a * 3 + 2] * w0 + N[b * 3 + 2] * w1 + N[c * 3 + 2] * w2;
          const l = Math.hypot(nx, ny, nzz) || 1, rz = (-nx * sn + nzz * cs) / l, rx = (nx * cs + nzz * sn) / l;
          const d = 0.62 + 0.38 * Math.max(0, Math.abs(rz) * 0.8 + (ny / l) * 0.3 - rx * 0.2);
          return [tx[0] * d, tx[1] * d, tx[2] * d, 1];
        }, [0.12, 0.13, 0.15, 1]);
        for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) for (let c = 0; c < 4; c++) sheet[((y * pw * yaws.length) + vi * pw + x) * 4 + c] = buf[(y * pw + x) * 4 + c];
      });
      await savePng(path.join(previewDir, `${kind}.png`), sheet, pw * yaws.length, ph);
    }
  }
})();
