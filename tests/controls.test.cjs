const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const C = require('../src/controls.js');

// src/controls.js without a browser: the bindings of both maps, what a rebound key is passed on as, the engine's
// key table rewritten, the controller's buttons a frame at a time, the save, and the places in the bundle and in
// the game's own listeners that it leans on.
const bundle = fs.readFileSync('vendor/gunslinger-engine.js', 'utf8');
const engineTable = () => { const m = bundle.match(/var fE=(\{[^}]+\})/); assert.ok(m, 'the engine key table is where it was'); return Function('return ' + m[1])(); };
const press = (...on) => { const b = new Array(17).fill(false); for (const i of on) b[i] = true; return b; };
const PLAY = { play: true, aim: false, prompt: false, fwd: 0 };

test('every action of both maps has a key or a button, and no two of a kind share one', () => {
  for (const map of ['harbor', 'vigil']) {
    const M = C.create({ map });
    const keys = new Map(), pads = new Map();
    for (const a of M.actions) {
      assert.ok(a.engine || a.code, `${map}/${a.id} does something`);
      assert.ok(a.stick || M.pad(a.id), `${map}/${a.id} can be reached on a controller`);
      for (const k of M.keys(a.id)) { const at = a.ctx + ':' + k; assert.ok(!keys.has(at), `${map}: ${k} is ${keys.get(at)} and ${a.id}`); keys.set(at, a.id); }
      const p = a.stick ? '' : M.pad(a.id); if (p) { const at = a.ctx + ':' + p; assert.ok(!pads.has(at), `${map}: button ${p} is ${pads.get(at)} and ${a.id}`); pads.set(at, a.id); }
    }
    assert.equal(M.pad('pause'), '9'); assert.equal(M.label('jump', 'pad'), 'A'); assert.equal(M.label('jump', 'key'), 'Space');
  }
  const V = C.create({ map: 'vigil' });
  assert.equal(V.label('flare', 'pad'), 'LB + X'); assert.equal(V.label('wave', 'key'), 'Enter'); assert.equal(V.label('forward', 'pad'), 'Left stick');
  assert.equal(V.label('flare', 'pad', ['Cross', 'Circle', 'Square', 'Triangle', 'L1']), 'L1 + Square', 'named for the controller in the hand');
  assert.ok(!V.byId.interact && !V.byId.dress && C.create({ map: 'harbor' }).byId.dress, 'each map lists its own');
});

test('the game\'s listeners are told the code they look for, whatever key was pressed', () => {
  const M = C.create({ map: 'vigil' });
  assert.deepEqual(M.translate('KeyF'), ['KeyF']); assert.deepEqual(M.translate('KeyY'), ['KeyY'], 'a key that means nothing passes as itself');
  assert.deepEqual(M.translate('ArrowDown'), ['ArrowDown']); assert.deepEqual(M.translate('Digit5'), ['Digit5'], 'menus and weapon numbers are not this file\'s');
  assert.deepEqual(M.translate('AltRight'), ['AltLeft'], 'the right-hand twin of a key is the same key');
  assert.equal(M.bindKey('torch', 0, 'KeyX'), true);
  assert.deepEqual(M.translate('KeyX'), ['KeyF'], 'X is now the flashlight, which the director knows as F');
  assert.deepEqual(M.translate('KeyF'), [], 'and F, which was the flashlight, is nothing');
  assert.deepEqual(M.keys('aegis'), [], 'the key was taken from what had it');
  assert.equal(M.bindKey('torch', 0, 'Digit3'), false); assert.equal(M.bindKey('torch', 0, 'Escape'), false); assert.equal(M.bindKey('pistol', 0, 'KeyO'), false);
  assert.equal(M.bindKey('steady', 0, 'ShiftRight'), true); assert.deepEqual(M.keys('sprint'), ['ShiftLeft'], 'steadying only happens while aiming: it may share sprint\'s key');
  M.clearKey('torch', 0); assert.deepEqual(M.translate('KeyX'), [], 'X was the aegis by default: with nothing on it, it is nothing'); assert.deepEqual(M.translate('KeyF'), []);
  M.reset('key'); assert.deepEqual(M.translate('KeyF'), ['KeyF']); assert.deepEqual(M.keys('aegis'), ['KeyX']);
  // every code handed over is one a listener really tests for
  const heard = fs.readFileSync('src/gunslinger.js', 'utf8') + fs.readFileSync('src/vigil/director.js', 'utf8') + fs.readFileSync('src/vigil/map.js', 'utf8');
  for (const map of ['harbor', 'vigil']) for (const a of C.table(map)) if (a.code) assert.ok(heard.includes(`'${a.code}'`), `${map}/${a.id}: nothing listens for ${a.code}`);
});

