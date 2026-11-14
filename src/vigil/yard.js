/* The graveyard: perimeter wall with iron railings, gates and collapsed sections, rows of graves,
   mausoleums, dead trees, lantern posts and the small furniture of a working churchyard. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const PI = Math.PI;

  // Paths are shared with the ground (which paints them) and with grave placement (which keeps off them).
  const PATHS = [
    { w: 2.6, pts: [[0.4, 63], [-0.6, 46], [0, 30], [0, 14.4]] },
    { w: 1.6, pts: [[0, 16.6], [-9.2, 17.2], [-10.6, 4], [-9.9, -4.5], [-6.9, -4.5]] },
    { w: 1.8, pts: [[-9.9, -4.5], [-30, -4.5], [-46, -3], [-63, -7]] },
    { w: 1.8, pts: [[0, 16.6], [9.4, 17.2], [10.6, 3], [30, 3], [46, 4.5], [63, 2]] },
    { w: 1.8, pts: [[10.6, 3], [10.2, -12], [4.2, -17.2], [0, -30], [1.5, -46], [-1, -63]] },
    { w: 1.4, pts: [[-9.9, -4.5], [-10.2, -14], [-3, -18.4], [4.2, -17.2]] },
  ];
  const segDist = (px, pz, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2));
    return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
  };
  const pathDist = (x, z) => {
    let best = 1e9;
    for (const p of PATHS) for (let i = 0; i < p.pts.length - 1; i++) best = Math.min(best, segDist(x, z, p.pts[i], p.pts[i + 1]) - p.w / 2);
    return best;
  };
  // Openings in the perimeter: gates stay standing, breaches have fallen in.
  const OPENINGS = {
    south: [{ c: 0, hw: 1.9, gate: 'main' }, { c: 18, hw: 2.2 }],
    north: [{ c: -14, hw: 2.2 }, { c: 0, hw: 1.35, gate: 'small' }],
    west: [{ c: -4.5, hw: 1.35, gate: 'small' }, { c: 18, hw: 2.2 }],
    east: [{ c: -16, hw: 2.2 }, { c: 3, hw: 1.35, gate: 'small' }],
  };

  V.yard = {
    PATHS, pathDist, OPENINGS,
    build(B, ctx, church) {
      const g = ctx.g, T = g.THREE, kit = V.kit, rng = kit.rng(90210), Y = V.YARD;
      const info = { lights: [], flames: [], halos: [], graves: [], gates: [], breaches: [], trees: [], keep: [] };
      const keep = info.keep;                       // circles [x, z, r] nothing else may be planted in
      const blocked = (x, z, r) => keep.some((k) => Math.hypot(x - k[0], z - k[1]) < r + k[2]);
      const side = (name, u, w) => (name === 'south' ? [u, Y + w] : name === 'north' ? [u, -Y - w] : name === 'east' ? [Y + w, u] : [-Y - w, u]);

      // ---------------------------------------------------------------- perimeter wall
      const WT = 0.56, WH = 1.2;
      const railing = (name, a, b) => {
        const len = b - a; if (len < 0.5) return;
        const n = Math.max(2, Math.round(len / 0.17));
        for (const y of [WH + 0.3, WH + 1.02]) {
          const [x, z] = side(name, (a + b) / 2, 0);
          B.box('iron', name === 'south' || name === 'north' ? len : 0.035, 0.03, name === 'south' || name === 'north' ? 0.035 : len, x, y, z);
        }
        for (let i = 0; i <= n; i++) {
          if (rng() < 0.035) continue;
          const u = a + (len * i) / n, [x, z] = side(name, u, 0);
          const lean = rng() < 0.05 ? (rng() - 0.5) * 0.5 : 0;
          const bar = kit.box(0.022, 1.02, 0.022); kit.xf(bar, { p: [0, 0.51, 0] });
          const tip = kit.cyl(0.001, 0.03, 0.12, 4); kit.xf(tip, { p: [0, 1.02, 0] });
          for (const geo of [bar, tip]) B.add('iron', geo, { r: [lean, rng() * 0.2, lean * 0.6], p: [x, WH + 0.12, z] });
        }
      };
      const pier = (x, z, s, h, cap = 'pyr') => {
        B.box('ashlar', s, h, s, x, h / 2 - 0.05, z, { bevel: 0.04, tint: 0.9 + rng() * 0.15 });
        B.box('ashlar', s + 0.2, 0.16, s + 0.2, x, h + 0.03, z, { bevel: 0.04 });
        if (cap === 'pyr') B.add('ashlar', kit.cyl(0.02, (s + 0.1) * 0.7, 0.42, 4), { r: [0, PI / 4, 0], p: [x, h + 0.11, z] });
        else { B.add('ashlar', kit.lathe([[0.2, 0], [0.12, 0.08], [0.1, 0.16], [0.2, 0.24], [0.26, 0.36], [0.2, 0.5], [0.06, 0.58], [0.02, 0.62]], 10), { p: [x, h + 0.11, z] }); }
        B.colBox(x, z, s / 2, s / 2, 0, h + 0.2);
      };
      const wallRun = (name, a, b) => {
        if (b - a < 0.3) return;
        const [x, z] = side(name, (a + b) / 2, 0), along = name === 'south' || name === 'north', len = b - a;
        B.box('rubble', along ? len : WT, WH + 0.5, along ? WT : len, x, WH / 2 - 0.25, z);
        B.box('ashlar', along ? len + 0.02 : WT + 0.16, 0.13, along ? WT + 0.16 : len + 0.02, x, WH + 0.06, z, { bevel: 0.035 });
        B.box('ashlar', along ? len : WT + 0.12, 0.3, along ? WT + 0.12 : len, x, 0.1, z, { bevel: 0.04 });
        if (along) { B.col(a, 0, z - WT / 2, b, WH + 0.1, z + WT / 2, 'concrete'); B.col(a, WH, z - 0.1, b, 2.5, z + 0.1, 'metal', { playerOnly: true, noNav: true }); }
        else { B.col(x - WT / 2, 0, a, x + WT / 2, WH + 0.1, b, 'concrete'); B.col(x - 0.1, WH, a, x + 0.1, 2.5, b, 'metal', { playerOnly: true, noNav: true }); }
        // piers along the run, railings between them
        const n = Math.max(1, Math.round(len / 5.6));
        let prev = a;
        for (let i = 1; i < n; i++) {
          const u = a + (len * i) / n, [px, pz] = side(name, u, 0);
          pier(px, pz, 0.72, 1.85);
          railing(name, prev + (i === 1 ? 0.1 : 0.4), u - 0.4);
          prev = u;
        }
        railing(name, prev + (n === 1 ? 0.1 : 0.4), b - 0.1);
      };
      const rubbleHeap = (cx, cz, rx, rz, n, big = 0.5, key = 'rock') => {
        for (let i = 0; i < n; i++) {
          const a = rng() * PI * 2, d = Math.sqrt(rng()), x = cx + Math.cos(a) * rx * d, z = cz + Math.sin(a) * rz * d;
          const s = (0.12 + rng() * big) * (1.1 - d * 0.6);
          if (rng() < 0.4) B.add(key, kit.bevelBox(s * 1.6, s, s * 1.1, s * 0.08), { r: [rng() * 0.6, rng() * 6, rng() * 0.6], p: [x, s * 0.3 + (1 - d) * 0.22, z], tint: 0.8 + rng() * 0.35 });
          else B.add(key, kit.rock(s * 0.8, 30 + i, 0), { r: [rng() * 6, rng() * 6, 0], p: [x, s * 0.25 + (1 - d) * 0.2, z], tint: 0.8 + rng() * 0.35 });
        }
      };
      // Wrought-iron gate leaf, hinge at x = 0 extending +x, in local space.
      const gateLeaf = (w, h) => {
        const P = new kit.Part();
        P.box('iron', 0.05, h, 0.05, 0.025, h / 2, 0); P.box('iron', 0.05, h + 0.25, 0.05, w - 0.025, (h + 0.25) / 2, 0);
        P.box('iron', w, 0.05, 0.035, w / 2, 0.12, 0); P.box('iron', w, 0.05, 0.035, w / 2, h * 0.52, 0);
        const n = Math.round(w / 0.14);
        for (let i = 1; i < n; i++) {
          const x = (w * i) / n, top = h + 0.25 * (x / w) + 0.06;
          P.box('iron', 0.02, top - 0.1, 0.02, x, (top + 0.1) / 2, 0);
          P.add('iron', kit.cyl(0.001, 0.028, 0.11, 4), { p: [x, top, 0] });
        }
        P.add('iron', kit.tube([[0.05, h, 0], [w * 0.5, h + 0.16, 0], [w - 0.03, h + 0.25, 0]], 0.02, 5));
        for (const x of [w * 0.3, w * 0.7]) P.add('iron', kit.tube(Array.from({ length: 9 }, (_, i) => [x + Math.cos(i / 8 * PI * 2) * 0.1, h * 0.32 + Math.sin(i / 8 * PI * 2) * 0.1, 0]), 0.012, 4));
        return P;
      };
      for (const name of ['south', 'north', 'west', 'east']) {
        let cur = -Y - WT / 2;
        for (const o of OPENINGS[name].slice().sort((p, q) => p.c - q.c)) {
          wallRun(name, cur, o.c - o.hw - (o.gate ? 0.45 : 0));
          cur = o.c + o.hw + (o.gate ? 0.45 : 0);
          const [gx, gz] = side(name, o.c, 0);
          const nx = name === 'east' ? 1 : name === 'west' ? -1 : 0, nz = name === 'south' ? 1 : name === 'north' ? -1 : 0;
          if (o.gate) {
            const main = o.gate === 'main', ph = main ? 3.1 : 2.4, ps = main ? 1.0 : 0.8;
            for (const s of [-1, 1]) { const [px, pz] = side(name, o.c + s * (o.hw + ps / 2 - 0.05), 0); pier(px, pz, ps, ph, 'urn'); }
            // leaves stand open into the yard
            for (const s of [-1, 1]) {
              const P = gateLeaf(o.hw - 0.08, main ? 2.0 : 1.7);
              const [hx, hz] = side(name, o.c + s * (o.hw - 0.02), 0);
              const swing = (main ? 1.35 : 1.2) + rng() * 0.25;
              // closed, the leaf points from its hinge to the middle of the opening; open, it swings into the yard
              const th = name === 'south' ? (s > 0 ? PI - swing : swing) : name === 'north' ? (s > 0 ? PI + swing : -swing)
                : name === 'east' ? (s > 0 ? PI / 2 + swing : -PI / 2 - swing) : (s > 0 ? PI / 2 - swing : -PI / 2 + swing);
              P.commit(B, { p: [hx, 0.04, hz], r: [0, th, 0] });
            }
            if (main) {
              // overthrow arch with a lantern
              const pts = Array.from({ length: 9 }, (_, i) => { const a = PI - (i / 8) * PI; return [Math.cos(a) * (o.hw + 0.1), 3.0 + Math.sin(a) * 1.0, 0]; });
              const arch = kit.tube(pts, 0.03, 5); const arch2 = kit.tube(pts.map((p) => [p[0] * 0.86, p[1] - 0.16, 0]), 0.018, 5);
              for (const geo of [arch, arch2]) B.add('iron', geo, { p: [gx, 0, gz] });
              info.lanternAt = info.lanternAt || [];
              info.lanternAt.push([gx, 3.55, gz, true]);
            }
            B.slab('flagOut', gx - (nx ? 0.7 : o.hw + 0.3), -0.08, gz - (nz ? 0.7 : o.hw + 0.3), gx + (nx ? 0.7 : o.hw + 0.3), 0.035, gz + (nz ? 0.7 : o.hw + 0.3));
            info.gates.push({ x: gx, z: gz, nx, nz, main });
          } else {
            // collapsed section: stub ends and a spill of stone
            rubbleHeap(gx - nx * 0.4, gz - nz * 0.4, nx ? 1.6 : o.hw + 0.4, nz ? 1.6 : o.hw + 0.4, 38, 0.5, 'rock');
            for (const s of [-1, 1]) {
              const [sx, sz] = side(name, o.c + s * (o.hw + 0.05), 0);
              B.add('rubble', kit.bevelBox(nz ? 0.9 : WT, 0.7, nz ? WT : 0.9, 0.05), { r: [0, 0, s * 0.25 * (nz ? 1 : 0)], p: [sx - (nz ? s * 0.3 : 0), 0.5, sz - (nx ? s * 0.3 : 0)] });
            }
            info.breaches.push({ x: gx, z: gz, nx, nz });
          }
          keep.push([gx, gz, o.hw + 1.6]);
        }
        wallRun(name, cur, Y + WT / 2);
      }
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, 1], [1, -1]]) pier(sx * Y, sz * Y, 0.95, 2.2, 'urn');

      // ---------------------------------------------------------------- lanterns
      const lantern = (x, y, z, hung) => {
        const P = new kit.Part();
        P.box('iron', 0.3, 0.03, 0.3, 0, 0, 0); P.box('iron', 0.34, 0.03, 0.34, 0, 0.42, 0);
        P.add('iron', kit.cyl(0.02, 0.2, 0.14, 4), { r: [0, PI / 4, 0], p: [0, 0.43, 0] });
        for (const [sx, sz] of [[-1, -1], [-1, 1], [1, 1], [1, -1]]) P.box('iron', 0.022, 0.42, 0.022, sx * 0.135, 0.21, sz * 0.135);
        P.box('ember', 0.2, 0.3, 0.2, 0, 0.2, 0, { cast: false });
        P.add('iron', kit.tube([[0, 0.57, 0], [0, 0.66, 0.03], [0, 0.72, 0]], 0.012, 4));
        P.commit(B, { p: [x, y, z] });
        info.flames.push([x, y + 0.26, z, 1.3]);
        info.lights.push({ pos: [x, y + 0.2, z], color: 0xff9a3c, intensity: hung ? 20 : 15, dist: 16, flicker: 0.14 });
        info.halos.push([x, y + 0.2, z, 3.0, 8.5]);
      };
      const lanternPost = (x, z, ry) => {
        const P = new kit.Part();
        P.add('iron', kit.lathe([[0.16, 0], [0.16, 0.06], [0.09, 0.14], [0.055, 0.3], [0.045, 1.2], [0.06, 1.24], [0.04, 1.3], [0.035, 2.9], [0.05, 2.94], [0.02, 3.0]], 8));
        P.add('iron', kit.tube([[0, 2.7, 0], [0.2, 3.0, 0], [0.5, 3.05, 0], [0.62, 2.92, 0]], 0.018, 5));
        P.add('iron', kit.tube([[0, 2.35, 0], [0.22, 2.5, 0], [0.4, 2.8, 0]], 0.012, 4));
        P.commit(B, { p: [x, 0, z], r: [0, ry, 0] });
        lantern(x + Math.cos(ry) * 0.62, 2.22, z - Math.sin(ry) * 0.62, false);
        B.colBox(x, z, 0.1, 0.1, 0, 3, 'metal', { noNav: true });
        keep.push([x, z, 1.2]);
      };
      for (const [x, z, ry] of [[2.3, 22.4, PI], [-2.4, 38.5, 0], [-11.4, -2.6, 0], [11.9, 4.6, PI], [5.6, -19.4, PI / 2], [-13.6, 18.2, -PI / 2], [16.5, -6.5, PI], [-18.5, -19.5, 0]]) lanternPost(x, z, ry);
      for (const l of info.lanternAt || []) lantern(l[0], l[1], l[2], true);

      // ---------------------------------------------------------------- mausoleums
      const crypt = (x, z, q, seed) => {                     // q = quarter turns; the door faces local +z
        const P = new kit.Part(), r2 = kit.rng(seed), w = 2.2, d = 2.8, h = 3.3;
        P.box('rubble', w * 2, h + 0.4, d * 2, 0, h / 2 - 0.2, 0);
        P.box('ashlar', w * 2 + 0.3, 0.5, d * 2 + 0.3, 0, 0.2, 0, { bevel: 0.05 });
        P.box('ashlar', w * 2 + 0.36, 0.26, d * 2 + 0.36, 0, h + 0.1, 0, { bevel: 0.05 });
        for (const [sx, sz] of [[-1, -1], [-1, 1], [1, 1], [1, -1]]) for (let y = 0.5, i = 0; y < h - 0.2; y += 0.43, i++) {
          const lx = i % 2 ? 0.34 : 0.6, lz = i % 2 ? 0.6 : 0.34;
          P.box('ashlar', lx, 0.4, lz, sx * (w - lx / 2 + 0.03), y + 0.2, sz * (d - lz / 2 + 0.03), { bevel: 0.025, tint: 0.9 + r2() * 0.15 });
        }
        // roof and pediments
        const ra = 0.5, rl = (w + 0.35) / Math.cos(ra);
        for (const s of [-1, 1]) P.add('slate', kit.bevelBox(rl, 0.14, d * 2 + 0.7, 0.03), { r: [0, 0, -s * ra], p: [s * (w + 0.35) / 2, h + 0.23 + Math.tan(ra) * (w + 0.35) / 2, 0] });
        const ped = [[-w - 0.1, h + 0.2], [w + 0.1, h + 0.2], [0, h + 0.2 + Math.tan(ra) * (w + 0.1)]];
        for (const s of [-1, 1]) P.add('ashlar', kit.extrude(ped, 0.3), { p: [0, 0, s > 0 ? d - 0.1 : -d - 0.2] });
        P.box('lead', 0.24, 0.12, d * 2 + 0.8, 0, h + 0.3 + Math.tan(ra) * (w + 0.35), 0, { bevel: 0.03 });
        P.box('ashlar', 0.12, 0.7, 0.12, 0, h + 0.75 + Math.tan(ra) * w, d + 0.05, { bevel: 0.02 }); P.box('ashlar', 0.42, 0.12, 0.12, 0, h + 0.86 + Math.tan(ra) * w, d + 0.05, { bevel: 0.02 });
        // doorway
        P.box('void', 1.3, 2.25, 0.5, 0, 1.4, d - 0.2, { cast: false });
        for (const s of [-1, 1]) {
          P.box('ashlar', 0.42, 2.5, 0.36, s * 0.92, 1.5, d + 0.12, { bevel: 0.04 });
          P.box('ashlar', 0.52, 0.2, 0.46, s * 0.92, 2.82, d + 0.12, { bevel: 0.04 }); P.box('ashlar', 0.52, 0.2, 0.46, s * 0.92, 0.36, d + 0.12, { bevel: 0.04 });
        }
        P.box('ashlar', 2.5, 0.34, 0.5, 0, 3.05, d + 0.12, { bevel: 0.05 });
        P.box('marble', 1.2, 0.2, 0.04, 0, 3.05, d + 0.38); for (const y of [3.02, 3.09]) P.box('void', 0.9, 0.018, 0.01, 0, y, d + 0.402, { cast: false });
        // iron door, ajar
        const door = new kit.Part();
        door.box('iron', 1.24, 2.2, 0.05, 0.62, 1.1, 0);
        for (const y of [0.4, 1.1, 1.8]) door.box('rust', 1.1, 0.08, 0.03, 0.62, y, 0.04);
        for (let i = 0; i < 5; i++) for (let k = 0; k < 7; k++) door.add('rust', kit.cyl(0.012, 0.02, 0.02, 5), { r: [PI / 2, 0, 0], p: [0.16 + i * 0.23, 0.25 + k * 0.28, 0.035] });
        door.add('rust', kit.tube(Array.from({ length: 9 }, (_, i) => [1.02 + Math.cos(i / 8 * PI * 2) * 0.07, 1.1 + Math.sin(i / 8 * PI * 2) * 0.07, 0.06]), 0.012, 4));
        const dm = new T.Matrix4().compose(new T.Vector3(-0.62, 0.3, d + 0.02), new T.Quaternion().setFromEuler(new T.Euler(0, -(0.25 + r2() * 0.5), 0)), new T.Vector3(1, 1, 1));
        for (const [key, geo, tint] of door.items) P.add(key, geo, { m: dm, tint });
        // steps
        P.box('ashlar', 2.6, 0.16, 0.5, 0, 0.22, d + 0.55, { bevel: 0.03 }); P.box('ashlar', 3.0, 0.14, 0.5, 0, 0.07, d + 1.0, { bevel: 0.03 });
        P.commit(B, { p: [x, 0, z], r: [0, q * PI / 2, 0] });
        const hx = q % 2 ? d + 0.1 : w + 0.1, hz = q % 2 ? w + 0.1 : d + 0.1;
        B.colBox(x, z, hx, hz, 0, h + 1.6);
        const fx = Math.sin(q * PI / 2), fz = Math.cos(q * PI / 2);
        B.colBox(x + fx * (d + 0.7), z + fz * (d + 0.7), q % 2 ? 0.5 : 1.4, q % 2 ? 1.4 : 0.5, 0, 0.28, 'concrete');
        keep.push([x, z, 4.6]); keep.push([x + fx * 4, z + fz * 4, 2.2]);
      };
      crypt(-22.5, 22.5, 1, 11); crypt(22.5, -23, 3, 12); crypt(22.8, 22.2, 2, 13); crypt(-21.5, -11.5, 1, 14);

      // ---------------------------------------------------------------- shed, well, bench
      {
        const sx = -23.6, sz = -24.2, P = new kit.Part();
        for (const [w, d, x, z] of [[3.2, 0.1, 0, -1.25], [0.1, 2.6, -1.6, 0], [0.1, 2.6, 1.6, 0], [1.1, 0.1, -1.05, 1.25], [1.1, 0.1, 1.05, 1.25]]) P.box('plank', w, 2.3, d, x, 1.15, z);
        P.box('plank', 3.2, 0.5, 0.1, 0, 2.2, 1.25);
        for (const [x, z] of [[-1.6, -1.25], [1.6, -1.25], [-1.6, 1.25], [1.6, 1.25]]) P.box('timber', 0.16, 2.5, 0.16, x, 1.25, z, { bevel: 0.015 });
        P.add('slate', kit.bevelBox(3.9, 0.08, 3.3, 0.02), { r: [0.16, 0, 0], p: [0, 2.6, 0] });
        P.add('plank', kit.bevelBox(0.95, 2.0, 0.06, 0.01), { r: [0, 0.9, 0], p: [-0.25, 1.0, 1.62] });
        P.box('void', 0.9, 2.0, 0.06, 0, 1.0, 1.2, { cast: false });
        // tools against the wall
        for (const [x, lean] of [[1.95, 0.16], [2.2, 0.1]]) { P.rod('pale', [x, 0, 0.4], [x - lean, 1.5, 0.4], 0.02, 0.02); P.add('rust', kit.bevelBox(0.2, 0.3, 0.02, 0.005), { r: [0, PI / 2, lean], p: [x + 0.02, 0.15, 0.4] }); }
        P.add('plank', kit.extrude([[-0.3, 0], [0.3, 0], [0.38, 0.5], [0.24, 2.0], [-0.24, 2.0], [-0.38, 0.5]], 0.4), { r: [-0.22, PI / 2, 0], p: [2.05, 0.02, -0.75] });
        P.commit(B, { p: [sx, 0, sz], r: [0, 0, 0] });
        B.colBox(sx, sz, 1.65, 1.3, 0, 2.8, 'wood'); keep.push([sx, sz, 3.4]);

        const wx = 16.2, wz = 19.6;
        B.add('rubble', kit.lathe([[1.0, 0], [1.02, 0.7], [0.95, 0.78], [0.72, 0.78], [0.7, 0.3], [0.02, 0.28]], 14), { p: [wx, 0, wz] });
        B.add('ashlar', kit.lathe([[1.06, 0.74], [1.06, 0.86], [0.68, 0.86], [0.68, 0.74]], 14), { p: [wx, 0, wz] });
        for (const s of [-1, 1]) B.box('timber', 0.14, 1.9, 0.14, wx + s * 0.86, 1.7, wz, { bevel: 0.015 });
        B.add('timber', kit.cyl(0.07, 0.07, 1.9, 8), { r: [0, 0, PI / 2], p: [wx + 0.95, 2.2, wz] });
        for (const s of [-1, 1]) B.add('slate', kit.bevelBox(2.4, 0.06, 1.1, 0.015), { r: [s * 0.6, 0, 0], p: [wx, 2.95, wz + s * 0.42] });
        B.add('rope', kit.cyl(0.012, 0.012, 1.0, 5), { p: [wx + 0.15, 1.2, wz] });
        B.add('pale', kit.lathe([[0.1, 0], [0.13, 0.24], [0.11, 0.24], [0.085, 0.02], [0.02, 0.02]], 10), { p: [wx + 0.15, 0.98, wz] });
        B.colBox(wx, wz, 1.0, 1.0, 0, 1.0); keep.push([wx, wz, 2.4]);
      }
      const bench = (x, z, ry) => {
        const P = new kit.Part();
        for (const zz of [-0.12, 0.03, 0.18]) P.box('plank', 1.7, 0.04, 0.13, 0, 0.46, zz, { bevel: 0.008 });
        for (const y of [0.72, 0.9]) P.add('plank', kit.bevelBox(1.7, 0.12, 0.035, 0.008), { r: [-0.16, 0, 0], p: [0, y, -0.24 - (y - 0.72) * 0.16] });
        for (const s of [-1, 1]) {
          P.add('iron', kit.tube([[s * 0.76, 0, 0.24], [s * 0.76, 0.42, 0.22], [s * 0.76, 0.44, -0.2], [s * 0.76, 0.98, -0.3]], 0.025, 5));
          P.add('iron', kit.tube([[s * 0.76, 0, -0.26], [s * 0.76, 0.44, -0.2]], 0.025, 5));
        }
        B.begin({ kind: 'wood', hp: 220, yaw: ry });
        P.commit(B, { p: [x, 0, z], r: [0, ry, 0] });
        const c = Math.abs(Math.cos(ry)), s2 = Math.abs(Math.sin(ry));
        B.colBox(x, z, 0.86 * c + 0.3 * s2, 0.86 * s2 + 0.3 * c, 0, 0.55, 'wood'); keep.push([x, z, 1.3]);
        B.end();
      };
      bench(3.4, 25.5, -PI / 2); bench(-12.4, 10.5, PI / 2); bench(12.6, -6.5, -PI / 2);

      // ---------------------------------------------------------------- dead trees
      const deadTree = (x, z, seed, sc = 1) => {
        const r2 = kit.rng(seed), P = new kit.Part();
        const branch = (a, dir, len, r, depth) => {
          const b = [a[0] + dir[0] * len, a[1] + dir[1] * len, a[2] + dir[2] * len];
          P.rod('bark', a, b, r, r * 0.66, { seg: depth > 2 ? 8 : depth > 0 ? 6 : 4 });
          if (depth <= 0) return;
          const n = depth > 2 ? 3 : 2 + (r2() < 0.4 ? 1 : 0);
          for (let i = 0; i < n; i++) {
            const d = [dir[0] + (r2() - 0.5) * 1.5, dir[1] + r2() * 0.6 - 0.2, dir[2] + (r2() - 0.5) * 1.5];
            const l = Math.hypot(d[0], d[1], d[2]); d[0] /= l; d[1] /= l; d[2] /= l;
            branch([a[0] + dir[0] * len * 0.97, a[1] + dir[1] * len * 0.97, a[2] + dir[2] * len * 0.97], d, len * (0.52 + r2() * 0.22), r * 0.62, depth - 1);
          }
        };
        P.add('bark', kit.lathe([[0.55, -0.1], [0.42, 0.12], [0.34, 0.4], [0.31, 0.8]], 9));
        for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2 + r2(); P.rod('bark', [Math.cos(a) * 0.22, 0.3, Math.sin(a) * 0.22], [Math.cos(a) * 0.9, -0.08, Math.sin(a) * 0.9], 0.13, 0.04, { seg: 5 }); }
        branch([0, 0.7, 0], [(r2() - 0.5) * 0.25, 1, (r2() - 0.5) * 0.25], 2.4 + r2() * 0.8, 0.3, 4);
        P.commit(B, { p: [x, 0, z], r: [0, r2() * 6, 0], s: sc });
        B.colBox(x, z, 0.3 * sc, 0.3 * sc, 0, 4, 'wood');
        keep.push([x, z, 1.5]); info.trees.push([x, z]);
      };
      [[-18, 11.5, 1], [17.4, 12.2, 1.15], [20.5, -11.5, 0.95], [-25.5, -4.2, 1.1], [12.2, -25.5, 1], [-25.8, 4.6, 0.9], [26, 9.5, 1.05], [-13.2, 26, 1], [7.5, 26.4, 0.85], [-9.5, -24.6, 1.1]]
        .forEach(([x, z, s], i) => deadTree(x, z, 200 + i * 7, s));

      // ---------------------------------------------------------------- graves
      const slabProfile = (w, h, kind) => {
        const hw = w / 2;
        if (kind === 'round') { const pts = [[-hw, 0], [hw, 0], [hw, h - hw]]; for (let i = 1; i < 8; i++) { const a = (i / 8) * PI; pts.push([Math.cos(a) * hw, h - hw + Math.sin(a) * hw]); } pts.push([-hw, h - hw]); return pts; }
        if (kind === 'gothic') return [[-hw, 0], [hw, 0]].concat(kit.archPts(w, h - w * 0.75, h, 5).reverse());
        if (kind === 'shoulder') { const pts = [[-hw, 0], [hw, 0], [hw, h * 0.7], [hw * 0.72, h * 0.7], [hw * 0.72, h * 0.8]]; for (let i = 1; i < 7; i++) { const a = (i / 7) * PI; pts.push([Math.cos(a) * hw * 0.72, h * 0.8 + Math.sin(a) * hw * 0.5]); } pts.push([-hw * 0.72, h * 0.8], [-hw * 0.72, h * 0.7], [-hw, h * 0.7]); return pts; }
        return [[-hw, 0], [hw, 0], [hw, h], [hw * 0.6, h + 0.08], [-hw * 0.6, h + 0.08], [-hw, h]];
      };
      const stoneKeys = ['rock', 'rock', 'rock', 'ashlar', 'ashlar', 'marble'];
      // a small stone urn: nothing to walk into, but it breaks
      const urn = (x, z, r2) => {
        const s = 0.6 + r2() * 0.3;
        B.begin({ kind: 'stone', hp: 26 });
        B.add(r2() < 0.5 ? 'ashlar' : 'marble', kit.lathe([[0.02, 0], [0.085, 0], [0.095, 0.03], [0.04, 0.07], [0.05, 0.13], [0.1, 0.22], [0.108, 0.3], [0.075, 0.4], [0.045, 0.44], [0.07, 0.5], [0.06, 0.51], [0.02, 0.47]], 10), { p: [x, 0, z], s, r: [(r2() - 0.5) * 0.12, r2() * 6, (r2() - 0.5) * 0.12], tint: 0.75 + r2() * 0.3 });
        B.col(x - 0.11 * s, 0, z - 0.11 * s, x + 0.11 * s, 0.51 * s, z + 0.11 * s, 'concrete', { bulletOnly: true });
        B.end();
      };
      const grave = (x, z, face, r2) => {
        // face: [fx, fz] unit vector the stone looks along; the plot lies in front of it
        const ry = Math.atan2(face[0], face[1]), P = new kit.Part(), key = stoneKeys[Math.floor(r2() * stoneKeys.length)], tint = 0.78 + r2() * 0.3;
        const pick = r2();
        let h = 1, w = 0.6, colW = 0.35, colD = 0.14, lean = [(r2() - 0.5) * 0.18, 0, (r2() - 0.5) * 0.2];
        const lines = (hw, y0, n, zf) => { for (let i = 0; i < n; i++) P.box('void', hw * (0.9 + r2() * 0.6), 0.014, 0.006, (r2() - 0.5) * 0.04, y0 - i * 0.075, zf, { cast: false }); };
        if (pick < 0.5) {
          const kind = pick < 0.2 ? 'round' : pick < 0.36 ? 'gothic' : pick < 0.45 ? 'shoulder' : 'flat';
          w = 0.5 + r2() * 0.3; h = 0.75 + r2() * 0.55; const th = 0.11 + r2() * 0.06;
          P.add(key, kit.extrude(slabProfile(w, h, kind), th), { p: [0, 0.05, -th / 2] });
          P.box(key, w + 0.16, 0.16, th + 0.16, 0, 0.04, 0, { bevel: 0.025 });
          lines(w * 0.32, h * 0.72, 3 + Math.floor(r2() * 3), th / 2 + 0.002);
          colW = w / 2 + 0.06; colD = th / 2 + 0.06;
        } else if (pick < 0.68) {
          const celtic = pick > 0.61; h = 1.25 + r2() * 0.5;
          P.box(key, 0.62, 0.2, 0.42, 0, 0.08, 0, { bevel: 0.03 }); P.box(key, 0.44, 0.18, 0.3, 0, 0.26, 0, { bevel: 0.03 });
          P.box(key, 0.17, h, 0.14, 0, 0.35 + h / 2, 0, { bevel: 0.02 }); P.box(key, 0.72, 0.17, 0.14, 0, 0.35 + h * 0.72, 0, { bevel: 0.02 });
          if (celtic) P.add(key, kit.tube(Array.from({ length: 12 }, (_, i) => [Math.cos(i / 12 * PI * 2) * 0.27, 0.35 + h * 0.72 + Math.sin(i / 12 * PI * 2) * 0.27, 0]), 0.045, 5, true));
          h += 0.35; colW = 0.33; colD = 0.22;
        } else if (pick < 0.75) {
          h = 2.0 + r2() * 0.7;
          P.box(key, 0.72, 0.22, 0.72, 0, 0.09, 0, { bevel: 0.03 }); P.box(key, 0.54, 0.5, 0.54, 0, 0.45, 0, { bevel: 0.03 }); P.box(key, 0.62, 0.1, 0.62, 0, 0.75, 0, { bevel: 0.025 });
          P.add(key, kit.cyl(0.09, 0.21, h - 1.0, 4), { r: [0, PI / 4, 0], p: [0, 0.8, 0] });
          P.add(key, kit.cyl(0.001, 0.125, 0.24, 4), { r: [0, PI / 4, 0], p: [0, h - 0.2, 0] });
          lines(0.16, 0.6, 3, 0.272); lean = [lean[0] * 0.4, 0, lean[2] * 0.4]; colW = 0.38; colD = 0.38;
        } else if (pick < 0.83) {
          // chest tomb lying along the plot
          P.box(key, 1.05, 0.14, 2.25, 0, 0.05, 1.0, { bevel: 0.03 }); P.box(key, 0.82, 0.62, 2.0, 0, 0.43, 1.0, { bevel: 0.02 });
          P.box(key, 1.0, 0.13, 2.2, 0, 0.8, 1.0, { bevel: 0.035 });
          for (const s of [-1, 1]) for (const zz of [0.4, 1.0, 1.6]) P.box('void', 0.008, 0.36, 0.42, s * 0.412, 0.43, zz, { cast: false });
          h = 0.86; lean = [0, 0, 0]; colW = -1;
        } else if (pick < 0.9) {
          P.add(key, kit.bevelBox(0.95, 0.1, 1.95, 0.025), { r: [(r2() - 0.5) * 0.06, 0, (r2() - 0.5) * 0.06], p: [0, 0.03, 1.05] });
          h = 0.1; colW = 0; lean = [0, 0, 0];
        } else if (pick < 0.96) {
          // toppled: a stump and the slab on its face
          w = 0.6; h = 0.9;
          P.add(key, kit.extrude([[-0.3, 0], [0.3, 0], [0.3, 0.22], [0.1, 0.3], [-0.12, 0.2], [-0.3, 0.28]], 0.13), { p: [0, 0.05, -0.065] });
          P.box(key, 0.76, 0.16, 0.3, 0, 0.04, 0, { bevel: 0.025 });
          P.add(key, kit.extrude(slabProfile(0.6, 0.75, 'round'), 0.13), { r: [-PI / 2 + 0.08, (r2() - 0.5) * 0.5, 0], p: [(r2() - 0.5) * 0.3, 0.16, 0.55] });
          h = 0.3; colW = 0.36; colD = 0.14; lean = [0, 0, 0];
        } else {
          h = 1.9;
          P.box(key, 0.7, 0.2, 0.7, 0, 0.08, 0, { bevel: 0.03 }); P.box(key, 0.5, 0.6, 0.5, 0, 0.48, 0, { bevel: 0.03 }); P.box(key, 0.6, 0.1, 0.6, 0, 0.82, 0, { bevel: 0.025 });
          P.add(key, kit.cyl(0.13, 0.16, 0.7, 10), { p: [0, 0.87, 0] });
          P.add(key, kit.lathe([[0.1, 0], [0.15, 0.05], [0.05, 0.12], [0.11, 0.2], [0.17, 0.34], [0.13, 0.46], [0.06, 0.52], [0.09, 0.56], [0.02, 0.6]], 10), { p: [0, 1.57, 0] });
          lines(0.15, 0.62, 3, 0.252); colW = 0.36; colD = 0.36; lean = [lean[0] * 0.3, 0, lean[2] * 0.3];
        }
        // earth mound on about half the plots
        if (colW !== -1 && h > 0.2 && r2() < 0.55) {
          const m = kit.sphere(1, 10, 6);
          const p = m.attributes.position;
          for (let i = 0; i < p.count; i++) { const k = 0.85 + 0.3 * kit.noise2(p.getX(i) * 3 + x, p.getZ(i) * 3 + z); p.setXYZ(i, p.getX(i) * 0.42 * k, Math.max(-0.02, p.getY(i)) * 0.2 * k, p.getZ(i) * 0.95 * k); }
          m.computeVertexNormals();
          P.add('earth', m, { p: [0, 0, 1.15], tint: 0.8 + r2() * 0.3, cast: false });
        }
        // a stone with a collider can be shot to pieces; the mound of earth in front of it stays
        B.begin({ kind: 'stone', hp: colW === -1 ? 520 : 80 + 90 * h, yaw: ry, skip: ['earth'] });
        P.commit(B, { p: [x, -0.04, z], r: [lean[0], ry, lean[2]], tint });
        const along = Math.abs(face[1]) > 0.5;                    // facing along z: slab is wide in x
        if (colW === -1) { const cx = x + face[0] * 1.0, cz = z + face[1] * 1.0; B.colBox(cx, cz, along ? 0.52 : 1.12, along ? 1.12 : 0.52, 0, 0.86); }
        else if (colW > 0) B.colBox(x, z, along ? colW : colD, along ? colD : colW, 0, h + 0.05, 'concrete', h > 1.4 ? {} : {});
        B.end();
        // an urn beside some of the stones
        if (colW > 0 && r2() < 0.3) urn(x + Math.cos(ry) * (colW + 0.26) + face[0] * 0.12, z - Math.sin(ry) * (colW + 0.26) + face[1] * 0.12, r2);
        info.graves.push({ x: x + face[0] * 1.2, z: z + face[1] * 1.2, hx: x, hz: z });
        keep.push([x, z, 0.5]);
      };
      const inChurch = (x, z) => (Math.abs(x) < 8.6 && Math.abs(z) < 15.4) || (x > -13 && x < -5 && z > 5.6 && z < 14.4);
      for (let gx = -27; gx <= 27.01; gx += 3.1) {
        for (let gz = -27; gz <= 27.01; gz += 2.75) {
          const r2 = kit.rng(Math.round((gx + 40) * 131 + (gz + 40) * 17));
          if (r2() < 0.2) continue;
          const x = gx + (r2() - 0.5) * 0.7, z = gz + (r2() - 0.5) * 0.6;
          const face = Math.abs(x) > 9 ? [x > 0 ? -1 : 1, 0] : [0, z > 0 ? 1 : -1];
          const fx = x + face[0] * 1.2, fz = z + face[1] * 1.2;
          if (inChurch(x, z) || inChurch(fx, fz) || pathDist(x, z) < 0.75 || pathDist(fx, fz) < 0.4 || pathDist(x + face[0] * 2.2, z + face[1] * 2.2) < 0.1) continue;
          if (Math.abs(x) > Y - 2.2 || Math.abs(z) > Y - 2.2 || blocked(x, z, 0.6) || blocked(fx, fz, 0.3)) continue;
          grave(x, z, face, r2);
        }
      }
      // paupers' corner: plain timber crosses
      for (let i = 0; i < 14; i++) {
        const x = 13.5 + (i % 5) * 1.5 + (rng() - 0.5) * 0.4, z = -27.2 + Math.floor(i / 5) * 1.9 + (rng() - 0.5) * 0.3;
        if (blocked(x, z, 0.5) || pathDist(x, z) < 0.7) continue;
        const P = new kit.Part();
        P.box('pale', 0.07, 1.0, 0.05, 0, 0.45, 0, { bevel: 0.006 }); P.box('pale', 0.5, 0.07, 0.05, 0, 0.72, 0.01, { bevel: 0.006 });
        B.begin({ kind: 'wood', hp: 70 });
        P.commit(B, { p: [x, 0, z], r: [(rng() - 0.5) * 0.3, PI + (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.4], tint: 0.6 + rng() * 0.4 });
        B.col(x - 0.27, 0, z - 0.1, x + 0.27, 0.98, z + 0.1, 'wood', { bulletOnly: true });
        B.end();
        info.graves.push({ x, z: z - 1.0, hx: x, hz: z });
      }
      // a railed family plot
      {
        const x0 = 14.2, x1 = 19.2, z0 = 5.6, z1 = 9.6;
        for (const [a, b, fixed, alongX] of [[x0, x1, z0, true], [x0, x1, z1, true], [z0, z1, x0, false], [z0, z1, x1, false]]) {
          const n = Math.round((b - a) / 0.2);
          for (let i = 0; i <= n; i++) {
            if (alongX && fixed === z0 && i > n * 0.4 && i < n * 0.6) continue;
            const u = a + ((b - a) * i) / n, x = alongX ? u : fixed, z = alongX ? fixed : u;
            B.box('rust', 0.018, 0.85, 0.018, x, 0.42, z); B.add('rust', kit.cyl(0.001, 0.026, 0.1, 4), { p: [x, 0.85, z] });
          }
          for (const y of [0.2, 0.72]) B.box('rust', alongX ? b - a : 0.03, 0.025, alongX ? 0.03 : b - a, alongX ? (a + b) / 2 : fixed, y, alongX ? fixed : (a + b) / 2);
          if (alongX) { if (fixed === z1) B.col(a, 0, fixed - 0.06, b, 0.95, fixed + 0.06, 'metal'); else { B.col(a, 0, fixed - 0.06, a + (b - a) * 0.4, 0.95, fixed + 0.06, 'metal'); B.col(a + (b - a) * 0.6, 0, fixed - 0.06, b, 0.95, fixed + 0.06, 'metal'); } }
          else B.col(fixed - 0.06, 0, a, fixed + 0.06, 0.95, b, 'metal');
        }
      }

      // ---------------------------------------------------------------- path flags and props
      for (const p of [PATHS[0]]) for (let i = 2; i < p.pts.length - 1; i++) {
        const a = p.pts[i], b = p.pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let d = 0.5; d < len - 0.3; d += 0.78) {
          const t = d / len, px = a[0] + (b[0] - a[0]) * t, pz = a[1] + (b[1] - a[1]) * t;
          for (const off of [-0.72, 0.02, 0.76]) {
            if (rng() < 0.12) continue;
            B.add('flagOut', kit.bevelBox(0.58 + rng() * 0.14, 0.07, 0.6 + rng() * 0.12, 0.02), { r: [(rng() - 0.5) * 0.04, (rng() - 0.5) * 0.16, (rng() - 0.5) * 0.04], p: [px + off + (rng() - 0.5) * 0.06, 0.005 + rng() * 0.012, pz + (rng() - 0.5) * 0.08], tint: 0.8 + rng() * 0.3, cast: false });
          }
        }
      }
      // defensive clutter: sandbags outside the door, supplies inside
      // defensive clutter: sandbags outside the door, supplies inside
      const sandbags = (x, z, ry, y = 0, rows = 3) => {
        const P = new kit.Part();
        for (let row = 0; row < rows; row++) {
          const n = row === 2 ? 3 : 4;
          for (let i = 0; i < n; i++) {
            const bag = kit.sphere(1, 9, 6), p = bag.attributes.position;
            for (let k = 0; k < p.count; k++) { const q = 0.9 + 0.2 * kit.noise2(p.getX(k) * 2 + i * 3.1 + row, p.getZ(k) * 2 + i); p.setXYZ(k, p.getX(k) * 0.33 * q, p.getY(k) * 0.115, p.getZ(k) * 0.2 * q); }
            bag.computeVertexNormals();
            P.add('sack', bag, { r: [0, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.08], p: [(i - (n - 1) / 2) * 0.6 + (row % 2) * 0.12, 0.11 + row * 0.19, (rng() - 0.5) * 0.06], tint: 0.8 + rng() * 0.3 });
          }
        }
        P.commit(B, { p: [x, y, z], r: [0, ry, 0] });
        const c = Math.abs(Math.cos(ry)), s2 = Math.abs(Math.sin(ry));
        B.colBox(x, z, 1.2 * c + 0.22 * s2, 1.2 * s2 + 0.22 * c, y, y + 0.1 + rows * 0.19, 'dirt');
      };
      const crate = (x, y, z, ry, w = 0.9, h = 0.62, d = 0.62, col = true) => {
        const P = new kit.Part(), t = 0.035;
        P.box('pale', w - t, h - t, d - t, 0, h / 2, 0, { tint: 0.7 + rng() * 0.25 });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box('timber', 0.07, h, 0.07, sx * (w / 2 - 0.03), h / 2, sz * (d / 2 - 0.03), { bevel: 0.008 });
        for (const sy of [0.045, h - 0.045]) {
          for (const sz of [-1, 1]) P.box('timber', w, 0.07, 0.05, 0, sy, sz * (d / 2 - 0.02), { bevel: 0.008 });
          for (const sx of [-1, 1]) P.box('timber', 0.05, 0.07, d, sx * (w / 2 - 0.02), sy, 0, { bevel: 0.008 });
        }
        B.begin({ kind: 'wood', hp: 140, yaw: ry });
        P.commit(B, { p: [x, y, z], r: [0, ry, 0] });
        const r = Math.max(w, d) / 2 * 0.92; B.colBox(x, z, r, r, y, y + h, 'wood', col ? {} : { bulletOnly: true });
        B.end();
      };
      const ammoBox = (x, y, z, ry, open) => {
        const P = new kit.Part();
        P.box('olive', 0.44, 0.2, 0.2, 0, 0.1, 0, { bevel: 0.012 });
        if (open) { P.add('olive', kit.bevelBox(0.44, 0.02, 0.2, 0.006), { r: [-1.2, 0, 0], p: [0, 0.27, -0.14] }); for (let i = 0; i < 6; i++) P.cyl('brass', 0.012, 0.012, 0.09, -0.15 + i * 0.06, 0.16, 0, { seg: 6 }); }
        else P.box('olive', 0.46, 0.03, 0.22, 0, 0.21, 0, { bevel: 0.008 });
        P.add('iron', kit.tube([[-0.08, 0.22, 0.11], [0, 0.26, 0.13], [0.08, 0.22, 0.11]], 0.008, 4));
        P.commit(B, { p: [x, y, z], r: [0, ry, 0] });
      };
      const cask = (x, y, z) => {
        B.begin({ kind: 'wood', hp: 160 });
        B.add('plank', kit.lathe([[0.02, 0], [0.27, 0], [0.33, 0.25], [0.35, 0.45], [0.33, 0.65], [0.27, 0.9], [0.24, 0.9], [0.24, 0.86], [0.02, 0.86]], 14), { p: [x, y, z], tint: 0.8 });
        for (const [hy, r] of [[0.1, 0.3], [0.3, 0.342], [0.6, 0.342], [0.8, 0.3]]) B.add('iron', kit.cyl(r + 0.004, r + 0.004, 0.035, 14, true), { p: [x, y + hy, z] });
        B.colBox(x, z, 0.3, 0.3, y, y + 0.9, 'wood');
        B.end();
      };
      const fl = V.CH.floor;
      sandbags(-2.9, 16.1, 0.5); sandbags(3.0, 15.9, -0.45); sandbags(-7.9, -6.6, 1.25, 0, 2); sandbags(4.6, -15.6, 0.2, 0, 2);
      crate(4.3, fl, 1.4, 0.1); crate(4.35, fl, 2.6, -0.06); crate(4.32, fl + 0.62, 2.55, 0.2, 0.8, 0.5, 0.56, false);
      crate(-4.35, fl, 1.9, 0.2); cask(-4.5, fl, 3.0); cask(4.45, fl, 3.6);
      ammoBox(4.3, fl + 0.62, 1.4, 0.3, true); ammoBox(4.25, fl + 1.12, 2.55, -0.2, false); ammoBox(-4.35, fl + 0.62, 1.9, 1.3, true); ammoBox(3.75, fl, 1.1, 0.8, false);
      crate(6.9, 0, 14.7, 0.4);
      info.spawnPads = [[2.6, -2.0], [-2.6, -2.0], [2.8, 1.6], [-2.8, 1.6]];
      return info;
    },
  };
})();
