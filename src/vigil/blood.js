/* Blood: what comes off the dead when they are hit and when they die, and what it leaves behind.

   Two things are drawn, each in one call.

   Drops in the air: a fixed pool of small quads, each stretched along the way it is moving, thrown out of a
   wound (most of it out of the far side, some back toward the gun), up out of a neck, out of a stump for as long
   as the thing it belongs to keeps walking, and all round a body that is blown apart. They fall, and are gone
   when they reach the floor under where they started. Their shader is its own: it takes its light from the
   lamps, the flashlight, the pooled flashes (so a muzzle flash lights what it has just let out) and the moon,
   and makes no light and no shader variant of anything else.

   Marks on the world: one instanced mesh of flat quads, lit like any surface (a standard material: they take
   the lamps, the shadows and the fog of what they lie on) and wet enough to shine. Where a mark goes is found
   with a ray through the level's colliders, a few a frame, a moment after the blood left the body: the floor
   beyond and beneath it, the wall behind it. A wall's mark runs down. A pool spreads under a body once it lies
   still. A mark stays for the rest of the night. There is room for `V.BLOOD.stains` of them; after that the
   oldest is painted over. No more than a few begin in the same half metre of the same surface: after that the
   ones already there grow, so a floor fought over for an hour is covered, not stacked.

   A mark on something that can be broken belongs to it: when the collider it was put on goes (a wall bay comes
   down, a barricade is taken away) the mark goes too, and one on a stump that still stands stays.

   The player chooses (Settings): blood on or off, its colour, or a different colour for every wound. With it
   off nothing here is drawn or made, and the dead give off dust.

   `V.bloodColour`, `V.bloodStep`, `V.bloodBasis`, `V.bloodStore` and `V.bloodPrefs` are the arithmetic, kept
   apart so they can be tested without a renderer. Nothing of it is sent between players. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const TAU = Math.PI * 2, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  V.BLOOD = {
    drops: 1500,                 // in the air at once; when all are flying a new one takes the place of one of them
    stains: 6000,                // marks kept; when all are used the oldest is painted over
    cell: 0.5, perCell: 4,       // marks that may begin in one half metre of one surface before the ones there grow instead
    rays: 10,                    // rays a frame, looking for where a mark lands
    queue: 96,                   // marks waiting for their ray; the oldest waiting is dropped past this
    far: 48,                     // metres from the camera past which a wound throws nothing
    bleeders: 40,                // stumps, necks and bodies being watched at once
    air: 2,                    // how much brighter it is in the air than lying on a surface
    busy: 14,                    // wounds in one frame past which the rest throw less and mark nothing
    // the colours offered in Settings: id, name, colour as it is typed (sRGB)
    colours: [['red', 'Red', '#6a0808'], ['green', 'Green', '#2f7a12'], ['blue', 'Blue', '#173fa0'], ['purple', 'Purple', '#5e1890'], ['yellow', 'Yellow', '#a8880c'], ['black', 'Black', '#0a0a0c']],
  };

  // ---- colour ----
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const HEX = /^#[0-9a-f]{6}$/i;
  const hexLin = (hex, out) => {
    const h = HEX.test(hex) ? hex : V.BLOOD.colours[0][2];
    for (let i = 0; i < 3; i++) out[i] = toLin(parseInt(h.substr(1 + i * 2, 2), 16) / 255);
    return out;
  };
  const hsv = (h, s, v, out) => {
    const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s), k = ((i % 6) + 6) % 6;
    out[0] = [v, q, p, p, t, v][k]; out[1] = [t, v, v, q, p, p][k]; out[2] = [p, p, t, v, v, q][k];
    return out;
  };
  // The colour of one wound, as the renderer wants it (linear): the chosen one, or with 'rainbow' any hue at all.
  V.bloodColour = (prefs, rnd = Math.random, out = [0, 0, 0]) => {
    const id = prefs && prefs.colour;
    if (id === 'rainbow') { hsv(rnd(), 0.9, 0.72, out); for (let i = 0; i < 3; i++) out[i] = toLin(out[i]); return out; }
    const row = V.BLOOD.colours.find((c) => c[0] === id);
    return hexLin(id === 'custom' ? prefs.custom : row ? row[2] : '', out);
  };

  // ---- what the player chose, kept in the browser ----
  V.bloodPrefs = {
    KEY: 'gunslinger.blood.v1',
    clean(o) {
      o = o && typeof o === 'object' ? o : {};
      const ids = V.BLOOD.colours.map((c) => c[0]).concat('rainbow', 'custom');
      return { on: o.on !== false, colour: ids.includes(o.colour) ? o.colour : 'red', custom: HEX.test(o.custom) ? String(o.custom).toLowerCase() : '#d4147a' };
    },
    read(store) { try { return this.clean(JSON.parse((store && store.getItem(this.KEY)) || '{}')); } catch (e) { return this.clean(null); } },
    write(store, p) { try { if (store) store.setItem(this.KEY, JSON.stringify(this.clean(p))); } catch (e) { /* not remembered */ } },
  };

  // ---- a drop in the air ----
  // p = { x, y, z, vx, vy, vz, t, life, g, drag, floor }: forward by dt. False when it has landed or is spent.
  V.bloodStep = (p, dt) => {
    p.t += dt;
    if (p.t >= p.life) return false;
    const d = Math.max(0, 1 - p.drag * dt);
    p.vx *= d; p.vz *= d; p.vy = p.vy * d - p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    return p.y > p.floor;
  };

  // ---- how a mark lies on a surface ----
  // The two directions across a surface whose normal is (nx, ny, nz), turned by `spin` about it: out = [t, b],
  // with t x b = n. On a wall b points up before the turn, so a mark that runs, runs down; on a floor or a
  // ceiling the turn is measured from the x axis.
  V.bloodBasis = (nx, ny, nz, spin = 0, out = [0, 0, 0, 0, 0, 0]) => {
    let tx, ty, tz, bx, by, bz;
    if (Math.abs(ny) < 0.7) {
      bx = -nx * ny; by = 1 - ny * ny; bz = -nz * ny;
      const l = Math.hypot(bx, by, bz) || 1; bx /= l; by /= l; bz /= l;
      tx = by * nz - bz * ny; ty = bz * nx - bx * nz; tz = bx * ny - by * nx;
    } else {
      tx = 1 - nx * nx; ty = -ny * nx; tz = -nz * nx;
      const l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
      bx = ny * tz - nz * ty; by = nz * tx - nx * tz; bz = nx * ty - ny * tx;
    }
    const c = Math.cos(spin), s = Math.sin(spin);
    out[0] = tx * c + bx * s; out[1] = ty * c + by * s; out[2] = tz * c + bz * s;
    out[3] = bx * c - tx * s; out[4] = by * c - ty * s; out[5] = bz * c - tz * s;
    return out;
  };

  // ---- places for marks ----
  // `max` places, handed out lowest first; when none is free the oldest mark gives its place up (`evicted(i)` is
  // told). A place taken back early (`remove`) is handed out again before anything is painted over.
  V.bloodStore = (max) => {
    const live = new Uint8Array(max), stamp = new Uint32Array(max), free = [];
    let order = [], head = 0, n = 0, clock = 0, high = 0;
    for (let i = max - 1; i >= 0; i--) free.push(i);
    return {
      max,
      get count() { return n; },
      get high() { return high; },                       // one past the highest place ever used
      live: (i) => live[i] === 1,
      stamp: (i) => stamp[i],
      add(evicted) {
        let i;
        if (free.length) i = free.pop();
        else {
          for (;;) { const a = order[head], st = order[head + 1]; head += 2; if (live[a] && stamp[a] === st) { i = a; break; } }
          if (evicted) evicted(i);
          n--;
        }
        live[i] = 1; stamp[i] = ++clock; n++; order.push(i, clock);
        if (i + 1 > high) high = i + 1;
        if (head > 4096) { order = order.slice(head); head = 0; }
        return i;
      },
      remove(i) { if (!live[i]) return false; live[i] = 0; n--; free.push(i); return true; },
      clear() { live.fill(0); free.length = 0; for (let i = max - 1; i >= 0; i--) free.push(i); order = []; head = 0; n = 0; high = 0; },
    };
  };

  const nothing = () => {};
  V.blood = {
    prefs: V.bloodPrefs.clean(null),
    hit: nothing, death: nothing, sever: nothing, decap: nothing, splat: nothing, burst: nothing, update: nothing, reset: nothing, fill: nothing,
    count: () => 0, stains: () => 0, waiting: () => 0,
    // the colour for the engine's own small effects on a hit (its dust and chips), or null with blood off
    tint() { return this.prefs.on ? V.bloodColour(this.prefs) : null; },
    set(patch) { this.prefs = V.bloodPrefs.clean(Object.assign({}, this.prefs, patch)); let s = null; try { s = window.localStorage; } catch (e) { /* none */ } V.bloodPrefs.write(s, this.prefs); if (this.apply) this.apply(); },

    install(g) {
      const T = g.THREE, self = this, B = V.BLOOD;
      let store = null; try { store = window.localStorage; } catch (e) { /* none */ }
      this.prefs = V.bloodPrefs.read(store);
      if (!T || !T.InstancedMesh || !T.InstancedBufferGeometry || typeof document === 'undefined') return;
      const rand = (lo, hi) => lo + Math.random() * (hi - lo);
      const cam = g.camera, up = new T.Vector3(0, 1, 0);
      const O = new T.Vector3(), D = new T.Vector3(), P = new T.Vector3(), Q = new T.Vector3();
      let clock = 0, wounds = 0;
      // (the warm-up shows it once whatever the player chose, so turning it on later costs nothing: `forced`, until the next reset)
      const on = () => !!(self.prefs.on || self.forced);

      // ------------------------------------------------------------------ drops
      const MAX = B.drops, LN = 10;
      const geo = new T.InstancedBufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]), 3));
      geo.setIndex([0, 1, 2, 2, 1, 3]);
      const aP = new Float32Array(MAX * 4), aV = new Float32Array(MAX * 4), aC = new Float32Array(MAX * 4);
      const bP = new T.InstancedBufferAttribute(aP, 4), bV = new T.InstancedBufferAttribute(aV, 4), bC = new T.InstancedBufferAttribute(aC, 4);
      for (const b of [bP, bV, bC]) b.setUsage(T.DynamicDrawUsage);
      geo.setAttribute('aP', bP); geo.setAttribute('aV', bV); geo.setAttribute('aC', bC);
      geo.instanceCount = 0; geo.boundingSphere = new T.Sphere(new T.Vector3(), 1e5);
      const U = {
        uL: { value: Array.from({ length: LN }, () => new T.Vector4(0, -100, 0, 1)) }, uLC: { value: Array.from({ length: LN }, () => new T.Vector3()) },
        uAmb: { value: new T.Vector3(0.02, 0.022, 0.03) }, uTP: { value: new T.Vector3() }, uTD: { value: new T.Vector3(0, 0, -1) }, uTC: { value: new T.Vector3() }, uTCos: { value: 0.9 },
        uFog: { value: new T.Vector4(0, 0, 0, 0) },
      };
      const dropMat = new T.ShaderMaterial({
        uniforms: U, transparent: true, depthWrite: false, fog: false, side: T.DoubleSide,
        vertexShader: `
          attribute vec4 aP, aV, aC; varying vec4 vC; varying vec2 vUv; varying vec3 vW; varying float vK, vZ;
          void main(){
            vUv = position.xy * 2.0; vC = aC; vW = aP.xyz; vK = aV.w;
            vec4 mv = modelViewMatrix * vec4(aP.xyz, 1.0);
            vec2 vv = (modelViewMatrix * vec4(aV.xyz, 0.0)).xy;
            float sp = length(vv);
            vec2 along = sp > 1e-3 ? vv / sp : vec2(0.0, 1.0), side = vec2(along.y, -along.x);     // (side x along faces the camera)
            // a drop is drawn out along the way it is going; a puff of it (aV.w 0) is round
            float wide = max(aP.w, aV.w * 0.0026 * -mv.z);                // (never thinner than a pixel and a half)
            float len = wide + aV.w * min(sp, 12.0) * 0.02;
            mv.xy += along * position.y * len + side * position.x * wide;
            vZ = -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec4 uL[${LN}]; uniform vec3 uLC[${LN}]; uniform vec3 uAmb, uTP, uTD, uTC; uniform float uTCos; uniform vec4 uFog;
          varying vec4 vC; varying vec2 vUv; varying vec3 vW; varying float vK, vZ;
          void main(){
            float d = dot(vUv, vUv); if (d > 1.0) discard;
            vec3 L = uAmb + 0.05;                                         // (seen, a little, in the dark too)
            for (int i = 0; i < ${LN}; i++) {
              vec3 q = uL[i].xyz - vW; float d2 = dot(q, q), w = clamp(1.0 - d2 * d2 * uL[i].w * uL[i].w, 0.0, 1.0);
              L += uLC[i] * (w * w / max(d2, 0.05));
            }
            vec3 tq = vW - uTP; float td = max(length(tq), 0.05);
            L += uTC * (smoothstep(uTCos, mix(uTCos, 1.0, 0.35), dot(tq / td, uTD)) / (td * td));
            float edge = mix((1.0 - d) * (1.0 - d), smoothstep(1.0, 0.5, d), vK);
            float wet = vK * pow(max(0.0, 1.0 - length(vUv - vec2(0.0, 0.3)) * 1.7), 2.0);     // it is wet: a glint
            vec3 col = vC.rgb * L + L * wet * 0.1;
            col = mix(col, uFog.rgb, 1.0 - exp(-uFog.w * uFog.w * vZ * vZ));
            gl_FragColor = vec4(col, vC.a * edge);
          }`,
      });
      const drops = new T.Mesh(geo, dropMat);
      drops.name = 'vigil-blood-drops'; drops.frustumCulled = false; drops.renderOrder = 902; drops.castShadow = drops.receiveShadow = false; drops.visible = false;
      g.scene.add(drops);
      const pool = [], live = [];
      for (let i = 0; i < MAX; i++) pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, g: 9.8, drag: 0.5, floor: 0, size: 0.03, r: 0, gc: 0, b: 0, a: 1, st: 1 });
      // c: [r, g, b]; soft: a puff, not a drop
      function drop(x, y, z, vx, vy, vz, size, life, c, floor, soft, alpha) {
        let p = pool.pop();
        if (p) live.push(p); else p = live[(Math.random() * live.length) | 0];
        p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.t = 0; p.life = life; p.size = soft ? size : size * 0.62; p.floor = floor;
        p.g = soft ? 1.2 : 9.8; p.drag = soft ? 2.6 : 0.45; p.st = soft ? 0 : 1; p.a = alpha;
        // (in the air it is thin and the light goes through it: brighter than what it leaves on the floor)
        const k = rand(0.8, 1.1) * B.air; p.r = c[0] * k; p.gc = c[1] * k; p.b = c[2] * k;
      }
      // n drops within `spread` of the way d points, at s0 to s1 metres a second (most of them slow)
      function cone(o, d, n, s0, s1, spread, c, floor, size) {
        for (let i = 0; i < n; i++) {
          let vx = d.x + rand(-1, 1) * spread, vy = d.y + rand(-1, 1) * spread, vz = d.z + rand(-1, 1) * spread;
          const l = Math.hypot(vx, vy, vz) || 1, s = s0 + (s1 - s0) * Math.pow(Math.random(), 1.6);
          vx /= l; vy /= l; vz /= l;
          drop(o.x + vx * 0.06, o.y + vy * 0.06, o.z + vz * 0.06, vx * s, vy * s + rand(0.2, 1.3), vz * s, size * rand(0.6, 1.6), rand(0.8, 1.7), c, floor, false, 1);
        }
      }
      // n drops thrown every way, more up than down
      function around(o, n, s0, s1, c, floor, size) {
        for (let i = 0; i < n; i++) {
          const az = rand(0, TAU), el = rand(-0.25, 1.25), s = s0 + (s1 - s0) * Math.pow(Math.random(), 1.4), ce = Math.cos(el);
          drop(o.x, o.y, o.z, Math.cos(az) * ce * s, Math.sin(el) * s + 0.5, Math.sin(az) * ce * s, size * rand(0.6, 1.7), rand(0.9, 1.9), c, floor, false, 1);
        }
      }
      // n puffs of it hanging where it was let out
      function mist(o, n, c, size) {
        for (let i = 0; i < n; i++) drop(o.x + rand(-0.08, 0.08), o.y + rand(-0.08, 0.08), o.z + rand(-0.08, 0.08), rand(-0.9, 0.9), rand(0, 1), rand(-0.9, 0.9), size * rand(0.8, 1.5), rand(0.32, 0.6), c, -1e3, true, 0.55);
      }

      // ------------------------------------------------------------------ marks
      // Sixteen shapes on one sheet, four a row: 0 to 5 a splash with drops thrown round it, 6 to 8 fine spray,
      // 9 to 11 a pool, 12 to 15 a splash that has run down a wall (its middle is above the middle of its cell).
      const N = 4, RUN = 58 / 256;
      function paint() {
        const C = 256, cv = document.createElement('canvas'); cv.width = cv.height = N * C;
        const c = cv.getContext && cv.getContext('2d'); if (!c) return cv;
        let seed = 7919;
        const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }, rr = (a, b) => a + r() * (b - a);
        // thin blood is lighter than thick: what is painted is how much of the colour shows
        const ink = (l, a) => `rgba(${l},${l},${l},${a.toFixed(2)})`;
        const dot = (x, y, rad, fill) => { c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fillStyle = fill; c.fill(); };
        // soft: how far its edge is feathered (the darker middle of a splash has no hard edge)
        const blob = (x, y, rad, rough, fill, n = 26, soft = 0) => {
          const ph = [rr(0, TAU), rr(0, TAU), rr(0, TAU)], pts = [];
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU, k = 1 + rough * Math.sin(a * 2 + ph[0]) + rough * 0.6 * Math.sin(a * 3 + ph[1]) + rough * 0.35 * Math.sin(a * 7 + ph[2]) + rr(-1, 1) * rough * 0.25;
            pts.push([x + Math.cos(a) * rad * k, y + Math.sin(a) * rad * k]);
          }
          c.beginPath();
          for (let i = 0; i <= n; i++) { const p = pts[i % n], q = pts[(i + 1) % n], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; if (!i) c.moveTo(mx, my); else c.quadraticCurveTo(p[0], p[1], mx, my); }
          c.closePath(); c.fillStyle = fill;
          if (soft) { c.shadowColor = fill; c.shadowBlur = soft; }
          c.fill();
          if (soft) { c.shadowBlur = 0; c.shadowColor = 'rgba(0,0,0,0)'; }
        };
        // a run thrown or fallen from (x0, y0) to (x1, y1): wide where it left, narrow along its length, a bead at its end
        const streak = (x0, y0, x1, y1, w0, w1, fill) => {
          const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, px = -dy / l, py = dx / l;
          c.beginPath(); c.moveTo(x0 + px * w0, y0 + py * w0); c.lineTo(x1 + px * w1, y1 + py * w1); c.lineTo(x1 - px * w1, y1 - py * w1); c.lineTo(x0 - px * w0, y0 - py * w0); c.closePath(); c.fillStyle = fill; c.fill();
          dot(x1, y1, w1 * 1.45, fill);
        };
        const cell = (i, fn) => { const ox = (i % N) * C, oy = Math.floor(i / N) * C; c.save(); c.beginPath(); c.rect(ox + 3, oy + 3, C - 6, C - 6); c.clip(); c.translate(ox + C / 2, oy + C / 2); fn(); c.restore(); };
        // fine drops round (cx, cy), thinning outward, each drawn out along the way it flew
        const spray = (cx, cy, R, far, n) => { for (let k = 0; k < n; k++) { const a = rr(0, TAU), d = R + Math.pow(r(), 1.7) * (far - R), w = Math.max(0.7, rr(0.8, 3.6) * (1 - d / (far * 1.25))); c.beginPath(); c.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, w * rr(1, 2.4), w, a, 0, TAU); c.fillStyle = ink(245, rr(0.55, 0.95)); c.fill(); } };
        for (let i = 0; i < 6; i++) cell(i, () => {
          const R = rr(34, 50), n = 2 + Math.floor(r() * 4);
          spray(0, 0, R, 120, 120);
          // smaller rounds over its rim make its outline uneven
          for (let k = 0; k < 5; k++) { const a = rr(0, TAU), d = R * rr(0.55, 0.95); blob(Math.cos(a) * d, Math.sin(a) * d, R * rr(0.3, 0.55), 0.22, ink(250, 1), 18); }
          // a few runs thrown out of it, short, with drops beyond the end of each
          for (let k = 0; k < n; k++) {
            const a = rr(0, TAU), b2 = a + rr(-0.25, 0.25), d1 = R + rr(10, Math.min(50, 112 - R));
            streak(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6, Math.cos(b2) * d1, Math.sin(b2) * d1, rr(5, 11), rr(1.4, 3.2), ink(250, 0.97));
            for (let j = 0, d = d1; j < 3; j++) { d += rr(6, 13); if (d > 119) break; dot(Math.cos(b2) * d, Math.sin(b2) * d, rr(1.2, 3.2) * (1 - j * 0.22), ink(250, 0.92)); }
          }
          blob(0, 0, R, 0.22, ink(250, 1)); blob(rr(-4, 4), rr(-4, 4), R * 0.66, 0.18, ink(206, 1), 22, 12); blob(rr(-5, 5), rr(-5, 5), R * 0.36, 0.2, ink(186, 1), 18, 9);
        });
        for (let i = 6; i < 9; i++) cell(i, () => {
          for (let k = 0; k < 230; k++) { const a = rr(0, TAU), d = Math.abs(rr(-1, 1) + rr(-1, 1) + rr(-1, 1)) * 40; dot(Math.cos(a) * d, Math.sin(a) * d, rr(0.6, 2.7), ink(250, rr(0.5, 0.95))); }
          for (let k = 0; k < 9; k++) { const a = rr(0, TAU), d = rr(0, 70); dot(Math.cos(a) * d, Math.sin(a) * d, rr(3, 6.5), ink(240, 0.95)); }
        });
        for (let i = 9; i < 12; i++) cell(i, () => {
          const R = rr(86, 94);
          blob(0, 0, R, 0.1, ink(250, 1), 34); blob(rr(-4, 4), rr(-4, 4), R * 0.8, 0.09, ink(214, 1), 30, 14); blob(rr(-5, 5), rr(-5, 5), R * 0.52, 0.12, ink(186, 1), 26, 16);
          for (let k = 0; k < 7; k++) { const a = rr(0, TAU), d = Math.min(118, R * rr(1.08, 1.24)); dot(Math.cos(a) * d, Math.sin(a) * d, rr(2, 5.5), ink(250, 0.95)); }
        });
        for (let i = 12; i < 16; i++) cell(i, () => {
          const R = rr(28, 38), cy = -58, runs = 4 + Math.floor(r() * 4);
          spray(0, cy, R, 62, 46);
          for (let k = 0; k < 7; k++) { const a = rr(Math.PI * 0.9, Math.PI * 2.1), d1 = R + rr(8, 26), ca = Math.cos(a), sa = Math.sin(a); streak(ca * R * 0.5, cy + sa * R * 0.5, ca * d1, cy + sa * d1, rr(3, 7), rr(0.9, 2.2), ink(250, 0.96)); }
          for (let k = 0; k < runs; k++) { const x = rr(-R * 0.8, R * 0.8), w = rr(2.6, 5.4); streak(x, cy + rr(0, R * 0.4), x + rr(-3, 3), rr(-6, 116), w, w * rr(0.5, 0.8), ink(236, 0.96)); }
          blob(0, cy, R, 0.2, ink(250, 1)); blob(rr(-3, 3), cy + rr(-3, 3), R * 0.6, 0.16, ink(204, 1), 20, 10);
        });
        return cv;
      }
      const tex = new T.CanvasTexture(paint());
      if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      try { tex.anisotropy = Math.min(4, g.render.renderer.capabilities.getMaxAnisotropy()); } catch (e) { /* as it is */ }
      const SM = B.stains, slots = V.bloodStore(SM);
      const plane = new T.PlaneGeometry(1, 1);
      const cellAt = new T.InstancedBufferAttribute(new Float32Array(SM * 2), 2);
      plane.setAttribute('aCell', cellAt);
      const stainMat = new T.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, alphaTest: 0.05, roughness: 0.7, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      stainMat.name = 'vigil-blood'; stainMat.envMapIntensity = 0.2;
      // each mark shows its own sixteenth of the sheet; if three.js ever renames this, every mark would show all of it
      const ANCHOR = '#include <uv_vertex>';
      stainMat.onBeforeCompile = (sh) => {
        if (!sh.vertexShader.includes(ANCHOR)) { self.shaderError = 'blood: the vertex shader has no ' + ANCHOR; console.error('[vigil] ' + self.shaderError); return; }
        sh.vertexShader = 'attribute vec2 aCell;\n' + sh.vertexShader.replace(ANCHOR, ANCHOR + '\n\tvMapUv = (vMapUv + aCell) * ' + (1 / N).toFixed(4) + ';');
      };
      stainMat.customProgramCacheKey = () => 'vigil-blood-1';
      const marks = new T.InstancedMesh(plane, stainMat, SM);
      marks.name = 'vigil-blood-marks'; marks.frustumCulled = false; marks.renderOrder = 2; marks.castShadow = false; marks.receiveShadow = true;
      marks.instanceMatrix.setUsage(T.DynamicDrawUsage); marks.instanceMatrix.array.fill(0);
      marks.setColorAt(0, new T.Color(1, 1, 1));
      marks.count = 0; marks.visible = false;
      g.scene.add(marks);
      const MA = marks.instanceMatrix.array, CA = marks.instanceColor.array;
      const touch = (attr, at, n) => { if (attr.addUpdateRange) attr.addUpdateRange(at, n); attr.needsUpdate = true; };

      const rec = [], cells = new Map(), basis = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < SM; i++) rec.push({ px: 0, py: 0, pz: 0, nx: 0, ny: 1, nz: 0, tx: 1, ty: 0, tz: 0, bx: 0, by: 0, bz: -1, sx: 0, sy: 0, max: 0, off: 0, lift: 0.01, pool: false, box: null, owner: null, key: '' });
      const keyOf = (x, y, z, nx, ny, nz) => Math.floor(x / B.cell) + ',' + Math.floor(y / B.cell + 0.02) + ',' + Math.floor(z / B.cell) + ',' + (Math.abs(ny) > 0.7 ? (ny > 0 ? 0 : 1) : Math.abs(nx) > 0.7 ? (nx > 0 ? 2 : 3) : nz > 0 ? 4 : 5);
      function writeM(i) {
        const s = rec[i], o = i * 16, d = s.off * s.sy;
        MA[o] = s.tx * s.sx; MA[o + 1] = s.ty * s.sx; MA[o + 2] = s.tz * s.sx; MA[o + 3] = 0;
        MA[o + 4] = s.bx * s.sy; MA[o + 5] = s.by * s.sy; MA[o + 6] = s.bz * s.sy; MA[o + 7] = 0;
        MA[o + 8] = s.nx; MA[o + 9] = s.ny; MA[o + 10] = s.nz; MA[o + 11] = 0;
        MA[o + 12] = s.px + s.nx * s.lift - s.bx * d; MA[o + 13] = s.py + s.ny * s.lift - s.by * d; MA[o + 14] = s.pz + s.nz * s.lift - s.bz * d; MA[o + 15] = 1;
        touch(marks.instanceMatrix, o, 16);
      }
      function unlist(i) { const s = rec[i], arr = cells.get(s.key); if (!arr) return; const k = arr.indexOf(i); if (k >= 0) arr.splice(k, 1); if (!arr.length) cells.delete(s.key); }
      function remove(i) {
        if (!slots.remove(i)) return;
        unlist(i); rec[i].box = rec[i].owner = null;
        MA.fill(0, i * 16, i * 16 + 16); touch(marks.instanceMatrix, i * 16, 16);
      }
      const growing = [];
      // A mark where a ray ended. q: { size, r, g, b, kind: 'pool' | 'drip' | 'spat' | 'mist' or none, hx, hz (the way it was thrown), grow }
      function place(pt, n, box, q) {
        const wall = Math.abs(n.y) < 0.7;
        let kind = q.kind || (wall ? (Math.random() < 0.55 ? 'drip' : 'spat') : Math.random() < 0.28 ? 'mist' : 'spat');
        if (wall && kind === 'pool') kind = 'drip'; else if (!wall && kind === 'drip') kind = 'spat';
        let sx = q.size * rand(0.85, 1.2), sy = sx, spin = rand(0, TAU), off = 0, shape = (Math.random() * 6) | 0;
        if (kind === 'drip') { shape = 12 + ((Math.random() * 4) | 0); spin = rand(-0.1, 0.1); sy = sx * rand(1.25, 1.75); off = RUN; }
        else if (kind === 'pool') shape = 9 + ((Math.random() * 3) | 0);
        else if (kind === 'mist') { shape = 6 + ((Math.random() * 3) | 0); sx *= 1.25; sy = sx; }
        else if (!wall && q.hx != null && (q.hx || q.hz)) { spin = Math.atan2(-q.hx, -q.hz) * Math.sign(n.y || 1); sy = sx * rand(1, 1.7); }
        // on a collider's face it stays on that face: no mark hangs past an edge into the air
        let cap = 2.4;
        if (box) {
          const ax = Math.abs(n.x) > 0.7 ? 'x' : Math.abs(n.y) > 0.7 ? 'y' : 'z';
          let e = 1e9;
          for (const k of ['x', 'y', 'z']) if (k !== ax) e = Math.min(e, pt[k] - box.min[k], box.max[k] - pt[k]);
          cap = (Math.max(0, e) + 0.03) / 0.44;                              // the painted part reaches 0.44 of the width from the middle
          if (cap < 0.1) return -1;
          if (sx > cap) { sy *= cap / sx; sx = cap; }
          if (kind === 'drip') { sy = Math.min(sy, (pt.y - box.min.y) / (0.5 + off)); if (sy < 0.12) return -1; }
        }
        const key = keyOf(pt.x, pt.y, pt.z, n.x, n.y, n.z), arr = cells.get(key);
        if (arr && kind === 'pool') {
          // a body falls where another lies: the pool there spreads
          for (const j of arr) {
            const s = rec[j]; if (!s.pool) continue;
            const lim = Math.min(cap, 2.6), st = slots.stamp(j), gr = growing.find((q2) => q2.i === j && q2.stamp === st);
            if (gr) { const k = Math.min(1.3, lim / gr.x1); if (k > 1) { gr.x1 *= k; gr.y1 *= k; gr.dur += 2; } }
            else if (s.sx < lim) { const k = Math.min(1.3, lim / s.sx); growing.push({ i: j, stamp: st, t: 0, dur: 4, x0: s.sx, y0: s.sy, x1: s.sx * k, y1: s.sy * k }); }
            return j;
          }
        } else if (arr && arr.length >= B.perCell) {
          const j = arr[(Math.random() * arr.length) | 0], s = rec[j];
          if (s.sx < s.max) { const k = Math.min(1.12, s.max / s.sx); s.sx *= k; s.sy *= k; writeM(j); }
          return -1;
        }
        const i = slots.add(unlist), s = rec[i];
        V.bloodBasis(n.x, n.y, n.z, spin, basis);
        s.px = pt.x; s.py = pt.y; s.pz = pt.z; s.nx = n.x; s.ny = n.y; s.nz = n.z;
        s.tx = basis[0]; s.ty = basis[1]; s.tz = basis[2]; s.bx = basis[3]; s.by = basis[4]; s.bz = basis[5];
        s.off = off; s.lift = 0.006 + Math.random() * 0.008; s.pool = kind === 'pool'; s.box = box || null; s.owner = (box && V.destruct && V.destruct.byBox && V.destruct.byBox.get(box)) || null;
        s.max = Math.min(cap, Math.max(sx, sy) * 1.6); s.key = key;
        if (arr) arr.push(i); else cells.set(key, [i]);
        const grow = q.grow || (kind === 'drip' ? 3 : 0);
        if (grow) { const k0 = kind === 'drip' ? 0.6 : 0.22; s.sx = kind === 'drip' ? sx : sx * k0; s.sy = sy * k0; growing.push({ i, stamp: slots.stamp(i), t: 0, dur: grow, x0: s.sx, y0: s.sy, x1: sx, y1: sy }); }
        else { s.sx = sx; s.sy = sy; }
        writeM(i);
        const k = rand(0.78, 1.08);
        CA[i * 3] = q.r * k; CA[i * 3 + 1] = q.g * k; CA[i * 3 + 2] = q.b * k; touch(marks.instanceColor, i * 3, 3);
        cellAt.array[i * 2] = shape % N; cellAt.array[i * 2 + 1] = N - 1 - Math.floor(shape / N); touch(cellAt, i * 2, 2);
        if (slots.high !== marks.count) marks.count = slots.high;
        marks.visible = on();
        return i;
      }
      // marks waiting for the blood to get there, then for a ray
      const queue = [];
      function stain(ox, oy, oz, dx, dy, dz, max, size, delay, c, kind, hx, hz, grow) {
        const l = Math.hypot(dx, dy, dz); if (!(l > 1e-6)) return;
        if (queue.length >= B.queue) queue.shift();
        queue.push({ at: clock + delay, ox, oy, oz, dx: dx / l, dy: dy / l, dz: dz / l, max, size, r: c[0], g: c[1], b: c[2], kind, hx, hz, grow });
      }
      // one thrown `dist` metres along (hx, hz) from o and fallen to a floor `drop` metres below it
      function floorStain(o, hx, hz, dist, drop, size, delay, c, kind, grow) {
        const h = Math.max(0.25, drop);
        stain(o.x, o.y, o.z, hx * dist, -h, hz * dist, Math.hypot(dist, h) * 1.7 + 1, size, delay, c, kind, hx, hz, grow);
      }
      function land(q) {
        let hit = null;
        try { hit = g.physics.raycast(O.set(q.ox, q.oy, q.oz), D.set(q.dx, q.dy, q.dz), q.max); } catch (e) { return; }
        if (!hit || hit.surface === 'water' || !hit.normal) return;
        place(hit.point, hit.normal, hit.box, q);
      }
      // what a mark was on has gone or changed shape: it goes with it, unless what is left still holds it
      let sweepT = 2;
      function sweep() {
        const boxes = new Set(g.physics.boxes || []);
        for (let i = 0; i < slots.high; i++) {
          if (!slots.live(i)) continue;
          const s = rec[i]; if (!s.box || boxes.has(s.box)) continue;
          let home = null;
          if (s.owner && s.owner.boxes) for (const b of s.owner.boxes) if (s.px > b.min.x - 0.05 && s.px < b.max.x + 0.05 && s.py > b.min.y - 0.05 && s.py < b.max.y + 0.05 && s.pz > b.min.z - 0.05 && s.pz < b.max.z + 0.05) { home = b; break; }
          if (home) s.box = home; else remove(i);
        }
      }
      if (g.events && g.events.on) g.events.on('vigil:broken', () => { sweepT = Math.min(sweepT, 0.05); });

      // ------------------------------------------------------------------ what throws it
      const tint = [0, 0, 0];
      const colour = () => V.bloodColour(self.prefs, Math.random, tint).slice();
      const floorAt = (p) => { try { const y = g.physics.groundHeight(p.x, p.z, p.y + 0.3); return Number.isFinite(y) ? y : p.y - 1.2; } catch (e) { return p.y - 1.2; } };
      const near = (p) => { const c = cam.position; return (p.x - c.x) * (p.x - c.x) + (p.y - c.y) * (p.y - c.y) + (p.z - c.z) * (p.z - c.z) < B.far * B.far; };
      const ok = (p) => on() && p && Number.isFinite(p.x) && near(p);
      // how much there is in a body: a brute has more than a walker, a bat less
      const sizeOf = (z) => (z ? clamp((z.scale || 1) * (z.mass > 2 ? 1.5 : 1) * (z.beast && !(z.mass > 2) ? 0.7 : 1), 0.55, 2.8) : 1);
      const middle = (z, out) => {
        const E = g.enemies;
        return out.set(z.pos.x, E && E.centreY ? E.centreY(z) : z.pos.y + 1.1 * (z.scale || 1), z.pos.z);
      };
      // D: the way a round was going, level if nobody knows
      const way = (dir) => { if (dir && (dir.x || dir.y || dir.z)) D.copy(dir).normalize(); else { const a = rand(0, TAU); D.set(Math.cos(a), 0, Math.sin(a)); } return D; };
      const turned = (hx, hz, a) => { const c = Math.cos(a), s = Math.sin(a); return [hx * c - hz * s, hx * s + hz * c]; };
      const flat = (d) => { const l = Math.hypot(d.x, d.z); if (l < 1e-3) { const a = rand(0, TAU); return [Math.cos(a), Math.sin(a)]; } return [d.x / l, d.z / l]; };

      // a round, a blade or a blast reaching a body at `point`, going the way `dir` points
      this.hit = (z, point, dir, head) => {
        if (!ok(point)) return;
        const k = sizeOf(z) * (head ? 1.7 : 1), rk = Math.sqrt(k), c = colour(), fl = floorAt(point), light = ++wounds > B.busy, m = light ? 0.4 : 1;
        way(dir);
        // Whoever fired stands behind the round, so what goes out of the far side is hidden by the body: as much
        // again bursts off the near side, wide, where it is seen. O: just outside the wound; Q: just beyond the body.
        O.copy(point).addScaledVector(D, -0.1); Q.copy(point).addScaledVector(D, 0.22);
        cone(Q, D, Math.round(16 * k * m), 2.2, 7.5, 0.55, c, fl, 0.05);                           // out of the far side
        P.copy(D).negate(); P.y += 0.45; P.normalize();
        cone(O, P, Math.round(16 * k * m), 1.2, 5.2, 1.05, c, fl, 0.046);                          // off the near side, every way
        mist(O, head ? 5 : 3, c, 0.5 * rk);
        if (head) cone(O, up, Math.round(18 * m), 2.5, 5.6, 0.45, c, fl, 0.05);
        if (light) return;
        const [hx, hz] = flat(D), h = point.y - fl;
        stain(point.x, point.y, point.z, D.x + rand(-0.25, 0.25), D.y + rand(-0.3, 0.12), D.z + rand(-0.25, 0.25), 2.6 + 1.6 * k, rand(0.5, 0.95) * rk, 0.1, c);
        for (let i = head ? 4 : 3; i > 0; i--) { const [ax, az] = turned(hx, hz, rand(-0.6, 0.6)); floorStain(point, ax, az, rand(0.3, 2.6) * (0.7 + 0.3 * k), h, rand(0.34, 0.8) * rk, 0.26, c); }
        if (Math.random() < 0.5) floorStain(point, hx, hz, rand(-0.25, 0.3), h, rand(0.3, 0.5), 0.34, c, 'mist');
      };
      // everything a body had, all round it (a blast, a burster going off, the warm-up)
      this.burst = (point, k = 1) => {
        if (!ok(point)) return;
        const c = colour(), fl = floorAt(point), rk = Math.sqrt(k), h = point.y - fl;
        around(point, Math.round(64 * k), 3, 9.5, c, fl, 0.046); mist(point, 6, c, 0.55 * rk);
        for (let i = 0; i < 12; i++) { const a = rand(0, TAU); floorStain(point, Math.cos(a), Math.sin(a), rand(0.4, 4) * rk, h, rand(0.5, 1.2) * rk, 0.3, c); }
        for (let i = 0; i < 4; i++) { const a = rand(0, TAU); stain(point.x, point.y, point.z, Math.cos(a), rand(-0.15, 0.3), Math.sin(a), 4.6, rand(0.6, 1.2) * rk, 0.14, c); }
      };
      // one of the dead put down. info: { point, dir, head, blast } as its killer gave them
      this.death = (z, info = {}) => {
        if (!on() || !z || !z.pos) return;
        const at = info.point && Number.isFinite(info.point.x) ? P.copy(info.point) : middle(z, P);
        if (near(at)) {
          const k = sizeOf(z), rk = Math.sqrt(k);
          if (info.blast || (z.cfg && z.cfg.burst && !info.head)) self.burst(at, k * (z.cfg && z.cfg.burst ? 1.5 : 1));
          else {
            const c = colour(), fl = floorAt(at), h = at.y - fl;
            way(info.dir);
            const [hx, hz] = flat(D);
            cone(at, D, Math.round(26 * k), 2, 7, 0.5, c, fl, 0.044); around(at, Math.round(18 * k), 1.5, 4.6, c, fl, 0.04); mist(at, 4, c, 0.4 * rk);
            for (let i = 0; i < 6; i++) { const [ax, az] = turned(hx, hz, rand(-1.1, 1.1)); floorStain(at, ax, az, rand(0.3, 2.8) * rk, h, rand(0.45, 1) * rk, 0.28, c); }
            stain(at.x, at.y, at.z, D.x + rand(-0.3, 0.3), rand(-0.2, 0.2), D.z + rand(-0.3, 0.3), 4.2, rand(0.6, 1.1) * rk, 0.12, c);
          }
        }
        watch({ kind: 'corpse', z, id: z.id, t: 0 });
      };
      // a limb taken off at `at` (the joint `bone` is what is left of it): it gushes, and the stump goes on pumping
      this.sever = (z, bone, at, dir) => {
        if (!on() || !z) return;
        if (ok(at)) {
          const k = sizeOf(z), c = colour(), fl = floorAt(at), h = at.y - fl;
          way(dir); D.y += 0.5; D.normalize();
          cone(at, D, Math.round(26 * k), 2, 5.6, 0.6, c, fl, 0.044); mist(at, 3, c, 0.36);
          for (let i = 0; i < 2; i++) { const a = rand(0, TAU); floorStain(at, Math.cos(a), Math.sin(a), rand(0.15, 1.3), h, rand(0.4, 0.8), 0.3, c); }
        }
        if (bone) watch({ kind: 'stump', z, id: z.id, bone, t: 0, until: rand(6, 9), next: 0.1, n: 0 });
      };
      // a head taken off: what was holding it up empties upward
      this.decap = (z, at, dir) => {
        if (!on() || !z) return;
        if (ok(at)) { const c = colour(), fl = floorAt(at); cone(at, up, Math.round(24 * sizeOf(z)), 2.6, 6, 0.4, c, fl, 0.044); mist(at, 4, c, 0.4); }
        const bone = z.bones && z.bones.head;
        if (bone) watch({ kind: 'neck', z, id: z.id, bone, t: 0, until: 3.2, next: 0, n: 0 });
      };
      // something wet landing (a limb, a head)
      this.splat = (pos, size = 0.4) => {
        if (!ok(pos)) return;
        const c = colour(), fl = floorAt(pos);
        O.set(pos.x, pos.y + 0.1, pos.z); cone(O, up, 7, 0.8, 2.6, 0.9, c, fl, 0.036);
        stain(pos.x, pos.y + 0.3, pos.z, 0, -1, 0, 1.6, size, 0, c);
      };

      // ---- stumps, necks, and bodies waiting to lie still ----
      const watched = [];
      function watch(b) { if (watched.length >= B.bleeders) watched.shift(); watched.push(b); }
      function bleed(dt) {
        for (let i = watched.length - 1; i >= 0; i--) {
          const b = watched[i], z = b.z;
          b.t += dt;
          if (!z.active || z.id !== b.id) { watched.splice(i, 1); continue; }
          if (b.kind === 'corpse') {
            if (b.t < 1.2) continue;
            const still = z.rag ? z.rag.asleep : z.dead ? z.dead.down : true;
            if (!still && b.t < 4) continue;
            watched.splice(i, 1);
            const hips = z.bones && z.bones.hips;
            if (hips && hips.getWorldPosition) hips.getWorldPosition(P); else P.copy(z.pos);
            if (!ok(P)) continue;
            // (a pool is put down whole: it is the one mark that is not held back when the frame is busy)
            const k = sizeOf(z);
            stain(P.x, P.y + 0.5, P.z, 0, -1, 0, 7, rand(1.3, 1.9) * Math.min(1.9, 0.6 + 0.5 * k), 0, colour(), 'pool', 0, 0, 7);
            continue;
          }
          if (b.t > b.until) { watched.splice(i, 1); continue; }
          if (!z.alive && b.kind === 'stump' && b.until - b.t > 2.6) b.until = b.t + 2.6;           // a body does not pump for long
          if ((b.next -= dt) > 0) continue;
          b.bone.getWorldPosition(P);
          if (!ok(P)) { b.next = 0.4; continue; }
          const c = colour(), fl = floorAt(P), left = 1 - b.t / b.until, h = P.y - fl;
          if (b.kind === 'neck') {
            b.next = 0.06;
            cone(P, up, 4, 0.8 + 2.4 * left, 1.4 + 4.4 * left, 0.3, c, fl, 0.04);
            if (++b.n % 5 === 0) { const a = rand(0, TAU); floorStain(P, Math.cos(a), Math.sin(a), rand(0.15, 1.2), h, rand(0.3, 0.6), 0.4, c); }
          } else {
            b.next = rand(0.16, 0.34);
            D.set(P.x - z.pos.x, 0.3, P.z - z.pos.z); if (D.lengthSq() < 0.02) D.set(rand(-1, 1), 0.3, rand(-1, 1)); D.normalize();
            cone(P, D, 4 + Math.round(4 * left), 0.8 + left, 1.6 + 2.4 * left, 0.35, c, fl, 0.036);
            // it leaves a trail where the thing walks
            if (++b.n % 2 === 0) floorStain(P, D.x, D.z, rand(0, 0.35), h, rand(0.2, 0.42), 0.3, c, Math.random() < 0.5 ? 'mist' : 'spat');
          }
        }
      }

      // ---- the light the drops are seen by ----
      const ambient = [], flashes = [];
      try {
        g.scene.traverse((q) => {
          if (q.isAmbientLight || q.isHemisphereLight) ambient.push(q);
          else if (q.isPointLight && q.userData && q.userData.ttl !== undefined) flashes.push(q);
        });
      } catch (e) { /* a scene without them */ }
      function lights() {
        const W = V.world && V.world.lights, uL = U.uL.value, uLC = U.uLC.value, amb = U.uAmb.value.set(0, 0, 0);
        for (const a of ambient) {
          const k = a.intensity / Math.PI;
          if (a.isHemisphereLight) amb.set(amb.x + (a.color.r + a.groundColor.r) * 0.5 * k, amb.y + (a.color.g + a.groundColor.g) * 0.5 * k, amb.z + (a.color.b + a.groundColor.b) * 0.5 * k);
          else amb.set(amb.x + a.color.r * k, amb.y + a.color.g * k, amb.z + a.color.b * k);
        }
        const sun = g.render && g.render.sun;
        if (sun) { const k = sun.intensity * 0.16 / Math.PI; amb.set(amb.x + sun.color.r * k, amb.y + sun.color.g * k, amb.z + sun.color.b * k); }
        let n = 0;
        const put = (l) => {
          if (n >= LN || !l || !(l.intensity > 0.01)) return;
          uL[n].set(l.position.x, l.position.y, l.position.z, l.distance > 0 ? 1 / (l.distance * l.distance) : 0);
          uLC[n].set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity * 0.19); n++;
        };
        if (W && W.slots) for (const s of W.slots) put(s && s.light);
        for (const l of flashes) put(l);
        for (; n < LN; n++) uLC[n].set(0, 0, 0);
        const tl = W && W.torch;
        if (tl && tl.intensity > 0.01 && tl.target) {
          U.uTP.value.copy(tl.position); U.uTD.value.copy(tl.target.position).sub(tl.position).normalize();
          U.uTC.value.set(tl.color.r, tl.color.g, tl.color.b).multiplyScalar(tl.intensity * 0.19); U.uTCos.value = Math.cos(tl.angle);
        } else U.uTC.value.set(0, 0, 0);
        const fog = g.scene.fog;
        if (fog && fog.isFogExp2) U.uFog.value.set(fog.color.r, fog.color.g, fog.color.b, fog.density); else U.uFog.value.w = 0;
      }

      this.update = (dt) => {
        clock += dt; wounds = 0;
        if (!on()) return;
        bleed(dt);
        // the marks whose blood has arrived: a few rays a frame
        let rays = 0;
        for (let i = 0; i < queue.length && rays < B.rays;) { if (queue[i].at > clock) { i++; continue; } const q = queue[i]; queue.splice(i, 1); rays++; land(q); }
        for (let i = growing.length - 1; i >= 0; i--) {
          const gr = growing[i];
          if (!slots.live(gr.i) || slots.stamp(gr.i) !== gr.stamp) { growing.splice(i, 1); continue; }
          gr.t += dt;
          const u = Math.min(1, gr.t / gr.dur), e = 1 - (1 - u) * (1 - u), s = rec[gr.i];
          s.sx = gr.x0 + (gr.x1 - gr.x0) * e; s.sy = gr.y0 + (gr.y1 - gr.y0) * e; writeM(gr.i);
          if (u >= 1) growing.splice(i, 1);
        }
        if ((sweepT -= dt) <= 0) { sweepT = 2; if (slots.count) sweep(); }
        let n = 0;
        for (let i = 0; i < live.length; i++) {
          const p = live[i];
          if (!V.bloodStep(p, dt)) { pool.push(p); continue; }
          live[n] = p;
          const o = n * 4, u = p.t / p.life;
          aP[o] = p.x; aP[o + 1] = p.y; aP[o + 2] = p.z; aP[o + 3] = p.st ? p.size : p.size * (1 + 1.6 * u);
          aV[o] = p.vx; aV[o + 1] = p.vy; aV[o + 2] = p.vz; aV[o + 3] = p.st;
          aC[o] = p.r; aC[o + 1] = p.gc; aC[o + 2] = p.b; aC[o + 3] = p.st ? p.a * Math.min(1, (1 - u) * 6) : p.a * (1 - u) * (1 - u);
          n++;
        }
        live.length = n;
        geo.instanceCount = n; drops.visible = n > 0;
        if (n) { bP.needsUpdate = true; bV.needsUpdate = true; bC.needsUpdate = true; lights(); }
      };
      // a new night: the yard is as it was
      this.reset = () => {
        self.forced = false;
        while (live.length) pool.push(live.pop());
        geo.instanceCount = 0; drops.visible = false;
        queue.length = 0; watched.length = 0; growing.length = 0; cells.clear(); slots.clear();
        for (const s of rec) s.box = s.owner = null;
        MA.fill(0); if (marks.instanceMatrix.clearUpdateRanges) marks.instanceMatrix.clearUpdateRanges();
        marks.instanceMatrix.needsUpdate = true; marks.count = 0; marks.visible = false;
      };
      // for measuring what a covered floor costs: n marks put straight down round (x, z), within `radius`
      this.fill = (n, x, z, radius = 6, y = 0) => {
        const c = colour(), nn = new T.Vector3(0, 1, 0);
        for (let i = 0; i < n; i++) { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * radius; P.set(x + Math.cos(a) * d, y, z + Math.sin(a) * d); place(P, nn, null, { size: rand(0.3, 0.9), r: c[0], g: c[1], b: c[2] }); }
        return slots.count;
      };
      this.count = () => live.length;
      this.stains = () => slots.count;
      this.waiting = () => queue.length;
      this.apply = () => { marks.visible = on() && slots.count > 0; if (!on()) { while (live.length) pool.push(live.pop()); geo.instanceCount = 0; drops.visible = false; queue.length = 0; } if (self.show) self.show(); };
      this.marks = marks; this.drops = drops;
      this.rows(0);
    },

    // Two rows in Settings, under the field of view, built like the engine's own so they take its styles.
    rows(tries) {
      if (typeof document === 'undefined' || this._rows) return;
      const fov = document.querySelector('#s-fov'), row = fov && fov.closest && fov.closest('.row');
      if (!row) { if (tries < 20 && typeof setTimeout === 'function') setTimeout(() => this.rows(tries + 1), 500); return; }
      const self = this, a = document.createElement('div'), b = document.createElement('div');
      a.className = 'row'; a.dataset.row = 'blood';
      a.innerHTML = '<label id="l-blood">Blood</label><button class="toggle" data-gs="blood" aria-labelledby="l-blood" aria-pressed="true"><i></i><span>On</span></button>';
      b.className = 'row'; b.dataset.row = 'blood-colour';
      b.innerHTML = '<label id="l-bloodc">Blood colour</label><div class="gs-blood" role="group" aria-labelledby="l-bloodc">'
        + V.BLOOD.colours.map((c) => `<button class="gs-blood-sw" data-c="${c[0]}" title="${c[1]}" aria-label="${c[1]}" aria-pressed="false" style="--c:${c[2]}"></button>`).join('')
        + '<button class="gs-blood-sw rainbow" data-c="rainbow" title="Rainbow: a different colour for every wound" aria-label="Rainbow" aria-pressed="false"></button>'
        + '<label class="gs-blood-sw custom" title="Your own colour"><input type="color" aria-label="Your own blood colour"></label>'
        + '<span class="gs-blood-name"></span></div>';
      row.after(a); a.after(b);
      const toggle = a.querySelector('button'), pick = b.querySelector('input'), custom = b.querySelector('.custom'), name = b.querySelector('.gs-blood-name');
      toggle.addEventListener('click', () => self.set({ on: !self.prefs.on }));
      for (const sw of b.querySelectorAll('button')) sw.addEventListener('click', () => self.set({ colour: sw.dataset.c }));
      pick.addEventListener('input', () => self.set({ colour: 'custom', custom: pick.value }));
      this.show = () => {
        const p = self.prefs;
        toggle.setAttribute('aria-pressed', String(p.on)); toggle.querySelector('span').textContent = p.on ? 'On' : 'Off';
        b.classList.toggle('off', !p.on);
        for (const sw of b.querySelectorAll('button')) sw.setAttribute('aria-pressed', String(sw.dataset.c === p.colour));
        custom.classList.toggle('on', p.colour === 'custom'); custom.style.setProperty('--c', p.custom); pick.value = p.custom;
        const preset = V.BLOOD.colours.find((c) => c[0] === p.colour);
        name.textContent = p.colour === 'rainbow' ? 'Rainbow' : p.colour === 'custom' ? 'Your own' : preset ? preset[1] : '';
      };
      this._rows = true;
      this.show();
    },
  };
})();
