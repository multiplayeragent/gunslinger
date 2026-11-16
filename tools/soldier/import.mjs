#!/usr/bin/env node
/* Assembles vendor/warbash-soldier.js from a checkout of War Bash (MIT, a fork of Riposte: Frontline by BenDBSS).

     node tools/soldier/import.mjs <path to the War Bash repository> [--anim]

   --anim also takes the walk, run, crouch and jump cycles that checkout has baked from Mixamo
   (assets/anim/clips.bin and clips.json there) into assets/soldier/clips.js, and adds its script tag to index.html.
   Without them the soldiers move by War Bash's procedural pose. Mixamo lets an account holder use its animations in
   a game, not pass the files on: bake them from your own account (War Bash's docs/animations.md). The copy that
   Riposte: Frontline shipped was baked by its author, who excluded it from the MIT License; this tool refuses it.

   War Bash is one page whose source files share a single scope and three.js r147. This tool takes the files that
   make a soldier (skeleton, body, equipment, the outfit atlas, hands, the thirty outfits, their simulated cloth and
   the procedural pose), puts them inside one function that receives this game's three.js (r180) and a host object,
   and applies the few exact replacements the newer three.js needs. Nothing else of War Bash comes across: its
   weapons, maps, lighting volume, menus and network stay behind, replaced by the host hooks listed in PRELUDE.

   The output is committed. Run this again only to take a newer War Bash; every replacement below must still match
   exactly once (or the stated number of times), otherwise the tool stops and names the one that did not. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const src = process.argv[2], withAnim = process.argv.includes('--anim');
if (!src || !fs.existsSync(path.join(src, 'src', '06g-body.js'))) { console.error('usage: node tools/soldier/import.mjs <path to the War Bash repository>'); process.exit(1); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const read = (f) => fs.readFileSync(path.join(src, 'src', f), 'utf8').replace(/\r\n/g, '\n');

/* whole files, in War Bash's own order (its build sorts the names) */
const FILES = ['06a-rig.js', '06ab-anim.js', '06ac-loco.js', '06b-soldier.js', '06e-gear.js', '06f-hands.js', '06g-body.js', '06ga-outfits.js', '06gb-cloth.js',
  '06gc-outfits-challenge.js', '06gd-outfit-unique.js', '06ge-outfit-kit.js', '06gf-outfits-maps.js', '06gg-outfits-play.js'];

/* a top-level declaration cut out of a file that is not taken whole: from the line that matches to the line before
   the next line that starts a declaration or a comment at column 0 */
