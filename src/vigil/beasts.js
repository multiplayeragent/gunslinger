/* What is not a person among the dead: a horned skull that flies, a great bat, spiders of two sizes, and the
   wings, horns and tail bolted to the demon (which is otherwise one of the painted bodies, see zombies.js).

   Every part is a rigid mesh of plain, untextured standard material (the same shader program as the wolf's
   fur) plus one unlit material for what glows; nothing here is skinned and nothing adds a light. A body is a
   small Group: `root` stands where the manager's `pos` is, with the middle of the creature `centre` above it,
   so everything that aims at "a metre above pos" still finds a flyer. `hit` lists the spheres a bullet is
   tested against, in the body's own coordinates: [x, y, z, radius, part].

   The first half of the file is arithmetic the manager uses to fly and to climb, kept free of the renderer so
   it can be tested (tests/vigil.test.cjs). */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ------------------------------------------------------------------ flying and climbing, as numbers
  // How high a flyer's reference point may be above the floor under it (its middle is `centre` higher), how low
  // it cruises when it must follow the ground's ways in, and how near the floor it may come. The most is under
  // the church's eaves: with it, the walls keep everything that flies out of the roof.
  V.FLY = { top: 5.1, low: 0.45, clear: 0.22 };
  // A velocity turned toward the unit direction (ux, uy, uz) by at most `turn` radians a second and brought to
  // `speed`: how a skull's charge follows whoever it is after without ever turning on the spot. v is changed.
  V.flyHome = (v, ux, uy, uz, speed, turn, dt) => {
    const l = Math.hypot(v.x, v.y, v.z);
    if (l < 1e-4) { v.x = ux * speed; v.y = uy * speed; v.z = uz * speed; return v; }
    let dx = v.x / l, dy = v.y / l, dz = v.z / l;
    const dot = clamp(dx * ux + dy * uy + dz * uz, -1, 1), ang = Math.acos(dot), most = turn * dt;
    if (ang <= most || ang < 1e-4) { dx = ux; dy = uy; dz = uz; }
    else {
      // slerp by most / ang
      const t = most / ang, sn = Math.sin(ang), a = Math.sin((1 - t) * ang) / sn, b = Math.sin(t * ang) / sn;
      dx = dx * a + ux * b; dy = dy * a + uy * b; dz = dz * a + uz * b;
      const n = Math.hypot(dx, dy, dz) || 1; dx /= n; dy /= n; dz /= n;
    }
    const s = l + (speed - l) * Math.min(1, dt * 6);
    v.x = dx * s; v.y = dy * s; v.z = dz * s;
    return v;
  };
  // Where on a wall a spider stops climbing: `rise` above where it stands, or just under the top of the wall if
  // that comes first; 0 when the wall is not worth climbing (less than `least` to gain).
  V.climbTop = (y, wallTop, rise, least, margin = 0.3) => { const top = Math.min(wallTop - margin, y + rise); return top - y >= least ? top : 0; };
  // A spring from `drop` metres above where it should land, `dist` away, at `speed` along the ground: how long it
  // takes, how fast it travels and the upward speed it leaves with, under the manager's leap gravity (20 m/s²:
  // height = vy·t − 10·t²). From the ground (drop 0) this is the wolf's arc.
  V.leapArc = (dist, drop, speed, most = 0.85) => {
    const dur = clamp(dist / speed, 0.36, most + (drop > 0 ? 0.3 : 0));
    return { dur, sp: Math.max(0, dist - 0.5) / dur, vy: 10 * dur - Math.max(0, drop) / dur };
  };
  // The point a swoop is flown at: through the target and `past` metres beyond it, level with it.
  V.swoopThrough = (bx, bz, tx, ty, tz, past, out = {}) => {
    const dx = tx - bx, dz = tz - bz, d = Math.hypot(dx, dz) || 1;
    out.x = tx + (dx / d) * past; out.y = ty; out.z = tz + (dz / d) * past;
    return out;
  };

  // ------------------------------------------------------------------ meshes
  // How far above its reference point the middle of each body is (metres at scale 1), the spheres a bullet is
  // tested against, and how far any of it reaches from that middle.
  V.BEAST_HIT = {
    skull: { centre: 1.08, reach: 0.75, hit: [[0, 1.08, 0.04, 0.4, 'body']] },
    bat: { centre: 1.06, reach: 1.5, hit: [[0, 1.13, 0.43, 0.16, 'weak'], [0, 1.05, 0.02, 0.3, 'body'], [0.62, 1.1, 0, 0.32, 'body'], [-0.62, 1.1, 0, 0.32, 'body']] },
    spider: { centre: 0.4, reach: 1.15, hit: [[0, 0.41, 0.31, 0.14, 'weak'], [0, 0.37, 0.1, 0.25, 'body'], [0, 0.43, -0.4, 0.35, 'body']] },
  };

  V.beasts = {
    create(T, kit) {
      const std = (name, r, g, b, rough, em) => { const m = new T.MeshStandardMaterial({ color: new T.Color(r, g, b), roughness: rough, metalness: 0 }); m.name = name; if (em) m.emissive.setRGB(em[0], em[1], em[2]); return m; };
      const lit = (name, r, g, b) => { const m = new T.MeshBasicMaterial({ color: new T.Color(r, g, b), fog: false }); m.name = name; return m; };
      const M = {
        bone: std('vg_beast_bone', 0.4, 0.38, 0.31, 0.86), dark: std('vg_beast_dark', 0.012, 0.008, 0.008, 0.95),
        hide: std('vg_beast_hide', 0.075, 0.062, 0.06, 0.9), membrane: std('vg_beast_membrane', 0.085, 0.022, 0.02, 0.8, [0.012, 0.001, 0.0006]),
        chitin: std('vg_beast_chitin', 0.05, 0.042, 0.04, 0.42), demon: std('vg_beast_demon', 0.05, 0.016, 0.015, 0.7, [0.012, 0.0015, 0.0008]),
        fireEye: lit('vg_beast_fire', 5.2, 2.2, 0.35), redEye: lit('vg_beast_red', 4.2, 0.35, 0.2), greenEye: lit('vg_beast_green', 0.9, 4.0, 0.6),
      };
      const S = kit.sphere, X = kit.xf, rod = kit.rod, merge = kit.merge;
      const mesh = (geo, mat, parent, shadow = true) => { const m = new T.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = false; parent.add(m); return m; };
      // a thin skin drawn from both sides without a two-sided material (that would be another shader program)
      const skin = (tris) => { const both = []; for (let i = 0; i < tris.length; i += 3) both.push(tris[i], tris[i + 1], tris[i + 2], tris[i], tris[i + 2], tris[i + 1]); return kit.fromTris(both, false); };
      const mirror = (geo) => X(geo.clone(), { s: [-1, 1, 1] });
      const cache = {};
      const once = (key, make) => cache[key] || (cache[key] = make());

      // ---- the skull: cranium, cheeks, brow, horns and teeth in one piece; a jaw that works; fire in the sockets
      const skullGeo = () => once('skull', () => {
        const parts = [
          X(S(0.3, 16, 12), { p: [0, 1.12, -0.05], s: [0.9, 1.0, 1.12] }), X(S(0.19, 12, 9), { p: [0, 0.95, 0.16], s: [1.0, 0.8, 1.05] }),
          X(kit.cyl(0.05, 0.05, 0.36, 8), { p: [0.18, 1.2, 0.2], r: [0, 0, PI / 2] }),
        ];
        for (const sx of [1, -1]) {
          parts.push(rod([sx * 0.2, 1.3, -0.05], [sx * 0.38, 1.44, -0.02], 0.075, 0.058, 8), rod([sx * 0.38, 1.44, -0.02], [sx * 0.46, 1.65, 0.05], 0.058, 0.036, 8), rod([sx * 0.46, 1.65, 0.05], [sx * 0.4, 1.86, 0.17], 0.036, 0.006, 8));
          parts.push(X(S(0.06, 8, 6), { p: [sx * 0.155, 0.985, 0.2], s: [0.9, 0.8, 1.1] }));        // cheekbone
        }
        for (let i = -2; i <= 2; i++) parts.push(X(kit.cyl(0.024, 0.003, 0.085, 5), { p: [i * 0.056, 0.775, 0.3 - Math.abs(i) * 0.022] }));
        const jaw = [X(kit.bevelBox(0.3, 0.075, 0.07, 0.015), { p: [0, -0.115, 0.265] })];
        for (const sx of [1, -1]) jaw.push(rod([sx * 0.15, -0.115, 0.25], [sx * 0.19, 0.0, 0.0], 0.04, 0.045, 6));
        for (let i = -2; i <= 2; i++) jaw.push(X(kit.cyl(0.003, 0.022, 0.075, 5), { p: [i * 0.056, -0.08, 0.275 - Math.abs(i) * 0.02] }));
        const glow = [X(S(0.036, 8, 6), { p: [0.11, 1.105, 0.262] }), X(S(0.036, 8, 6), { p: [-0.11, 1.105, 0.262] }), X(S(0.08, 8, 6), { p: [0, 0.89, 0.12] })];
        // sockets and the hole of the nose: dark hollows set into the face
        const dark = [X(S(0.088, 10, 8), { p: [0.11, 1.1, 0.222], s: [1.05, 1, 0.75] }), X(S(0.088, 10, 8), { p: [-0.11, 1.1, 0.222], s: [1.05, 1, 0.75] }), X(S(0.04, 6, 5), { p: [0, 0.99, 0.325], s: [0.8, 1.3, 0.7] }), X(S(0.11, 8, 6), { p: [0, 0.875, 0.2], s: [1.25, 0.55, 0.9] })];
        return { head: merge(parts), jaw: merge(jaw), glow: merge(glow), dark: merge(dark) };
      });
      function skull() {
        const G = skullGeo(), root = new T.Group(); root.rotation.order = 'YXZ';
        const bone = M.bone.clone(); bone.name = M.bone.name;               // its own, so it can flare before it charges
        mesh(G.head, bone, root);
        const jaw = mesh(G.jaw, bone, root); jaw.position.set(0, 0.935, 0.02);
        mesh(G.dark, M.dark, root, false);
        const glow = mesh(G.glow, M.fireEye, root, false);
        return { kind: 'skull', root, glow, jaw, bone, ...V.BEAST_HIT.skull };
      }

      // ---- the bat: a furred body, a head with ears, and two wings that beat about the shoulder
      const batGeo = () => once('bat', () => {
        const body = [
          X(S(0.19, 12, 9), { p: [0, 1.05, -0.02], s: [0.95, 0.9, 1.7] }), X(S(0.16, 10, 8), { p: [0, 1.075, 0.2] }), X(S(0.12, 10, 8), { p: [0, 1.135, 0.41], s: [1, 0.95, 1.1] }), X(S(0.058, 8, 6), { p: [0, 1.1, 0.515], s: [1, 0.8, 1.2] }),
          rod([0.05, 0.98, -0.28], [0.07, 0.85, -0.4], 0.02, 0.008, 5), rod([-0.05, 0.98, -0.28], [-0.07, 0.85, -0.4], 0.02, 0.008, 5),
        ];
        for (const sx of [1, -1]) body.push(X(kit.cyl(0.004, 0.058, 0.22, 6), { p: [sx * 0.075, 1.2, 0.37], r: [-0.15, 0, -sx * 0.32] }));
        // the wing, hinged at the shoulder: x out along the arm, z forward
        const s0 = [0, 0, 0.16], s1 = [0, 0, -0.24], w = [0.62, 0.1, 0.24], t = [1.34, 0.0, 0.02], f1 = [1.04, -0.02, -0.34], f2 = [0.67, -0.02, -0.47], f3 = [0.31, -0.02, -0.41];
        const arm = [rod(s0, w, 0.024, 0.017, 5), rod(w, t, 0.017, 0.005, 5), rod(w, f1, 0.011, 0.004, 4), rod(w, f2, 0.011, 0.004, 4), rod(w, f3, 0.011, 0.004, 4)];
        const web = skin([s0, w, f3, s0, f3, s1, w, f2, f3, w, f1, f2, w, t, f1]);
        const glow = [X(S(0.03, 6, 5), { p: [0.056, 1.175, 0.495] }), X(S(0.03, 6, 5), { p: [-0.056, 1.175, 0.495] })];
        const wing = merge([merge(arm), web]);                              // bones and skin in one piece: one draw
        return { body: merge(body), wing, wingL: mirror(wing), glow: merge(glow) };
      });
      function bat() {
        const G = batGeo(), root = new T.Group(); root.rotation.order = 'YXZ';
        mesh(G.body, M.hide, root);
        const wing = (geo, sx) => { const h = mesh(geo, M.membrane, root); h.position.set(sx * 0.1, 1.1, 0.05); return h; };
        const wingR = wing(G.wing, 1), wingL = wing(G.wingL, -1);
        const glow = mesh(G.glow, M.redEye, root, false);
        return { kind: 'bat', root, glow, wingR, wingL, ...V.BEAST_HIT.bat };
      }

      // ---- the spider: two-part body, fangs, eight legs of two joints hinged at the hip, eyes that glow
      const LEG_YAW = [-0.95, -0.36, 0.22, 0.78], LEG_Z = [0.24, 0.12, 0.0, -0.12], LEG_LEN = [1.12, 0.96, 0.98, 1.16];
      const spiderGeo = () => once('spider', () => {
        const body = [
          X(S(0.2, 12, 9), { p: [0, 0.36, 0.12], s: [1.05, 0.62, 1.2] }), X(S(0.3, 14, 10), { p: [0, 0.43, -0.4], s: [1, 0.82, 1.25] }), X(S(0.09, 8, 6), { p: [0, 0.36, -0.1] }),
          rod([0.06, 0.34, 0.3], [0.05, 0.17, 0.4], 0.035, 0.008, 6), rod([-0.06, 0.34, 0.3], [-0.05, 0.17, 0.4], 0.035, 0.008, 6),      // fangs
          rod([0.1, 0.33, 0.26], [0.16, 0.26, 0.47], 0.022, 0.012, 5), rod([-0.1, 0.33, 0.26], [-0.16, 0.26, 0.47], 0.022, 0.012, 5),       // palps
        ];
        const leg = merge([rod([0, 0, 0], [0.4, 0.26, 0], 0.055, 0.042, 6), rod([0.4, 0.26, 0], [0.84, -0.36, 0], 0.042, 0.012, 6), X(S(0.05, 6, 5), { p: [0.4, 0.26, 0] })]);
        const glow = [];
        for (const [x, y, zz, r] of [[0.05, 0.445, 0.325, 0.03], [0.115, 0.42, 0.275, 0.024], [0.02, 0.4, 0.345, 0.018], [0.085, 0.385, 0.315, 0.016]]) { glow.push(X(S(r, 6, 5), { p: [x, y, zz] }), X(S(r, 6, 5), { p: [-x, y, zz] })); }
        const mark = merge([X(S(0.075, 8, 6), { p: [0, 0.672, -0.33], s: [1, 0.22, 1.1] }), X(S(0.075, 8, 6), { p: [0, 0.66, -0.5], s: [1, 0.22, 1.1] })]);
        return { body: merge(body), leg, legL: mirror(leg), glow: merge(glow), glowBig: merge([merge(glow), mark]) };
      });
      function spider(type) {
        const G = spiderGeo(), root = new T.Group(); root.rotation.order = 'YXZ';
        const big = !!(V.ZOMBIES && V.ZOMBIES[type] && V.ZOMBIES[type].size);
        mesh(G.body, M.chitin, root);
        const legs = [];
        for (let i = 0; i < 4; i++) for (const sx of [1, -1]) {
          const l = mesh(sx > 0 ? G.leg : G.legL, M.chitin, root, false);
          l.position.set(sx * 0.17, 0.36, LEG_Z[i]); l.rotation.order = 'YZX'; l.scale.setScalar(LEG_LEN[i]);
          legs.push({ m: l, sx, yaw: sx * LEG_YAW[i], len: LEG_LEN[i], group: (i + (sx > 0 ? 0 : 1)) % 2 });
        }
        const glow = mesh(big ? G.glowBig : G.glow, big ? M.redEye : M.greenEye, root, false);      // the great one's eyes are red, and it carries a red mark on its back
        return { kind: 'spider', root, glow, legs, big, ...V.BEAST_HIT.spider };
      }

      // ---- the demon's own: wings from the shoulder blades, horns, a tail (bolted to a painted body's bones)
      const demonGeo = () => once('demon', () => {
        // the wing stands behind the back, in the plane of the shoulders: x out, y up
        const s0 = [0, 0, 0], s1 = [0, -0.46, 0.02], w = [0.56, 0.62, -0.06], t = [1.28, 0.98, -0.12], f1 = [1.16, 0.16, -0.12], f2 = [0.82, -0.3, -0.09], f3 = [0.4, -0.52, -0.04];
        const arm = merge([rod(s0, w, 0.034, 0.024, 6), rod(w, t, 0.024, 0.006, 6), rod(w, f1, 0.014, 0.005, 4), rod(w, f2, 0.014, 0.005, 4), rod(w, f3, 0.014, 0.005, 4)]);
        const web = skin([s0, w, f3, s0, f3, s1, w, f2, f3, w, f1, f2, w, t, f1]);
        const horns = [], tail = merge([rod([0, -0.04, -0.1], [0, -0.3, -0.36], 0.036, 0.024, 6), rod([0, -0.3, -0.36], [0, -0.36, -0.66], 0.024, 0.012, 6), X(kit.cyl(0.002, 0.05, 0.13, 4), { p: [0, -0.36, -0.66], r: [-PI / 2 - 0.2, 0, 0] })]);
        for (const sx of [1, -1]) horns.push(rod([sx * 0.065, 0.15, 0.03], [sx * 0.13, 0.25, 0.05], 0.03, 0.022, 6), rod([sx * 0.13, 0.25, 0.05], [sx * 0.125, 0.4, 0.1], 0.022, 0.004, 6));
        const wing = merge([arm, web]);
        return { wing, wingL: mirror(wing), horns: merge(horns), tail };
      });
      // B: the body's bones by name. Returns the two wing hinges, for flap().
      function demonParts(B) {
        const G = demonGeo();
        const wing = (geo, sx) => { const h = mesh(geo, M.membrane, B.chest); h.position.set(sx * 0.09, 0.15, -0.14); h.frustumCulled = false; return h; };
        const wingR = wing(G.wing, 1), wingL = wing(G.wingL, -1);
        mesh(G.horns, M.demon, B.head).frustumCulled = false; mesh(G.tail, M.demon, B.hips).frustumCulled = false;
        return { wingR, wingL };
      }
      // the demon's wings beat forward and back about the spine
      function flap(wings, phase, amp = 0.5) {
        const a = 0.42 + amp * Math.sin(phase), tilt = 0.12 * Math.cos(phase);
        wings.wingR.rotation.set(0, a, tilt); wings.wingL.rotation.set(0, -a, -tilt);
      }

      // ---- how each holds itself, every frame. speed: over the ground. The manager has just put the root at pos
      // with its yaw; this adds the rest (pitch, bank, a body lying dead).
      // A flyer is placed by a point below it, and would swing about that point when it pitched or banked: this
      // moves the root so the turn is about its middle (`cy` above the point) instead.
      function pivot(r, cy) {
        const sx = Math.sin(r.rotation.x), cx = Math.cos(r.rotation.x), sz = Math.sin(r.rotation.z), cz = Math.cos(r.rotation.z), sy = Math.sin(r.rotation.y), cw = Math.cos(r.rotation.y);
        const x = -cy * sz, y = cy * cz * cx, zz = cy * cz * sx;            // where the middle goes: Ry Rx Rz (0, cy, 0), before the yaw
        r.position.x -= x * cw + zz * sy; r.position.y -= y - cy; r.position.z -= -x * sy + zz * cw;
      }
      function pose(z, dt, speed, time) {
        const b = z.body, r = b.root, dead = z.dead;
        if (b.kind === 'skull') {
          const wind = z.fs === 'wind' ? 1 : 0, charge = z.fs === 'charge' ? 1 : 0;
          let open = 0.1 + 0.08 * Math.sin(time * 9 + z.seed * 5);
          if (z.swing > 0 || wind || charge) open = 0.62 + 0.1 * Math.sin(time * 30);
          b.jaw.rotation.x = open;
          r.rotation.x = charge ? clamp(-Math.atan2(z.vel.y, Math.max(1, speed)), -0.7, 0.7) : 0.1 * Math.sin(time * 1.7 + z.seed);
          r.rotation.z = 0.08 * Math.sin(time * 2.3 + z.seed * 3);
          if (wind) { r.position.x += Math.sin(time * 71) * 0.03; r.position.y += Math.sin(time * 83) * 0.03; }
          r.position.y += 0.06 * Math.sin(time * 2.6 + z.seed * 2);
          const hot = wind || charge ? 0.55 + 0.25 * Math.sin(time * 40) : 0.012;
          b.bone.emissive.setRGB(hot, hot * 0.2, hot * 0.04);
          pivot(r, b.centre * z.scale);
          return;
        }
        if (b.kind === 'bat') {
          const dive = z.fs === 'dive' ? 1 : 0;
          z.phase += dt * (dead ? 0 : dive ? 9 : 15 + speed * 0.9);
          // dead: wings thrown up while it falls (the manager spins it), spread flat where it lies
          const a = dead ? (dead.down ? 0.1 : 1.1 + 0.15 * Math.sin(dead.t * 31)) : dive ? 0.5 + 0.12 * Math.sin(z.phase) : 0.12 + 0.78 * Math.sin(z.phase);
          b.wingR.rotation.z = a; b.wingL.rotation.z = -a;
          if (dead) { r.rotation.x = 0; r.rotation.z = 0; return; }
          r.rotation.x = clamp(-Math.atan2(z.vel.y, Math.max(2, speed)), -0.9, 0.7);
          r.rotation.z = clamp((z.bank || 0), -0.7, 0.7);
          r.position.y += dive ? 0 : 0.05 * Math.sin(z.phase);                    // it rises on the downbeat
          pivot(r, b.centre * z.scale);
          return;
        }
        // the spider
        const walk = Math.min(1, speed / 0.6);
        z.walkBlend = z.walkBlend + ((dead ? 0 : walk) - z.walkBlend) * Math.min(1, dt * 8);
        z.phase += dt * (3.5 + Math.min(11, speed * 4.2)) * (z.walkBlend > 0.02 ? 1 : 0);
        const air = z.leap || z.leapShow ? 1 : 0, sink = z.leapWind > 0 ? 1 : 0, climb = (z.climb && z.climb.phase !== 'to') || z.climbShow ? 1 : 0;
        let bite = 0; if (z.swing > 0 && !air) { const k = 1 - z.swing / z.swingDur; bite = Math.sin(k * PI); }
        const curl = dead ? Math.min(1, dead.t * 2.5) : 0;
        for (const l of b.legs) {
          const p = z.phase + l.group * PI, sw = Math.sin(p) * 0.3 * z.walkBlend, lift = Math.max(0, Math.cos(p)) * 0.3 * z.walkBlend;
          // in the air the legs are thrown wide; gathered under it before a spring; folded over the belly when it is dead
          const up = lift + air * 0.5 - sink * 0.22 - curl * 1.9 + (l.yaw * l.sx < -0.5 ? bite * 0.7 : 0) + (dead ? 0 : 0.04 * Math.sin(time * 1.3 + l.yaw * 5 + z.seed));
          l.m.rotation.set(0, l.yaw - l.sx * sw, l.sx * up);
          if (curl || l.m.scale.x !== l.len) l.m.scale.setScalar(l.len * (1 - 0.4 * curl));        // drawn in as they fold
        }
        z.pitch = (z.pitch || 0) + ((climb ? -PI / 2 : air ? 0.35 : -bite * 0.18) - (z.pitch || 0)) * Math.min(1, dt * (climb ? 9 : 6));
        r.rotation.x = z.pitch; r.rotation.z = 0;
        if (dead) {
          // on its back, legs drawn in
          const k = Math.min(1, dead.t * 3);
          r.rotation.x = 0; r.rotation.z = PI * k; r.position.y += 0.7 * z.scale * k;
          return;
        }
        r.position.y += (0.02 * Math.sin(z.phase * 2) * z.walkBlend - sink * 0.12) * z.scale;
      }

      return { skull, bat, spider, demonParts, flap, pose, materials: M };
    },
  };
})();
