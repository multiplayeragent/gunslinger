/* Achievements: challenges counted while you play, and the outfits they unlock.

   The game reports facts ("a kill", "a wave cleared", "a mission finished") with what is known about each one;
   a challenge names the fact it counts and, if it needs one, a test on those details. An outfit is unlocked when
   every challenge defined for it is complete. Nothing here knows a map or a mode: a new mode reports its own facts
   and defines its own challenges (GunslingerAchievements.define), and they are counted, saved, announced and
   shown like the rest.

     define('corsair', { group: 'Harbor' }, [{ id: 'corsair.breach', label: 'Reach the boat 5 times', goal: 5, fact: 'mission' }, ...]);
     report('kill', { type: 'gull', dist: 42 });

   A challenge: { id, label, hint?, goal, fact, test?(c) -> counts or not, add?(c) -> how much (default 1),
   best? (keeps the highest single amount instead of a total), distinct?(c) -> key (counts different keys) }.

   create() is the whole logic with no browser in it (tests run it in Node); the object at the bottom is the one
   the game uses, saved in this browser and, when the player has an identity, with their Multiplayer Agent save. */
(function (global) {
  'use strict';

  function create(opts = {}) {
    const now = opts.now || (() => Date.now());
    const defs = new Map(), outfits = new Map(), byFact = new Map(), listeners = [];
    let P = { v: 1, c: {}, s: {}, u: {} };            // counters, keys seen (distinct challenges), outfits unlocked (when)
    let context = () => ({}), dirty = false, unlockedSomething = false;
    const extras = new Map();                              // other parts of the save: see extra()
    let run = { gained: new Map(), done: [], unlocked: [] };
    const emit = (e) => { for (const f of listeners) { try { f(e); } catch (err) { /* a listener's problem */ } } };

    const api = {
      /* challenges of one outfit; an outfit defined with none is worn from the start */
      define(outfit, info, challenges) {
        const o = outfits.get(outfit) || { id: outfit, group: '', challenges: [] };
        if (info && info.group) o.group = info.group;
        for (const d of challenges || []) {
          if (!d || !d.id || !(d.goal > 0) || !d.fact) throw new Error('achievement needs id, goal and fact: ' + JSON.stringify(d && d.id));
          if (defs.has(d.id)) throw new Error('achievement defined twice: ' + d.id);
          const def = { ...d, outfit };
          defs.set(d.id, def); o.challenges.push(d.id);
          if (!byFact.has(d.fact)) byFact.set(d.fact, []);
          byFact.get(d.fact).push(def);
        }
        outfits.set(outfit, o);
        return api;
      },
      setContext(fn) { context = fn || (() => ({})); },
      on(fn) { listeners.push(fn); },
      value(id) { const d = defs.get(id); return d ? Math.min(d.goal, P.c[id] || 0) : 0; },
      done(id) { const d = defs.get(id); return !!d && (P.c[id] || 0) >= d.goal; },
      challenge(id) { const d = defs.get(id); return d ? { id, outfit: d.outfit, label: d.label, hint: d.hint || '', goal: d.goal, value: api.value(id), done: api.done(id) } : null; },
      outfit(id) {
        const o = outfits.get(id); if (!o) return null;
        const list = o.challenges.map(api.challenge), done = list.filter((c) => c.done).length;
        return { id, group: o.group, challenges: list, done, total: list.length, unlocked: done === list.length, at: P.u[id] || 0 };
      },
      outfits() { return [...outfits.keys()]; },
      /* an outfit nobody defined (an unknown id from the network, a base outfit) is not locked */
      unlocked(id) { const o = outfits.get(id); return !o || o.challenges.every(api.done); },
      unlockedCount() { let n = 0; for (const [id, o] of outfits) if (o.challenges.length && api.unlocked(id)) n++; return n; },

      /* something happened: count it in every challenge that asks for it */
      report(fact, details, n) {
        const list = byFact.get(fact); if (!list) return 0;
        const c = Object.assign({}, context(), details || {});
        let changed = 0;
        for (const d of list) {
          const before = P.c[d.id] || 0; if (before >= d.goal) continue;
          let ok = true; try { ok = !d.test || !!d.test(c); } catch (e) { ok = false; }
          if (!ok) continue;
          let after = before;
          if (d.distinct) {
            let key = null; try { key = d.distinct(c); } catch (e) { key = null; }
            if (key == null) continue;
            const seen = (P.s[d.id] = P.s[d.id] || []); if (seen.indexOf(String(key)) < 0) seen.push(String(key));
            after = seen.length;
          } else {
            let amount = n === undefined ? 1 : n; if (d.add) { try { amount = +d.add(c) || 0; } catch (e) { amount = 0; } }
            after = d.best ? Math.max(before, amount) : before + amount;
          }
          after = Math.min(d.goal, Math.floor(after));
          if (!(after > before)) continue;
          P.c[d.id] = after; dirty = true; changed++;
          const g = run.gained.get(d.id); run.gained.set(d.id, g ? { from: g.from, to: after } : { from: before, to: after });
          const complete = after >= d.goal;
          emit({ type: complete ? 'done' : 'progress', id: d.id, outfit: d.outfit, value: after, goal: d.goal });
          if (complete) {
            run.done.push(d.id);
            if (api.unlocked(d.outfit) && !P.u[d.outfit]) { P.u[d.outfit] = now(); run.unlocked.push(d.outfit); emit({ type: 'unlock', outfit: d.outfit }); unlockedSomething = true; }
          }
        }
        if (unlockedSomething && fact !== 'unlock') { unlockedSomething = false; api.report('unlock', { count: api.unlockedCount() }); }
        return changed;
      },

      /* what a run changed, for its end card */
      beginRun() { run = { gained: new Map(), done: [], unlocked: [] }; },
      runSummary() {
        const rows = [];
        for (const [id, g] of run.gained) { const c = api.challenge(id); if (c) rows.push({ ...c, from: g.from }); }
        rows.sort((a, b) => (b.done - a.done) || (b.value / b.goal - a.value / a.goal));
        return { rows, done: run.done.slice(), unlocked: run.unlocked.slice() };
      },

      /* saving: the document, and taking one in (another device's, or this browser's from last time). Counters only
         ever go up, so the higher of two wins; keys seen and outfits unlocked are joined. */
      doc() {
        const d = { v: 1, c: { ...P.c }, s: JSON.parse(JSON.stringify(P.s)), u: { ...P.u } };
        if (extras.size) { d.x = {}; for (const [name, part] of extras) d.x[name] = part.doc(); }
        return d;
      },
      // Something else that is kept in the same save (the player's level, the skill tree): { doc(), merge(d), dirty(), saved() }.
      extra(name, part) { extras.set(name, part); },
      merge(d) {
        if (!d || typeof d !== 'object') return false;
        let changed = false;
        for (const k in d.c || {}) { const v = Math.floor(+d.c[k]) || 0; if (v > (P.c[k] || 0)) { P.c[k] = v; changed = true; } }
        for (const k in d.s || {}) { if (!Array.isArray(d.s[k])) continue; const seen = (P.s[k] = P.s[k] || []); for (const key of d.s[k]) if (seen.indexOf(String(key)) < 0 && seen.length < 64) { seen.push(String(key)); changed = true; } const def = defs.get(k); if (def && def.distinct && seen.length > (P.c[k] || 0)) P.c[k] = Math.min(def.goal, seen.length); }
        for (const k in d.u || {}) { if (!P.u[k] || d.u[k] < P.u[k]) { P.u[k] = +d.u[k] || now(); changed = true; } }
        // an outfit completed on one device and the last challenge on another: both halves are here now
        for (const [id, o] of outfits) if (o.challenges.length && api.unlocked(id) && !P.u[id]) { P.u[id] = now(); changed = true; }
        for (const [name, part] of extras) if (d.x && d.x[name] && part.merge(d.x[name])) changed = true;
        if (changed) dirty = true;
        return changed;
      },
      dirty() { if (dirty) return true; for (const part of extras.values()) if (part.dirty && part.dirty()) return true; return false; },
      saved() { dirty = false; for (const part of extras.values()) if (part.saved) part.saved(); },
      reset() { P = { v: 1, c: {}, s: {}, u: {} }; dirty = true; api.beginRun(); },
    };
    return api;
  }

  // ------------------------------------------------------------------ the game's own: kept in this browser and in the player's save
  const KEY = 'gunslinger.progress.v1', SPACE = 'gunslinger';
  const A = create();
  A.create = create;
  let timer = null, cloud = null, cloudBusy = false, cloudAt = 0;
  const local = {
    read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
    write(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* private mode: progress lasts the visit */ } },
  };
  async function pushCloud() {
    if (!cloud || cloudBusy) return;
    cloudBusy = true;
    try { await cloud.data.set(A.doc(), { namespace: SPACE }); cloudAt = Date.now(); }
    catch (e) {
      // someone else wrote first (another tab or device): take theirs in and write the join
      try { const got = await cloud.data.get(SPACE); if (got && got.data) A.merge(got.data); await cloud.data.set(A.doc(), { namespace: SPACE }); } catch (e2) { /* next change tries again */ }
    }
    cloudBusy = false;
  }
  A.save = function (soon) {
    if (!A.dirty()) return;
    local.write(A.doc()); A.saved();
    if (!cloud) return;
    clearTimeout(timer);
    timer = setTimeout(pushCloud, soon ? 300 : Math.max(1500, 20000 - (Date.now() - cloudAt)));      // at most a few writes a minute while playing
  };
  /* call once the challenges are defined: this browser's progress now, the player's save when it answers */
  A.load = async function () {
    A.merge(local.read()); A.saved(); A.beginRun();
    const online = typeof window !== 'undefined' && window.GunslingerOnline;
    if (!online) return false;
    if (!(await online.whenAvailable())) return false;
    const who = await online.identity(); if (!who || !who.data) return false;
    cloud = who;
    try { const got = await who.data.get(SPACE); if (got && got.data && A.merge(got.data)) { local.write(A.doc()); A.saved(); A.cloudLoaded = true; } } catch (e) { /* no save yet */ }
    await pushCloud();
    return true;
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { create };
  if (typeof window !== 'undefined') window.GunslingerAchievements = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
