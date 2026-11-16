const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

// The shape of a burst (src/gunslinger.js `spray`): the same every time, so it can be learned.
const window = {};
vm.runInNewContext(fs.readFileSync('src/gunslinger.js', 'utf8'), { window, document: undefined, console });
const spray = window.Gunslinger.spray;

test('an automatic climbs hard, walks one way, then the other, then sways; the same every burst', () => {
  const burst = Array.from({ length: 30 }, (_, n) => spray(true, n));
  assert.deepEqual(burst, Array.from({ length: 30 }, (_, n) => spray(true, n)), 'no chance in it');
  assert.ok(burst.every(([climb]) => climb >= 1), 'every round climbs at least its share');
  assert.ok(burst[0][0] > burst[5][0], 'the first rounds kick hardest');
  assert.equal(burst[0][1], 0); assert.ok(burst.slice(3, 10).every(([, w]) => w > 0.2) && burst.slice(10, 18).every(([, w]) => w < -0.2), 'right, then left');
  const late = burst.slice(18).map(([, w]) => Math.sign(w)); assert.ok(late.includes(1) && late.includes(-1), 'then it sways');
  // held without correcting, thirty rounds end up well off the mark sideways at some point
  let x = 0, far = 0; for (const [, w] of burst) { x += w; far = Math.max(far, Math.abs(x)); } assert.ok(far > 1.5, 'it walks ' + far.toFixed(1) + ' degrees');
});

test('a weapon fired a round at a time kicks the same each time and steps aside in a fixed order', () => {
  const six = Array.from({ length: 6 }, (_, n) => spray(false, n));
  assert.ok(six.every(([climb]) => climb === 1));
  assert.deepEqual(six.map(([, w]) => Math.sign(w)), [1, -1, 1, -1, 1, -1]);
  assert.deepEqual(spray(false, 6), spray(false, 0)); assert.deepEqual(spray(false, 13), spray(false, 1));
});

test('aiming does not take the kick away', () => {
  const src = fs.readFileSync('src/gunslinger.js', 'utf8');
  const m = src.match(/g\.recoil = g\.recoil \|\| \{ pitch: ([\d.]+), yaw: ([\d.]+), ads: ([\d.]+),/);
  assert.ok(m, 'the recoil settings are where they were');
  // the engine hands over 0.55 of a kick when aimed (u0(1,.55,adsE)): what reaches the view is that times `ads`
  assert.ok(fs.readFileSync('vendor/gunslinger-engine.js', 'utf8').includes('re.recoil(a.burst,u0(1,.55,a.adsE)*(B.crouching?.85:1),B)'));
  assert.ok(0.55 * +m[3] >= 0.75 && 0.55 * +m[3] <= 1, 'aimed is most of the hip: ' + (0.55 * +m[3]).toFixed(2));
});
