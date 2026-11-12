/* World units are metres, time seconds. No renderer dependency. */
(function (root) {
  'use strict';
  const add = (a, b, k = 1) => ({x:a.x+b.x*k,y:a.y+b.y*k,z:a.z+b.z*k});
  const length = v => Math.hypot(v.x,v.y,v.z);
  class Ballistics {
    constructor({trace, impact, nearMiss = () => {}, gravity = 9.81, maxProjectiles = 128}) {
      this.trace = trace; this.impact = impact; this.nearMiss = nearMiss;
      this.gravity = gravity; this.maxProjectiles = maxProjectiles; this.projectiles = [];
    }
    fire(origin, direction, {speed = 820, damage = 42, range = 350, owner = 'player'} = {}) {
      const magnitude = length(direction);
      if (!magnitude || speed <= 0) return;
      if (this.projectiles.length >= this.maxProjectiles) this.projectiles.shift();
      const bullet = {position:{...origin}, previous:{...origin}, velocity:{x:direction.x/magnitude*speed,y:direction.y/magnitude*speed,z:direction.z/magnitude*speed}, speed, damage, range, distance:0, age:0, owner};
      this.projectiles.push(bullet); return bullet;
    }
    reset() { this.projectiles.length = 0; }
    update(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const b = this.projectiles[i]; let remaining = Math.min(dt, .1), stopped = false;
        b.previous = {...b.position};
        while (remaining > 1e-8 && !stopped) {
          const step = Math.min(remaining, 1/240); remaining -= step;
          const next = add(b.position,b.velocity,step); next.y -= .5*this.gravity*step*step;
          const delta = {x:next.x-b.position.x,y:next.y-b.position.y,z:next.z-b.position.z};
          const distance = length(delta); const available = Math.min(distance,b.range-b.distance);
          if (available <= 0) { stopped = true; break; }
          const direction = {x:delta.x/distance,y:delta.y/distance,z:delta.z/distance};
          const hit = this.trace(b.position,direction,available,b.owner);
          if (hit) {
            const traveled = b.distance + hit.dist;
            const damage = b.damage * Math.max(.5,1-traveled/700);
            this.impact(hit,b,damage); stopped = true;
          } else {
            const end = add(b.position,direction,available);
            this.nearMiss(b.position,end,b);
            b.position = end; b.distance += available; b.age += step;
            b.velocity.y -= this.gravity*step;
            stopped = b.distance >= b.range || b.age > 5;
          }
        }
        if (stopped) this.projectiles.splice(i,1);
      }
    }
  }
  root.GunslingerBallistics = Ballistics;
  if (typeof module !== 'undefined') module.exports = Ballistics;
})(typeof window !== 'undefined' ? window : globalThis);
