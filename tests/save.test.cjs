const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

// src/vigil/save.js against a made-up browser store: where a night is kept, and the furthest wave of five reached
function load(items = {}) {
  const store = new Map(Object.entries(items));
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const window = { Vigil: { CLASSES: { soldier: { name: 'Soldier' }, medic: { name: 'Medic' } } } };
  vm.runInNewContext(fs.readFileSync('src/vigil/save.js', 'utf8'), { window, localStorage, JSON, Math, Number, String, console });
  return { V: window.Vigil, store };
}
const same = (a, b, why) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, why);      // made in another realm: compared by value
const night = (over = {}) => ({ v: 1, wave: 12, cls: 'soldier', money: 3400.6, crystal: { hp: 2460, max: 3000 }, kits: { carbine: { ammo: 30, reserve: 210 } }, ...over });

test('a night put away: what can be taken up again, how the title says it, and that it is gone once cleared', () => {
  const { V, store } = load();
  assert.equal(V.runSave.read(), null, 'nothing kept yet');
  assert.equal(V.runSaveValid(night()), true);
  for (const bad of [null, 3, {}, night({ v: 2 }), night({ wave: 0 }), night({ cls: 'wizard' }), night({ crystal: { hp: 0, max: 3000 } }), night({ crystal: null }), night({ kits: null })]) assert.equal(V.runSaveValid(bad), false, JSON.stringify(bad));
  assert.equal(V.runSaveLine(night()), 'Wave 12 cleared · Soldier · $3,400 · crystal 82%');
  assert.equal(V.runSaveLine({}), '');
  let told = 0; V.runSave.on(() => told++);
  assert.equal(V.runSave.write(night({ wave: 0 })), false, 'a night with no wave cleared is not kept'); assert.equal(store.size, 0);
  assert.equal(V.runSave.write(night()), true); assert.equal(told, 1);
  assert.equal(V.runSave.read().wave, 12); assert.equal(V.runSave.read().kits.carbine.reserve, 210);
  // what is in the store is read as found: nonsense there is no night
  store.set(V.runSave.key, '{not json'); assert.equal(V.runSave.read(), null);
  store.set(V.runSave.key, JSON.stringify(night({ cls: 'gone' }))); assert.equal(V.runSave.read(), null);
  V.runSave.write(night({ cls: 'medic' })); V.runSave.clear(); assert.equal(V.runSave.read(), null); assert.equal(told, 3);
});

test('the furthest wave of five reached: where a new night may begin, and of two devices the further one', () => {
  const { V, store } = load();
  const R = V.reach;
  assert.equal(R.best, 0); same(R.starts(), [1]); assert.equal(R.allowed(1), true); assert.equal(R.allowed(5), false);
  assert.equal(R.set(4), false, 'wave four is not a wave of five'); assert.equal(R.set(5), true); assert.equal(R.dirty(), true);
  assert.equal(R.set(5), false, 'reached before'); assert.equal(R.set(13), true, 'thirteen counts as ten'); assert.equal(R.best, 10);
  same(R.starts(), [1, 5, 10]);
  for (const [n, ok] of [[1, true], [5, true], [10, true], [15, false], [7, false], [0, false], [-5, false], [5.5, false], ['10', false]]) assert.equal(R.allowed(n), ok, String(n));
  same(R.doc(), { w: 10 }); R.saved(); assert.equal(R.dirty(), false);
  assert.equal(R.merge({ w: 5 }), false, 'a save that reached less changes nothing'); assert.equal(R.merge(null), false);
  assert.equal(R.merge({ w: 22 }), true); assert.equal(R.best, 20);
  // kept in this browser between visits
  const again = load(Object.fromEntries(store)).V.reach;
  assert.equal(again.best, 20); same(again.starts(), [1, 5, 10, 15, 20]);
  assert.equal(load({ 'gunslinger.vigil.reach.v1': 'nonsense' }).V.reach.best, 0);
});
