/* Bodies of the dead. Each is lofted from cross-sections and skinned to an 18-bone skeleton, with clothing built
   as real shapes (jacket tails, gowns, aprons, hoods, robes) and every tube unwrapped into one texture atlas.
   tools/zombie-art paints those atlases from generated artwork; the same builder runs there under Node.
   Limbs can come off: each joint that can be severed hides a stump inside it, and a limb is cut loose by
   collapsing its bones, so one shared mesh serves every state. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const PI = Math.PI;

  const BONES = [
    ['hips', -1, [0, 0.96, 0]], ['spine', 0, [0, 1.10, 0]], ['chest', 1, [0, 1.30, 0]], ['neck', 2, [0, 1.52, 0]], ['head', 3, [0, 1.60, 0]], ['jaw', 4, [0, 1.655, -0.012]],
    ['uaL', 2, [0.215, 1.455, 0]], ['faL', 6, [0.235, 1.165, 0]], ['hL', 7, [0.245, 0.90, 0.01]],
    ['uaR', 2, [-0.215, 1.455, 0]], ['faR', 9, [-0.235, 1.165, 0]], ['hR', 10, [-0.245, 0.90, 0.01]],
    ['thL', 0, [0.095, 0.93, 0]], ['shL', 12, [0.10, 0.50, 0.005]], ['ftL', 13, [0.10, 0.085, 0]],
    ['thR', 0, [-0.095, 0.93, 0]], ['shR', 15, [-0.10, 0.50, 0.005]], ['ftR', 16, [-0.10, 0.085, 0]],
  ];
  const BI = {}; BONES.forEach((b, i) => (BI[b[0]] = i));
  const ATLAS = { w: 2048, h: 1024, pad: 4, dens: 600 };

  // Limbs that can be shot off: the bone to collapse, and the bones that leave with it.
  const LIMBS = {
    armL: { upper: 'uaL', lower: 'faL', bones: ['uaL', 'faL', 'hL'], lowerBones: ['faL', 'hL'] },
    armR: { upper: 'uaR', lower: 'faR', bones: ['uaR', 'faR', 'hR'], lowerBones: ['faR', 'hR'] },
    legL: { upper: 'thL', lower: 'shL', bones: ['thL', 'shL', 'ftL'], lowerBones: ['shL', 'ftL'] },
    legR: { upper: 'thR', lower: 'shR', bones: ['thR', 'shR', 'ftR'], lowerBones: ['shR', 'ftR'] },
  };

  // ------------------------------------------------------------------ mesher
  // Lofted tubes: rings of n + 1 vertices (the seam is doubled so each tube unwraps to a rectangle).
  function Mesher(T) {
    const pos = [], uv = [], si = [], sw = [], idx = [], ctr = [], tid = [], tubes = [], seams = [];
    const v3 = new T.Vector3(), c3 = new T.Vector3(), p3 = new T.Vector3();
    const api = {
      tubes,
      count: () => pos.length / 3,
      // rings: [{ y, rx, rz, ox, oz, b: [boneA, wA, boneB] | (lx, lz) => [...] }]
      // o: { capA, capB, arc: [a0, a1], twist, dens, flag: 'gore' | 'dark', ragged: 0..1, group: 'body' | 'head', share, name }
      tube(rings, n, M, o = {}) {
        const id = tubes.length, base = pos.length / 3, arc = o.arc || null;
        const a0 = arc ? arc[0] : (o.twist == null ? -PI / 2 : o.twist), a1 = arc ? arc[1] : a0 + PI * 2, R = rings.length, S = n + 1;
        let per = 0.001, len = 0, prevRad = 0; const vs = [];
        rings.forEach((r, ri) => {
          c3.set(r.ox || 0, r.y, r.oz || 0); if (M) c3.applyMatrix4(M);
          const rad = (r.rx + r.rz) / 2;
          if (ri) len += Math.hypot(c3.distanceTo(p3), rad - prevRad);
          vs.push(len); p3.copy(c3); prevRad = rad;
          const full = PI * (3 * (r.rx + r.rz) - Math.sqrt((3 * r.rx + r.rz) * (r.rx + 3 * r.rz)));
          per = Math.max(per, full * (a1 - a0) / (PI * 2));
          for (let k = 0; k <= n; k++) {
            const a = a0 + (a1 - a0) * (k / n), lx = Math.cos(a) * r.rx, lz = Math.sin(a) * r.rz;
            v3.set(lx + (r.ox || 0), r.y, lz + (r.oz || 0)); if (M) v3.applyMatrix4(M);
            pos.push(v3.x, v3.y, v3.z); ctr.push(c3.x, c3.y, c3.z); uv.push(k / n, 0); tid.push(id);
            const b = typeof r.b === 'function' ? r.b(lx + (r.ox || 0), lz) : r.b;
            si.push(b[0], b.length > 2 ? b[2] : b[0], 0, 0); sw.push(b[1], 1 - b[1], 0, 0);
          }
        });
        for (let ri = 0; ri < R; ri++) for (let k = 0; k <= n; k++) uv[(base + ri * S + k) * 2 + 1] = len > 0 ? vs[ri] / len : 0;
        // rings listed top-down wind the other way: keep every face pointing out
        const down = rings[R - 1].y < rings[0].y;
        for (let ri = 0; ri < R - 1; ri++) for (let k = 0; k < n; k++) {
          const a = base + ri * S + k, b = a + 1, c = a + S, d = c + 1;
          if (down) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
        }
        if (!arc) for (let ri = 0; ri < R; ri++) seams.push(base + ri * S, base + ri * S + n);
        const cap = (ri, flip) => {
          const r = rings[ri], cI = pos.length / 3;
          c3.set(r.ox || 0, r.y, r.oz || 0); if (M) c3.applyMatrix4(M);
          pos.push(c3.x, c3.y, c3.z); ctr.push(c3.x, c3.y, c3.z); uv.push(0.5, len > 0 ? vs[ri] / len : 0); tid.push(id);
          const b = typeof r.b === 'function' ? r.b(r.ox || 0, 0) : r.b;
          si.push(b[0], b.length > 2 ? b[2] : b[0], 0, 0); sw.push(b[1], 1 - b[1], 0, 0);
          for (let k = 0; k < n; k++) { const a = base + ri * S + k, bb = a + 1; if (flip) idx.push(cI, a, bb); else idx.push(cI, bb, a); }
        };
        if (!arc && o.capA) cap(0, !down);
        if (!arc && o.capB) cap(R - 1, down);
        tubes.push({ id, base, end: pos.length / 3, n, rings: R, per, len, dens: o.dens || 1, flag: o.flag || '', ragged: o.ragged || 0, group: o.group || 'body', share: o.share || null, name: o.name || '' });
        return base;
      },
      // displace vertices in [from, to) with fn(x, y, z) -> [dx, dy, dz]
      sculpt(from, to, fn) {
        for (let i = from; i < to; i++) {
          const r = fn(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
          if (r) { pos[i * 3] += r[0]; pos[i * 3 + 1] += r[1]; pos[i * 3 + 2] += r[2]; }
        }
      },
      build(A = ATLAS) {
        // shelf-pack one rectangle per tube (tubes that share a key share a rectangle), shrinking until it fits
        const groups = [], byShare = new Map();
        for (const t of tubes) {
          if (t.share && byShare.has(t.share)) { t.rect = byShare.get(t.share); continue; }
          const r = { per: t.per, len: t.len, dens: t.dens, x: 0, y: 0, w: 0, h: 0 };
          t.rect = r; groups.push(r); if (t.share) byShare.set(t.share, r);
        }
        let scale = 1;
        for (; scale > 0.1; scale *= 0.97) {
          for (const r of groups) { r.w = Math.max(6, Math.round(r.per * A.dens * r.dens * scale)); r.h = Math.max(6, Math.round(r.len * A.dens * r.dens * scale)); }
          const order = groups.slice().sort((a, b) => b.h - a.h);
          let x = A.pad, y = A.pad, sh = 0, ok = true;
          for (const r of order) {
            if (r.w + A.pad * 2 > A.w) { ok = false; break; }
            if (x + r.w + A.pad > A.w) { x = A.pad; y += sh + A.pad; sh = 0; }
            r.x = x; r.y = y; x += r.w + A.pad; sh = Math.max(sh, r.h);
            if (y + sh + A.pad > A.h) { ok = false; break; }
          }
          if (ok) break;
        }
        for (let i = 0; i < tid.length; i++) {
          const r = tubes[tid[i]].rect, u = uv[i * 2], v = uv[i * 2 + 1];
          uv[i * 2] = (r.x + u * r.w) / A.w; uv[i * 2 + 1] = 1 - (r.y + (1 - v) * r.h) / A.h;
        }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
        g.setAttribute('skinIndex', new T.Uint16BufferAttribute(si, 4));
        g.setAttribute('skinWeight', new T.Float32BufferAttribute(sw, 4));
        g.setIndex(idx);
        g.userData.seams = seams;
        g.userData.bake = { centre: new Float32Array(ctr), tube: new Uint16Array(tid), tubes, atlas: { w: A.w, h: A.h }, scale };
        smoothNormals(g);
        g.boundingSphere = new T.Sphere(new T.Vector3(0, 0.9, 0), 2.6);
        return g;
      },
    };
    return api;
  }
  // Vertex normals, with the doubled seam vertices of each tube made to agree.
  function smoothNormals(g) {
    g.computeVertexNormals();
    const n = g.attributes.normal.array, s = g.userData.seams || [];
    for (let i = 0; i < s.length; i += 2) {
      const a = s[i] * 3, b = s[i + 1] * 3;
      let x = n[a] + n[b], y = n[a + 1] + n[b + 1], z = n[a + 2] + n[b + 2];
      const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
      n[a] = n[b] = x; n[a + 1] = n[b + 1] = y; n[a + 2] = n[b + 2] = z;
    }
    g.attributes.normal.needsUpdate = true;
  }

  // ------------------------------------------------------------------ looks
  // cloth: thickness of what the torso wears. sleeve / trouser: how far down each limb is covered, left then right.
  const LOOKS = {
    walkerA: { build: { chest: 0.98, belly: 0.92, arm: 0.9, leg: 0.96, neck: 0.9 }, cloth: 1.12, sleeve: [1, 0.5], sleeveK: 1.26, trouser: [1, 1], trouserK: 1.18, feet: ['shoe', 'shoe'], hem: 'jacket', collar: 1 },
    walkerB: { build: { chest: 0.94, belly: 1.02, arm: 0.88, leg: 0.95, neck: 0.9 }, cloth: 1.06, sleeve: [0.42, 0.06], sleeveK: 1.15, trouser: [1, 0.55], trouserK: 1.16, feet: ['shoe', 'bare'], hem: 'tail', collar: 1 },
    runner: { build: { chest: 0.86, belly: 0.7, arm: 0.8, leg: 0.84, neck: 0.85 }, cloth: 1, sleeve: [0, 0], trouser: [0, 0], feet: ['bare', 'bare'], hem: 'loin', hood: 1 },
    spitter: { build: { chest: 1.05, belly: 1.75, arm: 0.95, leg: 1.05, neck: 1.35 }, cloth: 1.04, sleeve: [0, 0], trouser: [0, 0], feet: ['bare', 'bare'], hem: 'gown', hair: 1, throat: 1,
      sacs: [['chest', [0.0, 1.5, 0.075], 0.045], ['chest', [0.07, 1.44, 0.1], 0.03], ['spine', [0.06, 1.14, 0.185], 0.05], ['spine', [-0.07, 1.06, 0.18], 0.055], ['hips', [0.03, 0.97, 0.175], 0.04]] },
    brute: { build: { chest: 1.5, belly: 1.42, arm: 1.55, leg: 1.3, neck: 1.5, head: 1.06 }, cloth: 1.05, sleeve: [0.45, 0.45], sleeveK: 1.12, trouser: [1, 1], trouserK: 1.22, feet: ['boot', 'boot'], hem: 'apron', hand: 1.2 },
    boss: { build: { chest: 1.5, belly: 1.15, arm: 1.25, leg: 1.2, neck: 1.2, head: 1.12 }, cloth: 1.1, sleeve: [0.72, 0.72], sleeveK: 1.55, trouser: [0, 0], feet: ['shoe', 'shoe'], hem: 'robe', mitre: 1, bishop: 1, hand: 1.3 },
  };
  // the living: the watchmen who can be posted round the crystal
  LOOKS.guard = { build: { chest: 1.08, belly: 1.0, arm: 1.05, leg: 1.05 }, cloth: 1.13, sleeve: [1, 1], sleeveK: 1.24, trouser: [1, 1], trouserK: 1.16, feet: ['boot', 'boot'], hem: 'coat', collar: 1, helmet: 1, hand: 1.05, noEyes: 1 };
  const KINDS = { walker: ['walkerA', 'walkerB'], runner: ['runner'], spitter: ['spitter'], brute: ['brute'], boss: ['boss'] };

  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // piecewise-linear lookup in a table of [x, value] rows
  const table = (rows, x) => {
    if (x <= rows[0][0]) return rows[0][1];
    for (let i = 1; i < rows.length; i++) if (x <= rows[i][0]) return lerp(rows[i - 1][1], rows[i][1], (x - rows[i - 1][0]) / (rows[i][0] - rows[i - 1][0]));
    return rows[rows.length - 1][1];
  };

  // kind: a key of LOOKS. o: { eye: [r, g, b] }. Returns { geo, glow } (glow: the eyes and anything else that shines).
  function build(T, kit, kind, o = {}) {
    const L = LOOKS[kind], m = Mesher(T), B = BI;
    const bd = Object.assign({ chest: 1, belly: 1, arm: 1, leg: 1, head: 1, neck: 1 }, L.build || {});
    const M4 = (p, r) => new T.Matrix4().compose(new T.Vector3(p[0], p[1], p[2]), new T.Quaternion().setFromEuler(new T.Euler(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0)), new T.Vector3(1, 1, 1));
    const aim = (p, dir) => new T.Matrix4().compose(new T.Vector3(p[0], p[1], p[2]), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, -1, 0), new T.Vector3(dir[0], dir[1], dir[2]).normalize()), new T.Vector3(1, 1, 1));
    const seed = kind.length * 17 + kind.charCodeAt(0);
    const FRONT = PI / 2;

    // a hidden stump: meat round a nub of bone, facing along dir; the far side of a joint gets a plain disc
    const gore = (p, dir, R, bone, nub = true) => m.tube(nub
      ? [{ y: 0, rx: R, rz: R, b: [bone, 1] }, { y: -0.004, rx: R * 0.62, rz: R * 0.62, b: [bone, 1] }, { y: -0.012, rx: R * 0.3, rz: R * 0.3, b: [bone, 1] }, { y: -0.03, rx: R * 0.22, rz: R * 0.22, b: [bone, 1] }, { y: -0.034, rx: 0.003, rz: 0.003, b: [bone, 1] }]
      : [{ y: 0, rx: R, rz: R, b: [bone, 1] }, { y: -0.003, rx: R * 0.5, rz: R * 0.5, b: [bone, 1] }, { y: -0.005, rx: 0.003, rz: 0.003, b: [bone, 1] }],
    8, aim(p, dir), { share: nub ? 'gore' : 'gore2', flag: 'gore', name: 'gore' });

    // ---- torso ----
    const cl = L.cloth || 1, bw = 0.55 + 0.45 * bd.belly, bz = bd.belly, cw = bd.chest, cz = 0.4 + 0.6 * bd.chest;
    const paunch = bd.belly > 1.2 ? 0.035 * (bd.belly - 1) / 0.5 : 0;
    const TR = [
      [0.845, 0.118, 0.098, 0, [B.hips, 1]], [0.885, 0.156 * (0.7 + 0.3 * bw), 0.112 * (0.7 + 0.3 * bz), 0, [B.hips, 1]], [0.94, 0.172 * (0.6 + 0.4 * bw), 0.12 * (0.6 + 0.4 * bz), paunch * 0.5, [B.hips, 1]],
      [1.00, 0.168 * bw, 0.116 * bz, paunch, [B.hips, 0.7, B.spine]], [1.08, 0.152 * bw, 0.106 * bz * (bz > 1.2 ? 1.2 : 1), paunch * 1.3, [B.spine, 0.8, B.hips]],
      [1.17, 0.158 * bw, 0.112 * bz * (bz > 1.2 ? 1.12 : 1), paunch, [B.spine, 1]], [1.26, 0.166 * cw, 0.12 * cz, 0.008 + paunch * 0.4, [B.spine, 0.5, B.chest]],
      [1.35, 0.178 * cw, 0.13 * cz, 0.012, [B.chest, 1]], [1.42, 0.18 * cw, 0.124 * cz, 0.012, [B.chest, 1]], [1.47, 0.17 * cw, 0.108 * (0.6 + 0.4 * cz), 0.01, [B.chest, 1]],
      [1.505, 0.118 * cw, 0.088, 0.006, [B.chest, 1]], [1.535, 0.064 * bd.neck, 0.068 * bd.neck, 0.004, [B.chest, 0.6, B.neck]],
    ];
    const torsoR = (y) => [table(TR.map((r) => [r[0], r[1]]), y) * cl, table(TR.map((r) => [r[0], r[2]]), y) * cl, table(TR.map((r) => [r[0], r[3]]), y)];
    m.tube(TR.map(([y, rx, rz, oz, b]) => ({ y, rx: rx * (y > 1.49 ? 1 : cl), rz: rz * (y > 1.49 ? 1 : cl), oz, b })), 20, null, { capA: true, name: 'torso' });
    if (L.collar) m.tube([{ y: 1.512, rx: 0.086 * bd.neck, rz: 0.084 * bd.neck, b: [B.chest, 1] }, { y: 1.556, rx: 0.074 * bd.neck, rz: 0.078 * bd.neck, oz: -0.006, b: [B.chest, 0.6, B.neck] }], 14, null, { name: 'collar' });

    // ---- neck ----
    const neck0 = m.count();
    m.tube([{ y: 1.50, rx: 0.058 * bd.neck, rz: 0.06 * bd.neck, b: [B.neck, 1] }, { y: 1.555, rx: 0.052 * bd.neck, rz: 0.056 * bd.neck, oz: 0.004, b: [B.neck, 0.7, B.head] }, { y: 1.615, rx: 0.05 * bd.neck, rz: 0.055 * bd.neck, oz: 0.004, b: [B.head, 0.6, B.neck] }], 12, null, { name: 'neck' });
    if (L.throat) m.sculpt(neck0, m.count(), (x, y, z) => (z > 0 ? [0, 0, 0.03 * Math.exp(-((x / 0.05) ** 2))] : null));
    gore([0, 1.535, 0], [0, 1, 0], 0.046 * bd.neck, B.chest);
    gore([0, 1.575, 0], [0, -1, 0], 0.044 * bd.neck, B.head, false);

    // ---- head and jaw ----
    const hs = bd.head, HY = 1.6;
    const HR = [[0.018, 0.053, 0.062, 0.020], [0.030, 0.059, 0.071, 0.018], [0.046, 0.065, 0.080, 0.014], [0.064, 0.071, 0.088, 0.011], [0.084, 0.076, 0.094, 0.008], [0.105, 0.079, 0.097, 0.005],
      [0.126, 0.080, 0.099, 0.002], [0.148, 0.080, 0.099, -0.001], [0.168, 0.077, 0.096, -0.003], [0.184, 0.068, 0.086, -0.005], [0.196, 0.052, 0.066, -0.006], [0.203, 0.028, 0.036, -0.006], [0.206, 0.006, 0.008, -0.006]];
    const JR = [[0.018, 0.052, 0.061, 0.021], [0.004, 0.051, 0.059, 0.022], [-0.012, 0.046, 0.053, 0.025], [-0.026, 0.035, 0.04, 0.028], [-0.034, 0.012, 0.016, 0.03]];
    const hr = (rows, bone) => rows.map(([y, rx, rz, oz]) => ({ y: HY + y * hs, rx: rx * hs, rz: rz * hs, oz: oz * hs, b: [bone, 1] }));
    const head0 = m.count();
    m.tube(hr(HR, B.head), 32, null, { group: 'head', dens: 2.5, name: 'head' });
    m.tube(hr(JR, B.jaw), 32, null, { group: 'head', dens: 2.5, capB: true, name: 'jaw' });
    const head1 = m.count();
    // the face: sockets, brow, what is left of a nose, hollow cheeks over the cheekbones, teeth pushed forward
    const g2 = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
    m.sculpt(head0, head1, (x, y, z) => {
      const xx = x / hs, yy = (y - HY) / hs, zz = z / hs, ax = Math.abs(xx);
      if (zz < 0.0) return yy < 0.07 ? [0, -hs * 0.034 * sstep(0, 0.07, -zz) * (1 - yy / 0.07), 0] : null;   // the skull sits lower at the back
      let d = 0;
      const e = Math.hypot((ax - 0.033) / 0.025, (yy - 0.106) / 0.021); if (e < 1) d -= 0.018 * (1 - e * e);
      d += 0.007 * Math.exp(-(((yy - 0.13) / 0.011) ** 2)) * sstep(0.08, 0.055, ax);
      d += 0.013 * Math.exp(-((xx / 0.011) ** 2)) * sstep(0.05, 0.062, yy) * sstep(0.118, 0.1, yy) + 0.011 * g2(xx, yy, 0, 0.064, 0.015, 0.012);
      d -= 0.011 * g2(ax, yy, 0.05, 0.05, 0.02, 0.024);
      d += 0.005 * g2(ax, yy, 0.057, 0.087, 0.016, 0.012);
      d += 0.006 * g2(xx, yy, 0, 0.02, 0.036, 0.02);
      return [0, 0, d * hs * sstep(0.0, 0.03, zz)];
    });
    // the inside of the mouth, seen when the jaw drops
    m.tube([{ y: HY + 0.02 * hs, rx: 0.049 * hs, rz: 0.058 * hs, oz: 0.02 * hs, b: [B.head, 1] }, { y: HY + 0.04 * hs, rx: 0.03 * hs, rz: 0.04 * hs, oz: 0.014 * hs, b: [B.head, 1] }, { y: HY + 0.05 * hs, rx: 0.004, rz: 0.004, oz: 0.01 * hs, b: [B.head, 1] }], 10, null, { flag: 'dark', share: 'dark', name: 'palate' });
    m.tube([{ y: HY + 0.012 * hs, rx: 0.048 * hs, rz: 0.056 * hs, oz: 0.021 * hs, b: [B.jaw, 1] }, { y: HY - 0.004 * hs, rx: 0.03 * hs, rz: 0.04 * hs, oz: 0.02 * hs, b: [B.jaw, 1] }, { y: HY - 0.01 * hs, rx: 0.004, rz: 0.004, oz: 0.02 * hs, b: [B.jaw, 1] }], 10, null, { flag: 'dark', share: 'dark', name: 'tongue' });
    if (L.mitre) m.tube([[0.176, 0.083, 0.094, -0.003], [0.2, 0.09, 0.096, -0.004], [0.27, 0.083, 0.07, -0.004], [0.345, 0.056, 0.046, -0.004], [0.405, 0.022, 0.02, -0.004], [0.425, 0.004, 0.004, -0.004]]
      .map(([y, rx, rz, oz]) => ({ y: HY + y * hs, rx: rx * hs, rz: rz * hs, oz: oz * hs, b: [B.head, 1] })), 20, null, { group: 'head', dens: 1.6, name: 'mitre' });
    if (L.helmet) m.tube([[0.146, 0.081, 0.099, -0.001], [0.15, 0.122, 0.136, 0.0], [0.158, 0.088, 0.104, -0.002], [0.19, 0.084, 0.1, -0.003], [0.212, 0.062, 0.076, -0.004], [0.226, 0.02, 0.028, -0.005]]
      .map(([y, rx, rz, oz]) => ({ y: HY + y * hs, rx: rx * hs, rz: rz * hs, oz: oz * hs, b: [B.head, 1] })), 20, null, { group: 'head', dens: 1.6, capB: true, name: 'helmet' });
    if (L.hood) {
      // a shroud pulled over the skull and lying on the shoulders, open round the face
      const rows = [[HY + 0.214 * hs, 0.02, 0.03, B.head], [HY + 0.202 * hs, 0.062 * hs, 0.078 * hs, B.head], [HY + 0.176 * hs, 0.086 * hs, 0.104 * hs, B.head], [HY + 0.13 * hs, 0.092 * hs, 0.11 * hs, B.head], [HY + 0.075 * hs, 0.092 * hs, 0.11 * hs, B.head], [HY + 0.025 * hs, 0.088 * hs, 0.104 * hs, B.head]];
      const rings = rows.map(([y, rx, rz, b]) => ({ y, rx, rz, oz: -0.004, b: [b, 1] }));
      rings.push({ y: 1.565, rx: 0.1, rz: 0.1, oz: -0.006, b: [B.neck, 0.6, B.head] }, { y: 1.505, rx: 0.17 * cw, rz: 0.118, oz: 0, b: [B.chest, 1] }, { y: 1.43, rx: 0.214 * cw, rz: 0.14, oz: 0.004, b: [B.chest, 1] });
      m.tube(rings, 22, null, { arc: [FRONT + 0.92, FRONT + PI * 2 - 0.92], ragged: 0.3, dens: 1.3, name: 'hood' });
    }
    if (L.hair) {
      const rows = [[HY + 0.204 * hs, 0.05, 0.062, B.head, 1], [HY + 0.172 * hs, 0.083 * hs, 0.101 * hs, B.head, 1], [HY + 0.1 * hs, 0.087 * hs, 0.105 * hs, B.head, 1], [HY + 0.03 * hs, 0.087 * hs, 0.102 * hs, B.head, 1], [1.56, 0.095, 0.098, B.neck, 0.6], [1.45, 0.125, 0.108, B.chest, 1], [1.36, 0.13, 0.11, B.chest, 1]];
      m.tube(rows.map(([y, rx, rz, b, w]) => ({ y, rx, rz, oz: -0.004, b: w < 1 ? [b, w, B.head] : [b, 1] })), 16, null, { arc: [FRONT + 1.25, FRONT + PI * 2 - 1.25], ragged: 0.62, group: 'head', dens: 1.5, name: 'hair' });
    }

    // ---- arms ----
    const AR = [[-0.022, 0.024], [0, 0.052], [0.045, 0.057], [0.12, 0.052], [0.2, 0.046], [0.265, 0.041], [0.31, 0.039], [0.39, 0.042], [0.48, 0.034], [0.54, 0.028], [0.565, 0.026]];
    for (const s of [1, -1]) {
      const ua = s > 0 ? B.uaL : B.uaR, fa = s > 0 ? B.faL : B.faR, h = s > 0 ? B.hL : B.hR, k = bd.arm;
      const cover = L.sleeve[s > 0 ? 0 : 1] * 0.565, sk = L.sleeveK || 1.15, wide = sk > 1.4;
      const sx = s * 0.215 * (0.75 + 0.25 * bd.chest), top = 1.47;
      const wt = (d) => (d < 0.02 ? [B.chest, 0.5, ua] : d < 0.23 ? [ua, 1] : d < 0.285 ? [ua, 0.6, fa] : d < 0.34 ? [fa, 0.62, ua] : d < 0.53 ? [fa, 1] : [fa, 0.5, h]);
      const ds = AR.map((r) => r[0]);
      if (cover > 0.03 && cover < 0.55) ds.push(cover - 0.004, cover + 0.004);
      ds.sort((a, b) => a - b);
      const rings = ds.map((d) => {
        const clothed = d <= cover - 0.003 || cover >= 0.55, r = table(AR, d) * k * (clothed ? sk * (wide ? 1 + 0.5 * d : 1) : 1);
        return { y: -d, rx: r, rz: r * 0.95, ox: s * d * 0.05, b: wt(d) };
      });
      m.tube(rings, 12, M4([sx, top, 0]), { twist: s > 0 ? PI : 0, capA: true, name: 'arm' + (s > 0 ? 'L' : 'R') });
      if (wide) m.tube([{ y: -(cover - 0.03), rx: table(AR, cover) * k * sk * 1.3, rz: table(AR, cover) * k * sk * 1.25, ox: s * cover * 0.05, b: wt(cover - 0.03) }, { y: -(cover + 0.1), rx: table(AR, cover) * k * sk * 1.75, rz: table(AR, cover) * k * sk * 1.5, ox: s * cover * 0.05, b: wt(cover) }],
        12, M4([sx, top, 0]), { twist: s > 0 ? PI : 0, ragged: 0.7, name: 'cuff' });
      // stumps hidden in the shoulder and the elbow
      const sh = BONES[ua][2], el = BONES[fa][2], dn = [s * 0.05, -1, 0];
      gore([sh[0] - s * 0.02, sh[1] - 0.02, 0], [s * 0.6, -0.8, 0], 0.05 * k, B.chest);
      gore([sh[0] + s * 0.004, sh[1] - 0.045, 0], [-s * 0.6, 0.8, 0], 0.046 * k, ua, false);
      gore([el[0] - s * 0.002, el[1] + 0.035, 0], dn, 0.034 * k, ua);
      gore([el[0], el[1] + 0.012, 0], [-dn[0], 1, 0], 0.031 * k, fa, false);
      // hand: a flat palm, four hooked fingers and a thumb
      const hk = k * (L.hand || 1.28), hx = sx + s * 0.0285, hy = top - 0.56;
      m.tube([{ y: 0, rx: 0.03 * hk, rz: 0.02 * hk, b: [h, 1] }, { y: -0.045, rx: 0.044 * hk, rz: 0.018 * hk, b: [h, 1] }, { y: -0.098, rx: 0.04 * hk, rz: 0.015 * hk, b: [h, 1] }], 10, M4([hx, hy, 0.008]), { capB: true, dens: 1.3, name: 'palm' });
      for (let f = 0; f < 4; f++) {
        const fx = (f - 1.5) * 0.021 * hk, fl = (0.082 + (f === 1 || f === 2 ? 0.014 : 0)) * hk;
        m.tube([{ y: 0, rx: 0.0098 * hk, rz: 0.0098 * hk, b: [h, 1] }, { y: -fl * 0.5, rx: 0.0085 * hk, rz: 0.0085 * hk, oz: 0.012, b: [h, 1] }, { y: -fl * 0.85, rx: 0.006 * hk, rz: 0.006 * hk, oz: 0.03, b: [h, 1] }, { y: -fl, rx: 0.0025, rz: 0.0025, oz: 0.042, b: [h, 1] }],
          6, M4([hx + fx, hy - 0.094, 0.008]), { capB: true, dens: 1.3, name: 'finger' });
      }
      m.tube([{ y: 0, rx: 0.0115 * hk, rz: 0.0115 * hk, b: [h, 1] }, { y: -0.035 * hk, rx: 0.009 * hk, rz: 0.009 * hk, b: [h, 1] }, { y: -0.062 * hk, rx: 0.003, rz: 0.003, b: [h, 1] }], 6, M4([hx - s * 0.036 * hk, hy - 0.03, 0.02], [0.5, 0, -s * 0.75]), { capB: true, dens: 1.3, name: 'thumb' });
    }

    // ---- legs and feet ----
    const LR = [[0, 0.094], [0.07, 0.09], [0.2, 0.08], [0.36, 0.062], [0.445, 0.056], [0.5, 0.054], [0.6, 0.058], [0.74, 0.044], [0.85, 0.036], [0.875, 0.034]];
    for (const s of [1, -1]) {
      const th = s > 0 ? B.thL : B.thR, shn = s > 0 ? B.shL : B.shR, ft = s > 0 ? B.ftL : B.ftR, k = bd.leg, side = s > 0 ? 0 : 1;
      const cover = L.trouser[side] * 0.875, tk = L.trouserK || 1.16, foot = L.feet[side], boot = foot === 'boot';
      const wt = (d) => (d < 0.03 ? [B.hips, 0.6, th] : d < 0.4 ? [th, 1] : d < 0.47 ? [th, 0.6, shn] : d < 0.55 ? [shn, 0.65, th] : d < 0.82 ? [shn, 1] : [shn, 0.6, ft]);
      const ds = LR.map((r) => r[0]);
      if (cover > 0.03 && cover < 0.86) ds.push(cover - 0.004, cover + 0.004);
      if (boot) ds.push(0.616, 0.624);
      ds.sort((a, b) => a - b);
      const rings = ds.map((d) => {
        const clothed = d <= cover - 0.003 || cover >= 0.86;
        let r = table(LR, d) * k * (clothed ? tk : 1);
        if (boot && d > 0.62) r = Math.max(r, 0.062 * k) * 1.08;
        return { y: -d, rx: r, rz: r * 1.04, oz: d > 0.5 && d < 0.75 ? -0.008 : 0, b: wt(d) };
      });
      m.tube(rings, 12, M4([s * 0.098, 0.95, 0]), { twist: s > 0 ? PI : 0, name: 'leg' + (s > 0 ? 'L' : 'R') });
      const hp = BONES[th][2], kn = BONES[shn][2];
      gore([hp[0], hp[1] - 0.025, 0], [0, -1, 0], 0.074 * k, B.hips);
      gore([hp[0], hp[1] - 0.05, 0], [0, 1, 0], 0.07 * k, th, false);
      gore([kn[0], kn[1] + 0.045, 0], [0, -1, 0], 0.046 * k, th);
      gore([kn[0], kn[1] + 0.02, 0], [0, 1, 0], 0.042 * k, shn, false);
      const fk = boot ? 1.3 : 1, F = (rows) => rows.map(([y, rx, rz]) => ({ y: y * fk, rx: rx * fk, rz: rz * fk, b: [ft, 1] }));
      if (foot === 'bare') m.tube(F([[-0.07, 0.028, 0.026], [-0.03, 0.036, 0.034], [0.05, 0.042, 0.026], [0.115, 0.047, 0.018], [0.155, 0.043, 0.012], [0.165, 0.02, 0.006]]), 10, M4([s * 0.1, 0.032, 0], [PI / 2, 0, 0]), { capA: true, capB: true, name: 'foot' });
      else m.tube(F([[-0.085, 0.046, 0.04], [-0.02, 0.05, 0.048], [0.07, 0.052, 0.04], [0.15, 0.046, 0.03], [0.19, 0.03, 0.018]]), 10, M4([s * 0.1, 0.045 * fk, 0], [PI / 2, 0, 0]), { capA: true, capB: true, name: 'shoe' });
    }

    // ---- what hangs from the body ----
    const sideB = (w) => (lx) => { const k = w * sstep(0.015, 0.14, Math.abs(lx)); return k < 0.01 ? [B.hips, 1] : [lx > 0 ? B.thL : B.thR, k, B.hips]; };
    const shinB = (lx) => { const k = 0.9 * sstep(0.015, 0.14, Math.abs(lx)); return k < 0.01 ? [B.hips, 1] : [lx > 0 ? B.shL : B.shR, k, B.hips]; };
    const around = (y, grow, b, add = 0.004) => { const r = torsoR(y); return { y, rx: r[0] * grow + add, rz: r[1] * grow + add, oz: r[2], b }; };
    if (L.hem === 'jacket') m.tube([around(1.05, 1, [B.spine, 0.5, B.hips]), { y: 0.97, rx: 0.19, rz: 0.138, b: [B.hips, 1] }, { y: 0.86, rx: 0.194, rz: 0.144, b: sideB(0.35) }, { y: 0.73, rx: 0.197, rz: 0.147, b: sideB(0.55) }], 20, null, { ragged: 0.45, name: 'hem' });
    if (L.hem === 'coat') m.tube([around(1.05, 1, [B.spine, 0.5, B.hips]), { y: 0.96, rx: 0.196, rz: 0.142, b: [B.hips, 1] }, { y: 0.8, rx: 0.205, rz: 0.152, b: sideB(0.4) }, { y: 0.62, rx: 0.212, rz: 0.158, b: sideB(0.7) }, { y: 0.52, rx: 0.215, rz: 0.16, b: sideB(0.8) }], 20, null, { ragged: 0.1, name: 'hem' });
    if (L.hem === 'tail') m.tube([around(1.03, 1, [B.spine, 0.5, B.hips]), { y: 0.95, rx: 0.186, rz: 0.134, b: [B.hips, 1] }, { y: 0.86, rx: 0.19, rz: 0.138, b: sideB(0.3) }], 20, null, { ragged: 0.7, name: 'hem' });
    if (L.hem === 'loin') m.tube([around(1.0, 1, [B.hips, 1], 0.006), { y: 0.9, rx: 0.16, rz: 0.116, b: [B.hips, 1] }, { y: 0.74, rx: 0.172, rz: 0.126, b: sideB(0.5) }], 20, null, { ragged: 0.6, name: 'hem' });
    if (L.hem === 'gown') m.tube([around(1.3, 1, [B.spine, 0.5, B.chest], 0.006), around(1.17, 1, [B.spine, 1], 0.01), around(1.05, 1, [B.spine, 0.6, B.hips], 0.012), { y: 0.9, rx: 0.236, rz: 0.24, oz: 0.02, b: [B.hips, 1] }, { y: 0.7, rx: 0.24, rz: 0.225, oz: 0.01, b: sideB(0.5) }, { y: 0.52, rx: 0.245, rz: 0.22, b: sideB(0.8) }, { y: 0.38, rx: 0.25, rz: 0.22, b: shinB }], 22, null, { ragged: 0.34, name: 'gown' });
    if (L.hem === 'apron') {
      const rows = [1.4, 1.32, 1.2, 1.08, 0.98].map((y) => around(y, 1.03, y > 1.25 ? [B.chest, 1] : y > 1.05 ? [B.spine, 1] : [B.spine, 0.5, B.hips], 0.012));
      rows.push({ y: 0.86, rx: 0.24, rz: 0.2, oz: 0.03, b: [B.hips, 1] }, { y: 0.68, rx: 0.24, rz: 0.19, oz: 0.02, b: sideB(0.5) }, { y: 0.5, rx: 0.24, rz: 0.185, oz: 0.02, b: sideB(0.75) });
      m.tube(rows.reverse(), 14, null, { arc: [FRONT - 1.2, FRONT + 1.2], ragged: 0.3, name: 'apron' });
    }
    if (L.hem === 'robe') {
      m.tube([around(1.04, 1, [B.spine, 0.5, B.hips], 0.008), { y: 0.92, rx: 0.215, rz: 0.17, b: [B.hips, 1] }, { y: 0.7, rx: 0.25, rz: 0.2, b: sideB(0.5) }, { y: 0.48, rx: 0.275, rz: 0.225, b: sideB(0.8) }, { y: 0.26, rx: 0.295, rz: 0.245, b: shinB }, { y: 0.07, rx: 0.31, rz: 0.26, b: shinB }], 24, null, { ragged: 0.2, name: 'robe' });
      // the chasuble: a panel down the front and another down the back
      for (const f of [1, -1]) {
        const rows = [1.5, 1.44, 1.34, 1.2, 1.06].map((y) => around(y, 1.05, y > 1.25 ? [B.chest, 1] : [B.spine, 1], 0.016));
        rows.push({ y: 0.9, rx: 0.235, rz: 0.19, b: [B.hips, 1] }, { y: 0.72, rx: 0.24, rz: 0.2, b: sideB(0.4) }, { y: 0.56, rx: 0.24, rz: 0.2, b: sideB(0.6) });
        const c = f > 0 ? FRONT : FRONT + PI;
        m.tube(rows.reverse(), 12, null, { arc: [c - 1.0, c + 1.0], ragged: 0.4, name: 'chasuble' });
      }
    }
    if (L.bishop) {
      // a broken stone cross driven through one shoulder, withered arms grown from the back, faces under the skin
      const sq = Math.SQRT2, beam = (p, r, len, hw) => m.tube([{ y: 0, rx: hw * sq, rz: hw * sq * 0.6, b: [B.chest, 1] }, { y: len, rx: hw * sq, rz: hw * sq * 0.6, b: [B.chest, 1] }], 4, M4(p, r), { twist: PI / 4, capA: true, capB: true, name: 'cross' });
      const up = new T.Vector3(0, 1, 0).applyEuler(new T.Euler(-0.2, 0, -0.3)), across = new T.Vector3(0, 1, 0).applyEuler(new T.Euler(-0.2, 0, -0.3 + PI / 2));
      beam([0.2, 1.3, -0.11], [-0.2, 0, -0.3], 0.86, 0.05);
      beam([0.2 + up.x * 0.6 - across.x * 0.26, 1.3 + up.y * 0.6 - across.y * 0.26, -0.11 + up.z * 0.6 - across.z * 0.26], [-0.2, 0, -0.3 + PI / 2], 0.52, 0.045);
      const limb = (p, d1, l1, d2, l2, r) => {
        const e = [p[0] + d1[0] * l1, p[1] + d1[1] * l1, p[2] + d1[2] * l1], w = [B.chest, 1];
        m.tube([{ y: 0, rx: r, rz: r, b: w }, { y: -l1 * 0.5, rx: r * 0.8, rz: r * 0.8, b: w }, { y: -l1, rx: r * 0.7, rz: r * 0.7, b: w }], 7, aim(p, d1), { name: 'spare' });
        m.tube([{ y: 0, rx: r * 0.72, rz: r * 0.72, b: w }, { y: -l2 * 0.6, rx: r * 0.6, rz: r * 0.6, b: w }, { y: -l2, rx: r * 0.5, rz: r * 0.42, b: w }, { y: -l2 - 0.07, rx: r * 0.75, rz: r * 0.3, b: w }, { y: -l2 - 0.16, rx: r * 0.5, rz: 0.006, b: w }], 7, aim(e, d2), { capB: true, name: 'spare' });
      };
      const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
      limb([-0.12, 1.42, -0.12], nrm([-0.7, 0.55, -0.4]), 0.34, nrm([-0.75, -0.35, 0.3]), 0.3, 0.03);
      limb([-0.16, 1.26, -0.12], nrm([-0.9, 0.1, -0.35]), 0.3, nrm([-0.5, -0.7, 0.4]), 0.28, 0.028);
      limb([0.1, 1.44, -0.13], nrm([0.45, 0.8, -0.35]), 0.3, nrm([0.8, 0.2, 0.3]), 0.26, 0.027);
      const lump = (p, r, bone) => { const rings = []; for (let i = 0; i <= 6; i++) { const a = (i / 6) * PI; rings.push({ y: -Math.cos(a) * r * 1.15, rx: Math.max(0.004, Math.sin(a) * r), rz: Math.max(0.004, Math.sin(a) * r), b: [bone, 1] }); } m.tube(rings, 12, M4(p), { twist: PI / 2, name: 'face' }); };
      lump([-0.2, 1.17, 0.1], 0.078, B.spine); lump([0.19, 0.99, 0.12], 0.074, B.hips); lump([0.23, 1.4, -0.03], 0.07, B.chest);
    }

    const geo = m.build();
    geo.userData.kind = kind; geo.userData.headScale = hs;

    // ---- what glows: the eyes, and a spitter's sacs ----
    const gp = [], gc = [], gi = [], gw = [], gx = [];
    const ball = (c, r, bone, col, seg = 8, rows = 5) => {
      const base = gp.length / 3;
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= seg; i++) {
        const v = (j / rows) * PI, u = (i / seg) * PI * 2;
        gp.push(c[0] + Math.sin(v) * Math.cos(u) * r, c[1] + Math.cos(v) * r, c[2] + Math.sin(v) * Math.sin(u) * r);
        gc.push(col[0], col[1], col[2]); gi.push(bone, 0, 0, 0); gw.push(1, 0, 0, 0);
      }
      for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) { const a = base + j * (seg + 1) + i, b = a + 1, c2 = a + seg + 1, d = c2 + 1; gx.push(a, b, c2, b, d, c2); }
    };
    const eye = o.eye || [2, 2, 2];
    if (!L.noEyes) for (const s of [1, -1]) ball([s * 0.033 * hs, HY + 0.106 * hs, 0.073 * hs], 0.0115 * hs, B.head, eye);
    for (const [bone, p, r] of L.sacs || []) ball(p, r, BI[bone], [0.3, 1.1, 0.2], 10, 6);
    const glow = new T.BufferGeometry();
    glow.setAttribute('position', new T.Float32BufferAttribute(gp, 3));
    glow.setAttribute('color', new T.Float32BufferAttribute(gc, 3));
    glow.setAttribute('skinIndex', new T.Uint16BufferAttribute(gi, 4));
    glow.setAttribute('skinWeight', new T.Float32BufferAttribute(gw, 4));
    glow.setIndex(gx);
    glow.boundingSphere = new T.Sphere(new T.Vector3(0, 0.9, 0), 2.6);
    return { geo, glow, kind };
  }

  // A skinned figure in its bind pose: returns the mesh and its bones (indexed as in BONES).
  function rig(T, geo, mat) {
    const bones = BONES.map(([name]) => { const b = new T.Bone(); b.name = name; return b; });
    BONES.forEach(([, parent, p], i) => {
      if (parent < 0) bones[i].position.set(p[0], p[1], p[2]);
      else { const q = BONES[parent][2]; bones[i].position.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]); bones[parent].add(bones[i]); }
    });
    bones[0].updateMatrixWorld(true);
    const skeleton = new T.Skeleton(bones);
    const mesh = new T.SkinnedMesh(geo, mat);
    mesh.add(bones[0]); mesh.bind(skeleton);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = true;
    return { mesh, bones, skeleton };
  }

  // The part of a body that follows the given bones, as a rigid piece about `origin` (a severed limb, a head).
  function extract(T, geo, boneNames, origin) {
    const set = new Set(boneNames.map((n) => BI[n])), P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight, ix = geo.index.array;
    const owner = (i) => (SW.getX(i) >= SW.getY(i) ? SI.getX(i) : SI.getY(i));
    const pos = [], nor = [], uv = [];
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t], b = ix[t + 1], c = ix[t + 2];
      if (!set.has(owner(a)) || !set.has(owner(b)) || !set.has(owner(c))) continue;
      for (const i of [a, b, c]) { pos.push(P.getX(i) - origin[0], P.getY(i) - origin[1], P.getZ(i) - origin[2]); nor.push(N.getX(i), N.getY(i), N.getZ(i)); uv.push(U.getX(i), U.getY(i)); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }

  // The pose the artwork is painted in: arms away from the body, feet apart, mouth a little open.
  const APOSE = { uaL: [0, 0, 0.62], uaR: [0, 0, -0.62], thL: [0, 0, 0.13], thR: [0, 0, -0.13], jaw: [0.2, 0, 0] };
  // Positions (and ring centres) of a body with its bones turned by `pose`, computed without a GPU.
  function posed(T, geo, pose) {
    const { bones, skeleton } = rig(T, geo, null);
    for (const k in pose) bones[BI[k]].rotation.set(pose[k][0], pose[k][1], pose[k][2]);
    bones[0].updateMatrixWorld(true);
    const mats = bones.map((b, i) => new T.Matrix4().multiplyMatrices(b.matrixWorld, skeleton.boneInverses[i]));
    const P = geo.attributes.position, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight, C = geo.userData.bake.centre, n = P.count;
    const out = new Float32Array(n * 3), ctr = new Float32Array(n * 3), v = new T.Vector3(), a = new T.Vector3();
    const skin = (x, y, z, i, dst) => {
      let sx = 0, sy = 0, sz = 0;
      for (const [bi, w] of [[SI.getX(i), SW.getX(i)], [SI.getY(i), SW.getY(i)]]) { if (w <= 0) continue; a.set(x, y, z).applyMatrix4(mats[bi]); sx += a.x * w; sy += a.y * w; sz += a.z * w; }
      dst[i * 3] = sx; dst[i * 3 + 1] = sy; dst[i * 3 + 2] = sz;
    };
    for (let i = 0; i < n; i++) { skin(P.getX(i), P.getY(i), P.getZ(i), i, out); skin(C[i * 3], C[i * 3 + 1], C[i * 3 + 2], i, ctr); }
    const g = geo.clone(); g.userData.seams = geo.userData.seams;
    g.setAttribute('position', new T.Float32BufferAttribute(out, 3));
    smoothNormals(g);
    v.set(0, 0, 0);
    return { position: out, centre: ctr, normal: g.attributes.normal.array };
  }

  V.figure = { BONES, BI, LIMBS, LOOKS, KINDS, ATLAS, APOSE, build, rig, extract, posed, smoothNormals };
})();
