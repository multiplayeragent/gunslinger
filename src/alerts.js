/* The announcement lane, after War Bash's (its 09s-rankup.js and 09-game.js xpPopup).

   Top centre, one announcement at a time from a single queue: a level-up (a dark plate between two gold
   rules that open from the middle, the rank's badge landing on it with a ring and a few sparks, the level
   rolling from the old number to the new) goes ahead of an unlock (two chevrons, a gold title and a line under
   it: a challenge finished, an outfit earned, a skill point). Nothing shows behind the pause screen: what was
   waiting, or cut short, comes back afterwards. Everything moves by CSS transforms and opacity and takes no
   input; with "reduce motion" set there are fades only.

   Experience gained is listed to the right of the reticle, newest nearest it, three at most.

   window.GunslingerAlerts: level(n, sub), unlock(title, sub, kind), xp(amount, label, kind), clear(). */
(function () {
  'use strict';
  const LEVEL_MS = 5400, UNLOCK_MS = 3800, SPARKS = 22;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const A = (window.GunslingerAlerts = {
    installed: false,
    level() {}, unlock() {}, xp() {}, clear() {},
    install(g) {
      if (this.installed || typeof document === 'undefined' || !document.body || !document.createElement) return;
      const host = document.getElementById('ui') || document.getElementById('app') || document.body;
      if (!host.appendChild) return;
      this.installed = true;
      const L = window.GunslingerLevels;
      const lane = document.createElement('div'); lane.className = 'gs-lane'; lane.setAttribute('aria-live', 'polite');
      lane.innerHTML = `<div class="ru" aria-hidden="true"><div class="ru-plate"><i class="ru-sheen"></i></div><i class="ru-edge t"></i><i class="ru-edge b"></i>
        <div class="ru-core"><div class="ru-badge"><i class="ru-glow"></i><i class="ru-ring"></i><i class="ru-ins"></i><div class="ru-sparks">${'<i></i>'.repeat(SPARKS)}</div></div>
        <div class="ru-txt"><small class="ru-kick"></small><div class="ru-title"><span class="ru-lv">Level</span><span class="ru-roll"><b class="ru-old"></b><b class="ru-new"></b></span></div><span class="ru-rank"></span><span class="ru-sub"></span></div></div></div>
        <div class="au" aria-hidden="true"><i class="au-ic"></i><div class="au-tx"><b></b><span></span></div></div>`;
      host.appendChild(lane);
      // the flash a level-up throws across the screen: a gold glow from the top and a line of light at the banner's height
      const flash = document.createElement('div'); flash.className = 'gs-flash'; flash.setAttribute('aria-hidden', 'true'); flash.innerHTML = '<i class="gs-flash-glow"></i><i class="gs-flash-streak"></i>'; host.appendChild(flash);
      const xpbox = document.createElement('div'); xpbox.className = 'gs-xpbox'; xpbox.setAttribute('aria-hidden', 'true'); host.appendChild(xpbox);
      const ru = lane.querySelector('.ru'), au = lane.querySelector('.au');
      const q = [];
      let cur = null, timer = 0, startedAt = 0, retry = 0;
      const held = () => !g.game || g.game.state === 'paused' || document.hidden;

      // A level is a fanfare: a drum under the first note, four rising notes of brass, a held chord with a cymbal
      // swelling into it and a few bright notes over the top (one more voice for a promotion). An unlock is two
      // notes. Made here, played through the effects mix.
      function fanfare(ctx, out, promoted) {
        const t0 = ctx.currentTime + 0.03, bus = ctx.createGain(), lp = ctx.createBiquadFilter(), nodes = [bus, lp];
        bus.gain.value = promoted ? 0.36 : 0.3;
        lp.type = 'lowpass'; lp.Q.value = 0.7;
        lp.frequency.setValueAtTime(900, t0); lp.frequency.exponentialRampToValueAtTime(3800, t0 + 0.55); lp.frequency.setTargetAtTime(2100, t0 + 1.3, 0.7);
        lp.connect(bus); bus.connect(out);
        const voice = (f, at, len, lv, type, det, to) => {
          const o = ctx.createOscillator(), gn = ctx.createGain();
          o.type = type; o.frequency.value = f; o.detune.value = det || 0;
          gn.gain.setValueAtTime(0, t0 + at); gn.gain.linearRampToValueAtTime(lv, t0 + at + 0.016); gn.gain.exponentialRampToValueAtTime(0.001, t0 + at + len);
          o.connect(gn); gn.connect(to || lp); o.start(t0 + at); o.stop(t0 + at + len + 0.05);
        };
        const brass = (f, at, len, lv) => { voice(f, at, len, lv * 0.5, 'sawtooth', -7); voice(f, at, len, lv * 0.5, 'sawtooth', 7); voice(f / 2, at, len, lv * 0.3, 'square', 0); };
        // the drum
        const d = ctx.createOscillator(), dg = ctx.createGain();
        d.type = 'sine'; d.frequency.setValueAtTime(118, t0); d.frequency.exponentialRampToValueAtTime(46, t0 + 0.3);
        dg.gain.setValueAtTime(0.0001, t0); dg.gain.exponentialRampToValueAtTime(1.1, t0 + 0.012); dg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.75);
        d.connect(dg); dg.connect(bus); d.start(t0); d.stop(t0 + 0.8);
        // the cymbal: noise swelling into the chord, then ringing off
        const len = Math.floor(ctx.sampleRate * 2.4), nb = ctx.createBuffer(1, len, ctx.sampleRate), ch = nb.getChannelData(0);
        for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
        const ns = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), ng = ctx.createGain();
        ns.buffer = nb; hp.type = 'highpass'; hp.frequency.value = 5200;
        ng.gain.setValueAtTime(0.0001, t0); ng.gain.exponentialRampToValueAtTime(0.05, t0 + 0.42); ng.gain.exponentialRampToValueAtTime(0.3, t0 + 0.5); ng.gain.exponentialRampToValueAtTime(0.001, t0 + 2.3);
        ns.connect(hp); hp.connect(ng); ng.connect(bus); ns.start(t0); ns.stop(t0 + 2.4);
        // the call and the chord
        [[293.66, 0], [440, 0.11], [587.33, 0.22], [739.99, 0.33]].forEach(([f, at]) => brass(f, at, 0.2, 0.95));
        for (const f of [293.66, 369.99, 440, 587.33, 880].concat(promoted ? [1174.66] : [])) brass(f, 0.5, 1.8, 0.62);
        [1760, 2217.46, 2637.02, 3520].forEach((f, i) => voice(f, 0.58 + i * 0.065, 0.55, 0.13, 'sine', 0, bus));
        nodes.push(dg, hp, ng);
        setTimeout(() => { for (const n of nodes) { try { n.disconnect(); } catch (e) { /* gone */ } } }, 3200);
      }
      function sound(kind, promoted) {
        if (kind === 'level') { const a = g.audio, ctx = a && a.ctx, out = a && a.buses && a.buses.dry; if (ctx && out && ctx.state === 'running') fanfare(ctx, out, promoted); return; }
        const a = g.audio, ctx = a && a.ctx, out = a && a.buses && a.buses.dry;
        if (!ctx || !out || ctx.state !== 'running') return;
        const notes = kind === 'level' ? [[293.66, 0], [440, 0.1], [587.33, 0.2], [739.99, 0.3], [880, 0.42]] : [[587.33, 0], [880, 0.09]];
        const t0 = ctx.currentTime + 0.02, lp = ctx.createBiquadFilter(), bus = ctx.createGain();
        lp.type = 'lowpass'; lp.frequency.value = kind === 'level' ? 2600 : 3200; bus.gain.value = kind === 'level' ? 0.16 : 0.1;
        lp.connect(bus); bus.connect(out);
        notes.forEach(([f, at], i) => {
          const last = i === notes.length - 1, len = last ? (kind === 'level' ? 0.9 : 0.5) : 0.16;
          for (const [type, det, lv] of [['sawtooth', 0, 0.5], ['triangle', 7, 0.6]]) {
            const o = ctx.createOscillator(), gn = ctx.createGain();
            o.type = type; o.frequency.value = f; o.detune.value = det;
            gn.gain.setValueAtTime(0, t0 + at); gn.gain.linearRampToValueAtTime(lv, t0 + at + 0.012); gn.gain.exponentialRampToValueAtTime(0.001, t0 + at + len);
            o.connect(gn); gn.connect(lp); o.start(t0 + at); o.stop(t0 + at + len + 0.05);
          }
        });
        setTimeout(() => { try { lp.disconnect(); bus.disconnect(); } catch (e) { /* gone */ } }, 2500);
      }
      function paintBadge(el, level) {
        const n = L ? L.RANKS.length : 11, i = L ? L.rankIndex(level) : 0;
        el.style.backgroundImage = 'url("assets/ui/ranks.webp")';
        el.style.backgroundSize = `${n * 100}% 100%`;
        el.style.backgroundPosition = `${(i / (n - 1)) * 100}% 0`;
      }
      function hide() { for (const el of [ru, au]) { el.classList.remove('show'); el.setAttribute('aria-hidden', 'true'); } flash.classList.remove('go'); }
      function show(it) {
        cur = it; startedAt = performance.now();
        if (it.type === 'level') {
          ru.classList.toggle('promo', !!it.promoted);
          ru.querySelector('.ru-kick').textContent = it.promoted ? 'Promoted' : 'Level up';
          paintBadge(ru.querySelector('.ru-ins'), it.level);
          ru.querySelector('.ru-old').textContent = Math.max(1, it.level - 1); ru.querySelector('.ru-new').textContent = it.level;
          ru.querySelector('.ru-rank').textContent = it.rank || (L ? L.rankName(it.level) : '');
          ru.querySelector('.ru-sub').textContent = it.sub || '';
          ru.querySelectorAll('.ru-sparks i').forEach((s, i, all) => {
            const a = (i / all.length) * Math.PI * 2 + Math.random() * 0.4, d = 9 + Math.random() * 12;
            s.style.setProperty('--dx', (Math.cos(a) * d * 1.3).toFixed(1)); s.style.setProperty('--dy', (Math.sin(a) * d).toFixed(1)); s.style.setProperty('--w', (0.8 + Math.random() * 0.5).toFixed(2) + 's');
          });
          ru.style.setProperty('--d', LEVEL_MS + 'ms');
          ru.setAttribute('aria-hidden', 'false'); ru.classList.remove('show'); void ru.offsetWidth; ru.classList.add('show');
          flash.classList.toggle('promo', !!it.promoted); flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
        } else {
          au.dataset.kind = it.kind || '';
          au.querySelector('b').textContent = it.title; au.querySelector('span').textContent = it.sub || '';
          au.style.setProperty('--d', UNLOCK_MS + 'ms');
          au.setAttribute('aria-hidden', 'false'); au.classList.remove('show'); void au.offsetWidth; au.classList.add('show');
        }
        sound(it.type, !!it.promoted);
        clearTimeout(timer);
        timer = setTimeout(() => { hide(); cur = null; timer = setTimeout(pump, 260); }, it.type === 'level' ? LEVEL_MS : UNLOCK_MS);
      }
      // the next one: a level before an unlock; while the lane is held, try again shortly
      function pump() {
        clearTimeout(retry);
        if (cur || !q.length) return;
        if (held()) { retry = setTimeout(pump, 400); return; }
        const i = q.findIndex((it) => it.type === 'level');
        show(q.splice(i >= 0 ? i : 0, 1)[0]);
      }
      // the pause screen arrives: what is showing steps back into the queue unless it had mostly been seen
      function suspend() {
        if (!cur) return;
        const seen = performance.now() - startedAt > (cur.type === 'level' ? LEVEL_MS : UNLOCK_MS) * 0.55;
        if (!seen) q.unshift(cur);
        clearTimeout(timer); hide(); cur = null;
      }
      if (g.events && g.events.on) g.events.on('game:state', ({ state }) => { if (state === 'paused') suspend(); else pump(); });

      this.level = (level, sub, o = {}) => {
        q.push({ type: 'level', level, sub, promoted: !!o.promoted, rank: o.rank });
        const levels = q.filter((it) => it.type === 'level'); if (levels.length > 3) q.splice(q.indexOf(levels[0]), 1);      // several at once: the last three
        if (cur && cur.type === 'unlock') { q.unshift(cur); clearTimeout(timer); hide(); cur = null; }                        // an unlock gives way, and comes back
        pump();
      };
      // the badge sheet decoded before the first level-up needs it (the Churchyard's warm-up asks for this)
      this.warm = () => { try { const im = new Image(); im.src = 'assets/ui/ranks.webp'; if (im.decode) im.decode().catch(() => {}); this.badges = im; } catch (e) { /* no images */ } };
      this.unlock = (title, sub, kind) => { q.push({ type: 'unlock', title, sub, kind }); if (q.length > 8) q.splice(q.findIndex((it) => it.type === 'unlock'), 1); pump(); };
      this.xp = (amount, label, kind) => {
        const el = document.createElement('div'); el.className = 'gs-xp' + (kind ? ' ' + kind : '');
        el.innerHTML = `<b>+${esc(amount)}</b>${label ? `<span>${esc(label)}</span>` : ''}`;
        xpbox.appendChild(el); setTimeout(() => el.remove(), 1700);
        while (xpbox.children.length > 3) xpbox.firstChild.remove();
      };
      this.clear = () => { q.length = 0; clearTimeout(timer); clearTimeout(retry); hide(); cur = null; xpbox.textContent = ''; };
      this.debug = () => ({ flash: flash.classList.contains('go'), showing: cur ? cur.type + ':' + (cur.level || cur.title) : null, waiting: q.map((it) => it.type + ':' + (it.level || it.title)), xp: xpbox.children.length });
    },
  });
  void A;
})();
