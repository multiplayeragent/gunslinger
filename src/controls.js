/* Controls: what every key and every controller button does on both maps, and the screen that changes them.

   The engine knows a dozen actions (move, jump, crouch, fire, aim, reload, swap, melee, pause) and maps keys to
   them in one table and controller buttons in another. Everything this game added (the gunsmith, the fire
   selector, dressings; the Churchyard's armory, ability, items, flashlight, waves) was read straight off key
   codes by its own listeners, so a controller could not reach any of it and nothing could be rebound.

   This file owns both. It keeps one list of actions for the map in play (`table`), each with its keys, its
   controller button and, for an action of this game's own, the key code the game's listeners still look for.
   - Keys of an engine action are written into the engine's own table (`g.input.bindings`, added to the bundle).
   - Keys of this game's actions are translated: the game's listeners subscribe here (`listen`) instead of to the
     window, and are handed the code they expect whatever key was pressed. A key that used to mean something and
     has been bound elsewhere is not passed on at all.
   - The controller is read here, every frame, after the engine has read its sticks. With `g.input.padOwn` set
     (bundle) the engine maps no buttons itself; engine actions are set through `g.input.act`, this game's are
     sent to the same listeners as a key would be. A binding is one button or two (`'4+2'`: hold LB, press X).
     A button that begins a combination does its own action when it is let go, if nothing was combined with it.
   - On a screen the engine does not know (the armory, the gunsmith, Operator, Leaderboards, Skills, the binding
     table itself) the D-pad or left stick moves a focus between what can be pressed, A presses it, B goes back
     and LB / RB change tab; `g.input.uiHold` (bundle) keeps the engine's own menu navigation still meanwhile.

   `create()` is the bindings alone (no DOM, no engine), which is what the tests run. Saved under
   `gunslinger.controls.v1`: only what differs from the defaults, the actions both maps share once, the rest by map. */
