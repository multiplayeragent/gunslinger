/* The ground of the churchyard: leaf litter under the pines, churned mud between the graves, worn paths,
   standing water that takes the rain, grass and ferns, the rain itself and the lightning. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const PI = Math.PI;
  const MASK = { x0: -80, z0: -80, size: 160, res: 1024 };

  // r = mud (the yard and worn ground), g = path, b = standing water
  function paintMask(kit) {
    const N = MASK.res, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d', { willReadFrequently: true });
    const px = (wx) => ((wx - MASK.x0) / MASK.size) * N, s = N / MASK.size, rng = kit.rng(777), Y = V.YARD;
    x.fillStyle = '#000'; x.fillRect(0, 0, N, N);
    x.globalCompositeOperation = 'lighter';
    const blob = (wx, wz, r, col, a = 1) => {
      const g = x.createRadialGradient(px(wx), px(wz), 0, px(wx), px(wz), r * s);
      g.addColorStop(0, col.replace('A', String(a))); g.addColorStop(0.55, col.replace('A', String(a * 0.6))); g.addColorStop(1, col.replace('A', '0'));
      x.fillStyle = g; x.beginPath(); x.arc(px(wx), px(wz), r * s, 0, PI * 2); x.fill();
    };
    // mud: the whole yard, heavier where feet and rain have worked it
    x.filter = 'blur(' + (1.6 * s).toFixed(1) + 'px)';
    x.fillStyle = 'rgba(150,0,0,1)'; x.fillRect(px(-Y - 0.5), px(-Y - 0.5), (2 * Y + 1) * s, (2 * Y + 1) * s);
    x.filter = 'none';
    for (let i = 0; i < 260; i++) blob((rng() - 0.5) * 2 * Y, (rng() - 0.5) * 2 * Y, 1.5 + rng() * 4, 'rgba(255,0,0,A)', 0.16 + rng() * 0.2);
    for (let i = 0; i < 160; i++) { const a = rng() * PI * 2, d = Y + 2 + rng() * 34; blob(Math.cos(a) * d * 1.2, Math.sin(a) * d * 1.2, 1.5 + rng() * 5, 'rgba(255,0,0,A)', 0.2 + rng() * 0.35); }
    // paths
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (const p of V.yard.PATHS) {
      for (const [w, a] of [[p.w + 1.4, 0.3], [p.w, 0.55], [p.w * 0.55, 0.5]]) {
        x.strokeStyle = `rgba(110,${Math.round(255 * a)},0,1)`; x.lineWidth = w * s;
        x.beginPath(); p.pts.forEach((q, i) => x[i ? 'lineTo' : 'moveTo'](px(q[0]), px(q[1]))); x.stroke();
      }
    }
    // standing water: low spots in the yard, ruts on the trails
    const inChurch = (wx, wz) => Math.abs(wx) < 7.2 && Math.abs(wz) < 14.2;
    const puddles = [];
    for (let i = 0; i < 150; i++) {
      const wx = (rng() - 0.5) * 2 * (Y + 26), wz = (rng() - 0.5) * 2 * (Y + 26);
      if (inChurch(wx, wz)) continue;
      const onPath = V.yard.pathDist(wx, wz) < 0.3, inYard = Math.abs(wx) < Y && Math.abs(wz) < Y;
      if (!onPath && !inYard && rng() < 0.75) continue;
      const r = 0.5 + rng() * (onPath ? 1.1 : 1.7);
      for (let k = 0; k < 3; k++) blob(wx + (rng() - 0.5) * r, wz + (rng() - 0.5) * r, r * (0.6 + rng() * 0.6), 'rgba(0,0,255,A)', 0.75);
      puddles.push([wx, wz, r]);
    }
    x.globalCompositeOperation = 'source-over';
    const data = x.getImageData(0, 0, N, N).data;
    return { canvas: c, data, puddles };
  }

  function bladeTexture(T, rng, fern) {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    if (!fern) {
      for (let i = 0; i < 30; i++) {
        const bx = 14 + rng() * (S - 28), h = 90 + rng() * 150, lean = (rng() - 0.5) * 90, w = 2 + rng() * 3.5, g = 120 + rng() * 90;
        const grd = x.createLinearGradient(0, S, 0, S - h);
        grd.addColorStop(0, `rgb(${Math.round(g * 0.35)},${Math.round(g * 0.5)},${Math.round(g * 0.22)})`); grd.addColorStop(1, `rgb(${Math.round(g * 0.75)},${Math.round(g)},${Math.round(g * 0.45)})`);
        x.fillStyle = grd; x.beginPath(); x.moveTo(bx - w, S); x.quadraticCurveTo(bx + lean * 0.3, S - h * 0.6, bx + lean, S - h); x.quadraticCurveTo(bx + lean * 0.4, S - h * 0.55, bx + w, S); x.closePath(); x.fill();
      }
    } else {
      for (let f = 0; f < 5; f++) {
        const a0 = -PI / 2 + (f - 2) * 0.42 + (rng() - 0.5) * 0.15, len = 170 + rng() * 60, g = 100 + rng() * 70;
        let cx = S / 2, cy = S - 4;
        for (let d = 0; d < len; d += 5) {
          const a = a0 + (d / len) * (f - 2) * 0.35, t = d / len;
          const nx = cx + Math.cos(a) * 5, ny = cy + Math.sin(a) * 5, lw = 26 * Math.sin(PI * Math.min(1, t * 1.05 + 0.05)) + 2;
          x.strokeStyle = `rgb(${Math.round(g * 0.45)},${Math.round(g)},${Math.round(g * 0.4)})`; x.lineWidth = 2.4;
          for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a + s * 1.2) * lw, cy + Math.sin(a + s * 1.2) * lw); x.stroke(); }
          x.strokeStyle = '#2b3320'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx, cy); x.lineTo(nx, ny); x.stroke();
          cx = nx; cy = ny;
        }
      }
    }
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    return tex;
  }

  V.ground = {
    MASK,
    async create(g) {
      const T = g.THREE, kit = V.kit, I = V.I, mats = V.materials, Y = V.YARD, W = V.WORLD;
      const root = new T.Group(); root.name = 'ground'; g.scene.add(root);
      const mask = paintMask(kit);
      const maskTex = new T.CanvasTexture(mask.canvas);
      maskTex.colorSpace = T.NoColorSpace; maskTex.wrapS = maskTex.wrapT = T.ClampToEdgeWrapping; maskTex.anisotropy = 4; maskTex.flipY = false;
      const sample = (wx, wz, ch) => {
        const u = Math.floor(((wx - MASK.x0) / MASK.size) * MASK.res), v = Math.floor(((wz - MASK.z0) / MASK.size) * MASK.res);
        if (u < 0 || v < 0 || u >= MASK.res || v >= MASK.res) return 0;
        return mask.data[(v * MASK.res + u) * 4 + ch] / 255;
      };

      // ---- terrain ----
      const SZ = 300, SEG = 220;
      const geo = new T.PlaneGeometry(SZ, SZ, SEG, SEG).rotateX(-PI / 2);
      const p = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, V.heightAt(x, z)); uv.setXY(i, x, z); }
      geo.computeVertexNormals();
      kit.tint(geo, 1);
      const S = mats.sets, time = { value: 0 };
      const mat = mats.pbr({ set: 'leaves', color: [0.92, 0.9, 0.84], sat: 0.75, nrm: 1.25, wet: [0.42, 0.42, 0.5, 0], macro: [0.3, 0.18, 0.11, 0.35] }, {
        cacheKey: '|ground',
        patch(shader) {
          Object.assign(shader.uniforms, {
            uGMud: { value: S.mud.albedo }, uGMudOrm: { value: S.mud.orm }, uGMudN: { value: S.mud.normal },
            uGMask: { value: maskTex }, uGRect: { value: new T.Vector3(MASK.x0, MASK.z0, 1 / MASK.size) }, uGTime: time,
          });
          let f = shader.fragmentShader;
          const must = (a, b) => { if (!f.includes(a)) console.error('[vigil] ground shader: missing chunk ' + a.slice(0, 40)); f = f.replace(a, b); };
          must('#include <common>', `#include <common>
uniform sampler2D uGMud, uGMudOrm, uGMudN, uGMask; uniform vec3 uGRect; uniform float uGTime;
float gMud = 0.0, gPath = 0.0, gPud = 0.0; vec2 gUv2 = vec2(0.0);
vec2 gRipple(vec2 p, float t){
  vec2 acc = vec2(0.0);
  for (int i = 0; i < 2; i++){
    vec2 q = p * (i == 0 ? 2.1 : 3.4) + float(i) * 7.3; vec2 c = floor(q); vec2 fr = fract(q) - 0.5;
    float h = fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
    float ph = fract(t * (0.8 + h * 0.6) + h * 9.0);
    vec2 d = fr - (vec2(fract(h * 17.0), fract(h * 53.0)) - 0.5) * 0.5; float l = length(d), r = ph * 0.46;
    acc += (d / max(l, 1e-3)) * sin((l - r) * 55.0) * smoothstep(0.07, 0.0, abs(l - r)) * (1.0 - ph);
  }
  return acc * 0.5;
}`);
          must('vec4 sampledDiffuseColor = texture2D(map, slUv);', `vec4 gM = texture2D(uGMask, (vSlPos.xz - uGRect.xy) * uGRect.z);
  float gN = slN3(vSlPos * 0.8) * 0.6 + slN3(vSlPos * 2.9 + 4.0) * 0.4;
  float gF = slN3(vSlPos * 11.0);
  gMud = smoothstep(0.34, 0.66, gM.r + (gN - 0.5) * 0.55);
  gPath = smoothstep(0.36, 0.62, gM.g + (gN - 0.5) * 0.4);
  gPud = smoothstep(0.50, 0.60, gM.b + (gN - 0.5) * 0.22) * (1.0 - smoothstep(0.02, 0.4, vSlPos.y));
  gUv2 = vSlPos.xz / 3.2 + vec2(0.37, 0.11);
  vec4 sampledDiffuseColor = mix(texture2D(map, slUv), texture2D(uGMud, gUv2), gMud);
  { float gl = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    vec3 gGravel = mix(vec3(gl), sampledDiffuseColor.rgb, 0.35) * (0.8 + 0.75 * gF) * vec3(1.12, 1.08, 1.0);
    sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, gGravel, gPath * 0.8);
    sampledDiffuseColor.rgb *= mix(1.0, 0.36, gPud); }`);
          must('slORM = texture2D(roughnessMap, slUv);', 'slORM = mix(texture2D(roughnessMap, slUv), texture2D(uGMudOrm, gUv2), gMud);');
          must('roughnessFactor = clamp(roughnessFactor, 0.045, 1.0);', 'roughnessFactor = mix(roughnessFactor, 0.035, gPud); roughnessFactor = clamp(roughnessFactor, 0.03, 1.0);');
          must('{ vec3 mapN = texture2D(normalMap, slUv).xyz * 2.0 - 1.0;', `{ vec3 mapN = mix(texture2D(normalMap, slUv), texture2D(uGMudN, gUv2), gMud).xyz * 2.0 - 1.0;
    mapN.xy = mapN.xy * (1.0 - gPud) + gRipple(vSlPos.xz, uGTime) * gPud * 0.5; mapN = normalize(mapN);`);
          shader.fragmentShader = f;
        },
      });
      mat.name = 'vg_ground';
      const mesh = new T.Mesh(geo, mat);
      mesh.name = 'vigil-ground'; mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false;
      root.add(mesh);

      // ---- grass and ferns ----
      const tuft = (w, h, n) => {
        const parts = [];
        for (let i = 0; i < n; i++) {
          const q = new T.PlaneGeometry(w, h).toNonIndexed(); q.translate(0, h / 2, 0); q.rotateY((i / n) * PI + 0.2 * i);
          const nor = q.attributes.normal; for (let k = 0; k < nor.count; k++) nor.setXYZ(k, 0, 1, 0);
          parts.push(q);
        }
        return kit.merge(parts);
      };
      const plant = (geo2, tex, color, list) => {
        if (!list.length) return null;
        const m2 = new T.MeshStandardMaterial({ map: tex, alphaTest: 0.42, side: T.DoubleSide, color, roughness: 1, metalness: 0, vertexColors: true });
        const im = new T.InstancedMesh(geo2, m2, list.length);
        list.forEach((mm, i) => im.setMatrixAt(i, mm));
        im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; im.instanceMatrix.needsUpdate = true;
        root.add(im);
        return im;
      };
      const rng = kit.rng(31337), Mx = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), P = new T.Vector3(), Sc = new T.Vector3();
      const grass = [], ferns = [], inChurch = (x, z) => (Math.abs(x) < 7.6 && Math.abs(z) < 14.6) || (x > -12 && x < -5.5 && z > 6.6 && z < 13.4);
      const want = g.quality.name === 'low' ? 4000 : g.quality.name === 'medium' ? 8000 : 12000;
      for (let i = 0, tries = 0; grass.length < want && tries < want * 6; tries++, i++) {
        const far = rng() < 0.35, x = (rng() - 0.5) * 2 * (far ? W : Y + 6), z = (rng() - 0.5) * 2 * (far ? W : Y + 6);
        if (inChurch(x, z) || V.yard.pathDist(x, z) < 0.25 || sample(x, z, 2) > 0.45) continue;
        const dens = kit.fbm2(x * 0.13 + 3, z * 0.13 + 8, 3);
        if (dens < 0.36 + rng() * 0.2) continue;
        const s = 0.5 + rng() * 0.75;
        E.set((rng() - 0.5) * 0.25, rng() * PI * 2, (rng() - 0.5) * 0.25); Q.setFromEuler(E);
        Mx.compose(P.set(x, -0.02, z), Q, Sc.set(s, s * (0.7 + rng() * 0.7), s));
        grass.push(Mx.clone());
      }
      for (let i = 0, tries = 0; ferns.length < want * 0.12 && tries < want * 3; tries++, i++) {
        const x = (rng() - 0.5) * 2 * W, z = (rng() - 0.5) * 2 * W, d = Math.max(Math.abs(x), Math.abs(z));
        if (d < Y + 1.2 || V.yard.pathDist(x, z) < 1.0) continue;
        if (kit.fbm2(x * 0.09 + 40, z * 0.09 + 2, 3) < 0.45) continue;
        const s = 0.7 + rng() * 0.8;
        E.set((rng() - 0.5) * 0.3, rng() * PI * 2, (rng() - 0.5) * 0.3); Q.setFromEuler(E);
        Mx.compose(P.set(x, -0.03, z), Q, Sc.set(s, s, s));
        ferns.push(Mx.clone());
      }
      plant(tuft(0.62, 0.5, 3), bladeTexture(T, kit.rng(9), false), new T.Color(0.5, 0.56, 0.44), grass);
      plant(tuft(1.3, 0.95, 3), bladeTexture(T, kit.rng(10), true), new T.Color(0.5, 0.62, 0.46), ferns);

      // ---- rain (the engine's, pointed at this map's puddles) ----
      let rain = null;
      try {
        const R = 256, rd = new Uint8Array(R * R * 4);
        for (let v = 0; v < R; v++) for (let u = 0; u < R; u++) {
          const wet = sample(MASK.x0 + ((u + 0.5) / R) * MASK.size, MASK.z0 + ((v + 0.5) / R) * MASK.size, 2) > 0.5;
          const o = (v * R + u) * 4; rd[o] = wet ? 0 : 255; rd[o + 1] = rd[o + 2] = 0; rd[o + 3] = 255;
        }
        const rainMask = new T.DataTexture(rd, R, R); rainMask.needsUpdate = true; rainMask.magFilter = T.LinearFilter; rainMask.minFilter = T.LinearFilter;
        rain = I.makeRain(g, { mask: rainMask });
        rain.splash.material.uniforms.uMaskRect.value.set(MASK.x0, MASK.z0, 1 / MASK.size);
        // the harbor's quay edge is baked into the splash shader
        rain.splash.material.vertexShader = rain.splash.material.vertexShader.replace('p.x > 29.7 || ', '');
        root.add(rain.rain, rain.splash);
        rain.setRain(0.7);
      } catch (e) { console.error('[vigil] rain failed: ' + ((e && e.stack) || e)); rain = null; }

      // ---- lightning: for a moment the moon becomes the bolt ----
      const sun = g.render.sun, baseI = sun.intensity, baseC = sun.color.clone(), white = new T.Color(0.82, 0.88, 1);
      let flash = 0, flashP = 0;
      g.events.on('thunder', (e) => { flash = 0.55; flashP = 0.5 + 0.5 * ((e && e.intensity) || 0.6); });

      let t = 0;
      return {
        root, mesh, mask, maskTexture: maskTex, rain: rain ? rain.rain : null,
        isPuddle(x, z) { return !(Math.abs(x) < 7 && Math.abs(z) < 14) && sample(x, z, 2) > 0.55; },
        wetnessAt(x, z) { return Math.abs(x) < 5.2 && Math.abs(z) < 12 ? 0.12 : sample(x, z, 2) > 0.5 ? 1 : 0.7; },
        isMud(x, z) { return sample(x, z, 0) > 0.5; },
        setRain(v) { if (rain) rain.setRain(v); },
        get rainLevel() { return rain ? rain.rainLevel : 0; },
        get lightning() { return flash > 0 ? flashP * Math.max(0, flash / 0.55) : 0; },
        update(dt) {
          t += dt; time.value = t;
          if (rain) { rain.update(dt); rain.rain.material.uniforms.uDrip.value = 0; }
          if (flash > 0) {
            flash -= dt;
            const q = 1 - Math.max(0, flash) / 0.55, k = (q < 0.1 ? 1 : q < 0.22 ? 0.15 : q < 0.4 ? 0.8 : Math.max(0, 1 - q) * 0.9) * flashP;
            sun.intensity = baseI + k * 16; sun.color.copy(baseC).lerp(white, Math.min(1, k * 1.5));
            if (flash <= 0) { sun.intensity = baseI; sun.color.copy(baseC); }
          }
        },
      };
    },
  };
})();
