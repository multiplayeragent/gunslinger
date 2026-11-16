/* Sound levels. The engine has one volume, the master. This adds two more beside it in Settings, for sound
   effects and for music, remembers them, and says so on the title screen while the browser is still holding
   the sound back (a page may not make any until it has been clicked or a key pressed).

   Sound effects are the engine's world, near, gun, tail, ambience and dry buses; music is its music bus, or
   whatever a map plays in its place (the Churchyard: see src/vigil/music.js, which reads `musicLevel` and
   listens with `onChange`). */
(function () {
  'use strict';
  const STORE = 'gunslinger.audio.v1', SFX = ['world', 'near', 'gun', 'tail', 'amb', 'dry'];
  const clamp = (v) => (Number.isFinite(+v) ? Math.min(1, Math.max(0, +v)) : 0);
  const M = (window.GunslingerMixer = {
    sfx: 1, music: 0.8, muted: false, score: true,
    _on: [], _base: null, _audio: null, _rows: null,
    // what music plays at: its slider, or nothing while it is muted
    get musicLevel() { return this.muted ? 0 : this.music; },
    onChange(fn) { this._on.push(fn); },
    load() {
      try {
        const o = JSON.parse(localStorage.getItem(STORE) || '{}') || {};
        if (o.sfx != null) this.sfx = clamp(o.sfx);
        if (o.music != null) this.music = clamp(o.music);
        // a mute is for this visit only: one saved by the old M key would otherwise keep the music off for good
        this.muted = false;
      } catch (e) { /* nothing saved, or no storage: the defaults stand */ }
    },
    save() { try { localStorage.setItem(STORE, JSON.stringify({ sfx: this.sfx, music: this.music, muted: this.muted })); } catch (e) { /* not remembered */ } },
    set(kind, v) {
      if (kind === 'sfx') this.sfx = clamp(v);
      else { this.music = clamp(v); this.muted = false; }
      this.save(); this.apply();
    },
    // off, and back to where the slider was (nothing in play is bound to it: see src/vigil/music.js)
    toggleMusic() {
      this.muted = !this.muted;
      if (!this.muted && this.music < 0.05) this.music = 0.8;
      this.save(); this.apply();
      return this.muted ? 'off' : Math.round(this.music * 100) + '%';
    },
    // A map that plays its own music takes the engine's score off its bus (false), or gives it back (true).
    engineScore(on) { this.score = !!on; this.apply(); },
    apply() {
      const a = this._audio, b = this._base;
      if (a && b) {
        const t = a.ctx.currentTime, to = (node, v) => { try { node.gain.setTargetAtTime(v, t, 0.03); } catch (e) { node.gain.value = v; } };
        for (const k of SFX) if (a.buses[k]) to(a.buses[k], b[k] * this.sfx);
        if (a.buses.music) to(a.buses.music, this.score ? b.music * this.musicLevel : 0);
      }
      if (this._rows) for (const r of this._rows) { const v = Math.round((r.kind === 'sfx' ? this.sfx : this.musicLevel) * 100); r.input.value = v; r.out.textContent = v + '%'; }
      for (const fn of this._on) { try { fn(this); } catch (e) { console.error('[mixer] a listener threw: ' + ((e && e.stack) || e)); } }
    },
    install(g) {
      this.load();
      const a = g.audio;
      if (a && a.ctx && a.buses) {
        this._audio = a; this._base = {};
        for (const k of SFX.concat('music')) if (a.buses[k]) this._base[k] = a.buses[k].gain.value;
      }
      this.rows(0);
      this.apply();
      if (this._audio) this.hint(g);
    },
    // Two rows under the engine's "Master volume", built like it so they take its styles.
    rows(tries) {
      const vol = document.querySelector('#s-vol'), row = vol && vol.closest && vol.closest('.row');
      if (!row) { if (tries < 20) setTimeout(() => this.rows(tries + 1), 500); return; }
      if (this._rows) return;
      const make = (id, label, kind) => {
        const el = document.createElement('div');
        el.className = 'row';
        el.innerHTML = `<label for="${id}">${label}</label><div class="slider"><input id="${id}" type="range" min="0" max="100" step="1"><output></output></div>`;
        const input = el.querySelector('input'), out = el.querySelector('output');
        input.addEventListener('input', () => this.set(kind, +input.value / 100));
        return { el, input, out, kind };
      };
      const sfx = make('s-sfx', 'Sound effects', 'sfx'), music = make('s-music', 'Music', 'music');
      row.after(sfx.el); sfx.el.after(music.el);
      this._rows = [sfx, music];
      this.apply();
    },
    // "Click or press a key for sound": only on the title, only until the browser lets the sound start
    hint(g) {
      const ctx = this._audio.ctx, el = document.createElement('div');
      el.className = 'gs-sound-hint'; el.setAttribute('role', 'status'); el.textContent = 'Click or press any key for sound'; el.hidden = true;
      (document.getElementById('app') || document.body).appendChild(el);
      const check = () => {
        if (ctx.state === 'running') { el.remove(); clearInterval(timer); return; }
        el.hidden = !(g.game && g.game.state === 'title');
      };
      const timer = setInterval(check, 400);
      check();
    },
  });
})();
