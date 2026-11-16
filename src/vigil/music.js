/* Music for the churchyard: four looping cues, chosen by what the night is doing and faded across each other.

     prep    a pipe organ alone, between waves and on the title screen
     wave    organ and heavy guitars, for a wave
     surge   faster, for waves on top of each other, a crowd, a crystal in trouble, and a wave that brings a boss
     boss    while an abomination walks

   The files and their loop points are listed in assets/music/vigil.json (tools/music/build.mjs writes both).
   While this plays, the engine's own harbor score is silenced on its bus; if the files are missing, that score
   plays on as before. It goes into the engine's mix where that score would (`audio.mix.music`), so gunfire,
   being hurt and the pause screen dip it the same way, and its level is the Music slider in Settings
   (src/mixer.js). There is no key for it in play: M once muted it, from beside the armory's B and the mine's N,
   and a slip of the hand silenced the music for good. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const RATE = 32000;                 // the files' sample rate: decoded as they are, they take a third less memory
  const KEEP = 3;                     // decoded cues kept at once; the rest are read again when wanted

  // What should be playing. s: { state, phase, over, boss, bossWave, stacked, alive, crystal, cue, held }
  // (crystal is its health from 0 to 1, cue what plays now, held for how many seconds). null is silence.
  V.musicCue = function (s) {
    if (s.state === 'title') return 'prep';
    if (s.state !== 'playing' && s.state !== 'paused' && s.state !== 'intro') return null;      // dead, complete
    if (s.over) return null;                                                                    // the crystal has fallen
    if (s.boss) return 'boss';                                                                  // one that is after someone, in a wave or out of it
    if (s.phase !== 'active') return s.hunted > 0 ? 'wave' : 'prep';                            // the wild dead, woken between waves
    // a wave is pressed when it brings a boss (before it shows and after it falls), when waves overlap, when
    // the yard is full, or when the crystal is going; once up, the music stays up until things have eased
    const pressed = s.bossWave || s.stacked || s.alive >= 22 || s.crystal < 0.35;
    if (pressed) return 'surge';
    if (s.cue === 'surge' && !(s.held > 18 && s.alive <= 14 && s.crystal > 0.5)) return 'surge';
    return 'wave';
  };
  // How one cue gives way to another: [seconds the old one takes to go, seconds before the new one starts,
  // seconds it takes to come up, whether it comes up from behind a closed filter].
  V.musicFade = function (from, to) {
    if (!to) return [3.2, 0, 0, false];                                 // defeat: it just goes
    if (to === 'boss') return [0.9, 0.05, 0.35, false];                 // it arrives with the thing itself
    if (to === 'prep') return from ? [4.5, 1.6, 5.0, false] : [0, 0, 3.0, false];      // the fight drains away, the organ returns
    if (from === 'prep' || !from) return [2.6, 0.15, 1.6, true];        // a wave is called
    if (from === 'boss') return [3.6, 0.4, 3.0, false];                 // it is down: back to the fight that is left
    return [2.6, 0, 2.6, false];                                        // wave to surge and back
  };

  V.music = {
    install(g) {
      const self = this, a = g.audio, ctx = a && a.ctx, mixer = window.GunslingerMixer;
      this.ready = false;
      const out = a && ((a.mix && a.mix.music) || (a.buses && a.buses.dry));
      if (!ctx || !out || typeof fetch !== 'function') return;                              // silent audio (?noaudio=1), or nothing to play through
      const level = () => (mixer ? mixer.musicLevel : 0.8);
      const cues = {};
      let voice = null, want = null, clock = 0, tick = 0, held = 0, ducked = 1, lpAt = 20000;
      // every cue -> bus (the level) -> a low-pass (closed while you are down) -> the engine's music path, so
      // its ducking, master volume, compressor and limiter are the ones its own score went through
      const bus = ctx.createGain(), lp = ctx.createBiquadFilter();
      bus.gain.value = 0; lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.6;
      bus.connect(lp); lp.connect(out);
      const ownPause = !(a.mix && a.mix.music);            // on the plain bus nothing dips it under the pause screen but this

      function decode(data) {
        let dc = ctx;
        try { const C = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (C) dc = new C(2, 2, RATE); } catch (e) { dc = ctx; }
        return new Promise((resolve, reject) => { const p = dc.decodeAudioData(data, resolve, reject); if (p && p.catch) p.catch(reject); });
      }
      function load(id) {
        const c = cues[id];
        if (!c || c.buf || c.loading || c.failed) return;
        c.loading = fetch('assets/music/' + c.file)
          .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
          .then(decode)
          .then((buf) => { c.buf = buf; c.loading = null; c.used = clock; trim(); })
          .catch((e) => { c.loading = null; c.failed = true; console.error('[vigil] music cue ' + id + ' did not load: ' + ((e && e.message) || e)); });
      }
      // Which cues to have decoded for where the night stands: never more than KEEP of them.
      function needed(s) {
        if (s.state === 'title') return ['prep'];
        if (s.phase === 'active' || s.hunted > 0) return s.bossWave || s.boss ? ['boss', 'surge', 'prep'] : ['wave', 'surge', 'prep'];
        return (s.wave + 1) % 5 === 0 ? ['prep', 'boss', 'surge'] : ['prep', 'wave', 'surge'];
      }
      let need = ['prep'];
      // drop the decoded cue that has gone longest unused: never the one playing, nor one about to be wanted
      function trim() {
        const have = Object.values(cues).filter((c) => c.buf);
        while (have.length > KEEP) {
          const spare = have.filter((c) => !(voice && voice.id === c.id) && !need.includes(c.id)).sort((p, q) => p.used - q.used)[0];
          if (!spare) return;
          spare.buf = null; have.splice(have.indexOf(spare), 1);
        }
      }
      function stop(v, secs) {
        const now = ctx.currentTime, gn = v.g.gain;
        try { gn.cancelScheduledValues(now); gn.setValueAtTime(gn.value, now); gn.linearRampToValueAtTime(0, now + Math.max(0.03, secs)); } catch (e) { gn.value = 0; }
        try { v.src.stop(now + Math.max(0.03, secs) + 0.06); } catch (e) { /* already stopped */ }
        v.src.onended = () => { try { v.src.disconnect(); v.g.disconnect(); v.door.disconnect(); } catch (e) { /* gone */ } };
      }
      function start(id, delay, rise, filtered) {
        const c = cues[id], now = ctx.currentTime, at = now + delay;
        const gn = ctx.createGain(), src = ctx.createBufferSource(), door = ctx.createBiquadFilter();
        gn.gain.setValueAtTime(0, now); gn.gain.setValueAtTime(0, at); gn.gain.linearRampToValueAtTime(c.gain, at + Math.max(0.03, rise));
        src.buffer = c.buf; src.loop = true; src.loopStart = c.start; src.loopEnd = c.end;
        door.type = 'lowpass'; door.Q.value = 0.7; door.frequency.value = 20000;
        // a wave's music opens up over its first bars, like a door: it is heard coming before it is on you
        if (filtered) { try { door.frequency.setValueAtTime(380, now); door.frequency.setValueAtTime(380, at); door.frequency.exponentialRampToValueAtTime(20000, at + 6); } catch (e) { door.frequency.value = 20000; } }
        src.connect(gn); gn.connect(door); door.connect(bus);
        src.start(at, c.start);
        c.used = clock;
        return { id, src, g: gn, door };
      }
      function go(id) {
        const [out, delay, rise, filtered] = V.musicFade(voice ? voice.id : null, id);
        if (voice) stop(voice, out);
        voice = id ? start(id, delay, rise, filtered) : null;
        held = 0;
      }
      function situation() {
        const D = V.director, S = D && D.S, Z = g.enemies, state = g.game.state;
        let alive = 0, boss = false;
        let hunted = 0;
        // the wild dead count only once they are awake: one wandering far off in the trees is not a fight
        if (Z && Z.list) for (const z of Z.list) if (z.alive && z.state !== 2 && !z.roam) { if (z.wild) hunted++; else alive++; if (z.type === 'boss') boss = true; }
        const waves = (S && S.waves) || [];
        return {
          state, phase: S ? S.phase : 'prep', over: !!(S && S.over), boss, alive: alive + hunted, hunted, down: !!(S && S.down),
          bossWave: waves.some((c) => c && c.n % 5 === 0), stacked: waves.length > 1,
          crystal: S && S.crystal && S.crystal.max ? S.crystal.hp / S.crystal.max : 1,
          wave: S ? S.wave : 0, cue: voice ? voice.id : null, held,
        };
      }
      const setLevel = (target, tc) => { try { bus.gain.setTargetAtTime(target, ctx.currentTime, tc); } catch (e) { bus.gain.value = target; } };

      this.update = (dt) => {
        clock += dt; held += dt; tick -= dt;
        if (!self.ready || tick > 0) return;
        tick = 0.2;
        const s = situation();
        want = level() > 0 ? V.musicCue(s) : null;
        // have decoded what is likely next; what plays carries on until the cue wanted has been read
        if (level() > 0) { need = needed(s); if (want && !need.includes(want)) need = [want].concat(need).slice(0, KEEP); for (const id of need) load(id); }
        if ((voice ? voice.id : null) !== want) {
          if (!want) go(null);
          else if (cues[want].buf) go(want);
          else load(want);
        }
        if (voice) cues[voice.id].used = clock;
        // at the Music slider's level; shut behind a filter while you are down
        const duck = (ownPause && s.state === 'paused' ? 0.4 : 1) * level();
        if (duck !== ducked) { ducked = duck; setLevel(duck, 0.25); }
        const cut = s.down && s.state !== 'title' ? 520 : 20000;
        if (cut !== lpAt) { lpAt = cut; try { lp.frequency.cancelScheduledValues(ctx.currentTime); lp.frequency.setTargetAtTime(cut, ctx.currentTime, cut < 1000 ? 0.25 : 0.5); } catch (e) { lp.frequency.value = cut; } }
      };
      this.debug = () => ({ ready: self.ready, level: +level().toFixed(2), playing: voice ? voice.id : null, want, held: +held.toFixed(1), loaded: Object.values(cues).filter((c) => c.buf).map((c) => c.id), failed: Object.values(cues).filter((c) => c.failed).map((c) => c.id), bus: +bus.gain.value.toFixed(3), cutoff: Math.round(lp.frequency.value), node: bus });

      fetch('assets/music/vigil.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((list) => {
        for (const id of Object.keys(list)) cues[id] = Object.assign({ id, buf: null, loading: null, failed: false, used: 0 }, list[id]);
        if (!cues.prep || !cues.wave || !cues.surge || !cues.boss) throw new Error('a cue is missing from the list');
        // from here on this is the churchyard's music: the harbor score keeps time on its bus, unheard
        if (mixer) mixer.engineScore(false); else { try { a.buses.music.gain.value = 0; } catch (e) { /* no such bus: both would play */ } }
        self.ready = true; ducked = -1;
      }).catch((e) => console.warn('[vigil] no music files (' + ((e && e.message) || e) + '): the engine score plays instead'));
    },
    update() {},
    debug() { return { ready: false }; },
  };
})();
