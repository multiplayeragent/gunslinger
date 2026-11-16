/* The Churchyard's skill tree: what the warden has learned, kept from one night to the next.

   Every level gained (src/levels.js) is a point. Points are spent on eighteen skills in three branches, six to
   a branch, each needing at least one rank of the skill above it. Each rank of a skill costs two points more
   than the one before: 1, then 3, then 5 (`V.skillCost`). Spending is free to undo: "Refund all" on
   the Skills screen gives every point back. What is spent changes the rules of a run from its start
   (director.js reads `V.skills.fx()`): damage, reload, health, money, the crystal and so on.

   The ranks are saved with the outfit progress, as an extra part of that document with the time they were
   last changed; of two devices' trees the later one stands. If a save holds more ranks than there are points
   (levels from another device not yet arrived), the tree counts as empty until they are. No DOM here: the
   screen is src/skilltree.js. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});

  // branch, id, name, ranks, cost of its first rank, the skill it needs, and what a rank does (as the screen says it)
  V.SKILLS = [
    { id: 'aim', branch: 'Gunfighter', name: 'Steady Aim', max: 3, cost: 1, text: '+5% bullet damage, 4% less recoil' },
    { id: 'reload', branch: 'Gunfighter', name: 'Light Trigger', max: 2, cost: 1, needs: 'aim', text: '+5% rate of fire' },
    { id: 'skull', branch: 'Gunfighter', name: 'Skullcracker', max: 2, cost: 1, needs: 'reload', text: '+12% head-shot damage' },
    { id: 'pouch', branch: 'Gunfighter', name: 'Deep Pouches', max: 2, cost: 1, needs: 'skull', text: '+20% ammunition carried' },
    { id: 'pierce', branch: 'Gunfighter', name: 'Through and Through', max: 1, cost: 2, needs: 'pouch', text: 'Rounds pass through one more body' },
    { id: 'giant', branch: 'Gunfighter', name: 'Giant Killer', max: 1, cost: 3, needs: 'pierce', text: '+25% damage to brutes and abominations' },

    { id: 'hide', branch: 'Survivor', name: 'Thick Hide', max: 3, cost: 1, text: '+10 health' },
    { id: 'wind', branch: 'Survivor', name: 'Second Wind', max: 2, cost: 1, needs: 'hide', text: 'Recover 1 health a second when unhurt for 5 seconds' },
    { id: 'fleet', branch: 'Survivor', name: 'Fleet', max: 2, cost: 1, needs: 'wind', text: '+4% movement speed' },
    { id: 'dress', branch: 'Survivor', name: 'Field Dressing', max: 2, cost: 1, needs: 'fleet', text: 'Start with one more medkit, and each heals 15 more' },
    { id: 'will', branch: 'Survivor', name: 'Iron Will', max: 1, cost: 2, needs: 'dress', text: 'Take 12% less damage' },
    { id: 'stand', branch: 'Survivor', name: 'Last Stand', max: 1, cost: 3, needs: 'will', text: 'One more respawn each night' },

    { id: 'rob', branch: 'Warden', name: 'Grave Robber', max: 3, cost: 1, text: '+6% money from kills' },
    { id: 'chest', branch: 'Warden', name: 'War Chest', max: 2, cost: 1, needs: 'rob', text: '+$150 at the start of the night' },
    { id: 'bless', branch: 'Warden', name: 'Sanctified', max: 2, cost: 1, needs: 'chest', text: '+10% crystal health (solo, or as host)' },
    { id: 'belt', branch: 'Warden', name: 'Bandolier', max: 2, cost: 1, needs: 'bless', text: 'Start with one more grenade' },
    { id: 'mend', branch: 'Warden', name: 'Mending Light', max: 1, cost: 2, needs: 'belt', text: 'The crystal heals half as much again when a wave is cleared (solo, or as host)' },
    { id: 'rite', branch: 'Warden', name: 'Second Nature', max: 1, cost: 3, needs: 'mend', text: 'Your class ability recharges 25% faster' },
  ];
  V.SKILL_BRANCHES = ['Gunfighter', 'Survivor', 'Warden'];
  const BY = {}; for (const s of V.SKILLS) BY[s.id] = s;

  // What the next rank of `id` costs with `have` ranks held: two points more for each rank already there.
  V.skillCost = (id, have) => { const s = BY[id]; return s ? s.cost + 2 * Math.max(0, have | 0) : 0; };
  // points a set of ranks has cost (r ranks of a skill: r of its first cost, and 2 more for each step up)
  V.skillSpent = (ranks) => { let n = 0; for (const s of V.SKILLS) { const r = Math.max(0, Math.min(s.max, (ranks && ranks[s.id]) | 0)); n += r * s.cost + r * (r - 1); } return n; };
  // Can one more rank of `id` be bought with `points` in all? Returns '' or the reason not.
  V.skillBlocked = (ranks, id, points) => {
    const s = BY[id]; if (!s) return 'No such skill';
    const have = (ranks && ranks[id]) | 0;
    if (have >= s.max) return 'Learned';
    if (s.needs && !((ranks && ranks[s.needs]) | 0)) return 'Needs ' + BY[s.needs].name;
    const cost = V.skillCost(id, have);
    if (V.skillSpent(ranks) + cost > points) return cost === 1 ? 'Needs a point' : 'Needs ' + cost + ' points';
    return '';
  };
  // What a set of ranks does to a run. Every number is a multiplier (1 when untouched) or an amount (0).
  V.skillFx = (ranks) => {
    const r = (id) => Math.max(0, Math.min(BY[id].max, (ranks && ranks[id]) | 0));
    return {
      dmg: 1 + 0.05 * r('aim'), recoil: 1 - 0.04 * r('aim'), reload: 1 + 0.05 * r('reload'), head: 1 + 0.12 * r('skull'), reserve: 1 + 0.2 * r('pouch'), pierce: r('pierce'), big: 1 + 0.25 * r('giant'),
      hp: 10 * r('hide'), regen: r('wind'), speed: 1 + 0.04 * r('fleet'), medkits: r('dress'), medkitHeal: 15 * r('dress'), resist: 1 - 0.12 * r('will'), tokens: r('stand'),
      money: 1 + 0.06 * r('rob'), startMoney: 150 * r('chest'), crystal: 1 + 0.1 * r('bless'), grenades: r('belt'), mend: 1 + 0.5 * r('mend'), cooldown: 1 - 0.25 * r('rite'),
    };
  };

  function create(pointsOf) {
    let ranks = {}, at = 0, dirty = false;
    const listeners = [], changed = () => { at = Date.now(); dirty = true; for (const fn of listeners) { try { fn(); } catch (e) { console.error('[skills] a listener threw: ' + ((e && e.stack) || e)); } } };
    const points = () => Math.max(0, pointsOf() | 0);
    // a tree that has cost more than there is to spend (another device's, ahead of its levels) counts as empty
    const live = () => (V.skillSpent(ranks) <= points() ? ranks : {});
    return {
      on(fn) { listeners.push(fn); },
      rank: (id) => (live()[id] | 0),
      spent: () => V.skillSpent(live()),
      points,
      free: () => points() - V.skillSpent(live()),
      blocked: (id) => V.skillBlocked(live(), id, points()),
      learn(id) { if (V.skillBlocked(live(), id, points())) return false; ranks = { ...live(), [id]: (live()[id] | 0) + 1 }; changed(); return true; },
      refund() { if (!V.skillSpent(ranks)) return false; ranks = {}; changed(); return true; },
      fx: () => V.skillFx(live()),
      doc() { return { r: { ...ranks }, t: at }; },
      merge(d) {
        if (!d || typeof d !== 'object' || !d.r || !(+d.t > at)) return false;
        const next = {}; for (const s of V.SKILLS) { const n = Math.max(0, Math.min(s.max, d.r[s.id] | 0)); if (n) next[s.id] = n; }
        ranks = next; at = +d.t; dirty = true;
        for (const fn of listeners) { try { fn(); } catch (e) { /* a listener's own trouble */ } }
        return true;
      },
      dirty: () => dirty,
      saved() { dirty = false; },
    };
  }
  V.skillTree = create;
  V.skills = create(() => (window.GunslingerLevels ? window.GunslingerLevels.points : 0));
})();
