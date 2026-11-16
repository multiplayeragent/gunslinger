/* The dead. Bodies come from figure.js (one skinned mesh each, painted from an atlas); motion is procedural
   (shamble, sprint, lunge, flinch, crawl). Arms and legs have their own health and come off: a body that loses
   a leg drops and drags itself on, one that loses its arms bites. Death hands the body to ragdoll.js.
   Pathing follows flow fields over a navigation grid. Toward the crystal there is a set for every way into the
   church, each in a few "lanes" of differently weighted ground, and every body is given one of them, so a wave
   spreads over all the doors and no two bodies need walk the same line; toward each player there is one more.
   On top of the field each body weaves to its own rhythm, flanks the living and gives its neighbours room.
   They come out of the trees all round, up through graves and open ground, and out of the mausoleums.
   Some of them are not people: a demon on wings that throws fire, a horned skull that flies in and goes off, a
   great bat that swoops, and spiders of two sizes that climb walls to spring from them. Those that fly steer
   through the air (stepFly) and only follow the ground's ways in when they cannot see what they are after; the
   skull, the bat and the spiders have bodies of their own (beasts.js) instead of a painted, skinned one.
   Played together, one machine (the host) thinks for the dead and reports them ten times a second in a packed
   string; the others show what it reports and send it their hits. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const PI = Math.PI;

  // arm / leg: limb health as a share of the body's
  V.ZOMBIES = {
    walker: { hp: 100, speed: [1.25, 1.95], dmg: 10, crystalDmg: 6, interval: 1.25, reach: 1.45, reward: 40, scale: [0.95, 1.08], aggro: 9, eye: [1.3, 1.7, 2.0], r: 0.34, mass: 1, arm: 0.6, leg: 0.8 },
    runner: { hp: 60, speed: [4.3, 5.1], dmg: 8, crystalDmg: 4, interval: 0.8, reach: 1.4, reward: 55, scale: [0.9, 1.0], aggro: 24, eye: [3.0, 0.6, 0.25], r: 0.32, mass: 0.8, arm: 0.7, leg: 0.9 },
    spitter: { hp: 85, speed: [1.6, 2.0], dmg: 8, crystalDmg: 5, interval: 1.3, reach: 1.4, reward: 75, scale: [1.0, 1.08], aggro: 18, eye: [0.5, 2.6, 0.5], r: 0.4, mass: 1.2, arm: 0.6, leg: 0.8, spit: { range: 15, dmg: 13, crystalDmg: 11, cd: 2.8 } },
    brute: { hp: 750, speed: [1.7, 2.0], dmg: 28, crystalDmg: 22, interval: 1.7, reach: 2.0, reward: 220, scale: [1.42, 1.52], aggro: 11, eye: [3.0, 1.5, 0.3], r: 0.55, mass: 4, arm: 0.3, leg: 0.36 },
    boss: { hp: 3600, speed: [1.6, 1.7], dmg: 45, crystalDmg: 55, interval: 2.0, reach: 2.9, reward: 1200, scale: [2.1, 2.1], aggro: 13, eye: [4.5, 0.3, 0.2], r: 0.8, mass: 12, arm: 0.12, leg: 0, noCrawl: true,
      // its fire: a ring let off round it after gathering itself (wind), bolts thrown in a fan, and a while spent wreathed
      fire: { nova: { cd: [10, 15], radius: 8.5, dmg: 30, crystalDmg: 45, wind: 1.15 }, bolts: { cd: [5.5, 9], n: 3, range: 30, dmg: 18, crystalDmg: 14, splash: 2.6 }, aura: { cd: [14, 22], dur: 8, radius: 3.8, dps: 11 } } },
    // These borrow a body from one of the kinds above (its mesh and painted atlas, `body`), tinted, with eyes of
    // their own colour (`glow` multiplies the borrowed body's) and whatever else is theirs bolted on.
    // wolf: on all fours, faster than anything, springs from range. burster: walks up, swells and goes off; killed
    // otherwise than through the head it goes off where it stands, smaller. pyre: burning, throws fire that splashes.
    wolf: { body: 'runner', tint: [0.17, 0.16, 0.175], glow: [1.0, 2.6, 0.5], fours: true, tall: 0.95, hp: 70, speed: [6.0, 6.8], dmg: 11, crystalDmg: 5, interval: 0.8, reach: 1.5, reward: 70, scale: [0.96, 1.06], aggro: 32, eye: [3.0, 1.6, 0.15], r: 0.36, mass: 0.9, arm: 0.8, leg: 0.9,
      leap: { from: 4.2, to: 10.5, cd: 3.4, dmg: 16, speed: 13.5, wind: 0.38 } },
    burster: { body: 'spitter', tint: [1.3, 0.72, 0.5], glow: [5.5, 0.4, 0.2], hp: 130, speed: [2.3, 2.8], dmg: 0, crystalDmg: 0, interval: 1, reach: 2.0, reward: 90, scale: [1.08, 1.16], aggro: 22, eye: [2.8, 1.0, 0.1], r: 0.42, mass: 1.5, arm: 0.6, leg: 0.8,
      burst: { radius: 5.2, dmg: 42, crystalDmg: 38, fuse: 0.95, onDeath: 0.55 } },
    pyre: { body: 'walkerB', tint: [0.36, 0.25, 0.21], glow: [2.6, 0.85, 0.15], burning: true, hp: 110, speed: [1.5, 1.9], dmg: 9, crystalDmg: 6, interval: 1.3, reach: 1.45, reward: 85, scale: [1.0, 1.1], aggro: 26, eye: [3.4, 1.4, 0.3], r: 0.36, mass: 1.1, arm: 0.6, leg: 0.8,
      spit: { range: 24, dmg: 16, crystalDmg: 13, cd: 3.4, splash: 2.6 } },
    // The ones that fly, and the spiders. `fly`: it goes through the air, between `alt` metres above the floor
    // (to its middle), holding off at `keep`. `beast`: a body of its own from beasts.js, not a painted one.
    // centre: how far above its reference point (pos) its middle is, at scale 1; half: how far a flyer's body
    // reaches above and below that middle (what it collides with). cry: its voice.
    // demon: a borrowed body with wings, horns and a tail; hovers, drifts round whoever it is after and throws
    // fire. skull: flies at someone living, a guard or a turret (whichever is nearest) or the crystal, gathers
    // itself (wind) inside `from` metres, charges and goes off (its blast leaves the dead alone: dead 0); shot
    // down first, it only bursts. bat: comes in
    // threes (pack), circles, dives through for a bite and climbs away. spider, greatspider: walk the dead's
    // grid (the great one a brute's), spring like the wolf, and with someone between `from` and `to` metres off
    // make for any wall within `reach` (times its scale) and climb it, to spring from `rise` metres up.
    demon: { body: 'runner', tint: [0.27, 0.07, 0.062], glow: [4.5, 2.6, 0.6], ember: [0.07, 0.008, 0.003], winged: true, noCrawl: true, cry: 'demon_cry', centre: 1.1, half: 0.85,
      hp: 150, speed: [4.4, 5.2], dmg: 0, crystalDmg: 0, interval: 1, reach: 1.4, reward: 110, scale: [1.02, 1.12], aggro: 60, eye: [3.6, 2.2, 0.4], r: 0.42, mass: 1.1, arm: 0.7, leg: 0.9,
      fly: { alt: [3.0, 4.6], keep: [8.5, 13], strafe: 0.32 }, spit: { range: 27, dmg: 13, crystalDmg: 9, cd: 2.4, splash: 2.0, speed: 24 } },
    skull: { beast: 'skull', cry: 'skull_shriek', centre: 1.08, half: 0.4, hp: 45, speed: [5.2, 6.2], dmg: 0, crystalDmg: 0, interval: 1, reach: 1.2, reward: 55, scale: [0.95, 1.12], aggro: 70, r: 0.36, mass: 0.6, arm: 1, leg: 1,
      fly: { alt: [1.3, 2.3] }, charge: { from: 13, speed: 13, turn: 2.6, wind: 0.5, radius: 4.4, dmg: 34, crystalDmg: 30, near: 1.3, give: 2.4, dead: 0 } },
    bat: { beast: 'bat', pack: 3, cry: 'bat_squeak', centre: 1.06, half: 0.34, hp: 50, speed: [7.2, 8.4], dmg: 9, crystalDmg: 4, interval: 1, reach: 1.2, reward: 35, scale: [1.0, 1.2], aggro: 80, r: 0.34, mass: 0.5, arm: 1, leg: 1,
      fly: { alt: [3.6, 5.0], keep: [6, 9] }, swoop: { speed: 11.5, cd: [2.4, 4.2], bite: 1.15, past: 5 } },
    spider: { beast: 'spider', cry: 'spider_hiss', centre: 0.4, tall: 0.62, eyeY: 0.45, hp: 80, speed: [3.6, 4.4], dmg: 10, crystalDmg: 5, interval: 0.9, reach: 1.35, reward: 55, scale: [0.92, 1.15], aggro: 26, r: 0.4, mass: 0.9, arm: 1, leg: 1,
      leap: { from: 3.2, to: 8.5, cd: 4, dmg: 14, speed: 12, wind: 0.34 }, climb: { from: 4, to: 15, cd: [5, 9], rise: [2.4, 3.8], speed: 2.8, wait: [0.5, 0.9], reach: 7, least: 1.1 } },
    greatspider: { beast: 'spider', size: 1, cry: 'spider_hiss', cryPitch: 0.55, centre: 0.4, tall: 0.6, eyeY: 0.45, hp: 620, speed: [2.6, 3.0], dmg: 24, crystalDmg: 18, interval: 1.4, reach: 2.3, reward: 240, scale: [2.0, 2.25], aggro: 24, r: 0.6, mass: 3.4, arm: 1, leg: 1,
      leap: { from: 5, to: 11, cd: 6.5, dmg: 30, speed: 12.5, wind: 0.5 }, climb: { from: 6, to: 17, cd: [8, 13], rise: [3.0, 4.6], speed: 2.4, wait: [0.6, 1.0], reach: 4, least: 1.4 } },
  };

  // ------------------------------------------------------------------ flow-field navigation
  // LANES: fields per way in. PEN: what crossing somebody else's threshold costs, per cell (more than any walk
  // round the church, so it only happens when a body's own way in is shut). SPREAD: how much further a way in
  // may be, in the fields' own units (about three to the metre), before it is a third as likely to be chosen.
  // CLOSE, FURTHER: a body this near the threshold of another way in (about seven metres), with its own this
  // much further off (about eleven), changes its mind.
  const LANES = 3, PEN = 60, SPREAD = 60, CLOSE = 22, FURTHER = 35;
  // The dead come in three sizes. Everything up to a spitter shares one grid, cut 0.3 m from every obstacle.
  // A brute and the abomination are wider than that margin and taller than some lintels, so each has a grid of
  // its own, cut to its own girth and height, and fields of its own over it: neither is ever sent at a gap, a
  // post or a doorway it cannot pass. OPEN: a way in is open to a size when the walk from its threshold to the
  // crystal costs less than this (more means the only way led round through another door, at PEN a cell).
  // STEP: what the engine's capsule climbs without stopping.
  const SIZES = ['', 'brute', 'boss'], OPEN = 150, STEP = 0.42;
  // whose grid a type walks: its own if it has one, or the one its config names (the great spider goes where a brute can)
  V.zombieSize = (type) => { const c = V.ZOMBIES[type]; return c && c.size != null ? c.size : Math.max(0, SIZES.indexOf(type)); };
  function makeNav(g, entrances = []) {
    // The engine's grid pads obstacles by half a metre and a cell, which seals a two-metre aisle. The dead are
    // 0.34 m across, so this grid is rasterised again from the same colliders with a tighter margin.
    const E = g.physics.nav._grid(), G = { w: E.w, h: E.h, minX: E.minX, minZ: E.minZ, cell: E.cell }, w = G.w, h = G.h, N = w * h, PAD = 0.3;
    const REACH = 8;                                       // near: how many cells an open cell is from something solid (1 touches it; 0 is further than REACH)
    const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    // One record per size: its grid, its margins, its plain field to the crystal and where that starts, what its
    // ground costs to cross, a field toward each living player, and whether any of that size is walking.
    const sizes = SIZES.map((type, i) => {
      const c = type ? V.ZOMBIES[type] : null;
      return {
        i, big: !!c, pad: c ? c.r + 0.12 : PAD, top: c ? 0.6 + 1.6 * c.scale[1] : 1.5, rings: c ? [2.0, 2.5, 3.0, 3.5] : [1.5, 2.0, 2.5],
        blocked: new Uint8Array(N), near: new Uint8Array(N), crystal: new Float32Array(N), seeds: [], cost: c ? new Float32Array(N) : null, fields: new Map(), live: !c,
      };
    });
    const S0 = sizes[0], blocked = S0.blocked, near = S0.near, crystalField = S0.crystal, WIDE_ONLY = SIZES.indexOf('boss');
    const sz = (v) => (v === true ? WIDE_ONLY : v > 0 && v < sizes.length ? v | 0 : 0);     // true: the old "wide only"
    function rasterise(s) {
      const blk = s.blocked, pad = s.pad;
      blk.fill(0);
      for (const b of g.physics.boxes) {
        if (b.bulletOnly || b.max.y < 0.47 || b.min.y > s.top) continue;
        // noNav marks what the small dead walk over or slip round. A big body is stopped by anything that
        // stands more than a step high in its way, whatever it is marked: a post, a door leaf, a low lintel.
        if (b.noNav && !(s.big && b.max.y - Math.max(0, b.min.y) > STEP)) continue;
        const x0 = Math.max(0, Math.ceil((b.min.x - pad - G.minX) / G.cell - 0.5)), x1 = Math.min(w - 1, Math.floor((b.max.x + pad - G.minX) / G.cell - 0.5));
        const z0 = Math.max(0, Math.ceil((b.min.z - pad - G.minZ) / G.cell - 0.5)), z1 = Math.min(h - 1, Math.floor((b.max.z + pad - G.minZ) / G.cell - 0.5));
        for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) blk[z * w + x] = 1;
      }
      for (let i = 0; i < w; i++) { blk[i] = blk[w + i] = blk[(h - 1) * w + i] = blk[(h - 2) * w + i] = 1; }
      for (let i = 0; i < h; i++) { blk[i * w] = blk[i * w + 1] = blk[i * w + w - 1] = blk[i * w + w - 2] = 1; }
    }
    function margins(s) {
      const blk = s.blocked, nr = s.near;
      nr.fill(0);
      let head = 0, tail = 0;
      for (let z = 1; z < h - 1; z++) for (let x = 1; x < w - 1; x++) {
        const c = z * w + x;
        if (!blk[c]) continue;
        for (let k = 0; k < 8; k++) { const n = c + NB[k][1] * w + NB[k][0]; if (!blk[n] && !nr[n]) { nr[n] = 1; queue[tail++] = n; } }
      }
      while (head < tail) {
        const c = queue[head++], r = nr[c];
        if (r >= REACH) continue;
        for (let k = 0; k < 8; k++) { const n = c + NB[k][1] * w + NB[k][0]; if (!blk[n] && !nr[n]) { nr[n] = r + 1; queue[tail++] = n; } }
      }
    }
    const queue = new Int32Array(N);
    const idx = (x, z) => { const cx = Math.floor((x - G.minX) / G.cell), cz = Math.floor((z - G.minZ) / G.cell); return cx < 0 || cz < 0 || cx >= w || cz >= h ? -1 : cz * w + cx; };
    // breadth-first flood from the seeds over one size's grid; two passes of relaxation smooth the diagonal bias
    function flood(field, seeds, maxDist, blk = blocked) {
      field.fill(Infinity);
      let head = 0, tail = 0;
      for (const s of seeds) if (s >= 0 && field[s] === Infinity) { field[s] = 0; queue[tail++] = s; }
      while (head < tail) {
        const c = queue[head++], d = field[c];
        if (d > maxDist) continue;
        const cx = c % w, cz = (c / w) | 0;
        for (let k = 0; k < 8; k++) {
          const nx = cx + NB[k][0], nz = cz + NB[k][1];
          if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
          const n = nz * w + nx;
          if (blk[n]) continue;
          if (k > 3 && (blk[cz * w + nx] || blk[nz * w + cx])) continue;
          const nd = d + NB[k][2];
          if (nd < field[n]) { const first = field[n] === Infinity; field[n] = nd; if (first) queue[tail++] = n; }
        }
      }
      return field;
    }
    // The same flood over ground that costs different amounts to cross (cost per cell, plus PEN in any way in
    // but `own`): cheapest-first from a binary heap, stale entries skipped as they surface. It can stop after a
    // number of cells and carry on later (the heap and its size persist), so a rebuild never holds up a frame.
    const HK = new Float32Array(N * 4), HI = new Int32Array(N * 4);
    const OFF = Int32Array.from(NB, (q) => q[1] * w + q[0]), OX = Int32Array.from(NB, (q) => q[0]), OZ = Int32Array.from(NB, (q) => q[1] * w), LEN = Float32Array.from(NB, (q) => q[2]);
    let hn = 0;
    function floodStart(field, from) {
      field.fill(Infinity); hn = 0;
      for (const s of from) if (s >= 0 && field[s] === Infinity) { field[s] = 0; HK[hn] = 0; HI[hn++] = s; }    // all keys equal: already a heap
    }
    // true once the field is complete
    function floodRun(field, cost, own, cells, blk) {
      let n = hn;
      while (n > 0 && cells-- > 0) {
        const c = HI[0], d = HK[0];
        n--;
        if (n > 0) {
          const key = HK[n], i = HI[n];
          let q = 0;
          for (;;) { let l = q * 2 + 1; if (l >= n) break; if (l + 1 < n && HK[l + 1] < HK[l]) l++; if (HK[l] >= key) break; HK[q] = HK[l]; HI[q] = HI[l]; q = l; }
          HK[q] = key; HI[q] = i;
        }
        if (d > field[c]) continue;
        // the two outermost rings of the grid are solid, so every neighbour of an open cell is inside it
        for (let k = 0; k < 8; k++) {
          const m = c + OFF[k];
          if (blk[m] || (k > 3 && (blk[c + OX[k]] || blk[c + OZ[k]]))) continue;
          const zm = zone[m], nd = d + LEN[k] * (zm !== 0 && zm !== own ? cost[m] + PEN : cost[m]);
          if (nd < field[m] && n < HK.length) {
            field[m] = nd;
            let q = n++;
            while (q > 0) { const up = (q - 1) >> 1; if (HK[up] <= nd) break; HK[q] = HK[up]; HI[q] = HI[up]; q = up; }
            HK[q] = nd; HI[q] = m;
          }
        }
      }
      hn = n;
      return n === 0;
    }

    // Which way in each cell belongs to (0: none), the slow noise that makes each lane's ground uneven (fixed),
    // and what each lane costs to cross (the noise, plus keeping off walls: refreshed when the colliders change).
    const zone = new Uint8Array(N), rough = [], lanes = [], kit = V.kit;
    entrances.forEach((e, i) => {
      for (let z = 0; z < h; z++) {
        const wz = G.minZ + (z + 0.5) * G.cell; if (wz < e.z0 || wz > e.z1) continue;
        for (let x = 0; x < w; x++) { const wx = G.minX + (x + 0.5) * G.cell; if (wx >= e.x0 && wx <= e.x1) zone[z * w + x] = i + 1; }
      }
    });
    for (let k = 0; k < LANES; k++) {
      const r = (rough[k] = new Float32Array(N)); lanes[k] = new Float32Array(N);
      for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
        const wx = G.minX + (x + 0.5) * G.cell, wz = G.minZ + (z + 0.5) * G.cell;
        r[z * w + x] = 1.7 * kit.smooth(0.42, 0.7, kit.fbm2(wx * 0.075 + k * 37.1 + 5.3, wz * 0.075 - k * 19.7 + 2.9, 2));
      }
    }
    const costs = (k) => { const c = lanes[k], r = rough[k]; for (let i = 0; i < N; i++) c[i] = 1 + r[i] + (near[i] === 1 ? 0.9 : near[i] === 2 ? 0.35 : 0); };

    // One route per way in; a level with none still gets one, straight to the crystal. `fields` are the small
    // dead's, a lane each; `big` holds one field for each larger size, and `open` says whether that size can
    // come in this way at all.
    const routes = (entrances.length ? entrances : [null]).map((e, i) => ({
      id: e ? e.id : 'any', wide: e ? !!e.wide : true, zone: e ? i + 1 : 0, mid: e ? idx((e.x0 + e.x1) / 2, (e.z0 + e.z1) / 2) : -1,
      fields: Array.from({ length: LANES }, () => new Float32Array(N).fill(Infinity)),
      big: sizes.map((s) => (s.big ? new Float32Array(N).fill(Infinity) : null)), open: sizes.map(() => true), cells: [],
    }));
    for (let i = 0; i < N; i++) if (zone[i]) routes[zone[i] - 1].cells.push(i);
    const fieldOfRoute = (r, size) => (size ? r.big[size] : r.fields[0]);
    const usable = (r, size) => r.open[size] && (size !== WIDE_ONLY || r.wide);
    // can this size walk from this threshold to the crystal without going round by another?
    const isOpen = (r, s) => { if (!r.zone) return true; const f = r.big[s.i]; for (const c of r.cells) if (!s.blocked[c] && f[c] < OPEN) return true; return false; };
    // a bigger size's grid, margins, ground and plain field: one job, a few milliseconds
    function grid(s) {
      rasterise(s); margins(s); crystal(s);
      const c = s.cost, r = rough[0], nr = s.near;
      for (let i = 0; i < N; i++) c[i] = 1 + r[i] + (nr[i] === 1 ? 1.2 : nr[i] === 2 ? 0.5 : 0);     // the big keep to the middle of what they pass through
    }
    function crystal(s) {
      const C = V.CRYSTAL;
      s.seeds = [];
      for (let a = 0; a < 40; a++) for (const r of s.rings) { const i = idx(C.x + Math.cos(a / 40 * PI * 2) * r, C.z + Math.sin(a / 40 * PI * 2) * r); if (i >= 0 && !s.blocked[i]) s.seeds.push(i); }
      flood(s.crystal, s.seeds, 1e9, s.blocked);
    }
    // The work a change of colliders leaves to do, in order: the bigger sizes' grids, the margins round
    // obstacles, each lane's costs, then every route field, flooded into `draft` a slice at a time and copied
    // over the live field when whole.
    const pending = [], draft = new Float32Array(N);
    let flooding = null;
    const SLICE = 2600;                                    // cells settled per frame: about a millisecond
    const nav = {
      grid: G, idx, crystalField, blocked, near, zone, routes, LANES, SIZES,
      // one size's grid, margins and plain field to the crystal
      blockedOf(size) { return sizes[sz(size)].blocked; },
      nearOf(size) { return sizes[sz(size)].near; },
      crystal(size) { return sizes[sz(size)].crystal; },
      // whether any of a bigger size is walking: the fields toward players are only kept for sizes that are
      live(size, on) { const s = sizes[sz(size)]; if (s.big) s.live = !!on; },
      // a field toward one player, keyed by who it is, for every size that is about
      buildFor(key, x, z) {
        for (const s of sizes) {
          if (!s.live) { s.fields.delete(key); continue; }
          let f = s.fields.get(key); if (!f) s.fields.set(key, (f = new Float32Array(N)));
          flood(f, [nav.nearestFree(x, z, s.i)], 110, s.blocked);
        }
      },
      fieldOf(key, size) { return sizes[sz(size)].fields.get(key) || null; },
      forget(keep) { for (const s of sizes) for (const k of s.fields.keys()) if (!keep.has(k)) s.fields.delete(k); },
      free(x, z, size) { const i = idx(x, z); return i >= 0 && !sizes[sz(size)].blocked[i]; },
      // how far a point may be moved from (x, z) and still be in the clear, in metres (never more than `most`)
      room(x, z, most = 3.5, size) { const s = sizes[sz(size)], c = idx(x, z), r = c < 0 || s.blocked[c] ? 1 : s.near[c]; return r ? Math.min(most, Math.max(0, (r - 1.5) * G.cell)) : most; },
      nearestFree(x, z, size) {
        const blk = sizes[sz(size)].blocked, cx = Math.floor((x - G.minX) / G.cell), cz = Math.floor((z - G.minZ) / G.cell);
        for (let r = 0; r < 8; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
          if (!blk[nz * w + nx]) return nz * w + nx;
        }
        return -1;
      },
      buildCrystal() { crystal(S0); },
      // The colliders changed. The plain field is rebuilt at once; the bigger sizes' grids and the routes follow
      // a little at a time (tick), and until its turn comes a field still leads where it did: steps into cells
      // that have closed are refused.
      rebuild() {
        rasterise(S0); crystal(S0);
        pending.length = 0; flooding = null;
        for (const s of sizes) if (s.big) pending.push(['grid', s.i]);
        pending.push(['margins']);
        for (let k = 0; k < LANES; k++) pending.push(['costs', k]);
        for (let k = 0; k < LANES; k++) for (let r = 0; r < routes.length; r++) pending.push(['route', r, k, 0]);
        for (const s of sizes) if (s.big) for (let r = 0; r < routes.length; r++) pending.push(['route', r, 0, s.i]);
      },
      // one slice of whatever is left to do; returns how many steps remain
      tick(cells = SLICE) {
        if (flooding) {
          const [, r, k, c] = flooding, s = sizes[c];
          if (floodRun(draft, c ? s.cost : lanes[k], routes[r].zone, cells, s.blocked)) {
            (c ? routes[r].big[c] : routes[r].fields[k]).set(draft);
            if (c) routes[r].open[c] = isOpen(routes[r], s);
            flooding = null;
          }
          return pending.length + (flooding ? 1 : 0);
        }
        const job = pending.shift();
        if (!job) return 0;
        if (job[0] === 'grid') grid(sizes[job[1]]);
        else if (job[0] === 'margins') margins(S0);
        else if (job[0] === 'costs') costs(job[1]);
        else { flooding = job; floodStart(draft, sizes[job[3]].seeds); }
        return pending.length + (flooding ? 1 : 0);
      },
      settle() { while (nav.tick(1e9)) { /* until nothing is left */ } },
      field(route, lane, size) { const r = routes[route], c = sz(size); return !r ? sizes[c].crystal : c ? r.big[c] : r.fields[lane % LANES]; },
      // whether a body of this size can come in by this way: it fits, and the way is not shut
      usable(route, size) { const r = routes[route]; return !!r && usable(r, sz(size)); },
      // Which way in a body at (x, z) makes for: nearer ways are likelier, crowded ones (load[i] bodies already
      // bound for way i) less so. A bigger size only chooses among the ways it fits through.
      route(x, z, size, load) {
        size = sz(size);
        const c = nav.nearestFree(x, z, size);
        if (c < 0 || routes.length < 2) return 0;
        let dmin = Infinity;
        for (const r of routes) if (usable(r, size)) dmin = Math.min(dmin, fieldOfRoute(r, size)[c]);
        if (dmin === Infinity) return 0;
        let total = 0;
        const wts = routes.map((r, i) => { const d = fieldOfRoute(r, size)[c], v = d === Infinity || !usable(r, size) ? 0 : Math.exp(-(d - dmin) / SPREAD) / (1 + 0.14 * ((load && load[i]) || 0)); total += v; return v; });
        let pick = Math.random() * total;
        for (let i = 0; i < wts.length; i++) { pick -= wts[i]; if (pick <= 0 && wts[i] > 0) return i; }
        return wts.findIndex((v) => v > 0);
      },
      // A body bound for one way in that finds itself a short walk from another, with its own still a long way
      // round, takes the one in front of it: nothing shuffles past an open door. Returns the way to make for.
      nearer(route, x, z, size) {
        size = sz(size);
        const c = idx(x, z);
        if (c < 0 || sizes[size].blocked[c] || !routes[route]) return route;
        const own = fieldOfRoute(routes[route], size)[c];
        let best = route, bv = own;
        for (let i = 0; i < routes.length; i++) { const v = fieldOfRoute(routes[i], size)[c]; if (v < bv && usable(routes[i], size)) { bv = v; best = i; } }
        if (best === route || own - bv <= FURTHER) return route;
        const sill = routes[best].mid >= 0 ? fieldOfRoute(routes[best], size)[routes[best].mid] : Infinity;      // what its threshold is worth
        return bv - sill < CLOSE ? best : route;
      },
      // Which way is downhill at a world position; false if the field does not reach it. Where the ground is
      // open the answer is the true slope of the field, not one of eight compass points, so paths are not kinked.
      // `size` names whose grid the field was flooded over.
      dirAt(field, x, z, out, size) {
        const s = sizes[sz(size)], blk = s.blocked, nr = s.near;
        let c = idx(x, z);
        if (c < 0) return false;
        if (blk[c]) { c = nav.nearestFree(x, z, s.i); if (c < 0) return false; }
        const cx = c % w, cz = (c / w) | 0, here = field[c];
        let best = here, bx = 0, bz = 0, gx = 0, gz = 0;
        for (let k = 0; k < 8; k++) {
          const nx = cx + NB[k][0], nz = cz + NB[k][1];
          if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
          const n = nz * w + nx;
          if (blk[n]) continue;
          if (k > 3 && (blk[cz * w + nx] || blk[nz * w + cx])) continue;
          const f = field[n];
          if (f < best) { best = f; bx = NB[k][0]; bz = NB[k][1]; }
          if (f < here && here !== Infinity) { const sl = (here - f) / (NB[k][2] * NB[k][2]); gx += NB[k][0] * sl; gz += NB[k][1] * sl; }
        }
        if (!bx && !bz) return false;                       // standing in a pocket the flood never reached, or at the goal
        // the steepest neighbour, aimed at its centre: always safe
        let tx = G.minX + (cx + bx + 0.5) * G.cell - x, tz = G.minZ + (cz + bz + 0.5) * G.cell - z;
        const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        const gl = Math.hypot(gx, gz);
        if (gl > 1e-6 && (nr[c] === 0 || nr[c] > 2)) {
          const sx = gx / gl, sz2 = gz / gl, ahead = idx(x + sx * G.cell * 1.3, z + sz2 * G.cell * 1.3);
          if (sx * bx + sz2 * bz > 0 && ahead >= 0 && !blk[ahead]) { tx = sx; tz = sz2; }
        }
        out.x = tx; out.z = tz;
        return true;
      },
    };
    nav.rebuild(); nav.settle();
    return nav;
  }
  V.zombieNav = makeNav;                                    // for the tests

  // ------------------------------------------------------------------ ray tests
  const raySphere = (ox, oy, oz, dx, dy, dz, cx, cy, cz, r) => {
    const x = cx - ox, y = cy - oy, z = cz - oz, b = x * dx + y * dy + z * dz, h = b * b - (x * x + y * y + z * z - r * r);
    if (h < 0) return Infinity;
    const t = b - Math.sqrt(h);
    return t >= 0 ? t : Infinity;
  };
  // a capsule from a to b
  const rayCapsule = (ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r) => {
    const bax = bx - ax, bay = by - ay, baz = bz - az, oax = ox - ax, oay = oy - ay, oaz = oz - az;
    const baba = bax * bax + bay * bay + baz * baz;
    if (baba < 1e-7) return raySphere(ox, oy, oz, dx, dy, dz, ax, ay, az, r);
    const bard = bax * dx + bay * dy + baz * dz, baoa = bax * oax + bay * oay + baz * oaz, rdoa = dx * oax + dy * oay + dz * oaz, oaoa = oax * oax + oay * oay + oaz * oaz;
    const a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - r * r * baba, h = b * b - a * c;
    if (a > 1e-9 && h >= 0) {
      const t = (-b - Math.sqrt(h)) / a, y = baoa + t * bard;
      if (y > 0 && y < baba) return t >= 0 ? t : Infinity;
      return y <= 0 ? raySphere(ox, oy, oz, dx, dy, dz, ax, ay, az, r) : raySphere(ox, oy, oz, dx, dy, dz, bx, by, bz, r);
    }
    if (a <= 1e-9) return Math.min(raySphere(ox, oy, oz, dx, dy, dz, ax, ay, az, r), raySphere(ox, oy, oz, dx, dy, dz, bx, by, bz, r));
    return Infinity;
  };

  // ------------------------------------------------------------------ packing for the wire
  // six bits a character, from an alphabet that never reads as a number
  const A64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', I64 = {};
  for (let i = 0; i < 64; i++) I64[A64[i]] = i;
  const e64 = (n, w) => { let o = ''; for (let i = w - 1; i >= 0; i--) o += A64[(n >> (6 * i)) & 63]; return o; };
  const d64 = (str, i, w) => { let n = 0; for (let k = 0; k < w; k++) n = (n << 6) | (I64[str[i + k]] || 0); return n; };
  const qPos = (v) => Math.max(0, Math.min(4095, Math.round(((v + 66) / 132) * 4095))), uPos = (n) => (n / 4095) * 132 - 66;
  const q63 = (v) => Math.max(0, Math.min(63, Math.round(v * 63)));
  const REC = 14;                                         // characters per zombie in a snapshot
  const ALT = 6.3;                                        // the last of them: how high above the floor it is (a flyer, a spider on a wall), in tenths of a metre
  V.zpack = { e64, d64, qPos, uPos, REC, ALT };

  // ------------------------------------------------------------------ the manager
  const WALK = 0, RISE = 1, DEAD = 2, EMERGE = 3;        // EMERGE: walking out of a mausoleum, not yet steering
  // How far off its line each kind wanders (radians), the two rhythms it does it to (rad/s: a slow drift and a
  // quicker stagger), how wide it swings round the living, and how far to one side of the field's line it walks.
  const GAIT = {
    walker: { amp: 0.55, f1: [0.3, 0.75], f2: [1.2, 2.3], flank: 0.75, side: 1 }, runner: { amp: 0.4, f1: [0.5, 1.0], f2: [2.6, 3.8], flank: 0.95, side: 1 },
    spitter: { amp: 0.45, f1: [0.3, 0.7], f2: [1.1, 2.0], flank: 0.6, side: 1 }, brute: { amp: 0.24, f1: [0.25, 0.5], f2: [0.9, 1.5], flank: 0.35, side: 0.6 },
    boss: { amp: 0.1, f1: [0.2, 0.4], f2: [0.7, 1.1], flank: 0.15, side: 0.3 },
  };
  const rand = (a, b) => a + Math.random() * (b - a);
  const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  const turnToward = (a, b, step) => { let d = ((b - a + PI) % (PI * 2) + PI * 2) % (PI * 2) - PI; return Math.abs(d) <= step ? b : a + Math.sign(d) * step; };
  const LIMB_KEYS = ['armL', 'armR', 'legL', 'legR'], BRIGHT = 2.3;

  V.zombies = {
    async create(g) {
      const T = g.THREE, kit = V.kit, F = V.figure, CFG = V.ZOMBIES, BI = F.BI, world = V.loose;
      const root = new T.Group(); root.name = 'zombies'; g.scene.add(root);
      const ragdoll = V.ragdoll.create(g, world);

      // ---- bodies: one geometry and one painted atlas per kind ----
      const loader = new T.TextureLoader(), aniso = Math.min(4, g.renderer.capabilities.getMaxAnisotropy ? g.renderer.capabilities.getMaxAnisotropy() : 1);
      const loadAtlas = (kind) => new Promise((resolve) => {
        loader.load('assets/zombies/' + kind + '.webp', (t) => { t.colorSpace = T.SRGBColorSpace; t.anisotropy = aniso; resolve(t); }, undefined, () => {
          console.error('[vigil] zombie atlas failed to load: ' + kind);
          const d = new T.DataTexture(new Uint8Array([120, 128, 110, 255]), 1, 1); d.colorSpace = T.SRGBColorSpace; d.needsUpdate = true; resolve(d);
        });
      });
      const typeOf = {}; for (const t in F.KINDS) for (const k of F.KINDS[t]) typeOf[k] = t;
      const bodies = {};
      await Promise.all(Object.keys(typeOf).map(async (kind) => {
        const { geo, glow } = F.build(T, kit, kind, { eye: CFG[typeOf[kind]].eye });
        const map = await loadAtlas(kind);
        const mat = new T.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 1.6, roughness: 0.74, metalness: 0, alphaTest: 0.5, side: T.DoubleSide });
        mat.name = 'vg_zombie_' + kind;
        bodies[kind] = { geo, glow, mat, build: Object.assign({ chest: 1, belly: 1, arm: 1, leg: 1, head: 1 }, F.LOOKS[kind].build) };
      }));
      const glowMat = new T.MeshBasicMaterial({ vertexColors: true, fog: false }); glowMat.name = 'vg_zombie_glow';

      const nav = (V.nav = makeNav(g, (V.world && V.world.church && V.world.church.entrances) || []));
      let navDirty = 0;
      world.onChange(() => { navDirty = 0.6; });
      g.events.on('vigil:broken', ({ pos }) => { ragdoll.wake(pos.x, pos.z, 2.6); world.wake(pos.x, pos.y, pos.z, 2.6); });
      const list = [], pool = {}, poolOf = (type, kind) => (pool[type + '|' + kind] = pool[type + '|' + kind] || []);
      // the bodies a type may wear: its own kinds, or the one it borrows
      const kindsOf = (type) => F.KINDS[type] || [CFG[type].body || type];
      // what is not a person (beasts.js): the bodies, and how they are posed
      const beastKit = V.beasts ? V.beasts.create(T, kit) : null;
      const centreY = (z) => z.pos.y + (z.cfg.centre != null ? z.cfg.centre * z.scale : z.crawling ? 0.35 : 1.15 * z.scale);
      const glowMats = {};
      const dir = { x: 0, z: 0 }, tmp = new T.Vector3(), tmp2 = new T.Vector3(), tmp3 = new T.Vector3(), up = new T.Vector3(0, 1, 0), tq = new T.Quaternion();

      // ---- motion capture: gait cycles for the seventeen bones that move (assets/zombies/motion.js, made by
      // tools/zombie-motion from the 100STYLE dataset). Without that file, or with ?motion=0, the dead walk by the
      // formulas in pose() as they did before it.
      const MO = (() => {
        const m = window.VIGIL_MOTION;
        if (!m || !m.clips || !m.bones || (g.params && g.params.motion === '0') || typeof atob !== 'function') return null;
        const clips = {};
        for (const id of Object.keys(m.clips)) {
          const c = m.clips[id], bin = atob(c.q), u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          const q = new Int16Array(u8.buffer), f = new Float32Array(q.length);
          for (let i = 0; i < q.length; i++) f[i] = q[i] / 32767;
          if (f.length !== c.n * m.bones.length * 4) continue;
          clips[id] = { id, n: c.n, T: c.T, speed: c.speed, q: f };
        }
        if (!clips.idle || !clips.walk1) return null;
        const plain = ['walk1', 'walk2', 'walk3'].filter((k) => clips[k]), lame = ['limpL', 'limpR', 'dragL', 'dragR'].filter((k) => clips[k]);
        return { bones: m.bones, nb: m.bones.length, leg0: m.bones.indexOf('thL'), clips, plain, lame, runs: ['run1', 'run2'].filter((k) => clips[k]) };
      })();
      const qa = new T.Quaternion(), qb = new T.Quaternion(), qc = new T.Quaternion(), qd = new T.Quaternion(), eul = new T.Euler(), AX = new T.Vector3(1, 0, 0), AZ = new T.Vector3(0, 0, 1), lv = new T.Vector3();
      const any = (list) => list[Math.floor(Math.random() * list.length)];
      // a rotation taken further (k > 1) or less far from rest, about its own axis
      function stretch(q, k) {
        const w = Math.max(-1, Math.min(1, q.w)), ang = 2 * Math.acos(Math.abs(w));
        if (ang < 1e-4) return;
        const sn = Math.sin(ang / 2) * (w < 0 ? -1 : 1), a2 = ang * k, s2 = Math.sin(a2 / 2);
        q.set((q.x / sn) * s2, (q.y / sn) * s2, (q.z / sn) * s2, Math.cos(a2 / 2));
      }
      // how far below the hips' own origin an ankle is, for the pose its leg is in (side: 1 left, -1 right)
      function ankleDrop(hq, tq2, sq, side) {
        let y = lv.set(side * 0.095, -0.03, 0).applyQuaternion(hq).y;
        qd.copy(hq).multiply(tq2); y += lv.set(side * 0.005, -0.43, 0.005).applyQuaternion(qd).y;
        qd.multiply(sq); y += lv.set(0, -0.415, -0.005).applyQuaternion(qd).y;
        return y;
      }
      let nextId = 1, alive = 0, groanT = 2, navT = 0;
      const parked = [];
      // playing together: `remote` is true on every machine but the host's
      let remote = false, nidSeq = 0, snapSeq = 0, lastSeq = -1, lastSnapT = 0, navI = 0;
      const nids = new Map(), KIND_LIST = Object.keys(typeOf), TYPE_LIST = Object.keys(CFG), TAU = PI * 2;
      const NET = () => (V.net && V.net.online ? V.net : null);

      // spitter projectiles
      const spits = [], spitMat = new T.MeshBasicMaterial({ color: new T.Color(0.6, 3.2, 0.5), fog: false }), boltMat = new T.MeshBasicMaterial({ color: new T.Color(3.6, 1.7, 0.35), fog: false });
      const spitGeo = new T.SphereGeometry(0.1, 8, 6);
      for (let i = 0; i < 12; i++) { const m = new T.Mesh(spitGeo, spitMat); m.visible = false; m.castShadow = false; root.add(m); spits.push({ m, on: false, p: new T.Vector3(), v: new T.Vector3(), life: 0, dmg: 0, cdmg: 0 }); }

      // a body of its own: the same record the rest of the manager expects, without bones, limbs or zones
      function makeBeast(type) {
        const cfg = CFG[type], body = beastKit[cfg.beast](type);
        body.root.visible = false; root.add(body.root);
        const z = {
          id: 0, type, kind: type, cfg, flesh: true, beast: cfg.beast, body, mesh: body.root, glow: body.glow, bones: {}, alive: false, active: false,
          pos: new T.Vector3(), vel: new T.Vector3(), yaw: 0, hp: 1, maxHp: 1, r: cfg.r, scale: 1, mass: cfg.mass, state: WALK,
          limbs: { armL: 0, armR: 0, legL: 0, legR: 0 }, limbHp: { armL: 1, armR: 1, legL: 1, legR: 1 }, headless: false, crawling: false, crawl: 0, zones: [], headR: 0,
          damage(amount, point, dirv, part, info) { return hurt(z, amount, point, dirv, part, info || {}); },
          onRagdollDone() { retire(z); },
        };
        return z;
      }
      function make(kind, as) {
        const type = as || typeOf[kind], cfg = CFG[type];
        if (cfg.beast) return makeBeast(type);
        const body = bodies[kind];
        const mat = body.mat.clone(); mat.name = body.mat.name;
        if (cfg.burning) mat.emissive.setRGB(0.045, 0.01, 0.0);         // it smoulders
        if (cfg.ember) mat.emissive.setRGB(cfg.ember[0], cfg.ember[1], cfg.ember[2]);     // it glows from within
        const { mesh, bones, skeleton } = F.rig(T, body.geo, mat);
        const gm = cfg.glow ? (glowMats[type] = glowMats[type] || new T.MeshBasicMaterial({ vertexColors: true, fog: false, color: new T.Color(cfg.glow[0], cfg.glow[1], cfg.glow[2]) })) : glowMat;
        const glow = new T.SkinnedMesh(body.glow, gm); glow.castShadow = false; glow.receiveShadow = false; glow.frustumCulled = false;
        mesh.add(glow); glow.bind(skeleton, mesh.bindMatrix);
        mesh.visible = false; root.add(mesh);
        const B = {}; for (const k in BI) B[k] = bones[BI[k]];
        if (cfg.fours) wolfParts(B);
        const bd = body.build, hs = bd.head;
        const z = {
          id: 0, type, kind, cfg, flesh: true, mesh, glow, bones: B, alive: false, active: false,
          pos: new T.Vector3(), vel: new T.Vector3(), yaw: 0, hp: 1, maxHp: 1, r: cfg.r, scale: 1, mass: cfg.mass, state: WALK,
          limbs: { armL: 0, armR: 0, legL: 0, legR: 0 }, limbHp: { armL: 1, armR: 1, legL: 1, legR: 1 }, headless: false, crawling: false, crawl: 0,
          // hit zones: [bone a, bone b, radius, part, limb, the limb state at which the zone is gone]
          zones: [
            ['hips', 'neck', 0.165 * Math.max(bd.chest, bd.belly * 0.8), 'body', null, 9],
            ['uaL', 'faL', 0.062 * bd.arm, 'armL.up', 'armL', 2], ['faL', 'hL', 0.052 * bd.arm, 'armL.lo', 'armL', 1],
            ['uaR', 'faR', 0.062 * bd.arm, 'armR.up', 'armR', 2], ['faR', 'hR', 0.052 * bd.arm, 'armR.lo', 'armR', 1],
            ['thL', 'shL', 0.088 * bd.leg, 'legL.up', 'legL', 2], ['shL', 'ftL', 0.066 * bd.leg, 'legL.lo', 'legL', 1],
            ['thR', 'shR', 0.088 * bd.leg, 'legR.up', 'legR', 2], ['shR', 'ftR', 0.066 * bd.leg, 'legR.lo', 'legR', 1],
          ],
          headR: 0.118 * hs,
          damage(amount, point, dirv, part, info) { return hurt(z, amount, point, dirv, part, info || {}); },
          onRagdollDone() { retire(z); },
        };
        if (cfg.winged && beastKit) z.wings = beastKit.demonParts(B);
        return z;
      }

      function spawn(type, at, o = {}) {
        if (!CFG[type] || (CFG[type].beast && !beastKit)) return null;
        {
          // What flies does not claw up out of the earth or walk out of a tomb, and the great spider does not fit
          // a tomb's door: they start in front of it, or on the nearest ground their size can stand on.
          const c0 = CFG[type];
          if ((c0.fly || c0.size) && o.emerge) { at = { x: o.emerge.to[0], z: o.emerge.to[1] }; o = { ...o, emerge: null }; }
          if (c0.fly && o.rise) o = { ...o, rise: false };
          if (c0.size && c0.beast && !nav.free(at.x, at.z, c0.size)) { const k = nav.nearestFree(at.x, at.z, c0.size), G = nav.grid; if (k >= 0) at = { x: G.minX + ((k % G.w) + 0.5) * G.cell, z: G.minZ + (Math.floor(k / G.w) + 0.5) * G.cell }; }
        }
        const kinds = kindsOf(type), kind = o.kind && kinds.includes(o.kind) ? o.kind : kinds[Math.floor(Math.random() * kinds.length)];
        const z = poolOf(type, kind).pop() || make(kind, type), c = z.cfg;
        z.id = nextId++; z.alive = true; z.active = true; z.state = o.rise ? RISE : WALK;
        z.pos.set(at.x, 0, at.z); z.pos.y = g.physics.groundHeight(at.x, at.z, 1.2); z.vel.set(0, 0, 0);
        z.yaw = Math.atan2(V.CRYSTAL.x - at.x, V.CRYSTAL.z - at.z);
        z.scale = o.scale || rand(c.scale[0], c.scale[1]); z.r = c.r;
        z.maxHp = z.hp = c.hp * (o.hpMult || 1);
        z.speed = rand(c.speed[0], c.speed[1]) * (o.speedMult || 1); z.dmgMult = o.dmgMult || 1;
        z.riseT = 0; z.phase = rand(0, 6.28); z.kbx = z.kbz = 0; z.stun = 0; z.marked = 0; z.aggroT = 0; z.flinch = 0; z.speedNow = 0;
        z.atkT = rand(0.1, 0.6); z.swing = 0; z.swingDur = 0.5; z.swingHit = true;
        z.thinkT = rand(0, 0.3); z.tk = 'crystal'; z.tobj = null; z.los = false; z.spitT = rand(0.8, 2.2);
        // the newer kinds: a spring (and the moment before it), a fuse, the abomination's fire
        z.leap = null; z.leapShow = false; z.leapWind = 0; z.leapCd = rand(0.4, 2); z.fuse = 0; z.fireT = rand(0, 0.1);
        z.aura = 0; z.auraTick = 0; z.auraCd = rand(5, 11); z.nova = 0; z.novaCd = rand(6, 10); z.boltCd = rand(3, 6);
        // what flies: where it is in its own business (fs), the circle it keeps and the height, when it may next dive
        z.fs = c.charge ? 'seek' : 'orbit'; z.fsT = 0; z.orbit = rand(0, 6.28); z.orbitDir = Math.random() < 0.5 ? -1 : 1; z.dive = null; z.swoopCd = rand(1.2, 3.6); z.windT = 0; z.chargeT = 0;
        z.keep = c.fly && c.fly.keep ? rand(c.fly.keep[0], c.fly.keep[1]) : 0; z.altWant = c.fly ? rand(c.fly.alt[0], c.fly.alt[1]) : 0; z.noLos = 0; z.forcePath = 0; z.wallT = 0; z.bank = 0;
        // a spider on a wall; a body of its own lying dead; how high the host says it is
        z.climb = null; z.climbShow = false; z.climbCd = c.climb ? rand(1.5, 5) : 0; z.dead = null; z.pitch = 0; z.alt = 0; z.nalt = 0;
        z.stuckT = 0; z.lastX = at.x; z.lastZ = at.z; z.stuckCheck = 2; z.wantT = 0; z.shunT = 0;
        z.groanT = rand(0.4, 5); z.painAt = -9; z.snarlAt = -9;
        // The wild dead (wild.js): roam is true until something wakes it, wild for as long as it lasts. They are
        // not counted with the waves. wx, wz: where it is wandering to; job: a totem it has been set to raise.
        z.roam = z.wild = !!o.roam; z.wx = at.x; z.wz = at.z; z.wanderT = 0; z.restT = o.roam ? rand(0.5, 4) : 0; z.job = null; z.jobT = 0;
        z.size = V.zombieSize(type);                       // whose grid it walks: see SIZES
        // its way into the church is chosen when it first needs one; its gait is its own
        const gait = GAIT[type] || GAIT[typeOf[c.body]] || GAIT.walker;
        z.route = -1; z.lane = Math.floor(Math.random() * LANES); z.avx = z.avz = 0;
        z.wAmp = gait.amp * rand(0.7, 1.25); z.wF1 = rand(gait.f1[0], gait.f1[1]); z.wF2 = rand(gait.f2[0], gait.f2[1]); z.wP1 = rand(0, 6.28); z.wP2 = rand(0, 6.28);
        z.flank = gait.flank * rand(0.35, 1) * (Math.random() < 0.5 ? -1 : 1);
        // and it keeps to a line of its own beside the one the field draws: this far off it, this way
        { const a = rand(0, 6.28), d = rand(0.4, 3.2) * gait.side; z.ox = Math.cos(a) * d; z.oz = Math.sin(a) * d; z.oLen = d; }
        z.em = null;
        if (o.emerge) {
          // out of a mausoleum: from the dark behind the doorway to the ground in front of it, in a straight line
          const e = o.emerge, dx = e.to[0] - e.from[0], dz = e.to[1] - e.from[1], len = Math.hypot(dx, dz) || 1, sp = Math.max(0.9, Math.min(2.4, z.speed));
          z.state = EMERGE; z.em = { x0: e.from[0], z0: e.from[1], x1: e.to[0], z1: e.to[1], dur: len / sp, speed: sp, inside: e.inside || 0, sill: e.sill || 0, t: 0 };
          z.pos.set(e.from[0], e.sill || 0, e.from[1]); z.yaw = Math.atan2(dx, dz); z.nyaw = z.yaw;
        }
        z.limp = Math.random() < 0.3 ? rand(0.3, 0.7) : 0;
        z.armL0 = Math.random() < 0.25 ? -0.25 : rand(-1.5, -1.0); z.armR0 = Math.random() < 0.25 ? -0.25 : rand(-1.5, -1.0);
        if (MO) {
          // Its gait: most shamble, some limp or drag a leg; the big ones only shamble; a runner has a run as well.
          const big = type === 'brute' || type === 'boss';
          z.walkClip = MO.clips[big || !MO.lame.length || Math.random() < 0.62 ? any(MO.plain) : any(MO.lame)];
          z.runClip = type === 'runner' && MO.runs.length ? MO.clips[any(MO.runs)] : null;
          // how much of the capture's outstretched arms each arm keeps: half of them all of it, the rest somewhere lower
          z.armMixL = Math.random() < 0.5 ? 1 : rand(0.1, 0.7); z.armMixR = Math.random() < 0.5 ? 1 : rand(0.1, 0.7);
          z.idleAt = rand(0, 7); z.hipY = 0;
        }
        if (c.fours || c.fly || c.beast) z.walkClip = z.runClip = null;     // it goes on all fours, or through the air, or is not a person: a pose of its own
        z.headTilt = rand(-0.35, 0.35); z.slump = rand(-0.12, 0.12); z.seed = rand(0, 10); z.walkBlend = 0;
        for (const k of LIMB_KEYS) { z.limbs[k] = 0; z.limbHp[k] = Math.max(16, z.maxHp * (k[0] === 'a' ? c.arm : c.leg)); }
        z.headless = false; z.crawling = false; z.crawl = 0; z.bleedT = 0; z.lastBy = 'player'; z.rag = null;
        // its number on the wire, and where the host last said it was
        if (o.nid != null) z.nid = o.nid; else { do { nidSeq = (nidSeq + 1) & 4095; } while (nids.has(nidSeq)); z.nid = nidSeq; }
        nids.set(z.nid, z);
        z.seenAt = g.time.t; z.it = 1; z.idur = 0.12; z.x0 = z.nx = at.x; z.z0 = z.nz = at.z; z.nyaw = z.yaw; z.tp = null; z.aggroBy = null;
        if (!z.beast) {
        for (const k in z.bones) { const b = z.bones[k]; b.rotation.set(0, 0, 0); b.scale.setScalar(1); }
        z.bones.hips.position.set(0, 0.96, 0);
        // the artwork is painted dark; the night needs it lifted to sit with the scanned stone and timber round it
        const tint = BRIGHT * rand(0.82, 1.08), tn = c.tint || [1, 1, 1]; z.mesh.material.color.setRGB(tint * rand(0.96, 1.04) * tn[0], tint * tn[1], tint * rand(0.94, 1.03) * tn[2]);
        }
        if (c.fly) z.pos.y += 0.3;                                  // it takes off from where it appears
        z.glow.visible = true;
        z.mesh.scale.setScalar(z.scale); z.mesh.visible = true; z.mesh.castShadow = true; z.mesh.frustumCulled = true;
        z.mesh.position.set(z.pos.x, z.pos.y - (o.rise ? 1.75 * z.scale : 0), z.pos.z); z.mesh.rotation.set(0, z.yaw, 0);
        pose(z, 0, 0, o.rise ? 1 : 0);
        list.push(z); if (!z.wild) alive++;
        g.events.emit('enemy:spawn', { enemy: z });
        // bats come in a pack: the rest of it beside the first (not on the machines that only show what the host has)
        if (c.pack && !o.packed && o.nid == null) for (let i = 1; i < c.pack; i++) spawn(type, { x: at.x + rand(-2.5, 2.5), z: at.z + rand(-2.5, 2.5) }, { ...o, packed: true });
        return z;
      }

      function retire(z) {
        if (!z.active) return;
        z.active = false; z.alive = false; z.mesh.visible = false; z.rag = null;
        if (nids.get(z.nid) === z) nids.delete(z.nid);
        const i = list.indexOf(z); if (i >= 0) list.splice(i, 1);
        poolOf(z.type, z.kind).push(z);
      }

      // ---- pieces that come off ----
      const gibs = new Map();
      function gibOf(kind, bones, joint) {
        const key = kind + '|' + bones.join(',');
        let e = gibs.get(key);
        if (!e) {
          const geo = F.extract(T, bodies[kind].geo, bones, F.BONES[BI[joint]][2]);
          const c = geo.boundingBox.getCenter(new T.Vector3()), half = geo.boundingBox.getSize(new T.Vector3()).multiplyScalar(0.5);
          geo.translate(-c.x, -c.y, -c.z);
          half.set(Math.max(0.03, half.x), Math.max(0.03, half.y), Math.max(0.03, half.z));
          gibs.set(key, (e = { geo, centre: c, half }));
        }
        return e;
      }
      function throwGib(z, bones, joint, dirv, speed = 3.2) {
        const e = gibOf(z.kind, bones, joint), bone = z.bones[joint];
        bone.getWorldPosition(tmp); bone.getWorldQuaternion(tq);
        const m = new T.Mesh(e.geo, z.mesh.material); m.castShadow = true; m.receiveShadow = true; m.scale.setScalar(z.scale);
        tmp2.copy(e.centre).multiplyScalar(z.scale).applyQuaternion(tq).add(tmp);
        const d = dirv || tmp3.set(rand(-1, 1), 0, rand(-1, 1));
        world.spawn({ mesh: m, pos: tmp2, quat: tq, vel: new T.Vector3(d.x * speed + rand(-1, 1), rand(1.8, 3.6), d.z * speed + rand(-1, 1)), ang: new T.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)),
          half: e.half.clone().multiplyScalar(z.scale), mass: 2 + z.mass * 2, bounce: 0.12, friction: 0.85, life: (V.DEBRIS && V.DEBRIS.life) || 15, sinceBirth: true,
          onHit: (b, v) => { if (V.audio) V.audio.play('gib_land', { pos: b.pos, gain: Math.min(1, v / 6) }); if (V.blood && (b.wet = (b.wet || 0) + 1) <= 2) V.blood.splat(b.pos, 0.5 * z.scale / b.wet); } });
        return tmp;
      }
      // The colour of what comes out of them: the player's choice (blood.js), or nothing with blood turned off.
      const gore = () => (V.blood && V.blood.tint ? V.blood.tint() : [0.26, 0.02, 0.02]);
      // the engine's own chips at a wound, in that colour (the puff is drawn by blood.js); with blood off, dust
      function wound(at, nrm, puff, chips, speed) {
        try {
          const c = gore();
          if (!c) { g.fx.dust(at, nrm, puff * 0.8, 0.2, 0.19, 0.17); return; }
          if (chips) g.fx.debris(at, { color: c, size: chips > 6 ? 0.05 : 0.035, speed, count: chips, normal: nrm, spread: chips > 6 ? 1.5 : 0.9 });
        } catch (e) { /* effects are optional */ }
      }
      const usableArms = (z) => (z.limbs.armL ? 0 : 1) + (z.limbs.armR ? 0 : 1);
      // level 1 takes the limb at the elbow or knee, 2 at the shoulder or hip
      function sever(z, limb, level, dirv) {
        if (z.beast) return false;
        const L = F.LIMBS[limb], had = z.limbs[limb];
        if (had >= level || z.state === DEAD || (z.cfg.noCrawl && limb[0] === 'l')) return false;
        const at = had === 1 ? throwGib(z, [L.upper], L.upper, dirv)                                   // only the stump was left
          : level === 1 ? throwGib(z, L.lowerBones, L.lower, dirv) : throwGib(z, L.bones, L.upper, dirv);
        z.bones[level === 1 ? L.lower : L.upper].scale.setScalar(1e-4);
        z.limbs[limb] = level; z.flinch = 0.3;
        if (V.blood) V.blood.sever(z, z.bones[level === 1 ? L.lower : L.upper], at, dirv);
        wound(at, up, 1.4, 14, 4.2);
        if (V.audio) V.audio.play('limb_tear', { pos: z.pos });
        if (limb[0] === 'l' && !z.crawling) { z.crawling = true; z.swing = 0; if (V.audio) V.audio.play('body_fall', { pos: z.pos, delay: 0.25 }); }
        if (z.crawling && usableArms(z) === 0 && !z.bleedT) z.bleedT = rand(7, 11);
        g.events.emit('enemy:severed', { enemy: z, limb, level });
        return true;
      }
      function decapitate(z, dirv, fly) {
        if (z.headless || z.beast) return;
        if (fly) throwGib(z, ['head', 'jaw'], 'head', dirv, 4);
        z.bones.head.getWorldPosition(tmp);
        z.bones.head.scale.setScalar(1e-4); z.headless = true;
        if (V.blood) V.blood.decap(z, tmp, dirv);
        wound(tmp, up, 1.6, fly ? 8 : 16, 4.5);
      }

      // ---- damage ----
      function hitFx(z, point, dirv, head) {
        if (point && g.fx && g.fx.dust) { tmp.copy(dirv || up).negate(); wound(point, tmp, head ? 0.9 : 0.55, Math.random() < 0.6 ? (head ? 5 : 3) : 0, 3.2); }
        if (point && V.blood) V.blood.hit(z, point, dirv, head);
        if (V.audio) {
          const at = point || z.pos;
          V.audio.play('flesh_hit', { pos: at });
          if (head) V.audio.play('head_pop', { pos: at });
          // it answers: not to every round, and never twice in one breath
          else if (!z.headless && z.state !== DEAD && g.time.t - (z.painAt || -9) > 0.7 && Math.random() < 0.5) {
            z.painAt = g.time.t;
            V.audio.play(z.cfg.cry || (z.mass > 2 ? 'growl' : 'zombie_pain'), { pos: z.pos, pitch: (z.cfg.cry ? (z.cfg.cryPitch || 1) * 1.15 : z.mass > 2 ? 1.3 : z.type === 'runner' ? 1.25 : 1) * rand(0.92, 1.08) });
          }
        }
      }
      // info.by: 'player' (this machine), a session id (someone else in the room) or 'defense' (with info.owner)
      function hurt(z, amount, point, dirv, part, info) {
        if (z.state === DEAD || !z.alive) return false;
        const head = part === 'weak';
        if (remote) {
          // not ours to decide: show the hit and tell the host
          z.flinch = Math.max(z.flinch, 0.2); hitFx(z, point, dirv, head);
          V.net.hit(z.nid, amount, part, point, dirv, info);
          g.events.emit('enemy:hit', { enemy: z });
          return false;
        }
        const D = V.director, dot = part ? part.indexOf('.') : -1, limb = dot > 0 ? part.slice(0, dot) : null;
        if (D && D.modifyDamage) amount = D.modifyDamage(amount, z, part, info);
        if (z.marked > 0) amount *= 1.5;
        z.lastBy = info.by || 'player'; z.lastOwner = info.owner || null;
        if (limb) {
          // a limb soaks part of the hit; enough of it and the limb goes
          z.limbHp[limb] -= amount;
          if (z.limbHp[limb] <= 0) { sever(z, limb, part.endsWith('.lo') && z.limbs[limb] === 0 ? 1 : 2, dirv); z.limbHp[limb] = Math.max(16, z.maxHp * (limb[0] === 'a' ? z.cfg.arm : z.cfg.leg)) * 0.6; }
          amount *= 0.6;
        } else if (info.blast) {
          // a blast takes limbs by itself
          const pr = Math.min(0.8, amount / (z.maxHp * 1.6 + 60));
          for (const k of LIMB_KEYS) if (z.limbs[k] < 2 && Math.random() < pr) sever(z, k, Math.random() < 0.5 ? 2 : 1, dirv);
        }
        z.hp -= amount; z.flinch = Math.max(z.flinch, 0.2);
        if (info.by !== 'defense' && Math.hypot(z.pos.x, z.pos.z) > 6) { z.aggroT = 6; z.aggroBy = info.by || 'player'; }
        hitFx(z, point, dirv, head);
        if (z.hp <= 0) { kill(z, { head, dir: dirv, point, by: info.by || 'player', owner: info.owner, blast: info.blast, power: info.power || Math.min(7, 2 + amount / 30) }); return true; }
        g.events.emit('enemy:hit', { enemy: z });
        return false;
      }
      function kill(z, info = {}) {
        if (z.state === DEAD) return;
        z.state = DEAD; z.alive = false; if (!z.wild) alive--;
        if (nids.get(z.nid) === z) nids.delete(z.nid);
        if (info.silent) { retire(z); return; }
        // a burster goes off: at once if it lit its own fuse, a moment later and smaller if it was shot down. One
        // put down through the head does not.
        if (z.cfg.burst && !info.head) blasts.push({ kind: 'burst', x: z.pos.x, y: z.pos.y + 0.9 * z.scale, z: z.pos.z, t: info.self ? 0 : 0.16, k: (info.self ? 1 : z.cfg.burst.onDeath) * z.dmgMult, c: z.cfg.burst, self: z });
        // A skull that reached what it was after goes off there. Shot down on the way it only bursts: fire and
        // noise, and nothing hurt (k 0). The machines that only watch cannot tell which, and show the same.
        if (z.cfg.charge) blasts.push({ kind: 'burst', x: z.pos.x, y: centreY(z), z: z.pos.z, t: 0, k: info.self ? z.dmgMult : 0, c: z.cfg.charge, self: z, pop: !info.self && !remote });
        if (info.head) decapitate(z, info.dir, Math.random() < 0.35);
        else if (info.blast && Math.random() < 0.3) decapitate(z, info.dir, true);
        z.glow.visible = !z.beast && !!F.LOOKS[z.kind].sacs && !z.headless;
        z.mesh.frustumCulled = false;
        z.vel.x += z.kbx || 0; z.vel.z += z.kbz || 0;
        if (z.beast) startCorpse(z, info); else z.rag = ragdoll.start(z, { dir: info.dir, point: info.point, power: info.power, blast: info.blast });
        if (V.blood) V.blood.death(z, info);
        if (V.audio) {
          if (z.cfg.cry) V.audio.play(z.cfg.cry, { pos: z.pos, pitch: (z.cfg.cryPitch || 1) * 0.8 });
          else if (z.mass > 2 || !(info.head || z.headless)) V.audio.play(z.mass > 2 ? 'zombie_die_big' : 'zombie_die', { pos: z.pos });
          if (!z.cfg.charge) V.audio.play('body_fall', { pos: z.pos, delay: z.cfg.fly ? 0.9 : 0.45 });
        }
        g.events.emit('enemy:killed', { enemy: z, type: z.type, head: !!info.head, by: info.by || 'player', owner: info.owner || null, blast: !!info.blast });
        const n = NET(); if (n && !remote) n.killed(z, info);
      }

      // ---- attacks ----
      // who the dead can go for: the player at this machine, and anyone else in the room
      const me = { sid: null, get pos() { return g.player.pos; }, get alive() { return g.player.alive && !(V.director && V.director.playerHidden) && !(V.net && V.net.away); } };
      let targets = [me];
      function strike(z) {
        const p = g.player, c = z.cfg, D = V.director, arms = usableArms(z), k = z.dmgMult * (arms === 2 ? 1 : arms === 1 ? 0.8 : 0.6) * (z.crawling ? 0.75 : 1);
        if (z.tk === 'player') {
          const t = z.tp;
          if (t && t.alive && Math.hypot(t.pos.x - z.pos.x, t.pos.z - z.pos.z) < reachOf(z) + 0.7 && Math.abs(t.pos.y - z.pos.y) < 2.2) {
            const shove = (z.type === 'brute' || z.type === 'boss') && !z.crawling ? 7 : 0;
            if (t.sid) V.net.playerHit(t.sid, c.dmg * k, z.pos, shove);
            else { p.damage(c.dmg * k, z.pos); if (shove && D && D.knockPlayer) D.knockPlayer(p.pos.x - z.pos.x, p.pos.z - z.pos.z, shove); }
            if (V.audio) V.audio.play('zombie_hit', { pos: z.pos });
          }
        } else if (z.tk === 'def') {
          if (z.tobj && z.tobj.alive) z.tobj.damage(c.dmg * 1.4 * k);
        } else if (Math.hypot(z.pos.x - V.CRYSTAL.x, z.pos.z - V.CRYSTAL.z) < V.CRYSTAL.reach + z.r + 0.7 + (z.crawling ? 0.5 : 0)) {
          if (D) D.damageCrystal(c.crystalDmg * k, z);
        }
        // the big ones break what stands between them and their target
        if (V.destruct && z.mass > 2 && !z.crawling) V.destruct.smash(z.pos.x + Math.sin(z.yaw) * 0.9, z.pos.z + Math.cos(z.yaw) * 0.9, 1.1 * z.scale / 1.4, 400);
      }
      const reachOf = (z) => (z.crawling ? z.cfg.reach * 0.8 + 0.45 * z.scale : z.cfg.reach);
      // fire: 0 for a spitter's bile; for a bolt of fire, how far round where it lands it burns
      function launch(px, py, pz, vx, vy, vz, dmg, cdmg, visual, fire) {
        const s = spits.find((q) => !q.on); if (!s) return;
        s.p.set(px, py, pz); s.v.set(vx, vy, vz);
        s.life = 3; s.on = true; s.m.visible = true; s.dmg = dmg; s.cdmg = cdmg; s.visual = !!visual; s.fire = +fire || 0;
        s.m.material = s.fire ? boltMat : spitMat; s.m.scale.setScalar(s.fire ? 1.5 : 1);
        if (V.audio) V.audio.play(s.fire ? 'fire_cast' : 'spit', { pos: s.p });
      }
      function spit(z, tx, ty, tz) {
        const px = z.pos.x + Math.sin(z.yaw) * 0.35, py = z.pos.y + (z.crawling ? 0.45 : 1.5 * z.scale), pz = z.pos.z + Math.cos(z.yaw) * 0.35;
        const dx = tx - px, dz = tz - pz, d = Math.hypot(dx, dz), Tt = Math.max(0.25, Math.min(1.3, d / (z.cfg.spit.speed || 15)));
        const vx = dx / Tt, vy = (ty - py + 4.5 * Tt * Tt) / Tt, vz = dz / Tt;
        const fire = z.cfg.spit.splash || 0;
        launch(px, py, pz, vx, vy, vz, z.cfg.spit.dmg * z.dmgMult, z.cfg.spit.crystalDmg * z.dmgMult, false, fire);
        z.swing = z.swingDur = 0.4; z.swingHit = true;
        const n = NET(); if (n) n.emit('sp', [px, py, pz, vx, vy, vz, fire].map((v) => Math.round(v * 100) / 100));
      }
      function updateSpits(dt) {
        const p = g.player, C = V.CRYSTAL, D = V.director;
        for (const s of spits) {
          if (!s.on) continue;
          tmp.copy(s.p);
          s.v.y -= 9 * dt; s.p.addScaledVector(s.v, dt); s.life -= dt; s.m.position.copy(s.p);
          if (s.fire && V.fire) V.fire.emit(s.p.x, s.p.y, s.p.z, rand(-0.5, 0.5), rand(0, 0.7), rand(-0.5, 0.5), { size: 0.4, life: 0.34, rise: 1, drag: 2 });
          let hit = false;
          // on the machines that only watch, a spit is a picture: the host decides who it hurt
          if (!s.visual) for (const t of targets) {
            if (!t.alive || Math.hypot(s.p.x - t.pos.x, s.p.y - (t.pos.y + 1.0), s.p.z - t.pos.z) >= 0.95) continue;
            if (t.sid) V.net.playerHit(t.sid, s.dmg, tmp, 0); else p.damage(s.dmg, tmp);
            hit = true; break;
          }
          if (!hit && Math.hypot(s.p.x - C.x, s.p.y - C.y, s.p.z - C.z) < 1.5) { if (D && !s.visual) D.damageCrystal(s.cdmg, null); hit = true; }
          else if (!hit && s.p.y < g.physics.groundHeight(s.p.x, s.p.z, s.p.y + 0.5) + 0.05) {
            hit = true;
            if (!s.visual) for (const t of targets) {
              if (!t.alive || Math.hypot(s.p.x - t.pos.x, s.p.z - t.pos.z) >= (s.fire || 1.6) || Math.abs(s.p.y - t.pos.y) >= 1.5) continue;
              if (t.sid) V.net.playerHit(t.sid, s.dmg * 0.5, s.p, 0); else p.damage(s.dmg * 0.5, s.p);
            }
          } else if (!hit) {
            tmp2.copy(s.p).sub(tmp); const l = tmp2.length();
            if (l > 1e-4 && g.physics.raycast(tmp, tmp2.multiplyScalar(1 / l), l)) hit = true;
          }
          if (hit || s.life <= 0) {
            s.on = false; s.m.visible = false;
            if (s.fire) {
              if (V.fire) V.fire.burst(s.p.x, s.p.y + 0.15, s.p.z, 14, 3.8, 0.55);
              flash(s.p, 45, 9, 0.14);
              try { g.fx.smoke(s.p, { size: 0.9, life: 1.6, color: [0.12, 0.1, 0.09], count: 2, alpha: 0.4 }); } catch (e) { /* optional */ }
              if (V.audio) V.audio.play('fire_hit', { pos: s.p });
            } else {
            try { g.fx.dust(s.p, up, 1.3, 0.25, 1.2, 0.2); g.fx.smoke(s.p, { size: 0.7, life: 1.4, color: [0.2, 0.7, 0.15], count: 2, alpha: 0.35 }); } catch (e) { /* optional */ }
            if (V.audio) V.audio.play('acid', { pos: s.p });
            }
          }
        }
      }

      // ---- what the newer kinds do ----
      // A wolf goes on all fours and springs; a burster walks up and goes off (or goes off, smaller, when it is
      // killed anywhere but through the head); a pyre burns and throws fire; the abomination throws it too, lets
      // off a ring of it, and walks wreathed in it for a while. All of it is decided here on the machine that
      // thinks for the dead; what the others see comes from the snapshot's flags, the kill, and two messages.
      const flash = (pos, power, reach, hold) => { try { if (g.render && g.render.lightPool) g.render.lightPool.flash(pos, 0xff7a2a, power, reach, hold); } catch (e) { /* optional */ } };
      let wolfKit = null;
      function wolfParts(B) {
        if (!wolfKit) {
          const fur = new T.MeshStandardMaterial({ color: new T.Color(0.06, 0.056, 0.06), roughness: 0.96, metalness: 0 }); fur.name = 'vg_wolf_fur';
          const dark = new T.MeshStandardMaterial({ color: new T.Color(0.01, 0.01, 0.01), roughness: 0.45, metalness: 0 }); dark.name = 'vg_wolf_nose';
          wolfKit = {
            fur, dark, snout: new T.CylinderGeometry(0.026, 0.058, 0.17, 8).rotateX(PI / 2), nose: new T.SphereGeometry(0.021, 8, 6), ear: new T.ConeGeometry(0.036, 0.11, 6),
            jaw: new T.CylinderGeometry(0.018, 0.042, 0.15, 8).rotateX(PI / 2), tail: new T.CylinderGeometry(0.04, 0.012, 0.46, 7),
          };
        }
        const K = wolfKit, add = (bone, geo, mat, p, r) => { const m = new T.Mesh(geo, mat); m.position.set(p[0], p[1], p[2]); if (r) m.rotation.set(r[0], r[1], r[2]); m.castShadow = true; m.frustumCulled = false; bone.add(m); return m; };
        add(B.head, K.snout, K.fur, [0, 0.06, 0.16], [0.1, 0, 0]); add(B.head, K.nose, K.dark, [0, 0.066, 0.248]);
        add(B.head, K.ear, K.fur, [0.064, 0.205, -0.02], [-0.25, 0, -0.32]); add(B.head, K.ear, K.fur, [-0.064, 0.205, -0.02], [-0.25, 0, 0.32]);
        add(B.jaw, K.jaw, K.fur, [0, -0.07, 0.145], [0.06, 0, 0]);
        add(B.hips, K.tail, K.fur, [0, -0.25, -0.09], [0.22, 0, 0]);
      }
      // Fire or a blast at (x, y, z): the living within radius are hurt (less toward its edge unless flat), the
      // crystal and a defense if they are inside it, and, with o.dead, the dead themselves.
      function scorch(x, y, z, radius, dmg, cdmg, o = {}) {
        const p = g.player, C = V.CRYSTAL, D = V.director;
        tmp3.set(x, y, z);
        for (const t of targets) {
          if (!t.alive) continue;
          const d = Math.hypot(t.pos.x - x, t.pos.z - z);
          if (d >= radius || Math.abs(t.pos.y - y) > 3.2) continue;
          const k = o.flat ? 1 : 1 - 0.55 * (d / radius), shove = (o.shove || 0) * k;
          if (t.sid) V.net.playerHit(t.sid, dmg * k, tmp3, shove);
          else { p.damage(dmg * k, tmp3); if (shove && D && D.knockPlayer) D.knockPlayer(p.pos.x - x, p.pos.z - z, shove); }
        }
        if (cdmg && D && Math.hypot(x - C.x, z - C.z) < radius + C.reach) D.damageCrystal(cdmg, null);
        const def = V.defenses && V.defenses.victimNear ? V.defenses.victimNear(x, z, radius) : null;
        if (def && def.alive && cdmg) def.damage(cdmg);
        if (o.dead) {
          for (let i = list.length - 1; i >= 0; i--) {
            const q = list[i]; if (!q || q.state === DEAD || q === o.self) continue;
            const d = Math.hypot(q.pos.x - x, q.pos.z - z); if (d >= radius) continue;
            tmp.set(q.pos.x, q.pos.y + 1, q.pos.z); tmp2.set(q.pos.x - x, 0.4, q.pos.z - z).normalize();
            hurt(q, o.dead * (1 - 0.5 * (d / radius)), tmp.clone(), tmp2.clone(), 'body', { by: 'burst', blast: { x, y, z, force: 5 } });
          }
        }
      }
      // what is waiting to go off, and rings of fire still spreading: [{ kind, x, y, z, t, ... }]
      const blasts = [];
      function boom(x, y, z, size, radius) {
        tmp3.set(x, y, z);
        try { g.fx.explosion(tmp3, size); } catch (e) { /* optional */ }
        g.events.emit('explosion', { pos: tmp3.clone(), size });
        if (V.fire) V.fire.burst(x, y, z, Math.round(18 + 14 * size), 4 + 3.5 * size, 0.7 + 0.5 * size);
        flash(tmp3, 60 + 60 * size, 10 + 6 * size, 0.16);
        ragdoll.blast(x, y, z, radius, 7 * size);
      }
      function updateBlasts(dt) {
        for (let i = blasts.length - 1; i >= 0; i--) {
          const b = blasts[i];
          b.t -= dt;
          if (b.kind === 'ring') {
            // the ring walks outward: flames along the circle it has reached
            const u = 1 - Math.max(0, b.t) / b.dur, r = b.r0 + (b.r1 - b.r0) * u;
            if (V.fire) V.fire.ring(b.x, b.y, b.z, r, Math.round(10 + r * 3), 0.6 + 0.25 * u, 2.5);
            if (b.t <= 0) blasts.splice(i, 1);
            continue;
          }
          if (b.t > 0) continue;
          blasts.splice(i, 1);
          boom(b.x, b.y, b.z, b.pop ? 0.4 : 0.85 * Math.min(1.2, 0.6 + 0.5 * b.k), b.c.radius);
          if (!remote && b.k > 0) scorch(b.x, b.y, b.z, b.c.radius * (b.k < 1 ? 0.85 : 1), b.c.dmg * b.k, b.c.crystalDmg * b.k, { shove: 6, dead: (b.c.dead != null ? b.c.dead : 110) * b.k, self: b.self });
        }
      }
      // ---- the wolf's spring ----
      // drop: how far above where it should land it starts (a spider on a wall); from the ground, nothing
      function startLeap(z, ddx, ddz, dist, drop = 0) {
        const lp = z.cfg.leap, A = V.leapArc ? V.leapArc(dist, drop, lp.speed) : { dur: Math.max(0.36, Math.min(0.85, dist / lp.speed)), vy: 0 }, dur = A.dur, sp = Math.max(0, dist - 0.5) / dur;
        z.leap = { t: 0, dur, vx: (ddx / dist) * sp, vz: (ddz / dist) * sp, y0: z.pos.y, vy: drop > 0 ? A.vy : 10 * dur, hit: false, tp: z.tp };
        z.swing = z.swingDur = dur; z.swingHit = true;                      // jaws open for the length of it
      }
      function leapHit(z) {
        const L = z.leap, t = L.tp, lp = z.cfg.leap;
        if (L.hit || !t || !t.alive) return;
        if (Math.hypot(t.pos.x - z.pos.x, t.pos.z - z.pos.z) > 1.25 || Math.abs(t.pos.y + 0.9 - (z.pos.y + 0.5)) > 1.7) return;
        L.hit = true;
        const D = V.director, p = g.player;
        if (t.sid) V.net.playerHit(t.sid, lp.dmg * z.dmgMult, z.pos, 4);
        else { p.damage(lp.dmg * z.dmgMult, z.pos); if (D && D.knockPlayer) D.knockPlayer(L.vx, L.vz, 4); }
        if (V.audio) V.audio.play('zombie_hit', { pos: z.pos });
      }
      // ---- the abomination's fire ----
      function novaBlast(z) {
        const F = z.cfg.fire.nova, x = z.pos.x, y = z.pos.y, zz = z.pos.z;
        blasts.push({ kind: 'ring', x, y: y + 0.1, z: zz, r0: 1.2, r1: F.radius, t: 0.42, dur: 0.42 });
        boom(x, y + 1.2, zz, 1.25, F.radius * 0.6);
        scorch(x, y, zz, F.radius, F.dmg * z.dmgMult, F.crystalDmg * z.dmgMult, { shove: 7 });
        const n = NET(); if (n) n.emit('zf', ['n', Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(zz * 10) / 10, F.radius]);
      }
      function bossFire(z, dt, dist, tx, ty, tz) {
        const F = z.cfg.fire, hunting = z.tk === 'player';
        // wreathed: whoever stands in the ring burns
        if (z.aura > 0) {
          z.aura -= dt; z.auraTick -= dt;
          if (z.auraTick <= 0) { z.auraTick = 0.5; scorch(z.pos.x, z.pos.y, z.pos.z, F.aura.radius, F.aura.dps * 0.5 * z.dmgMult, 0, { flat: true }); }
        } else if ((z.auraCd -= dt) <= 0 && hunting && dist < 18) {
          z.aura = F.aura.dur; z.auraTick = 0.7; z.auraCd = rand(F.aura.cd[0], F.aura.cd[1]) + F.aura.dur;
          if (V.audio) { V.audio.play('growl', { pos: z.pos, gain: 1.2, pitch: 0.7 }); V.audio.play('fire_cast', { pos: z.pos, gain: 1.2, pitch: 0.6 }); }
          flash(z.pos, 70, 12, 0.3);
        }
        // the ring let off round it: it gathers itself first, arms up, and the fire is drawn in
        if (z.nova > 0) {
          if ((z.nova -= dt) <= 0) novaBlast(z);
        } else if ((z.novaCd -= dt) <= 0 && hunting && dist < F.nova.radius - 1.2) {
          z.nova = F.nova.wind; z.novaCd = rand(F.nova.cd[0], F.nova.cd[1]);
          z.swing = z.swingDur = F.nova.wind; z.swingHit = true;
          if (V.audio) V.audio.play('fuse', { pos: z.pos, gain: 1.2, pitch: 0.6 });
        }
        // and thrown: a fan of bolts at someone it can see across the yard
        if ((z.boltCd -= dt) <= 0 && hunting && z.los && z.nova <= 0 && dist > 6.5 && dist < F.bolts.range) {
          z.boltCd = rand(F.bolts.cd[0], F.bolts.cd[1]);
          const px = z.pos.x + Math.sin(z.yaw) * 0.9, py = z.pos.y + 1.55 * z.scale, pz = z.pos.z + Math.cos(z.yaw) * 0.9, base = Math.atan2(tx - px, tz - pz), Tt = Math.max(0.3, Math.min(1.3, dist / 17));
          for (let i = 0; i < F.bolts.n; i++) {
            const a = base + (i - (F.bolts.n - 1) / 2) * 0.16, vx = Math.sin(a) * dist / Tt, vz = Math.cos(a) * dist / Tt, vy = (ty - py + 4.5 * Tt * Tt) / Tt;
            launch(px, py, pz, vx, vy, vz, F.bolts.dmg * z.dmgMult, F.bolts.crystalDmg * z.dmgMult, false, F.bolts.splash);
            const n = NET(); if (n) n.emit('sp', [px, py, pz, vx, vy, vz, F.bolts.splash].map((v) => Math.round(v * 100) / 100));
          }
          z.swing = z.swingDur = 0.5; z.swingHit = true;
        }
      }
      // What a body shows of all that, on every machine: the pyre's own burning, the abomination's ring and what
      // it draws in before the nova, the burster swelling.
      function ambient(z, dt) {
        const c = z.cfg, time = g.time.t;
        if (z.fuse > 0 && c.burst) {
          const k = 1 - z.fuse / c.burst.fuse, s = 1 + 0.34 * k + 0.05 * Math.sin(time * 42) * k;
          z.bones.spine.scale.setScalar(s); z.bones.chest.scale.setScalar(1 + 0.1 * k);
        }
        if (!V.fire) return;
        z.fireT -= dt;
        if (z.fireT > 0) return;
        const cam = g.camera.position;
        if (Math.hypot(z.pos.x - cam.x, z.pos.z - cam.z) > 70) { z.fireT = 0.3; return; }
        z.fireT = 0.06;
        const x = z.pos.x, y = z.pos.y, zz = z.pos.z, sc = z.scale;
        if (c.burning && !z.crawling) { V.fire.puff(x, y + 1.3 * sc, zz, 0.36 * sc, 1); if (Math.random() < 0.5) V.fire.puff(x, y + 1.62 * sc, zz, 0.26 * sc, 1); }
        // a skull trails fire, and is wrapped in it once it has made up its mind; a demon sheds embers from its hands
        if (c.charge) { const hot = z.fs === 'wind' || z.fs === 'charge'; V.fire.puff(x - Math.sin(z.yaw) * 0.25 * sc, y + (c.centre + 0.12) * sc, zz - Math.cos(z.yaw) * 0.25 * sc, (hot ? 0.5 : 0.3) * sc, hot ? 2 : 1); }
        if (c.ember && Math.random() < 0.55) { const sd = Math.random() < 0.5 ? 1 : -1; V.fire.emit(x + Math.cos(z.yaw) * 0.5 * sd * sc, y + 1.05 * sc, zz - Math.sin(z.yaw) * 0.5 * sd * sc, rand(-0.3, 0.3), rand(-0.9, -0.2), rand(-0.3, 0.3), { size: 0.16 * sc, life: rand(0.3, 0.6), rise: -1.5, drag: 1 }); }
        if (c.fire) {
          if (z.aura > 0) { V.fire.ring(x, y, zz, c.fire.aura.radius * rand(0.8, 1), 14, 0.8, 0); V.fire.wreathe(x, y, zz, 0.75 * sc * 0.5, 1.7 * sc, 3, 0.6); if (Math.random() < 0.3) flash(z.pos, 26, 9, 0.2); }
          if (z.nova > 0) {
            // drawn in: flames that start out on the circle and fly to its hands
            for (let i = 0; i < 4; i++) { const a = rand(0, TAU), r = c.fire.nova.radius * rand(0.35, 0.8); V.fire.emit(x + Math.cos(a) * r, y + rand(0.2, 1.2), zz + Math.sin(a) * r, -Math.cos(a) * r * 1.9, 2.2, -Math.sin(a) * r * 1.9, { size: 0.42, life: 0.5, rise: 2, drag: 0.2 }); }
          }
        }
      }
      // what the host says happened that a snapshot cannot carry: ['n', x, y, z, radius] is a nova
      function fxVisual(a) {
        if (!Array.isArray(a) || a[0] !== 'n') return;
        blasts.push({ kind: 'ring', x: a[1], y: a[2] + 0.1, z: a[3], r0: 1.2, r1: +a[4] || 8, t: 0.42, dur: 0.42 });
        boom(a[1], a[2] + 1.2, a[3], 1.25, (+a[4] || 8) * 0.6);
      }

      // ---- pose: on all fours ----
      // The same bones carried level on four legs: the trunk pitched forward, the arms straight down from the
      // shoulder as forelegs, the thighs folded up under it and the shins back. It gallops, the forelegs reaching
      // as the hind legs drive; it sinks before a spring and is stretched out in the air; it bites with its neck.
      function foursPose(z, dt, speed, rising) {
        const b = z.bones, time = g.time.t;
        z.walkBlend = damp(z.walkBlend, speed > 0.25 ? 1 : 0, 7, dt);
        const wb = z.walkBlend, run = Math.min(1, speed / 4.5);
        z.phase += (dt * TAU * (speed > 0.25 ? Math.max(1.3, Math.min(3.3, speed / 2.1)) : 0.2)) / Math.max(0.8, z.scale);
        const ph = z.phase, s = Math.sin(ph), c = Math.cos(ph), s2 = Math.sin(ph - 0.75), c2 = Math.cos(ph - 0.75);
        const air = z.leap || z.leapShow ? 1 : 0, wind = z.leapWind > 0 ? 1 : 0, g1 = wb * (0.4 + 0.6 * run) * (1 - air);
        let bite = 0; if (z.swing > 0 && !air) { const k = 1 - z.swing / z.swingDur; bite = Math.sin(k * PI); }
        const pitch = 1.3 - 0.14 * air + 0.14 * wind + 0.08 * s * g1 - z.flinch * 0.5 - 0.5 * rising + (z.stun > 0 ? 0.12 : 0);
        b.hips.rotation.set(pitch, 0, 0.05 * c * g1);
        b.hips.position.set(0, 0.6 - 0.15 * wind + 0.05 * Math.abs(s) * g1, 0);
        b.spine.rotation.set(-0.05 - 0.11 * s * g1, 0, 0); b.chest.rotation.set(-0.05 - 0.07 * s * g1, 0, z.slump * 0.5);
        const look = 1 - wb;
        b.neck.rotation.set(-0.56 + bite * 0.36 + wind * 0.22, Math.sin(time * 0.8 + z.seed) * 0.14 * look, z.headTilt * 0.3);
        b.head.rotation.set(-0.6 + bite * 0.3 + 0.07 * Math.sin(time * 1.3 + z.seed), Math.sin(time * 0.6 + z.seed * 2) * 0.22 * look, z.headTilt * 0.3);
        b.jaw.rotation.set(0.1 + bite * 0.65 + air * 0.4 + 0.1 * wb, 0, 0);
        // forelegs: plumb at rest whatever the trunk is doing
        const fore = -(pitch - 0.1), reach = 0.66 * g1;
        b.uaL.rotation.set(fore + reach * s - air * 1.0 + wind * 0.35 - bite * 0.25, 0, 0.1); b.uaR.rotation.set(fore + reach * s2 - air * 1.0 + wind * 0.35, 0, -0.1);
        b.faL.rotation.set(-0.12 - 0.55 * Math.max(0, -c) * g1 - wind * 0.55 - air * 0.1, 0, 0); b.faR.rotation.set(-0.12 - 0.55 * Math.max(0, -c2) * g1 - wind * 0.55 - air * 0.1, 0, 0);
        b.hL.rotation.set(-1.15 + air * 0.8, 0, 0); b.hR.rotation.set(-1.15 + air * 0.8, 0, 0);
        // hind legs: half a stride behind the forelegs
        const hs = Math.sin(ph + 2.8), hc = Math.cos(ph + 2.8), hs2 = Math.sin(ph + 2.2), hc2 = Math.cos(ph + 2.2), th = -(pitch + 0.87), kn = 1.47;
        b.thL.rotation.set(th + 0.6 * hs * g1 + air * 1.3 - wind * 0.22, 0, 0.07); b.thR.rotation.set(th + 0.6 * hs2 * g1 + air * 1.3 - wind * 0.22, 0, -0.07);
        b.shL.rotation.set(kn - 0.55 * Math.max(0, hs) * g1 + 0.3 * Math.max(0, hc) * g1 - air * 1.05 + wind * 0.3, 0, 0); b.shR.rotation.set(kn - 0.55 * Math.max(0, hs2) * g1 + 0.3 * Math.max(0, hc2) * g1 - air * 1.05 + wind * 0.3, 0, 0);
        b.ftL.rotation.set(-0.1 + air * 0.5, 0, 0); b.ftR.rotation.set(-0.1 + air * 0.5, 0, 0);
      }

      // ---- what flies ----
      // A demon, a skull and a bat go through the air. Each frame one of them either can see what it is after and
      // does its own business with it (the demon holds off and throws fire, the bat circles and dives, the skull
      // closes, gathers itself and charges), or cannot, and then comes down under the lintels and follows the way
      // the dead walk until it can. It is moved as a capsule against the level's boxes, so walls stop it; the
      // roofs have no boxes, so it is also kept under V.FLY.top, which is below the eaves.
      const FLYC = V.FLY || { top: 5.1, low: 0.45, clear: 0.22 };
      const floorAt = (x, zz) => g.physics.groundHeight(x, zz, 0.6);
      // the point it goes for: someone's chest, the middle of a guard or a turret, the crystal
      function aimAt(z, out) {
        if (z.tk === 'player' && z.tp) return out.set(z.tp.pos.x, z.tp.pos.y + 1.1, z.tp.pos.z);
        if (z.tk === 'def' && z.tobj) return out.set(z.tobj.pos.x, z.tobj.pos.y + 0.9, z.tobj.pos.z);
        return out.set(V.CRYSTAL.x, V.CRYSTAL.y, V.CRYSTAL.z);
      }
      function flyThink(z, dt) {
        const c = z.cfg;
        // once it has gathered itself, or is in its dive, it does not change its mind about what it is after
        if ((z.fs === 'wind' || z.fs === 'charge' || z.fs === 'dive') && (z.tk === 'crystal' || (z.tk === 'player' ? z.tp && z.tp.alive : z.tobj && z.tobj.alive))) {
          aimAt(z, tmp2); tmp.set(z.pos.x, centreY(z), z.pos.z); z.los = g.physics.lineOfSight(tmp, tmp2); z.noLos = 0;
          return;
        }
        let kind = 'crystal', who = null, obj = null, best = Infinity;
        for (const t of targets) {
          if (!t.alive || z.shunT > 0) continue;
          const d = Math.hypot(t.pos.x - z.pos.x, t.pos.z - z.pos.z), aggro = z.aggroT > 0 && z.aggroBy === (t.sid || 'player') ? 90 : c.aggro;
          if (d < aggro && d < best) { best = d; who = t; }
        }
        if (who) kind = 'player';
        // a skull goes off at whatever stands nearest: a guard or a turret as readily as someone living
        if (c.charge && V.defenses && V.defenses.victimNear) { const def = V.defenses.victimNear(z.pos.x, z.pos.z, Math.min(best, 36)); if (def) { kind = 'def'; obj = def; who = null; } }
        if (kind !== 'crystal' && z.tk === 'crystal' && V.audio && g.time.t - z.snarlAt > 7) { z.snarlAt = g.time.t; z.groanT = Math.max(z.groanT, 2.5); V.audio.play(c.cry || 'screech', { pos: z.pos, pitch: (c.cryPitch || 1) * rand(0.92, 1.1) }); }
        z.tk = kind; z.tp = who; z.tobj = obj;
        aimAt(z, tmp2); tmp.set(z.pos.x, centreY(z), z.pos.z);
        z.los = g.physics.lineOfSight(tmp, tmp2);
        z.noLos = z.los ? 0 : z.noLos + dt;
        // someone it has not been able to see for a long while is given up for a time: the crystal can always be reached
        if (kind === 'player' && z.noLos > 14) { z.shunT = 10; z.noLos = 0; z.aggroT = 0; }
      }
      function flyBite(z) {
        const c = z.cfg, t = z.tp;
        z.swing = z.swingDur = 0.35; z.swingHit = true;
        if (z.tk === 'player' && t && t.alive) {
          if (t.sid) V.net.playerHit(t.sid, c.dmg * z.dmgMult, z.pos, 0); else g.player.damage(c.dmg * z.dmgMult, z.pos);
          if (V.audio) V.audio.play('zombie_hit', { pos: z.pos });
        } else if (z.tk === 'crystal' && V.director) V.director.damageCrystal(c.crystalDmg * z.dmgMult, z);
      }
      function stepFly(z, dt) {
        const c = z.cfg, F = c.fly, cs = c.centre * z.scale;
        if (z.swing > 0) z.swing -= dt;
        z.thinkT -= dt;
        if (z.thinkT <= 0) { const iv = 0.22 + Math.random() * 0.12; z.thinkT = iv; flyThink(z, iv); }
        if (z.tk === 'player' && !(z.tp && z.tp.alive)) { z.tk = 'crystal'; z.tp = null; z.los = false; }
        if (z.tk === 'def' && !(z.tobj && z.tobj.alive)) { z.tk = 'crystal'; z.tobj = null; z.los = false; }
        aimAt(z, tmp3);
        const tx = tmp3.x, ty = tmp3.y, tz = tmp3.z, ddx = tx - z.pos.x, ddz = tz - z.pos.z, dist = Math.hypot(ddx, ddz) || 0.001, dy = ty - (z.pos.y + cs), d3 = Math.hypot(dist, dy);
        const floor = floorAt(z.pos.x, z.pos.z), tfloor = floorAt(tx, tz);
        let gx = z.pos.x, gy = z.pos.y, gz = z.pos.z, sp = z.speed, face = Math.atan2(ddx, ddz), direct = false, meant = false;
        if (z.forcePath > 0) z.forcePath -= dt;
        const free = z.los && z.forcePath <= 0;
        if (z.stun > 0) { z.stun -= dt; sp = 0; if (z.fs === 'wind' || z.fs === 'charge' || z.fs === 'dive') { z.fs = c.charge ? 'rest' : 'climb'; z.fsT = 1; } }
        else if (z.fs === 'charge') {
          // nothing turns it back now: at whatever it chose, as fast as it goes, and off when it gets there or hits something
          z.chargeT += dt; z.swing = z.swingDur = 0.5; z.swingHit = true;
          V.flyHome(z.vel, ddx / d3, dy / d3, ddz / d3, c.charge.speed, c.charge.turn, dt);
          const near = z.tk === 'crystal' ? V.CRYSTAL.reach * 0.75 : c.charge.near;
          if (d3 < near || (z.chargeT > 0.2 && z.wallT > 0)) { kill(z, { by: 'burst', self: true }); return; }
          if (z.chargeT > c.charge.give) { z.fs = 'rest'; z.fsT = 1.1; }
          direct = true; meant = true; face = Math.atan2(z.vel.x, z.vel.z);
        } else if (!free) {
          // nothing to be seen of it from here: down under the lintels and along the way the dead walk
          let ok = false;
          if (z.tk === 'player') { const f = nav.fieldOf(z.tp.sid || 'me', 0); if (f) ok = nav.dirAt(f, z.pos.x, z.pos.z, dir, 0); }
          if (!ok) { if (z.route < 0) z.route = nav.route(z.pos.x, z.pos.z, 0, routeLoad()); ok = nav.dirAt(nav.field(z.route, z.lane, 0), z.pos.x, z.pos.z, dir, 0) || nav.dirAt(nav.crystalField, z.pos.x, z.pos.z, dir, 0); }
          if (!ok) { dir.x = ddx / dist; dir.z = ddz / dist; }
          gx = z.pos.x + dir.x * 3; gz = z.pos.z + dir.z * 3; gy = floor + FLYC.low; face = Math.atan2(dir.x, dir.z); meant = true;
          if (z.fs !== 'rest') z.fs = c.charge ? 'seek' : 'orbit';
          z.dive = null;
        } else if (c.charge) {
          // the skull: straight in, weaving, until it is near enough to gather itself
          if (z.fs === 'wind') {
            sp = 0; z.swing = z.swingDur = 0.5; z.swingHit = true;
            if ((z.windT -= dt) <= 0) { z.fs = 'charge'; z.chargeT = 0; z.wallT = 0; z.vel.set((ddx / d3) * c.charge.speed * 0.5, (dy / d3) * c.charge.speed * 0.5, (ddz / d3) * c.charge.speed * 0.5); if (V.audio) V.audio.play(c.cry, { pos: z.pos, pitch: 1.25 }); }
          } else {
            const wv = Math.sin(g.time.t * 2.1 + z.seed * 3) * Math.min(3, dist * 0.25);
            gx = tx + (ddz / dist) * wv; gz = tz - (ddx / dist) * wv; gy = tfloor + z.altWant - cs + 0.3 * Math.sin(g.time.t * 3.1 + z.seed); meant = true;
            if (z.fs === 'rest') { if ((z.fsT -= dt) <= 0) z.fs = 'seek'; }
            else if (d3 < c.charge.from) { z.fs = 'wind'; z.windT = c.charge.wind; if (V.audio) V.audio.play('fuse', { pos: z.pos, pitch: 1.3 }); }
          }
        } else if (c.swoop) {
          // the bat: round and round above whoever it is after, then down through them and up again
          const sw = c.swoop, bite = z.tk === 'crystal' ? V.CRYSTAL.reach * 0.65 : sw.bite;
          if (z.fs === 'dive') {
            const D = z.dive; D.t += dt;
            if (!D.bit && d3 < bite) { D.bit = true; flyBite(z); }
            const pass = ddx * D.dx + ddz * D.dz < 0;                      // it has gone by
            if (!pass) { D.dx = ddx / dist; D.dz = ddz / dist; D.dy = dy / d3; }
            V.flyHome(z.vel, pass ? D.dx : ddx / d3, pass ? 0.18 : dy / d3, pass ? D.dz : ddz / d3, sw.speed, 3.4, dt);
            if (pass) D.pt += dt;
            if (D.pt > sw.past / sw.speed || D.t > 2.6 || (D.t > 0.3 && z.wallT > 0)) { z.fs = 'climb'; z.fsT = 1.1; z.swoopCd = rand(sw.cd[0], sw.cd[1]); z.dive = null; z.orbit = Math.atan2(z.pos.z - tz, z.pos.x - tx); }
            direct = true; meant = true; face = Math.atan2(z.vel.x, z.vel.z);
          } else {
            z.orbit += z.orbitDir * dt * (sp / Math.max(3, z.keep));
            const keep = z.tk === 'crystal' ? Math.min(z.keep, 4.5) : z.keep;
            gx = tx + Math.cos(z.orbit) * keep; gz = tz + Math.sin(z.orbit) * keep; gy = tfloor + z.altWant - cs; meant = true;
            face = Math.atan2(gx - z.pos.x, gz - z.pos.z);
            if (z.fs === 'climb') { if ((z.fsT -= dt) <= 0) z.fs = 'orbit'; }
            else if ((z.swoopCd -= dt) <= 0 && d3 < 24) { z.fs = 'dive'; z.dive = { t: 0, pt: 0, bit: false, dx: ddx / dist, dz: ddz / dist, dy: dy / d3 }; if (V.audio) V.audio.play(c.cry, { pos: z.pos, pitch: rand(0.95, 1.2) }); }
          }
        } else {
          // the demon: holds off at a distance of its own, drifting round whoever it is after, and throws fire
          z.orbit += z.orbitDir * F.strafe * dt * (0.6 + 0.4 * Math.sin(g.time.t * 0.7 + z.seed));
          if (Math.random() < dt * 0.1) z.orbitDir = -z.orbitDir;
          const keep = z.tk === 'crystal' ? 5.5 : z.keep;
          gx = tx + Math.cos(z.orbit) * keep; gz = tz + Math.sin(z.orbit) * keep; gy = tfloor + z.altWant - cs + 0.25 * Math.sin(g.time.t * 1.1 + z.seed);
          meant = Math.hypot(gx - z.pos.x, gz - z.pos.z) > 2.5;
          z.spitT -= dt;
          if (z.spitT <= 0 && d3 < c.spit.range) { z.spitT = c.spit.cd * rand(0.85, 1.25); spit(z, tx, ty, tz); }
        }
        if (!direct) {
          // toward where it means to be, easing off as it arrives; up and down more gently than along
          const wx = gx - z.pos.x, wz = gz - z.pos.z, wl = Math.hypot(wx, wz), s2 = wl > 0.01 ? Math.min(sp, wl * 2.2) / wl : 0, k = 1 - Math.exp(-3.4 * dt);
          z.vel.x += (wx * s2 - z.vel.x) * k; z.vel.z += (wz * s2 - z.vel.z) * k;
          z.vel.y += (Math.max(-4.5, Math.min(4, (gy - z.pos.y) * 2.4)) - z.vel.y) * (1 - Math.exp(-5 * dt));
        }
        if (z.kbx || z.kbz) { z.kbx = damp(z.kbx, 0, 5, dt); z.kbz = damp(z.kbz, 0, 5, dt); if (Math.abs(z.kbx) + Math.abs(z.kbz) < 0.08) z.kbx = z.kbz = 0; }
        const y0 = z.pos.y, yaw0 = z.yaw;
        z.vel.x += z.kbx; z.vel.z += z.kbz;
        // it collides as what it is: a capsule round its body, not one standing on the point below it (a skull at
        // head height goes over a headstone)
        const lift = (c.centre - c.half) * z.scale;
        z.pos.y += lift;
        const res = g.physics.moveCapsule(z.pos, z.vel, dt, z.r, 2 * c.half * z.scale, false) || {};
        z.pos.y -= lift;
        z.vel.x -= z.kbx; z.vel.z -= z.kbz;
        // never into the floor, never above the airspace the walls enclose
        const fl = floorAt(z.pos.x, z.pos.z);
        if (z.pos.y < fl + FLYC.clear) { z.pos.y = fl + FLYC.clear; if (z.vel.y < 0) z.vel.y = 0; }
        if (z.pos.y > fl + FLYC.top) { z.pos.y = fl + FLYC.top; if (z.vel.y > 0) z.vel.y = 0; }
        z.wallT = res.hitWall || (res.hitCeil && z.fs === 'charge') ? z.wallT + dt : 0;
        // against a wall with nowhere to go: the other way round, and if that does not serve, by the ground's ways in
        if (z.wallT > 0.3 && !direct) { z.orbitDir = -z.orbitDir; z.orbit += z.orbitDir * 0.6; if (z.wallT > 1.3) { z.forcePath = 4; z.wallT = 0; } }
        z.speedNow = Math.hypot(z.vel.x, z.vel.z);
        z.yaw = turnToward(z.yaw, face, dt * 6.5);
        { let dyaw = z.yaw - yaw0; if (dyaw > PI) dyaw -= TAU; else if (dyaw < -PI) dyaw += TAU; z.bank = damp(z.bank, -(dyaw / Math.max(dt, 1e-3)) * 0.22, 6, dt); }
        // the failsafe: something that means to be moving and is not gives up the air for the ground's ways, then
        // whoever it was after, and in the end is taken away, so a wave can always finish
        z.stuckCheck -= dt;
        if (meant) z.wantT += dt;
        if (z.stuckCheck <= 0) {
          z.stuckCheck = 2;
          const moved = Math.hypot(z.pos.x - z.lastX, z.pos.z - z.lastZ, z.pos.y - (z.lastY || y0));
          z.lastX = z.pos.x; z.lastZ = z.pos.z; z.lastY = z.pos.y;
          if (z.wantT > 1.5 && moved < 0.35) {
            z.stuckT += 2;
            if (z.stuckT === 4) { z.forcePath = 5; z.route = -1; z.lane = (z.lane + 1) % LANES; }
            if (z.stuckT === 8 && z.tk === 'player') { z.shunT = 8; z.aggroT = 0; }
            if (z.stuckT >= 16) { kill(z, { silent: true }); return; }
          } else z.stuckT = 0;
          z.wantT = 0;
        }
      }
      // the demon in the air: leaning into its flight, legs trailing, arms held wide and thrown forward to cast
      function flyPose(z, dt, speed) {
        const b = z.bones, time = g.time.t, s = Math.sin(time * 2.2 + z.seed), fast = Math.min(1, speed / 5);
        z.phase += dt * (7 + 3 * fast);
        let cast = 0; if (z.swing > 0) { const k = 1 - z.swing / z.swingDur; cast = Math.sin(k * PI); }
        const lean = 0.18 + 0.42 * fast - z.flinch * 0.9 - (z.stun > 0 ? 0.3 : 0);
        b.hips.rotation.set(lean, 0, 0.04 * s); b.hips.position.set(0, 0.96 + 0.05 * s, 0);
        b.spine.rotation.set(0.06 - cast * 0.2, 0, 0); b.chest.rotation.set(0.1 - cast * 0.15, 0, z.slump * 0.5);
        b.neck.rotation.set(-lean * 0.6 - 0.08, 0, 0); b.head.rotation.set(-lean * 0.5 + 0.14, Math.sin(time * 0.7 + z.seed * 2) * 0.2, z.headTilt * 0.4);
        b.jaw.rotation.set(0.15 + cast * 0.5, 0, 0);
        b.uaL.rotation.set(-0.35 - cast * 1.25, 0, 0.78 - cast * 0.5); b.uaR.rotation.set(-0.35 - cast * 1.25, 0, -0.78 + cast * 0.5);
        b.faL.rotation.set(-0.5 + cast * 0.3, 0, 0); b.faR.rotation.set(-0.5 + cast * 0.3, 0, 0);
        b.hL.rotation.set(-0.2, 0, 0); b.hR.rotation.set(-0.2, 0, 0);
        b.thL.rotation.set(0.22 + 0.3 * fast + 0.06 * s, 0, 0.06); b.thR.rotation.set(0.08 + 0.3 * fast - 0.06 * s, 0, -0.06);
        b.shL.rotation.set(0.5 + 0.2 * fast, 0, 0); b.shR.rotation.set(0.78 + 0.2 * fast, 0, 0);
        b.ftL.rotation.set(0.7, 0, 0); b.ftR.rotation.set(0.7, 0, 0);
        if (z.wings && beastKit) beastKit.flap(z.wings, z.phase, 0.5);
      }

      // ---- a spider on a wall ----
      // With someone at the right distance, a spider looks round itself for something tall to climb: the church,
      // the graveyard wall, a tomb, a tree. It goes to the foot of it, up it, waits a moment and springs from
      // there. The wall is whatever box of the level it found, looked for again every frame: if that goes (a
      // wall can be broken), or the spider is thrown back, it drops.
      function tryClimb(z) {
        const cl = z.cfg.climb, t = z.tp;
        if (!t || !t.alive) return false;
        const cy = z.pos.y + 0.3 * z.scale, reach = cl.reach * z.scale, rise = rand(cl.rise[0], cl.rise[1]);
        let best = null, bd = Infinity;
        for (let i = 0; i < 8; i++) {
          const a = z.yaw + (i * TAU) / 8;
          tmp2.set(Math.sin(a), 0, Math.cos(a));
          const h = g.physics.raycast(tmp.set(z.pos.x, cy, z.pos.z), tmp2, reach);
          if (!h || !h.box || !h.normal || Math.abs(h.normal.y) > 0.3 || h.box.bulletOnly) continue;
          const top = V.climbTop(z.pos.y, h.box.max.y, rise, cl.least, 0.3 * z.scale);
          if (!top) continue;
          const nx = h.normal.x, nz = h.normal.z, px = h.point.x + nx * 0.04, pz = h.point.z + nz * 0.04;
          // from up there it must be able to see whoever it means to drop on
          tmp3.set(px + nx * 0.5 * z.scale, top + 0.2, pz + nz * 0.5 * z.scale);
          if (!g.physics.lineOfSight(tmp3, tmp.set(t.pos.x, t.pos.y + 1.1, t.pos.z))) continue;
          const d = Math.hypot(t.pos.x - px, t.pos.z - pz);
          if (d < cl.from * 0.6 || d > cl.to + 2 || d >= bd) continue;
          bd = d; best = { x: px, z: pz, nx, nz, top, yaw: Math.atan2(-nx, -nz), box: h.box, phase: 'to', t: 0, wait: rand(cl.wait[0], cl.wait[1]), tp: t };
        }
        if (!best) return false;
        z.climb = best; z.leapWind = 0;
        if (V.audio) V.audio.play(z.cfg.cry, { pos: z.pos, pitch: (z.cfg.cryPitch || 1) * rand(0.9, 1.1) });
        return true;
      }
      function stepClimb(z, dt) {
        const C = z.climb, cl = z.cfg.climb, t = C.tp;
        // thrown off it, or the wall is no longer there: it drops, and what happens next is the ground's business
        if (z.stun > 0 || z.kbx || z.kbz || g.physics.boxes.indexOf(C.box) < 0) { z.climb = null; z.climbCd = rand(cl.cd[0], cl.cd[1]); z.pos.x += C.nx * z.r; z.pos.z += C.nz * z.r; return; }
        C.t += dt; z.vel.set(0, 0, 0);
        if (C.phase === 'to') {
          // across the ground to the foot of it: the way is clear, the ray that found the wall came along it
          const dx = C.x - z.pos.x, dz = C.z - z.pos.z, d = Math.hypot(dx, dz), step = z.speed * 1.35 * dt;
          if (d <= step + 0.05 || C.t > 3) { C.phase = 'up'; C.t = 0; z.pos.x = C.x; z.pos.z = C.z; z.yaw = C.yaw; }
          else { z.pos.x += (dx / d) * step; z.pos.z += (dz / d) * step; z.pos.y = g.physics.groundHeight(z.pos.x, z.pos.z, z.pos.y + 0.5); z.yaw = turnToward(z.yaw, Math.atan2(dx, dz), dt * 10); z.speedNow = z.speed * 1.35; }
        } else if (C.phase === 'up') {
          z.pos.y = Math.min(C.top, z.pos.y + cl.speed * dt); z.speedNow = cl.speed; z.yaw = C.yaw;
          if (z.pos.y >= C.top) { C.phase = 'wait'; C.t = 0; }
        } else {
          z.speedNow = 0;
          if (C.t < C.wait) return;
          const ddx = t.pos.x - z.pos.x, ddz = t.pos.z - z.pos.z, dist = Math.hypot(ddx, ddz) || 0.001;
          z.climb = null; z.climbCd = rand(cl.cd[0], cl.cd[1]);
          z.pos.x += C.nx * (z.r + 0.05); z.pos.z += C.nz * (z.r + 0.05);          // off the face of it, so its own girth does not hold it there
          if (!t.alive || dist > cl.to + 6) return;                              // nobody to drop on any more: it lets go
          z.tp = t; z.tk = 'player';
          startLeap(z, ddx, ddz, dist, Math.max(0, z.pos.y - t.pos.y));
          z.yaw = Math.atan2(ddx, ddz); z.leapCd = z.cfg.leap.cd;
          if (V.audio) V.audio.play(z.cfg.cry, { pos: z.pos, pitch: (z.cfg.cryPitch || 1) * 1.3 });
        }
      }

      // ---- what a body of its own does when it dies ----
      // A skull leaves nothing (it has gone off, or burst). A bat falls out of the air and a spider rolls onto its
      // back where it is, or drops first if it was on a wall; they lie a while, sink, and go back to the pool.
      const corpses = [];
      function startCorpse(z, info) {
        z.climb = null; z.leap = null; z.dive = null;
        if (z.cfg.charge) { retire(z); return; }
        const d = info.dir, k = Math.min(3, info.power || 2) * 0.6 / Math.sqrt(z.mass || 1);
        z.dead = { t: 0, vx: z.vel.x * 0.5 + (d ? d.x * k : 0), vy: (z.cfg.fly ? 0.5 : 1.6) + (d ? d.y * k * 0.5 : 0), vz: z.vel.z * 0.5 + (d ? d.z * k : 0), spin: rand(-4, 4), down: false, life: 9, lie: z.cfg.fly ? (z.cfg.centre - 0.16) * z.scale : 0 };
        corpses.push(z);
      }
      function updateCorpses(dt) {
        for (let i = corpses.length - 1; i >= 0; i--) {
          const z = corpses[i], D = z.dead;
          if (!D || !z.active) { corpses.splice(i, 1); continue; }
          D.t += dt;
          if (!D.down) {
            D.vy -= 16 * dt; z.pos.x += D.vx * dt; z.pos.y += D.vy * dt; z.pos.z += D.vz * dt;
            if (z.cfg.fly) z.yaw += D.spin * dt;                              // it turns as it falls
            const gy = g.physics.groundHeight(z.pos.x, z.pos.z, z.pos.y + D.lie + 0.5) - D.lie;
            if (z.pos.y <= gy) { z.pos.y = gy; D.down = true; if (V.audio) V.audio.play('body_fall', { pos: z.pos }); }
          }
          const sink = D.t > D.life ? (D.t - D.life) * 0.4 : 0;
          z.mesh.position.set(z.pos.x, z.pos.y - sink, z.pos.z); z.mesh.rotation.y = z.yaw;
          pose(z, dt, 0, 0);
          if (D.t > D.life + 2.4) { corpses.splice(i, 1); z.dead = null; retire(z); }
        }
      }

      // ---- finding a way ----
      // how many of the dead are already bound for each way in
      const loadBuf = [];
      function routeLoad() {
        loadBuf.length = 0;
        for (const q of list) if (q.state !== DEAD && q.route >= 0) loadBuf[q.route] = (loadBuf[q.route] || 0) + 1;
        return loadBuf;
      }
      // Nobody walks a ruled line. The field (in `dir`) gives the way; each body drifts off it and back to rhythms
      // of its own, comes at the living from its own side, and leans away from the bodies beside it. Every turn
      // is checked against the grid first, so none of it steers into a wall.
      function sway(z, dist) {
        const t = g.time.t, x = z.pos.x, zz = z.pos.z, ci = nav.idx(x, zz), sz = z.size;
        let a = z.wAmp * 0.62 * (Math.sin(t * z.wF1 + z.wP1) + 0.6 * Math.sin(t * z.wF2 + z.wP2));
        if (z.tk === 'player') a += z.flank * Math.min(1, Math.max(0, (dist - 3) / 9));
        a *= Math.min(1, Math.max(0, (dist - 2.2) / 4)) * (z.crawling ? 0.5 : 1) * (ci >= 0 && nav.nearOf(sz)[ci] === 1 ? 0.35 : 1);
        if (a > 0.02 || a < -0.02) {
          const ca = Math.cos(a), sa = Math.sin(a), nx = dir.x * ca - dir.z * sa, nz = dir.x * sa + dir.z * ca;
          if (nav.free(x + nx * 0.8, zz + nz * 0.8, sz) && nav.free(x + nx * 1.6, zz + nz * 1.6, sz)) { dir.x = nx; dir.z = nz; }
        }
        const al = Math.hypot(z.avx, z.avz);
        if (al > 0.01) {
          const k = (Math.min(1.1, al) / al) * 0.8, nx = dir.x + z.avx * k, nz = dir.z + z.avz * k, l = Math.hypot(nx, nz);
          if (l > 0.25 && nav.free(x + (nx / l) * 0.7, zz + (nz / l) * 0.7, sz)) { dir.x = nx / l; dir.z = nz / l; }
        }
      }

      // ---- wandering ----
      // One of the wild dead with nothing on its mind: it ambles to somewhere a short walk off that it can reach in
      // a straight line, stands about, and picks somewhere else. Never into the church, never out of the world.
      // Returns the pace to walk at, with the way in `dir`; 0 is standing still.
      function pickWander(z) {
        const CH = V.CH || { hw: 0, hd: 0 };
        for (let i = 0; i < 8; i++) {
          const a = rand(0, TAU), r = rand(5, 14), x = z.pos.x + Math.cos(a) * r, zz = z.pos.z + Math.sin(a) * r;
          if (Math.hypot(x, zz) > 58 || (Math.abs(x) < CH.hw + 2.5 && Math.abs(zz) < CH.hd + 2.5)) continue;
          let ok = true;
          for (let k = 1; k <= 7 && ok; k++) ok = nav.free(z.pos.x + ((x - z.pos.x) * k) / 7, z.pos.z + ((zz - z.pos.z) * k) / 7, z.size);
          if (ok) { z.wx = x; z.wz = zz; z.wanderT = r / Math.max(0.3, z.speed * 0.42) + 3; return; }
        }
        z.wx = z.pos.x; z.wz = z.pos.z; z.wanderT = 2; z.restT = rand(1, 3);
      }
      function roamStep(z, dt) {
        const pace = z.speed * (z.type === 'runner' ? 0.2 : 0.42);
        if (z.job) {
          // set to work on a totem: to its place beside it, and there it stays
          const dx = z.job.x - z.pos.x, dz = z.job.z - z.pos.z, d = Math.hypot(dx, dz);
          if (d < 0.7) return 0;
          if (!nav.free(z.pos.x + (dx / d) * 0.8, z.pos.z + (dz / d) * 0.8, z.size)) { z.job = null; return 0; }
          dir.x = dx / d; dir.z = dz / d;
          return pace;
        }
        if (z.restT > 0) { z.restT -= dt; return 0; }
        z.wanderT -= dt;
        const dx = z.wx - z.pos.x, dz = z.wz - z.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.9 || z.wanderT <= 0 || !nav.free(z.pos.x + (dx / d) * 0.9, z.pos.z + (dz / d) * 0.9, z.size)) {
          if (d < 0.9 && Math.random() < 0.6) z.restT = rand(1.5, 6);
          pickWander(z);
          return 0;
        }
        dir.x = dx / d; dir.z = dz / d;
        return pace;
      }

      // ---- thinking ----
      function think(z) {
        const C = V.CRYSTAL, dc = Math.hypot(z.pos.x - C.x, z.pos.z - C.z);
        if (z.roam) {
          // One of the wild dead: it wakes to whoever comes within its senses, or, hurt or startled (aggroT), to
          // anyone it can find. Until then it wanders. Once woken it is like any other, for good.
          let near = null, best = Infinity;
          for (const t of targets) { if (!t.alive) continue; const d = Math.hypot(t.pos.x - z.pos.x, t.pos.z - z.pos.z); if (d < (z.aggroT > 0 ? 70 : z.cfg.aggro) && d < best) { best = d; near = t; } }
          if (!near) { z.tk = 'roam'; z.tobj = null; z.tp = null; return; }
          z.roam = false; z.job = null; z.aggroT = Math.max(z.aggroT, 25); z.aggroBy = near.sid || 'player';
          g.events.emit('vigil:woken', { enemy: z });
        }
        let kind = 'crystal', obj = null, who = null;
        const def = V.defenses && V.defenses.victimNear ? V.defenses.victimNear(z.pos.x, z.pos.z, 5) : null;
        if (def) { kind = 'def'; obj = def; }
        else {
          // the nearest of the living within reach of its senses; whoever shot it is sensed from anywhere
          let best = Infinity;
          for (const t of targets) {
            if (!t.alive || z.shunT > 0) continue;            // it could not get at them: for a while it has given up trying
            const d = Math.hypot(t.pos.x - z.pos.x, t.pos.z - z.pos.z), aggro = z.aggroT > 0 && z.aggroBy === (t.sid || 'player') ? 70 : z.cfg.aggro;
            // zombies already on the crystal stay on it unless someone is right on top of them
            if (d < aggro && !(dc < 4.6 && d > 3.2) && d < best) { best = d; who = t; }
          }
          if (who) kind = 'player';
        }
        // the moment it turns on someone, it says so
        if (kind === 'player' && z.tk !== 'player' && !z.headless && V.audio && g.time.t - z.snarlAt > 7) {
          z.snarlAt = g.time.t; z.groanT = Math.max(z.groanT, 2.5);
          V.audio.play(z.cfg.cry || (z.cfg.fours ? 'wolf_howl' : z.mass > 2 ? 'growl' : z.type === 'runner' ? 'screech' : 'zombie_pain'), { pos: z.pos, pitch: z.cfg.cry ? (z.cfg.cryPitch || 1) * rand(0.92, 1.1) : z.cfg.fours ? rand(0.92, 1.1) : z.mass > 2 ? 1.1 : z.type === 'runner' ? 1 : 0.8 });
        }
        z.tk = kind; z.tobj = obj; z.tp = who;
        // a way in that has been shut to a body its size is given up; otherwise it may still change its mind at an open door
        if (z.route >= 0 && !nav.usable(z.route, z.size)) z.route = -1;
        if (kind === 'crystal' && z.route >= 0) z.route = nav.nearer(z.route, z.pos.x, z.pos.z, z.size);
        if (z.cfg.spit || z.cfg.leap || z.cfg.fire) {
          tmp.set(z.pos.x, z.pos.y + (z.cfg.eyeY ? z.cfg.eyeY * z.scale : z.crawling ? 0.45 : z.cfg.fours ? 0.8 : 1.45), z.pos.z);
          if (kind === 'player') z.los = g.physics.lineOfSight(tmp, tmp2.set(who.pos.x, who.pos.y + 1.2, who.pos.z));
          else if (kind === 'crystal') z.los = !!z.cfg.spit && dc < z.cfg.spit.range && g.physics.lineOfSight(tmp, tmp2.set(C.x, C.y + 0.6, C.z));
          else z.los = false;
        }
      }

      // ---- pose, from motion capture ----
      // The stride comes from a captured gait cycle, slowed or hurried to the pace the body is moving at and blended
      // toward a captured standing pose as it stops. Over that go the things that are the game's own: a longer
      // stride for speeds no shamble covers, arms that each zombie carries its own way, the swing of an attack,
      // the flinch from a hit, a slumped chest, a head that tilts and looks about, and the jaw.
      function capture(z, dt, speed, rising) {
        const b = z.bones, t = z.type, big = t === 'brute' || t === 'boss', time = g.time.t, nb = MO.nb;
        z.walkBlend = damp(z.walkBlend, speed > 0.2 ? 1 : 0, 6, dt);
        const wb = z.walkBlend, run = !!z.runClip && speed > 2.6, clip = run ? z.runClip : z.walkClip;
        if (z.crawling) z.phase += (dt * Math.max(speed, 0.001) * 6.5) / z.scale;
        else z.phase += (dt * TAU * Math.max(0.75, Math.min(1.55, speed / ((run ? 3.2 : 1.15) * z.scale)))) / clip.T;
        const ph = z.phase, s = Math.sin(ph), c = Math.cos(ph);
        const fw = ((((ph / TAU) % 1) + 1) % 1) * clip.n, i0 = Math.floor(fw) % clip.n, i1 = (i0 + 1) % clip.n, fk = fw - Math.floor(fw);
        const idle = MO.clips.idle, fi = (((time + z.idleAt) / idle.T) % 1) * idle.n, j0 = Math.floor(fi) % idle.n, j1 = (j0 + 1) % idle.n, jk = fi - Math.floor(fi);
        // The game walks them faster than anything shambles: the legs reach further than the capture's did, by more the
        // faster the body is going, so the feet keep nearer to the ground they cover.
        const reach = 1 + (run ? 0.55 : big ? 0.3 : Math.min(0.9, 0.35 + 0.3 * speed)) * wb;
        for (let k = 0; k < nb; k++) {
          const o = k * 4;
          qa.fromArray(clip.q, i0 * nb * 4 + o); qb.fromArray(clip.q, i1 * nb * 4 + o); qa.slerp(qb, fk);
          if (wb < 0.999) { qb.fromArray(idle.q, j0 * nb * 4 + o); qc.fromArray(idle.q, j1 * nb * 4 + o); qb.slerp(qc, jk); qb.slerp(qa, wb); qa.copy(qb); }
          if (k >= MO.leg0 && (k - MO.leg0) % 3 < 2) stretch(qa, reach);           // thighs and shins
          b[MO.bones[k]].quaternion.copy(qa).normalize();
        }
        // what the moment adds
        // hunched into its walk, and further when it has someone to go for
        let lean = (big ? 0.12 : 0.16 + (z.tk === 'player' ? 0.08 : 0)) * wb, jaw = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(time * 1.7 + z.seed * 3)), bite = 0, atk = 0, arm = 0;
        if (z.swing > 0) {
          const k = 1 - z.swing / z.swingDur;
          atk = Math.min(1, k / 0.12) * Math.min(1, (1 - k) / 0.2);
          arm = k < 0.45 ? -1.2 + (-2.7 + 1.2) * (k / 0.45) : -2.7 + (-0.5 + 2.7) * ((k - 0.45) / 0.55);
          lean += Math.sin(k * PI) * 0.38; jaw = 0.5;
          if (usableArms(z) === 0) bite = Math.sin(k * PI);                       // no arms left: it lunges with its teeth
        }
        if (rising > 0) { atk = 1; arm = -2.8; lean -= 0.25; jaw = 0.45; }
        if (z.stun > 0) lean -= 0.4;
        lean += bite * 0.45 - z.flinch * 1.6;
        if (lean) {
          b.spine.quaternion.multiply(qb.setFromAxisAngle(AX, lean * 0.55)); b.chest.quaternion.multiply(qb.setFromAxisAngle(AX, lean * 0.45));
          b.neck.quaternion.multiply(qb.setFromAxisAngle(AX, -lean * 0.35 + bite * 0.3));
        }
        b.chest.quaternion.multiply(qb.setFromAxisAngle(AZ, z.slump));
        b.head.quaternion.multiply(qb.setFromEuler(eul.set(Math.sin(time * 0.9 + z.seed) * 0.06 - bite * 0.2, Math.sin(time * 0.6 + z.seed * 2) * 0.18, z.headTilt * 0.6)));
        b.jaw.rotation.set(jaw + bite * 0.3, 0, 0);
        // Arms. The capture holds them out in front; each of the dead keeps as much of that as is its habit and
        // lets the rest hang. The big ones carry theirs wide and low. A swing takes them over while it lasts.
        const own = (ua, fa, habit, keep, side, phase) => {
          const w = Math.max(atk, big ? 1 : 1 - keep);
          if (w < 0.002) return;
          const rest = big ? -0.25 - side * s * 0.35 * wb : habit * 0.5 + Math.sin(ph * 0.5 + z.seed + phase) * 0.12;
          qb.setFromEuler(eul.set(mix(rest, arm, atk), 0, side * (big ? 0.42 : 0.07))); ua.quaternion.slerp(qb, w);
          qb.setFromEuler(eul.set(mix(big ? -0.5 : -0.3, -0.25, atk), 0, 0)); fa.quaternion.slerp(qb, w);
        };
        own(b.uaL, b.faL, z.armL0, z.armMixL, 1, 0); own(b.uaR, b.faR, z.armR0, z.armMixR, -1, 1.3);
        b.hL.quaternion.multiply(qb.setFromAxisAngle(AX, Math.sin(time * 2.1 + z.seed) * 0.12)); b.hR.quaternion.multiply(qb.setFromAxisAngle(AX, Math.sin(time * 1.8 + z.seed * 1.7) * 0.12));
        // The hips ride at the height that stands the lower foot on the ground, whatever the legs are doing.
        const hy = 0.085 - Math.min(ankleDrop(b.hips.quaternion, b.thL.quaternion, b.shL.quaternion, 1), ankleDrop(b.hips.quaternion, b.thR.quaternion, b.shR.quaternion, -1));
        z.hipY = z.hipY > 0 ? damp(z.hipY, hy, 28, dt) : hy;
        b.hips.position.set(0, z.hipY, 0);
        if (z.crawl > 0) crawlPose(z, ease(Math.min(1, z.crawl)), s, c, time);
      }

      // ---- pose ----
      function pose(z, dt, speed, rising) {
        if (z.beast) { beastKit.pose(z, dt, speed, g.time.t); return; }
        if (z.cfg.fly) { flyPose(z, dt, speed); return; }
        if (z.cfg.fours && !z.crawling) { foursPose(z, dt, speed, rising); return; }
        if (MO && z.walkClip) { capture(z, dt, speed, rising); return; }
        const b = z.bones, t = z.type, big = t === 'brute' || t === 'boss', time = g.time.t;
        z.walkBlend = damp(z.walkBlend, speed > 0.25 ? 1 : 0, 8, dt);
        const wb = z.walkBlend;
        z.phase += dt * (z.crawling ? Math.max(speed, 0.001) * 6.5 : speed * (t === 'runner' ? 3.4 : 4.4)) / z.scale;
        const ph = z.phase, s = Math.sin(ph), c = Math.cos(ph), amp = t === 'runner' ? 0.95 : big ? 0.45 : 0.55;
        b.thL.rotation.set(-s * amp * wb, 0, 0.05); b.thR.rotation.set(s * amp * wb * (1 - z.limp * 0.6), 0, -0.05 - z.limp * 0.12);
        b.shL.rotation.x = Math.max(0, c) * 0.95 * wb + 0.1; b.shR.rotation.x = Math.max(0, -c) * 0.95 * wb * (1 - z.limp * 0.5) + 0.1;
        b.ftL.rotation.x = -(b.thL.rotation.x + b.shL.rotation.x) * 0.55; b.ftR.rotation.x = -(b.thR.rotation.x + b.shR.rotation.x) * 0.55;
        let lean = t === 'runner' ? 0.55 : big ? 0.3 : 0.22;
        let aL = z.armL0 + Math.sin(ph * 0.5 + z.seed) * 0.12, aR = z.armR0 + Math.sin(ph * 0.5 + 1.3 + z.seed) * 0.14, eL = -0.3, eR = -0.35, spread = 0.07;
        if (t === 'runner') { aL = s * 0.9 * wb - 0.3; aR = -s * 0.9 * wb - 0.3; eL = eR = -1.25; spread = 0.12; }
        else if (big) { aL = -0.25 - s * 0.35 * wb; aR = -0.25 + s * 0.35 * wb; eL = eR = -0.5; spread = 0.42; }
        let jaw = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(time * 1.7 + z.seed * 3)), bite = 0;
        if (z.swing > 0) {
          const k = 1 - z.swing / z.swingDur, a = k < 0.45 ? -1.2 + (-2.7 + 1.2) * (k / 0.45) : -2.7 + (-0.5 + 2.7) * ((k - 0.45) / 0.55);
          aL = aR = a; eL = eR = -0.25; lean += Math.sin(k * PI) * 0.38; jaw = 0.5;
          if (usableArms(z) === 0) bite = Math.sin(k * PI);                 // no arms left: it lunges with its teeth
        }
        if (rising > 0) { aL = aR = -2.8; lean = -0.1; jaw = 0.45; }
        if (z.stun > 0) { lean = -0.25; aL = aR = -0.4; }
        lean -= z.flinch * 1.6; lean += bite * 0.45;
        b.hips.rotation.set(0, s * 0.1 * wb, s * 0.045 * wb + z.limp * 0.06);
        b.hips.position.set(0, 0.96 + Math.abs(s) * 0.03 * wb - (t === 'runner' ? 0.06 : 0) - (big ? 0.02 : 0), 0);
        b.spine.rotation.set(lean * 0.55 + 0.06, -s * 0.12 * wb, s * 0.05 * wb + z.slump * 0.5);
        b.chest.rotation.set(lean * 0.45 + 0.16, -s * 0.1 * wb, s * 0.04 * wb + z.slump);
        b.neck.rotation.set(-lean * 0.35 + 0.32 + bite * 0.3, 0, z.headTilt * 0.5);
        b.head.rotation.set(-lean * 0.4 - 0.3 + Math.sin(time * 0.9 + z.seed) * 0.06 - bite * 0.2, Math.sin(time * 0.6 + z.seed * 2) * 0.18, z.headTilt * 0.5 + Math.sin(ph * 0.5 + z.seed) * 0.06);
        b.jaw.rotation.x = jaw + bite * 0.3;
        b.uaL.rotation.set(aL, 0, spread); b.uaR.rotation.set(aR, 0, -spread);
        b.faL.rotation.set(eL, 0, 0); b.faR.rotation.set(eR, 0, 0);
        b.hL.rotation.x = -0.25 + Math.sin(time * 2.1 + z.seed) * 0.15; b.hR.rotation.x = -0.25 + Math.sin(time * 1.8 + z.seed * 1.7) * 0.15;
        if (z.crawl > 0) crawlPose(z, ease(Math.min(1, z.crawl)), s, c, time);
      }
      // Face down, dragging itself along by whatever arms it has; e blends in from the standing pose as it falls.
      function crawlPose(z, e, s, c, time) {
        const b = z.bones, idle = Math.sin(time * 1.3 + z.seed), arms = usableArms(z);
        const R = (bone, x, y, zz) => { const r = bone.rotation; r.set(mix(r.x, x, e), mix(r.y, y, e), mix(r.z, zz, e)); };
        let lift = 0, slash = 0;
        if (z.swing > 0) { const k = 1 - z.swing / z.swingDur; lift = Math.sin(k * PI); slash = lift; }
        const wr = arms ? 1 : 2.2;                                           // without arms it can only writhe
        R(b.hips, 1.42 - lift * 0.12, s * 0.12 * wr, c * 0.1 * wr);
        b.hips.position.y = mix(b.hips.position.y, 0.17 + Math.abs(s) * 0.012, e);
        R(b.spine, -0.2 - lift * 0.3, -s * 0.1 * wr, 0); R(b.chest, -0.24 - lift * 0.3, -s * 0.08, z.slump);
        R(b.neck, -0.3, 0, z.headTilt * 0.4); R(b.head, -0.5 + idle * 0.06 - lift * 0.1, Math.sin(time * 0.7 + z.seed * 2) * 0.25, z.headTilt * 0.4);
        b.jaw.rotation.x = mix(b.jaw.rotation.x, 0.3 + lift * 0.3, e);
        R(b.uaL, -2.85 + 0.7 * s - slash * 0.5, 0, 0.5); R(b.faL, -0.25 - 0.75 * Math.max(0, s) - slash * 0.2, 0, 0);
        R(b.uaR, -2.85 - 0.7 * s - slash * 0.5, 0, -0.5); R(b.faR, -0.25 - 0.75 * Math.max(0, -s) - slash * 0.2, 0, 0);
        R(b.hL, 0.7, 0, 0); R(b.hR, 0.7, 0, 0);
        R(b.thL, 0.06 + 0.1 * c, 0, 0.09); R(b.shL, 0.12 + 0.14 * Math.max(0, c), 0, 0); R(b.ftL, 0.55, 0, 0);
        R(b.thR, 0.06 - 0.1 * c, 0, -0.09); R(b.shR, 0.12 + 0.14 * Math.max(0, -c), 0, 0); R(b.ftR, 0.55, 0, 0);
      }

      // ---- update ----
      function update(dt) {
        if (dt <= 0) return;
        if (dt > 0.05) dt = 0.05;
        if (parked.length) { for (const z of parked) { if (z.loose) root.remove(z.loose); else { z.mesh.frustumCulled = true; if (z.beast) z.mesh.traverse((m) => { m.frustumCulled = true; }); retire(z); } } parked.length = 0; }
        const p = g.player, C = V.CRYSTAL, px = p.pos.x, pz = p.pos.z;
        if (navDirty > 0) { navDirty -= dt; if (navDirty <= 0) { nav.rebuild(); navT = 0; } }
        nav.tick();
        if (remote) { updateRemote(dt); ragdoll.update(dt); updateCorpses(dt); updateSpits(dt); updateBlasts(dt); groan(dt, px, pz); return; }
        const net = NET();
        targets = net ? [me].concat(net.targets()) : [me];
        // the bigger sizes keep fields toward the living only while one of them walks
        { let brutes = 0, bosses = 0; for (const q of list) if (q.state !== DEAD) { if (q.size === 1) brutes++; else if (q.size === 2) bosses++; } nav.live(1, brutes); nav.live(2, bosses); }
        // one field per player, rebuilt in turn
        navT -= dt;
        if (navT <= 0) {
          navT = 0.45 / targets.length; navI = (navI + 1) % targets.length;
          const t = targets[navI]; if (t.alive) nav.buildFor(t.sid || 'me', t.pos.x, t.pos.z);
          if (navI === 0 && targets.length > 1) nav.forget(new Set(targets.map((q) => q.sid || 'me')));
        }
        for (let i = list.length - 1; i >= 0; i--) {
          const z = list[i];
          if (z.state === DEAD) continue;
          if (z.marked > 0) z.marked -= dt;
          if (z.aggroT > 0) z.aggroT -= dt;
          if (z.shunT > 0) z.shunT -= dt;
          if (z.flinch > 0) z.flinch = Math.max(0, z.flinch - dt);
          if (z.fuse > 0 && (z.fuse -= dt) <= 0) { kill(z, { by: 'burst', self: true }); continue; }      // lit: it goes off whatever happens next
          if (z.state === RISE) {
            z.riseT += dt;
            const k = Math.min(1, z.riseT / 1.7);
            z.mesh.position.set(z.pos.x, z.pos.y - 1.75 * z.scale * (1 - k) * (1 - k), z.pos.z);
            if (Math.random() < 0.5 && g.fx.dust) { tmp.set(z.pos.x + rand(-0.3, 0.3), z.pos.y + 0.05, z.pos.z + rand(-0.3, 0.3)); try { g.fx.dust(tmp, up, 0.5, 0.2, 0.16, 0.12); } catch (e) { /* optional */ } }
            if (k >= 1) z.state = WALK;
            pose(z, dt, 0, 1 - k);
            continue;
          }
          if (z.state === EMERGE) {
            const e = z.em; e.t += dt;
            const k = Math.min(1, e.t / e.dur);
            z.pos.x = e.x0 + (e.x1 - e.x0) * k; z.pos.z = e.z0 + (e.z1 - e.z0) * k;
            z.pos.y = k < e.inside ? e.sill : g.physics.groundHeight(z.pos.x, z.pos.z, 1.0);
            z.speedNow = e.speed; z.mesh.position.copy(z.pos); z.mesh.rotation.y = z.yaw;
            pose(z, dt, e.speed, 0);
            if (k >= 1) { z.state = WALK; z.em = null; z.vel.set(Math.sin(z.yaw) * e.speed, 0, Math.cos(z.yaw) * e.speed); z.lastX = z.pos.x; z.lastZ = z.pos.z; z.stuckCheck = 2; }
            continue;
          }
          if (z.crawling) {
            if (z.crawl < 1) z.crawl = Math.min(1, z.crawl + dt / 0.55);
            if (z.bleedT > 0) { z.bleedT -= dt; if (z.bleedT <= 0) { kill(z, { by: z.lastBy, owner: z.lastOwner }); continue; } }
          }
          if (z.climb) { stepClimb(z, dt); if (z.climb) continue; }      // on a wall nothing else moves it
          if (z.cfg.fly) { stepFly(z, dt); continue; }
          let wantYaw = z.yaw, vx = z.vel.x, vz = z.vel.z;
          if (z.stun > 0 || (z.crawling && z.crawl < 1)) { if (z.stun > 0) z.stun -= dt; vx = damp(vx, 0, 6, dt); vz = damp(vz, 0, 6, dt); }
          else if (z.leap) { vx = z.leap.vx; vz = z.leap.vz; wantYaw = Math.atan2(vx, vz); leapHit(z); }      // in the air: nothing steers it
          else {
            z.thinkT -= dt;
            if (z.thinkT <= 0) { z.thinkT = 0.25 + Math.random() * 0.12; think(z); }
            if (z.tk === 'roam') {
              const sp = roamStep(z, dt);
              vx = damp(vx, dir.x * sp, 5, dt); vz = damp(vz, dir.z * sp, 5, dt);
              if (sp > 0.05) { if (vx * vx + vz * vz > 0.01) wantYaw = Math.atan2(vx, vz); }
              else if (z.job) wantYaw = Math.atan2(z.job.fx - z.pos.x, z.job.fz - z.pos.z);            // at work: facing what it is raising
            } else {
            let tx = C.x, tz = C.z, ty = C.y, range = C.reach + z.r + (z.crawling ? 0.45 * z.scale : 0);
            if (z.tk === 'player' && !(z.tp && z.tp.alive)) z.tk = 'crystal';
            if (z.tk === 'player') { tx = z.tp.pos.x; tz = z.tp.pos.z; ty = z.tp.pos.y + 1.1; range = reachOf(z); }
            else if (z.tk === 'def') {
              if (!z.tobj || !z.tobj.alive) z.tk = 'crystal';
              else { tx = z.tobj.pos.x; tz = z.tobj.pos.z; range = reachOf(z) + (z.tobj.r || 0.4); }
            }
            const ddx = tx - z.pos.x, ddz = tz - z.pos.z, dist = Math.hypot(ddx, ddz) || 0.001;
            const ranged = z.cfg.spit && z.los && dist < z.cfg.spit.range && z.tk !== 'def' && dist > range;
            if (z.cfg.fire && !z.crawling) bossFire(z, dt, dist, tx, ty, tz);
            // a wolf with someone in sight at the right distance sinks for a moment, then springs
            const lp = z.cfg.leap;
            if (lp && z.leapWind <= 0 && z.tk === 'player' && !z.crawling && (z.leapCd -= dt) <= 0 && z.los && dist > lp.from && dist < lp.to && Math.abs(z.tp.pos.y - z.pos.y) < 2.2) {
              z.leapWind = lp.wind; z.leapCd = 0.5; if (V.audio) V.audio.play(z.cfg.cry || 'wolf_snarl', { pos: z.pos, pitch: z.cfg.cryPitch || 1 });
            }
            // a spider with someone the right way off and something tall beside it goes up that instead
            const cl = z.cfg.climb;
            if (cl && z.tk === 'player' && z.leapWind <= 0 && (z.climbCd -= dt) <= 0) { z.climbCd = 0.7; if (dist > cl.from && dist < cl.to && tryClimb(z)) continue; }
            if (z.leapWind > 0) {
              vx = damp(vx, 0, 12, dt); vz = damp(vz, 0, 12, dt); wantYaw = Math.atan2(ddx, ddz);
              if ((z.leapWind -= dt) <= 0) startLeap(z, ddx, ddz, dist);
            } else if (dist <= range || ranged) {
              vx = damp(vx, 0, 10, dt); vz = damp(vz, 0, 10, dt);
              wantYaw = Math.atan2(ddx, ddz);
              if (ranged) { z.spitT -= dt; if (z.spitT <= 0) { z.spitT = z.cfg.spit.cd * rand(0.85, 1.2); spit(z, tx, ty, tz); } }
              else if (z.cfg.burst) { if (!(z.fuse > 0)) { z.fuse = z.cfg.burst.fuse; if (V.audio) V.audio.play('fuse', { pos: z.pos }); } }      // close enough: it lights
              else { z.atkT -= dt; if (z.atkT <= 0 && z.swing <= 0) { z.swing = z.swingDur = Math.min(0.62, z.cfg.interval * 0.5); z.swingHit = false; z.atkT = z.cfg.interval * (z.crawling ? 1.25 : 1); } }
            } else {
              let ok = false;
              const sz = z.size;
              z.wantT += dt;                                  // it means to be walking: the stuck check below holds it to that
              if (z.tk === 'player') {
                const f = nav.fieldOf(z.tp.sid || 'me', sz);
                if (dist > 2.5 && f) ok = nav.dirAt(f, z.pos.x, z.pos.z, dir, sz);
                if (!ok && dist < 9) { dir.x = ddx / dist; dir.z = ddz / dist; ok = true; }
                if (!ok) ok = nav.dirAt(nav.crystal(sz), z.pos.x, z.pos.z, dir, sz);
              } else if (z.tk === 'def') { dir.x = ddx / dist; dir.z = ddz / dist; ok = true; }
              else if (dist > 4.6) {
                if (z.route < 0) z.route = nav.route(z.pos.x, z.pos.z, sz, routeLoad());
                // The field is read not where the body stands but a little to one side, the same side all the way:
                // it walks the field's line shifted over, so a column becomes a front as wide as the open ground
                // allows. The shift shrinks to nothing against walls, in doorways and at the crystal.
                const k = Math.min(1, nav.room(z.pos.x, z.pos.z, 3.5, sz) / z.oLen) * Math.min(1, (dist - 4.6) / 5);
                ok = nav.dirAt(nav.field(z.route, z.lane, sz), z.pos.x + z.ox * k, z.pos.z + z.oz * k, dir, sz) || nav.dirAt(nav.crystal(sz), z.pos.x, z.pos.z, dir, sz);
                // every way in is shut to a body this size: it goes where the small ones go, as far as it can, and breaks what stops it
                if (!ok && sz) ok = nav.dirAt(nav.field(z.route, z.lane), z.pos.x, z.pos.z, dir) || nav.dirAt(nav.crystalField, z.pos.x, z.pos.z, dir);
              }
              if (!ok) { dir.x = ddx / dist; dir.z = ddz / dist; }
              else if (z.tk !== 'def') sway(z, dist);
              // no two keep the same pace for long
              let sp = z.speed * (z.limp ? 1 - z.limp * 0.5 * (0.5 + 0.5 * Math.sin(z.phase)) : 1) * (1 + 0.12 * Math.sin(g.time.t * 0.5 + z.seed * 4));
              if (z.crawling) { const arms = usableArms(z); sp = arms ? Math.max(0.5, Math.min(1.5, z.speed * 0.4)) * (arms === 1 ? 0.7 : 1) * (0.65 + 0.35 * Math.abs(Math.sin(z.phase))) : 0.22; }
              vx = damp(vx, dir.x * sp, 7, dt); vz = damp(vz, dir.z * sp, 7, dt);
              if (vx * vx + vz * vz > 0.01) wantYaw = Math.atan2(vx, vz);
            }
            }
            if (z.swing > 0) { z.swing -= dt; if (!z.swingHit && z.swing < z.swingDur * 0.45) { z.swingHit = true; strike(z); } }
          }
          // knockback rides on top of intent
          if (z.kbx || z.kbz) { z.kbx = damp(z.kbx, 0, 6, dt); z.kbz = damp(z.kbz, 0, 6, dt); if (Math.abs(z.kbx) + Math.abs(z.kbz) < 0.08) z.kbx = z.kbz = 0; }
          z.vel.x = vx + z.kbx; z.vel.z = vz + z.kbz; z.vel.y -= 20 * dt;
          const res = g.physics.moveCapsule(z.pos, z.vel, dt, z.r, z.crawling ? 0.55 : (z.cfg.tall || 1.6) * z.scale, true);
          if (res && res.onGround) z.vel.y = 0;
          if (z.leap) {
            // the arc is its own: up and over, and down again where the ground is
            const L = z.leap, gy = g.physics.groundHeight(z.pos.x, z.pos.z, Math.max(z.pos.y, L.y0) + 1.2), y = L.y0 + L.vy * (L.t += dt) - 10 * L.t * L.t;
            z.vel.y = 0;
            if ((L.t > 0.14 && y <= gy + 0.02) || L.t > L.dur + 1.2) { z.pos.y = gy; z.leap = null; z.leapCd = z.cfg.leap.cd * rand(0.8, 1.35); z.stun = 0.3; }
            else z.pos.y = Math.max(gy, y);
          }
          z.vel.x -= z.kbx; z.vel.z -= z.kbz;
          z.speedNow = Math.hypot(z.vel.x, z.vel.z);
          z.yaw = turnToward(z.yaw, wantYaw, dt * (z.crawling ? 2.6 : 6.5));
          // stuck failsafe
          z.stuckCheck -= dt;
          if (z.stuckCheck <= 0) {
            z.stuckCheck = 2;
            // Stuck is having meant to walk and not got anywhere: its speed alone does not say so, because a body
            // pressed square against something has had that speed taken off it by the collision.
            const moved = Math.hypot(z.pos.x - z.lastX, z.pos.z - z.lastZ), meant = z.wantT > 1.5;
            z.lastX = z.pos.x; z.lastZ = z.pos.z; z.wantT = 0;
            if ((meant || z.speedNow > (z.crawling ? 0.15 : 0.4)) && moved < (z.crawling ? 0.1 : 0.3)) {
              z.stuckT += 2;
              // whatever is in the way gives before the dead do
              if (V.destruct && z.stuckT >= 2) V.destruct.smash(z.pos.x + Math.sin(z.yaw) * 0.7, z.pos.z + Math.cos(z.yaw) * 0.7, 0.9, z.mass > 2 ? 600 : 60);
              if (z.stuckT >= 16) { kill(z, { silent: true }); continue; }
              if (z.stuckT === 4) { z.route = -1; z.lane = (z.lane + 1) % LANES; if (z.tk === 'player') { z.shunT = 8; z.aggroT = 0; z.tk = 'crystal'; } }   // try another way in, and leave whoever it could not reach
              if (z.stuckT >= 6 && nav.dirAt(nav.crystal(z.size), z.pos.x, z.pos.z, dir, z.size)) { z.pos.x += dir.x * 0.9; z.pos.z += dir.z * 0.9; }
            } else z.stuckT = 0;
          }
        }
        // separation, and never standing inside the player. Bodies near each other, not yet touching, also lean
        // apart (avx, avz): that is felt in next frame's steering, and spreads a column across the width it has.
        for (let i = 0; i < list.length; i++) list[i].avx = list[i].avz = 0;
        for (let i = 0; i < list.length; i++) {
          const a = list[i]; if (a.state !== WALK || a.climb) continue;
          for (let j = i + 1; j < list.length; j++) {
            const b = list[j]; if (b.state !== WALK || b.climb) continue;
            if (a.pos.y - b.pos.y > 1.6 || b.pos.y - a.pos.y > 1.6) continue;                  // one is over the other's head
            const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, rr = a.r + b.r, room = rr + 0.85;
            if (dx > room || dx < -room || dz > room || dz < -room) continue;
            const d2 = dx * dx + dz * dz; if (d2 >= room * room) continue;
            const d = Math.sqrt(d2) || 0.01, lean = (1 - d / room) / d;
            a.avx -= dx * lean; a.avz -= dz * lean; b.avx += dx * lean; b.avz += dz * lean;
            if (d >= rr) continue;
            const push = (rr - d) / d, wa = b.mass / (a.mass + b.mass);
            a.pos.x -= dx * push * wa; a.pos.z -= dz * push * wa; b.pos.x += dx * push * (1 - wa); b.pos.z += dz * push * (1 - wa);
          }
          if (p.alive) {
            const dx = a.pos.x - px, dz = a.pos.z - pz, rr = a.r + 0.3, d2 = dx * dx + dz * dz;
            if (d2 < rr * rr && Math.abs(a.pos.y - p.pos.y) < 1.5) { const d = Math.sqrt(d2) || 0.01; a.pos.x += (dx / d) * (rr - d); a.pos.z += (dz / d) * (rr - d); }
          }
        }
        for (let i = 0; i < list.length; i++) {
          const z = list[i]; if (z.state !== WALK) continue;
          z.mesh.position.copy(z.pos); z.mesh.rotation.y = z.yaw;
          pose(z, dt, z.speedNow, 0);
          ambient(z, dt);
        }
        ragdoll.update(dt);
        updateCorpses(dt);
        updateSpits(dt);
        updateBlasts(dt);
        groan(dt, px, pz);
      }
      // Every one of them has a voice and its own time to use it: oftener close to, less often in a crowd (so
      // thirty do not drown the night), and never two in the same quarter of a second.
      function groan(dt, px, pz) {
        groanT -= dt;
        const crowd = 1 + list.length / 22;
        for (let i = 0; i < list.length; i++) {
          const z = list[i];
          if (z.state === DEAD) continue;
          z.groanT -= dt;
          if (z.groanT > 0) continue;
          const d = Math.hypot(z.pos.x - px, z.pos.z - pz);
          z.groanT = rand(3.5, 9) * crowd * (d < 14 ? 0.6 : 1);
          if (d > 48 || groanT > 0 || z.headless || !V.audio) continue;
          groanT = 0.24;
          V.audio.play(z.cfg.cry || (z.cfg.fours ? 'wolf_snarl' : z.mass > 2 ? 'growl' : z.type === 'runner' ? 'screech' : 'groan'), { pos: z.pos, gain: z.tk === 'player' ? 1 : 0.85, pitch: z.cfg.cry ? (z.cfg.cryPitch || 1) * rand(0.9, 1.1) : 1 });
        }
      }
      // On the machines that are not the host: slide each body to where the host last put it, and animate it here.
      function updateRemote(dt) {
        const now = g.time.t;
        for (let i = list.length - 1; i >= 0; i--) {
          const z = list[i];
          if (z.state === DEAD) continue;
          if (now - z.seenAt > 0.9) { kill(z, { silent: true }); continue; }          // the host no longer has it
          if (z.flinch > 0) z.flinch = Math.max(0, z.flinch - dt);
          if (z.swing > 0) z.swing -= dt;
          if (z.stun > 0) z.stun -= dt;
          z.it += dt;
          const a = Math.min(1, z.it / z.idur), x = z.x0 + (z.nx - z.x0) * a, zz = z.z0 + (z.nz - z.z0) * a;
          z.vel.set((x - z.pos.x) / dt, 0, (zz - z.pos.z) / dt);
          z.pos.x = x; z.pos.z = zz;
          if (z.cfg.fly || z.cfg.climb) { z.alt = damp(z.alt, z.nalt, 12, dt); z.pos.y = g.physics.groundHeight(x, zz, 0.6) + z.alt; z.climbShow = !z.cfg.fly && !z.leapShow && z.nalt > 0.4; z.vel.y = 0; }
          else z.pos.y = g.physics.groundHeight(x, zz, z.pos.y + 0.6);
          z.speedNow = damp(z.speedNow, Math.hypot(z.vel.x, z.vel.z), 10, dt);
          z.yaw = turnToward(z.yaw, z.nyaw, dt * 8);
          if (z.crawling && z.crawl < 1) z.crawl = Math.min(1, z.crawl + dt / 0.55);
          if (z.state === RISE) {
            z.riseT += dt;
            const k = Math.min(1, z.riseT / 1.7);
            z.mesh.position.set(z.pos.x, z.pos.y - 1.75 * z.scale * (1 - k) * (1 - k), z.pos.z); z.mesh.rotation.y = z.yaw;
            if (k >= 1) z.state = WALK;
            pose(z, dt, 0, 1 - k);
            continue;
          }
          z.mesh.position.copy(z.pos); z.mesh.rotation.y = z.yaw;
          pose(z, dt, z.speedNow, 0);
          if (z.aura > 0) z.aura -= dt;
          ambient(z, dt);
        }
      }

      // ---- ray test against the posed body: the head, the trunk, each half of each limb ----
      const E = (bone) => bone.matrixWorld.elements;
      function raycast(o, d, maxT = 300) {
        let best = maxT, bz = null, bpart = 'body';
        const ox = o.x, oy = o.y, oz = o.z, dx = d.x, dy = d.y, dz = d.z;
        for (let i = 0; i < list.length; i++) {
          const z = list[i]; if (z.state === DEAD) continue;
          if (z.beast) {
            // a body of its own: a few spheres, wherever it is and whichever way up
            const m = z.mesh.matrixWorld.elements, H = z.body.hit, s = z.scale, c0 = z.body.centre;
            const cx = m[12] + m[4] * c0 - ox, cy = m[13] + m[5] * c0 - oy, cz = m[14] + m[6] * c0 - oz, al = cx * dx + cy * dy + cz * dz, reach = z.body.reach * s;
            if (al < -reach || al > best + reach || cx * cx + cy * cy + cz * cz - al * al > reach * reach) continue;
            for (let k = 0; k < H.length; k++) {
              const q = H[k], t = raySphere(ox, oy, oz, dx, dy, dz, m[12] + m[0] * q[0] + m[4] * q[1] + m[8] * q[2], m[13] + m[1] * q[0] + m[5] * q[1] + m[9] * q[2], m[14] + m[2] * q[0] + m[6] * q[1] + m[10] * q[2], q[3] * s);
              if (t < best) { best = t; bz = z; bpart = q[4]; }
            }
            continue;
          }
          const s = z.scale, B = z.bones, h = E(B.hips);
          // nothing of it is further than this from the hips
          const cx = h[12] - ox, cy = h[13] - oy, cz = h[14] - oz, al = cx * dx + cy * dy + cz * dz, reach = 1.25 * s;
          if (al < -reach || al > best + reach) continue;
          if (cx * cx + cy * cy + cz * cz - al * al > reach * reach) continue;
          if (!z.headless) {
            const m = E(B.head), hx = m[12] + m[4] * 0.1 + m[8] * 0.02, hy = m[13] + m[5] * 0.1 + m[9] * 0.02, hz = m[14] + m[6] * 0.1 + m[10] * 0.02;
            const t = raySphere(ox, oy, oz, dx, dy, dz, hx, hy, hz, z.headR * s);
            if (t < best) { best = t; bz = z; bpart = 'weak'; }
          }
          for (let k = 0; k < z.zones.length; k++) {
            const zn = z.zones[k];
            if (zn[4] && z.limbs[zn[4]] >= zn[5]) continue;
            const a = E(B[zn[0]]), b = E(B[zn[1]]);
            let bx = b[12], by = b[13], bzz = b[14];
            if (k > 0 && zn[3].endsWith('.lo')) { bx += (bx - a[12]) * 0.35; by += (by - a[13]) * 0.35; bzz += (bzz - a[14]) * 0.35; }    // the hand, the foot
            const t = rayCapsule(ox, oy, oz, dx, dy, dz, a[12], a[13], a[14], bx, by, bzz, zn[2] * s);
            // a head shot that only grazes the neck still counts as the body; the head wins ties
            if (t < best - (bz === z && bpart === 'weak' ? 0.02 : 0)) { best = t; bz = z; bpart = zn[3]; }
          }
        }
        if (!bz) return null;
        const point = new T.Vector3(ox + dx * best, oy + dy * best, oz + dz * best);
        return { enemy: bz, dist: best, point, normal: new T.Vector3(-dx, -dy, -dz), part: bpart };
      }

      const api = {
        list, nav, root, bodies, ragdoll, motion: MO,
        spawn, raycast, update, kill, sever, decapitate,
        aliveCount: () => alive,                               // the waves' dead: the wild ones are not among them
        wildCount() { let n = 0; for (const z of list) if (z.wild && z.state !== DEAD) n++; return n; },
        wildOf(type) { let n = 0; for (const z of list) if (z.wild && z.state !== DEAD && z.type === type) n++; return n; },
        // A noise at (x, z): the wild dead within `radius` may turn toward it, the nearer the likelier.
        noise(x, z, radius) {
          for (const zb of list) {
            if (!zb.roam || zb.state !== WALK) continue;
            const d = Math.hypot(zb.pos.x - x, zb.pos.z - z);
            if (d < radius && Math.random() < 0.5 * (1 - (d / radius) * 0.7)) { zb.aggroT = Math.max(zb.aggroT, 6); zb.aggroBy = 'player'; zb.thinkT = Math.min(zb.thinkT, 0.1); }
          }
        },
        get alive() { return alive; },
        clear() {
          ragdoll.clear();
          for (const z of corpses) z.dead = null;
          corpses.length = 0;
          for (let i = list.length - 1; i >= 0; i--) retire(list[i]);
          list.length = 0; alive = 0; blasts.length = 0;
          for (const s of spits) { s.on = false; s.m.visible = false; }
        },
        alert() {},
        knockback(z, dx, dz, force, stun = 0) {
          if (z.state !== WALK) return;
          const d = Math.hypot(dx, dz) || 1, k = force / Math.sqrt(z.mass);
          z.kbx = (dx / d) * k; z.kbz = (dz / d) * k;
          if (stun > 0 && z.type !== 'boss') z.stun = Math.max(z.stun, stun);
        },
        // Every body within r of (x, z), over the ground: fn(body, distance). Given a height as well (y), the test is
        // in three dimensions, from (x, y, z) to the middle of each body: what a burst in the air needs. Without it
        // a body flying well clear of the circle is left out, so a mine is not set off by what passes overhead.
        forEachInRadius(x, z, r, fn, y) {
          for (let i = list.length - 1; i >= 0; i--) {
            const zb = list[i]; if (zb.state === DEAD) continue;
            const d = Math.hypot(zb.pos.x - x, zb.pos.z - z);
            if (y != null) { const d3 = Math.hypot(d, centreY(zb) - y); if (d3 <= r + zb.r) fn(zb, d3); continue; }
            if (d > r + zb.r) continue;
            if (zb.cfg.fly && zb.pos.y - g.physics.groundHeight(zb.pos.x, zb.pos.z, 0.6) > r + 1) continue;
            fn(zb, d);
          }
        },
        // the height of the middle of a body: where to aim at it, wherever it is
        centreY,
        // nearest standing zombie with a clear line from (x, y, z)
        nearest(x, y, z, range) {
          const cand = [];
          for (const zb of list) { if (zb.state !== WALK) continue; const d = Math.hypot(zb.pos.x - x, zb.pos.z - z); if (d <= range) cand.push([d, zb]); }
          cand.sort((a, b) => a[0] - b[0]);
          tmp.set(x, y, z);
          for (let i = 0; i < Math.min(4, cand.length); i++) { const zb = cand[i][1]; if (g.physics.lineOfSight(tmp, tmp2.set(zb.pos.x, centreY(zb), zb.pos.z))) return zb; }
          return null;
        },
        // where the living are (on the machine that thinks for the dead: everyone in the room)
        living() { const out = []; for (const t of targets) if (t.alive) out.push(t.pos); return out; },
        // A walkable point in the trees, outside the wall, from which the crystal can be reached: within `spread`
        // radians of `angle` as seen from the church (PI: anywhere round the ring), and no nearer than minDist
        // to anyone in `avoid` (a position or a list of them).
        spawnPoint(angle, near, far, avoid, minDist, spread = 0.45, type) {
          const who = !avoid ? [] : Array.isArray(avoid) ? avoid : [avoid], wall = (V.YARD || 0) + 3;
          const size = V.zombieSize(type), blk = nav.blockedOf(size), reach = nav.crystal(size);      // somewhere a body that size can stand and set out from
          for (let i = 0; i < 20; i++) {
            const a = angle + rand(-spread, spread), r = rand(near, far), x = Math.cos(a) * r, z = Math.sin(a) * r, k = nav.idx(x, z);
            if (k < 0 || blk[k] || reach[k] === Infinity || Math.max(Math.abs(x), Math.abs(z)) < wall) continue;
            if (who.some((q) => Math.hypot(x - q.x, z - q.z) < minDist)) continue;
            return { x, z };
          }
          return null;
        },
        // Open ground something can claw its way up through: anywhere between rMin and rMax of the crystal that
        // is outside the church, clear of obstacles, able to reach the crystal and not under anyone's feet.
        openGround(rMin, rMax, avoid, minDist) {
          const who = !avoid ? [] : Array.isArray(avoid) ? avoid : [avoid], CH = V.CH || { hw: 0, hd: 0 };
          for (let i = 0; i < 20; i++) {
            const a = rand(0, TAU), r = rand(rMin, rMax), x = Math.cos(a) * r, z = Math.sin(a) * r, k = nav.idx(x, z);
            if (k < 0 || nav.blocked[k] || nav.near[k] === 1 || nav.near[k] === 2 || nav.crystalField[k] === Infinity) continue;
            if (Math.abs(x) < CH.hw + 2 && Math.abs(z) < CH.hd + 2.5) continue;
            if (who.some((q) => Math.hypot(x - q.x, z - q.z) < minDist)) continue;
            return { x, z };
          }
          return null;
        },
        // a blast: bodies already down are thrown again
        blast(x, y, z, radius, force) { ragdoll.blast(x, y, z, radius, force); },

        // ---- playing together ----
        get remote() { return remote; },
        // true: this machine only shows the dead. false: it thinks for them, starting from what it was last shown.
        setRemote(v) {
          if (remote === !!v) return;
          remote = !!v; lastSeq = -1;
          for (const z of list) { if (z.state === DEAD) continue; if (z.state === EMERGE) { z.state = WALK; z.em = null; } z.route = -1; z.seenAt = g.time.t; z.thinkT = 0; z.tk = 'crystal'; z.tp = null; z.kbx = z.kbz = 0; z.vel.set(0, 0, 0); z.x0 = z.nx = z.pos.x; z.z0 = z.nz = z.pos.z; z.nyaw = z.yaw; }
        },
        byNid(nid) { return nids.get(nid) || null; },
        // every zombie on its feet, fourteen characters each
        snapshot() {
          let s = 'Z' + e64((snapSeq = (snapSeq + 1) & 4095), 2);
          for (const z of list) {
            if (z.state === DEAD) continue;
            const L = z.limbs, tk = z.tk === 'player' ? 1 : z.tk === 'def' ? 2 : 0;
            const high = z.cfg.fly || z.climb || z.leap ? Math.max(0, z.pos.y - g.physics.groundHeight(z.pos.x, z.pos.z, 0.6)) : 0;
            s += e64(z.nid, 2) + e64((z.beast ? 0 : KIND_LIST.indexOf(z.kind)) | (z.state === RISE ? 8 : 0) | (z.crawling ? 16 : 0) | (z.stun > 0 ? 32 : 0), 1)
              + e64(qPos(z.pos.x), 2) + e64(qPos(z.pos.z), 2) + e64(Math.round((((z.yaw % TAU) + TAU) % TAU) / TAU * 64) & 63, 1)
              + e64(L.armL | (L.armR << 2) | (L.legL << 4) | (L.legR << 6) | (z.swing > 0 ? 256 : 0) | (tk << 9), 2)
              + e64(q63((z.scale - 0.8) / 1.6), 1) + e64(q63(z.hp / z.maxHp), 1)
              + e64(TYPE_LIST.indexOf(z.type) | (z.aura > 0 ? 16 : 0) | (z.leap ? 32 : 0), 1)      // what it is (a body may be borrowed), wreathed in fire, in the air
              + e64(q63(high / ALT), 1);                                                                 // how high above the floor
          }
          return s;
        },
        applySnapshot(s) {
          if (!remote || typeof s !== 'string' || s[0] !== 'Z') return;
          const seq = d64(s, 1, 2); if (seq === lastSeq) return; lastSeq = seq;
          const now = g.time.t, gap = Math.min(0.4, Math.max(0.06, now - lastSnapT)); lastSnapT = now;
          for (let i = 3; i + REC <= s.length; i += REC) {
            const nid = d64(s, i, 2), kf = d64(s, i + 2, 1), x = uPos(d64(s, i + 3, 2)), zz = uPos(d64(s, i + 5, 2)), yaw = (d64(s, i + 7, 1) / 64) * TAU, lf = d64(s, i + 8, 2);
            const tf = d64(s, i + 12, 1), type = TYPE_LIST[tf & 15], kind = type && CFG[type].beast ? type : KIND_LIST[kf & 7]; if (!kind || !type) continue;
            let z = nids.get(nid);
            if (z && (z.kind !== kind || z.type !== type)) { kill(z, { silent: true }); z = null; }
            if (!z) { z = spawn(type, { x, z: zz }, { kind, nid, scale: 0.8 + (d64(s, i + 10, 1) / 63) * 1.6, rise: !!(kf & 8) }); if (!z) continue; z.yaw = yaw; }
            z.seenAt = now; z.nyaw = yaw; z.hp = (d64(s, i + 11, 1) / 63) * z.maxHp;
            if (Math.hypot(x - z.pos.x, zz - z.pos.z) > 4) { z.pos.x = x; z.pos.z = zz; }           // too far to slide: jump
            z.x0 = z.pos.x; z.z0 = z.pos.z; z.nx = x; z.nz = zz; z.it = 0; z.idur = gap * 1.15;
            if (kf & 32) z.stun = Math.max(z.stun, 0.25);
            z.aura = tf & 16 ? Math.max(z.aura, 0.5) : 0; z.leapShow = !!(tf & 32); z.nalt = (d64(s, i + 13, 1) / 63) * ALT;
            if ((lf & 256) && z.swing <= 0) { z.swing = z.swingDur = 0.5; z.swingHit = true; }
            const tk = (lf >> 9) & 3; z.tk = tk === 1 ? 'player' : tk === 2 ? 'def' : 'crystal';
            for (let k = 0; k < 4; k++) { const lv = (lf >> (k * 2)) & 3; if (lv > z.limbs[LIMB_KEYS[k]]) sever(z, LIMB_KEYS[k], lv, null); }
            if ((kf & 16) && !z.crawling) z.crawling = true;
          }
        },
        // the host's word that one has died, and how
        netKill(d, mine) {
          const z = nids.get(d.i); if (!z || z.state === DEAD) return;
          const v3 = (a) => (a ? new T.Vector3(a[0], a[1], a[2]) : null);
          kill(z, { head: !!d.h, dir: v3(d.dr), point: v3(d.pt), power: d.pw, blast: d.bl ? { x: d.bl[0], y: d.bl[1], z: d.bl[2], force: d.bl[3] } : null, by: mine, owner: d.ow || null });
        },
        spitVisual(a) { launch(a[0], a[1], a[2], a[3], a[4], a[5], 0, 0, true, a[6]); },
        fxVisual,
        types: TYPE_LIST,
        // One of each kind, and one loose limb, wait under the floor until play starts: the renderer compiles the
        // shaders of what is in the scene while the level loads, so the first of the dead costs no hitch.
        prewarm() {
          for (const kind in bodies) {
            const z = spawn(typeOf[kind], { x: 0, z: -200 }, { kind }); if (!z) continue;
            list.splice(list.indexOf(z), 1); z.alive = false; z.state = DEAD;
            z.mesh.position.set(0.6, -3.2, 22); z.mesh.frustumCulled = false; parked.push(z);
          }
          // and one of each kind that borrows a body: its tint is the same shader, but what is bolted on is not
          // and one of each body that is not a person: plain material, but its geometry and what glows on it are its own
          for (const type of TYPE_LIST) {
            if (!CFG[type].body && !CFG[type].beast) continue;
            const z = spawn(type, { x: 0, z: -200 }, { packed: true }); if (!z) continue;
            list.splice(list.indexOf(z), 1); z.alive = false; z.state = DEAD;
            z.mesh.position.set(0.6, -3.2, 22); z.mesh.frustumCulled = false; parked.push(z);
            if (z.beast) z.mesh.traverse((m) => { m.frustumCulled = false; });
          }
          alive = 0;
          const e = gibOf('walkerA', F.LIMBS.armL.lowerBones, 'faL'), m = new T.Mesh(e.geo, bodies.walkerA.mat);
          m.position.set(0.6, -3, 22); m.frustumCulled = false; root.add(m); parked.push({ loose: m });
        },
      };
      return api;
    },
  };
})();
