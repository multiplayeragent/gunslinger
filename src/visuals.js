/* Renderer-facing realism layer: optical calibration, geometry-aware harbor IBL,
   texel-snapped high-density shadows, practical harbor floodlights, photo-derived
   multi-map wet concrete, planar sea reflections, viewmodel PBR/lighting, enemy AO,
   and lit PBR surface-impact decals. */
window.GunslingerVisuals = {
  install(g) {
    const T = g.THREE;
    // A map that brings its own level (window.GunslingerMap) also brings its own look and skips what is the
    // harbor's alone: the apron, the sea, the machines, the mast lights and the yard IBL probe. The focused
    // shadow fit and the weapon's fill lights it can take with its own numbers (map.shadowFocus, map.viewLights).
    const map = window.GunslingerMap;
    if (map) map.look?.(g);
    else {
      // render.post is transient gameplay state; render.tune drives the persistent optical passes.
      // Photographic, neutral grade: no teal/orange split-tone, restrained bloom/flare, and
      // aerial perspective light enough that mid-ground construction keeps its contrast.
      Object.assign(g.render.tune || {}, {
        grain: .006, ca: .00012, vignette: .12,
        lookSat: .98, lookPower: 1.02, agxMix: .76, split: 0, blackLift: 0,
        bloom: .018, bloomMix: .3, dirt: .008, streak: .005, flare: .016,
        sharpen: .22, volSigma: .0015, volFarHaze: .1, volInteriorDust: 1.35,
        aoRadius: .72, aoIntensity: 1.2, aoStrength: .8,
        key: .155, minExposure: .68, maxExposure: 1.65
      });
      if (g.mats?.uniforms?.wet) g.mats.uniforms.wet.value = .62;
      if (g.ground?.setRain) g.ground.setRain(.24);
    }
    if (!g.scene || !T?.TextureLoader) return;

    g.visuals = { materialReady: false, seaReady: false, envReady: false, impacts: 0, activeLights: 0 };
    if (!map) {
      this.installGround(g);
      this.installSea(g);
    }
    this.installViewmodelRealism(g, map?.viewLights);
    if (!map) {
      this.installEnemyRealism(g);
      this.installPracticalLights(g);
      this.installHighResShadows(g);
      this.installEnvironment(g);
    } else if (map.shadowFocus) {
      this.installHighResShadows(g, map.shadowFocus);
    }
    this.installImpacts(g);
    this.installTracers(g);
  },

  /* Synthesize a registered tangent-slope + micro-roughness texture on CPU/Canvas from the
     generated concrete base-color image so cracks, pits and aggregate perturb normals and
     roughness in pixel alignment with base color. Luminance is pre-filtered (3x3 binomial) and
     the slope gain kept moderate: per-pixel albedo noise must not become glittering normals. */
  buildConcreteSurfaceMap(T, image) {
    try {
      const w = Math.min(1024, image?.naturalWidth || image?.width || 0);
      const h = Math.min(1024, image?.naturalHeight || image?.height || 0);
      if (w < 16 || h < 16 || typeof document === 'undefined') return null;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx?.drawImage || !ctx?.getImageData) return null;
      ctx.drawImage(image, 0, 0, w, h);
      const src = ctx.getImageData(0, 0, w, h).data;
      if (!src || src.length < w * h * 4) return null;
      const lum = new Float32Array(w * h);
      const raw = new Float32Array(w * h);
      for (let i = 0, p = 0; i < raw.length; i++, p += 4) {
        raw[i] = (src[p] * .299 + src[p + 1] * .587 + src[p + 2] * .114) / 255;
      }
      const rawAt = (x, y) => raw[((y + h) % h) * w + ((x + w) % w)];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          lum[y * w + x] = (4 * rawAt(x, y) + 2 * (rawAt(x - 1, y) + rawAt(x + 1, y) + rawAt(x, y - 1) + rawAt(x, y + 1))
            + rawAt(x - 1, y - 1) + rawAt(x + 1, y - 1) + rawAt(x - 1, y + 1) + rawAt(x + 1, y + 1)) / 16;
        }
      }
      const out = new Uint8Array(w * h * 4);
      const at = (x, y) => lum[((y + h) % h) * w + ((x + w) % w)];
      const strength = 1.7;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x, o = idx * 4;
          const tl = at(x - 1, y - 1), tc = at(x, y - 1), tr = at(x + 1, y - 1);
          const ml = at(x - 1, y), mc = lum[idx], mr = at(x + 1, y);
          const bl = at(x - 1, y + 1), bc = at(x, y + 1), br = at(x + 1, y + 1);
          const dx = ((tr + 2 * mr + br) - (tl + 2 * ml + bl)) * strength;
          const dy = ((bl + 2 * bc + br) - (tl + 2 * tc + tr)) * strength;
          const lap = Math.max(0, ((tl + tc + tr + ml + mr + bl + bc + br) * .125 - mc) * 6);
          const rough = Math.min(1, Math.max(0, .55 + (.5 - mc) * .45 + lap * .35));
          const cav = Math.min(1, Math.max(0, 1 - lap * 1.6));
          out[o] = Math.min(255, Math.max(0, Math.round((dx * .5 + .5) * 255)));
          out[o + 1] = Math.min(255, Math.max(0, Math.round((dy * .5 + .5) * 255)));
          out[o + 2] = Math.round(rough * 255);
          out[o + 3] = Math.round(cav * 255);
        }
      }
      const tex = new T.DataTexture(out, w, h, T.RGBAFormat);
      tex.wrapS = tex.wrapT = T.RepeatWrapping;
      tex.minFilter = T.LinearMipmapLinearFilter;
      tex.magFilter = T.LinearFilter;
      tex.generateMipmaps = true;
      tex.needsUpdate = true;
      return tex;
    } catch {
      return null;
    }
  },

  installGround(g) {
    const T = g.THREE, material = g.ground?.apron?.material;
    if (!material) return;
    new T.TextureLoader().load('assets/materials/dock-concrete-albedo.png', texture => {
      texture.colorSpace = T.SRGBColorSpace;
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      const maxAniso = g.renderer?.capabilities?.getMaxAnisotropy?.() || 8;
      texture.anisotropy = Math.min(16, maxAniso);
      const surfaceMap = this.buildConcreteSurfaceMap(T, texture.image);
      if (surfaceMap) surfaceMap.anisotropy = Math.min(16, maxAniso);
      const fallbackNR = T.DataTexture ? new T.DataTexture(new Uint8Array([128, 128, 140, 255]), 1, 1, T.RGBAFormat) : texture;
      if (fallbackNR.isDataTexture) fallbackNR.needsUpdate = true;

      const original = material.onBeforeCompile;
      const cacheKey = material.customProgramCacheKey();
      material.onBeforeCompile = shader => {
        original.call(material, shader);
        shader.uniforms.uGsConcrete = { value: texture };
        shader.uniforms.uGsConcreteNR = { value: surfaceMap || fallbackNR };
        shader.uniforms.uGsHasNR = { value: surfaceMap ? 1 : 0 };
        shader.fragmentShader = 'uniform sampler2D uGsConcrete;\nuniform sampler2D uGsConcreteNR;\nuniform float uGsHasNR;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('diffuseColor.rgb *= alb;', `
          vec2 gsUv = gxz / 2.65;
          vec2 gsUvMacro = mat2(0.8, -0.6, 0.6, 0.8) * (gxz / 7.4) + vec2(0.37, 0.63);
          vec3 gsA = texture2D(uGsConcrete, gsUv).rgb;
          vec3 gsB = texture2D(uGsConcrete, gsUvMacro).rgb;
          vec3 gsDetail = mix(gsA, gsB, 0.36);
          vec4 gsNRA = texture2D(uGsConcreteNR, gsUv);
          vec4 gsNRB = texture2D(uGsConcreteNR, gsUvMacro);
          vec2 gsSlope = vec2(0.0);
          float gsRoughDelta = 0.0;
          float gsCavity = 1.0;
          float gsAA = 0.0;
          if (uGsHasNR > 0.5) {
            vec2 sA = gsNRA.rg * 2.0 - 1.0;
            vec2 sB = mat2(0.8, 0.6, -0.6, 0.8) * (gsNRB.rg * 2.0 - 1.0);
            gsSlope = (sA * 0.85 + sB * 0.4) * (1.0 - smoothstep(14.0, 62.0, gDist));
            gsRoughDelta = (mix(gsNRA.b, gsNRB.b, 0.35) - 0.54) * 0.32;
            gsCavity = mix(0.76, 1.0, gsNRA.a);
            // Specular anti-aliasing: widen roughness where the slope varies faster than a pixel
            // can resolve, so the wet apron reads as damp concrete rather than glitter.
            gsAA = clamp(length(fwidth(gsSlope)) * 1.5, 0.0, 0.32);
          }
          // Preserve paint and standing water while enriching porous damp meniscus & cavity darkening.
          float gsDryMask = (1.0 - paint) * (1.0 - puddle);
          vec3 gsNormAlbedo = clamp(gsDetail / vec3(0.245, 0.228, 0.202), vec3(0.38), vec3(1.58));
          alb *= mix(vec3(1.0), gsNormAlbedo * gsCavity, 0.82 * gsDryMask);
          float gsMeniscus = smoothstep(0.0, 0.12, soak) * (1.0 - puddle);
          alb *= 1.0 - 0.16 * gsMeniscus * (1.0 - paint);
          diffuseColor.rgb *= alb;`);

        shader.fragmentShader = shader.fragmentShader.replace(
          'rough = mix(clamp(rough, 0.1, 1.0), 0.055, puddle);',
          'rough = mix(clamp(rough + gsRoughDelta * (1.0 - paint * 0.5) + gsAA, 0.08, 0.98), 0.022, puddle);'
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          'nxz *= 1.0 - puddle;',
          'nxz = (nxz + gsSlope * 1.35 * (1.0 - paint * 0.45) * mix(1.0, 0.42, soak)) * (1.0 - puddle);'
        );
      };
      material.customProgramCacheKey = () => cacheKey + '-gunslinger-photo-3';
      material.needsUpdate = true;
      g.visuals.materialReady = true;
      // Re-bake harbor & interior probes once concrete albedo/normal detail is ready.
      if (g.visuals._rebakeProbes) g.visuals._rebakeProbes();
    }, undefined, error => {
      console.error('[visuals] Concrete texture failed to load', error);
    });
  },

  /* Bind the apron's live planar reflection texture & matrix into the harbor sea shader and
     filter high-frequency capillary wave normals over distance to eliminate specular shimmer. */
  installSea(g) {
    const seaMat = g.ground?.sea?.material, apronUni = g.ground?.uniforms;
    if (!seaMat || !apronUni?.uRefl || !apronUni?.uReflMatrix) return;
    const original = seaMat.onBeforeCompile;
    const cacheKey = seaMat.customProgramCacheKey ? seaMat.customProgramCacheKey() : 'gunslinger-sea-1';
    seaMat.onBeforeCompile = shader => {
      original.call(seaMat, shader);
      shader.uniforms.uRefl = apronUni.uRefl;
      shader.uniforms.uReflMatrix = apronUni.uReflMatrix;
      shader.uniforms.uReflScale = apronUni.uReflScale;
      shader.uniforms.uReflOn = apronUni.uReflOn;
      shader.uniforms.uReflLod = apronUni.uReflLod || { value: 0 };
      shader.fragmentShader =
        `uniform sampler2D uRefl;\nuniform mat4 uReflMatrix;\nuniform vec2 uReflScale;\nuniform float uReflOn, uReflLod;\nfloat gsSeaFoam = 0.0;\n` +
        shader.fragmentShader;
      // Hoist quay/hull foam mask out of zP block and distance-filter micro-ripples to eliminate water Moire grain.
      shader.fragmentShader = shader.fragmentShader.replace(
        'gNxz *= 1.0 - foam * 0.6;',
        `gsSeaFoam = foam;
         float gsWaveFade = 1.0 - smoothstep(22.0, 115.0, gSDist);
         gNxz *= mix(0.32, 1.0, gsWaveFade) * (1.0 - foam * 0.65);
         gRough = clamp(gRough + (1.0 - gsWaveFade) * 0.10, 0.04, 0.85);`
      );
      // Sample parallax-corrected planar harbor reflection (KITTIWAKE hull, STS gantry crane, containers & sky).
      // Three.js physical BRDF applies Schlick Fresnel to `radiance`, so replace `radiance` directly as RP does.
      shader.fragmentShader = shader.fragmentShader.replace(
        'radiance *= gOcc; iblIrradiance *= gOcc;',
        `radiance *= gOcc; iblIrradiance *= gOcc;
         if (uReflOn > 0.5) {
           vec3 gsV = normalize(cameraPosition - vGWorld);
           vec3 gsR = reflect(-gsV, vec3(0.0, 1.0, 0.0));
           vec3 gsHit = vGWorld + gsR * 22.0;
           gsHit.y = max(gsHit.y, 0.05);
           vec4 gsRc = uReflMatrix * vec4(gsHit, 1.0);
           vec2 gsRuv = gsRc.xy / max(gsRc.w, 1e-4);
           vec2 gsFwd = normalize(-gsV.xz + vec2(1e-5));
           vec2 gsSide = vec2(-gsFwd.y, gsFwd.x);
           float gsSinE = clamp(gsV.y, 0.03, 1.0);
           float gsDk = 0.55 / (1.0 + gSDist * 0.035);
           vec2 gsTilt = clamp(vec2(dot(gNxz, gsSide) * gsSinE, dot(gNxz, gsFwd)) * gsDk, vec2(-0.11), vec2(0.11));
           gsRuv += gsTilt * uReflScale;
           float gsLod = clamp(0.85 + gRough * 6.2, 0.6, 6.2) + uReflLod;
           vec2 gsSt = vec2(0.0, 0.018 + gRough * 0.09);
           vec2 gsLo = vec2(0.003), gsHi = vec2(0.997);
           vec3 gsRefl = textureLod(uRefl, clamp(gsRuv, gsLo, gsHi), gsLod).rgb * 0.5
                       + textureLod(uRefl, clamp(gsRuv + gsSt, gsLo, gsHi), gsLod + 0.55).rgb * 0.25
                       + textureLod(uRefl, clamp(gsRuv - gsSt * 0.6, gsLo, gsHi), gsLod + 0.55).rgb * 0.25;
           gsRefl = min(gsRefl, vec3(40.0)) * gOcc;
           float gsReflW = (1.0 - gsSeaFoam * 0.85) * (1.0 - smoothstep(180.0, 420.0, gSDist));
           radiance = mix(radiance, gsRefl, clamp(gsReflW, 0.0, 1.0));
         }`
      );
    };
    seaMat.customProgramCacheKey = () => cacheKey + '-gs-refl-2';
    seaMat.needsUpdate = true;
    g.visuals.seaReady = true;
  },

  /* Calibrate first-person weapon & glove PBR response and add a grounded 3-point view rig
     (warm wet-apron bounce from below + cool sky rim) on the viewmodel layer (Ro = 1). */
  installViewmodelRealism(g, options = {}) {
    const T = g.THREE;
    if (!g.camera || !g.weapon?.rigs || !T?.DirectionalLight) return;
    // The weapon's fill lights stand in for light from the surroundings, so a map whose surroundings differ
    // sets its own (map.viewLights: { key, bounce: [hex, intensity], rim: [hex, intensity] }).
    const fill = { key: .78, bounce: [0x9ea8b0, .38], rim: [0xfff1dc, .52], ...options };
    /* Type II/III hardcoat anodizing is a dark dielectric oxide over aluminium, not a mirror:
       moderate metalness keeps machined form readable instead of a black reflective silhouette.
       Phosphate and nitride steels stay more metallic; polymer gets a realistic black-polymer
       albedo (~4% linear) so moulded texture and edges shade rather than crushing to black. */
    const calibrateRig = (rig, rigId) => {
      rig?.root?.traverse(node => {
        for (const mat of [].concat(node.material || [])) {
          if (!mat) continue;
          if (mat.name === 'pac9_anodised') { mat.roughness = .46; mat.metalness = .32; mat.envMapIntensity = 1.05; }
          else if (mat.name === 'pac9_phosphate') { mat.roughness = .48; mat.metalness = .6; mat.envMapIntensity = 1.05; }
          else if (mat.name === 'pac4_nitride') { mat.roughness = .36; mat.metalness = .62; mat.envMapIntensity = 1.1; }
          else if (mat.name === 'pac9_polymer') { mat.roughness = .6; mat.metalness = 0; mat.envMapIntensity = .9; mat.color?.setRGB?.(.04, .041, .044); }
          else if (mat.name === 'pac9_polymer_tan') { mat.roughness = .62; mat.metalness = 0; mat.envMapIntensity = .9; }
          else if (mat.name === 'brass') { mat.roughness = .38; }
          // Keep the gunsmith's factory-finish reference in sync with the calibrated base color.
          const tint = g.arsenal?.armory?.tints?.[rigId]?.[mat.name];
          if (tint?.material === mat && mat.color) tint.base.copy(mat.color);
        }
      });
    };
    calibrateRig(g.weapon.rigs.rifle, 'rifle');
    calibrateRig(g.weapon.rigs.pistol, 'pistol');
    if (g.arsenal?.armory) g.arsenal.armory.finished = null;

    // Enrich tactical sleeve/glove roughness contrast.
    for (const side of ['left', 'right']) {
      const armMat = g.weapon.arms?.[side]?.mesh?.material;
      if (armMat) { armMat.roughness = .76; armMat.envMapIntensity = .82; }
    }

    // Subtle underside harbor-ground bounce + rear-right grazing rim light on Layer 1.
    const bounce = new T.DirectionalLight(fill.bounce[0], fill.bounce[1]);
    bounce.position.set(.25, -.9, .15);
    bounce.target.position.set(0, .1, -.35);
    bounce.layers.set(1);

    const rim = new T.DirectionalLight(fill.rim[0], fill.rim[1]);
    rim.position.set(.85, .55, .65);
    rim.target.position.set(-.05, -.05, -.35);
    rim.layers.set(1);

    g.camera.add(bounce, bounce.target, rim, rim.target);
    if (g.render) g.render.viewKey = fill.key;
    g.visuals.viewLights = { bounce, rim };
  },

  /* Bake smooth geometric ambient occlusion & lower-chassis grime onto Hound and Gull robots
     and apply distance-aware micro-roughness stabilization on their shared materials. */
  installEnemyRealism(g) {
    const T = g.THREE, dbg = g.enemies?.debug;
    if (!dbg || !T?.BufferAttribute) return;
    if (dbg.mats?.shell) { dbg.mats.shell.roughness = .46; dbg.mats.shell.envMapIntensity = 1.1; }
    if (dbg.mats?.metal) { dbg.mats.metal.roughness = .38; dbg.mats.metal.metalness = .9; dbg.mats.metal.envMapIntensity = 1.2; }

    const baked = new WeakSet();
    const enrichMesh = mesh => {
      const geo = mesh?.geometry;
      if (!geo || baked.has(geo)) return;
      baked.add(geo);
      const pos = geo.attributes?.position, col = geo.attributes?.color, nrm = geo.attributes?.normal;
      if (!pos || !col) return;
      geo.computeBoundingBox?.();
      const bb = geo.boundingBox;
      const minY = bb ? bb.min.y : -.5, spanY = Math.max(.2, bb ? bb.max.y - bb.min.y : 1);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const ny = nrm ? nrm.getY(i) : .5;
        const hNorm = Math.max(0, Math.min(1, (y - minY) / spanY));
        const radial = Math.hypot(x, z);
        // Core underbelly & inner-joint self-occlusion + subtle oil/hydraulic darkening near actuators.
        const coreOcc = .68 + .32 * Math.min(1, radial / .28 + hNorm * .55);
        const hemiOcc = .78 + .22 * (ny * .5 + .5);
        const k = Math.max(.48, Math.min(1.04, coreOcc * hemiOcc));
        col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
      }
      col.needsUpdate = true;
    };
    for (const unit of [...(dbg.hounds || []), ...(dbg.gulls || [])]) {
      unit?.mesh?.traverse?.(n => { if (n.isMesh) enrichMesh(n); });
    }
  },

  /* Harvest unused lamp anchors on harbor floodlight masts, work stands, guard booths, and
     interior structures, driving a culled pool of practical lights for wet-apron glints. */
  installPracticalLights(g) {
    const T = g.THREE;
    if (!g.scene?.traverse || !T?.PointLight) return;
    const fixtures = [];
    const worldPos = new T.Vector3();
    g.scene.updateMatrixWorld?.(true);
    g.scene.traverse(node => {
      const lamps = node.userData?.lamps;
      if (Array.isArray(lamps)) {
        for (const lamp of lamps) {
          const lp = lamp?.pos || lamp;
          if (lp && Number.isFinite(lp.x)) {
            worldPos.set(lp.x, lp.y, lp.z).applyMatrix4(node.matrixWorld);
          } else {
            node.getWorldPosition(worldPos);
          }
          const highMast = worldPos.y > 9;
          fixtures.push({
            pos: worldPos.clone(),
            color: highMast ? 0xffe6c4 : 0xffd6a6,
            intensity: highMast ? 36 : 14,
            distance: highMast ? 42 : 18
          });
        }
      }
    });
    // Ensure the 2-story site office (-24.5, 0..6, -4) and transit-shed doorway have real practicals.
    fixtures.push(
      { pos: new T.Vector3(-24.5, 2.55, -4), color: 0xffe2be, intensity: 11, distance: 12 },
      { pos: new T.Vector3(-24.5, 5.35, -4), color: 0xdce8ff, intensity: 10, distance: 12 },
      { pos: new T.Vector3(-2, 4.6, -11.6), color: 0xffd8ab, intensity: 18, distance: 20 },
      { pos: new T.Vector3(24, 6.5, 6), color: 0xffe4c2, intensity: 26, distance: 32 }
    );

    const poolSize = Math.min(6, fixtures.length);
    const pool = [];
    const group = new T.Group();
    group.name = 'gs-practical-lights';
    for (let i = 0; i < poolSize; i++) {
      const light = new T.PointLight(0xffe4c0, 0, 24, 2);
      light.castShadow = false;
      light.layers.enable(1);
      group.add(light);
      pool.push(light);
    }
    g.scene.add(group);

    let tick = 0;
    const updateLights = () => {
      if (!g.camera?.position) return;
      const cam = g.camera.position;
      const ranked = fixtures
        .map(f => ({ f, d2: cam.distanceToSquared(f.pos) }))
        .sort((a, b) => a.d2 - b.d2);
      let active = 0;
      for (let i = 0; i < pool.length; i++) {
        const item = ranked[i], light = pool[i];
        if (item && item.d2 < 75 * 75) {
          const fade = 1 - Math.max(0, (Math.sqrt(item.d2) - 48) / 27);
          light.position.copy(item.f.pos);
          light.color.setHex(item.f.color);
          light.distance = item.f.distance;
          light.intensity = item.f.intensity * fade;
          light.visible = light.intensity > .05;
          if (light.visible) active++;
        } else {
          light.visible = false;
        }
      }
      g.visuals.activeLights = active;
    };
    updateLights();
    g.render?.addPrePass?.(() => {
      if ((tick++ & 3) === 0) updateLights();
    });
  },

  /* Focus the 4096 directional shadow map tightly around the active play area (~1.2 cm/texel)
     and quantize in light-space texel increments to prevent shadow-edge swimming in motion. */
  installHighResShadows(g, options = {}) {
    const T = g.THREE, sun = g.render?.sun;
    /* A map may pass its own fit (map.shadowFocus): `wide(camPos)` says when a camera is a vista outside the
       play area; `half`/`wideHalf` are the box half-extents in metres, `ahead`/`wideAhead` how far in front
       of the camera the box centres, and `dist`/`near`/`far` place the light along its direction. */
    const fit = {
      wide: p => p.y > 9 || p.x < -54 || p.x > 46 || p.z < -46 || p.z > 82,
      half: 24, wideHalf: 56, ahead: 13, wideAhead: 8, dist: 68, near: 8, far: 145, maxY: 6,
      ...options
    };
    if (!sun?.shadow?.camera || !g.render?.addPrePass || !T?.Vector3) return;
    const cam = sun.shadow.camera;
    const baseBounds = {
      left: cam.left, right: cam.right, top: cam.top, bottom: cam.bottom,
      near: cam.near, far: cam.far, pos: sun.position.clone(), target: sun.target.position.clone()
    };
    const sunDir = (g.render.sunDir || new T.Vector3(.916, .225, .331)).clone().normalize();
    const up = new T.Vector3(0, 1, 0);
    const rightAxis = new T.Vector3().crossVectors(up, sunDir).normalize();
    const upAxis = new T.Vector3().crossVectors(sunDir, rightAxis).normalize();
    const fwd = new T.Vector3(), focus = new T.Vector3();

    sun.shadow.bias = -.00008;
    sun.shadow.normalBias = .014;

    g.render.addPrePass((renderer, scene, viewCam) => {
      if (!viewCam?.position) return;
      // Diagnostic: `__G.visuals.shadowFit = false` restores the engine's own fit for comparison.
      if (g.visuals?.shadowFit === false) {
        const b = g.visuals.baseShadow;
        if (b && cam.left !== b.left) {
          Object.assign(cam, { left: b.left, right: b.right, top: b.top, bottom: b.bottom, near: b.near, far: b.far });
          cam.updateProjectionMatrix();
          sun.position.copy(b.pos); sun.target.position.copy(b.target);
          sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
        }
        return;
      }
      // Use wide bounds when an external vista camera sits elevated/far outside the play area.
      // Harbor default: the playable terminal spans x -48..30 (quay to 42) and z -38..76 (South Stack Yard).
      const wideShot = fit.wide(viewCam.position);
      const halfSpan = wideShot ? fit.wideHalf : fit.half;
      viewCam.getWorldDirection(fwd);
      focus.copy(viewCam.position).addScaledVector(fwd, wideShot ? fit.wideAhead : fit.ahead);
      focus.y = Math.max(0, Math.min(fit.maxY, viewCam.position.y * .5));

      const mapRes = sun.shadow.mapSize?.x || 4096;
      const texel = (halfSpan * 2) / mapRes;
      const lx = Math.round(focus.dot(rightAxis) / texel) * texel;
      const ly = Math.round(focus.dot(upAxis) / texel) * texel;
      const lz = focus.dot(sunDir);
      focus.set(0, 0, 0).addScaledVector(rightAxis, lx).addScaledVector(upAxis, ly).addScaledVector(sunDir, lz);

      sun.target.position.copy(focus);
      sun.target.updateMatrixWorld();
      sun.position.copy(focus).addScaledVector(sunDir, fit.dist);
      sun.updateMatrixWorld();

      if (cam.left !== -halfSpan || cam.near !== fit.near || cam.far !== fit.far) {
        cam.left = -halfSpan; cam.right = halfSpan;
        cam.bottom = -halfSpan; cam.top = halfSpan;
        cam.near = fit.near; cam.far = fit.far;
        cam.updateProjectionMatrix();
      }
    });
    g.visuals.baseShadow = baseBounds;
  },

  /* Replace the unoccluded sky-only IBL with a two-bounce, geometry-aware HDR harbor probe
     so shaded container canyons, wet ground, metals, and weapons reflect actual surroundings. */
  installEnvironment(g) {
    const T = g.THREE, renderer = g.renderer;
    if (!renderer?.setRenderTarget || !T?.WebGLCubeRenderTarget || !T?.CubeCamera || !T?.PMREMGenerator) return;
    if (!g.level || g.level.stub) return;

    const bake = (res = 256, twoBounce = true) => {
      try {
        const cubeRT = new T.WebGLCubeRenderTarget(res, {
          type: T.HalfFloatType,
          generateMipmaps: true,
          minFilter: T.LinearMipmapLinearFilter
        });
        const cubeCam = new T.CubeCamera(.2, 360, cubeRT);
        cubeCam.layers.set(0);
        // Elevated open yard junction seeing containers, wet apron, gantry crane, shed & sky.
        cubeCam.position.set(4, 3.4, -2);
        cubeCam.updateMatrixWorld(true);

        const pmrem = new T.PMREMGenerator(renderer);
        const skyUni = g.render?.sky?.material?.uniforms;
        const prevTone = renderer.toneMapping;
        const prevTarget = renderer.getRenderTarget();
        const prevAuto = renderer.shadowMap.autoUpdate;

        renderer.toneMapping = T.NoToneMapping;
        renderer.shadowMap.needsUpdate = true;
        if (skyUni?.uEnv) skyUni.uEnv.value = 1;

        try {
          const previousTarget = g.visuals._harborEnvTarget;
          cubeCam.update(renderer, g.scene);
          let finalTarget = pmrem.fromCubemap(cubeRT.texture);
          g.scene.environment = finalTarget.texture;
          g.scene.environmentIntensity = 1.44;

          if (twoBounce) {
            cubeCam.update(renderer, g.scene);
            const bounce2 = pmrem.fromCubemap(cubeRT.texture);
            g.scene.environment = bounce2.texture;
            g.scene.environmentIntensity = 1.42;
            finalTarget.dispose();
            finalTarget = bounce2;
          }
          if (g.render) g.render.env = finalTarget.texture;
          // The previous probe is no longer referenced once the new one is bound; free it.
          if (previousTarget && previousTarget !== finalTarget) previousTarget.dispose?.();
          g.visuals._harborEnvTarget = finalTarget;
          g.visuals._harborEnvRT = finalTarget.texture;
        } finally {
          if (skyUni?.uEnv) skyUni.uEnv.value = 0;
          renderer.toneMapping = prevTone;
          renderer.shadowMap.autoUpdate = prevAuto;
          renderer.setRenderTarget(prevTarget);
          cubeRT.dispose();
          pmrem.dispose();
        }
        if (twoBounce) g.render?.captureInteriorProbe?.();
        g.visuals.envReady = true;
      } catch (err) {
        console.warn('[visuals] Harbor IBL probe fallback:', err);
      }
    };

    g.visuals._rebakeProbes = () => bake(256, true);
    bake(128, false);
  },

  /* Lit, tone-mapped PBR bullet-impact craters with normal & roughness relief (bounded pool of 96). */
  installImpacts(g) {
    if (g._gsImpactsInstalled) return;
    g._gsImpactsInstalled = true;
    const T = g.THREE;
    const size = 256;
    const albedoCanvas = document.createElement('canvas'); albedoCanvas.width = albedoCanvas.height = size;
    const c = albedoCanvas.getContext('2d');
    const halo = c.createRadialGradient(128, 128, 16, 128, 128, 122);
    halo.addColorStop(0, 'rgba(156,150,138,.62)');
    halo.addColorStop(.42, 'rgba(118,112,100,.26)');
    halo.addColorStop(1, 'rgba(105,100,90,0)');
    c.fillStyle = halo; c.fillRect(0, 0, size, size);

    const blob = (ctx, radius, jitter, points, fill) => {
      ctx.beginPath();
      for (let i = 0; i < points; i++) {
        const angle = i / points * Math.PI * 2;
        const r = radius * (1 - jitter + Math.random() * jitter * 2);
        ctx.lineTo(128 + Math.cos(angle) * r, 128 + Math.sin(angle) * r);
      }
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    };
    blob(c, 54, .3, 24, 'rgba(108,102,90,.8)');
    blob(c, 37, .26, 20, 'rgba(54,50,44,.92)');
    blob(c, 21, .2, 16, 'rgba(16,15,14,.98)');
    blob(c, 10, .14, 12, 'rgba(4,4,4,1)');

    c.strokeStyle = 'rgba(24,22,20,.72)'; c.lineCap = 'round';
    for (let i = 0; i < 11; i++) {
      let angle = Math.random() * Math.PI * 2, r = 22, x = 128 + Math.cos(angle) * r, y = 128 + Math.sin(angle) * r;
      c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y);
      const reach = 48 + Math.random() * 64;
      while (r < reach) {
        r += 8; angle += (Math.random() - .5) * .48;
        x += Math.cos(angle) * 8; y += Math.sin(angle) * 8;
        c.lineTo(x, y);
      }
      c.stroke();
    }

    // Matching normal map for crater lip & recessed bore so grazing light shades bullet holes.
    const normCanvas = document.createElement('canvas'); normCanvas.width = normCanvas.height = size;
    const nc = normCanvas.getContext('2d');
    if (nc?.fillRect) {
      nc.fillStyle = 'rgb(128,128,255)';
      nc.fillRect(0, 0, size, size);
      for (let i = 0; i < 36; i++) {
        const a = i / 36 * Math.PI * 2, nx = Math.round(128 + Math.cos(a) * 72), ny = Math.round(128 - Math.sin(a) * 72);
        nc.strokeStyle = `rgba(${nx},${ny},225,0.45)`;
        nc.lineWidth = 10;
        nc.beginPath();
        nc.arc(128, 128, 34, a - .12, a + .12);
        nc.stroke();
      }
    }

    const texture = new T.CanvasTexture(albedoCanvas);
    if (T.SRGBColorSpace) texture.colorSpace = T.SRGBColorSpace;
    const normalMap = new T.CanvasTexture(normCanvas);
    const MaterialCtor = T.MeshStandardMaterial || T.MeshBasicMaterial;
    const material = new MaterialCtor({
      map: texture,
      normalMap,
      roughness: .88,
      metalness: .06,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3
    });
    const metalMaterial = new MaterialCtor({
      map: texture,
      normalMap,
      color: 0xd8dee6,
      roughness: .32,
      metalness: .82,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3
    });

    const geo = new T.PlaneGeometry(1, 1), marks = [], up = new T.Vector3(0, 0, 1);
    let index = 0;
    g.events.on('impact', hit => {
      if (hit.enemy || hit.surface === 'water' || !hit.point || !hit.normal) return;
      if (!['metal', 'concrete', 'wood', 'stone', 'brick', 'dirt', 'paint'].includes(hit.surface)) return;
      let mark = marks[index];
      const isMetal = hit.surface === 'metal';
      if (!mark) {
        mark = new T.Mesh(geo, isMetal ? metalMaterial : material);
        mark.receiveShadow = true;
        marks[index] = mark;
        g.scene.add(mark);
      } else {
        mark.material = isMetal ? metalMaterial : material;
      }
      mark.position.copy(hit.point).addScaledVector(hit.normal, .008);
      mark.quaternion.setFromUnitVectors(up, hit.normal);
      const scale = isMetal ? .078 : .165;
      mark.rotateZ(Math.random() * Math.PI * 2);
      mark.scale.setScalar(scale * (.85 + Math.random() * .3));
      mark.visible = true;
      index = (index + 1) % 96;
      g.visuals.impacts++;
    });
    g.events.on('game:state', ({ state }) => {
      if (state === 'intro') for (const mark of marks) mark.visible = false;
    });
  },

  /* Render sleek hot-brass / incandescent projectile streaks during active supersonic flight. */
  installTracers(g) {
    const T = g.THREE;
    if (!g.render?.addPrePass || !T?.BufferGeometry || !T?.LineSegments || !T?.LineBasicMaterial) return;
    const maxLines = 128;
    const positions = new Float32Array(maxLines * 6);
    const colors = new Float32Array(maxLines * 6);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(positions, 3));
    geo.setAttribute('color', new T.BufferAttribute(colors, 3));
    geo.setDrawRange(0, 0);
    const mat = new T.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: .78,
      blending: T.AdditiveBlending,
      depthWrite: false
    });
    const lines = new T.LineSegments(geo, mat);
    lines.frustumCulled = false;
    lines.renderOrder = 18;
    g.scene.add(lines);

    g.render.addPrePass(() => {
      const list = g.ballistics?.projectiles;
      if (!list || !list.length) { geo.setDrawRange(0, 0); return; }
      let count = 0;
      for (let i = 0; i < list.length && count < maxLines; i++) {
        const b = list[i];
        if (b.subsonic && b.owner === 'player') continue;
        const o = count * 6;
        const vx = b.velocity.x, vy = b.velocity.y, vz = b.velocity.z;
        const vLen = Math.hypot(vx, vy, vz) || 1;
        const tailLen = Math.min(4.2, Math.max(.9, b.speed * .0042));
        const tx = b.position.x - (vx / vLen) * tailLen;
        const ty = b.position.y - (vy / vLen) * tailLen;
        const tz = b.position.z - (vz / vLen) * tailLen;
        positions[o] = tx; positions[o + 1] = ty; positions[o + 2] = tz;
        positions[o + 3] = b.position.x; positions[o + 4] = b.position.y; positions[o + 5] = b.position.z;
        const enemy = b.owner === 'enemy';
        colors[o] = enemy ? .35 : .25; colors[o + 1] = enemy ? .08 : .18; colors[o + 2] = .04;
        colors[o + 3] = enemy ? 2.4 : 2.1; colors[o + 4] = enemy ? .72 : 1.55; colors[o + 5] = enemy ? .32 : .78;
        count++;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.setDrawRange(0, count * 2);
    });
  }
};
