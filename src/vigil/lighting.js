/* Night lighting for the churchyard. Every flame is an "emitter" (candles, chandeliers, lanterns, flares), but
   only a handful of real point lights exist: they are handed to the emitters that matter most to the camera
   and cross-fade when they move on. Adding a light to a scene recompiles every material, and each extra light
   makes every shader slower to compile, so the count is fixed at boot and kept small. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});

  function glowTexture(T) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    return t;
  }

  V.lighting = {
    SLOTS: 4,
    create(g, ctx, church, yard) {
      const T = g.THREE, kit = V.kit, root = new T.Group();
      root.name = 'vigil-lights'; ctx.root.add(root);
      const glow = (V.glowTexture = glowTexture(T));
      const VIEW = 1;                         // the weapon's render layer: lights must reach the hands too

      // ---- emitters ----
      const emitters = [];
      const addEmitter = (L) => {
        const e = {
          pos: L.pos.isVector3 ? L.pos : new T.Vector3(L.pos[0], L.pos[1], L.pos[2]),
          color: new T.Color(L.color), intensity: L.intensity, dist: L.dist || 12, flicker: L.flicker || 0,
          seed: Math.random() * 100, on: L.on == null ? 1 : L.on, weight: L.weight || 1, key: L.key || null, slot: null,
        };
        emitters.push(e);
        return e;
      };
      const removeEmitter = (e) => { const i = emitters.indexOf(e); if (i >= 0) emitters.splice(i, 1); e.on = 0; e.dead = true; };
      for (const L of [...church.lights, ...((yard && yard.lights) || [])]) addEmitter(L);

      const slots = [];
      for (let i = 0; i < V.lighting.SLOTS; i++) {
        const light = new T.PointLight(0xffa858, 0, 12, 2);
        light.layers.enable(VIEW); light.castShadow = false;
        root.add(light);
        slots.push({ light, em: null, k: 0 });
      }

      // ---- flames: one instanced teardrop ----
      const flames = [...church.flames, ...((yard && yard.flames) || [])];
      const fg = kit.lathe([[0.001, 0], [0.014, 0.012], [0.02, 0.035], [0.014, 0.07], [0.004, 0.105], [0.001, 0.12]], 6);
      const fm = new T.InstancedMesh(fg, ctx.mats.get('flame'), Math.max(1, flames.length));
      fm.name = 'vigil-flames'; fm.castShadow = false; fm.receiveShadow = false; fm.frustumCulled = false;
      fm.instanceMatrix.setUsage(T.DynamicDrawUsage);
      const M = new T.Matrix4(), Q = new T.Quaternion(), P = new T.Vector3(), S = new T.Vector3();
      root.add(fm);

      // ---- halos: the glow a flame leaves in wet air, and the pool it throws on the ground ----
      const haloMat = new T.SpriteMaterial({ map: glow, color: new T.Color(1.0, 0.62, 0.28), blending: T.AdditiveBlending, transparent: true, opacity: 0.2, depthWrite: false, fog: false });
      const poolMat = new T.MeshBasicMaterial({ map: glow, color: new T.Color(0.5, 0.27, 0.1), blending: T.AdditiveBlending, transparent: true, opacity: 0.5, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const poolGeo = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      const halos = [];
      for (const h of [...church.halos, ...((yard && yard.halos) || [])]) {
        const s = new T.Sprite(haloMat);
        s.position.set(h[0], h[1], h[2]); s.scale.setScalar(h[3]);
        s.renderOrder = 5; root.add(s); halos.push(s);
        if (h[4]) {
          const p = new T.Mesh(poolGeo, poolMat);
          p.position.set(h[0], h[5] == null ? 0.03 : h[5], h[2]); p.scale.setScalar(h[4]); p.renderOrder = 4;
          root.add(p);
        }
      }

      // ---- the crystal's own light ----
      const C = V.CRYSTAL;
      const crystal = new T.PointLight(0x74d2ff, 26, 20, 2);
      crystal.position.set(C.x, C.y + 0.35, C.z);
      crystal.layers.enable(VIEW);
      root.add(crystal);

      // ---- flashlight and one floodlight beam: spots that are re-aimed, never created ----
      const mkSpot = (color, dist, angle) => {
        const s = new T.SpotLight(color, 0, dist, angle, 0.55, 1.5);
        s.layers.enable(VIEW); s.castShadow = false;
        root.add(s, s.target);
        return s;
      };
      const torch = mkSpot(0xdfe9ff, 36, 0.38);
      const flood = mkSpot(0xfff0d0, 32, 0.66);
      const floods = [];                       // { pos, dir, on } registered by placed floodlights

      let t = 0, pick = 0;
      const cam = g.camera.position, order = [];
      const score = (e) => (e.on <= 0 ? -1 : (e.intensity * e.weight) / (6 + cam.distanceToSquared(e.pos) / Math.max(4, e.dist)));
      const api = {
        root, emitters, slots, crystal, torch, flood, floods, halos, haloMat, glow,
        addEmitter, removeEmitter,
        dim: 1,                                 // multiplier on every flame (scripted flicker)
        update(dt) {
          t += dt;
          // reassign slots a few times a second
          pick -= dt;
          if (pick <= 0) {
            pick = 0.2;
            order.length = 0;
            for (const e of emitters) { e._s = score(e); if (e._s > 0) order.push(e); }
            order.sort((a, b) => b._s - a._s);
            const want = order.slice(0, slots.length);
            for (const s of slots) if (s.em && (s.em.dead || !want.includes(s.em))) s.drop = true; else s.drop = false;
            for (const e of want) {
              if (slots.some((s) => s.em === e)) continue;
              const free = slots.find((s) => !s.em) || null;
              if (free) { free.em = e; free.k = 0; free.drop = false; }
            }
          }
          for (const s of slots) {
            const e = s.em;
            if (!e) { s.light.intensity = 0; continue; }
            s.k = Math.max(0, Math.min(1, s.k + (s.drop ? -dt * 3.5 : dt * 3.5)));
            if (s.drop && s.k <= 0) { s.em = null; s.light.intensity = 0; pick = 0; continue; }
            const n = e.flicker ? 1 - e.flicker + e.flicker * (0.5 + 0.5 * Math.sin(t * 9.1 + e.seed) * Math.sin(t * 3.7 + e.seed * 2.3) + 0.25 * Math.sin(t * 23 + e.seed * 5)) : 1;
            s.light.position.copy(e.pos); s.light.color.copy(e.color); s.light.distance = e.dist;
            s.light.intensity = e.intensity * n * e.on * s.k * api.dim;
          }
          // the one real floodlight beam goes to the nearest lit floodlight
          let best = null, bd = 1e9;
          for (const f of floods) { if (!f.on) continue; const d = cam.distanceToSquared(f.pos); if (d < bd) { bd = d; best = f; } }
          if (best) {
            flood.position.copy(best.pos); flood.target.position.copy(best.pos).add(best.dir);
            flood.intensity += (best.intensity - flood.intensity) * Math.min(1, dt * 6);
          } else flood.intensity = 0;
          for (let i = 0; i < flames.length; i++) {
            const f = flames[i], k = f[3] || 1;
            const w = 0.85 + 0.15 * Math.sin(t * 13 + i * 2.7), sway = Math.sin(t * 7.3 + i * 1.9) * 0.12;
            P.set(f[0], f[1] - 0.06 * k, f[2]); Q.setFromAxisAngle(S.set(1, 0, 0), sway); S.set(k * (1.1 - 0.2 * w), k * w * 1.25, k * (1.1 - 0.2 * w));
            M.compose(P, Q, S); fm.setMatrixAt(i, M);
          }
          fm.count = flames.length; fm.instanceMatrix.needsUpdate = true;
          haloMat.opacity = (0.17 + 0.03 * Math.sin(t * 5.1)) * api.dim;
        },
      };
      api.update(0);
      return api;
    },
  };
})();
