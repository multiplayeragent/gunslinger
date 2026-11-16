const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

// src/vigil/warm.js against a made-up game: it does each first-time thing once, one a step, says what it is doing,
// clears up after itself, never lets a failing step stop it, counts only the frames it is given, and runs only once.
function setup() {
  const log = [], removed = [];
  class Vec { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } clone() { return new Vec(this.x, this.y, this.z); } setY(y) { this.y = y; return this; } distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); } }
  const said = [];
  const make = () => ({ className: '', style: {}, kids: [], set textContent(t) { if (/boot-sub/.test(this.className)) said.push(t); }, setAttribute() {}, appendChild(k) { this.kids.push(k); }, remove() { removed.push(this.className); } });
  const document = { createElement: make, getElementById: () => null, body: { appendChild(e) { log.push('veil on'); } } };
  const clock = { now: 0, step: 5 };
  const performance = { now: () => (clock.now += clock.step) };
  const dead = [];
  const Z = { types: ['walker', 'runner', 'brute'], clear() { log.push('Z.clear'); }, spawn(type, at) { const z = { type, alive: true, pos: new Vec(at.x, 0, at.z), damage(n, p, d, part, info) { if (n > 1000) { this.alive = false; dead.push(type + ':' + part + ':' + info.by + (info.blast ? ':blast' : '')); } } }; log.push('spawn ' + type); return z; } };
  const rig = { flash: { visible: false } };
  const stone = { kind: 'stone', state: 'whole', c: new Vec(3, 0, 3) }, wall = { kind: 'stone', state: 'whole', raze: true, c: new Vec(0, 0, 1) };
  const window = {
    GunslingerAlerts: { warm() { log.push('alerts'); } },
    Vigil: {
      KITS: { carbine: { weapon: 'carbine' }, lmg: { weapon: 'support' } }, SIDEARMS: { sidearm: { weapon: 'sidearm' } },
      defenses: { netPlace(a, who) { log.push('place ' + a[0] + ' by ' + who); }, flareAt() { log.push('flare'); }, reset() { log.push('defenses.reset'); } },
      loose: { clearBodies() { log.push('loose.clear'); } },
      fire: { burst() { log.push('fire'); }, ring() {}, wreathe() {}, reset() { log.push('fire.reset'); } },
      wisps: { spawn() { log.push('wisp'); }, reset() { log.push('wisps.reset'); } },
      blood: { burst() { log.push('blood'); }, fill() { log.push('blood mark'); }, reset() { log.push('blood.reset'); } },
      storm: { strike() { throw new Error('a storm that fails'); } },
      destruct: { objects: [wall, stone], hit(o) { log.push('break ' + (o === stone ? 'stone' : 'WALL')); o.state = 'stump'; }, reset() { log.push('destruct.reset'); stone.state = 'whole'; } },
      ui: { showTab(t) { log.push('tab ' + t); } },
    },
  };
  const g = {
    THREE: { Vector3: Vec }, enemies: Z, camera: { position: new Vec(0, 1.6, 40), getWorldDirection(v) { v.x = 0; v.y = 0; v.z = -1; return v; } },
    weapon: { current: 'rifle', rigs: { rifle: rig }, setVisible(v) { log.push('weapon ' + (v ? 'shown' : 'hidden')); } },
    arsenal: { load(id) { log.push('load ' + id); } },
    physics: { groundHeight: () => 0 }, render: { lightPool: { flash() { log.push('flash'); } } }, events: { emit(n) { log.push('emit ' + n); } },
    audio: { mix: { master: { gain: { value: 1 } } } },
    fx: { explosion() { log.push('fx explosion'); }, sparks() { throw new Error('sparks fail'); }, clear() { log.push('fx.clear'); } },
  };
  vm.runInNewContext(fs.readFileSync('src/vigil/warm.js', 'utf8'), { window, document, performance, console: { error() {} }, Math, Number, Object });
  return { W: window.Vigil.warm, g, log, removed, dead, rig, stone, wall, said, clock };
}

