/* The wild dead: the ones that are always about, wave or no wave.

   A handful wander the woods and the graveyard at every hour of the night: walkers mostly, a runner or a
   spitter, a brute or two once the waves have begun, and from wave 5 sometimes an abomination far out in the
   trees. They have no business with the crystal and are not counted in any wave. One wakes when someone
   comes within its senses, shoots it, or fires near it; from then on it hunts like any other, and when it
   loses whoever woke it, it goes for the crystal: wake enough of them and you have called a wave of your own.

   Break a headstone and what lies under it may come up after you.

   Left alone, a few of them gather where the ground suits them and raise a totem of stone and timber, in
   three stages. A finished one calls more of the dead out of the earth round it until it is shot down.

   The host's machine decides all of it (zombies.js walks and wakes them; this file keeps their number, raises
   them from graves and runs the totems); guests are told a totem's stage and see the rest as bodies. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const TAU = Math.PI * 2, rand = (a, b) => a + Math.random() * (b - a);

  // base, perWave, max: how many wander. yard: how many of the small ones claw up inside the wall instead of
  // walking out of the trees. graveChance: how often a broken headstone gives up its dead. bossFrom, bossEvery:
  // the first wave an abomination may wander at, and how long before another. totemWork: builder-seconds to
  // each stage; totemHp: hits it takes, per stage; totemRaise: seconds between the dead a finished one calls;
  // totemExtra: how many above the usual number it may call; totemRest: seconds a site lies fallen.
  V.WILD = { base: 8, perWave: 1, max: 15, yard: 0.35, graveChance: 0.65, bossFrom: 5, bossEvery: 240, totemWork: [25, 60, 110], totemHp: 70, totemRaise: 22, totemExtra: 4, totemRest: 90 };
  // How many of the wild dead the night keeps about at a wave.
  V.wildWanted = (wave) => Math.min(V.WILD.max, V.WILD.base + V.WILD.perWave * Math.min(6, Math.max(0, wave | 0)));
  // Which kind comes next. have: { brute, boss } already wandering; r, r2: two rolls in [0, 1).
  V.wildPick = (wave, have, bossReady, r, r2) => {
    if (wave >= V.WILD.bossFrom && bossReady && !(have.boss > 0) && r2 < 0.25) return 'boss';
    if (wave >= 2 && r2 > 0.94) return 'wolf';                                                   // now and then, from the second wave, a wolf in the trees
    const t = r < 0.62 ? 'walker' : r < 0.76 ? 'runner' : r < 0.88 ? 'spitter' : 'brute';
    return t === 'brute' && (wave < 2 || have.brute >= 2) ? 'walker' : t;
  };
  // The grave a broken stone stood at, if it stood at one. graves: [{ x, z, hx, hz }], the plot and its headstone.
  V.graveOf = (graves, x, z, reach = 1.1) => {
    let best = null, bd = reach;
    for (const gr of graves) { const d = Math.hypot(gr.hx - x, gr.hz - z); if (d < bd) { bd = d; best = gr; } }
    return best;
  };
  // The stage a totem stands at for the work done on it: 0 (nothing) to 3 (finished).
  V.totemStage = (work) => { const w = V.WILD.totemWork; return work >= w[2] ? 3 : work >= w[1] ? 2 : work >= w[0] ? 1 : 0; };

  // where a totem may be raised: two in the woods, two in corners of the graveyard
  const SITES = [[-41, 11], [39, -27], [-22.5, -21.5], [22, 22.5]];
  const HEIGHT = [0, 0.75, 1.75, 2.45];

  V.wild = {
    install(g, S, api) {
      const T = g.THREE, kit = V.kit, Z = g.enemies, nav = Z.nav, self = this;
      const graves = (V.world && V.world.yard && V.world.yard.graves) || [];
      const mods = () => { const c = V.composeWave(Math.max(1, S.wave)), d = api.diff(); return { hpMult: c.hpMult * d.hp, speedMult: c.speedMult, dmgMult: 1 }; };
      let spawnT = 0, bossT = 90, tick = 0;

      // ---------------------------------------------------------------- totems
      const sites = [];
      const part = (x, z, stage) => {
        const B = new kit.Builder(g, V.materials);
        let seed = 771 + stage * 131 + Math.abs(Math.round(x * 7 + z * 3));
        const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };       // the same totem on every machine
        if (stage === 1) {
          // a ring of stones and two timbers laid across it
          for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + r() * 0.3, d = 0.5 + r() * 0.12, s = 0.16 + r() * 0.12; B.add('rock', kit.rock(s, 40 + i, 0), { p: [x + Math.cos(a) * d, s * 0.45, z + Math.sin(a) * d], r: [r() * 6, r() * 6, 0], tint: 0.8 + r() * 0.3 }); }
          B.add('timber', kit.bevelBox(1.5, 0.12, 0.14, 0.012), { p: [x, 0.42, z], r: [0.05, 0.6, 0.12] });
          B.add('timber', kit.bevelBox(1.3, 0.11, 0.13, 0.012), { p: [x, 0.56, z], r: [-0.04, 2.1, -0.1] });
          B.add('timber', kit.bevelBox(0.16, 0.7, 0.16, 0.012), { p: [x, 0.35, z], r: [0.04, 0.3, 0.03] });
        } else if (stage === 2) {
          // the post, and ribs lashed across it
          B.add('timber', kit.bevelBox(0.17, 1.2, 0.17, 0.014), { p: [x, 1.2, z], r: [0.03, 0.3, -0.02] });
          for (const [y, len, ry, rz] of [[1.05, 1.15, 0.2, 0.08], [1.38, 0.95, 1.9, -0.1], [1.64, 0.7, 0.9, 0.14]]) B.add('timber', kit.bevelBox(len, 0.07, 0.08, 0.008), { p: [x, y, z], r: [0, ry, rz] });
          for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.5, s = 0.11 + r() * 0.06; B.add('rock', kit.rock(s, 60 + i, 0), { p: [x + Math.cos(a) * 0.22, 0.78 + r() * 0.1, z + Math.sin(a) * 0.22], r: [r() * 6, r() * 6, 0], tint: 0.9 }); }
        } else {
          // the head of it: forked branches, and a coal that burns without a fire
          for (const [ry, rz, len] of [[0.2, 0.75, 0.8], [2.3, 0.7, 0.72], [4.2, 0.82, 0.76], [1.2, 1.25, 0.5], [3.4, 1.2, 0.46]]) {
            B.rod('timber', [x, 1.78, z], [x + Math.cos(ry) * Math.cos(rz) * len, 1.78 + Math.sin(rz) * len, z + Math.sin(ry) * Math.cos(rz) * len], 0.04, 0.012, { seg: 5 });
          }
          B.add('rock', kit.rock(0.19, 91, 0), { p: [x, 1.9, z], r: [0.4, 1.1, 0], tint: 0.7 });
          B.add('ember', kit.box(0.13, 0.1, 0.13), { p: [x, 1.93, z + 0.11], cast: false });
          B.add('ember', kit.box(0.05, 0.05, 0.05), { p: [x - 0.09, 2.02, z + 0.12], cast: false });
          B.add('ember', kit.box(0.05, 0.05, 0.05), { p: [x + 0.09, 2.02, z + 0.12], cast: false });
        }
        const root = B.build('totem-' + stage);
        root.visible = false; g.scene.add(root);
        return root;
      };
      for (const [x, z] of SITES) {
        if (!nav.free(x, z)) continue;                              // something stands there in this build of the level
        let roots = null;
        try { roots = [null, part(x, z, 1), part(x, z, 2), part(x, z, 3)]; } catch (e) { console.error('[vigil] a totem could not be built: ' + ((e && e.stack) || e)); continue; }
        sites.push({ i: sites.length, x, z, roots, stage: 0, work: 0, hp: 0, rest: rand(20, 60), raiseT: V.WILD.totemRaise, box: null, raised: 0, swingT: 0 });
      }
      function show(site, stage) {
        site.stage = stage;
        for (let k = 1; k <= 3; k++) site.roots[k].visible = k <= stage;
        if (site.box) { g.physics.removeBox(site.box); site.box = null; }
        if (stage > 0) site.box = g.physics.addBox([site.x - 0.34, 0, site.z - 0.34], [site.x + 0.34, HEIGHT[stage], site.z + 0.34], { surface: 'wood', noNav: true });
      }
      function fell(site, by) {
        const stage = site.stage;
        if (!stage) return;
        show(site, 0);
        site.work = 0; site.hp = 0; site.rest = V.WILD.totemRest; site.raiseT = V.WILD.totemRaise;
        for (const z of Z.list) if (z.job && z.job.site === site) z.job = null;
        const at = new T.Vector3(site.x, 1.0, site.z), up = new T.Vector3(0, 1, 0);
        try { if (g.fx.dust) g.fx.dust(at, up, 1.4, 0.5, 0.2, 0.16); if (g.fx.debris) g.fx.debris(at, { color: [0.3, 0.22, 0.14], size: 0.07, speed: 4.5, count: 14, normal: up, spread: 1.2 }); } catch (e) { /* effects are optional */ }
        if (V.audio) V.audio.play('wood_break', { pos: at });
        const n = api.net();
        if (n && n.host) n.emit('tm', { i: site.i, s: 0 });
        if (by === 'player') { const pay = 40 * stage; api.addMoney(pay); api.toast(`Totem felled: +$${pay}`); g.events.emit('vigil:totem', { stage }); }
      }
      // a round into it (the collider is what stops the bullet): three or so for each stage it has reached
      g.events.on('impact', (hit) => {
        if (!hit || !hit.box || api.guest()) return;
        const site = sites.find((s) => s.box === hit.box);
        if (!site) return;
        site.hp -= 34;
        if (V.audio) V.audio.play('wood_hit', { pos: hit.point });
        if (site.hp <= 0) fell(site, 'player');
      });
      // guests: what the host says a totem looks like
      this.netTotem = (d) => { const site = sites[d && d.i]; if (site && api.guest()) show(site, Math.max(0, Math.min(3, d.s | 0))); };

      const clearLine = (ax, az, bx, bz) => { for (let k = 1; k <= 8; k++) if (!nav.free(ax + ((bx - ax) * k) / 8, az + ((bz - az) * k) / 8)) return false; return true; };
      function totems(dt) {
        for (const site of sites) {
          if (site.rest > 0) { site.rest -= dt; continue; }
          if (site.stage < 3) {
            // up to three of the wild dead that are near, small, and have a clear walk to it are set to work
            const crew = Z.list.filter((z) => z.job && z.job.site === site && z.roam && z.alive);
            if (crew.length < 3) {
              const taken = crew.map((z) => z.job.slot), slot = [0, 1, 2].find((k) => !taken.includes(k));
              const a = site.i * 0.9 + slot * (TAU / 3), sx = site.x + Math.cos(a) * 1.2, sz = site.z + Math.sin(a) * 1.2;
              let best = null, bd = 17;
              for (const z of Z.list) {
                if (!z.roam || !z.alive || z.job || z.state !== 0 || z.size || z.type === 'runner') continue;
                const d = Math.hypot(z.pos.x - sx, z.pos.z - sz);
                if (d < bd && clearLine(z.pos.x, z.pos.z, sx, sz)) { bd = d; best = z; }
              }
              if (best) best.job = { x: sx, z: sz, site, slot, fx: site.x, fz: site.z };
            }
            let hands = 0;
            for (const z of crew) if (Math.hypot(z.pos.x - z.job.x, z.pos.z - z.job.z) < 0.95) { hands++; z.jobT = (z.jobT || 0) - dt; if (z.jobT <= 0) { z.jobT = rand(1.3, 2.6); z.swing = z.swingDur = 0.55; z.swingHit = true; if (V.audio && Math.random() < 0.5) V.audio.play('wood_hit', { pos: [site.x, 0.8, site.z], gain: 0.5 }); } }
            if (hands) {
              site.work += hands * dt;
              const stage = V.totemStage(site.work);
              if (stage !== site.stage) {
                show(site, stage); site.hp = V.WILD.totemHp * stage;
                if (V.audio) V.audio.play('stone_hit', { pos: [site.x, 1, site.z] });
                const n = api.net(); if (n && n.host) n.emit('tm', { i: site.i, s: stage });
                if (stage === 3) { for (const z of crew) z.job = null; site.raiseT = 8; }
              }
            }
          } else {
            // finished: it calls the dead up round it, a few more than the night would otherwise keep
            site.raiseT -= dt;
            if (site.raiseT <= 0) {
              site.raiseT = V.WILD.totemRaise;
              if (Z.wildCount() < V.wildWanted(S.wave) + V.WILD.totemExtra) {
                for (let i = 0; i < 6; i++) {
                  const a = rand(0, TAU), r = rand(2.2, 5), x = site.x + Math.cos(a) * r, z = site.z + Math.sin(a) * r;
                  if (!nav.free(x, z) || Z.living().some((q) => Math.hypot(q.x - x, q.z - z) < 9)) continue;
                  Z.spawn(Math.random() < 0.8 ? 'walker' : 'spitter', { x, z }, { ...mods(), roam: true, rise: true });
                  break;
                }
              }
            }
          }
        }
      }

      // ---------------------------------------------------------------- how many wander
      function populate(dt) {
        spawnT -= dt; if (bossT > 0) bossT -= dt;
        if (spawnT > 0) return;
        const have = Z.wildCount();
        spawnT = have < 5 ? 0.5 : rand(3, 7);
        if (have >= V.wildWanted(S.wave) || have + Z.aliveCount() >= 84) return;
        const who = Z.living();
        const type = V.wildPick(S.wave, { brute: Z.wildOf('brute'), boss: Z.wildOf('boss') }, bossT <= 0, Math.random(), Math.random());
        const small = type !== 'boss' && type !== 'brute', inYard = small && Math.random() < V.WILD.yard;
        const at = inYard ? Z.openGround(13, 27, who, 18) : Z.spawnPoint(rand(0, TAU), 33, 58, who, 28, Math.PI, type);
        if (!at) return;
        if (type === 'boss') bossT = V.WILD.bossEvery;
        Z.spawn(type, at, { ...mods(), roam: true, rise: inYard });
      }

      // ---------------------------------------------------------------- graves
      g.events.on('vigil:broken', (e) => {
        if (!e || e.kind !== 'stone' || !e.pos || api.guest() || g.game.state !== 'playing' || S.over) return;
        const gr = V.graveOf(graves, e.pos.x, e.pos.z);
        if (!gr || gr.woke) return;
        gr.woke = true;                                            // a grave is only opened once a night
        if (Math.random() >= V.WILD.graveChance || !nav.free(gr.x, gr.z)) return;
        const who = Z.living();
        if (!who.length) return;
        const z = Z.spawn(Math.random() < 0.8 ? 'walker' : 'runner', { x: gr.x, z: gr.z }, { ...mods(), roam: true, rise: true });
        if (z) { z.aggroT = 45; z.aggroBy = 'player'; g.events.emit('vigil:risen', { enemy: z }); }      // it comes for whoever disturbed it
      });

      this.update = (dt) => {
        if (api.guest() || S.over) return;
        populate(dt);
        tick += dt;
        if (tick >= 0.25) { totems(tick); tick = 0; }
      };
      this.reset = () => {
        spawnT = 0; bossT = 90; tick = 0;
        for (const gr of graves) gr.woke = false;
        for (const site of sites) { show(site, 0); site.work = 0; site.hp = 0; site.rest = rand(20, 60); site.raiseT = V.WILD.totemRaise; }
      };
      // a shot was fired here: the wild dead within earshot may turn toward it
      this.noise = (x, z, radius) => { if (!api.guest()) Z.noise(x, z, radius); };
      this.debug = () => ({ wild: Z.wildCount(), wanted: V.wildWanted(S.wave), roaming: Z.list.filter((z) => z.roam && z.alive).length, woken: Z.list.filter((z) => z.wild && !z.roam && z.alive).length, bossIn: Math.round(bossT), sites: sites.map((s) => ({ at: [s.x, s.z], stage: s.stage, work: +s.work.toFixed(1), hp: s.hp, rest: Math.round(s.rest), crew: Z.list.filter((z) => z.job && z.job.site === s).length })) });
      this.sites = sites;
    },
    update() {}, reset() {}, noise() {}, netTotem() {},
    debug() { return {}; },
  };
})();
