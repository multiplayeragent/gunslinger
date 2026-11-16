// Player levels, the skill tree, and how both ride in the save the outfits use.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Levels = require('../src/levels.js');
const Achievements = require('../src/achievements.js');
// things made inside the VM have its own Object and Array: compare what they hold
const same = (a, b, what) => assert.equal(JSON.stringify(a), JSON.stringify(b), what);

function skills(pointsOf) {
  const window = {};
  vm.runInContext(fs.readFileSync('src/vigil/skills.js', 'utf8'), vm.createContext({ window, console, Date }));
  const V = window.Vigil;
  return { V, tree: V.skillTree(pointsOf) };
}

test('experience makes levels on War Bash\'s curve, a rank every ten, and a point for every level gained', () => {
  const { xpFor, levelOf, rankIndex, RANKS, XP, killXp } = Levels;
  assert.deepEqual([1, 2, 3, 10, 100].map(xpFor), [0, 250, 758, 8409, 389903]);
  for (let l = 1; l < 100; l++) { assert.ok(xpFor(l + 1) > xpFor(l), 'each level costs more in all'); assert.equal(levelOf(xpFor(l)), l); assert.equal(levelOf(xpFor(l + 1) - 1), l); }
  assert.equal(levelOf(1e9), 100, 'a hundred is the top');
  assert.equal(RANKS.length, 11); assert.deepEqual([1, 9, 10, 19, 55, 99, 100].map(rankIndex), [0, 0, 1, 1, 5, 9, 10]);
  // what a kill is worth: by kind, half as much again through the head, half for one a turret made
  assert.equal(killXp({ type: 'walker' }), 10); assert.equal(killXp({ type: 'walker', head: true }), 15); assert.equal(killXp({ type: 'boss' }), 400);
  assert.equal(killXp({ type: 'brute', by: 'defense' }), 30); assert.equal(killXp({ type: 'gull', weak: true }), 30, 'a harbor machine, by its weak point');
  assert.ok(XP.wave(1) < XP.wave(10) && XP.wave(10) < XP.mission);

  const L = Levels.create(), seen = [];
  L.on((e) => seen.push(e.type + ':' + (e.level || e.n)));
  assert.equal(L.level, 1); assert.equal(L.points, 0);
  assert.deepEqual(L.add(100, 'Kill'), []); assert.deepEqual(L.add(160, 'Kill'), [2], 'crossing 250');
  assert.deepEqual(L.add(8200, 'Wave'), [3, 4, 5, 6, 7, 8, 9, 10], 'several at once, each announced');
  assert.equal(seen.filter((s) => s.startsWith('level:')).length, 9); assert.equal(L.level, 10); assert.equal(L.points, 9); assert.equal(L.rankName(L.level), 'Soldier');
  const p = L.progress(); assert.equal(p.xp, 8460); assert.equal(p.into, 8460 - 8409); assert.equal(p.need, xpFor(11) - 8409); assert.ok(p.k > 0 && p.k < 0.05);
  assert.deepEqual(L.add(0), []); assert.deepEqual(L.add(-50), []); assert.deepEqual(L.add('x'), []); assert.equal(L.xp, 8460, 'nothing, less than nothing and nonsense add nothing');
  // a run's own count starts again; the save keeps the higher of two
  assert.equal(L.runXp, 8460); L.beginRun(); L.add(40); assert.equal(L.runXp, 40);
  assert.deepEqual(L.doc(), { xp: 8500 }); assert.equal(L.merge({ xp: 900 }), false); assert.equal(L.xp, 8500); assert.equal(L.merge({ xp: 9000 }), true); assert.equal(L.xp, 9000);
  assert.equal(L.merge(null), false); assert.equal(L.merge({ xp: 'lots' }), false);
});

