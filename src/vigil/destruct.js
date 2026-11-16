/* Things that break. An object the level marks as breakable keeps its own geometry and colliders; shots,
   blasts and the bigger dead wear it down. Stone chips where it is hit, then snaps and leaves a stump; timber
   splits into lengths. Breaking is done by cutting the real geometry with planes and capping the cuts, so the
   pieces fit the thing they came from. Pieces are rigid bodies (phys.js); where they come to rest they are
   merged back into a static mesh.

   Buildings break the same way, in larger pieces and in two goes. A part marked `raze` (a bay of a wall, a tier of
   the tower, a mausoleum) snaps like any stone, but its stump still stands in the way and can be worn down in
   turn, after which nothing of it is left but rubble. A part that `rests` on others (a bay of the roof, the upper
   tiers of the tower) comes down when half of what holds it up has. The dead do not break buildings: `smash`
   passes them by. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const rand = (a, b) => a + Math.random() * (b - a);

  // resist: how much of a hit gets through. fresh: how much paler a broken face is than the weathered outside.
  const KINDS = {
    stone: { density: 2300, bounce: 0.2, friction: 0.75, resist: 0.5, fresh: 1.22, chip: [0.3, 0.3, 0.29], dust: [0.5, 0.5, 0.48], snd: 'stone_break', land: 'stone_hit' },
    // (iron and brass: candle stands, the altar's cross. They sound as stone does: there is no ring of metal yet)
    metal: { density: 7200, bounce: 0.28, friction: 0.6, resist: 0.6, fresh: 1.12, chip: [0.34, 0.31, 0.24], dust: [0.3, 0.3, 0.29], snd: 'stone_break', land: 'stone_hit' },
    wood: { density: 620, bounce: 0.18, friction: 0.72, resist: 1, fresh: 1.7, chip: [0.3, 0.22, 0.14], dust: [0.36, 0.28, 0.2], snd: 'wood_break', land: 'wood_hit' },
  };

  // Cuts a non-indexed geometry with the plane n·p = d. Returns [front, back] (either may be null), the cut capped.
  // Triangles wholly on one side are copied across in runs; only the ones the plane passes through are worked on
  // a corner at a time (a wall of a few thousand triangles is cut in about a millisecond). A geometry the plane
  // misses comes back as it is, not as a copy.
  function slice(T, geo, n, d, fresh) {
    const P = geo.attributes.position.array, N = geo.attributes.normal.array, U = geo.attributes.uv ? geo.attributes.uv.array : null, C = geo.attributes.color ? geo.attributes.color.array : null;
    const count = geo.attributes.position.count, tris = (count / 3) | 0, eps = 1e-5, nx = n.x, ny = n.y, nz = n.z;
    const side = new Uint8Array(tris);                    // 1 in front, 2 behind, 0 cut
    let nf = 0, nb = 0, nc = 0;
    for (let t = 0, i = 0; t < tris; t++, i += 9) {
      const s0 = P[i] * nx + P[i + 1] * ny + P[i + 2] * nz - d, s1 = P[i + 3] * nx + P[i + 4] * ny + P[i + 5] * nz - d, s2 = P[i + 6] * nx + P[i + 7] * ny + P[i + 8] * nz - d;
      if (s0 >= -eps && s1 >= -eps && s2 >= -eps) { side[t] = 1; nf++; } else if (s0 <= eps && s1 <= eps && s2 <= eps) { side[t] = 2; nb++; } else nc++;
    }
    if (!nc) { if (!nb) return [nf ? geo : null, null]; if (!nf) return [null, geo]; }
    const mk = () => ({ p: [], n: [], u: [], c: [] }), F = mk(), B = mk(), seg = [];
    const vert = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2], U ? U[i * 2] : 0, U ? U[i * 2 + 1] : 0, C ? C[i * 3] : 1, C ? C[i * 3 + 1] : 1, C ? C[i * 3 + 2] : 1];
    const lerp = (a, b, t) => { const o = new Array(11); for (let k = 0; k < 11; k++) o[k] = a[k] + (b[k] - a[k]) * t; return o; };
    const push = (buf, v) => { buf.p.push(v[0], v[1], v[2]); buf.n.push(v[3], v[4], v[5]); buf.u.push(v[6], v[7]); buf.c.push(v[8], v[9], v[10]); };
    for (let t = 0; t < tris; t++) {
      if (side[t]) continue;
      const i = t * 3, v = [vert(i), vert(i + 1), vert(i + 2)], sd = [0, 0, 0];
      for (let k = 0; k < 3; k++) sd[k] = v[k][0] * nx + v[k][1] * ny + v[k][2] * nz - d;
      const k = (sd[0] > 0) === (sd[1] > 0) ? 2 : (sd[0] > 0) === (sd[2] > 0) ? 1 : 0;            // the corner alone on its side
      const a = v[k], b = v[(k + 1) % 3], c = v[(k + 2) % 3], sa = sd[k], sb = sd[(k + 1) % 3], sc = sd[(k + 2) % 3];
      const ab = lerp(a, b, sa / (sa - sb)), ac = lerp(a, c, sa / (sa - sc)), lone = sa > 0 ? F : B, other = sa > 0 ? B : F;
      push(lone, a); push(lone, ab); push(lone, ac);
      push(other, ab); push(other, b); push(other, c); push(other, ab); push(other, c); push(other, ac);
      seg.push(ab, ac);
    }
    if (seg.length >= 6) {
      // close both halves with a fan over the cut, the colour of the unweathered inside
      let cx = 0, cy = 0, cz = 0, cr = 1, cg = 1, cb = 1;
      for (const q of seg) { cx += q[0]; cy += q[1]; cz += q[2]; }
      cx /= seg.length; cy /= seg.length; cz /= seg.length;
      if (C) { cr = cg = cb = 0; for (let i = 0; i < C.length; i += 9) { cr += C[i]; cg += C[i + 1]; cb += C[i + 2]; } cr /= tris; cg /= tris; cb /= tris; }
      const col = [Math.min(1.6, cr * fresh), Math.min(1.6, cg * fresh), Math.min(1.6, cb * fresh * 0.97)];
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
    // whole triangles of one side, run by run, then what the cut made
    const done = (buf, id, whole) => {
      const extra = buf.p.length / 3, total = whole * 3 + extra;
      if (total < 3) return null;
      const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2), col = new Float32Array(total * 3);
      if (!C) col.fill(1, 0, whole * 9);
      let o = 0;
      for (let t = 0; t < tris; t++) {
        if (side[t] !== id) continue;
        let e = t + 1; while (e < tris && side[e] === id) e++;
        const v0 = t * 3, v1 = e * 3;
        pos.set(P.subarray(v0 * 3, v1 * 3), o * 3); nor.set(N.subarray(v0 * 3, v1 * 3), o * 3);
        if (U) uv.set(U.subarray(v0 * 2, v1 * 2), o * 2);
        if (C) col.set(C.subarray(v0 * 3, v1 * 3), o * 3);
        o += v1 - v0; t = e - 1;
      }
      pos.set(buf.p, o * 3); nor.set(buf.n, o * 3); uv.set(buf.u, o * 2); col.set(buf.c, o * 3);
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3));
      g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.setAttribute('color', new T.BufferAttribute(col, 3));
      return g;
    };
    return [done(F, 1, nf), done(B, 2, nb)];
  }

  // Broken-off pieces: how long they lie, how long the pieces of one fall may keep joining a heap, how long sinking takes
  V.DEBRIS = { life: 15, open: 1.5, sink: 2.5 };
  // The burst a thing goes with: full: the hit points at which it is as big as it gets; radius and hurt (to the
  // warden, at its centre) from the smallest thing to that; dead: how much harder it hits the dead
  V.BOOM = { full: 1500, radius: [1.6, 4.8], hurt: [14, 60], dead: 4 };

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
      // What stands on what. `rests` is a list of tags: the parts with one of those tags that lie under this one
      // and reach up to it are its supports (buildings are square to the axes, so their boxes are compared as they are).
      // `hangs` is the same for a thing fixed to others at any height (a door on its wall, a chandelier under the roof).
      for (const r of objects) {
        const hang = !Array.isArray(r.rests), tags = hang ? r.hangs : r.rests;
        if (!Array.isArray(tags)) continue;
        const m = hang ? 0.1 : -0.3;
        r.supports = objects.filter((s) => s !== r && tags.includes(s.tag) && (hang || (s.c.y < r.c.y - 0.2 && s.c.y + s.hy >= r.c.y - r.hy - 0.6))
          && Math.abs(s.c.x - r.c.x) < s.hu + r.hu + m && Math.abs(s.c.z - r.c.z) < s.hw + r.hw + m);
      }
      const falling = [];
      // s has snapped or gone: whatever rested on it, and has now lost half its supports, follows in a moment
      function dependents(s) {
        const net = NET();
        if (quiet || (net && !net.host)) return;
        for (const r of objects) {
          if (!r.supports || r.state === 'gone' || r.falling || !r.supports.includes(s)) continue;
          let lost = 0; for (const q of r.supports) if (q.state === 'stump' || q.state === 'gone') lost++;
          if (lost * 2 >= r.supports.length) { r.falling = true; falling.push({ o: r, t: 0.3 + Math.random() * 0.4 }); }
        }
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

      // ---- what is left standing of a thing that broke (its stump): merged into one static mesh per material, rebuilt a
      // moment after it changes. It stays for the night.
      const rubble = new Map(), RUBBLE_BATCH = 24000; let rubbleDirty = 0, rubbleVerts = 0;
      const DEBRIS = V.DEBRIS;
      function settle(key, geo, matrix) {
        const gq = geo.clone(); if (matrix) gq.applyMatrix4(matrix);
        let r = rubble.get(key); if (!r) rubble.set(key, (r = { list: [], mesh: null, dirty: false, verts: 0, done: [] }));
        r.list.push(gq); r.dirty = true; r.verts += gq.attributes.position.count; rubbleVerts += gq.attributes.position.count; rubbleDirty = Math.max(rubbleDirty, 0.25);
      }
      function rebuildRubble() {
        for (const [key, r] of rubble) {
          if (!r.dirty) continue; r.dirty = false;
          if (r.mesh) { root.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh = null; }
          if (!r.list.length) continue;
          const geo = kit.merge(r.list); geo.computeBoundingSphere();
          const mat = mats.get(key);
          r.mesh = new T.Mesh(geo, mat); r.mesh.name = 'rubble:' + key; r.mesh.castShadow = !mat.transparent; r.mesh.receiveShadow = true; r.mesh.matrixAutoUpdate = false; root.add(r.mesh);
          // grown large: it is left as it is and the next pieces start a mesh of their own (merging stays cheap)
          if (r.verts > RUBBLE_BATCH) { r.done.push(r.mesh); r.mesh = null; r.list = []; r.verts = 0; }
        }
      }
      // ---- what was broken off: DEBRIS.life seconds after it broke it sinks into the ground and is gone, wherever it
      // has rolled to by then. Pieces broken within a moment of each other share one mesh a material once they have
      // come to rest (a heap), so a wall coming down is a handful of draws while it lies there, and the whole heap
      // goes under together. What is left standing (a stump, above) is not debris and stays.
      const heaps = []; let clock = 0;
      // ---- a thing that breaks goes with a burst: a flash, fire, and a blast that hurts whoever stands by it, the
      // warden included. It breaks nothing further (one thing going does not set off the next), and what falls from
      // it afterwards hurts nobody. How big follows how much the thing could take: a crate is a slap, a bay of the
      // church wall is not to be stood beside.
      const BOOM = V.BOOM; let shookAt = -9;
      function boom(o) {
        if (quiet) return;
        const big = Math.min(1, (o.hp0 || 100) / BOOM.full), radius = BOOM.radius[0] + (BOOM.radius[1] - BOOM.radius[0]) * big, hurt = BOOM.hurt[0] + (BOOM.hurt[1] - BOOM.hurt[0]) * big, pos = o.c;
        try { g.fx.explosion(pos, 0.45 + 0.9 * big); } catch (e) { /* optional */ }
        try { if (V.fire && V.fire.burst) V.fire.burst(pos.x, pos.y, pos.z, 8 + Math.round(20 * big), 3 + 4 * big, 0.55 + 0.45 * big); } catch (e) { /* optional */ }
        try { if (g.render && g.render.lightPool) g.render.lightPool.flash(pos, 0xffa040, 36 + 60 * big, 6 + 6 * big, 0.08); } catch (e) { /* optional */ }
        // heard, and felt a little: the engine's own `explosion` event throws the view hard and a wall coming down is a
        // dozen of these, so the sound is asked for by name and the shake is a small one, at most once in a while
        try { if (g.audio && g.audio.play) g.audio.play('explosion', { pos: [pos.x, pos.y, pos.z], gain: 0.4 + 0.35 * big, pitch: 1.2 - 0.25 * big, jitter: 0.05 }); } catch (e) { /* no audio */ }
        if (clock - shookAt > 0.45 && g.player && g.player.addShake) { const far = Math.hypot(g.player.pos.x - pos.x, g.player.pos.z - pos.z); if (far < 14) { shookAt = clock; g.player.addShake((0.04 + 0.07 * big) * (1 - far / 14)); } }
        const net = NET();
        if (!net || net.host) {
          const Z = g.enemies;
          if (Z && Z.forEachInRadius) Z.forEachInRadius(pos.x, pos.z, radius, (z, d) => {
            z.damage(hurt * BOOM.dead * (1 - 0.7 * (d / radius)), null, new T.Vector3(z.pos.x - pos.x, 0.2, z.pos.z - pos.z).normalize(), 'body', { by: 'player', blast: { x: pos.x, y: pos.y, z: pos.z, force: 4 + 4 * big } });
          }, pos.y);
        }
        const p = g.player;
        if (p && p.alive && g.game && g.game.state === 'playing') {
          const d = Math.hypot(p.pos.x - pos.x, p.pos.y + 0.9 - pos.y, p.pos.z - pos.z);
          if (d < radius) p.damage(hurt * (1 - d / radius), pos);
        }
      }
      const snuff = (o, out) => { if (o.flames) for (const f of o.flames) f[4] = out; };
      // age: how long ago the piece broke off (it has been tumbling since)
      function heap(key, geo, matrix, age) {
        const gq = geo.clone(); if (matrix) gq.applyMatrix4(matrix);
        const born = clock - (age || 0);
        let h = null;
        for (let i = heaps.length - 1; i >= 0 && !h; i--) if (heaps[i].list && heaps[i].key === key && Math.abs(heaps[i].born - born) < DEBRIS.open && heaps[i].verts < RUBBLE_BATCH && heaps[i].sunk === 0) h = heaps[i];
        if (!h) heaps.push((h = { key, list: [], mesh: null, verts: 0, born, wait: 0, sunk: 0, depth: 0 }));
        h.list.push(gq); h.verts += gq.attributes.position.count; rubbleVerts += gq.attributes.position.count; h.wait = 0.2;
      }
      function dropHeap(h) { if (h.mesh) { root.remove(h.mesh); h.mesh.geometry.dispose(); h.mesh = null; } rubbleVerts = Math.max(0, rubbleVerts - h.verts); h.list = null; }
      function updateHeaps(dt) {
        clock += dt;
        for (let i = heaps.length - 1; i >= 0; i--) {
          const h = heaps[i], age = clock - h.born;
          if (h.wait > 0 && (h.wait -= dt) <= 0 && h.list) {
            if (h.mesh) { root.remove(h.mesh); h.mesh.geometry.dispose(); }
            const geo = kit.merge(h.list), mat = mats.get(h.key); geo.computeBoundingSphere(); geo.computeBoundingBox();
            h.mesh = new T.Mesh(geo, mat); h.mesh.name = 'debris:' + h.key; h.mesh.castShadow = !mat.transparent; h.mesh.receiveShadow = true; root.add(h.mesh);
            h.depth = geo.boundingBox.max.y - geo.boundingBox.min.y + 0.3;
            if (age >= 10) h.list = null;                                             // closed: every piece of that moment has come to rest by now
          }
          if (age < DEBRIS.life) continue;
          h.list = null;
          // under it goes, whatever its height, in the same time
          const step = (h.depth || 0.5) * dt / DEBRIS.sink;
          h.sunk += step; if (h.mesh) h.mesh.position.y -= step;
          if (h.sunk >= (h.depth || 0.5)) { dropHeap(h); heaps.splice(i, 1); }
        }
      }
      // throw a piece: it tumbles, lands, and (if it is big enough to matter) lies where it stops
      function fling(items, o, vel, spin) {
        if (quiet) return;
        const { grp, half } = group(items, true), vol = 8 * half.x * half.y * half.z * 0.55, big = Math.max(half.x, half.y, half.z) > 0.11;
        half.set(Math.max(0.025, half.x), Math.max(0.025, half.y), Math.max(0.025, half.z));
        loose.spawn({ mesh: grp, vel, ang: new T.Vector3(rand(-spin, spin), rand(-spin, spin), rand(-spin, spin)), half, mass: Math.max(0.3, vol * o.K.density), bounce: o.K.bounce, friction: o.K.friction,
          life: big && rubbleVerts < 900000 ? 0 : DEBRIS.life, sinceBirth: true,
          onHit: (b, sp) => { if (V.audio) V.audio.play(o.K.land, { pos: b.pos, gain: Math.min(1, sp / 7) }); },
          onRest: big && rubbleVerts < 900000 ? (b) => { b.mesh.updateMatrixWorld(true); for (const m of b.mesh.children) heap(m.userData.key, m.geometry, m.matrixWorld, b.age); return false; } : null });
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
        // (off a building a chip is a corner, not half the wall: its collider stays as it was)
        const sup = Math.abs(n.dot(o.u)) * o.hu + Math.abs(n.y) * o.hy + Math.abs(n.dot(o.w)) * o.hw, d = n.dot(o.c) + sup * (o.raze ? rr(0.8, 0.92) : rr(0.5, 0.68));
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
        o.state = 'stump'; o.items = stump; snuff(o, 1);
        // a building's stump stays its own thing, to be worn down in turn; any other is rubble from here on
        if (o.raze && stump.length) { o.live = group(stump, false).grp; root.add(o.live); o.hp = o.hp0 * 0.5; }
        else for (const it of stump) settle(it.key, it.geo, null);
        // the collider shrinks to the stump: low enough and the dead walk over it
        const top0 = y + 0.04;
        setBoxes(o, o.boxes0.filter((b) => b.min.y < top0 - 0.05).map((b) => ({ ...b, max: new T.Vector3(b.max.x, Math.min(b.max.y, top0), b.max.z) })));
        for (const part of parts) if (part.length) fling(part, o, push(dir, 1.5 + force * 2.5), 5);
        fx(o, point || o.c, dir, 1);
        if (V.audio && !quiet) V.audio.play(o.K.snd, { pos: o.c });
        boom(o);
        g.events.emit('vigil:broken', { kind: o.kind, pos: o.c.clone(), tag: o.tag, state: o.state });
        dependents(o);
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
        o.state = 'gone'; o.items = []; snuff(o, 1);
        setBoxes(o, []);
        for (const part of parts) fling(part, o, push(dir, 1.2 + force * 3), 6);
        fx(o, point || o.c, dir, 1);
        if (V.audio && !quiet) V.audio.play(o.K.snd, { pos: o.c });
        boom(o);
        g.events.emit('vigil:broken', { kind: o.kind, pos: o.c.clone(), tag: o.tag, state: o.state });
        dependents(o);
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
          if (o.state === 'stump' && !o.raze) { fx(o, point || o.c, dir, 0.15); return true; }
          fx(o, point || o.c, dir, Math.min(1, amount / 120) * 0.5);
          const net = NET();
          if (net && !net.host) { net.emit('oh', [o.id, r2(amount), point ? [r2(point.x), r2(point.y), r2(point.z)] : null, dir ? [r2(dir.x), r2(dir.y), r2(dir.z)] : null, r2(force)]); return true; }
          o.hp -= amount * o.K.resist;
          if (o.state === 'stump') { if (o.hp <= 0) change(o, 'w', point, dir, force); return true; }        // what was left of a building goes
          if (o.hp <= 0) change(o, o.kind === 'wood' ? 'w' : 's', point, dir, force);
          else if (o.kind !== 'wood' && o.chips < 2 && o.hp / o.hp0 < (o.chips ? 0.34 : 0.67)) change(o, 'c', point || o.c, dir, force);
          return true;
        },
        // what a bullet struck, by the collider the engine reports
        hitBox(box, point, dir, amount) { const o = box && byBox.get(box); return o ? api.hit(o, point, dir, amount, 0.25) : false; },
        blast(pos, radius, amount) {
          for (const o of objects) {
            if (o.state === 'gone') continue;
            // measured to the nearest face of the thing, not its middle: a wall is hurt by what goes off against it
            v.copy(pos).sub(o.c);
            const du = Math.max(0, Math.abs(v.dot(o.u)) - o.hu), dy = Math.max(0, Math.abs(v.y) - o.hy), dw = Math.max(0, Math.abs(v.dot(o.w)) - o.hw), d = Math.hypot(du, dy, dw);
            if (d > radius) continue;
            const k = Math.max(0, 1 - d / (radius + 0.5)), big = o.hu > 1.2 || o.hw > 1.2 || o.hy > 1.2;
            v.copy(o.c).sub(pos); if (big) v.y = 0; v.normalize();
            // where it is struck: a small thing on the side facing the blast, a big one at the blast's own height
            c3.copy(o.c).addScaledVector(v, -Math.min(o.hu, o.hw)); if (big) c3.set(Math.max(o.c.x - o.hu, Math.min(o.c.x + o.hu, pos.x)), Math.max(o.c.y - o.hy, Math.min(o.c.y + o.hy, pos.y)), Math.max(o.c.z - o.hw, Math.min(o.c.z + o.hw, pos.z)));
            api.hit(o, c3, v.clone(), amount * k * (o.kind === 'wood' ? 1.4 : 1.1), 0.5 + k);
          }
        },
        // something heavy forcing its way through at (x, z)
        smash(x, z, r, amount) {
          let any = false;
          for (const o of objects) {
            if (o.state === 'gone' || o.state === 'stump' || o.raze || o.rests) continue;                 // the dead do not break buildings
            if (Math.abs(o.c.x - x) > r + Math.max(o.hu, o.hw) || Math.abs(o.c.z - z) > r + Math.max(o.hu, o.hw)) continue;
            v.set(o.c.x - x, 0, o.c.z - z).normalize();
            api.hit(o, c3.set(x, o.c.y, z), v.clone(), amount, 0.8); any = true;
          }
          return any;
        },
        // what lies broken off just now: [material, seconds since it broke, vertices, how far it has sunk]
        debris() { return heaps.map((h) => [h.key, +(clock - h.born).toFixed(1), h.verts, +h.sunk.toFixed(2)]); },
        // a new run: everything stands again
        reset() {
          for (const r of rubble.values()) { if (r.mesh) { root.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh = null; } for (const m of r.done) { root.remove(m); m.geometry.dispose(); } r.done.length = 0; r.list.length = 0; r.verts = 0; r.dirty = false; }
          for (const h of heaps) dropHeap(h); heaps.length = 0;
          rubbleVerts = 0; rubbleDirty = 0; falling.length = 0;
          for (const o of objects) {
            o.falling = false;
            if (o.state === 'whole') { o.hp = o.hp0; continue; }
            if (o.live) { root.remove(o.live); o.live.userData.dispose(); o.live = null; }
            o.items = o.items0; o.hp = o.hp0; o.chips = 0; o.state = 'whole'; snuff(o, 0);
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
        update(dt) {
          if (rubbleDirty > 0) { rubbleDirty -= dt; if (rubbleDirty <= 0) rebuildRubble(); }
          updateHeaps(dt);
          for (let i = falling.length - 1; i >= 0; i--) {
            const f = falling[i]; f.t -= dt;
            if (f.t > 0) continue;
            falling.splice(i, 1); f.o.falling = false;
            if (f.o.state !== 'gone') change(f.o, 'w', null, null, 0.5);
          }
        },
        // the parts of one building, by the tag the level gave them
        tagged(tag) { return objects.filter((o) => o.tag === tag); },
        standing(o) { return o.state === 'whole' || o.state === 'worn'; },
      };
      return api;
    },
  };
})();
