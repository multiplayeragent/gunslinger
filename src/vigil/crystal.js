/* The crystal the church was built around: a cluster of faceted shards on the nave dais, lit from inside.
   Its colour and steadiness report its health; when it breaks the lights go with it. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const PI = Math.PI;

  V.crystal = {
    create(g, ctx, lights, church) {
      const T = g.THREE, kit = V.kit, C = V.CRYSTAL, rng = kit.rng(1618);
      const group = new T.Group(); group.name = 'vigil-crystal'; group.position.set(C.x, 0, C.z); ctx.root.add(group);
      // a shard: six-sided prism with long points, built once in local space
      const shard = (r, h, tip) => {
        const body = new T.CylinderGeometry(r * 0.82, r, h, 6, 1, true), top = new T.ConeGeometry(r * 0.82, tip, 6, 1, true), bot = new T.ConeGeometry(r, tip * 0.6, 6, 1, true);
        top.translate(0, h / 2 + tip / 2, 0); bot.rotateX(PI); bot.translate(0, -h / 2 - tip * 0.3, 0);
        return kit.merge([body.toNonIndexed(), top.toNonIndexed(), bot.toNonIndexed()]);
      };
      const shell = new T.MeshStandardMaterial({ color: 0x9fe6ff, emissive: 0x2fb4ff, emissiveIntensity: 1.5, roughness: 0.1, metalness: 0, flatShading: true, transparent: true, opacity: 0.72, depthWrite: true });
      const core = new T.MeshBasicMaterial({ color: new T.Color(1.4, 3.2, 4.2), fog: false });
      const shards = new T.Group(); group.add(shards);
      const parts = [], cores = [];
      const add = (r, h, tip, p, rot) => {
        const gs = shard(r, h, tip), gc = shard(r * 0.42, h * 0.8, tip * 0.7);
        for (const geo of [gs, gc]) { geo.applyMatrix4(new T.Matrix4().compose(new T.Vector3(p[0], p[1], p[2]), new T.Quaternion().setFromEuler(new T.Euler(rot[0], rot[1], rot[2])), new T.Vector3(1, 1, 1))); }
        gs.computeVertexNormals();
        parts.push(gs); cores.push(gc);
      };
      add(0.3, 0.95, 0.55, [0, C.y + 0.05, 0], [0, 0.3, 0.04]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2 + rng() * 0.5, lean = 0.42 + rng() * 0.3, s = 0.5 + rng() * 0.35;
        add(0.15 * s + 0.05, 0.5 * s + 0.2, 0.3 * s + 0.1, [Math.cos(a) * 0.3, C.y - 0.42 + rng() * 0.2, Math.sin(a) * 0.3], [Math.sin(a) * lean, a, -Math.cos(a) * lean]);
      }
      const shellMesh = new T.Mesh(kit.merge(parts), shell), coreMesh = new T.Mesh(kit.merge(cores), core);
      shellMesh.castShadow = false; coreMesh.castShadow = false; coreMesh.renderOrder = 1; shellMesh.renderOrder = 2;
      shards.add(coreMesh, shellMesh);

      // glow, rising beams, drifting motes
      const glow = new T.Sprite(new T.SpriteMaterial({ map: V.glowTexture, color: 0x4fbfff, blending: T.AdditiveBlending, transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
      glow.position.set(0, C.y, 0); glow.scale.setScalar(5.5); glow.renderOrder = 6; group.add(glow);
      const beamTex = (() => {
        const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d');
        const gr = x.createLinearGradient(0, 256, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = gr; x.fillRect(0, 0, 64, 256);
        const g2 = x.createLinearGradient(0, 0, 64, 0); g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.5, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)');
        x.globalCompositeOperation = 'destination-out'; x.fillStyle = g2; x.fillRect(0, 0, 64, 256);
        const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
      })();
      const beamMat = new T.MeshBasicMaterial({ map: beamTex, color: 0x58c8ff, blending: T.AdditiveBlending, transparent: true, opacity: 0.2, depthWrite: false, side: T.DoubleSide, fog: false });
      const beams = new T.Group();
      for (let i = 0; i < 3; i++) { const b = new T.Mesh(new T.PlaneGeometry(1.5, 6.5), beamMat); b.position.y = C.y + 2.7; b.rotation.y = (i / 3) * PI; b.renderOrder = 6; beams.add(b); }
      group.add(beams);
      const MOTES = 70, mp = new Float32Array(MOTES * 3), ms = [];
      for (let i = 0; i < MOTES; i++) ms.push({ a: rng() * PI * 2, r: 0.5 + rng() * 2.2, y: 0.5 + rng() * 4.2, w: (0.15 + rng() * 0.4) * (rng() < 0.5 ? -1 : 1), v: 0.08 + rng() * 0.22 });
      const mg = new T.BufferGeometry(); mg.setAttribute('position', new T.BufferAttribute(mp, 3));
      const motes = new T.Points(mg, new T.PointsMaterial({ map: V.glowTexture, color: 0x8fe0ff, size: 0.09, blending: T.AdditiveBlending, transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true, fog: false }));
      motes.frustumCulled = false; motes.renderOrder = 6; group.add(motes);
      // rune ring cut into the top step
      const runeMat = new T.MeshBasicMaterial({ color: new T.Color(0.4, 1.6, 2.4), fog: false });
      const runes = [];
      const ring = new T.Mesh(new T.RingGeometry(0.88, 0.92, 48).rotateX(-PI / 2), runeMat); ring.position.y = 0.665; group.add(ring);
      const ring2 = new T.Mesh(new T.RingGeometry(1.42, 1.45, 56).rotateX(-PI / 2), runeMat); ring2.position.y = 0.525; group.add(ring2);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * PI * 2, parts2 = [];
        for (let k = 0; k < 3; k++) { const q = new T.PlaneGeometry(0.02, 0.06 + rng() * 0.09).toNonIndexed(); q.rotateZ((rng() - 0.5) * 2.2); q.translate((k - 1) * 0.05, 0, 0); parts2.push(q); }
        const m = new T.Mesh(kit.merge(parts2).rotateX(-PI / 2), runeMat);
        m.position.set(Math.cos(a) * 1.28, 0.526, Math.sin(a) * 1.28); m.rotation.y = -a + PI / 2; group.add(m); runes.push(m);
      }
      const shield = new T.Mesh(new T.SphereGeometry(2.5, 36, 22), new T.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.14, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
      shield.position.set(0, 1.9, 0); shield.visible = false; shield.renderOrder = 7; group.add(shield);

      const state = { frac: 1, pulse: 0, shielded: false, broken: false, t: 0 };
      const cool = new T.Color(0x2fb4ff), hot = new T.Color(1.0, 0.16, 0.08), tmpC = new T.Color(), stainedBase = church.stained ? church.stained.emissiveIntensity : 0;
      let hum = null;
      const api = {
        group, state,
        setHealth(f) { state.frac = Math.max(0, Math.min(1, f)); },
        hit(k = 1) { state.pulse = Math.min(1.5, state.pulse + 0.5 * k); },
        setShield(on) { state.shielded = !!on; },
        shatter() {
          if (state.broken) return;
          state.broken = true; shards.visible = false; beams.visible = false; motes.visible = false; glow.visible = false; shield.visible = false;
          const p = new T.Vector3(C.x, C.y, C.z);
          try { g.fx.explosion(p, 1.4); g.fx.debris(p, { color: [0.5, 1.2, 1.6], size: 0.09, speed: 9, count: 36, spread: 2 }); } catch (e) { /* optional */ }
          g.events.emit('explosion', { pos: p, size: 1.6 });
        },
        reset() {
          state.frac = 1; state.pulse = 0; state.shielded = false; state.broken = false;
          shards.visible = beams.visible = motes.visible = glow.visible = true; shield.visible = false;
        },
        update(dt) {
          state.t += dt; const t = state.t, f = state.frac;
          if (!hum && V.audio && g.audio && g.audio.loop) { hum = V.audio.loop('crystal_hum', { pos: [C.x, C.y, C.z], gain: 0.8 }); }
          state.pulse = Math.max(0, state.pulse - dt * 3);
          const flick = f < 0.3 ? 0.72 + 0.28 * Math.sin(t * 17) * Math.sin(t * 5.3) : 1, alive = state.broken ? 0 : 1;
          const k = (0.35 + 0.65 * f) * flick * alive, hurt = Math.min(1, (1 - f) * 0.85 + state.pulse * 0.7);
          tmpC.copy(cool).lerp(hot, hurt);
          shards.rotation.y += dt * 0.3; shards.position.y = Math.sin(t * 1.3) * 0.06;
          shell.emissive.copy(tmpC); shell.emissiveIntensity = 1.5 * k + state.pulse * 1.5;
          core.color.setRGB(1.2 + 2.6 * hurt, 3.0 * (1 - hurt * 0.75), 4.0 * (1 - hurt * 0.8)).multiplyScalar(0.4 + 0.6 * k);
          glow.material.color.copy(tmpC); glow.material.opacity = (0.5 * k + state.pulse * 0.3); glow.scale.setScalar(5.5 + state.pulse * 2);
          beamMat.color.copy(tmpC); beamMat.opacity = 0.2 * k; beams.rotation.y += dt * 0.12;
          runeMat.color.copy(tmpC).multiplyScalar((1.6 + 1.2 * Math.sin(t * 1.7)) * k + state.pulse * 3);
          if (lights && lights.crystal) { lights.crystal.color.copy(tmpC).lerp(new T.Color(1, 1, 1), 0.25); lights.crystal.intensity = (26 * k + Math.sin(t * 2.1) * 2.5 * alive) * (state.shielded ? 1.5 : 1) + state.pulse * 22 * alive; }
          if (church.stained) { church.stained.emissive.copy(tmpC); church.stained.emissiveIntensity = stainedBase * (0.25 + 0.75 * k); }
          const pa = mg.attributes.position;
          for (let i = 0; i < MOTES; i++) {
            const m = ms[i]; m.a += m.w * dt; m.y += m.v * dt; if (m.y > 5) m.y = 0.5;
            pa.setXYZ(i, Math.cos(m.a) * m.r, m.y, Math.sin(m.a) * m.r);
          }
          pa.needsUpdate = true;
          shield.visible = state.shielded && !state.broken;
          if (shield.visible) { shield.rotation.y += dt; shield.material.opacity = 0.13 + 0.06 * Math.sin(t * 8); }
          if (hum && hum.setGain) hum.setGain(0.8 * k);
        },
      };
      return api;
    },
  };
})();
