// Makes assets/zombies/motion.js: looping gait cycles for the Churchyard's dead, taken from motion capture.
//
//   node tools/zombie-motion/build.mjs <folder holding the BVH files>
//
// The capture is the 100STYLE dataset (Ian Mason, Sebastian Starke and Taku Komura, 2022; Creative Commons
// Attribution 4.0; https://www.ianxmason.com/100style/ and https://zenodo.org/records/8127870). The files this
// reads are named in CLIPS below: the Zombie style walking, running and standing, and the LimpLeft and DragLeftLeg
// styles walking. They are not in this repository: the archive is 1.5 GB. Only what this tool writes is shipped,
// with the credit in CREDITS.md.
//
// What it does with a clip:
//   1. Reads the BVH (an Xsens skeleton of 23 joints, in a T-pose, facing +Z, centimetres, 60 frames a second)
//      and works out every joint's rotation in the world, frame by frame.
//   2. Takes the turning out of it: the body's heading is smoothed over a second and a half and removed, so a
//      cycle walks straight ahead whatever the performer's path did.
//   3. Finds the strides: one runs from the left foot passing the right, going forward, to the next time it
//      does. The cycles kept are the ones nearest the usual length that walk straightest and end nearest the
//      pose they began in; what difference is left is spread along the cycle, so it loops exactly.
//   4. Carries each joint's world rotation over to the bone of the game's skeleton that stands for it
//      (src/vigil/figure.js: 18 bones, arms hanging at rest), turning it by the difference between the two rest
//      poses, and writes the bones' local rotations, the rise and fall of the hips and their sway.
// A mirrored copy of the limp and of the dragged leg gives the right-legged versions.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = process.argv[2];
if (!src || !existsSync(src)) { console.error('usage: node tools/zombie-motion/build.mjs <folder holding Zombie_FW.bvh, Zombie_FR.bvh, Zombie_ID.bvh, LimpLeft_FW.bvh, DragLeftLeg_FW.bvh>'); process.exit(1); }

// file, the frames the dataset's own Frame_Cuts.csv marks as the style proper, how many cycles to keep and how many frames to write for each
const CLIPS = [
  { id: 'walk', file: 'Zombie_FW.bvh', from: 413, to: 10051, keep: 3, frames: 40 },
  { id: 'limp', file: 'LimpLeft_FW.bvh', from: 464, to: 8966, keep: 1, frames: 40, mirror: true },
  { id: 'drag', file: 'DragLeftLeg_FW.bvh', from: 429, to: 10113, keep: 1, frames: 40, mirror: true },
  { id: 'run', file: 'Zombie_FR.bvh', from: 396, to: 4656, keep: 2, frames: 28 },
  { id: 'idle', file: 'Zombie_ID.bvh', from: 566, to: 1614, idle: true, seconds: 7, frames: 84 },
];
// the game's skeleton (figure.js BONES), without the jaw: name, parent, where it sits at rest
const BONES = [
  ['hips', -1, [0, 0.96, 0]], ['spine', 0, [0, 1.10, 0]], ['chest', 1, [0, 1.30, 0]], ['neck', 2, [0, 1.52, 0]], ['head', 3, [0, 1.60, 0]],
  ['uaL', 2, [0.215, 1.455, 0]], ['faL', 5, [0.235, 1.165, 0]], ['hL', 6, [0.245, 0.90, 0.01]],
  ['uaR', 2, [-0.215, 1.455, 0]], ['faR', 8, [-0.235, 1.165, 0]], ['hR', 9, [-0.245, 0.90, 0.01]],
  ['thL', 0, [0.095, 0.93, 0]], ['shL', 11, [0.10, 0.50, 0.005]], ['ftL', 12, [0.10, 0.085, 0]],
  ['thR', 0, [-0.095, 0.93, 0]], ['shR', 14, [-0.10, 0.50, 0.005]], ['ftR', 15, [-0.10, 0.085, 0]],
];
// which captured joint each bone follows, and the joint whose offset gives that joint's direction at rest
const FOLLOW = {
  hips: ['Hips', null], spine: ['Chest', 'Chest2'], chest: ['Chest4', 'Neck'], neck: ['Neck', 'Head'], head: ['Head', null],
  uaL: ['LeftShoulder', 'LeftElbow'], faL: ['LeftElbow', 'LeftWrist'], hL: ['LeftWrist', 'LeftElbow>LeftWrist'],
  uaR: ['RightShoulder', 'RightElbow'], faR: ['RightElbow', 'RightWrist'], hR: ['RightWrist', 'RightElbow>RightWrist'],
  thL: ['LeftHip', 'LeftKnee'], shL: ['LeftKnee', 'LeftAnkle'], ftL: ['LeftAnkle', null],
  thR: ['RightHip', 'RightKnee'], shR: ['RightKnee', 'RightAnkle'], ftR: ['RightAnkle', null],
};
const MIRROR = { uaL: 'uaR', faL: 'faR', hL: 'hR', thL: 'thR', shL: 'shR', ftL: 'ftR', uaR: 'uaL', faR: 'faL', hR: 'hL', thR: 'thL', shR: 'shL', ftR: 'ftL' };
const LEG = 0.93 - 0.085;                                  // hip to ankle, metres, in the game's body

