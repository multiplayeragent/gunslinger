/* Loose things: a lookup of the level's colliders by area, and small rigid bodies (broken stone, splintered
   wood, severed limbs) that tumble, bounce off the ground and the colliders, and come to rest. The engine's own
   physics is boxes on a flat floor for the player; this sits beside it and reads the same boxes. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});

  V.phys = {
    create(g) {
      const T = g.THREE, CELL = 2, MIN = -68, NC = Math.ceil(136 / CELL), cells = new Array(NC * NC);
      const ci = (v) => Math.max(0, Math.min(NC - 1, Math.floor((v - MIN) / CELL)));
      const each = (b, fn) => { for (let z = ci(b.min.z); z <= ci(b.max.z); z++) for (let x = ci(b.min.x); x <= ci(b.max.x); x++) fn(z * NC + x); };
      const insert = (b) => { if (b.bulletOnly || b.playerOnly) return; each(b, (k) => (cells[k] || (cells[k] = [])).push(b)); };
      const remove = (b) => each(b, (k) => { const c = cells[k]; if (!c) return; const i = c.indexOf(b); if (i >= 0) c.splice(i, 1); });
      for (const b of g.physics.boxes) insert(b);
      // every collider added or removed from here on keeps the lookup current
      const add0 = g.physics.addBox, rem0 = g.physics.removeBox, listeners = [];
      g.physics.addBox = function (...a) { const b = add0.apply(g.physics, a); insert(b); for (const f of listeners) f(); return b; };
      g.physics.removeBox = function (b) { remove(b); rem0.call(g.physics, b); for (const f of listeners) f(); };
      const EMPTY = [];
      const api = {
        onChange(fn) { listeners.push(fn); },
        near(x, z) { return cells[ci(z) * NC + ci(x)] || EMPTY; },
        // top of whatever lies under (x, z) at or below maxY
        ground(x, z, maxY) {
          let y = 0; const c = cells[ci(z) * NC + ci(x)];
          if (c) for (let i = 0; i < c.length; i++) { const b = c[i]; if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && b.max.y <= maxY && b.max.y > y) y = b.max.y; }
          return y;
        },
        // Pushes a sphere out of the ground and the colliders. Returns 0 (free), 1 (resting on something) or 2 (against a side).
        // n receives the contact normal.
        collide(p, r, n) {
          let hit = 0;
          if (p.y < r) { p.y = r; n.set(0, 1, 0); hit = 1; }
          const c = cells[ci(p.z) * NC + ci(p.x)];
          if (!c) return hit;
          for (let i = 0; i < c.length; i++) {
            const b = c[i];
            if (p.x < b.min.x - r || p.x > b.max.x + r || p.z < b.min.z - r || p.z > b.max.z + r || p.y < b.min.y - r || p.y > b.max.y + r) continue;
            const qx = Math.max(b.min.x, Math.min(b.max.x, p.x)), qy = Math.max(b.min.y, Math.min(b.max.y, p.y)), qz = Math.max(b.min.z, Math.min(b.max.z, p.z));
            const dx = p.x - qx, dy = p.y - qy, dz = p.z - qz, d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= r * r) continue;
            if (d2 > 1e-10) {
              const d = Math.sqrt(d2), k = (r - d) / d;
              p.x += dx * k; p.y += dy * k; p.z += dz * k; n.set(dx / d, dy / d, dz / d); hit = Math.max(hit, n.y > 0.6 ? 1 : 2);
            } else {
              // the centre is inside: leave by the nearest face, preferring the top
              const up = b.max.y - p.y, ex = Math.min(p.x - b.min.x, b.max.x - p.x), ez = Math.min(p.z - b.min.z, b.max.z - p.z);
              if (up < 0.35 || (up <= ex && up <= ez)) { p.y = b.max.y + r; n.set(0, 1, 0); hit = Math.max(hit, 1); }
              else if (ex < ez) { const s = p.x - b.min.x < b.max.x - p.x ? -1 : 1; p.x = s < 0 ? b.min.x - r : b.max.x + r; n.set(s, 0, 0); hit = 2; }
              else { const s = p.z - b.min.z < b.max.z - p.z ? -1 : 1; p.z = s < 0 ? b.min.z - r : b.max.z + r; n.set(0, 0, s); hit = 2; }
            }
          }
          return hit;
        },
      };

      // ------------------------------------------------------------------ rigid bodies
      const bodies = [], MAX = 110, G = 13;
      const root = new T.Group(); root.name = 'debris'; g.scene.add(root);
      const c3 = new T.Vector3(), r3 = new T.Vector3(), n3 = new T.Vector3(), vp = new T.Vector3(), t3 = new T.Vector3(), w3 = new T.Vector3(), qi = new T.Quaternion(), dq = new T.Quaternion();
      const invI = (b, v) => v.applyQuaternion(qi.copy(b.quat).invert()).multiply(b.invI).applyQuaternion(b.quat);
      // impulse at a contact: r3 from the centre to the contact, n3 the normal
      function contact(b, depth) {
        vp.crossVectors(b.ang, r3).add(b.vel);
        const vn = vp.dot(n3);
        if (vn < 0) {
          // effective mass along the normal: 1/m + n · ((I⁻¹ (r × n)) × r)
          t3.crossVectors(r3, n3); invI(b, w3.copy(t3)); w3.cross(r3);
          const j = (-(1 + (vn < -1.2 ? b.bounce : 0)) * vn) / (b.invM + w3.dot(n3));
          b.vel.addScaledVector(n3, j * b.invM);
          t3.crossVectors(r3, n3).multiplyScalar(j); b.ang.add(invI(b, t3));
          // friction against the sliding part of the motion
          vp.crossVectors(b.ang, r3).add(b.vel); t3.copy(vp).addScaledVector(n3, -vp.dot(n3));
          const vt = t3.length();
          if (vt > 1e-4) {
            t3.multiplyScalar(1 / vt);
            w3.crossVectors(r3, t3); invI(b, w3); w3.cross(r3);
            const jt = Math.min(b.friction * j, vt / (b.invM + w3.dot(t3)));
            b.vel.addScaledVector(t3, -jt * b.invM);
            w3.crossVectors(r3, t3).multiplyScalar(-jt); b.ang.add(invI(b, w3));
          }
          if (vn < -2.2 && b.onHit && b.hitT <= 0) { b.hitT = 0.25; b.onHit(b, -vn); }
        }
        if (depth > b.push) { b.push = depth; b.pushN.copy(n3); }
      }
      function step(b, dt) {
        b.vel.y -= G * dt;
        b.pos.addScaledVector(b.vel, dt);
        const wl = b.ang.length();
        if (wl > 1e-5) { dq.setFromAxisAngle(w3.copy(b.ang).multiplyScalar(1 / wl), wl * dt); b.quat.premultiply(dq).normalize(); }
        b.push = 0; let touching = 0;
        const h = b.half, near = api.near(b.pos.x, b.pos.z);
        for (let i = 0; i < 8; i++) {
          r3.set(i & 1 ? h.x : -h.x, i & 2 ? h.y : -h.y, i & 4 ? h.z : -h.z).applyQuaternion(b.quat);
          c3.copy(b.pos).add(r3);
          const gy = api.ground(c3.x, c3.z, c3.y + 0.25);
          if (c3.y < gy) { n3.set(0, 1, 0); contact(b, gy - c3.y); touching++; continue; }
          for (let k = 0; k < near.length; k++) {
            const bx = near[k];
            if (c3.x <= bx.min.x || c3.x >= bx.max.x || c3.z <= bx.min.z || c3.z >= bx.max.z || c3.y <= bx.min.y || c3.y >= bx.max.y) continue;
            const ex0 = c3.x - bx.min.x, ex1 = bx.max.x - c3.x, ez0 = c3.z - bx.min.z, ez1 = bx.max.z - c3.z, m = Math.min(ex0, ex1, ez0, ez1);
            if (m === ex0) n3.set(-1, 0, 0); else if (m === ex1) n3.set(1, 0, 0); else if (m === ez0) n3.set(0, 0, -1); else n3.set(0, 0, 1);
            contact(b, Math.min(m, 0.2)); touching++;
            break;
          }
        }
        if (b.push > 0) b.pos.addScaledVector(b.pushN, b.push * 0.9);
        if (touching) { b.ang.multiplyScalar(Math.exp(-3.2 * dt)); b.vel.multiplyScalar(Math.exp(-0.9 * dt)); }
        return touching;
      }
      Object.assign(api, {
        bodies, root,
        // o: { mesh, pos, quat, vel, ang, half: Vector3, mass, bounce, friction, life (seconds at rest before it sinks; Infinity keeps it), onRest(body), onHit(body, speed) }
        spawn(o) {
          if (bodies.length >= MAX) { const old = bodies.find((q) => !q.keep) || bodies[0]; api.drop(old); }
          const h = o.half, m = Math.max(0.2, o.mass || 1);
          const b = { mesh: o.mesh, pos: o.mesh.position, quat: o.mesh.quaternion, vel: (o.vel || new T.Vector3()).clone(), ang: (o.ang || new T.Vector3()).clone(), half: h, invM: 1 / m,
            invI: new T.Vector3(3 / (m * (h.y * h.y + h.z * h.z)), 3 / (m * (h.x * h.x + h.z * h.z)), 3 / (m * (h.x * h.x + h.y * h.y))),
            bounce: o.bounce == null ? 0.25 : o.bounce, friction: o.friction == null ? 0.7 : o.friction, life: o.life == null ? 14 : o.life, keep: o.life === Infinity, onRest: o.onRest || null, onHit: o.onHit || null,
            still: 0, asleep: false, age: 0, hitT: 0, push: 0, pushN: new T.Vector3(), sink: 0, data: o.data || null };
          if (o.pos) b.pos.copy(o.pos); if (o.quat) b.quat.copy(o.quat);
          if (!b.mesh.parent) root.add(b.mesh);
          bodies.push(b);
          return b;
        },
        drop(b) {
          const i = bodies.indexOf(b); if (i >= 0) bodies.splice(i, 1);
          if (b.mesh.parent) b.mesh.parent.remove(b.mesh);
          if (b.mesh.userData.dispose) b.mesh.userData.dispose();
        },
        wake(x, y, z, r) { for (const b of bodies) if (b.asleep && Math.hypot(b.pos.x - x, b.pos.y - y, b.pos.z - z) < r) { b.asleep = false; b.still = 0; } },
        // an explosion throws whatever is loose
        blast(x, y, z, r, force) {
          for (const b of bodies) {
            const dx = b.pos.x - x, dy = b.pos.y + 0.3 - y, dz = b.pos.z - z, d = Math.hypot(dx, dy, dz);
            if (d > r) continue;
            const k = force * (1 - d / r) * b.invM / (d || 1);
            b.vel.x += dx * k; b.vel.y += Math.abs(dy) * k + force * 0.25 * b.invM; b.vel.z += dz * k;
            b.ang.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
            b.asleep = false; b.still = 0; b.sink = 0;
          }
        },
        clearBodies() { for (let i = bodies.length - 1; i >= 0; i--) api.drop(bodies[i]); },
        updateBodies(dt) {
          if (dt <= 0) return;
          if (dt > 0.05) dt = 0.05;
          for (let i = bodies.length - 1; i >= 0; i--) {
            const b = bodies[i];
            b.age += dt; if (b.hitT > 0) b.hitT -= dt;
            if (b.asleep) {
              if (b.keep) continue;
              b.life -= dt;
              if (b.life <= 0) { b.sink += dt; b.pos.y -= dt * 0.25; if (b.sink > 2.2) api.drop(b); }
              continue;
            }
            const touching = step(b, dt * 0.5) + step(b, dt * 0.5);
            if (touching && b.vel.lengthSq() < 0.03 && b.ang.lengthSq() < 0.5) b.still += dt; else b.still = 0;
            if (b.still > 0.35 || b.age > 9 || b.pos.y < -3) {
              b.asleep = true; b.vel.set(0, 0, 0); b.ang.set(0, 0, 0);
              if (b.onRest) { const keep = b.onRest(b); if (keep === false) { api.drop(b); continue; } }
            }
          }
        },
      });
      return api;
    },
  };
})();
