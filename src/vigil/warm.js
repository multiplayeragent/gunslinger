/* Warming up: everything a night will show is shown once, on a loading screen, before the player can begin.

   The first time something appears the browser has work to do that it never has to do again: a soldier's body is
   built (a hired guard: half a second), a ragdoll and its loose limbs are cut, shaders are compiled for a kind
   of body, an explosion, a muzzle flash, a mark on a wall. Left to happen in play, each of those is a hitch at
   the moment something exciting happens. So the same things are done here, for real, a few metres in front of
   the title's camera: defenses are set down, one of each of the dead is raised and put down again, effects are
   let off, a stone and a plank are broken, every weapon is put in the hand, once under the open sky and once as
   if indoors. Then it is all cleared away and the night's state is reset.

   One thing a step, a step every few frames, and the screen (the boot screen's own mark and bar, carried on)
   names the thing being done and how far along it is.

   Shaders are the slow part, and the first time a machine meets them they are very slow: drawn straight away,
   a new body or weapon stopped the page for two to seven seconds while its shaders were compiled. So a step
   does not draw what it has just made. For the frame after it the renderer is `blind`: each draw the engine
   asks for (the world, the weapon by its own camera and lights, the church's reflections on it when indoors)
   is answered by asking for the shaders that draw would need (`compileAsync`: the browser compiles them on
   other threads) and drawing nothing. The request is made where the draw would have been, with the engine's
   render target bound and its lights and reflections as it set them, so the shaders asked for are exactly
   the ones the draw will use. Nothing is drawn until they are ready (the screen is covered anyway); then the
   thing is drawn for a few frames, which by then costs what any frame costs.

   Indoors matters most. The engine draws the weapon and the hands with the church's own reflections while the
   camera is inside the church, which is a different shader for every one of their materials; left to play, all
   of them were compiled the first time the player walked through the door (over four seconds on the machine
   this was measured on). `indoors(true)` makes the engine take the camera for inside wherever it is, for the
   frames the weapons are shown a second time.

   Three things it must not do, each of which it once did:
   - give up by the clock. Its limit counts only the frames it was given (a quarter of a second each at most),
     so a tab left in the background while the page loads comes back to a warm-up that carries on, not to one
     that ran out of time without doing anything, leaving every hitch for the first minutes of play;
   - cost the player their picture. The engine lowers its render scale, then its quality, when frames run long;
     these frames are long on purpose, so `render.hold` stops it counting them (an addition to the bundle);
   - be heard. The master bus is shut while it runs: a dozen deaths and two explosions are not a title screen.

   It runs once a page and only on the title (never in a scripted run that starts in play). A step that throws
   is logged and skipped: the warm-up must never be the reason the game does not start. `V.warm.report` says
   what was done and how long each step took; `V.warm.hitches` keeps the long frames of play since, with the
   number of shader programs at each, to find what was missed. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const NAMES = { walker: 'a walker', runner: 'a runner', spitter: 'a spitter', wolf: 'a wolf', burster: 'a burster', pyre: 'a pyre', brute: 'a brute', boss: 'the abomination', demon: 'a demon', skull: 'a demon head', bat: 'a bat', spider: 'a spider', greatspider: 'a great spider' };
  const LIMIT = 240000;                                  // of frames given, not of the clock: a slow machine starts anyway

  V.warm = {
    running: false, done: false, blind: false, report: [], hitches: [], step: '', part: 0,
    tick() {},
    // a long frame in play, kept for whoever is looking for what the warm-up missed
    note(dt, g) {
      if (!(dt > 0.2) || this.running || this.hitches.length >= 60) return;
      let programs = 0; try { programs = g.render.renderer.info.programs.length; } catch (e) { /* no renderer */ }
      this.hitches.push({ at: Math.round(performance.now()), ms: Math.round(dt * 1000), state: (g.game && g.game.state) || '', programs });
    },
    // o: { hide(v): hide the player from the dead; finish(): put the night's state back }
    start(g, o = {}) {
      if (this.running || this.done || !g || !g.THREE || typeof document === 'undefined') return false;
      const self = this, T = g.THREE, Z = g.enemies, cam = g.camera, w = g.weapon;
      const up = new T.Vector3(0, 1, 0), fwd = new T.Vector3();
      // a spot on the ground in front of the camera: d metres ahead, s metres to its right
      const ahead = (d, s = 0) => {
        cam.getWorldDirection(fwd);
        const l = Math.hypot(fwd.x, fwd.z) || 1, fx = fwd.x / l, fz = fwd.z / l, x = cam.position.x + fx * d - fz * s, z = cam.position.z + fz * d + fx * s;
        let y = 0; try { y = g.physics.groundHeight(x, z, cam.position.y + 2); } catch (e) { /* flat */ }
        return new T.Vector3(x, Number.isFinite(y) ? y : 0, z);
      };

      // ---- the loading screen: the boot screen's mark and bar, with what is being done under them
      const el = (cls, text) => { const e = document.createElement('div'); e.className = cls; if (text != null) e.textContent = text; return e; };
      const veil = el('gs-loading vg-warm'), line = el('boot-sub', 'Preparing the churchyard'), bar = el('boot-bar'), fill = document.createElement('i'), count = el('vg-warm-n', '');
      veil.setAttribute('role', 'status');
      if (veil.appendChild) { bar.appendChild(fill); veil.appendChild(el('boot-mark', 'GUNSLINGER')); veil.appendChild(line); veil.appendChild(bar); veil.appendChild(count); }
      (document.getElementById('app') || document.body).appendChild(veil);
      const show = (label, k) => {
        self.step = label; self.part = k;
        line.textContent = label;
        if (fill.style) fill.style.width = (k * 100).toFixed(1) + '%';
        count.textContent = Math.round(k * 100) + '%';
      };

      // ---- shaders, ahead of the frame that needs them: while `blind`, a draw is a request to compile
      const gl = g.render && g.render.renderer, draw = gl && gl.compileAsync && gl.render;
      let asked = null, first = false;                    // the requests of the blind frame under way, or null
      const isDrawn = (q) => q.isMesh || q.isPoints || q.isLine || q.isSprite;
      if (draw) {
        gl.render = function (scene, camera) {
          if (!self.blind) return draw.apply(this, arguments);
          if (!asked) return;                             // already asked for: waiting
          try {
            // what this draw would have drawn: what is visible and on the camera's layers
            const list = [];
            scene.traverseVisible((q) => { if (isDrawn(q) && q.layers.test(camera.layers)) list.push(q); });
            asked.push(gl.compileAsync({ traverse(fn) { for (const q of list) fn(q); }, traverseVisible() {} }, camera, scene));
          } catch (e) { if (!self.compileErr) { self.compileErr = String((e && e.message) || e); console.error('[vigil] warm-up, compiling ahead: ' + ((e && e.stack) || e)); } }
        };
      }

      // ---- the steps: [what the screen says, what is done, frames it is left on screen, whether it makes anything to draw]
      const steps = [];
      const add = (label, fn, frames, kind) => steps.push([label, fn, frames || 2, kind !== 'none']);
      const raised = [];
      add('Clearing the yard', () => { if (o.hide) o.hide(true); try { Z.clear(); } catch (e) { /* nothing to clear */ } }, 1, 'none');

      const D = V.defenses;
      if (D && D.netPlace) {
        for (const [kind, dx, label] of [['guard', 0, 'Posting a guard'], ['turret', 1.4, 'Setting up a turret'], ['floodlight', -1.4, 'Standing a floodlight']]) {
          add(label, () => { const p = ahead(7, 1.5); D.netPlace([kind, p.x + dx, p.y, p.z, 0], 'warm'); }, 3);
        }
      }
      if (D && D.flareAt) add('Lighting a flare', () => { const p = ahead(8, -1); D.flareAt(p.setY(p.y + 0.2), 0.6, true); });

      // one of each of the dead: raised in one step, put down in the next, in three different ways
      const dir = new T.Vector3(0, 0, -1);
      (Z.types || ['walker']).forEach((type, i) => {
        const name = NAMES[type] || type;
        let z = null;
        add('Raising ' + name, () => { const p = ahead(8 + (i % 3) * 1.6, -3 + (i % 5) * 1.5); z = Z.spawn(type, { x: p.x, z: p.z }, {}); if (z) raised.push(z); }, 3);
        add('Putting down ' + name, () => {
          if (!z || !z.alive) return;
          const at = new T.Vector3(z.pos.x, z.pos.y + 1.2, z.pos.z);
          if (i % 3 === 0) z.damage(1e6, at, dir, 'body', { by: 'warm', blast: { x: z.pos.x + 0.8, y: z.pos.y + 0.4, z: z.pos.z + 0.8, force: 9 } });
          else if (i % 3 === 1) z.damage(1e6, at, dir, 'weak', { by: 'warm' });
          else { z.damage(40, at, dir, 'armL.lo', { by: 'warm' }); z.damage(1e6, at, dir, 'body', { by: 'warm' }); }
        }, 3);
      });

      const fx = g.fx || {};
      const tryFx = (name, ...args) => { try { if (fx[name]) fx[name](...args); } catch (e) { self.report.push(['fx ' + name + ' threw', 0]); } };
      const spot = () => ahead(7).setY(1), far = () => ahead(9, 1).setY(1.2);
      add('An explosion', () => { const p = spot(); tryFx('explosion', p, 1.5); try { g.events.emit('explosion', { pos: p.clone(), size: 1.5 }); } catch (e) { /* listeners' own trouble */ } });
      add('Sparks, smoke and dust', () => { const p = spot(); tryFx('sparks', p, up, 12); tryFx('smoke', p, { size: 1, life: 1, count: 2 }); tryFx('dust', p, up, 1, 0.4, 0.4, 0.4); tryFx('debris', p, { color: [0.3, 0.3, 0.29], size: 0.04, speed: 4, count: 6, normal: up, spread: 1 }); });
      add('Tracers and muzzle flash', () => { const p = spot(), q = far(); tryFx('tracer', p, q); tryFx('tracer', p, q, { color: 16760944, speed: 260, width: 0.035 }); tryFx('muzzleFlash', p, up, { scale: 0.9 }); try { if (g.render.lightPool) g.render.lightPool.flash(p, 0xffc070, 60, 9, 0.06); } catch (e) { /* optional */ } });
      add('A mark on the ground', () => { try { g.events.emit('impact', { point: ahead(6).setY(0.02), normal: up.clone(), surface: 'concrete', dir: new T.Vector3(0, -1, 0), from: 'player', killed: false }); } catch (e) { /* optional */ } });
      if (V.fire && V.fire.burst) add('Fire', () => { const p = spot(), q = far(); V.fire.burst(p.x, p.y, p.z, 20, 6, 0.8); V.fire.ring(p.x, 0.1, p.z, 3, 16, 0.5, 0); V.fire.wreathe(q.x, 0, q.z, 0.6, 2, 3, 0.5); });
      // blood in the air and on the ground (blood.js): its two shaders, whatever the player has chosen
      if (V.blood && V.blood.burst) add('Blood', () => { const p = spot(); V.blood.forced = true; V.blood.burst(p, 1); V.blood.fill(3, p.x, p.z, 1.5, ahead(7).y); if (V.blood.update) V.blood.update(0.02); }, 3);        // (the night is not running: its drops are stepped here once, to be drawn)
      if (V.wisps && V.wisps.spawn) add('Lifeforce', () => { V.wisps.spawn(ahead(6, 1), 'brute', 1); });
      // a flak round and a rocket in the air (shells.js): made, drawn for a few frames, never burst
      if (V.shells && V.shells.fire) for (const kind of Object.keys(V.SHELLS || {})) add(kind === 'flak' ? 'A flak round' : 'A rocket', () => { V.shells.fire(ahead(5, kind === 'flak' ? -0.5 : 0.5).setY(1.4), fwd.clone().setY(0.4), { kind, damage: 0, from: 'warm' }); });
      if (V.storm && V.storm.strike) add('Lightning', () => { V.storm.strike({ near: true }); });

      const B = V.destruct;
      if (B && B.objects) for (const kind of ['stone', 'wood']) {
        add(kind === 'stone' ? 'Breaking a headstone' : 'Breaking a plank', () => {
          const p = ahead(9), q = B.objects.filter((x) => x.kind === kind && !x.raze && !x.rests && !x.hangs && x.state === 'whole').sort((a, b) => a.c.distanceTo(p) - b.c.distanceTo(p))[0];
          if (q) B.hit(q, q.c.clone(), new T.Vector3(0, 0, -1), 1e6, 0.6);
        }, 4);
      }

      // every weapon of the night, in the hand with its flash lit: under the sky, then as if inside the church
      const roster = [];
      for (const k of Object.values(V.KITS || {})) roster.push([k.weapon, k.name || k.weapon, 'rifle']);
      for (const s of Object.values(V.SIDEARMS || {})) roster.push([s.weapon, s.name || s.weapon, 'pistol']);
      // the engine asks whether the camera is in the level's first interior box: for a few frames, it is
      const room = g.level && g.level.interiorBoxes && g.level.interiorBoxes[0];
      let kept = null;
      const indoors = (on) => {
        if (!room || !room.min || !room.max || !room.min.set) return;
        if (on && !kept) { kept = [room.min.clone(), room.max.clone()]; room.min.set(-1e9, -1e9, -1e9); room.max.set(1e9, 1e9, 1e9); }
        else if (!on && kept) { room.min.copy(kept[0]); room.max.copy(kept[1]); kept = null; }
      };
      // (a weapon is only drawn if its rig is the one in hand: a night starts with the pistol, so the pistols matter most)
      const inHand = (id, hand) => () => {
        const a = g.arsenal;
        if (a && a.load) a.load(id);
        if (hand && w.equip && w.current !== hand) { try { w.equip(hand); } catch (e) { /* stub weapon */ } }
        const rig = w.rigs && w.rigs[w.current];
        if (rig && rig.flash) rig.flash.visible = true;
      };
      add('Drawing weapons', () => { try { w.setVisible(true); } catch (e) { /* stub weapon */ } }, 1);
      for (const [id, name, hand] of roster) add(name, inHand(id, hand));
      add('Walking into the church', () => { indoors(true); }, 1);
      for (const [id, name, hand] of roster) add(name + ', indoors', inHand(id, hand));
      add('Walking out again', () => { indoors(false); }, 1, 'none');

      add('Badges', () => { if (window.GunslingerAlerts && window.GunslingerAlerts.warm) window.GunslingerAlerts.warm(); }, 1, 'none');
      if (V.ui && V.ui.showTab) for (const [tab, name] of [['gear', 'gear'], ['abilities', 'abilities'], ['defenses', 'defenses'], ['skills', 'lifeforce'], ['guns', 'weapons']]) add('The armory: ' + name, () => { V.ui.showTab(tab); }, 1, 'none');
      // the engine makes its sounds a few milliseconds at a time from boot: wait for the last of them, so none is made in play
      let sounds = !(g.audio && g.audio.ready && g.audio.ready.then), waited = 0;
      if (!sounds) { g.audio.ready.then(() => { sounds = true; }, () => { sounds = true; }); add('Sounds', () => (sounds || ++waited > 1800 ? 1 : 'again'), 1, 'none'); }

      // everything the steps left behind; it also runs if the warm-up is cut short, so it must not assume a step ran
      const clearAway = () => {
        indoors(false);
        for (const rig of Object.values((w.rigs) || {})) if (rig.flash) rig.flash.visible = false;
        try { w.setVisible(false); } catch (e) { /* stub weapon */ }
        try { Z.clear(); } catch (e) { /* nothing to clear */ }
        if (V.loose) V.loose.clearBodies();
        if (V.defenses) V.defenses.reset();
        if (V.fire) V.fire.reset();
        if (V.blood) V.blood.reset();
        if (V.wisps) V.wisps.reset();
        if (V.shells && V.shells.reset) V.shells.reset();
        if (V.destruct) V.destruct.reset();
        try { if (g.fx && g.fx.clear) g.fx.clear(); } catch (e) { /* optional */ }
      };

      // ---- quiet, and out of the renderer's reckoning, while it runs
      const master = g.audio && g.audio.mix && g.audio.mix.master && g.audio.mix.master.gain, loud = master ? master.value : 1;
      if (master) master.value = 0;
      if (g.render) g.render.hold = true;

      let i = 0, wait = 1, spent = 0, last = performance.now(), pending = false, pendT = 0;
      const began = last;
      const finish = () => {
        self.running = false; self.done = true; self.blind = false; self.tick = () => {};
        if (draw) gl.render = draw;
        const t0 = performance.now();
        try { clearAway(); } catch (e) { console.error('[vigil] warm-up, clearing away: ' + ((e && e.stack) || e)); }
        self.report.push(['clearing away', Math.round(performance.now() - t0)]);
        if (o.finish) { try { o.finish(); } catch (e) { console.error('[vigil] warm-up: the state could not be put back: ' + ((e && e.stack) || e)); } }
        if (o.hide) o.hide(true);                       // the title keeps the warden out of the dead's sight
        if (g.render) g.render.hold = false;
        // the last of what was let off has a second to die away before anything can be heard again
        if (master) { if (typeof setTimeout === 'function') setTimeout(() => { master.value = loud; }, 1200); else master.value = loud; }
        veil.remove();
        self.ms = Math.round(performance.now() - began); self.spent = Math.round(spent);
        self.step = ''; self.part = 1;
      };
      this.running = true;
      show(steps[0][0], 0);
      // the first frame of all is blind too: whatever the title has not drawn yet is compiled the same way
      if (draw) { asked = []; first = true; pending = true; self.blind = true; }
      this.tick = () => {
        // only the frames it was given count toward its limit: a hidden tab gives none, and a long frame a quarter second
        const now = performance.now(), d = Math.min(250, Math.max(0, now - last)); spent += d; last = now;
        // the blind frame has been and gone: wait for what it asked for
        if (asked && first) { first = false; return; }      // (asked before any frame: let that frame come)
        if (asked) { const all = asked; asked = null; const go = () => { pending = false; self.blind = false; }; Promise.all(all).then(go, go); }
        // shaders for the last thing are still being compiled: nothing is drawn, and nothing new is made, until they are
        if (pending) { if ((pendT += d) < 20000) return; pending = false; self.blind = false; }
        if (--wait > 0) return;
        if (i >= steps.length || spent > LIMIT) { finish(); return; }
        const [label, fn, frames, drawn] = steps[i], t0 = performance.now();
        let r = null;
        try { r = fn(); } catch (e) { console.error('[vigil] warm-up, ' + label + ': ' + ((e && e.stack) || e)); }
        if (r === 'again') { wait = 1; return; }
        i++; wait = frames;
        // the frame that follows is blind: its draws ask for shaders, and the next tick waits for them
        if (draw && drawn) { asked = []; pending = true; pendT = 0; self.blind = true; }
        self.report.push([label, Math.round(performance.now() - t0)]);
        // the screen names the next thing before it is done: its cost falls in the frame it is done in, and that frame shows what was last written
        if (i < steps.length) show(steps[i][0], i / steps.length); else show('Ready', 1);
      };
      return true;
    },
  };
})();