test('the level and the skill tree are kept in the outfits\' save, and come back from it', () => {
  const A = Achievements.create(), L = Levels.create(), { tree } = skills(() => L.points);
  A.extra('level', L); A.extra('skills', tree);
  L.add(3000); assert.ok(A.dirty(), 'experience alone makes the save dirty');
  assert.ok(tree.learn('aim')); assert.ok(tree.learn('hide'));
  const doc = A.doc();
  assert.equal(doc.x.level.xp, 3000); same(doc.x.skills.r, { aim: 1, hide: 1 }); assert.ok(doc.x.skills.t > 0);
  A.saved(); assert.equal(A.dirty(), false);
  // another browser, with nothing: it takes the document in whole
  const A2 = Achievements.create(), L2 = Levels.create(), s2 = skills(() => L2.points).tree;
  A2.extra('level', L2); A2.extra('skills', s2);
  assert.equal(A2.merge(JSON.parse(JSON.stringify(doc))), true);
  assert.equal(L2.xp, 3000); assert.equal(s2.rank('aim'), 1); assert.equal(s2.rank('hide'), 1); assert.equal(s2.free(), L2.points - 2);
  // an older save without these parts changes nothing
  assert.equal(A2.merge({ v: 1, c: {}, s: {}, u: {} }), false); assert.equal(L2.xp, 3000);
});

test('the skill tree: three branches of six, each skill needing the one above, points spent and given back', () => {
  let points = 0;
  const { V, tree } = skills(() => points);
  assert.equal(V.SKILLS.length, 18); same(V.SKILL_BRANCHES, ['Gunfighter', 'Survivor', 'Warden']);
  for (const b of V.SKILL_BRANCHES) {
    const list = V.SKILLS.filter((s) => s.branch === b); assert.equal(list.length, 6, b);
    assert.equal(list[0].needs, undefined, 'a branch starts with a skill that needs nothing');
    for (let i = 1; i < 6; i++) assert.equal(list[i].needs, list[i - 1].id, `${list[i].id} needs the skill above it`);
  }
  const ids = V.SKILLS.map((s) => s.id); assert.equal(new Set(ids).size, 18);
  const full = {}; for (const s of V.SKILLS) full[s.id] = s.max;
  // each rank of a skill costs two points more than the last: 1, 3, 5
  assert.deepEqual([0, 1, 2].map((r) => V.skillCost('aim', r)), [1, 3, 5]); assert.deepEqual([V.skillCost('pierce', 0), V.skillCost('giant', 0), V.skillCost('nope', 0)], [2, 3, 0]);
  assert.deepEqual([1, 2, 3].map((r) => V.skillSpent({ aim: r })), [1, 4, 9]);
  assert.equal(V.skillSpent(full), 78, 'everything costs 78 points'); assert.equal(V.skillSpent({}), 0); assert.equal(V.skillSpent({ aim: 99, nope: 3 }), 9, 'ranks are held to what a skill has');
  // with nothing spent the rules are untouched; with everything, each has moved the right way
  const none = V.skillFx({}), all = V.skillFx(full);
  for (const k of ['dmg', 'recoil', 'reload', 'head', 'reserve', 'big', 'speed', 'resist', 'money', 'crystal', 'mend', 'cooldown']) assert.equal(none[k], 1, k);
  assert.equal(+all.recoil.toFixed(2), 0.88, 'Steady Aim also steadies the kick');
  for (const k of ['pierce', 'hp', 'regen', 'medkits', 'medkitHeal', 'tokens', 'startMoney', 'grenades']) assert.equal(none[k], 0, k);
  assert.deepEqual([all.dmg, all.hp, all.pierce, all.tokens, all.startMoney, all.grenades, all.medkits].map((v) => +v.toFixed(2)), [1.15, 30, 1, 1, 300, 2, 2]);
  assert.ok(all.resist < 1 && all.resist > 0.8 && all.cooldown === 0.75 && all.money > 1.15 && all.crystal === 1.2 && all.reload === 1.1 && all.head > 1.2);        // (`reload` is the rate of fire now: nothing is reloaded)
  // buying: no points, no skill; a skill needs the one above; a point is a rank
  assert.equal(tree.learn('aim'), false); assert.equal(tree.blocked('aim'), 'Needs a point');
  points = 3;
  assert.equal(tree.blocked('reload'), 'Needs Steady Aim'); assert.equal(tree.learn('reload'), false);
  assert.ok(tree.learn('aim')); assert.equal(tree.rank('aim'), 1); assert.equal(tree.free(), 2); assert.equal(tree.blocked('reload'), '');
  assert.ok(tree.learn('reload')); assert.equal(tree.free(), 1);
  assert.equal(tree.blocked('aim'), 'Needs 3 points', 'the second rank is dearer than the first'); assert.equal(tree.learn('aim'), false);
  points = 5; assert.ok(tree.learn('aim')); assert.equal(tree.free(), 0); assert.equal(tree.learn('skull'), false);
  assert.equal(+tree.fx().dmg.toFixed(2), 1.1); assert.equal(+tree.fx().reload.toFixed(2), 1.05);
  points = 40;
  for (const id of ['aim', 'skull', 'skull', 'pouch']) assert.ok(tree.learn(id), id);
  assert.equal(tree.blocked('aim'), 'Learned'); assert.equal(tree.blocked('giant'), 'Needs Through and Through');
  assert.ok(tree.learn('pierce')); assert.equal(tree.blocked('giant'), ''); assert.ok(tree.learn('giant')); assert.equal(tree.spent(), 9 + 1 + 4 + 1 + 2 + 3);
  // every point comes back
  assert.ok(tree.refund()); assert.equal(tree.spent(), 0); assert.equal(tree.free(), 40); assert.equal(tree.fx().dmg, 1); assert.equal(tree.refund(), false);
  // of two trees the later one stands; one that has cost more than there is to spend waits for the levels to arrive
  assert.ok(tree.learn('hide')); const mine = tree.doc();
  assert.equal(tree.merge({ r: { rob: 3 }, t: mine.t - 1000 }), false, 'an older tree is not taken'); assert.equal(tree.rank('hide'), 1);
  assert.equal(tree.merge({ r: { rob: 3, chest: 2, nope: 5, bless: 9 }, t: mine.t + 1000 }), true); assert.equal(tree.rank('hide'), 0); assert.equal(tree.rank('rob'), 3); assert.equal(tree.rank('bless'), 2, 'held to its ranks');
  points = 16; assert.equal(tree.spent(), 0, 'seventeen points\' worth with sixteen to spend: empty for now'); assert.equal(tree.fx().money, 1);
  points = 17; assert.equal(tree.spent(), 17); assert.ok(tree.fx().money > 1.17);
});

