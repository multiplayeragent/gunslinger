/* Shells: what the flak cannon and the rocket launcher throw.

   A bullet here is a point that flies for a few hundredths of a second (src/ballistics.js). A shell is slow
   enough to watch: it leaves the muzzle, drops (the flak round) or lights its motor and gathers speed (the
   rocket), and bursts where it strikes, beside the first thing it passes close to once it has armed (the flak
   round's proximity fuse, measured in three dimensions, so it works on what flies), or when its time runs out.
   The burst itself is not decided here: it is handed to whoever installed this (`api.explode`; on the
   Churchyard `V.defenses.explode`, the grenade's own path, which hurts the dead, what can break, and the
   player who stands too close, and tells the other machines in a squad).

   `V.SHELLS` is what each kind does in the air; damage, magazine and price are the kit's (director.js).
   `V.shellStep`, `V.shellNear` and `V.shellFate` are the flight, the fuse and the decision, kept free of the
   renderer so they can be tested. `V.shells` is the rest: a small pool of things to draw, their trails, and
   the burst's own smoke, fragments, light and sound. Nothing here adds a light or a material program: the
   glow is the sprite the lanterns and lifeforce use, the bodies are unlit, the light is the engine's pool. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});

  /* speed: metres a second at the muzzle. accel, top: the motor, and where it stops pushing. gravity: metres a
     second squared. life: seconds until it bursts by itself. arm: metres it flies before the fuse is live.
     fuse: metres from a body at which it bursts in passing (0: only on striking; the rocket's is narrow, so one
     that threads a crowd still goes off in it). radius, size: the blast and
     how big it is drawn. noise: how far the wild dead hear it. */
  V.SHELLS = {
    flak: { speed: 115, accel: 0, top: 115, gravity: 5.5, life: 2.4, arm: 6, fuse: 1.7, radius: 4.4, size: 0.9, noise: 42 },
    rocket: { speed: 32, accel: 150, top: 105, gravity: 1.1, life: 6, arm: 5, fuse: 0.7, radius: 7.5, size: 2.2, noise: 60 },
  };

  // One shell forward by dt. s: { x, y, z, vx, vy, vz, t, dist }. Returns how far it went.
  V.shellStep = (s, k, dt) => {
    let sp = Math.hypot(s.vx, s.vy, s.vz);
    if (k.accel > 0 && sp > 1e-6 && sp < k.top) { const next = Math.min(k.top, sp + k.accel * dt), f = next / sp; s.vx *= f; s.vy *= f; s.vz *= f; sp = next; }
    s.vy -= k.gravity * dt;
    const dx = s.vx * dt, dy = s.vy * dt, dz = s.vz * dt, d = Math.hypot(dx, dy, dz);
    s.x += dx; s.y += dy; s.z += dz; s.t += dt; s.dist += d;
    return d;
  };
  // How far along the step from a to b (0 to 1) the point c first lies within r of it; -1 if it never does.
  V.shellNear = (ax, ay, az, bx, by, bz, cx, cy, cz, r) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az, fx = ax - cx, fy = ay - cy, fz = az - cz;
    const c = fx * fx + fy * fy + fz * fz - r * r;
    if (c <= 0) return 0;
    const a = dx * dx + dy * dy + dz * dz;
    if (a < 1e-12) return -1;
    const b = 2 * (fx * dx + fy * dy + fz * dz), disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : -1;
  };
  /* What ends a step of `len` metres, if anything: the nearest of a wall (`wall` metres along, Infinity for none),
     a body struck (`body`), a body passed within the fuse (`near`, only looked at once the shell is `armed`), or
     its time being up (`spent`: it bursts at the end of the step). Returns { d, why } or null: it flies on. */
  V.shellFate = (len, wall, body, near, armed, spent) => {
    let d = Infinity, why = null;
    if (wall <= len) { d = wall; why = 'wall'; }
    if (body <= len && body < d) { d = body; why = 'body'; }
    if (armed && near >= 0 && near <= len && near < d) { d = near; why = 'near'; }
    if (!why && spent) { d = len; why = 'spent'; }
    return why ? { d, why } : null;
  };

  V.shells = {
    MAX: 12,
    fire() { return null; }, update() {}, reset() {}, count: () => 0, list: () => [], last: null,
    /* api: { explode(pos, radius, damage, size), noise(x, z, radius)?, hit(enemy, killed)? } */
    install(g, api) {
      const T = g.THREE;
      if (!T || !api || typeof api.explode !== 'function') return;
      const self = this, live = [], STEP = 1 / 120;
      const root = new T.Group(); root.name = 'vigil-shells'; g.scene.add(root);
      const a = new T.Vector3(), b = new T.Vector3(), dir = new T.Vector3(), at = new T.Vector3(), tmp = new T.Vector3();
      const rand = (lo, hi) => lo + Math.random() * (hi - lo);
      const glow = (r, gn, bl) => new T.SpriteMaterial({ map: V.glowTexture || null, color: new T.Color(r, gn, bl), blending: T.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
      const hot = glow(3.2, 2.2, 1.1), ember = glow(1.6, 0.55, 0.12);
      const hull = new T.MeshBasicMaterial({ color: new T.Color(0.07, 0.085, 0.06), fog: false }), tip = new T.MeshBasicMaterial({ color: new T.Color(0.3, 0.27, 0.2), fog: false });
      // what is drawn for one in flight: a hot point for the flak round; a rocket with its nose down +Z and a flame behind
      const pool = { flak: [], rocket: [] };
      function visual(kind) {
        const free = pool[kind].find((v) => !v.on);
        if (free) return free;
        const grp = new T.Group(); grp.visible = false; root.add(grp);
        const core = new T.Sprite(hot), halo = new T.Sprite(ember);
        core.renderOrder = 8; halo.renderOrder = 7;
        if (kind === 'flak') { core.scale.setScalar(0.3); halo.scale.setScalar(0.85); grp.add(halo, core); }
        else {
          const body = new T.Mesh(new T.CylinderGeometry(0.036, 0.036, 0.42, 12).rotateX(Math.PI / 2), hull);
          const nose = new T.Mesh(new T.LatheGeometry([[0.036, 0], [0.05, 0.07], [0.05, 0.14], [0.009, 0.29], [0, 0.3]].map((q) => new T.Vector2(q[0], q[1])), 14).rotateX(Math.PI / 2).translate(0, 0, 0.19), tip);
          const fins = new T.Mesh(new T.BoxGeometry(0.16, 0.012, 0.1).translate(0, 0, -0.2), hull), fins2 = new T.Mesh(new T.BoxGeometry(0.012, 0.16, 0.1).translate(0, 0, -0.2), hull);
          for (const m of [body, nose, fins, fins2]) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; }
          core.scale.setScalar(0.55); core.position.z = -0.3; halo.scale.setScalar(1.7); halo.position.z = -0.42;
          grp.add(body, nose, fins, fins2, halo, core);
        }
        const v = { on: false, grp, kind };
        pool[kind].push(v);
        return v;
      }
      for (const kind of ['flak', 'rocket']) visual(kind);                    // one of each is built with the level, not at the first shot

      const stats = g.combat && g.combat.stats, pooled = () => g.render && g.render.lightPool;
      const wake = [];                      // smoke owed to the air a rocket has passed through: [x, y, z, when]
      let clock = 0;
      const safe = (fn) => { try { fn(); } catch (e) { /* an effect that is not there */ } };
      // the nearest body the step a→b passes within the fuse of: metres along the step, or -1
      function passes(len, fuse) {
        const list = (g.enemies && g.enemies.list) || [];
        let best = -1;
        for (let i = 0; i < list.length; i++) {
          const z = list[i];
          if (!z || z.alive === false || !z.pos) continue;
          // the middle of the body, wherever it is: on the ground, on a wall, in the air (zombies.js `centreY`)
          const my = g.enemies.centreY ? g.enemies.centreY(z) : z.pos.y + (z.crawling ? 0.35 : 0.95 * (z.scale || 1));
          const t = V.shellNear(a.x, a.y, a.z, b.x, b.y, b.z, z.pos.x, my, z.pos.z, fuse + (z.r || 0.3));
          if (t >= 0 && (best < 0 || t * len < best)) best = t * len;
        }
        return best;
      }
      function burst(s, why) {
        const k = s.k, x = at.x, y = at.y, z = at.z;
        // who stood in it before it went off: a shell that hurt anyone counts as a hit, once
        const caught = [];
        if (g.enemies && g.enemies.forEachInRadius) g.enemies.forEachInRadius(x, z, k.radius, (zb) => { caught.push(zb); }, y);
        api.explode(at.clone(), k.radius, s.damage, k.size);
        if (caught.length) {
          if (stats) stats.hits++;
          const dead = caught.find((zb) => zb.alive === false);
          if (api.hit) api.hit(dead || caught[0], !!dead);
        }
        if (api.noise) api.noise(x, z, k.noise);
        // the burst's own look and sound, over the engine's explosion: fragments and a dark puff, or a ball of fire
        if (s.kind === 'flak') {
          safe(() => { for (let i = 0; i < 7; i++) g.fx.sparks(at, tmp.set(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).normalize(), 7); });
          safe(() => g.fx.smoke(at, { size: 2.3, life: 2.4, color: [0.09, 0.09, 0.1], count: 4, alpha: 0.5 }));
          safe(() => pooled().flash(at, 0xffc878, 150, 15, 0.12));
          safe(() => g.audio.play('gs_flak_burst', { pos: [x, y, z], gain: 1, jitter: 0.04 }));
        } else {
          if (V.fire && V.fire.burst) safe(() => V.fire.burst(x, y, z, 42, 10, 1.5));
          safe(() => g.fx.debris(at, { count: 16, color: 0x2e2a26, size: 0.09, speed: 11, spread: 1.5 }));
          safe(() => g.fx.smoke(at, { size: 3.4, life: 3.4, color: [0.16, 0.15, 0.14], count: 6, alpha: 0.55 }));
          safe(() => pooled().flash(at, 0xffa850, 330, 28, 0.3));
          safe(() => g.audio.play('gs_rocket_blast', { pos: [x, y, z], gain: 1, jitter: 0.03 }));
          const p = g.player; if (p && p.addShake && p.pos) { const near = Math.max(0, 1 - Math.hypot(p.pos.x - x, p.pos.y - y, p.pos.z - z) / 34); if (near > 0) p.addShake(0.12 + 0.8 * near * near); }
        }
        self.last = { kind: s.kind, why, x, y, z, t: s.t, dist: s.dist, caught: caught.length, killed: caught.filter((zb) => zb.alive === false).length };
      }
      function retire(i) { const s = live[i]; if (s.v) { s.v.on = false; s.v.grp.visible = false; } live.splice(i, 1); }
      function draw(s, dt) {
        const k = 1 - Math.min(1, s.t / 0.16), v = s.v;                      // it leaves the muzzle, not the eye
        v.grp.position.set(s.x + s.ox * k, s.y + s.oy * k, s.z + s.oz * k);
        if (s.kind !== 'rocket') return;
        v.grp.lookAt(tmp.set(v.grp.position.x + s.vx, v.grp.position.y + s.vy, v.grp.position.z + s.vz));
        const sp = Math.hypot(s.vx, s.vy, s.vz) || 1, ux = s.vx / sp, uy = s.vy / sp, uz = s.vz / sp, P = v.grp.position;
        const tx = P.x - ux * 0.36, ty = P.y - uy * 0.36, tz = P.z - uz * 0.36;
        // The flame is laid along what the tail travelled this frame (a rocket covers a metre and more between two
        // frames: lit only where it is, the trail would be beads), thinning toward the older end.
        if (s.tail) {
          const lx = s.tail[0] - tx, ly = s.tail[1] - ty, lz = s.tail[2] - tz, len = Math.hypot(lx, ly, lz);
          if (V.fire && V.fire.emit) {
            const n = Math.max(3, Math.min(10, Math.ceil(len / 0.14)));
            for (let i = 0; i < n; i++) {
              const f = (i + Math.random()) / n;
              V.fire.emit(tx + lx * f + rand(-0.02, 0.02), ty + ly * f + rand(-0.02, 0.02), tz + lz * f + rand(-0.02, 0.02), -ux * 3 + rand(-0.4, 0.4), -uy * 3 + rand(-0.3, 0.5), -uz * 3 + rand(-0.4, 0.4), { size: rand(0.22, 0.34), life: rand(0.1, 0.2), rise: 0.4, drag: 3, grow: 0.6, heat: 1.2 });
            }
          }
          // The smoke is left along the same stretch, a puff every sixty centimetres, but not yet: the engine lights a
          // puff once, where and when it is made, and made beside the motor it would stay the motor's orange for good.
          // A fifth of a second on, the rocket and its light are twenty metres away and the puff is the grey of the night.
          const m = Math.min(5, Math.floor((s.smokeD += len) / 0.6));
          if (m > 0) {
            s.smokeD -= m * 0.6;
            for (let i = 0; i < m; i++) { const f = (i + 0.5) / m; if (wake.length < 160) wake.push([tx + lx * f, ty + ly * f, tz + lz * f, clock + 0.22]); }
          }
        }
        s.tail = [tx, ty, tz];
        s.lightT -= dt;
        if (s.lightT <= 0) { s.lightT = 0.07; safe(() => pooled().flash(P, 0xffa040, 30, 10, 0.1)); }
      }

      /* A shell leaves `origin` (the eye, as every round does) along `dir`. o: { kind, damage, from } where `from`
         is where the muzzle is, so it is drawn leaving the weapon. */
      this.fire = (origin, dir0, o = {}) => {
        const k = V.SHELLS[o.kind]; if (!k) return null;
        if (live.length >= self.MAX) retire(0);
        const d = Math.hypot(dir0.x, dir0.y, dir0.z) || 1, from = o.from || origin;
        const s = { kind: o.kind, k, damage: +o.damage || 0, x: origin.x, y: origin.y, z: origin.z, vx: (dir0.x / d) * k.speed, vy: (dir0.y / d) * k.speed, vz: (dir0.z / d) * k.speed, t: 0, dist: 0,
          ox: from.x - origin.x, oy: from.y - origin.y, oz: from.z - origin.z, smokeD: 0, lightT: 0, tail: null, v: visual(o.kind) };
        s.v.on = true; s.v.grp.visible = true;
        live.push(s); draw(s, 0);
        // what is left at the muzzle: the charge that threw the rocket clear, the cannon's smoke
        safe(() => g.fx.smoke(tmp.set(from.x, from.y, from.z), o.kind === 'rocket' ? { size: 1.1, life: 1.6, color: [0.5, 0.5, 0.52], count: 3, alpha: 0.32 } : { size: 0.7, life: 1.1, color: [0.38, 0.38, 0.4], count: 2, alpha: 0.28 }));
        return s;
      };
      this.update = (dt) => {
        if (!(dt > 0)) return;
        if (dt > 0.1) dt = 0.1;
        clock += dt;
        while (wake.length && wake[0][3] <= clock) { const q = wake.shift(); safe(() => g.fx.smoke(tmp.set(q[0], q[1], q[2]), { size: 1.0, life: 2.8, color: [0.7, 0.7, 0.72], count: 2, alpha: 0.85, rise: 0.2 })); }
        for (let i = live.length - 1; i >= 0; i--) {
          const s = live[i], k = s.k;
          let left = dt, fate = null;
          while (left > 1e-6 && !fate) {
            const h = Math.min(left, STEP); left -= h;
            a.set(s.x, s.y, s.z);
            const armed = s.dist >= k.arm;
            V.shellStep(s, k, h);
            b.set(s.x, s.y, s.z);
            const len = dir.subVectors(b, a).length();
            if (len < 1e-6) continue;
            dir.multiplyScalar(1 / len);
            const wall = g.physics && g.physics.raycast ? g.physics.raycast(a, dir, len) : null;
            const body = g.enemies && g.enemies.raycast ? g.enemies.raycast(a, dir, wall ? wall.dist : len) : null;
            fate = V.shellFate(len, wall ? wall.dist : Infinity, body ? body.dist : Infinity, armed && k.fuse > 0 ? passes(len, k.fuse) : -1, armed, s.t >= k.life);
            if (fate) {
              at.copy(a).addScaledVector(dir, fate.d);
              if (fate.why === 'wall' && wall.normal) at.addScaledVector(wall.normal, 0.15);          // clear of what it struck
              s.x = at.x; s.y = at.y; s.z = at.z;
            }
          }
          if (fate) { burst(s, fate.why); retire(i); }
          else if (s.y < -20 || Math.abs(s.x) > 400 || Math.abs(s.z) > 400) retire(i);
          else draw(s, dt);
        }
      };
      this.reset = () => { for (let i = live.length - 1; i >= 0; i--) retire(i); wake.length = 0; self.last = null; };
      this.count = () => live.length;
      this.list = () => live;
    },
  };
})();
