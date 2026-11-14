/* The dead. Bodies come from figure.js (one skinned mesh each, painted from an atlas); motion is procedural
   (shamble, sprint, lunge, flinch, crawl). Arms and legs have their own health and come off: a body that loses
   a leg drops and drags itself on, one that loses its arms bites. Death hands the body to ragdoll.js.
   Pathing follows flow fields over a navigation grid: one toward the crystal, one toward each player.
   Played together, one machine (the host) thinks for the dead and reports them ten times a second in a packed
   string; the others show what it reports and send it their hits. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const PI = Math.PI;

  // arm / leg: limb health as a share of the body's
  V.ZOMBIES = {
    walker: { hp: 100, speed: [1.25, 1.95], dmg: 10, crystalDmg: 6, interval: 1.25, reach: 1.45, reward: 40, scale: [0.95, 1.08], aggro: 9, eye: [1.3, 1.7, 2.0], r: 0.34, mass: 1, arm: 0.6, leg: 0.8 },
    runner: { hp: 60, speed: [4.3, 5.1], dmg: 8, crystalDmg: 4, interval: 0.8, reach: 1.4, reward: 55, scale: [0.9, 1.0], aggro: 24, eye: [3.0, 0.6, 0.25], r: 0.32, mass: 0.8, arm: 0.7, leg: 0.9 },
    spitter: { hp: 85, speed: [1.6, 2.0], dmg: 8, crystalDmg: 5, interval: 1.3, reach: 1.4, reward: 75, scale: [1.0, 1.08], aggro: 18, eye: [0.5, 2.6, 0.5], r: 0.4, mass: 1.2, arm: 0.6, leg: 0.8, spit: { range: 15, dmg: 13, crystalDmg: 11, cd: 2.8 } },
    brute: { hp: 750, speed: [1.7, 2.0], dmg: 28, crystalDmg: 22, interval: 1.7, reach: 2.0, reward: 220, scale: [1.42, 1.52], aggro: 11, eye: [3.0, 1.5, 0.3], r: 0.55, mass: 4, arm: 0.3, leg: 0.36 },
    boss: { hp: 3600, speed: [1.6, 1.7], dmg: 45, crystalDmg: 55, interval: 2.0, reach: 2.9, reward: 1200, scale: [2.1, 2.1], aggro: 13, eye: [4.5, 0.3, 0.2], r: 0.8, mass: 12, arm: 0.12, leg: 0, noCrawl: true },
  };

  // ------------------------------------------------------------------ flow-field navigation
  function makeNav(g) {
    // The engine's grid pads obstacles by half a metre and a cell, which seals a two-metre aisle. The dead are
    // 0.34 m across, so this grid is rasterised again from the same colliders with a tighter margin.
    const E = g.physics.nav._grid(), G = { w: E.w, h: E.h, minX: E.minX, minZ: E.minZ, cell: E.cell }, w = G.w, h = G.h, N = w * h, blocked = new Uint8Array(N), PAD = 0.3;
    function rasterise() {
      blocked.fill(0);
      for (const b of g.physics.boxes) {
        if (b.noNav || b.bulletOnly || b.max.y < 0.47 || b.min.y > 1.5) continue;
        const x0 = Math.max(0, Math.ceil((b.min.x - PAD - G.minX) / G.cell - 0.5)), x1 = Math.min(w - 1, Math.floor((b.max.x + PAD - G.minX) / G.cell - 0.5));
        const z0 = Math.max(0, Math.ceil((b.min.z - PAD - G.minZ) / G.cell - 0.5)), z1 = Math.min(h - 1, Math.floor((b.max.z + PAD - G.minZ) / G.cell - 0.5));
        for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) blocked[z * w + x] = 1;
      }
      for (let i = 0; i < w; i++) { blocked[i] = blocked[w + i] = blocked[(h - 1) * w + i] = blocked[(h - 2) * w + i] = 1; }
      for (let i = 0; i < h; i++) { blocked[i * w] = blocked[i * w + 1] = blocked[i * w + w - 1] = blocked[i * w + w - 2] = 1; }
    }
    rasterise();
    const queue = new Int32Array(N);
    const idx = (x, z) => { const cx = Math.floor((x - G.minX) / G.cell), cz = Math.floor((z - G.minZ) / G.cell); return cx < 0 || cz < 0 || cx >= w || cz >= h ? -1 : cz * w + cx; };
    const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    // breadth-first flood from the seeds; two passes of relaxation smooth the diagonal bias
    function flood(field, seeds, maxDist) {
      field.fill(Infinity);
      let head = 0, tail = 0;
      for (const s of seeds) if (s >= 0 && field[s] === Infinity) { field[s] = 0; queue[tail++] = s; }
      while (head < tail) {
        const c = queue[head++], d = field[c];
        if (d > maxDist) continue;
        const cx = c % w, cz = (c / w) | 0;
        for (let k = 0; k < 8; k++) {
          const nx = cx + NB[k][0], nz = cz + NB[k][1];
          if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
          const n = nz * w + nx;
          if (blocked[n]) continue;
          if (k > 3 && (blocked[cz * w + nx] || blocked[nz * w + cx])) continue;
          const nd = d + NB[k][2];
          if (nd < field[n]) { const first = field[n] === Infinity; field[n] = nd; if (first) queue[tail++] = n; }
        }
      }
      return field;
    }
    const crystalField = new Float32Array(N), fields = new Map();
    const nav = {
      grid: G, idx, crystalField, blocked,
      // a field toward one player, keyed by who it is
      buildFor(key, x, z) { let f = fields.get(key); if (!f) fields.set(key, (f = new Float32Array(N))); flood(f, [nav.nearestFree(x, z)], 110); },
      fieldOf(key) { return fields.get(key) || null; },
      forget(keep) { for (const k of fields.keys()) if (!keep.has(k)) fields.delete(k); },
      free(x, z) { const i = idx(x, z); return i >= 0 && !blocked[i]; },
      nearestFree(x, z) {
        const cx = Math.floor((x - G.minX) / G.cell), cz = Math.floor((z - G.minZ) / G.cell);
        for (let r = 0; r < 8; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
          if (!blocked[nz * w + nx]) return nz * w + nx;
        }
        return -1;
      },
      buildCrystal() {
        const seeds = [], C = V.CRYSTAL;
        for (let a = 0; a < 40; a++) for (const r of [1.5, 2.0, 2.5]) { const i = idx(C.x + Math.cos(a / 40 * PI * 2) * r, C.z + Math.sin(a / 40 * PI * 2) * r); if (i >= 0 && !blocked[i]) seeds.push(i); }
        flood(crystalField, seeds, 1e9);
      },
      rebuild() { rasterise(); nav.buildCrystal(); },
      // Direction of steepest descent at a world position; false if the field does not reach it.
      dirAt(field, x, z, out) {
        let c = idx(x, z);
        if (c < 0) return false;
        if (blocked[c]) { c = nav.nearestFree(x, z); if (c < 0) return false; }
        const cx = c % w, cz = (c / w) | 0;
        let best = field[c], bx = 0, bz = 0;
        if (best === Infinity) {
          // standing in a pocket the flood never reached: step toward any reached neighbour
          best = Infinity;
        }
        for (let k = 0; k < 8; k++) {
          const nx = cx + NB[k][0], nz = cz + NB[k][1];
          if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
          const n = nz * w + nx;
          if (blocked[n]) continue;
          if (k > 3 && (blocked[cz * w + nx] || blocked[nz * w + cx])) continue;
          if (field[n] < best) { best = field[n]; bx = NB[k][0]; bz = NB[k][1]; }
        }
        if (!bx && !bz) return false;
        // aim at the centre of the chosen cell so paths hug the grid less
        const tx = G.minX + (cx + bx + 0.5) * G.cell - x, tz = G.minZ + (cz + bz + 0.5) * G.cell - z, l = Math.hypot(tx, tz) || 1;
        out.x = tx / l; out.z = tz / l;
        return true;
      },
    };
    nav.buildCrystal();
    return nav;
  }

  // ------------------------------------------------------------------ ray tests
  const raySphere = (ox, oy, oz, dx, dy, dz, cx, cy, cz, r) => {
    const x = cx - ox, y = cy - oy, z = cz - oz, b = x * dx + y * dy + z * dz, h = b * b - (x * x + y * y + z * z - r * r);
    if (h < 0) return Infinity;
    const t = b - Math.sqrt(h);
    return t >= 0 ? t : Infinity;
  };
  // a capsule from a to b
  const rayCapsule = (ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r) => {
    const bax = bx - ax, bay = by - ay, baz = bz - az, oax = ox - ax, oay = oy - ay, oaz = oz - az;
    const baba = bax * bax + bay * bay + baz * baz;
    if (baba < 1e-7) return raySphere(ox, oy, oz, dx, dy, dz, ax, ay, az, r);
    const bard = bax * dx + bay * dy + baz * dz, baoa = bax * oax + bay * oay + baz * oaz, rdoa = dx * oax + dy * oay + dz * oaz, oaoa = oax * oax + oay * oay + oaz * oaz;
    const a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - r * r * baba, h = b * b - a * c;
    if (a > 1e-9 && h >= 0) {
      const t = (-b - Math.sqrt(h)) / a, y = baoa + t * bard;
      if (y > 0 && y < baba) return t >= 0 ? t : Infinity;
      return y <= 0 ? raySphere(ox, oy, oz, dx, dy, dz, ax, ay, az, r) : raySphere(ox, oy, oz, dx, dy, dz, bx, by, bz, r);
    }
    if (a <= 1e-9) return Math.min(raySphere(ox, oy, oz, dx, dy, dz, ax, ay, az, r), raySphere(ox, oy, oz, dx, dy, dz, bx, by, bz, r));
    return Infinity;
  };

  // ------------------------------------------------------------------ packing for the wire
  // six bits a character, from an alphabet that never reads as a number
  const A64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', I64 = {};
  for (let i = 0; i < 64; i++) I64[A64[i]] = i;
  const e64 = (n, w) => { let o = ''; for (let i = w - 1; i >= 0; i--) o += A64[(n >> (6 * i)) & 63]; return o; };
  const d64 = (str, i, w) => { let n = 0; for (let k = 0; k < w; k++) n = (n << 6) | (I64[str[i + k]] || 0); return n; };
  const qPos = (v) => Math.max(0, Math.min(4095, Math.round(((v + 66) / 132) * 4095))), uPos = (n) => (n / 4095) * 132 - 66;
  const q63 = (v) => Math.max(0, Math.min(63, Math.round(v * 63)));
  const REC = 12;                                         // characters per zombie in a snapshot
  V.zpack = { e64, d64, qPos, uPos, REC };

  // ------------------------------------------------------------------ the manager
  const WALK = 0, RISE = 1, DEAD = 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  const turnToward = (a, b, step) => { let d = ((b - a + PI) % (PI * 2) + PI * 2) % (PI * 2) - PI; return Math.abs(d) <= step ? b : a + Math.sign(d) * step; };
  const LIMB_KEYS = ['armL', 'armR', 'legL', 'legR'], BRIGHT = 2.3;

  V.zombies = {
    async create(g) {
      const T = g.THREE, kit = V.kit, F = V.figure, CFG = V.ZOMBIES, BI = F.BI, world = V.loose;
      const root = new T.Group(); root.name = 'zombies'; g.scene.add(root);
      const ragdoll = V.ragdoll.create(g, world);

      // ---- bodies: one geometry and one painted atlas per kind ----
      const loader = new T.TextureLoader(), aniso = Math.min(4, g.renderer.capabilities.getMaxAnisotropy ? g.renderer.capabilities.getMaxAnisotropy() : 1);
      const loadAtlas = (kind) => new Promise((resolve) => {
        loader.load('assets/zombies/' + kind + '.webp', (t) => { t.colorSpace = T.SRGBColorSpace; t.anisotropy = aniso; resolve(t); }, undefined, () => {
          console.error('[vigil] zombie atlas failed to load: ' + kind);
          const d = new T.DataTexture(new Uint8Array([120, 128, 110, 255]), 1, 1); d.colorSpace = T.SRGBColorSpace; d.needsUpdate = true; resolve(d);
        });
      });
      const typeOf = {}; for (const t in F.KINDS) for (const k of F.KINDS[t]) typeOf[k] = t;
      const bodies = {};
      await Promise.all(Object.keys(typeOf).map(async (kind) => {
        const { geo, glow } = F.build(T, kit, kind, { eye: CFG[typeOf[kind]].eye });
        const map = await loadAtlas(kind);
        const mat = new T.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 1.6, roughness: 0.74, metalness: 0, alphaTest: 0.5, side: T.DoubleSide });
        mat.name = 'vg_zombie_' + kind;
        bodies[kind] = { geo, glow, mat, build: Object.assign({ chest: 1, belly: 1, arm: 1, leg: 1, head: 1 }, F.LOOKS[kind].build) };
      }));
      const glowMat = new T.MeshBasicMaterial({ vertexColors: true, fog: false }); glowMat.name = 'vg_zombie_glow';

      const nav = (V.nav = makeNav(g));
      let navDirty = 0;
      world.onChange(() => { navDirty = 0.6; });
      g.events.on('vigil:broken', ({ pos }) => { ragdoll.wake(pos.x, pos.z, 2.6); world.wake(pos.x, pos.y, pos.z, 2.6); });
      const list = [], pool = {}; for (const k in bodies) pool[k] = [];
      const dir = { x: 0, z: 0 }, tmp = new T.Vector3(), tmp2 = new T.Vector3(), tmp3 = new T.Vector3(), up = new T.Vector3(0, 1, 0), tq = new T.Quaternion();
      let nextId = 1, alive = 0, groanT = 2, navT = 0;
      const parked = [];
      // playing together: `remote` is true on every machine but the host's
      let remote = false, nidSeq = 0, snapSeq = 0, lastSeq = -1, lastSnapT = 0, navI = 0;
      const nids = new Map(), KIND_LIST = Object.keys(typeOf), TAU = PI * 2;
      const NET = () => (V.net && V.net.online ? V.net : null);

      // spitter projectiles
      const spits = [], spitMat = new T.MeshBasicMaterial({ color: new T.Color(0.6, 3.2, 0.5), fog: false });
      const spitGeo = new T.SphereGeometry(0.1, 8, 6);
      for (let i = 0; i < 12; i++) { const m = new T.Mesh(spitGeo, spitMat); m.visible = false; m.castShadow = false; root.add(m); spits.push({ m, on: false, p: new T.Vector3(), v: new T.Vector3(), life: 0, dmg: 0, cdmg: 0 }); }

      function make(kind) {
        const type = typeOf[kind], cfg = CFG[type], body = bodies[kind];
        const mat = body.mat.clone(); mat.name = body.mat.name;
        const { mesh, bones, skeleton } = F.rig(T, body.geo, mat);
        const glow = new T.SkinnedMesh(body.glow, glowMat); glow.castShadow = false; glow.receiveShadow = false; glow.frustumCulled = false;
        mesh.add(glow); glow.bind(skeleton, mesh.bindMatrix);
        mesh.visible = false; root.add(mesh);
        const B = {}; for (const k in BI) B[k] = bones[BI[k]];
        const bd = body.build, hs = bd.head;
        const z = {
          id: 0, type, kind, cfg, flesh: true, mesh, glow, bones: B, alive: false, active: false,
          pos: new T.Vector3(), vel: new T.Vector3(), yaw: 0, hp: 1, maxHp: 1, r: cfg.r, scale: 1, mass: cfg.mass, state: WALK,
          limbs: { armL: 0, armR: 0, legL: 0, legR: 0 }, limbHp: { armL: 1, armR: 1, legL: 1, legR: 1 }, headless: false, crawling: false, crawl: 0,
          // hit zones: [bone a, bone b, radius, part, limb, the limb state at which the zone is gone]
          zones: [
            ['hips', 'neck', 0.165 * Math.max(bd.chest, bd.belly * 0.8), 'body', null, 9],
            ['uaL', 'faL', 0.062 * bd.arm, 'armL.up', 'armL', 2], ['faL', 'hL', 0.052 * bd.arm, 'armL.lo', 'armL', 1],
            ['uaR', 'faR', 0.062 * bd.arm, 'armR.up', 'armR', 2], ['faR', 'hR', 0.052 * bd.arm, 'armR.lo', 'armR', 1],
            ['thL', 'shL', 0.088 * bd.leg, 'legL.up', 'legL', 2], ['shL', 'ftL', 0.066 * bd.leg, 'legL.lo', 'legL', 1],
            ['thR', 'shR', 0.088 * bd.leg, 'legR.up', 'legR', 2], ['shR', 'ftR', 0.066 * bd.leg, 'legR.lo', 'legR', 1],
          ],
          headR: 0.118 * hs,
          damage(amount, point, dirv, part, info) { return hurt(z, amount, point, dirv, part, info || {}); },
          onRagdollDone() { retire(z); },
        };
        return z;
      }

      function spawn(type, at, o = {}) {
        if (!CFG[type]) return null;
        const kinds = F.KINDS[type], kind = o.kind || kinds[Math.floor(Math.random() * kinds.length)];
        const z = pool[kind].pop() || make(kind), c = z.cfg;
        z.id = nextId++; z.alive = true; z.active = true; z.state = o.rise ? RISE : WALK;
        z.pos.set(at.x, 0, at.z); z.pos.y = g.physics.groundHeight(at.x, at.z, 1.2); z.vel.set(0, 0, 0);
        z.yaw = Math.atan2(V.CRYSTAL.x - at.x, V.CRYSTAL.z - at.z);
        z.scale = o.scale || rand(c.scale[0], c.scale[1]); z.r = c.r;
        z.maxHp = z.hp = c.hp * (o.hpMult || 1);
        z.speed = rand(c.speed[0], c.speed[1]) * (o.speedMult || 1); z.dmgMult = o.dmgMult || 1;
        z.riseT = 0; z.phase = rand(0, 6.28); z.kbx = z.kbz = 0; z.stun = 0; z.marked = 0; z.aggroT = 0; z.flinch = 0; z.speedNow = 0;
        z.atkT = rand(0.1, 0.6); z.swing = 0; z.swingDur = 0.5; z.swingHit = true;
        z.thinkT = rand(0, 0.3); z.tk = 'crystal'; z.tobj = null; z.los = false; z.spitT = rand(0.8, 2.2);
        z.stuckT = 0; z.lastX = at.x; z.lastZ = at.z; z.stuckCheck = 2;
        z.limp = Math.random() < 0.3 ? rand(0.3, 0.7) : 0;
        z.armL0 = Math.random() < 0.25 ? -0.25 : rand(-1.5, -1.0); z.armR0 = Math.random() < 0.25 ? -0.25 : rand(-1.5, -1.0);
        z.headTilt = rand(-0.35, 0.35); z.slump = rand(-0.12, 0.12); z.seed = rand(0, 10); z.walkBlend = 0;
        for (const k of LIMB_KEYS) { z.limbs[k] = 0; z.limbHp[k] = Math.max(16, z.maxHp * (k[0] === 'a' ? c.arm : c.leg)); }
        z.headless = false; z.crawling = false; z.crawl = 0; z.bleedT = 0; z.lastBy = 'player'; z.rag = null;
        // its number on the wire, and where the host last said it was
        if (o.nid != null) z.nid = o.nid; else { do { nidSeq = (nidSeq + 1) & 4095; } while (nids.has(nidSeq)); z.nid = nidSeq; }
        nids.set(z.nid, z);
        z.seenAt = g.time.t; z.it = 1; z.idur = 0.12; z.x0 = z.nx = at.x; z.z0 = z.nz = at.z; z.nyaw = z.yaw; z.tp = null; z.aggroBy = null;
        for (const k in z.bones) { const b = z.bones[k]; b.rotation.set(0, 0, 0); b.scale.setScalar(1); }
        z.bones.hips.position.set(0, 0.96, 0);
        // the artwork is painted dark; the night needs it lifted to sit with the scanned stone and timber round it
        const tint = BRIGHT * rand(0.82, 1.08); z.mesh.material.color.setRGB(tint * rand(0.96, 1.04), tint, tint * rand(0.94, 1.03));
        z.glow.visible = true;
        z.mesh.scale.setScalar(z.scale); z.mesh.visible = true; z.mesh.castShadow = true; z.mesh.frustumCulled = true;
        z.mesh.position.set(z.pos.x, z.pos.y - (o.rise ? 1.75 * z.scale : 0), z.pos.z); z.mesh.rotation.set(0, z.yaw, 0);
        pose(z, 0, 0, o.rise ? 1 : 0);
        list.push(z); alive++;
        g.events.emit('enemy:spawn', { enemy: z });
        return z;
      }

      function retire(z) {
        if (!z.active) return;
        z.active = false; z.alive = false; z.mesh.visible = false; z.rag = null;
        if (nids.get(z.nid) === z) nids.delete(z.nid);
        const i = list.indexOf(z); if (i >= 0) list.splice(i, 1);
        pool[z.kind].push(z);
      }

      // ---- pieces that come off ----
      const gibs = new Map();
      function gibOf(kind, bones, joint) {
        const key = kind + '|' + bones.join(',');
        let e = gibs.get(key);
        if (!e) {
          const geo = F.extract(T, bodies[kind].geo, bones, F.BONES[BI[joint]][2]);
          const c = geo.boundingBox.getCenter(new T.Vector3()), half = geo.boundingBox.getSize(new T.Vector3()).multiplyScalar(0.5);
          geo.translate(-c.x, -c.y, -c.z);
          half.set(Math.max(0.03, half.x), Math.max(0.03, half.y), Math.max(0.03, half.z));
          gibs.set(key, (e = { geo, centre: c, half }));
        }
        return e;
      }
      function throwGib(z, bones, joint, dirv, speed = 3.2) {
        const e = gibOf(z.kind, bones, joint), bone = z.bones[joint];
        bone.getWorldPosition(tmp); bone.getWorldQuaternion(tq);
        const m = new T.Mesh(e.geo, z.mesh.material); m.castShadow = true; m.receiveShadow = true; m.scale.setScalar(z.scale);
        tmp2.copy(e.centre).multiplyScalar(z.scale).applyQuaternion(tq).add(tmp);
        const d = dirv || tmp3.set(rand(-1, 1), 0, rand(-1, 1));
        world.spawn({ mesh: m, pos: tmp2, quat: tq, vel: new T.Vector3(d.x * speed + rand(-1, 1), rand(1.8, 3.6), d.z * speed + rand(-1, 1)), ang: new T.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)),
          half: e.half.clone().multiplyScalar(z.scale), mass: 2 + z.mass * 2, bounce: 0.12, friction: 0.85, life: 14,
          onHit: (b, v) => { if (V.audio) V.audio.play('gib_land', { pos: b.pos, gain: Math.min(1, v / 6) }); } });
        return tmp;
      }
      const usableArms = (z) => (z.limbs.armL ? 0 : 1) + (z.limbs.armR ? 0 : 1);
      // level 1 takes the limb at the elbow or knee, 2 at the shoulder or hip
      function sever(z, limb, level, dirv) {
        const L = F.LIMBS[limb], had = z.limbs[limb];
        if (had >= level || z.state === DEAD || (z.cfg.noCrawl && limb[0] === 'l')) return false;
        const at = had === 1 ? throwGib(z, [L.upper], L.upper, dirv)                                   // only the stump was left
          : level === 1 ? throwGib(z, L.lowerBones, L.lower, dirv) : throwGib(z, L.bones, L.upper, dirv);
        z.bones[level === 1 ? L.lower : L.upper].scale.setScalar(1e-4);
        z.limbs[limb] = level; z.flinch = 0.3;
        try {
          g.fx.dust(at, up, 1.4, 0.3, 0.015, 0.012);
          g.fx.debris(at, { color: [0.26, 0.02, 0.02], size: 0.05, speed: 4.2, count: 14, normal: up, spread: 1.5 });
        } catch (e) { /* effects are optional */ }
        if (V.audio) V.audio.play('limb_tear', { pos: z.pos });
        if (limb[0] === 'l' && !z.crawling) { z.crawling = true; z.swing = 0; if (V.audio) V.audio.play('body_fall', { pos: z.pos, delay: 0.25 }); }
        if (z.crawling && usableArms(z) === 0 && !z.bleedT) z.bleedT = rand(7, 11);
        g.events.emit('enemy:severed', { enemy: z, limb, level });
        return true;
      }
      function decapitate(z, dirv, fly) {
        if (z.headless) return;
        if (fly) throwGib(z, ['head', 'jaw'], 'head', dirv, 4);
        z.bones.head.getWorldPosition(tmp);
        z.bones.head.scale.setScalar(1e-4); z.headless = true;
        try { g.fx.dust(tmp, up, 1.6, 0.34, 0.015, 0.012); g.fx.debris(tmp, { color: [0.25, 0.02, 0.02], size: 0.05, speed: 4.5, count: fly ? 8 : 16, normal: up, spread: 1.6 }); } catch (e) { /* optional */ }
      }

      // ---- damage ----
      function hitFx(z, point, dirv, head) {
        if (point && g.fx && g.fx.dust) {
          try {
            tmp.copy(dirv || up).negate();
            g.fx.dust(point, tmp, head ? 0.9 : 0.55, 0.30, 0.016, 0.014);
            if (Math.random() < 0.6) g.fx.debris(point, { color: [0.22, 0.02, 0.02], size: 0.035, speed: 3.2, count: head ? 5 : 3, normal: tmp, spread: 0.9 });
          } catch (e) { /* effects are optional */ }
        }
        if (V.audio) V.audio.play('flesh_hit', { pos: z.pos, gain: 0.7 });
      }
      // info.by: 'player' (this machine), a session id (someone else in the room) or 'defense' (with info.owner)
      function hurt(z, amount, point, dirv, part, info) {
        if (z.state === DEAD || !z.alive) return false;
        const head = part === 'weak';
        if (remote) {
          // not ours to decide: show the hit and tell the host
          z.flinch = Math.max(z.flinch, 0.2); hitFx(z, point, dirv, head);
          V.net.hit(z.nid, amount, part, point, dirv, info);
          g.events.emit('enemy:hit', { enemy: z });
          return false;
        }
        const D = V.director, dot = part ? part.indexOf('.') : -1, limb = dot > 0 ? part.slice(0, dot) : null;
        if (D && D.modifyDamage) amount = D.modifyDamage(amount, z, part, info);
        if (z.marked > 0) amount *= 1.5;
        z.lastBy = info.by || 'player'; z.lastOwner = info.owner || null;
        if (limb) {
          // a limb soaks part of the hit; enough of it and the limb goes
          z.limbHp[limb] -= amount;
          if (z.limbHp[limb] <= 0) { sever(z, limb, part.endsWith('.lo') && z.limbs[limb] === 0 ? 1 : 2, dirv); z.limbHp[limb] = Math.max(16, z.maxHp * (limb[0] === 'a' ? z.cfg.arm : z.cfg.leg)) * 0.6; }
          amount *= 0.6;
        } else if (info.blast) {
          // a blast takes limbs by itself
          const pr = Math.min(0.8, amount / (z.maxHp * 1.6 + 60));
          for (const k of LIMB_KEYS) if (z.limbs[k] < 2 && Math.random() < pr) sever(z, k, Math.random() < 0.5 ? 2 : 1, dirv);
        }
        z.hp -= amount; z.flinch = Math.max(z.flinch, 0.2);
        if (info.by !== 'defense' && Math.hypot(z.pos.x, z.pos.z) > 6) { z.aggroT = 6; z.aggroBy = info.by || 'player'; }
        hitFx(z, point, dirv, head);
        if (z.hp <= 0) { kill(z, { head, dir: dirv, point, by: info.by || 'player', owner: info.owner, blast: info.blast, power: info.power || Math.min(7, 2 + amount / 30) }); return true; }
        g.events.emit('enemy:hit', { enemy: z });
        return false;
      }
      function kill(z, info = {}) {
        if (z.state === DEAD) return;
        z.state = DEAD; z.alive = false; alive--;
        if (nids.get(z.nid) === z) nids.delete(z.nid);
        if (info.silent) { retire(z); return; }
        if (info.head) decapitate(z, info.dir, Math.random() < 0.35);
        else if (info.blast && Math.random() < 0.3) decapitate(z, info.dir, true);
        z.glow.visible = !!F.LOOKS[z.kind].sacs && !z.headless;
        z.mesh.frustumCulled = false;
        z.vel.x += z.kbx || 0; z.vel.z += z.kbz || 0;
        z.rag = ragdoll.start(z, { dir: info.dir, point: info.point, power: info.power, blast: info.blast });
        if (V.audio) { V.audio.play(z.mass > 2 ? 'zombie_die_big' : 'zombie_die', { pos: z.pos }); V.audio.play('body_fall', { pos: z.pos, delay: 0.45 }); }
        g.events.emit('enemy:killed', { enemy: z, type: z.type, head: !!info.head, by: info.by || 'player', owner: info.owner || null });
        const n = NET(); if (n && !remote) n.killed(z, info);
      }

      // ---- attacks ----
      // who the dead can go for: the player at this machine, and anyone else in the room
      const me = { sid: null, get pos() { return g.player.pos; }, get alive() { return g.player.alive && !(V.director && V.director.playerHidden) && !(V.net && V.net.away); } };
      let targets = [me];
      function strike(z) {
        const p = g.player, c = z.cfg, D = V.director, arms = usableArms(z), k = z.dmgMult * (arms === 2 ? 1 : arms === 1 ? 0.8 : 0.6) * (z.crawling ? 0.75 : 1);
        if (z.tk === 'player') {
          const t = z.tp;
          if (t && t.alive && Math.hypot(t.pos.x - z.pos.x, t.pos.z - z.pos.z) < reachOf(z) + 0.7 && Math.abs(t.pos.y - z.pos.y) < 2.2) {
            const shove = (z.type === 'brute' || z.type === 'boss') && !z.crawling ? 7 : 0;
            if (t.sid) V.net.playerHit(t.sid, c.dmg * k, z.pos, shove);
            else { p.damage(c.dmg * k, z.pos); if (shove && D && D.knockPlayer) D.knockPlayer(p.pos.x - z.pos.x, p.pos.z - z.pos.z, shove); }
            if (V.audio) V.audio.play('zombie_hit', { pos: z.pos });
          }
        } else if (z.tk === 'def') {
          if (z.tobj && z.tobj.alive) z.tobj.damage(c.dmg * 1.4 * k);
        } else if (Math.hypot(z.pos.x - V.CRYSTAL.x, z.pos.z - V.CRYSTAL.z) < V.CRYSTAL.reach + z.r + 0.7 + (z.crawling ? 0.5 : 0)) {
          if (D) D.damageCrystal(c.crystalDmg * k, z);
        }
        // the big ones break what stands between them and their target
        if (V.destruct && z.mass > 2 && !z.crawling) V.destruct.smash(z.pos.x + Math.sin(z.yaw) * 0.9, z.pos.z + Math.cos(z.yaw) * 0.9, 1.1 * z.scale / 1.4, 400);
      }
      const reachOf = (z) => (z.crawling ? z.cfg.reach * 0.8 + 0.45 * z.scale : z.cfg.reach);
      function launch(px, py, pz, vx, vy, vz, dmg, cdmg, visual) {
        const s = spits.find((q) => !q.on); if (!s) return;
        s.p.set(px, py, pz); s.v.set(vx, vy, vz);
        s.life = 3; s.on = true; s.m.visible = true; s.dmg = dmg; s.cdmg = cdmg; s.visual = !!visual;
        if (V.audio) V.audio.play('spit', { pos: s.p });
      }
      function spit(z, tx, ty, tz) {
        const px = z.pos.x + Math.sin(z.yaw) * 0.35, py = z.pos.y + (z.crawling ? 0.45 : 1.5 * z.scale), pz = z.pos.z + Math.cos(z.yaw) * 0.35;
        const dx = tx - px, dz = tz - pz, d = Math.hypot(dx, dz), Tt = Math.max(0.25, Math.min(1.3, d / 15));
        const vx = dx / Tt, vy = (ty - py + 4.5 * Tt * Tt) / Tt, vz = dz / Tt;
        launch(px, py, pz, vx, vy, vz, z.cfg.spit.dmg * z.dmgMult, z.cfg.spit.crystalDmg * z.dmgMult, false);
        z.swing = z.swingDur = 0.4; z.swingHit = true;
        const n = NET(); if (n) n.emit('sp', [px, py, pz, vx, vy, vz].map((v) => Math.round(v * 100) / 100));
      }
      function updateSpits(dt) {
        const p = g.player, C = V.CRYSTAL, D = V.director;
        for (const s of spits) {
          if (!s.on) continue;
          tmp.copy(s.p);
          s.v.y -= 9 * dt; s.p.addScaledVector(s.v, dt); s.life -= dt; s.m.position.copy(s.p);
          let hit = false;
          // on the machines that only watch, a spit is a picture: the host decides who it hurt
          if (!s.visual) for (const t of targets) {
            if (!t.alive || Math.hypot(s.p.x - t.pos.x, s.p.y - (t.pos.y + 1.0), s.p.z - t.pos.z) >= 0.95) continue;
            if (t.sid) V.net.playerHit(t.sid, s.dmg, tmp, 0); else p.damage(s.dmg, tmp);
            hit = true; break;
          }
          if (!hit && Math.hypot(s.p.x - C.x, s.p.y - C.y, s.p.z - C.z) < 1.5) { if (D && !s.visual) D.damageCrystal(s.cdmg, null); hit = true; }
          else if (!hit && s.p.y < g.physics.groundHeight(s.p.x, s.p.z, s.p.y + 0.5) + 0.05) {
            hit = true;
            if (!s.visual) for (const t of targets) {
              if (!t.alive || Math.hypot(s.p.x - t.pos.x, s.p.z - t.pos.z) >= 1.6 || Math.abs(s.p.y - t.pos.y) >= 1.5) continue;
              if (t.sid) V.net.playerHit(t.sid, s.dmg * 0.5, s.p, 0); else p.damage(s.dmg * 0.5, s.p);
            }
          } else if (!hit) {
            tmp2.copy(s.p).sub(tmp); const l = tmp2.length();
            if (l > 1e-4 && g.physics.raycast(tmp, tmp2.multiplyScalar(1 / l), l)) hit = true;
          }
          if (hit || s.life <= 0) {
            s.on = false; s.m.visible = false;
            try { g.fx.dust(s.p, up, 1.3, 0.25, 1.2, 0.2); g.fx.smoke(s.p, { size: 0.7, life: 1.4, color: [0.2, 0.7, 0.15], count: 2, alpha: 0.35 }); } catch (e) { /* optional */ }
            if (V.audio) V.audio.play('acid', { pos: s.p });
          }
        }
      }

      // ---- thinking ----
      function think(z) {
        const C = V.CRYSTAL, dc = Math.hypot(z.pos.x - C.x, z.pos.z - C.z);
        let kind = 'crystal', obj = null, who = null;
        const def = V.defenses && V.defenses.victimNear ? V.defenses.victimNear(z.pos.x, z.pos.z, 5) : null;
        if (def) { kind = 'def'; obj = def; }
        else {
          // the nearest of the living within reach of its senses; whoever shot it is sensed from anywhere
          let best = Infinity;
          for (const t of targets) {
            if (!t.alive) continue;
            const d = Math.hypot(t.pos.x - z.pos.x, t.pos.z - z.pos.z), aggro = z.aggroT > 0 && z.aggroBy === (t.sid || 'player') ? 70 : z.cfg.aggro;
            // zombies already on the crystal stay on it unless someone is right on top of them
            if (d < aggro && !(dc < 4.6 && d > 3.2) && d < best) { best = d; who = t; }
          }
          if (who) kind = 'player';
        }
        z.tk = kind; z.tobj = obj; z.tp = who;
        if (z.cfg.spit) {
          tmp.set(z.pos.x, z.pos.y + (z.crawling ? 0.45 : 1.45), z.pos.z);
          if (kind === 'player') z.los = g.physics.lineOfSight(tmp, tmp2.set(who.pos.x, who.pos.y + 1.2, who.pos.z));
          else if (kind === 'crystal') z.los = dc < z.cfg.spit.range && g.physics.lineOfSight(tmp, tmp2.set(C.x, C.y + 0.6, C.z));
          else z.los = false;
        }
      }

      // ---- pose ----
      function pose(z, dt, speed, rising) {
        const b = z.bones, t = z.type, big = t === 'brute' || t === 'boss', time = g.time.t;
        z.walkBlend = damp(z.walkBlend, speed > 0.25 ? 1 : 0, 8, dt);
        const wb = z.walkBlend;
        z.phase += dt * (z.crawling ? Math.max(speed, 0.001) * 6.5 : speed * (t === 'runner' ? 3.4 : 4.4)) / z.scale;
        const ph = z.phase, s = Math.sin(ph), c = Math.cos(ph), amp = t === 'runner' ? 0.95 : big ? 0.45 : 0.55;
        b.thL.rotation.set(-s * amp * wb, 0, 0.05); b.thR.rotation.set(s * amp * wb * (1 - z.limp * 0.6), 0, -0.05 - z.limp * 0.12);
        b.shL.rotation.x = Math.max(0, c) * 0.95 * wb + 0.1; b.shR.rotation.x = Math.max(0, -c) * 0.95 * wb * (1 - z.limp * 0.5) + 0.1;
        b.ftL.rotation.x = -(b.thL.rotation.x + b.shL.rotation.x) * 0.55; b.ftR.rotation.x = -(b.thR.rotation.x + b.shR.rotation.x) * 0.55;
        let lean = t === 'runner' ? 0.55 : big ? 0.3 : 0.22;
        let aL = z.armL0 + Math.sin(ph * 0.5 + z.seed) * 0.12, aR = z.armR0 + Math.sin(ph * 0.5 + 1.3 + z.seed) * 0.14, eL = -0.3, eR = -0.35, spread = 0.07;
        if (t === 'runner') { aL = s * 0.9 * wb - 0.3; aR = -s * 0.9 * wb - 0.3; eL = eR = -1.25; spread = 0.12; }
        else if (big) { aL = -0.25 - s * 0.35 * wb; aR = -0.25 + s * 0.35 * wb; eL = eR = -0.5; spread = 0.42; }
        let jaw = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(time * 1.7 + z.seed * 3)), bite = 0;
        if (z.swing > 0) {
          const k = 1 - z.swing / z.swingDur, a = k < 0.45 ? -1.2 + (-2.7 + 1.2) * (k / 0.45) : -2.7 + (-0.5 + 2.7) * ((k - 0.45) / 0.55);
          aL = aR = a; eL = eR = -0.25; lean += Math.sin(k * PI) * 0.38; jaw = 0.5;
          if (usableArms(z) === 0) bite = Math.sin(k * PI);                 // no arms left: it lunges with its teeth
        }
        if (rising > 0) { aL = aR = -2.8; lean = -0.1; jaw = 0.45; }
        if (z.stun > 0) { lean = -0.25; aL = aR = -0.4; }
        lean -= z.flinch * 1.6; lean += bite * 0.45;
        b.hips.rotation.set(0, s * 0.1 * wb, s * 0.045 * wb + z.limp * 0.06);
        b.hips.position.set(0, 0.96 + Math.abs(s) * 0.03 * wb - (t === 'runner' ? 0.06 : 0) - (big ? 0.02 : 0), 0);
        b.spine.rotation.set(lean * 0.55 + 0.06, -s * 0.12 * wb, s * 0.05 * wb + z.slump * 0.5);
        b.chest.rotation.set(lean * 0.45 + 0.16, -s * 0.1 * wb, s * 0.04 * wb + z.slump);
        b.neck.rotation.set(-lean * 0.35 + 0.32 + bite * 0.3, 0, z.headTilt * 0.5);
        b.head.rotation.set(-lean * 0.4 - 0.3 + Math.sin(time * 0.9 + z.seed) * 0.06 - bite * 0.2, Math.sin(time * 0.6 + z.seed * 2) * 0.18, z.headTilt * 0.5 + Math.sin(ph * 0.5 + z.seed) * 0.06);
        b.jaw.rotation.x = jaw + bite * 0.3;
        b.uaL.rotation.set(aL, 0, spread); b.uaR.rotation.set(aR, 0, -spread);
        b.faL.rotation.set(eL, 0, 0); b.faR.rotation.set(eR, 0, 0);
        b.hL.rotation.x = -0.25 + Math.sin(time * 2.1 + z.seed) * 0.15; b.hR.rotation.x = -0.25 + Math.sin(time * 1.8 + z.seed * 1.7) * 0.15;
        if (z.crawl > 0) crawlPose(z, ease(Math.min(1, z.crawl)), s, c, time);
      }
      // Face down, dragging itself along by whatever arms it has; e blends in from the standing pose as it falls.
      function crawlPose(z, e, s, c, time) {
        const b = z.bones, idle = Math.sin(time * 1.3 + z.seed), arms = usableArms(z);
        const R = (bone, x, y, zz) => { const r = bone.rotation; r.set(mix(r.x, x, e), mix(r.y, y, e), mix(r.z, zz, e)); };
        let lift = 0, slash = 0;
        if (z.swing > 0) { const k = 1 - z.swing / z.swingDur; lift = Math.sin(k * PI); slash = lift; }
        const wr = arms ? 1 : 2.2;                                           // without arms it can only writhe
        R(b.hips, 1.42 - lift * 0.12, s * 0.12 * wr, c * 0.1 * wr);
        b.hips.position.y = mix(b.hips.position.y, 0.17 + Math.abs(s) * 0.012, e);
        R(b.spine, -0.2 - lift * 0.3, -s * 0.1 * wr, 0); R(b.chest, -0.24 - lift * 0.3, -s * 0.08, z.slump);
        R(b.neck, -0.3, 0, z.headTilt * 0.4); R(b.head, -0.5 + idle * 0.06 - lift * 0.1, Math.sin(time * 0.7 + z.seed * 2) * 0.25, z.headTilt * 0.4);
        b.jaw.rotation.x = mix(b.jaw.rotation.x, 0.3 + lift * 0.3, e);
        R(b.uaL, -2.85 + 0.7 * s - slash * 0.5, 0, 0.5); R(b.faL, -0.25 - 0.75 * Math.max(0, s) - slash * 0.2, 0, 0);
        R(b.uaR, -2.85 - 0.7 * s - slash * 0.5, 0, -0.5); R(b.faR, -0.25 - 0.75 * Math.max(0, -s) - slash * 0.2, 0, 0);
        R(b.hL, 0.7, 0, 0); R(b.hR, 0.7, 0, 0);
        R(b.thL, 0.06 + 0.1 * c, 0, 0.09); R(b.shL, 0.12 + 0.14 * Math.max(0, c), 0, 0); R(b.ftL, 0.55, 0, 0);
        R(b.thR, 0.06 - 0.1 * c, 0, -0.09); R(b.shR, 0.12 + 0.14 * Math.max(0, -c), 0, 0); R(b.ftR, 0.55, 0, 0);
      }

      // ---- update ----
      function update(dt) {
        if (dt <= 0) return;
        if (dt > 0.05) dt = 0.05;
        if (parked.length) { for (const z of parked) { if (z.loose) root.remove(z.loose); else { z.mesh.frustumCulled = true; retire(z); } } parked.length = 0; }
        const p = g.player, C = V.CRYSTAL, px = p.pos.x, pz = p.pos.z;
        if (navDirty > 0) { navDirty -= dt; if (navDirty <= 0) { nav.rebuild(); navT = 0; } }
        if (remote) { updateRemote(dt); ragdoll.update(dt); updateSpits(dt); groan(dt, px, pz); return; }
        const net = NET();
        targets = net ? [me].concat(net.targets()) : [me];
        // one field per player, rebuilt in turn
        navT -= dt;
        if (navT <= 0) {
          navT = 0.45 / targets.length; navI = (navI + 1) % targets.length;
          const t = targets[navI]; if (t.alive) nav.buildFor(t.sid || 'me', t.pos.x, t.pos.z);
          if (navI === 0 && targets.length > 1) nav.forget(new Set(targets.map((q) => q.sid || 'me')));
        }
        for (let i = list.length - 1; i >= 0; i--) {
          const z = list[i];
          if (z.state === DEAD) continue;
          if (z.marked > 0) z.marked -= dt;
          if (z.aggroT > 0) z.aggroT -= dt;
          if (z.flinch > 0) z.flinch = Math.max(0, z.flinch - dt);
          if (z.state === RISE) {
            z.riseT += dt;
            const k = Math.min(1, z.riseT / 1.7);
            z.mesh.position.set(z.pos.x, z.pos.y - 1.75 * z.scale * (1 - k) * (1 - k), z.pos.z);
            if (Math.random() < 0.5 && g.fx.dust) { tmp.set(z.pos.x + rand(-0.3, 0.3), z.pos.y + 0.05, z.pos.z + rand(-0.3, 0.3)); try { g.fx.dust(tmp, up, 0.5, 0.2, 0.16, 0.12); } catch (e) { /* optional */ } }
            if (k >= 1) z.state = WALK;
            pose(z, dt, 0, 1 - k);
            continue;
          }
          if (z.crawling) {
            if (z.crawl < 1) z.crawl = Math.min(1, z.crawl + dt / 0.55);
            if (z.bleedT > 0) { z.bleedT -= dt; if (z.bleedT <= 0) { kill(z, { by: z.lastBy, owner: z.lastOwner }); continue; } }
          }
          let wantYaw = z.yaw, vx = z.vel.x, vz = z.vel.z;
          if (z.stun > 0 || (z.crawling && z.crawl < 1)) { if (z.stun > 0) z.stun -= dt; vx = damp(vx, 0, 6, dt); vz = damp(vz, 0, 6, dt); }
          else {
            z.thinkT -= dt;
            if (z.thinkT <= 0) { z.thinkT = 0.25 + Math.random() * 0.12; think(z); }
            let tx = C.x, tz = C.z, ty = C.y, range = C.reach + z.r + (z.crawling ? 0.45 * z.scale : 0);
            if (z.tk === 'player' && !(z.tp && z.tp.alive)) z.tk = 'crystal';
            if (z.tk === 'player') { tx = z.tp.pos.x; tz = z.tp.pos.z; ty = z.tp.pos.y + 1.1; range = reachOf(z); }
            else if (z.tk === 'def') {
              if (!z.tobj || !z.tobj.alive) z.tk = 'crystal';
              else { tx = z.tobj.pos.x; tz = z.tobj.pos.z; range = reachOf(z) + (z.tobj.r || 0.4); }
            }
            const ddx = tx - z.pos.x, ddz = tz - z.pos.z, dist = Math.hypot(ddx, ddz) || 0.001;
            const ranged = z.cfg.spit && z.los && dist < z.cfg.spit.range && z.tk !== 'def' && dist > range;
            if (dist <= range || ranged) {
              vx = damp(vx, 0, 10, dt); vz = damp(vz, 0, 10, dt);
              wantYaw = Math.atan2(ddx, ddz);
              if (ranged) { z.spitT -= dt; if (z.spitT <= 0) { z.spitT = z.cfg.spit.cd * rand(0.85, 1.2); spit(z, tx, ty, tz); } }
              else { z.atkT -= dt; if (z.atkT <= 0 && z.swing <= 0) { z.swing = z.swingDur = Math.min(0.62, z.cfg.interval * 0.5); z.swingHit = false; z.atkT = z.cfg.interval * (z.crawling ? 1.25 : 1); } }
            } else {
              let ok = false;
              if (z.tk === 'player') {
                const f = nav.fieldOf(z.tp.sid || 'me');
                if (dist > 2.5 && f) ok = nav.dirAt(f, z.pos.x, z.pos.z, dir);
                if (!ok && dist < 9) { dir.x = ddx / dist; dir.z = ddz / dist; ok = true; }
                if (!ok) ok = nav.dirAt(nav.crystalField, z.pos.x, z.pos.z, dir);
              } else if (z.tk === 'def') { dir.x = ddx / dist; dir.z = ddz / dist; ok = true; }
              else if (dist > 4.6) ok = nav.dirAt(nav.crystalField, z.pos.x, z.pos.z, dir);
              if (!ok) { dir.x = ddx / dist; dir.z = ddz / dist; }
              let sp = z.speed * (z.limp ? 1 - z.limp * 0.5 * (0.5 + 0.5 * Math.sin(z.phase)) : 1);
              if (z.crawling) { const arms = usableArms(z); sp = arms ? Math.max(0.5, Math.min(1.5, z.speed * 0.4)) * (arms === 1 ? 0.7 : 1) * (0.65 + 0.35 * Math.abs(Math.sin(z.phase))) : 0.22; }
              vx = damp(vx, dir.x * sp, 7, dt); vz = damp(vz, dir.z * sp, 7, dt);
              if (vx * vx + vz * vz > 0.01) wantYaw = Math.atan2(vx, vz);
            }
            if (z.swing > 0) { z.swing -= dt; if (!z.swingHit && z.swing < z.swingDur * 0.45) { z.swingHit = true; strike(z); } }
          }
          // knockback rides on top of intent
          if (z.kbx || z.kbz) { z.kbx = damp(z.kbx, 0, 6, dt); z.kbz = damp(z.kbz, 0, 6, dt); if (Math.abs(z.kbx) + Math.abs(z.kbz) < 0.08) z.kbx = z.kbz = 0; }
          z.vel.x = vx + z.kbx; z.vel.z = vz + z.kbz; z.vel.y -= 20 * dt;
          const res = g.physics.moveCapsule(z.pos, z.vel, dt, z.r, z.crawling ? 0.55 : 1.6 * z.scale, true);
          if (res && res.onGround) z.vel.y = 0;
          z.vel.x -= z.kbx; z.vel.z -= z.kbz;
          z.speedNow = Math.hypot(z.vel.x, z.vel.z);
          z.yaw = turnToward(z.yaw, wantYaw, dt * (z.crawling ? 2.6 : 6.5));
          // stuck failsafe
          z.stuckCheck -= dt;
          if (z.stuckCheck <= 0) {
            z.stuckCheck = 2;
            const moved = Math.hypot(z.pos.x - z.lastX, z.pos.z - z.lastZ);
            z.lastX = z.pos.x; z.lastZ = z.pos.z;
            if (z.speedNow > (z.crawling ? 0.15 : 0.4) && moved < (z.crawling ? 0.1 : 0.3)) {
              z.stuckT += 2;
              // whatever is in the way gives before the dead do
              if (V.destruct && z.stuckT >= 2) V.destruct.smash(z.pos.x + Math.sin(z.yaw) * 0.7, z.pos.z + Math.cos(z.yaw) * 0.7, 0.9, z.mass > 2 ? 600 : 60);
              if (z.stuckT >= 16) { kill(z, { silent: true }); continue; }
              if (z.stuckT >= 6 && nav.dirAt(nav.crystalField, z.pos.x, z.pos.z, dir)) { z.pos.x += dir.x * 0.9; z.pos.z += dir.z * 0.9; }
            } else z.stuckT = 0;
          }
        }
        // separation, and never standing inside the player
        for (let i = 0; i < list.length; i++) {
          const a = list[i]; if (a.state !== WALK) continue;
          for (let j = i + 1; j < list.length; j++) {
            const b = list[j]; if (b.state !== WALK) continue;
            const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, rr = a.r + b.r;
            if (dx > rr || dx < -rr || dz > rr || dz < -rr) continue;
            const d2 = dx * dx + dz * dz; if (d2 >= rr * rr) continue;
            const d = Math.sqrt(d2) || 0.01, push = (rr - d) / d, wa = b.mass / (a.mass + b.mass);
            a.pos.x -= dx * push * wa; a.pos.z -= dz * push * wa; b.pos.x += dx * push * (1 - wa); b.pos.z += dz * push * (1 - wa);
          }
          if (p.alive) {
            const dx = a.pos.x - px, dz = a.pos.z - pz, rr = a.r + 0.3, d2 = dx * dx + dz * dz;
            if (d2 < rr * rr && Math.abs(a.pos.y - p.pos.y) < 1.5) { const d = Math.sqrt(d2) || 0.01; a.pos.x += (dx / d) * (rr - d); a.pos.z += (dz / d) * (rr - d); }
          }
        }
        for (let i = 0; i < list.length; i++) {
          const z = list[i]; if (z.state !== WALK) continue;
          z.mesh.position.copy(z.pos); z.mesh.rotation.y = z.yaw;
          pose(z, dt, z.speedNow, 0);
        }
        ragdoll.update(dt);
        updateSpits(dt);
        groan(dt, px, pz);
      }
      function groan(dt, px, pz) {
        groanT -= dt;
        if (groanT <= 0 && list.length) {
          groanT = rand(0.5, 2.2);
          const z = list[Math.floor(Math.random() * list.length)];
          if (z.state !== DEAD && Math.hypot(z.pos.x - px, z.pos.z - pz) < 40 && V.audio) V.audio.play(z.mass > 2 ? 'growl' : z.type === 'runner' ? 'screech' : 'groan', { pos: z.pos });
        }
      }
      // On the machines that are not the host: slide each body to where the host last put it, and animate it here.
      function updateRemote(dt) {
        const now = g.time.t;
        for (let i = list.length - 1; i >= 0; i--) {
          const z = list[i];
          if (z.state === DEAD) continue;
          if (now - z.seenAt > 0.9) { kill(z, { silent: true }); continue; }          // the host no longer has it
          if (z.flinch > 0) z.flinch = Math.max(0, z.flinch - dt);
          if (z.swing > 0) z.swing -= dt;
          if (z.stun > 0) z.stun -= dt;
          z.it += dt;
          const a = Math.min(1, z.it / z.idur), x = z.x0 + (z.nx - z.x0) * a, zz = z.z0 + (z.nz - z.z0) * a;
          z.vel.set((x - z.pos.x) / dt, 0, (zz - z.pos.z) / dt);
          z.pos.x = x; z.pos.z = zz; z.pos.y = g.physics.groundHeight(x, zz, z.pos.y + 0.6);
          z.speedNow = damp(z.speedNow, Math.hypot(z.vel.x, z.vel.z), 10, dt);
          z.yaw = turnToward(z.yaw, z.nyaw, dt * 8);
          if (z.crawling && z.crawl < 1) z.crawl = Math.min(1, z.crawl + dt / 0.55);
          if (z.state === RISE) {
            z.riseT += dt;
            const k = Math.min(1, z.riseT / 1.7);
            z.mesh.position.set(z.pos.x, z.pos.y - 1.75 * z.scale * (1 - k) * (1 - k), z.pos.z); z.mesh.rotation.y = z.yaw;
            if (k >= 1) z.state = WALK;
            pose(z, dt, 0, 1 - k);
            continue;
          }
          z.mesh.position.copy(z.pos); z.mesh.rotation.y = z.yaw;
          pose(z, dt, z.speedNow, 0);
        }
      }

      // ---- ray test against the posed body: the head, the trunk, each half of each limb ----
      const E = (bone) => bone.matrixWorld.elements;
      function raycast(o, d, maxT = 300) {
        let best = maxT, bz = null, bpart = 'body';
        const ox = o.x, oy = o.y, oz = o.z, dx = d.x, dy = d.y, dz = d.z;
        for (let i = 0; i < list.length; i++) {
          const z = list[i]; if (z.state === DEAD) continue;
          const s = z.scale, B = z.bones, h = E(B.hips);
          // nothing of it is further than this from the hips
          const cx = h[12] - ox, cy = h[13] - oy, cz = h[14] - oz, al = cx * dx + cy * dy + cz * dz, reach = 1.25 * s;
          if (al < -reach || al > best + reach) continue;
          if (cx * cx + cy * cy + cz * cz - al * al > reach * reach) continue;
          if (!z.headless) {
            const m = E(B.head), hx = m[12] + m[4] * 0.1 + m[8] * 0.02, hy = m[13] + m[5] * 0.1 + m[9] * 0.02, hz = m[14] + m[6] * 0.1 + m[10] * 0.02;
            const t = raySphere(ox, oy, oz, dx, dy, dz, hx, hy, hz, z.headR * s);
            if (t < best) { best = t; bz = z; bpart = 'weak'; }
          }
          for (let k = 0; k < z.zones.length; k++) {
            const zn = z.zones[k];
            if (zn[4] && z.limbs[zn[4]] >= zn[5]) continue;
            const a = E(B[zn[0]]), b = E(B[zn[1]]);
            let bx = b[12], by = b[13], bzz = b[14];
            if (k > 0 && zn[3].endsWith('.lo')) { bx += (bx - a[12]) * 0.35; by += (by - a[13]) * 0.35; bzz += (bzz - a[14]) * 0.35; }    // the hand, the foot
            const t = rayCapsule(ox, oy, oz, dx, dy, dz, a[12], a[13], a[14], bx, by, bzz, zn[2] * s);
            // a head shot that only grazes the neck still counts as the body; the head wins ties
            if (t < best - (bz === z && bpart === 'weak' ? 0.02 : 0)) { best = t; bz = z; bpart = zn[3]; }
          }
        }
        if (!bz) return null;
        const point = new T.Vector3(ox + dx * best, oy + dy * best, oz + dz * best);
        return { enemy: bz, dist: best, point, normal: new T.Vector3(-dx, -dy, -dz), part: bpart };
      }

      const api = {
        list, nav, root, bodies, ragdoll,
        spawn, raycast, update, kill, sever, decapitate,
        aliveCount: () => alive,
        get alive() { return alive; },
        clear() {
          ragdoll.clear();
          for (let i = list.length - 1; i >= 0; i--) retire(list[i]);
          list.length = 0; alive = 0;
          for (const s of spits) { s.on = false; s.m.visible = false; }
        },
        alert() {},
        knockback(z, dx, dz, force, stun = 0) {
          if (z.state !== WALK) return;
          const d = Math.hypot(dx, dz) || 1, k = force / Math.sqrt(z.mass);
          z.kbx = (dx / d) * k; z.kbz = (dz / d) * k;
          if (stun > 0 && z.type !== 'boss') z.stun = Math.max(z.stun, stun);
        },
        forEachInRadius(x, z, r, fn) { for (let i = list.length - 1; i >= 0; i--) { const zb = list[i]; if (zb.state === DEAD) continue; const d = Math.hypot(zb.pos.x - x, zb.pos.z - z); if (d <= r + zb.r) fn(zb, d); } },
        // nearest standing zombie with a clear line from (x, y, z)
        nearest(x, y, z, range) {
          const cand = [];
          for (const zb of list) { if (zb.state !== WALK) continue; const d = Math.hypot(zb.pos.x - x, zb.pos.z - z); if (d <= range) cand.push([d, zb]); }
          cand.sort((a, b) => a[0] - b[0]);
          tmp.set(x, y, z);
          for (let i = 0; i < Math.min(4, cand.length); i++) { const zb = cand[i][1]; if (g.physics.lineOfSight(tmp, tmp2.set(zb.pos.x, zb.pos.y + (zb.crawling ? 0.35 : 1.15 * zb.scale), zb.pos.z))) return zb; }
          return null;
        },
        // a walkable point in the trees from which the crystal can be reached
        spawnPoint(angle, near, far, avoid, minDist) {
          for (let i = 0; i < 14; i++) {
            const a = angle + rand(-0.45, 0.45), r = rand(near, far), x = Math.cos(a) * r, z = Math.sin(a) * r, k = nav.idx(x, z);
            if (k < 0 || nav.blocked[k] || nav.crystalField[k] === Infinity) continue;
            if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < minDist) continue;
            return { x, z };
          }
          return null;
        },
        // a blast: bodies already down are thrown again
        blast(x, y, z, radius, force) { ragdoll.blast(x, y, z, radius, force); },

        // ---- playing together ----
        get remote() { return remote; },
        // true: this machine only shows the dead. false: it thinks for them, starting from what it was last shown.
        setRemote(v) {
          if (remote === !!v) return;
          remote = !!v; lastSeq = -1;
          for (const z of list) { if (z.state === DEAD) continue; z.seenAt = g.time.t; z.thinkT = 0; z.tk = 'crystal'; z.tp = null; z.kbx = z.kbz = 0; z.vel.set(0, 0, 0); z.x0 = z.nx = z.pos.x; z.z0 = z.nz = z.pos.z; z.nyaw = z.yaw; }
        },
        byNid(nid) { return nids.get(nid) || null; },
        // every zombie on its feet, twelve characters each
        snapshot() {
          let s = 'Z' + e64((snapSeq = (snapSeq + 1) & 4095), 2);
          for (const z of list) {
            if (z.state === DEAD) continue;
            const L = z.limbs, tk = z.tk === 'player' ? 1 : z.tk === 'def' ? 2 : 0;
            s += e64(z.nid, 2) + e64(KIND_LIST.indexOf(z.kind) | (z.state === RISE ? 8 : 0) | (z.crawling ? 16 : 0) | (z.stun > 0 ? 32 : 0), 1)
              + e64(qPos(z.pos.x), 2) + e64(qPos(z.pos.z), 2) + e64(Math.round((((z.yaw % TAU) + TAU) % TAU) / TAU * 64) & 63, 1)
              + e64(L.armL | (L.armR << 2) | (L.legL << 4) | (L.legR << 6) | (z.swing > 0 ? 256 : 0) | (tk << 9), 2)
              + e64(q63((z.scale - 0.8) / 1.6), 1) + e64(q63(z.hp / z.maxHp), 1);
          }
          return s;
        },
        applySnapshot(s) {
          if (!remote || typeof s !== 'string' || s[0] !== 'Z') return;
          const seq = d64(s, 1, 2); if (seq === lastSeq) return; lastSeq = seq;
          const now = g.time.t, gap = Math.min(0.4, Math.max(0.06, now - lastSnapT)); lastSnapT = now;
          for (let i = 3; i + REC <= s.length; i += REC) {
            const nid = d64(s, i, 2), kf = d64(s, i + 2, 1), x = uPos(d64(s, i + 3, 2)), zz = uPos(d64(s, i + 5, 2)), yaw = (d64(s, i + 7, 1) / 64) * TAU, lf = d64(s, i + 8, 2);
            const kind = KIND_LIST[kf & 7]; if (!kind) continue;
            let z = nids.get(nid);
            if (z && z.kind !== kind) { kill(z, { silent: true }); z = null; }
            if (!z) { z = spawn(typeOf[kind], { x, z: zz }, { kind, nid, scale: 0.8 + (d64(s, i + 10, 1) / 63) * 1.6, rise: !!(kf & 8) }); if (!z) continue; z.yaw = yaw; }
            z.seenAt = now; z.nyaw = yaw; z.hp = (d64(s, i + 11, 1) / 63) * z.maxHp;
            if (Math.hypot(x - z.pos.x, zz - z.pos.z) > 4) { z.pos.x = x; z.pos.z = zz; }           // too far to slide: jump
            z.x0 = z.pos.x; z.z0 = z.pos.z; z.nx = x; z.nz = zz; z.it = 0; z.idur = gap * 1.15;
            if (kf & 32) z.stun = Math.max(z.stun, 0.25);
            if ((lf & 256) && z.swing <= 0) { z.swing = z.swingDur = 0.5; z.swingHit = true; }
            const tk = (lf >> 9) & 3; z.tk = tk === 1 ? 'player' : tk === 2 ? 'def' : 'crystal';
            for (let k = 0; k < 4; k++) { const lv = (lf >> (k * 2)) & 3; if (lv > z.limbs[LIMB_KEYS[k]]) sever(z, LIMB_KEYS[k], lv, null); }
            if ((kf & 16) && !z.crawling) z.crawling = true;
          }
        },
        // the host's word that one has died, and how
        netKill(d, mine) {
          const z = nids.get(d.i); if (!z || z.state === DEAD) return;
          const v3 = (a) => (a ? new T.Vector3(a[0], a[1], a[2]) : null);
          kill(z, { head: !!d.h, dir: v3(d.dr), point: v3(d.pt), power: d.pw, blast: d.bl ? { x: d.bl[0], y: d.bl[1], z: d.bl[2], force: d.bl[3] } : null, by: mine, owner: d.ow || null });
        },
        spitVisual(a) { launch(a[0], a[1], a[2], a[3], a[4], a[5], 0, 0, true); },
        // One of each kind, and one loose limb, wait under the floor until play starts: the renderer compiles the
        // shaders of what is in the scene while the level loads, so the first of the dead costs no hitch.
        prewarm() {
          for (const kind in bodies) {
            const z = spawn(typeOf[kind], { x: 0, z: -200 }, { kind }); if (!z) continue;
            list.splice(list.indexOf(z), 1); z.alive = false; z.state = DEAD;
            z.mesh.position.set(0.6, -3.2, 22); z.mesh.frustumCulled = false; parked.push(z);
          }
          alive = 0;
          const e = gibOf('walkerA', F.LIMBS.armL.lowerBones, 'faL'), m = new T.Mesh(e.geo, bodies.walkerA.mat);
          m.position.set(0.6, -3, 22); m.frustumCulled = false; root.add(m); parked.push({ loose: m });
        },
      };
      return api;
    },
  };
})();
