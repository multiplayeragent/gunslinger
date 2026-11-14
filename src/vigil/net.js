/* Playing together, through Multiplayer Agent (multiplayeragent.com).
   A room holds one squad. Each machine writes only its own player (where it stands, how it is, who it is).
   One machine, the host, runs the game for the room: it thinks for the dead, counts the waves, keeps the crystal,
   and publishes all of that as a few packed strings of room state; the others show what it publishes and send it
   what they do (hits, blasts, requests) as events. If the host leaves or falls silent, the next machine takes
   over from what it was last shown. With no key in mp.config.js, or the SDK unreachable, none of this runs and
   the game is the single-player one. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const cfg = () => window.MP_CONFIG || {};
  const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
  const NAME_KEY = 'gunslinger.name', CODE_KEY = 'gunslinger.room', PREFIX = 'gs-', MAX_SQUAD = 4;
  const TINTS = [[1, 1, 1], [1.16, 1.0, 0.82], [0.84, 1.0, 1.18], [1.1, 0.88, 1.1]];
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* private mode */ } return null; };
  const clean = (s, n) => String(s == null ? '' : s).replace(/[^\w \-.']/g, '').trim().slice(0, n);

  let g = null, T = null, mp = null, player = null, state = null, root = null;
  let hbSeen = null, hbAt = 0, claimAt = -9, hb = 0, lastZ = null, lastG = null, lastDf = null, lastOb = null, obT = 0;
  let tZ = 0, tG = 0, tHb = 0, tDf = 0, tMe = 0, tElect = 0, tHud = 0, tLobby = 0, sentZ = '', sentG = '', sentDf = '', sentOb = '', sentMe = '', lastShot = 0;
  let hits = [], shots = [], hud = null, banner = null, joinSeq = 0, decided = true, enterAt = 0, zAt = 0, joinedAt = 0;
  const listeners = [];
  const v3 = (a) => (a ? new T.Vector3(a[0], a[1], a[2]) : null);
  const arr = (v) => (v ? [r2(v.x), r2(v.y), r2(v.z)] : null);
  const now = () => (g ? g.time.t : 0);
  const notify = () => { for (const f of listeners) { try { f(); } catch (e) { /* a listener's problem */ } } };

  const net = (V.net = {
    online: false,          // in a room and in the fight
    host: false,            // this machine runs the game for the room
    away: false,            // in the fight but not at the controls (paused, armory, the defeat card)
    id: null, room: null, code: null, status: 'off', error: '',
    players: new Map(),     // everyone else in the room, by session id

    available() { return !!(window.MP && cfg().key && !/REPLACE_ME/.test(cfg().key)); },
    joined() { return !!mp; },
    name(set) {
      if (set !== undefined) { const n = clean(set, 16); if (n) { store(NAME_KEY, n); sentMe = ''; notify(); } return n; }
      let n = clean(store(NAME_KEY), 16);
      if (!n) { n = 'Warden ' + (100 + Math.floor(Math.random() * 900)); store(NAME_KEY, n); }
      return n;
    },
    // the room an invite link names, or the one this browser used last, or the open one
    defaultCode() {
      let c = null;
      try { c = new URLSearchParams(location.search).get('room'); } catch (e) { /* no address */ }
      return clean(c || store(CODE_KEY) || 'OPEN', 12).toUpperCase() || 'OPEN';
    },
    newCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)]; return c; },
    link() { try { const u = new URL(location.href); u.search = ''; u.searchParams.set('map', 'vigil'); u.searchParams.set('room', net.code || net.defaultCode()); return u.toString(); } catch (e) { return ''; } },
    onChange(fn) { listeners.push(fn); },
    count() { let n = net.online ? 1 : 0; for (const r of net.players.values()) if (r.in) n++; return n; },
    roster() {
      const out = [{ me: true, name: net.name(), cls: V.director ? V.director.classId() : '', in: net.online, host: net.host }];
      for (const r of net.players.values()) out.push({ name: r.name, cls: r.cls, in: !!r.in, host: state && state.shared && state.shared.host === r.sid, hp: r.hp, down: !!(r.flags & 8), away: !!(r.flags & 16) });
      return out;
    },

    init(game) {
      g = game; T = g.THREE;
      root = new T.Group(); root.name = 'vigil-squad'; g.scene.add(root);
      const ui = document.getElementById('ui') || document.body;
      hud = document.createElement('div'); hud.className = 'vg-squad'; hud.hidden = true; ui.appendChild(hud);
      banner = document.createElement('div'); banner.className = 'vg-netbanner'; banner.hidden = true; ui.appendChild(banner);
      g.events.on('game:state', ({ state: st }) => { if (st === 'title') net.exit(); });
      window.addEventListener('pagehide', () => { try { if (mp) mp.leave(); } catch (e) { /* closing anyway */ } });
    },
    // the durable player behind this browser: needed for the leaderboard, and passed to the room
    async identity() {
      if (player || !net.available()) return player;
      try { const p = window.MP.auth({ key: cfg().key, apiUrl: cfg().apiUrl }); await p.getPlayer(); player = p; } catch (e) { console.warn('[net] no player identity: ' + (e && e.message)); }
      return player;
    },

    // ---------------------------------------------------------------- the room
    async join(code) {
      if (!net.available()) { net.status = 'off'; notify(); return false; }
      code = clean(code, 12).toUpperCase() || 'OPEN';
      if (mp && net.code === code && net.status !== 'error') return true;
      const seq = ++joinSeq;
      await net.leave(true);
      net.status = 'connecting'; net.code = code; net.room = PREFIX + code.toLowerCase(); net.error = ''; notify();
      try {
        const who = await net.identity();
        // a join can miss its window while the page is still busy loading: try again a couple of times
        let room = null, last = null;
        for (let attempt = 0; attempt < 4 && !room && seq === joinSeq; attempt++) {
          if (attempt) await new Promise((r) => setTimeout(r, 900 * attempt));
          try { room = await window.MP.join({ key: cfg().key, room: net.room, endpoint: cfg().endpoint, apiUrl: cfg().apiUrl, player: who || undefined }); } catch (e) { last = e; }
        }
        if (!room) throw last || new Error('could not join');
        if (seq !== joinSeq) { try { room.leave(); } catch (e) { /* superseded */ } return false; }
        mp = room; net.id = mp.sessionId; state = null; hbAt = joinedAt = now(); hbSeen = null;
        store(CODE_KEY, code);
        mp.onState((s) => { state = s; });
        mp.onDisconnect(() => { banner.textContent = 'Reconnecting…'; banner.hidden = false; });
        mp.onReconnect(() => { banner.hidden = true; });
        wire();
        sentMe = ''; lobbyTick(true);
        net.status = 'lobby'; notify();
        // joined after the run had already begun on this machine: step into the room's game now
        const st = g && g.game.state;
        if (st === 'playing' || st === 'paused' || st === 'intro') net.enter();
        return true;
      } catch (e) {
        if (seq !== joinSeq) return false;
        net.status = 'error'; net.error = String((e && e.message) || e).slice(0, 120); mp = null; notify();
        console.warn('[net] could not join ' + net.room + ': ' + net.error);
        return false;
      }
    },
    async leave(quiet) {
      if (net.online) net.exit();
      const old = mp; mp = null; state = null;
      for (const r of net.players.values()) dropAvatar(r);
      net.players.clear(); net.id = null; net.host = false;
      if (old) { try { await old.leave(); } catch (e) { /* already gone */ } }
      if (!quiet) { net.status = 'off'; net.code = null; notify(); }
    },
    // the run starts on this machine: take a place in the fight, as host if nobody is hosting
    enter() {
      if (!mp || net.online) return;
      if (net.count() >= MAX_SQUAD) { if (V.ui) V.ui.toast('That squad is full: playing alone'); return; }
      net.online = true; net.away = false; net.status = 'playing';
      lastZ = lastG = lastDf = lastOb = null; sentMe = ''; hits.length = 0;
      // until the room's state has been seen nobody can tell whether it has a host: wait for it as a guest
      follow(); decided = false; enterAt = now();
      decide();
      hud.hidden = false;
      try { mp.track('match.start', { players: net.count(), host: net.host }); } catch (e) { /* analytics are optional */ }
      notify();
    },
    exit() {
      if (!net.online) return;
      net.online = false; net.away = false; net.status = mp ? 'lobby' : 'off';
      if (net.host) { net.host = false; try { mp.setShared('host', ''); } catch (e) { /* gone */ } }
      for (const r of net.players.values()) dropAvatar(r);
      if (g.enemies.setRemote) { g.enemies.setRemote(false); g.enemies.clear(); }
      if (V.defenses && V.defenses.setRemote) V.defenses.setRemote(false);
      hud.hidden = true; sentMe = ''; lobbyTick(true);
      notify();
    },

    // ---------------------------------------------------------------- what the game tells the room
    emit(type, data) { if (!mp || !net.online) return; try { mp.send(type, data); } catch (e) { /* never break the frame */ } },
    request(op, data) { if (net.host) { V.director.hostRequest(op, data, net.id); return; } net.emit('rq', { op, d: data }); },
    // a hit on one of the dead, from a machine that is not the host
    hit(nid, amount, part, point, dir, info) { hits.push([nid, Math.round(amount * 10) / 10, part || 'body', arr(point), dir ? [r3(dir.x), r3(dir.y), r3(dir.z)] : null, info && info.power ? r2(info.power) : 0]); },
    // the host's word that one is dead
    killed(z, info) {
      const by = info.by === 'defense' ? 'd' : !info.by || info.by === 'player' ? net.id : info.by;
      const b = info.blast;
      net.emit('zk', { i: z.nid, h: info.head ? 1 : 0, dr: info.dir ? [r3(info.dir.x), r3(info.dir.y), r3(info.dir.z)] : null, pt: arr(info.point), pw: info.power ? r2(info.power) : 0,
        bl: b ? [r2(b.x), r2(b.y), r2(b.z), r2(b.force)] : null, by, ow: info.by === 'defense' ? info.owner || net.id : null });
    },
    playerHit(sid, dmg, pos, shove) { net.emit('ph', { to: sid, d: r2(dmg), x: r2(pos.x), y: r2(pos.y), z: r2(pos.z), kb: shove || 0 }); },
    // this player fired: the others hear it and see the tracer
    shot(o, d) { const t = performance.now(); if (t - lastShot < 55) return; lastShot = t; net.emit('sh', [r2(o.x), r2(o.y), r2(o.z), r3(d.x), r3(d.y), r3(d.z)]); },
    // a guard or turret fired on the host: gathered and sent a few times a second
    defenseShot(from, to, turret) { if (net.host && shots.length < 24) shots.push([r2(from.x), r2(from.y), r2(from.z), r2(to.x), r2(to.y), r2(to.z), turret ? 1 : 0]); },
    targets() { return live; },

    // ---------------------------------------------------------------- scores
    async submit(wave, kills) {
      const who = await net.identity(); if (!who || !(wave > 0)) return null;
      try {
        const res = await who.leaderboard('vigil-waves').submit(wave);
        who.leaderboard('vigil-kills').submit(kills || 0).catch(() => {});
        try { if (mp) mp.track('match.end', { wave, kills, players: net.count() }); } catch (e) { /* optional */ }
        return res;
      } catch (e) { return null; }
    },
    async top(n) {
      const who = await net.identity(); if (!who) return null;
      try { const b = who.leaderboard('vigil-waves'), [t, mine] = await Promise.all([b.top(n || 5), b.myRank()]); return { entries: t.entries || [], total: t.total || 0, mine }; } catch (e) { return null; }
    },

    // ---------------------------------------------------------------- every frame
    update(dt) {
      if (!mp || !g) return;
      const t = now(), st = g.game.state, D = V.director;
      people(dt, t);
      const sh = (state && state.shared) || {};
      if (sh.hb !== hbSeen) { hbSeen = sh.hb; hbAt = t; }
      if (!net.online) { tLobby -= dt; if (tLobby <= 0) lobbyTick(false); return; }
      if (!decided) decide();
      net.away = st !== 'playing';
      // the world does not stop for one player's menu: keep it running while this machine is paused or on a card
      if (st === 'paused' || st === 'dead' || st === 'complete') {
        try {
          if (st === 'paused') { g.enemies.update(dt); g.level.update(dt); if (g.fx.update) g.fx.update(dt); }
          if (D && D.tick) D.tick(dt);
        } catch (e) { if (!net.tickErr) { net.tickErr = 1; console.error('[net] background tick threw: ' + ((e && e.stack) || e)); } }
      }
      tElect -= dt;
      if (tElect <= 0 && decided) { tElect = 0.5; elect(sh, t); }
      if (net.host) publish(dt, t); else pull();
      // hits gathered this frame go to the host together
      if (hits.length) { let part = []; for (const h of hits) { part.push(h); if (JSON.stringify(part).length > 1500) { net.emit('ht', part); part = []; } } if (part.length) net.emit('ht', part); hits.length = 0; }
      tMe -= dt;
      if (tMe <= 0) { tMe = 1 / 12; tellSelf(st); }
      tHud -= dt;
      if (tHud <= 0) { tHud = 0.3; drawHud(sh); }
    },
  });

  // ------------------------------------------------------------------ who is hosting
  function hostValid() {
    const h = state && state.shared && state.shared.host;
    if (!h) return false;
    if (h === net.id) return net.host;
    const r = net.players.get(h);
    return !!(r && r.in && now() - hbAt < 3.5);
  }
  // settle, once, whether this machine joins a running game or starts one
  function decide() {
    const sh = (state && state.shared) || {};
    let others = false; for (const r of net.players.values()) if (r.in) others = true;
    // someone is already fighting but the room has not yet said who hosts: wait for it rather than take the game from them
    if (now() - joinedAt < 1.2) return;                           // the room's state arrives in pieces: let it settle first
    if (!sh.host && others && now() - enterAt < 3) return;
    decided = true;
    if (hostValid() || others) { pull(); V.director.guestStart(); } else claim(false);        // with others and no host, the election below settles it
  }
  function claim(migrate) {
    net.host = true; claimAt = now();
    try { mp.setShared('host', net.id); } catch (e) { /* retried by elect */ }
    if (g.enemies.setRemote) g.enemies.setRemote(false);
    if (V.defenses && V.defenses.setRemote) V.defenses.setRemote(false);
    sentZ = sentG = sentDf = sentOb = ''; tZ = tG = tDf = 0;
    // taking over a game in progress carries on from what was last shown; starting one sets everything up
    if (migrate) V.director.adopt(); else V.director.hostStart();
    notify();
  }
  function follow() {
    net.host = false;
    if (g.enemies.setRemote) g.enemies.setRemote(true);
    if (V.defenses && V.defenses.setRemote) V.defenses.setRemote(true);
    lastZ = lastG = lastDf = lastOb = null;
    notify();
  }
  function elect(sh, t) {
    if (net.host) {
      // someone else holds the room and is alive: stand down. Nobody does: say again that it is us.
      if (sh.host && sh.host !== net.id && t - claimAt > 1.2 && hostValid()) follow();
      else if (sh.host !== net.id && t - claimAt > 1.2) { claimAt = t; try { mp.setShared('host', net.id); } catch (e) { /* next time */ } }
      return;
    }
    if (hostValid()) return;
    // the host has gone or fallen silent: the first of those still fighting, by id, takes over
    const ids = [net.id]; for (const r of net.players.values()) if (r.in && r.sid !== sh.host) ids.push(r.sid);
    ids.sort();
    if (ids[0] === net.id) { claim(true); if (V.ui) V.ui.toast('You are now hosting the squad'); }
  }

  // ------------------------------------------------------------------ host: publish the game
  function publish(dt, t) {
    const D = V.director, Z = g.enemies;
    tZ -= dt; tG -= dt; tHb -= dt; tDf -= dt;
    if (tZ <= 0) { tZ = 0.1; const s = Z.snapshot(); if (s.slice(3) !== sentZ || t - zAt > 0.35) { sentZ = s.slice(3); zAt = t; mp.setShared('z', s); } }
    if (tG <= 0) { tG = 0.25; const s = D.netState(); if (s !== sentG) { sentG = s; mp.setShared('g', s); } }
    if (tHb <= 0) { tHb = 1; mp.setShared('hb', 'h' + (++hb)); }
    if (tDf <= 0) {
      tDf = 0.5;
      const s = V.defenses.netList(); if (s !== sentDf) { sentDf = s; mp.setShared('df', s); }
      const o = V.destruct ? V.destruct.netList() : 'O'; if (o !== sentOb) { sentOb = o; mp.setShared('ob', o); }
    }
    if (shots.length) { net.emit('ds', shots); shots = []; }
  }
  // everyone else: take what the host published
  function pull() {
    const sh = (state && state.shared) || {};
    if (net.host) return;
    if (sh.z && sh.z !== lastZ) { lastZ = sh.z; g.enemies.applySnapshot(sh.z); }
    if (sh.g && sh.g !== lastG) { lastG = sh.g; V.director.netApply(sh.g); }
    if (sh.df && sh.df !== lastDf) { lastDf = sh.df; V.defenses.netApply(sh.df); }
    // broken things arrive as events while playing; the list is for whoever joins late or missed one, a moment later
    if (sh.ob && sh.ob !== lastOb) { if (lastOb === null) { lastOb = sh.ob; if (V.destruct) V.destruct.netSync(sh.ob); } else if (obT <= 0) obT = 0.8; }
    if (obT > 0) { obT -= 1 / 60; if (obT <= 0) { lastOb = sh.ob; if (V.destruct) V.destruct.netSync(sh.ob); } }
  }

  // ------------------------------------------------------------------ this player, to the room
  function tellSelf(st) {
    const p = g.player, S = V.director.S;
    const flags = (p.crouching ? 1 : 0) | (p.sprinting ? 2 : 0) | (S.down || !p.alive ? 8 : 0) | (net.away ? 16 : 0) | (S.torch ? 32 : 0);
    const o = { n: net.name(), c: V.director.classId(), in: 1, x: r2(p.pos.x), y: r2(p.pos.y), z: r2(p.pos.z), yw: r2(p.yaw), pt: r2(p.pitch), f: flags, hp: Math.max(0, Math.round((p.health / (p.maxHealth || 100)) * 100)), k: S.kills || 0 };
    const s = JSON.stringify(o);
    if (s !== sentMe) { sentMe = s; try { mp.me.set(o); } catch (e) { /* next time */ } }
  }
  function lobbyTick(force) {
    tLobby = 1;
    if (!mp) return;
    const o = { n: net.name(), c: V.director ? V.director.classId() : 'soldier', in: 0 }, s = JSON.stringify(o);
    if (force || s !== sentMe) { sentMe = s; try { mp.me.set(o); } catch (e) { /* next time */ } }
    notify();
  }

  // ------------------------------------------------------------------ the others
  let live = [], frame = 0;
  function people(dt, t) {
    const ents = (state && state.entities && state.entities.players) || {};
    frame++;
    let changed = false, slot = 0;
    for (const sid in ents) {
      if (sid === net.id) continue;
      const e = ents[sid]; let r = net.players.get(sid);
      if (!r) {
        r = { sid, name: 'Warden', cls: 'soldier', in: 0, hp: 100, flags: 0, kills: 0, pos: new T.Vector3(e.x || 0, e.y || 0, e.z || 0), yaw: 0, pitch: 0, speed: 0, phase: 0,
          x0: 0, y0: 0, z0: 0, nx: e.x || 0, ny: e.y || 0, nz: e.z || 0, nyaw: e.yw || 0, it: 1, idur: 0.1, at: t, av: null, slot: 0, flash: 0,
          get alive() { return !!this.in && this.hp > 0 && !(this.flags & 24); } };
        net.players.set(sid, r); changed = true;
      }
      r.seen = frame; r.slot = ++slot;
      const name = clean(e.n, 16) || 'Warden', inn = e.in ? 1 : 0;
      if (name !== r.name || inn !== r.in || e.c !== r.cls) {
        if (inn && !r.in && net.online && V.ui) V.ui.toast(name + ' joined the fight');
        if (name !== r.name && r.av) { dropAvatar(r); }
        r.name = name; r.in = inn; r.cls = e.c || 'soldier'; changed = true;
      }
      r.hp = e.hp == null ? 100 : +e.hp; r.flags = e.f | 0; r.kills = e.k | 0; r.pitch = +e.pt || 0;
      if (e.x !== r.nx || e.y !== r.ny || e.z !== r.nz || e.yw !== r.nyaw) {
        const far = Math.hypot((e.x || 0) - r.pos.x, (e.z || 0) - r.pos.z) > 6;
        r.x0 = far ? e.x : r.pos.x; r.y0 = far ? e.y : r.pos.y; r.z0 = far ? e.z : r.pos.z;
        r.nx = e.x || 0; r.ny = e.y || 0; r.nz = e.z || 0; r.nyaw = e.yw || 0;
        r.idur = Math.max(0.06, Math.min(0.3, (t - r.at) * 1.15)); r.at = t; r.it = 0;
      }
    }
    for (const [sid, r] of net.players) if (r.seen !== frame) { if (r.in && net.online && V.ui) V.ui.toast(r.name + ' left'); dropAvatar(r); net.players.delete(sid); changed = true; }
    live = [];
    for (const r of net.players.values()) {
      r.it += dt;
      const a = Math.min(1, r.it / r.idur), x = r.x0 + (r.nx - r.x0) * a, y = r.y0 + (r.ny - r.y0) * a, z = r.z0 + (r.nz - r.z0) * a;
      r.speed += (Math.hypot(x - r.pos.x, z - r.pos.z) / Math.max(dt, 1e-3) - r.speed) * Math.min(1, dt * 10);
      r.pos.set(x, y, z);
      let d = ((r.nyaw - r.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; r.yaw += d * Math.min(1, dt * 14);
      if (net.online && r.in) { live.push(r); pose(r, dt); } else if (r.av) r.av.mesh.visible = false;
    }
    if (changed) notify();
  }
  // another player's body: the watchman's, with a rifle and a name over it
  function avatar(r) {
    const bag = V.defenses && V.defenses.kitbag; if (!bag) return null;
    const mat = bag.guardMat.clone(), tint = TINTS[(r.slot - 1) % TINTS.length]; mat.color.setRGB(2.3 * tint[0], 2.3 * tint[1], 2.3 * tint[2]);
    const { mesh, bones } = V.figure.rig(T, bag.guardGeo, mat), B = {}; for (const k in V.figure.BI) B[k] = bones[V.figure.BI[k]];
    const rifle = bag.rifle(); rifle.position.set(-0.11, 0.1, 0.36); B.chest.add(rifle);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const c = cv.getContext('2d');
    if (c && c.fillText) {
      c.font = '600 30px "IBM Plex Mono", ui-monospace, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(8,10,12,0.55)'; const w = Math.min(248, c.measureText(r.name).width + 28); c.fillRect(128 - w / 2, 12, w, 40);
      c.fillStyle = '#9fd8ff'; c.fillText(r.name, 128, 33);
    }
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
    const tag = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    tag.scale.set(1.0, 0.25, 1); tag.position.set(0, 2.12, 0); mesh.add(tag);
    root.add(mesh);
    return { mesh, bones: B, tag, mat, tex };
  }
  function dropAvatar(r) { if (!r.av) return; root.remove(r.av.mesh); r.av.mat.dispose(); r.av.tex.dispose(); r.av.tag.material.dispose(); r.av = null; }
  function pose(r, dt) {
    if (!r.av) { r.av = avatar(r); if (!r.av) return; }
    const b = r.av.bones, crouch = r.flags & 1, down = r.flags & 8, sp = r.speed, wb = Math.min(1, sp / 1.2), amp = r.flags & 2 ? 0.8 : 0.55;
    r.phase += dt * sp * 4.2;
    const s = Math.sin(r.phase), c = Math.cos(r.phase), pt = Math.max(-1.2, Math.min(1.2, r.pitch));
    r.av.mesh.visible = true; r.av.mesh.position.copy(r.pos); r.av.mesh.rotation.y = r.yaw + Math.PI;
    if (down) {
      // on the ground until they are back up
      b.hips.rotation.set(-1.45, 0, 0.15); b.hips.position.set(0, 0.2, 0);
      b.spine.rotation.set(0, 0, 0); b.chest.rotation.set(0, 0, 0); b.head.rotation.set(0.2, 0.4, 0);
      b.uaL.rotation.set(-0.3, 0, 0.7); b.uaR.rotation.set(-0.5, 0, -0.6); b.faL.rotation.set(-0.3, 0, 0); b.faR.rotation.set(-0.5, 0, 0);
      b.thL.rotation.set(0.1, 0, 0.12); b.thR.rotation.set(-0.15, 0, -0.1); b.shL.rotation.x = 0.2; b.shR.rotation.x = 0.5;
      return;
    }
    b.hips.rotation.set(0, 0, 0); b.hips.position.set(0, 0.96 - (crouch ? 0.36 : 0) + Math.abs(s) * 0.025 * wb, 0);
    b.thL.rotation.set(-s * amp * wb - (crouch ? 1.15 : 0.05), 0, 0.07); b.thR.rotation.set(s * amp * wb - (crouch ? 0.35 : -0.06), 0, -0.07);
    b.shL.rotation.x = Math.max(0, c) * 0.9 * wb + (crouch ? 1.55 : 0.08); b.shR.rotation.x = Math.max(0, -c) * 0.9 * wb + (crouch ? 1.9 : 0.08);
    b.ftL.rotation.x = crouch ? -0.3 : 0; b.ftR.rotation.x = crouch ? 0.6 : 0;
    // rifle at the shoulder, the whole upper body following where they aim
    b.spine.rotation.set(0.06 - pt * 0.4, 0, 0); b.chest.rotation.set(-pt * 0.3 - r.flash * 0.05, -0.22, 0); b.head.rotation.set(-pt * 0.2, 0.2, 0);
    b.uaR.rotation.set(-1.12, 0, 0.32); b.faR.rotation.set(-1.25, 0, 0.5); b.uaL.rotation.set(-1.35, 0, -0.42); b.faL.rotation.set(-0.5, 0, 0);
    if (r.flash > 0) r.flash = Math.max(0, r.flash - dt * 12);
  }

  // ------------------------------------------------------------------ what the room tells this machine
  function wire() {
    const on = (type, fn) => mp.on(type, (d, from) => { if (!net.online) return; try { fn(d, from); } catch (e) { console.error('[net] ' + type + ' handler threw: ' + ((e && e.stack) || e)); } });
    const Z = () => g.enemies, D = () => V.director;
    on('ht', (list, from) => { if (!net.host || !Array.isArray(list)) return; for (const h of list) { const z = Z().byNid(h[0]); if (z && z.alive) z.damage(+h[1] || 0, v3(h[3]), v3(h[4]), h[2], { by: from, power: h[5] || undefined }); } });
    on('zk', (d) => { if (net.host || !d) return; Z().netKill(d, d.by === net.id ? 'player' : d.by === 'd' && d.ow === net.id ? 'defense' : 'remote'); });
    on('ph', (d) => { if (d && d.to === net.id) D().netHurt(d); });
    on('sp', (a) => { if (!net.host && Array.isArray(a)) Z().spitVisual(a); });
    on('sh', (a, from) => {
      if (!Array.isArray(a)) return;
      const o = new T.Vector3(a[0], a[1], a[2]), d = new T.Vector3(a[3], a[4], a[5]).normalize();
      const wall = g.physics.raycast(o, d, 300), far = wall ? wall.dist : 300, zh = Z().raycast(o, d, far), end = zh ? zh.point : wall ? wall.point : o.clone().addScaledVector(d, 120);
      try { if (g.fx.tracer) g.fx.tracer(o, end); if (g.render.lightPool) g.render.lightPool.flash(o, 0xffc070, 26, 8, 0.05); } catch (e) { /* optional */ }
      V.audio.play('vg_shot', { pos: o, gain: 0.8 });
      const r = net.players.get(from); if (r) r.flash = 1;
    });
    on('ds', (list) => { if (net.host || !Array.isArray(list)) return; for (const a of list) { const f = new T.Vector3(a[0], a[1], a[2]); try { if (g.fx.tracer) g.fx.tracer(f, new T.Vector3(a[3], a[4], a[5])); } catch (e) { /* optional */ } V.audio.play('vg_shot', { pos: f, gain: a[6] ? 0.5 : 0.75 }); } });
    on('bm', (a, from) => { if (Array.isArray(a)) V.defenses.explode(new T.Vector3(a[0], a[1], a[2]), a[3], a[4], a[5], from); });
    on('fl', (a) => { if (Array.isArray(a)) V.defenses.flareAt(new T.Vector3(a[0], a[1], a[2]), a[3], true); });
    on('rq', (d, from) => { if (net.host && d) D().hostRequest(d.op, d.d, from); });
    on('wv', (d) => { if (!net.host && d) D().netWave(d); });
    on('ob', (a) => { if (!net.host && V.destruct && Array.isArray(a)) V.destruct.netApply(a); });
    on('oh', (a) => { if (net.host && V.destruct && Array.isArray(a)) V.destruct.netHit(a); });
  }

  // ------------------------------------------------------------------ the squad, on screen
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function drawHud(sh) {
    let h = `<div class="vg-squad-h">SQUAD · ${esc(net.code || '')}${net.host ? ' · HOST' : ''}</div>`;
    for (const r of net.players.values()) {
      if (!r.in) continue;
      const stat = r.flags & 8 ? 'DOWN' : r.flags & 16 ? 'AWAY' : '';
      h += `<div class="vg-mate${stat ? ' off' : ''}"><b>${esc(r.name)}</b><i><u style="width:${Math.max(0, Math.min(100, r.hp))}%"></u></i><em>${stat || r.kills}</em></div>`;
    }
    if (h !== hud.dataset.h) { hud.dataset.h = h; hud.innerHTML = h; }
  }
})();
