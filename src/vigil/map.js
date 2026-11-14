/* Crystal Vigil: the churchyard map. This file registers the map with the engine and owns the
   constants every other vigil file reads. World units are metres; the crystal stands at the origin,
   the church runs north (-Z) to south (+Z), and the main gate is on the south wall. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});

  V.WORLD = 64;                 // half extent of the walkable square
  V.YARD = 30;                  // graveyard wall, half extent
  V.CH = { hw: 6.1, hd: 12.9, t: 0.9, eave: 7.6, rise: 5.4, floor: 0.24 };   // church outer half extents
  V.MOON = [-0.60, 0.62, 0.50];
  V.CRYSTAL = { x: 0, y: 1.95, z: 0, reach: 2.7 };

  // Night replaces the harbor's dawn. The volumetric pass and the sky both read this horizon function.
  const HORIZON = `
uniform vec3 uSunDir, uZen, uHor, uHorAway, uSunCol;
float skyToSun(vec3 d){ return clamp(dot(normalize(d.xz + vec2(1e-5)), normalize(uSunDir.xz)) * 0.5 + 0.5, 0.0, 1.0); }
vec3 horizonColor(vec3 d){
  float ts = skyToSun(d);
  return mix(uHorAway, uHor, ts * ts * (3.0 - 2.0 * ts));
}
`;

  const sky = (noise) => `
// GUNSLINGER_SKY
precision highp float;
varying vec3 vDir;
uniform float uTime, uEnv, uFlash;
uniform vec3 uFlashDir;
${noise}
${HORIZON}
float sHash(vec2 p){ vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  float mu = dot(d, uSunDir);
  float s = max(mu, 0.0);
  vec3 hc = horizonColor(d);

  // ---- clear night air ----
  vec3 clearC = mix(hc, uZen, smoothstep(0.0, 0.42, pow(h, 0.62)));
  clearC += uSunCol * (pow(s, 6.0) * 0.012 + pow(s, 40.0) * 0.05 + pow(s, 420.0) * 0.35);     // moon glow in thin haze

  // ---- stars (three cell sizes, twinkling, fading into the haze) ----
  float star = 0.0;
  vec3 ad = abs(d);
  vec2 suv = ad.y >= ad.x && ad.y >= ad.z ? d.xz / ad.y : (ad.x >= ad.z ? d.zy / ad.x : d.xy / ad.z);
  for (int i = 0; i < 3; i++) {
    float sc = 90.0 + float(i) * 75.0;
    vec2 g = suv * sc; vec2 c = floor(g); vec2 f = fract(g) - 0.5;
    float r = sHash(c + float(i) * 17.3);
    vec2 o = (vec2(sHash(c + 3.1), sHash(c + 7.7)) - 0.5) * 0.7;
    float pt = smoothstep(0.11, 0.0, length(f - o));
    float tw = 0.75 + 0.25 * sin(uTime * (1.5 + r * 5.0) + r * 40.0);
    star += pt * step(0.955, r) * (0.35 + 0.65 * fract(r * 53.0)) * tw;
  }
  clearC += vec3(0.62, 0.72, 1.0) * star * 0.55 * smoothstep(0.05, 0.4, h) * (1.0 - uEnv);

  // ---- broken cloud deck drifting on the wind ----
  vec2 cuv = d.xz / (h + 0.13) * vec2(0.55, 0.8);
  vec2 q = cuv + vec2(0.010, -0.006) * uTime;
  float warp = fbm3(q * 0.5 + 4.2);
  vec2 qq = q + (warp - 0.5) * 1.5;
  float dens = fbm5(qq);
  float big = n2(q * 0.21 + 9.1);
  float body = dens * 0.72 + big * 0.36;
  float cov = smoothstep(0.40, 0.60, body) * smoothstep(0.0, 0.10, h);
  // a ragged clearing keeps the moon in view
  float hole = smoothstep(0.90, 0.995, mu + (dens - 0.5) * 0.05);
  cov *= 1.0 - 0.85 * hole;
  vec2 sd = normalize(uSunDir.xz + vec2(1e-4));
  float densS = fbm5(qq + sd * 0.25);
  float relief = clamp((dens - densS) * 4.0 + 0.5, 0.0, 1.0);
  float thick = smoothstep(0.42, 0.75, body);
  vec3 cloudC = mix(uHor * 1.15, uZen * 0.55, thick) * (0.6 + 0.8 * relief);
  // silver lining near the moon, on thin edges
  float rim = cov * (1.0 - cov) * 4.0;
  cloudC += uSunCol * (pow(s, 5.0) * 0.10 * (0.25 + relief * relief * 1.6) + rim * pow(s, 9.0) * 0.30);
  // sheet lightning inside the deck
  float fl = uFlash * pow(max(dot(d, uFlashDir), 0.0), 4.0);
  cloudC += vec3(0.55, 0.66, 1.0) * fl * (0.5 + 2.4 * dens * dens);
  cloudC = mix(cloudC, hc, exp(-h * 9.0));
  vec3 col = mix(clearC, cloudC, cov * 0.97);
  col += vec3(0.50, 0.62, 1.0) * uFlash * 0.05 * (1.0 - cov);

  // ---- moon (left out of the environment capture: the directional light stands in for it) ----
  float disc = smoothstep(0.99962, 0.99978, mu);
  vec3 up = abs(uSunDir.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 mx = normalize(cross(up, uSunDir)), my = cross(uSunDir, mx);
  vec2 mp = vec2(dot(d, mx), dot(d, my)) * 46.0;
  float mare = fbm3(mp * 1.7 + 12.0) * 0.6 + fbm3(mp * 5.0 + 3.0) * 0.4;
  float limb = sqrt(max(0.0, 1.0 - dot(mp, mp) * 0.72));
  vec3 moon = vec3(1.0, 0.97, 0.90) * (0.55 + 0.6 * mare) * (0.35 + 0.65 * limb) * 9.0;
  col += moon * disc * (1.0 - cov * 0.9) * (1.0 - uEnv);

  if (d.y < 0.0) {
    float t = clamp(-d.y * 6.0, 0.0, 1.0);
    col = mix(hc, uHorAway * 0.35, t);
  }
  col = mix(col, min(col, vec3(4.0)), uEnv);
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}`;

  const map = {
    id: 'vigil',
    engine: true,
    name: 'Churchyard',
    place: 'Crystal Vigil',
    bootLine: 'Lighting the lanterns',
    modes: [
      { id: 'vigil', name: 'Vigil', note: 'The dead are climbing out of the graveyard. Keep the crystal in the church alive, wave after wave.' },
    ],
    bootText: {
      'Mixing paint, rust and rain': 'Cutting stone, slate and iron',
      'Stacking containers': 'Raising the church',
      'Raising the cranes': 'Planting the forest',
      'Flooding the apron': 'Soaking the graveyard',
      'Loading tracers and smoke': 'Loading tracers and smoke',
      'Checking the rifle': 'Checking the rifle',
      'Waking the Harbormaster': 'Waking the dead',
      'Waiting for first light': 'Waiting for moonrise',
    },
    horizonGLSL: HORIZON,
    shadowBounds: null,
    skyFragment() { return sky(V.I.noiseGLSL); },

    // Called by the engine while it loads, before any module exists.
    configure(I) {
      V.I = I;
      const T = (V.THREE = I.THREE), W = V.WORLD;
      I.setNav(-W, W, -W, W);
      I.bounds.min.set(-W, 0, -W); I.bounds.max.set(W, 40, W);
      I.bounds.quayX = 1e6; I.bounds.seaY = -40;
      I.sun.dir.set(V.MOON[0], V.MOON[1], V.MOON[2]).normalize();
      I.sun.color.setRGB(0.60, 0.72, 1.0);
      I.sun.intensity = 1.7;
      I.sky.zenith.setRGB(0.010, 0.016, 0.032);
      I.sky.horizon.setRGB(0.060, 0.082, 0.120);
      I.sky.horizonAway.setRGB(0.026, 0.036, 0.056);
      I.sky.fog.setRGB(0.070, 0.092, 0.130);
      I.explosiveSpots.length = 0;
      // One shadow map for the whole churchyard; the second box only pushes the near plane out toward the moon.
      this.shadowBounds = [new T.Vector3(-W - 4, -0.2, -W - 4), new T.Vector3(W + 4, 27, W + 4), new T.Vector3(-W - 4, -3, -W - 4), new T.Vector3(W + 4, 40, W + 4)];
      // Vigil has no relays to cut and starts its own waves.
      I.holdout.firstDelay = Infinity;
      I.holdout.bestKey = 'gunslinger.vigil.best';
      // Keys: melee moves to V (the rifle kit decides the fire mode), F becomes the flashlight, Enter starts a wave.
      delete I.bindings.KeyF; I.bindings.KeyV = 'melee';
      delete I.bindings.Enter; delete I.bindings.NumpadEnter;
      Object.assign(I.radio, {
        intro: 'Warden, the dead are rising. Get to the church and hold it. The crystal must not go dark.',
        contact: 'They have your scent. Make every round count.',
        low: 'You are badly hurt. Fall back to the nave and use a medkit.',
        done: 'The vigil is kept.',
      });
      if (V.audio && V.audio.register) V.audio.register(I);
    },

    createLevel(g) { return V.level.create(g); },
    createGround(g) { return V.ground.create(g); },
    createBackdrop(g) { return V.backdrop.create(g); },
    createEnemies(g) { return V.zombies.create(g); },
    // Optical tuning for a wet night: thick low fog, restrained bloom, exposure held down so dark stays dark.
    look(g) {
      Object.assign(g.render.tune || {}, {
        grain: 0.014, ca: 0.0002, vignette: 0.3, lookSat: 0.95, lookPower: 1.06,
        bloom: 0.07, bloomMix: 0.5, dirt: 0.03, streak: 0.012, flare: 0.02,
        sharpen: 0.2, volSigma: 0.011, volFarHaze: 0.5, volInteriorDust: 2.5, volSunScale: 0.9, volAmbient: 0.25,
        aoIntensity: 1.5, aoStrength: 0.9, key: 0.075, minExposure: 0.9, maxExposure: 2.6,
      });
      if (g.mats && g.mats.uniforms && g.mats.uniforms.wet) g.mats.uniforms.wet.value = 0.85;
    },
    install(g) { if (V.director) V.director.install(g); },
  };

  (window.GunslingerMaps = window.GunslingerMaps || {}).vigil = map;
})();