function cut(file, start) {
  const L = read(file).split('\n'), i = L.findIndex((l) => start.test(l));
  if (i < 0) throw new Error(`${file}: nothing matches ${start}`);
  let j = i + 1;
  while (j < L.length && !/^(function|const|let|var|class|\/\*|\/\/|async function)\b|^\/\*|^\/\//.test(L[j])) j++;
  while (j > i + 1 && L[j - 1].trim() === '') j--;
  return L.slice(i, j).join('\n');
}

/* exact replacements: [file, from, to, how many times it must occur] */
const PATCHES = [
  // the baked clips and the fabric scans come from the host, not from a page-wide table
  ['06ab-anim.js', '(window.BASE_ASSETS || {}).anim || null', 'HOST.anim || null', 1],
  ['06e-gear.js', 'const S = window.BASE_ASSETS || {};', 'const S = HOST.scans || {};', 1],
  // r152: a texture states its color space, not an encoding
  ['06e-gear.js', 'if (srgb) t.encoding = THREE.sRGBEncoding;', 'if (srgb) t.colorSpace = THREE.SRGBColorSpace;', 1],
  // r152: each map has its own texture coordinates
  ['06e-gear.js', 'texture2D(roughnessMap, vUv).r', 'texture2D(roughnessMap, vRoughnessMapUv).r', 1],
  // r155: the sheen's light is kept in two parts
  ['06e-gear.js', '  sheenSpecular *= skAo;', '  sheenSpecularDirect *= skAo; sheenSpecularIndirect *= skAo;', 1],
  // the host decides where a new soldier goes
  ['06g-body.js', 'root = new THREE.Group(); scene.add(root);', 'root = new THREE.Group(); HOST.root.add(root);', 1],
  // the rounded box is an add-on of three.js, not part of its namespace
  ['06g-body.js', 'new THREE.RoundedBoxGeometry(', 'new RoundedBoxGeometry(', 1],
  // the host has the last word on a finished soldier material (band color, this game's surface response)
  ['06g-body.js', 'skinTone(skin, rel, m.color); skinRelColor(rel, m.userData.skU.tag.value);', 'skinTone(skin, rel, m.color); skinRelColor(rel, m.userData.skU.tag.value);\n  if (HOST.finish) HOST.finish(m, skin, rel);', 1],
  // and on the printed camouflage before it goes into the atlas
  ['06e-gear.js', "drawCamo(cam.getContext('2d', { willReadFrequently: true }), skin, 768, fp ? 0.34 : 0.7, fp ? 0.7 : 1);", "drawCamo(cam.getContext('2d', { willReadFrequently: true }), skin, 768, fp ? 0.34 : 0.7, fp ? 0.7 : 1);\n  if (HOST.camo) HOST.camo(cam, skin, fp);", 1],
  // capes, coats and ponchos cast shadows like the body they hang from
  ['06gb-cloth.js', 'mesh.frustumCulled = true; mesh.castShadow = false;', 'mesh.frustumCulled = true; mesh.castShadow = HOST.clothShadows !== false;', 1],
  // the detailed model casts its own shadow here (War Bash kept the light model on a shadow-only layer)
  ['06g-body.js', 'L.hi = addSkin(soldierGeometry(skin, \'hi\')); L.hi.castShadow = false;', 'L.hi = addSkin(soldierGeometry(skin, \'hi\'));', 1],
  // the host can replace or adjust a finished outfit material (this game's lighting is not War Bash's)
  ['06e-gear.js', '  m.userData.patch = (s) => { skAoPatch(s); vl(s); skinTagPatch(s, U); gearSheenPatch(s); };\n  m.onBeforeCompile = m.userData.patch;\n  return m;',
    '  m.userData.patch = (s) => { skAoPatch(s); vl(s); skinTagPatch(s, U); gearSheenPatch(s); if (HOST.shader) HOST.shader(s, m); };\n  m.onBeforeCompile = m.userData.patch;\n  if (HOST.material) HOST.material(m, skin, mode);\n  return m;', 1],
  ['06e-gear.js', "if (mode === 'pv') { m.userData.patch = (s) => { skAoPatch(s); skinTagPatch(s, U); gearSheenPatch(s); }; m.onBeforeCompile = m.userData.patch; return m; }",
    "if (mode === 'pv') { m.userData.patch = (s) => { skAoPatch(s); skinTagPatch(s, U); gearSheenPatch(s); if (HOST.shader) HOST.shader(s, m); }; m.onBeforeCompile = m.userData.patch; if (HOST.material) HOST.material(m, skin, mode); return m; }", 1],
];
/* in every file: War Bash ran three.js without color management, so a color built from a hex number kept its sRGB
   numbers until the code converted them itself. Color147 (PRELUDE) keeps that behavior. */
const EVERYWHERE = [[/\bTHREE\.Color\b/g, 'Color147']];

const PRELUDE = String.raw`
  'use strict';
  /* ---- what War Bash's other files gave these: small helpers copied from its 01-core.js, and the host ---- */
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function hyp3(x, y, z) { return Math.sqrt(x * x + y * y + z * z); }
  const hasKey = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rand = (a, b) => a + Math.random() * (b - a);
  const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
  function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const V3 = THREE.Vector3;
  const UP = new V3(0, 1, 0), _m1 = new THREE.Matrix4();
  const _t = (s) => s;
  /* a color whose hex numbers and CSS names are taken as they are written (three.js r147 without color management) */
  const LIN = THREE.LinearSRGBColorSpace;
  class Color147 extends THREE.Color {
    setHex(h) { return super.setHex(h, LIN); }
    setStyle(s) { return super.setStyle(s, LIN); }
    setHSL(h, s, l) { return super.setHSL(h, s, l, LIN); }
    getHex() { return super.getHex(LIN); }
    getHexString() { return super.getHexString(LIN); }
    getHSL(t) { return super.getHSL(t, LIN); }
    getStyle() { return super.getStyle(LIN); }
  }
  /* the game around the soldiers: none of War Bash's is here */
  const COARSE = !!HOST.coarse, ULTRA = false, RQ = { q: { lean: !!HOST.lean } };
  const camera = HOST.camera, MASK_SHADOW = 1;
  const PL = { ent: null, sprinting: false, eyeH: 1.62 }, MATCH = { time: 0 }, entities = [], KC = {}, CURMAP = {}, VOID = { on: false, floor: -1e9 };
  const allied = () => true, skinMine = () => (HOST.skinMine ? HOST.skinMine() : 'assault');
  const groundHeight = (x, z, y, r) => (HOST.groundHeight ? HOST.groundHeight(x, z, y, r) : 0);
  const lightAt = (x, y, z) => (HOST.lightAt ? HOST.lightAt(x, y, z) : [1]);
  const csmMaterial = (m) => m, envCubeHook = () => {}, volumeLit = (m) => { m.userData.patch = () => {}; };
  const startRagdoll = (e) => { if (HOST.startRagdoll) HOST.startRagdoll(e); }, stepRagdoll = (e, dt) => { if (HOST.stepRagdoll) HOST.stepRagdoll(e, dt); };
  /* the weapon in a soldier's hands is the host's: { group, muzzle, kind } and its grips { R, L, butt, magP } in the weapon's frame */
  const gunSoundPrepare = () => {}, weaponDefByKey = () => ({ sound: null });
  const buildWorldGun = (key) => HOST.gun(key), gripsFor = (key) => HOST.grips(key);
  const setGunLod = (g, hi, shadowOnly) => { if (HOST.gunLod) HOST.gunLod(g, hi, shadowOnly); };
  const soldierLift = (grips) => (grips && grips.lift !== undefined ? grips.lift : 0.048);
  const RHYTHM_3P = [[0, 0], [0.12, 0.3], [0.5, 0.58], [0.58, 0.72], [1, 1]];
  function rhythm3p(u) { u = clamp(u, 0, 1); let i = 0; while (i < RHYTHM_3P.length - 2 && u > RHYTHM_3P[i + 1][0]) i++; const a = RHYTHM_3P[i], b = RHYTHM_3P[i + 1]; return lerp(a[1], b[1], (u - a[0]) / (b[0] - a[0])); }
  /* detailed model up close, light one from afar; each casts its own shadow while it is the one shown */
  function setSoldierLod(S, hi) {
    const L = S.lod; L.hiOn = hi;
    if (L.hi) L.hi.visible = hi;
    if (L.lo) L.lo.visible = !hi || !L.hi;
    if (S.gun) setGunLod(S.gun, hi);
  }
`;

/* three.js examples/jsm/geometries/RoundedBoxGeometry.js (MIT), as War Bash's vendored r147 carried it */
function roundedBox(warbash) {
  const v = fs.readFileSync(path.join(warbash, 'assets', 'vendor', 'three-r147.js'), 'utf8').replace(/\r\n/g, '\n');
  const a = v.indexOf('/* examples/js/geometries/RoundedBoxGeometry.js */'), b = v.indexOf('THREE.RoundedBoxGeometry = RoundedBoxGeometry;', a);
  if (a < 0 || b < 0) throw new Error('RoundedBoxGeometry not found in the vendored three.js');
  let s = v.slice(a, b);
  const open = s.indexOf('( function () {'), body = s.slice(open + '( function () {'.length);
  if (open < 0) throw new Error('RoundedBoxGeometry: unexpected wrapper');
  return '  /* three.js examples: RoundedBoxGeometry (MIT) */\n  const RoundedBoxGeometry = (function () {\n' + body.replace(/\bconst _tempNormal = new THREE\.Vector3\(\);/, 'const _tempNormal = new THREE.Vector3();') + '\n\treturn RoundedBoxGeometry;\n  })();\n';
}

let out = '';
const commit = (() => { try { return execFileSync('git', ['-C', src, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (e) { return 'unknown'; } })();
out += `/* War Bash soldiers for Gunslinger: skeleton, body, equipment, outfit atlas, hands, thirty outfits, simulated cloth
   and the procedural pose, taken from War Bash (commit ${commit}), a fork of Riposte: Frontline by BenDBSS.
   MIT License: Copyright (c) BenDBSS and the War Bash contributors (see CREDITS.md). three.js add-on
   RoundedBoxGeometry: MIT, three.js authors.

   GENERATED by tools/soldier/import.mjs from War Bash's source files; the sections below keep their file names.
   Change this game's side of it in src/characters.js (the host). To take a newer War Bash, run the tool again.

   window.WarBashSoldier(THREE, HOST) runs the whole of it against this game's three.js and returns what the host uses. */
window.WarBashSoldier = function (THREE, HOST) {
`;
out += PRELUDE;
out += roundedBox(src);
out += '\n  /* ---- from War Bash src/06c-models.js: key curve and the hand frames on a weapon ---- */\n';
for (const [f, re] of [['06c-models.js', /^const _nv = /], ['06c-models.js', /^function keySpline\(/], ['06c-models.js', /^const _hm = /], ['06c-models.js', /^function frameZY\(/], ['06c-models.js', /^function frameUnder\(/],
  ['06c-models.js', /^function frameQ\(/], ['06c-models.js', /^const HAND_FRAMES = /], ['06c-models.js', /^HAND_FRAMES\.Lcc = /], ['01-core.js', /^function makeNoise\(/]]) out += cut(f, re) + '\n';

for (const f of FILES) {
  let s = read(f);
  for (const [pf, from, to, n] of PATCHES) {
    if (pf !== f) continue;
    const c = s.split(from).length - 1;
    if (c !== n) throw new Error(`${f}: expected ${n} of ${JSON.stringify(from.slice(0, 70))}, found ${c}`);
    s = s.split(from).join(to);
  }
  for (const [re, to] of EVERYWHERE) s = s.replace(re, to);
  out += `\n/* ======================================================================================================\n   from War Bash src/${f}\n   ====================================================================================================== */\n` + s + '\n';
}
out += String.raw`
  /* ---- what the host uses ---- */
  return {
    SB, SD, SOLDIER_NB, SKINS, SKIN_IDS, SKIN_CHALLENGE, SKIN_MAP_OUT, SKIN_PLAY_OUT, SKIN_UNIQUE, GEAR, GEAR_SHEEN, SOLDIER_GEOS, SOLDIER_MATS, HAND_FRAMES, CLOTH, PL, MATCH, entities,
    J: { PEL: J_PEL, CHE: J_CHE, HEAD: J_HEAD, SHL: J_SHL, ELL: J_ELL, HAL: J_HAL, SHR: J_SHR, ELR: J_ELR, HAR: J_HAR, HIL: J_HIL, KNL: J_KNL, FTL: J_FTL, HIR: J_HIR, KNR: J_KNR, FTR: J_FTR },
    skinId, skinGear, skinTone, skinRelColor, gearScanLoad, gearTextures, gearMaterial, soldierRest, soldierGeometry, soldierMaterial, makeSoldier, soldierLook, setSoldierLod, setSoldierGun,
    layoutSoldier, poseSoldier, animSoldier, clothSync, clothUpdate, clothSettle, clothDetach, locoInit, animInit,
  };
};
`;
fs.mkdirSync(path.join(root, 'vendor'), { recursive: true });
fs.writeFileSync(path.join(root, 'vendor', 'warbash-soldier.js'), out);
for (const f of ['cloths.webp', 'tintScan.webp']) {
  fs.mkdirSync(path.join(root, 'assets', 'soldier'), { recursive: true });
  fs.copyFileSync(path.join(src, 'assets', 'outfit', f), path.join(root, 'assets', 'soldier', f));
}
console.log(`vendor/warbash-soldier.js: ${(out.length / 1024).toFixed(0)} KB from War Bash ${commit}; fabric scans copied to assets/soldier/`);

/* the baked motion clips, when asked for */
if (withAnim) {
  const UPSTREAM_BAKE = 'd0c22fe31c7686be7e4bf5a355ab544e88243598b268d29784df52c6a31b66b4';       // Riposte: Frontline 5.6.0, assets/anim/clips.bin
  const bin = path.join(src, 'assets', 'anim', 'clips.bin'), idx = path.join(src, 'assets', 'anim', 'clips.json');
  if (!fs.existsSync(bin) || !fs.existsSync(idx)) { console.error('--anim: no baked clips in that checkout (assets/anim/clips.bin and clips.json): bake them first, see its docs/animations.md'); process.exit(1); }
  const data = fs.readFileSync(bin);
  if (createHash('sha256').update(data).digest('hex') === UPSTREAM_BAKE) {
    console.error('--anim: these are the clips Riposte: Frontline shipped, baked by its author and not under the MIT License.\nBake your own from your Mixamo account (docs/animations.md in War Bash), then run this again.'); process.exit(1);
  }
  const j = JSON.parse(fs.readFileSync(idx, 'utf8'));
  fs.writeFileSync(path.join(root, 'assets', 'soldier', 'clips.js'), '/* Soldier motion clips baked from Mixamo by tools/soldier/import.mjs --anim: generated, do not edit. */\nwindow.GS_SOLDIER_ANIM = ' +
    JSON.stringify({ b: data.toString('base64'), stride: j.stride, fps: j.fps, clips: j.clips }) + ';\n');
  const page = path.join(root, 'index.html'), tag = '<script src="assets/soldier/clips.js"></script>', before = '<script src="vendor/warbash-soldier.js"></script>';
  let html = fs.readFileSync(page, 'utf8');
  if (!html.includes(tag)) { if (!html.includes(before)) throw new Error('index.html: the soldier script tag was not found'); html = html.replace(before, tag + before); fs.writeFileSync(page, html); }
  console.log(`assets/soldier/clips.js: ${j.clips.length} clips, ${(data.length / 1024).toFixed(0)} KB; index.html loads it before the soldier code`);
}
