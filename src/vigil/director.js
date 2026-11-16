/* Crystal Vigil's rules, run on top of the engine's holdout state machine: waves of the dead, the crystal's
   health, money, classes and their abilities, rifle kits, perks, carried items and what happens when you go down. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const PI = Math.PI;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

  // The rifle kits are the arsenal's modelled rifles (src/arsenal.js), each keeping its own ammunition. The
  // arsenal supplies the weapon you see and hear, its attachments, recoil and handling; the numbers that decide
  // a fight here (damage, rate, magazine, spread, piercing) stay the vigil's own.
  V.KITS = {
    carbine: { id: 'carbine', weapon: 'carbine', slot: 3, name: 'KR-7 Carbine', auto: true, dmg: 40, rpm: 690, ammo: 'rifle', gives: 120, spread: 1, head: 2.2, pierce: 0, price: 2100, desc: 'Accurate, hard-hitting automatic rifle.' },
    cqb: { id: 'cqb', weapon: 'pdw', slot: 4, name: 'KR-9 PDW', auto: true, dmg: 24, rpm: 880, ammo: 'pistol', gives: 150, spread: 1.7, head: 2.0, pierce: 0, price: 850, desc: 'Suppressed, very high rate of fire. Shreds groups up close.' },
    buck: { id: 'buck', weapon: 'breacher', slot: 5, name: 'KR-12 Shotgun', auto: false, dmg: 20, rpm: 175, ammo: 'shell', gives: 24, spread: 1, pellets: 9, pelletSpread: 0.062, range: 46, head: 1.5, pierce: 0, price: 1300, desc: '12-gauge semi-automatic shotgun. Nine pellets a shell: devastating up close.' },
    dmr: { id: 'dmr', weapon: 'marksman', slot: 6, name: 'KR-7 Marksman', auto: false, dmg: 150, rpm: 230, ammo: 'rifle', gives: 60, spread: 0.3, head: 2.6, pierce: 3, price: 2900, desc: '4.5× scoped semi-auto. Rounds punch through several targets.' },
    lmg: { id: 'lmg', weapon: 'support', slot: 7, name: 'KR-7 Support', auto: true, dmg: 46, rpm: 640, ammo: 'rifle', gives: 200, spread: 1.5, head: 2.0, pierce: 1, price: 5200, move: 0.86, desc: '100-round twin drum. Slows you a little.' },
    // The two that throw shells (shells.js: `shell` names the kind; dmg is the blast at its centre). Marked `buy`: the
    // armory asks its dearer rate for them (V.ECON.costNew).
    pump: { id: 'pump', weapon: 'pump', slot: 0, name: 'WS-12 Pump Shotgun', auto: false, dmg: 26, rpm: 66, ammo: 'shell', gives: 24, spread: 1, pellets: 12, pelletSpread: 0.05, range: 52, head: 1.5, pierce: 0, price: 1800, desc: 'Pump-action 12-gauge. Twelve pellets a shell, each hitting harder than the KR-12\'s nine, worked by hand between shots.' },
    flak: { id: 'flak', weapon: 'flak', slot: 8, name: 'FK-40 Flak Cannon', auto: false, dmg: 250, rpm: 60, ammo: 'flak', gives: 8, spread: 1, head: 1, pierce: 0, price: 4500, move: 0.9, shell: 'flak', buy: true, 
      desc: 'Airburst shells: each bursts where it strikes, or beside the first thing it passes. For what flies, and for a packed doorway.' },
    rocket: { id: 'rocket', weapon: 'rocket', slot: 9, name: 'RL-90 Rocket Launcher', auto: false, dmg: 950, rpm: 30, ammo: 'rocket', gives: 3, spread: 1, head: 1, pierce: 0, price: 7000, move: 0.84, shell: 'rocket', buy: true, 
      desc: 'One rocket in the tube and a long reload. The blast breaks the dead, stone and timber, and you if you stand within five metres.' },
  };
  V.KIT_ORDER = ['carbine', 'cqb', 'buck', 'dmr', 'lmg', 'pump', 'flak', 'rocket'];
  V.KIT_START = [];                                                        // a night begins with the pistol alone: every rifle is bought
  // Ammunition. There are no magazines and nothing is reloaded: a gun fires from what is carried of the kind it
  // takes (a kit's `ammo`), and guns of a kind share it. cap: how much can be carried; unit: what one round costs
  // at the pile before the night's rate (V.ECON.cost). A gun bought comes with `gives` rounds. The sidearms draw
  // on none of it and never run dry.
  V.AMMO = {
    pistol: { name: '9 mm', short: '9 MM', cap: 240, unit: 0.4 },              // the PDW
    rifle: { name: 'rifle rounds', short: 'RIFLE', cap: 300, unit: 0.6 },      // the carbine, the marksman's rifle, the support gun
    shell: { name: 'shells', short: 'SHELLS', cap: 48, unit: 2.5 },            // both shotguns
    flak: { name: 'flak shells', short: 'FLAK', cap: 16, unit: 22 },
    rocket: { name: 'rockets', short: 'ROCKETS', cap: 6, unit: 65 },
  };
  // Each visit to the pile costs this much more than the one before, whatever is bought (the first costs nothing extra).
  V.AMMO_RISE = 20;
  // A visit to the pile. need: { kind: rounds short of full }; money: what there is to spend; fee: what the visit
  // costs on top of the rounds. Everything short is bought if it can be paid for; if not, the fee and then the
  // same share of every kind, for what is left.
  V.ammoBill = (need, money, fee = 0) => {
    const rate = V.ECON.cost || 1, kinds = Object.keys(need).filter((t) => V.AMMO[t] && need[t] > 0);
    let rounds = 0; for (const t of kinds) rounds += need[t] * V.AMMO[t].unit * rate;
    rounds = Math.ceil(rounds);
    if (!(rounds > 0)) return { cost: 0, spent: 0, buy: {} };
    fee = Math.max(0, Math.round(+fee || 0));
    const cost = rounds + fee, buy = {};
    if (money >= cost) { for (const t of kinds) buy[t] = need[t]; return { cost, spent: cost, buy }; }
    const f = Math.max(0, money - fee) / rounds; let spent = 0;
    for (const t of kinds) { const n = Math.floor(need[t] * f); if (n > 0) { buy[t] = n; spent += n * V.AMMO[t].unit * rate; } }
    if (!(spent > 0)) return { cost, spent: 0, buy: {} };
    return { cost, spent: Math.min(Math.floor(Math.max(0, money)), Math.ceil(spent) + fee), buy };
  };
  // Mending. A repair costs a share of what the thing is worth, for the share of it that is gone: the crystal
  // whole is worth `crystal`; a guard or a turret, `defense` of its price new (V.DEF).
  V.REPAIR = { crystal: 3000, defense: 0.6 };
  // parts: [{ worth, gone }], gone from 0 (whole) to 1 (all of it). What mending all of them costs.
  V.repairCost = (parts) => { let c = 0; for (const p of parts || []) c += Math.max(0, +p.worth || 0) * Math.max(0, Math.min(1, +p.gone || 0)); return Math.ceil(c); };
  // Both carried from the start; one is in the holster at a time (2 with a sidearm out changes it).
  V.SIDEARMS = {
    sidearm: { id: 'sidearm', weapon: 'sidearm', name: 'PAC-4 Sidearm', dmg: 38, head: 2.2, pierce: 0, price: 0, desc: 'Standard 9 mm duty pistol. Never runs dry.' },
    heavy: { id: 'heavy', weapon: 'heavy', name: 'PAC-45 Heavy', dmg: 66, head: 2.4, pierce: 1, price: 1100, desc: '.45 Super with a laser. Slower, and each round goes through the first body.' },
  };
  V.SIDEARM_ORDER = ['sidearm', 'heavy'];
  const KIT_OF = {}, SIDEARM_OF = {};
  for (const k of Object.values(V.KITS)) KIT_OF[k.weapon] = k.id;
  for (const s of Object.values(V.SIDEARMS)) SIDEARM_OF[s.weapon] = s.id;
  V.CLASSES = {
    soldier: { id: 'soldier', name: 'Soldier', tag: 'Frontline rifleman', hp: 110, speed: 1.0, passive: '+15% bullet damage', dmgMult: 1.15, items: { grenades: 2 },
      ability: { id: 'adrenaline', name: 'Adrenaline', cd: 45, desc: 'For 8s: +50% fire rate and half recoil.' } },
    medic: { id: 'medic', name: 'Medic', tag: 'Keeps everything alive', hp: 100, speed: 1.0, passive: 'Regenerates health when not being hit', regen: 3, items: { medkits: 2 },
      ability: { id: 'sanctify', name: 'Sanctify', cd: 40, desc: 'Heals you, your guards and the crystal, and burns nearby zombies.' } },
    engineer: { id: 'engineer', name: 'Engineer', tag: 'Builds the defense', hp: 100, speed: 1.0, passive: 'Defenses cost 30% less; turrets hit 25% harder; starts with a free turret', defDiscount: 0.7, turretMult: 1.25, freeTurret: true, items: { mines: 1 },
      ability: { id: 'overclock', name: 'Overclock', cd: 50, desc: 'Repairs all defenses and doubles turret fire rate for 10s.' } },
    scout: { id: 'scout', name: 'Scout', tag: 'Fast marksman', hp: 90, speed: 1.15, passive: '+15% move speed, +50% headshot damage, bonus cash for headshots', headBonus: 1.5, headCash: 15, items: { flares: 3 },
      ability: { id: 'flareshot', name: 'Flare Shot', cd: 35, desc: 'Fires a flare where you aim: lights the area and marks zombies (+50% damage taken).' } },
  };
  V.CLASS_ORDER = ['soldier', 'medic', 'engineer', 'scout'];
  // cost: what every price in the armory is multiplied by (ui.js `priceOf`); costNew: the same for a gun that is
  // not in the starting rack
  V.ECON = { startMoney: 500, waveBonus: (n) => 200 + 75 * n, headshotBonus: 10, defenseKillShare: 0.6, cost: 1.25, costNew: 2 };
  V.CRYSTAL_HP = 3000;

  // The spawn list for wave n (1-based).
  V.composeWave = (n) => {
    const total = Math.min(95, Math.round(7 + n * 3.4 + Math.pow(n, 1.35))), list = [];
    const brutes = n >= 5 ? Math.min(8, Math.floor((n - 3) / 2)) : 0, bosses = n % 5 === 0 ? n / 5 : 0;
    const runnerP = n < 2 ? 0 : Math.min(0.34, 0.08 + n * 0.022), spitterP = n < 4 ? 0 : Math.min(0.16, 0.04 + n * 0.012);
    // wolves from the third wave, bursters from the fourth, pyres from the sixth: each a small share that grows
    const wolfP = n < 3 ? 0 : Math.min(0.09, 0.025 + n * 0.008), burstP = n < 4 ? 0 : Math.min(0.06, 0.02 + n * 0.005), pyreP = n < 6 ? 0 : Math.min(0.05, 0.015 + n * 0.004);
    const steps = [['runner', runnerP], ['spitter', spitterP], ['wolf', wolfP], ['burster', burstP], ['pyre', pyreP]];
    // What is not a person takes a share of its own off the top (beastP), so the rest keep the mix they had: spiders
    // from the fourth wave, bats from the fifth (one place in the list is a pack of three), flying skulls from the
    // sixth, demons from the seventh; and like the brutes a fixed few great spiders from the ninth.
    const beastP = n < 4 ? 0 : Math.min(0.2, 0.04 + n * 0.012), greats = n >= 9 ? Math.min(3, Math.floor((n - 6) / 3)) : 0;
    const beasts = [['spider', 4], ['bat', n >= 5 ? 1 : 0], ['skull', n >= 6 ? 2.5 : 0], ['demon', n >= 7 ? 2 : 0]], beastW = beasts.reduce((a, b) => a + b[1], 0);
    for (let i = 0; i < total - brutes - greats; i++) {
      let r = Math.random(), t = 'walker';
      if (r < beastP) { let q = (r / beastP) * beastW; for (const [type, w] of beasts) { if (q < w) { t = type; break; } q -= w; } }
      else { r = (r - beastP) / (1 - beastP); for (const [type, p] of steps) { if (r < p) { t = type; break; } r -= p; } }
      list.push(t);
    }
    // the wave a kind first comes in has one of it for certain, in a walker's place
    for (const [type, first] of [['spider', 4], ['bat', 5], ['skull', 6], ['demon', 7]]) if (n === first && !list.includes(type)) { const i = list.indexOf('walker'); if (i >= 0) list[i] = type; }
    for (let i = 0; i < brutes; i++) list.push('brute');
    for (let i = 0; i < greats; i++) list.push('greatspider');
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    for (let i = 0; i < bosses; i++) list.splice(Math.floor(list.length * (0.35 + (0.3 * i) / Math.max(1, bosses))), 0, 'boss');
    // Where they come from. sectors: how many directions in the woods this wave favours. strayChance: the share
    // that ignores those and comes out of the trees anywhere round the ring. riserChance: up through a grave or
    // open ground. cryptChance: out of a mausoleum. The first wave is all from the trees.
    return {
      list, hpMult: 1 + 0.1 * (n - 1), speedMult: Math.min(1.3, 1 + 0.012 * (n - 1)), maxAlive: Math.min(52, 12 + n * 3), interval: Math.max(0.28, 1.15 - n * 0.06),
      sectors: Math.min(6, 2 + Math.ceil(n / 2)), strayChance: Math.min(0.5, 0.2 + n * 0.03),
      riserChance: n >= 2 ? Math.min(0.3, 0.08 + n * 0.018) : 0, cryptChance: n >= 2 ? Math.min(0.16, 0.05 + n * 0.012) : 0,
    };
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
      if (V.music) V.music.install(g);
      if (V.storm) { try { V.storm.install(g); } catch (e) { console.error('[vigil] storm failed: ' + ((e && e.stack) || e)); } }
      const run = g.game.run, holdout = g.game.holdout, settings = g.game.menus.settings;
      // the engine's own mode stays "holdout" here, without overwriting the harbor's saved choice
      const harborMode = settings.mode;
      settings.mode = 'holdout';
      settings.toJSON = function () { const o = {}; for (const k of Object.keys(this)) if (k !== 'toJSON') o[k] = this[k]; o.mode = harborMode; return o; };
      holdout.killScore = { walker: 100, runner: 140, spitter: 180, brute: 500, boss: 2500, wolf: 170, burster: 200, pyre: 220, demon: 260, skull: 150, bat: 110, spider: 150, greatspider: 600 };
      g.noFireSelect = true; g.noDressing = true; g.meleeKey = 'KeyV';
      g.dashOk = () => !S.down && !S.over;                // (src/gunslinger.js: the dash; not while down)
      g.jumpApex = 1.35;                                  // the altar's top is 1.1 m above its dais and 1.26 m above the chancel floor

      const S = (this.S = {
        money: 0, wave: 0, phase: 'prep', timer: 14, queue: [], waves: [], addT: 0, spawnT: 0, cfg: null, sectors: [], cryptT: [0, 0, 0, 0, 0, 0, 0, 0], time: 0, left: 0, runId: 1,
        crystal: { hp: V.CRYSTAL_HP, max: V.CRYSTAL_HP, shield: 0 }, over: false, overT: 0,
        cls: V.CLASSES.soldier, nextClass: this.classId(), items: { grenades: 0, flares: 0, medkits: 0, mines: 0 }, armor: 0, tokens: 1, tokensBought: 0, ammoBuys: 0,
        perks: {}, abilityLvl: 1, cd: { ability: 0, shock: 0, aegis: 0 }, buff: { adrenaline: 0, overclock: 0 },
        kits: {}, kit: null, ammo: {}, pile: null, sidearm: 'sidearm', down: null, hurtT: 9, torch: false, kills: 0, headshots: 0, earned: 0, shop: false, placing: null,
      });
      const stats = g.combat.stats, base = {};
      for (const id of ['rifle', 'pistol']) { const d = w.rigs[id].def; base[id] = { rpm: d.rpm, spread: { ...d.spread }, magSize: d.magSize, reserve: d.reserve }; }
      const baseFovAds = p.tuning.fovAds;
      const diff = () => DIFF[g.game.difficulty] || DIFF.hard;
      // What the skills change. FX: the title screen's tree (skills.js), read at the start of every night and fixed
      // for it. RX: the night's own skills, bought with lifeforce in the armory (lifeforce.js); they apply at once
      // (learnSkill) and are gone when the night ends.
      let FX = V.skillFx ? V.skillFx({}) : null;
      let RX = V.riteFx ? V.riteFx({}) : { recoil: 1, rate: 1, door: 1, harvest: 1, guard: 1 };
      this.fx = () => FX; this.rx = () => RX;
      // things a kill or a blow sets off that reach the dead themselves wait for the next frame: they are decided
      // in the middle of the dead being stepped through
      const later = [];
      const say = (text, secs) => g.hud.message && g.hud.message(text, secs || 3);
      const toast = (text) => { if (V.ui) V.ui.toast(text); };
      // playing together (net.js): the host's machine decides what the room shares; a guest's only shows it
      const NET = () => (V.net && V.net.online ? V.net : null), guest = () => { const n = NET(); return !!(n && !n.host); };
      const r2 = (v) => Math.round(v * 100) / 100;

      // ------------------------------------------------------------ kits
      // No magazines and nothing to reload: a gun fires from what is carried of the kind of round it takes (V.AMMO),
      // and guns that take the same kind share it. How much can be carried grows with Deep Pouches and the Bandolier.
      const capOf = (type) => Math.round(V.AMMO[type].cap * FX.reserve * (S.perks.extmag ? 1.4 : 1));
      const typeOf = (id) => (V.KITS[id] ? V.KITS[id].ammo : null);
      // the kind the rifle rig holds just now is counted on the rig (whichever weapon is in hand); the rest in S.ammo
      const live = (type) => !!S.kit && typeOf(S.kit) === type;
      const have = (type) => (live(type) ? Math.max(0, w.rigs.rifle.slot.ammo | 0) : S.ammo[type] || 0);
      function setAmmo(type, n) {
        const cap = capOf(type); n = clamp(Math.round(n), 0, cap); S.ammo[type] = n;
        if (live(type)) { const rig = w.rigs.rifle; rig.def.magSize = rig.slot.magSize = cap; rig.slot.ammo = n; }
      }
      const addAmmo = (type, n) => setAmmo(type, have(type) + n);
      // The vigil's numbers go onto the rifle rig, over whatever the arsenal composed for the weapon. The rig's
      // magazine is all that is carried of the kind and its reserve is nothing, so the engine never reloads it.
      function kitStats(id) {
        const k = V.KITS[id], rig = w.rigs.rifle, d = rig.def;
        if (!k || !S.kits[id]) return false;
        S.kit = id;
        const cap = capOf(k.ammo);
        d.rpm = k.rpm; d.auto = k.auto; d.magSize = cap; d.reserve = 0; d.damage = k.dmg; d.range = k.range || 350;
        for (const key of Object.keys(base.rifle.spread)) d.spread[key] = base.rifle.spread[key] * (key === 'shot' || key === 'decay' ? 1 : k.spread);
        rig.slot.magSize = cap; rig.slot.ammo = Math.min(S.ammo[k.ammo] || 0, cap); rig.slot.reserve = 0; rig.slot.name = k.name;
        if (g.realism) g.realism.semi = !k.auto;
        return true;
      }
      function sidearmStats(id) {
        const s = V.SIDEARMS[id], rig = w.rigs.pistol, d = rig.def;
        if (!s) return false;
        S.sidearm = id;
        // a sidearm never runs dry and is never reloaded: what is in it is without end, and there is nothing behind it
        d.damage = s.dmg; d.reserve = 0;
        rig.slot.reserve = 0; rig.slot.ammo = Infinity; rig.slot.name = s.name;
        return true;
      }
      // With the arsenal (src/gunslinger.js) every change of weapon passes through these, whoever asked for it:
      // a kit key, the wheel, Q, the gunsmith's tabs. Without it the kits only change the rifle's numbers.
      const A = () => g.arsenal || null;
      // every kit bought this night, and both sidearms (Q draws whichever was last in hand)
      g.arsenalOwns = (weaponId) => (KIT_OF[weaponId] ? !!S.kits[KIT_OF[weaponId]] : !!SIDEARM_OF[weaponId]);
      g.arsenalLeave = (cfg, rig) => {
        // only the kit whose rounds the rig is counting writes them back: the rig may hold a weapon that was never the
        // kit in hand (the carbine sits on it before any rifle is bought), and its empty magazine is nobody's ammunition
        if (cfg.rig === 'rifle' && S.kit && KIT_OF[cfg.id] === S.kit) S.ammo[typeOf(S.kit)] = Math.max(0, rig.slot.ammo | 0);
      };
      g.arsenalEnter = (cfg) => {
        if (cfg.rig === 'rifle' ? kitStats(KIT_OF[cfg.id]) : sidearmStats(SIDEARM_OF[cfg.id])) applyClassStats(true);
      };
      // what the HUD shows for rounds: the pistol's are without end, a rifle's are all that is carried of its kind
      g.gsAmmo = () => (w.current === 'pistol' || !S.kit ? '\u221e' : Math.max(0, w.rigs.rifle.slot.ammo | 0) + ' ' + V.AMMO[typeOf(S.kit)].short);
      // the same for the gun panel: the count, what it is out of, and how full that is
      g.gsAmmoInfo = () => {
        if (w.current === 'pistol' || !S.kit) return { n: '\u221e', of: 'SIDEARM', frac: 1 };
        const t = typeOf(S.kit), n = Math.max(0, w.rigs.rifle.slot.ammo | 0), cap = capOf(t);
        return { n: String(n), of: '/' + cap + ' ' + V.AMMO[t].short, frac: cap ? n / cap : 0 };
      };
      function applyKit(id, announce) {
        const k = V.KITS[id], rig = w.rigs.rifle;
        if (!k || !S.kits[id]) return false;
        const a = A();
        if (a) {
          // a kit key draws the rifle; a purchase in the paused armory only loads it
          if (!(announce && a.select(k.weapon))) a.load(k.weapon);
        } else {
          const t = typeOf(S.kit); if (t && S.kit !== id) S.ammo[t] = Math.max(0, rig.slot.ammo | 0);
          kitStats(id);
        }
        if (announce) { say(k.name, 1.6); if (!a) V.audio.play('weapon_draw'); }
        return true;
      }
      // a gun bought comes with some of what it fires
      function giveKit(id, equip) { const k = V.KITS[id]; if (!k) return; if (!S.kits[id]) { S.kits[id] = true; addAmmo(k.ammo, k.gives || 0); } if (equip) applyKit(id, true); }
      function giveSidearm(id) {
        const s = V.SIDEARMS[id], a = A();
        if (!s) return false;
        S.sidearm = id;
        if (a) a.load(s.weapon); else sidearmStats(id);
        return true;
      }
      // ---- the ammunition pile (yard.js `pile`): what is short of full for the guns owned, what that costs, a visit
      const ammoNeed = () => { const need = {}; for (const id of Object.keys(S.kits)) { const t = typeOf(id), n = capOf(t) - have(t); if (n > 0) need[t] = n; } return need; };
      // (every visit this night has made the next one dearer: V.AMMO_RISE)
      const ammoFee = () => V.AMMO_RISE * (S.ammoBuys | 0);
      const ammoCost = () => V.ammoBill(ammoNeed(), Infinity, ammoFee()).cost;
      function buyAmmo() {
        const bill = V.ammoBill(ammoNeed(), S.money, ammoFee());
        if (!(bill.spent > 0)) { V.audio.play('deny'); if (bill.cost > 0) say('Not enough for ammunition', 1.4); return false; }
        S.money -= bill.spent; S.ammoBuys = (S.ammoBuys | 0) + 1; for (const t of Object.keys(bill.buy)) addAmmo(t, bill.buy[t]);
        V.audio.play('purchase'); say(bill.spent < bill.cost ? 'Ammunition: all you could pay for' : 'Ammunition full', 1.6);
        return true;
      }

      // ------------------------------------------------------------ shooting
      const vec = (v) => new T.Vector3(v.x, v.y, v.z);
      const dmgMult = () => (S.cls.dmgMult || 1) * (S.perks.hollow ? 1.2 : 1) * FX.dmg * (1 + (RX.spree || 0) * (S.spree || 0));
      g.combat.playerShot = (origin, dir) => {
        stats.shots++;
        const pistol = w.current === 'pistol', k = pistol ? V.SIDEARMS[S.sidearm] : V.KITS[S.kit], R = g.realism || { stamina: 1, suppression: 0 };
        // the wild dead hear it: a suppressed weapon a few paces off, anything else across half the yard
        if (V.wild) V.wild.noise(origin.x, origin.z, A() && A().held() && A().held().suppressed ? 8 : pistol ? 20 : 27);
        const speed = (A() && A().held() && A().held().speed) || (pistol ? 360 : 820);
        const unstable = (1 - R.stamina) * 0.0018 + R.suppression * 0.002, n = k.pellets || 1;
        if (!pistol && k.shell && V.shells) {
          // not a bullet: a shell that flies, drops or burns, and bursts (shells.js). What the burst does is the
          // grenade's own path (defenses.js `explode`), so the dead, what can break and a squad all see it the same.
          const d = vec(dir);
          d.x += (Math.random() - 0.5) * unstable * 2; d.y += (Math.random() - 0.5) * unstable * 2; d.z += (Math.random() - 0.5) * unstable * 2;
          V.shells.fire(origin, d.normalize(), { kind: k.shell, damage: k.dmg * dmgMult(), from: w.muzzleWorld ? w.muzzleWorld(new T.Vector3()) : origin });
          return null;
        }
        for (let i = 0; i < n; i++) {
          const d = vec(dir), sp = unstable + (n > 1 ? k.pelletSpread : 0);
          d.x += (Math.random() - 0.5) * sp * 2; d.y += (Math.random() - 0.5) * sp * 2; d.z += (Math.random() - 0.5) * sp * 2;
          d.normalize();
          if (i === 0) { const n = NET(); if (n) n.shot(origin, d); }
          const b = g.ballistics.fire(origin, d, { speed, damage: k.dmg * dmgMult(), range: k.range || (pistol ? 120 : 350) });
          if (b) { b.pierce = (k.pierce || 0) + FX.pierce; b.head = k.head * (S.cls.headBonus || 1) * FX.head; }
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
      // what fights the kick: the kept tree's Steady Aim, the night's Steady Hands, the armory's harness, adrenaline
      const recoilK = () => (FX.recoil || 1) * RX.recoil * (S.perks.brace ? 0.7 : 1) * (S.buff.adrenaline > 0 ? 0.5 : 1);
      this.recoil = recoilK; g.recoilSkill = recoilK;                     // (the pattern's sideways walk is steadied by the same skills)
      p.addRecoil = (a, b) => { const k = recoilK(); addRecoil(a * k, b * k); };
      const weaponUpdate = w.update.bind(w);
      w.update = (dt) => {
        // nothing is reloaded: what a perk or a skill once did for the change of a magazine it now does for the rate of fire
        const K = V.KITS[S.kit];
        if (K) { w.rigs.rifle.def.rpm = K.rpm * RX.rate * FX.reload * (S.perks.quickhands ? 1.15 : 1) * (S.buff.adrenaline > 0 ? 1.5 : 1); if (g.realism) g.realism.semi = !K.auto; }
        if (w.rigs.pistol.slot.ammo !== Infinity) { w.rigs.pistol.slot.ammo = Infinity; w.rigs.pistol.slot.reserve = 0; }
        // with no rifle bought there is only the pistol to hold
        if (!S.kit && w.current !== 'pistol' && w.equip && !w.pending && g.game.state === 'playing') w.equip('pistol');
        if (S.placing || S.down) g.input.fire = false;
        weaponUpdate(dt);
        if (K) S.ammo[K.ammo] = Math.max(0, w.rigs.rifle.slot.ammo | 0);
      };
      this.modifyDamage = (amount, z, part, info) => {
        const out = info && info.by === 'player' && (z.type === 'brute' || z.type === 'boss') ? amount * FX.big : amount;
        // the number that rises off the body (ui.js)
        if (info && info.by === 'player' && V.ui && V.ui.hit && g.game.state === 'playing') V.ui.hit(z, out, part === 'weak' || part === 'head');
        return out;
      };

      // ------------------------------------------------------------ money
      function addMoney(n) { n = Math.round(n); S.money += n; S.earned += Math.max(0, n); }
      g.events.on('enemy:killed', (e) => {
        if (!e || !e.enemy || !e.enemy.flesh || g.game.state === 'title') return;
        // whoever killed it, it leaves its lifeforce over the body for this player to gather
        if (V.wisps && e.enemy.pos) V.wisps.spawn(e.enemy.pos, e.enemy.type, e.enemy.scale);
        if (e.by !== 'player' && e.by !== 'defense') return;                                          // someone else's kill
        if (e.by === 'defense' && e.owner && V.net && V.net.id && e.owner !== V.net.id) return;      // someone else's turret
        if (e.by === 'player' && guest() && g.hud.hitmarker) g.hud.hitmarker('kill');
        const c = e.enemy.cfg; let cash = c.reward;
        S.kills++;
        if (e.by === 'defense') cash *= V.ECON.defenseKillShare;
        else { if (e.head) { cash += V.ECON.headshotBonus + (S.cls.headCash || 0); S.headshots++; } }
        if (S.perks.scavenger) cash *= 1.25;
        if (e.by === 'player') cash *= FX.money;
        const got = Math.round(cash * diff().money), z = e.enemy;
        addMoney(got);
        if (g.hud.feed) g.hud.feed(`<b>${z.type.toUpperCase()}</b><em>+$${got}</em>`);
        // the money rises off the body: you see what each kill paid, where it happened
        if (V.ui && z.pos) V.ui.cashPop({ x: z.pos.x, y: z.pos.y + (z.crawling ? 0.55 : 1.3 * (z.scale || 1)), z: z.pos.z }, got, e.by === 'defense' ? 'def' : e.head ? 'head' : '');
        if (e.by === 'player') reaped(z, !!e.head);
      });
      // the night's skills that answer a kill made by this player's own hand
      function reaped(z, head) {
        if (RX.leech && p.alive && !S.down) p.heal(RX.leech);
        if (RX.spree) { S.spree = Math.min(10, (S.spree || 0) + 1); S.spreeT = 3; }
        if (!head) return;
        if (RX.spoils && w.current !== 'pistol' && S.kit) { const sl = w.rigs.rifle.slot; sl.ammo = Math.min(sl.magSize, sl.ammo + RX.spoils); }
        if (RX.shatter && z.pos) { const x = z.pos.x, zz = z.pos.z, y = z.pos.y, d = RX.shatter; later.push(() => { aoe(x, zz, 3, d, 0, 3, 0.3, 0); try { g.fx.dust(new T.Vector3(x, y + 1.4, zz), new T.Vector3(0, 1, 0), 1.2, 0.5, 0.45, 0.4); } catch (err) { /* optional */ } }); }
      }
      g.events.on('player:hitEnemy', (e) => { if (g.hud.hitmarker) g.hud.hitmarker(e.killed ? 'kill' : e.weak ? 'weak' : 'hit'); });

      // ------------------------------------------------------------ crystal
      function damageCrystal(n, z) {
        if (S.over || S.crystal.shield > 0 || guest()) return;
        S.crystal.hp = Math.max(0, S.crystal.hp - n * diff().dmg * RX.guard);
        crystal.hit(Math.min(2, n / 12));
        V.audio.play('crystal_hit', { pos: [V.CRYSTAL.x, V.CRYSTAL.y, V.CRYSTAL.z], gain: 0.9 });
        if (S.crystal.hp <= S.crystal.max * 0.3 && !S.warned30) { S.warned30 = true; g.hud.radio && g.hud.radio('The crystal is failing. Get back to the church.', 3.4); }
        if (S.crystal.hp <= 0) crystalLost();
      }
      function healCrystal(frac) { if (guest()) { NET().request('cheal', frac); return; } S.crystal.hp = Math.min(S.crystal.max, S.crystal.hp + S.crystal.max * frac); if (S.crystal.hp > S.crystal.max * 0.4) S.warned30 = false; }
      function crystalLost() {
        S.over = true; S.overT = 1.6;
        // the next night begins at the last wave of five this one reached (lost at 13: from 10), with a first wave's money and the pistol
        const back = Math.floor(S.wave / 5) * 5;
        if (back >= 5 && V.reach) V.reach.set(back);
        startWant = back >= 5 ? back : 1; S.backTo = startWant;
        if (SV && S.saveMine) { SV.clear(); S.saveMine = false; }                     // a night that was lost cannot be taken up again
        crystal.setHealth(0); crystal.shatter(); V.audio.play('crystal_break');
        if (lights) lights.dim = 0.25;
        p.invulnerable = true;
      }
      this.damageCrystal = damageCrystal; this.healCrystal = healCrystal; this.addMoney = addMoney;

      // ------------------------------------------------------------ lifeforce
      // Gathered by walking into a wisp (lifeforce.js); spent in the armory's Lifeforce tab on the night's own skills.
      let lifeAt = -9, lifeRun = 0, lifeFrac = 0;
      function gather(n) {
        // Rich Harvest's share is kept to the fraction, so it is never rounded away
        lifeFrac += n * RX.harvest; const got = Math.floor(lifeFrac + 1e-6); lifeFrac -= got;
        V.life.add(got);
        if (RX.tithe) addMoney(RX.tithe * n);
        if (RX.nova) {
          S.novaCharge = (S.novaCharge || 0) + got;
          if (S.novaCharge >= V.LIFE.nova) { S.novaCharge -= V.LIFE.nova; later.push(() => { aoe(p.pos.x, p.pos.z, 8, 220, 12, 8, 0.8, 0); burst(p.pos, [0.3, 1.6, 0.7], 8); V.audio.play('shock', { pitch: 1.3 }); }); }
        }
        n = got;
        lifeRun = g.time.t - lifeAt < 0.7 ? Math.min(8, lifeRun + 1) : 0; lifeAt = g.time.t;                 // several in a row ring upward
        V.audio.play('life_pick', { gain: 0.85, pitch: 1 + lifeRun * 0.06 });
        if (V.ui && V.ui.lifeGain) V.ui.lifeGain(n);
        if (!S.lifeTold) { S.lifeTold = true; toast('Lifeforce: spend it in the armory <kbd>B</kbd>, on skills that last the night'); }
      }
      // A rank of the night's skills, bought with lifeforce: it is read wherever it matters from the next frame on.
      function setRx() { RX = V.life ? V.life.fx() : RX; if (V.wisps && V.wisps.setReach) V.wisps.setReach(RX.reach || 0); }
      function learnSkill(id) {
        if (!V.life || !V.life.buy(id)) return false;
        setRx();
        return true;
      }
      // lifeforce traded for money: n points, or everything held; returns the dollars paid
      function sellLife(n) {
        if (!V.life) return 0;
        n = n === 'all' ? V.life.have : Math.round(+n || 0);
        if (!V.life.take(n)) return 0;
        const paid = n * V.LIFE.cash; addMoney(paid);
        return paid;
      }

      // ------------------------------------------------------------ the player
      const playerDamage = p.damage.bind(p);
      p.damage = (amount, from) => {
        if (!p.alive || p.invulnerable || !(amount > 0) || S.down) return;
        if (NET() && g.game.state !== 'playing') return;              // in a menu while the squad fights on: out of it, and ignored by the dead
        amount *= diff().dmg * (S.perks.thickskin ? 0.75 : 1) * FX.resist * (p.health < p.maxHealth / 3 ? RX.door : 1);
        if (S.armor > 0) { const soak = Math.min(S.armor, amount * 0.6); S.armor -= soak; amount -= soak; }
        S.hurtT = 0;
        hurtFx(amount, from);
        // Backlash: whatever is close enough to have done it is hurt and thrown back (at most once a second)
        if (RX.lash && g.time.t - lashAt > 1) { lashAt = g.time.t; const d = RX.lash; later.push(() => { aoe(p.pos.x, p.pos.z, 3, d, 0, 7, 0.5, 0); }); }
        if (p.health - amount <= 0 && g.game.state === 'playing') {
          // Borrowed Time: once a wave the blow is turned aside
          if (RX.borrow && !S.borrowed) { S.borrowed = true; S.invulnT = 3; p.invulnerable = true; burst(p.pos, [0.4, 1.5, 0.8], 4); V.audio.play('aegis', { pitch: 1.8 }); say('Borrowed time', 2); return; }
          goDown(from); return;
        }
        playerDamage(amount, from);
      };
      // Being hit is seen and heard: red closes in from the edge of the screen, thickest on the side the blow
      // came from (ui.js), and the warden grunts. Badly hurt, a heartbeat keeps time until the health is back.
      let gruntAt = -9, beatT = 0, lashAt = -9;
      function hurtFx(amount, from) {
        if (V.ui) V.ui.hurt(amount, from);
        if (g.time.t - gruntAt < 0.3) return;
        gruntAt = g.time.t;
        V.audio.play(amount >= 20 ? 'hurt_hard' : 'hurt', { gain: Math.min(1, 0.62 + amount / 60), pitch: rand(0.94, 1.07) });
      }
      function heartbeat(dt) {
        const hf = p.maxHealth > 0 ? p.health / p.maxHealth : 1;
        if (!p.alive || S.down || S.over || hf >= 0.35) { beatT = 0.25; return; }
        beatT -= dt;
        if (beatT <= 0) { beatT = 0.58 + 1.1 * hf; V.audio.play('heart', { gain: 0.55 + (0.35 - hf) * 1.2 }); }
      }
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
        // back on your feet where the night began: outside, at the gate, with the walk to the church to make again
        const pads = (W.yard && W.yard.spawnPads) || [[2.6, -2]], pad = pads[Math.floor(Math.random() * pads.length)], st = g.level && g.level.playerStart;
        const bandages = g.realism ? g.realism.bandages : 0;
        if (st && st.pos) p.reset({ pos: st.pos.clone(), yaw: st.yaw || 0 });
        else p.reset({ pos: new T.Vector3(pad[0], V.CH.floor, pad[1]), yaw: Math.atan2(-(V.CRYSTAL.x - pad[0]), -(V.CRYSTAL.z - pad[1])) });
        applyClassStats(false); if (g.realism) g.realism.bandages = bandages;
        p.enabled = true; S.down = null; self.playerHidden = false; S.invulnT = 2.5; p.invulnerable = true;
        try { w.setVisible(true); } catch (e) { /* stub weapon */ }
        if (g.render.post) g.render.post.fade = 0.9;
        say('Back on your feet', 2);
      }
      this.knockPlayer = (dx, dz, force) => { const d = Math.hypot(dx, dz) || 1; p.vel.x += (dx / d) * force; p.vel.z += (dz / d) * force; p.vel.y = Math.max(p.vel.y, 2.5); p.addShake(0.5); };
      function applyClassStats(keepHealth) {
        const c = S.cls;
        const hp = c.hp + FX.hp;
        p.maxHealth = hp; p.health = keepHealth ? Math.min(p.health, hp) : hp;
        g.moveScale = c.speed * FX.speed * (S.perks.marathon ? 1.12 : 1) * (S.kit && V.KITS[S.kit].move && w.current !== 'pistol' ? V.KITS[S.kit].move : 1);
      }

      // ------------------------------------------------------------ run reset
      // What belongs to this player: money, kit, perks, their own body.
      function resetLocal() {
        if (V.skills) FX = V.skills.fx();
        if (V.life) V.life.reset();
        setRx();
        S.lifeTold = false; S.spree = 0; S.spreeT = 0; S.borrowed = false; S.novaCharge = 0; lifeFrac = 0; later.length = 0;
        Object.assign(S, {
          money: V.ECON.startMoney + FX.startMoney + (+g.params.money || 0), armor: 0, tokens: 1 + FX.tokens, tokensBought: 0, ammoBuys: 0, perks: {}, abilityLvl: 1, down: null, hurtT: 9, torch: false,
          kills: 0, headshots: 0, earned: 0, placing: null, invulnT: 0, caught: false, scored: false, saveMine: false, resumed: false, placeAt: null, clearedHere: 0,
        });
        S.cd.ability = S.cd.shock = S.cd.aegis = 0; S.buff.adrenaline = S.buff.overclock = 0;
        S.cls = V.CLASSES[S.nextClass] || V.CLASSES.soldier;
        S.items = { grenades: 0, flares: 0, medkits: 0, mines: 0, ...S.cls.items };
        S.items.grenades += FX.grenades; S.items.medkits += FX.medkits;
        // a night begins with the pistol alone: every rifle is bought in the armory and comes with some of what it fires
        S.kits = {}; S.kit = null; S.ammo = {}; for (const t of Object.keys(V.AMMO)) S.ammo[t] = 0;
        for (const id of V.KIT_START) giveKit(id, false);
        w.rigs.rifle.slot.ammo = 0; w.rigs.rifle.slot.reserve = 0;
        giveSidearm('sidearm');
        if (w.equip && w.current !== 'pistol') w.equip('pistol');
        if (A()) A().armory.previous = null;
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
        if (V.wild) V.wild.reset();
        if (V.wisps) V.wisps.reset();
        if (V.fire) V.fire.reset();
        if (V.blood) V.blood.reset();
        broodT.length = 0;
        if (V.shells) V.shells.reset();
        Object.assign(S, { wave: own ? Math.max(0, (+g.params.wave || startAt()) - 1) : 0, phase: 'prep', timer: 14, queue: [], waves: [], sectors: [], addT: 0, spawnT: 0, cfg: null, time: 0, over: false, overT: 0, warned30: false, left: 0 });
        S.crystal.max = Math.round(V.CRYSTAL_HP * (own ? FX.crystal : 1)); S.crystal.hp = S.crystal.max; S.crystal.shield = 0;
        crystal.reset(); if (lights) lights.dim = 1;
        try { Z.clear(); } catch (e) { /* before the first frame */ }
        if (V.defenses) V.defenses.reset();
        if (V.loose) V.loose.clearBodies();
        if (V.destruct) V.destruct.reset();
        run.wave = S.wave; run.wavesCleared = S.wave;
        if (own) S.runId = 1 + Math.floor(Math.random() * 1e9);
      }
      const grantStart = () => { if (V.defenses && S.cls.freeTurret) V.defenses.grant('turret'); };
      // A wave that is a multiple of five, once reached, can be begun from on any later night (save.js `V.reach`),
      // with the money and kit of a first wave: nothing carries over but the kept skill tree.
      let startWant = 1;
      const startAt = () => (V.reach && V.reach.allowed(startWant) ? startWant : 1);
      this.setStart = (n) => { startWant = V.reach && V.reach.allowed(+n) ? +n : 1; return startWant; };
      this.startWave = () => startAt();
      function resetRun() { resetLocal(); resetShared(true); grantStart(); }

      // ------------------------------------------------------------ a night put away and taken up again
      /* The night is written down between waves (when one is cleared, while the next is prepared for, and as it
         begins) and never during one: taken up again, it starts at the preparation before the wave that was being
         fought, with what was held then. It is this machine's own night: alone, or as the squad's host. A fresh
         night does not replace a saved one until it has cleared a wave of its own, and the saved one is thrown away when
         the crystal of the night that owns it falls (save.js keeps it; `crystalLost` clears it). */
      const SV = V.runSave || null;
      let resume = null, saveT = 0;
      function snapshot() {
        const rig = w.rigs.rifle, kits = {};
        for (const id of Object.keys(S.kits)) kits[id] = 1;
        const ammo = {}; for (const t of Object.keys(V.AMMO)) ammo[t] = have(t);
        return {
          v: 1, at: Date.now(), diff: g.game.difficulty || 'hard', wave: S.wave, time: Math.round(S.time), cls: S.cls.id,
          money: Math.round(S.money), armor: Math.round(S.armor), tokens: S.tokens, tokensBought: S.tokensBought, ammoBuys: S.ammoBuys | 0, perks: { ...S.perks }, abilityLvl: S.abilityLvl, items: { ...S.items },
          kits, ammo, kit: S.kit, sidearm: S.sidearm, hp: p.alive ? Math.round(p.health) : 0, kills: S.kills, headshots: S.headshots, earned: Math.round(S.earned), score: run.score | 0,
          crystal: { hp: Math.round(S.crystal.hp), max: S.crystal.max },
          life: V.life && V.life.doc ? V.life.doc() : null, defs: V.defenses && V.defenses.doc ? V.defenses.doc() : null, broken: V.destruct && V.destruct.netList ? V.destruct.netList() : '', things: V.destruct && V.destruct.objects ? V.destruct.objects.length : 0,
        };
      }
      function saveNow() {
        // a night that began afresh (at wave 1 or at a wave of five) writes nothing until it has cleared a wave itself
        if (!SV || guest() || S.over || S.phase !== 'prep' || S.wave < 1 || !(S.resumed || S.clearedHere > 0) || (g.game.state !== 'playing' && g.game.state !== 'paused')) return false;
        if (!SV.write(snapshot())) return false;
        S.saveMine = true;
        return true;
      }
      function restore(d) {
        const rig = w.rigs.rifle, num = (v, lo, hi) => clamp(Math.round(+v || 0), lo, hi);
        if (V.life && V.life.restore) { V.life.restore(d.life); setRx(); }
        S.perks = {}; for (const k of Object.keys(d.perks || {})) if (d.perks[k]) S.perks[k] = true;
        S.abilityLvl = num(d.abilityLvl, 1, 3); S.money = num(d.money, 0, 1e7); S.armor = num(d.armor, 0, 100); S.tokens = num(d.tokens, 0, 9); S.tokensBought = num(d.tokensBought, 0, 99); S.ammoBuys = num(d.ammoBuys, 0, 999);
        for (const k of Object.keys(S.items)) S.items[k] = num(d.items && d.items[k], 0, 9);
        S.kills = num(d.kills, 0, 1e7); S.headshots = num(d.headshots, 0, 1e7); S.earned = num(d.earned, 0, 1e9); run.kills = S.kills; run.score = num(d.score, 0, 1e9);
        // the guns bought and what was carried for them (a night saved before ammunition was shared has none written
        // down: the kinds its guns take come back full), and the one that was in hand loaded again
        for (const id of V.KIT_ORDER) if (d.kits && d.kits[id]) S.kits[id] = true;
        for (const t of Object.keys(V.AMMO)) S.ammo[t] = d.ammo ? num(d.ammo[t], 0, capOf(t)) : (Object.keys(S.kits).some((id) => typeOf(id) === t) ? capOf(t) : 0);
        if (S.kits[d.kit]) { applyKit(d.kit, false); if (w.equip) w.equip('rifle'); }
        if (d.sidearm !== S.sidearm && V.SIDEARMS[d.sidearm]) giveSidearm(d.sidearm);
        applyClassStats(false); if (d.hp > 0) p.health = clamp(+d.hp, 1, p.maxHealth);
        // the room: the waves cleared, the crystal, what was broken, what was standing
        S.wave = Math.max(1, d.wave | 0); run.wave = S.wave; run.wavesCleared = S.wave; S.time = +d.time || 0; S.phase = 'prep'; S.timer = 40;
        S.crystal.hp = clamp(+d.crystal.hp || 1, 1, S.crystal.max);
        // what was broken is told by number, so it is only put back if the level still has the same things in it
        if (V.destruct && V.destruct.netSync && d.broken && d.things === V.destruct.objects.length) { try { V.destruct.netSync(d.broken); } catch (e) { console.error('[vigil] what was broken could not be put back: ' + ((e && e.stack) || e)); } }
        if (V.defenses && V.defenses.restore) { try { V.defenses.restore(d.defs); } catch (e) { console.error('[vigil] the defenses could not be put back: ' + ((e && e.stack) || e)); } }
        // inside the church, where a respawn would put the warden
        const pads = (W.yard && W.yard.spawnPads) || [[2.6, -2]], pad = pads[0];
        S.placeAt = { x: pad[0], y: V.CH.floor, z: pad[1], yaw: Math.atan2(-(V.CRYSTAL.x - pad[0]), -(V.CRYSTAL.z - pad[1])) };
        S.saveMine = true; S.resumed = true;
        toast(`The vigil goes on: wave ${S.wave} cleared, wave ${S.wave + 1} in ${S.timer} seconds`);
      }
      // the title's Continue button: the next run that starts on this machine takes this night up
      this.resumeNext = (d) => { resume = V.runSaveValid && V.runSaveValid(d) ? d : null; };
      this.saveNow = saveNow; this.snapshot = snapshot;
      window.addEventListener('pagehide', () => { saveNow(); });
      // a run begins on this machine: alone, as the squad's host, or joining one already under way
      // d: a saved night to take up (the class is the one it was played as, whatever the title's picker says)
      function beginLocal(d) { const picked = S.nextClass; if (d) S.nextClass = d.cls; resetLocal(); S.nextClass = picked; }
      function beginShared(d) { resetShared(true); grantStart(); if (d) restore(d); }
      function startRun() {
        const d = resume;
        beginLocal(d);
        const n = V.net;
        if (n && n.online) {
          // restarting after the crystal fell: the host starts everyone afresh, a guest asks it to
          resume = null;
          if (n.host) beginShared(d); else { if (S.over) n.request('restart'); grantStart(); }
          return;
        }
        if (n && n.joined && n.joined()) { n.enter(); if (n.online) return; }                  // net decides, then calls hostStart or guestStart
        resume = null;
        beginShared(d);
      }
      this.hostStart = () => { const d = resume; resume = null; beginShared(d); };
      // someone else's night is under way: the saved one stays where it is
      this.guestStart = () => { resume = null; resetShared(false); S.runId = null; grantStart(); };
      g.events.on('game:state', ({ state, prev }) => {
        if (state === 'intro' || (state === 'playing' && prev === 'title')) startRun();
        if (state === 'title' && prev) { try { Z.clear(); } catch (e) { /* nothing to clear */ } if (V.loose) V.loose.clearBodies(); if (V.defenses) V.defenses.reset(); if (V.wisps) V.wisps.reset(); if (V.shells) V.shells.reset(); }
        if (state !== 'paused' && S.shop) { S.shop = false; if (V.ui) V.ui.closeShop(true); }
        if (state === 'paused') saveNow();
        if (state !== 'title') titleOn = false;
        if (V.ui) V.ui.setVisible(state === 'playing' || state === 'intro');
      });

      // ------------------------------------------------------------ waves
      // Waves can overlap: Enter during a wave calls the next one on top of it, as often as you like. Each wave
      // in play keeps its own strength; the round ends, and pays for all of them, when the last of the dead is down.
      // what a wave beginning means to this player, whoever counts the waves
      function waveBegan(n) {
        S.borrowed = false; if (RX.ward) S.armor = Math.min(100, S.armor + RX.ward);
        if (V.reach && n % 5 === 0 && V.reach.set(n)) toast(`Wave ${n} reached: a new vigil can begin from here, on the title screen`);
      }
      function startWave() {
        if (S.phase === 'prep') saveNow();                                 // what the preparation bought is kept
        S.wave++; run.wave = S.wave; waveBegan(S.wave);
        const cfg = V.composeWave(S.wave), stacked = S.phase === 'active';
        cfg.n = S.wave;
        // more players, more of the dead: six in ten again for each extra one
        const np = NET() ? NET().count() : 1;
        if (np > 1) { const pool = cfg.list.filter((t) => t !== 'boss'), extra = Math.round(pool.length * 0.6 * (np - 1)); for (let i = 0; i < extra; i++) cfg.list.splice(Math.floor(Math.random() * (cfg.list.length + 1)), 0, pool[Math.floor(Math.random() * pool.length)]); }
        if (!stacked) { S.waves = []; S.queue = []; S.sectors = []; S.spawnT = 1; }
        S.waves.push(cfg); S.cfg = cfg; S.phase = 'active';
        // the new arrivals are shuffled in among whoever is still on the way
        for (const type of cfg.list) S.queue.splice(Math.floor(Math.random() * (S.queue.length + 1)), 0, { type, cfg });
        // the directions in the woods this wave favours; a stacked wave adds its own to those already in play
        const n = cfg.sectors, a0 = rand(0, PI * 2);
        for (let i = 0; i < n; i++) S.sectors.push(a0 + (i * PI * 2) / n + rand(-0.4, 0.4));
        if (S.sectors.length > 12) S.sectors.splice(0, S.sectors.length - 12);
        const boss = cfg.list.includes('boss');
        g.hud.warn && g.hud.warn(stacked ? `Wave ${S.wave} joins` : `Wave ${S.wave}`, 3.4);
        say(boss ? 'An abomination is coming' : stacked ? `${cfg.list.length} more on the way — ${S.waves.length} waves at once` : `${cfg.list.length} zombies approaching`, 3.6);
        V.audio.play('bell'); g.events.emit('holdout:wave', { wave: S.wave, count: cfg.list.length });
        try { g.audio.setIntensity(1); } catch (e) { /* silent audio */ }
        { const net = NET(); if (net) net.emit('wv', { t: 's', n: S.wave, c: cfg.list.length, b: boss ? 1 : 0, k: stacked ? S.waves.length : 0 }); }
      }
      function spawnOne(type, cfg) {
        const d = diff(), mods = { hpMult: cfg.hpMult * d.hp, speedMult: cfg.speedMult, dmgMult: 1 };
        const graves = (W.yard && W.yard.graves) || [], crypts = (W.yard && W.yard.crypts) || [];
        // nothing appears on top of the living: every source keeps its distance from everyone in the room
        const who = Z.living ? Z.living() : [p.pos], clear = (x, z, m) => who.every((q) => Math.hypot(x - q.x, z - q.z) >= m);
        const small = type !== 'boss' && type !== 'brute', r = Math.random();
        if (small && r < (cfg.cryptChance || 0)) {
          // out of a mausoleum, one at a time through each door
          const open = crypts.map((c, i) => i).filter((i) => cryptUp(crypts[i]) && !(S.cryptT[i] > 0) && clear(crypts[i].to[0], crypts[i].to[1], 9));
          if (open.length) {
            const i = open[Math.floor(Math.random() * open.length)], c = crypts[i];
            S.cryptT[i] = 2.4;
            Z.spawn(type, { x: c.from[0], z: c.from[1] }, { ...mods, emerge: c });
            return true;
          }
        } else if (small && r < (cfg.cryptChance || 0) + cfg.riserChance) {
          // up through the earth: out of a grave, or out of any open ground in the yard and the woods round it
          if (graves.length && Math.random() < 0.6) {
            for (let i = 0; i < 10; i++) {
              const gr = graves[Math.floor(Math.random() * graves.length)];
              if (!clear(gr.x, gr.z, 10) || !Z.nav.free(gr.x, gr.z)) continue;
              Z.spawn(type, { x: gr.x, z: gr.z }, { ...mods, rise: true });
              return true;
            }
          }
          const up = Z.openGround ? Z.openGround(11, 56, who, 12) : null;
          if (up) { Z.spawn(type, up, { ...mods, rise: true }); return true; }
        }
        // out of the trees: from one of the directions this wave favours, or, for the strays, from anywhere round the ring
        const near = cfg.n <= 2 ? 35 : 37, far = cfg.n <= 2 ? 48 : 60, stray = Math.random() < (cfg.strayChance || 0);
        const at = Z.spawnPoint(stray ? rand(0, PI * 2) : S.sectors[Math.floor(Math.random() * S.sectors.length)], near, far, who, 22, stray ? 0.3 : 0.45, type)
          || Z.spawnPoint(0, near, far, who, 18, PI, type);
        if (!at) return false;
        Z.spawn(type, at, mods);
        if (type === 'boss') { g.hud.warn && g.hud.warn('Abomination', 3.4); say('Bring it down before it reaches the crystal', 3.6); V.audio.play('growl', { gain: 1.2 }); if (V.storm) V.storm.strike({ near: true, ahead: true }); }
        return true;
      }
      // ------------------------------------------------------------ the mausoleums
      // Every mausoleum still standing lets the dead out, one at a time: wanderers (zombies.js `roam`) that keep to
      // themselves until someone comes near, hurts them or fires close by. Bring the building down (destruct.js:
      // its top has to come off) and it stops. BROOD: seconds between two from one house, how long before the
      // first, and how many more than the wild's own number may be abroad for each house standing.
      const BROOD = { every: [14, 22], first: 20, extra: 3 };
      const broodT = [];
      const cryptUp = (c) => !c.body || !c.body.state || c.body.state === 'whole' || c.body.state === 'worn';
      this.cryptsUp = () => ((W.yard && W.yard.crypts) || []).filter(cryptUp).length;
      function brood(dt) {
        if (guest() || S.over) return;
        const crypts = (W.yard && W.yard.crypts) || [];
        let up = 0; for (const c of crypts) if (cryptUp(c)) up++;
        const cap = (V.wildWanted ? V.wildWanted(S.wave) : 4) + BROOD.extra * up;
        crypts.forEach((c, i) => {
          if (!cryptUp(c)) return;
          if (broodT[i] == null) broodT[i] = rand(BROOD.first * 0.5, BROOD.first * 1.5);
          if ((broodT[i] -= dt) > 0) return;
          broodT[i] = rand(BROOD.every[0], BROOD.every[1]);
          if (Z.wildCount() >= cap || Z.aliveCount() + Z.wildCount() >= MAX_ALIVE + 8 || S.cryptT[i] > 0) return;
          const who = Z.living ? Z.living() : [p.pos];
          if (!who.every((q) => Math.hypot(c.to[0] - q.x, c.to[1] - q.z) >= 9)) return;          // not on top of the living
          const r = Math.random(), type = S.wave >= 4 && r < 0.12 ? 'spitter' : S.wave >= 2 && r < 0.3 ? 'runner' : 'walker';
          const n = Math.max(1, S.wave);
          S.cryptT[i] = 2.4;
          Z.spawn(type, { x: c.from[0], z: c.from[1] }, { hpMult: (1 + 0.1 * (n - 1)) * diff().hp, speedMult: Math.min(1.3, 1 + 0.012 * (n - 1)), dmgMult: 1, emerge: c, roam: true });
        });
      }
      function clearWave() {
        S.phase = 'prep'; S.timer = 32;
        // every wave that was in play pays its bonus, and taking several at once pays 15% more for each extra one
        const k = Math.max(1, S.waves.length), first = S.waves.length ? S.waves[0].n : S.wave;
        if (!S.waves.length) S.waves.push({ n: S.wave });
        let bonus = 0; for (const c of S.waves) bonus += V.ECON.waveBonus(c.n);
        bonus = Math.round(bonus * (1 + 0.15 * (k - 1)));
        addMoney(bonus); healCrystal(Math.min(0.45, 0.08 * k * FX.mend));
        { const net = NET(); if (net) net.emit('wv', { t: 'c', n: S.wave, bonus, k, first }); }
        run.wavesCleared = S.wave; for (const c of S.waves) run.score += holdout.waveBonus * c.n;
        V.audio.play('wave_clear');
        g.hud.warn && g.hud.warn(k > 1 ? `Waves ${first}–${S.wave} cleared` : `Wave ${S.wave} cleared`, 3.6);
        say(k > 1 ? `+$${bonus} for ${k} waves at once — press B to open the armory` : `+$${bonus} bonus — press B to open the armory`, 4.5);
        S.waves = [];
        if (S.down && S.down.waiting) respawn();
        try { g.audio.setIntensity(0.15); } catch (e) { /* silent audio */ }
        g.events.emit('objective:done', { id: 'wave', index: S.wave, total: S.wave, first, k });
        S.clearedHere = (S.clearedHere || 0) + 1; saveT = 4; saveNow();
      }
      function waves(dt) {
        if (S.addT > 0) S.addT -= dt;
        for (let i = 0; i < S.cryptT.length; i++) if (S.cryptT[i] > 0) S.cryptT[i] -= dt;
        if (guest()) return;                                          // the host counts the waves
        if (S.phase === 'prep') { S.timer -= dt; if (S.timer <= 0) startWave(); return; }
        S.spawnT -= dt;
        // more waves in play: more of the dead on their feet at once, arriving faster (up to what the machine can draw)
        const k = S.waves.length;
        let cap = 0, gap = 9; for (const c of S.waves) { cap = Math.max(cap, c.maxAlive); gap = Math.min(gap, c.interval); }
        cap = Math.min(MAX_ALIVE, cap + 9 * (k - 1)); gap /= Math.sqrt(k);
        if (S.queue.length && S.spawnT <= 0 && Z.aliveCount() < cap && Z.aliveCount() + (Z.wildCount ? Z.wildCount() : 0) < MAX_ALIVE + 8) {
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
        S.cd.ability = a.cd * cdScale() * FX.cooldown;
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
        S.items.medkits--; p.heal(S.cls.id === 'medic' ? p.maxHealth : 60 + FX.medkitHeal); V.audio.play('heal'); say('Medkit used', 1.4); g.events.emit('gs:dressing', {});
      }
      function toggleTorch() { S.torch = !S.torch; V.audio.play('ui_click'); }
      this.actions = { classAbility, shockwave, aegis, useMedkit, toggleTorch };

      // ------------------------------------------------------------ keys
      const keys = [];
      // (through src/controls.js when it is there: a rebound key or a controller button arrives as the code below)
      const CT = window.GunslingerControls;
      (CT && CT.model ? (fn) => CT.listen('keydown', fn) : (fn) => window.addEventListener('keydown', fn))((e) => {
        if (e.repeat || /INPUT|TEXTAREA/.test((e.target && e.target.tagName) || '')) return;
        if (S.shop) { if (e.code === 'KeyB') { e.preventDefault(); closeShop(); } return; }
        if (g.game.state !== 'playing') return;
        keys.push(e.code);
      });
      function handleKey(code) {
        if (code === 'KeyB') { openShop(); return; }
        if (code === 'Enter' || code === 'NumpadEnter') { if (S.phase === 'active' && !S.over) g.events.emit('vigil:stacked', {}); self.callWave(); return; }
        if (S.down) return;
        // at the pile the use key (E; a controller's X) buys what the guns are short of, and is not the ability
        if (code === 'GsUse') { if (S.pile) buyAmmo(); return; }
        if (code === 'KeyE') { if (!S.pile) classAbility(); else if (!(CT && CT.model)) buyAmmo(); }
        else if (code === 'KeyZ') shockwave();
        else if (code === 'KeyX') aegis();
        else if (code === 'KeyH') useMedkit();
        else if (code === 'KeyF') toggleTorch();
        else if (code === 'KeyG' && V.defenses) V.defenses.throwGrenade();
        else if (code === 'KeyT' && V.defenses) V.defenses.throwFlare();
        else if (code === 'KeyN' && V.defenses) V.defenses.dropMine();
        else if (/^Digit[03-9]$/.test(code)) {
          const id = V.KIT_ORDER.find((k) => V.KITS[k].slot === +code.slice(5));
          if (id && S.kits[id] && (id !== S.kit || (A() && w.current !== 'rifle')) && w.state !== 'reload') { applyKit(id, true); applyClassStats(true); }
          else if (id && !S.kits[id]) V.audio.play('deny');
        }
        // 2 is the engine's sidearm key; pressed again with a sidearm out it changes to the other one
        else if (code === 'Digit2' && A() && w.current === 'pistol' && w.state !== 'reload') {
          const next = V.SIDEARM_ORDER[(V.SIDEARM_ORDER.indexOf(S.sidearm) + 1) % V.SIDEARM_ORDER.length];
          if (A().select(V.SIDEARMS[next].weapon)) say(V.SIDEARMS[next].name, 1.6);
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
      this.api = { applyKit, giveKit, giveSidearm, capOf, have, addAmmo, ammoNeed, ammoCost, buyAmmo, applyClassStats, respawn, say, toast, resetRun, startWave, healDefenses, learnSkill, sellLife, gather };
      this.rites = () => ({ spree: S.spree || 0, borrowed: !!S.borrowed, nova: S.novaCharge || 0 });

      // ------------------------------------------------------------ playing together
      // what a guest asked the host to do
      this.hostRequest = (op, d, from) => {
        if (op === 'wave') self.callWave();
        else if (op === 'aoe' && Array.isArray(d)) applyAoe(+d[0], +d[1], Math.min(20, +d[2] || 0), Math.min(400, +d[3] || 0), +d[4] || 0, Math.min(15, +d[5] || 0), Math.min(3, +d[6] || 0), Math.min(30, +d[7] || 0), from);
        else if (op === 'cheal') healCrystal(Math.min(1, +d || 0));
        else if (op === 'aegis') S.crystal.shield = Math.max(S.crystal.shield, Math.min(15, +d || 0));
        else if (op === 'oc') S.buff.overclock = Math.max(S.buff.overclock, Math.min(30, +d || 0));
        else if (op === 'dheal') { if (V.defenses) V.defenses.healAll(Math.min(1, +d || 0)); }
        else if (op === 'dfix') { if (V.defenses) V.defenses.repairAll(Math.min(1, +d || 0)); }
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
        S.crystal.hp = +a[7]; if (S.crystal.hp > S.crystal.max) S.crystal.max = S.crystal.hp; S.crystal.shield = a[8] === '1' ? 1 : 0; run.wave = S.wave;
        if (a[9] === '1' && !S.over) crystalLost();
        if (!S.caught) { S.caught = true; if (S.wave > 1) { const extra = Math.min(5000, 350 * (S.wave - 1)); addMoney(extra); toast(`Joined at wave ${S.wave}: +$${extra} to catch up`); } }
      };
      this.netWave = (d) => {
        if (d.t === 's') {
          g.hud.warn && g.hud.warn(d.k ? `Wave ${d.n} joins` : `Wave ${d.n}`, 3.4);
          say(d.b ? 'An abomination is coming' : d.k ? `${d.c} more on the way — ${d.k} waves at once` : `${d.c} zombies approaching`, 3.6);
          V.audio.play('bell'); try { g.audio.setIntensity(1); } catch (e) { /* silent audio */ }
          waveBegan(+d.n || 0);
        } else if (d.t === 'c') {
          addMoney(+d.bonus || 0); run.wavesCleared = +d.n || run.wavesCleared; V.audio.play('wave_clear');
          g.events.emit('objective:done', { id: 'wave', index: +d.n || 0, total: +d.n || 0, first: +d.first || +d.n || 0, k: +d.k || 1 });
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
        if (S.placeAt) { const a = S.placeAt; S.placeAt = null; p.pos.set(a.x, a.y, a.z); p.vel.set(0, 0, 0); p.yaw = a.yaw; p.pitch = 0; }
        // the ammunition pile: within reach of it the HUD says what filling up would cost (ui.js) and the use key buys it
        const heap = W.yard && W.yard.pile, near = !!heap && !S.down && !S.over && p.alive && Math.hypot(p.pos.x - heap.x, p.pos.z - heap.z) < 2.3 && Math.abs(p.pos.y - heap.y) < 1.6;
        S.pile = near ? { cost: ammoCost(), guns: Object.keys(S.kits).length } : null;
        if (g.input.setPrompt && !!S.pileAsk !== near) { S.pileAsk = near; g.input.setPrompt(near); }
        while (keys.length) handleKey(keys.shift());
        for (const k of Object.keys(S.cd)) S.cd[k] = Math.max(0, S.cd[k] - dt);
        for (const k of Object.keys(S.buff)) S.buff[k] = Math.max(0, S.buff[k] - dt);
        if (S.crystal.shield > 0) S.crystal.shield = Math.max(0, S.crystal.shield - dt);
        if (S.invulnT > 0) { S.invulnT -= dt; if (S.invulnT <= 0 && !S.over) p.invulnerable = false; }
        if (S.spreeT > 0 && (S.spreeT -= dt) <= 0) S.spree = 0;
        while (later.length) { const fn = later.shift(); if (!S.over) fn(); }
        crystal.setHealth(S.crystal.hp / S.crystal.max); crystal.setShield(S.crystal.shield > 0);
        if (S.over) {
          if (!S.scored) {
            S.scored = true;
            if (!window.GunslingerProgress && V.net && V.net.submit) V.net.submit(run.wavesCleared, S.kills).then((res) => { if (res && res.rank) toast(`Best vigil: wave ${res.score} · rank ${res.rank} of ${res.total}`); });
          }
          S.overT -= dt;
          if (S.overT <= 0 && g.game.state === 'playing') { p.alive = false; p.health = 0; g.events.emit('player:dead', {}); }
          return;
        }
        waves(dt);
        if (S.phase === 'prep' && (saveT -= dt) <= 0) { saveT = 4; saveNow(); }
        { const regen = (S.cls.regen || 0) + (S.hurtT > 5 ? FX.regen : 0); if (regen && p.alive && S.hurtT > 4 && p.health < p.maxHealth) p.heal(regen * dt); }
        heartbeat(dt);
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
        if (V.wild) V.wild.update(dt);
        brood(dt);
        if (V.wisps) V.wisps.update(dt, p.alive && !S.down && !S.over ? p.pos : null);
        if (V.shells) V.shells.update(dt);
        if (V.fire) V.fire.update(dt);
        if (V.blood) V.blood.update(dt);
      }
      this.tick = update;

      // ------------------------------------------------------------ the title: the dead wander the yard
      // Behind the title a dozen or so of the dead walk the graveyard as the wild ones do (zombies.js `roam`).
      // The warden is hidden from them, so nothing wakes them; they are cleared when a night begins.
      const TITLE_DEAD = 20;
      let titleOn = false, titleT = 0;
      function titleScene(dt) {
        if ((V.net && V.net.online) || !Z.wildCount || !Z.openGround) return;
        if (V.warm && V.warm.running) { Z.update(dt); return; }              // the warm-up has the yard to itself (warm.js)
        if (!titleOn) { titleOn = true; titleT = 0.4; self.playerHidden = true; }
        titleT -= dt;
        const have = Z.wildCount();
        if (titleT <= 0 && have < TITLE_DEAD) {
          titleT = have < 8 ? 0.06 : 2.2;
          // Where the title is looking: ahead of the camera and a little to its right (the menu covers the left),
          // on open ground outside the church. The first few are simply there; the rest climb out of the earth.
          const cam = g.camera.position; g.camera.getWorldDirection(fwd);
          const fl = Math.hypot(fwd.x, fwd.z) || 1, fx = fwd.x / fl, fz = fwd.z / fl;
          let at = null;
          for (let i = 0; i < 10 && !at; i++) {
            const d = rand(8, 26), side = rand(-3, 0.42 * d), x = cam.x + fx * d - fz * side, z = cam.z + fz * d + fx * side;
            if (Math.abs(x) < V.CH.hw + 1 && Math.abs(z) < V.CH.hd + 1) continue;
            if (Z.nav.free(x, z) && !Z.list.some((q) => q.alive && Math.hypot(q.pos.x - x, q.pos.z - z) < 2.2)) at = { x, z };
          }
          if (!at && have < 8) at = Z.openGround(11, 36, [{ x: cam.x, z: cam.z }], 6);
          const r = Math.random(), type = r < 0.7 ? 'walker' : r < 0.86 ? 'runner' : 'spitter';
          if (at) Z.spawn(type, at, { hpMult: 1, speedMult: 1, dmgMult: 1, roam: true, rise: have >= 5 });
        }
        Z.update(dt);
      }
      this.titleDead = () => (titleOn ? Z.wildCount() : 0);
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
          // down: the camera goes round the crystal, close and inside the church, so what is happening to it can be seen
          const a = g.time.t * 0.2;
          cam.position.set(V.CRYSTAL.x + Math.sin(a) * 5.2, 3.1, V.CRYSTAL.z + Math.cos(a) * 5.2); cam.lookAt(V.CRYSTAL.x, 1.5, V.CRYSTAL.z);
        }
        if (lights) {
          const on = S.torch && p.alive && (g.game.state === 'playing' || g.game.state === 'paused');
          lights.torch.intensity += ((on ? 70 : 0) - lights.torch.intensity) * Math.min(1, dt * 14);
          cam.getWorldDirection(fwd);
          lights.torch.position.copy(cam.position).addScaledVector(fwd, 0.25); lights.torch.position.y -= 0.12;
          lights.torch.target.position.copy(cam.position).addScaledVector(fwd, 12);
        }
        if (V.warm && V.warm.running) V.warm.tick();
        else if (V.warm && V.warm.note && g.game.state === 'playing') V.warm.note(dt, g);
        if (g.game.state === 'title') { try { titleScene(dt); } catch (e) { if (!titleScene.err) { titleScene.err = 1; console.error('[vigil] the title\'s dead threw: ' + ((e && e.stack) || e)); } } }
        if (V.ui) V.ui.update(dt);
        if (V.net && V.net.update) V.net.update(dt);
        if (V.music) V.music.update(dt);
        if (V.storm) V.storm.update(dt);
        renderFrame(dt);
      };
      if (V.defenses) V.defenses.install(g, S);
      if (V.wild) { try { V.wild.install(g, S, { guest, diff, net: NET, addMoney, toast }); } catch (e) { console.error('[vigil] the wild dead failed: ' + ((e && e.stack) || e)); } }
      if (V.wisps) { try { V.wisps.install(g, { gather }); } catch (e) { console.error('[vigil] lifeforce failed: ' + ((e && e.stack) || e)); } }
      if (V.fire) { try { V.fire.install(g); } catch (e) { console.error('[vigil] fire failed: ' + ((e && e.stack) || e)); } }
      if (V.blood) { try { V.blood.install(g); } catch (e) { console.error('[vigil] blood failed: ' + ((e && e.stack) || e)); } }
      // shells burst through the grenade's path; one that caught anything marks a hit, as a bullet does
      if (V.shells) {
        try {
          V.shells.install(g, {
            explode: (pos, radius, damage, size) => V.defenses.explode(pos, radius, damage, size),
            noise: (x, z, radius) => { if (V.wild) V.wild.noise(x, z, radius); },
            hit: (enemy, killed) => g.events.emit('player:hitEnemy', { enemy, part: 'body', killed, weak: false, blast: true }),
          });
        } catch (e) { console.error('[vigil] shells failed: ' + ((e && e.stack) || e)); }
      }
      if (V.ui) V.ui.install(g, S);
      if (V.net && V.net.init) V.net.init(g);
      if (window.GunslingerMenu) window.GunslingerMenu.vigil(g);
      Z.prewarm();
      resetRun();
      // everything a night shows, shown once behind a veil before it can begin (warm.js): not in a scripted run
      if (V.warm && g.game.state === 'title' && (!g.params.shot || g.params.warm) && !g.params.nowarm) V.warm.start(g, { hide: (v) => { self.playerHidden = !!v; }, finish: () => { resetRun(); titleOn = false; } });
      if (V.ui) V.ui.setVisible(g.game.state === 'playing');
    },
  };
})();
