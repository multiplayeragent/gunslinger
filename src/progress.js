/* Progress: what the game tells the achievements (src/achievements.js, src/challenges.js) and the leaderboards
   (src/leaderboards.js), on both maps, and what the player is shown for it: a line when a challenge completes or an
   outfit unlocks, and on the end cards what the run moved and where it ranks. A run's standing goes to its boards
   while it is being played (see `live`), so a night that is never lost still ranks.

   A map or mode added later reports through the same two doors: GunslingerAchievements.report(fact, details) and
   GunslingerBoards.submit(id, value). */
window.GunslingerProgress = {
  install(g) {
    'use strict';
    const A = window.GunslingerAchievements, B = window.GunslingerBoards, C = window.GunslingerCharacters;
    if (!A || this.installed || typeof document === 'undefined') return;
    this.installed = true;
    const mapId = (window.GunslingerMapSelect && window.GunslingerMapSelect.id) || 'harbor', onVigil = mapId === 'vigil';
    const V = window.Vigil || {}, D = onVigil ? V.director : null, N = onVigil ? V.net : null;
    const p = g.player, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const squad = () => (N && N.online ? N.count() : 1);
    const outfitName = (id) => { const i = C && C.info && C.info(id); return (i && i.name) || id; };
    A.setContext(() => ({ map: mapId, mode: onVigil ? 'vigil' : (g.game.run && g.game.run.mode) || 'mission', diff: g.game.difficulty || 'hard', coop: squad() >= 2, players: squad() }));

    // ------------------------------------------------------------------ what the player is told
    const ui = document.getElementById('ui') || document.body;
    const toasts = document.createElement('div'); toasts.className = 'gs-toasts'; toasts.setAttribute('aria-live', 'polite'); ui.appendChild(toasts);
    function toast(kind, head, text) {
      const t = document.createElement('div'); t.className = 'gs-toast ' + kind;
      t.innerHTML = `<b>${esc(head)}</b><span>${esc(text)}</span>`;
      toasts.appendChild(t);
      while (toasts.children.length > 3) toasts.firstChild.remove();
      setTimeout(() => t.classList.add('out'), kind === 'unlock' ? 6500 : 4200);
      setTimeout(() => t.remove(), kind === 'unlock' ? 7200 : 4900);
    }
    // Announcements go to the lane at top centre (src/alerts.js); the corner toasts remain for a page without it.
    const L = window.GunslingerLevels, AL = window.GunslingerAlerts, lane = !!(AL && AL.installed);
    const SK = onVigil && V.skills ? V.skills : null;
    // experience: counted in src/levels.js, shown beside the reticle, saved with the outfits
    function xp(n, label, kind) {
      if (!L || !(n > 0)) return;
      L.add(n, label);
      if (lane && g.game.state === 'playing') AL.xp(n, label, kind);
    }
    if (L) {
      if (A.extra) { A.extra('level', L); if (SK) A.extra('skills', SK); }
      L.on((e) => {
        if (e.type !== 'level') return;
        const sub = SK ? 'A skill point to spend · Skills on the title screen' : 'Your player level goes up';
        if (lane) AL.level(e.level, sub, { promoted: e.promoted, rank: e.rank }); else toast('unlock', (e.promoted ? 'Promoted' : 'Level up') + ' · level ' + e.level, e.rank);
        A.save(true);
      });
    }
    if (A.extra && onVigil && V.reach) A.extra('reach', V.reach);                // the furthest wave of five reached (src/vigil/save.js)
    A.on((e) => {
      if (e.type === 'done') {
        const c = A.challenge(e.id), o = A.outfit(e.outfit);
        if (lane) AL.unlock('Challenge complete', `${c.label} · ${outfitName(e.outfit)} ${o.done} of ${o.total}`, 'done'); else toast('done', `Challenge complete · ${outfitName(e.outfit)} ${o.done} of ${o.total}`, c.label);
        if (L) xp(L.XP.challenge, 'Challenge', 'small');
      } else if (e.type === 'unlock') {
        if (lane) AL.unlock('Outfit unlocked', outfitName(e.outfit) + ' · wear it from Operator on the title screen', 'unlock'); else toast('unlock', 'Outfit unlocked', outfitName(e.outfit) + ' — wear it from Operator on the title screen');
        if (L) xp(L.XP.outfit, 'Outfit', 'small');
        if (B) B.submit('career-outfits', A.unlockedCount());
        try { g.events.emit('ui:click', {}); } catch (err) { /* no audio */ }
      }
      if (e.type !== 'progress') A.save(true);
    });

    // ------------------------------------------------------------------ one run
    const R = { hits: 0, dressings: 0, crystalMin: 1, wentDown: false, earned: 0, kills: 0, on: false, board: [], sent: {}, rank: {} };
    const recent = [];                      // this player's last kills: [time, type]
    const KILL_NAMES = { walker: 'Walker', runner: 'Runner', spitter: 'Spitter', wolf: 'Wolf', burster: 'Burster', pyre: 'Pyre', brute: 'Brute', boss: 'Abomination', demon: 'Demon', skull: 'Demon head', bat: 'Bat', spider: 'Spider', greatspider: 'Great spider' };
    let career = 0;
    function begin() {
      A.beginRun(); if (L) L.beginRun(); R.hits = 0; R.dressings = 0; R.crystalMin = 1; R.wentDown = false; R.earned = D ? D.S.earned || 0 : 0; R.kills = 0; R.on = true; R.board = []; R.sent = {}; R.rank = {}; recent.length = 0;
      for (const el of document.querySelectorAll('.gs-run')) el.remove();
    }
    function killed(details) {
      const t = now(); recent.push([t, details.type]);
      while (recent.length && t - recent[0][0] > 4) recent.shift();
      let multiSame = 0, burst = 0; for (const [at, type] of recent) { if (type === details.type) multiSame++; if (t - at <= 1) burst++; }
      details.multi = recent.length; details.multiSame = multiSame; details.burst = burst;
      R.kills++; career++;
      A.report('kill', details);
      if (L) { const head = !!(details.head || details.weak); xp(L.killXp(details), head ? 'Headshot' : details.by === 'defense' ? 'Defense' : KILL_NAMES[details.type] || 'Kill', head ? 'head' : details.by === 'defense' ? 'small' : ''); }
    }

    // ---- the Harbor: a kill is reported once the events of its instant are all in (the bullet that did it, or the blast)
    const waiting = []; let flushing = false, blasts = 0;
    function flush() {
      flushing = false;
      for (const k of waiting.splice(0)) {
        const held = g.arsenal && g.arsenal.held ? g.arsenal.held() : null, e = k.enemy;
        killed({ type: k.type, by: 'player', weapon: held ? held.id : g.weapon.current === 'pistol' ? 'sidearm' : 'carbine', suppressed: !!(held && held.suppressed),
          dist: e && e.pos && p.pos ? Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y, e.pos.z - p.pos.z) : 0, weak: !!(k.hit && k.hit.weak), blast: !k.hit && blasts > k.blasts,
          lowHp: p.health / (p.maxHealth || 100) < 0.35 });
      }
    }
    if (!onVigil) {
      g.events.on('enemy:killed', (e) => {
        if (!e || g.game.state !== 'playing') return;
        waiting.push({ enemy: e.enemy, type: e.type, hit: null, blasts });
        if (!flushing) { flushing = true; Promise.resolve().then(flush); }
      });
      g.events.on('player:hitEnemy', (h) => { if (!h || !h.killed) return; const k = waiting.find((w) => w.enemy === h.enemy && !w.hit); if (k) k.hit = h; });
      g.events.on('explosive:blast', () => { blasts++; });
      g.events.on('objective:done', (o) => {
        if (!o || g.game.state !== 'playing') return;
        if (o.id === 'wave') { A.report('hwave', { wave: o.index | 0 }); if (L) xp(L.XP.hwave, 'Wave held', 'small'); } else { A.report('relay', {}); if (L) xp(L.XP.relay, 'Relay cut', 'small'); }
        A.save(); live();
      });
    } else {
      // ---- the Churchyard
      const inChurch = (z) => !!(z && z.pos && V.CH && Math.abs(z.pos.x) < V.CH.hw && Math.abs(z.pos.z) < V.CH.hd);
      g.events.on('enemy:killed', (e) => {
        if (!e || !e.enemy || !e.enemy.flesh || g.game.state === 'title') return;
        if (e.by !== 'player' && e.by !== 'defense') return;
        if (e.by === 'defense' && e.owner && N && N.id && e.owner !== N.id) return;
        const z = e.enemy, S = D.S;
        killed({ type: e.type, by: e.by, head: !!e.head, blast: !!e.blast, weapon: e.by === 'defense' ? 'defense' : g.weapon.current === 'pistol' ? 'pistol' : S.kit,
          dist: z.pos ? Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z) : 0, lowHp: p.health / (p.maxHealth || 100) < 0.35, torch: !!S.torch, inChurch: inChurch(z), crawling: !!z.crawling });
      });
      g.events.on('enemy:severed', () => { if (g.game.state !== 'title') A.report('sever', {}); });
      g.events.on('vigil:placed', (e) => A.report('place', { kind: e && e.kind }));
      g.events.on('vigil:stacked', () => A.report('stack', {}));
      g.events.on('vigil:totem', (e) => { if (L) xp(L.XP.totem * Math.max(1, (e && e.stage) | 0), 'Totem felled', 'small'); });
      g.events.on('objective:done', (o) => {
        if (!o || o.id !== 'wave') return;
        const S = D.S, crystal = S.crystal.hp / S.crystal.max, k = Math.max(1, o.k | 0), first = o.first || o.index;
        // several waves called on top of one another fall together: each of them was cleared
        for (let n = Math.max(1, o.index - k + 1, first); n <= o.index; n++) { A.report('wave', { wave: n, crystal, crystalMin: R.crystalMin, noDown: !R.wentDown, cls: S.cls && S.cls.id }); if (L) xp(L.XP.wave(n), 'Wave ' + n + ' cleared', 'small'); }
        const earned = (S.earned || 0) - R.earned; R.earned = S.earned || 0; if (earned > 0) A.report('earn', { n: earned });
        R.wentDown = false;
        A.save(); live();
      });
      setInterval(() => {
        if (!R.on || g.game.state !== 'playing' || !D.S) return;
        const S = D.S; R.crystalMin = Math.min(R.crystalMin, S.crystal.hp / S.crystal.max); if (S.down) R.wentDown = true;
      }, 250);
    }
    g.events.on('player:hit', () => { R.hits++; });
    g.events.on('gs:dressing', () => { R.dressings++; A.report('dress', {}); });

    // ------------------------------------------------------------------ the boards while a run is on
    /* A night that is never lost, or a tab that is closed, still ranks: what the run has reached goes to its boards
       when a wave falls, when the game is paused or the tab hidden, and every LIVE_S seconds of play in between.
       Only boards whose score can only grow during a run go this way (a time is sent when the run is complete),
       and a board is sent again only once the run has passed what it last sent. */
    const LIVE_S = 20, TOLD = { 'vigil-waves': 1, 'vigil-squad': 1, 'holdout-waves': 1 };
    function post(id, value) {
      value = Math.floor(+value || 0);
      const sent = R.sent, ranks = R.rank, before = sent[id] || 0;
      if (!B || !(value > before)) return;
      sent[id] = value;
      Promise.resolve(B.submit(id, value)).then((res) => {
        if (!res) { if (sent[id] === value) sent[id] = before; return; }               // not sent: the next pass tries again
        const was = ranks[id]; if (res.rank) ranks[id] = res.rank;
        // said once a climb: a best that moved the player up the board (or onto it)
        if (!TOLD[id] || !res.rank || !res.best || (was != null && res.rank >= was) || g.game.state !== 'playing') return;
        const def = B.get(id), line = `${def.what} · ${res.text} · #${res.rank} of ${res.total}`;
        if (lane) AL.unlock('Leaderboard', line, 'done'); else toast('done', 'Leaderboard', line);
      }, () => { if (sent[id] === value) sent[id] = before; });
    }
    // kills are a running sum on the server: what was made since the last pass, given back if it did not arrive
    function careerOut() {
      if (!B || !(career > 0)) return;
      const n = career; career = 0;
      Promise.resolve(B.submit('career-kills', n)).then((res) => { if (!res) career += n; }, () => { career += n; });
    }
    function live() {
      if (!R.on || !B) return;
      const run = g.game.run || {};
      if (onVigil) {
        if (!D || !D.S) return;
        const waves = run.wavesCleared | 0;
        post('vigil-waves', waves); if (squad() >= 2) post('vigil-squad', waves);
        post('vigil-kills', D.S.kills | 0);
      } else if (run.mode === 'holdout') { post('holdout-score', run.score | 0); post('holdout-waves', run.wavesCleared | 0); }
      careerOut();
    }
    setInterval(() => { if (g.game.state === 'playing') live(); }, LIVE_S * 1000);
    if (document.addEventListener) document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') live(); });
    this.live = live;

    // ------------------------------------------------------------------ the end of a run: results, boards, the card
    function card(state) {
      const host = document.querySelector(`.m-screen[data-s="${state}"]`); if (!host) return null;
      let el = host.querySelector('.gs-run'); if (el) el.remove();
      el = document.createElement('div'); el.className = 'gs-run';
      const actions = host.querySelector('.m-actions'); if (actions) host.insertBefore(el, actions); else host.appendChild(el);
      return el;
    }
    function drawCard(el) {
      if (!el) return;
      const sum = A.runSummary(), rows = sum.rows.slice(0, 3), more = sum.rows.length - rows.length;
      let h = '';
      if (L) {
        // what the run was worth, and where it leaves the player
        const q = L.progress(), n = L.RANKS.length, pts = SK ? SK.free() : 0;
        h += `<div class="gs-run-xp"><i class="badge" style="background-image:url(assets/ui/ranks.webp);background-size:${n * 100}% 100%;background-position:${(q.rankIndex / (n - 1)) * 100}% 0"></i>` +
          `<b><em>+${B.num(L.runXp)} XP</em>Level ${q.level} · ${esc(q.rank)}</b><span>${q.level < L.MAX ? B.num(q.into) + ' / ' + B.num(q.need) + ' XP to level ' + (q.level + 1) : 'Highest level'}${pts ? ' · ' + pts + (pts === 1 ? ' skill point' : ' skill points') + ' to spend' : ''}</span><u><s style="transform:scaleX(${q.k.toFixed(3)})"></s></u></div>`;
      }
      for (const b of R.board) h += `<div class="gs-run-rank"><span>${esc(b.what)}</span><b>${esc(b.text)}</b></div>`;
      for (const id of sum.unlocked) h += `<div class="gs-run-unlock"><span>Outfit unlocked</span><b>${esc(outfitName(id))}</b></div>`;
      if (rows.length) {
        h += '<div class="gs-run-h">Outfit challenges</div>';
        for (const c of rows) {
          h += `<div class="gs-run-row${c.done ? ' done' : ''}"><span class="n">${esc(outfitName(c.outfit))}</span><span class="l">${esc(c.label)}</span><span class="v">${c.done ? 'Done' : B.num(c.value) + ' / ' + B.num(c.goal)}</span>` +
            `<i><u style="width:${(100 * c.from / c.goal).toFixed(1)}%"></u><u class="gain" style="left:${(100 * c.from / c.goal).toFixed(1)}%;width:${(100 * (c.value - c.from) / c.goal).toFixed(1)}%"></u></i></div>`;
        }
        if (more > 0) h += `<div class="gs-run-more">and ${more} more moved · Operator on the title screen shows them all</div>`;
      }
      el.innerHTML = h; el.hidden = !h;
    }
    async function rank(el, id, value, say) {
      const def = B.get(id), res = await B.submit(id, value); if (!res || !res.rank) return;
      R.board.push({ what: def.what, text: (say ? say(res) : res.text) + ` · #${res.rank} of ${res.total}` });
      drawCard(el);
    }
    function finish(state) {
      if (!R.on) return; R.on = false;
      const run = g.game.run || {}, el = card(state), stats = (g.combat && g.combat.stats) || {};
      if (!onVigil) {
        if (run.mode === 'holdout') {
          A.report('hend', { score: run.score | 0, waves: run.wavesCleared | 0, kills: run.kills | 0 });
          if (run.score > 0) rank(el, 'holdout-score', run.score);
          if (run.wavesCleared > 0) rank(el, 'holdout-waves', run.wavesCleared);
        } else if (state === 'complete') {
          const mission = { time: run.time || 0, acc: stats.shots > 0 ? Math.min(1, stats.hits / stats.shots) : null, retries: run.retries | 0, hits: R.hits, dressings: R.dressings, health: p.health };
          A.report('mission', mission);
          if (L) xp(L.XP.mission, 'Mission complete', 'small');
          rank(el, 'breach-time', { time: mission.time, diff: g.game.difficulty });
        }
      } else if (D && D.S) {
        const waves = run.wavesCleared | 0, kills = D.S.kills | 0;
        A.report('vend', { waves, kills });
        if (waves > 0) { rank(el, 'vigil-waves', waves); if (squad() >= 2) rank(el, 'vigil-squad', waves); }
        if (kills > 0) rank(el, 'vigil-kills', kills);
      }
      careerOut();
      const earned = A.unlockedCount(); if (earned > 0) B.submit('career-outfits', earned);
      drawCard(el);
      A.save(true);
    }
    g.events.on('game:state', ({ state, prev }) => {
      if ((state === 'intro' || state === 'playing') && prev !== 'paused' && prev !== 'intro') begin();
      else if (state === 'dead' || state === 'complete') finish(state);
      else if (state === 'title') { if (R.on) finish('dead'); }
      else if (state === 'paused') live();
    });
    window.addEventListener('pagehide', () => { live(); A.save(true); });
    A.load().then(() => { if (window.GunslingerLocker && window.GunslingerLocker.refresh) window.GunslingerLocker.refresh(); });
    this.toast = toast;
  },
};
