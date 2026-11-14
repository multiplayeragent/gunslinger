/* Things that break. An object the level marks as breakable keeps its own geometry and colliders; shots,
   blasts and the bigger dead wear it down. Stone chips where it is hit, then snaps and leaves a stump; timber
   splits into lengths. Breaking is done by cutting the real geometry with planes and capping the cuts, so the
   pieces fit the thing they came from. Pieces are rigid bodies (phys.js); where they come to rest they are
   merged back into a static mesh. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const rand = (a, b) => a + Math.random() * (b - a);

  // resist: how much of a hit gets through. fresh: how much paler a broken face is than the weathered outside.
  const KINDS = {
    stone: { density: 2300, bounce: 0.2, friction: 0.75, resist: 0.5, fresh: 1.22, chip: [0.3, 0.3, 0.29], dust: [0.5, 0.5, 0.48], snd: 'stone_break', land: 'stone_hit' },
    wood: { density: 620, bounce: 0.18, friction: 0.72, resist: 1, fresh: 1.7, chip: [0.3, 0.22, 0.14], dust: [0.36, 0.28, 0.2], snd: 'wood_break', land: 'wood_hit' },
  };

  // Cuts a non-indexed geometry with the plane n·p = d. Returns [front, back] (either may be null), the cut capped.
  function slice(T, geo, n, d, fresh) {
    const P = geo.attributes.position.array, N = geo.attributes.normal.array, U = geo.attributes.uv ? geo.attributes.uv.array : null, C = geo.attributes.color ? geo.attributes.color.array : null;
    const count = geo.attributes.position.count, eps = 1e-5, nx = n.x, ny = n.y, nz = n.z;
    const mk = () => ({ p: [], n: [], u: [], c: [] }), F = mk(), B = mk(), seg = [];
    const vert = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2], U ? U[i * 2] : 0, U ? U[i * 2 + 1] : 0, C ? C[i * 3] : 1, C ? C[i * 3 + 1] : 1, C ? C[i * 3 + 2] : 1];
    const lerp = (a, b, t) => { const o = new Array(11); for (let k = 0; k < 11; k++) o[k] = a[k] + (b[k] - a[k]) * t; return o; };
    const push = (buf, v) => { buf.p.push(v[0], v[1], v[2]); buf.n.push(v[3], v[4], v[5]); buf.u.push(v[6], v[7]); buf.c.push(v[8], v[9], v[10]); };
    let cr = 0, cg = 0, cb = 0;
    for (let i = 0; i < count; i += 3) {
      const v = [vert(i), vert(i + 1), vert(i + 2)], s = [0, 0, 0];
      for (let k = 0; k < 3; k++) s[k] = v[k][0] * nx + v[k][1] * ny + v[k][2] * nz - d;
      cr += v[0][8]; cg += v[0][9]; cb += v[0][10];
      if (s[0] >= -eps && s[1] >= -eps && s[2] >= -eps) { push(F, v[0]); push(F, v[1]); push(F, v[2]); continue; }
      if (s[0] <= eps && s[1] <= eps && s[2] <= eps) { push(B, v[0]); push(B, v[1]); push(B, v[2]); continue; }
      const k = (s[0] > 0) === (s[1] > 0) ? 2 : (s[0] > 0) === (s[2] > 0) ? 1 : 0;            // the corner alone on its side
      const a = v[k], b = v[(k + 1) % 3], c = v[(k + 2) % 3], sa = s[k], sb = s[(k + 1) % 3], sc = s[(k + 2) % 3];
      const ab = lerp(a, b, sa / (sa - sb)), ac = lerp(a, c, sa / (sa - sc)), lone = sa > 0 ? F : B, other = sa > 0 ? B : F;
      push(lone, a); push(lone, ab); push(lone, ac);
      push(other, ab); push(other, b); push(other, c); push(other, ab); push(other, c); push(other, ac);
      seg.push(ab, ac);
    }
    if (seg.length >= 6) {
      // close both halves with a fan over the cut, the colour of the unweathered inside
      let cx = 0, cy = 0, cz = 0;
      for (const q of seg) { cx += q[0]; cy += q[1]; cz += q[2]; }
      cx /= seg.length; cy /= seg.length; cz /= seg.length;
      const tris = count / 3, col = [Math.min(1.6, (cr / tris) * fresh), Math.min(1.6, (cg / tris) * fresh), Math.min(1.6, (cb / tris) * fresh * 0.97)];
      const t1 = Math.abs(ny) > 0.9 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0).cross(n).normalize(), t2 = new T.Vector3().crossVectors(n, t1);
      const cap = (buf, p, sign) => { buf.p.push(p[0], p[1], p[2]); buf.n.push(nx * sign, ny * sign, nz * sign); buf.u.push(p[0] * t1.x + p[1] * t1.y + p[2] * t1.z, p[0] * t2.x + p[1] * t2.y + p[2] * t2.z); buf.c.push(col[0], col[1], col[2]); };
      const ctr = [cx, cy, cz];
      for (let i = 0; i < seg.length; i += 2) {
        let p = seg[i], q = seg[i + 1];
        const ax = p[0] - cx, ay = p[1] - cy, az = p[2] - cz, bx = q[0] - cx, by = q[1] - cy, bz = q[2] - cz;
        const facing = (ay * bz - az * by) * nx + (az * bx - ax * bz) * ny + (ax * by - ay * bx) * nz;
        if (facing > 0) { const t = p; p = q; q = t; }                           // (ctr, p, q) now faces -n
        cap(F, ctr, -1); cap(F, p, -1); cap(F, q, -1);
        cap(B, ctr, 1); cap(B, q, 1); cap(B, p, 1);
      }
    }
    const done = (buf) => {
      if (buf.p.length < 9) return null;
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(buf.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(buf.n, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(buf.u, 2)); g.setAttribute('color', new T.Float32BufferAttribute(buf.c, 3));
      return g;
    };
    return [done(F), done(B)];
  }

  V.destructs = {
    slice, KINDS,
    // objects: what the builder captured between begin() and end(): { kind, hp, yaw, items: [{ key, geo, cast }], boxes }
    create(g, mats, objects, parent) {
      const T = g.THREE, kit = V.kit, loose = V.loose, root = new T.Group(); root.name = 'vigil-breakable'; parent.add(root);
      const v = new T.Vector3(), n = new T.Vector3(), c3 = new T.Vector3(), up = new T.Vector3(0, 1, 0), box3 = new T.Box3();
      const byBox = new Map();
      // Where a thing breaks is drawn from a seeded sequence, so every machine in a room cuts it the same way.
      let seed = 1, quiet = false;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }, rr = (a, b) => a + rnd() * (b - a);
      const NET = () => (V.net && V.net.online ? V.net : null);
      const r2 = (x) => Math.round(x * 100) / 100;

      // ---- everything intact is drawn merged, one mesh per material; each object knows its slice of it ----
      const buckets = new Map();
      objects.forEach((o, id) => {
        o.id = id; o.hp0 = o.hp; o.K = KINDS[o.kind] || KINDS.stone; o.items0 = o.items; o.ranges = []; o.state = 'whole'; o.chips = 0; o.live = null;
        o.boxes0 = o.boxes.map((b) => ({ min: b.min.clone(), max: b.max.clone(), surface: b.surface, noNav: b.noNav, bulletOnly: b.bulletOnly }));
        for (const b of o.boxes) byBox.set(b, o);
        for (const it of o.items) {
          const k = it.key + (it.cast ? '' : '|n');
          let b = buckets.get(k); if (!b) buckets.set(k, (b = { key: it.key, cast: it.cast, list: [], count: 0 }));
          o.ranges.push({ b, start: b.count, count: it.geo.attributes.position.count });
          b.list.push(it.geo); b.count += it.geo.attributes.position.count;
        }
        bounds(o);
      });
      for (const b of buckets.values()) {
        const geo = kit.merge(b.list); geo.computeBoundingSphere(); geo.computeBoundingBox();
        b.saved = geo.attributes.position.array.slice();
        const mat = mats.get(b.key);
        b.mesh = new T.Mesh(geo, mat); b.mesh.name = 'breakable:' + b.key; b.mesh.castShadow = b.cast && !mat.transparent; b.mesh.receiveShadow = !mat.isMeshBasicMaterial; b.mesh.matrixAutoUpdate = false;
        root.add(b.mesh); b.list = null;
      }
      function showRanges(o, on) {
        for (const r of o.ranges) {
          const at = r.b.mesh.geometry.attributes.position, a = r.start * 3, e = (r.start + r.count) * 3;
          if (on) at.array.set(r.b.saved.subarray(a, e), a); else at.array.fill(0, a, e);
          at.addUpdateRange(a, e - a); at.needsUpdate = true;
        }
      }

      // ---- pieces ----
      // extent of a set of items in the object's own frame (yaw only): centre and half sizes along u (across), y, w (through)
      function bounds(o) {
        const cy = Math.cos(o.yaw || 0), sy = Math.sin(o.yaw || 0);
        o.u = new T.Vector3(cy, 0, -sy); o.w = new T.Vector3(sy, 0, cy);
        let u0 = 1e9, u1 = -1e9, y0 = 1e9, y1 = -1e9, w0 = 1e9, w1 = -1e9;
        for (const it of o.items) {
          const p = it.geo.attributes.position.array;
          for (let i = 0; i < p.length; i += 3) {
            const a = p[i] * cy - p[i + 2] * sy, b = p[i] * sy + p[i + 2] * cy, y = p[i + 1];
            if (a < u0) u0 = a; if (a > u1) u1 = a; if (y < y0) y0 = y; if (y > y1) y1 = y; if (b < w0) w0 = b; if (b > w1) w1 = b;
          }
        }
        const cu = (u0 + u1) / 2, cw = (w0 + w1) / 2;
        o.c = new T.Vector3(cu * cy + cw * sy, (y0 + y1) / 2, -cu * sy + cw * cy);
        o.hu = Math.max(0.01, (u1 - u0) / 2); o.hy = Math.max(0.01, (y1 - y0) / 2); o.hw = Math.max(0.01, (w1 - w0) / 2); o.y0 = y0;
      }
      // cut every item of a piece; returns [front items, back items]
      function cut(items, nrm, d, fresh) {
        const f = [], b = [];
        for (const it of items) {
          const [gf, gb] = slice(T, it.geo, nrm, d, fresh);
          if (gf) f.push({ key: it.key, geo: gf, cast: it.cast }); if (gb) b.push({ key: it.key, geo: gb, cast: it.cast });
        }
        return [f, b];
      }
      // one mesh per material for a set of items, moved so its box is centred on the group
      function group(items, recentre) {
        const by = new Map();
        for (const it of items) { if (!by.has(it.key)) by.set(it.key, []); by.get(it.key).push(it.geo); }
        const grp = new T.Group(); box3.makeEmpty();
        const geos = [];
        for (const [key, list] of by) { const geo = list.length > 1 ? kit.merge(list) : list[0].clone(); geo.computeBoundingBox(); box3.union(geo.boundingBox); geos.push([key, geo]); }
        const c = box3.getCenter(new T.Vector3()), half = box3.getSize(new T.Vector3()).multiplyScalar(0.5);
        for (const [key, geo] of geos) {
          if (recentre) geo.translate(-c.x, -c.y, -c.z);
          geo.computeBoundingSphere();
          const mat = mats.get(key), m = new T.Mesh(geo, mat); m.castShadow = !mat.transparent; m.receiveShadow = true; m.userData.key = key; grp.add(m);
        }
        if (recentre) grp.position.copy(c);
        grp.userData.dispose = () => { for (const m of grp.children) m.geometry.dispose(); };
        return { grp, c, half };
      }

      // ---- what has come to rest: merged into one static mesh per material, rebuilt a moment after it changes ----
      const rubble = new Map(); let rubbleDirty = 0, rubbleVerts = 0;
      function settle(key, geo, matrix) {
        const gq = geo.clone(); if (matrix) gq.applyMatrix4(matrix);
        let r = rubble.get(key); if (!r) rubble.set(key, (r = { list: [], mesh: null, dirty: false }));
        r.list.push(gq); r.dirty = true; rubbleVerts += gq.attributes.position.count; rubbleDirty = Math.max(rubbleDirty, 0.25);
      }
      function rebuildRubble() {
        for (const [key, r] of rubble) {
          if (!r.dirty) continue; r.dirty = false;
          if (r.mesh) { root.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh = null; }
          if (!r.list.length) continue;
          const geo = kit.merge(r.list); geo.computeBoundingSphere();
          const mat = mats.get(key);
          r.mesh = new T.Mesh(geo, mat); r.mesh.name = 'rubble:' + key; r.mesh.castShadow = !mat.transparent; r.mesh.receiveShadow = true; r.mesh.matrixAutoUpdate = false; root.add(r.mesh);
        }
      }
      // throw a piece: it tumbles, lands, and (if it is big enough to matter) stays where it stops
      function fling(items, o, vel, spin) {
        if (quiet) return;
        const { grp, half } = group(items, true), vol = 8 * half.x * half.y * half.z * 0.55, big = Math.max(half.x, half.y, half.z) > 0.11;
        half.set(Math.max(0.025, half.x), Math.max(0.025, half.y), Math.max(0.025, half.z));
        loose.spawn({ mesh: grp, vel, ang: new T.Vector3(rand(-spin, spin), rand(-spin, spin), rand(-spin, spin)), half, mass: Math.max(0.3, vol * o.K.density), bounce: o.K.bounce, friction: o.K.friction,
          life: big && rubbleVerts < 900000 ? 0 : rand(8, 14),
          onHit: (b, sp) => { if (V.audio) V.audio.play(o.K.land, { pos: b.pos, gain: Math.min(1, sp / 7) }); },
          onRest: big && rubbleVerts < 900000 ? (b) => { b.mesh.updateMatrixWorld(true); for (const m of b.mesh.children) settle(m.userData.key, m.geometry, m.matrixWorld); return false; } : null });
      }

      function fx(o, point, dir, amount) {
        if (quiet) return;
        try {
          n.copy(dir || up).negate();
          g.fx.debris(point, { color: o.K.chip, size: 0.02 + amount * 0.02, speed: 3 + amount * 3, count: Math.round(3 + amount * 10), normal: n, spread: 1.1 });
          g.fx.dust(point, n, 0.6 + amount * 1.6, o.K.dust[0], o.K.dust[1], o.K.dust[2]);
        } catch (e) { /* effects are optional */ }
      }
      // the object stops being part of the merged mesh and is drawn on its own
      function liven(o) {
        if (o.live) { root.remove(o.live); o.live.userData.dispose(); o.live = null; }
        else if (o.state === 'whole') showRanges(o, false);
        o.state = 'worn';
        o.live = group(o.items, false).grp; root.add(o.live);
      }
      function setBoxes(o, list) {
        for (const b of o.boxes) { byBox.delete(b); g.physics.removeBox(b); }
        o.boxes = list.map((b) => g.physics.addBox(b.min, b.max, { surface: b.surface, noNav: b.noNav, bulletOnly: b.bulletOnly }));
        for (const b of o.boxes) byBox.set(b, o);
      }
      const push = (dir, k) => new T.Vector3((dir ? dir.x : 0) * k + rand(-1, 1), rand(1.2, 3.2), (dir ? dir.z : 0) * k + rand(-1, 1));

      // stone: a corner or an edge breaks away near where it was struck
      function chip(o, point, dir) {
        bounds(o);
        const thinU = o.hu < o.hw * 0.45, thinW = o.hw < o.hu * 0.45;
        let du = thinU ? 0 : v.copy(point).sub(o.c).dot(o.u) / o.hu, dw = thinW ? 0 : v.copy(point).sub(o.c).dot(o.w) / o.hw, dy = (point.y - o.c.y) / o.hy;
        if (Math.hypot(du, dw) < 0.35) { if (thinW || (!thinU && rnd() < 0.5)) du = rnd() < 0.5 ? -1 : 1; else dw = rnd() < 0.5 ? -1 : 1; }
        n.set(0, 0, 0).addScaledVector(o.u, du).addScaledVector(o.w, dw); n.y = Math.max(dy, 0.1) + 0.35; n.normalize();
        const sup = Math.abs(n.dot(o.u)) * o.hu + Math.abs(n.y) * o.hy + Math.abs(n.dot(o.w)) * o.hw, d = n.dot(o.c) + sup * rr(0.5, 0.68);
        const [off, rest] = cut(o.items, n, d, o.K.fresh);
        if (!off.length || !rest.length) return;
        o.items = rest; o.chips++; liven(o);
        fling(off, o, push(dir, 1.6).addScaledVector(n, 1.2), 7);
        fx(o, point, dir, 0.5);
        if (V.audio && !quiet) V.audio.play(o.K.land, { pos: point, gain: 1 });
      }
      // stone: it snaps across and the top comes down in pieces; the stump stays
      function snap(o, point, dir, force) {
        bounds(o);
        const H = o.hy * 2, y = Math.max(o.y0 + Math.max(0.14, H * 0.2), Math.min(o.y0 + H * 0.55, point ? point.y : o.y0 + H * 0.4));
        o.cutY = point ? r2(point.y) : null;
        n.copy(up).addScaledVector(o.u, rr(-0.4, 0.4)).addScaledVector(o.w, rr(-0.12, 0.12)).normalize();
        const [top, stump] = cut(o.items, n, n.dot(v.set(o.c.x, y, o.c.z)), o.K.fresh);
        let parts = [top];
        // the top splits again, across and then along
        for (let pass = 0; pass < 2 && parts.length < 5; pass++) {
          const next = [];
          for (const part of parts) {
            if (!part.length) continue;
            const tmpO = { items: part, yaw: o.yaw }; bounds(tmpO);
            if (Math.max(tmpO.hu, tmpO.hy, tmpO.hw) < 0.16) { next.push(part); continue; }
            const across = tmpO.hu >= tmpO.hw;
            n.copy(across ? o.u : o.w).multiplyScalar(pass ? rr(-0.5, 0.5) : 1).addScaledVector(up, pass ? 1 : rr(-0.6, 0.6)).normalize();
            const [a, b] = cut(part, n, n.dot(tmpO.c) + rr(-0.25, 0.25) * (across ? tmpO.hu : tmpO.hw), o.K.fresh);
            if (a.length) next.push(a); if (b.length) next.push(b);
          }
          parts = next;
        }
        if (o.live) { root.remove(o.live); o.live.userData.dispose(); o.live = null; } else showRanges(o, false);
        o.state = 'stump'; o.items = stump;
        for (const it of stump) settle(it.key, it.geo, null);
        // the collider shrinks to the stump: low enough and the dead walk over it
        const top0 = y + 0.04;
        setBoxes(o, o.boxes0.filter((b) => b.min.y < top0 - 0.05).map((b) => ({ ...b, max: new T.Vector3(b.max.x, Math.min(b.max.y, top0), b.max.z) })));
        for (const part of parts) if (part.length) fling(part, o, push(dir, 1.5 + force * 2.5), 5);
        fx(o, point || o.c, dir, 1);
        if (V.audio && !quiet) V.audio.play(o.K.snd, { pos: o.c });
        g.events.emit('vigil:broken', { kind: o.kind, pos: o.c.clone() });
      }
      // timber: it splits into lengths, and each length along the grain
      function shatter(o, point, dir, force) {
        bounds(o);
        let parts = [o.items];
        const long = o.hu >= o.hw && o.hu >= o.hy ? o.u : o.hw >= o.hy ? o.w : up, hl = Math.max(o.hu, o.hy, o.hw);
        const cuts = hl > 1.2 ? 3 : hl > 0.5 ? 2 : 1;
        for (let k = 0; k < cuts; k++) {
          n.copy(long).add(v.set(rr(-0.3, 0.3), rr(-0.3, 0.3), rr(-0.3, 0.3))).normalize();
          const d = n.dot(c3.copy(o.c).addScaledVector(long, hl * ((k + 0.5) / cuts * 2 - 1 + rr(-0.12, 0.12)) ));
          const next = [];
          for (const part of parts) { const [a, b] = cut(part, n, d, o.K.fresh); if (a.length) next.push(a); if (b.length) next.push(b); }
          parts = next;
        }
        // and once more through the middle, so what is left lies low
        const side = long === up ? o.u : up, next = [];
        for (const part of parts) {
          const tmpO = { items: part, yaw: o.yaw }; bounds(tmpO);
          n.copy(side).add(v.set(rr(-0.25, 0.25), rr(-0.15, 0.15), rr(-0.25, 0.25))).normalize();
          const [a, b] = cut(part, n, n.dot(tmpO.c) + rr(-0.08, 0.08), o.K.fresh);
          if (a.length) next.push(a); if (b.length) next.push(b);
        }
        parts = next;
        if (o.live) { root.remove(o.live); o.live.userData.dispose(); o.live = null; } else showRanges(o, false);
        o.state = 'gone'; o.items = [];
        setBoxes(o, []);
        for (const part of parts) fling(part, o, push(dir, 1.2 + force * 3), 6);
        fx(o, point || o.c, dir, 1);
        if (V.audio && !quiet) V.audio.play(o.K.snd, { pos: o.c });
        g.events.emit('vigil:broken', { kind: o.kind, pos: o.c.clone() });
      }
      // One change to one object, cut from the given seed: 'c' a chip, 's' the snap, 'w' timber going. The machine
      // that decides it (alone, or the host) tells the room; the others do exactly the same cut from the same seed.
      function change(o, kind, point, dir, force, sd, silent) {
        const own = !sd;
        seed = sd || 1 + Math.floor(Math.random() * 1e9); o.seed = seed; o.how = kind;
        const used = seed, was = quiet; quiet = !!silent;
        try { if (kind === 'c') chip(o, point || o.c, dir); else if (kind === 's') snap(o, point, dir, force || 0.4); else shatter(o, point, dir, force || 0.4); } finally { quiet = was; }
        const net = NET();
        if (own && net && net.host) net.emit('ob', [o.id, kind, point ? [r2(point.x), r2(point.y), r2(point.z)] : null, dir ? [r2(dir.x), r2(dir.y), r2(dir.z)] : null, r2(force || 0.4), used]);
      }

      const api = {
        objects, root, byBox,
        // a shot, a blow or a blast reaching an object. amount is raw damage.
        hit(o, point, dir, amount, force = 0.4) {
          if (o.state === 'gone') return false;
          if (o.state === 'stump') { fx(o, point || o.c, dir, 0.15); return true; }
          fx(o, point || o.c, dir, Math.min(1, amount / 120) * 0.5);
          const net = NET();
          if (net && !net.host) { net.emit('oh', [o.id, r2(amount), point ? [r2(point.x), r2(point.y), r2(point.z)] : null, dir ? [r2(dir.x), r2(dir.y), r2(dir.z)] : null, r2(force)]); return true; }
          o.hp -= amount * o.K.resist;
          if (o.hp <= 0) change(o, o.kind === 'wood' ? 'w' : 's', point, dir, force);
          else if (o.kind !== 'wood' && o.chips < 2 && o.hp / o.hp0 < (o.chips ? 0.34 : 0.67)) change(o, 'c', point || o.c, dir, force);
          return true;
        },
        // what a bullet struck, by the collider the engine reports
        hitBox(box, point, dir, amount) { const o = box && byBox.get(box); return o ? api.hit(o, point, dir, amount, 0.25) : false; },
        blast(pos, radius, amount) {
          for (const o of objects) {
            if (o.state === 'gone') continue;
            const d = Math.hypot(o.c.x - pos.x, o.c.y - pos.y, o.c.z - pos.z);
            if (d > radius + Math.max(o.hu, o.hw)) continue;
            const k = Math.max(0, 1 - d / (radius + 0.5));
            v.copy(o.c).sub(pos).normalize();
            api.hit(o, c3.copy(o.c).addScaledVector(v, -Math.min(o.hu, o.hw)), v.clone(), amount * k * (o.kind === 'wood' ? 1.4 : 1.1), 0.5 + k);
          }
        },
        // something heavy forcing its way through at (x, z)
        smash(x, z, r, amount) {
          let any = false;
          for (const o of objects) {
            if (o.state === 'gone' || o.state === 'stump') continue;
            if (Math.abs(o.c.x - x) > r + Math.max(o.hu, o.hw) || Math.abs(o.c.z - z) > r + Math.max(o.hu, o.hw)) continue;
            v.set(o.c.x - x, 0, o.c.z - z).normalize();
            api.hit(o, c3.set(x, o.c.y, z), v.clone(), amount, 0.8); any = true;
          }
          return any;
        },
        // a new run: everything stands again
        reset() {
          for (const r of rubble.values()) { if (r.mesh) { root.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh = null; } r.list.length = 0; r.dirty = false; }
          rubbleVerts = 0; rubbleDirty = 0;
          for (const o of objects) {
            if (o.state === 'whole') { o.hp = o.hp0; continue; }
            if (o.live) { root.remove(o.live); o.live.userData.dispose(); o.live = null; }
            o.items = o.items0; o.hp = o.hp0; o.chips = 0; o.state = 'whole';
            showRanges(o, true); setBoxes(o, o.boxes0); bounds(o);
          }
        },
        // ---- playing together ----
        // a guest's shot reached something: the host decides what it did
        netHit(a) { const o = objects[a[0]]; if (o) api.hit(o, a[2] ? v.set(a[2][0], a[2][1], a[2][2]).clone() : null, a[3] ? new T.Vector3(a[3][0], a[3][1], a[3][2]) : null, +a[1] || 0, +a[4] || 0.4); },
        // the host's word that something changed
        netApply(a) {
          const o = objects[a[0]]; if (!o || o.state === 'gone' || o.state === 'stump') return;
          change(o, a[1], a[2] ? new T.Vector3(a[2][0], a[2][1], a[2][2]) : null, a[3] ? new T.Vector3(a[3][0], a[3][1], a[3][2]) : null, +a[4] || 0.4, +a[5] || 1);
        },
        // what is already broken, for a machine that was not there to see it: id, how, seed, height of the cut
        netList() { let out = 'O'; for (const o of objects) if (o.state === 'stump' || o.state === 'gone') out += o.id.toString(36) + '.' + o.how + '.' + (o.seed || 1).toString(36) + '.' + (o.cutY == null ? '' : Math.round(o.cutY * 100).toString(36)) + ';'; return out; },
        netSync(str) {
          if (typeof str !== 'string' || str[0] !== 'O') return;
          for (const part of str.slice(1).split(';')) {
            if (!part) continue;
            const a = part.split('.'), o = objects[parseInt(a[0], 36)];
            if (!o || o.state === 'gone' || o.state === 'stump') continue;
            change(o, a[1], a[3] ? new T.Vector3(o.c.x, parseInt(a[3], 36) / 100, o.c.z) : null, null, 0.4, parseInt(a[2], 36) || 1, true);
          }
        },
        update(dt) { if (rubbleDirty > 0) { rubbleDirty -= dt; if (rubbleDirty <= 0) rebuildRubble(); } },
      };
      return api;
    },
  };
})();