test('the engine\'s key table is rewritten from the bindings and keeps what is not theirs', () => {
  const base = engineTable(), H = C.create({ map: 'harbor' });
  let t = H.engineKeys(base);
  assert.equal(t.KeyW, 'forward'); assert.equal(t.Space, 'jump'); assert.equal(t.ShiftLeft, 'sprint'); assert.equal(t.ShiftRight, 'sprint'); assert.equal(t.ControlRight, 'crouch');
  assert.equal(t.KeyF, 'melee'); assert.equal(t.KeyE, 'interact'); assert.equal(t.Enter, 'fire'); assert.equal(t.NumpadEnter, 'fire');
  assert.equal(t.Escape, 'pause'); assert.equal(t.KeyP, 'pause'); assert.equal(t.Digit1, 'weapon1'); assert.equal(t.ArrowLeft, 'turnL'); assert.equal(t.KeyJ, 'turnL');
  assert.equal(t.KeyI, undefined, 'I inspects: it no longer also turns the view');
  H.bindKey('jump', 0, 'KeyJ'); H.bindKey('ads', 0, 'Mouse4');
  t = H.engineKeys(base);
  assert.equal(t.KeyJ, 'jump'); assert.equal(t.Space, undefined); assert.equal(t.Mouse4, 'ads'); assert.equal(t.Escape, 'pause');
  // the Churchyard's table, as its map leaves it
  const vb = Object.assign({}, base); delete vb.KeyF; delete vb.Enter; delete vb.NumpadEnter; vb.KeyV = 'melee';
  const v = C.create({ map: 'vigil' }).engineKeys(vb);
  assert.equal(v.KeyV, 'melee'); assert.equal(v.KeyF, undefined); assert.equal(v.Enter, undefined);
  assert.equal(v.KeyE, undefined, 'E is the class ability there, not the harbor\'s relay'); assert.equal(v.KeyL, undefined, 'L is the laser, not a turn');
});

