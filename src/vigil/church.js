/* The ruined church: shell, tower, roof and furnishings. The crystal dais is at the origin. There are four ways
   in, one on each side: the main door faces south (+Z), a side door stands in the west wall and another in the
   east, and the north wall is breached. Each is wide enough for several of the dead abreast. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const PI = Math.PI;

  // Leaded glass drawn once: four lancet designs side by side. Alpha holes are broken panes.
  function stainedTexture(T, rng) {
    const W = 1024, H = 512, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const pal = [['#1b3a6b', '#27518f', '#6b1a20', '#8c2a2a', '#a9782a', '#2f5a3a', '#7d8a9a', '#3a2a5c'], ['#5c1820', '#8a2c22', '#1c3766', '#b08a35', '#39485c', '#28503a', '#6a2a4a', '#93a0aa']];
    for (let d = 0; d < 4; d++) {
      const x0 = d * 256, P = pal[d % 2];
      x.fillStyle = '#0a0b0d'; x.fillRect(x0, 0, 256, H);
      // diamond quarries
      const s = 30;
      for (let r = -1; r < H / s + 1; r++) for (let q = -1; q < 256 / s + 1; q++) {
        const cx = x0 + q * s + (r % 2 ? s / 2 : 0), cy = r * s * 0.86;
        const col = P[Math.floor(rng() * P.length)];
        x.fillStyle = col; x.globalAlpha = 0.55 + rng() * 0.45;
        x.beginPath(); x.moveTo(cx, cy - s * 0.5); x.lineTo(cx + s * 0.46, cy); x.lineTo(cx, cy + s * 0.5); x.lineTo(cx - s * 0.46, cy); x.closePath(); x.fill();
      }
      x.globalAlpha = 1;
      // a tall figure panel: stacked larger pieces down the middle
      let y = 60;
      while (y < H - 70) {
        const h = 26 + rng() * 44, w = 70 + rng() * 50;
        x.fillStyle = P[Math.floor(rng() * P.length)];
        x.beginPath();
        x.moveTo(x0 + 128 - w / 2 + rng() * 8, y); x.lineTo(x0 + 128 + w / 2 - rng() * 8, y + rng() * 6);
        x.lineTo(x0 + 128 + w / 2 - rng() * 10, y + h); x.lineTo(x0 + 128 - w / 2 + rng() * 10, y + h - rng() * 6); x.closePath(); x.fill();
        x.lineWidth = 3; x.strokeStyle = '#08090a'; x.stroke();
        y += h;
      }
      // halo
      x.fillStyle = '#c9a548'; x.beginPath(); x.arc(x0 + 128, 74, 30, 0, PI * 2); x.fill(); x.lineWidth = 3; x.strokeStyle = '#08090a'; x.stroke();
      x.fillStyle = '#b9a58c'; x.beginPath(); x.arc(x0 + 128, 78, 15, 0, PI * 2); x.fill(); x.stroke();
      // border strip and lead lines
      x.strokeStyle = '#0a0b0d'; x.lineWidth = 2;
      for (let r = 0; r < H / (s * 0.86) + 1; r++) { x.beginPath(); x.moveTo(x0, r * s * 0.86 - s / 2); x.lineTo(x0 + 256, r * s * 0.86 + 256 * 1.09 - s / 2); x.stroke(); x.beginPath(); x.moveTo(x0 + 256, r * s * 0.86 - s / 2); x.lineTo(x0, r * s * 0.86 + 256 * 1.09 - s / 2); x.stroke(); }
      x.lineWidth = 9; x.strokeStyle = '#7a1c22'; x.strokeRect(x0 + 6, 6, 244, H - 12);
      x.lineWidth = 3; x.strokeStyle = '#08090a'; x.strokeRect(x0 + 1.5, 1.5, 253, H - 3); x.strokeRect(x0 + 11, 11, 234, H - 22);
      // grime
      for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(0,0,0,${0.05 + rng() * 0.12})`; x.beginPath(); x.arc(x0 + rng() * 256, rng() * H, 3 + rng() * 22, 0, PI * 2); x.fill(); }
    }
    // broken panes on the last two designs
    x.globalCompositeOperation = 'destination-out';
    for (const d of [2, 3]) for (let i = 0; i < 3; i++) {
      const cx = d * 256 + 50 + rng() * 156, cy = 70 + rng() * (H - 150), n = 7;
      x.beginPath();
      for (let k = 0; k < n; k++) { const a = (k / n) * PI * 2, r = 22 + rng() * 46; x[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.3); }
      x.closePath(); x.fill();
    }
    x.globalCompositeOperation = 'source-over';
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    return tex;
  }

  V.church = {
    build(B, ctx) {
      const g = ctx.g, T = g.THREE, kit = V.kit, CH = V.CH, rng = kit.rng(4711);
      const { hw, hd, t, eave, rise, floor } = CH;
      const ihw = hw - t, ihd = hd - t;
      const info = { lights: [], flames: [], halos: [], interior: null, skylights: [], spawnPads: [] };
      const out = 'rubble', inn = 'rubbleIn';

      // ---------------------------------------------------------------- stained glass
      const stained = new T.MeshStandardMaterial({ map: stainedTexture(T, rng), roughness: 0.28, metalness: 0, side: T.DoubleSide, alphaTest: 0.5, emissive: new T.Color(0x9fd8ff), emissiveIntensity: 0.22, vertexColors: true });
      stained.emissiveMap = stained.map; stained.name = 'vg_stained';
      ctx.mats.cache.set('stained', stained);
      info.stained = stained;

      // Maps a shape drawn in (u, y) onto a wall plane. depth > 0 extrudes away from the wall's outside.
      const onWall = (axis, at, geo, w) => {
        // geo is in local (x = u, y, z = thickness): its local z = 0 lands at offset w from the wall's centre plane
        if (axis === 'x') return kit.xf(geo, { p: [0, 0, at + w] });
        return kit.xf(kit.swapXZ(geo), { p: [at + w, 0, 0] });
      };
      const glassPane = (axis, at, pts, design) => {
        const shape = new T.Shape(pts.map((p) => new T.Vector2(p[0], p[1])));
        const geo = new T.ShapeGeometry(shape).toNonIndexed();
        let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
        for (const p of pts) { u0 = Math.min(u0, p[0]); u1 = Math.max(u1, p[0]); v0 = Math.min(v0, p[1]); v1 = Math.max(v1, p[1]); }
        const pos = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) uv.setXY(i, (design + (pos.getX(i) - u0) / (u1 - u0) * 0.96 + 0.02) / 4, (pos.getY(i) - v0) / (v1 - v0) * 0.96 + 0.02);
        B.add('stained', onWall(axis, at, geo, 0), { uv: 'keep', cast: false });
      };

      // A two-light gothic window with a pierced head, glass, an outer hood mould and a sloping sill.
      const windowFill = (axis, at, outSign, c, w, y0, spring, apex, design) => {
        const outline = kit.archHole(c, w, y0, spring, apex, 7);
        const fr = 0.075, mul = 0.11, lw = (w - 2 * fr - mul) / 2, lc = mul / 2 + lw / 2;
        const ls = spring - 0.42, la = ls + lw * 0.95;
        const lights = [kit.archHole(c - lc, lw, y0 + fr, ls, la, 5), kit.archHole(c + lc, lw, y0 + fr, ls, la, 5)];
        const eye = kit.circlePts(c, apex - 0.62 - (w - 1.5) * 0.1, 0.19 + (w - 1.5) * 0.08, 12);
        const tr = kit.extrude(outline, 0.16, lights.concat([eye]));
        B.add('ashlar', onWall(axis, at, tr, -0.08));
        glassPane(axis, at, outline, design);
        // hood mould and sill on the weather side
        const face = outSign * (t / 2);
        const band = kit.archBand(w, y0, spring, apex, 0.17, 0.15, 7);
        kit.xf(band, { p: [c, 0, 0] });
        B.add('ashlar', onWall(axis, at, band, outSign > 0 ? face - 0.05 : face - 0.10));
        const sill = kit.bevelBox(w + 0.5, 0.16, 0.34, 0.03);
        kit.xf(sill, { p: [c, y0 - 0.1, 0] });
        B.add('ashlar', onWall(axis, at, sill, face + outSign * 0.02));
        // inner splay hint: a darker reveal block under the sill inside
        const isill = kit.box(w + 0.1, 0.1, 0.3);
        kit.xf(isill, { p: [c, y0 - 0.05, 0] });
        B.add('ashlarIn', onWall(axis, at, isill, -face));
      };

      // ---------------------------------------------------------------- shell
      // The walls can be brought down, a bay at a time (kit.js `endGrid`, destruct.js): the cuts between bays fall
      // clear of every window, door and buttress on both walls of each pair. BAYS is shared with the roof, so each
      // bay of the roof stands on a bay of each side wall.
      const BAYS = [-10.3, -7.7, -1.3, 1.3, 7.7, 10.3];
      B.begin({ kind: 'stone', hp: 2400, raze: true, tag: 'church' });
      const WIN = { w: 1.5, y0: 2.3, spring: 4.75, apex: 6.35 };
      const win = (c) => ({ c, ...WIN });
      const sideDoor = { c: -4.5, w: 2.6, y0: 0.02, spring: 2.6, apex: 3.75 };          // west wall
      const eastDoor = { c: 4.5, w: 2.6, y0: 0.02, spring: 2.6, apex: 3.75 };           // east wall
      const mainDoor = { c: 0, w: 4.0, y0: 0.02, spring: 3.3, apex: 5.3 };
      const breach = [[1.2, 0.02], [5.48, 0.02], [5.53, 1.25], [5.12, 2.15], [5.36, 3.05], [4.76, 3.95], [4.4, 5.2], [3.56, 5.95], [2.96, 6.7], [2.36, 6.25], [1.88, 5.05], [1.34, 4.1], [1.58, 2.9], [1.1, 1.7]];
      const breachA = 1.2, breachB = 5.48;                                              // the gap at floor level
      const lancetC = { c: 0, w: 1.5, y0: 3.2, spring: 7.4, apex: 9.3 }, lancetW = { c: -2.35, w: 1.05, y0: 3.2, spring: 6.3, apex: 7.7 };
      const eastWin = [-9, -4.5, 0, 9], westWin = [-9, 0, 4.5];
      const wide = hw - 6.1;                                                            // how far the side walls stand out from the old nave

      kit.wall(B, { axis: 'x', at: hd - t / 2, u0: -hw, u1: hw, y0: -0.5, y1: eave, t, out: 1, matOut: out, matIn: inn, gable: rise, holes: [mainDoor, { c: 0, cy: 9.0, r: 1.5 }] });
      kit.wall(B, { axis: 'x', at: -(hd - t / 2), u0: -hw, u1: hw, y0: -0.5, y1: eave, t, out: -1, matOut: out, matIn: inn, gable: rise, holes: [lancetC, lancetW, { pts: breach }] });
      // The wall's collider leaves the breach as a plain rectangle. The stone that still hangs over it on either
      // side is put back here, so what is tall keeps to the part of the gap that is open at its own height.
      for (const [x0, y0, x1] of [[1.1, 2.2, 1.45], [1.45, 4.6, 1.9], [1.9, 5.6, 2.4], [5.15, 1.9, 5.53], [4.8, 3.6, 5.15], [4.4, 4.6, 4.8], [3.6, 5.7, 4.4]]) B.col(x0, y0, -hd, x1, 6.45, -ihd, 'concrete', { noNav: true });
      kit.wall(B, { axis: 'z', at: hw - t / 2, u0: -ihd, u1: ihd, y0: -0.5, y1: eave, t, out: 1, matOut: out, matIn: inn, holes: eastWin.map(win).concat([eastDoor]) });
      kit.wall(B, { axis: 'z', at: -(hw - t / 2), u0: -ihd, u1: ihd, y0: -0.5, y1: eave, t, out: -1, matOut: out, matIn: inn, holes: westWin.map(win).concat([sideDoor]) });

      eastWin.forEach((z, i) => windowFill('z', hw - t / 2, 1, z, WIN.w, WIN.y0, WIN.spring, WIN.apex, [0, 2, 1, 3][i]));
      westWin.forEach((z, i) => windowFill('z', -(hw - t / 2), -1, z, WIN.w, WIN.y0, WIN.spring, WIN.apex, [1, 0, 3][i]));
      windowFill('x', -(hd - t / 2), -1, lancetC.c, lancetC.w, lancetC.y0, lancetC.spring, lancetC.apex, 1);
      windowFill('x', -(hd - t / 2), -1, lancetW.c, lancetW.w, lancetW.y0, lancetW.spring, lancetW.apex, 0);

      // rose window: ring, eight spokes, pierced petals
      {
        const cy = 9.0, R = 1.5, petals = [];
        for (let i = 0; i < 8; i++) {
          const a0 = (i / 8) * PI * 2 + 0.11, a1 = ((i + 1) / 8) * PI * 2 - 0.11, pts = [];
          for (let k = 0; k <= 5; k++) { const a = a0 + (a1 - a0) * (k / 5); pts.push([Math.cos(a) * 1.3, cy + Math.sin(a) * 1.3]); }
          for (let k = 5; k >= 0; k--) { const a = a0 + (a1 - a0) * (k / 5); pts.push([Math.cos(a) * 0.46, cy + Math.sin(a) * 0.46]); }
          petals.push(pts);
        }
        petals.push(kit.circlePts(0, cy, 0.26, 12));
        B.add('ashlar', onWall('x', hd - t / 2, kit.extrude(kit.circlePts(0, cy, R, 28).reverse(), 0.18, petals), -0.09));
        glassPane('x', hd - t / 2, kit.circlePts(0, cy, R, 28).reverse(), 2);
        const ring = kit.extrude(kit.circlePts(0, cy, R + 0.2, 28).reverse(), 0.16, [kit.circlePts(0, cy, R, 28)]);
        B.add('ashlar', onWall('x', hd - t / 2, ring, t / 2 - 0.05));
      }
      // door orders
      for (const [band, depth, proud] of [[0.3, 0.2, 0.1], [0.55, 0.1, 0.02]]) {
        B.add('ashlar', onWall('x', hd - t / 2, kit.archBand(mainDoor.w, 0, mainDoor.spring, mainDoor.apex, band, depth, 8), t / 2 - depth + proud));
      }
      for (const [door, at, w] of [[sideDoor, -(hw - t / 2), -t / 2 - 0.08], [eastDoor, hw - t / 2, t / 2 - 0.08]]) {
        const band = kit.archBand(door.w, 0, door.spring, door.apex, 0.22, 0.16, 6);
        kit.xf(band, { p: [door.c, 0, 0] });
        B.add('ashlar', onWall('z', at, band, w));
      }

      // plinth, string course and eaves cornice (dressed stone), broken at the doors
      const course = (y0, y1, proud, bevel, skipDoors) => {
        const run = (axis, at, sign, a, b) => {
          if (b - a < 0.05) return;
          const d = t / 2 + proud;
          if (axis === 'x') B.slab('ashlar', a, y0, at + sign * (t / 2 - 0.05), b, y1, at + sign * d, { bevel });
          else B.slab('ashlar', at + sign * (t / 2 - 0.05), y0, a, at + sign * d, y1, b, { bevel });
        };
        const md = mainDoor.w / 2 + 0.35, sd = sideDoor.w / 2 + 0.25, ed = eastDoor.w / 2 + 0.25;
        run('x', hd - t / 2, 1, -hw - proud, skipDoors ? -md : hw + proud); if (skipDoors) run('x', hd - t / 2, 1, md, hw + proud);
        run('x', -(hd - t / 2), -1, -hw - proud, skipDoors ? breachA - 0.15 : hw + proud); if (skipDoors) run('x', -(hd - t / 2), -1, breachB + 0.12, hw + proud);
        run('z', hw - t / 2, 1, -hd, skipDoors ? eastDoor.c - ed : hd); if (skipDoors) run('z', hw - t / 2, 1, eastDoor.c + ed, hd);
        run('z', -(hw - t / 2), -1, -hd, skipDoors ? sideDoor.c - sd : hd); if (skipDoors) run('z', -(hw - t / 2), -1, sideDoor.c + sd, 7.3);
      };
      course(-0.1, 0.62, 0.12, 0.05, true);
      course(2.06, 2.2, 0.07, 0.03, true);
      course(eave - 0.3, eave - 0.02, 0.16, 0.04, false);

      // quoins on the free corners
      const quoins = (x, z, sx, sz, y0, y1, key = 'ashlar') => {
        let i = 0;
        for (let y = y0; y < y1 - 0.2; y += 0.43, i++) {
          const lx = i % 2 ? 0.36 : 0.66, lz = i % 2 ? 0.66 : 0.36;
          B.box(key, lx, 0.4, lz, x - sx * (lx / 2 - 0.035), y + 0.2, z - sz * (lz / 2 - 0.035), { bevel: 0.025, tint: 0.92 + rng() * 0.16 });
        }
      };
      quoins(hw, hd, 1, 1, 0.64, eave - 0.3); quoins(hw, -hd, 1, -1, 0.64, eave - 0.3); quoins(-hw, -hd, -1, -1, 0.64, eave - 0.3);

      // stepped buttresses with weathered offsets
      const buttress = (x, z, dx, dz, h = 1) => {
        // profile in (distance from the wall, y), extruded across the 0.9 m width
        const pts = [[-0.1, 0], [1.15, 0], [1.15, 3.0 * h], [0.78, 3.5 * h], [0.78, 5.5 * h], [0.46, 5.95 * h], [0.46, 6.75 * h], [-0.1, 7.3 * h]];
        const geo = kit.extrude(pts, 0.9);
        kit.xf(geo, { p: [0, 0, -0.45] });
        const ry = dx > 0 ? 0 : dx < 0 ? PI : dz > 0 ? -PI / 2 : PI / 2;
        B.add('ashlar', geo, { r: [0, ry, 0], p: [x, 0, z] });
        // plinth block and drip moulds
        const blk = (d0, d1, y0, y1, w, bevel) => {
          const cx = x + dx * (d0 + d1) / 2, cz = z + dz * (d0 + d1) / 2;
          B.box('ashlar', dx ? d1 - d0 : w, y1 - y0, dx ? w : d1 - d0, cx, (y0 + y1) / 2, cz, { bevel });
        };
        blk(-0.05, 1.3, -0.1, 0.62, 1.2, 0.05);
        blk(0.7, 1.22, 2.92 * h, 3.04 * h, 1.02, 0.02);
        blk(0.4, 0.84, 5.42 * h, 5.54 * h, 1.02, 0.02);
        const hx = dx ? 0.62 : 0.45, hz = dz ? 0.62 : 0.45;
        B.colBox(x + dx * 0.55, z + dz * 0.55, hx, hz, 0, 3.0 * h);
        B.colBox(x + dx * 0.35, z + dz * 0.35, dx ? 0.42 : 0.45, dz ? 0.42 : 0.45, 3.0 * h, 6.7 * h, 'concrete', { noNav: true });
      };
      for (const z of [-11.3, -6.75, -2.25, 2.25, 6.75, 11.3]) buttress(hw, z, 1, 0);
      for (const z of [-11.3, -6.75, -2.25, 2.25, 6.6]) buttress(-hw, z, -1, 0);
      for (const x of [-(hw - 1.7), hw - 1.7]) buttress(x, -hd, 0, -1, 1);
      buttress(hw - 1.7, hd, 0, 1, 1);

      B.endGrid({ xs: [-3.3, 3.3], zs: BAYS, capKeys: [out, inn], capKey: out });

      // ---------------------------------------------------------------- floors and steps
      B.slab('flag', -ihw, -0.3, -ihd, ihw, floor, ihd);
      B.col(-ihw, -0.3, -ihd, ihw, floor, ihd, 'concrete');
      // thresholds through the door openings and the breach
      const mh = mainDoor.w / 2, sh = sideDoor.w / 2, eh = eastDoor.w / 2;
      B.slab('flagOut', -mh, -0.3, ihd, mh, floor, hd + 0.02); B.col(-mh, -0.3, ihd, mh, floor, hd, 'concrete');
      B.slab('flagOut', -hw - 0.02, -0.3, sideDoor.c - sh, -ihw, floor, sideDoor.c + sh); B.col(-hw, -0.3, sideDoor.c - sh, -ihw, floor, sideDoor.c + sh, 'concrete');
      B.slab('flagOut', ihw, -0.3, eastDoor.c - eh, hw + 0.02, floor, eastDoor.c + eh); B.col(ihw, -0.3, eastDoor.c - eh, hw, floor, eastDoor.c + eh, 'concrete');
      B.slab('flagOut', breachA, -0.3, -hd - 0.05, breachB, floor - 0.02, -ihd); B.col(breachA, -0.3, -hd, breachB, floor, -ihd, 'concrete');
      // south steps
      B.slab('ashlar', -mh - 0.9, -0.3, hd, mh + 0.9, floor, hd + 0.75, { bevel: 0.03 }); B.col(-mh - 0.9, -0.3, hd, mh + 0.9, floor, hd + 0.75, 'concrete');
      B.slab('ashlar', -mh - 1.4, -0.3, hd + 0.75, mh + 1.4, 0.12, hd + 1.3, { bevel: 0.03 }); B.col(-mh - 1.4, -0.3, hd + 0.75, mh + 1.4, 0.12, hd + 1.3, 'concrete');
      // west and east steps
      B.slab('ashlar', -hw - 0.75, -0.3, sideDoor.c - sh - 0.3, -hw, 0.12, sideDoor.c + sh + 0.3, { bevel: 0.03 }); B.col(-hw - 0.75, -0.3, sideDoor.c - sh - 0.3, -hw, 0.12, sideDoor.c + sh + 0.3, 'concrete');
      B.slab('ashlar', hw, -0.3, eastDoor.c - eh - 0.3, hw + 0.75, 0.12, eastDoor.c + eh + 0.3, { bevel: 0.03 }); B.col(hw, -0.3, eastDoor.c - eh - 0.3, hw + 0.75, 0.12, eastDoor.c + eh + 0.3, 'concrete');
      // chancel step and altar dais
      B.slab('flag', -ihw, floor, -ihd, ihw, 0.4, -8.2); B.col(-ihw, floor, -ihd, ihw, 0.4, -8.2, 'concrete');
      B.slab('ashlarIn', -ihw, floor, -8.2, ihw, 0.4, -8.06, { bevel: 0.02 });
      B.slab('ashlarIn', -2.3, 0.4, -11.75, 2.3, 0.56, -9.55, { bevel: 0.025 }); B.col(-2.3, 0.4, -11.75, 2.3, 0.56, -9.55, 'concrete', { noNav: true });

      // ---------------------------------------------------------------- roof
      // slates, boards, rafters and trusses in the same bays as the walls: a bay falls when the wall under it has gone
      B.begin({ kind: 'wood', hp: 1600, rests: ['church'], tag: 'church-roof' });           // (a rocket at the foot of the wall should not take the roof off first)
      const ang = Math.atan2(rise, hw), ca = Math.cos(ang), sa = Math.sin(ang);
      const ridgeY = eave + rise + 0.28, over = 0.5;
      const slopeLen = (hw + over) / ca;
      // hole in the west slope (s = 0 at the ridge, 1 at the eave)
      const holeC = { z: -7.5, s: 0.5 };
      const inHole = (side, s, z) => {
        if (side > 0) return false;
        const dz = (z - holeC.z) / 2.5, ds = (s - holeC.s) / 0.33;
        return dz * dz + ds * ds < 1 + (kit.noise2(z * 1.7 + 3, s * 9) - 0.5) * 0.7;
      };
      const roofPos = (side, s) => [side * s * slopeLen * ca, ridgeY - s * slopeLen * sa, 0];
      const nz = 44, ns = 9, z0 = -hd - 0.35, z1 = hd + 0.35, thick = 0.2;
      for (const side of [-1, 1]) {
        const top = [], bot = [], edge = [];
        const P = (s, z) => { const p = roofPos(side, s); return [p[0], p[1], z]; };
        for (let i = 0; i < nz; i++) for (let k = 0; k < ns; k++) {
          const za = z0 + (z1 - z0) * (i / nz), zb = z0 + (z1 - z0) * ((i + 1) / nz), s0 = k / ns, s1 = (k + 1) / ns;
          if (inHole(side, (s0 + s1) / 2, (za + zb) / 2)) continue;
          const a = P(s0, za), b = P(s1, za), c = P(s1, zb), d = P(s0, zb);
          top.push({ a, b, c, d, s0, s1, za, zb });
          // edges facing a missing neighbour
          const open = (ss, zz) => zz < z0 || zz > z1 || ss < 0 || ss > 1 || inHole(side, ss, zz);
          if (open((s0 + s1) / 2, za - 0.2)) edge.push([a, b]);
          if (open((s0 + s1) / 2, zb + 0.2)) edge.push([c, d]);
          if (open(s0 - 0.05, (za + zb) / 2)) edge.push([d, a]);
          if (open(s1 + 0.05, (za + zb) / 2)) edge.push([b, c]);
        }
        const tp = [], bp = [], bo = [], ep = [];             // bo: the underside past the walls, out in the weather
        const down = (p) => [p[0] - side * sa * thick, p[1] - ca * thick, p[2]];
        for (const q of top) {
          tp.push(q.a, q.b, q.c, q.a, q.c, q.d);
          const outside = Math.abs((q.za + q.zb) / 2) > ihd + 0.2 || ((q.s0 + q.s1) / 2) * slopeLen * ca > ihw + 0.35;
          (outside ? bo : bp).push(down(q.a), down(q.c), down(q.b), down(q.a), down(q.d), down(q.c));
        }
        for (const [a, b] of edge) ep.push(a, b, down(b), a, down(b), down(a));
        const mk = (pts, outward) => kit.fromTris(pts, outward);
        const gt = mk(tp, false);
        // wind every top triangle to face up and out
        fixUp(gt, side, sa, ca);
        // slates course along the ridge: u runs with the ridge, v down the slope
        const pa = gt.attributes.position, uv = new Float32Array(pa.count * 2);
        for (let i = 0; i < pa.count; i++) { uv[i * 2] = pa.getZ(i); uv[i * 2 + 1] = (ridgeY - pa.getY(i)) / sa; }
        gt.setAttribute('uv', new T.BufferAttribute(uv, 2));
        B.add('slate', gt, { uv: 'keep' });
        const gb = mk(bp, false); fixUp(gb, side, -sa, -ca);
        B.add('plankIn', gb, { cast: false });
        // the overhang is lit by the night, not by the nave: boarded with the nave's material it glowed along every eave and gable
        if (bo.length) { const go = mk(bo, false); fixUp(go, side, -sa, -ca); B.add('slate', go, { cast: false }); }
        if (ep.length) { B.add('slate', kit.fromTris(ep, false)); B.add('slate', kit.flip(kit.fromTris(ep, false))); }
      }
      function fixUp(geo, side, sx, cy) {
        const p = geo.attributes.position.array, n = geo.attributes.normal.array;
        for (let i = 0; i < p.length; i += 9) {
          if (n[i] * side * sx + n[i + 1] * cy < 0) {
            for (let k = 0; k < 3; k++) { const tmp = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = tmp; }
          }
        }
        geo.computeVertexNormals();
      }
      // ridge: lead roll and spaced ridge tiles
      B.add('lead', kit.extrude([[-0.26, -0.2], [0, 0.06], [0.26, -0.2], [0.2, -0.26], [0, -0.06], [-0.2, -0.26]], z1 - z0), { p: [0, ridgeY + 0.02, z0] });
      for (let z = z0 + 0.3; z < z1; z += 0.62) B.box('slate', 0.2, 0.1, 0.5, 0, ridgeY + 0.1, z, { bevel: 0.03, tint: 0.8 + rng() * 0.3 });
      // gable copings, kneelers and finials
      for (const zs of [1, -1]) {
        const zc = zs * (hd + 0.02);
        for (const side of [-1, 1]) {
          const len = (hw + 0.2) / ca;
          const cop = kit.bevelBox(len, 0.2, 1.06, 0.035);
          kit.xf(cop, { r: [0, 0, -side * ang], p: [side * (hw + 0.2) / 2, eave + rise / 2 + 0.36 - 0.02, zc - zs * 0.0] });
          B.add('ashlar', cop);
          B.box('ashlar', 0.7, 0.5, 1.12, side * (hw + 0.12), eave + 0.12, zc, { bevel: 0.05 });
        }
        B.box('ashlar', 0.5, 0.5, 1.1, 0, eave + rise + 0.52, zc, { bevel: 0.06 });
        if (zs > 0) {
          B.box('ashlar', 0.16, 1.5, 0.16, 0, eave + rise + 1.5, zc, { bevel: 0.03 });
          B.box('ashlar', 0.86, 0.16, 0.16, 0, eave + rise + 1.75, zc, { bevel: 0.03 });
        } else B.add('ashlar', kit.cyl(0.02, 0.2, 0.8, 4), { p: [0, eave + rise + 0.77, zc], r: [0, PI / 4, 0] });
      }
      // rafters seen from inside, broken round the hole
      for (let z = -ihd + 0.3; z < ihd; z += 0.75) for (const side of [-1, 1]) {
        let s0 = 0.02, s1 = 0.9;
        const hit = inHole(side, 0.5, z) || inHole(side, 0.3, z) || inHole(side, 0.7, z);
        const seg = (a, b, droop = 0) => {
          const pa = roofPos(side, a), pb = roofPos(side, b);
          B.rod('timberIn', [pa[0] - side * sa * 0.3, pa[1] - ca * 0.3, z], [pb[0] - side * sa * 0.3, pb[1] - ca * 0.3 - droop, z + droop * 0.4], 0.075, 0.075, { seg: 4 });
        };
        if (!hit) seg(s0, s1);
        else { seg(s0, 0.2 + rng() * 0.08, 0.15); if (rng() < 0.6) seg(0.8 - rng() * 0.08, s1); }
      }
      info.skylights.push({ x: -(holeC.s * slopeLen * ca), z: holeC.z, w: 3.4, d: 4.6 });

      // ---------------------------------------------------------------- trusses
      const trussZ = [-9, -4.5, 0, 4.5, 9];
      for (const z of trussZ) {
        const tw = 0.3, yT = eave - 0.12;
        B.box('timberIn', ihw * 2 + 0.3, 0.36, tw, 0, yT, z, { bevel: 0.025 });
        B.box('timberIn', 0.28, rise - 0.5, 0.28, 0, yT + (rise - 0.5) / 2 + 0.15, z, { bevel: 0.02 });
        for (const side of [-1, 1]) {
          const a = [side * (ihw - 0.1), yT + 0.1, z], b = [0, yT + rise - 0.25, z];
          const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
          B.add('timberIn', kit.bevelBox(d, 0.3, 0.26, 0.02), { r: [0, 0, Math.atan2(b[1] - a[1], b[0] - a[0])], p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z] });
          // strut and curved brace
          B.rod('timberIn', [0, yT + 0.3, z], [side * ihw * 0.5, yT + rise * 0.5 - 0.15, z], 0.1, 0.1, { seg: 4 });
          B.add('timberIn', kit.tube([[side * (ihw - 0.02), yT - 1.5, z], [side * (ihw - 0.5), yT - 0.75, z], [side * (ihw - 1.7), yT - 0.2, z]], 0.1, 5));
          B.box('ashlarIn', 0.34, 0.4, 0.44, side * (ihw - 0.15), yT - 1.6, z, { bevel: 0.05 });
        }
      }
      for (const side of [-1, 1]) for (const s of [0.36, 0.7]) {
        const p = roofPos(side, s);
        B.box('timberIn', 0.2, 0.24, ihd * 2, p[0] - side * sa * 0.42, p[1] - ca * 0.42, 0);
      }
      B.box('timberIn', 0.22, 0.3, ihd * 2, 0, ridgeY - 0.5, 0);
      // wall plates
      for (const side of [-1, 1]) B.box('timberIn', 0.3, 0.2, ihd * 2, side * (ihw + 0.2), eave + 0.02, 0);

      B.endGrid({ zs: BAYS });

      // ---------------------------------------------------------------- doors
      const leaf = (w, spring, apex) => {
        // half of a pointed door, hinge edge at x = 0, extending +x
        const full = kit.archPts(w * 2, spring, apex, 8);
        const half = full.filter((p) => p[0] <= 0.001).map((p) => [p[0] + w, p[1]]);
        const pts = [[0, 0.03]].concat(half).concat([[w, 0.03]]);
        return kit.extrude(pts, 0.09);
      };
      const strap = (grp, w, y) => grp.push(['iron', kit.bevelBox(w * 0.82, 0.07, 0.02, 0.006), [w * 0.43, y, 0.1]], ['iron', kit.bevelBox(w * 0.82, 0.07, 0.02, 0.006), [w * 0.43, y, -0.01]]);
      const hang = (parts, x, y, z, ry, mirror) => {
        for (const [key, geo, p] of parts) {
          if (p) kit.xf(geo, { p });
          if (mirror) kit.xf(geo, { s: [-1, 1, 1] });
          B.add(key, geo, { r: [0, ry, 0], p: [x, y, z] });
        }
      };
      const doorParts = (w, spring, apex) => {
        const parts = [['plank', leaf(w, spring, apex)]];
        for (const y of [0.45, spring * 0.55, spring - 0.15]) strap(parts, w, y);
        for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) parts.push(['iron', kit.cyl(0.012, 0.018, 0.02, 5), [0.18 + i * (w - 0.36) / 3, 0.3 + k * (spring - 0.5) / 5, 0.09]]);
        parts.push(['iron', kit.tube([[w - 0.22, spring * 0.42, 0.1], [w - 0.22, spring * 0.42 - 0.06, 0.15], [w - 0.22, spring * 0.42 - 0.14, 0.1]], 0.014, 5)]);
        return parts;
      };
      // main doors swung out against the facade
      // (each leaf is its own thing that breaks, and comes off with the wall it hangs on)
      const DOOR = { kind: 'wood', hp: 500, hangs: ['church'], tag: 'door' };
      B.begin(DOOR);
      hang(doorParts(mh, mainDoor.spring - 0.02, mainDoor.apex - 0.03), mh, floor, hd + 0.02, -0.28, false);
      B.col(mh, floor, hd, mh * 2, 3.2, hd + 0.6, 'wood');
      B.end();
      B.begin(DOOR);
      hang(doorParts(mh, mainDoor.spring - 0.02, mainDoor.apex - 0.03), -mh, floor, hd + 0.02, 0.42, true);
      B.col(-mh * 2 + 0.1, floor, hd, -mh, 3.2, hd + 0.85, 'wood');
      B.end();
      // The leaves stand in the way of anything coming along the wall, so the dead's grid has to know them: marked
      // noNav they were walked into and held whoever did. They start at the jambs, which the wall already closes
      // to the grid, so the doorway is no narrower for it.
      // The side doors are pairs of leaves thrown back into the nave, each nearly flat against the wall beside its
      // jamb. A leaf hinged at the low-z jamb lies along +z when shut and `open` swings it inward; its partner at
      // the high-z jamb is the mirror image.
      const pair = (door, sx, openA, openB) => {
        const lw = door.w / 2, x = sx * (ihw + 0.05), parts = () => doorParts(lw, door.spring - 0.02, door.apex - 0.03);
        B.begin(DOOR);
        const dirA = sx < 0 ? -PI / 2 + openA : -PI / 2 - openA;      // heading of the leaf from its hinge
        hang(parts(), x, floor, door.c - lw, dirA, false);
        hang(parts(), x, floor, door.c + lw, sx < 0 ? PI / 2 - openB : PI / 2 + openB, false);
        for (const [zh, o, zs] of [[door.c - lw, openA, -1], [door.c + lw, openB, 1]]) {
          const inx = lw * Math.sin(o) + 0.1, tip = zh - zs * lw * Math.cos(o);      // reach into the nave; where the free edge ends up
          B.col(sx < 0 ? -ihw : ihw - inx, floor, Math.min(zh, tip) - 0.06, sx < 0 ? -ihw + inx : ihw, 2.4, Math.max(zh, tip) + 0.06, 'wood', { noNav: true });
        }
        B.end();
      };
      pair(sideDoor, -1, 2.72, 2.5);
      pair(eastDoor, 1, 2.8, 2.9);

      // ---------------------------------------------------------------- tower
      // four tiers, each standing on the one below: base, upper stage, belfry, spire
      B.begin({ kind: 'stone', hp: 3600, raze: true, tag: 'tower' });
      const th = 2.7, tx = -(hw + th - 0.2), tz = 10.0;    // half width and centre: it stands against the west wall
      {
        B.slab(out, tx - th, -0.5, tz - th, tx + th, 6.5, tz + th);
        B.slab('ashlar', tx - th - 0.14, -0.1, tz - th - 0.14, tx + th + 0.14, 0.62, tz + th + 0.14, { bevel: 0.05 });
        B.slab('ashlar', tx - th - 0.1, 6.42, tz - th - 0.1, tx + th + 0.1, 6.62, tz + th + 0.1, { bevel: 0.04 });
        const t2 = th - 0.1;
        B.slab(out, tx - t2, 6.5, tz - t2, tx + t2, 11.8, tz + t2);
        B.slab('ashlar', tx - t2 - 0.1, 11.72, tz - t2 - 0.1, tx + t2 + 0.1, 11.92, tz + t2 + 0.1, { bevel: 0.04 });
        for (const [sx, sz] of [[-1, -1], [-1, 1], [1, 1]]) { quoins(tx + sx * th, tz + sz * th, sx, sz, 0.64, 6.4); quoins(tx + sx * t2, tz + sz * t2, sx, sz, 6.66, 11.7); }
        // slit windows and the tower door
        for (const [y, h] of [[3.6, 1.5], [8.6, 1.7]]) {
          B.box('void', 0.24, h, 0.06, tx, y, tz + (y < 6.5 ? th : t2) + 0.005);
          B.box('void', 0.06, h, 0.24, tx - (y < 6.5 ? th : t2) - 0.005, y, tz);
          for (const [bx, bz, w, d] of [[tx, tz + (y < 6.5 ? th : t2) + 0.03, 0.5, 0.08], [tx - (y < 6.5 ? th : t2) - 0.03, tz, 0.08, 0.5]]) {
            B.box('ashlar', w, 0.14, d, bx, y - h / 2 - 0.07, bz, { bevel: 0.02 }); B.box('ashlar', w, 0.14, d, bx, y + h / 2 + 0.07, bz, { bevel: 0.02 });
          }
        }
        {
          const dw = 1.25, band = kit.archBand(dw, 0, 2.0, 2.85, 0.2, 0.14, 6);
          B.add('ashlar', band, { p: [tx, 0, tz + th - 0.02] });
          const dl = kit.extrude([[-dw / 2, 0.02]].concat(kit.archPts(dw, 2.0, 2.85, 6)).concat([[dw / 2, 0.02]]), 0.08);
          B.add('plank', dl, { p: [tx, 0, tz + th - 0.03] });
          for (const y of [0.5, 1.2, 1.9]) B.box('iron', dw * 0.8, 0.07, 0.02, tx, y, tz + th + 0.06, { bevel: 0.006 });
          B.slab('ashlar', tx - 0.95, -0.2, tz + th, tx + 0.95, 0.12, tz + th + 0.5, { bevel: 0.03 }); B.col(tx - 0.95, -0.2, tz + th, tx + 0.95, 0.12, tz + th + 0.5, 'concrete');
        }
        // belfry: four thin walls with louvred openings, a bell inside
        const t3 = th - 0.2, wt = 0.55, by0 = 11.8, by1 = 16.4;
        const bo = { c: 0, w: 1.6, y0: 12.7, spring: 14.5, apex: 15.7 };
        for (const [axis, at, o, cu] of [['x', tz + t3 - wt / 2, 1, tx], ['x', tz - t3 + wt / 2, -1, tx], ['z', tx + t3 - wt / 2, 1, tz], ['z', tx - t3 + wt / 2, -1, tz]]) {
          const lo = axis === 'x' ? -t3 : -t3 + wt, hi = axis === 'x' ? t3 : t3 - wt;
          kit.wall(B, { axis, at, u0: cu + lo, u1: cu + hi, y0: by0, y1: by1, t: wt, out: o, matOut: out, matIn: out, holes: [{ ...bo, c: cu }], collide: false });
          const band = kit.archBand(bo.w, bo.y0, bo.spring, bo.apex, 0.16, 0.14, 6);
          kit.xf(band, { p: [cu, 0, 0] });
          B.add('ashlar', onWall(axis, at, band, o > 0 ? wt / 2 - 0.05 : -wt / 2 - 0.09));
          // louvres
          for (let y = bo.y0 + 0.2; y < bo.spring + 0.5; y += 0.3) {
            const w = bo.w - 0.06 - Math.max(0, y - bo.spring) * 1.1;
            if (w < 0.3) break;
            const slat = kit.box(w, 0.03, 0.34);
            kit.xf(slat, { r: [o * 0.6, 0, 0], p: [cu, y, 0] });
            B.add('slate', onWall(axis, at, slat, 0));
          }
        }
        for (const [sx, sz] of [[-1, -1], [-1, 1], [1, 1], [1, -1]]) quoins(tx + sx * t3, tz + sz * t3, sx, sz, 11.96, 16.3);
        B.slab('plankIn', tx - t3 + 0.4, 12.3, tz - t3 + 0.4, tx + t3 - 0.4, 12.42, tz + t3 - 0.4);
        // bell frame and bell
        B.box('timber', 0.2, 0.2, t3 * 2 - 1.0, tx, 15.5, tz); B.box('timber', t3 * 2 - 1.0, 0.2, 0.2, tx, 15.3, tz);
        B.add('brass', kit.lathe([[0.02, 0.0], [0.62, 0.0], [0.6, 0.08], [0.46, 0.3], [0.36, 0.7], [0.3, 0.98], [0.2, 1.1], [0.02, 1.14]], 18), { p: [tx, 14.1, tz] });
        B.box('iron', 0.1, 0.34, 0.1, tx, 15.36, tz);
        // cornice, parapet and pinnacles
        B.slab('ashlar', tx - t3 - 0.22, 16.3, tz - t3 - 0.22, tx + t3 + 0.22, 16.56, tz + t3 + 0.22, { bevel: 0.05 });
        const pr = t3 + 0.1;
        for (let i = 0; i < 7; i++) {
          const o = -pr + 0.36 + i * ((pr * 2 - 0.72) / 6);
          const hgt = i % 2 ? 0.45 : 0.95;
          for (const s of [-1, 1]) {
            B.box(i % 2 ? out : 'ashlar', 0.76, hgt, 0.34, tx + o, 16.56 + hgt / 2, tz + s * pr, { bevel: i % 2 ? 0 : 0.03 });
            B.box(i % 2 ? out : 'ashlar', 0.34, hgt, 0.76, tx + s * pr, 16.56 + hgt / 2, tz + o, { bevel: i % 2 ? 0 : 0.03 });
          }
        }
        for (const [sx, sz] of [[-1, -1], [-1, 1], [1, 1], [1, -1]]) {
          B.box('ashlar', 0.6, 1.5, 0.6, tx + sx * pr, 17.3, tz + sz * pr, { bevel: 0.04 });
          B.add('ashlar', kit.cyl(0.03, 0.34, 1.5, 4), { p: [tx + sx * pr, 18.05, tz + sz * pr], r: [0, PI / 4, 0] });
        }
        // octagonal spire with broaches
        const sp = kit.cyl(0.12, t3 - 0.15, 9.4, 8, true);
        kit.xf(sp, { r: [0, PI / 8, 0] });
        B.add('slate', sp, { p: [tx, 16.56, tz] });
        for (const [sx, sz] of [[-1, -1], [-1, 1], [1, 1], [1, -1]]) {
          const br = kit.fromTris([[0, 0, 0], [t3 - 0.2, 0, 0], [0, 0, t3 - 0.2], [0, 0, 0], [t3 - 0.2, 0, 0], [(t3) * 0.42, 3.2, (t3) * 0.42], [0, 0, t3 - 0.2], [0, 0, 0], [(t3) * 0.42, 3.2, (t3) * 0.42], [t3 - 0.2, 0, 0], [0, 0, t3 - 0.2], [(t3) * 0.42, 3.2, (t3) * 0.42]]);
          B.add('slate', br, { s: [-sx, 1, -sz], p: [tx + sx * (t3 - 0.1), 16.56, tz + sz * (t3 - 0.1)] });
        }
        B.add('lead', kit.cyl(0.14, 0.2, 0.3, 8), { p: [tx, 25.9, tz] });
        B.box('iron', 0.06, 1.7, 0.06, tx, 26.9, tz); B.box('iron', 0.7, 0.06, 0.06, tx, 27.3, tz);
        B.add('brass', kit.sphere(0.12, 8, 6), { p: [tx, 26.25, tz] });
        B.col(tx - th, 0, tz - th, tx + th, 17.4, tz + th, 'concrete');
      }

      B.endGrid({ ys: [6.5, 11.8, 16.5], restsAbove: ['tower'] });

      // ---------------------------------------------------------------- crystal dais
      for (const [r, y0, y1] of [[2.15, floor, 0.38], [1.65, 0.38, 0.52], [1.15, 0.52, 0.66]]) {
        B.add('ashlarIn', kit.cyl(r, r + 0.03, y1 - y0, 28), { p: [0, y0, 0] });
        const h = r * 0.72; B.col(-h, y0, -h, h, y1, h, 'concrete', { noNav: true });
        B.col(-r * 0.38, y0, -r * 0.98, r * 0.38, y1, r * 0.98, 'concrete', { noNav: true }); B.col(-r * 0.98, y0, -r * 0.38, r * 0.98, y1, r * 0.38, 'concrete', { noNav: true });
      }
      B.add('ashlarIn', kit.lathe([[0.62, 0], [0.66, 0.05], [0.5, 0.12], [0.36, 0.2], [0.3, 0.34], [0.34, 0.44], [0.5, 0.5], [0.54, 0.56], [0.02, 0.58]], 8), { p: [0, 0.66, 0] });
      for (let i = 0; i < 4; i++) {
        const a = i * PI / 2 + PI / 4, cx = Math.cos(a), sz = Math.sin(a);
        B.add('brassIn', kit.tube([[cx * 0.46, 1.18, sz * 0.46], [cx * 0.52, 1.42, sz * 0.52], [cx * 0.4, 1.66, sz * 0.4], [cx * 0.3, 1.78, sz * 0.3]], 0.03, 6));
      }
      B.add('brassIn', kit.cyl(0.52, 0.52, 0.05, 20, true), { p: [0, 1.2, 0] });
      B.col(-0.6, floor, -0.6, 0.6, 1.5, 0.6, 'concrete');

      // ---------------------------------------------------------------- altar and chancel
      {
        const az = -10.7, ay = 0.56;
        // The altar is one thing that breaks (stone, tag `altar`); the cross, the two candlesticks and the book each
        // rest on it, so they can be shot off it one at a time and all come down when it does.
        B.begin({ kind: 'stone', hp: 900, tag: 'altar' });
        B.box('ashlarIn', 2.5, 0.92, 0.95, 0, ay + 0.46, az, { bevel: 0.03 });
        for (const x of [-0.95, 0, 0.95]) B.add('ashlarIn', kit.archBand(0.5, 0, 0.42, 0.66, 0.06, 0.04, 5), { p: [x, ay + 0.1, az + 0.475] });
        B.box('ashlarIn', 2.85, 0.12, 1.2, 0, ay + 0.98, az, { bevel: 0.03 });
        // runner cloth with a front drop
        B.box('cloth', 1.0, 0.02, 1.26, 0, ay + 1.05, az); B.box('cloth', 1.0, 0.5, 0.02, 0, ay + 0.8, az + 0.63);
        B.col(-1.45, ay, az - 0.62, 1.45, ay + 1.1, az + 0.62, 'concrete');
        B.end();
        B.begin({ kind: 'metal', hp: 60, rests: ['altar'] });
        B.box('brassIn', 0.05, 0.9, 0.05, 0, ay + 1.52, az - 0.25, { bevel: 0.008 }); B.box('brassIn', 0.5, 0.05, 0.05, 0, ay + 1.72, az - 0.25, { bevel: 0.008 });
        B.add('brassIn', kit.lathe([[0.16, 0], [0.16, 0.03], [0.05, 0.07], [0.03, 0.1]], 12), { p: [0, ay + 1.04, az - 0.25] });
        B.col(-0.27, ay + 1.1, az - 0.31, 0.27, ay + 2.0, az - 0.19, 'metal', { bulletOnly: true });
        B.end();
        // altar candlesticks
        for (const x of [-1.05, 1.05]) {
          const stick = B.begin({ kind: 'metal', hp: 40, rests: ['altar'] });
          B.add('brassIn', kit.lathe([[0.1, 0], [0.1, 0.02], [0.03, 0.06], [0.022, 0.2], [0.04, 0.24], [0.022, 0.28], [0.022, 0.42], [0.055, 0.45], [0.055, 0.47]], 10), { p: [x, ay + 1.04, az - 0.1] });
          B.add('wax', kit.cyl(0.02, 0.022, 0.26, 8), { p: [x, ay + 1.51, az - 0.1] });
          const fl = [x, ay + 1.81, az - 0.1, 1]; info.flames.push(fl); stick.flames = [fl];
          B.col(x - 0.1, ay + 1.1, az - 0.2, x + 0.1, ay + 1.8, az, 'metal', { bulletOnly: true });
          B.end();
        }
        // open book
        B.begin({ kind: 'wood', hp: 20, rests: ['altar'] });
        B.box('plankIn', 0.44, 0.03, 0.3, 0.45, ay + 1.065, az + 0.2, { r: [0, 0.2, 0] });
        B.box('wax', 0.4, 0.02, 0.27, 0.45, ay + 1.09, az + 0.2, { r: [0, 0.2, 0], tint: 0.8 });
        B.col(0.2, ay + 1.1, az + 0.03, 0.7, ay + 1.17, az + 0.37, 'wood', { bulletOnly: true });
        B.end();
        // reredos: carved timber screen under the lancets
        const rz = -ihd + 0.12;
        B.begin({ kind: 'wood', hp: 500 });
        B.box('timberIn', 4.4, 2.5, 0.12, -0.6, ay + 1.25, rz, { bevel: 0.02 });
        for (let i = 0; i < 7; i++) {
          const x = -2.55 + i * 0.65;
          B.add('plankIn', kit.archBand(0.42, 0, 1.5, 1.9, 0.06, 0.05, 5), { p: [x, ay + 0.25, rz + 0.06] });
          B.add('timberIn', kit.cyl(0.02, 0.07, 0.4, 4), { p: [x - 0.325, ay + 2.5, rz], r: [0, PI / 4, 0] });
        }
        B.box('timberIn', 4.6, 0.14, 0.2, -0.6, ay + 2.52, rz + 0.02, { bevel: 0.03 });
        B.col(-2.85, ay, rz - 0.1, 1.65, ay + 2.62, rz + 0.12, 'wood', { bulletOnly: true });
        B.end();
        // Floor candelabra either side. The one on the breach's side went over when the wall came in and lies
        // against the heap, out: it stood in the middle of the way in, where nothing wide could pass it.
        {
          B.begin({ kind: 'metal', hp: 120 });
          const P = new kit.Part();
          P.add('ironIn', kit.lathe([[0.2, 0], [0.2, 0.03], [0.04, 0.08], [0.022, 0.2], [0.022, 1.25], [0.05, 1.28], [0.022, 1.31], [0.022, 1.42]], 8));
          for (let k = 1; k < 5; k++) { const a = (k / 5) * PI * 2; P.add('ironIn', kit.tube([[0, 1.3, 0], [Math.cos(a) * 0.19, 1.36, Math.sin(a) * 0.19]], 0.012, 4)); }
          for (const [dx, dz, ry] of [[0.25, 0.3, 0.4], [0.42, -0.12, 1.9], [0.05, 0.45, 2.7]]) B.add('wax', kit.cyl(0.016, 0.018, 0.16, 6), { r: [PI / 2, ry, 0], p: [6.25 + dx, 0.42, -10.3 + dz] });
          P.commit(B, { p: [4.75, 0.6, -10.42], r: [0.08, 0.12, -PI / 2 + 0.07] });
          B.col(4.7, 0.42, -10.65, 6.3, 0.85, -9.8, 'metal', { bulletOnly: true });
          B.end();
        }
        for (const x of [-2.9]) {
          const stand = B.begin({ kind: 'metal', hp: 120 }); stand.flames = [];
          B.add('ironIn', kit.lathe([[0.2, 0], [0.2, 0.03], [0.04, 0.08], [0.022, 0.2], [0.022, 1.25], [0.05, 1.28], [0.022, 1.31], [0.022, 1.42]], 8), { p: [x, 0.4, -9.3] });
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * PI * 2, r = k ? 0.19 : 0, h = k ? 1.36 : 1.46;
            if (k) B.rod('ironIn', [x, 0.4 + 1.3, -9.3], [x + Math.cos(a) * r, 0.4 + h, -9.3 + Math.sin(a) * r], 0.012, 0.012, { seg: 4 });
            B.add('wax', kit.cyl(0.016, 0.018, 0.16, 6), { p: [x + Math.cos(a) * r, 0.4 + h, -9.3 + Math.sin(a) * r] });
            const fl = [x + Math.cos(a) * r, 0.4 + h + 0.2, -9.3 + Math.sin(a) * r, 0.8]; info.flames.push(fl); stand.flames.push(fl);
          }
          B.colBox(x, -9.3, 0.14, 0.14, 0.4, 1.9, 'metal', { noNav: true });
          B.end();
        }
        info.lights.push({ pos: [0, 2.9, -9.6], color: 0xffa050, intensity: 24, dist: 12, flicker: 0.22 });
      }

      // ---------------------------------------------------------------- pews
      const pew = (x, z, len, o = {}) => {
        const parts = [];
        const P = (key, geo, p, r) => parts.push([key, kit.xf(geo, { p, r })]);
        P('plankIn', kit.bevelBox(len, 0.055, 0.42, 0.012), [0, 0.45, 0]);
        P('plankIn', kit.bevelBox(len, 0.72, 0.045, 0.012), [0, 0.86, 0.25], [0.13, 0, 0]);
        P('plankIn', kit.bevelBox(len, 0.05, 0.16, 0.01), [0, 1.2, 0.32]);
        P('plankIn', kit.bevelBox(len, 0.04, 0.2, 0.01), [0, 0.22, -0.36]);
        P('timberIn', kit.box(len - 0.1, 0.3, 0.035), [0, 0.3, 0.16]);
        for (const s of [-1, 1]) {
          const end = kit.extrude([[-0.3, 0], [0.38, 0], [0.38, 1.02], [0.3, 1.14], [0.22, 1.2], [0.14, 1.14], [0.1, 0.98], [-0.02, 0.6], [-0.3, 0.52]], 0.06);
          P('timberIn', kit.xf(end, { r: [0, -PI / 2, 0] }), [s * (len / 2) + (s > 0 ? 0.06 : 0), 0, 0]);
        }
        const TH = g.THREE, M = new TH.Matrix4().compose(new TH.Vector3(x, floor + (o.y || 0), z), new TH.Quaternion().setFromEuler(new TH.Euler(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ')), new TH.Vector3(1, 1, 1));
        B.begin({ kind: 'wood', hp: 300, yaw: o.ry || 0 });
        for (const [key, geo] of parts) B.add(key, geo, { m: M, tint: o.tint || 1 });
        if (!o.noCol && (o.rx || o.rz)) {
          // tipped over: its collider is the space it really takes up, wherever it has come to lie
          const box = new TH.Box3(), part = new TH.Box3();
          for (const [, geo] of parts) { geo.computeBoundingBox(); box.union(part.copy(geo.boundingBox).applyMatrix4(M)); }
          B.col(box.min.x, floor, box.min.z, box.max.x, box.max.y, box.max.z, 'wood');
        } else if (!o.noCol) {
          const c = Math.abs(Math.cos(o.ry || 0)), s2 = Math.abs(Math.sin(o.ry || 0));
          B.colBox(x, z, (len / 2) * c + 0.34 * s2 + 0.02, (len / 2) * s2 + 0.34 * c + 0.02, floor, floor + 1.15, 'wood');
        }
        B.end();
      };
      // a plain chair: light enough to walk through, and it breaks
      const chair = (x, z, ry, tip = 0) => {
        const P = new kit.Part();
        P.box('plankIn', 0.42, 0.035, 0.4, 0, 0.45, 0, { bevel: 0.008 });
        for (const sx of [-1, 1]) { P.box('timberIn', 0.04, 0.45, 0.04, sx * 0.18, 0.225, 0.17); P.box('timberIn', 0.04, 0.95, 0.04, sx * 0.18, 0.475, -0.18); }
        for (const y of [0.66, 0.84]) P.box('plankIn', 0.4, 0.09, 0.025, 0, y, -0.18, { bevel: 0.006 });
        const fy = z < -8.2 ? 0.4 : floor;                 // the chancel stands a step higher
        B.begin({ kind: 'wood', hp: 60, yaw: ry });
        P.commit(B, { p: [x, fy + (tip ? 0.2 : 0), z], r: [tip, ry, 0], tint: 0.8 + rng() * 0.3 });
        B.col(x - 0.24, fy, z - 0.24, x + 0.24, fy + (tip ? 0.5 : 0.95), z + 0.24, 'wood', { bulletOnly: true });
        B.end();
      };
      chair(-4.6 - wide, -8.3, 0.4); chair(-3.9 - wide, -8.9, 0.9, 1.5); chair(4.7 + wide, -9.4, -0.5); chair(3.2, 0.9, -1.4, -1.5); chair(-3.6, 2.2, 1.6);
      chair(-4.4, 11.2, 2.4); chair(5.9, 9.4, -1.2); chair(-6.0, 6.7, 1.5, 1.5);
      // Two blocks of pews: a centre aisle three and a half metres wide between them and a side aisle against each
      // wall, with open floor behind the last row, so there are three ways up the nave and room to cross between them.
      const PEW = 3.0, PEWX = 1.75 + PEW / 2, rows = [3.6, 5.0, 6.4, 7.8];
      rows.forEach((z, i) => {
        for (const s of [-1, 1]) {
          const tint = 0.85 + rng() * 0.25;
          // The side aisle is the way in from the east door, and a brute is 1.1 m across: the two pews that face
          // that door stand 0.6 m toward the centre aisle, which leaves two metres between their ends and the open leaf.
          if (s > 0 && i === 0) { pew(2.5, z - 1.3, PEW, { ry: 0.35, rx: 1.45, y: 0.4, tint }); continue; }                 // thrown on its back
          if (s > 0 && i === 1) { pew(PEWX - 0.62, z + 0.05, PEW, { ry: 0.07, tint }); continue; }                      // shoved aside by what came in at the door
          if (s < 0 && i === 3) { pew(-3.1, z + 0.2, PEW, { ry: -0.32, tint }); continue; }                              // shoved out of line
          if (s > 0 && i === 2) continue;                                                                           // dragged to the door as a barricade
          pew(s * PEWX, z, PEW, { tint });
        }
      });
      pew(5.0, 10.7, PEW, { ry: 0.05, rx: 1.45, y: 0.4, tint: 0.9 });                                               // and heaved aside again, on its back

      // ---------------------------------------------------------------- pulpit and font
      {
        const px = ihw - 1.1, pz = -6.6;
        B.begin({ kind: 'wood', hp: 700 });
        B.add('ashlarIn', kit.lathe([[0.42, 0], [0.42, 0.08], [0.22, 0.2], [0.18, 0.95], [0.3, 1.1], [0.62, 1.2]], 8), { p: [px, floor, pz] });
        for (let i = 0; i < 8; i++) {
          if (i === 3) continue;
          const a = (i / 8) * PI * 2 + PI / 8;
          B.box('timberIn', 0.56, 1.0, 0.05, px + Math.cos(a) * 0.68, floor + 1.72, pz + Math.sin(a) * 0.68, { r: [0, -a + PI / 2, 0], bevel: 0.012 });
          B.add('plankIn', kit.archBand(0.3, 0, 0.5, 0.7, 0.05, 0.03, 4), { r: [0, -a + PI / 2, 0], p: [px + Math.cos(a) * 0.71, floor + 1.34, pz + Math.sin(a) * 0.71] });
        }
        B.add('timberIn', kit.cyl(0.74, 0.74, 0.06, 8), { p: [px, floor + 1.2, pz], r: [0, PI / 8, 0] });
        B.add('timberIn', kit.cyl(0.78, 0.78, 0.06, 8, true), { p: [px, floor + 2.2, pz], r: [0, PI / 8, 0] });
        for (let i = 0; i < 4; i++) B.box('plankIn', 0.7, 0.05, 0.28, px - 0.75 - i * 0.26, floor + 0.28 + (3 - i) * 0.24, pz + 0.75, { bevel: 0.01 });
        B.colBox(px, pz, 0.72, 0.72, floor, floor + 2.3, 'wood');
        B.end();
        const fx = -(ihw - 1.0), fz = 11.0;
        B.begin({ kind: 'stone', hp: 340 });
        B.add('ashlarIn', kit.lathe([[0.5, 0], [0.5, 0.1], [0.3, 0.2], [0.26, 0.62], [0.42, 0.74], [0.52, 0.8], [0.52, 1.02], [0.44, 1.02], [0.4, 0.86], [0.02, 0.84]], 8), { p: [fx, floor, fz], r: [0, PI / 8, 0] });
        B.add('lead', kit.cyl(0.4, 0.4, 0.02, 12), { p: [fx, floor + 0.93, fz] });
        B.colBox(fx, fz, 0.5, 0.5, floor, floor + 1.05, 'concrete');
        B.end();
      }

      // ---------------------------------------------------------------- chandeliers
      for (const z of [4.5, -4.5]) {
        const y = 5.0, R = 0.95;
        const lamp = B.begin({ kind: 'wood', hp: 400, hangs: ['church-roof'], tag: 'fitting' }); lamp.flames = [];           // it comes down with the roof it hangs from
        B.add('ironIn', kit.tube(Array.from({ length: 16 }, (_, i) => [Math.cos(i / 16 * PI * 2) * R, y, z + Math.sin(i / 16 * PI * 2) * R]), 0.028, 5, true));
        B.add('ironIn', kit.tube(Array.from({ length: 12 }, (_, i) => [Math.cos(i / 12 * PI * 2) * 0.3, y + 0.5, z + Math.sin(i / 12 * PI * 2) * 0.3]), 0.02, 5, true));
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * PI * 2, cx = Math.cos(a), cz = Math.sin(a);
          B.rod('ironIn', [cx * R, y, z + cz * R], [cx * 0.3, y + 0.5, z + cz * 0.3], 0.012, 0.012, { seg: 4 });
          B.add('ironIn', kit.cyl(0.05, 0.03, 0.03, 6), { p: [cx * R, y + 0.02, z + cz * R] });
          B.add('wax', kit.cyl(0.018, 0.02, 0.17, 6), { p: [cx * R, y + 0.05, z + cz * R] });
          { const fl = [cx * R, y + 0.27, z + cz * R, 1]; info.flames.push(fl); lamp.flames.push(fl); }
        }
        for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2; B.rod('ironIn', [Math.cos(a) * 0.3, y + 0.5, z + Math.sin(a) * 0.3], [0, eave - 0.3, z], 0.009, 0.009, { seg: 4 }); }
        B.end();
        info.lights.push({ pos: [0, y - 0.25, z], color: 0xffa858, intensity: 46, dist: 15, flicker: 0.16, weight: 1.3 });
        info.halos.push([0, y + 0.2, z, 2.6]);
      }

      // ---------------------------------------------------------------- rubble
      const rubble = (cx, cz, rx, rz, n, key, y0, big = 0.5) => {
        for (let i = 0; i < n; i++) {
          const a = rng() * PI * 2, d = Math.sqrt(rng()), x = cx + Math.cos(a) * rx * d, z = cz + Math.sin(a) * rz * d;
          const s = (0.12 + rng() * big) * (1.1 - d * 0.6);
          if (rng() < 0.45) B.add(key, kit.bevelBox(s * 1.6, s, s * 1.1, s * 0.08), { r: [rng() * 0.6, rng() * 6, rng() * 0.6], p: [x, y0 + s * 0.35 + (1 - d) * 0.3, z], tint: 0.8 + rng() * 0.35 });
          else B.add(key, kit.rock(s * 0.8, 10 + i, 0), { r: [rng() * 6, rng() * 6, 0], p: [x, y0 + s * 0.3 + (1 - d) * 0.25, z], tint: 0.8 + rng() * 0.35 });
        }
      };
      // The fallen wall lies in heaps either side of the breach, inside and out, with the way through trodden
      // down to small stones: the heaps are obstacles, the gap between them is not.
      rubble(4.95, -11.4, 1.0, 0.85, 30, 'rock', 0.4, 0.5);
      rubble(2.9, -11.5, 1.5, 0.8, 16, 'rock', 0.4, 0.1);
      B.col(4.25, 0.4, -12.0, 5.75, 0.95, -10.75, 'concrete');
      rubble(0.2, -14.2, 1.2, 1.1, 32, 'rock', 0, 0.6);
      rubble(6.4, -14.6, 1.2, 1.3, 36, 'rock', 0, 0.6);
      rubble(3.4, -14.1, 1.7, 1.2, 22, 'rock', 0, 0.12);
      B.col(-0.6, 0, -15.0, 1.0, 0.6, -13.4, 'concrete'); B.col(5.65, 0, -15.6, 7.15, 0.6, -13.6, 'concrete');
      const fall = -3.0 - wide / 2;
      rubble(fall, -7.4, 1.9, 2.3, 40, 'slate', floor, 0.3);
      for (let i = 0; i < 9; i++) {
        const x = fall + (rng() - 0.5) * 3.2, z = -7.4 + (rng() - 0.5) * 4.2, len = 1.2 + rng() * 2.2;
        B.add('timberIn', kit.bevelBox(len, 0.12, 0.16, 0.01), { r: [rng() * 0.3 - 0.15, rng() * 6, rng() * 0.5 - 0.1], p: [x, floor + 0.12 + rng() * 0.35, z] });
      }
      B.add('timberIn', kit.bevelBox(4.6, 0.26, 0.28, 0.02), { r: [0.0, 0.5, 0.62], p: [fall - 0.3, floor + 1.45, -6.3] });
      B.col(fall - 1.1, floor, -8.4, fall + 1.1, floor + 0.3, -6.4, 'wood');

      info.interior = { min: new T.Vector3(-ihw, 0, -ihd), max: new T.Vector3(ihw, eave + rise - 2.2, ihd) };
      info.tower = { x: tx, z: tz, h: th };
      info.doors = { south: [0, hd + 1.4], west: [-hw - 1.0, sideDoor.c], east: [hw + 1.0, eastDoor.c], breach: [(breachA + breachB) / 2, -hd - 1.6] };
      // The ways in, as rectangles on the ground covering each threshold. The dead are each given one to make for
      // (zombies.js), so a wave comes through all four instead of queueing at the nearest. `wide` takes the biggest of them.
      info.entrances = [
        { id: 'south', x0: -mh, x1: mh, z0: ihd - 0.4, z1: hd + 0.4, wide: true },
        { id: 'west', x0: -hw - 0.4, x1: -ihw + 0.4, z0: sideDoor.c - sh, z1: sideDoor.c + sh },
        { id: 'east', x0: ihw - 0.4, x1: hw + 0.4, z0: eastDoor.c - eh, z1: eastDoor.c + eh },
        { id: 'north', x0: breachA, x1: breachB, z0: -hd - 0.4, z1: -ihd + 0.4, wide: true },
      ];
      return info;
    },
  };
})();
