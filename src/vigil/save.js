/* A night put away: the Churchyard run written down between waves, and taken up again from the title.

   director.js decides when (a wave cleared, the preparation for the next, the moment it begins: never during a
   wave) and what (`snapshot`), and puts it back (`restore`). This file is only where it is kept and whether what
   is found there can be used. One night is kept, in this browser. When the crystal falls it is thrown away:
   a night that was lost cannot be taken up again. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const KEY = 'gunslinger.vigil.run.v1', VERSION = 1;
  const listeners = [];
  const tell = () => { for (const fn of listeners) { try { fn(); } catch (e) { /* a listener's own trouble */ } } };
  const store = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };

  // Can a night be taken up from this? At least one wave cleared, a class that exists, a crystal still standing.
  V.runSaveValid = (d) => !!(d && typeof d === 'object' && d.v === VERSION && (d.wave | 0) >= 1 && V.CLASSES && V.CLASSES[d.cls] && d.crystal && d.crystal.hp > 0 && d.kits && typeof d.kits === 'object');
  // how the title says it: "Wave 12 cleared · Soldier · $3,400 · crystal 82%"
  V.runSaveLine = (d) => {
    if (!V.runSaveValid(d)) return '';
    const pct = Math.max(1, Math.min(100, Math.round((d.crystal.hp / Math.max(1, d.crystal.max || d.crystal.hp)) * 100)));
    return `Wave ${d.wave | 0} cleared · ${V.CLASSES[d.cls].name} · $${Math.floor(+d.money || 0).toLocaleString('en-US')} · crystal ${pct}%`;
  };
  V.runSave = {
    key: KEY,
    read() {
      const s = store(); if (!s) return null;
      try { const d = JSON.parse(s.getItem(KEY) || 'null'); return V.runSaveValid(d) ? d : null; } catch (e) { return null; }
    },
    write(d) {
      const s = store(); if (!s || !V.runSaveValid(d)) return false;
      try { s.setItem(KEY, JSON.stringify(d)); } catch (e) { return false; }
      tell(); return true;
    },
    clear() { const s = store(); if (s) { try { s.removeItem(KEY); } catch (e) { /* private mode */ } } tell(); },
    on(fn) { listeners.push(fn); },
  };

  /* The furthest wave that is a multiple of five this player has reached. From then on a new night may begin at
     any such wave up to it (director.js `setStart`), with the money and kit of a first wave: no advantage but the
     kept skill tree. Kept in this browser and, as the `reach` extra of the outfits' document (src/progress.js),
     with the player's save; of two devices the further one stands. */
  const RKEY = 'gunslinger.vigil.reach.v1';
  const five = (n) => Math.max(0, Math.min(1000, Math.floor((+n || 0) / 5) * 5));
  let best = 0, dirty = false;
  { const s = store(); if (s) { try { best = five(s.getItem(RKEY)); } catch (e) { /* private mode */ } } }
  const keep = () => { const s = store(); if (s) { try { s.setItem(RKEY, String(best)); } catch (e) { /* private mode */ } } };
  V.reach = {
    get best() { return best; },
    starts() { const out = [1]; for (let n = 5; n <= best; n += 5) out.push(n); return out; },
    allowed(n) { return n === 1 || (Number.isInteger(n) && n >= 5 && n % 5 === 0 && n <= best); },
    set(n) { n = five(n); if (n <= best) return false; best = n; dirty = true; keep(); tell(); return true; },
    doc() { return { w: best }; },
    merge(d) { const n = five(d && d.w); if (n <= best) return false; best = n; keep(); tell(); return true; },
    dirty: () => dirty,
    saved() { dirty = false; },
  };
})();
