/* Crystal Vigil's rules, run on top of the engine's holdout state machine: waves of the dead, the crystal's
   health, money, classes and their abilities, rifle kits, perks, carried items and what happens when you go down. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const PI = Math.PI;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

  // The rifle is one weapon with interchangeable kits; each keeps its own ammunition.
  V.KITS = {
    carbine: { id: 'carbine', slot: 3, name: 'MX-4 Carbine', auto: true, dmg: 40, rpm: 690, mag: 30, reserve: 210, spread: 1, head: 2.2, pierce: 0, price: 2100, fov: 52, desc: 'Accurate, hard-hitting automatic rifle.' },
    cqb: { id: 'cqb', slot: 4, name: 'Viper-9 CQB', auto: true, dmg: 24, rpm: 880, mag: 34, reserve: 238, spread: 1.7, head: 2.0, pierce: 0, price: 850, fov: 56, desc: 'Very high rate of fire. Shreds groups up close.' },
    buck: { id: 'buck', slot: 5, name: 'K-12 Buckshot', auto: false, dmg: 20, rpm: 175, mag: 8, reserve: 56, spread: 1, pellets: 9, pelletSpread: 0.062, range: 46, head: 1.5, pierce: 0, price: 1300, fov: 58, desc: 'Nine pellets per shell. Devastating at close range.' },
    dmr: { id: 'dmr', slot: 6, name: 'DMR-7 Marksman', auto: false, dmg: 150, rpm: 230, mag: 10, reserve: 70, spread: 0.3, head: 2.6, pierce: 3, price: 2900, fov: 24, desc: 'Magnified semi-auto. Rounds punch through several targets.' },
    lmg: { id: 'lmg', slot: 7, name: 'HMG-240 Belt', auto: true, dmg: 46, rpm: 640, mag: 100, reserve: 300, spread: 1.5, head: 2.0, pierce: 1, price: 5200, fov: 54, move: 0.86, desc: '100-round belt. Slows you a little.' },
  };
  V.KIT_ORDER = ['carbine', 'cqb', 'buck', 'dmr', 'lmg'];
  const PISTOL = { dmg: 38, head: 2.2, pierce: 0 };
  V.CLASSES = {
    soldier: { id: 'soldier', name: 'Soldier', tag: 'Frontline rifleman', hp: 110, speed: 1.0, kit: 'carbine', passive: '+15% bullet damage', dmgMult: 1.15, items: { grenades: 2 },
      ability: { id: 'adrenaline', name: 'Adrenaline', cd: 45, desc: 'For 8s: +50% fire rate, fast reloads, half recoil.' } },
    medic: { id: 'medic', name: 'Medic', tag: 'Keeps everything alive', hp: 100, speed: 1.0, kit: 'cqb', passive: 'Regenerates health when not being hit', regen: 3, items: { medkits: 2 },
      ability: { id: 'sanctify', name: 'Sanctify', cd: 40, desc: 'Heals you, your guards and the crystal, and burns nearby zombies.' } },
    engineer: { id: 'engineer', name: 'Engineer', tag: 'Builds the defense', hp: 100, speed: 1.0, kit: 'buck', passive: 'Defenses cost 30% less; turrets hit 25% harder; starts with a free turret', defDiscount: 0.7, turretMult: 1.25, freeTurret: true, items: { mines: 1 },
      ability: { id: 'overclock', name: 'Overclock', cd: 50, desc: 'Repairs all defenses and doubles turret fire rate for 10s.' } },
    scout: { id: 'scout', name: 'Scout', tag: 'Fast marksman', hp: 90, speed: 1.15, kit: 'dmr', passive: '+15% move speed, +50% headshot damage, bonus cash for headshots', headBonus: 1.5, headCash: 15, items: { flares: 3 },
      ability: { id: 'flareshot', name: 'Flare Shot', cd: 35, desc: 'Fires a flare where you aim: lights the area and marks zombies (+50% damage taken).' } },
  };
  V.CLASS_ORDER = ['soldier', 'medic', 'engineer', 'scout'];
  V.ECON = { startMoney: 500, waveBonus: (n) => 200 + 75 * n, headshotBonus: 10, defenseKillShare: 0.6 };
  V.CRYSTAL_HP = 3000;

  // The spawn list for wave n (1-based).
  V.composeWave = (n) => {
    const total = Math.min(95, Math.round(7 + n * 3.4 + Math.pow(n, 1.35))), list = [];
    const brutes = n >= 5 ? Math.min(8, Math.floor((n - 3) / 2)) : 0, bosses = n % 5 === 0 ? n / 5 : 0;
    const runnerP = n < 2 ? 0 : Math.min(0.34, 0.08 + n * 0.022), spitterP = n < 4 ? 0 : Math.min(0.16, 0.04 + n * 0.012);
    for (let i = 0; i < total - brutes; i++) { const r = Math.random(); list.push(r < runnerP ? 'runner' : r < runnerP + spitterP ? 'spitter' : 'walker'); }
    for (let i = 0; i < brutes; i++) list.push('brute');
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    for (let i = 0; i < bosses; i++) list.splice(Math.floor(list.length * (0.35 + (0.3 * i) / Math.max(1, bosses))), 0, 'boss');
    return { list, hpMult: 1 + 0.1 * (n - 1), speedMult: Math.min(1.3, 1 + 0.012 * (n - 1)), maxAlive: Math.min(52, 12 + n * 3), interval: Math.max(0.28, 1.15 - n * 0.06), riserChance: n >= 3 ? Math.min(0.3, 0.1 + n * 0.015) : 0 };
  };
  const DIFF = { standard: { hp: 0.85, dmg: 0.8, money: 1.1 }, hard: { hp: 1, dmg: 1, money: 1 }, brutal: { hp: 1.25, dmg: 1.3, money: 0.9 } };
  const CLASS_KEY = 'gunslinger.vigil.class';

  V.director = {
    S: null, playerHidden: false,
    classId() { let c = null; try { c = localStorage.getItem(CLASS_KEY); } catch (e) { /* private mode */ } return V.CLASSES[c] ? c : 'soldier'; },
    setClass(id) { if (!V.CLASSES[id]) return; try { localStorage.setItem(CLASS_KEY, id); } catch (e) { /* private mode */ } if (this.S) this.S.nextClass = id; },

    install(g) {
      const self = this, T = g.THREE, p = g.player, w = g.weapon, W = V.world, lights = W.lights, crystal = W.crystal, Z = g.enemies;
      V.audio.install(g);
      const run = g.game.run, holdout = g.game.holdout, settings = g.game.menus.settings;
      // the engine's own mode stays "holdout" here, without overwriting the harbor's saved choice
      const harborMode = settings.mode;
      settings.mode = 'holdout';
      settings.toJSON = function () { const o = {}; for (const k of Object.keys(this)) if (k !== 'toJSON') o[k] = this[k]; o.mode = harborMode; return o; };
      holdout.killScore = { walker: 100, runner: 140, spitter: 180, brute: 500, boss: 2500 };
      g.noFireSelect = true; g.noDressing = true;

      const S = (this.S = {
        money: 0, wave: 0, phase: 'prep', timer: 14, queue: [], waves: [], addT: 0, spawnT: 0, cfg: null, sectors: [], time: 0, left: 0, runId: 1,
        crystal: { hp: V.CRYSTAL_HP, max: V.CRYSTAL_HP, shield: 0 }, over: false, overT: 0,
        cls: V.CLASSES.soldier, nextClass: this.classId(), items: { grenades: 0, flares: 0, medkits: 0, mines: 0 }, armor: 0, tokens: 1, tokensBought: 0,
        perks: {}, abilityLvl: 1, cd: { ability: 0, shock: 0, aegis: 0 }, buff: { adrenaline: 0, overclock: 0 },
        kits: {}, kit: 'carbine', down: null, hurtT: 9, torch: false, kills: 0, headshots: 0, earned: 0, shop: false, placing: null,
      });
      const stats = g.combat.stats, base = {};
      for (const id of ['rifle', 'pistol']) { const d = w.rigs[id].def; base[id] = { rpm: d.rpm, spread: { ...d.spread }, magSize: d.magSize, reserve: d.reserve }; }
      const baseFovAds = p.tuning.fovAds;
      const diff = () => DIFF[g.game.difficulty] || DIFF.hard;
      const say = (text, secs) => g.hud.message && g.hud.message(text, secs || 3);
      const toast = (text) => { if (V.ui) V.ui.toast(text); };
      // playing together (net.js): the host's machine decides what the room shares; a guest's only shows it
      const NET = () => (V.net && V.net.online ? V.net : null), guest = () => { const n = NET(); return !!(n && !n.host); };
      const r2 = (v) => Math.round(v * 100) / 100;

      // ------------------------------------------------------------ kits
      function magOf(k) { return Math.round(k.mag * (S.perks.extmag ? 1.4 : 1)); }
      function applyKit(id, announce) {
        const k = V.KITS[id], rig = w.rigs.rifle, d = rig.def, pool = S.kits[id];
        if (!k || !pool) return false;
        // bank the current magazine before swapping
        const cur = S.kits[S.kit]; if (cur && S.kit !== id) { cur.ammo = rig.slot.ammo; cur.reserve = rig.slot.reserve; }
        S.kit = id;
        d.rpm = k.rpm; d.auto = k.auto; d.magSize = magOf(k); d.reserve = k.reserve;
        for (const key of Object.keys(base.rifle.spread)) d.spread[key] = base.rifle.spread[key] * (key === 'shot' || key === 'decay' ? 1 : k.spread);
        rig.slot.magSize = magOf(k); rig.slot.ammo = Math.min(pool.ammo, magOf(k)); rig.slot.reserve = pool.reserve; rig.slot.name = k.name;
        if (g.realism) g.realism.semi = !k.auto;
        if (announce) { say(k.name, 1.6); V.audio.play('weapon_draw'); }
        return true;
      }
      function giveKit(id, equip) { const k = V.KITS[id]; if (!S.kits[id]) S.kits[id] = { ammo: magOf(k), reserve: k.reserve }; if (equip) applyKit(id, true); }
      function refillAmmo() {
        const rig = w.rigs.rifle;
        for (const id of Object.keys(S.kits)) { const k = V.KITS[id]; S.kits[id].ammo = magOf(k); S.kits[id].reserve = k.reserve; }
        rig.slot.ammo = rig.slot.magSize; rig.slot.reserve = V.KITS[S.kit].reserve;
        w.rigs.pistol.slot.ammo = w.rigs.pistol.slot.magSize;
      }
      const ammoFull = () => { const rig = w.rigs.rifle; if (rig.slot.ammo < rig.slot.magSize || rig.slot.reserve < V.KITS[S.kit].reserve) return false; return Object.keys(S.kits).every((id) => id === S.kit || (S.kits[id].ammo >= magOf(V.KITS[id]) && S.kits[id].reserve >= V.KITS[id].reserve)); };

      // ------------------------------------------------------------ shooting
      const vec = (v) => new T.Vector3(v.x, v.y, v.z);
      const dmgMult = () => (S.cls.dmgMult || 1) * (S.perks.hollow ? 1.2 : 1);
      g.combat.playerShot = (origin, dir) => {
        stats.shots++;
        const pistol = w.current === 'pistol', k = pistol ? PISTOL : V.KITS[S.kit], R = g.realism || { stamina: 1, suppression: 0 };
        const unstable = (1 - R.stamina) * 0.0018 + R.suppression * 0.002, n = k.pellets || 1;
        for (let i = 0; i < n; i++) {
          const d = vec(dir), sp = unstable + (n > 1 ? k.pelletSpread : 0);
          d.x += (Math.random() - 0.5) * sp * 2; d.y += (Math.random() - 0.5) * sp * 2; d.z += (Math.random() - 0.5) * sp * 2;
          d.normalize();
          if (i === 0) { const n = NET(); if (n) n.shot(origin, d); }
          const b = g.ballistics.fire(origin, d, { speed: pistol ? 360 : 820, damage: k.dmg * dmgMult(), range: k.range || (pistol ? 120 : 350) });
          if (b) { b.pierce = k.pierce || 0; b.head = k.head * (S.cls.headBonus || 1); }
        }
        return null;
      };
      g.ballistics.impact = (hit, b, damage) => {
        const dir = vec(b.velocity).normalize();
        if (hit.surface === 'player') { p.damage(damage, vec(b.position)); return; }
        if (hit.enemy) {
          stats.hits++;
          const head = hit.part === 'weak';
          const killed = hit.enemy.damage(damage * (head ? b.head || 2.2 : 1), hit.point, dir, hit.part, { by: 'player' }) === true;
          g.events.emit('player:hitEnemy', { enemy: hit.enemy, part: hit.part, killed, weak: head });
          if (b.pierce > 0 && b.range - b.distance > 2) {
            const nb = g.ballistics.fire({ x: hit.point.x + dir.x * 0.75, y: hit.point.y + dir.y * 0.75, z: hit.point.z + dir.z * 0.75 }, dir, { speed: b.speed, damage: b.damage * 0.8, range: b.range - b.distance - 0.75 });
            if (nb) { nb.pierce = b.pierce - 1; nb.head = b.head; }
          }
        } else {
          g.events.emit('impact', { ...hit, dir, from: b.owner, killed: false });
          if (hit.box && V.destruct) V.destruct.hitBox(hit.box, hit.point, dir, damage);
        }
        if (g.fx.tracer && b.owner === 'player') g.fx.tracer(vec(b.previous), hit.point);
      };
      const addRecoil = p.addRecoil.bind(p);
      p.addRecoil = (a, b) => addRecoil(a * (S.buff.adrenaline > 0 ? 0.5 : 1), b * (S.buff.adrenaline > 0 ? 0.5 : 1));
      const weaponUpdate = w.update.bind(w);
      w.update = (dt) => {
        const reloading = w.state === 'reload' || w.state === 'reloading';
        const k = (reloading ? (S.perks.quickhands ? 1.5 : 1) * (S.buff.adrenaline > 0 ? 2.2 : 1) : 1);
        w.rigs.rifle.def.rpm = V.KITS[S.kit].rpm * (S.buff.adrenaline > 0 ? 1.5 : 1);
        if (g.realism) g.realism.semi = !V.KITS[S.kit].auto;
        if (S.placing || S.down) g.input.fire = false;
        weaponUpdate(dt * k);
      };
      this.modifyDamage = (amount, z, part, info) => amount;

      // ------------------------------------------------------------ money
      function addMoney(n) { n = Math.round(n); S.money += n; S.earned += Math.max(0, n); }
      g.events.on('enemy:killed', (e) => {
        if (!e || !e.enemy || !e.enemy.flesh || g.game.state === 'title') return;
        if (e.by !== 'player' && e.by !== 'defense') return;                                          // someone else's kill
        if (e.by === 'defense' && e.owner && V.net && V.net.id && e.owner !== V.net.id) return;      // someone else's turret
        if (e.by === 'player' && guest() && g.hud.hitmarker) g.hud.hitmarker('kill');
        const c = e.enemy.cfg; let cash = c.reward;
        S.kills++;
        if (e.by === 'defense') cash *= V.ECON.defenseKillShare;
        else { if (e.head) { cash += V.ECON.headshotBonus + (S.cls.headCash || 0); S.headshots++; } }
        if (S.perks.scavenger) cash *= 1.25;
        addMoney(cash * diff().money);
        if (g.hud.feed) g.hud.feed(`<b>${e.enemy.type.toUpperCase()}</b><em>+$${Math.round(cash * diff().money)}</em>`);
      });
      g.events.on('player:hitEnemy', (e) => { if (g.hud.hitmarker) g.hud.hitmarker(e.killed ? 'kill' : e.weak ? 'weak' : 'hit'); });

      // ------------------------------------------------------------ crystal
      function damageCrystal(n, z) {
        if (S.over || S.crystal.shield > 0 || guest()) return;
        S.crystal.hp = Math.max(0, S.crystal.hp - n * diff().dmg);
        crystal.hit(Math.min(2, n / 12));
        V.audio.play('crystal_hit', { pos: [V.CRYSTAL.x, V.CRYSTAL.y, V.CRYSTAL.z], gain: 0.9 });
        if (S.crystal.hp <= S.crystal.max * 0.3 && !S.warned30) { S.warned30 = true; g.hud.radio && g.hud.radio('The crystal is failing. Get back to the church.', 3.4); }
        if (S.crystal.hp <= 0) crystalLost();
      }
      function healCrystal(frac) { if (guest()) { NET().request('cheal', frac); return; } S.crystal.hp = Math.min(S.crystal.max, S.crystal.hp + S.crystal.max * frac); if (S.crystal.hp > S.crystal.max * 0.4) S.warned30 = false; }
      function crystalLost() {
        S.over = true; S.overT = 1.6;
        crystal.setHealth(0); crystal.shatter(); V.audio.play('crystal_break');
        if (lights) lights.dim = 0.25;
        p.invulnerable = true;
      }
      this.damageCrystal = damageCrystal; this.healCrystal = healCrystal; this.addMoney = addMoney;

      // ------------------------------------------------------------ the player
      const playerDamage = p.damage.bind(p);
      p.damage = (amount, from) => {
        if (!p.alive || p.invulnerable || !(amount > 0) || S.down) return;
        if (NET() && g.game.state !== 'playing') return;              // in a menu while the squad fights on: out of it, and ignored by the dead
        amount *= diff().dmg * (S.perks.thickskin ? 0.75 : 1);
        if (S.armor > 0) { const soak = Math.min(S.armor, amount * 0.6); S.armor -= soak; amount -= soak; }
        S.hurtT = 0;
        if (p.health - amount <= 0 && g.game.state === 'playing') { goDown(from); return; }
        playerDamage(amount, from);
      };
      function goDown(from) {
        g.events.emit('player:hit', { amount: 40, fromPos: from });
        p.health = 0; p.alive = false; p.sprinting = false;
        S.down = { t: 0, waiting: S.tokens <= 0 }; self.playerHidden = true;
        try { w.setVisible(false); } catch (e) { /* stub weapon */ }
        if (S.tokens > 0) { S.tokens--; g.hud.warn && g.hud.warn('You are down', 3); }
        else g.hud.warn && g.hud.warn('Down — no respawns left', 3.4);
        if (S.placing && V.defenses) V.defenses.cancelPlace(true);
      }
      function respawn() {
        const pads = (W.yard && W.yard.spawnPads) || [[2.6, -2]], pad = pads[Math.floor(Math.random() * pads.length)];
        const bandages = g.realism ? g.realism.bandages : 0;
        p.reset({ pos: new T.Vector3(pad[0], V.CH.floor, pad[1]), yaw: Math.atan2(-(V.CRYSTAL.x - pad[0]), -(V.CRYSTAL.z - pad[1])) });
        applyClassStats(false); if (g.realism) g.realism.bandages = bandages;
        p.enabled = true; S.down = null; self.playerHidden = false; S.invulnT = 2.5; p.invulnerable = true;
        try { w.setVisible(true); } catch (e) { /* stub weapon */ }
        if (g.render.post) g.render.post.fade = 0.9;
        say('Back on your feet', 2);
      }
      this.knockPlayer = (dx, dz, force) => { const d = Math.hypot(dx, dz) || 1; p.vel.x += (dx / d) * force; p.vel.z += (dz / d) * force; p.vel.y = Math.max(p.vel.y, 2.5); p.addShake(0.5); };
      function applyClassStats(keepHealth) {
        const c = S.cls;
        p.maxHealth = c.hp; p.health = keepHealth ? Math.min(p.health, c.hp) : c.hp;
        g.moveScale = c.speed * (S.perks.marathon ? 1.12 : 1) * (S.kit && V.KITS[S.kit].move && w.current !== 'pistol' ? V.KITS[S.kit].move : 1);
      }

      // ------------------------------------------------------------ run reset
      // What belongs to this player: money, kit, perks, their own body.
      function resetLocal() {
        Object.assign(S, {
          money: V.ECON.startMoney + (+g.params.money || 0), armor: 0, tokens: 1, tokensBought: 0, perks: {}, abilityLvl: 1, down: null, hurtT: 9, torch: false,
          kills: 0, headshots: 0, earned: 0, placing: null, invulnT: 0, caught: false, scored: false,
        });
        S.cd.ability = S.cd.shock = S.cd.aegis = 0; S.buff.adrenaline = S.buff.overclock = 0;
        S.cls = V.CLASSES[S.nextClass] || V.CLASSES.soldier;
        S.items = { grenades: 0, flares: 0, medkits: 0, mines: 0, ...S.cls.items };
        S.kits = {}; S.kit = S.cls.kit; giveKit(S.cls.kit, false); applyKit(S.cls.kit, false);
        w.rigs.rifle.slot.ammo = w.rigs.rifle.slot.magSize;
        applyClassStats(false);
        if (g.realism) g.realism.bandages = 0;
        self.playerHidden = false; p.invulnerable = false;
        if (lights) lights.torch.intensity = 0;
        run.kills = 0; run.score = 0;
        S.marker = null;
        if (V.ui) V.ui.reset();
      }
      // What belongs to the room: the waves, the crystal, the dead, what is broken, what has been placed.
      // own: this machine decides those (alone, or as host). Otherwise it only clears its view for what the host sends.
      function resetShared(own) {
        Object.assign(S, { wave: own ? Math.max(0, (+g.params.wave || 1) - 1) : 0, phase: 'prep', timer: 14, queue: [], waves: [], sectors: [], addT: 0, spawnT: 0, cfg: null, time: 0, over: false, overT: 0, warned30: false, left: 0 });
        S.crystal.hp = S.crystal.max; S.crystal.shield = 0;
        crystal.reset(); if (lights) lights.dim = 1;
        try { Z.clear(); } catch (e) { /* before the first frame */ }
        if (V.defenses) V.defenses.reset();
        if (V.loose) V.loose.clearBodies();
        if (V.destruct) V.destruct.reset();
        run.wave = S.wave; run.wavesCleared = S.wave;
        if (own) S.runId = 1 + Math.floor(Math.random() * 1e9);
      }
      const grantStart = () => { if (V.defenses && S.cls.freeTurret) V.defenses.grant('turret'); };
      function resetRun() { resetLocal(); resetShared(true); grantStart(); }
      // a run begins on this machine: alone, as the squad's host, or joining one already under way
      function startRun() {
        resetLocal();
        const n = V.net;
        if (n && n.online) {
          // restarting after the crystal fell: the host starts everyone afresh, a guest asks it to
          if (n.host) { resetShared(true); grantStart(); } else { if (S.over) n.request('restart'); grantStart(); }
          return;
        }
        if (n && n.joined && n.joined()) { n.enter(); if (n.online) return; }                  // net decides, then calls hostStart or guestStart
        resetShared(true); grantStart();
      }
      this.hostStart = () => { resetShared(true); grantStart(); };
      this.guestStart = () => { resetShared(false); S.runId = null; grantStart(); };
      g.events.on('game:state', ({ state, prev }) => {
        if (state === 'intro' || (state === 'playing' && prev === 'title')) startRun();
        if (state !== 'paused' && S.shop) { S.shop = false; if (V.ui) V.ui.closeShop(true); }
        if (V.ui) V.ui.setVisible(state === 'playing' || state === 'intro');
      });

      // ------------------------------------------------------------ waves
      // Waves can overlap: Enter during a wave calls the next one on top of it, as often as you like. Each wave
      // in play keeps its own strength; the round ends, and pays for all of them, when the last of the dead is down.
      function startWave() {
        S.wave++; run.wave = S.wave;
        const cfg = V.composeWave(S.wave), stacked = S.phase === 'active';
        cfg.n = S.wave;
        // more players, more of the dead: six in ten again for each extra one
        const np = NET() ? NET().count() : 1;
        if (np > 1) { const pool = cfg.list.filter((t) => t !== 'boss'), extra = Math.round(pool.length * 0.6 * (np - 1)); for (let i = 0; i < extra; i++) cfg.list.splice(Math.floor(Math.random() * (cfg.list.length + 1)), 0, pool[Math.floor(Math.random() * pool.length)]); }
        if (!stacked) { S.waves = []; S.queue = []; S.sectors = []; S.spawnT = 1; }
        S.waves.push(cfg); S.cfg = cfg; S.phase = 'active';
        // the new arrivals are shuffled in among whoever is still on the way
        for (const type of cfg.list) S.queue.splice(Math.floor(Math.random() * (S.queue.length + 1)), 0, { type, cfg });
        const n = S.wave < 3 ? 2 : 3, a0 = rand(0, PI * 2);
        for (let i = 0; i < n; i++) S.sectors.push(a0 + (i * PI * 2) / n + rand(-0.5, 0.5));
        const boss = cfg.list.includes('boss');
        g.hud.warn && g.hud.warn(stacked ? `Wave ${S.wave} joins` : `Wave ${S.wave}`, 3.4);
        say(boss ? 'An abomination is coming' : stacked ? `${cfg.list.length} more on the way — ${S.waves.length} waves at once` : `${cfg.list.length} zombies approaching`, 3.6);
        V.audio.play('bell'); g.events.emit('holdout:wave', { wave: S.wave, count: cfg.list.length });
        try { g.audio.setIntensity(1); } catch (e) { /* silent audio */ }
        { const net = NET(); if (net) net.emit('wv', { t: 's', n: S.wave, c: cfg.list.length, b: boss ? 1 : 0, k: stacked ? S.waves.length : 0 }); }
      }
      function spawnOne(type, cfg) {
        const d = diff(), mods = { hpMult: cfg.hpMult * d.hp, speedMult: cfg.speedMult, dmgMult: 1 };
        const graves = (W.yard && W.yard.graves) || [];
        if (type !== 'boss' && type !== 'brute' && Math.random() < cfg.riserChance && graves.length) {
          for (let i = 0; i < 10; i++) {
            const gr = graves[Math.floor(Math.random() * graves.length)];
            if (Math.hypot(gr.x - p.pos.x, gr.z - p.pos.z) < 10 || !Z.nav.free(gr.x, gr.z)) continue;
            Z.spawn(type, { x: gr.x, z: gr.z }, { ...mods, rise: true });
            return true;
          }
        }
        const near = cfg.n <= 2 ? 36 : 40, far = cfg.n <= 2 ? 46 : 60;
        const at = Z.spawnPoint(S.sectors[Math.floor(Math.random() * S.sectors.length)], near, far, p.pos, 22);
        if (!at) return false;
        Z.spawn(type, at, mods);
        if (type === 'boss') { g.hud.warn && g.hud.warn('Abomination', 3.4); say('Bring it down before it reaches the crystal', 3.6); V.audio.play('growl', { gain: 1.2 }); }
        return true;
      }
      function clearWave() {
        S.phase = 'prep'; S.timer = 32;
        // every wave that was in play pays its bonus, and taking several at once pays 15% more for each extra one
        const k = Math.max(1, S.waves.length), first = S.waves.length ? S.waves[0].n : S.wave;
        if (!S.waves.length) S.waves.push({ n: S.wave });
        let bonus = 0; for (const c of S.waves) bonus += V.ECON.waveBonus(c.n);
        bonus = Math.round(bonus * (1 + 0.15 * (k - 1)));
        addMoney(bonus); healCrystal(Math.min(0.3, 0.08 * k));
        { const net = NET(); if (net) net.emit('wv', { t: 'c', n: S.wave, bonus, k, first }); }
        run.wavesCleared = S.wave; for (const c of S.waves) run.score += holdout.waveBonus * c.n;
        V.audio.play('wave_clear');
        g.hud.warn && g.hud.warn(k > 1 ? `Waves ${first}–${S.wave} cleared` : `Wave ${S.wave} cleared`, 3.6);
        say(k > 1 ? `+$${bonus} for ${k} waves at once — press B to open the armory` : `+$${bonus} bonus — press B to open the armory`, 4.5);
        S.waves = [];
        if (S.down && S.down.waiting) respawn();
        try { g.audio.setIntensity(0.15); } catch (e) { /* silent audio */ }
        g.events.emit('objective:done', { id: 'wave', index: S.wave, total: S.wave });
      }
      function waves(dt) {
        if (S.addT > 0) S.addT -= dt;
        if (guest()) return;                                          // the host counts the waves
        if (S.phase === 'prep') { S.timer -= dt; if (S.timer <= 0) startWave(); return; }
        S.spawnT -= dt;
        // more waves in play: more of the dead on their feet at once, arriving faster (up to what the machine can draw)
        const k = S.waves.length;
        let cap = 0, gap = 9; for (const c of S.waves) { cap = Math.max(cap, c.maxAlive); gap = Math.min(gap, c.interval); }
        cap = Math.min(MAX_ALIVE, cap + 9 * (k - 1)); gap /= Math.sqrt(k);
        if (S.queue.length && S.spawnT <= 0 && Z.aliveCount() < cap) {
          S.spawnT = gap * rand(0.55, 1.45);
          const e = S.queue.shift();
          if (!spawnOne(e.type, e.cfg)) S.queue.push(e);
        }
        if (!S.queue.length && Z.aliveCount() === 0) clearWave();
      }
      const MAX_ALIVE = 76;
      this.remaining = () => (guest() ? S.left : S.queue.length + Z.aliveCount());
      this.skipPrep = () => { if (S.phase === 'prep' && S.timer > 0.3) S.timer = 0.3; };
      // Enter: start the next wave now, or pile it on the one already in play
      this.callWave = () => { if (S.over || S.addT > 0 || (g.game.state !== 'playing' && !NET())) return; S.addT = 0.12; if (guest()) { NET().request('wave'); return; } if (S.phase === 'prep') S.timer = 0; startWave(); };

      // ------------------------------------------------------------ abilities and items
      const lvl = () => S.abilityLvl, cdScale = () => Math.pow(0.82, S.abilityLvl - 1);
      function classAbility() {
        if (S.cd.ability > 0 || S.down || !p.alive) { V.audio.play('deny'); return; }
        const a = S.cls.ability, L = lvl();
        S.cd.ability = a.cd * cdScale();
        if (a.id === 'adrenaline') { S.buff.adrenaline = 8 + 2 * (L - 1); V.audio.play('heal', { pitch: 1.4 }); say('Adrenaline', 1.6); }
        else if (a.id === 'sanctify') {
          p.heal(50 + 25 * L); healCrystal(0.04 + 0.02 * L); healDefenses(0.4 + 0.2 * L);
          aoe(p.pos.x, p.pos.z, 8 + L, 90 + 50 * L, 0, 4, 0.8, 0);
          burst(p.pos, [1.4, 1.1, 0.5], 8 + L); V.audio.play('aegis', { pitch: 1.5 }); say('Sanctify', 1.6);
        } else if (a.id === 'overclock') { S.buff.overclock = 10 + 3 * (L - 1); healDefenses(1); if (guest()) NET().request('oc', S.buff.overclock); V.audio.play('aegis', { pitch: 2 }); say('Overclock', 1.6); }
        else if (a.id === 'flareshot') {
          const o = p.eye.clone(), d = p.forward.clone(), hit = g.physics.raycast(o, d, 60), at = hit ? hit.point.clone().addScaledVector(d, -0.3) : o.clone().addScaledVector(d, 40);
          if (at.y < 0.15) at.y = 0.15;
          if (V.defenses) V.defenses.flareAt(at, 18 + 6 * L);
          aoe(at.x, at.z, 9 + 2 * L, 0, 0, 0, 0, 10 + 4 * L);
          V.audio.play('flare_pop', { pos: at }); say('Flare shot', 1.6);
        }
      }
      // something that reaches every zombie in a circle: damage (falling off to nothing at `fall` metres), a shove, a mark
      function applyAoe(x, z, r, dmg, fall, kb, stun, mark, by) {
        Z.forEachInRadius(x, z, r, (zb, d) => { if (mark) zb.marked = mark; if (dmg) zb.damage(dmg * (fall ? Math.max(0, 1 - d / fall) : 1), null, null, 'body', { by }); if (kb) Z.knockback(zb, zb.pos.x - x, zb.pos.z - z, kb, stun); });
      }
      function aoe(x, z, r, dmg, fall, kb, stun, mark) { if (guest()) NET().request('aoe', [r2(x), r2(z), r, dmg, fall, kb, stun, mark]); else applyAoe(x, z, r, dmg, fall, kb, stun, mark, 'player'); }
      function healDefenses(f) { if (!V.defenses) return; if (guest()) NET().request('dheal', f); else V.defenses.healAll(f); }
      // an expanding ring of light and dust, used by shockwave and sanctify
      function burst(pos, col, radius) {
        try { for (let i = 0; i < 14; i++) { const a = (i / 14) * PI * 2, q = new T.Vector3(pos.x + Math.cos(a) * radius * 0.5, pos.y + 0.4, pos.z + Math.sin(a) * radius * 0.5); g.fx.dust(q, new T.Vector3(Math.cos(a), 0.3, Math.sin(a)), 1.4, col[0] * 0.5, col[1] * 0.5, col[2] * 0.5); } } catch (e) { /* optional */ }
        if (g.render.lightPool) g.render.lightPool.flash(new T.Vector3(pos.x, pos.y + 1.2, pos.z), new T.Color(col[0], col[1], col[2]).getHex(), 120, radius * 2.2, 0.35);
        p.addShake(0.3);
      }
      function shockwave() {
        if (!S.perks.shockwave) return;
        if (S.cd.shock > 0 || S.down) { V.audio.play('deny'); return; }
        S.cd.shock = 30;
        aoe(p.pos.x, p.pos.z, 9, 140, 14, 11, 1.6, 0);
        burst(p.pos, [0.6, 0.8, 1.6], 9); V.audio.play('shock');
      }
      function aegis() {
        if (!S.perks.aegis) return;
        if (S.cd.aegis > 0) { V.audio.play('deny'); return; }
        S.cd.aegis = 90; if (guest()) NET().request('aegis', 10); else S.crystal.shield = 10; V.audio.play('aegis'); say('Crystal Aegis', 1.8);
      }
      function useMedkit() {
        if (S.items.medkits <= 0 || S.down || p.health >= p.maxHealth) { V.audio.play('deny'); return; }
        S.items.medkits--; p.heal(S.cls.id === 'medic' ? p.maxHealth : 60); V.audio.play('heal'); say('Medkit used', 1.4);
      }
      function toggleTorch() { S.torch = !S.torch; V.audio.play('ui_click'); }
      this.actions = { classAbility, shockwave, aegis, useMedkit, toggleTorch };

      // ------------------------------------------------------------ keys
      const keys = [];
      window.addEventListener('keydown', (e) => {
        if (e.repeat || /INPUT|TEXTAREA/.test((e.target && e.target.tagName) || '')) return;
        if (S.shop) { if (e.code === 'KeyB') { e.preventDefault(); closeShop(); } return; }
        if (g.game.state !== 'playing') return;
        keys.push(e.code);
      });
      function handleKey(code) {
        if (code === 'KeyB') { openShop(); return; }
        if (code === 'Enter' || code === 'NumpadEnter') { self.callWave(); return; }
        if (S.down) return;
        if (code === 'KeyE') classAbility();
        else if (code === 'KeyZ') shockwave();
        else if (code === 'KeyX') aegis();
        else if (code === 'KeyH') useMedkit();
        else if (code === 'KeyF') toggleTorch();
        else if (code === 'KeyG' && V.defenses) V.defenses.throwGrenade();
        else if (code === 'KeyT' && V.defenses) V.defenses.throwFlare();
        else if (code === 'KeyN' && V.defenses) V.defenses.dropMine();
        else if (/^Digit[3-7]$/.test(code)) {
          const id = V.KIT_ORDER.find((k) => V.KITS[k].slot === +code.slice(5));
          if (id && S.kits[id] && id !== S.kit && w.state !== 'reload') { applyKit(id, true); applyClassStats(true); }
          else if (id && !S.kits[id]) V.audio.play('deny');
        }
      }
      function openShop() {
        if (S.shop || S.over || g.game.state !== 'playing') return;
        if (S.placing && V.defenses) V.defenses.cancelPlace(true);
        S.shop = true; g.game.pause();
        if (V.ui) V.ui.openShop();
      }
      function closeShop() { if (!S.shop) return; S.shop = false; if (V.ui) V.ui.closeShop(false); g.game.resume(); }
      this.openShop = openShop; this.closeShop = closeShop;
      this.api = { applyKit, giveKit, refillAmmo, ammoFull, magOf, applyClassStats, respawn, say, toast, resetRun, startWave, healDefenses };

      // ------------------------------------------------------------ playing together
      // what a guest asked the host to do
      this.hostRequest = (op, d, from) => {
        if (op === 'wave') self.callWave();
        else if (op === 'aoe' && Array.isArray(d)) applyAoe(+d[0], +d[1], Math.min(20, +d[2] || 0), Math.min(400, +d[3] || 0), +d[4] || 0, Math.min(15, +d[5] || 0), Math.min(3, +d[6] || 0), Math.min(30, +d[7] || 0), from);
        else if (op === 'cheal') healCrystal(Math.min(0.5, +d || 0));
        else if (op === 'aegis') S.crystal.shield = Math.max(S.crystal.shield, Math.min(15, +d || 0));
        else if (op === 'oc') S.buff.overclock = Math.max(S.buff.overclock, Math.min(30, +d || 0));
        else if (op === 'dheal') { if (V.defenses) V.defenses.healAll(Math.min(1, +d || 0)); }
        else if (op === 'place') { if (V.defenses) V.defenses.netPlace(d, from); }
        else if (op === 'restart') { if (S.over) resetShared(true); }
      };
      // the room's game in one line, published by the host four times a second
      this.netState = () => ['G', S.runId || 0, S.phase === 'prep' ? 0 : 1, S.wave, Math.ceil(Math.max(0, S.timer)), self.remaining(), S.waves.map((c) => c.n).join('.'), Math.round(S.crystal.hp), S.crystal.shield > 0 ? 1 : 0, S.over ? 1 : 0].join('|');
      this.netApply = (line) => {
        const a = String(line).split('|'); if (a[0] !== 'G' || a.length < 10) return;
        const runId = +a[1];
        if (S.runId == null) S.runId = runId; else if (S.runId !== runId) { S.runId = runId; resetShared(false); }       // the host began again
        S.phase = a[2] === '1' ? 'active' : 'prep'; S.wave = +a[3]; S.timer = +a[4]; S.left = +a[5];
        S.waves = a[6] ? a[6].split('.').map((n) => ({ n: +n })) : [];
        S.crystal.hp = +a[7]; S.crystal.shield = a[8] === '1' ? 1 : 0; run.wave = S.wave;
        if (a[9] === '1' && !S.over) crystalLost();
        if (!S.caught) { S.caught = true; if (S.wave > 1) { const extra = Math.min(5000, 350 * (S.wave - 1)); addMoney(extra); toast(`Joined at wave ${S.wave}: +$${extra} to catch up`); } }
      };
      this.netWave = (d) => {
        if (d.t === 's') {
          g.hud.warn && g.hud.warn(d.k ? `Wave ${d.n} joins` : `Wave ${d.n}`, 3.4);
          say(d.b ? 'An abomination is coming' : d.k ? `${d.c} more on the way — ${d.k} waves at once` : `${d.c} zombies approaching`, 3.6);
          V.audio.play('bell'); try { g.audio.setIntensity(1); } catch (e) { /* silent audio */ }
        } else if (d.t === 'c') {
          addMoney(+d.bonus || 0); run.wavesCleared = +d.n || run.wavesCleared; V.audio.play('wave_clear');
          g.hud.warn && g.hud.warn(d.k > 1 ? `Waves ${d.first}–${d.n} cleared` : `Wave ${d.n} cleared`, 3.6);
          say(`+$${d.bonus} bonus — press B to open the armory`, 4.5);
          if (S.down && S.down.waiting) respawn();
          try { g.audio.setIntensity(0.15); } catch (e) { /* silent audio */ }
        }
      };
      // one of the host's dead reached this player
      this.netHurt = (d) => { p.damage(+d.d || 0, new T.Vector3(+d.x, +d.y, +d.z)); if (d.kb) self.knockPlayer(p.pos.x - d.x, p.pos.z - d.z, Math.min(9, +d.kb)); };
      // this machine has just become the host of a game in progress: carry on from what it was last shown
      this.adopt = () => {
        const queued = Math.max(0, (S.left || 0) - Z.aliveCount()), pool = [];
        S.waves = S.waves.map((c) => { const full = V.composeWave(c.n); full.n = c.n; for (const t of full.list) if (t !== 'boss') pool.push({ type: t, cfg: full }); return full; });
        S.cfg = S.waves[S.waves.length - 1] || null; S.queue = [];
        for (let i = 0; i < queued && pool.length; i++) S.queue.push(pool[Math.floor(Math.random() * pool.length)]);
        const a0 = rand(0, PI * 2); S.sectors = [a0, a0 + 2.1, a0 + 4.2]; S.spawnT = 1;
        if (S.phase === 'active' && !S.waves.length) { S.phase = 'prep'; S.timer = 20; }
        if (S.runId == null) S.runId = 1 + Math.floor(Math.random() * 1e9);
      };

      // ------------------------------------------------------------ per-frame
      const fwd = new T.Vector3();
      function update(dt) {
        S.time += dt; S.hurtT += dt;
        while (keys.length) handleKey(keys.shift());
        for (const k of Object.keys(S.cd)) S.cd[k] = Math.max(0, S.cd[k] - dt);
        for (const k of Object.keys(S.buff)) S.buff[k] = Math.max(0, S.buff[k] - dt);
        if (S.crystal.shield > 0) S.crystal.shield = Math.max(0, S.crystal.shield - dt);
        if (S.invulnT > 0) { S.invulnT -= dt; if (S.invulnT <= 0 && !S.over) p.invulnerable = false; }
        crystal.setHealth(S.crystal.hp / S.crystal.max); crystal.setShield(S.crystal.shield > 0);
        if (S.over) {
          if (!S.scored) {
            S.scored = true;
            if (V.net && V.net.submit) V.net.submit(run.wavesCleared, S.kills).then((res) => { if (res && res.rank) toast(`Best vigil: wave ${res.score} · rank ${res.rank} of ${res.total}`); });
          }
          S.overT -= dt;
          if (S.overT <= 0 && g.game.state === 'playing') { p.alive = false; p.health = 0; g.events.emit('player:dead', {}); }
          return;
        }
        waves(dt);
        if (S.cls.regen && p.alive && S.hurtT > 4 && p.health < p.maxHealth) p.heal(S.cls.regen * dt);
        if (S.perks.marathon && p.sprinting && g.realism) g.realism.stamina = Math.min(1, g.realism.stamina + dt * 0.11);
        if (S.down) {
          S.down.t += dt;
          if (!S.down.waiting && S.down.t > 4) respawn();
        }
        g.hud.setObjective(S.phase === 'prep' ? (S.wave ? 'Prepare the defense' : 'Reach the church') : 'Defend the crystal');
        const tally = S.phase === 'prep' ? `Wave ${S.wave + 1} in ${Math.ceil(Math.max(0, S.timer))}s · Enter starts it` : `${S.waves.length > 1 ? `Waves ${S.waves[0].n}–${S.wave}` : `Wave ${S.wave}`} · ${self.remaining()} left · Enter adds a wave`;
        if (g.hud.setTally && tally !== S.tally) { S.tally = tally; g.hud.setTally(tally); }
        // the crystal's marker only matters once you have wandered off
        const far = Math.hypot(p.pos.x - V.CRYSTAL.x, p.pos.z - V.CRYSTAL.z) > (S.marker ? 13 : 16);
        if (far !== S.marker && g.hud.setMarkers) { S.marker = far; g.hud.setMarkers(far ? [{ id: 'crystal', short: 'CR', label: 'Crystal', pos: new T.Vector3(V.CRYSTAL.x, 1.2, V.CRYSTAL.z), kind: 'extract' }] : []); }
        if (V.defenses) V.defenses.update(dt);
      }
      this.tick = update;
      const gameUpdate = g.game.update.bind(g.game);
      g.game.update = (dt) => {
        const r = gameUpdate(dt);
        if (g.game.state === 'playing') { try { update(dt); } catch (e) { if (!update.err) { update.err = 1; console.error('[vigil] director update threw: ' + ((e && e.stack) || e)); } } }
        return r;
      };
      // things that follow the camera run right before the frame is drawn
      const renderFrame = g.render.frame.bind(g.render);
      g.render.frame = (dt) => {
        const cam = g.camera;
        if (S.down && g.game.state === 'playing') {
          // watch the church from above while down
          const a = g.time.t * 0.12;
          cam.position.set(Math.sin(a) * 15, 13.5, Math.cos(a) * 15 + 4); cam.lookAt(V.CRYSTAL.x, 1.5, V.CRYSTAL.z);
        }
        if (lights) {
          const on = S.torch && p.alive && (g.game.state === 'playing' || g.game.state === 'paused');
          lights.torch.intensity += ((on ? 70 : 0) - lights.torch.intensity) * Math.min(1, dt * 14);
          cam.getWorldDirection(fwd);
          lights.torch.position.copy(cam.position).addScaledVector(fwd, 0.25); lights.torch.position.y -= 0.12;
          lights.torch.target.position.copy(cam.position).addScaledVector(fwd, 12);
        }
        if (V.ui) V.ui.update(dt);
        if (V.net && V.net.update) V.net.update(dt);
        renderFrame(dt);
      };
      if (V.defenses) V.defenses.install(g, S);
      if (V.ui) V.ui.install(g, S);
      if (V.net && V.net.init) V.net.init(g);
      if (window.GunslingerMenu) window.GunslingerMenu.vigil(g);
      Z.prewarm();
      resetRun();
      if (V.ui) V.ui.setVisible(g.game.state === 'playing');
    },
  };
})();