test('the warm-up shows everything once behind a veil, clears it away, and is not stopped by a step that fails', () => {
  const { W, g, log, removed, dead, rig, stone, wall, said } = setup();
  let hidden = null, finished = 0;
  assert.equal(W.start(g, { hide: (v) => { hidden = v; }, finish: () => { finished++; } }), true);
  assert.equal(W.running, true); assert.equal(W.done, false); assert.equal(log[0], 'veil on');
  assert.equal(W.start(g, {}), false, 'it is already running');
  assert.equal(g.render.hold, true, 'the renderer does not judge these frames'); assert.equal(g.audio.mix.master.gain.value, 0, 'and nothing of it is heard');
  let frames = 0, most = 0; while (W.running && frames++ < 900) { const n = log.length; W.tick(); if (W.running) most = Math.max(most, log.length - n); }   // (the last frame clears everything away)
  assert.equal(W.done, true); assert.ok(frames < 300, `it takes a hundred frames or so (${frames})`);
  assert.ok(most <= 6, `one thing a step, not everything at once (${most} in one frame)`);
  assert.equal(g.render.hold, false);
  assert.deepEqual(removed, ['gs-loading vg-warm']); assert.equal(finished, 1, 'the state of the night is put back once'); assert.equal(hidden, true, 'the dead never see the warden on the title');
  // each kind of thing was really done
  for (const what of ['place guard by warm', 'place turret by warm', 'place floodlight by warm', 'flare', 'spawn walker', 'spawn runner', 'spawn brute', 'fx explosion', 'flash', 'emit explosion', 'emit impact', 'fire', 'blood', 'blood mark', 'wisp', 'break stone', 'weapon shown', 'load carbine', 'load support', 'load sidearm', 'weapon hidden', 'alerts', 'tab skills']) assert.ok(log.includes(what), what);
  assert.ok(!log.includes('break WALL'), 'a building is not knocked down to warm up');
  assert.equal(dead.length, 3); assert.ok(dead.some((d) => /blast/.test(d)) && dead.some((d) => /weak/.test(d)), 'they are put down in different ways: ' + dead.join(' '));
  assert.ok(dead.every((d) => /:warm/.test(d)), 'nobody is credited with them');
  // and everything was cleared away afterwards, in spite of the storm and the sparks that threw
  const end = log.slice(log.lastIndexOf('alerts'));
  for (const what of ['Z.clear', 'loose.clear', 'defenses.reset', 'fire.reset', 'blood.reset', 'wisps.reset', 'destruct.reset', 'fx.clear']) assert.ok(end.includes(what), what + ' at the end');
  assert.equal(rig.flash.visible, false); assert.equal(stone.state, 'whole'); assert.equal(wall.state, 'whole');
  assert.ok(W.report.length >= 10 && W.report.every((r) => typeof r[0] === 'string' && r[1] >= 0));
  // the screen said what was being done, a thing at a time
  for (const what of ['Posting a guard', 'Raising a walker', 'Putting down a brute', 'An explosion', 'Breaking a headstone', 'Walking into the church', 'The armory: lifeforce']) assert.ok(said.includes(what), 'said: ' + what);
  assert.ok(new Set(said).size >= 25, 'a line for each step');
  // once a page
  assert.equal(W.start(g, {}), false); W.tick(); assert.equal(finished, 1);
});

test('the warm-up counts the frames it is given, not the clock: a tab left in the background does not use it up', () => {
  const { W, g, log, clock } = setup();
  W.start(g, {});
  for (let i = 0; i < 6; i++) W.tick();
  clock.now += 20 * 60 * 1000;                                  // twenty minutes in another tab: no frames at all
  W.tick();
  assert.equal(W.running, true, 'it carries on where it was');
  let frames = 0; while (W.running && frames++ < 900) W.tick();
  assert.equal(W.done, true);
  for (const what of ['load carbine', 'load sidearm', 'tab skills', 'break stone']) assert.ok(log.includes(what), what + ' was still done');
  // a machine that really is that slow starts anyway: four minutes of frames given
  const slow = setup(); slow.clock.step = 400;
  slow.W.start(slow.g, {});
  frames = 0; while (slow.W.running && frames++ < 5000) slow.W.tick();
  assert.equal(slow.W.done, true);
});

test('long frames in play are kept, with the number of shader programs, to find what the warm-up missed', () => {
  const { W, g } = setup();
  g.render.renderer = { info: { programs: [1, 2, 3] } }; g.game = { state: 'playing' };
  W.note(0.05, g); W.note(0.6, g);
  assert.equal(W.hitches.length, 1); assert.equal(W.hitches[0].ms, 600); assert.equal(W.hitches[0].programs, 3); assert.equal(W.hitches[0].state, 'playing');
});

test('what a step makes is not drawn until its shaders are ready: the frame after it asks for them instead', async () => {
  const { W, g, log } = setup();
  const draws = [], asks = [], waiting = [];
  const mesh = (layer, visible = true) => ({ isMesh: true, visible, layers: { test: (l) => l === layer } });
  const world = mesh(1), hand = mesh(2), hidden = mesh(1, false);
  const scene = { traverseVisible(fn) { for (const q of [world, hand, hidden]) if (q.visible) fn(q); } };
  const renderer = {
    render(s, c) { draws.push(c.name); },
    compileAsync(shim, camera, target) { const got = []; shim.traverse((q) => got.push(q)); asks.push({ cam: camera.name, got, target }); return new Promise((r) => waiting.push(r)); },
  };
  const original = renderer.render;
  g.render.renderer = renderer;
  const cam = { name: 'world', layers: 1 }, view = { name: 'view', layers: 2 };
  const frame = () => { W.tick(); renderer.render(scene, cam); renderer.render(scene, view); };       // the engine's frame: two draws
  const settle = async () => { while (waiting.length) waiting.shift()(); await new Promise((r) => setTimeout(r, 0)); };
  W.start(g, {});
  frame();
  assert.equal(draws.length, 0, 'the first frame draws nothing');
  assert.equal(asks.length, 2); assert.deepEqual(asks.map((a) => a.cam), ['world', 'view']);
  assert.deepEqual(asks[0].got, [world], 'only what that camera would have drawn, and nothing hidden'); assert.deepEqual(asks[1].got, [hand]);
  assert.equal(asks[0].target, scene, 'with the lights and reflections of the scene as the engine left them');
  const before = log.length;
  frame(); frame();
  assert.equal(draws.length, 0); assert.equal(asks.length, 2, 'it waits: nothing drawn, nothing asked twice'); assert.equal(log.length, before, 'and no step is run meanwhile');
  await settle(); frame();
  assert.ok(draws.length >= 2, 'ready: it draws');
  let frames = 0; while (W.running && frames++ < 2000) { frame(); await settle(); }
  assert.equal(W.done, true); assert.equal(W.blind, false);
  assert.equal(renderer.render, original, 'the renderer is given back as it was');
  for (const what of ['load carbine', 'spawn brute', 'tab skills']) assert.ok(log.includes(what), what);
});
