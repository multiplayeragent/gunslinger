/* Title-screen screens for the operator and the leaderboards.

   Operator: the thirty outfits, grouped by where they are earned. The one picked is worn by a soldier standing in
   the map itself (src/characters.js takes the camera while the screen is open); a locked outfit shows its three
   challenges and how far each has come. Leaderboards: every board of every map and mode (src/leaderboards.js). */
window.GunslingerLocker = {
  install(g) {
    'use strict';
    const A = window.GunslingerAchievements, B = window.GunslingerBoards, C = window.GunslingerCharacters, CH = window.GunslingerChallenges;
    if (this.installed || typeof document === 'undefined' || !document.body || !document.body.appendChild) return;
    const actions = document.querySelector('.m-title .m-actions'); if (!actions) return;
    this.installed = true;
    const self = this, esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const mapId = (window.GunslingerMapSelect && window.GunslingerMapSelect.id) || 'harbor';
    const click = () => { try { g.events.emit('ui:click', {}); } catch (e) { /* no audio */ } };
    const host = document.getElementById('app') || document.body;
    const hasOps = !!(A && C && C.pack && CH);

    // ------------------------------------------------------------------ title buttons
    const bOp = document.createElement('button'); bOp.className = 'btn'; bOp.dataset.gs = 'operator'; bOp.type = 'button';
    const bLb = document.createElement('button'); bLb.className = 'btn'; bLb.dataset.gs = 'boards'; bLb.type = 'button'; bLb.textContent = 'Leaderboards';
    if (hasOps) actions.appendChild(bOp);
    if (B) actions.appendChild(bLb);
    const opLabel = () => { if (hasOps) bOp.innerHTML = `Operator <em>${esc(C.info(C.worn()).name)}</em>`; };
    opLabel();
    bOp.addEventListener('click', (e) => { e.stopPropagation(); click(); openOps(); });
    bLb.addEventListener('click', (e) => { e.stopPropagation(); click(); openBoards(); });

    // the best of this map on the title itself
    const pick = document.querySelector('.m-pick'), top = document.createElement('div'); top.className = 'gs-top'; top.hidden = true;
    if (pick && B) pick.appendChild(top);
    async function drawTop() {
      if (!B || !B.available()) return;
      const def = B.list(mapId)[0]; if (!def) return;
      const t = await B.top(def.id, 3); if (!t || !t.entries.length) return;
      top.innerHTML = `<b>${esc(def.what)}</b>` + t.entries.map((e) => `<span${e.me ? ' class="me"' : ''}>${e.rank}. ${esc(e.name)} · ${esc(e.text)}</span>`).join('') +
        (t.mine ? `<span class="me">You: rank ${t.mine.rank} of ${t.mine.total}</span>` : '');
      top.hidden = false;
    }

    // ------------------------------------------------------------------ shared: a screen over the title
    let open = null;
    const screens = {}, extra = {};                         // every screen by name; what an added one does when opened and keyed
    const shell = document.createElement('div'); shell.className = 'gs-locker'; shell.hidden = true; host.appendChild(shell);
    function show(which) {
      open = which; shell.hidden = false; shell.dataset.screen = which; document.body.classList.add('gs-locker-open');
      for (const k in screens) screens[k].hidden = k !== which;
    }
    function close() {
      if (!open) return;
      if (open === 'ops' && C) C.stageClose();
      const was = open;
      open = null; shell.hidden = true; document.body.classList.remove('gs-locker-open'); opLabel();
      ((extra[was] && extra[was].focus) || (hasOps ? bOp : bLb)).focus({ preventScroll: true });
    }
    // while a screen is open the keys are its own: the title underneath must not start a run or open its panel
    window.addEventListener('keydown', (e) => {
      if (!open) return;
      e.stopImmediatePropagation();
      if (e.code === 'Escape') { e.preventDefault(); click(); close(); return; }
      if (open === 'ops') {
        const d = e.code === 'ArrowDown' || e.code === 'ArrowRight' ? 1 : e.code === 'ArrowUp' || e.code === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); const i = order.indexOf(sel); select(order[Math.max(0, Math.min(order.length - 1, i + d))], true); }
        else if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); wear(); }
      } else if (open === 'boards') {
        const d = e.code === 'ArrowRight' ? 1 : e.code === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); const maps = B.maps(), i = maps.indexOf(tab); setTab(maps[(i + d + maps.length) % maps.length]); }
      } else if (extra[open] && extra[open].key) extra[open].key(e);
    }, true);
    for (const ev of ['keyup', 'keypress']) window.addEventListener(ev, (e) => { if (open) e.stopImmediatePropagation(); }, true);
    g.events.on('game:state', ({ state }) => { if (state !== 'title') close(); else { drawTop(); opLabel(); } });

    // ------------------------------------------------------------------ Operator
    const ops = document.createElement('section'); ops.className = 'gs-ops'; ops.hidden = true; ops.setAttribute('aria-label', 'Operator');
    ops.innerHTML = '<header class="gs-l-head"><div><span class="gs-l-k">Operator</span><h2>Outfits</h2></div><span class="gs-ops-count"></span><button class="btn small" type="button" data-x="close">Back</button></header>' +
      '<div class="gs-ops-list" role="listbox" aria-label="Outfits"></div><div class="gs-ops-stage" aria-hidden="true"><span>Drag to turn</span></div><aside class="gs-ops-info" aria-live="polite"></aside>';
    shell.appendChild(ops); screens.ops = ops;
    const list = ops.querySelector('.gs-ops-list'), info = ops.querySelector('.gs-ops-info'), stageEl = ops.querySelector('.gs-ops-stage'), count = ops.querySelector('.gs-ops-count');
    let sel = null, order = [];
    const chip = (hex) => `<i style="background:${esc(hex)}"></i>`;
    function chips(id) { const s = C.info(id), c = s.camo || {}, gear = s.gear || {}; return chip(c.base || '#777') + chip((c.mid && c.mid[0]) || gear.vest || '#555') + chip(gear.vest || '#444'); }
    function drawList() {
      order = [];
      let h = '';
      for (const group of CH.GROUPS) {
        const ids = A.outfits().filter((id) => C.info(id) && A.outfit(id).group === group); if (!ids.length) continue;
        const earned = ids.filter((id) => A.unlocked(id)).length;
        h += `<h3>${esc(group)}<em>${group === 'Standard issue' ? '' : earned + ' of ' + ids.length}</em></h3>`;
        for (const id of ids) {
          const o = A.outfit(id), worn = C.worn() === id, part = o.total ? o.challenges.reduce((s, c) => s + c.value / c.goal, 0) / o.total : 1;
          order.push(id);
          h += `<button type="button" role="option" class="gs-ops-card${o.unlocked ? '' : ' locked'}${worn ? ' worn' : ''}" data-id="${id}" aria-selected="${id === sel}">` +
            `<span class="c">${chips(id)}</span><span class="n">${esc(C.info(id).name)}</span><span class="s">${worn ? 'Worn' : o.unlocked ? (o.total ? 'Earned' : '') : o.done + ' of ' + o.total}</span>` +
            (o.unlocked ? '' : `<i class="bar"><u style="width:${(part * 100).toFixed(1)}%"></u></i>`) + '</button>';
        }
      }
      list.innerHTML = h;
      const all = A.outfits().filter((id) => A.outfit(id).total), got = all.filter((id) => A.unlocked(id)).length;
      count.textContent = `${got} of ${all.length} earned`;
    }
    function drawInfo() {
      const o = A.outfit(sel), s = C.info(sel), worn = C.worn() === sel;
      let h = `<div class="gs-l-k">${esc(o.group)}</div><h3>${esc(s.name)}</h3>`;
      if (!o.total) h += `<p class="role">${esc(s.role || 'Standard issue')}</p>`;
      else {
        h += `<p class="role">${o.unlocked ? 'Earned' : o.done + ' of ' + o.total + ' done'}</p><ol>`;
        for (const c of o.challenges) {
          h += `<li class="${c.done ? 'done' : ''}"><span>${esc(c.label)}</span><b>${c.done ? 'Done' : B ? B.num(c.value) + ' / ' + B.num(c.goal) : c.value + ' / ' + c.goal}</b><i><u style="width:${(100 * c.value / c.goal).toFixed(1)}%"></u></i>` +
            (c.hint && !c.done ? `<small>${esc(c.hint)}</small>` : '') + '</li>';
        }
        h += '</ol>';
      }
      h += worn ? '<div class="state">Wearing this</div>' : o.unlocked ? '<button class="btn primary" type="button" data-x="wear">Wear</button>' : '<div class="state">Locked · finish the challenges to wear it</div>';
      info.innerHTML = h;
    }
    function select(id, scroll) {
      if (!id || !C.info(id)) return;
      sel = id;
      for (const b of list.querySelectorAll('.gs-ops-card')) { const on = b.dataset.id === id; b.setAttribute('aria-selected', String(on)); if (on && scroll) { b.scrollIntoView({ block: 'nearest' }); b.focus({ preventScroll: true }); } }
      C.stageWear(id); drawInfo();
    }
    function wear() {
      if (!sel || !A.unlocked(sel) || C.worn() === sel) return;
      C.worn(sel); click(); drawList(); select(sel); opLabel();
    }
    function frameStage() {
      // the soldier belongs in the middle of what the list and the challenge box leave free
      const r = stageEl.getBoundingClientRect(), w = window.innerWidth || 1, h = window.innerHeight || 1;
      C.stageView(((r.left + r.right) / 2) / w, ((r.top + r.bottom) / 2) / h, Math.min(1, r.height / h));
    }
    function openOps() {
      if (!hasOps) return;
      sel = C.worn(); drawList(); show('ops');
      C.stageOpen(sel); frameStage(); select(sel, true);
    }
    list.addEventListener('click', (e) => { e.stopPropagation(); const b = e.target.closest('.gs-ops-card'); if (b) { click(); select(b.dataset.id); } });
    list.addEventListener('dblclick', (e) => { const b = e.target.closest('.gs-ops-card'); if (b) { select(b.dataset.id); wear(); } });
    ops.addEventListener('click', (e) => { e.stopPropagation(); const x = e.target.closest('[data-x]'); if (!x) return; if (x.dataset.x === 'close') { click(); close(); } else if (x.dataset.x === 'wear') wear(); });
    let drag = null;
    stageEl.addEventListener('pointerdown', (e) => { drag = e.clientX; stageEl.setPointerCapture(e.pointerId); stageEl.classList.add('turned'); });
    stageEl.addEventListener('pointermove', (e) => { if (drag === null) return; C.stageSpin((e.clientX - drag) * 0.011); drag = e.clientX; });
    for (const ev of ['pointerup', 'pointercancel']) stageEl.addEventListener(ev, () => { drag = null; });
    window.addEventListener('resize', () => { if (open === 'ops') frameStage(); });

    // ------------------------------------------------------------------ Leaderboards
    const boards = document.createElement('section'); boards.className = 'gs-boards'; boards.hidden = true; boards.setAttribute('aria-label', 'Leaderboards');
    boards.innerHTML = '<header class="gs-l-head"><div><span class="gs-l-k">Multiplayer Agent</span><h2>Leaderboards</h2></div><div class="seg gs-boards-tabs" role="tablist"></div><button class="btn small" type="button" data-x="close">Back</button></header><div class="gs-boards-body"></div>';
    shell.appendChild(boards); screens.boards = boards;
    const tabs = boards.querySelector('.gs-boards-tabs'), body = boards.querySelector('.gs-boards-body');
    let tab = mapId, drawn = 0;
    async function setTab(id) {
      tab = id; const mine = ++drawn;
      tabs.innerHTML = B.maps().map((m) => `<button type="button" role="tab" data-tab="${m}" aria-pressed="${m === tab}">${esc(B.MAP_NAMES[m] || m)}</button>`).join('');
      const defs = B.list(tab);
      if (!B.available()) { body.innerHTML = '<p class="gs-boards-off">Leaderboards are off: this copy has no Multiplayer Agent key (mp.config.local.js), or the service could not be reached.</p>'; return; }
      body.innerHTML = defs.map((d) => `<article data-b="${d.id}"><div class="gs-l-k">${esc(d.title)}</div><h3>${esc(d.what)}</h3><ol><li class="wait">Loading…</li></ol><div class="you"></div></article>`).join('');
      for (const d of defs) {
        B.top(d.id, 10).then((t) => {
          if (mine !== drawn) return;
          const art = body.querySelector(`[data-b="${d.id}"]`); if (!art) return;
          const ol = art.querySelector('ol'), you = art.querySelector('.you');
          if (!t) { ol.innerHTML = '<li class="wait">Could not load this board</li>'; return; }
          ol.innerHTML = t.entries.length ? t.entries.map((e) => `<li${e.me ? ' class="me"' : ''}><span class="r">${e.rank}</span><span class="n">${esc(e.name)}</span><b>${esc(e.text)}</b></li>`).join('') : '<li class="wait">No one yet. Be the first.</li>';
          you.textContent = t.mine ? `You: ${t.mine.text} · rank ${t.mine.rank} of ${t.mine.total}` : t.total ? `${t.total} ranked · you are not on this board yet` : '';
        });
      }
    }
    function openBoards() { show('boards'); setTab(tab); boards.querySelector('[data-x="close"]').focus({ preventScroll: true }); }
    boards.addEventListener('click', (e) => { e.stopPropagation(); const t = e.target.closest('[data-tab]'), x = e.target.closest('[data-x]'); if (t) { click(); setTab(t.dataset.tab); } else if (x) { click(); close(); } });
    shell.addEventListener('click', (e) => e.stopPropagation());

    self.refresh = () => { opLabel(); if (open === 'ops') { drawList(); drawInfo(); } };
    self.openOps = openOps; self.openBoards = openBoards; self.close = close;
    // another screen in the same shell (the skill tree): its element, and { open(), key(e), focus }
    self.screen = (name, el, does) => { shell.appendChild(el); screens[name] = el; extra[name] = does || {}; el.hidden = true; };
    self.open = (name) => { if (!screens[name]) return; show(name); if (extra[name] && extra[name].open) extra[name].open(); };
    if (A) A.on((e) => { if (e.type !== 'progress') self.refresh(); });
    if (window.GunslingerOnline) window.GunslingerOnline.whenAvailable().then((ok) => { if (ok) drawTop(); });
    // the worn outfit is built while the title idles, so the Operator screen and a teammate's arrival open without a pause
    if (hasOps) setTimeout(() => { if (g.game.state === 'title') C.prewarm(); }, 2500);
  },
};
