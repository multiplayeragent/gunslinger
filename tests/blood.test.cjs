const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
// (what the file makes belongs to another realm: compare what it says, not what it is)
const same = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

// Blood (src/vigil/blood.js): the arithmetic, without a renderer.
function load() {
  const window = {};
  vm.runInNewContext(fs.readFileSync('src/vigil/blood.js', 'utf8'), { window, console, Math, Float32Array, Uint8Array, Uint32Array });
  return window.Vigil;
}

test('the colour of a wound: the one chosen, the player\'s own, or any hue at all', () => {
  const V = load();
  const red = V.bloodColour({ colour: 'red' });
  assert.ok(red[0] > red[1] * 8 && red[0] > red[2] * 8 && red[0] < 0.4, 'red, and dark: ' + red.map((v) => v.toFixed(3)));
  same(V.bloodColour({ colour: 'nothing known' }), red, 'an unknown choice is red');
  const own = V.bloodColour({ colour: 'custom', custom: '#00ff00' });
  assert.ok(own[1] > 0.99 && own[0] === 0 && own[2] === 0, 'the colour typed, as the renderer wants it');
  same(V.bloodColour({ colour: 'custom', custom: 'not a colour' }), red);
  // rainbow: the number drawn is the hue, so six draws round the wheel are six different colours, all strong
  const seen = new Set();
  for (let i = 0; i < 6; i++) { const c = V.bloodColour({ colour: 'rainbow' }, () => (i + 0.5) / 6); assert.ok(Math.max(...c) > 0.3 && Math.min(...c) < 0.05, 'a strong colour'); seen.add(c.indexOf(Math.max(...c)) + ':' + c.indexOf(Math.min(...c))); }
  assert.equal(seen.size, 6, 'round the wheel: ' + [...seen].join(' '));
  for (const [id, name, hex] of V.BLOOD.colours) assert.ok(id && name && /^#[0-9a-f]{6}$/.test(hex), id);
});

test('what the player chose is kept, and anything unreadable falls back to red blood, on', () => {
  const V = load(), P = V.bloodPrefs, store = new Map(), s = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  same(P.read(s), { on: true, colour: 'red', custom: '#d4147a' });
  P.write(s, { on: false, colour: 'rainbow', custom: '#ABCDEF' });
  same(P.read(s), { on: false, colour: 'rainbow', custom: '#abcdef' });
  store.set(P.KEY, '{ not json'); assert.equal(P.read(s).on, true);
  store.set(P.KEY, JSON.stringify({ on: 'yes', colour: 'tartan', custom: 'red' })); same(P.read(s), { on: true, colour: 'red', custom: '#d4147a' });
  same(P.read(null), { on: true, colour: 'red', custom: '#d4147a' }, 'no store at all');
  same(P.read({ getItem() { throw new Error('blocked'); } }), { on: true, colour: 'red', custom: '#d4147a' });
  // with it off the dead are told there is no colour; with it on, one
  V.blood.prefs = P.clean({ on: false }); assert.equal(V.blood.tint(), null);
  V.blood.prefs = P.clean({ on: true, colour: 'green' }); const t = V.blood.tint(); assert.ok(t[1] > t[0] && t[1] > t[2]);
});

test('a drop falls, slows, and is gone when it reaches the floor it started over or its time is up', () => {
  const V = load();
  const p = { x: 0, y: 1.4, z: 0, vx: 4, vy: 1, vz: 0, t: 0, life: 3, g: 9.8, drag: 0.45, floor: 0.2 };
  let n = 0, top = p.y;
  while (V.bloodStep(p, 1 / 60)) { n++; top = Math.max(top, p.y); assert.ok(Number.isFinite(p.x + p.y + p.z)); }
  assert.ok(p.y <= 0.2 && n > 20 && n < 60, 'it lands in about ' + (n / 60).toFixed(2) + ' s');
  assert.ok(top > 1.4 && p.x > 1.5 && p.x < 4 * n / 60, 'up a little first, along, and slower than it left');
  const q = { x: 0, y: 5, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 0.3, g: 1.2, drag: 2.6, floor: -1e3 };
  n = 0; while (V.bloodStep(q, 1 / 60)) n++;
  assert.ok(n >= 17 && n <= 18 && q.y > 4.9, 'a puff hangs, and is spent');
});

test('a mark lies flat on what it struck, and one on a wall runs down it', () => {
  const V = load(), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const n of [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) for (const spin of [0, 0.7, 2.9]) {
    const o = V.bloodBasis(n[0], n[1], n[2], spin), t = o.slice(0, 3), b = o.slice(3);
    assert.ok(Math.abs(dot(t, t) - 1) < 1e-9 && Math.abs(dot(b, b) - 1) < 1e-9 && Math.abs(dot(t, b)) < 1e-9 && Math.abs(dot(t, n)) < 1e-9 && Math.abs(dot(b, n)) < 1e-9, 'square to the surface');
    const c = cross(t, b); assert.ok(Math.abs(c[0] - n[0]) + Math.abs(c[1] - n[1]) + Math.abs(c[2] - n[2]) < 1e-9, 'facing out of it, not into it');
  }
  for (const n of [[1, 0, 0], [0, 0, -1]]) { const b = V.bloodBasis(n[0], n[1], n[2], 0).slice(3); assert.ok(Math.abs(b[0]) < 1e-9 && Math.abs(b[1] - 1) < 1e-9 && Math.abs(b[2]) < 1e-9, 'on a wall its top is up'); }
});

test('places for marks: lowest first, the oldest painted over when all are used, one taken back handed out again', () => {
  const V = load(), s = V.bloodStore(4), gone = [];
  assert.deepEqual([s.add(), s.add(), s.add(), s.add()], [0, 1, 2, 3]); assert.equal(s.count, 4); assert.equal(s.high, 4);
  assert.equal(s.add((i) => gone.push(i)), 0, 'the oldest'); assert.deepEqual(gone, [0]); assert.equal(s.count, 4);
  assert.ok(s.remove(2)); assert.ok(!s.remove(2)); assert.equal(s.count, 3); assert.ok(!s.live(2));
  assert.equal(s.add((i) => gone.push(i)), 2, 'the free place before anything is painted over'); assert.deepEqual(gone, [0]);
  // 1 is now the oldest, then 3, then 0 (taken again), then 2
  assert.deepEqual([s.add(), s.add(), s.add(), s.add()], [1, 3, 0, 2]);
  const a = s.stamp(1); s.remove(1); s.add(); assert.notEqual(s.stamp(1), a, 'a place used again is a different mark');
  // ten thousand marks through four places: never more than four, never a place twice in a row
  let last = -1; for (let i = 0; i < 10000; i++) { const k = s.add(); assert.ok(k >= 0 && k < 4 && k !== last); last = k; } assert.equal(s.count, 4);
  s.clear(); assert.equal(s.count, 0); assert.equal(s.high, 0); assert.equal(s.add(), 0);
});

test('the marks\' shader is three.js\'s own with one line added where this file expects it; the dead and the night call it', () => {
  const engine = fs.readFileSync('vendor/gunslinger-engine.js', 'utf8'), src = fs.readFileSync('src/vigil/blood.js', 'utf8');
  assert.ok(engine.includes('#include <uv_vertex>') && engine.includes('vMapUv'), 'the line a mark\'s sixteenth of the sheet is written after');
  assert.ok(src.includes("const ANCHOR = '#include <uv_vertex>';") && src.includes('self.shaderError'), 'and it says so if that line ever goes');
  const z = fs.readFileSync('src/vigil/zombies.js', 'utf8');
  for (const call of ['V.blood.hit(z, point, dirv, head)', 'V.blood.death(z, info)', 'V.blood.sever(z,', 'V.blood.decap(z, tmp, dirv)', 'V.blood.splat(b.pos']) assert.ok(z.includes(call), call);
  const d = fs.readFileSync('src/vigil/director.js', 'utf8');
  for (const call of ['V.blood.install(g)', 'V.blood.update(dt)', 'V.blood.reset()']) assert.ok(d.includes(call), call);
  assert.ok(fs.readFileSync('index.html', 'utf8').includes('src/vigil/blood.js'));
});
