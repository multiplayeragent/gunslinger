/* The storm over the churchyard: forked lightning beyond the trees, and the thunder that follows it.

   A strike is a bolt drawn in the sky (a jagged channel with branches, a few hundred metres off), the flash
   it throws (the engine's sheet lightning in the clouds, turned to face the bolt, and ground.js's flare of
   the moonlight), and thunder after a wait that grows with the distance: all three come from one `thunder`
   event. Strikes come every few seconds on the title screen, less often in play, more often while an
   abomination walks, and one answers its arrival. The engine's own rain still adds a sheet flash of its own
   now and then, with no bolt.

   Nothing here adds a light or a material variant to the level: the bolt is one unlit additive mesh, rebuilt
   in place for each strike. With "reduce motion" set, a strike does not flicker and comes less often. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const rand = (a, b) => a + Math.random() * (b - a);

  // How long until the next strike, in seconds, for where the game stands.
  V.stormGap = function (state, boss, calm, r = Math.random()) {
    const span = state === 'title' ? [6.5, 13] : state === 'playing' || state === 'intro' ? (boss ? [7, 14] : [15, 34]) : state === 'paused' ? null : [10, 20];
    if (!span) return Infinity;                                    // nothing strikes behind the pause screen
    return (span[0] + (span[1] - span[0]) * r) * (calm ? 2.2 : 1);
  };
  // How bright the bolt is `t` seconds into a strike that lasts `life`: two strokes and an afterglow, or one
  // plain fade when flicker is unwelcome.
  V.stormFlicker = function (t, life, calm) {
    if (t < 0 || t >= life) return 0;
    const q = t / life;
    if (calm) return (1 - q) * (1 - q) * 0.7;
    return q < 0.14 ? 1 : q < 0.26 ? 0.06 : q < 0.5 ? 0.78 : Math.max(0, 1 - q) * 0.9;
  };
  // A jagged line from a to b in the plane of `side` and up: midpoint displacement, `n` a power of two.
  V.stormPath = function (a, b, side, n, sway, rng = Math.random) {
    const off = new Float32Array(n + 1);
    for (let step = n, amp = sway; step > 1; step >>= 1, amp *= 0.56) {
      for (let i = step >> 1; i < n; i += step) off[i] = (off[i - (step >> 1)] + off[i + (step >> 1)]) / 2 + (rng() * 2 - 1) * amp;
    }
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, o = off[i];
      pts.push([a[0] + (b[0] - a[0]) * t + side[0] * o, a[1] + (b[1] - a[1]) * t + (rng() * 2 - 1) * sway * 0.08, a[2] + (b[2] - a[2]) * t + side[2] * o]);
    }
    return pts;
  };

  V.storm = {
    install(g) {
      const T = g.THREE, self = this;
      const calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      // one mesh, enough room for a channel, its glow and five branches
      const MAXV = 1400, pos = new Float32Array(MAXV * 3), col = new Float32Array(MAXV * 3), idx = new Uint16Array(MAXV * 3);
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage));
      geo.setAttribute('color', new T.BufferAttribute(col, 3).setUsage(T.DynamicDrawUsage));
      geo.setIndex(new T.BufferAttribute(idx, 1).setUsage(T.DynamicDrawUsage));
      const mat = new T.MeshBasicMaterial({ color: 0x000000, vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide, toneMapped: false });
      mat.name = 'vigil_lightning';
      const mesh = new T.Mesh(geo, mat);
      mesh.name = 'lightning'; mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 5; mesh.castShadow = false; mesh.receiveShadow = false;
      g.scene.add(mesh);

      let nv = 0, ni = 0;
      // a ribbon along a path: width w at its head tapering to w * taper, every vertex tinted by `shade`
      function ribbon(pts, side, w, taper, shade) {
        if (nv + pts.length * 2 > MAXV) return;
        const base = nv;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
          // across the channel: in the plane of side and up, at right angles to the way it runs
          let tx = (b[0] - a[0]) * side[0] + (b[2] - a[2]) * side[2], ty = b[1] - a[1];
          const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
          const h = (w * (1 + (taper - 1) * (i / (pts.length - 1)))) / 2, nx = -ty * h, ny = tx * h;
          for (const s of [-1, 1]) {
            pos[nv * 3] = p[0] + side[0] * nx * s; pos[nv * 3 + 1] = p[1] + ny * s; pos[nv * 3 + 2] = p[2] + side[2] * nx * s;
            col[nv * 3] = 0.72 * shade; col[nv * 3 + 1] = 0.82 * shade; col[nv * 3 + 2] = shade;
            nv++;
          }
          if (i) { const k = base + (i - 1) * 2; idx[ni++] = k; idx[ni++] = k + 1; idx[ni++] = k + 2; idx[ni++] = k + 1; idx[ni++] = k + 3; idx[ni++] = k + 2; }
        }
      }
      function build(at, dist) {
        nv = 0; ni = 0;
        const dx = at[0] / (Math.hypot(at[0], at[2]) || 1), dz = at[2] / (Math.hypot(at[0], at[2]) || 1), side = [-dz, 0, dx];     // seen from the church, left to right
        // it comes down from well up the sky: the trees and the church hide the lower third of anything out there
        const top = [at[0] + side[0] * rand(-0.14, 0.14) * dist, rand(0.9, 1.25) * dist, at[2] + side[2] * rand(-0.14, 0.14) * dist];
        const foot = [at[0], -4, at[2]], w = dist * 0.006;
        const main = V.stormPath(top, foot, side, 32, dist * 0.085);
        ribbon(main, side, w * 30, 0.8, 0.022);                     // the air lit round it
        ribbon(main, side, w * 9, 0.7, 0.1);                        // the glow of the channel
        ribbon(main, side, w, 0.55, 1);
        const forks = 2 + Math.floor(Math.random() * 3);
        for (let k = 0; k < forks; k++) {
          const i = 4 + Math.floor(Math.random() * 20), from = main[i], len = rand(0.16, 0.36) * dist, lean = rand(0.35, 0.95) * (Math.random() < 0.5 ? -1 : 1);
          const to = [from[0] + side[0] * lean * len, Math.max(-4, from[1] - len * rand(0.55, 0.95)), from[2] + side[2] * lean * len];
          const fork = V.stormPath(from, to, side, 16, len * 0.1);
          ribbon(fork, side, w * 4, 0.4, 0.035);
          ribbon(fork, side, w * 0.55, 0.25, 0.5);
        }
        geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.index.needsUpdate = true;
        geo.setDrawRange(0, ni);
      }

      const fwd = new T.Vector3();
      let wait = 2.4, age = 99, life = 0.5, power = 0, count = 0, last = null;
      // opts.near: close by (the abomination's entrance); opts.ahead: in front of the camera whatever the state
      this.strike = (opts = {}) => {
        const cam = g.camera, state = g.game.state;
        cam.getWorldDirection(fwd);
        const facing = Math.atan2(fwd.z, fwd.x), ahead = opts.ahead || state === 'title' || Math.random() < 0.65;
        const a = facing + (ahead ? rand(-0.5, 0.5) : rand(-Math.PI, Math.PI));
        const far = Math.min(700, (cam.far || 1200) * 0.45), dist = opts.near ? rand(170, 260) : Math.min(far, rand(240, 620));
        const at = [cam.position.x + Math.cos(a) * dist, 0, cam.position.z + Math.sin(a) * dist];
        build(at, dist);
        power = calm ? 0.3 : Math.max(0.35, Math.min(1, 1.2 - dist / 620));
        life = calm ? 0.9 : rand(0.42, 0.6); age = 0; count++;
        last = { dist: Math.round(dist), bearing: +a.toFixed(2), power: +power.toFixed(2), vertices: nv };
        // the flash and the thunder: the engine lights its clouds and sounds it after a wait that grows as this falls
        g.events.emit('thunder', { intensity: power, bolt: true });
        try { const u = g.render.sky.material.uniforms; if (u && u.uFlashDir) u.uFlashDir.value.set(Math.cos(a), 0.42, Math.sin(a)).normalize(); } catch (e) { /* no sky to turn */ }
        return last;
      };
      this.update = (dt) => {
        if (age < life) {
          age += dt;
          const k = V.stormFlicker(age, life, calm) * (0.55 + 0.45 * power);
          mesh.visible = k > 0.01;
          mat.color.setRGB(5 * k, 5 * k, 5 * k);
        } else if (mesh.visible) mesh.visible = false;
        const state = g.game.state;
        if (state === 'paused') return;
        wait -= dt;
        if (wait <= 0) {
          let boss = false;
          if (g.enemies && g.enemies.list) for (const z of g.enemies.list) if (z.alive && z.type === 'boss' && z.state !== 2 && !z.roam) { boss = true; break; }
          self.strike();
          wait = V.stormGap(state, boss, calm);
        }
      };
      this.debug = () => ({ strikes: count, visible: mesh.visible, next: +wait.toFixed(1), last, calm });
    },
    update() {},
    strike() { return null; },
    debug() { return { strikes: 0 }; },
  };
})();
