/* Gunslinger gameplay & modular gunsmith integration layer.
   Owns projectile combat integration, modular 6-weapon armory customization, tactical laser &
   illuminator, quick-melee, weapon inspect, endurance, breath, suppression, medical dressings,
   and tactical HUD. */
window.Gunslinger = {
  build: '2026.11.15-blood',
  // The shape of a burst. For the nth round since the trigger was last still (0 first): how hard it climbs, as a
  // share of the weapon's kick, and how far it walks aside, in degrees. An automatic climbs hard for three rounds,
  // walks one way to the tenth, back the other to the eighteenth, then sways; a weapon fired a round at a time
  // kicks the same each time and steps left and right in a fixed order of six.
  spray(auto, n) {
    if (!auto) return [1, [0.22, -0.16, 0.3, -0.26, 0.12, -0.3][((n % 6) + 6) % 6]];
    if (n < 3) return [1.15, 0.06 * n];
    if (n < 10) return [1, 0.24];
    if (n < 18) return [1.3, -0.3];
    return [1.3, Math.floor((n - 18) / 6) % 2 ? -0.26 : 0.26];
  },

  install(g) {
    'use strict';
    const T = g.THREE, p = g.player, w = g.weapon;
    if (p && !p.tuning) p.tuning = {};
    // Showcase modes (?show=weapon|enemies|...) use lightweight stubs: install visuals only.
    if (g.game?.state === 'showcase') {
      window.GunslingerVisuals?.install(g);
      return;
    }
    if (!p || !w || !g.combat) return;

    const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
    const state = {
      stamina: 1, suppression: 0, breath: 1, bandages: 2, bandaging: 0,
      held: false, semi: false, elapsed: 0, projectiles: 0,
      exhausted: false, breathSpent: false, drawn: 0, scoped: false,
      armoryOpen: false, armoryRow: 0, laserOn: true, lightOn: false, meleeCooldown: 0
    };
    g.realism = state;

    const keys = new Set();
    // Keys and controller buttons reach this file through src/controls.js, which hands over the code each handler
    // below looks for whatever was really pressed. Without it (the test harnesses) the window's own events do.
    const controls = window.GunslingerControls;
    controls?.install?.(g);
    const listen = (type, fn) => (controls?.model ? controls.listen(type, fn) : window.addEventListener(type, fn));
    const vec = v => new T.Vector3(v.x, v.y, v.z);
    const uiRoot = document.getElementById('ui');

    const hud = document.createElement('div'); hud.id = 'realism-hud'; hud.hidden = true;
    hud.innerHTML = `<div class="gs-status"><div><label>ENDURANCE</label><meter id="gs-stamina" min="0" max="1" value="1"></meter></div><div><label>BREATH</label><meter id="gs-breath" min="0" max="1" value="1"></meter></div><span id="gs-condition">STABLE</span></div>
      <div class="gs-readiness"><span id="gs-weapon">KR-7 CARBINE</span><span id="gs-mods">HX-2 HOLO</span><span id="gs-mode">AUTO</span><span id="gs-ammo">30 / 150</span><span id="gs-dressings">2 DRESSINGS</span></div>
      <div id="gs-action" role="status"></div>
      <div class="gs-hint" id="gs-hint">1–6 · WEAPONS &nbsp; TAB · GUNSMITH &nbsp; V · MODE &nbsp; T · LASER/LIGHT &nbsp; I · INSPECT &nbsp; F · MELEE &nbsp; ALT · STEADY &nbsp; HOLD B · DRESSING</div>`;
    uiRoot.append(hud);
    const $ = id => document.getElementById(id);

    const suppression = document.createElement('div'); suppression.id = 'gs-suppression'; uiRoot.append(suppression);
    const cross = document.createElement('div'); cross.id = 'gs-cross'; cross.innerHTML = '<i></i><i></i><i></i><i></i><b></b>'; uiRoot.append(cross);
    const hitMark = document.createElement('div'); hitMark.id = 'gs-hit'; hitMark.innerHTML = '<i></i><i></i><i></i><i></i>'; uiRoot.append(hitMark);
    const scope = document.createElement('div'); scope.id = 'gs-scope'; scope.innerHTML = '<div class="gs-reticle"><i></i><b></b></div><div class="gs-scope-meta"><span id="gs-scope-zoom">4.5× FFP</span><span id="gs-scope-cal">6.5 CREEDMOOR</span></div>'; uiRoot.append(scope);
    const loadout = document.createElement('div'); loadout.id = 'gs-loadout'; uiRoot.append(loadout);
    // The weapon in hand, drawn large enough to know at a glance: its silhouette (assets/ui/weapons.webp, one cell a
    // weapon in this order; tools/hud-icons/build.mjs makes it), its name, the rounds left and how full that is.
    const GUN_ICONS = ['carbine', 'pdw', 'breacher', 'marksman', 'support', 'pump', 'flak', 'rocket', 'sidearm', 'heavy'];
    const gun = document.createElement('div'); gun.id = 'gs-gun'; gun.hidden = true;
    gun.innerHTML = '<div class="gs-gun-name" id="gs-gun-name"></div><div class="gs-gun-body"><i class="gs-gun-icon" id="gs-gun-icon"></i><div class="gs-gun-count"><b id="gs-gun-n">0</b><span id="gs-gun-of"></span><div class="gs-gun-bar"><i id="gs-gun-fill"></i></div></div></div>';
    uiRoot.append(gun);
    try { if (typeof Image !== 'undefined') { const im = new Image(); im.src = 'assets/ui/weapons.webp'; } } catch (e) { /* no images here */ }
    let gunKey = '';
    const armoryEl = document.createElement('div'); armoryEl.id = 'gs-armory'; armoryEl.hidden = true; uiRoot.append(armoryEl);

    let shownKey = '', switched = 0, hitFlash = 0, scopeKick = 0, cueEl = null;
    const stats = g.combat.stats;

    // Modular Arsenal: six weapons sharing the engine's two animated rigs with live CAD parts.
    // A map may opt out of the arsenal (arsenal: false), or run it under its own rules (arsenal: {...}):
    //   roster       weapon ids it uses, extras included (default: the harbor's six)
    //   numberKeys   false when the map owns the digit keys and selects weapons itself
    //   gunsmithKeys keys that open the gunsmith (default Tab and H)
    //   laserKey     the laser key (default T); weaponLight: false drops the weapon SpotLight
    //   slots        gunsmith rows offered (a map that owns damage leaves out ammoType)
    //   keepOnReset  the map restores its own loadout, ammunition and attachments
    //   swapRigs     Q always crosses between rifle and sidearm instead of returning to the last weapon
    // and through `g`, set by the map's director: arsenalOwns(id) limits selection to what the player
    // has; arsenalLeave(cfg, rig) / arsenalEnter(cfg, rig) bracket every change of weapon on a rig.
    const plan = typeof window.GunslingerMap?.arsenal === 'object' ? window.GunslingerMap.arsenal : null;
    const arsenal = window.GunslingerMap?.arsenal === false ? null : window.GunslingerArsenal, rigs = w.rigs;
    const armed = !!(arsenal && rigs?.rifle?.root && rigs?.pistol?.root && rigs.rifle.slot && rigs.pistol.slot && w.equip && w.switchTo);
    const armory = { active: {}, configs: {}, mods: {}, ammo: {}, base: {}, parts: {}, tints: {}, optics: {}, finished: null, previous: null };
    const roster = armed ? (plan?.roster || arsenal.weapons.map(item => item.id)).map(id => arsenal.byId(id)).filter(Boolean) : [];
    const slotOrder = armed ? arsenal.slotOrder.filter(slot => !plan?.slots || plan.slots.includes(slot.key)) : [];
    const numberKeys = plan?.numberKeys !== false;
    const gunsmithKeys = plan?.gunsmithKeys || ['Tab', 'KeyH'];
    const laserKey = plan?.laserKey || 'KeyT';
    const weaponLight = plan?.weaponLight !== false;
    const keyName = code => code.replace(/^Key|^Digit/, '').toUpperCase();
    const owns = weapon => !!weapon && (!g.arsenalOwns || g.arsenalOwns(weapon.id));
    const choices = () => roster.filter(owns);

    const held = () => armory.active[w.current];

    // Tactical 3D laser beam + impact dot + high-CRI weapon SpotLight
    let tacLaser = null, tacDot = null, tacLight = null;
    if (armed && g.scene && T?.BufferGeometry && T?.Line) {
      const lGeo = new T.BufferGeometry();
      lGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
      const lMat = new T.LineBasicMaterial({ color: 0x3dff86, transparent: true, opacity: .62, blending: T.AdditiveBlending, depthWrite: false });
      tacLaser = new T.Line(lGeo, lMat);
      tacLaser.frustumCulled = false;
      tacLaser.visible = false;
      tacLaser.renderOrder = 16;
      g.scene.add(tacLaser);

      const dMat = new T.MeshBasicMaterial({ color: 0x7effad, transparent: true, opacity: .95, blending: T.AdditiveBlending, depthTest: false, depthWrite: false });
      tacDot = new T.Mesh(new T.SphereGeometry(.016, 8, 8), dMat);
      tacDot.frustumCulled = false;
      tacDot.visible = false;
      tacDot.renderOrder = 25;
      g.scene.add(tacDot);

      // Every light in the scene costs every shader; a map with its own flashlight goes without this one.
      if (weaponLight && T.SpotLight) {
        tacLight = new T.SpotLight(0xf4f7ff, 0, 38, .44, .52, 1.5);
        tacLight.castShadow = false;
        tacLight.layers.enable(1);
        tacLight.visible = false;
        g.scene.add(tacLight, tacLight.target);
      }
    }

    const rebuildWeapon = weaponId => {
      const weapon = arsenal.byId(weaponId);
      if (!weapon) return null;
      const rig = rigs[weapon.rig], base = armory.base[weapon.rig];
      const cfg = arsenal.compose(weapon, armory.mods[weapon.id], base.def);
      armory.configs[weapon.id] = cfg;
      if (armory.parts[weapon.id]) armory.parts[weapon.id].dispose();
      armory.parts[weapon.id] = arsenal.buildParts(T, rig, cfg, name => armory.tints[weapon.rig][name]?.material);
      return cfg;
    };

    const applyWeapon = cfg => {
      if (!cfg) return;
      const rig = rigs[cfg.rig], base = armory.base[cfg.rig], previous = armory.active[cfg.rig];
      if (previous) {
        g.arsenalLeave?.(previous, rig);
        armory.ammo[previous.id] = { ammo: rig.slot.ammo, reserve: rig.slot.reserve };
        armory.parts[previous.id]?.setVisible(false);
      }
      Object.assign(rig.def, base.def, cfg.def, { spread: { ...base.def.spread, ...cfg.def.spread } });
      rig.slot.magSize = rig.def.magSize;
      rig.slot.name = cfg.name;
      const stored = armory.ammo[cfg.id];
      if (stored) {
        rig.slot.ammo = Math.min(stored.ammo, rig.def.magSize);
        rig.slot.reserve = stored.reserve;
      } else {
        rig.slot.ammo = rig.def.magSize;
        rig.slot.reserve = rig.def.reserve;
      }
      const parts = armory.parts[cfg.id], shift = parts ? parts.muzzleShift : 0;
      parts?.setVisible(true);
      const off = parts?.muzzleAt || [0, 0];
      rig.muzzle[0] = base.muzzle[0] + off[0]; rig.muzzle[1] = base.muzzle[1] + off[1]; rig.muzzle[2] = base.muzzle[2] - shift;
      if (rig.flash && base.flashZ != null) rig.flash.position.set(base.flashX + off[0], base.flashY + off[1], base.flashZ - shift);
      armory.optics[cfg.rig]?.set(!!cfg.stripHolo);
      armory.active[cfg.rig] = cfg;
      armory.finished = null;
      g.arsenalEnter?.(cfg, rig);
    };

    const applyFinish = cfg => {
      const done = new Set();
      for (const tints of Object.values(armory.tints)) {
        for (const [name, entry] of Object.entries(tints)) {
          if (done.has(entry.material)) continue;
          done.add(entry.material);
          const tone = cfg.finish?.[name];
          if (tone) entry.material.color.setRGB(tone[0], tone[1], tone[2]);
          else entry.material.color.copy(entry.base);
        }
      }
      armory.finished = cfg;
    };

    /* Track full-screen magnified optic state without calling w.setVisible(false):
       inside the bundled weapon controller (I5), setVisible(false) disables its internal
       active flag `g`, which gates `ye = !!re.fire && g && !l.noFire` and blocks firing.
       Instead, hide only the 1P viewmodel groups around renderFrame(dt) when state.scoped. */
    const setScoped = (scoped, prism = false) => {
      state.scoped = Boolean(scoped && !prism);
    };

    const selectWeapon = weaponOrId => {
      const baseWeapon = typeof weaponOrId === 'string' ? arsenal.byId(weaponOrId) : (weaponOrId?.base || weaponOrId);
      if (!armed || !owns(baseWeapon) || g.game.state !== 'playing' || !p.enabled || !p.alive || state.bandaging > 0) return false;
      const cfg = armory.configs[baseWeapon.id] || rebuildWeapon(baseWeapon.id);
      const loaded = armory.active[cfg.rig]?.id === cfg.id;
      const leaving = held();
      if (leaving?.id === cfg.id && !w.pending) return false;
      if (leaving && leaving.id !== cfg.id) armory.previous = leaving.id;

      if (w.current === cfg.rig) {
        if (loaded) return w.switchTo(cfg.rig);
        applyWeapon(cfg);
        w.equip(cfg.rig);
        state.drawn = .28;
        // Physical draw dip impulse on the rig's spring bank so same-platform swaps animate smoothly.
        const S = w.debug?.S;
        if (S) {
          if (S.jY) S.jY.x = -.045;
          if (S.jP) S.jP.x = -.18;
          if (S.jR) S.jR.x = .14;
        }
        g.audio?.play?.('weapon_draw', { gain: .75, jitter: .02 });
      } else {
        if (!loaded) applyWeapon(cfg);
        w.switchTo(cfg.rig);
      }
      if (state.armoryOpen) renderArmory();
      return true;
    };

    const configureWeapon = (weaponId, patch = {}) => {
      if (!armed) return null;
      const weapon = arsenal.byId(weaponId);
      if (!weapon) return null;
      const currentMods = { ...weapon.defaults, ...(armory.mods[weapon.id] || {}) };
      let changed = false;
      for (const [slotKey, val] of Object.entries(patch)) {
        const valid = arsenal.optionsFor(weapon, slotKey);
        if (valid.some(o => o.id === val) && currentMods[slotKey] !== val) {
          currentMods[slotKey] = val;
          changed = true;
        }
      }
      armory.mods[weapon.id] = currentMods;
      const prevCfg = armory.configs[weapon.id];
      if (armory.active[weapon.rig]?.id === weapon.id) {
        g.arsenalLeave?.(armory.active[weapon.rig], rigs[weapon.rig]);
        armory.ammo[weapon.id] = { ammo: rigs[weapon.rig].slot.ammo, reserve: rigs[weapon.rig].slot.reserve };
      }
      const nextCfg = rebuildWeapon(weapon.id);
      // Adjust loaded ammo proportionally when changing magazine capacity
      const saved = armory.ammo[weapon.id];
      if (saved && prevCfg && prevCfg.def.magSize !== nextCfg.def.magSize) {
        const full = saved.ammo >= prevCfg.def.magSize;
        saved.ammo = full ? nextCfg.def.magSize : Math.min(saved.ammo, nextCfg.def.magSize);
        saved.reserve = nextCfg.def.reserve;
      }
      if (armory.active[weapon.rig]?.id === weapon.id) {
        armory.active[weapon.rig] = null;
        applyWeapon(nextCfg);
        applyFinish(nextCfg);
        if (w.current === weapon.rig && changed) {
          const S = w.debug?.S;
          if (S?.bump) S.bump.v -= .14;
          if (S?.jR) S.jR.v += .9;
        }
      }
      if (changed) {
        g.audio?.play?.('gs_attach', { gain: .85 });
        applyTuning();
        shownKey = '';
        switched = 3.5;
      }
      if (state.armoryOpen) renderArmory();
      return nextCfg;
    };

    const renderArmory = () => {
      if (!armed || !armoryEl) return;
      const cur = held();
      if (!cur) return;
      const tabs = choices().map(wp =>
        `<button type="button" class="gsa-tab ${wp.id === cur.id ? 'on' : ''}" data-wp="${wp.id}">${numberKeys ? `<kbd>${wp.slot}</kbd>` : ''}<span>${wp.short}</span><small>${wp.caliber}</small></button>`
      ).join('');

      const rows = slotOrder.map((slot, rIdx) => {
        const opts = arsenal.optionsFor(cur.base, slot.key);
        const activeId = cur.mods[slot.key];
        const activeOpt = opts.find(o => o.id === activeId) || opts[0];
        const pills = opts.map(o =>
          `<button type="button" class="gsa-pill ${o.id === activeId ? 'on' : ''}" data-slot="${slot.key}" data-val="${o.id}">${o.label}</button>`
        ).join('');
        return `<div class="gsa-row ${rIdx === state.armoryRow ? 'focus' : ''}">
          <div class="gsa-row-h"><span>${slot.label}</span><small>${activeOpt?.desc || ''}</small></div>
          <div class="gsa-pills">${pills}</div>
        </div>`;
      }).join('');

      // The held weapon's live numbers: a map that owns damage and range has written its own onto the rig.
      const live = rigs[cur.rig]?.def || cur.def;
      const totalDmg = live.damage * (cur.pellets || 1);
      const bars = [
        ['TERMINAL EFFECT', clamp(totalDmg / 110), `${Math.round(totalDmg)}${cur.pellets > 1 ? ` (${cur.pellets}×)` : ''}`],
        ['MUZZLE VELOCITY', clamp(cur.speed / 1050), `${cur.speed} m/s${cur.subsonic ? ' · SUB' : ''}`],
        ['EFFECTIVE RANGE', clamp(live.range / 750), `${live.range} m`],
        ['RECOIL CONTROL', clamp(1 - (cur.recoil - .4) / 2.2), `${Math.round((1 / Math.max(.4, cur.recoil)) * 100)}%`],
        ['HANDLING / ADS', clamp(1 - (cur.def.adsTime - .09) / .28), `${Math.round(cur.def.adsTime * 1000)} ms`],
        ['SOUND STEALTH', clamp(1 - cur.def.hearRadius / 60), `${cur.def.hearRadius} m ALERT`]
      ].map(([label, val, text]) =>
        `<div class="gsa-stat"><label>${label}</label><b>${text}</b><i><em style="width:${(val * 100).toFixed(0)}%"></em></i></div>`
      ).join('');

      armoryEl.innerHTML = `<div class="gsa-card">
        <div class="gsa-head">
          <div><div class="gsa-k">MODULAR FIELD ARMORY // LIVE CAD WORKBENCH</div><h2>${cur.name} <span>${cur.caliber}</span></h2></div>
          <div class="gsa-head-actions">
            <button type="button" class="gsa-btn" data-act="reset-wp">FACTORY</button>
            <button type="button" class="gsa-btn close" data-act="close-armory">DONE [${keyName(gunsmithKeys[0])}]</button>
          </div>
        </div>
        <div class="gsa-tabs">${tabs}</div>
        <div class="gsa-rows">${rows}</div>
        <div class="gsa-stats">${bars}</div>
        <div class="gsa-foot">CLICK OR ↑↓ / ←→ TO CONFIGURE · ${numberKeys ? '1–6 SWITCH PLATFORM' : 'TABS SWITCH WEAPON'} · ${keyName(laserKey)} TOGGLE LASER${weaponLight ? '/LIGHT' : ''} · ${keyName(gunsmithKeys[0])} RETURN TO COMBAT</div>
      </div>`;
    };

    const toggleArmory = force => {
      if (!armed) return false;
      const next = typeof force === 'boolean' ? force : !state.armoryOpen;
      if (next && (g.game.state !== 'playing' || !p.enabled || !p.alive)) return false;
      state.armoryOpen = next;
      armoryEl.hidden = !next;
      if (next) {
        setScoped(false);
        renderArmory();
        // the engine pauses when the mouse is let go in play; the gunsmith lets it go on purpose and the fight goes on
        if (g.input) g.input.freeCursor = true;
        document.exitPointerLock?.();
        g.audio?.play?.('gear_rustle', { gain: .55 });
      } else {
        if (g.input) g.input.freeCursor = false;
        if (g.game.state === 'playing' && !g.input?.touch && g.input?.device !== 'pad') g.input?.requestLock?.();
      }
      return state.armoryOpen;
    };

    armoryEl.addEventListener?.('click', e => {
      const btn = e.target?.closest?.('button');
      if (!btn) return;
      if (btn.dataset.wp) {
        selectWeapon(btn.dataset.wp);
        renderArmory();
      } else if (btn.dataset.slot && btn.dataset.val) {
        const cur = held();
        if (cur) configureWeapon(cur.id, { [btn.dataset.slot]: btn.dataset.val });
      } else if (btn.dataset.act === 'reset-wp') {
        const cur = held();
        if (cur) configureWeapon(cur.id, { ...cur.base.defaults });
      } else if (btn.dataset.act === 'close-armory') {
        toggleArmory(false);
      }
    });

    if (armed) {
      arsenal.installAudio(g);
      for (const id of ['rifle', 'pistol']) {
        const rig = rigs[id], tints = {};
        armory.base[id] = { def: { ...rig.def, spread: { ...rig.def.spread } }, muzzle: [...rig.muzzle], flashX: rig.flash?.position?.x || 0, flashY: rig.flash?.position?.y || 0, flashZ: rig.flash?.position?.z };
        rig.muzzle = [...rig.muzzle];
        rig.root.traverse(node => {
          for (const material of [].concat(node.material || [])) {
            if (material.name && material.color && !tints[material.name]) {
              tints[material.name] = { material, base: material.color.clone() };
            }
          }
        });
        armory.tints[id] = tints;
      }
      armory.optics.rifle = arsenal.buildOpticSwap(T, rigs.rifle);
      for (const weapon of roster) {
        armory.mods[weapon.id] = { ...weapon.defaults };
        rebuildWeapon(weapon.id);
      }
      for (const id of ['rifle', 'pistol']) applyWeapon(armory.configs[arsenal.defaults[id]]);

      const cycle = step => {
        const list = choices(), target = w.pending ? armory.active[w.pending] : held();
        if (!list.length) return false;
        const idx = list.findIndex(item => item.id === target?.id);
        return selectWeapon(list[((idx < 0 ? 0 : idx) + step + list.length) % list.length]);
      };
      // Load a weapon onto its rig without the draw animation: a map setting up a loadout, or
      // re-reading a weapon's numbers after something changed them.
      const loadWeapon = weaponId => {
        const weapon = arsenal.byId(weaponId);
        if (!weapon) return null;
        const cfg = armory.configs[weapon.id] || rebuildWeapon(weapon.id);
        applyWeapon(cfg);
        return cfg;
      };
      let wheelAt = -1e9, wheelStep = 1;
      window.addEventListener('wheel', e => {
        if (state.armoryOpen) return;
        if (Math.abs(e.deltaY) >= 1) { wheelAt = performance.now(); wheelStep = e.deltaY > 0 ? 1 : -1; }
      }, { capture: true, passive: true });

      w.swap = () => {
        if (state.armoryOpen) return false;
        if (performance.now() - wheelAt < 300) return cycle(wheelStep);
        const other = armory.active[w.current === 'rifle' ? 'pistol' : 'rifle']?.id;
        const backId = !plan?.swapRigs && armory.previous && armory.previous !== held()?.id ? armory.previous : other;
        return selectWeapon(backId) || (backId !== other && selectWeapon(other));
      };

      g.arsenal = {
        held,
        select: id => selectWeapon(id),
        load: loadWeapon,
        cycle,
        configure: configureWeapon,
        mods: id => ({ ...(armory.mods[id] || arsenal.byId(id)?.defaults || {}) }),
        parts: id => armory.parts[id] || null,
        toggleArmory,
        armory
      };

      // a launcher throws no brass: the engine's casing is for the rifle that is not there
      if (g.fx?.shell) {
        const eject = g.fx.shell.bind(g.fx);
        g.fx.shell = (...args) => (held()?.launcher ? undefined : eject(...args));
      }

      if (p.addRecoil) {
        const addRecoil = p.addRecoil.bind(p);
        // How far a shot throws the view. The engine's own kick is slight (a carbine's whole magazine climbs about
        // four degrees; with these it is about nine from the hip, half a degree a round for the first nine); `pitch` and `yaw` scale it for every weapon, on top of the weapon's own `recoil` and its
        // attachments. Aiming and crouching steady it. A map lowers what reaches here to let skills fight it.
        // Aimed, the engine itself hands over a little more than half the kick, and with `ads` under one on top of that
        // an aimed weapon barely moved: `ads` now puts most of it back (aimed is about five sixths of the hip), so a
        // sight has to be held down like anything else. A burst also has a shape (`spray` below): the same every
        // time, so it can be learned. `reset`: how long the trigger must be still for the next round to be the first.
        g.recoil = g.recoil || { pitch: 2.2, yaw: 2, ads: 1.5, crouch: .85, reset: .35 };
        let sprayN = 0, sprayAt = -9;
        p.addRecoil = (pitch = 0, yaw = 0) => {
          const R = g.recoil, aimed = p.ads > .5, k = (held()?.recoil ?? 1) * (aimed ? R.ads : 1) * (p.crouching ? R.crouch : 1);
          if (state.elapsed - sprayAt > (R.reset ?? .35)) sprayN = 0;
          sprayAt = state.elapsed;
          const [climb, walk] = window.Gunslinger.spray(!!rigs[w.current]?.def?.auto, sprayN++);
          // the engine's own sideways kick is chance; a third of it is kept as scatter round the pattern
          addRecoil(pitch * k * R.pitch * climb, yaw * k * R.yaw * .3 + walk * (Math.PI / 180) * Math.min(1.8, Math.sqrt(Math.max(.2, k))) * (g.recoilSkill ? g.recoilSkill() : 1));
          // aimed, the engine holds the weapon almost still on the screen: the muzzle is seen to rise in the sights
          const S = w.debug?.S; if (aimed && S?.kP) S.kP.v += .55 * Math.min(2, k);
        };
      }
    }

    const triggerMelee = () => {
      if (state.meleeCooldown > 0 || state.bandaging > 0 || state.armoryOpen || g.game.state !== 'playing' || !p.enabled || !p.alive) return false;
      state.meleeCooldown = .55;
      g.events.emit?.('weapon:melee', { weapon: w.current });
      g.audio?.play?.('gs_melee', { gain: .95 });
      const S = w.debug?.S;
      if (S) {
        if (S.kZ) S.kZ.v -= 1.35;
        if (S.jP) S.jP.v += 2.6;
        if (S.jR) S.jR.v -= 2.2;
      }
      p.addShake?.(.24);
      if (p.eye && g.camera?.getWorldDirection && g.enemies?.raycast) {
        const dir = new T.Vector3();
        g.camera.getWorldDirection(dir);
        const wall = g.physics?.raycast?.(p.eye, dir, 2.35);
        const reach = wall ? Math.min(2.35, wall.dist) : 2.35;
        const target = g.enemies.raycast(p.eye, dir, reach);
        if (target?.enemy) {
          const killed = target.enemy.damage(65, target.point, dir, target.part) === true;
          g.events.emit?.('player:hitEnemy', { enemy: target.enemy, part: target.part, killed, weak: target.part === 'weak' });
          g.events.emit?.('impact', { ...target, surface: 'enemy', dir, from: 'player', killed });
        } else if (wall) {
          g.events.emit?.('impact', { ...wall, dir, from: 'player', killed: false });
        }
      }
      return true;
    };

    // Single consolidated keydown listener (preserves test-harness listener binding).
    listen('keydown', e => {
      if (/INPUT|TEXTAREA/.test(e.target?.tagName || '')) return;
      keys.add(e.code);

      if (gunsmithKeys.includes(e.code) && !e.repeat && armed && g.game.state === 'playing' && p.enabled && p.alive) {
        e.preventDefault?.();
        toggleArmory();
        return;
      }
      if (state.armoryOpen && !e.repeat) {
        const cur = held();
        if (e.code === 'Escape') { e.preventDefault?.(); toggleArmory(false); return; }
        if (e.code === 'ArrowDown' || e.code === 'KeyS') { state.armoryRow = (state.armoryRow + 1) % slotOrder.length; renderArmory(); return; }
        if (e.code === 'ArrowUp' || e.code === 'KeyW') { state.armoryRow = (state.armoryRow - 1 + slotOrder.length) % slotOrder.length; renderArmory(); return; }
        if ((e.code === 'ArrowRight' || e.code === 'ArrowLeft' || e.code === 'KeyD' || e.code === 'KeyA') && cur) {
          const slotKey = slotOrder[state.armoryRow].key;
          const opts = arsenal.optionsFor(cur.base, slotKey);
          const idx = opts.findIndex(o => o.id === cur.mods[slotKey]);
          const step = (e.code === 'ArrowRight' || e.code === 'KeyD') ? 1 : -1;
          const nextOpt = opts[((idx < 0 ? 0 : idx) + step + opts.length) % opts.length];
          if (nextOpt) configureWeapon(cur.id, { [slotKey]: nextOpt.id });
          return;
        }
      }

      if (e.code === 'KeyV' && !e.repeat && !g.noFireSelect && g.game.state === 'playing' && p.enabled && p.alive && w.current === 'rifle' && (!armed || held()?.select)) {
        state.semi = !state.semi;
        g.audio?.play?.('gs_selector', { gain: .75 });
      }
      if (e.code === laserKey && !e.repeat && armed && g.game.state === 'playing' && p.enabled && p.alive) {
        if (!tacLight) { state.laserOn = !state.laserOn; state.lightOn = false; }
        else if (state.laserOn && !state.lightOn) { state.lightOn = true; }
        else if (state.laserOn && state.lightOn) { state.laserOn = false; state.lightOn = false; }
        else { state.laserOn = true; state.lightOn = false; }
        g.audio?.play?.('gs_selector', { gain: .65, pitch: 1.2 });
      }
      if (e.code === 'KeyI' && !e.repeat && g.game.state === 'playing' && p.enabled && p.alive && w.debug?.S && !w.reload && (p.ads || 0) < .1) {
        w.debug.S.inspect = .001;
        g.audio?.play?.('gear_rustle', { gain: .5 });
      }
      // (with the controls layer, melee is the engine's action alone: `pressed('melee')` in the weapon update)
      if (!controls?.model && e.code === (g.meleeKey || 'KeyF') && !e.repeat && !state.armoryOpen) {
        triggerMelee();
      }
      // a controller has no number row: it steps through what is carried
      if (e.code === 'GsDash') { startDash(); return; }
      if ((e.code === 'GsNextWeapon' || e.code === 'GsPrevWeapon') && armed && !state.armoryOpen && g.game.state === 'playing' && p.enabled && p.alive) {
        g.arsenal.cycle(e.code === 'GsNextWeapon' ? 1 : -1);
      }
      const pick = armed && numberKeys && !e.repeat && arsenal.byKey(e.code);
      if (pick) selectWeapon(pick);
    });
    listen('keyup', e => keys.delete(e.code));
    window.addEventListener('blur', () => keys.clear());

    const trace = (origin, direction, range, owner) => {
      const o = vec(origin), d = vec(direction);
      const wall = g.physics.raycast(o, d, range); const limit = wall ? wall.dist : range;
      if (owner === 'player') {
        const target = g.enemies?.raycast?.(o, d, limit);
        if (target) return { ...target, surface: 'enemy', normal: target.normal || d.clone().negate() };
      } else if (p.alive) {
        const height = p.crouching ? 1.12 : 1.78;
        const center = p.pos.clone().add(new T.Vector3(0, height * .5, 0));
        const along = clamp(center.clone().sub(o).dot(d), 0, limit);
        const nearest = o.clone().addScaledVector(d, along);
        if (Math.hypot(nearest.x - center.x, nearest.z - center.z) < .3 && nearest.y > p.pos.y && nearest.y < p.pos.y + height) {
          return { dist: along, point: nearest, normal: d.clone().negate(), surface: 'player' };
        }
      }
      return wall;
    };

    let lastWhiz = -10;
    const bullets = new window.GunslingerBallistics({
      trace,
      impact(hit, b, damage) {
        const dir = vec(b.velocity).normalize();
        if (hit.surface === 'player') { p.damage(damage, vec(b.position)); return; }
        let killed = false;
        if (hit.enemy) {
          if (!b.shot || !b.shot.hit) stats.hits++;
          if (b.shot) b.shot.hit = true;
          const weakMul = b.weakMul || 2.2;
          killed = hit.enemy.damage(damage * (hit.part === 'weak' ? weakMul : 1), hit.point, dir, hit.part) === true;
          g.events.emit?.('player:hitEnemy', { enemy: hit.enemy, part: hit.part, killed, weak: hit.part === 'weak' });
        }
        g.events.emit?.('impact', { ...hit, dir, from: b.owner, killed });
        if (b.ap && hit.point && hit.normal && g.fx?.sparks && (hit.enemy || hit.surface === 'metal')) {
          g.fx.sparks(hit.point, hit.normal, 14);
        }
        if (g.fx?.tracer && b.owner === 'player' && !b.subsonic) g.fx.tracer(vec(b.previous), hit.point);
      },
      nearMiss(start, end, b) {
        if (b.owner !== 'enemy' || !p.alive) return;
        const a = vec(start), ab = vec(end).sub(a), eye = p.eye;
        const t = clamp(eye.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-8));
        const closest = a.addScaledVector(ab, t);
        const distance = eye.distanceTo(closest);
        if (distance < 1.8) {
          state.suppression = Math.max(state.suppression, (1 - distance / 1.8) * .85);
          if (g.time.t - lastWhiz > .14) {
            lastWhiz = g.time.t;
            g.audio?.play?.('whiz', { pos: closest, gain: .85 });
          }
        }
      }
    });
    g.ballistics = bullets;

    g.events.on('player:hitEnemy', ev => {
      hitFlash = .18;
      hitMark.classList?.toggle?.('weak', !!ev?.weak && !ev?.killed);
      hitMark.classList?.toggle?.('kill', !!ev?.killed);
    });
    g.events.on('weapon:fire', () => {
      if (state.scoped) scopeKick = 1;
    });

    g.combat.playerShot = (origin, dir, options = {}) => {
      stats.shots++;
      const weapon = armed ? held() : null, pellets = weapon?.pellets || 1, record = { hit: false };
      const laserBonus = weapon?.hasLaser && state.laserOn && (p.ads || 0) < .5 ? .78 : 1;
      const unstable = ((1 - state.stamina) * .0018 + state.suppression * .002) * laserBonus;
      for (let i = 0; i < pellets; i++) {
        const shot = vec(dir);
        shot.x += (Math.random() - .5) * unstable;
        shot.y += (Math.random() - .5) * unstable;
        if (pellets > 1) {
          const right = new T.Vector3().crossVectors(shot, new T.Vector3(0, 1, 0)).normalize();
          const lift = new T.Vector3().crossVectors(right, shot);
          const angle = Math.random() * Math.PI * 2, radius = (weapon.cone || .034) * Math.sqrt(Math.random());
          shot.addScaledVector(right, Math.cos(angle) * radius).addScaledVector(lift, Math.sin(angle) * radius);
        }
        const bullet = bullets.fire(origin, shot.normalize(), {
          speed: weapon?.speed ?? (w.current === 'pistol' ? 360 : 820),
          damage: options.damage ? options.damage * 1.4 : 42,
          range: options.range || 350
        });
        if (bullet) {
          bullet.shot = record;
          bullet.subsonic = !!weapon?.subsonic;
          bullet.weakMul = weapon?.weakMul || 2.2;
          bullet.ap = !!weapon?.ap;
        }
      }
      return null;
    };

    g.combat.enemyShot = (origin, dir, options = {}) => {
      bullets.fire(origin, dir, { speed: 620, damage: Math.max(16, (options.damage || 6) * 2), range: options.range || 200, owner: 'enemy' });
      return false;
    };

    // A map may scale movement (g.moveScale), drop the fire selector (g.noFireSelect), move quick melee
    // (g.meleeKey) or replace dressings (g.noDressing, g.gsDressLabel).
    const applyTuning = () => Object.assign(p.tuning, {
      walk: 3.15 * (g.moveScale || 1), sprint: 5.5 * (g.moveScale || 1), crouch: 1.45 * (g.moveScale || 1), ads: 1.55 * (g.moveScale || 1),
      accelGround: 15, decelGround: 20, accelAir: 2,
      regenDelay: 1e9, regenRate: 0, bobY: .017, bobX: .009,
      jumpApex: g.jumpApex || 1,                          // how high a jump rises, metres (the bundle reads it at each jump)
      // a rifle's kick mostly stays as climb; a pistol flips hard and comes most of the way back by itself
      fovSprint: 2, recoilKeep: w.current === 'pistol' ? .4 : .65,
      fovAds: (armed && held()?.fov) || 52,
      adsLook: (armed && held()?.look) || .6
    });
    applyTuning();

    g.events.on('game:state', ({ state: next, prev }) => {
      keys.clear();
      if (next !== 'playing' && state.armoryOpen) toggleArmory(false);
      if (next === 'intro' || (prev === 'dead' && next !== 'dead') || (prev === 'complete' && next !== 'complete')) reset();
      applyTuning();
    });

    const reset = () => {
      Object.assign(state, {
        stamina: 1, suppression: 0, breath: 1, bandages: 2, bandaging: 0,
        held: false, semi: false, exhausted: false, breathSpent: false,
        drawn: 0, laserOn: true, lightOn: false, meleeCooldown: 0, elapsed: 0, dash: 0, dashCd: 0
      });
      bullets.reset();
      scopeKick = 0;
      setScoped(false);
      if (state.armoryOpen) toggleArmory(false);
      if (armed && !plan?.keepOnReset) {
        armory.ammo = {}; armory.previous = null;
        for (const weapon of roster) {
          const curMods = armory.mods[weapon.id];
          const isDefault = curMods && Object.keys(weapon.defaults).every(k => curMods[k] === weapon.defaults[k]);
          armory.mods[weapon.id] = { ...weapon.defaults };
          if (!isDefault) rebuildWeapon(weapon.id);
        }
        for (const id of ['rifle', 'pistol']) {
          armory.active[id] = null;
          applyWeapon(armory.configs[arsenal.defaults[id]]);
          rigs[id].slot.ammo = rigs[id].def.magSize;
          rigs[id].slot.reserve = rigs[id].def.reserve;
        }
        shownKey = '';
      }
    };

    const playerReset = p.reset.bind(p);
    p.reset = (...args) => { playerReset(...args); reset(); applyTuning(); };

    // A dash: a short lunge the way you are moving (the way you face, standing still), on the ground or in the air.
    // For `time` seconds the player is carried at `speed`, level; then let go at `keep`, a sprint's pace, so it ends
    // cleanly and does not slide. `cooldown` is from one dash to the next. A map may refuse one with `g.dashOk`.
    g.dash = g.dash || { speed: 19, time: .17, cooldown: .9, keep: 5.5 };
    const dashDir = { x: 0, z: -1 };
    const startDash = () => {
      if (g.game.state !== 'playing' || !p.alive || !p.enabled || state.armoryOpen || state.bandaging > 0 || state.dash > 0 || state.dashCd > 0) return false;
      if (g.dashOk && !g.dashOk()) return false;
      const m = g.input?.move || { x: 0, y: 0 }, l = Math.hypot(m.x || 0, m.y || 0), mx = l > .2 ? m.x / l : 0, my = l > .2 ? m.y / l : 1;
      const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
      dashDir.x = mx * cos - my * sin; dashDir.z = -mx * sin - my * cos;        // (the engine's own way of turning the stick into a direction)
      state.dash = g.dash.time; state.dashCd = g.dash.cooldown;
      try { g.audio.play('gs_dash', { gain: .8 }); } catch (e) { /* silent */ }
      g.events.emit?.('player:dash', { pos: p.pos });
      return true;
    };
    this.dash = startDash;
    const playerUpdate = p.update.bind(p);
    p.update = dt => {
      applyTuning();
      if (state.dashCd > 0) state.dashCd = Math.max(0, state.dashCd - dt);
      if (state.dash > 0) {
        state.dash -= dt;
        const k = state.dash > 0 ? g.dash.speed : g.dash.keep;
        p.vel.x = dashDir.x * k; p.vel.z = dashDir.z * k;
        if (p.vel.y < 0) p.vel.y = 0;                                           // level while it lasts: in the air it does not fall
      }
      if (state.stamina < .06) state.exhausted = true;
      if (state.stamina > .3) state.exhausted = false;
      if (state.exhausted) g.input.sprint = false;
      if (state.breath < .05) state.breathSpent = true;
      if (state.breath > .3) state.breathSpent = false;
      if (state.bandaging > 0 || state.armoryOpen) {
        g.input.fire = false; g.input.sprint = false; g.input.ads = false;
      }
      if (state.armoryOpen && g.input?.move) { g.input.move.x = 0; g.input.move.y = 0; }
      p.tuning.walk = 3.15 * (g.moveScale || 1) * (p.health < 30 ? .72 : 1);
      playerUpdate(dt);

      const steady = (keys.has('AltLeft') || keys.has('AltRight')) && p.ads > .8 && !state.breathSpent && !p.sprinting;
      state.breath = clamp(state.breath + dt * (steady ? -.3 : .18));
      const amplitude = (steady ? .00012 : .0007) * (1 + (1 - state.stamina) * 3 + state.suppression * 2);
      if (p.alive && p.enabled && !state.armoryOpen) {
        g.camera.rotation.x += Math.sin(g.time.t * 1.7) * amplitude;
        g.camera.rotation.y += Math.sin(g.time.t * 1.1) * amplitude * .55;
      }
    };

    const weaponUpdate = w.update.bind(w);
    w.update = dt => {
      if (state.meleeCooldown > 0) state.meleeCooldown = Math.max(0, state.meleeCooldown - dt);
      if (!state.armoryOpen && g.input?.pressed?.('melee')) triggerMelee();
      const rifle = armed ? armory.active.rifle : null, inHand = armed ? held() : null;
      if (inHand && inHand !== armory.finished) applyFinish(inHand);
      if (w.rigs?.rifle?.def && (!rifle || rifle.select)) w.rigs.rifle.def.auto = !state.semi;
      if (state.drawn > 0) { state.drawn -= dt; g.input.fire = false; }
      if (state.armoryOpen) {
        g.input.fire = false;
        // Present the weapon in a steady workbench inspection angle while customizing!
        const S = w.debug?.S;
        if (S && !w.reload) S.inspect = 1.15;
      }
      weaponUpdate(dt);
      // a launcher that has fired its last is loaded again without being asked (the engine only does so on a dry pull)
      if (inHand?.launcher && rigs[inHand.rig].slot.ammo <= 0 && rigs[inHand.rig].slot.reserve > 0) {
        const S = w.debug?.S;
        if (S && !S.reload && S.autoReload < 0 && !w.pending) S.autoReload = .55;
      }
    };

    let hitTime = -10;
    g.events.on('player:hit', () => { hitTime = g.time.t; state.bandaging = 0; state.suppression = 1; });

    // Update 3D tactical laser beam & SpotLight alignment
    const updateTacticalEmitter = active => {
      if (!tacLaser || !tacDot) return;
      const cur = armed ? held() : null;
      const showLaser = active && !state.scoped && cur?.hasLaser && state.laserOn && !w.pending && w.state !== 'sprinting';
      const showLight = !!tacLight && active && state.lightOn && !w.pending;
      if (!showLaser) { tacLaser.visible = false; tacDot.visible = false; }
      if (!showLight && tacLight) { tacLight.visible = false; }
      if (!showLaser && !showLight) return;

      const muz = w.muzzleWorld ? w.muzzleWorld(new T.Vector3()) : g.camera.position.clone();
      const dir = new T.Vector3();
      g.camera.getWorldDirection(dir);

      if (showLight) {
        tacLight.position.copy(muz).addScaledVector(dir, .04);
        tacLight.target.position.copy(muz).addScaledVector(dir, 12);
        tacLight.target.updateMatrixWorld();
        tacLight.intensity = cur?.hasLight ? 32 : 20;
        tacLight.visible = true;
      }
      if (showLaser) {
        const start = muz.clone().add(new T.Vector3(0, .018, 0));
        const hit = trace(start, dir, 95, 'player');
        const dist = hit ? hit.dist : 95;
        const end = hit?.point ? vec(hit.point) : start.clone().addScaledVector(dir, dist);
        const pos = tacLaser.geometry.attributes.position;
        pos.setXYZ(0, start.x, start.y, start.z);
        pos.setXYZ(1, end.x, end.y, end.z);
        pos.needsUpdate = true;
        tacLaser.visible = true;
        if (hit) {
          tacDot.position.copy(end).addScaledVector(dir, -.015);
          tacDot.scale.setScalar(Math.max(.55, Math.min(2.8, dist * .07)));
          tacDot.visible = true;
        } else {
          tacDot.visible = false;
        }
      }
    };

    const renderFrame = g.render.frame.bind(g.render);
    g.render.frame = dt => {
      const active = p.enabled && p.alive && !['title', 'paused', 'dead', 'complete'].includes(g.game.state);
      hud.hidden = !active;
      gun.hidden = !active || state.armoryOpen;
      if (active) {
        state.elapsed += dt;
        state.stamina = clamp(state.stamina + dt * (p.sprinting ? -.19 : p.crouching ? .16 : .115));
        state.suppression = Math.max(0, state.suppression - dt * .45);
        const dressing = !g.noDressing && !state.armoryOpen && keys.has('KeyB') && p.speed < .4 && state.bandages > 0 && p.health < 100 && g.time.t - hitTime > 1;
        state.bandaging = dressing ? state.bandaging + dt : 0;
        if (state.bandaging >= 3) { p.heal(35); state.bandages--; state.bandaging = 0; keys.delete('KeyB'); g.events.emit?.('gs:dressing', {}); }

        bullets.update(dt);
        state.projectiles = bullets.projectiles.length;

        $('gs-stamina').value = state.stamina;
        $('gs-breath').value = state.breath;
        $('gs-condition').textContent = p.health < 30 ? 'CRITICAL' : p.health < 65 ? 'WOUNDED' : 'STABLE';
        $('gs-condition').classList.toggle('injured', p.health < 65);
        // (a map that counts rounds its own way says so: the Churchyard has no magazines)
        $('gs-ammo').textContent = g.gsAmmo ? g.gsAmmo() : `${w.ammo} / ${Number.isFinite(w.reserve) ? w.reserve : '∞'}`;

        const current = armed ? held() : null;
        $('gs-weapon').textContent = current ? current.name : w.name || '';
        // Where the map owns ammunition, the arsenal's ammunition label means nothing.
        $('gs-mods').textContent = !current ? ''
          : slotOrder.some(slot => slot.key === 'ammoType') ? current.summary
          : current.summary.split(' · ').filter(part => part !== current.modules?.ammoType?.label).join(' · ');

        // the gun panel: rewritten only when what it shows has changed
        {
          const slot = w.rigs?.[w.current]?.slot;
          const info = g.gsAmmoInfo ? g.gsAmmoInfo() : { n: String(w.ammo), of: '/ ' + (Number.isFinite(w.reserve) ? w.reserve : '∞'), frac: slot?.magSize ? w.ammo / slot.magSize : 1 };
          const gid = current ? current.id : w.current === 'pistol' ? 'sidearm' : 'carbine', frac = clamp(info.frac ?? 1);
          const key = `${gid}|${info.n}|${info.of}|${Math.round(frac * 100)}|${current ? current.name : ''}`;
          if (key !== gunKey) {
            gunKey = key;
            const idx = Math.max(0, GUN_ICONS.indexOf(gid)), icon = $('gs-gun-icon'), fill = $('gs-gun-fill');
            $('gs-gun-name').textContent = current ? current.name : w.name || '';
            $('gs-gun-n').textContent = info.n; $('gs-gun-of').textContent = info.of;
            if (icon?.style) { icon.style.backgroundImage = "url('assets/ui/weapons.webp')"; icon.style.backgroundPosition = `${(idx % 2) * 100}% ${Math.floor(idx / 2) * 25}%`; }
            if (fill?.style) fill.style.width = (frac * 100).toFixed(1) + '%';
            gun.classList?.toggle('low', frac < .2 && info.n !== '∞'); gun.classList?.toggle('dry', info.n === '0');
          }
        }
        const sig = current ? `${current.id}:${current.summary}` : '';
        if (sig !== shownKey) {
          shownKey = sig;
          switched = 3.5;
          // A map that selects weapons itself shows its own strip.
          loadout.innerHTML = current && numberKeys
            ? choices().map(item => `<span class="${item.id === current.id ? 'on' : ''}"><kbd>${item.slot}</kbd>${item.short}</span>`).join('') + `<span class="gs-armory-tag"><kbd>TAB</kbd>ARMORY</span>`
            : '';
        }
        switched = Math.max(0, switched - dt);
        if (!numberKeys) switched = 0;
        // Contextual HUD: the weapon strip appears on selection changes, and the control primer
        // fades out after the opening seconds of an operation instead of sitting on screen.
        loadout.style.opacity = state.armoryOpen ? 0 : clamp(switched / .6);
        $('gs-hint').style.opacity = state.armoryOpen ? 0 : clamp((26 - state.elapsed) / 4);

        $('gs-mode').textContent = current && !current.select
          ? (current.launcher === 'flak' ? 'AIRBURST' : current.launcher ? 'ROCKET' : current.body === 'pump' ? (current.pellets > 1 ? 'PUMP' : 'SLUG') : current.pellets > 1 ? 'SCATTER' : current.id === 'breacher' ? 'SLUG' : current.def.auto ? 'AUTO' : 'SEMI')
          : w.current === 'pistol' ? 'SEMI' : state.semi ? 'SEMI' : 'AUTO';

        const adsLevel = typeof p.ads === 'number' ? p.ads : (w.ads || 0);
        const gap = Math.max(5, Math.tan(w.spread || .01) / Math.tan((g.camera.fov || 74) * Math.PI / 360) * (window.innerHeight || 720) * .5);
        cross.style.width = cross.style.height = (gap * 2).toFixed(1) + 'px';
        cross.style.opacity = state.armoryOpen ? 0 : clamp(1 - adsLevel * 3) * (p.sprinting ? .25 : w.state === 'reloading' || w.state === 'switching' ? .35 : .9);

        hitFlash = Math.max(0, hitFlash - dt);
        hitMark.style.opacity = hitFlash > 0 ? Math.min(1, hitFlash * 8) : 0;

        const fullScope = !!(current && current.scope);
        scopeKick = Math.max(0, scopeKick - dt * 8.5);
        scope.style.opacity = !state.armoryOpen && fullScope ? clamp((adsLevel - .7) * 3.4) : 0;
        scope.style.transform = scopeKick > .001 ? `scale(${(1 - scopeKick * .028).toFixed(4)}) translateY(${(-scopeKick * 4.5).toFixed(2)}px)` : '';
        if (fullScope) {
          const zEl = $('gs-scope-zoom'), cEl = $('gs-scope-cal');
          if (zEl) zEl.textContent = `${current.modules?.optic?.label || '4.5× FFP'}${current.suppressed ? ' · SUPPRESSED' : ''}`;
          if (cEl) cEl.textContent = `${current.caliber || ''} · ${current.speed} M/S`;
        }
        setScoped(!state.armoryOpen && fullScope && adsLevel > .86, !!current?.prism);
        // a prism sight is looked through, not replaced by the scope overlay: open its ocular to the eye
        if (current) armory.parts[current.id]?.setAim?.(state.armoryOpen ? 0 : adsLevel);
        if (current) armory.parts[current.id]?.setLoaded?.(rigs[current.rig].slot.ammo);
        // a pump gun is worked after every shot: the fore-end comes back and goes forward again, and is heard
        const pumped = current && armory.parts[current.id]?.pumps ? armory.parts[current.id] : null;
        if (pumped) {
          const ammo = rigs[current.rig].slot.ammo;
          if (state.pumpId !== current.id) { state.pumpId = current.id; state.pumpAmmo = ammo; state.pumpT = 9; }
          if (ammo < state.pumpAmmo) { state.pumpT = 0; state.pumpHeard = false; }
          state.pumpAmmo = ammo;
          if (g.game.state === 'playing') state.pumpT += dt;
          const t = state.pumpT, k = t < .14 ? 0 : t < .3 ? (t - .14) / .16 : t < .5 ? 1 - (t - .3) / .2 : 0;
          pumped.setPump(k * k * (3 - 2 * k));
          if (!state.pumpHeard && t >= .13 && t < .6) { state.pumpHeard = true; try { g.audio?.play?.('gs_pump', { gain: .9, jitter: .03 }); } catch (err) { /* silent audio */ } }
        } else state.pumpId = null;
        // the engine calls a magazine a quarter full "low": a launcher's one round, loaded, is not
        cueEl = cueEl || document.querySelector?.('.h-cue') || null;
        if (cueEl) cueEl.style.visibility = current?.launcher && w.magSize <= 1 && w.ammo > 0 ? 'hidden' : '';

        $('gs-dressings').textContent = g.gsDressLabel ? g.gsDressLabel() : `${state.bandages} DRESSINGS`;
        $('gs-action').textContent = state.bandaging > 0
          ? `APPLYING DRESSING  ${Math.min(100, state.bandaging / 3 * 100).toFixed(0)}%`
          : state.suppression > .5 ? 'UNDER FIRE — FIND COVER'
          : state.stamina < .15 ? 'EXHAUSTED — RECOVER' : '';
      }
      updateTacticalEmitter(active);
      suppression.style.opacity = active ? state.suppression * .65 : 0;
      if (!active) {
        cross.style.opacity = 0; hitMark.style.opacity = 0; scope.style.opacity = 0; scope.style.transform = ''; loadout.style.opacity = 0;
        scopeKick = 0;
        setScoped(false);
        if (armed) armory.parts[held()?.id]?.setAim?.(0);
      }
      const rigRoot = state.scoped ? w.root : null;
      const armGroups = state.scoped && Array.isArray(w.arms?.list) ? w.arms.list.map(a => a?.group).filter(Boolean) : [];
      const prevRootVis = rigRoot ? rigRoot.visible : false;
      const prevArmVis = armGroups.map(grp => grp.visible);
      if (rigRoot) rigRoot.visible = false;
      for (const grp of armGroups) grp.visible = false;
      try {
        renderFrame(dt);
      } finally {
        if (rigRoot) rigRoot.visible = prevRootVis;
        armGroups.forEach((grp, idx) => { grp.visible = prevArmVis[idx]; });
      }
    };

    window.GunslingerVisuals?.install(g);
    // the soldiers other players, the title screen and the armory show
    window.GunslingerMixer?.install(g);
    window.GunslingerAlerts?.install(g);
    window.GunslingerCharacters?.install(g);
    this.brand();
    // the title-screen map picker, then whatever the active map adds
    window.GunslingerMenu?.install(g);
    window.GunslingerMap?.install?.(g);
    // challenges and leaderboards counted from play, then the Operator and Leaderboards screens on the title
    window.GunslingerProgress?.install(g);
    window.GunslingerLocker?.install(g);
    window.GunslingerSkillTree?.install(g);
    // the primer along the bottom names the keys or buttons as they are bound, for whichever is in the hand
    if (controls?.model) {
      const hint = () => {
        const el = document.getElementById('gs-hint'); if (!el) return;
        const L = id => controls.label(id).toUpperCase(), pad = controls.device() === 'pad';
        const row = list => list.filter(([id]) => controls.label(id)).map(([id, name]) => `${L(id)} · ${name}`).join(' &nbsp; ');
        el.innerHTML = g.gsHint ? g.gsHint(L, pad, row)
          : (pad ? '' : '1–6 · WEAPONS &nbsp; ') + row([['next', 'NEXT WEAPON'], ['gunsmith', 'GUNSMITH'], ['mode', 'MODE'], ['laser', 'LASER/LIGHT'], ['inspect', 'INSPECT'], ['melee', 'MELEE'], ['steady', 'STEADY'], ['dress', 'HOLD · DRESSING']].filter(([id]) => pad || id !== 'next'));
      };
      controls.onChange(hint); hint();
    }
  },

  brand() {
    const set = (selector, text) => { const e = document.querySelector(selector); if (e) e.textContent = text; };
    set('.m-word', 'GUNSLINGER');
    set('.m-premise', 'A hostile terminal. Three uplinks. One way out. Every round has a flight path. Every rifle is built to mission.');
    set('.m-eyebrow .m-tag', 'GS / 01');
    set('.m-eyebrow > span:nth-child(2)', 'TERMINAL BREACH');
    set('.m-eyebrow .m-dim', 'MODULAR COMBAT / FIRST LIGHT');
    set('.m-note', 'Six modular weapons · swept ballistics · persistent injuries · build ' + this.build);
    set('[data-act="deploy"]', 'Enter operation');
    set('.m-debrief .m-h', 'Terminal secured');
    const callout = document.querySelector('.m-callout'); if (callout) callout.remove();
    const controls = !window.GunslingerControls?.model && document.querySelector('[data-pane="controls"]');      // (the binding table says it otherwise)
    if (controls) {
      const note = document.createElement('p');
      note.className = 'panel-note';
      note.textContent = '1–6: Select weapon platform. Tab / H: Live Modular Gunsmith (swap optics, suppressors, match brakes, fluted barrels, PEQ-15 lasers, ammo loads & Cerakote finishes). T: Toggle laser/weaponlight. I: Inspect weapon. V: Fire select. F: Quick melee. Hold Alt while aiming: Steady breath. Hold B while stationary (3s): Field dressing (+35 HP).';
      controls.prepend(note);
    }
    const legend = document.querySelector('.m-legend');
    if (legend) {
      const row = document.createElement('div');
      row.innerHTML = '<span><kbd>1–6</kbd> Weapons</span><span><kbd>Tab</kbd> Gunsmith</span><span><kbd>T</kbd> Laser/Light</span><span><kbd>V</kbd> Mode</span><span><kbd>Alt</kbd> Steady</span><span><kbd>Hold B</kbd> Dress wound</span>';
      legend.prepend(row);
    }
  }
};
