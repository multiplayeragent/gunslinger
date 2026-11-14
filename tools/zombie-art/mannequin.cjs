// Draws each zombie body as a plain grey figure, front and back, whole and head only. These are the pictures the
// image generator paints over, so the artwork lines up with the mesh.  node mannequin.cjs <out dir> [kind ...]
const path = require('node:path');
const { loadFigure, raster, savePng, views, project } = require('./lib.cjs');

const out = path.resolve(process.argv[2] || 'mannequin');
const { T, V } = loadFigure(), F = V.figure;
const kinds = process.argv.length > 3 ? process.argv.slice(3) : Object.keys(F.LOOKS);
const BG = [1, 0, 1, 1], SS = 2;

(async () => {
  for (const kind of kinds) {
    const { geo } = F.build(T, V.kit, kind), S = F.posed(T, geo, F.APOSE), P = S.position, N = S.normal, ix = geo.index.array;
    const tubes = geo.userData.bake.tubes, tube = geo.userData.bake.tube, vw = views(F, geo, P);
    for (const [name, v] of Object.entries(vw)) {
      const w = v.w * SS, h = v.h * SS, vs = { ...v, w, h, scale: v.scale * SS }, back = v.flip < 0, headOnly = name.startsWith('head');
      const L = [back ? 0.35 : -0.35, 0.5, back ? -0.8 : 0.8], ll = Math.hypot(...L);
      const buf = raster(w, h, ix.length / 3, (t) => {
        const a = ix[t * 3], b = ix[t * 3 + 1], c = ix[t * 3 + 2];
        return [a, b, c].map((i) => { const p = project(vs, P[i * 3], P[i * 3 + 1]); return [p[0], p[1], back ? -P[i * 3 + 2] : P[i * 3 + 2]]; });
      }, (t, w0, w1, w2) => {
        const a = ix[t * 3], b = ix[t * 3 + 1], c = ix[t * 3 + 2], tb = tubes[tube[a]];
        let nx = N[a * 3] * w0 + N[b * 3] * w1 + N[c * 3] * w2, ny = N[a * 3 + 1] * w0 + N[b * 3 + 1] * w1 + N[c * 3 + 1] * w2, nz = N[a * 3 + 2] * w0 + N[b * 3 + 2] * w1 + N[c * 3 + 2] * w2;
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        if ((back ? -nz : nz) < 0) { nx = -nx; ny = -ny; nz = -nz; }          // sheets are seen from both sides
        const d = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / ll), facing = Math.abs(nz);
        let g = 0.4 + 0.42 * d + 0.08 * facing;
        if (tb.flag === 'dark') g = 0.1; else if (tb.flag === 'gore') g = 0.3;
        return [g, g, g * 1.02, 1];
      }, BG);
      await savePng(path.join(out, `${kind}-${name}.png`), buf, w, h, [v.w, v.h]);
    }
    require('node:fs').writeFileSync(path.join(out, `${kind}.views.json`), JSON.stringify(vw));
    console.log(kind, 'tris', ix.length / 3, 'atlas scale', geo.userData.bake.scale.toFixed(2));
  }
})();
