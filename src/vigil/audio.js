/* Sound for the churchyard, synthesised into the engine's sound table before it boots: the dead, the bell,
   the crystal, the defenses, and night-forest replacements for the harbor's ambient one-shots. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const TAU = Math.PI * 2;

  // ---------- small DSP kit ----------
  const buf = (sr, secs) => new Float32Array(Math.max(1, Math.round(sr * secs)));
  // two-pole band-pass / low-pass applied in place
  function biquad(x, sr, type, f, q) {
    const w = TAU * Math.min(f, sr * 0.45) / sr, al = Math.sin(w) / (2 * q), c = Math.cos(w);
    let b0, b1, b2; const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
    if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; } else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; } else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = x[i], y = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
    return x;
  }
  const mixIn = (out, src, gain = 1, at = 0) => { for (let i = 0; i < src.length && i + at < out.length; i++) out[i + at] += src[i] * gain; return out; };
  const env = (t, a, d, len) => (t < a ? t / a : Math.exp(-(t - a) / d)) * (len ? Math.min(1, (len - t) / 0.03) : 1);

  // A voiced throat: a jittery pulse train through three formants, plus breath.
  function voice(sr, rng, o) {
    const n = Math.round(sr * o.len), src = new Float32Array(n), out = new Float32Array(n);
    let ph = 0, drift = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, u = t / o.len;
      drift += (rng() - 0.5) * 0.02; drift *= 0.995;
      const f = (o.f0 + (o.f1 - o.f0) * u) * (1 + drift * (o.jit || 1) + 0.03 * Math.sin(TAU * (o.vib || 5) * t));
      ph += f / sr; if (ph >= 1) ph -= 1;
      // glottal pulse: sharp closing edge, with roughness from amplitude modulation
      const pulse = Math.pow(1 - ph, 3) - 0.25;
      const rough = 1 - (o.rough || 0) * (0.5 + 0.5 * Math.sin(TAU * (o.roughHz || 28) * t + 6 * drift));
      src[i] = pulse * rough + (rng() - 0.5) * (o.breath || 0.12);
    }
    const formants = o.formants || [[520, 6], [980, 8], [2400, 9]];
    formants.forEach(([f, q], k) => {
      const band = Float32Array.from(src);
      biquad(band, sr, 'bp', f * (o.shift || 1), q);
      mixIn(out, band, [1, 0.55, 0.22][k] || 0.2);
    });
    for (let i = 0; i < n; i++) { const t = i / sr; out[i] *= Math.min(1, t / (o.att || 0.08)) * Math.min(1, (o.len - t) / (o.rel || 0.25)) * (1 - (o.trem || 0) * (0.5 + 0.5 * Math.sin(TAU * 7 * t))); }
    return out;
  }
  function noiseBurst(sr, rng, len, decay, type, f, q) {
    const x = buf(sr, len);
    for (let i = 0; i < x.length; i++) x[i] = (rng() * 2 - 1) * Math.exp(-(i / sr) / decay);
    return type ? biquad(x, sr, type, f, q || 0.8) : x;
  }
  function partials(sr, len, list, strike = 0.004) {
    const x = buf(sr, len);
    for (const [f, a, d] of list) for (let i = 0; i < x.length; i++) { const t = i / sr; x[i] += a * Math.sin(TAU * f * t) * Math.exp(-t / d) * Math.min(1, t / strike); }
    return x;
  }

  const GEN = {
    groan(sr, rng, v) {
      const lo = 62 + v * 9 + rng() * 10;
      return voice(sr, rng, { len: 1.3 + rng() * 0.9, f0: lo * 1.25, f1: lo * 0.8, rough: 0.55, roughHz: 22 + rng() * 14, breath: 0.2, jit: 2.2, formants: [[430 + v * 40, 5], [900 + v * 60, 7], [2300, 8]], rel: 0.5, att: 0.18 });
    },
    screech(sr, rng, v) {
      return voice(sr, rng, { len: 0.7 + rng() * 0.3, f0: 300 + v * 60, f1: 520 + rng() * 120, rough: 0.7, roughHz: 55, breath: 0.45, jit: 4, formants: [[900, 4], [1900, 5], [3400, 6]], rel: 0.2, att: 0.03, trem: 0.3 });
    },
    growl(sr, rng, v) {
      return voice(sr, rng, { len: 1.6 + rng() * 0.6, f0: 52 + v * 6, f1: 38, rough: 0.85, roughHz: 17, breath: 0.25, jit: 2.5, formants: [[300, 4], [640, 6], [1500, 7]], rel: 0.6, att: 0.2 });
    },
    zombie_die(sr, rng, v) {
      const a = voice(sr, rng, { len: 0.95, f0: 150 + v * 25, f1: 55, rough: 0.6, roughHz: 30, breath: 0.35, jit: 3, formants: [[560, 5], [1100, 6], [2500, 8]], rel: 0.45, att: 0.02 });
      return mixIn(a, noiseBurst(sr, rng, 0.5, 0.12, 'lp', 700, 0.7), 0.5, Math.round(sr * 0.1));
    },
    zombie_die_big(sr, rng) {
      const a = voice(sr, rng, { len: 2.0, f0: 90, f1: 30, rough: 0.9, roughHz: 14, breath: 0.3, jit: 3, formants: [[260, 4], [560, 5], [1300, 7]], rel: 0.9, att: 0.03 });
      return mixIn(a, noiseBurst(sr, rng, 1.0, 0.3, 'lp', 300, 0.7), 0.7, Math.round(sr * 0.2));
    },
    zombie_hit(sr, rng) {
      const x = noiseBurst(sr, rng, 0.28, 0.05, 'lp', 900, 0.8);
      const th = buf(sr, 0.28); for (let i = 0; i < th.length; i++) { const t = i / sr; th[i] = Math.sin(TAU * (120 - 220 * t) * t) * Math.exp(-t / 0.07); }
      return mixIn(x, th, 0.9);
    },
    flesh_hit(sr, rng, v) {
      const x = noiseBurst(sr, rng, 0.16, 0.022 + v * 0.006, 'bp', 520 + v * 180, 1.1);
      const th = buf(sr, 0.16); for (let i = 0; i < th.length; i++) { const t = i / sr; th[i] = Math.sin(TAU * (160 - 400 * t) * t) * Math.exp(-t / 0.03); }
      return mixIn(mixIn(x, th, 0.8), noiseBurst(sr, rng, 0.12, 0.05, 'lp', 2600, 0.6), 0.25, Math.round(sr * 0.02));
    },
    // a limb coming away: a wet rip over a dull crack
    limb_tear(sr, rng, v) {
      const x = noiseBurst(sr, rng, 0.34, 0.07, 'bp', 700 + v * 260, 0.9);
      for (let i = 0; i < x.length; i++) { const t = i / sr; x[i] *= 0.55 + 0.45 * Math.sin(TAU * (38 + 30 * t) * t * 3); }
      const cr = partials(sr, 0.12, [[190, 0.6, 0.03], [410, 0.35, 0.02]], 0.001);
      return mixIn(mixIn(x, cr, 0.9), noiseBurst(sr, rng, 0.2, 0.05, 'lp', 3200, 0.6), 0.3, Math.round(sr * 0.03));
    },
    gib_land(sr, rng, v) {
      const th = buf(sr, 0.22); for (let i = 0; i < th.length; i++) { const t = i / sr; th[i] = Math.sin(TAU * (110 - 150 * t) * t) * Math.exp(-t / 0.05); }
      return mixIn(th, noiseBurst(sr, rng, 0.16, 0.03, 'bp', 900 + v * 300, 1), 0.6);
    },
    // stone giving way: a crack, the body of the block, then grit running out
    stone_break(sr, rng, v) {
      const x = noiseBurst(sr, rng, 0.9, 0.035, 'bp', 2400 + v * 500, 1.2);
      const th = buf(sr, 0.9); for (let i = 0; i < th.length; i++) { const t = i / sr; th[i] = Math.sin(TAU * (95 - 40 * t) * t) * Math.exp(-t / 0.12); }
      mixIn(x, th, 1.0); mixIn(x, noiseBurst(sr, rng, 0.5, 0.12, 'lp', 700, 0.7), 0.8, Math.round(sr * 0.02));
      for (let k = 0; k < 7; k++) mixIn(x, noiseBurst(sr, rng, 0.07, 0.012, 'bp', 1500 + rng() * 2600, 2.5), 0.25 + rng() * 0.3, Math.round(sr * (0.12 + rng() * 0.6)));
      return x;
    },
    stone_hit(sr, rng, v) {
      const x = partials(sr, 0.16, [[620 + v * 210, 0.5, 0.02], [1480 + v * 330, 0.3, 0.012], [2900, 0.15, 0.008]], 0.0008);
      return mixIn(x, noiseBurst(sr, rng, 0.1, 0.012, 'bp', 3200, 1.5), 0.5);
    },
    // timber: a sharp split, a hollow knock and splinters
    wood_break(sr, rng, v) {
      const x = noiseBurst(sr, rng, 0.7, 0.03, 'bp', 1500 + v * 400, 1.4);
      mixIn(x, partials(sr, 0.4, [[150 + v * 30, 0.8, 0.07], [330, 0.5, 0.05], [710, 0.3, 0.03]], 0.001), 0.9);
      for (let k = 0; k < 6; k++) mixIn(x, noiseBurst(sr, rng, 0.05, 0.008, 'bp', 2200 + rng() * 3000, 3), 0.3 + rng() * 0.3, Math.round(sr * (0.05 + rng() * 0.45)));
      return x;
    },
    wood_hit(sr, rng, v) {
      const x = partials(sr, 0.2, [[210 + v * 70, 0.6, 0.04], [520 + v * 110, 0.35, 0.025], [1150, 0.15, 0.012]], 0.0008);
      return mixIn(x, noiseBurst(sr, rng, 0.08, 0.01, 'bp', 2000, 1.2), 0.35);
    },
    body_fall(sr, rng) {
      const th = buf(sr, 0.5); for (let i = 0; i < th.length; i++) { const t = i / sr; th[i] = Math.sin(TAU * (70 - 60 * t) * t) * Math.exp(-t / 0.11); }
      return mixIn(th, noiseBurst(sr, rng, 0.35, 0.08, 'lp', 420, 0.7), 0.7);
    },
    spit(sr, rng) {
      const x = noiseBurst(sr, rng, 0.4, 0.09, 'bp', 1400, 2.2);
      const g = voice(sr, rng, { len: 0.4, f0: 180, f1: 90, rough: 0.8, roughHz: 40, breath: 0.5, formants: [[700, 4], [1500, 5], [2800, 6]], rel: 0.15, att: 0.01 });
      return mixIn(x, g, 0.7);
    },
    acid(sr, rng) {
      const x = buf(sr, 1.1);
      for (let i = 0; i < x.length; i++) { const t = i / sr; x[i] = (rng() * 2 - 1) * Math.exp(-t / 0.4) * (0.5 + 0.5 * Math.sin(TAU * 31 * t + 4 * rng())); }
      return biquad(x, sr, 'hp', 2800, 0.7);
    },
    bell(sr) {
      // a tenor church bell: hum, prime, tierce, quint, nominal and a couple of upper partials
      const f = 196;
      return partials(sr, 5.5, [[f * 0.5, 0.5, 3.8], [f, 0.8, 3.0], [f * 1.19, 0.55, 2.0], [f * 1.5, 0.3, 1.4], [f * 2, 0.6, 1.6], [f * 2.52, 0.22, 0.9], [f * 3.01, 0.18, 0.7], [f * 4.07, 0.1, 0.45]], 0.003);
    },
    wave_clear(sr) {
      const x = buf(sr, 2.6);
      [[392, 0], [494, 0.16], [587, 0.32], [784, 0.52]].forEach(([f, at]) => mixIn(x, partials(sr, 2.0, [[f, 0.5, 0.9], [f * 2.01, 0.2, 0.5], [f * 3.02, 0.08, 0.3]], 0.004), 0.7, Math.round(sr * at)));
      return x;
    },
    purchase(sr) { const x = buf(sr, 0.5); mixIn(x, partials(sr, 0.4, [[1760, 0.5, 0.12], [2637, 0.35, 0.09], [3520, 0.2, 0.06]], 0.002)); return mixIn(x, partials(sr, 0.35, [[2093, 0.5, 0.12], [3136, 0.3, 0.08]], 0.002), 0.8, Math.round(sr * 0.07)); },
    deny(sr) { const x = buf(sr, 0.28); for (let i = 0; i < x.length; i++) { const t = i / sr; x[i] = (Math.sin(TAU * 140 * t) > 0 ? 0.5 : -0.5) * Math.exp(-t / 0.12) * (t < 0.12 || t > 0.16 ? 1 : 0); } return biquad(x, sr, 'lp', 900, 0.7); },
    crystal_hit(sr, rng, v) {
      const f = 1250 + v * 190 + rng() * 80;
      return mixIn(partials(sr, 1.3, [[f, 0.6, 0.35], [f * 1.503, 0.35, 0.28], [f * 2.76, 0.22, 0.16], [f * 0.5, 0.25, 0.5]], 0.001), noiseBurst(sr, rng, 0.08, 0.012, 'hp', 4000, 0.7), 0.5);
    },
    crystal_break(sr, rng) {
      const x = noiseBurst(sr, rng, 3.0, 0.5, 'hp', 1800, 0.7);
      for (let k = 0; k < 26; k++) { const f = 900 + rng() * 5200; mixIn(x, partials(sr, 0.8, [[f, 0.3, 0.1 + rng() * 0.25]], 0.001), 0.6, Math.round(sr * rng() * 1.2)); }
      const th = buf(sr, 3.0); for (let i = 0; i < th.length; i++) { const t = i / sr; th[i] = Math.sin(TAU * 48 * t) * Math.exp(-t / 0.9); }
      return mixIn(x, th, 1.2);
    },
    crystal_hum(sr) {
      const n = Math.round(sr * 4), x = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / sr; x[i] = 0.5 * Math.sin(TAU * 110 * t) * (0.7 + 0.3 * Math.sin(TAU * 0.5 * t)) + 0.3 * Math.sin(TAU * 165 * t + Math.sin(TAU * 0.25 * t)) + 0.14 * Math.sin(TAU * 440 * t) * (0.5 + 0.5 * Math.sin(TAU * 0.75 * t)) + 0.08 * Math.sin(TAU * 659.25 * t); }
      return x;
    },
    vg_shot(sr, rng, v) {
      const x = noiseBurst(sr, rng, 0.5, 0.03 + v * 0.004, 'lp', 5200 - v * 500, 0.6);
      const th = buf(sr, 0.5); for (let i = 0; i < th.length; i++) { const t = i / sr; th[i] = Math.sin(TAU * (150 - 380 * t) * t) * Math.exp(-t / 0.045); }
      return mixIn(mixIn(x, th, 0.9), noiseBurst(sr, rng, 0.5, 0.16, 'bp', 700, 0.8), 0.3, Math.round(sr * 0.015));
    },
    flare_pop(sr, rng) {
      const x = noiseBurst(sr, rng, 1.4, 0.5, 'bp', 2400, 1.2);
      for (let i = 0; i < x.length; i++) { const t = i / sr; x[i] *= 0.6 + 0.4 * Math.sin(TAU * 43 * t); }
      return mixIn(x, noiseBurst(sr, rng, 0.2, 0.03, 'lp', 3000, 0.7), 1.2);
    },
    heal(sr) { const x = buf(sr, 1.2); [[523, 0], [659, 0.1], [784, 0.2]].forEach(([f, at]) => mixIn(x, partials(sr, 0.9, [[f, 0.4, 0.4], [f * 2, 0.12, 0.25]], 0.03), 0.8, Math.round(sr * at))); return x; },
    shock(sr, rng) {
      const th = buf(sr, 1.4); for (let i = 0; i < th.length; i++) { const t = i / sr; th[i] = Math.sin(TAU * (95 - 55 * Math.min(1, t * 2)) * t) * Math.exp(-t / 0.35); }
      return mixIn(th, noiseBurst(sr, rng, 1.2, 0.3, 'bp', 500, 0.8), 0.8);
    },
    aegis(sr) { return partials(sr, 2.4, [[220, 0.5, 1.2], [330, 0.4, 1.0], [440, 0.35, 0.9], [660, 0.25, 0.7], [1320, 0.12, 0.5]], 0.25); },
    // ---- night forest, standing in for the harbor's ambient one-shots ----
    owl(sr, rng, v) {
      const x = buf(sr, 2.2);
      [0, 0.38, 0.62, 1.15].forEach((at, k) => { const f = (k === 3 ? 330 : 370) - v * 25; const h = buf(sr, k === 3 ? 0.6 : 0.2); for (let i = 0; i < h.length; i++) { const t = i / sr; h[i] = Math.sin(TAU * (f - 30 * t) * t) * Math.sin(Math.PI * Math.min(1, t / (h.length / sr))) * 0.6; } mixIn(x, h, 1, Math.round(sr * at)); });
      return x;
    },
    wolf(sr, rng) { return voice(sr, rng, { len: 3.2, f0: 300, f1: 520, rough: 0.1, breath: 0.08, jit: 0.6, vib: 4, formants: [[600, 6], [1100, 8], [2200, 9]], rel: 1.4, att: 0.7 }); },
    creak(sr, rng) {
      const x = buf(sr, 1.2); let ph = 0;
      for (let i = 0; i < x.length; i++) { const t = i / sr; ph += (38 + 30 * Math.sin(t * 5) + rng() * 20) / sr; x[i] = (ph % 1 < 0.08 ? 1 : 0) * Math.sin(Math.PI * t / 1.2); }
      return biquad(x, sr, 'bp', 1300, 3);
    },
    branch(sr, rng) { const x = noiseBurst(sr, rng, 0.5, 0.04, 'bp', 1900, 1.5); return mixIn(x, noiseBurst(sr, rng, 0.3, 0.03, 'bp', 2600, 2), 0.7, Math.round(sr * 0.13)); },
    forest(sr, rng) {
      // slow wind in needles, looping
      const n = Math.round(sr * 6), x = new Float32Array(n);
      let lp = 0;
      for (let i = 0; i < n; i++) { const t = i / sr; lp += ((rng() * 2 - 1) - lp) * 0.08; x[i] = lp * (0.55 + 0.45 * Math.sin(TAU * t / 6) * Math.sin(TAU * t / 3 + 1)); }
      const f = Math.round(sr * 0.4);
      for (let i = 0; i < f; i++) { const k = i / f; x[i] = x[i] * k + x[n - f + i] * (1 - k); }
      return biquad(x.subarray(0, n - f), sr, 'bp', 900, 0.6);
    },
  };

  V.audio = {
    g: null,
    // Adds the vigil sounds to the engine's table. Runs before the audio module is created.
    register(I) {
      const S = I.sounds, hn = 44100, lo = 22050, mid = 32000;
      const world = (gen, n, extra = {}) => ({ gen, n, sr: mid, peak: 0.6, bus: 'world', max: 4, pri: 4, ref: 6, roll: 0.7, ...extra });
      const dry = (gen, n, extra = {}) => ({ gen, n, sr: mid, peak: 0.5, bus: 'dry', max: 2, pri: 6, ...extra });
      Object.assign(S, {
        groan: world(GEN.groan, 4, { max: 5, pri: 2, ref: 5 }), screech: world(GEN.screech, 2, { pri: 3, ref: 7 }), growl: world(GEN.growl, 2, { pri: 4, ref: 9, peak: 0.75 }),
        zombie_die: world(GEN.zombie_die, 3, { pri: 4 }), zombie_die_big: world(GEN.zombie_die_big, 1, { pri: 6, ref: 10, peak: 0.85 }),
        zombie_hit: dry(GEN.zombie_hit, 1, { peak: 0.6, pri: 7 }), flesh_hit: world(GEN.flesh_hit, 3, { sr: hn, max: 5, pri: 5, ref: 5 }),
        body_fall: world(GEN.body_fall, 1, { pri: 2, ref: 4 }), spit: world(GEN.spit, 1, { pri: 5 }), acid: world(GEN.acid, 1, { pri: 4 }),
        bell: dry(GEN.bell, 1, { sr: lo, peak: 0.6, pri: 8 }), wave_clear: dry(GEN.wave_clear, 1, { peak: 0.4, pri: 8 }),
        purchase: dry(GEN.purchase, 1, { sr: hn, peak: 0.3, pri: 9 }), deny: dry(GEN.deny, 1, { peak: 0.3, pri: 9 }),
        crystal_hit: world(GEN.crystal_hit, 3, { sr: hn, pri: 6, ref: 9, peak: 0.5 }), crystal_break: dry(GEN.crystal_break, 1, { peak: 0.9, pri: 10 }),
        crystal_hum: { gen: GEN.crystal_hum, n: 1, sr: lo, peak: 0.34, loop: 1, ref: 3, roll: 1.2 },
        vg_shot: world(GEN.vg_shot, 3, { sr: hn, max: 6, pri: 5, ref: 9, roll: 0.55, peak: 0.6 }),
        flare_pop: world(GEN.flare_pop, 1, { pri: 5 }), heal: dry(GEN.heal, 1, { peak: 0.3, pri: 7 }),
        shock: dry(GEN.shock, 1, { peak: 0.8, pri: 9 }), aegis: dry(GEN.aegis, 1, { sr: lo, peak: 0.4, pri: 8 }),
        limb_tear: world(GEN.limb_tear, 3, { sr: hn, pri: 6, ref: 6, peak: 0.7 }), gib_land: world(GEN.gib_land, 2, { max: 3, pri: 2, ref: 4, peak: 0.45 }),
        stone_break: world(GEN.stone_break, 3, { sr: hn, pri: 6, ref: 9, peak: 0.85 }), stone_hit: world(GEN.stone_hit, 3, { sr: hn, max: 5, pri: 2, ref: 5, peak: 0.4 }),
        wood_break: world(GEN.wood_break, 3, { sr: hn, pri: 6, ref: 8, peak: 0.8 }), wood_hit: world(GEN.wood_hit, 3, { sr: hn, max: 5, pri: 2, ref: 5, peak: 0.4 }),
      });
      // the harbor's ambience becomes a wet forest at night: same triggers, different voices
      const swap = (name, gen, n) => { if (S[name]) { S[name].gen = gen; if (n) S[name].n = n; } };
      swap('foghorn', GEN.wolf, 1); swap('gull_cry', GEN.owl, 2); swap('halyard', GEN.creak, 2); swap('container_bang', GEN.branch, 1); swap('sea', GEN.forest, 1);
    },
    install(g) { this.g = g; },
    play(name, opts) {
      const a = this.g && this.g.audio;
      if (!a || !a.play) return;
      try { a.play(name, opts); } catch (e) { /* never let a sound break the frame */ }
    },
    loop(name, opts) {
      const a = this.g && this.g.audio;
      try { return a && a.loop ? a.loop(name, opts) : null; } catch (e) { return null; }
    },
  };
})();