(function (root) {
  'use strict';
  const STORE = 'gunslinger.controls.v1';
  const XBOX = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', 'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Home'];
  const PLAY = ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', 'D-Up', 'D-Down', 'D-Left', 'D-Right', 'PS'];
  const ALIAS = { ShiftRight: 'ShiftLeft', ControlRight: 'ControlLeft', AltRight: 'AltLeft', NumpadEnter: 'Enter', MetaRight: 'MetaLeft' };
  const TWINS = { ShiftLeft: ['ShiftLeft', 'ShiftRight'], ControlLeft: ['ControlLeft', 'ControlRight'], AltLeft: ['AltLeft', 'AltRight'], Enter: ['Enter', 'NumpadEnter'] };
  const RESERVED = /^(Escape|Digit\d|Numpad\d|F\d+|MetaLeft|ContextMenu|PrintScreen|Mouse[123])$/;      // menus, weapon numbers, the browser, the mouse's own three
  const NAMES = { Space: 'Space', ShiftLeft: 'Shift', ControlLeft: 'Ctrl', AltLeft: 'Alt', Enter: 'Enter', Tab: 'Tab', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', CapsLock: 'Caps', Backspace: 'Bksp', Mouse4: 'Mouse 4', Mouse5: 'Mouse 5' };
  const norm = (code) => ALIAS[code] || code;
  const keyName = (code) => NAMES[code] || String(code || '').replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Num ');
  const parse = (combo) => { const p = String(combo == null ? '' : combo).split('+').filter((s) => /^\d+$/.test(s.trim())).map(Number); return !p.length ? null : p.length > 1 ? { mod: p[0], btn: p[1] } : { mod: -1, btn: p[0] }; };
  const padName = (combo, names) => { const c = parse(combo), n = names || XBOX; return !c ? '' : (c.mod >= 0 ? (n[c.mod] || 'B' + c.mod) + ' + ' : '') + (n[c.btn] || 'B' + c.btn); };

  // The actions of one map. engine: the engine's action; code: the key code this game's listeners look for;
  // keys / pad: the defaults; ctx: actions only take a key or button from others of the same ctx; when: the
  // action only answers while that is so (aiming; a prompt showing), and then has the button to itself;
  // own: the default differs between the maps, so a change is kept for this map alone.
  function table(map) {
    const vigil = map === 'vigil';
    const A = (id, label, group, o) => Object.assign({ id, label, group, keys: [], pad: '', ctx: 'play' }, o);
    const t = [
      A('forward', 'Move forward', 'Move', { engine: 'forward', keys: ['KeyW'], stick: 'Left stick' }),
      A('back', 'Move back', 'Move', { engine: 'back', keys: ['KeyS'], stick: 'Left stick' }),
      A('left', 'Move left', 'Move', { engine: 'left', keys: ['KeyA'], stick: 'Left stick' }),
      A('right', 'Move right', 'Move', { engine: 'right', keys: ['KeyD'], stick: 'Left stick' }),
      A('jump', 'Jump', 'Move', { engine: 'jump', keys: ['Space'], pad: '0' }),
      A('sprint', 'Sprint', 'Move', { engine: 'sprint', keys: ['ShiftLeft'], pad: '10', latch: true }),
      A('crouch', 'Crouch', 'Move', { engine: 'crouch', keys: ['KeyC', 'ControlLeft'], pad: '1' }),
      // a lunge: X where nothing is reloaded; on the Harbor X reloads, so LB and X together
      A('dash', 'Dash', 'Move', { code: 'GsDash', keys: [vigil ? 'KeyR' : 'KeyX'], pad: vigil ? '2' : '4+2', own: true }),
      A('fire', 'Fire', 'Fight', { engine: 'fire', keys: vigil ? [] : ['Enter'], pad: '7', also: 'Left button', own: true }),
      A('ads', 'Aim', 'Fight', { engine: 'ads', pad: '6', also: 'Right button' }),
      A('melee', 'Melee', 'Fight', { engine: 'melee', keys: [vigil ? 'KeyV' : 'KeyF'], pad: '11', also: 'Middle button', own: true }),
      A('steady', 'Steady aim (hold)', 'Fight', { code: 'AltLeft', keys: ['AltLeft'], pad: '10', ctx: 'aim', when: 'aim' }),
      A('swap', vigil ? 'Rifle / sidearm' : 'Last weapon', 'Weapons', { engine: 'swap', keys: ['KeyQ'], pad: '3' }),
      A('next', 'Next weapon', 'Weapons', { code: 'GsNextWeapon', pad: '15', also: 'Wheel' }),
      A('prev', 'Previous weapon', 'Weapons', { code: 'GsPrevWeapon', pad: '14', also: 'Wheel' }),
      A('gunsmith', 'Gunsmith', 'Weapons', { code: 'Tab', keys: vigil ? ['Tab'] : ['Tab', 'KeyH'], pad: vigil ? '4+8' : '8', own: true }),
      A('laser', vigil ? 'Laser' : 'Laser / light', 'Weapons', { code: vigil ? 'KeyL' : 'KeyT', keys: [vigil ? 'KeyL' : 'KeyT'], pad: vigil ? '4+14' : '12', own: true }),
      A('inspect', 'Inspect weapon', 'Weapons', { code: 'KeyI', keys: ['KeyI'], pad: vigil ? '4+13' : '4', own: true }),
    ];
    if (vigil) {
      t.push(
        A('pistol', 'Change pistol', 'Weapons', { code: 'Digit2', fixed: '2 (sidearm out)', pad: '4+15', own: true }),
        A('armory', 'Armory', 'Gear', { code: 'KeyB', keys: ['KeyB'], pad: '8', own: true }),
        A('ability', 'Class ability', 'Gear', { code: 'KeyE', keys: ['KeyE'], pad: '4', own: true }),
        A('grenade', 'Grenade', 'Gear', { code: 'KeyG', keys: ['KeyG'], pad: '5', own: true }),
        A('medkit', 'Medkit', 'Gear', { code: 'KeyH', keys: ['KeyH'], pad: '13', own: true }),
        A('torch', 'Flashlight', 'Gear', { code: 'KeyF', keys: ['KeyF'], pad: '12', own: true }),
        A('flare', 'Flare', 'Gear', { code: 'KeyT', keys: ['KeyT'], pad: '4+2', own: true }),
        A('mine', 'Mine', 'Gear', { code: 'KeyN', keys: ['KeyN'], pad: '4+3', own: true }),
        A('shockwave', 'Shockwave', 'Gear', { code: 'KeyZ', keys: ['KeyZ'], pad: '4+1', own: true }),
        A('aegis', 'Crystal Aegis', 'Gear', { code: 'KeyX', keys: ['KeyX'], pad: '4+0', own: true }),
        A('wave', 'Call the next wave', 'Gear', { code: 'Enter', keys: ['Enter'], pad: '4+12', own: true }),
        // (nothing is reloaded here: the reload button's place is taken by the pile's, which only answers beside it)
        A('use', 'Take ammunition (at the pile)', 'Gear', { code: 'GsUse', keys: ['KeyE'], pad: '2', ctx: 'use', when: 'prompt', own: true }),
      );
    } else {
      t.push(
        A('reload', 'Reload', 'Fight', { engine: 'reload', keys: ['KeyR'], pad: '2', own: true }),
        A('interact', 'Cut relay (hold)', 'Fight', { engine: 'interact', keys: ['KeyE'], pad: '2', ctx: 'use', when: 'prompt', own: true }),
        A('mode', 'Fire mode', 'Weapons', { code: 'KeyV', keys: ['KeyV'], pad: '5', own: true }),
        A('dress', 'Dress wound (hold)', 'Gear', { code: 'KeyB', keys: ['KeyB'], pad: '13', own: true }),
      );
    }
    t.push(A('pause', 'Pause', 'Game', { engine: 'pause', keys: ['KeyP'], also: 'Esc', pad: '9', padFixed: true }));
    return t;
  }

  function create(opts) {
    const map = (opts && opts.map) || 'harbor', actions = table(map), byId = {};
    for (const a of actions) byId[a.id] = a;
    let kept = { v: 1 };                                   // the saved document, the other map's part included
    const ov = { keys: {}, pad: {} };                       // what the player changed here, by action id
    const listeners = [];
    const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    const M = {
      map, actions, byId, rev: 0, opt: {},
      keys(id) { return (ov.keys[id] || byId[id].keys).slice(); },
      pad(id) { return ov.pad[id] != null ? ov.pad[id] : byId[id].pad; },
      on(fn) { listeners.push(fn); },
      changed() { M.rev++; for (const fn of listeners) { try { fn(M); } catch (e) { console.error(e); } } },
      // key `code` in slot 0 or 1 of an action; whatever else of the same ctx had it gives it up
      bindKey(id, slot, code) {
        const a = byId[id]; code = norm(code);
        if (!a || a.fixed || !code || RESERVED.test(code)) return false;
        for (const b of actions) if (b !== a && b.ctx === a.ctx && M.keys(b.id).includes(code)) ov.keys[b.id] = M.keys(b.id).filter((k) => k !== code);
        const list = M.keys(id).filter((k) => k !== code); list[Math.min(slot | 0, list.length)] = code;
        ov.keys[id] = list.slice(0, 2); M.changed(); return true;
      },
      clearKey(id, slot) { const list = M.keys(id); list.splice(slot | 0, 1); ov.keys[id] = list; M.changed(); },
      // a button ('5') or two ('4+2') for an action; '' leaves it without one
      bindPad(id, combo) {
        const a = byId[id], c = parse(combo);
        if (!a || a.padFixed || a.stick) return false;
        combo = c ? (c.mod >= 0 ? c.mod + '+' + c.btn : String(c.btn)) : '';
        if (c && (c.btn === 9 || c.mod === 9 || c.mod === c.btn)) return false;                      // Menu is pause, always
        if (combo) for (const b of actions) if (b !== a && b.ctx === a.ctx && !b.padFixed && M.pad(b.id) === combo) ov.pad[b.id] = '';
        ov.pad[id] = combo; M.changed(); return true;
      },
      reset(kind) { if (kind !== 'pad') ov.keys = {}; if (kind !== 'key') ov.pad = {}; M.changed(); },
      // the codes this game's listeners are to be told of when `code` is pressed
      translate(code) {
        const k = norm(code), out = [];
        for (const a of actions) if (!a.engine && !a.fixed && M.keys(a.id).includes(k)) out.push(a.code);
        if (out.length) return out;
        for (const a of actions) if (!a.engine && !a.fixed && (norm(a.code) === k || a.keys.includes(k))) return [];   // it meant something once: not any more
        return [code];
      },
      // the engine's key table: what it was (`base`), less every key now spoken for, plus the engine actions' keys
      engineKeys(base) {
        const out = {}, taken = new Set(), mine = new Set(actions.filter((a) => a.engine).map((a) => a.engine));
        for (const a of actions) for (const k of M.keys(a.id)) for (const t of TWINS[k] || [k]) taken.add(t);
        for (const code in base) if (!taken.has(code) && !(mine.has(base[code]) && code !== 'Escape')) out[code] = base[code];
        for (const a of actions) if (a.engine) for (const k of M.keys(a.id)) for (const t of TWINS[k] || [k]) out[t] = a.engine;
        return out;
      },
      label(id, device, names) {
        const a = byId[id]; if (!a) return '';
        if (device === 'pad') return a.stick || padName(M.pad(id), names);
        const k = M.keys(id)[0];
        return k ? keyName(k) : a.fixed ? a.fixed.split(' ')[0] : a.also || '';
      },
      doc() {
        const d = Object.assign({}, kept, { v: 1, all: { keys: {}, pad: {} }, opt: Object.assign({}, M.opt) });
        d[map] = { keys: {}, pad: {} };
        for (const a of actions) {
          const to = a.own ? d[map] : d.all;
          if (ov.keys[a.id] && !same(ov.keys[a.id], a.keys)) to.keys[a.id] = ov.keys[a.id];
          if (ov.pad[a.id] != null && ov.pad[a.id] !== a.pad) to.pad[a.id] = ov.pad[a.id];
        }
        return d;
      },
      merge(d) {
        if (!d || typeof d !== 'object') return;
        kept = d; ov.keys = {}; ov.pad = {};
        for (const part of [d.all, d[map]]) {
          if (!part) continue;
          for (const id in part.keys || {}) if (byId[id] && Array.isArray(part.keys[id])) ov.keys[id] = part.keys[id].map(norm).filter((k) => typeof k === 'string' && !RESERVED.test(k)).slice(0, 2);
          for (const id in part.pad || {}) if (byId[id] && !byId[id].padFixed) ov.pad[id] = parse(part.pad[id]) ? String(part.pad[id]) : '';
        }
        if (d.opt && typeof d.opt === 'object') M.opt = Object.assign({}, d.opt);
        M.changed();
      },
      // The controller, a frame at a time. b: which buttons are down; ctx: { play, aim, prompt, fwd }.
      // Returns { engine: { action: down }, down: [codes], up: [codes] }.
      machine() {
        const prev = [], claims = new Map(), used = new Set(), active = new Set(), taps = [];
        let latch = false;
        const pick = (list, ctx) => { const sure = list.filter((a) => a.when && ctx[a.when]); return sure.length ? sure : list.filter((a) => !a.when); };
        return function step(b, ctx) {
          const out = { engine: {}, down: [], up: [] }, combos = {}, mods = new Set();
          for (const a of actions) { const c = a.stick ? null : parse(M.pad(a.id)); combos[a.id] = c; if (c && c.mod >= 0) mods.add(c.mod); }
          const begin = (a) => { if (active.has(a.id)) return; active.add(a.id); if (!a.engine) out.down.push(a.code); if (a.latch) latch = true; };
          const end = (a) => { if (!active.delete(a.id)) return; if (!a.engine) out.up.push(a.code); };
          for (const a of taps.splice(0)) end(a);
          if (!ctx.play) {
            for (const id of [...active]) end(byId[id]);
            claims.clear(); used.clear(); latch = false;
          } else {
            const singles = (i) => actions.filter((a) => combos[a.id] && combos[a.id].mod < 0 && combos[a.id].btn === i && !a.padFixed);
            for (let i = 0; i < 17; i++) {
              const now = !!b[i], was = !!prev[i];
              if (now && !was) {
                let fired = false;
                for (const m of mods) {
                  if (m === i || !b[m]) continue;
                  const hits = pick(actions.filter((a) => combos[a.id] && combos[a.id].mod === m && combos[a.id].btn === i), ctx);
                  if (hits.length) { used.add(m); claims.set(i, hits); hits.forEach(begin); fired = true; }
                }
                if (fired) continue;
                if (mods.has(i)) used.delete(i);                                   // decided when it is let go
                else { const hits = pick(singles(i), ctx); claims.set(i, hits); hits.forEach(begin); }
              } else if (!now && was) {
                for (const a of claims.get(i) || []) end(a);
                claims.delete(i);
                if (mods.has(i)) { if (!used.has(i)) for (const a of pick(singles(i), ctx)) { begin(a); taps.push(a); } used.delete(i); }
              }
            }
          }
          for (let i = 0; i < 17; i++) prev[i] = !!b[i];
          for (const a of actions) if (a.engine && !a.stick) out.engine[a.engine] = out.engine[a.engine] || active.has(a.id);
          if (latch && !(ctx.play && ctx.fwd >= 0.55)) latch = false;              // sprint holds itself until the stick eases
          out.engine.sprint = latch;
          out.engine.pause = !!b[9];
          return out;
        };
      },
    };
    return M;
  }

  const C = {
    create, table, keyName, padName, parse, norm,
    model: null, rev: 0,
    label(id, device) { return this.model ? this.model.label(id, device || this.device(), this.names()) : ''; },
    device() { return this.g && this.g.input && this.g.input.device === 'pad' ? 'pad' : 'key'; },
    names() { return /054c|dualsense|dualshock|playstation/i.test((this.g && this.g.input && this.g.input.padName) || '') ? PLAY : XBOX; },
    onChange(fn) { (this.subs = this.subs || []).push(fn); },
    listen(type, fn) { ((this.taps = this.taps || {})[type] = this.taps[type] || []).push(fn); },

    install(g) {
      if (this.g || !g || !g.input || typeof window === 'undefined' || typeof document === 'undefined') return;
      const self = this, input = g.input, mapId = (window.GunslingerMapSelect && window.GunslingerMapSelect.id) || (window.GunslingerMap ? 'vigil' : 'harbor');
      const M = (this.model = create({ map: mapId }));
      this.g = g; this.taps = this.taps || {}; this.subs = this.subs || [];
      try { M.merge(JSON.parse(localStorage.getItem(STORE) || 'null')); } catch (e) { /* nothing saved, or no storage */ }
      const emit = (type, code, e) => {
        const ev = { code, key: e ? e.key : '', repeat: !!(e && e.repeat), target: e ? e.target : document.body, shiftKey: !!(e && e.shiftKey), pad: !e, preventDefault() { if (e) e.preventDefault(); }, stopPropagation() {}, stopImmediatePropagation() {} };
        for (const fn of self.taps[type] || []) { try { fn(ev); } catch (err) { console.error(err); } }
      };

      // ---- keys: the engine's table rewritten in place, this game's listeners told through `translate`
      const base = input.bindings ? Object.assign({}, input.bindings) : null;
      const apply = () => {
        if (base) { const want = M.engineKeys(base); for (const k in input.bindings) delete input.bindings[k]; Object.assign(input.bindings, want); }
        const use = M.byId.interact ? 'interact' : M.byId.use ? 'use' : '';
        input.padGlyph = use ? M.label(use, 'pad', self.names()) : undefined;
        input.keyGlyph = use ? M.label(use, 'key') : undefined;
        if (M.opt.sens > 0) input.padSens = M.opt.sens; else delete input.padSens;
        if (M.opt.invert != null) input.padInvert = !!M.opt.invert; else delete input.padInvert;
      };
      const save = () => { try { localStorage.setItem(STORE, JSON.stringify(M.doc())); } catch (e) { /* no storage */ } };
      M.on(() => { self.rev = M.rev; apply(); for (const fn of self.subs) { try { fn(); } catch (e) { console.error(e); } } });
      apply(); self.rev = M.rev;
      g.events.on('input:device', () => { self.rev = ++M.rev; apply(); for (const fn of self.subs) { try { fn(); } catch (e) { console.error(e); } } });

      let capture = null;                                   // { kind: 'key' | 'pad', id, slot, el, first, t }
      const typing = (e) => /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '') && e.target.type !== 'range';
      window.addEventListener('keydown', (e) => {
        if (!capture) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.code === 'Escape') endCapture();
        else if (e.code === 'Backspace' || e.code === 'Delete') { if (capture.kind === 'key') M.clearKey(capture.id, capture.slot); else M.bindPad(capture.id, ''); save(); endCapture(); }
        else if (capture.kind === 'key' && !e.repeat) { if (M.bindKey(capture.id, capture.slot, e.code)) { save(); endCapture(); } else flash('That key is kept for menus and weapon numbers'); }
      }, true);
      window.addEventListener('keydown', (e) => { if (typing(e)) return; for (const code of M.translate(e.code)) emit('keydown', code, e); });
      window.addEventListener('keyup', (e) => { for (const code of M.translate(e.code)) emit('keyup', code, e); });
      // the mouse's side buttons are keys like any other
      const side = (e, down) => {
        if (e.button < 3) return;
        const code = 'Mouse' + (e.button + 1);
        if (capture && capture.kind === 'key') { if (down) { e.preventDefault(); if (M.bindKey(capture.id, capture.slot, code)) { save(); endCapture(); } } return; }
        const act = input.bindings && input.bindings[code];
        if (act && input.act) input.act('key', act, down);
        for (const c of M.translate(code)) if (c !== code) emit(down ? 'keydown' : 'keyup', c, null);
      };
      window.addEventListener('mousedown', (e) => side(e, true), true);
      window.addEventListener('mouseup', (e) => side(e, false), true);

      // ---- the controller
      input.padOwn = !!input.act;
      const step = M.machine(), b = new Array(17).fill(false), nav = new Array(17).fill(false);
      let prompt = false, stickAt = 0, stickDir = '', marked = null, focused = null, quiet = 0;
      if (input.setPrompt) { const set = input.setPrompt.bind(input); input.setPrompt = (v) => { prompt = !!v; return set(v); }; }
      if (input.rumble) { const rumble = input.rumble.bind(input); input.rumble = (...a) => (M.opt.rumble === false ? undefined : rumble(...a)); }
      const pad = () => {
        let list = null; try { list = navigator.getGamepads(); } catch (e) { return null; }
        let any = null;
        for (let i = 0; list && i < list.length; i++) { const p = list[i]; if (!p || !p.connected || p.buttons.length < 10 || p.axes.length < 4) continue; if (p.mapping === 'standard') return p; any = any || p; }
        return any;
      };
      const axis = (v) => (Math.abs(v) < 0.14 ? 0 : v);

      // screens the engine's own menu navigation does not know
      const overlay = () => {
        const locker = document.querySelector('.gs-locker');
        if (locker && !locker.hidden) return { root: locker, back: () => window.GunslingerLocker && window.GunslingerLocker.close && window.GunslingerLocker.close() };
        if (document.body.classList.contains('vg-shop-open')) return { root: document.querySelector('.vg-shop'), tabs: '#vg-tabs button', back: () => window.Vigil && window.Vigil.director.closeShop() };
        const smith = document.getElementById('gs-armory');
        if (smith && !smith.hidden) return { root: smith, tabs: '.gsa-tab', back: () => g.arsenal && g.arsenal.toggleArmory(false) };
        const pane = document.querySelector('[data-pane="controls"]'), panel = pane && pane.closest('.panel');
        if (panel && !panel.hidden && !pane.hidden) return { root: panel, tabs: '.tabs .tab', back: () => { const x = panel.querySelector('[data-act="close-panel"]'); if (x) x.click(); } };
        return null;
      };
      const can = (rootEl) => [...rootEl.querySelectorAll('button, input, select')].filter((e) => !e.disabled && e.offsetParent !== null);
      const focus = (e) => {
        if (!e) return;
        if (focused && focused !== e) focused.classList.remove('gs-padfocus');
        focused = e; e.classList.add('gs-padfocus');
        try { e.focus({ preventScroll: true }); e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (err) { /* detached */ }
        g.events.emit('ui:hover', {});
      };
      const describe = (e) => { const d = Object.keys(e.dataset || {}).filter((k) => /^[a-z]+$/.test(k)).map((k) => `[data-${k}="${String(e.dataset[k]).replace(/"/g, '')}"]`).join(''); const r = e.getBoundingClientRect(); return { sel: d ? e.tagName.toLowerCase() + d : (e.id ? '#' + e.id : ''), x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
      const refind = (rootEl) => {
        const a = document.activeElement;
        if (a && a !== document.body && rootEl.contains(a) && a.offsetParent !== null) { if (a !== focused) focus(a); return a; }
        const list = can(rootEl); if (!list.length) return null;
        let e = null;
        if (marked && marked.sel) { try { e = [...rootEl.querySelectorAll(marked.sel)].find((q) => list.includes(q)) || null; } catch (err) { e = null; } }
        if (!e && marked) e = list.reduce((best, q) => { const r = q.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - marked.x, r.top + r.height / 2 - marked.y); return !best || d < best.d ? { q, d } : best; }, null).q;
        if (!e) e = list.find((q) => q.matches('.primary, .on, [aria-selected="true"]')) || list[0];
        focus(e); return e;
      };
      const move = (rootEl, dx, dy) => {
        const cur = refind(rootEl); if (!cur) return;
        if (cur.tagName === 'INPUT' && cur.type === 'range' && dx) { cur.value = String(Math.min(+cur.max, Math.max(+cur.min, +cur.value + dx * (+cur.step || 1) * 2))); cur.dispatchEvent(new Event('input', { bubbles: true })); return; }
        const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let best = null, score = Infinity;
        for (const e of can(rootEl)) {
          if (e === cur) continue;
          const q = e.getBoundingClientRect(), along = (q.left + q.width / 2 - cx) * dx + (q.top + q.height / 2 - cy) * dy;
          if (along < 6) continue;
          const lined = dx ? !(q.bottom <= r.top + 2 || q.top >= r.bottom - 2) : !(q.right <= r.left + 2 || q.left >= r.right - 2);
          const across = dx ? Math.abs(q.top + q.height / 2 - cy) : Math.abs(q.left + q.width / 2 - cx);
          const s = along + (lined ? 0 : 40 + across * 3);
          if (s < score) { score = s; best = e; }
        }
        if (best) { focus(best); marked = describe(best); }
      };
      const press = (rootEl) => { const e = refind(rootEl); if (!e) return; marked = describe(e); self.clicking = true; try { e.click(); } finally { self.clicking = false; } };
      const tab = (o, d) => {
        const list = o.tabs ? [...o.root.querySelectorAll(o.tabs)].filter((e) => e.offsetParent !== null && !e.disabled) : []; if (list.length < 2) return;
        const i = Math.max(0, list.findIndex((e) => e.matches('.on, [aria-selected="true"], [aria-pressed="true"]'))), e = list[(i + d + list.length) % list.length];
        marked = describe(e); e.click(); g.events.emit('ui:click', {});
      };

      const update = input.update.bind(input);
      input.update = (dt) => {
        const r = update(dt), p = pad();
        for (let i = 0; i < 17; i++) { const q = p && p.buttons[i]; b[i] = !!q && (q.pressed || q.value > 0.35); }
        const o = overlay(), now = performance.now();
        const hush = now < quiet;                           // just out of a screen: the button that closed it is still down
        input.uiHold = !!(o || capture || hush);
        if (capture && capture.kind === 'pad' && p) {
          const down = []; for (let i = 0; i < 17; i++) if (b[i]) down.push(i);
          if (b[9]) endCapture();
          else if (capture.first == null) { if (down.length && !capture.armed) { /* still held from the press that began it */ } else if (down.length) capture.first = down[0]; else capture.armed = true; }
          else if (down.length > 1) { const other = down.find((i) => i !== capture.first); M.bindPad(capture.id, capture.first + '+' + other); save(); endCapture(); }
          else if (!down.length) { M.bindPad(capture.id, String(capture.first)); save(); endCapture(); }
        } else if (o && o.root && p && !capture && !hush) {
          // a screen of this game's: the D-pad or stick moves the focus, A presses, B goes back, LB and RB change tab
          const x = axis(p.axes[0] || 0), y = axis(p.axes[1] || 0), dir = b[12] || y < -0.6 ? 'u' : b[13] || y > 0.6 ? 'd' : b[14] || x < -0.6 ? 'l' : b[15] || x > 0.6 ? 'r' : '';
          if (dir && (dir !== stickDir || now > stickAt)) { stickAt = now + (dir !== stickDir ? 380 : 150); move(o.root, dir === 'l' ? -1 : dir === 'r' ? 1 : 0, dir === 'u' ? -1 : dir === 'd' ? 1 : 0); }
          stickDir = dir;
          if (b[0] && !nav[0]) press(o.root);
          else if (b[1] && !nav[1]) { o.back(); quiet = now + 250; }
          else if (b[4] && !nav[4]) tab(o, -1);
          else if (b[5] && !nav[5]) tab(o, 1);
          else refind(o.root);
        } else if (!o && focused) { focused.classList.remove('gs-padfocus'); focused = null; marked = null; }
        for (let i = 0; i < 17; i++) nav[i] = b[i];
        if (!input.padOwn) return r;
        const play = !!p && !o && !capture && !hush && g.game.state === 'playing';
        const out = step(p ? b : [], { play, aim: !!input.ads || (g.player && g.player.ads > 0.5), prompt, fwd: p ? -axis(p.axes[1] || 0) : 0 });
        for (const name in out.engine) input.act('pad', name, out.engine[name]);
        for (const code of out.up) emit('keyup', code, null);
        for (const code of out.down) emit('keydown', code, null);
        return r;
      };

      // ---- the binding table, in the Settings panel's Controls tab
      const pane = document.querySelector('[data-pane="controls"]');
      let box = null, note = null;
      function flash(text) { if (note) { note.textContent = text; note.classList.add('warn'); setTimeout(() => draw(), 1600); } }
      function endCapture() { if (capture && capture.el) capture.el.classList.remove('wait'); capture = null; quiet = performance.now() + 300; draw(); }
      function draw() {
        if (!box) return;
        const names = self.names(), esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        let h = '<div class="gs-binds-head"><span></span><span>Keyboard · mouse</span><span>Controller</span></div>', group = '';
        const slot = (kind, a, i, text) => `<button type="button" class="gs-bind${text ? '' : ' none'}" data-bind="${kind}" data-id="${a.id}" data-slot="${i}" aria-label="${esc(a.label)}, ${kind === 'key' ? 'key ' + (i + 1) : 'controller'}">${esc(text || '—')}</button>`;
        for (const a of M.actions) {
          if (a.group !== group) { group = a.group; h += `<h3>${esc(group)}</h3>`; }
          const keys = M.keys(a.id);
          h += `<div class="gs-bind-row"><span class="n">${esc(a.label)}</span><span class="k">` +
            (a.fixed ? `<em>${esc(a.fixed)}</em>` : slot('key', a, 0, keys[0] && keyName(keys[0])) + slot('key', a, 1, keys[1] && keyName(keys[1])) + (a.also ? `<em>${esc(a.also)}</em>` : '')) + '</span><span class="p">' +
            (a.stick ? `<em>${esc(a.stick)}</em>` : a.padFixed ? `<em>${esc(padName(a.pad, names))}</em>` : slot('pad', a, 0, padName(M.pad(a.id), names))) + '</span></div>';
        }
        h += `<div class="gs-bind-row"><span class="n">Look</span><span class="k"><em>Mouse</em></span><span class="p"><em>Right stick</em></span></div>` +
          `<div class="gs-bind-row"><span class="n">Weapon by number</span><span class="k"><em>${mapId === 'vigil' ? '3 to 9, 0' : '1 to 6'}</em></span><span class="p"><em></em></span></div>`;
        box.innerHTML = h;
        if (note) { note.classList.remove('warn'); note.textContent = 'Choose a binding, then press the key or button for it. Esc cancels, Backspace clears it. For a combination, hold one controller button and press another: a button that starts a combination does its own job when you let it go.'; }
        const s = pane.querySelector('#gs-padsens'), so = pane.querySelector('[data-o="padsens"]'), val = M.opt.sens > 0 ? M.opt.sens : input.sensitivity || 1;
        if (s) { s.value = String(val); so.textContent = (+val).toFixed(2) + '×'; }
        for (const [key, on] of [['invert', M.opt.invert != null ? !!M.opt.invert : !!input.invertY], ['rumble', M.opt.rumble !== false]]) {
          const t = pane.querySelector(`[data-pad="${key}"]`); if (t) { t.setAttribute('aria-pressed', String(on)); t.querySelector('span').textContent = on ? 'On' : 'Off'; }
        }
      }
      if (pane) {
        // the engine's own lists of keys and buttons give way to the table; its notes on touch stay
        let touch = false;
        for (const e of [...pane.children]) { if (e.tagName === 'H3') touch = /Touch/.test(e.textContent); if (!touch) e.remove(); }
        box = document.createElement('div'); box.className = 'gs-binds';
        note = document.createElement('p'); note.className = 'panel-note gs-binds-note';
        const more = document.createElement('div'); more.className = 'gs-binds-more';
        more.innerHTML = '<div class="row"><label for="gs-padsens">Controller sensitivity</label><div class="slider"><input id="gs-padsens" type="range" min="0.3" max="3" step="0.05"><output data-o="padsens"></output></div></div>' +
          '<div class="row"><label id="l-padinv">Controller invert Y</label><button type="button" class="toggle" data-pad="invert" aria-labelledby="l-padinv" aria-pressed="false"><i></i><span>Off</span></button></div>' +
          '<div class="row"><label id="l-padrum">Vibration</label><button type="button" class="toggle" data-pad="rumble" aria-labelledby="l-padrum" aria-pressed="true"><i></i><span>On</span></button></div>' +
          '<div class="row"><label>Defaults</label><span class="gs-binds-reset"><button type="button" class="btn small" data-reset="key">Reset keyboard</button><button type="button" class="btn small" data-reset="pad">Reset controller</button></span></div>';
        pane.prepend(more); pane.prepend(box); pane.prepend(note);
        pane.addEventListener('click', (e) => {
          const bind = e.target.closest('.gs-bind'), reset = e.target.closest('[data-reset]'), tog = e.target.closest('[data-pad]');
          if (bind) {
            e.stopPropagation();
            if (capture) endCapture();
            capture = { kind: bind.dataset.bind, id: bind.dataset.id, slot: +bind.dataset.slot, el: bind, first: null, armed: false };
            bind.classList.add('wait'); bind.textContent = bind.dataset.bind === 'key' ? 'Press a key' : 'Press a button';
          } else if (reset) { M.reset(reset.dataset.reset); save(); draw(); }
          else if (tog) { const k = tog.dataset.pad; M.opt[k] = tog.getAttribute('aria-pressed') !== 'true'; M.changed(); save(); draw(); }
        });
        pane.addEventListener('input', (e) => { if (e.target.id === 'gs-padsens') { M.opt.sens = +e.target.value; M.changed(); save(); pane.querySelector('[data-o="padsens"]').textContent = (+e.target.value).toFixed(2) + '×'; } });
        M.on(() => { if (!capture) draw(); });
        g.events.on('input:pad', () => draw());
        draw();
      }
      this.draw = draw;
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  if (root) root.GunslingerControls = C;
})(typeof window !== 'undefined' ? window : null);