// ------------------------------------------------------------------ quaternions [x, y, z, w]
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
const qaxis = (x, y, z, deg) => { const h = (deg * Math.PI) / 360, s = Math.sin(h); return [x * s, y * s, z * s, Math.cos(h)]; };
const qrot = (q, v) => { const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2]; return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]; };
const qnorm = (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };
const qdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const qslerp = (a, b, t) => {
  let d = qdot(a, b); if (d < 0) { b = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }
  if (d > 0.9995) return qnorm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]);
  const th = Math.acos(d), s = Math.sin(th), ka = Math.sin((1 - t) * th) / s, kb = Math.sin(t * th) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb, a[3] * ka + b[3] * kb];
};
const qangle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(qdot(a, b))));
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
// the shortest turn that takes direction a to direction b
const qbetween = (a, b) => {
  a = norm(a); b = norm(b);
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d > 0.999999) return [0, 0, 0, 1];
  if (d < -0.999999) return [1, 0, 0, 0];
  return qnorm([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], 1 + d]);
};

// ------------------------------------------------------------------ BVH
function readBvh(path) {
  const text = readFileSync(path, 'latin1'), cut = text.indexOf('MOTION');
  const joints = [], stack = [];
  let endSite = false;
  for (const raw of text.slice(0, cut).split(/\r?\n/)) {
    const t = raw.trim().split(/\s+/);
    if (t[0] === 'ROOT' || t[0] === 'JOINT') { joints.push({ name: t[1], parent: stack.length ? stack[stack.length - 1] : -1, offset: [0, 0, 0], channels: [], end: null }); }
    else if (t[0] === 'End') endSite = true;
    else if (t[0] === '{') { if (!endSite) stack.push(joints.length - 1); }
    else if (t[0] === '}') { if (endSite) endSite = false; else stack.pop(); }
    else if (t[0] === 'OFFSET') { const o = [+t[1], +t[2], +t[3]]; if (endSite) joints[stack[stack.length - 1]].end = o; else joints[joints.length - 1].offset = o; }
    else if (t[0] === 'CHANNELS') joints[joints.length - 1].channels = t.slice(2);
  }
  const lines = text.slice(cut).split(/\r?\n/), count = +lines[1].split(/\s+/)[1], dt = +lines[2].split(/\s+/)[2];
  const width = joints.reduce((n, j) => n + j.channels.length, 0), frames = [];
  for (let i = 3; i < lines.length && frames.length < count; i++) { const v = lines[i].trim(); if (!v) continue; const f = Float64Array.from(v.split(/\s+/), Number); if (f.length === width) frames.push(f); }
  const index = {}; joints.forEach((j, i) => (index[j.name] = i));
  return { joints, index, frames, dt };
}
// every joint's rotation and place in the world for one frame
function world(bvh, frame) {
  const rot = [], pos = [];
  let at = 0;
  for (let i = 0; i < bvh.joints.length; i++) {
    const j = bvh.joints[i];
    let q = [0, 0, 0, 1], p = j.offset.slice();
    for (const ch of j.channels) {
      const v = frame[at++];
      if (ch === 'Xposition') p[0] = v; else if (ch === 'Yposition') p[1] = v; else if (ch === 'Zposition') p[2] = v;
      else q = qmul(q, ch === 'Xrotation' ? qaxis(1, 0, 0, v) : ch === 'Yrotation' ? qaxis(0, 1, 0, v) : qaxis(0, 0, 1, v));
    }
    if (j.parent < 0) { rot.push(q); pos.push(p); }
    else { const o = qrot(rot[j.parent], p); rot.push(qmul(rot[j.parent], q)); pos.push([pos[j.parent][0] + o[0], pos[j.parent][1] + o[1], pos[j.parent][2] + o[2]]); }
  }
  return { rot, pos };
}

