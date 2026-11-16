/* The Skills screen on the Churchyard's title, and the level shown beside it.

   Three columns, one for each branch of the tree in src/vigil/skills.js, six skills down each, joined by a
   line that turns gold as far as the branch has been learned. A skill shows its ranks as pips; the panel on
   the right says what the next rank does, what it costs and, if it cannot be bought, why not. Click or Enter
   buys a rank; "Refund all" gives every point back. The level chip above the title's buttons shows the rank
   badge, the level and how far to the next (both maps). */
window.GunslingerSkillTree = {
  install(g) {
    'use strict';
    const L = window.GunslingerLevels, K = window.GunslingerLocker, V = window.Vigil, A = window.GunslingerAchievements;
    if (this.installed || typeof document === 'undefined' || !document.body || !document.body.appendChild || !L) return;
    const actions = document.querySelector('.m-title .m-actions'); if (!actions) return;
    this.installed = true;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const click = () => { try { g.events.emit('ui:click', {}); } catch (e) { /* no audio */ } };
    const num = (n) => Math.round(n).toLocaleString('en-US');
    const badge = (level) => { const n = L.RANKS.length; return `background-image:url(assets/ui/ranks.webp);background-size:${n * 100}% 100%;background-position:${(L.rankIndex(level) / (n - 1)) * 100}% 0`; };

    // ------------------------------------------------------------------ the level, above the title's buttons
    const chip = document.createElement('div'); chip.className = 'gs-rank';
    actions.parentNode.insertBefore(chip, actions);
    function drawChip() {
      const p = L.progress();
      chip.innerHTML = `<i class="badge" style="${badge(p.level)}"></i><div class="t"><b>Level ${p.level} · ${esc(p.rank)}</b><span>${p.level < L.MAX ? num(p.into) + ' / ' + num(p.need) + ' XP' : 'Highest level'}</span><u><s style="transform:scaleX(${p.k.toFixed(3)})"></s></u></div>`;
      chip.setAttribute('aria-label', `Level ${p.level}, ${p.rank}`);
    }
    drawChip();
    L.on(() => { drawChip(); label(); });
    if (A) A.on(() => { drawChip(); label(); });

    // ------------------------------------------------------------------ the tree: the Churchyard's, where there is one
    const S = V && V.skills, onVigil = !!(window.GunslingerMap && window.GunslingerMap.id === 'vigil');
    const button = document.createElement('button'); button.className = 'btn'; button.dataset.gs = 'skills'; button.type = 'button';
    // short enough to share a row with Leaderboards: the number is the points waiting to be spent
    const label = () => { if (S) { button.innerHTML = S.free() ? `Skills <em>${S.free()}</em>` : 'Skills'; button.setAttribute('aria-label', S.free() ? `Skills, ${S.free()} to spend` : 'Skills'); } };
    if (!S || !onVigil || !K || !K.screen) return;
    actions.appendChild(button); label();

    const el = document.createElement('section'); el.className = 'gs-skills'; el.hidden = true; el.setAttribute('aria-label', 'Skills');
    el.innerHTML = '<header class="gs-l-head"><div><span class="gs-l-k">Crystal Vigil</span><h2>Skills</h2></div><span class="gs-sk-points"></span><button class="btn small" type="button" data-x="refund">Refund all</button><button class="btn small" type="button" data-x="close">Back</button></header>' +
      '<div class="gs-sk-body"></div>';
    const body = el.querySelector('.gs-sk-body'), pointsEl = el.querySelector('.gs-sk-points');
    let sel = V.SKILLS[0].id;
    const order = V.SKILLS.map((s) => s.id), by = (id) => V.SKILLS.find((s) => s.id === id);
    function draw() {
      const free = S.free();
      pointsEl.textContent = `${free} ${free === 1 ? 'point' : 'points'} to spend · level ${L.level}`;
      let h = '';
      for (const branch of V.SKILL_BRANCHES) {
        const list = V.SKILLS.filter((s) => s.branch === branch), spent = list.reduce((n, s) => n + V.skillSpent({ [s.id]: S.rank(s.id) }), 0);
        h += `<div class="gs-sk-col"><h3>${esc(branch)}<em>${spent} spent</em></h3>`;
        for (const s of list) {
          const r = S.rank(s.id), why = S.blocked(s.id), cls = (r ? ' on' : '') + (r >= s.max ? ' full' : !why ? ' can' : r ? '' : ' no');
          h += `<button type="button" class="gs-sk-node${cls}" data-id="${s.id}" aria-selected="${s.id === sel}"><span class="n">${esc(s.name)}</span><span class="p">${Array.from({ length: s.max }, (_, i) => `<i${i < r ? ' class="f"' : ''}></i>`).join('')}</span><span class="d">${esc(s.text)}${s.max > 1 ? ' a rank' : ''}</span></button>`;
        }
        h += '</div>';
      }
      const s = by(sel), r = S.rank(sel), why = S.blocked(sel), cost = V.skillCost(sel, r);
      h += `<aside class="gs-sk-info" aria-live="polite"><div class="gs-l-k">${esc(s.branch)}</div><h3>${esc(s.name)}</h3><p>${esc(s.text)}${s.max > 1 ? ' for each rank' : ''}.</p>` +
        `<p class="now">Rank ${r} of ${s.max}</p>` +
        (r >= s.max ? '<p class="why">Learned in full</p>' : `<button class="btn primary" type="button" data-x="learn"${why ? ' disabled' : ''}>Learn · ${cost} ${cost === 1 ? 'point' : 'points'}</button>${why ? `<p class="why">${esc(why)}</p>` : ''}`) +
        '<p class="why">A level gained is a point. Each rank of a skill costs 2 points more than the one before. Changes apply from the start of the next night.</p></aside>';
      body.innerHTML = h;
      el.querySelector('[data-x="refund"]').disabled = !S.spent();
    }
    function select(id, focus) { sel = id; draw(); if (focus) { const b = body.querySelector(`[data-id="${id}"]`); if (b) b.focus({ preventScroll: true }); } }
    function learn(id) {
      if (!S.learn(id)) return;
      click(); if (A) A.save(true);
      select(id, true); label();
    }
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const node = e.target.closest('.gs-sk-node'), x = e.target.closest('[data-x]');
      if (node) { click(); if (node.dataset.id === sel && !S.blocked(sel)) learn(sel); else select(node.dataset.id); }
      else if (x && x.dataset.x === 'learn') learn(sel);
      else if (x && x.dataset.x === 'refund') { if (S.refund()) { click(); if (A) A.save(true); draw(); label(); } }
      else if (x && x.dataset.x === 'close') { click(); K.close(); }
    });
    K.screen('skills', el, {
      focus: button,
      open() { draw(); const b = body.querySelector(`[data-id="${sel}"]`); if (b) b.focus({ preventScroll: true }); },
      key(e) {
        const i = order.indexOf(sel), d = e.code === 'ArrowDown' ? 1 : e.code === 'ArrowUp' ? -1 : e.code === 'ArrowRight' ? 6 : e.code === 'ArrowLeft' ? -6 : 0;
        if (d) { e.preventDefault(); const n = i + d; if (n >= 0 && n < order.length) select(order[n], true); }
        else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') { e.preventDefault(); learn(sel); }
      },
    });
    button.addEventListener('click', (e) => { e.stopPropagation(); click(); K.open('skills'); });
    S.on(label);
    this.open = () => K.open('skills');
  },
};
