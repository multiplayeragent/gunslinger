/* The pine forest that rings the graveyard: walkable out to the edge of the map, then rising into
   wooded hills that the fog swallows. Trees are instanced; only the ones you can reach collide and cast shadows. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const PI = Math.PI;

  // Ground height. Flat wherever anything can walk; hills begin past the edge of the map.
  V.heightAt = (x, z) => {
    const kit = V.kit, d = Math.max(Math.abs(x), Math.abs(z));
    if (d <= 66) return 0;
    const k = kit.smooth(66, 120, d);
    return k * (3 + 15 * kit.fbm2(x * 0.018 + 5, z * 0.018 + 9, 3)) + kit.smooth(66, 80, d) * (kit.noise2(x * 0.09, z * 0.09) - 0.5) * 1.2;
  };

  function boughTexture(T, rng) {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    x.clearRect(0, 0, S, S);
    // a flat spray: a central twig with side twigs, all bristling with needles
    const twig = (x0, y0, x1, y1, w, depth) => {
      x.strokeStyle = '#2a2118'; x.lineWidth = w; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
      const len = Math.hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / len, dy = (y1 - y0) / len;
      for (let d = 3; d < len; d += 2.6) {
        const px = x0 + dx * d, py = y0 + dy * d;
        for (const s of [-1, 1]) {
          const a = Math.atan2(dy, dx) + s * (0.7 + rng() * 0.5), l = (5 + rng() * 5) * (0.65 + 0.35 * (1 - d / len));
          const g = 70 + rng() * 70;
          x.strokeStyle = `rgb(${Math.round(g * 0.42)},${Math.round(g)},${Math.round(g * 0.5)})`; x.lineWidth = 1.3;
          x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
        }
      }
      if (depth > 0) for (let d = len * 0.14; d < len * 0.92; d += len * (depth > 1 ? 0.13 : 0.22)) {
        for (const s of [-1, 1]) {
          const a = Math.atan2(dy, dx) + s * (0.62 + rng() * 0.2), l = len * (0.46 - 0.34 * (d / len)) + 8;
          twig(x0 + dx * d, y0 + dy * d, x0 + dx * d + Math.cos(a) * l, y0 + dy * d + Math.sin(a) * l, Math.max(1, w * 0.6), depth - 1);
        }
      }
    };
    twig(6, S / 2, S - 10, S / 2, 4, 2);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    return tex;
  }

  // One pine in local space: returns { trunk, foliage } geometries.
  function pine(T, kit, seed) {
    const rng = kit.rng(seed), H = 15 + rng() * 5, trunkParts = [], fol = [];
    const tr = kit.cyl(0.05, 0.3, H, 7, true); trunkParts.push(tr);
    trunkParts.push(kit.lathe([[0.52, -0.2], [0.4, 0.1], [0.32, 0.5], [0.3, 0.9]], 7));
    for (let i = 0; i < 7; i++) {
      const y = 1.5 + rng() * (H * 0.3), a = rng() * PI * 2, l = 0.4 + rng() * 0.9;
      trunkParts.push(kit.rod([Math.cos(a) * 0.2, y, Math.sin(a) * 0.2], [Math.cos(a) * (0.2 + l), y + l * 0.15 - 0.1, Math.sin(a) * (0.2 + l)], 0.035, 0.012, 4));
    }
    const y0 = H * (0.3 + rng() * 0.08);
    let y = y0, wi = 0;
    while (y < H - 0.3) {
      const t = (y - y0) / (H - y0), R = (3.2 - 2.75 * Math.pow(t, 0.85)) * (0.85 + rng() * 0.3);
      const n = t > 0.8 ? 4 : 6, a0 = rng() * PI * 2;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * PI * 2 + (rng() - 0.5) * 0.4, L = R * (0.75 + rng() * 0.4), W = L * 0.72, droop = 0.2 + 0.35 * (1 - t) + rng() * 0.15;
        // the bough is a strip of three segments that sags as it goes out, plus an upright fin for depth
        const pos = [], uv = [], nor = [];
        const seg = 3, ca = Math.cos(a), sa = Math.sin(a);
        const P = (u, v) => { const d = u * L, sag = -droop * L * u * u + 0.12 * L * u; return [ca * d - sa * v * W * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, u * 1.15))), y + sag - Math.abs(v) * 0.12 * L * u, sa * d + ca * v * W * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, u * 1.15)))]; };
        const F = (u, v) => { const d = u * L, sag = -droop * L * u * u + 0.12 * L * u; return [ca * d, y + sag + v * W * 0.42 * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, u * 1.1))), sa * d]; };
        for (const fn of [P, F]) for (let k = 0; k < seg; k++) {
          const u0 = k / seg, u1 = (k + 1) / seg;
          const q = [[u0, -0.5], [u1, -0.5], [u1, 0.5], [u0, -0.5], [u1, 0.5], [u0, 0.5]];
          for (const [u, v] of q) {
            const p = fn(u, v); pos.push(p[0], p[1], p[2]); uv.push(u, v + 0.5);
            // normals lean up and outward so the canopy shades as one soft mass
            const nl = Math.hypot(ca * 0.55, 0.85, sa * 0.55); nor.push(ca * 0.55 / nl, 0.85 / nl, sa * 0.55 / nl);
          }
        }
        const gq = new T.BufferGeometry();
        gq.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3));
        gq.setAttribute('normal', new T.BufferAttribute(new Float32Array(nor), 3));
        gq.setAttribute('uv', new T.BufferAttribute(new Float32Array(uv), 2));
        kit.tint(gq, 0.55 + 0.45 * t + (rng() - 0.5) * 0.2);
        fol.push(gq);
      }
      y += (0.95 + rng() * 0.35) * (1 - 0.45 * t); wi++;
    }
    for (const gq of trunkParts) { if (!gq.attributes.uv) kit.boxUV(gq); }
    return { trunk: kit.merge(trunkParts), foliage: kit.merge(fol), H };
  }

  V.forest = {
    build(B, ctx, yard) {
      const g = ctx.g, T = g.THREE, kit = V.kit, rng = kit.rng(60606), W = V.WORLD, Y = V.YARD;
      const info = { trees: [], logs: [] };
      const pathDist = V.yard.pathDist;

      // ---- pines ----
      const variants = [pine(T, kit, 11), pine(T, kit, 23), pine(T, kit, 37)];
      const needle = new T.MeshStandardMaterial({ map: boughTexture(T, kit.rng(5)), alphaTest: 0.42, side: T.DoubleSide, color: new T.Color(0.62, 0.74, 0.66), roughness: 0.95, metalness: 0, vertexColors: true });
      needle.name = 'vg_needles';
      const bark = ctx.mats.get('bark');
      const near = variants.map(() => []), far = variants.map(() => []);
      const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), P = new T.Vector3(), S = new T.Vector3();
      const put = (list, x, z, sc) => {
        E.set((rng() - 0.5) * 0.07, rng() * PI * 2, (rng() - 0.5) * 0.07); Q.setFromEuler(E);
        M.compose(P.set(x, V.heightAt(x, z) - 0.15, z), Q, S.set(sc, sc * (0.9 + rng() * 0.25), sc));
        list.push(M.clone());
      };
      // walkable ring: spaced so there is always a way through
      for (let gx = -W; gx <= W; gx += 4.5) for (let gz = -W; gz <= W; gz += 4.5) {
        if (rng() < 0.16) continue;
        const x = gx + (rng() - 0.5) * 3.0, z = gz + (rng() - 0.5) * 3.0, d = Math.max(Math.abs(x), Math.abs(z));
        if (d < Y + 2.6 || d > W - 0.6 || pathDist(x, z) < 1.7) continue;
        const sc = 0.78 + rng() * 0.5, v = Math.floor(rng() * variants.length);
        put(near[v], x, z, sc);
        B.colBox(x, z, 0.27 * sc, 0.27 * sc, 0, 12, 'wood');
        info.trees.push([x, z, 0.3 * sc]);
      }
      // the hills beyond: denser, never reached
      for (let gx = -128; gx <= 128; gx += 5.2) for (let gz = -128; gz <= 128; gz += 5.2) {
        const x = gx + (rng() - 0.5) * 4.2, z = gz + (rng() - 0.5) * 4.2, d = Math.max(Math.abs(x), Math.abs(z));
        if (d <= W + 0.8 || Math.hypot(x, z) > 132) continue;
        if (rng() < 0.12 + 0.25 * kit.smooth(95, 130, d)) continue;
        put(far[Math.floor(rng() * variants.length)], x, z, 0.85 + rng() * 0.7);
      }
      const forest = new T.Group(); forest.name = 'vigil-forest';
      const inst = (geo, mat, list, cast) => {
        if (!list.length) return;
        const im = new T.InstancedMesh(geo, mat, list.length);
        list.forEach((m, i) => im.setMatrixAt(i, m));
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = cast; im.receiveShadow = true; im.frustumCulled = false;
        forest.add(im);
      };
      let count = 0;
      variants.forEach((v, i) => {
        inst(v.trunk, bark, near[i], true); inst(v.foliage, needle, near[i], true);
        inst(v.trunk, bark, far[i], false); inst(v.foliage, needle, far[i], false);
        count += near[i].length + far[i].length;
      });
      ctx.root.add(forest);
      info.count = count;

      // ---- boulders, logs and stumps on the forest floor ----
      for (let i = 0; i < 90; i++) {
        const a = rng() * PI * 2, d = Y + 3 + rng() * (W - Y - 5), x = Math.cos(a) * d * 1.25, z = Math.sin(a) * d * 1.25;
        if (Math.max(Math.abs(x), Math.abs(z)) > W - 1.5 || Math.max(Math.abs(x), Math.abs(z)) < Y + 2.5 || pathDist(x, z) < 1.8) continue;
        if (info.trees.some((t) => Math.hypot(t[0] - x, t[1] - z) < 1.3)) continue;
        const s = 0.35 + rng() * rng() * 1.5;
        B.add('rock', kit.rock(s, 400 + i, s > 0.8 ? 2 : 1, [1.15, 0.7, 1]), { r: [rng() * 0.4, rng() * 6, rng() * 0.4], p: [x, s * 0.22, z], tint: 0.75 + rng() * 0.35 });
        if (s > 0.6) B.colBox(x, z, s * 0.7, s * 0.6, 0, s * 0.75, 'concrete');
      }
      for (let i = 0; i < 16; i++) {
        const a = rng() * PI * 2, d = Y + 5 + rng() * (W - Y - 9), x = Math.cos(a) * d * 1.2, z = Math.sin(a) * d * 1.2;
        if (Math.max(Math.abs(x), Math.abs(z)) > W - 3 || Math.max(Math.abs(x), Math.abs(z)) < Y + 4 || pathDist(x, z) < 2.4) continue;
        const len = 3.5 + rng() * 4, r = 0.2 + rng() * 0.14, ry = rng() * PI;
        const P2 = new kit.Part();
        P2.add('bark', kit.cyl(r * 0.8, r, len, 8), { r: [0, 0, PI / 2], p: [len / 2, r * 0.9, 0] });
        for (let k = 0; k < 4; k++) { const u = 0.5 + rng() * (len - 1), a2 = rng() * PI; P2.rod('bark', [u - len / 2, r, 0], [u - len / 2 + (rng() - 0.5) * 0.4, r + Math.sin(a2) * 0.7, Math.cos(a2) * 0.7], 0.04, 0.015, { seg: 4 }); }
        P2.commit(B, { p: [x, 0, z], r: [0, ry, 0] });
        const c = Math.abs(Math.cos(ry)), s2 = Math.abs(Math.sin(ry));
        B.colBox(x, z, (len / 2) * c + r * s2, (len / 2) * s2 + r * c, 0, r * 1.9, 'wood');
        info.logs.push([x, z]);
      }
      for (let i = 0; i < 22; i++) {
        const a = rng() * PI * 2, d = Y + 3 + rng() * (W - Y - 5), x = Math.cos(a) * d * 1.2, z = Math.sin(a) * d * 1.2;
        if (Math.max(Math.abs(x), Math.abs(z)) > W - 2 || Math.max(Math.abs(x), Math.abs(z)) < Y + 2.5 || pathDist(x, z) < 1.6) continue;
        const r = 0.22 + rng() * 0.16, h = 0.3 + rng() * 0.5;
        B.add('bark', kit.lathe([[r * 1.6, -0.1], [r * 1.15, 0.12], [r, h], [0.02, h - 0.03]], 8), { p: [x, 0, z], r: [0, rng() * 6, 0] });
        B.colBox(x, z, r, r, 0, h, 'wood');
      }
      return info;
    },
  };
})();
