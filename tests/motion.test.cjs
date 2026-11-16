// The captured gait cycles the Churchyard's dead walk by (assets/zombies/motion.js, made by tools/zombie-motion):
// that the file holds what the game expects, every rotation is a rotation, every cycle closes on itself, the
// legs alternate, and the mirrored gaits are mirrors.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load() {
  const window = {};
  vm.runInContext(fs.readFileSync('assets/zombies/motion.js', 'utf8'), vm.createContext({ window }));
  const M = window.VIGIL_MOTION, nb = M.bones.length, clips = {};
  for (const id of Object.keys(M.clips)) {
    const c = M.clips[id], raw = Buffer.from(c.q, 'base64'), q = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2);
    const frames = [];
    for (let f = 0; f < c.n; f++) frames.push(Array.from({ length: nb }, (_, b) => [0, 1, 2, 3].map((k) => q[(f * nb + b) * 4 + k] / 32767)));
    clips[id] = { n: c.n, T: c.T, speed: c.speed, frames, count: q.length };
  }
  return { bones: Array.from(M.bones), nb, clips };
}
const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));
// how far forward (+) or back a thigh is swung: the rotation about X of a quaternion that is mostly about X
const swing = (q) => 2 * Math.atan2(q[0], q[3]);

test('the captured gaits are whole: the bones the body has, rotations that are rotations, cycles that close', () => {
  const { bones, nb, clips } = load();
  assert.deepEqual(bones, ['hips', 'spine', 'chest', 'neck', 'head', 'uaL', 'faL', 'hL', 'uaR', 'faR', 'hR', 'thL', 'shL', 'ftL', 'thR', 'shR', 'ftR']);
  const figure = fs.readFileSync('src/vigil/figure.js', 'utf8');
  for (const b of bones) assert.ok(figure.includes(`['${b}',`), `${b} is a bone of the body`);
  assert.deepEqual(Object.keys(clips).sort(), ['dragL', 'dragR', 'idle', 'limpL', 'limpR', 'run1', 'run2', 'walk1', 'walk2', 'walk3']);
  for (const [id, c] of Object.entries(clips)) {
    assert.equal(c.count, c.n * nb * 4, `${id}: a quaternion for every bone of every frame`);
    assert.ok(c.n >= 24 && c.n <= 120, `${id}: ${c.n} frames`);
    for (const f of c.frames) for (const q of f) assert.ok(Math.abs(Math.hypot(...q) - 1) < 2e-3, `${id}: unit rotations`);
    // from the last frame back to the first is a step like any other in the cycle
    for (let b = 0; b < nb; b++) {
      const steps = c.frames.map((f, i) => angle(f[b], c.frames[(i + 1) % c.n][b])), wrap = steps[c.n - 1], inside = steps.slice(0, c.n - 1).sort((x, y) => x - y);
      assert.ok(wrap <= inside[inside.length - 1] * 1.6 + 0.02, `${id}: ${bones[b]} closes (${wrap.toFixed(3)} against at most ${inside[inside.length - 1].toFixed(3)})`);
    }
  }
  // a shamble's stride takes well over a second, a run's well under; standing still goes nowhere
  for (const id of ['walk1', 'walk2', 'walk3', 'limpL', 'dragL']) assert.ok(clips[id].T > 1.1 && clips[id].T < 1.9 && clips[id].speed > 0.2 && clips[id].speed < 1, `${id}: ${clips[id].T} s at ${clips[id].speed} m/s`);
  for (const id of ['run1', 'run2']) assert.ok(clips[id].T > 0.55 && clips[id].T < 1 && clips[id].speed > clips.walk1.speed * 1.5, `${id}: ${clips[id].T} s at ${clips[id].speed} m/s`);
  assert.equal(clips.idle.speed, 0); assert.equal(clips.idle.T, 7);
});

test('the legs take turns, the body stays upright, and a mirrored gait is the other leg\'s', () => {
  const { bones, clips } = load(), at = (name) => bones.indexOf(name);
  for (const id of ['walk1', 'walk2', 'walk3', 'run1', 'run2']) {
    const c = clips[id], L = c.frames.map((f) => swing(f[at('thL')])), R = c.frames.map((f) => swing(f[at('thR')]));
    const range = (a) => Math.max(...a) - Math.min(...a), mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    assert.ok(range(L) > 0.2 && range(R) > 0.2, `${id}: both thighs swing (${range(L).toFixed(2)}, ${range(R).toFixed(2)} rad)`);
    const mL = mean(L), mR = mean(R), cov = mean(L.map((v, i) => (v - mL) * (R[i] - mR)));
    assert.ok(cov < 0, `${id}: when one thigh is forward the other is back`);
    // knees bend one way only, and never past a right angle and a half
    for (const k of ['shL', 'shR']) for (const f of c.frames) { const bend = swing(f[at(k)]); assert.ok(bend > -0.35 && bend < 2.4, `${id}: ${k} bends ${bend.toFixed(2)} rad`); }
    // the trunk leans, it does not lie down
    for (const f of c.frames) for (const k of ['hips', 'spine', 'chest']) assert.ok(angle(f[at(k)], [0, 0, 0, 1]) < 0.9, `${id}: ${k} stays within fifty degrees of upright`);
  }
  // the capture's arms are out in front: both upper arms raised forward of hanging through the whole shamble
  for (const f of clips.walk1.frames) for (const k of ['uaL', 'uaR']) assert.ok(swing(f[at(k)]) < -0.5, `${k} is held out (${swing(f[at(k)]).toFixed(2)} rad)`);
  // limpR is limpL with left and right exchanged, half a stride on
  for (const [l, r] of [['limpL', 'limpR'], ['dragL', 'dragR']]) {
    const A = clips[l], B = clips[r], h = A.n >> 1;
    for (let i = 0; i < A.n; i += 5) {
      const a = A.frames[(i + h) % A.n], b = B.frames[i];
      for (const [x, y] of [['thL', 'thR'], ['shR', 'shL'], ['uaL', 'uaR'], ['hips', 'hips'], ['chest', 'chest']]) {
        const q = a[at(x)], m = [q[0], -q[1], -q[2], q[3]];
        assert.ok(angle(m, b[at(y)]) < 0.03, `${r}: ${y} mirrors ${l}'s ${x}`);
      }
    }
  }
});