// ------------------------------------------------------------------ one clip
function prepare(bvh, from, to) {
  const J = bvh.index, n = to - from;
  // the turn that fits each of the game's bones to the captured joint it follows
  const fit = BONES.map(([name, , at], b) => {
    const [, toward] = FOLLOW[name];
    if (!toward) return [0, 0, 0, 1];
    const child = BONES.findIndex((o) => o[1] === b), own = child >= 0 ? [BONES[child][2][0] - at[0], BONES[child][2][1] - at[1], BONES[child][2][2] - at[2]] : null;
    let theirs;
    if (toward.includes('>')) { const [a, c] = toward.split('>'); theirs = bvh.joints[J[c]].offset; const p = BONES[BONES[b][1]][2]; return qbetween([at[0] - p[0], at[1] - p[1], at[2] - p[2]], bvh.joints[J[c]].offset.map((v, k) => v)); }
    theirs = bvh.joints[J[toward]].offset;
    return own ? qbetween(own, theirs) : [0, 0, 0, 1];
  });
  const W = [], yaw = [], hips = [], feet = [];
  for (let f = from; f < to; f++) {
    const w = world(bvh, bvh.frames[f]);
    W.push(w);
    const fwd = qrot(w.rot[J.Hips], [0, 0, 1]);
    yaw.push(Math.atan2(fwd[0], fwd[2]));
    hips.push(w.pos[J.Hips]);
  }
  // unwrap the heading, then smooth it over a second and a half: what is left in the hips is the gait's own turning
  for (let i = 1; i < n; i++) { while (yaw[i] - yaw[i - 1] > Math.PI) yaw[i] -= 2 * Math.PI; while (yaw[i] - yaw[i - 1] < -Math.PI) yaw[i] += 2 * Math.PI; }
  const half = Math.round(0.75 / bvh.dt), smooth = (a) => a.map((_, i) => { let s = 0, c = 0; for (let k = Math.max(0, i - half); k <= Math.min(n - 1, i + half); k++) { s += a[k]; c++; } return s / c; });
  const heading = smooth(yaw), px = smooth(hips.map((p) => p[0])), pz = smooth(hips.map((p) => p[2]));
  const local = [], bob = [], sway = [], pace = [];
  let lastStance = null;
  for (let i = 0; i < n; i++) {
    const w = W[i], un = qaxis(0, 1, 0, (-heading[i] * 180) / Math.PI);
    const ours = BONES.map(([name], b) => qmul(qmul(un, w.rot[J[FOLLOW[name][0]]]), fit[b]));
    local.push(BONES.map(([, parent], b) => (parent < 0 ? ours[b] : qnorm(qmul(qinv(ours[parent]), ours[b])))));
    const fx = Math.sin(heading[i]), fz = Math.cos(heading[i]);
    const dl = w.pos[J.LeftAnkle], dr = w.pos[J.RightAnkle];
    feet.push((dl[0] - dr[0]) * fx + (dl[2] - dr[2]) * fz);                       // how far the left foot leads the right, along the way it is going
    // How fast it is walking. The capture keeps the body in one place, so the ground speed is read off the
    // planted foot: the lower of the two, and how fast it is going backward under the hips.
    const left = dl[1] < dr[1], foot = left ? dl : dr, ahead = (foot[0] - hips[i][0]) * fx + (foot[2] - hips[i][2]) * fz;
    pace.push(lastStance && lastStance.left === left ? Math.max(0, lastStance.ahead - ahead) / bvh.dt : -1);
    lastStance = { left, ahead };
    bob.push(hips[i][1]);
    sway.push((hips[i][0] - px[i]) * fz - (hips[i][2] - pz[i]) * fx);              // to the body's left of its smoothed path
  }
  const legs = Math.hypot(...bvh.joints[J.LeftKnee].offset) + Math.hypot(...bvh.joints[J.LeftAnkle].offset);
  return { n, dt: bvh.dt, local, bob, sway, feet, pace, heading, px, pz, scale: LEG / (legs * 0.01) };      // the game's leg against the performer's (whose is in centimetres)
}
const sample = (P, t) => {                                   // the pose between two captured frames
  const i = Math.max(0, Math.min(P.n - 2, Math.floor(t))), k = t - i;
  return { q: P.local[i].map((q, b) => qslerp(q, P.local[i + 1][b], k)), bob: P.bob[i] + (P.bob[i + 1] - P.bob[i]) * k, sway: P.sway[i] + (P.sway[i + 1] - P.sway[i]) * k };
};
function write(P, a, b, frames) {
  // b is where the next cycle begins: the pose there is the pose at a, near enough, and what differs is spread along the cycle
  const first = sample(P, a), last = sample(P, b), out = { q: [], bob: [], sway: [] };
  const err = first.q.map((q, i) => qmul(qinv(last.q[i]), q));
  for (let k = 0; k < frames; k++) {
    const u = k / frames, s = sample(P, a + (b - a) * u);
    out.q.push(s.q.map((q, i) => qnorm(qmul(q, qslerp([0, 0, 0, 1], err[i], u)))));
    out.bob.push(s.bob + (first.bob - last.bob) * u); out.sway.push(s.sway + (first.sway - last.sway) * u);
  }
  const mb = out.bob.reduce((x, y) => x + y, 0) / frames, ms = out.sway.reduce((x, y) => x + y, 0) / frames;
  out.bob = out.bob.map((v) => (v - mb) * 0.01 * P.scale); out.sway = out.sway.map((v) => (v - ms) * 0.01 * P.scale);
  return out;
}
function cycles(P, keep, frames) {
  // strides: from the left foot passing the right going forward to the next time it does
  const marks = [];
  for (let i = 1; i < P.n; i++) if (P.feet[i - 1] < 0 && P.feet[i] >= 0) marks.push(i - 1 + -P.feet[i - 1] / (P.feet[i] - P.feet[i - 1]));
  const spans = []; for (let i = 0; i + 1 < marks.length; i++) spans.push([marks[i], marks[i + 1]]);
  const lens = spans.map(([a, b]) => b - a).sort((x, y) => x - y), median = lens[lens.length >> 1];
  const scored = [];
  for (const [a, b] of spans) {
    if (Math.abs(b - a - median) > median * 0.1) continue;
    const s0 = sample(P, a), s1 = sample(P, b), ia = Math.round(a), ib = Math.round(b);
    const turn = Math.abs(P.heading[ib] - P.heading[ia]), close = s0.q.reduce((sum, q, i) => sum + qangle(q, s1.q[i]), 0);
    const T = (b - a) * P.dt;
    let sum = 0, cnt = 0; for (let i = ia; i < ib; i++) if (P.pace[i] >= 0) { sum += P.pace[i]; cnt++; }
    scored.push({ a, b, turn, close, score: close + turn * 4, T, speed: cnt ? (sum / cnt) * 0.01 * P.scale : 0 });
  }
  scored.sort((x, y) => x.score - y.score);
  const picked = [];
  for (const c of scored) { if (picked.every((p) => Math.abs(p.a - c.a) > median * 3)) picked.push(c); if (picked.length === keep) break; }
  return picked.map((c) => ({ ...write(P, c.a, c.b, frames), T: c.T, speed: c.speed, close: c.close, turn: c.turn }));
}
function standing(P, seconds, frames) {
  // the stillest stretch of that length: least movement of the feet, and ending nearest how it began
  const len = Math.round(seconds / P.dt);
  let best = null;
  for (let a = 0; a + len < P.n; a += 6) {
    const s0 = sample(P, a), s1 = sample(P, a + len), close = s0.q.reduce((sum, q, i) => sum + qangle(q, s1.q[i]), 0);
    let roam = 0; for (let i = a; i < a + len; i += 6) roam = Math.max(roam, Math.hypot(P.px[i] - P.px[a], P.pz[i] - P.pz[a]));
    const score = close + roam * 0.08;
    if (!best || score < best.score) best = { a, score, close };
  }
  return [{ ...write(P, best.a, best.a + len, frames), T: seconds, speed: 0, close: best.close, turn: 0 }];
}
// the same motion with left and right exchanged, begun half a stride on so the same foot leads at the start
function mirrored(c) {
  const n = c.q.length, h = n >> 1, out = { ...c, q: [], bob: [], sway: [] };
  for (let k = 0; k < n; k++) {
    const s = c.q[(k + h) % n];
    out.q.push(BONES.map(([name]) => { const q = s[BONES.findIndex((b) => b[0] === (MIRROR[name] || name))]; return [q[0], -q[1], -q[2], q[3]]; }));
    out.bob.push(c.bob[(k + h) % n]); out.sway.push(-c.sway[(k + h) % n]);
  }
  return out;
}

