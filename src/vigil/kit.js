/* Geometry kit for the churchyard. Everything is built in metres and merged per material, so UVs are
   projected in world space (one texture scale across every piece) and the level costs a few dozen draw calls. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const kit = (V.kit = {});
  const T = () => V.THREE;

  // ---------- deterministic randomness ----------
  kit.rng = (seed = 1) => {
    let a = seed >>> 0;
    const r = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    r.range = (lo, hi) => lo + (hi - lo) * r();
    r.pick = (list) => list[Math.floor(r() * list.length)];
    r.sign = () => (r() < 0.5 ? -1 : 1);
    return r;
  };
  const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  kit.noise2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  kit.fbm2 = (x, y, oct = 4) => { let s = 0, a = 0.5, t = 0; for (let i = 0; i < oct; i++) { s += a * kit.noise2(x, y); t += a; x = x * 2.03 + 17.1; y = y * 2.03 + 9.7; a *= 0.5; } return s / t; };
  kit.clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  kit.smooth = (a, b, x) => { const t = kit.clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  kit.lerp = (a, b, t) => a + (b - a) * t;

  // ---------- attribute plumbing ----------
  const flat = (g) => (g.index ? g.toNonIndexed() : g);
  // Planar UVs in metres along the dominant axis of each triangle.
  kit.boxUV = (g, scale = 1) => {
    const p = g.attributes.position, n = p.count;
    let uv = g.attributes.uv;
    if (!uv || uv.count !== n) { uv = new (T().BufferAttribute)(new Float32Array(n * 2), 2); g.setAttribute('uv', uv); }
    const a = p.array, u = uv.array;
    for (let i = 0; i < n; i += 3) {
      const o = i * 3;
      const ax = a[o + 3] - a[o], ay = a[o + 4] - a[o + 1], az = a[o + 5] - a[o + 2];
      const bx = a[o + 6] - a[o], by = a[o + 7] - a[o + 1], bz = a[o + 8] - a[o + 2];
      const nx = Math.abs(ay * bz - az * by), ny = Math.abs(az * bx - ax * bz), nz = Math.abs(ax * by - ay * bx);
      for (let k = 0; k < 3; k++) {
        const q = o + k * 3, w = (i + k) * 2;
        if (nx >= ny && nx >= nz) { u[w] = a[q + 2] * scale; u[w + 1] = a[q + 1] * scale; }
        else if (ny >= nz) { u[w] = a[q] * scale; u[w + 1] = a[q + 2] * scale; }
        else { u[w] = a[q] * scale; u[w + 1] = a[q + 1] * scale; }
      }
    }
    return g;
  };
  kit.tint = (g, c) => {
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    const r = typeof c === 'number' ? c : c[0], gg = typeof c === 'number' ? c : c[1], b = typeof c === 'number' ? c : c[2];
    for (let i = 0; i < n; i++) { arr[i * 3] = r; arr[i * 3 + 1] = gg; arr[i * 3 + 2] = b; }
    g.setAttribute('color', new (T().BufferAttribute)(arr, 3));
    return g;
  };
  // Per-vertex colour from a function of position: fn(x, y, z) -> grey or [r, g, b].
  kit.shade = (g, fn) => {
    const p = g.attributes.position, n = p.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const c = fn(p.getX(i), p.getY(i), p.getZ(i));
      if (typeof c === 'number') { arr[i * 3] = arr[i * 3 + 1] = arr[i * 3 + 2] = c; } else { arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2]; }
    }
    g.setAttribute('color', new (T().BufferAttribute)(arr, 3));
    return g;
  };
  // Reverses the winding of every triangle (after a mirror).
  kit.flip = (g) => {
    for (const name of Object.keys(g.attributes)) {
      const at = g.attributes[name], n = at.itemSize, a = at.array;
      for (let i = 0; i + 3 * n <= a.length; i += 3 * n) for (let k = 0; k < n; k++) { const t = a[i + n + k]; a[i + n + k] = a[i + 2 * n + k]; a[i + 2 * n + k] = t; }
    }
    return g;
  };
  // Swaps the x and z axes (a mirror), keeping faces outward.
  kit.swapXZ = (g) => {
    for (const name of ['position', 'normal']) {
      const at = g.attributes[name]; if (!at) continue;
      const a = at.array;
      for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; }
    }
    return kit.flip(g);
  };
  kit.xf = (g, { p, r, s, m } = {}) => {
    const TH = T();
    let M = m;
    if (!M) {
      M = new TH.Matrix4(); const q = new TH.Quaternion();
      if (r) q.setFromEuler(new TH.Euler(r[0] || 0, r[1] || 0, r[2] || 0, 'YXZ'));
      const sc = s == null ? [1, 1, 1] : typeof s === 'number' ? [s, s, s] : s;
      M.compose(new TH.Vector3(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0), q, new TH.Vector3(sc[0], sc[1], sc[2]));
    }
    g.applyMatrix4(M);
    if (M.determinant() < 0) kit.flip(g);
    return g;
  };
  // Concatenates non-indexed geometries (position, normal, uv, color).
  kit.merge = (list) => {
    const TH = T();
    let n = 0;
    for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3).fill(1);
    let o = 0;
    for (const g of list) {
      const c = g.attributes.position.count, a = g.attributes;
      pos.set(a.position.array.subarray(0, c * 3), o * 3);
      if (a.normal) nor.set(a.normal.array.subarray(0, c * 3), o * 3);
      if (a.uv) uv.set(a.uv.array.subarray(0, c * 2), o * 2);
      if (a.color) col.set(a.color.array.subarray(0, c * 3), o * 3);
      o += c;
    }
    const out = new TH.BufferGeometry();
    out.setAttribute('position', new TH.BufferAttribute(pos, 3));
    out.setAttribute('normal', new TH.BufferAttribute(nor, 3));
    out.setAttribute('uv', new TH.BufferAttribute(uv, 2));
    out.setAttribute('color', new TH.BufferAttribute(col, 3));
    return out;
  };

  // ---------- primitives (non-indexed, normals set) ----------
  kit.box = (w, h, d) => flat(new (T().BoxGeometry)(w, h, d));
  // Chamfered cuboid: flat faces with 45 degree bevels that catch the light. 44 triangles.
  kit.bevelBox = (w, h, d, b = 0.02) => {
    const x = w / 2, y = h / 2, z = d / 2;
    b = Math.min(b, x * 0.49, y * 0.49, z * 0.49);
    const A = (sx, sy, sz) => [sx * x, sy * (y - b), sz * (z - b)];
    const B = (sx, sy, sz) => [sx * (x - b), sy * y, sz * (z - b)];
    const C = (sx, sy, sz) => [sx * (x - b), sy * (y - b), sz * z];
    const tris = [];
    const quad = (p0, p1, p2, p3) => { tris.push(p0, p1, p2, p0, p2, p3); };
    for (const s of [-1, 1]) {
      quad(A(s, -1, -1), A(s, 1, -1), A(s, 1, 1), A(s, -1, 1));
      quad(B(-1, s, -1), B(1, s, -1), B(1, s, 1), B(-1, s, 1));
      quad(C(-1, -1, s), C(1, -1, s), C(1, 1, s), C(-1, 1, s));
    }
    for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
      quad(A(s1, s2, -1), A(s1, s2, 1), B(s1, s2, 1), B(s1, s2, -1));     // edges along z
      quad(A(s1, -1, s2), A(s1, 1, s2), C(s1, 1, s2), C(s1, -1, s2));     // edges along y
      quad(B(-1, s1, s2), B(1, s1, s2), C(1, s1, s2), C(-1, s1, s2));     // edges along x
      for (const s3 of [-1, 1]) tris.push(A(s1, s2, s3), B(s1, s2, s3), C(s1, s2, s3));
    }
    return kit.fromTris(tris);
  };
  // Builds a flat-shaded geometry from a list of points (three per triangle), fixing winding to face away from the centroid.
  kit.fromTris = (pts, outward = true) => {
    const TH = T(), n = pts.length, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    let cx = 0, cy = 0, cz = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
    cx /= n; cy /= n; cz /= n;
    for (let i = 0; i < n; i += 3) {
      let a = pts[i], b = pts[i + 1], c = pts[i + 2];
      let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (outward && nx * ((a[0] + b[0] + c[0]) / 3 - cx) + ny * ((a[1] + b[1] + c[1]) / 3 - cy) + nz * ((a[2] + b[2] + c[2]) / 3 - cz) < 0) {
        const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz;
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      [a, b, c].forEach((p, k) => {
        pos.set(p, (i + k) * 3); nor.set([nx / l, ny / l, nz / l], (i + k) * 3);
      });
    }
    const g = new TH.BufferGeometry();
    g.setAttribute('position', new TH.BufferAttribute(pos, 3));
    g.setAttribute('normal', new TH.BufferAttribute(nor, 3));
    return g;
  };
  // Cylinder / cone frustum with metric UVs (u = arc length, v = height). y runs 0..h.
  kit.cyl = (rt, rb, h, seg = 12, open = false) => {
    const g = new (T().CylinderGeometry)(rt, rb, h, seg, 1, open);
    const uv = g.attributes.uv, p = g.attributes.position, n = g.attributes.normal, c = Math.PI * (rt + rb);
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(n.getY(i)) > 0.9) uv.setXY(i, p.getX(i), p.getZ(i)); else uv.setXY(i, uv.getX(i) * c, p.getY(i));
    }
    g.translate(0, h / 2, 0);
    const out = flat(g); out.userData.keepUV = true;
    return out;
  };
  kit.sphere = (r, ws = 12, hs = 8) => { const g = flat(new (T().SphereGeometry)(r, ws, hs)); return g; };
  // Tapered rod between two points.
  kit.rod = (a, b, r0, r1 = r0, seg = 6) => {
    const TH = T(), A = new TH.Vector3(a[0], a[1], a[2]), Bv = new TH.Vector3(b[0], b[1], b[2]);
    const d = Bv.clone().sub(A), len = d.length();
    const g = kit.cyl(r1, r0, len, seg, false);
    const q = new TH.Quaternion().setFromUnitVectors(new TH.Vector3(0, 1, 0), d.normalize());
    g.applyMatrix4(new TH.Matrix4().compose(A, q, new TH.Vector3(1, 1, 1)));
    return g;
  };
  // Extrusion of a 2D outline ([[x, y], ...], counter-clockwise) along +z from 0 to depth.
  kit.extrude = (pts, depth, holes = []) => {
    const TH = T();
    const shape = new TH.Shape(pts.map((p) => new TH.Vector2(p[0], p[1])));
    for (const h of holes) shape.holes.push(new TH.Path(h.map((p) => new TH.Vector2(p[0], p[1]))));
    return flat(new TH.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 }));
  };
  // Lathe around y from a profile [[radius, y], ...] (bottom to top).
  kit.lathe = (profile, seg = 16) => {
    const TH = T();
    const g = new TH.LatheGeometry(profile.map((p) => new TH.Vector2(Math.max(1e-4, p[0]), p[1])), seg);
    const uv = g.attributes.uv, p = g.attributes.position;
    let rm = 0; for (const q of profile) rm = Math.max(rm, q[0]);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * rm, p.getY(i));
    g.computeVertexNormals();
    const out = flat(g); out.userData.keepUV = true;
    return out;
  };
  kit.tube = (points, r = 0.03, radial = 6, closed = false) => {
    const TH = T();
    const curve = new TH.CatmullRomCurve3(points.map((p) => new TH.Vector3(p[0], p[1], p[2])), closed, 'catmullrom', 0.5);
    const len = curve.getLength();
    const g = new TH.TubeGeometry(curve, Math.max(2, Math.ceil(len / Math.max(0.1, r * 3))), r, radial, closed);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len, uv.getY(i) * 2 * Math.PI * r);
    const out = flat(g); out.userData.keepUV = true;
    return out;
  };
  // Lumpy stone: a subdivided icosahedron pushed around by noise. Flat-ish facets read as rock.
  kit.rock = (r = 0.5, seed = 1, detail = 1, squash = [1, 0.7, 1]) => {
    const g = flat(new (T().IcosahedronGeometry)(r, detail));
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 0.72 + 0.5 * kit.noise2(x * 2.3 / r + seed * 3.1, y * 2.3 / r + z * 1.9 / r + seed) + 0.16 * kit.noise2(x * 7 / r + seed, z * 7 / r - y * 5 / r);
      p.setXYZ(i, x * k * squash[0], y * k * squash[1], z * k * squash[2]);
    }
    g.computeVertexNormals();
    return g;
  };

  // ---------- gothic arches ----------
  // Points of a pointed arch opening, from the left spring over the apex to the right spring. w = clear width.
  kit.archPts = (w, spring, apex, n = 7) => {
    const hw = w / 2, rise = Math.max(0.01, apex - spring);
    const cx = (rise * rise - hw * hw) / w;          // centre of the arc through (-hw, spring) and (0, apex), on the spring line
    const R = cx + hw;
    const a0 = Math.PI, a1 = Math.PI - Math.atan2(rise, cx);
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push([cx + R * Math.cos(a), spring + R * Math.sin(a)]); }
    const right = pts.slice(0, -1).reverse().map((p) => [-p[0], p[1]]);
    pts[n][0] = 0;
    return pts.concat(right);
  };
  // Closed outline of an arched opening (clockwise, for use as a hole): sill at y0, jambs up to the spring.
  kit.archHole = (c, w, y0, spring, apex, n = 7) => {
    const pts = [[c - w / 2, y0]].concat(kit.archPts(w, spring, apex, n).map((p) => [c + p[0], p[1]]));
    pts.push([c + w / 2, y0]);
    return pts;
  };
  kit.circlePts = (cx, cy, r, n = 20) => { const pts = []; for (let i = 0; i < n; i++) { const a = -(i / n) * Math.PI * 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return pts; };

  // ---------- the builder ----------
  kit.Builder = class {
    constructor(g, mats) { this.g = g; this.mats = mats; this.buckets = new Map(); }
    // geo: a fresh non-indexed geometry (it is transformed in place). o: { p, r, s, m, tint, uv: 'keep', cast: false }
    add(key, geo, o = {}) {
      let G = flat(geo);
      if (o.p || o.r || o.s != null || o.m) kit.xf(G, o);
      if (!G.attributes.normal) G.computeVertexNormals();
      if (o.uv !== 'keep' && !G.userData.keepUV) kit.boxUV(G, o.uvScale || 1);
      else if (!G.attributes.uv) kit.boxUV(G);
      if (o.tint != null) kit.tint(G, o.tint);
      // between begin() and end() geometry belongs to a breakable object instead of the static mesh
      if (this.cap && !(this.cap.skip && this.cap.skip.includes(key))) { this.cap.items.push({ key, geo: G, cast: o.cast !== false }); return G; }
      const k = key + (o.cast === false ? '|n' : '');
      let b = this.buckets.get(k);
      if (!b) { b = { key, cast: o.cast !== false, list: [] }; this.buckets.set(k, b); }
      b.list.push(G);
      return G;
    }
    box(key, w, h, d, x, y, z, o = {}) {
      return this.add(key, o.bevel ? kit.bevelBox(w, h, d, o.bevel) : kit.box(w, h, d), { ...o, p: [x, y, z] });
    }
    // Box given by two corners.
    slab(key, x0, y0, z0, x1, y1, z1, o = {}) {
      return this.box(key, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);
    }
    cyl(key, rt, rb, h, x, y, z, o = {}) { return this.add(key, kit.cyl(rt, rb, h, o.seg || 12, !!o.open), { ...o, p: [x, y, z] }); }
    rod(key, a, b, r0, r1, o = {}) { return this.add(key, kit.rod(a, b, r0, r1 == null ? r0 : r1, o.seg || 6), o); }
    col(x0, y0, z0, x1, y1, z1, surface = 'concrete', o = {}) { const b = this.g.physics.addBox([x0, y0, z0], [x1, y1, z1], { surface, ...o }); if (this.cap) this.cap.boxes.push(b); return b; }
    // o: { kind: 'stone' | 'wood', hp, yaw, skip: [material keys that stay static] }. Everything added until end() can be broken.
    begin(o) { this.cap = { kind: 'stone', hp: 100, yaw: 0, ...o, items: [], boxes: [] }; return this.cap; }
    end() { const c = this.cap; this.cap = null; if (c && c.items.length && c.boxes.length) (this.objects || (this.objects = [])).push(c); else if (c) for (const it of c.items) this.add(it.key, it.geo, { uv: 'keep', cast: it.cast }); return c; }
    // Collider for a box centred at x, z standing on y0.
    colBox(x, z, hw, hd, y0, y1, surface = 'concrete', o = {}) { return this.col(x - hw, y0, z - hd, x + hw, y1, z + hd, surface, o); }
    count() { let n = 0; for (const b of this.buckets.values()) for (const g of b.list) n += g.attributes.position.count / 3; return Math.round(n); }
    build(name = 'vigil-static') {
      const TH = T(), root = new TH.Group(); root.name = name;
      for (const b of this.buckets.values()) {
        const geo = kit.merge(b.list);
        geo.computeBoundingSphere(); geo.computeBoundingBox();
        const mat = this.mats.get(b.key);
        const mesh = new TH.Mesh(geo, mat);
        mesh.name = name + ':' + b.key;
        mesh.castShadow = b.cast && !mat.transparent; mesh.receiveShadow = !mat.isMeshBasicMaterial;
        mesh.matrixAutoUpdate = false;
        root.add(mesh);
      }
      this.buckets.clear();
      return root;
    }
  };

  // A group of pieces authored in local space and committed to the builder with one transform.
  kit.Part = class {
    constructor() { this.items = []; }
    add(key, geo, o = {}) {
      if (o.p || o.r || o.s != null || o.m) kit.xf(geo, o);
      this.items.push([key, geo, o.tint, o.cast]);
      return this;
    }
    box(key, w, h, d, x, y, z, o = {}) { return this.add(key, o.bevel ? kit.bevelBox(w, h, d, o.bevel) : kit.box(w, h, d), { ...o, p: [x, y, z] }); }
    cyl(key, rt, rb, h, x, y, z, o = {}) { return this.add(key, kit.cyl(rt, rb, h, o.seg || 12, !!o.open), { ...o, p: [x, y, z] }); }
    rod(key, a, b, r0, r1, o = {}) { return this.add(key, kit.rod(a, b, r0, r1 == null ? r0 : r1, o.seg || 6), o); }
    commit(B, o = {}) {
      const TH = T(), r = o.r || [0, 0, 0], sc = o.s == null ? [1, 1, 1] : typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s, p = o.p || [0, 0, 0];
      const M = new TH.Matrix4().compose(new TH.Vector3(p[0], p[1], p[2]), new TH.Quaternion().setFromEuler(new TH.Euler(r[0] || 0, r[1] || 0, r[2] || 0, 'YXZ')), new TH.Vector3(sc[0], sc[1], sc[2]));
      for (const [key, geo, tint, cast] of this.items) B.add(key, geo, { m: M, tint: tint == null ? o.tint : tint, cast });
      this.items.length = 0;
      return M;
    }
  };
  // Merges every plain mesh under root into one mesh per material, world transforms applied (used for engine props).
  kit.mergeTree = (root) => {
    const TH = T(), groups = new Map(), out = new TH.Group();
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material) || o.isSkinnedMesh || o.isInstancedMesh) return;
      const k = o.material.uuid + (o.castShadow ? 'c' : 'n');
      if (!groups.has(k)) groups.set(k, { mat: o.material, cast: o.castShadow, list: [] });
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      if (!geo.attributes.normal) geo.computeVertexNormals();
      geo.applyMatrix4(o.matrixWorld);
      if (o.matrixWorld.determinant() < 0) kit.flip(geo);
      groups.get(k).list.push(geo);
    });
    for (const gr of groups.values()) {
      const mesh = new TH.Mesh(kit.merge(gr.list), gr.mat);
      mesh.castShadow = gr.cast && !gr.mat.transparent; mesh.receiveShadow = !gr.mat.isMeshBasicMaterial; mesh.matrixAutoUpdate = false;
      out.add(mesh);
    }
    return out;
  };
  // Registers a placed engine prop's collision boxes with the physics world.
  kit.propColliders = (g, obj, opts = {}) => {
    const TH = T(), box = new TH.Box3();
    obj.updateMatrixWorld(true);
    for (const c of obj.userData.colliders || []) {
      box.min.fromArray(c.min); box.max.fromArray(c.max); box.applyMatrix4(obj.matrixWorld);
      if (box.max.y - box.min.y < 0.2 && box.max.y < 0.3) continue;
      g.physics.addBox(box.min.clone(), box.max.clone(), { surface: c.surface || 'metal', ...opts });
    }
  };

  // ---------- walls with openings ----------
  // A wall is an outline in (u, y): u runs along the wall, y is up. It is extruded in two layers, the outer half in
  // matOut and the inner half in matIn, so rain only wets the outside and the nave picks up the interior probe.
  //   axis 'x': the wall runs along world X at z = at; axis 'z': along world Z at x = at.
  //   out: +1 if the outside faces +z (axis 'x') or +x (axis 'z'), -1 otherwise.
  //   holes: [{ c, w, y0, spring, apex }] arched, [{ c, cy, r }] round, [{ pts }] free outline in (u, y).
  kit.wall = (B, { axis, at, u0, u1, y0 = 0, y1, t, out = 1, matOut, matIn, holes = [], gable = 0, top = null, surface = 'concrete', collide = true }) => {
    const TH = T();
    const outline = [[u0, y0], [u1, y0], [u1, y1]];
    if (top) for (const p of top) outline.push(p); else if (gable) outline.push([(u0 + u1) / 2, y1 + gable]);
    outline.push([u0, y1]);
    const contours = [outline];
    const holePts = holes.map((h) => (h.pts ? h.pts : h.r ? kit.circlePts(h.c, h.cy, h.r, 24) : kit.archHole(h.c, h.w, h.y0, h.spring, h.apex, 7)));
    for (const hp of holePts) contours.push(hp);
    const shape = new TH.Shape(outline.map((p) => new TH.Vector2(p[0], p[1])));
    for (const hp of holePts) shape.holes.push(new TH.Path(hp.map((p) => new TH.Vector2(p[0], p[1]))));
    const cap = flat(new TH.ShapeGeometry(shape));                // faces +w
    const place = (pts3) => {
      // pts3 in (u, y, w), w = distance toward the outside
      const arr = pts3;
      for (let i = 0; i < arr.length; i += 3) {
        const u = arr[i], y = arr[i + 1], w = arr[i + 2] * out;
        if (axis === 'x') { arr[i] = u; arr[i + 1] = y; arr[i + 2] = at + w; } else { arr[i] = at + w; arr[i + 1] = y; arr[i + 2] = u; }
      }
      return arr;
    };
    const mk = (pos) => {
      const g = new TH.BufferGeometry();
      g.setAttribute('position', new TH.BufferAttribute(place(pos), 3));
      g.computeVertexNormals();
      return g;
    };
    const layer = (w0, w1, mat, capAt) => {
      // side walls of every contour between w0 and w1
      const pos = [];
      for (const c of contours) {
        for (let i = 0; i < c.length; i++) {
          const a = c[i], b = c[(i + 1) % c.length];
          pos.push(a[0], a[1], w0, b[0], b[1], w0, b[0], b[1], w1, a[0], a[1], w0, b[0], b[1], w1, a[0], a[1], w1);
        }
      }
      const cp = cap.attributes.position, cpos = [];
      for (let i = 0; i < cp.count; i += 3) {
        const idx = capAt > 0 ? [i, i + 1, i + 2] : [i, i + 2, i + 1];
        for (const j of idx) cpos.push(cp.getX(j), cp.getY(j), capAt > 0 ? w1 : w0);
      }
      const sides = mk(new Float32Array(pos)), face = mk(new Float32Array(cpos));
      // make side normals point away from the wall material
      fixWinding(sides, contours, axis, at, out);
      // the cap must face its own side whatever the mirroring did
      orient(face, axis, capAt * out);
      B.add(mat, sides); B.add(mat, face);
    };
    layer(0, t / 2, matOut, 1);
    layer(-t / 2, 0, matIn || matOut, -1);

    if (collide) {
      const solid = holes.filter((h) => !h.r).map((h) => {
        if (h.pts) { let a = 1e9, b = -1e9, lo = 1e9, hi = -1e9; for (const p of h.pts) { a = Math.min(a, p[0]); b = Math.max(b, p[0]); lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); } return { a, b, lo, hi }; }
        return { a: h.c - h.w / 2, b: h.c + h.w / 2, lo: h.y0, hi: h.apex };
      }).sort((p, q) => p.a - q.a);
      const top1 = y1 + gable * 0.55;
      const add = (a, b, lo, hi, o) => {
        if (b - a < 0.04 || hi - lo < 0.04) return;
        if (axis === 'x') B.col(a, lo, at - t / 2, b, hi, at + t / 2, surface, o); else B.col(at - t / 2, lo, a, at + t / 2, hi, b, surface, o);
      };
      let cur = u0;
      for (const h of solid) {
        add(cur, h.a, y0, top1);
        if (h.lo > y0 + 0.3) add(h.a, h.b, y0, h.lo);
        add(h.a, h.b, h.hi - 0.25, top1, { noNav: true });
        cur = h.b;
      }
      add(cur, u1, y0, top1);
    }
  };
  function orient(g, axis, sign) {
    // flip triangles whose normal does not point along sign on the wall's thickness axis
    const p = g.attributes.position, n = g.attributes.normal, k = axis === 'x' ? 2 : 0;
    if (!p.count) return;
    if (n.array[k] * sign < 0) flipAll(g);
  }
  function flipAll(g) {
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) { for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; } }
    g.computeVertexNormals();
  }
  // Side faces must face outward from solid material: the outline faces away from its inside, holes face into the hole.
  function fixWinding(g, contours, axis, at, out) {
    const p = g.attributes.position.array;
    // signed area of the outline decides its orientation in (u, y); mapping to world may mirror, so test each quad
    let q = 0;
    const inside = (u, y) => {
      // point in outline and not in any hole
      const pin = (c) => { let ins = false; for (let i = 0, j = c.length - 1; i < c.length; j = i++) { const a = c[i], b = c[j]; if ((a[1] > y) !== (b[1] > y) && u < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) ins = !ins; } return ins; };
      if (!pin(contours[0])) return false;
      for (let i = 1; i < contours.length; i++) if (pin(contours[i])) return false;
      return true;
    };
    for (const c of contours) {
      for (let i = 0; i < c.length; i++, q++) {
        const o = q * 18;
        // quad normal in world
        const ax = p[o + 3] - p[o], ay = p[o + 4] - p[o + 1], az = p[o + 5] - p[o + 2];
        const bx = p[o + 6] - p[o], by = p[o + 7] - p[o + 1], bz = p[o + 8] - p[o + 2];
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const nu = axis === 'x' ? nx : nz, l = Math.hypot(nu, ny) || 1;
        const a = c[i], b = c[(i + 1) % c.length];
        const mu = (a[0] + b[0]) / 2 + (nu / l) * 0.02, my = (a[1] + b[1]) / 2 + (ny / l) * 0.02;
        if (inside(mu, my)) {
          for (let tri = 0; tri < 2; tri++) { const s = o + tri * 9; for (let k = 0; k < 3; k++) { const t = p[s + 3 + k]; p[s + 3 + k] = p[s + 6 + k]; p[s + 6 + k] = t; } }
        }
      }
    }
    g.computeVertexNormals();
  }

  // Extruded moulding that follows an arch: used for hood moulds, window surrounds and door orders.
  kit.archBand = (w, y0, spring, apex, band, depth, n = 7) => {
    const outer = [[-(w / 2 + band), y0]].concat(kit.archPts(w + band * 2, spring, apex + band, n), [[w / 2 + band, y0]]);
    const inner = [[w / 2, y0]].concat(kit.archPts(w, spring, apex, n).reverse(), [[-w / 2, y0]]);
    return kit.extrude(outer.concat(inner), depth);
  };
})();
