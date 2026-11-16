/* Lifeforce: what the dead leave where they fall, and what it buys.

   Every zombie that dies, whoever killed it, leaves a wisp of green light over its body. Walk near and it
   comes to you; it is gone after a minute. What you gather is spent in the armory's Lifeforce tab, or
   traded there for money (`V.LIFE.cash` a point), on the night's own skills (`V.RITES`): fifteen of them in three branches, each needing a
   rank of the one above it, each rank with its own price. They work at once (director.js `learnSkill`) and
   are gone when the night ends. They are not the title screen's tree (skills.js): that one is bought with
   levels and kept; nothing of it is sold here and nothing bought here is kept.

   Two parts: `V.life`, the count and the night's ranks (no DOM, no three.js: tested in
   tests/levels.test.cjs), and `V.wisps`, the lights in the world. Playing together, each player sees and
   gathers their own: nothing of it is sent. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});

  V.LIFE = {
    worth: { walker: 1, runner: 1, spitter: 2, wolf: 2, burster: 2, pyre: 3, brute: 6, boss: 30, demon: 3, skull: 2, bat: 1, spider: 2, greatspider: 6 },
    lasts: 60, fade: 8,    // seconds a wisp stays, and how long it takes to gutter out at the end
    reach: 1.25, pull: 5.5, // metres: gathered inside the first, drawn in inside the second
    pool: 48,
    nova: 40,              // lifeforce gathered between two bursts of Soul Nova
    cash: 10, lot: 10,     // traded in the armory: dollars for a point, and how many points go at a time
  };
  // branch, id, name, the price of each rank in lifeforce, the skill it needs, and what one rank does
  V.RITES = [
    { id: 'steady', branch: 'Reaper', name: 'Steady Hands', price: [8, 14, 22], text: '10% less recoil' },
    { id: 'trigger', branch: 'Reaper', name: 'Quick Trigger', price: [16, 28], needs: 'steady', text: '+6% rate of fire with every rifle' },
    { id: 'shatter', branch: 'Reaper', name: 'Bone Shatter', price: [26, 44], needs: 'trigger', text: 'A head-shot kill bursts: 60 damage to the dead within 3 m' },
    { id: 'spoils', branch: 'Reaper', name: 'Spoils', price: [50, 80], needs: 'shatter', text: 'A head-shot kill gives a round back' },
    { id: 'spree', branch: 'Reaper', name: 'Killing Spree', price: [150], needs: 'spoils', text: 'Each kill within 3 seconds of the last adds 4% damage, up to 40%' },

    { id: 'leech', branch: 'Revenant', name: 'Soul Leech', price: [8, 14, 22], text: 'Each kill restores 1 health' },
    { id: 'ward', branch: 'Revenant', name: 'Spirit Armor', price: [16, 28], needs: 'leech', text: '+20 armor when a wave begins' },
    { id: 'lash', branch: 'Revenant', name: 'Backlash', price: [26, 44], needs: 'ward', text: 'When you are hit, the dead within 3 m take 45 damage and are thrown back' },
    { id: 'door', branch: 'Revenant', name: 'Death’s Door', price: [50, 80], needs: 'lash', text: 'Below a third of your health you take 20% less damage' },
    { id: 'borrow', branch: 'Revenant', name: 'Borrowed Time', price: [150], needs: 'door', text: 'Once a wave, the blow that would put you down is turned aside, and nothing hurts you for 3 seconds' },

    { id: 'reach', branch: 'Lightkeeper', name: 'Long Reach', price: [6, 12, 20], text: 'Lifeforce comes to you from 3 m further off' },
    { id: 'harvest', branch: 'Lightkeeper', name: 'Rich Harvest', price: [14, 24, 38], needs: 'reach', text: '+15% lifeforce from the dead' },
    { id: 'tithe', branch: 'Lightkeeper', name: 'Tithe', price: [26, 44], needs: 'harvest', text: 'Every point of lifeforce gathered also pays $3' },
    { id: 'guard', branch: 'Lightkeeper', name: 'Warding Light', price: [50, 80], needs: 'tithe', text: 'The crystal takes 10% less damage (solo, or as host)' },
    { id: 'nova', branch: 'Lightkeeper', name: 'Soul Nova', price: [150], needs: 'guard', text: 'Every 40 lifeforce gathered bursts from you: up to 220 damage to the dead within 8 m' },
  ];
  V.RITE_BRANCHES = ['Reaper', 'Revenant', 'Lightkeeper'];
  const BY = {}; for (const s of V.RITES) { s.max = s.price.length; BY[s.id] = s; }
  const held = (ranks, id) => (BY[id] ? Math.max(0, Math.min(BY[id].max, (ranks && ranks[id]) | 0)) : 0);
  V.lifeWorth = (type) => V.LIFE.worth[type] || 1;
  // what the next rank of a skill costs someone who holds `rank` of it already
  V.lifePrice = (id, rank) => { const s = BY[id], n = s ? s.price[rank | 0] : null; return n == null ? Infinity : n; };
  // Can one more rank of `id` be bought with `have` lifeforce, holding `ranks`? '' or the reason not.
  V.lifeBlocked = (ranks, id, have) => {
    const s = BY[id]; if (!s) return 'No such skill';
    const n = held(ranks, id);
    if (n >= s.max) return 'Learned';
    if (s.needs && !held(ranks, s.needs)) return 'Needs ' + BY[s.needs].name;
    const p = V.lifePrice(id, n);
    if (!(have >= p)) return 'Needs ' + p + ' lifeforce';
    return '';
  };
  // What the night's ranks do. Every number is a multiplier (1 when untouched) or an amount (0).
  V.riteFx = (ranks) => {
    const r = (id) => held(ranks, id);
    return {
      recoil: 1 - 0.1 * r('steady'), rate: 1 + 0.06 * r('trigger'), shatter: 60 * r('shatter'), spoils: r('spoils'), spree: 0.04 * r('spree'),
      leech: r('leech'), ward: 20 * r('ward'), lash: 45 * r('lash'), door: 1 - 0.2 * r('door'), borrow: r('borrow'),
      reach: 3 * r('reach'), harvest: 1 + 0.15 * r('harvest'), tithe: 3 * r('tithe'), guard: 1 - 0.1 * r('guard'), nova: r('nova'),
    };
  };

  function create() {
    let have = 0, earned = 0, bought = {};
    return {
      get have() { return have; },
      get earned() { return earned; },
      reset() { have = 0; earned = 0; bought = {}; },
      add(n) { n = Math.max(0, Math.round(+n || 0)); have += n; earned += n; return have; },
      rank: (id) => held(bought, id),
      ranks: () => ({ ...bought }),
      price: (id) => V.lifePrice(id, held(bought, id)),
      blocked: (id) => V.lifeBlocked(bought, id, have),
      buy(id) {
        if (V.lifeBlocked(bought, id, have)) return false;
        have -= V.lifePrice(id, held(bought, id)); bought[id] = held(bought, id) + 1;
        return true;
      },
      // n points given up for something else (money, in the armory); false when there are not that many
      take(n) { n = Math.round(+n || 0); if (!(n > 0) || n > have) return false; have -= n; return true; },
      spent: () => { let n = 0; for (const s of V.RITES) for (let k = 0; k < held(bought, s.id); k++) n += s.price[k]; return n; },
      fx: () => V.riteFx(bought),
      // a night put away and taken up again (save.js): a skill whose way in is missing is not kept
      doc: () => ({ have, earned, r: { ...bought } }),
      restore(d) {
        have = 0; earned = 0; bought = {};
        if (!d || typeof d !== 'object') return false;
        have = Math.max(0, Math.round(+d.have || 0)); earned = Math.max(have, Math.round(+d.earned || 0));
        for (const s of V.RITES) { const n = held(d.r, s.id); if (n && (!s.needs || bought[s.needs])) bought[s.id] = n; }
        return true;
      },
    };
  }
  V.lifeTree = create;
  V.life = create();

  // ---- the lights ----
  // Two sprites a wisp, from one pool, on two shared materials: no light, no new shader. A wisp shrinks as it
  // gutters out instead of fading, so the materials never change.
  V.wisps = {
    spawn() {}, update() {}, reset() {}, setReach() {}, count: () => 0, list: () => [],
    install(g, api) {
      const T = g.THREE, L = V.LIFE;
      if (!T || !T.Sprite || !V.glowTexture) return;
      const root = new T.Group(); root.name = 'vigil-lifeforce'; g.scene.add(root);
      const mk = (r, gn, b) => new T.SpriteMaterial({ map: V.glowTexture, color: new T.Color(r, gn, b), blending: T.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
      const glowMat = mk(0.1, 0.95, 0.5), coreMat = mk(1.1, 2.4, 1.7);
      const calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      const pool = [];
      for (let i = 0; i < L.pool; i++) {
        const glow = new T.Sprite(glowMat), core = new T.Sprite(coreMat);
        glow.visible = core.visible = false; glow.renderOrder = 6; core.renderOrder = 7;
        root.add(glow, core);
        pool.push({ on: false, x: 0, y: 0, z: 0, gy: 0, t: 0, worth: 0, r: 0.3, seed: 0, glow, core });
      }
      const off = (w) => { w.on = false; w.glow.visible = w.core.visible = false; };
      let time = 0, more = 0;
      this.setReach = (m) => { more = Math.max(0, +m || 0); };         // Long Reach: drawn in from this much further
      this.spawn = (pos, type, scale) => {
        if (!pos) return null;
        let w = pool.find((q) => !q.on), carry = 0;
        if (!w) { w = pool.reduce((a, b) => (b.t > a.t ? b : a)); carry = w.worth; }       // all alight: the oldest goes into the new one
        w.on = true; w.t = 0; w.seed = Math.random() * 100;
        w.worth = V.lifeWorth(type) + carry;
        w.x = pos.x; w.z = pos.z; w.gy = pos.y; w.y = pos.y + 0.7 * (scale || 1);
        w.r = Math.min(0.5, 0.27 + 0.085 * Math.log2(1 + w.worth));
        w.glow.visible = w.core.visible = true;
        return w;
      };
      // p: where the one who can gather stands (null when nobody can: down, in a menu)
      this.update = (dt, p) => {
        time += dt;
        for (const w of pool) {
          if (!w.on) continue;
          w.t += dt;
          if (w.t >= L.lasts) { off(w); continue; }
          let pulled = false;
          if (p && w.t > 0.45) {
            const dx = p.x - w.x, dy = p.y + 1.0 - w.y, dz = p.z - w.z, d = Math.hypot(dx, dy, dz);
            if (d < L.reach) { off(w); api.gather(w.worth, w); continue; }
            if (d < L.pull + more) {
              const step = Math.min(d, (2.5 + 13 * (1 - d / (L.pull + more))) * dt) / (d || 1);
              w.x += dx * step; w.y += dy * step; w.z += dz * step; pulled = true;
            }
          }
          if (!pulled) w.y += (w.gy + 1.05 + (calm ? 0 : 0.12 * Math.sin(time * 2.1 + w.seed)) - w.y) * Math.min(1, dt * 2.4);
          const left = L.lasts - w.t, gutter = left < L.fade ? (left / L.fade) * (calm ? 1 : 0.7 + 0.3 * Math.sin(time * 16 + w.seed)) : 1;
          const s = w.r * Math.min(1, w.t / 0.4) * (0.3 + 0.7 * gutter) * (calm ? 1 : 1 + 0.13 * Math.sin(time * 5.3 + w.seed * 7));
          w.glow.position.set(w.x, w.y, w.z); w.glow.scale.setScalar(s * 2.3);
          w.core.position.set(w.x, w.y, w.z); w.core.scale.setScalar(s * 0.8);
        }
      };
      this.reset = () => { for (const w of pool) off(w); };
      this.count = () => pool.reduce((n, w) => n + (w.on ? 1 : 0), 0);
      this.list = () => pool.filter((w) => w.on);
    },
  };
})();
