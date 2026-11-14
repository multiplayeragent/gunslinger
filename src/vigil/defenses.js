/* Things the player buys and places: rifleman guards, sentry turrets and floodlights; plus what is thrown or
   dropped: grenades, flares and proximity mines. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const PI = Math.PI;
  const rand = (a, b) => a + Math.random() * (b - a);
  const wrap = (a) => ((a + PI) % (PI * 2) + PI * 2) % (PI * 2) - PI;
  const turnToward = (a, b, step) => { const d = wrap(b - a); return Math.abs(d) <= step ? b : a + Math.sign(d) * step; };

  V.DEF = {
    guard: { name: 'Rifleman Guard', hp: 220, range: 26, dmg: 22, r: 0.4, max: 6 },
    turret: { name: 'Sentry Turret', hp: 320, range: 22, dmg: 9, interval: 0.12, r: 0.55, max: 6 },
    floodlight: { name: 'Floodlight', max: 3, r: 0.3 },
  };

  V.defenses = {
    install(g, S) {
      const self = this, T = g.THREE, kit = V.kit, mats = V.materials, DEF = V.DEF, lights = V.world.lights, p = g.player;
      const root = new T.Group(); root.name = 'vigil-defenses'; g.scene.add(root);
      const guards = [], turrets = [], floods = [], mines = [], flares = [], thrown = [], queue = [];
      const tmp = new T.Vector3(), tmp2 = new T.Vector3(), up = new T.Vector3(0, 1, 0);
      // playing together: the host's machine aims and fires every guard and turret; the others show where they stand
      let remote = false, nidSeq = 0;
      const NET = () => (V.net && V.net.online ? V.net : null);
      const r2 = (v) => Math.round(v * 100) / 100;
      const group = (parts) => {
        // parts: [materialKey, geometry] merged per material into one small group
        const by = new Map(), gr = new T.Group();
        for (const [key, geo] of parts) { if (!by.has(key)) by.set(key, []); by.get(key).push(geo.index ? geo.toNonIndexed() : geo); }
        for (const [key, list] of by) {
          for (const q of list) { if (!q.attributes.uv) kit.boxUV(q); if (!q.attributes.normal) q.computeVertexNormals(); }
          const m = new T.Mesh(kit.merge(list), typeof key === 'string' ? mats.get(key) : key);
          m.castShadow = !(m.material.isMeshBasicMaterial); m.receiveShadow = true; gr.add(m);
        }
        return gr;
      };
      const P = (geo, p3, r3) => kit.xf(geo, { p: p3, r: r3 });
      const lamp = new T.MeshBasicMaterial({ color: new T.Color(6, 5.6, 4.6), fog: false });
      const led = new T.MeshBasicMaterial({ color: new T.Color(0.3, 2.6, 0.6), fog: false });
      const red = new T.MeshBasicMaterial({ color: new T.Color(3.2, 0.25, 0.15), fog: false });
      const flareMat = new T.MeshBasicMaterial({ color: new T.Color(6, 0.9, 0.5), fog: false });

      // ---- models ----
      const rifleParts = () => [
        ['gunmetal', P(kit.bevelBox(0.045, 0.075, 0.44, 0.008), [0, 0, 0])], ['gunmetal', P(kit.cyl(0.011, 0.011, 0.36, 8), [0, 0.012, 0.2], [PI / 2, 0, 0])],
        ['olive', P(kit.bevelBox(0.04, 0.1, 0.2, 0.01), [0, -0.015, -0.3])], ['gunmetal', P(kit.bevelBox(0.032, 0.15, 0.06, 0.006), [0, -0.1, 0.02], [0.2, 0, 0])],
        ['olive', P(kit.bevelBox(0.034, 0.1, 0.045, 0.006), [0, -0.085, -0.1], [-0.3, 0, 0])], ['gunmetal', P(kit.bevelBox(0.03, 0.04, 0.09, 0.005), [0, 0.06, -0.02])],
        ['olive', P(kit.bevelBox(0.05, 0.05, 0.2, 0.008), [0, -0.005, 0.2])],
      ];
      // the watchman: the same kind of painted body as the dead, alive and armed
      const guardGeo = V.figure.build(T, kit, 'guard').geo;
      const guardMap = new T.TextureLoader().load('assets/zombies/guard.webp'); guardMap.colorSpace = T.SRGBColorSpace;
      const guardMat = new T.MeshStandardMaterial({ map: guardMap, bumpMap: guardMap, bumpScale: 1.6, roughness: 0.7, metalness: 0, alphaTest: 0.5, side: T.DoubleSide });
      guardMat.name = 'vg_guard'; guardMat.color.setScalar(2.3);
      self.kitbag = { guardGeo, guardMat, rifle: () => group(rifleParts()) };          // the other players wear the same body
      function makeGuard() {
        const { mesh, bones } = V.figure.rig(T, guardGeo, guardMat), B = {}; for (const k in V.figure.BI) B[k] = bones[V.figure.BI[k]];
        const rifle = group(rifleParts()); rifle.position.set(-0.11, 0.1, 0.36); B.chest.add(rifle);
        // shouldered rifle, feet apart
        B.uaR.rotation.set(-1.12, 0, 0.32); B.faR.rotation.set(-1.25, 0, 0.5); B.uaL.rotation.set(-1.35, 0, -0.42); B.faL.rotation.set(-0.5, 0, 0);
        B.thL.rotation.set(-0.12, 0, 0.1); B.thR.rotation.set(0.14, 0, -0.1); B.shR.rotation.x = 0.1; B.chest.rotation.y = -0.22; B.spine.rotation.x = 0.06; B.head.rotation.y = 0.2; B.jaw.rotation.x = 0;
        root.add(mesh);
        return { kind: 'guard', mesh, bones: B, rifle, pos: new T.Vector3(), yaw: 0, hp: DEF.guard.hp, maxHp: DEF.guard.hp, r: DEF.guard.r, alive: true, tgt: null, scanT: rand(0, 0.3), shotT: 0.5, burst: 0, deadT: 0, damage(n) { hurt(this, n); } };
      }
      function makeTurret() {
        const base = group([
          ['gunmetal', kit.rod([0, 0.55, 0], [0.48, 0, 0], 0.022, 0.022, 6)], ['gunmetal', kit.rod([0, 0.55, 0], [-0.24, 0, 0.42], 0.022, 0.022, 6)], ['gunmetal', kit.rod([0, 0.55, 0], [-0.24, 0, -0.42], 0.022, 0.022, 6)],
          ['gunmetal', P(kit.cyl(0.055, 0.075, 0.3, 10), [0, 0.5, 0])], ['olive', P(kit.cyl(0.11, 0.11, 0.04, 12), [0, 0.8, 0])],
        ]);
        const head = group([
          ['olive', P(kit.bevelBox(0.26, 0.2, 0.46, 0.02), [0, 0.06, 0.02])], ['olive', P(kit.bevelBox(0.17, 0.2, 0.22, 0.015), [-0.21, 0.02, -0.02])],
          ['gunmetal', P(kit.cyl(0.026, 0.026, 0.52, 10), [0, 0.07, 0.24], [PI / 2, 0, 0])], ['gunmetal', P(kit.cyl(0.042, 0.042, 0.11, 10), [0, 0.07, 0.72], [PI / 2, 0, 0])],
          ['gunmetal', P(kit.bevelBox(0.07, 0.07, 0.3, 0.008), [0, 0.07, 0.36])], ['gunmetal', P(kit.bevelBox(0.05, 0.06, 0.1, 0.006), [0, 0.2, -0.05])],
          [led, P(kit.sphere(0.022, 6, 5), [0.1, 0.17, -0.18])],
        ]);
        head.position.y = 0.86;
        const gr = new T.Group(); gr.add(base, head); root.add(gr);
        return { kind: 'turret', mesh: gr, head, pos: new T.Vector3(), yaw: 0, hp: DEF.turret.hp, maxHp: DEF.turret.hp, r: DEF.turret.r, alive: true, tgt: null, scanT: rand(0, 0.3), fireT: 0, deadT: 0, damage(n) { hurt(this, n); } };
      }
      function makeFlood() {
        const gr = group([
          ['gunmetal', kit.rod([0, 1.0, 0], [0.5, 0, 0], 0.022, 0.022, 6)], ['gunmetal', kit.rod([0, 1.0, 0], [-0.25, 0, 0.43], 0.022, 0.022, 6)], ['gunmetal', kit.rod([0, 1.0, 0], [-0.25, 0, -0.43], 0.022, 0.022, 6)],
          ['gunmetal', P(kit.cyl(0.028, 0.034, 1.5, 8), [0, 0.9, 0])], ['olive', P(kit.bevelBox(0.5, 0.06, 0.06, 0.01), [0, 2.38, 0])],
          ['olive', P(kit.bevelBox(0.22, 0.2, 0.14, 0.015), [-0.14, 2.5, 0.02], [0.35, 0, 0])], ['olive', P(kit.bevelBox(0.22, 0.2, 0.14, 0.015), [0.14, 2.5, 0.02], [0.35, 0, 0])],
          [lamp, P(kit.box(0.19, 0.17, 0.01), [-0.14, 2.475, 0.092], [0.35, 0, 0])], [lamp, P(kit.box(0.19, 0.17, 0.01), [0.14, 2.475, 0.092], [0.35, 0, 0])],
        ]);
        root.add(gr);
        const halo = new T.Sprite(new T.SpriteMaterial({ map: V.glowTexture, color: new T.Color(1, 0.95, 0.8), blending: T.AdditiveBlending, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
        halo.scale.setScalar(2.4); halo.position.set(0, 2.5, 0.12); gr.add(halo);
        return { kind: 'floodlight', mesh: gr, pos: new T.Vector3(), yaw: 0, alive: true, r: DEF.floodlight.r, flood: { pos: new T.Vector3(), dir: new T.Vector3(), on: true, intensity: 260 } };
      }
      const mineGeo = () => group([['olive', P(kit.cyl(0.13, 0.15, 0.05, 12), [0, 0, 0])], ['gunmetal', P(kit.cyl(0.04, 0.04, 0.03, 8), [0, 0.05, 0])], [red, P(kit.sphere(0.014, 6, 5), [0, 0.085, 0])]]);
      const nadeGeo = () => group([['olive', P(kit.sphere(0.055, 10, 8), [0, 0, 0])], ['gunmetal', P(kit.cyl(0.018, 0.018, 0.04, 6), [0, 0.05, 0])]]);
      const flareGeo = () => group([[flareMat, P(kit.cyl(0.014, 0.014, 0.22, 6), [0, 0, 0], [0, 0, PI / 2])]]);

      // ---- shared ----
      function hurt(o, n) {
        if (!o.alive) return;
        o.hp -= n;
        if (o.hp <= 0) {
          o.alive = false; o.deadT = 0;
          tmp.copy(o.pos).setY(o.pos.y + 0.8);
          try { if (o.kind === 'turret') { g.fx.sparks(tmp, up, 18); g.fx.smoke(tmp, { size: 1, life: 2.5, count: 4 }); } else g.fx.dust(tmp, up, 1, 0.3, 0.02, 0.02); } catch (e) { /* optional */ }
          if (V.ui) V.ui.toast(o.kind === 'guard' ? 'A guard has fallen' : 'A turret was destroyed');
        }
      }
      function shoot(o, from, tgt, dmg) {
        const s = tgt.scale || 1, head = Math.random() < 0.12;
        tmp2.set(tgt.pos.x + rand(-0.12, 0.12), tgt.pos.y + (head ? 1.62 : rand(0.8, 1.35)) * s, tgt.pos.z + rand(-0.12, 0.12));
        const dir = tmp2.clone().sub(from).normalize();
        try { if (g.fx.tracer) g.fx.tracer(from, tmp2); if (g.render.lightPool) g.render.lightPool.flash(from, 0xffc070, 26, 8, 0.05); } catch (e) { /* optional */ }
        V.audio.play('vg_shot', { pos: from, gain: o.kind === 'turret' ? 0.5 : 0.75 });
        tgt.damage(dmg * (head ? 2 : 1), tmp2.clone(), dir, head ? 'weak' : 'body', { by: 'defense', owner: o.owner });
        const n = NET(); if (n) n.defenseShot(from, tmp2, o.kind === 'turret');
      }
      const Z = () => g.enemies;

      // ---- placement ----
      let ghost = null, ghostOk = false, ghostMat = null;
      const count = (kind) => (kind === 'guard' ? guards : kind === 'turret' ? turrets : floods).filter((o) => o.alive).length;
      const pending = (kind) => queue.filter((q) => q.kind === kind).length;
      function beginPlace(kind, price) { queue.push({ kind, price }); }
      function nextGhost() {
        if (ghost) { root.remove(ghost.mesh); if (ghost.kind === 'guard') ghost.mesh.visible = false; ghost = null; }
        S.placing = queue.length ? queue[0] : null;
        if (!S.placing) return;
        const o = S.placing.kind === 'guard' ? makeGuard() : S.placing.kind === 'turret' ? makeTurret() : makeFlood();
        ghost = o; ghostMat = ghostMat || new T.MeshBasicMaterial({ color: 0x66ffaa, transparent: true, opacity: 0.45, depthWrite: false, fog: false });
        o.mesh.traverse((m) => { if (m.isMesh) { m.userData.real = m.material; if (!m.isSkinnedMesh) m.material = ghostMat; m.castShadow = false; } });
      }
      function placeAt(o, x, y, z, yaw, nid, owner) {
        o.nid = nid || ++nidSeq; o.owner = owner || (V.net && V.net.id) || null;
        o.pos.set(x, y, z); o.yaw = yaw; o.mesh.position.copy(o.pos); o.mesh.rotation.y = yaw;
        o.mesh.traverse((m) => { if (m.isMesh && m.userData.real) { m.material = m.userData.real; m.castShadow = !m.material.isMeshBasicMaterial; } });
        if (o.kind === 'guard') guards.push(o); else if (o.kind === 'turret') turrets.push(o);
        else { floods.push(o); o.flood.pos.set(x, y + 2.5, z); o.flood.dir.set(Math.sin(yaw), -0.42, Math.cos(yaw)).normalize(); lights.floods.push(o.flood); o.em = lights.addEmitter({ pos: [x + Math.sin(yaw) * 2.5, y + 1.6, z + Math.cos(yaw) * 2.5], color: 0xfff0d0, intensity: 40, dist: 20, weight: 0.5 }); }
      }
      function confirmPlace() {
        if (!ghost || !ghostOk) { V.audio.play('deny'); return; }
        const o = ghost; ghost = null; queue.shift();
        if (remote) { root.remove(o.mesh); NET().request('place', [o.kind, r2(o.mesh.position.x), r2(o.mesh.position.y), r2(o.mesh.position.z), r2(o.mesh.rotation.y)]); }
        else placeAt(o, o.mesh.position.x, o.mesh.position.y, o.mesh.position.z, o.mesh.rotation.y);
        V.audio.play('purchase', { pitch: 0.7 });
        nextGhost();
      }
      function cancelPlace(all) {
        const list = all ? queue.splice(0) : queue.splice(0, 1);
        for (const q of list) if (V.director) V.director.addMoney(q.price || 0), (S.earned -= q.price || 0);
        if (ghost) { root.remove(ghost.mesh); ghost = null; }
        S.placing = null;
        if (!all) nextGhost();
      }
      window.addEventListener('mousedown', (e) => {
        if (!S.placing || g.game.state !== 'playing' || S.shop) return;
        if (e.button === 0) confirmPlace(); else if (e.button === 2) cancelPlace(false);
      });
      function updateGhost() {
        if (!ghost && queue.length && !S.shop && !S.down) nextGhost();
        if (!ghost) return;
        const o = p.eye, d = p.forward;
        let hit = g.physics.raycast(o, d, 11), x, z, y;
        if (hit && hit.normal.y > 0.6) { x = hit.point.x; z = hit.point.z; y = hit.point.y; }
        else { const t = hit ? Math.max(0.5, hit.dist - 0.6) : 7; x = o.x + d.x * t; z = o.z + d.z * t; y = g.physics.groundHeight(x, z, o.y); }
        y = g.physics.groundHeight(x, z, p.pos.y + 1.2);
        ghostOk = Z().nav.free(x, z) && Math.hypot(x - p.pos.x, z - p.pos.z) > 0.9 && Math.hypot(x - V.CRYSTAL.x, z - V.CRYSTAL.z) > 2.4 && Math.abs(y - p.pos.y) < 1.2;
        for (const q of [...guards, ...turrets, ...floods]) if (q.alive && Math.hypot(q.pos.x - x, q.pos.z - z) < 1.0) ghostOk = false;
        ghost.mesh.position.set(x, y, z); ghost.mesh.rotation.y = Math.atan2(d.x, d.z);
        ghostMat.color.setHex(ghostOk ? 0x66ffaa : 0xff5544);
      }

      // ---- thrown things ----
      function toss(kind) {
        const o = { kind, mesh: kind === 'grenade' ? nadeGeo() : flareGeo(), pos: p.eye.clone().addScaledVector(p.forward, 0.5), vel: p.forward.clone().multiplyScalar(kind === 'grenade' ? 15 : 13).add(new T.Vector3(p.vel.x, 3.2, p.vel.z)), t: 0, fuse: kind === 'grenade' ? 2 : 24, spin: rand(4, 9), landed: false };
        root.add(o.mesh); thrown.push(o);
        V.audio.play('gear_rustle');
      }
      function throwGrenade() { if (S.items.grenades <= 0) { V.audio.play('deny'); return; } S.items.grenades--; toss('grenade'); }
      function throwFlare() { if (S.items.flares <= 0) { V.audio.play('deny'); return; } S.items.flares--; toss('flare'); }
      function dropMine() {
        if (S.items.mines <= 0 || !p.onGround) { V.audio.play('deny'); return; }
        S.items.mines--;
        const m = { mesh: mineGeo(), pos: new T.Vector3(p.pos.x + p.forward.x * 0.7, 0, p.pos.z + p.forward.z * 0.7), arm: 1.2, t: 0 };
        m.pos.y = g.physics.groundHeight(m.pos.x, m.pos.z, p.pos.y + 0.6) + 0.03; m.mesh.position.copy(m.pos); root.add(m.mesh); mines.push(m);
        V.audio.play('reload_magin', { gain: 0.6 });
      }
      // from: the session id of whoever set it off, when it happened on someone else's machine
      function explode(pos, radius, damage, size, from) {
        const net = NET();
        try { g.fx.explosion(pos, size); } catch (e) { /* optional */ }
        g.events.emit('explosion', { pos: pos.clone(), size });
        if (!net || net.host) {
          // the host (or a player alone) decides what it did to the dead and to what can break
          Z().forEachInRadius(pos.x, pos.z, radius, (z, d) => {
            if (Math.abs(z.pos.y - pos.y) > 3) return;
            const blast = { x: pos.x, y: pos.y, z: pos.z, force: 9 * (1 - 0.6 * (d / radius)) };
            z.damage(damage * (1 - 0.75 * (d / radius)), null, tmp.copy(z.pos).sub(pos).normalize(), 'body', { by: from || 'player', blast });
            Z().knockback(z, z.pos.x - pos.x, z.pos.z - pos.z, 9 * (1 - d / radius), 0.6);
          });
          if (V.destruct) V.destruct.blast(pos, radius * 0.75, damage);
        }
        // bodies already down and loose pieces feel it on every machine
        Z().blast(pos.x, pos.y, pos.z, radius, 7);
        if (V.loose) V.loose.blast(pos.x, pos.y, pos.z, radius, 60);
        if (from) return;
        const dp = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
        if (p.alive && dp < radius * 0.7) p.damage(60 * (1 - dp / (radius * 0.7)), pos);
        if (net) net.emit('bm', [r2(pos.x), r2(pos.y), r2(pos.z), radius, damage, size]);
      }
      function flareAt(pos, secs, fromNet) {
        if (!fromNet) { const n = NET(); if (n) n.emit('fl', [r2(pos.x), r2(pos.y), r2(pos.z), secs]); }
        const mesh = flareGeo(); mesh.position.copy(pos); root.add(mesh);
        const f = { mesh, pos: pos.clone(), t: 0, life: secs, em: lights.addEmitter({ pos: pos.clone().setY(pos.y + 0.4), color: 0xff3a20, intensity: 90, dist: 24, flicker: 0.3, weight: 1.6 }) };
        const halo = new T.Sprite(new T.SpriteMaterial({ map: V.glowTexture, color: new T.Color(1, 0.25, 0.12), blending: T.AdditiveBlending, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
        halo.scale.setScalar(3.2); halo.position.y = 0.25; mesh.add(halo); f.halo = halo;
        flares.push(f);
      }

      // ---- update ----
      function update(dt) {
        updateGhost();
        const zs = Z(), oc = S.buff.overclock > 0, tm = S.cls.turretMult || 1;
        for (let i = guards.length - 1; i >= 0; i--) {
          const o = guards[i];
          if (!o.alive) { o.deadT += dt; o.bones.hips.rotation.x = -Math.min(1.5, o.deadT * 3.5); o.bones.hips.position.y = 0.96 - Math.min(0.82, o.deadT * 2.2); if (o.deadT > 6) { root.remove(o.mesh); guards.splice(i, 1); } continue; }
          if (remote) { o.mesh.rotation.y = o.yaw + 0.22; continue; }
          o.scanT -= dt;
          if (o.scanT <= 0) { o.scanT = 0.3; o.tgt = zs.nearest(o.pos.x, o.pos.y + 1.4, o.pos.z, DEF.guard.range); }
          if (o.tgt && !o.tgt.alive) o.tgt = null;
          if (o.tgt) {
            const want = Math.atan2(o.tgt.pos.x - o.pos.x, o.tgt.pos.z - o.pos.z);
            o.yaw = turnToward(o.yaw, want, dt * 5); o.mesh.rotation.y = o.yaw + 0.22;
            o.shotT -= dt;
            if (o.shotT <= 0 && Math.abs(wrap(want - o.yaw)) < 0.12) {
              const s = Math.sin(o.yaw), c = Math.cos(o.yaw);
              shoot(o, tmp.set(o.pos.x + s * 0.85 + c * -0.07, o.pos.y + 1.4, o.pos.z + c * 0.85 - s * -0.07).clone(), o.tgt, DEF.guard.dmg);
              o.bones.chest.rotation.x = -0.05;
              if (++o.burst >= 3) { o.burst = 0; o.shotT = rand(0.45, 0.9); } else o.shotT = 0.1;
            }
          }
          o.bones.chest.rotation.x += (0 - o.bones.chest.rotation.x) * Math.min(1, dt * 10);
          o.bones.spine.rotation.z = Math.sin(g.time.t * 0.8 + i) * 0.015;
        }
        for (let i = turrets.length - 1; i >= 0; i--) {
          const o = turrets[i];
          if (!o.alive) { o.deadT += dt; o.head.rotation.x = Math.min(0.7, o.deadT * 2); if (o.deadT > 8) { root.remove(o.mesh); turrets.splice(i, 1); } continue; }
          if (remote) { o.head.rotation.y = o.yaw - o.mesh.rotation.y; continue; }
          o.scanT -= dt;
          if (o.scanT <= 0) { o.scanT = 0.25; o.tgt = zs.nearest(o.pos.x, o.pos.y + 0.9, o.pos.z, DEF.turret.range); }
          if (o.tgt && !o.tgt.alive) o.tgt = null;
          o.fireT -= dt * (oc ? 2 : 1);
          if (o.tgt) {
            const want = Math.atan2(o.tgt.pos.x - o.pos.x, o.tgt.pos.z - o.pos.z);
            o.yaw = turnToward(o.yaw, want, dt * 4.5);
            if (Math.abs(wrap(want - o.yaw)) < 0.1 && o.fireT <= 0) {
              o.fireT = DEF.turret.interval;
              const s = Math.sin(o.yaw), c = Math.cos(o.yaw);
              shoot(o, tmp.set(o.pos.x + s * 0.8, o.pos.y + 0.93, o.pos.z + c * 0.8).clone(), o.tgt, DEF.turret.dmg * tm);
              o.head.position.z = -0.03;
            }
          } else o.yaw += Math.sin(g.time.t * 0.5 + i) * dt * 0.4;
          o.head.rotation.y = o.yaw - o.mesh.rotation.y; o.head.position.z += (0 - o.head.position.z) * Math.min(1, dt * 20);
        }
        for (let i = thrown.length - 1; i >= 0; i--) {
          const o = thrown[i]; o.t += dt;
          if (!o.landed) {
            o.vel.y -= 14 * dt;
            const sp = o.vel.length(), hit = sp > 0.01 ? g.physics.raycast(o.pos, tmp.copy(o.vel).multiplyScalar(1 / sp), sp * dt + 0.06) : null;
            if (hit) {
              o.pos.copy(hit.point).addScaledVector(hit.normal, 0.06);
              const vn = o.vel.dot(hit.normal); o.vel.addScaledVector(hit.normal, -1.45 * vn).multiplyScalar(0.55);
              if (o.vel.length() < 1.2 && hit.normal.y > 0.6) { o.landed = true; o.vel.set(0, 0, 0); }
              if (o.kind === 'grenade') V.audio.play('shell_bounce_metal', { pos: o.pos, pitch: 0.6 });
            } else o.pos.addScaledVector(o.vel, dt);
            o.mesh.rotation.x += o.spin * dt; o.mesh.rotation.z += o.spin * 0.6 * dt;
          }
          o.mesh.position.copy(o.pos);
          if (o.kind === 'flare' && (o.landed || o.t > 2.5)) { root.remove(o.mesh); thrown.splice(i, 1); flareAt(o.pos.clone(), 24); V.audio.play('flare_pop', { pos: o.pos }); continue; }
          if (o.kind === 'grenade' && o.t >= o.fuse) { root.remove(o.mesh); thrown.splice(i, 1); explode(o.pos.clone().setY(o.pos.y + 0.25), 6.5, 420, 1.5); }
        }
        for (let i = mines.length - 1; i >= 0; i--) {
          const m = mines[i]; m.t += dt;
          m.mesh.children.forEach((c) => { if (c.material === red) c.visible = m.t > m.arm && Math.sin(m.t * 6) > 0; });
          if (m.t < m.arm) continue;
          let trip = false;
          zs.forEachInRadius(m.pos.x, m.pos.z, 1.5, () => { trip = true; });
          if (trip) { root.remove(m.mesh); mines.splice(i, 1); explode(m.pos.clone().setY(m.pos.y + 0.3), 4.8, 380, 1.3); }
        }
        for (let i = flares.length - 1; i >= 0; i--) {
          const f = flares[i]; f.t += dt;
          const k = Math.min(1, (f.life - f.t) / 3);
          f.em.on = Math.max(0, k); f.halo.material.opacity = 0.7 * Math.max(0, k) * (0.8 + 0.2 * Math.sin(f.t * 31));
          if (Math.random() < 0.35) { try { g.fx.smoke(tmp.copy(f.pos).setY(f.pos.y + 0.2), { size: 0.5, life: 1.6, color: [0.5, 0.18, 0.14], count: 1, alpha: 0.22 }); } catch (e) { /* optional */ } }
          if (f.t >= f.life) { lights.removeEmitter(f.em); root.remove(f.mesh); flares.splice(i, 1); }
        }
      }
      function reset() {
        for (const o of [...guards, ...turrets, ...floods]) root.remove(o.mesh);
        for (const o of floods) { const i = lights.floods.indexOf(o.flood); if (i >= 0) lights.floods.splice(i, 1); if (o.em) lights.removeEmitter(o.em); }
        for (const o of [...thrown, ...mines, ...flares]) root.remove(o.mesh);
        for (const f of flares) lights.removeEmitter(f.em);
        guards.length = turrets.length = floods.length = mines.length = flares.length = thrown.length = queue.length = 0;
        if (ghost) { root.remove(ghost.mesh); ghost = null; }
        S.placing = null;
      }

      Object.assign(self, {
        guards, turrets, floods, queue, update, reset, beginPlace, cancelPlace, count, pendingCount: pending,
        throwGrenade, throwFlare, dropMine, flareAt, explode,
        // a free item handed out at the start of a run: it is placed like a bought one
        grant(kind) { queue.push({ kind, price: 0 }); },
        victimNear(x, z, r) {
          let best = null, bd = r;
          for (const o of guards) { if (!o.alive) continue; const d = Math.hypot(o.pos.x - x, o.pos.z - z); if (d < bd) { bd = d; best = o; } }
          for (const o of turrets) { if (!o.alive) continue; const d = Math.hypot(o.pos.x - x, o.pos.z - z); if (d < bd) { bd = d; best = o; } }
          return best;
        },
        damaged: () => [...guards, ...turrets].some((o) => o.alive && o.hp < o.maxHp),
        repairAll() { if (remote) { NET().request('dheal', 1); return; } for (const o of [...guards, ...turrets]) if (o.alive) o.hp = o.maxHp; },

        // ---- playing together ----
        setRemote(v) { remote = !!v; },
        // a guest asked for something to be placed
        netPlace(d, from) {
          if (remote || !Array.isArray(d) || !DEF[d[0]] || count(d[0]) >= DEF[d[0]].max) return;
          const o = d[0] === 'guard' ? makeGuard() : d[0] === 'turret' ? makeTurret() : makeFlood();
          placeAt(o, +d[1], +d[2], +d[3], +d[4], 0, from);
        },
        // everything standing, for the room
        netList() {
          let out = 'D';
          for (const o of [...guards, ...turrets, ...floods]) if (o.alive) out += [o.nid, o.kind[0], r2(o.pos.x), r2(o.pos.y), r2(o.pos.z), r2(o.yaw), o.maxHp ? Math.round((o.hp / o.maxHp) * 100) : 100, o.owner || ''].join(',') + ';';
          return out;
        },
        // the host's list: make what is missing, turn what is there, drop what has gone
        netApply(str) {
          if (!remote || typeof str !== 'string' || str[0] !== 'D') return;
          const have = new Map(); for (const o of [...guards, ...turrets, ...floods]) if (o.alive) have.set(o.nid, o);
          for (const part of str.slice(1).split(';')) {
            if (!part) continue;
            const a = part.split(','), nid = +a[0], kind = a[1] === 'g' ? 'guard' : a[1] === 't' ? 'turret' : 'floodlight';
            let o = have.get(nid);
            if (!o) { o = kind === 'guard' ? makeGuard() : kind === 'turret' ? makeTurret() : makeFlood(); placeAt(o, +a[2], +a[3], +a[4], +a[5], nid, a[7] || 'host'); }
            else have.delete(nid);
            o.yaw = +a[5]; if (o.maxHp) o.hp = (o.maxHp * +a[6]) / 100;
          }
          for (const o of have.values()) {
            if (o.kind === 'floodlight') { o.alive = false; root.remove(o.mesh); const i = lights.floods.indexOf(o.flood); if (i >= 0) lights.floods.splice(i, 1); if (o.em) lights.removeEmitter(o.em); floods.splice(floods.indexOf(o), 1); }
            else hurt(o, 1e9);
          }
        },
        healAll(frac) { if (remote) return; for (const o of [...guards, ...turrets]) if (o.alive) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * frac); },
        all: () => [...guards, ...turrets, ...floods],
      });
    },
    // safe no-ops until install() runs
    update() {}, reset() {}, victimNear() { return null; }, grant() {}, cancelPlace() {}, healAll() {}, flareAt() {}, setRemote() {}, netList() { return 'D'; }, netApply() {},
  };
})();
