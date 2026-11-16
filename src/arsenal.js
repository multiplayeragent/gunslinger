/* Gunslinger Modular Weapons & Gunsmith System.
   Six base weapon platforms (and the `extras` a map may add: a twin-drum support rifle, a pump shotgun, a flak
   cannon and a rocket launcher) with five live-customizable attachment slots (optic, muzzle,
   barrel, underbarrel, ammoType) plus six Cerakote/anodized finishes, beveled CAD hardware
   with full `aSurf` edge-wear/cavity-AO/machining attributes, parallax-free collimated
   shader reticles, 3D laser/weaponlight, and procedural WebAudio weapon synthesis. */
window.GunslingerArsenal = {
  finishes: {
    midnight: { id: 'midnight', label: 'HARDCOAT BLACK', tones: {} },
    fde: { id: 'fde', label: 'COYOTE FDE', tones: { pac9_anodised: [.22, .168, .102], pac9_polymer: [.16, .122, .078], pac4_nitride: [.23, .178, .112] } },
    odg: { id: 'odg', label: 'RANGER ODG', tones: { pac9_anodised: [.078, .098, .058], pac9_polymer: [.056, .07, .045], pac4_nitride: [.088, .108, .068] } },
    tungsten: { id: 'tungsten', label: 'TUNGSTEN SLATE', tones: { pac9_anodised: [.135, .145, .158], pac9_polymer: [.045, .048, .054], pac4_nitride: [.18, .192, .208] } },
    bronze: { id: 'bronze', label: 'BURNT BRONZE', tones: { pac9_anodised: [.195, .126, .072], pac9_polymer: [.052, .046, .042], pac4_nitride: [.22, .145, .085] } },
    titanium: { id: 'titanium', label: 'RAW TITANIUM', tones: { pac9_anodised: [.34, .35, .365], pac9_phosphate: [.24, .248, .258], pac4_nitride: [.46, .465, .485] } }
  },

  catalog: {
    optic: {
      holo: { id: 'holo', label: 'HX-2 HOLO', desc: '1x parallax-free circle-dot', rigs: ['rifle'], exclude: ['flak', 'rocket'], fov: 50, look: .58, adsMul: 1, spreadAdsMul: 1, stripHolo: false },
      rds: { id: 'rds', label: 'MRO-T RED DOT', desc: '1x 2-MOA skeletonized reflex', rigs: ['rifle'], fov: 55, look: .66, adsMul: .86, spreadAdsMul: .94, stripHolo: true },
      acog: { id: 'acog', label: 'TA-31 2.5X PRISM', desc: '2.5x fiber-illuminated chevron', rigs: ['rifle'], fov: 31, look: .38, adsMul: 1.08, spreadAdsMul: .72, stripHolo: true, prism: true },
      lpvo: { id: 'lpvo', label: 'RAZOR HD 4.5X', desc: '4.5x etched FFP MIL precision optic', rigs: ['rifle'], exclude: ['pump', 'flak', 'rocket'], fov: 19, look: .24, adsMul: 1.24, spreadAdsMul: .48, stripHolo: true, scope: true },
      irons: { id: 'irons', label: 'GHOST-RING IRONS', desc: 'Tritium winged match aperture', rigs: ['rifle'], exclude: ['flak', 'rocket'], fov: 58, look: .72, adsMul: .82, spreadAdsMul: 1.12, stripHolo: true },
      tritium: { id: 'tritium', label: 'TRITIUM IRONS', desc: '3-dot self-luminous duty sights', rigs: ['pistol'], fov: 56, look: .68, adsMul: 1, spreadAdsMul: 1 },
      rmr: { id: 'rmr', label: 'RMR-HD REFLEX', desc: 'Slide-mounted 3.25-MOA micro dot', rigs: ['pistol'], fov: 53, look: .62, adsMul: .9, spreadAdsMul: .74 }
    },
    muzzle: {
      std: { id: 'std', label: 'FLASH HIDER', desc: 'Standard ported prong crown', rigs: ['rifle', 'pistol'], exclude: ['pump', 'flak', 'rocket'], recoilMul: 1, speedMul: 1, rangeMul: 1, flashMul: 1, hearRadius: 42 },
      brake: { id: 'brake', label: 'MATCH COMP', desc: 'Multi-port recoil compensator (-24% kick)', rigs: ['rifle', 'pistol'], exclude: ['pump', 'flak', 'rocket'], recoilMul: .76, speedMul: 1, rangeMul: 1, flashMul: 1.22, hearRadius: 54, compensated: true },
      suppressor: { id: 'suppressor', label: 'QDC SUPPRESSOR', desc: 'Baffle stack + mirage wrap (stealth)', rigs: ['rifle', 'pistol'], exclude: ['pump', 'flak', 'rocket'], recoilMul: .84, speedMul: 1.04, rangeMul: 1.05, flashMul: .14, hearRadius: 11, suppressed: true },
      choke: { id: 'choke', label: 'SALVO CHOKE', desc: 'Tightens pattern & stand-off crown', rigs: ['rifle'], only: ['breacher', 'pump'], recoilMul: .94, speedMul: 1.03, rangeMul: 1.15, coneMul: .78, flashMul: 1, hearRadius: 48 },
      bore: { id: 'bore', label: 'OPEN BORE', desc: 'Nothing goes on a tube this wide', rigs: ['rifle'], only: ['flak', 'rocket'], recoilMul: 1, speedMul: 1, rangeMul: 1, flashMul: 1, hearRadius: 60 }
    },
    barrel: {
      standard: { id: 'standard', label: 'CHF DUTY', desc: 'Balanced velocity & handling', rigs: ['rifle', 'pistol'], speedMul: 1, rangeMul: 1, adsMul: 1, recoilMul: 1, spreadHipMul: 1, spreadAdsMul: 1, len: 0 },
      cqb: { id: 'cqb', label: 'SBR COMPACT', desc: 'Fast ADS & tight CQB pointability', rigs: ['rifle', 'pistol'], exclude: ['pump', 'flak', 'rocket'], speedMul: .89, rangeMul: .84, adsMul: .82, recoilMul: 1.08, spreadHipMul: .84, spreadAdsMul: 1.16, len: .035 },
      marksman: { id: 'marksman', label: 'FLUTED MATCH', desc: 'Heavy fluted barrel (+12% vel, -30% spread)', rigs: ['rifle', 'pistol'], exclude: ['pump', 'flak', 'rocket'], speedMul: 1.12, rangeMul: 1.26, adsMul: 1.14, recoilMul: .9, spreadHipMul: 1.06, spreadAdsMul: .7, len: .145 }
    },
    underbarrel: {
      none: { id: 'none', label: ' SLICK RAIL', desc: 'Unencumbered handguard', rigs: ['rifle', 'pistol'], recoilMul: 1, adsMul: 1, spreadHipMul: 1 },
      angled: { id: 'angled', label: 'M-LOK AFG', desc: 'Angled index grip (-9% ADS, smoother track)', rigs: ['rifle'], exclude: ['pump', 'flak', 'rocket'], recoilMul: .93, adsMul: .91, spreadHipMul: .95 },
      vert: { id: 'vert', label: 'STUBBY VERT', desc: ' Textured vertical grip (-18% climb)', rigs: ['rifle'], exclude: ['pump', 'flak', 'rocket'], recoilMul: .82, adsMul: 1.04, spreadHipMul: .92 },
      laser: { id: 'laser', label: 'PEQ-15 / X300V', desc: 'Vis-green laser + high-CRI tac light [T]', rigs: ['rifle', 'pistol'], exclude: ['rocket'], recoilMul: .96, adsMul: 1.02, spreadHipMul: .66, laser: true, light: true }
    },
    ammoType: {
      fmj: { id: 'fmj', label: 'DUTY BALL', desc: 'Standard military ball load', rigs: ['rifle', 'pistol'], exclude: ['breacher', 'pump', 'flak', 'rocket'], dmgMul: 1, speedMul: 1, recoilMul: 1, magMul: 1, weakMul: 2.2 },
      ap: { id: 'ap', label: 'TUNGSTEN AP', desc: 'Armor-piercing core (+16% dmg, 2.55x weak)', rigs: ['rifle', 'pistol'], exclude: ['breacher', 'pump', 'flak', 'rocket'], dmgMul: 1.16, speedMul: 1.1, recoilMul: 1.1, magMul: 1, weakMul: 2.55, ap: true },
      subsonic: { id: 'subsonic', label: 'HEAVY SUBSONIC', desc: '305 m/s stealth OTM (no sonic crack)', rigs: ['rifle', 'pistol'], exclude: ['breacher', 'pump', 'flak', 'rocket'], dmgMul: 1.06, speedCap: 305, recoilMul: .86, magMul: 1, weakMul: 2.15, subsonic: true, hearMul: .42 },
      ext: { id: 'ext', label: 'EXTENDED MAG', desc: '+34% magazine capacity, CNC basepad', rigs: ['rifle', 'pistol'], exclude: ['breacher', 'pump', 'flak', 'rocket'], dmgMul: 1, speedMul: 1, recoilMul: .98, magMul: 1.34, adsMul: 1.07, weakMul: 2.2, extMag: true },
      buckshot: { id: 'buckshot', label: '00 BUCKSHOT', desc: 'Nine 8.4mm lead pellets per shell', rigs: ['rifle'], only: ['breacher', 'pump'], pellets: 9, cone: .034, dmgMul: 1, speedMul: 1, rangeMul: 1, weakMul: 1.85 },
      flechette: { id: 'flechette', label: 'SABOT FLECHETTE', desc: '14 fin-stabilized armor-piercing darts', rigs: ['rifle'], only: ['breacher', 'pump'], pellets: 14, cone: .021, dmgMul: .78, speedMul: 1.18, rangeMul: 1.28, weakMul: 2.35, ap: true },
      slug: { id: 'slug', label: '1OZ RIFLED SLUG', desc: 'Single massive 490 m/s hollow-point slug', rigs: ['rifle'], only: ['breacher', 'pump'], pellets: 1, cone: 0, dmgMul: 6.4, speedMul: 1.22, rangeMul: 1.95, spreadAdsMul: .35, recoilMul: 1.15, weakMul: 2.5 },
      he: { id: 'he', label: 'HIGH EXPLOSIVE', desc: 'Fused bursting charge', rigs: ['rifle'], only: ['flak', 'rocket'], dmgMul: 1, speedMul: 1, recoilMul: 1, magMul: 1, weakMul: 1 }
    }
  },

  slotOrder: [
    { key: 'optic', label: 'OPTIC' },
    { key: 'muzzle', label: 'MUZZLE' },
    { key: 'barrel', label: 'BARREL' },
    { key: 'underbarrel', label: 'TACTICAL' },
    { key: 'ammoType', label: 'LOAD / MAG' },
    { key: 'finish', label: 'FINISH' }
  ],

  weapons: [
    {
      id: 'carbine', slot: 1, key: 'Digit1', rig: 'rifle',
      name: 'KR-7 CARBINE', short: 'CARBINE', caliber: '5.56×45 NATO',
      select: true, speed: 820, pellets: 1, fov: 50, look: .58, recoil: 1, shellPitch: .96,
      def: {}, spread: {},
      defaults: { optic: 'holo', muzzle: 'std', barrel: 'standard', underbarrel: 'angled', ammoType: 'fmj', finish: 'midnight' }
    },
    {
      id: 'sidearm', slot: 2, key: 'Digit2', rig: 'pistol',
      name: 'PAC-4 SIDEARM', short: 'SIDEARM', caliber: '9×19 +P',
      speed: 360, pellets: 1, fov: 56, look: .68, recoil: 2.7, shellPitch: .98,
      def: {}, spread: {},
      defaults: { optic: 'tritium', muzzle: 'std', barrel: 'standard', underbarrel: 'none', ammoType: 'fmj', finish: 'midnight' }
    },
    {
      id: 'marksman', slot: 3, key: 'Digit3', rig: 'rifle',
      name: 'KR-7 MARKSMAN', short: 'MARKSMAN', caliber: '6.5 CREEDMOOR',
      speed: 900, pellets: 1, fov: 19, look: .24, recoil: 1.55, shellPitch: .82, scope: true, optic: 'scope',
      def: { magSize: 15, reserve: 60, rpm: 240, damage: 60, range: 650, auto: false, adsTime: .27, flashLight: 55, flashScale: 1.15 },
      spread: { hip: .021, ads: .00035, moveAds: .0028, bloomAds: .0012, shot: .42, decay: 2.2 },
      defaults: { optic: 'lpvo', muzzle: 'brake', barrel: 'marksman', underbarrel: 'angled', ammoType: 'fmj', finish: 'fde' }
    },
    {
      id: 'pdw', slot: 4, key: 'Digit4', rig: 'rifle',
      name: 'KR-9 PDW / SUPPRESSED', short: 'PDW', caliber: '.300 BLK SUB',
      speed: 400, pellets: 1, fov: 55, look: .66, recoil: .55, shellPitch: .88,
      def: { magSize: 40, reserve: 200, rpm: 950, damage: 15, range: 140, auto: true, adsTime: .12, flashLight: 9, flashScale: .22, smoke: true },
      spread: { hip: .0085, ads: .0019, moveHip: .007, moveAds: .003, bloomHip: .0045, bloomAds: .002, shot: .11, decay: 2.1 },
      defaults: { optic: 'rds', muzzle: 'suppressor', barrel: 'cqb', underbarrel: 'vert', ammoType: 'subsonic', finish: 'tungsten' }
    },
    {
      id: 'breacher', slot: 5, key: 'Digit5', rig: 'rifle',
      name: 'KR-12 BREACHER', short: 'BREACHER', caliber: '12 GAUGE 3"',
      speed: 400, pellets: 9, cone: .034, fov: 58, look: .72, recoil: 2.3, shellPitch: .56, optic: 'irons',
      def: { magSize: 8, reserve: 40, rpm: 115, damage: 12, range: 70, auto: false, adsTime: .2, flashLight: 70, flashScale: 1.5 },
      spread: { hip: .006, ads: .004, shot: .6, decay: 1.6 },
      defaults: { optic: 'irons', muzzle: 'choke', barrel: 'standard', underbarrel: 'laser', ammoType: 'buckshot', finish: 'odg' }
    },
    {
      id: 'heavy', slot: 6, key: 'Digit6', rig: 'pistol',
      name: 'PAC-45 HEAVY', short: 'HEAVY', caliber: '.45 SUPER',
      speed: 290, pellets: 1, fov: 54, look: .64, recoil: 4.2, shellPitch: .86,
      def: { magSize: 8, reserve: 48, rpm: 210, damage: 62, range: 110, auto: false, adsTime: .17, flashLight: 48, flashScale: .9 },
      spread: { hip: .013, ads: .0012, shot: .55, decay: 2.2 },
      defaults: { optic: 'tritium', muzzle: 'brake', barrel: 'marksman', underbarrel: 'laser', ammoType: 'ap', finish: 'titanium' }
    }
  ],

  /* Platforms outside the harbor's six. A map lists them in its own roster (map.arsenal.roster);
     they carry no number key and never appear in the harbor's selection or gunsmith. */
  extras: [
    {
      id: 'support', slot: 7, key: null, rig: 'rifle',
      name: 'KR-7 SUPPORT', short: 'SUPPORT', caliber: '5.56×45 NATO',
      select: false, speed: 880, pellets: 1, fov: 34, look: .42, recoil: .82, shellPitch: .92, drum: true,
      def: { magSize: 100, reserve: 300, rpm: 640, damage: 46, range: 420, auto: true, adsTime: .26, flashLight: 62, flashScale: 1.1 },
      spread: { hip: .016, ads: .0016, moveHip: .016, moveAds: .0055, bloomHip: .0075, bloomAds: .0026, shot: .2, decay: 1.4 },
      defaults: { optic: 'acog', muzzle: 'brake', barrel: 'marksman', underbarrel: 'vert', ammoType: 'fmj', finish: 'odg' }
    },
    /* A pump-action 12-gauge. `body` names a whole weapon buildParts makes in place of the rifle (as it does for
       the launchers), but what it fires is shot like the Breacher's: the map decides the pellets. Its fore-end is
       worked by the left hand after every shot (parts.setPump, driven from src/gunslinger.js). */
    {
      id: 'pump', slot: 0, key: null, rig: 'rifle',
      name: 'WS-12 PUMP SHOTGUN', short: 'PUMP', caliber: '12 GAUGE 3"',
      select: false, speed: 400, pellets: 12, cone: .03, fov: 58, look: .72, recoil: 2.9, shellPitch: .5, optic: 'irons', body: 'pump',
      def: { magSize: 7, reserve: 42, rpm: 66, damage: 14, range: 80, auto: false, adsTime: .22, flashLight: 80, flashScale: 1.6 },
      spread: { hip: .006, ads: .004, shot: .6, decay: 1.6 },
      defaults: { optic: 'irons', muzzle: 'choke', barrel: 'standard', underbarrel: 'none', ammoType: 'buckshot', finish: 'odg' }
    },
    /* The two launchers. `launcher` names the body buildParts makes for it (the rifle beneath is not drawn) and
       tells the game the shot is a shell that flies and bursts, not a bullet: the map that lists one in its
       roster owns that flight (the Churchyard: src/vigil/shells.js). `speed` is what the muzzle gives it. */
    {
      id: 'flak', slot: 8, key: null, rig: 'rifle',
      name: 'FK-40 FLAK CANNON', short: 'FLAK', caliber: '40 MM AIRBURST',
      select: false, speed: 115, pellets: 1, fov: 52, look: .62, recoil: 3.1, shellPitch: .5, launcher: 'flak',
      def: { magSize: 5, reserve: 20, rpm: 80, damage: 240, range: 220, auto: false, adsTime: .3, flashLight: 95, flashScale: 1.25, smoke: true },
      spread: { hip: .014, ads: .0035, moveHip: .014, moveAds: .006, bloomHip: .01, bloomAds: .004, shot: .8, decay: 1.2 },
      defaults: { optic: 'rds', muzzle: 'bore', barrel: 'standard', underbarrel: 'none', ammoType: 'he', finish: 'tungsten' }
    },
    {
      id: 'rocket', slot: 9, key: null, rig: 'rifle',
      name: 'RL-90 ROCKET LAUNCHER', short: 'ROCKET', caliber: '90 MM HEAT',
      select: false, speed: 105, pellets: 1, fov: 50, look: .6, recoil: 1.7, shellPitch: .4, launcher: 'rocket',
      def: { magSize: 1, reserve: 6, rpm: 40, damage: 950, range: 300, auto: false, adsTime: .34, flashLight: 130, flashScale: .9, smoke: true },
      spread: { hip: .012, ads: .002, moveHip: .016, moveAds: .006, bloomHip: .008, bloomAds: .003, shot: .9, decay: 1.2 },
      defaults: { optic: 'rds', muzzle: 'bore', barrel: 'standard', underbarrel: 'none', ammoType: 'he', finish: 'odg' }
    }
  ],

  /* The muzzle flash, over what each platform and muzzle device give it: the flame half as big again, and its
     light brighter, reaching further (the engine's own is 9 m) and held a little longer (0.05 s). */
  flash: { scale: 1.5, light: 1.6, reach: 15, hold: .07 },

  defaults: { rifle: 'carbine', pistol: 'sidearm' },
  byId(id) { return this.weapons.find(w => w.id === id) || this.extras.find(w => w.id === id); },
  byKey(code) { return this.weapons.find(w => w.key === code); },

  optionsFor(weapon, slotKey) {
    if (slotKey === 'finish') return Object.values(this.finishes);
    const group = this.catalog[slotKey] || {};
    return Object.values(group).filter(opt => {
      if (opt.rigs && !opt.rigs.includes(weapon.rig)) return false;
      if (opt.only && !opt.only.includes(weapon.id)) return false;
      if (opt.exclude && opt.exclude.includes(weapon.id)) return false;
      return true;
    });
  },

  /* Compute effective weapon configuration from a base weapon + active modular slot choices.
     Relative multipliers compare each chosen module against that weapon's factory module so
     factory loadouts match exact baseline ballistics while every swap applies physical deltas. */
  compose(weapon, mods, platformBaseDef) {
    const chosen = { ...weapon.defaults, ...(mods || {}) };
    const pick = (slotKey, id) => this.catalog[slotKey]?.[id] || Object.values(this.catalog[slotKey] || {})[0] || {};
    const opt = pick('optic', chosen.optic);
    const muz = pick('muzzle', chosen.muzzle);
    const brl = pick('barrel', chosen.barrel);
    const und = pick('underbarrel', chosen.underbarrel);
    const amm = pick('ammoType', chosen.ammoType);

    const dOpt = pick('optic', weapon.defaults.optic);
    const dMuz = pick('muzzle', weapon.defaults.muzzle);
    const dBrl = pick('barrel', weapon.defaults.barrel);
    const dUnd = pick('underbarrel', weapon.defaults.underbarrel);
    const dAmm = pick('ammoType', weapon.defaults.ammoType);
    const ratio = (a, b, k) => ((a[k] ?? 1) / (b[k] ?? 1));

    const baseDef = { ...platformBaseDef, ...weapon.def };
    const baseSpread = { ...(platformBaseDef?.spread || {}), ...(weapon.spread || {}) };

    const speedMul = ratio(muz, dMuz, 'speedMul') * ratio(brl, dBrl, 'speedMul') * ratio(amm, dAmm, 'speedMul');
    let speed = Math.round(weapon.speed * speedMul);
    if (amm.speedCap && chosen.ammoType !== weapon.defaults.ammoType) speed = Math.min(speed, amm.speedCap);

    const recoil = +(weapon.recoil
      * ratio(muz, dMuz, 'recoilMul')
      * ratio(brl, dBrl, 'recoilMul')
      * ratio(und, dUnd, 'recoilMul')
      * ratio(amm, dAmm, 'recoilMul')).toFixed(3);

    const magSize = Math.max(weapon.launcher ? 1 : 2, Math.round(baseDef.magSize * ratio(amm, dAmm, 'magMul')));
    const reserve = Number.isFinite(baseDef.reserve) ? Math.round(baseDef.reserve * ratio(amm, dAmm, 'magMul')) : baseDef.reserve;
    const damage = +(baseDef.damage * ratio(amm, dAmm, 'dmgMul')).toFixed(2);
    const range = Math.round(baseDef.range * ratio(muz, dMuz, 'rangeMul') * ratio(brl, dBrl, 'rangeMul') * ratio(amm, dAmm, 'rangeMul'));
    const adsTime = +(baseDef.adsTime * ratio(opt, dOpt, 'adsMul') * ratio(brl, dBrl, 'adsMul') * ratio(und, dUnd, 'adsMul') * ratio(amm, dAmm, 'adsMul')).toFixed(3);
    const flashScale = +(baseDef.flashScale * ratio(muz, dMuz, 'flashMul') * this.flash.scale).toFixed(3);
    const flashLight = muz.suppressed ? Math.min(baseDef.flashLight, 8) : Math.round(baseDef.flashLight * ratio(muz, dMuz, 'flashMul') * this.flash.light);
    const hearRadius = Math.max(4, Math.round((muz.hearRadius || 42) * (amm.hearMul || 1)));

    const pellets = amm.pellets != null ? amm.pellets : (weapon.pellets || 1);
    const baseCone = amm.cone != null ? amm.cone : (weapon.cone || 0);
    const cone = +(baseCone * ratio(muz, dMuz, 'coneMul')).toFixed(4);

    const hipMul = ratio(brl, dBrl, 'spreadHipMul') * ratio(und, dUnd, 'spreadHipMul');
    const adsSpreadMul = ratio(opt, dOpt, 'spreadAdsMul') * ratio(brl, dBrl, 'spreadAdsMul') * ratio(amm, dAmm, 'spreadAdsMul');
    const spread = {
      ...baseSpread,
      hip: +(baseSpread.hip * hipMul).toFixed(5),
      ads: +(baseSpread.ads * adsSpreadMul).toFixed(5)
    };

    const fov = chosen.optic === weapon.defaults.optic ? weapon.fov : (opt.fov || weapon.fov);
    const look = chosen.optic === weapon.defaults.optic ? weapon.look : (opt.look || weapon.look);
    const finishEntry = this.finishes[chosen.finish] || this.finishes.midnight;

    return {
      id: weapon.id,
      base: weapon,
      mods: chosen,
      modules: { optic: opt, muzzle: muz, barrel: brl, underbarrel: und, ammoType: amm, finish: finishEntry },
      name: weapon.name,
      short: weapon.short,
      caliber: weapon.caliber,
      rig: weapon.rig,
      slot: weapon.slot,
      key: weapon.key,
      select: !!weapon.select,
      speed,
      pellets,
      cone,
      fov,
      look,
      recoil,
      shellPitch: weapon.shellPitch || 1,
      weakMul: amm.weakMul || 2.2,
      ap: !!amm.ap,
      subsonic: !weapon.launcher && !!(amm.subsonic || speed <= 335),        // a shell is slow, not quiet
      suppressed: !!muz.suppressed,
      compensated: !!muz.compensated,
      extMag: !!amm.extMag,
      drum: !!weapon.drum,
      launcher: weapon.launcher || null,
      body: weapon.body || null,
      hasLaser: !!und.laser,
      hasLight: !!und.light,
      scope: !!opt.scope,
      prism: !!opt.prism,
      stripHolo: weapon.rig === 'rifle' && !!opt.stripHolo,
      finish: finishEntry.tones,
      def: {
        ...baseDef,
        magSize,
        reserve,
        damage,
        range,
        adsTime,
        flashLight,
        flashScale,
        flashReach: muz.suppressed ? 9 : this.flash.reach,
        flashHold: muz.suppressed ? .05 : this.flash.hold,
        hearRadius,
        smoke: baseDef.smoke || !!muz.suppressed,
        spread
      },
      summary: [opt.label, muz.suppressed ? 'SUPP' : muz.compensated ? 'COMP' : null, amm.id !== 'fmj' && amm.id !== 'buckshot' && amm.id !== 'he' ? amm.label : null].filter(Boolean).join(' · ')
    };
  },

  /* Build stripped receiver geometry copies without the integrated HX-2 holographic sight
     above the top Picatinny rail so custom optics (MRO-T, ACOG, RAZOR LPVO, Ghost-Ring Irons)
     mount cleanly on bare rail teeth. */
  buildOpticSwap(T, rig) {
    const region = { y: .0455, front: -.075, rear: .085 }, [, , sightZ] = rig.sight, entries = [];
    let lens = rig.partsRef?.lens || null;
    rig.root.traverse(node => {
      if (!node.isMesh || node === rig.flash) return;
      const source = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry;
      const position = source.attributes?.position;
      if (!position || position.isInterleavedBufferAttribute) return;
      if (node.material && node.material.isShaderMaterial) {
        source.computeBoundingBox();
        if (Math.abs((source.boundingBox.min.z + source.boundingBox.max.z) / 2 - sightZ) < .03) lens = node;
        return;
      }
      const keep = [];
      for (let i = 0; i < position.count; i += 3) {
        const y = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
        const z = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;
        if (!(y > region.y && z > region.front && z < region.rear)) keep.push(i);
      }
      if (keep.length * 3 === position.count) return;
      const bare = new T.BufferGeometry();
      for (const [name, attribute] of Object.entries(source.attributes)) {
        if (attribute.isInterleavedBufferAttribute) return;
        const size = attribute.itemSize, data = new attribute.array.constructor(keep.length * 3 * size);
        keep.forEach((start, index) => data.set(attribute.array.subarray(start * size, (start + 3) * size), index * 3 * size));
        bare.setAttribute(name, new T.BufferAttribute(data, size, attribute.normalized));
      }
      entries.push({ node, full: node.geometry, bare });
    });
    return {
      lens,
      count: entries.length,
      set(stripped) {
        for (const entry of entries) entry.node.geometry = stripped ? entry.bare : entry.full;
        if (lens) lens.visible = !stripped;
      }
    };
  },

  /* Parallax-free collimated reflex/prism lens shader with anti-aliased reticle & dichroic glass coat. */
  createCollimatedLens(T, radius, { style = 'dot', color = [1.0, .2, .12], coat = [.06, .22, .18] } = {}) {
    const geo = new T.CircleGeometry(radius, 32);
    if (!T.ShaderMaterial) return new T.Mesh(geo, new T.MeshStandardMaterial({ color: 0x061014, roughness: .08, transparent: true, opacity: .35 }));
    const mat = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      uniforms: {
        uRetCol: { value: new T.Color(color[0], color[1], color[2]) },
        uCoat: { value: new T.Color(coat[0], coat[1], coat[2]) },
        uStyle: { value: style === 'chevron' ? 1 : 0 }
      },
      vertexShader: `
        varying vec3 vView, vFwd, vRight, vUp; varying vec2 vUv;
        void main() {
          vUv = uv * 2.0 - 1.0;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = mv.xyz;
          vFwd = (modelViewMatrix * vec4(0.0, 0.0, -1.0, 0.0)).xyz;
          vRight = (modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz;
          vUp = (modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vView, vFwd, vRight, vUp; varying vec2 vUv;
        uniform vec3 uRetCol, uCoat; uniform float uStyle;
        void main() {
          float rim = length(vUv);
          if (rim > 1.0) discard;
          vec3 d = normalize(vView), fw = normalize(vFwd);
          float k = max(dot(d, fw), 1e-3);
          vec2 a = vec2(dot(d, normalize(vRight)), dot(d, normalize(vUp))) / k;
          float r = length(a), px = max(fwidth(r), 1.5e-4);
          float ret = 0.0;
          if (uStyle < 0.5) {
            float dotR = max(0.00115, px * 1.05);
            ret = 1.0 - smoothstep(dotR - px, dotR + px, r);
            ret += 0.25 * exp(-r * 260.0);
          } else {
            // Illuminated ACOG chevron + BDC stadia
            float chev = 1.0 - smoothstep(0.00055, 0.00055 + px * 1.2, abs(a.y + abs(a.x) * 1.15 - 0.0012));
            chev *= step(abs(a.x), 0.0048) * step(-0.0046, a.y);
            float post = (1.0 - smoothstep(0.00038, 0.00038 + px, abs(a.x))) * step(a.y, -0.0062) * step(-0.022, a.y);
            float bdc1 = (1.0 - smoothstep(0.00035, 0.00035 + px, abs(a.y + 0.0095))) * step(abs(a.x), 0.0028);
            float bdc2 = (1.0 - smoothstep(0.00035, 0.00035 + px, abs(a.y + 0.0155))) * step(abs(a.x), 0.002);
            ret = clamp(chev + post * 0.75 + bdc1 * 0.8 + bdc2 * 0.75, 0.0, 1.0) + 0.18 * exp(-r * 180.0);
          }
          float vign = smoothstep(1.0, 0.82, rim);
          float fres = 0.08 + 0.34 * pow(1.0 - clamp(k, 0.0, 1.0), 2.4) + 0.14 * pow(rim, 2.2);
          float band = smoothstep(-0.35, 0.25, vUv.x * 0.55 + vUv.y) * (1.0 - smoothstep(0.35, 0.95, vUv.x * 0.55 + vUv.y));
          vec3 dichroic = mix(uCoat, vec3(0.42, 0.16, 0.24), clamp(vUv.y * 0.4 + 0.35, 0.0, 1.0));
          vec3 glass = dichroic * (0.28 + 0.52 * rim + 0.38 * band);
          vec2 eg = vec2(vUv.x, vUv.y + 0.62) * vec2(1.0, 1.6);
          vec3 emitterGlow = uRetCol * 0.18 * exp(-dot(eg, eg) * 18.0) * (1.0 - smoothstep(0.985, 0.9995, k));
          vec3 col = glass * fres + emitterGlow + uRetCol * (ret * 5.2 * vign);
          float alpha = clamp(0.14 + fres * 0.58 + band * 0.06 + ret * 0.95 * vign, 0.08, 0.98);
          gl_FragColor = vec4(col, alpha);
        }`
    });
    const mesh = new T.Mesh(geo, mat);
    mesh.renderOrder = 6;
    return mesh;
  },

  /* Build precision beveled CAD hardware for a composed weapon configuration.
     Computes real `aSurf = vec4(edgeWear, cavityAO, bareSteel, gripKnurl)` and bakes local
     transforms into vertex coordinates so the engine's `_E` detail shader renders authentic
     machining lay, burnished edges, recessed oil occlusion, and 1.15mm grip stippling. */
  buildParts(T, rig, config, material = () => null) {
    const rootGroup = new T.Group(); rootGroup.visible = false;
    const slideGroup = rig.partsRef?.slide ? new T.Group() : null;
    const magGroup = rig.partsRef?.mag ? new T.Group() : null;
    // what this adds to the rig is marked, so the rig's own meshes can be told from it; a launcher's parts are
    // marked again, for whoever copies the rifle for a soldier's hands (src/characters.js) and does not want a tube
    for (const grp of [rootGroup, slideGroup, magGroup]) if (grp) { grp.userData.gsPart = true; if (config.launcher || config.body) grp.userData.gsLauncher = true; }
    if (slideGroup) { slideGroup.visible = false; rig.partsRef.slide.add(slideGroup); }
    if (magGroup) { magGroup.visible = false; rig.partsRef.mag.add(magGroup); }

    let layerMask = 2;
    rig.root.traverse(node => { if (node.isMesh && node !== rig.flash && node.layers.mask) layerMask = node.layers.mask; });

    const fallback = new T.MeshStandardMaterial({ color: 0x0c0c0e, roughness: .46, metalness: .78 });
    const pick = (...names) => { for (const name of names) { const found = material(name); if (found) return found; } return fallback; };
    const steel = pick('pac9_phosphate', 'pac4_nitride');
    const anodised = pick('pac9_anodised', 'pac4_nitride');
    const polymer = pick('pac9_polymer', 'pac9_anodised');
    const glass = new T.MeshStandardMaterial({ color: 0x061318, roughness: .05, metalness: .1, envMapIntensity: 1.8, side: T.DoubleSide });
    const tritiumMat = new T.MeshStandardMaterial({ color: 0x35ff7a, emissive: new T.Color(0x22ff66), emissiveIntensity: 2.6, roughness: .2 });
    const fiberMat = new T.MeshStandardMaterial({ color: 0xff3818, emissive: new T.Color(0xff2a10), emissiveIntensity: 2.2, roughness: .18 });
    const wrapMat = pick('pac9_polymer_tan', 'pac9_polymer');

    // Bake transform into geometry & compute realistic `aSurf` while preserving analytical smooth normals.
    const bakeAndDress = (geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, edge = .35, cav = .18, bare = 0, knurl = 0, color = [1, 1, 1] } = {}) => {
      if (!geo.attributes?.normal) geo.computeVertexNormals?.();
      if (rx) geo.rotateX(rx);
      if (ry) geo.rotateY(ry);
      if (rz) geo.rotateZ(rz);
      if (x || y || z) geo.translate(x, y, z);
      const pos = geo.attributes?.position, nrm = geo.attributes?.normal;
      if (!pos) return geo;
      const count = pos.count;
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const spanX = Math.max(1e-4, bb.max.x - bb.min.x);
      const spanY = Math.max(1e-4, bb.max.y - bb.min.y);
      const spanZ = Math.max(1e-4, bb.max.z - bb.min.z);

      const cols = new Float32Array(count * 3);
      const surf = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
        const nx = nrm ? nrm.getX(i) : 0, ny = nrm ? nrm.getY(i) : 1;
        const ux = Math.abs((px - (bb.min.x + bb.max.x) * .5) / (spanX * .5));
        const uy = Math.abs((py - (bb.min.y + bb.max.y) * .5) / (spanY * .5));
        const uz = Math.abs((pz - (bb.min.z + bb.max.z) * .5) / (spanZ * .5));
        // Corners and end-chamfers accumulate natural holster/handling edge wear; underside & mount roots occlude.
        const rim = Math.max(0, Math.min(1, (Math.max(ux, uy) * .65 + uz * .55 - .72) * 3.1));
        const underOcc = Math.max(0, Math.min(1, (.25 - ny) * .45));
        const eVal = Math.min(1, edge * (.35 + .85 * rim) * (.7 + .3 * Math.abs(nx)));
        const cVal = Math.min(1, cav + underOcc * .42 + (1 - rim) * .12);
        cols[i * 3] = color[0]; cols[i * 3 + 1] = color[1]; cols[i * 3 + 2] = color[2];
        surf[i * 4] = eVal;
        surf[i * 4 + 1] = cVal;
        surf[i * 4 + 2] = bare;
        surf[i * 4 + 3] = knurl;
      }
      geo.setAttribute('color', new T.BufferAttribute(cols, 3));
      geo.setAttribute('aSurf', new T.BufferAttribute(surf, 4));
      return geo;
    };

    const emit = (geo, surface, parent = rootGroup, raw = false, opts = {}) => {
      const finalGeo = raw ? geo : bakeAndDress(geo, opts);
      const mesh = new T.Mesh(finalGeo, surface);
      if (raw && (opts.x || opts.y || opts.z)) mesh.position.set(opts.x || 0, opts.y || 0, opts.z || 0);
      if (raw && (opts.rx || opts.ry || opts.rz)) mesh.rotation.set(opts.rx || 0, opts.ry || 0, opts.rz || 0);
      mesh.layers.mask = layerMask;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // Chamfered cylindrical tube aligned along -Z bore axis with smooth radial normals & crisp end-faces.
    const chamferTube = (rRear, rFront, len, surface, x, y, z, { segs = 36, bevel = .0016, parent = rootGroup, ...opts } = {}) => {
      const b = Math.min(bevel, len * .22, Math.min(rRear, rFront) * .32);
      if (T.LatheGeometry && b > .0002) {
        const r0 = Math.max(.001, rRear - b), r1 = Math.max(.001, rFront - b);
        const pts = [
          new T.Vector2(0, -len / 2),
          new T.Vector2(r0, -len / 2),
          new T.Vector2(r0 + 1e-5, -len / 2 + 1e-5),
          new T.Vector2(rRear, -len / 2 + b),
          new T.Vector2(rFront, len / 2 - b),
          new T.Vector2(r1 + 1e-5, len / 2 - 1e-5),
          new T.Vector2(r1, len / 2),
          new T.Vector2(0, len / 2)
        ];
        const g = new T.LatheGeometry(pts, segs);
        return emit(g, surface, parent, false, { x, y, z, rx: -Math.PI / 2, ...opts });
      }
      const g = new T.CylinderGeometry(rFront, rRear, len, segs, 1);
      return emit(g, surface, parent, false, { x, y, z, rx: Math.PI / 2, ...opts });
    };

    // Open-bore CNC sleeve for see-through reflex housings & ocular shades.
    const hollowTube = (rInner, rRear, rFront, len, surface, x, y, z, { segs = 36, bevel = .001, parent = rootGroup, ...opts } = {}) => {
      if (T.LatheGeometry) {
        const b = Math.min(bevel, len * .2, (Math.min(rRear, rFront) - rInner) * .4);
        const pts = [
          new T.Vector2(rInner, -len / 2),
          new T.Vector2(rRear - b, -len / 2),
          new T.Vector2(rRear, -len / 2 + b),
          new T.Vector2(rFront, len / 2 - b),
          new T.Vector2(rFront - b, len / 2),
          new T.Vector2(rInner, len / 2),
          new T.Vector2(rInner, -len / 2)
        ];
        const g = new T.LatheGeometry(pts, segs);
        return emit(g, surface, parent, false, { x, y, z, rx: -Math.PI / 2, ...opts });
      }
      const g = new T.CylinderGeometry(rFront, rRear, len, segs, 1, true);
      return emit(g, surface, parent, false, { x, y, z, rx: Math.PI / 2, ...opts });
    };

    // Beveled CAD rectangular block via ExtrudeGeometry or BoxGeometry fallback.
    const bevelBox = (w, h, d, surface, x, y, z, { bevel = .0014, parent = rootGroup, ...opts } = {}) => {
      const b = Math.min(bevel, w * .22, h * .22, d * .22);
      if (T.Shape && T.ExtrudeGeometry && b > .0002) {
        const hw = w / 2 - b, hh = h / 2 - b;
        const s = new T.Shape();
        s.moveTo(-hw, -hh); s.lineTo(hw, -hh); s.lineTo(hw, hh); s.lineTo(-hw, hh); s.closePath();
        const g = new T.ExtrudeGeometry(s, { depth: Math.max(.0005, d - 2 * b), bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: b, bevelThickness: b });
        g.translate(0, 0, -(d - 2 * b) / 2);
        return emit(g, surface, parent, false, { x, y, z, ...opts });
      }
      return emit(new T.BoxGeometry(w, h, d), surface, parent, false, { x, y, z, ...opts });
    };

    // the rifle's own bore, read once: a launcher in hand may have moved rig.muzzle off it (muzzleAt)
    const bore = (rig._gsBore = rig._gsBore || [rig.muzzle[0], rig.muzzle[1]]);
    const [mx, my] = bore, mz = rig.muzzle[2], [sx, sy, sz] = rig.sight;
    const railY = rig.id === 'rifle' ? .0435 : .0155;
    const mods = config.mods || config.base?.defaults || {};
    let reach = 0;
    let laserOrigin = null, sightPane = null;

    // 0. LAUNCHERS (FK-40 flak cannon, RL-90 rocket launcher). These are not rifles with parts added: the whole
    // weapon is built here, round what the hands already hold (pistol grip and trigger, the vertical fore grip,
    // the magazine the left hand changes), and the rifle beneath is not drawn while one is in hand. Its meshes
    // are taken off every layer for that, and put back: the engine shows and hides some of them itself, so
    // `visible` is not ours to use.
    const masks = (rig._gsMasks = rig._gsMasks || new Map());
    const beneath = [];
    let rocketGroup = null, pumpGroup = null, muzzleAt = null, dark = null;
    const whole = config.launcher || config.body || null;            // 'flak', 'rocket' or 'pump': the rifle is not drawn
    if (whole && rig.id === 'rifle') {
      rig.root.traverse(node => {
        if (!node.isMesh || node === rig.flash) return;
        for (let up = node.parent; up && up !== rig.root; up = up.parent) if (up.userData.gsPart) return;
        if (!masks.has(node)) masks.set(node, node.layers.mask || layerMask);
        beneath.push(node);
      });
      dark = new T.MeshStandardMaterial({ color: 0x030303, roughness: .95, metalness: 0, side: T.DoubleSide });
      const rake = rig.holds?.shapes?.gripDim?.rake ?? .2;
      // pistol grip, trigger and guard where the right hand is; the vertical grip under the left
      bevelBox(.029, .124, .05, polymer, 0, -.102, .076, { rx: -rake, bevel: .007, edge: .34, cav: .3, knurl: .85 });
      bevelBox(.032, .012, .056, polymer, 0, -.166, .089, { rx: -rake, bevel: .004, edge: .4, cav: .3 });
      bevelBox(.011, .004, .1, steel, 0, -.104, -.002, { bevel: .0012, edge: .6, cav: .3 });
      bevelBox(.011, .06, .004, steel, 0, -.075, -.05, { bevel: .0012, edge: .6, cav: .3 });
      bevelBox(.006, .026, .007, steel, 0, -.08, -.006, { rx: -.3, bevel: .001, edge: .7, bare: .5 });
      // (on a pump gun the grip under the left hand is part of the fore-end, and moves with it)
      if (whole !== 'pump') {
        emit(new T.CylinderGeometry(.0146, .0134, .078, 24), polymer, rootGroup, false, { x: 0, y: -.0605, z: -.2557, edge: .35, cav: .26, knurl: .88 });
        emit(new T.CylinderGeometry(.0158, .0158, .006, 24), steel, rootGroup, false, { x: 0, y: -.1015, z: -.2557, edge: .6, cav: .3 });
      }

      if (whole === 'pump') {
        // A steel receiver with a short rail, a stock, a long barrel over a magazine tube, and the fore-end
        bevelBox(.046, .058, .21, steel, 0, -.004, .055, { bevel: .005, edge: .5, cav: .28 });
        bevelBox(.021, .008, .15, steel, 0, railY - .004, .06, { bevel: .001, edge: .62, cav: .42 });
        for (let i = 0; i < 6; i++) bevelBox(.0215, .0032, .008, steel, 0, railY + .0012, .02 + i * .0165, { bevel: .0007, edge: .7, cav: .5 });
        bevelBox(.002, .02, .075, dark, .0236, .006, .03, { bevel: .0004 });                                  // the port the shells leave by
        bevelBox(.03, .012, .1, steel, 0, -.038, .03, { bevel: .002, edge: .5, cav: .4 });                    // the gate they go in by
        for (const side of [-1, 1]) for (const z of [-.03, .13]) chamferTube(.004, .004, .0044, steel, side * .0236, -.012, z, { ry: Math.PI / 2, segs: 6, edge: .72, bare: .5 });
        bevelBox(.034, .05, .14, polymer, 0, -.016, .22, { rx: .1, bevel: .008, edge: .32, cav: .3 });
        bevelBox(.038, .1, .1, polymer, 0, -.034, .3, { bevel: .01, edge: .32, cav: .3 });
        bevelBox(.042, .118, .02, wrapMat, 0, -.034, .356, { bevel: .006, edge: .3, cav: .3, knurl: .6 });
        const bz0 = -.05, bLen = .52, fz = bz0 - bLen, tLen = .44, ty = my - .0275;
        chamferTube(.0118, .0118, bLen, steel, mx, my, bz0 - bLen / 2, { segs: 28, edge: .45, cav: .2, bare: .15 });
        chamferTube(.0128, .0128, tLen, steel, mx, ty, bz0 - tLen / 2, { segs: 28, edge: .45, cav: .22, bare: .1 });
        chamferTube(.0138, .0124, .016, steel, mx, ty, bz0 - tLen - .008, { segs: 28, edge: .7, bare: .4, knurl: .7 });
        bevelBox(.034, .052, .012, steel, mx, my - .014, bz0 - tLen + .03, { bevel: .003, edge: .6, cav: .4 });
        bevelBox(.005, .01, .005, steel, mx, my + .015, fz + .014, { bevel: .001, edge: .7, bare: .6 });      // the bead
        emit(new T.CircleGeometry(.0094, 24), dark, rootGroup, true, { x: mx, y: my, z: fz - .0012 });
        reach += -fz + mz;
        // The fore-end: a ribbed sleeve on the magazine tube with the grip the left hand holds, and the two
        // bars that run back to the bolt. setPump slides it, and the hand with it.
        pumpGroup = new T.Group(); rootGroup.add(pumpGroup);
        hollowTube(.0132, .0235, .0235, .17, polymer, mx, ty, -.2557, { segs: 28, edge: .36, cav: .3, knurl: .5, parent: pumpGroup });
        for (let i = 0; i < 7; i++) hollowTube(.0234, .0254, .0254, .008, polymer, mx, ty, -.1927 - i * .021, { segs: 28, edge: .5, cav: .5, parent: pumpGroup });
        emit(new T.CylinderGeometry(.0146, .0134, .078, 24), polymer, pumpGroup, false, { x: 0, y: -.0605, z: -.2557, edge: .35, cav: .26, knurl: .88 });
        emit(new T.CylinderGeometry(.0158, .0158, .006, 24), steel, pumpGroup, false, { x: 0, y: -.1015, z: -.2557, edge: .6, cav: .3 });
        for (const side of [-1, 1]) bevelBox(.003, .008, .21, steel, mx + side * .0146, ty + .004, -.115, { bevel: .001, edge: .6, cav: .3, parent: pumpGroup });
        // What the left hand brings up in a reload: shells, not a magazine
        if (magGroup) for (let i = 0; i < 3; i++) {
          chamferTube(.0098, .0098, .05, wrapMat, (i - 1) * .0215, -.05, -.012, { segs: 16, edge: .3, cav: .2, parent: magGroup });
          chamferTube(.0102, .0102, .012, steel, (i - 1) * .0215, -.05, .02, { segs: 16, edge: .7, bare: .7, parent: magGroup });
        }
      } else if (whole === 'flak') {
        // Receiver, its sight rail, the housing over the trigger and the block the drum hangs from
        bevelBox(.056, .05, .27, anodised, 0, -.01, .06, { bevel: .005, edge: .5, cav: .28 });
        bevelBox(.044, .03, .255, anodised, 0, .0225, .058, { bevel: .006, edge: .56, cav: .3 });
        bevelBox(.021, .008, .25, steel, 0, railY - .004, .05, { bevel: .001, edge: .62, cav: .42 });
        for (let i = 0; i < 9; i++) bevelBox(.0215, .0032, .008, steel, 0, railY + .0012, .028 + i * .0165, { bevel: .0007, edge: .7, cav: .5 });
        for (const side of [-1, 1]) {
          for (const y of [-.024, -.008]) bevelBox(.003, .006, .2, anodised, side * .0288, y, .075, { bevel: .001, edge: .62, cav: .46 });
          for (const z of [-.055, .03, .115, .18]) chamferTube(.0042, .0042, .0044, steel, side * .0286, .004, z, { ry: Math.PI / 2, segs: 6, edge: .72, bare: .5 });
        }
        bevelBox(.002, .017, .07, dark, .0224, .024, .03, { bevel: .0004 });
        bevelBox(.006, .02, .008, steel, .0235, .024, -.008, { bevel: .001, edge: .7, bare: .4 });
        bevelBox(.036, .03, .1, anodised, 0, -.048, .04, { bevel: .003, edge: .5, cav: .36 });
        bevelBox(.05, .03, .1, anodised, 0, -.048, -.085, { bevel: .003, edge: .5, cav: .38 });
        chamferTube(.0055, .0055, .03, steel, -.04, .012, .0, { ry: Math.PI / 2, segs: 14, edge: .7, bare: .5, knurl: .6 });
        // Stock: buffer tube, cheek piece, butt pad
        chamferTube(.0155, .0155, .12, steel, 0, .006, .255, { edge: .5, cav: .3 });
        bevelBox(.03, .03, .1, polymer, 0, .026, .25, { bevel: .006, edge: .32, cav: .3 });
        bevelBox(.04, .112, .04, polymer, 0, -.012, .327, { bevel: .008, edge: .32, cav: .3, knurl: .5 });
        // The barrel: a 40 mm tube in a vented jacket, a recoil cylinder over it, a flared muzzle
        const bLen = .44, fz = -.075 - bLen, bell = .062;
        chamferTube(.0235, .0235, bLen, steel, mx, my, -.075 - bLen / 2, { segs: 40, edge: .45, cav: .2, bare: .15 });
        hollowTube(.0238, .0292, .0292, .22, anodised, mx, my, -.215, { segs: 40, edge: .5, cav: .3 });
        for (const zc of [-.145, -.215, -.285]) {
          for (let i = 0; i < 6; i++) {
            const a = (i + .5) / 6 * Math.PI * 2;
            bevelBox(.0075, .0022, .042, dark, mx + Math.cos(a) * .0288, my + Math.sin(a) * .0288, zc, { rz: a - Math.PI / 2, bevel: .0005 });
          }
        }
        for (const zc of [-.105, -.325]) hollowTube(.0238, .0314, .0314, .012, steel, mx, my, zc, { segs: 40, edge: .65, cav: .4, bare: .3 });
        chamferTube(.008, .008, .2, steel, mx, my + .0385, -.2, { segs: 16, edge: .5, cav: .3, bare: .45 });
        for (const zc of [-.11, -.29]) bevelBox(.02, .02, .014, anodised, mx, my + .034, zc, { bevel: .002, edge: .6, cav: .4 });
        chamferTube(.0265, .0405, bell, steel, mx, my, fz - bell / 2, { segs: 40, edge: .62, cav: .34, bare: .22 });
        hollowTube(.0392, .0428, .0428, .008, steel, mx, my, fz - bell + .003, { segs: 40, edge: .7, cav: .3, bare: .35 });
        emit(new T.CircleGeometry(.0205, 32), dark, rootGroup, true, { x: mx, y: my, z: fz - bell - .0012 });
        reach += -(fz - bell) + mz;
        // The drum the left hand changes: a throat into the feed block, a fat drum on its side
        if (magGroup) {
          bevelBox(.04, .05, .06, anodised, 0, -.03, -.012, { rx: .12, bevel: .003, edge: .5, cav: .4, parent: magGroup });
          emit(new T.CylinderGeometry(.064, .064, .074, 44), polymer, magGroup, false, { x: 0, y: -.118, z: -.008, rz: Math.PI / 2, edge: .4, cav: .3, knurl: .2 });
          for (const side of [-1, 1]) {
            emit(new T.CylinderGeometry(.058, .062, .006, 44), anodised, magGroup, false, { x: side * .04, y: -.118, z: -.008, rz: Math.PI / 2, edge: .6, cav: .42 });
            emit(new T.CylinderGeometry(.016, .018, .01, 20), steel, magGroup, false, { x: side * .046, y: -.118, z: -.008, rz: Math.PI / 2, edge: .7, bare: .45, knurl: .7 });
          }
          for (let i = 0; i < 10; i++) {
            const a = i / 10 * Math.PI * 2;
            bevelBox(.07, .006, .007, polymer, 0, -.118 + Math.cos(a) * .065, -.008 + Math.sin(a) * .065, { rx: -a, bevel: .0012, edge: .5, cav: .3, parent: magGroup });
          }
        }
      } else {
        // A tube on the right shoulder, beside the sight and over the frame the grips hang from
        const tx = .034, ty = .006, rO = .043, rI = .039;
        muzzleAt = [tx, ty];
        bevelBox(.032, .03, .5, anodised, 0, -.006, -.08, { bevel: .004, edge: .5, cav: .3 });
        bevelBox(.036, .034, .13, anodised, 0, -.038, .045, { bevel: .004, edge: .5, cav: .36 });
        hollowTube(rI, rO, rO, .86, anodised, tx, ty, -.115, { segs: 44, bevel: .0015, edge: .42, cav: .22 });
        for (const [zc, wide] of [[-.535, .03], [-.3, .022], [.06, .022], [.29, .03]]) {
          hollowTube(rO - .0005, rO + .0042, rO + .0042, wide, steel, tx, ty, zc, { segs: 44, edge: .62, cav: .36, bare: .2 });
        }
        hollowTube(rI + .001, .058, rO + .003, .05, steel, tx, ty, .33, { segs: 44, edge: .6, cav: .3, bare: .25 });
        emit(new T.CircleGeometry(rI, 36), dark, rootGroup, true, { x: tx, y: ty, z: -.43 });
        emit(new T.CircleGeometry(rI, 36), dark, rootGroup, true, { x: tx, y: ty, z: .3 });
        bevelBox(.046, .05, .08, polymer, .012, -.04, .265, { bevel: .008, edge: .3, cav: .3, knurl: .5 });
        hollowTube(rO + .0003, rO + .0046, rO + .0046, .17, wrapMat, tx, ty, .175, { segs: 44, edge: .3, cav: .3, knurl: .6 });
        bevelBox(.012, .01, .03, steel, tx, ty - rO - .006, -.42, { bevel: .002, edge: .7, bare: .4 });
        bevelBox(.03, .014, .075, anodised, 0, railY - .007, -.03, { bevel: .002, edge: .56, cav: .4 });
        // The rocket's nose stands in the muzzle while one is loaded (setLoaded)
        rocketGroup = new T.Group(); rootGroup.add(rocketGroup);
        // (wider than the tube, as such warheads are: it is what the eye finds at the end of the weapon)
        chamferTube(.036, .036, .1, steel, tx, ty, -.5, { segs: 36, edge: .3, cav: .2, parent: rocketGroup });
        emit(new T.CylinderGeometry(.05, .036, .07, 36), wrapMat, rocketGroup, false, { x: tx, y: ty, z: -.585, rx: -Math.PI / 2, edge: .35, cav: .2 });
        chamferTube(.05, .05, .07, wrapMat, tx, ty, -.655, { segs: 36, edge: .3, cav: .16, parent: rocketGroup });
        emit(new T.CylinderGeometry(.009, .05, .15, 36), wrapMat, rocketGroup, false, { x: tx, y: ty, z: -.765, rx: -Math.PI / 2, edge: .35, cav: .14 });
        chamferTube(.0105, .0065, .024, steel, tx, ty, -.851, { segs: 16, edge: .7, bare: .7, parent: rocketGroup });
        hollowTube(.0495, .0512, .0512, .01, steel, tx, ty, -.624, { segs: 36, edge: .6, bare: .5, parent: rocketGroup });
        reach += .02;
        // What the left hand changes is the firing cartridge in the frame; the rocket itself goes in at the muzzle
        if (magGroup) {
          bevelBox(.027, .075, .05, polymer, 0, -.05, -.012, { rx: .12, bevel: .003, edge: .42, cav: .4, knurl: .4, parent: magGroup });
          bevelBox(.03, .012, .056, anodised, 0, -.094, -.008, { rx: .12, bevel: .0026, edge: .5, cav: .36, parent: magGroup });
        }
      }
    }

    // 1. BARREL EXTENSIONS (Rifle heavy fluted / Shotgun rib / Pistol threaded tip)
    if (rig.id === 'rifle') {
      if (config.id === 'breacher') {
        const bLen = .115;
        const bz = mz - bLen / 2;
        chamferTube(.0168, .0168, bLen, steel, mx, my, bz, { edge: .45, cav: .22, bare: .18 });
        // Under-slung 12G magazine tube extension + barrel clamp + ventilated top rib
        chamferTube(.0135, .0135, bLen + .04, anodised, mx, my - .028, bz + .02, { edge: .5, cav: .3 });
        bevelBox(.032, .052, .018, steel, mx, my - .014, bz + .01, { edge: .55, cav: .38 });
        bevelBox(.009, .005, bLen + .14, steel, mx, my + .019, bz + .07, { edge: .5, cav: .28 });
        reach += bLen;
      } else if (mods.barrel === 'marksman') {
        const bLen = .148, bz = mz - bLen / 2;
        chamferTube(.0108, .0098, bLen, steel, mx, my, bz, { edge: .42, cav: .2, bare: .55 });
        // 6 longitudinal machined barrel flutes
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2;
          chamferTube(.0022, .002, bLen * .78, steel, mx + Math.cos(a) * .0096, my + Math.sin(a) * .0096, bz, { segs: 10, edge: .6, cav: .55, bare: .92 });
        }
        reach += bLen;
      } else if (mods.barrel === 'cqb') {
        const bLen = .018, bz = mz - bLen / 2;
        chamferTube(.0115, .0115, bLen, steel, mx, my, bz, { edge: .5, bare: .35 });
        reach += bLen;
      }
    } else if (mods.barrel === 'marksman' && mods.muzzle !== 'brake') {
      const bLen = .018, bz = mz - bLen / 2;
      chamferTube(.0076, .0076, bLen, steel, mx, my, bz, { edge: .5, bare: .75, knurl: .6, parent: slideGroup || rootGroup });
      reach += bLen;
    }

    // 2. MUZZLE DEVICES (Suppressor / Multi-port Brake / Breacher Stand-off Choke)
    const muzParent = rig.id === 'pistol' && slideGroup ? slideGroup : rootGroup;
    if (mods.muzzle === 'suppressor') {
      const sLen = rig.id === 'pistol' ? .145 : .192;
      const rad = rig.id === 'pistol' ? .0158 : .0208;
      const z = mz - reach - sLen / 2;
      // QD ratchet locking collar
      chamferTube(rad * 1.07, rad * 1.07, .024, steel, mx, my, z + sLen / 2 - .012, { edge: .62, cav: .34, knurl: .78, parent: muzParent });
      // Main welded baffle body
      chamferTube(rad, rad, sLen - .022, anodised, mx, my, z - .009, { edge: .48, cav: .22, parent: muzParent });
      // Cordura thermal mirage sleeve on rifle suppressors
      if (rig.id === 'rifle') {
        chamferTube(rad * 1.045, rad * 1.045, sLen * .58, wrapMat, mx, my, z - .004, { edge: .22, cav: .3, knurl: .88, parent: muzParent });
        for (const band of [-.042, 0, .042]) {
          chamferTube(rad * 1.075, rad * 1.075, .006, steel, mx, my, z - .004 + band, { edge: .68, cav: .45, bare: .35, parent: muzParent });
        }
      }
      // Stepped front endcap + dark recessed bore
      chamferTube(rad * .92, rad * .86, .01, steel, mx, my, z - sLen / 2 + .004, { edge: .65, cav: .4, bare: .3, parent: muzParent });
      emit(new T.CircleGeometry(rad * .42, 24), glass, muzParent, true, { x: mx, y: my, z: z - sLen / 2 - .0015 });
      reach += sLen;
    } else if (mods.muzzle === 'brake') {
      if (rig.id === 'pistol') {
        // Contoured slide-matched square match compensator with top expansion port
        const cLen = .044, z = mz - reach - cLen / 2;
        bevelBox(.0275, .034, cLen, anodised, mx, my - .0025, z, { bevel: .0024, edge: .62, cav: .28, parent: muzParent });
        bevelBox(.013, .006, .024, glass, mx, my + .0135, z, { bevel: .0006, parent: muzParent });
        emit(new T.CircleGeometry(.0062, 20), glass, muzParent, true, { x: mx, y: my, z: z - cLen / 2 - .001 });
        reach += cLen;
      } else {
        const cLen = .054, z = mz - reach - cLen / 2;
        chamferTube(.0128, .0138, cLen, steel, mx, my, z, { edge: .58, cav: .32, bare: .35 });
        for (const portZ of [-.014, .002, .018]) {
          bevelBox(.029, .011, .008, glass, mx, my, z + portZ, { bevel: .0005 });
        }
        emit(new T.CircleGeometry(.0058, 20), glass, rootGroup, true, { x: mx, y: my, z: z - cLen / 2 - .001 });
        reach += cLen;
      }
    } else if (mods.muzzle === 'choke') {
      const cLen = .038, z = mz - reach - cLen / 2;
      chamferTube(.0195, .0205, cLen, steel, mx, my, z, { edge: .62, cav: .36, knurl: .65, bare: .28 });
      // Castellated breaching crown teeth
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        bevelBox(.0045, .0045, .009, steel, mx + Math.cos(a) * .017, my + Math.sin(a) * .017, z - cLen / 2 - .003, { edge: .75, bare: .65 });
      }
      emit(new T.CircleGeometry(.0095, 24), glass, rootGroup, true, { x: mx, y: my, z: z - cLen / 2 - .001 });
      reach += cLen;
    }

    // 3. MODULAR OPTICS (RAZOR LPVO / TA-31 ACOG / MRO-T Red Dot / Ghost-Ring Irons / Pistol RMR-HD)
    if (rig.id === 'rifle') {
      if (mods.optic === 'lpvo') {
        const z = sz + .018;
        // Cantilevered dual-ring Picatinny unimount with beveled clamp nuts
        bevelBox(.031, .011, .118, anodised, sx, railY + .005, z + .01, { bevel: .0016, edge: .58, cav: .42 });
        for (const off of [-.044, .046]) {
          const strutH = sy - (railY + .008);
          bevelBox(.026, strutH, .018, anodised, sx, railY + .008 + strutH / 2, z + off, { bevel: .0018, edge: .55, cav: .38 });
          chamferTube(.0178, .0178, .02, anodised, sx, sy, z + off, { edge: .6, cav: .34 });
          // Hex cross-bolts on left side (visible in first-person!)
          chamferTube(.0038, .0038, .005, steel, sx - .017, railY + .005, z + off, { segs: 6, ry: Math.PI / 2, edge: .72, bare: .55 });
        }
        // Main 30mm tube + flared objective bell + ocular bell + diopter + cat-tail throw lever
        chamferTube(.015, .015, .175, anodised, sx, sy, z, { edge: .42, cav: .22 });
        chamferTube(.015, .0215, .036, anodised, sx, sy, z - .102, { edge: .48, cav: .2 });
        chamferTube(.0215, .0215, .048, anodised, sx, sy, z - .142, { edge: .54, cav: .22 });
        chamferTube(.0185, .015, .018, anodised, sx, sy, z + .094, { edge: .45, cav: .24 });
        chamferTube(.0192, .0192, .046, anodised, sx, sy, z + .124, { edge: .52, cav: .24, knurl: .55 });
        // Throw leverfin on zoom ring
        bevelBox(.005, .016, .008, anodised, sx - .019, sy + .011, z + .082, { rz: .55, edge: .68 });
        // Knurled tactical elevation & windage turrets + illumination dial
        emit(new T.CylinderGeometry(.0105, .011, .017, 24), steel, rootGroup, false, { x: sx, y: sy + .022, z, edge: .65, cav: .36, knurl: .85 });
        emit(new T.CylinderGeometry(.0095, .01, .015, 24), steel, rootGroup, false, { x: sx + .021, y: sy, z, rz: Math.PI / 2, edge: .62, cav: .36, knurl: .85 });
        emit(new T.CylinderGeometry(.0085, .009, .012, 20), anodised, rootGroup, false, { x: sx - .019, y: sy, z, rz: Math.PI / 2, edge: .58, knurl: .75 });
        // Multi-coated emerald/ruby objective & ocular glass
        emit(new T.CircleGeometry(.0192, 32), glass, rootGroup, true, { x: sx, y: sy, z: z - .1655 });
        emit(new T.CircleGeometry(.0168, 32), glass, rootGroup, true, { x: sx, y: sy, z: z + .1465 });
      } else if (mods.optic === 'acog') {
        // Set well back on the rail: a prism sight has a short eye relief, and aimed its ocular should fill the eye.
        const z = sz + .045;
        // Forged prism mount + dual thumbscrews
        bevelBox(.031, .012, .092, anodised, sx, railY + .0055, z, { bevel: .0016, edge: .56, cav: .4 });
        for (const off of [-.028, .028]) {
          emit(new T.CylinderGeometry(.0055, .0055, .008, 16), steel, rootGroup, false, { x: sx - .018, y: railY + .006, z: z + off, rz: Math.PI / 2, edge: .68, knurl: .85 });
        }
        // Tapered forged prism body + objective hood + recessed ocular hood
        chamferTube(.0175, .0215, .062, anodised, sx, sy, z - .036, { edge: .54, cav: .25 });
        chamferTube(.0175, .0168, .046, anodised, sx, sy, z + .016, { edge: .52, cav: .25 });
        hollowTube(.0142, .0168, .0165, .014, anodised, sx, sy, z + .045, { edge: .58, cav: .32 });
        bevelBox(.024, sy - railY - .008, .064, anodised, sx, (sy + railY) * .5, z - .004, { bevel: .002, edge: .5, cav: .42 });
        // Translucent glowing red/amber fiber-optic light collector tube along top spine!
        chamferTube(.0024, .0024, .066, fiberMat, sx, sy + .0205, z - .024, { segs: 14, edge: .2 });
        bevelBox(.009, .006, .014, polymer, sx, sy + .019, z + .014, { edge: .4 });
        // Recessed multi-coated prism ocular & objective glass + collimated BDC chevron
        emit(new T.CircleGeometry(.019, 32), glass, rootGroup, true, { x: sx, y: sy, z: z - .0675 });
        const ocular = emit(new T.CircleGeometry(.0144, 32), glass, rootGroup, true, { x: sx, y: sy, z: z + .0405 });
        const lens = this.createCollimatedLens(T, .0142, { style: 'chevron', color: [1.0, .24, .08] });
        lens.position.set(sx, sy, z + .0415);
        lens.layers.mask = layerMask;
        rootGroup.add(lens);
        // The body is solid and its glass is dark, which is right from the hip and blind when aimed. Aimed,
        // the dark ocular gives way to a disc that draws nothing but depth, first of all the weapon's meshes:
        // whatever of the sight and the rifle lies behind it is not drawn, and the world shows through the
        // ocular with the chevron over it (setAim, called every frame by the gameplay layer).
        const pane = new T.Mesh(new T.CircleGeometry(.0142, 32), new T.MeshBasicMaterial({ colorWrite: false }));
        pane.position.set(sx, sy, z + .041);
        pane.renderOrder = -100; pane.layers.mask = layerMask; pane.frustumCulled = false; pane.visible = false;
        rootGroup.add(pane);
        sightPane = { pane, ocular };
        // a matte black liner inside the ocular hood: aimed, the hood's bore is the nearest thing to the eye
        const liner = new T.MeshStandardMaterial({ color: 0x050506, roughness: .92, metalness: 0, side: T.DoubleSide });
        emit(new T.CylinderGeometry(.01408, .01408, .0136, 32, 1, true), liner, rootGroup, true, { x: sx, y: sy, z: z + .045, rx: Math.PI / 2 });
      } else if (mods.optic === 'rds') {
        const z = sz - .005;
        // Skeletonized lower-1/3 riser mount
        bevelBox(.029, .01, .048, anodised, sx, railY + .0045, z, { bevel: .0014, edge: .58, cav: .38 });
        for (const off of [-.015, .015]) {
          bevelBox(.024, sy - railY - .016, .008, anodised, sx, (sy + railY) * .5, z + off, { bevel: .0012, edge: .56, cav: .42 });
        }
        chamferTube(.0042, .0042, .006, steel, sx - .0165, railY + .005, z, { segs: 6, ry: Math.PI / 2, edge: .7, bare: .5 });
        // True open-bore MRO-T wide-aperture micro-dot sleeve + top brightness rheostat dial
        hollowTube(.0134, .0156, .0172, .042, anodised, sx, sy, z, { edge: .56, cav: .26 });
        emit(new T.CylinderGeometry(.0072, .0076, .007, 18), anodised, rootGroup, false, { x: sx, y: sy + .018, z: z + .002, edge: .62, knurl: .82 });
        const lens = this.createCollimatedLens(T, .0135, { style: 'dot', color: [1.0, .14, .1] });
        lens.position.set(sx, sy, z + .004);
        lens.layers.mask = layerMask;
        rootGroup.add(lens);
      } else if (mods.optic === 'irons') {
        const front = -.375, frontBase = .0435;
        // Front sight base, tritium-tipped post & protective HK-style curved wings
        bevelBox(.018, .009, .022, steel, sx, frontBase + .0045, front, { edge: .58, cav: .38 });
        bevelBox(.0024, sy - frontBase - .007, .0028, steel, sx, (sy + frontBase + .005) / 2, front, { edge: .5, bare: .3 });
        emit(new T.SphereGeometry(.0013, 10, 10), tritiumMat, rootGroup, true, { x: sx, y: sy - .001, z: front + .0012 });
        for (const side of [-1, 1]) {
          bevelBox(.0026, .022, .015, steel, sx + side * .0095, frontBase + .018, front, { rz: -side * .16, edge: .62, cav: .34 });
        }
        // Rear match ghost-ring aperture + windage drum
        bevelBox(.022, .01, .022, steel, sx, railY + .005, .035, { edge: .58, cav: .38 });
        bevelBox(.006, sy - railY - .011, .006, steel, sx, (sy + railY) * .5 - .002, .035, { edge: .52, cav: .36 });
        emit(new T.TorusGeometry(.0066, .0018, 12, 28), steel, rootGroup, false, { x: sx, y: sy, z: .035, edge: .64, cav: .3 });
        emit(new T.CylinderGeometry(.0042, .0042, .006, 16), steel, rootGroup, false, { x: sx + .013, y: railY + .008, z: .035, rz: Math.PI / 2, edge: .65, knurl: .8 });
      }
    } else if (mods.optic === 'rmr') {
      // Slide-reciprocating RMR-HD pistol reflex sight!
      const pParent = slideGroup || rootGroup;
      const rz = .042, ry = .0185;
      bevelBox(.0255, .0045, .042, anodised, 0, ry, rz, { bevel: .001, edge: .58, cav: .35, parent: pParent });
      for (const side of [-1, 1]) {
        bevelBox(.0032, .016, .022, anodised, side * .0112, ry + .0095, rz - .008, { bevel: .001, edge: .64, cav: .28, parent: pParent });
      }
      bevelBox(.025, .0032, .018, anodised, 0, ry + .0175, rz - .009, { bevel: .0008, edge: .66, parent: pParent });
      const lens = this.createCollimatedLens(T, .0092, { style: 'dot', color: [1.0, .15, .1] });
      lens.position.set(0, ry + .0095, rz - .006);
      lens.layers.mask = layerMask;
      pParent.add(lens);
    }

    // 4. UNDERBARREL / TACTICAL RAIL HARDWARE (AFG / Stubby Vert / AN-PEQ-15 & X300V Laser-Light)
    if (rig.id === 'rifle') {
      if (mods.underbarrel === 'vert') {
        bevelBox(.026, .01, .048, polymer, 0, -.024, -.265, { bevel: .0016, edge: .38, cav: .45 });
        emit(new T.CylinderGeometry(.0142, .0128, .068, 28), polymer, rootGroup, false, { x: 0, y: -.058, z: -.265, rx: -.12, edge: .35, cav: .26, knurl: .88 });
      } else if (mods.underbarrel === 'angled') {
        bevelBox(.027, .012, .096, polymer, 0, -.025, -.275, { bevel: .002, edge: .34, cav: .4 });
        bevelBox(.024, .018, .052, polymer, 0, -.035, -.262, { rx: .34, bevel: .002, edge: .36, cav: .3, knurl: .85 });
      } else if (mods.underbarrel === 'laser') {
        // Right-offset top/side AN/PEQ-15 tactical laser-illuminator box (clearly visible in 1P!)
        const lx = .021, ly = .038, lz = -.315;
        bevelBox(.036, .019, .086, polymer, lx, ly, lz, { bevel: .0022, edge: .42, cav: .34, knurl: .4 });
        bevelBox(.014, .009, .038, anodised, .006, .042, lz, { bevel: .0012, edge: .56, cav: .42 });
        // Mode turret + dual coated laser/IR-illuminator objective bezels
        emit(new T.CylinderGeometry(.0065, .007, .005, 16), polymer, rootGroup, false, { x: lx + .004, y: ly + .0115, z: lz + .012, edge: .5, knurl: .8 });
        chamferTube(.0055, .0055, .008, anodised, lx - .007, ly + .001, lz - .045, { edge: .6, bare: .25 });
        chamferTube(.0072, .0072, .009, anodised, lx + .008, ly + .001, lz - .045, { edge: .6, bare: .25 });
        emit(new T.CircleGeometry(.0042, 16), tritiumMat, rootGroup, true, { x: lx - .007, y: ly + .001, z: lz - .0495 });
        emit(new T.CircleGeometry(.0058, 18), glass, rootGroup, true, { x: lx + .008, y: ly + .001, z: lz - .0502 });
        laserOrigin = [lx - .007, ly + .001, lz - .05];
      }
    } else if (mods.underbarrel === 'laser') {
      // Pistol dust-cover X300V weaponlight / green laser combo
      const ly = -.021, lz = -.072;
      bevelBox(.026, .021, .062, anodised, 0, ly, lz, { bevel: .0022, edge: .56, cav: .34 });
      chamferTube(.0108, .0118, .022, anodised, 0, ly + .001, lz - .038, { edge: .62, cav: .26 });
      emit(new T.CircleGeometry(.0096, 20), glass, rootGroup, true, { x: 0, y: ly + .001, z: lz - .0495 });
      laserOrigin = [0, ly - .006, lz - .048];
    }

    // 5. ANIMATED MAGAZINE BASEPLATE EXTENSIONS (Moves with `rig.partsRef.mag` on reload!)
    // A drum-fed platform replaces the stick magazine body with a twin-drum 100-round magazine
    // (feed tower into the magwell, a drum either side) and carries a folded bipod under the rail.
    const hidden = [];
    if (magGroup && config.drum && rig.id === 'rifle') {
      for (const node of rig.partsRef.mag.children) {
        if (node.isMesh && node.material?.name === 'pac9_polymer_tan') hidden.push(node);
      }
      bevelBox(.031, .1, .058, polymer, 0, -.062, -.016, { rx: .12, bevel: .003, edge: .42, cav: .4, parent: magGroup });
      bevelBox(.035, .016, .064, polymer, 0, -.126, -.012, { rx: .12, bevel: .0026, edge: .5, cav: .36, parent: magGroup });
      for (const side of [-1, 1]) {
        const x = side * .049;
        emit(new T.CylinderGeometry(.056, .056, .05, 40), polymer, magGroup, false, { x, y: -.164, z: -.006, rz: Math.PI / 2, edge: .4, cav: .3, knurl: .25 });
        emit(new T.CylinderGeometry(.05, .054, .006, 40), anodised, magGroup, false, { x: x + side * .027, y: -.164, z: -.006, rz: Math.PI / 2, edge: .6, cav: .42 });
        emit(new T.CylinderGeometry(.014, .016, .008, 20), steel, magGroup, false, { x: x + side * .032, y: -.164, z: -.006, rz: Math.PI / 2, edge: .7, bare: .45, knurl: .7 });
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * Math.PI * 2;
          bevelBox(.046, .006, .006, polymer, x, -.164 + Math.cos(a) * .057, -.006 + Math.sin(a) * .057, { rx: -a, bevel: .0012, edge: .5, cav: .3, parent: magGroup });
        }
      }
      const clampZ = mz + .085;
      bevelBox(.03, .014, .028, steel, 0, -.03, clampZ, { bevel: .0016, edge: .62, cav: .4 });
      for (const side of [-1, 1]) {
        chamferTube(.0052, .0046, .118, anodised, side * .009, -.04, clampZ + .062, { segs: 14, edge: .55, cav: .3, ry: side * .05 });
        bevelBox(.011, .007, .016, polymer, side * .012, -.042, clampZ + .126, { bevel: .0014, edge: .4, knurl: .7 });
      }
    }
    if (magGroup && (config.extMag || config.id === 'pdw')) {
      if (rig.id === 'rifle') {
        bevelBox(.026, .042, .064, anodised, 0, -.162, -.018, { rx: .18, bevel: .0024, edge: .58, cav: .34, knurl: .55, parent: magGroup });
      } else {
        bevelBox(.024, .028, .038, anodised, 0, -.105, 0, { bevel: .002, edge: .6, cav: .32, knurl: .5, parent: magGroup });
      }
    }

    rig.root.add(rootGroup);
    return {
      group: rootGroup,
      slideGroup,
      magGroup,
      muzzleShift: reach,
      muzzleAt,                       // [x, y] of the bore where it is not the rifle's (the rocket tube sits beside the sight)
      laserOrigin,
      /* How far the weapon is aimed, 0 to 1: past half way a prism sight opens to the eye. */
      setAim(level) {
        if (!sightPane) return;
        const open = level > .5;
        sightPane.pane.visible = open; sightPane.ocular.visible = !open;
      },
      get aimOpen() { return !!sightPane && sightPane.pane.visible; },
      /* Rounds in the weapon: a rocket's nose shows in the muzzle while there is one. */
      setLoaded(n) { if (rocketGroup) rocketGroup.visible = n > 0; },
      /* The fore-end of a pump gun, 0 forward to 1 right back: it slides, and the left hand's hold with it. */
      setPump(k) {
        if (!pumpGroup) return;
        const dz = Math.max(0, Math.min(1, k || 0)) * .072, fore = rig.holds && rig.holds.fore;
        pumpGroup.position.z = dz;
        if (fore && fore.p) { if (rig._gsForeZ == null) rig._gsForeZ = fore.p.z; fore.p.z = rig._gsForeZ + dz; }
      },
      get pumps() { return !!pumpGroup; },
      setVisible(vis) {
        rootGroup.visible = vis;
        if (slideGroup) slideGroup.visible = vis;
        if (magGroup) magGroup.visible = vis;
        for (const node of hidden) node.visible = !vis;          // the stick magazine body gives way to the drum
        for (const node of beneath) node.layers.mask = vis ? 0 : masks.get(node);      // a launcher is the whole weapon
        if (pumpGroup && !vis) { pumpGroup.position.z = 0; if (rig._gsForeZ != null && rig.holds?.fore?.p) rig.holds.fore.p.z = rig._gsForeZ; }
      },
      dispose() {
        const clean = grp => {
          if (!grp) return;
          grp.parent?.remove(grp);
          grp.traverse(n => { if (n.isMesh) n.geometry?.dispose?.(); });
        };
        if (rootGroup.visible) for (const node of beneath) node.layers.mask = masks.get(node);
        clean(rootGroup); clean(slideGroup); clean(magGroup);
        if (sightPane) sightPane.pane.material.dispose();
        if (dark) dark.dispose();
        for (const node of hidden) node.visible = true;
      }
    };
  },

  /* Synthesize custom multi-variant WebAudio gunshot, suppressor, PDW, shotgun, heavy-caliber, flak cannon,
     rocket launch and shell-burst, spent-casing, selector, gunsmith ratchet, and melee buffers directly into `g.audio.register`.
     Uses physical Friedlander blast pulses, phase-integrated sub-bass chamber sweeps, 2-pole RBJ
     biquad multi-band turbulence, and damped bolt-carrier mass (zero high-frequency sine chimes). */
  installAudio(g) {
    const audio = g.audio, ctx = audio?.ctx;
    if (!ctx?.createBuffer || !audio?.register || audio._gsInstalled) return;
    audio._gsInstalled = true;
    const sr = ctx.sampleRate || 48000;
    const TAU = Math.PI * 2;

    const makeBuffer = (duration, renderFn) => {
      const len = Math.max(1, Math.floor(sr * duration));
      const buf = ctx.createBuffer(2, len, sr);
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      renderFn(L, R, len, sr);
      return buf;
    };

    const synthVariants = (count, duration, fn) => {
      const out = [];
      for (let v = 0; v < count; v++) {
        let seed = ((v + 1) * 987654321) >>> 0;
        const rnd = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return (seed / 4294967296) * 2 - 1;
        };
        out.push(makeBuffer(duration, (L, R, len) => fn(L, R, len, sr, rnd, v)));
      }
      return out;
    };

    const bqCoeffs = (type, fc, q, rate) => {
      const w0 = TAU * Math.max(14, Math.min(fc, rate * .46)) / rate;
      const cos = Math.cos(w0), sin = Math.sin(w0), alpha = sin / (2 * q);
      let b0, b1, b2;
      if (type === 'lp') { b0 = (1 - cos) * .5; b1 = 1 - cos; b2 = b0; }
      else if (type === 'hp') { b0 = (1 + cos) * .5; b1 = -(1 + cos); b2 = b0; }
      else { b0 = alpha; b1 = 0; b2 = -alpha; }
      const invA0 = 1 / (1 + alpha);
      return [b0 * invA0, b1 * invA0, b2 * invA0, -2 * cos * invA0, (1 - alpha) * invA0];
    };

    const biquad = (sig, type, fc, q, rate) => {
      const c = bqCoeffs(type, fc, q, rate);
      let z1 = 0, z2 = 0;
      for (let i = 0; i < sig.length; i++) {
        const x = sig[i], y = c[0] * x + z1;
        z1 = c[1] * x - c[3] * y + z2;
        z2 = c[2] * x - c[4] * y;
        sig[i] = y;
      }
      return sig;
    };

    const sweepLp = (sig, fnFreq, q, rate) => {
      let z1 = 0, z2 = 0, c = bqCoeffs('lp', fnFreq(0), q, rate);
      for (let i = 0; i < sig.length; i++) {
        if ((i & 31) === 0) c = bqCoeffs('lp', fnFreq(i / rate), q, rate);
        const x = sig[i], y = c[0] * x + z1;
        z1 = c[1] * x - c[3] * y + z2;
        z2 = c[2] * x - c[4] * y;
        sig[i] = y;
      }
      return sig;
    };

    // RMS-normalized multi-band chamber/baffle turbulence layers.
    const addBands = (out, len, rate, rnd, bands, holdSec, attSec = .0006) => {
      const nR = Math.min(len, Math.max(32, Math.floor(.055 * rate)));
      for (let bIdx = 0; bIdx < bands.length; bIdx++) {
        const [fHp, fLp, gain, tau] = bands[bIdx];
        const tmp = new Float32Array(len);
        for (let i = 0; i < len; i++) tmp[i] = rnd();
        biquad(tmp, 'hp', fHp, .707, rate);
        biquad(tmp, 'hp', fHp, .707, rate);
        biquad(tmp, 'lp', fLp, .707, rate);
        let sq = 0;
        for (let i = 0; i < nR; i++) sq += tmp[i] * tmp[i];
        const norm = gain / Math.sqrt(sq / nR + 1e-12);
        for (let i = 0; i < len; i++) {
          const t = i / rate;
          const env = (1 - Math.exp(-t / attSec)) * (t < holdSec ? 1 : Math.exp(-(t - holdSec) / tau));
          out[i] += tmp[i] * norm * env;
        }
      }
    };

    // Phase-integrated chamber sub-thump + Friedlander pressure wave P(t) = (1 - t/t+) * exp(-t/t+).
    const addPressure = (out, len, rate, f0, f1, tauF, tauA, thumpGain, tPlus, blastGain, drive = .65) => {
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const t = i / rate;
        ph += TAU * (f1 + (f0 - f1) * Math.exp(-t / tauF)) / rate;
        const thump = Math.sin(ph) * Math.exp(-t / tauA) * (1 - Math.exp(-t / .0007)) * thumpGain;
        const u = t / tPlus;
        const blast = u < 14 ? (1 - u) * Math.exp(-u) * blastGain : 0;
        out[i] = Math.tanh((out[i] + thump + blast) * drive);
      }
    };

    // Damped reciprocating bolt/slide mass: low-mid receiver thud + broadband dry sear clack (no high-Q sine ring).
    const addActionMass = (out, len, rate, rnd, atSec, gain, fBody, fClack) => {
      const i0 = Math.max(0, Math.floor(atSec * rate));
      const mLen = Math.min(len - i0, Math.floor(.036 * rate));
      if (mLen <= 8) return;
      const clack = new Float32Array(mLen);
      const knock = new Float32Array(mLen);
      for (let i = 0; i < mLen; i++) { const n = rnd(); clack[i] = n; knock[i] = n; }
      biquad(clack, 'bp', fClack, 1.15, rate);
      biquad(clack, 'lp', 2150, .707, rate);
      biquad(knock, 'lp', 560, .707, rate);
      let ph = 0;
      for (let i = 0; i < mLen; i++) {
        const dt = i / rate;
        ph += TAU * (fBody * .46 + fBody * .54 * Math.exp(-dt / .0045)) / rate;
        const body = (Math.sin(ph) * .72 + knock[i] * 1.35) * Math.exp(-dt / .008);
        const sear = clack[i] * 3.1 * Math.exp(-dt / .0024);
        out[i0 + i] += (body + sear) * gain;
      }
    };

    const finalizeStereo = (L, R, mono, rate, rnd, ceil = .9, drive = 1.45, airAmt = .035, airDecay = .028) => {
      biquad(mono, 'hp', 32, .707, rate);
      const fadeIn = Math.min(mono.length >> 2, Math.max(4, Math.floor(.00035 * rate)));
      const fadeOut = Math.min(mono.length >> 2, Math.max(16, Math.floor(.012 * rate)));
      const side = new Float32Array(mono.length);
      for (let i = 0; i < side.length; i++) side[i] = rnd();
      biquad(side, 'bp', 680, .85, rate);
      const normTanh = ceil / Math.tanh(drive);
      for (let i = 0; i < mono.length; i++) {
        let s = Math.tanh(mono[i] * drive) * normTanh;
        if (i < fadeIn) s *= i / fadeIn;
        else if (i >= mono.length - fadeOut) {
          const k = (mono.length - 1 - i) / fadeOut;
          s *= k * k;
        }
        const st = side[i] * Math.exp(-(i / rate) / airDecay) * airAmt;
        L[i] = Math.max(-.98, Math.min(.98, s + st));
        R[i] = Math.max(-.98, Math.min(.98, s - st));
      }
    };

    const VP = [1, .972, 1.028, .986, 1.016, .96];

    // 1. Subsonic Suppressed (.300 BLK / 9mm PDW): heavy baffled chamber thump + stacked gas chuff + damped bolt mass
    audio.register('gs_subsonic', synthVariants(6, .24, (L, R, len, rate, rnd, v) => {
      const p = VP[v % VP.length], mono = new Float32Array(len);
      addBands(mono, len, rate, rnd, [
        [68 * p, 245 * p, 1.85, .042],
        [225 * p, 920 * p, 1.95, .025],
        [880 * p, 2350 * p, .88, .01]
      ], .008);
      addPressure(mono, len, rate, 166 * p, 53 * p, .017, .036, 1.5, .00135 / p, 1.35, .62);
      sweepLp(mono, t => (440 + 1950 * Math.exp(-t / .022) + 1500 * Math.exp(-t / .0024)) * p, .65, rate);
      sweepLp(mono, t => (490 + 2150 * Math.exp(-t / .024) + 1650 * Math.exp(-t / .0024)) * p, .65, rate);
      addActionMass(mono, len, rate, rnd, .024 + v * .0009, .28, 220 * p, 940 * p);
      addActionMass(mono, len, rate, rnd, .046 + v * .0011, .2, 265 * p, 1180 * p);
      finalizeStereo(L, R, mono, rate, rnd, .86, 1.42, .03, .024);
    }), 'gun', { max: 12, pri: 9 });

    // 2. Supersonic Suppressed (5.56 / 9mm +P / 6.5 QDC): pressurized baffle blowdown + crisp port pop + bolt thud
    audio.register('gs_suppressed', synthVariants(6, .3, (L, R, len, rate, rnd, v) => {
      const p = VP[v % VP.length], mono = new Float32Array(len);
      addBands(mono, len, rate, rnd, [
        [74 * p, 275 * p, 1.8, .048],
        [250 * p, 1280 * p, 2.05, .03],
        [1150 * p, 3450 * p, 1.15, .012]
      ], .01);
      addPressure(mono, len, rate, 180 * p, 56 * p, .019, .04, 1.45, .00082 / p, 1.65, .64);
      sweepLp(mono, t => (520 + 2600 * Math.exp(-t / .026) + 2800 * Math.exp(-t / .0022)) * p, .65, rate);
      sweepLp(mono, t => (580 + 2900 * Math.exp(-t / .028) + 3100 * Math.exp(-t / .0022)) * p, .65, rate);
      addActionMass(mono, len, rate, rnd, .026 + v * .0009, .26, 235 * p, 1020 * p);
      addActionMass(mono, len, rate, rnd, .051 + v * .0011, .19, 280 * p, 1260 * p);
      finalizeStereo(L, R, mono, rate, rnd, .9, 1.48, .038, .03);
    }), 'gun', { max: 12, pri: 9 });

    // 3. Unsuppressed KR-9 PDW: tight, punchy short-barrel SMG bark when suppressor is stripped
    audio.register('gs_pdw', synthVariants(6, .38, (L, R, len, rate, rnd, v) => {
      const p = VP[v % VP.length], mono = new Float32Array(len);
      addBands(mono, len, rate, rnd, [
        [88 * p, 260 * p, 1.7, .055],
        [250 * p, 1250 * p, 2.2, .038],
        [1200 * p, 4800 * p, 1.55, .018]
      ], .014);
      addPressure(mono, len, rate, 204 * p, 66 * p, .018, .042, 1.55, .00048 / p, 2.2, .62);
      sweepLp(mono, t => (760 + 2800 * Math.exp(-t / .045) + 9200 * Math.exp(-t / .0026)) * p, .62, rate);
      sweepLp(mono, t => (820 + 3100 * Math.exp(-t / .048) + 9800 * Math.exp(-t / .0026)) * p, .62, rate);
      addActionMass(mono, len, rate, rnd, .024 + v * .0008, .2, 230 * p, 1080 * p);
      addActionMass(mono, len, rate, rnd, .045 + v * .001, .15, 275 * p, 1320 * p);
      finalizeStereo(L, R, mono, rate, rnd, .93, 1.52, .045, .04);
    }), 'gun', { max: 12, pri: 9 });

    // 4. Marksman 6.5 Creedmoor DMR: supersonic N-wave shock crack + deep chest punch
    audio.register('gs_marksman', synthVariants(4, .68, (L, R, len, rate, rnd, v) => {
      const p = VP[v % 4], mono = new Float32Array(len);
      addBands(mono, len, rate, rnd, [
        [62 * p, 210 * p, 2.05, .12],
        [200 * p, 1050 * p, 2.25, .062],
        [1050 * p, 6200 * p, 1.75, .026]
      ], .022);
      addPressure(mono, len, rate, 148 * p, 44 * p, .028, .068, 1.85, .00038 / p, 2.6, .6);
      sweepLp(mono, t => (680 + 3200 * Math.exp(-t / .075) + 12500 * Math.exp(-t / .003)) * p, .6, rate);
      sweepLp(mono, t => (740 + 3500 * Math.exp(-t / .08) + 13000 * Math.exp(-t / .003)) * p, .6, rate);
      addActionMass(mono, len, rate, rnd, .035 + v * .0012, .22, 195 * p, 980 * p);
      addActionMass(mono, len, rate, rnd, .072 + v * .0015, .18, 240 * p, 1220 * p);
      finalizeStereo(L, R, mono, rate, rnd, .95, 1.58, .05, .065);
    }), 'gun', { max: 8, pri: 9 });

    // 5. 12-Gauge Breacher: cavernous low-end chamber boom + wide scatter blast + steel carrier latch
    audio.register('gs_shotgun', synthVariants(4, .74, (L, R, len, rate, rnd, v) => {
      const p = VP[v % 4], mono = new Float32Array(len);
      addBands(mono, len, rate, rnd, [
        [52 * p, 185 * p, 2.35, .145],
        [175 * p, 880 * p, 2.3, .078],
        [850 * p, 4100 * p, 1.5, .032]
      ], .026);
      addPressure(mono, len, rate, 118 * p, 36 * p, .036, .088, 2.1, .00066 / p, 2.4, .58);
      sweepLp(mono, t => (540 + 2600 * Math.exp(-t / .09) + 8800 * Math.exp(-t / .0034)) * p, .6, rate);
      sweepLp(mono, t => (600 + 2900 * Math.exp(-t / .095) + 9400 * Math.exp(-t / .0034)) * p, .6, rate);
      addActionMass(mono, len, rate, rnd, .205 + v * .004, .26, 180 * p, 1120 * p);
      addActionMass(mono, len, rate, rnd, .255 + v * .004, .22, 225 * p, 1380 * p);
      finalizeStereo(L, R, mono, rate, rnd, .96, 1.62, .06, .08);
    }), 'gun', { max: 6, pri: 9 });

    // 6. .45 Super Heavy Sidearm: concussive chest bark + damped steel slide lockup (zero high sine ring)
    audio.register('gs_heavy', synthVariants(4, .48, (L, R, len, rate, rnd, v) => {
      const p = VP[v % 4], mono = new Float32Array(len);
      addBands(mono, len, rate, rnd, [
        [82 * p, 255 * p, 1.9, .068],
        [245 * p, 1320 * p, 2.25, .044],
        [1280 * p, 5100 * p, 1.65, .019]
      ], .014);
      addPressure(mono, len, rate, 196 * p, 58 * p, .02, .048, 1.75, .00046 / p, 2.35, .6);
      sweepLp(mono, t => (780 + 2900 * Math.exp(-t / .052) + 9600 * Math.exp(-t / .0026)) * p, .62, rate);
      sweepLp(mono, t => (840 + 3200 * Math.exp(-t / .055) + 10200 * Math.exp(-t / .0026)) * p, .62, rate);
      addActionMass(mono, len, rate, rnd, .021 + v * .0008, .24, 245 * p, 1140 * p);
      addActionMass(mono, len, rate, rnd, .046 + v * .001, .2, 295 * p, 1390 * p);
      finalizeStereo(L, R, mono, rate, rnd, .93, 1.54, .04, .045);
    }), 'gun', { max: 8, pri: 9 });

    // 6b. FK-40 flak cannon: a 40 mm chamber is all low end. A slow heavy thump, a short dull blast, and the
    // carrier coming home a quarter of a second later.
    audio.register('gs_flak', synthVariants(3, .74, (L, R, len, rate, rnd, v) => {
      const p = VP[v % 3], mono = new Float32Array(len);
      addBands(mono, len, rate, rnd, [
        [38 * p, 150 * p, 2.6, .12],
        [140 * p, 640 * p, 2.0, .062],
        [600 * p, 2700 * p, .95, .022]
      ], .03);
      addPressure(mono, len, rate, 94 * p, 29 * p, .046, .115, 2.4, .0011 / p, 2.0, .56);
      sweepLp(mono, t => (360 + 1700 * Math.exp(-t / .085) + 5200 * Math.exp(-t / .004)) * p, .6, rate);
      addActionMass(mono, len, rate, rnd, .245 + v * .004, .3, 150 * p, 900 * p);
      addActionMass(mono, len, rate, rnd, .315 + v * .004, .24, 190 * p, 1150 * p);
      finalizeStereo(L, R, mono, rate, rnd, .96, 1.6, .06, .09);
    }), 'gun', { max: 4, pri: 9 });

    // 6c. RL-90 rocket launcher: the charge that throws the rocket clear, then the motor's rush falling away
    // down the yard as it leaves.
    audio.register('gs_rocket', synthVariants(3, 1.3, (L, R, len, rate, rnd, v) => {
      const p = VP[v % 3], mono = new Float32Array(len), rush = new Float32Array(len);
      addBands(mono, len, rate, rnd, [
        [44 * p, 170 * p, 2.3, .13],
        [160 * p, 900 * p, 1.9, .07]
      ], .03);
      addPressure(mono, len, rate, 108 * p, 33 * p, .04, .1, 2.0, .0009 / p, 1.8, .56);
      for (let i = 0; i < len; i++) rush[i] = rnd();
      biquad(rush, 'hp', 230 * p, .707, rate);
      sweepLp(rush, t => (700 + 5200 * Math.exp(-t / .5)) * p, .7, rate);
      for (let i = 0; i < len; i++) {
        const t = i / rate;
        mono[i] += rush[i] * 1.5 * (1 - Math.exp(-t / .012)) * Math.exp(-t / .36);
      }
      sweepLp(mono, t => (700 + 9000 * Math.exp(-t / .26)) * p, .6, rate);
      finalizeStereo(L, R, mono, rate, rnd, .95, 1.5, .08, .2);
    }), 'gun', { max: 3, pri: 9 });

    // 6d. What a shell does where it lands, heard from where it lands (the engine's own explosion is under it):
    // the flak round's hard crack and the rattle of its fragments; the rocket's long low roll.
    audio.register('gs_flak_burst', synthVariants(3, .95, (L, R, len, rate, rnd, v) => {
      const p = VP[v % 3], mono = new Float32Array(len), grit = new Float32Array(len);
      addBands(mono, len, rate, rnd, [
        [70 * p, 260 * p, 2.0, .09],
        [250 * p, 1500 * p, 2.2, .05],
        [1400 * p, 6000 * p, 1.5, .02]
      ], .012);
      addPressure(mono, len, rate, 150 * p, 46 * p, .026, .07, 1.7, .0005 / p, 2.5, .6);
      // fragments: sparse clicks thinning out over half a second
      for (let i = 0; i < len; i++) { const t = i / rate; grit[i] = Math.abs(rnd()) > 1 - .05 * Math.exp(-t / .16) ? rnd() * 2.4 * Math.exp(-t / .3) : 0; }
      biquad(grit, 'bp', 2600 * p, .9, rate);
      for (let i = 0; i < len; i++) mono[i] += grit[i];
      sweepLp(mono, t => (900 + 11000 * Math.exp(-t / .09)) * p, .6, rate);
      finalizeStereo(L, R, mono, rate, rnd, .9, 1.5, .07, .12);
    }), 'world', { max: 4, pri: 7, ref: 16, roll: .7 });

    audio.register('gs_rocket_blast', synthVariants(2, 2.3, (L, R, len, rate, rnd, v) => {
      const p = VP[v % 2], mono = new Float32Array(len);
      addBands(mono, len, rate, rnd, [
        [26 * p, 110 * p, 3.0, .5],
        [100 * p, 520 * p, 2.3, .28],
        [500 * p, 2600 * p, 1.2, .07]
      ], .05);
      addPressure(mono, len, rate, 70 * p, 22 * p, .09, .34, 2.6, .0016 / p, 2.4, .54);
      sweepLp(mono, t => (240 + 2600 * Math.exp(-t / .3) + 6000 * Math.exp(-t / .012)) * p, .6, rate);
      finalizeStereo(L, R, mono, rate, rnd, .95, 1.55, .08, .5);
    }), 'world', { max: 3, pri: 8, ref: 22, roll: .6 });

    // 7. Spent Brass Casing on Dock Concrete: dry muted stone tap + ultra-short damped brass tick (no wind-chime ring)
    audio.register('shell_bounce', synthVariants(4, .25, (L, R, len, rate, rnd, v) => {
      const p = [1, 1.05, .94, 1.02][v & 3], mono = new Float32Array(len);
      const taps = [[.001, 1], [.088 + v * .011, .46]];
      for (const [t0, amp] of taps) {
        const i0 = Math.floor(t0 * rate), nS = Math.min(len - i0, Math.floor(.028 * rate));
        if (nS <= 4) continue;
        const stone = new Float32Array(nS), brass = new Float32Array(nS);
        for (let i = 0; i < nS; i++) { const n = rnd(); stone[i] = n; brass[i] = n; }
        biquad(stone, 'bp', 1320 * p, 1.05, rate);
        biquad(brass, 'bp', 2380 * p, 2.1, rate);
        biquad(brass, 'lp', 3600, .707, rate);
        for (let i = 0; i < nS; i++) {
          const dt = i / rate;
          mono[i0 + i] += (stone[i] * 2.2 * Math.exp(-dt / .0016) + brass[i] * 1.65 * Math.exp(-dt / .0042)) * amp;
        }
      }
      biquad(mono, 'hp', 260, .707, rate);
      let pk = 0;
      for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(mono[i]));
      const sc = pk > 0 ? .24 / pk : 1;
      for (let i = 0; i < len; i++) L[i] = R[i] = mono[i] * sc;
    }), 'world', { max: 3, pri: 1, ref: 2, roll: 1.2 });

    // 8. Tactile Foley: machined steel fire-selector detent, Picatinny throw-lever, buttstock melee strike
    audio.register('gs_selector', synthVariants(2, .048, (L, R, len, rate, rnd, v) => {
      const mono = new Float32Array(len);
      addActionMass(mono, len, rate, rnd, .0006, .75, v ? 310 : 280, v ? 1480 : 1340);
      finalizeStereo(L, R, mono, rate, rnd, .52, 1.25, .01, .012);
    }), 'dry', { max: 3, pri: 7 });

    // a pump gun worked: back (the bolt unlocks, the empty leaves), then forward (the next goes in, the bolt locks)
    audio.register('gs_pump', synthVariants(3, .44, (L, R, len, rate, rnd, v) => {
      const mono = new Float32Array(len);
      addActionMass(mono, len, rate, rnd, .004, .9, 205, 960);
      addActionMass(mono, len, rate, rnd, .034, .5, 300, 1480);
      addActionMass(mono, len, rate, rnd, .19 + v * .006, 1, 235, 1120);
      addActionMass(mono, len, rate, rnd, .216 + v * .006, .62, 340, 1700);
      finalizeStereo(L, R, mono, rate, rnd, .6, 1.3, .015, .02);
    }), 'dry', { max: 3, pri: 7 });

    // a dash (src/gunslinger.js): cloth and air, a quarter of a second, rising then gone
    audio.register('gs_dash', synthVariants(3, .28, (L, R, len, rate, rnd, v) => {
      const mono = new Float32Array(len);
      let lp = 0, bp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len, env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.12)), 1.5) * (1 - t * .35);
        const f = .05 + .2 * Math.sin(Math.PI * t) * (1 + v * .08);
        lp += (rnd() - lp) * f; bp += (lp - bp) * .02;
        mono[i] = (lp - bp) * env * 1.5;
      }
      finalizeStereo(L, R, mono, rate, rnd, .5, 1.2, .01, .012);
    }), 'dry', { max: 2, pri: 6 });

    audio.register('gs_attach', synthVariants(2, .11, (L, R, len, rate, rnd, v) => {
      const mono = new Float32Array(len);
      addActionMass(mono, len, rate, rnd, .001, .62, 240, 1120);
      addActionMass(mono, len, rate, rnd, .038 + v * .003, .82, 320, 1520);
      finalizeStereo(L, R, mono, rate, rnd, .58, 1.3, .015, .02);
    }), 'dry', { max: 3, pri: 7 });

    audio.register('gs_melee', synthVariants(2, .24, (L, R, len, rate, rnd) => {
      const mono = new Float32Array(len), swish = new Float32Array(len);
      for (let i = 0; i < len; i++) swish[i] = rnd();
      biquad(swish, 'bp', 520, .75, rate);
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const t = i / rate;
        ph += TAU * (42 + 74 * Math.exp(-t / .028)) / rate;
        const whoosh = swish[i] * 2.1 * Math.sin(Math.min(1, t / .16) * Math.PI);
        const thud = Math.sin(ph) * Math.exp(-t / .042) * (1 - Math.exp(-t / .002)) * .75;
        mono[i] = whoosh + thud;
      }
      finalizeStereo(L, R, mono, rate, rnd, .76, 1.35, .03, .06);
    }), 'near', { max: 2, pri: 6 });

    audio.customFire = () => {
      const cfg = g.arsenal?.held?.();
      if (!cfg) return false;
      const interior = audio.interior || 0;
      const playTail = (gainOut, gainIn, pitch = 1) => {
        const outW = Math.cos(interior * Math.PI / 2) * gainOut;
        const inW = Math.sin(interior * Math.PI / 2) * gainIn;
        const outName = cfg.rig === 'pistol' ? 'pistol_tail_out' : 'rifle_tail_out';
        const inName = cfg.rig === 'pistol' ? 'pistol_tail_in' : 'rifle_tail_in';
        if (outW > .025) audio.play(outName, { gain: outW, pitch, jitter: .02, noDefer: true });
        if (inW > .025) audio.play(inName, { gain: inW, pitch, jitter: .02, noDefer: true });
      };
      if (cfg.suppressed) {
        const pitch = cfg.id === 'marksman' || cfg.id === 'breacher' ? .88
          : cfg.id === 'pdw' ? .96
          : cfg.id === 'heavy' ? .94
          : cfg.rig === 'pistol' ? 1.04 : 1;
        audio.play(cfg.subsonic ? 'gs_subsonic' : 'gs_suppressed', {
          gain: cfg.subsonic ? .9 : .96,
          pitch,
          jitter: .024
        });
        if (cfg.subsonic) playTail(.04, .085, .86);
        else playTail(.14, .2, .98);
        audio.duck?.(cfg.subsonic ? .88 : .78);
        return true;
      }
      if (cfg.id === 'pdw') {
        audio.play('gs_pdw', { gain: .96, pitch: cfg.compensated ? 1.03 : 1, jitter: .022 });
        playTail(.46, .56, 1.05);
        audio.duck?.(.52);
        return true;
      }
      if (cfg.id === 'breacher' || cfg.id === 'pump') {
        audio.play('gs_shotgun', { gain: 1, pitch: (cfg.pellets === 1 ? .94 : 1) * (cfg.id === 'pump' ? .9 : 1), jitter: .018 });
        playTail(.68, .78, .82);
        audio.duck?.(.34);
        return true;
      }
      if (cfg.id === 'marksman') {
        audio.play('gs_marksman', { gain: 1, pitch: cfg.compensated ? 1.03 : .98, jitter: .015 });
        playTail(.64, .72, .88);
        audio.duck?.(.38);
        return true;
      }
      if (cfg.id === 'flak') {
        audio.play('gs_flak', { gain: 1, jitter: .02 });
        playTail(.6, .72, .7);
        audio.duck?.(.36);
        return true;
      }
      if (cfg.id === 'rocket') {
        audio.play('gs_rocket', { gain: 1, jitter: .015 });
        playTail(.5, .62, .64);
        audio.duck?.(.4);
        return true;
      }
      if (cfg.id === 'heavy') {
        audio.play('gs_heavy', { gain: .98, pitch: cfg.compensated ? 1.03 : .98, jitter: .018 });
        playTail(.48, .56, .95);
        audio.duck?.(.48);
        return true;
      }
      if (cfg.compensated) {
        // Layer crisp low-mid compensator side-port concussion onto standard carbine/sidearm fire.
        audio.play(cfg.rig === 'pistol' ? 'gs_heavy' : 'gs_pdw', { gain: .34, pitch: 1.06, jitter: .02 });
        return false;
      }
      return false;
    };
  }
};
