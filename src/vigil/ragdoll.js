/* What a body does once nothing holds it up. Seventeen points joined by fixed lengths (a braced torso, two-part
   limbs, a neck) fall under gravity and collide with the ground and the level; the skeleton is then turned to
   follow them. Started from whatever pose the body was in, with the push of whatever killed it. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});

  // point -> where it sits: [bone, local offset]
  const PTS = [['hips', 0, 0, 0], ['chest', 0, 0, 0], ['neck', 0, 0, 0], ['head', 0, 0.1, 0.01], ['uaL', 0, 0, 0], ['faL', 0, 0, 0], ['hL', 0, 0, 0], ['uaR', 0, 0, 0], ['faR', 0, 0, 0], ['hR', 0, 0, 0],
    ['thL', 0, 0, 0], ['shL', 0, 0, 0], ['ftL', 0, 0, 0], ['thR', 0, 0, 0], ['shR', 0, 0, 0], ['ftR', 0, 0, 0], ['spine', 0, 0.1, 0.14]];
  const RADIUS = [0.13, 0.14, 0.07, 0.1, 0.075, 0.055, 0.05, 0.075, 0.055, 0.05, 0.1, 0.07, 0.06, 0.1, 0.07, 0.06, 0.07];
  const MASS = [10, 12, 2, 4, 2.5, 1.5, 0.8, 2.5, 1.5, 0.8, 6, 3.5, 1.5, 6, 3.5, 1.5, 6];
  // fixed lengths: the torso is braced so it holds its shape
  const STICKS = [[0, 1], [1, 2], [0, 2], [0, 10], [0, 13], [10, 13], [1, 4], [1, 7], [4, 7], [2, 4], [2, 7], [10, 4], [13, 7], [10, 7], [13, 4], [0, 16], [1, 16], [10, 16], [13, 16], [4, 16], [7, 16],
    [2, 3], [4, 5], [5, 6], [7, 8], [8, 9], [10, 11], [11, 12], [13, 14], [14, 15]];
  // joints that must not fold flat: [a, b, least fraction of their starting distance... or of the given length]
  const KEEP = [[3, 4, 0.8], [3, 7, 0.8], [3, 1, 0.85], [6, 4, 0.3], [9, 7, 0.3], [12, 10, 0.34], [15, 13, 0.34], [11, 14, 0.5], [12, 15, 0.4], [5, 1, 0.6], [8, 1, 0.6], [3, 0, 0.75]];
  const LIMB_PTS = { armL: [[5, 6], [4, 5, 6]], armR: [[8, 9], [7, 8, 9]], legL: [[11, 12], [10, 11, 12]], legR: [[14, 15], [13, 14, 15]] };
  const N = PTS.length;

  V.ragdoll = {
    create(g, phys) {
      const T = g.THREE, F = V.figure, BI = F.BI, BONES = F.BONES, list = [], MAXR = 28, GRAV = 14;
      const v = new T.Vector3(), a3 = new T.Vector3(), b3 = new T.Vector3(), n3 = new T.Vector3(), X = new T.Vector3(), Y = new T.Vector3(), Z = new T.Vector3(), m4 = new T.Matrix4();
      const q = new T.Quaternion(), arcQ = new T.Quaternion(), dT = new T.Quaternion(), dA = new T.Quaternion(), dB = new T.Quaternion();
      const W = BONES.map(() => new T.Quaternion());
      const P3 = (arr, i, out) => out.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
      // orientation of the torso from its points: up the spine, across the shoulders
      function frame(P, out) {
        Y.set(P[3] - P[0], P[4] - P[1], P[5] - P[2]).normalize();
        X.set(P[12] - P[21], P[13] - P[22], P[14] - P[23]); X.addScaledVector(Y, -X.dot(Y));
        if (X.lengthSq() < 1e-8) X.set(1, 0, 0); X.normalize();
        Z.crossVectors(X, Y);
        return out.setFromRotationMatrix(m4.makeBasis(X, Y, Z));
      }
      const dirOf = (P, i, j, out) => { out.set(P[j * 3] - P[i * 3], P[j * 3 + 1] - P[i * 3 + 1], P[j * 3 + 2] - P[i * 3 + 2]); const l = out.length(); return l > 1e-6 ? out.multiplyScalar(1 / l) : out.set(0, -1, 0); };

      // z: a zombie ({ mesh, bones, scale, limbs }). hit: { dir, point, power } and/or { blast: { x, y, z, force } }, vel: its velocity.
      function start(z, hit = {}) {
        const s = z.scale, B = z.bones, mesh = z.mesh;
        mesh.updateMatrixWorld(true);
        const P = new Float32Array(N * 3), O = new Float32Array(N * 3), rad = new Float32Array(N), im = new Float32Array(N);
        for (let i = 0; i < N; i++) {
          const [bone, x, y, zz] = PTS[i];
          v.set(x, y, zz); B[bone].localToWorld(v);
          P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; rad[i] = RADIUS[i] * s; im[i] = 1 / MASS[i];
        }
        // points of limbs that are gone weigh nothing and touch nothing
        for (const k in LIMB_PTS) { const st = z.limbs ? z.limbs[k] : 0; if (st) for (const i of LIMB_PTS[k][st - 1]) { rad[i] = 0; im[i] = 40; } }
        if (z.headless) { rad[3] = 0; im[3] = 40; }
        // starting velocity: how the body was moving, the blow that killed it, a little chaos
        const dt0 = 1 / 60, vx = (z.vel ? z.vel.x : 0), vz = (z.vel ? z.vel.z : 0);
        for (let i = 0; i < N; i++) {
          let ix = vx, iy = 0, iz = vz;
          if (hit.dir) {
            const d = hit.point ? Math.hypot(P[i * 3] - hit.point.x, P[i * 3 + 1] - hit.point.y, P[i * 3 + 2] - hit.point.z) : 0.4;
            const k = (hit.power || 3) * Math.max(0.25, 1 - d / (0.9 * s)) / Math.sqrt(z.mass || 1);
            ix += hit.dir.x * k; iy += hit.dir.y * k + 0.4; iz += hit.dir.z * k;
          }
          if (hit.blast) {
            const dx = P[i * 3] - hit.blast.x, dy = P[i * 3 + 1] - hit.blast.y + 0.6, dz = P[i * 3 + 2] - hit.blast.z, d = Math.hypot(dx, dy, dz) || 1;
            const k = hit.blast.force / (1 + d * 0.5) / Math.sqrt(z.mass || 1);
            ix += (dx / d) * k; iy += (dy / d) * k + 1.5; iz += (dz / d) * k;
          }
          ix += (Math.random() - 0.5) * 0.5; iz += (Math.random() - 0.5) * 0.5;
          O[i * 3] = P[i * 3] - ix * dt0; O[i * 3 + 1] = P[i * 3 + 1] - iy * dt0; O[i * 3 + 2] = P[i * 3 + 2] - iz * dt0;
        }
        const len = (i, j) => Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] - P[j * 3 + 2]);
        const sticks = STICKS.map(([i, j]) => [i, j, Math.max(0.02, len(i, j))]);
        const armL = 0.56 * s, legL = 0.85 * s, ref = { '6,4': armL, '9,7': armL, '12,10': legL, '15,13': legL, '11,14': 0.2 * s, '12,15': 0.2 * s, '5,1': 0.3 * s, '8,1': 0.3 * s, '3,0': 0.74 * s };
        const keep = KEEP.map(([i, j, f]) => [i, j, (ref[i + ',' + j] || len(i, j)) * f]);
        // bone orientations and limb directions at the start
        const W0 = BONES.map((b) => B[b[0]].getWorldQuaternion(new T.Quaternion()));
        const d0 = { neck: dirOf(P, 2, 3, new T.Vector3()), uaL: dirOf(P, 4, 5, new T.Vector3()), faL: dirOf(P, 5, 6, new T.Vector3()), uaR: dirOf(P, 7, 8, new T.Vector3()), faR: dirOf(P, 8, 9, new T.Vector3()),
          thL: dirOf(P, 10, 11, new T.Vector3()), shL: dirOf(P, 11, 12, new T.Vector3()), thR: dirOf(P, 13, 14, new T.Vector3()), shR: dirOf(P, 14, 15, new T.Vector3()) };
        const F0i = frame(P, new T.Quaternion()).invert();
        // from here the mesh stands at the origin and the hips carry the body
        mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.setScalar(s);
        B.jaw.rotation.x = 0.5;
        const r = { z, P, O, rad, im, sticks, keep, W0, d0, F0i, s, still: 0, asleep: false, age: 0, life: 16 + Math.random() * 6, sink: 0, done: false };
        list.push(r);
        if (list.length > MAXR) { const old = list.find((o) => o.asleep && o.life > 0); if (old) old.life = 0; }
        apply(r);
        return r;
      }

      function solve(r) {
        const { P, im, sticks, keep } = r;
        for (let k = 0; k < sticks.length; k++) {
          const c = sticks[k], i = c[0] * 3, j = c[1] * 3, dx = P[j] - P[i], dy = P[j + 1] - P[i + 1], dz = P[j + 2] - P[i + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          const wi = im[c[0]], wj = im[c[1]], f = (d - c[2]) / d / (wi + wj);
          P[i] += dx * f * wi; P[i + 1] += dy * f * wi; P[i + 2] += dz * f * wi; P[j] -= dx * f * wj; P[j + 1] -= dy * f * wj; P[j + 2] -= dz * f * wj;
        }
        for (let k = 0; k < keep.length; k++) {
          const c = keep[k], i = c[0] * 3, j = c[1] * 3, dx = P[j] - P[i], dy = P[j + 1] - P[i + 1], dz = P[j + 2] - P[i + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          if (d >= c[2]) continue;
          const wi = im[c[0]], wj = im[c[1]], f = (d - c[2]) / d / (wi + wj);
          P[i] += dx * f * wi; P[i + 1] += dy * f * wi; P[i + 2] += dz * f * wi; P[j] -= dx * f * wj; P[j + 1] -= dy * f * wj; P[j + 2] -= dz * f * wj;
        }
        // knees bend one way: the shin may fold back under the thigh, never forward of it
        X.set(P[12] - P[21], P[13] - P[22], P[14] - P[23]).normalize();
        for (const [h, kn, an] of [[10, 11, 12], [13, 14, 15]]) {
          a3.set(P[kn * 3] - P[h * 3], P[kn * 3 + 1] - P[h * 3 + 1], P[kn * 3 + 2] - P[h * 3 + 2]); b3.set(P[an * 3] - P[kn * 3], P[an * 3 + 1] - P[kn * 3 + 1], P[an * 3 + 2] - P[kn * 3 + 2]);
          const bend = n3.crossVectors(a3, b3).dot(X) / ((a3.length() * b3.length()) || 1);
          if (bend >= 0) continue;
          n3.crossVectors(X, a3).normalize();                                  // behind the thigh
          const k = -bend * b3.length() * 0.5;
          P[an * 3] += n3.x * k; P[an * 3 + 1] += n3.y * k; P[an * 3 + 2] += n3.z * k; P[kn * 3] -= n3.x * k * 0.4; P[kn * 3 + 1] -= n3.y * k * 0.4; P[kn * 3 + 2] -= n3.z * k * 0.4;
        }
      }
      function step(r, dt) {
        const { P, O, rad } = r, damp = 0.992;
        let moved = 0;
        for (let i = 0; i < N; i++) {
          const k = i * 3, x = P[k], y = P[k + 1], zz = P[k + 2];
          P[k] += (x - O[k]) * damp; P[k + 1] += (y - O[k + 1]) * damp - GRAV * dt * dt; P[k + 2] += (zz - O[k + 2]) * damp;
          O[k] = x; O[k + 1] = y; O[k + 2] = zz;
        }
        for (let it = 0; it < 4; it++) solve(r);
        for (let i = 0; i < N; i++) {
          if (!rad[i]) continue;
          const k = i * 3; v.set(P[k], P[k + 1], P[k + 2]);
          const hit = phys.collide(v, rad[i], n3);
          if (hit) {
            P[k] = v.x; P[k + 1] = v.y; P[k + 2] = v.z;
            // friction: what touches something loses most of its slide
            const f = hit === 1 ? 0.45 : 0.75;
            O[k] = P[k] - (P[k] - O[k]) * f; O[k + 2] = P[k + 2] - (P[k + 2] - O[k + 2]) * f;
            if (hit === 1 && P[k + 1] - O[k + 1] < 0) O[k + 1] = P[k + 1];
          }
          moved = Math.max(moved, Math.abs(P[k] - O[k]) + Math.abs(P[k + 1] - O[k + 1]) + Math.abs(P[k + 2] - O[k + 2]));
        }
        return moved;
      }
      // turn the skeleton to follow the points
      const arc = (from, to) => arcQ.setFromUnitVectors(from, to);
      function apply(r) {
        const { z, P, W0, d0, s } = r, B = z.bones;
        dT.copy(frame(P, q)).multiply(r.F0i);
        const set = (name, delta) => W[BI[name]].copy(delta).multiply(W0[BI[name]]);
        set('hips', dT); set('spine', dT); set('chest', dT);
        dA.copy(arc(a3.copy(d0.neck).applyQuaternion(dT), dirOf(P, 2, 3, b3))).multiply(dT);
        set('neck', dA); set('head', dA); set('jaw', dA);
        const limb = (up, lo, end, i, j, k) => {
          dA.copy(arc(a3.copy(d0[up]).applyQuaternion(dT), dirOf(P, i, j, b3))).multiply(dT); set(up, dA);
          dB.copy(arc(a3.copy(d0[lo]).applyQuaternion(dA), dirOf(P, j, k, b3))).multiply(dA); set(lo, dB); set(end, dB);
        };
        limb('uaL', 'faL', 'hL', 4, 5, 6); limb('uaR', 'faR', 'hR', 7, 8, 9); limb('thL', 'shL', 'ftL', 10, 11, 12); limb('thR', 'shR', 'ftR', 13, 14, 15);
        for (let i = 0; i < BONES.length; i++) {
          const name = BONES[i][0], parent = BONES[i][1];
          if (name === 'jaw') continue;
          if (parent < 0) B[name].quaternion.copy(W[i]); else B[name].quaternion.copy(q.copy(W[parent]).invert().multiply(W[i]));
        }
        B.hips.position.set(P[0] / s, P[1] / s, P[2] / s);
      }

      function update(dt) {
        if (dt <= 0) return;
        if (dt > 0.05) dt = 0.05;
        for (let i = list.length - 1; i >= 0; i--) {
          const r = list[i];
          r.age += dt;
          if (!r.asleep) {
            const moved = Math.max(step(r, dt * 0.5), step(r, dt * 0.5));
            apply(r);
            if (moved < 0.0035) r.still += dt; else r.still = 0;
            if ((r.still > 0.5 && r.age > 0.8) || r.age > 7) r.asleep = true;
          } else {
            r.life -= dt;
            if (r.life <= 0) { r.sink += dt; r.z.mesh.position.y = -r.sink * 0.3; if (r.sink > 3) { finish(r, i); continue; } }
          }
        }
      }
      function finish(r, i) { list.splice(i, 1); r.done = true; if (r.z.onRagdollDone) r.z.onRagdollDone(r.z); }
      return {
        list, start, update,
        // an explosion near a body that has settled throws it again
        blast(x, y, z, radius, force) {
          for (const r of list) {
            if (r.sink > 0 || Math.hypot(r.P[0] - x, r.P[2] - z) > radius) continue;
            for (let i = 0; i < N; i++) {
              const k = i * 3, dx = r.P[k] - x, dy = r.P[k + 1] - y + 0.6, dz = r.P[k + 2] - z, d = Math.hypot(dx, dy, dz) || 1, f = force / (1 + d * 0.5) / Math.sqrt(r.z.mass || 1) / 60;
              r.O[k] = r.P[k] - (dx / d) * f; r.O[k + 1] = r.P[k + 1] - (dy / d) * f - 0.02; r.O[k + 2] = r.P[k + 2] - (dz / d) * f;
            }
            r.asleep = false; r.still = 0; r.age = 0.5;
          }
        },
        // what a body was lying on has gone: it falls again
        wake(x, z, radius) { for (const r of list) if (r.asleep && r.sink <= 0 && Math.hypot(r.P[0] - x, r.P[2] - z) < radius) { r.asleep = false; r.still = 0; r.age = 0.5; } },
        clear() { for (let i = list.length - 1; i >= 0; i--) finish(list[i], i); },
      };
    },
  };
})();