function lifeforce() {
  const window = {};
  const ctx = vm.createContext({ window, console, Date, Math });
  vm.runInContext(fs.readFileSync('src/vigil/skills.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('src/vigil/lifeforce.js', 'utf8'), ctx);
  const V = window.Vigil, tree = V.lifeTree();
  tree.reset();
  return { V, tree };
}

test('lifeforce: a tree of its own for the night, its prices, what it does, trading it away, and putting a night back', () => {
  const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what || ''} ${a} is not ${b}`);
  const { V, tree } = lifeforce();
  assert.equal(V.lifeWorth('walker'), 1); assert.equal(V.lifeWorth('brute'), 6); assert.equal(V.lifeWorth('boss'), 30); assert.equal(V.lifeWorth('something new'), 1);
  assert.equal(V.LIFE.lasts, 60, 'a wisp is gone after a minute');
  // fifteen skills, five to a branch, each needing the one above it; none of them is one of the kept tree's
  assert.equal(V.RITES.length, 15); same(V.RITE_BRANCHES, ['Reaper', 'Revenant', 'Lightkeeper']);
  for (const b of V.RITE_BRANCHES) {
    const list = V.RITES.filter((s) => s.branch === b); assert.equal(list.length, 5, b);
    assert.equal(list[0].needs, undefined);
    for (let i = 1; i < 5; i++) assert.equal(list[i].needs, list[i - 1].id, `${list[i].id} needs the skill above it`);
    for (const s of list) { assert.equal(s.max, s.price.length); for (let i = 1; i < s.price.length; i++) assert.ok(s.price[i] > s.price[i - 1], s.id + ': each rank is dearer'); }
  }
  const kept = new Set(V.SKILLS.map((s) => s.id)), names = new Set(V.SKILLS.map((s) => s.name));
  for (const s of V.RITES) { assert.ok(!kept.has(s.id), s.id + ' is not a skill of the kept tree'); assert.ok(!names.has(s.name), s.name); }
  // with nothing bought the rules are untouched; with everything, each has moved the right way
  const none = V.riteFx({}), full = {}; for (const s of V.RITES) full[s.id] = s.max;
  const all = V.riteFx(full);
  for (const k of ['recoil', 'rate', 'door', 'harvest', 'guard']) assert.equal(none[k], 1, k);
  for (const k of ['shatter', 'spoils', 'spree', 'leech', 'ward', 'lash', 'borrow', 'reach', 'tithe', 'nova']) assert.equal(none[k], 0, k);
  assert.equal(Object.keys(none).length, 15, 'one number a skill');
  assert.ok(all.recoil < 0.75 && all.recoil > 0.6 && all.rate > 1.1 && all.door < 1 && all.door >= 0.6 && all.harvest > 1.4 && all.guard === 0.8);
  assert.deepEqual([all.shatter, all.spoils, all.leech, all.ward, all.lash, all.borrow, all.reach, all.tithe, all.nova], [120, 2, 3, 40, 90, 1, 9, 6, 1]);
  close(all.spree, 0.04);
  // prices are the rows' own
  assert.equal(V.lifePrice('steady', 0), 8); assert.equal(V.lifePrice('steady', 2), 22); assert.equal(V.lifePrice('steady', 3), Infinity); assert.equal(V.lifePrice('nova', 0), 150); assert.equal(V.lifePrice('nope', 0), Infinity);
  assert.equal(tree.have, 0); assert.equal(tree.blocked('steady'), 'Needs 8 lifeforce'); assert.equal(tree.buy('steady'), false);
  assert.equal(tree.add(7.6), 8); tree.add(-5); tree.add('x'); assert.equal(tree.have, 8, 'less than nothing and nonsense add nothing'); assert.equal(tree.earned, 8);
  assert.equal(tree.blocked('trigger'), 'Needs Steady Hands'); assert.equal(tree.blocked('nope'), 'No such skill'); assert.equal(tree.blocked('aim'), 'No such skill', 'the kept tree is not sold here');
  assert.equal(tree.buy('steady'), true); assert.equal(tree.have, 0); assert.equal(tree.rank('steady'), 1); assert.equal(tree.price('steady'), 14);
  close(tree.fx().recoil, 0.9); assert.equal(tree.fx().leech, 0, 'what was not bought is untouched'); assert.equal(tree.spent(), 8);
  // the whole tree, each skill only after the one above it
  const whole = V.RITES.reduce((n, s) => n + s.price.reduce((a, b) => a + b, 0), 0);
  assert.ok(whole > 1100 && whole < 1600, 'the whole tree costs ' + whole);
  tree.add(2000);
  for (const s of V.RITES) { while (!tree.blocked(s.id)) assert.ok(tree.buy(s.id)); assert.equal(tree.blocked(s.id), 'Learned', s.id); assert.equal(tree.rank(s.id), s.max); }
  assert.equal(tree.spent(), whole); assert.equal(tree.have, 2000 - (whole - 8)); assert.equal(tree.fx().nova, 1);
  // traded away: only what is held, only a whole positive number
  const before = tree.have;
  assert.equal(tree.take(10), true); assert.equal(tree.have, before - 10); assert.equal(tree.take(0), false); assert.equal(tree.take(-3), false); assert.equal(tree.take(before), false, 'more than is held');
  assert.ok(V.LIFE.cash > 0 && V.LIFE.lot > 0);
  // a night put away and taken up again: the same count and ranks; a rank whose way in is missing is not kept
  const doc = JSON.parse(JSON.stringify(tree.doc())), again = lifeforce().tree;
  assert.equal(again.restore(doc), true); assert.equal(again.have, tree.have); assert.equal(again.rank('nova'), 1); assert.equal(again.spent(), whole);
  assert.equal(again.restore({ have: 5.4, earned: 2, r: { trigger: 2, leech: 9, nope: 3 } }), true);
  assert.equal(again.have, 5); assert.equal(again.earned, 5); assert.equal(again.rank('trigger'), 0, 'Quick Trigger without Steady Hands'); assert.equal(again.rank('leech'), 3, 'held to its ranks');
  assert.equal(again.restore(null), false); assert.equal(again.have, 0); assert.equal(again.rank('leech'), 0);
  // a new night: nothing held, nothing bought
  tree.reset(); assert.equal(tree.have, 0); assert.equal(tree.earned, 0); assert.equal(tree.rank('steady'), 0); assert.equal(tree.fx().recoil, 1);
});