// ------------------------------------------------------------------ all of them, packed
const out = {}, report = [];
for (const clip of CLIPS) {
  const path = join(src, clip.file);
  if (!existsSync(path)) { console.error(`missing ${clip.file} in ${src}`); process.exit(1); }
  const bvh = readBvh(path), P = prepare(bvh, clip.from, Math.min(clip.to, bvh.frames.length));
  const got = clip.idle ? standing(P, clip.seconds, clip.frames) : cycles(P, clip.keep, clip.frames);
  if (!got.length) { console.error(`${clip.file}: no usable cycle found`); process.exit(1); }
  got.forEach((c, i) => {
    out[clip.id + (got.length > 1 ? i + 1 : '')] = c;
    report.push(`${clip.id}${got.length > 1 ? i + 1 : ''}: ${c.T.toFixed(2)} s, ${c.speed.toFixed(2)} m/s, closed ${(c.close * 57.3).toFixed(0)} deg over ${BONES.length} bones`);
    if (clip.mirror) out[clip.id + 'R'] = mirrored(c);
  });
  if (clip.mirror) { out[clip.id + 'L'] = out[clip.id]; delete out[clip.id]; }
}
const b64 = (ints) => Buffer.from(new Int16Array(ints).buffer).toString('base64');
const packed = {};
for (const id of Object.keys(out)) {
  const c = out[id], q = [];
  for (const frame of c.q) for (const v of frame) for (const x of v) q.push(Math.round(Math.max(-1, Math.min(1, x)) * 32767));
  packed[id] = { n: c.q.length, T: +c.T.toFixed(4), speed: +c.speed.toFixed(4), q: b64(q), bob: b64(c.bob.map((v) => Math.round(v * 10000))), sway: b64(c.sway.map((v) => Math.round(v * 10000))) };
}
const js = '/* Gait cycles for the dead, from the 100STYLE motion capture dataset (Ian Mason, Sebastian Starke, Taku Komura; CC BY 4.0).\n'
  + '   GENERATED by tools/zombie-motion/build.mjs: do not edit. q: a quaternion (x, y, z, w as 16-bit) for each bone of each frame;\n'
  + '   bob, sway: the hips\' rise and sideways drift in tenths of a millimetre; T: seconds a cycle took; speed: metres a second it covered. */\n'
  + 'window.VIGIL_MOTION = ' + JSON.stringify({ bones: BONES.map((b) => b[0]), clips: packed }) + ';\n';
writeFileSync(join(root, 'assets', 'zombies', 'motion.js'), js);
console.log(report.join('\n'));
console.log(`assets/zombies/motion.js: ${Object.keys(packed).length} clips (${Object.keys(packed).join(', ')}), ${(js.length / 1024).toFixed(0)} KB`);