test('a controller button is an action; two together are another; the first of two acts when let go alone', () => {
  const M = C.create({ map: 'vigil' }), step = M.machine();
  let o = step(press(7), PLAY);
  assert.equal(o.engine.fire, true); assert.deepEqual(o.down, []);
  o = step(press(7, 5), PLAY);
  assert.equal(o.engine.fire, true); assert.deepEqual(o.down, ['KeyG'], 'RB throws a grenade, as G does');
  o = step(press(), PLAY);
  assert.equal(o.engine.fire, false); assert.deepEqual(o.up, ['KeyG']);
  // LB then X is the flare, and neither the ability (LB) nor a reload (X) happens
  o = step(press(4), PLAY); assert.deepEqual(o.down, [], 'LB waits to see what it is');
  o = step(press(4, 2), PLAY); assert.deepEqual(o.down, ['KeyT']); assert.ok(!o.engine.reload, 'nothing is reloaded on the Churchyard');
  o = step(press(4), PLAY); assert.deepEqual(o.up, ['KeyT']);
  o = step(press(), PLAY); assert.deepEqual(o.down, [], 'it was used with another: no ability');
  // LB alone, let go: the ability, for one frame
  step(press(4), PLAY); o = step(press(), PLAY); assert.deepEqual(o.down, ['KeyE']);
  o = step(press(), PLAY); assert.deepEqual(o.up, ['KeyE']);
  // a button with no combination of its own still works while LB is held
  step(press(4), PLAY); o = step(press(4, 7), PLAY); assert.equal(o.engine.fire, true); step(press(), PLAY); step(press(), PLAY);
  // X alone is the dash, and beside the ammunition pile it takes ammunition instead
  o = step(press(2), PLAY); assert.deepEqual(o.down, ['GsDash']); o = step(press(), PLAY); assert.deepEqual(o.up, ['GsDash']);
  o = step(press(2), Object.assign({}, PLAY, { prompt: true })); assert.deepEqual(o.down, ['GsUse']); step(press(), PLAY);
  // on the Harbor X reloads, so the dash is LB and X together; on the keyboard it is R here and X there
  { const H = C.create({ map: 'harbor' }), hs = H.machine(); let q = hs(press(2), PLAY); assert.deepEqual(q.down, []); assert.equal(q.engine.reload, true); hs(press(), PLAY);
    hs(press(4), PLAY); q = hs(press(4, 2), PLAY); assert.deepEqual(q.down, ['GsDash']); assert.equal(q.engine.reload, false); hs(press(), PLAY); hs(press(), PLAY);
    assert.deepEqual(H.keys('dash'), ['KeyX']); assert.deepEqual(M.keys('dash'), ['KeyR']); assert.deepEqual(M.translate('KeyR'), ['GsDash']); }
  assert.deepEqual(M.translate('KeyE'), ['KeyE', 'GsUse'], 'E is the ability and, at the pile, the hand that takes ammunition: the director tells them apart');
  // Menu pauses whatever else is so, and nothing else happens outside play
  o = step(press(9, 7), { play: false, aim: false, prompt: false, fwd: 0 });
  assert.equal(o.engine.pause, true); assert.equal(o.engine.fire, false);
  // held into a menu: let go there, and not still firing when play comes back
  step(press(), PLAY); o = step(press(7), PLAY); assert.equal(o.engine.fire, true);
  o = step(press(7), { play: false }); assert.equal(o.engine.fire, false);
});

test('one button, two jobs: a relay to cut or a magazine to change; sprinting or holding a breath', () => {
  const H = C.create({ map: 'harbor' }), step = H.machine();
  let o = step(press(2), PLAY); assert.equal(o.engine.reload, true); assert.equal(o.engine.interact, false);
  step(press(), PLAY);
  o = step(press(2), Object.assign({}, PLAY, { prompt: true })); assert.equal(o.engine.interact, true); assert.equal(o.engine.reload, false, 'at a relay, X cuts it and does not also reload');
  step(press(), PLAY);
  // the left stick's click: sprint, which holds itself until the stick eases
  o = step(press(10), Object.assign({}, PLAY, { fwd: 1 })); assert.equal(o.engine.sprint, true);
  o = step(press(), Object.assign({}, PLAY, { fwd: 1 })); assert.equal(o.engine.sprint, true, 'still sprinting after the click is let go');
  o = step(press(), Object.assign({}, PLAY, { fwd: 0.2 })); assert.equal(o.engine.sprint, false);
  // aiming, the same click steadies the aim instead (the game's listeners know that as Alt, held)
  o = step(press(10), Object.assign({}, PLAY, { aim: true, fwd: 1 })); assert.deepEqual(o.down, ['AltLeft']); assert.equal(o.engine.sprint, false);
  o = step(press(), Object.assign({}, PLAY, { aim: true })); assert.deepEqual(o.up, ['AltLeft']);
});

test('buttons are rebound, taken from what had them, and Menu is left alone', () => {
  const M = C.create({ map: 'vigil' });
  assert.equal(M.bindPad('medkit', '11'), true); assert.equal(M.pad('melee'), '', 'melee gave up the right stick click');
  assert.equal(M.bindPad('flare', '5+2'), true); assert.equal(M.pad('flare'), '5+2'); assert.equal(M.pad('grenade'), '5', 'a button may also begin a combination');
  assert.equal(M.bindPad('grenade', '9'), false); assert.equal(M.bindPad('grenade', '9+1'), false); assert.equal(M.bindPad('pause', '3'), false); assert.equal(M.bindPad('forward', '3'), false);
  const step = M.machine();
  step(press(5), PLAY); let o = step(press(5, 2), PLAY); assert.deepEqual(o.down, ['KeyT']);
  step(press(), PLAY); step(press(), PLAY);
  step(press(5), PLAY); o = step(press(), PLAY); assert.deepEqual(o.down, ['KeyG'], 'RB now begins a combination, so the grenade leaves the hand when it is let go');
  M.bindPad('flare', ''); assert.equal(M.pad('flare'), ''); assert.equal(C.parse(''), null); assert.equal(C.parse('x'), null); assert.deepEqual(C.parse('4+2'), { mod: 4, btn: 2 });
  o = step(press(4, 2), PLAY); assert.deepEqual(o.down, ['GsDash'], 'an action without a button is not on button nought: LB and X is X alone now, the dash');
  step(press(), PLAY); step(press(), PLAY);
  M.reset('pad'); assert.equal(M.pad('melee'), '11'); assert.equal(M.pad('flare'), '4+2');
});

