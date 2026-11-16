/* Fire: the flames of the Churchyard's dead (the abomination's nova and the ring it walks in, a pyre's bolts and
   its own burning, a burster going up).

   One mesh: camera-facing quads drawn in a single call from a fixed pool of particles, additive, lit by nothing
   and lighting nothing (the flashes that go with a blast are the engine's pooled lights, asked for by whoever
   makes the blast). A particle is a soft disc that rises, swells and thins out, going from near white through
   orange to a dull red as it ages. Everything here is drawn where it is put; who is hurt is decided in
   zombies.js. `V.fireRamp` and `V.fireStep` are the colour and the motion, kept apart so they can be tested
   without a renderer. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const TAU = Math.PI * 2;

  // colour and strength at an age of 0 (just lit) to 1 (gone): [r, g, b, alpha]
  V.fireRamp = (u, out = [0, 0, 0, 0]) => {
    const t = u < 0 ? 0 : u > 1 ? 1 : u;
    const k = t < 0.25 ? t / 0.25 : 1, m = t < 0.25 ? 0 : (t - 0.25) / 0.75;
    out[0] = 2.3 - 0.5 * k - 1.15 * m; out[1] = 1.25 - 0.7 * k - 0.47 * m; out[2] = 0.34 - 0.27 * k - 0.055 * m;
    out[3] = Math.min(1, t / 0.08) * (1 - t) * (1 - 0.35 * t);
    return out;
  };
  // one particle forward by dt: p = { x, y, z, vx, vy, vz, t, life, size, rise, drag, grow }. Returns false when it is spent.
  V.fireStep = (p, dt) => {
    p.t += dt;
    if (p.t >= p.life) return false;
    const d = Math.max(0, 1 - p.drag * dt);
    p.vx *= d; p.vz *= d; p.vy = p.vy * d + p.rise * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    return true;
  };

  V.fire = {
    MAX: 520,
    emit() {}, puff() {}, burst() {}, ring() {}, wreathe() {}, update() {}, reset() {}, count: () => 0,
    install(g) {
      const T = g.THREE, MAX = this.MAX;
      if (!T || !T.InstancedBufferGeometry) return;
      const geo = new T.InstancedBufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]), 3));
      geo.setIndex([0, 1, 2, 2, 1, 3]);
      const a = new Float32Array(MAX * 4), b = new Float32Array(MAX * 4);
      const aA = new T.InstancedBufferAttribute(a, 4), aB = new T.InstancedBufferAttribute(b, 4);
      aA.setUsage(T.DynamicDrawUsage); aB.setUsage(T.DynamicDrawUsage);
      geo.setAttribute('aA', aA); geo.setAttribute('aB', aB);
      geo.instanceCount = 0; geo.boundingSphere = new T.Sphere(new T.Vector3(), 1e5);
      const mat = new T.ShaderMaterial({
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
        vertexShader: `
          attribute vec4 aA, aB; varying vec4 vC; varying vec2 vUv;
          void main(){
            vUv = position.xy * 2.0; vC = aB;
            vec4 mv = modelViewMatrix * vec4(aA.xyz, 1.0);
            mv.xy += position.xy * aA.w * vec2(1.0, 1.5);                 // taller than wide: a lick, not a ball
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          varying vec4 vC; varying vec2 vUv;
          void main(){
            float d = dot(vUv, vUv); if (d > 1.0) discard;
            float f = 1.0 - d; f = f * f * (0.55 + 0.45 * f);
            gl_FragColor = vec4(vC.rgb * f, vC.a);
          }`,
      });
      const mesh = new T.Mesh(geo, mat);
      mesh.name = 'vigil-fire'; mesh.frustumCulled = false; mesh.renderOrder = 905; mesh.castShadow = mesh.receiveShadow = false; mesh.visible = false;
      g.scene.add(mesh);
      const pool = [], live = [], ramp = [0, 0, 0, 0];
      for (let i = 0; i < MAX; i++) pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, size: 0.3, rise: 1.5, drag: 1.2, grow: 0.6, heat: 1 });
      const rand = (lo, hi) => lo + Math.random() * (hi - lo);

      // o: { size, life, rise, drag, grow, heat }. When every particle is alight the oldest is taken.
      this.emit = (x, y, z, vx, vy, vz, o = {}) => {
        const p = pool.pop() || live.shift();
        p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.t = 0;
        p.life = o.life || 0.7; p.size = o.size || 0.35; p.rise = o.rise == null ? 1.6 : o.rise; p.drag = o.drag == null ? 1.4 : o.drag; p.grow = o.grow == null ? 0.7 : o.grow; p.heat = o.heat || 1;
        live.push(p);
        return p;
      };
      // a lick of flame where something burns
      this.puff = (x, y, z, size = 0.3, n = 1) => {
        for (let i = 0; i < n; i++) this.emit(x + rand(-0.3, 0.3) * size, y + rand(-0.15, 0.15) * size, z + rand(-0.3, 0.3) * size, rand(-0.3, 0.3), rand(0.4, 1.2), rand(-0.3, 0.3), { size: size * rand(0.7, 1.25), life: rand(0.35, 0.75), rise: 2.2, drag: 1.6 });
      };
      // a ball of it, thrown outward
      this.burst = (x, y, z, n = 24, speed = 6, size = 0.8) => {
        for (let i = 0; i < n; i++) {
          const az = rand(0, TAU), el = rand(-0.25, 1.2), s = speed * rand(0.25, 1), c = Math.cos(el);
          this.emit(x, y, z, Math.cos(az) * c * s, Math.sin(el) * s * 0.8 + 0.6, Math.sin(az) * c * s, { size: size * rand(0.6, 1.3), life: rand(0.45, 1.0), rise: 1.2, drag: 3.2, grow: 1.1, heat: 1.2 });
        }
      };
      // a ring of it on the ground, n flames round a circle of this radius
      this.ring = (x, y, z, radius, n = 28, size = 0.55, out = 0) => {
        const a0 = rand(0, TAU);
        for (let i = 0; i < n; i++) {
          const az = a0 + (i / n) * TAU + rand(-0.06, 0.06), cx = Math.cos(az), cz = Math.sin(az);
          this.emit(x + cx * radius, y + rand(0.05, 0.35), z + cz * radius, cx * out + rand(-0.3, 0.3), rand(0.6, 1.8), cz * out + rand(-0.3, 0.3), { size: size * rand(0.7, 1.3), life: rand(0.4, 0.8), rise: 2.6, drag: 2.2 });
        }
      };
      // flames up the height of something standing
      this.wreathe = (x, y, z, radius, height, n = 3, size = 0.5) => {
        for (let i = 0; i < n; i++) {
          const az = rand(0, TAU), r = radius * rand(0.5, 1.05);
          this.emit(x + Math.cos(az) * r, y + rand(0.05, height), z + Math.sin(az) * r, rand(-0.25, 0.25), rand(0.5, 1.4), rand(-0.25, 0.25), { size: size * rand(0.7, 1.3), life: rand(0.4, 0.85), rise: 2.4, drag: 1.5 });
        }
      };
      this.update = (dt) => {
        let n = 0;
        for (let i = 0; i < live.length; i++) {
          const p = live[i];
          if (!V.fireStep(p, dt)) { pool.push(p); continue; }
          live[n] = p;
          const u = p.t / p.life, o = n * 4;
          V.fireRamp(u, ramp);
          a[o] = p.x; a[o + 1] = p.y; a[o + 2] = p.z; a[o + 3] = p.size * (0.55 + p.grow * u);
          b[o] = ramp[0] * p.heat; b[o + 1] = ramp[1] * p.heat; b[o + 2] = ramp[2] * p.heat; b[o + 3] = ramp[3];
          n++;
        }
        live.length = n;
        geo.instanceCount = n; mesh.visible = n > 0;
        if (n) { aA.needsUpdate = true; aB.needsUpdate = true; }
      };
      this.reset = () => { while (live.length) pool.push(live.pop()); geo.instanceCount = 0; mesh.visible = false; };
      this.count = () => live.length;
      this.mesh = mesh;
    },
  };
})();
