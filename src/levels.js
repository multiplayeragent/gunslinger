/* Player level: experience from everything the game counts, a level from 1 to 100, and a rank for every ten.

   The curve and the ranks are War Bash's (its 06r-arsenal.js and 09sa-grades.js): 250 x (level - 1)^1.6
   experience in all to reach a level, eleven ranks from Recruit to Legend. Experience only ever goes up; it is
   kept with the outfit progress (src/achievements.js saves this as an extra part of its document, in this
   browser and in the player's Multiplayer Agent save), so the higher of two devices wins.

   A level gained is a skill point for the Churchyard's skill tree (src/vigil/skills.js keeps what is spent).
   No DOM and no three.js here: src/progress.js awards the experience and src/alerts.js announces a level. */
(function (root) {
  'use strict';
  const MAX = 100;
  const RANKS = ['Recruit', 'Soldier', 'Corporal', 'Sergeant', 'Staff Sergeant', 'Lieutenant', 'Captain', 'Major', 'Colonel', 'General', 'Legend'];
  // experience in all to reach a level
  const xpFor = (level) => (level <= 1 ? 0 : Math.round(250 * Math.pow(Math.min(level, MAX) - 1, 1.6)));
  const levelOf = (xp) => { let l = 1; while (l < MAX && xp >= xpFor(l + 1)) l++; return l; };
  const rankIndex = (level) => Math.max(0, Math.min(RANKS.length - 1, Math.floor((level | 0) / 10)));
  // What things are worth. Kills by kind (anything not listed is `kill`); a head or weak-point kill is worth
  // half as much again, one a turret or a guard made half as much.
  const XP = {
    kill: 20, walker: 10, runner: 14, spitter: 18, wolf: 16, burster: 20, pyre: 22, demon: 26, skull: 16, bat: 10, spider: 16, greatspider: 55, brute: 60, boss: 400, head: 1.5, defense: 0.5,
    wave: (n) => 40 + 15 * Math.min(40, n), hwave: 60, relay: 80, mission: 400, totem: 30, risen: 0, challenge: 50, outfit: 150,
  };
  const killXp = (d) => Math.round((XP[d.type] != null && typeof XP[d.type] === 'number' ? XP[d.type] : XP.kill) * (d.head || d.weak ? XP.head : 1) * (d.by === 'defense' ? XP.defense : 1));

  function create() {
    let xp = 0, dirty = false, run = 0;
    const listeners = [];
    const emit = (e) => { for (const fn of listeners) { try { fn(e); } catch (err) { if (root.console) root.console.error('[levels] a listener threw: ' + ((err && err.stack) || err)); } } };
    const api = {
      MAX, RANKS, XP, xpFor, levelOf, rankIndex, killXp,
      rankName: (level) => RANKS[rankIndex(level)],
      on(fn) { listeners.push(fn); },
      get xp() { return xp; },
      get level() { return levelOf(xp); },
      // skill points: one for every level gained
      get points() { return levelOf(xp) - 1; },
      // where the player stands: { level, rank, into, need, k } (k: how far through the level, 0 to 1)
      progress() {
        const level = levelOf(xp), a = xpFor(level), b = level < MAX ? xpFor(level + 1) : a;
        return { xp, level, rank: RANKS[rankIndex(level)], rankIndex: rankIndex(level), into: xp - a, need: b - a, k: b > a ? Math.min(1, (xp - a) / (b - a)) : 1 };
      },
      // Experience earned: `why` names it for the pop-up beside the reticle. Returns the levels reached, if any.
      add(n, why, detail) {
        n = Math.max(0, Math.round(+n || 0));
        if (!n) return [];
        const before = levelOf(xp);
        xp += n; run += n; dirty = true;
        const after = levelOf(xp), up = [];
        for (let l = before + 1; l <= after; l++) up.push(l);
        emit({ type: 'xp', n, why: why || '', detail: detail || '', level: after });
        for (const l of up) emit({ type: 'level', level: l, promoted: rankIndex(l) !== rankIndex(l - 1), rank: RANKS[rankIndex(l)] });
        return up;
      },
      beginRun() { run = 0; },
      get runXp() { return run; },
      // saving: the higher of two wins
      doc() { return { xp }; },
      merge(d) { const v = Math.floor(+(d && d.xp)) || 0; if (v > xp) { xp = v; dirty = true; return true; } return false; },
      dirty() { return dirty; },
      saved() { dirty = false; },
      reset() { xp = 0; run = 0; dirty = true; },
    };
    return api;
  }

  const L = create();
  L.create = create;
  if (typeof module !== 'undefined' && module.exports) module.exports = { create, xpFor, levelOf, rankIndex, RANKS, XP, killXp };
  if (typeof window !== 'undefined') window.GunslingerLevels = L;
})(typeof globalThis !== 'undefined' ? globalThis : this);