test('only what was changed is saved, the shared actions once and the rest by map', () => {
  const H = C.create({ map: 'harbor' });
  assert.deepEqual(H.doc().all, { keys: {}, pad: {} });
  H.bindKey('jump', 0, 'KeyJ'); H.bindKey('gunsmith', 0, 'KeyG'); H.bindPad('jump', '5'); H.opt.sens = 1.4;
  const d = JSON.parse(JSON.stringify(H.doc()));
  assert.deepEqual(d.all.keys, { jump: ['KeyJ'] }); assert.deepEqual(d.harbor.keys, { gunsmith: ['KeyG', 'KeyH'] }); assert.equal(d.all.pad.jump, '5');
  assert.equal(d.harbor.pad.mode, '', 'what lost its button is saved as having none');
  // the Churchyard takes the shared part, not the Harbor's own, and keeps the Harbor's for when it is loaded again
  const V = C.create({ map: 'vigil' }); V.merge(d);
  assert.deepEqual(V.keys('jump'), ['KeyJ']); assert.deepEqual(V.keys('gunsmith'), ['Tab']); assert.equal(V.pad('jump'), '5'); assert.equal(V.opt.sens, 1.4);
  V.bindKey('armory', 0, 'KeyM');
  const d2 = JSON.parse(JSON.stringify(V.doc()));
  assert.deepEqual(d2.harbor.keys, { gunsmith: ['KeyG', 'KeyH'] }); assert.deepEqual(d2.vigil.keys, { armory: ['KeyM'] });
  // rubbish in the save does no harm
  const X = C.create({ map: 'vigil' });
  X.merge({ v: 1, all: { keys: { jump: ['Escape', 7, 'KeyK'], nothing: ['KeyQ'] }, pad: { fire: 'nonsense', pause: '3' } } });
  assert.deepEqual(X.keys('jump'), ['KeyK']); assert.equal(X.pad('fire'), ''); assert.equal(X.pad('pause'), '9');
  X.merge(null); X.merge('x');
});

test('the bundle carries what the controls and the warm-up lean on', () => {
  for (const [what, anchor] of [
    ['the key table and the action setter on g.input', 'uiPressed(ne){return h.has(ne)},bindings:fE,act:v,rumble:Y,'],
    ['padOwn: the engine maps no buttons itself', 'if(!m.padOwn){let Ge=D(ye.buttons[2]);'],
    ['the right stick\'s own sensitivity and inversion', '*m.assist*(m.padSens||m.sensitivity)*ne;m.look.dx+=Ue*ke,m.look.dy+=Ve*ke*.62*((m.padInvert??m.invertY)?-1:1),'],
    ['uiHold: the engine\'s menu navigation stands still', 'function X(){!r.uiPressed||r.uiHold||l.screen==="none"||('],
    ['the prompt names the bound key or button', 'n.input.device==="pad"?n.input.padGlyph||"X":n.input.keyGlyph||"E";'],
    ['freeCursor: letting the mouse go does not pause', '&&R&&!r.freeCursor&&le(),R=!1})'],
    ['render.hold: the resolution scaler stands still', 'if(Q.hold){S.acc=0,S.n=0,S.settle=Math.max(S.settle,1.5);return}'],
    ['the jump reads its height when it is made (player.tuning.jumpApex)', '(A.vel.y=Math.sqrt(2*Nt.gravity*Nt.jumpApex),a=0,r=0,'],
  ]) assert.equal(bundle.split(anchor).length - 1, 1, what);
});
