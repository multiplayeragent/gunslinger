// The sound levels beside the master volume: what each slider scales, what is remembered, and how a map that
// plays its own music takes the engine's score off its bus. Run against src/mixer.js with stand-in audio nodes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load(saved) {
  const store = new Map(saved ? [['gunslinger.audio.v1', JSON.stringify(saved)]] : []);
  const node = (v) => ({ gain: { value: v, setTargetAtTime(to) { this.value = to; } } });
  const buses = { world: node(1.25), near: node(1.24), gun: node(1), tail: node(1), amb: node(0.767), dry: node(1.3), music: node(0.73) };
  const window = {}, noop = () => {};
  const context = vm.createContext({
    window, console, setTimeout: noop, setInterval: () => 0, clearInterval: noop,
    document: { querySelector: () => null, getElementById: () => null, createElement: () => ({ setAttribute: noop, remove: noop, style: {} }), body: { appendChild: noop } },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
  });
  vm.runInContext(fs.readFileSync('src/mixer.js', 'utf8'), context);
  const g = { audio: { ctx: { currentTime: 0, state: 'running' }, buses }, game: { state: 'title' } };
  return { M: window.GunslingerMixer, g, buses, store };
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} against ${b}`);

test('sound effects and music each have a level of their own, kept between visits', () => {
  const { M, g, buses, store } = load();
  M.install(g);
  assert.equal(M.sfx, 1); assert.equal(M.music, 0.8); assert.equal(M.musicLevel, 0.8);
  near(buses.gun.gain.value, 1, 'effects start where the engine set them'); near(buses.music.gain.value, 0.73 * 0.8, 'the score starts at the music level');
  // the effects slider scales every effects bus from its own setting, and leaves the music alone
  M.set('sfx', 0.5);
  for (const [k, base] of [['world', 1.25], ['near', 1.24], ['gun', 1], ['tail', 1], ['amb', 0.767], ['dry', 1.3]]) near(buses[k].gain.value, base * 0.5, k);
  near(buses.music.gain.value, 0.73 * 0.8, 'music is not an effect');
  // the music slider scales only the music, and anything listening hears of it
  let told = null; M.onChange((m) => { told = m.musicLevel; });
  M.set('music', 0.25);
  near(buses.music.gain.value, 0.73 * 0.25, 'music'); near(buses.gun.gain.value, 0.5, 'effects are not music'); assert.equal(told, 0.25);
  // out of range is held to the ends, nonsense is silence
  M.set('sfx', 7); assert.equal(M.sfx, 1); M.set('sfx', -2); assert.equal(M.sfx, 0); M.set('sfx', 'loud'); assert.equal(M.sfx, 0); M.set('sfx', 0.6);
  // it is remembered
  assert.deepEqual(JSON.parse(store.get('gunslinger.audio.v1')), { sfx: 0.6, music: 0.25, muted: false });
  const again = load({ sfx: 0.6, music: 0.25, muted: false }); again.M.install(again.g);
  near(again.buses.gun.gain.value, 0.6, 'effects after a reload'); near(again.buses.music.gain.value, 0.73 * 0.25, 'music after a reload');
});

test('a mute and its return, a mute that is not kept between visits, and a map with its own music silencing the engine score', () => {
  const { M, g, buses } = load({ sfx: 1, music: 0.5, muted: false });
  M.install(g);
  assert.equal(M.toggleMusic(), 'off'); assert.equal(M.musicLevel, 0); near(buses.music.gain.value, 0, 'muted');
  assert.equal(M.toggleMusic(), '50%'); near(buses.music.gain.value, 0.73 * 0.5, 'back where the slider was'); assert.equal(M.music, 0.5);
  // moving the slider ends a mute; unmuting a slider left at nothing gives something to hear
  M.toggleMusic(); M.set('music', 0.3); assert.equal(M.muted, false); assert.equal(M.musicLevel, 0.3);
  M.set('music', 0); M.toggleMusic(); assert.equal(M.toggleMusic(), '80%');
  // a mute saved by an earlier version (the M key) does not keep the music off
  const stuck = load({ sfx: 1, music: 0.6, muted: true }); stuck.M.install(stuck.g);
  assert.equal(stuck.M.muted, false); assert.equal(stuck.M.musicLevel, 0.6); near(stuck.buses.music.gain.value, 0.73 * 0.6, 'heard again');
  // the churchyard plays its own: the engine's score goes quiet whatever the slider says, and the level is still reported
  M.engineScore(false);
  near(buses.music.gain.value, 0, 'the score is off its bus'); assert.equal(M.musicLevel, 0.8);
  M.set('music', 1); near(buses.music.gain.value, 0, 'and stays off'); assert.equal(M.musicLevel, 1);
  M.engineScore(true); near(buses.music.gain.value, 0.73, 'until it is given back');
  // with no sound at all (?noaudio=1) nothing is touched and nothing throws
  const silent = load(); silent.M.install({ audio: {}, game: { state: 'title' } }); silent.M.set('sfx', 0.2); assert.equal(silent.M.sfx, 0.2);
});

test('the engine bundle carries its sound additions: the mix nodes, and rain at half level on the title', () => {
  const bundle = fs.readFileSync('vendor/gunslinger-engine.js', 'utf8');
  assert.ok(bundle.includes('duck:k,buses:z,mix:{master:E,music:U},update:we,'), 'g.audio.mix');
  assert.ok(bundle.includes('update:we,ready:v,selfTest:Ae,titleRain:.5,'), 'g.audio.titleRain, the knob');
  assert.ok(bundle.includes('vi.rain.setGain(B*(1-.93*se)*.95*(de==="title"?_e.titleRain??.5:1)),vi.rainIn.setGain(B*se*.95*(de==="title"?_e.titleRain??.5:1)),'), 'both rain loops take it on the title only');
  assert.ok(bundle.includes('lightPool.flash(A,16756832,Y.flashLight,Y.flashReach||9,Y.flashHold||.05)'), 'the muzzle flash light takes a reach and a hold from the weapon');
});
