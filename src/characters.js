/* Characters: the War Bash soldiers and their thirty outfits, standing in this game's world.
   vendor/warbash-soldier.js is War Bash's own soldier code (skeleton, body, equipment, outfit atlas, cloth, pose);
   this file is the host it runs against: where a soldier goes in the scene, what it holds, how its materials sit
   in this renderer, and the small API the rest of the game uses.

     const a = GunslingerCharacters.create({ outfit: 'marshal' });
     a.place(x, y, z, yaw); a.state({ speed, crouch, aiming, ... }); // every frame, then GunslingerCharacters.update(dt)
     a.dispose();

   A soldier's bones are placed in world coordinates (its root never moves), so every actor's root stays at the
   origin of the group it was made in. */
(function () {
  'use strict';
  const C = (window.GunslingerCharacters = { ready: false, pack: null });
  let g = null, T = null, W = null, root = null, scans = null;
  const actors = new Set();
  let _v = null, _w = null;
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* private mode */ } return null; };
  const WORN_KEY = 'gunslinger.outfit';

  // ------------------------------------------------------------------ the weapon a soldier holds
  /* A carbine in the weapon frame War Bash expects: muzzle toward -z, the grip under the origin. Built from a few
     beveled solids; one mesh per material. */
  let gunParts = null;
  function gunGeometry() {
    if (gunParts) return gunParts;
    const steel = new T.MeshStandardMaterial({ color: 0x15171a, roughness: 0.42, metalness: 0.85 });
    const poly = new T.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.62, metalness: 0.05 });
    steel.name = 'gs_char_gun_steel'; poly.name = 'gs_char_gun_poly';
    const box = (w, h, d, x, y, z, rx) => { const b = new T.BoxGeometry(w, h, d); if (rx) b.rotateX(rx); b.translate(x, y, z); return b; };
    const cyl = (r, l, x, y, z, seg) => { const c = new T.CylinderGeometry(r, r, l, seg || 12); c.rotateX(Math.PI / 2); c.translate(x, y, z); return c; };
    const merge = (list) => {
      let nv = 0, ni = 0; for (const q of list) { nv += q.attributes.position.count; ni += q.index.count; }
      const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), I = new Uint16Array(ni); let vo = 0, io = 0;
      for (const q of list) { P.set(q.attributes.position.array, vo * 3); N.set(q.attributes.normal.array, vo * 3); for (let k = 0; k < q.index.count; k++) I[io + k] = q.index.array[k] + vo; vo += q.attributes.position.count; io += q.index.count; q.dispose(); }
      const out = new T.BufferGeometry(); out.setAttribute('position', new T.BufferAttribute(P, 3)); out.setAttribute('normal', new T.BufferAttribute(N, 3)); out.setIndex(new T.BufferAttribute(I, 1)); return out;
    };
    const metal = merge([
      box(0.046, 0.062, 0.2, 0, 0.012, 0.02),                 // upper receiver
      box(0.044, 0.05, 0.16, 0, -0.03, 0.03),                 // lower receiver
      cyl(0.0095, 0.3, 0, 0.012, -0.31, 12),                  // barrel
      cyl(0.013, 0.05, 0, 0.012, -0.47, 10),                  // muzzle device
      box(0.02, 0.022, 0.24, 0, 0.055, -0.05),                // top rail
      box(0.012, 0.03, 0.02, 0, 0.078, 0.05), box(0.012, 0.03, 0.02, 0, 0.078, -0.33), // sights
      cyl(0.016, 0.12, 0, 0.012, 0.19, 10),                   // buffer tube
    ]);
    const furniture = merge([
      box(0.05, 0.056, 0.26, 0, 0.01, -0.21),                 // handguard
      box(0.034, 0.1, 0.045, 0, -0.085, 0.07, 0.3),           // pistol grip
      box(0.03, 0.16, 0.058, 0, -0.12, -0.035, -0.14),        // magazine
      box(0.04, 0.085, 0.17, 0, -0.005, 0.25),                // stock
      box(0.044, 0.11, 0.03, 0, -0.02, 0.325),                // butt pad
    ]);
    return (gunParts = { metal, furniture, steel, poly });
  }
  /* The rifle the player carries, as the engine built it for the first-person view: the same geometry in a
     soldier's hands. Its frame is already the one War Bash expects (muzzle toward -z, grip under the origin). The
     first-person materials are tuned for their own lights, so each part gets a plain material of the same color,
     roughness and metal here (all of them one shader program). */
  let rifle = null;
  function rifleParts() {
    if (rifle !== null) return rifle || null;
    rifle = false;
    try {
      const rig = g.weapon && g.weapon.rigs && g.weapon.rigs.rifle, src = rig && rig.root; if (!src) return null;
      src.updateMatrixWorld(true);
      const inv = new T.Matrix4().copy(src.matrixWorld).invert(), mats = new Map(), out = [];
      src.traverse((m) => {
        if (!m.isMesh || !m.geometry || !m.material || m.material.isShaderMaterial || m.material.map || !m.material.isMeshStandardMaterial) return;      // no reticle, flash or markings
        for (let up = m.parent; up && up !== src; up = up.parent) if (up.userData && up.userData.gsLauncher) return;                                   // nor the arsenal's launchers, built over the same rig
        const tris = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; if (tris < 12) return;
        let mat = mats.get(m.material);
        if (!mat) { mat = new T.MeshStandardMaterial({ color: m.material.color.clone(), roughness: Math.max(0.3, m.material.roughness), metalness: m.material.metalness }); mat.name = 'gs_char_' + (m.material.name || 'gun'); mats.set(m.material, mat); }
        out.push({ geo: m.geometry, mat, matrix: new T.Matrix4().multiplyMatrices(inv, m.matrixWorld), shadow: tris > 1000 });
      });
      if (out.length >= 3) rifle = out;
    } catch (e) { rifle = false; }
    return rifle || null;
  }
  // ------------------------------------------------------------------ how a soldier's surface sits in this game
  /* War Bash draws its camouflage as flat, hard-edged shapes and lights its soldiers with its own baked volume. Here
     they stand next to scanned stone and wet concrete, so the surface is brought to the same footing:
     - the print is softened and given the grain of dyed cloth before it goes into the atlas (printCamo);
     - the fabric relief is stronger, and the recognition bands are plain cloth, not lit strips (finishMaterial);
     - cloth fades and stains unevenly, carries the ground's dirt from the boots up, and darkens and shines where
       rain lands on it (surfaceShader). The three numbers a map can change are in LOOK (map.soldierLook). */
  const LOOK = { wet: 0.55, mudHeight: 0.52, mud: 0.6, dirt: [0.085, 0.07, 0.055] };
  const U = { wet: { value: LOOK.wet }, mud: { value: null }, dirt: { value: null } };
  function printCamo(canvas, fp) {
    const n = canvas.width, c = canvas.getContext('2d'); if (!c || !c.getImageData) return;
    // soften the edges of the shapes: a wrapped copy, blurred, laid back over the print (it must still tile)
    if ('filter' in c) {
      const pad = 16, t = document.createElement('canvas'); t.width = t.height = n + pad * 2;
      const q = t.getContext('2d');
      for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) q.drawImage(canvas, pad + dx, pad + dy);
      c.save(); c.filter = `blur(${fp ? 1.1 : 1.6}px)`; c.globalAlpha = 0.72; c.drawImage(t, -pad, -pad); c.restore();
    }
    // dyed cloth is never one flat value: fine grain, and a slow drift of tone across the bolt
    const im = c.getImageData(0, 0, n, n), d = im.data; let s = 9173;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4, drift = Math.sin((x / n) * Math.PI * 2 * 2 + 1.3) * Math.sin((y / n) * Math.PI * 2 * 3 + 0.4) * 0.035;
        const k = 1 + (rnd() - 0.5) * 0.11 + drift, g = (d[i] + d[i + 1] + d[i + 2]) / 3;
        // a little of the color taken out as well: field cloth is washed and sun-bleached
        d[i] = Math.max(0, Math.min(255, (d[i] * 0.9 + g * 0.1) * k)); d[i + 1] = Math.max(0, Math.min(255, (d[i + 1] * 0.9 + g * 0.1) * k)); d[i + 2] = Math.max(0, Math.min(255, (d[i + 2] * 0.9 + g * 0.1) * k));
      }
    }
    c.putImageData(im, 0, 0);
  }
  function finishMaterial(m, skin) {
    m.name = 'gs_soldier';
    m.normalScale.set(0.62, 0.62);
    m.envMapIntensity = 1;
    // bands: a strip of pale cloth on the arm and the helmet, lit like the rest
    const u = m.userData.skU; if (u) { u.tag.value.setRGB(0.3, 0.33, 0.24); u.glow.value = 0; u.neon.value = Math.min(u.neon.value, 0.5); }
  }
  const GLSL_NOISE = `
uniform float uGsWet; uniform vec2 uGsMud; uniform vec3 uGsDirt; varying vec3 vGsRest;
float gsHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gsNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gsHash(i), gsHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(gsHash(i + vec3(0.0, 1.0, 0.0)), gsHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(gsHash(i + vec3(0.0, 0.0, 1.0)), gsHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(gsHash(i + vec3(0.0, 1.0, 1.0)), gsHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }`;
  function surfaceShader(s) {
    if (!U.mud.value) { U.mud.value = new T.Vector2(LOOK.mudHeight, LOOK.mud); U.dirt.value = new T.Color(LOOK.dirt[0], LOOK.dirt[1], LOOK.dirt[2]); }
    s.uniforms.uGsWet = U.wet; s.uniforms.uGsMud = U.mud; s.uniforms.uGsDirt = U.dirt;
    const need = (src, anchor) => { if (src.indexOf(anchor) < 0) throw new Error('soldier shader: no ' + anchor); };
    for (const a of ['#include <begin_vertex>']) need(s.vertexShader, a);
    for (const a of ['#include <color_fragment>', '#include <roughnessmap_fragment>', '#include <normal_fragment_maps>']) need(s.fragmentShader, a);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGsRest;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGsRest = position;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>' + GLSL_NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
  float gsN = gsNoise(vGsRest * 8.0) * 0.6 + gsNoise(vGsRest * 27.0) * 0.4;
  float gsMud = smoothstep(uGsMud.x, 0.03, vGsRest.y + (gsN - 0.5) * 0.3) * uGsMud.y;
  diffuseColor.rgb *= 0.88 + 0.24 * gsN;
  diffuseColor.rgb = mix(diffuseColor.rgb, uGsDirt * (0.65 + 0.7 * gsN), gsMud);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.95, gsMud * 0.7);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    float gsUp = inverseTransformDirection(normal, viewMatrix).y;
    float gsWet = uGsWet * smoothstep(0.05, 0.8, gsUp) * (0.45 + 0.55 * gsNoise(vGsRest * 14.0 + 3.7));
    diffuseColor.rgb *= 1.0 - 0.34 * gsWet;
    roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.42, gsWet * (1.0 - metalnessFactor));
  }`);
  }
  C.look = function (o) {
    Object.assign(LOOK, o || {});
    U.wet.value = LOOK.wet; if (U.mud.value) { U.mud.value.set(LOOK.mudHeight, LOOK.mud); U.dirt.value.setRGB(LOOK.dirt[0], LOOK.dirt[1], LOOK.dirt[2]); }
  };
  const HOST = {
    root: null, camera: null, anim: null, lean: false,
    scans: { cloths: 'assets/soldier/cloths.webp', tintScan: 'assets/soldier/tintScan.webp' },
    gun() {
      const group = new T.Group(), real = rifleParts();
      // up close the engine's rifle, part for part; from afar (and where there is no such rifle) a few plain solids
      if (real) for (const q of real) { const m = new T.Mesh(q.geo, q.mat); m.matrixAutoUpdate = false; m.matrix.copy(q.matrix); m.castShadow = q.shadow; m.receiveShadow = true; m.userData.lod = 'hi'; group.add(m); }
      const G = gunGeometry();
      for (const [geo, mat] of [[G.metal, G.steel], [G.furniture, G.poly]]) { const m = new T.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.userData.lod = real ? 'lo' : 'both'; m.visible = !real; group.add(m); }
      return { group, muzzle: new T.Vector3(0, real ? 0 : 0.012, real ? -0.531 : -0.5), kind: 'rifle' };
    },
    gunLod(group, hi) { for (const m of group.children) { const l = m.userData.lod; if (l === 'hi') m.visible = hi; else if (l === 'lo') m.visible = !hi; } },
    grips() {
      return rifleParts()
        ? { R: new T.Vector3(0, -0.066, 0.07), L: new T.Vector3(0, -0.034, -0.262), butt: [0, 0.012, 0.345], magP: [0, -0.15, -0.085], slide: 0, lift: 0.048 }
        : { R: new T.Vector3(0, -0.06, 0.062), L: new T.Vector3(0, -0.02, -0.25), butt: [0, 0.02, 0.33], magP: [0, -0.12, -0.035], slide: 0, lift: 0.048 };
    },
    groundHeight(x, z, y) { try { const h = g.physics.groundHeight(x, z, y); return Number.isFinite(h) ? h : y; } catch (e) { return y; } },
    skinMine: () => C.worn(),
    camo: (canvas, skin, fp) => printCamo(canvas, fp),
    finish: (m, skin) => finishMaterial(m, skin),
    shader: (s) => surfaceShader(s),
    /* A soldier who is down. War Bash's ragdoll collides with its own maps; here the body is laid on its back where it
       stood, over two thirds of a second, from whatever pose it was in. */
    startRagdoll(e) {
      const S = e.model, J0 = W.soldierRest().J, c = Math.cos(e.yaw), sn = Math.sin(e.yaw), JI = W.J;
      const gy = HOST.groundHeight(e.pos.x, e.pos.z, e.pos.y + 0.6), to = [];
      for (let i = 0; i < 15; i++) {
        const p = J0[i]; let x = p.x, y = 0.13 - p.z * 0.9, z = p.y - 0.62;
        if (i === JI.KNL || i === JI.KNR) y += 0.1;                                          // knees a little raised
        if (i === JI.ELL || i === JI.ELR) { x *= 1.7; y = 0.07; z += 0.12; }                 // arms fallen open
        if (i === JI.HAL || i === JI.HAR) { x *= 3.1; y = 0.05; z += 0.2; }
        if (i === JI.HEAD) { y = 0.14; x += 0.04; }
        to.push(new T.Vector3(e.pos.x + x * c + z * sn, gy + y, e.pos.z - x * sn + z * c));
      }
      S.rag = { t: 0, from: S.J.map((v) => v.clone()), to };
      if (S.gun) S.gun.visible = false;
    },
    stepRagdoll(e, dt) {
      const S = e.model, R = S.rag; if (!R) return;
      R.t = Math.min(1, R.t + dt / 0.65);
      const k = R.t * R.t * (3 - 2 * R.t), arc = Math.sin(Math.PI * R.t) * 0.08;
      for (let i = 0; i < 15; i++) { S.J[i].lerpVectors(R.from[i], R.to[i], k); S.J[i].y += arc * (i === W.J.PEL ? 0 : 1); }
    },
  };

  // ------------------------------------------------------------------ boot
  C.install = function (game) {
    if (W || !window.WarBashSoldier) return C;
    g = game; T = g.THREE; _v = new T.Vector3(); _w = new T.Vector3();
    root = new T.Group(); root.name = 'gs-characters'; g.scene.add(root);
    HOST.root = root; HOST.camera = g.camera; HOST.anim = window.GS_SOLDIER_ANIM || null;
    { const map = window.GunslingerMap; if (map && map.soldierLook) Object.assign(LOOK, map.soldierLook); U.wet.value = LOOK.wet; }
    W = C.pack = window.WarBashSoldier(T, HOST);
    scans = W.gearScanLoad().then(() => { C.ready = true; });
    // every frame, menus included: pose the soldiers that were placed, then hand the frame on
    const frame = g.render.frame.bind(g.render); let failed = false;
    g.render.frame = (dt) => {
      if (!failed) { try { stageFrame(dt); C.update(dt); } catch (e) { failed = true; console.error('[chars] update threw: ' + ((e && e.stack) || e)); } }
      frame(dt);
    };
    return C;
  };
  /* resolves once the fabric scans are decoded: outfits built before that keep a computed weave */
  C.whenReady = () => scans || Promise.resolve();
  /* builds an outfit's geometry and atlas ahead of its first soldier (about half a second, once per outfit) */
  C.prewarm = (id) => C.whenReady().then(() => {
    const s = W.skinId(id || C.worn()), steps = [() => W.soldierGeometry(s, 'hi'), () => W.soldierGeometry(s, 'lo'), () => W.soldierMaterial(s, 0)];
    steps.forEach((f, i) => setTimeout(() => { try { f(); } catch (e) { /* built on demand instead */ } }, i * 350));       // a piece at a time: the title keeps moving
  });
  C.ids = () => (W ? Object.keys(W.SKINS) : []);
  C.info = (id) => (W && W.SKINS[id]) || null;
  C.worn = function (set) {
    if (set !== undefined) { if (W && W.SKINS[set]) store(WORN_KEY, set); return C.worn(); }
    const v = store(WORN_KEY), A = window.GunslingerAchievements;
    return W && v && W.SKINS[v] && (!A || A.unlocked(v)) ? v : 'assault';              // an outfit not yet earned is not worn
  };

  // ------------------------------------------------------------------ actors
  C.create = function (o = {}) {
    if (!W) return null;
    const skin = W.skinId(o.outfit), parent = o.parent || root;
    const model = W.makeSoldier(skin, 0, 'rifle');
    if (model.root.parent !== parent) parent.add(model.root);
    W.setSoldierLod(model, true);
    const e = { model, skin, pos: new T.Vector3(), vel: new T.Vector3(), yaw: 0, pitch: 0, crouchAmt: 0, sprinting: false, onGround: true, vy: 0, alive: true, isPlayer: false, isRemote: true,
      visible: false, target: null, lastShotT: -99, lastSeenT: -99, arms: { adsW: 0, reload: null }, recoil: 0, throwT: 0, slide: false, slideT: 0, slideAmt: 0 };
    W.entities.push(e);
    const a = {
      e, model, root: model.root, outfit: skin,
      place(x, y, z, yaw) { e.pos.set(x, y, z); if (yaw !== undefined) e.yaw = yaw; return a; },
      state(s) {
        if (s.vx !== undefined) e.vel.set(s.vx, 0, s.vz || 0);
        if (s.pitch !== undefined) e.pitch = s.pitch;
        if (s.crouch !== undefined) e.crouchAmt = s.crouch;
        if (s.sprint !== undefined) e.sprinting = !!s.sprint;
        if (s.aiming !== undefined) e.arms.adsW = s.aiming ? 1 : 0;
        if (s.alive !== undefined) e.alive = !!s.alive;
        return a;
      },
      fired() { e.lastShotT = W.MATCH.time; e.recoil = 1; },
      head() { return model.bones[W.SB.HEA].position; },
      wear(id) { const s = W.skinId(id); if (s !== a.outfit) { a.outfit = e.skin = s; W.soldierLook(model, s, 0); } return a; },
      show(v) { a.hidden = !v; model.root.visible = !!v; return a; },
      dispose() {
        const i = W.entities.indexOf(e); if (i >= 0) W.entities.splice(i, 1);
        W.clothDetach(model); model.root.removeFromParent(); actors.delete(a);
      },
    };
    actors.add(a);
    return a;
  };
  /* once a frame, after every actor was placed */
  C.update = function (dt) {
    if (!W || !actors.size) return;
    W.MATCH.time += dt;
    const cam = g.camera.position;
    for (const a of actors) {
      if (a.asleep) continue;
      // the detailed body up close, the light one beyond thirty metres (and back inside twenty-six)
      const p = a.e.pos, d2 = (p.x - cam.x) * (p.x - cam.x) + (p.z - cam.z) * (p.z - cam.z), hi = a.model.lod.hiOn;
      if (hi && d2 > 900) W.setSoldierLod(a.model, false); else if (!hi && d2 < 676) W.setSoldierLod(a.model, true);
      W.animSoldier(a.e, dt); if (a.hidden) a.model.root.visible = false;
    }
    W.clothUpdate(dt);
  };
  C.count = () => actors.size;

  // ------------------------------------------------------------------ the stage: one soldier shown in the world
  /* The Operators screen shows the outfit on a soldier standing in the map itself, under the map's own light, and
     takes the camera while it is open. A map may name its spot (map.stage = { at, cam, turn, fov }): where the soldier
     stands, a point the camera looks from (its direction and height; the distance is fitted), how far the soldier is
     turned away from facing it, and the lens. */
  const STAGES = {
    harbor: { at: [-6, 0, 20], cam: [-4.6, 1.3, 23], turn: 0.42, fov: 32 },
    vigil: { at: [0, 0.02, 17.4], cam: [0.5, 1.3, 21.5], turn: 0.42, fov: 32, key: 15, keyColor: 0xffe2bd },
  };
  const stage = { on: false, actor: null, spin: 0, def: null, t: 0, cx: 0.5, cy: 0.5, fit: 1, fov: 0 };
  C.stage = stage;
  C.stageOpen = function (outfit) {
    if (!W) return false;
    const map = window.GunslingerMap, id = (window.GunslingerMapSelect && window.GunslingerMapSelect.id) || 'harbor';
    stage.def = (map && map.stage) || STAGES[id] || STAGES.harbor;
    if (!stage.actor) stage.actor = C.create({ outfit });
    stage.actor.wear(outfit).show(true); stage.actor.asleep = false;
    const d = stage.def, y = HOST.groundHeight(d.at[0], d.at[2], d.at[1] + 1) ;
    stage.y = Number.isFinite(y) && Math.abs(y - d.at[1]) < 1.5 ? y : d.at[1];
    stage.spin = 0; stage.t = 0; stage.on = true;
    if (!stage.fov) stage.fov = g.camera.fov;
    // a soft key light where the map is dark: one of the engine's pooled lights, so no shader is recompiled for it
    if (d.key && !stage.key && g.render.lightPool && g.render.lightPool.acquire) stage.key = g.render.lightPool.acquire();
    if (stage.key) {
      const dx = d.cam[0] - d.at[0], dz = d.cam[2] - d.at[2], l = Math.hypot(dx, dz) || 1, L = stage.key.light;
      L.position.set(d.at[0] + (dx / l) * 2.3 - (dz / l) * 1.5, stage.y + 2.35, d.at[2] + (dz / l) * 2.3 + (dx / l) * 1.5);
      L.color.set(d.keyColor || 0xffffff); L.distance = 9; L.intensity = d.key;
    }
    return true;
  };
  C.stageWear = (outfit) => { if (stage.actor) stage.actor.wear(outfit); };
  C.stageSpin = (d) => { stage.spin += d; };
  /* where on the screen the soldier stands (fractions of its width and height) and how much of the height is free */
  C.stageView = (cx, cy, fit) => { stage.cx = cx; stage.cy = cy; stage.fit = Math.max(0.3, fit || 1); };
  C.stageClose = function () {
    if (!stage.on) return;
    stage.on = false;
    if (stage.actor) { stage.actor.show(false); stage.actor.asleep = true; }
    if (stage.key) { stage.key.release(); stage.key = null; }
    const cam = g.camera; cam.clearViewOffset(); if (stage.fov) cam.fov = stage.fov; stage.fov = 0; cam.updateProjectionMatrix();
  };
  function stageFrame(dt) {
    if (!stage.on || !stage.actor) return;
    const d = stage.def, cam = g.camera;
    stage.t += dt;
    const face = Math.atan2(-(d.cam[0] - d.at[0]), -(d.cam[2] - d.at[2]));                       // toward the camera
    stage.actor.place(d.at[0], stage.y, d.at[2], face + (d.turn || 0) + stage.spin).state({ vx: 0, vz: 0, pitch: 0, crouch: 0, sprint: false, aiming: false, alive: true });
    // the camera looks straight at the soldier from the stage's side, far enough for the whole figure to fit the free
    // height; the picture is then shifted so the figure sits in the middle of the free part of the screen
    const mid = _v.set(d.at[0], stage.y + 0.98, d.at[2]), dir = _w.set(d.cam[0] - d.at[0], 0, d.cam[2] - d.at[2]).normalize();
    const dist = 2.1 / (0.86 * stage.fit * 2 * Math.tan((d.fov * Math.PI) / 360));
    cam.position.copy(mid).addScaledVector(dir, dist); cam.position.y = stage.y + (d.cam[1] - d.at[1]);
    cam.lookAt(mid);
    const w = window.innerWidth || 1, h = window.innerHeight || 1;
    cam.fov = d.fov; cam.setViewOffset(w, h, (0.5 - stage.cx) * w, (0.5 - stage.cy) * h, w, h);
    cam.updateMatrixWorld(true);
  }
})();
