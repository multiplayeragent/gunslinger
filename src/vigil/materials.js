/* Materials for the churchyard. Scanned CC0 sets (Poly Haven) are run through the engine's surface shader,
   so they get the same rain wetness, macro variation and grime as the harbor's generated materials. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});

  // name -> [folder, metres per repeat]
  const SETS = {
    rubble: ['medieval_blocks_02', 2.3],
    slate: ['roof_slates_02', 2.6],
    flag: ['slate_floor_02', 2.6],
    plank: ['dark_wooden_planks', 1.7],
    bark: ['pine_bark', 1.4],
    rock: ['mossy_rock', 1.8],
    leaves: ['forest_leaves_03', 3.4],
    mud: ['brown_mud_leaves_01', 3.2],
  };
  // wet = [darkening, roughness multiplier, streaks on verticals, beading]; macro = [albedo variation, roughness variation, frequency, grime]
  const DEFS = {
    rubble: { set: 'rubble', color: 0x8d949c, sat: 0.3, nrm: 1.0, wet: [0.34, 0.5, 0.65, 0], macro: [0.24, 0.1, 0.32, 0.6] },
    rubbleIn: { set: 'rubble', color: 0xa39f97, sat: 0.38, nrm: 0.9, interior: true, wet: [0.2, 0.7, 0.4, 0], macro: [0.2, 0.08, 0.32, 0.75] },
    earth: { set: 'mud', color: 0x8f8a80, sat: 0.7, nrm: 1.2, wet: [0.4, 0.4, 0.5, 0], macro: [0.25, 0.15, 0.6, 0.3] },
    slate: { set: 'slate', color: 0x767e86, nrm: 1.2, wet: [0.3, 0.42, 0.6, 0.2], macro: [0.2, 0.14, 0.4, 0.4] },
    slateIn: { set: 'slate', color: 0x4a4744, nrm: 1.0, interior: true, wet: [0.1, 0.8, 0.3, 0], macro: [0.2, 0.1, 0.4, 0.6] },
    flag: { set: 'flag', color: 0x9a9c9f, nrm: 1.2, interior: true, wet: [0.3, 0.5, 0.5, 0], macro: [0.2, 0.16, 0.45, 0.6] },
    flagOut: { set: 'flag', color: 0x8c9096, nrm: 1.2, wet: [0.36, 0.38, 0.5, 0], macro: [0.22, 0.16, 0.45, 0.5] },
    plank: { set: 'plank', color: [1.5, 1.32, 1.14], nrm: 1.2, wet: [0.4, 0.5, 0.6, 0], macro: [0.2, 0.1, 0.9, 0.4] },
    plankIn: { set: 'plank', color: [2.3, 1.9, 1.5], nrm: 1.2, interior: true, wet: [0.2, 0.7, 0.4, 0], macro: [0.2, 0.1, 0.9, 0.5] },
    bark: { set: 'bark', color: 0x8a8279, nrm: 1.6, wet: [0.35, 0.6, 0.6, 0], macro: [0.25, 0.1, 0.8, 0.3] },
    rock: { set: 'rock', color: 0xa3aaa4, nrm: 1.3, wet: [0.34, 0.5, 0.6, 0], macro: [0.22, 0.12, 0.7, 0.5] },
    rockIn: { set: 'rock', color: 0xa8a59e, nrm: 1.3, interior: true, wet: [0.2, 0.7, 0.4, 0], macro: [0.2, 0.1, 0.7, 0.6] },
    // dressed stone: quoins, mouldings, buttress caps, monuments (the mossy rock scan, flattened and paled)
    ashlar: { set: 'rock', color: [1.25, 1.22, 1.14], sat: 0.3, nrm: 0.55, wet: [0.36, 0.45, 0.6, 0], macro: [0.2, 0.14, 0.5, 0.7] },
    ashlarIn: { set: 'rock', color: [1.3, 1.26, 1.16], sat: 0.25, nrm: 0.55, interior: true, wet: [0.2, 0.7, 0.4, 0], macro: [0.2, 0.1, 0.5, 0.75] },
    marble: { set: 'rock', color: [1.9, 1.88, 1.82], sat: 0.12, nrm: 0.22, rough: 0.8, wet: [0.25, 0.4, 0.6, 0.3], macro: [0.16, 0.1, 0.8, 0.5] },
    timber: { set: 'plank', color: [1.15, 0.98, 0.82], nrm: 0.9, wet: [0.4, 0.5, 0.6, 0], macro: [0.22, 0.1, 0.9, 0.4] },
    timberIn: { set: 'plank', color: [1.75, 1.42, 1.1], nrm: 0.9, interior: true, wet: [0.2, 0.7, 0.4, 0], macro: [0.22, 0.1, 0.9, 0.5] },
    pale: { set: 'plank', color: [2.6, 2.4, 2.1], sat: 0.45, nrm: 1.1, wet: [0.4, 0.5, 0.6, 0], macro: [0.22, 0.1, 0.9, 0.4] },
    sack: { set: 'mud', color: [1.5, 1.36, 1.05], sat: 0.3, nrm: 0.8, wet: [0.4, 0.6, 0.5, 0], macro: [0.15, 0.08, 2.5, 0.3] },
    // metals and cloth need no texture set: flat standard materials picking up the sky and the flames
    iron: { plain: true, color: 0x1a1c20, rough: 0.52, metal: 0.85 },
    ironIn: { plain: true, color: 0x1c1d20, rough: 0.5, metal: 0.85, interior: true },
    rust: { plain: true, color: 0x3a2217, rough: 0.82, metal: 0.55 },
    lead: { plain: true, color: 0x4a5058, rough: 0.5, metal: 0.8 },
    galv: { plain: true, color: 0x7d858c, rough: 0.45, metal: 0.9 },
    brass: { plain: true, color: 0x9a7a3a, rough: 0.34, metal: 1 },
    brassIn: { plain: true, color: 0xa8843c, rough: 0.3, metal: 1, interior: true },
    gunmetal: { plain: true, color: 0x22262b, rough: 0.42, metal: 0.9 },
    olive: { plain: true, color: 0x3a4230, rough: 0.7, metal: 0.1 },
    rope: { plain: true, color: 0x8a7550, rough: 1, metal: 0 },
    cloth: { plain: true, color: 0x5a1218, rough: 0.95, metal: 0, interior: true },
    canvasTan: { plain: true, color: 0x7a6c4e, rough: 1, metal: 0 },
    skin: { plain: true, color: 0x8c6f5e, rough: 0.7, metal: 0 },
  };

  V.mats = {
    SETS,
    async create(g) {
      const T = g.THREE, I = V.I;
      const aniso = Math.min(8, g.renderer.capabilities.getMaxAnisotropy ? g.renderer.capabilities.getMaxAnisotropy() : 1);
      const loader = new T.TextureLoader();
      const loadTex = (url, srgb, tile) => new Promise((resolve) => {
        const done = (t) => {
          t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = aniso;
          t.repeat.set(1 / tile, 1 / tile);
          if (srgb) t.colorSpace = T.SRGBColorSpace;
          t.needsUpdate = true; resolve(t);
        };
        loader.load(url, done, undefined, () => {
          console.error('[vigil] texture failed to load: ' + url);
          const d = new T.DataTexture(new Uint8Array(srgb ? [128, 128, 128, 255] : url.includes('nor') ? [128, 128, 255, 255] : [255, 200, 0, 255]), 1, 1);
          done(d);
        });
      });
      const sets = {};
      await Promise.all(Object.entries(SETS).map(async ([name, [folder, tile]]) => {
        const base = 'assets/textures/' + folder + '/';
        const [albedo, orm, normal] = await Promise.all([loadTex(base + 'diff.jpg', true, tile), loadTex(base + 'arm.jpg', false, tile), loadTex(base + 'nor.jpg', false, tile)]);
        sets[name] = { albedo, orm, normal, tile };
      }));

      const cache = new Map();
      // A standard material wired into the engine's surface shader (wetness, macro variation, grime).
      function pbr(def, extra = {}) {
        const S = sets[def.set];
        const m = new T.MeshStandardMaterial({
          map: S.albedo, normalMap: S.normal, roughnessMap: S.orm, metalnessMap: S.orm, aoMap: S.orm,
          color: def.color == null ? 0xffffff : Array.isArray(def.color) ? new T.Color(def.color[0], def.color[1], def.color[2]) : def.color, roughness: def.rough == null ? 1 : def.rough, metalness: def.metal == null ? 1 : def.metal,
          vertexColors: extra.vertexColors !== false,
        });
        const n = def.nrm == null ? 1 : def.nrm;
        m.normalScale.set(n, n);
        m.name = 'vg_' + def.set;
        if (def.side === 2 || extra.doubleSide) m.side = T.DoubleSide;
        m.defines = { ...(m.defines || {}), SL_TINT: 0, SL_FX: '' };
        const U = {
          uSlWet: g.mats.uniforms.wet,
          uSlWetP: { value: new T.Vector4(...(def.wet || [0.3, 0.5, 0.6, 0])) },
          uSlMacro: { value: new T.Vector4(...(def.macro || [0.2, 0.1, 0.5, 0.4])) },
          uSlUv: { value: new T.Vector3(1, 1, 1024) },
          uSlX: { value: new T.Vector2(def.interior ? 0.12 : 1, 0) },
          uGSat: { value: def.sat == null ? 1 : def.sat },
        };
        m.userData.sl = U;
        if (def.interior) m.userData.interior = true;
        // Saturation is a uniform, not a constant: every scanned material then shares one compiled program.
        m.onBeforeCompile = (shader) => {
          I.patchStd(shader, U);
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float uGSat;')
            .replace('vec4 sampledDiffuseColor = texture2D(map, slUv);',
              'vec4 sampledDiffuseColor = texture2D(map, slUv); sampledDiffuseColor.rgb = mix(vec3(dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114))), sampledDiffuseColor.rgb, uGSat);');
          if (extra.patch) extra.patch(shader);
        };
        const key = 'sl2|0f|vg' + (extra.cacheKey || '');
        m.customProgramCacheKey = () => key;
        return m;
      }
      function get(key) {
        let m = cache.get(key);
        if (m) return m;
        const def = DEFS[key];
        if (!def) { console.warn('[vigil] unknown material "' + key + '"'); m = g.mats.get('concrete', { vertexColors: true }); }
        else if (def.plain) {
          m = new T.MeshStandardMaterial({ color: def.color, roughness: def.rough, metalness: def.metal, vertexColors: true });
          m.name = 'vg_' + key;
          if (def.interior) m.userData.interior = true;
        } else m = pbr(def);
        cache.set(key, m);
        return m;
      }
      const basic = (key, color, mult = 1, opts = {}) => {
        const m = new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(mult), ...opts });
        m.name = 'vg_' + key; cache.set(key, m); return m;
      };
      basic('flame', 0xffb45a, 7);
      basic('ember', 0xff7a2a, 3);
      basic('void', 0x020304, 1);
      // candle wax: unlit-ish warm ivory so candles read in the dark without a light each
      const wax = new T.MeshStandardMaterial({ color: 0xd8cfb4, roughness: 0.55, metalness: 0, emissive: 0x3a2410, emissiveIntensity: 0.6, vertexColors: true });
      wax.name = 'vg_wax'; cache.set('wax', wax);
      return { get, pbr, sets, defs: DEFS, cache };
    },
  };
})();
