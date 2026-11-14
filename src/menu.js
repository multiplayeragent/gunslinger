/* Title-screen pickers: which map to load, and (per map) the mode and class. Changing map reloads the page,
   because a map is a whole world: level, sky, ground, enemies. */
window.GunslingerMenu = {
  install(g) {
    'use strict';
    const sel = window.GunslingerMapSelect;
    if (!sel || typeof document === 'undefined' || !document.body) return;
    document.body.dataset.map = sel.id;
    const pick = document.querySelector('.m-pick');
    if (!pick || !pick.prepend) return;
    const label = document.createElement('label'); label.id = 'l-map'; label.textContent = 'Map';
    const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-labelledby', 'l-map');
    seg.innerHTML = sel.order.map((id) => `<button data-map="${id}" aria-pressed="${id === sel.id}">${sel.get(id).name}</button>`).join('');
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.dataset.map === sel.id) return;
      e.stopPropagation();
      const veil = document.createElement('div'); veil.className = 'gs-loading'; veil.textContent = 'Loading ' + sel.get(b.dataset.map).name;
      (document.getElementById('app') || document.body).appendChild(veil);
      try { g.audio && g.audio.ctx && g.audio.ctx.close && g.audio.ctx.close(); } catch (err) { /* already closed */ }
      setTimeout(() => sel.choose(b.dataset.map), 30);
    });
    pick.prepend(seg); pick.prepend(label);
    this.pick = pick;
  },

  // Alone, or with whoever is in the same room (src/vigil/net.js). Co-op is live from the title screen: the room
  // is joined as soon as it is picked, so the squad can see who is there before anyone starts.
  squad(g, pick) {
    'use strict';
    const N = window.Vigil.net; if (!N) return;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const lab = document.createElement('label'); lab.id = 'l-sq'; lab.textContent = 'Squad';
    const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-labelledby', 'l-sq');
    seg.innerHTML = '<button data-sq="solo" aria-pressed="true">Solo</button><button data-sq="coop" aria-pressed="false" disabled>Co-op</button>';
    const panel = document.createElement('div'); panel.className = 'vg-lobby'; panel.hidden = true;
    panel.innerHTML = '<div class="vg-lobby-row"><input class="vg-name" maxlength="16" spellcheck="false" autocomplete="off" aria-label="Your name"><b class="vg-code"></b><button class="vg-copy" type="button">Copy invite</button><button class="vg-private" type="button">New room</button></div><div class="vg-roster"></div>';
    const top = document.createElement('div'); top.className = 'vg-top';
    pick.append(lab, seg, panel, top);
    const coop = seg.querySelector('[data-sq="coop"]'), name = panel.querySelector('.vg-name'), code = panel.querySelector('.vg-code'), roster = panel.querySelector('.vg-roster'), copy = panel.querySelector('.vg-copy');
    let mode = 'solo';
    const draw = () => {
      if (mode !== 'coop') return;
      code.textContent = N.status === 'connecting' ? 'Connecting…' : N.status === 'error' ? 'Could not connect' : 'Room ' + (N.code || '');
      const list = N.roster();
      roster.innerHTML = N.status === 'error' ? esc(N.error) : list.map((r) => `<span class="${r.in ? 'in' : ''}">${esc(r.name)}${r.me ? ' (you)' : ''}${r.in && !r.me ? ' · fighting' : ''}</span>`).join('') + (list.length < 2 ? '<em>Send the invite link to bring someone in. Up to four.</em>' : '');
    };
    const setMode = (m) => {
      mode = m;
      for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.sq === m));
      panel.hidden = m !== 'coop';
      try { localStorage.setItem('gunslinger.squad', m); } catch (e) { /* private mode */ }
      if (m === 'coop') { name.value = N.name(); N.join(N.code || N.defaultCode()); } else N.leave();
      draw();
    };
    N.onChange(draw);
    seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; e.stopPropagation(); if (b.dataset.sq !== mode) { g.events.emit('ui:click', {}); setMode(b.dataset.sq); } });
    for (const ev of ['keydown', 'keyup', 'keypress']) name.addEventListener(ev, (e) => e.stopPropagation());
    name.addEventListener('change', () => { name.value = N.name(name.value) || N.name(); });
    panel.addEventListener('click', (e) => e.stopPropagation());
    copy.addEventListener('click', () => {
      const link = N.link(), done = () => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy invite'; }, 1600); };
      try { navigator.clipboard.writeText(link).then(done, () => window.prompt('Invite link', link)); } catch (e) { window.prompt('Invite link', link); }
    });
    panel.querySelector('.vg-private').addEventListener('click', () => { N.join(N.newCode()); });
    // the SDK loads beside the game: co-op unlocks when it and a key are there
    let tries = 0;
    const wait = () => {
      if (N.available()) {
        coop.disabled = false;
        let want = null, invited = false;
        try { invited = !!new URLSearchParams(location.search).get('room'); want = localStorage.getItem('gunslinger.squad'); } catch (e) { /* private mode */ }
        if (invited || want === 'coop') setMode('coop');
        N.top(5).then((t) => {
          if (!t || !t.entries.length) return;
          top.innerHTML = '<b>Longest vigils</b> ' + t.entries.map((e) => `<span>${e.rank}. ${esc(e.username || 'Warden ' + String(e.playerId || '').slice(-4))} · wave ${e.score}</span>`).join('') + (t.mine && t.mine.rank ? `<span class="me">You: wave ${t.mine.score}, rank ${t.mine.rank} of ${t.mine.total}</span>` : '');
        });
      } else if (++tries < 60) setTimeout(wait, 250);
      else coop.title = 'Co-op needs a Multiplayer Agent key in mp.config.local.js and a connection';
    };
    wait();
  },

  // Crystal Vigil's own title: one mode, four classes, and the wording of every card.
  vigil(g) {
    'use strict';
    const V = window.Vigil, D = V.director, pick = this.pick || document.querySelector('.m-pick');
    const set = (selector, text) => { const e = document.querySelector(selector); if (e) e.textContent = text; };
    const map = window.GunslingerMaps.vigil;
    document.title = 'GUNSLINGER — Crystal Vigil';
    set('.m-eyebrow .m-tag', 'GS / 02'); set('.m-eyebrow > span:nth-child(2)', 'CRYSTAL VIGIL'); set('.m-eyebrow .m-dim', 'CHURCHYARD / AFTER MIDNIGHT');
    set('.m-premise', 'The dead are climbing out of the graveyard. Keep the crystal in the church alive, wave after wave.');
    set('.m-note', 'Waves of the dead · an armory between them · guards, turrets and floodlights · four classes');
    set('[data-act="deploy"]', 'Begin the vigil');
    set('.m-card[data-s="paused"] .m-k', 'Vigil on hold'); set('[data-act="restart"]', 'Restart the vigil');
    set('.m-dead .m-k', 'The vigil is over'); set('.m-dead .m-h', 'The crystal has fallen');
    for (const dt of document.querySelectorAll('.m-dead dt')) if (/Machines/.test(dt.textContent)) dt.textContent = 'Zombies destroyed';
    set('.loc-card b', 'Saint Aldric’s churchyard · 00:13'); set('.loc-card span', 'One warden on watch — the crystal must not go dark');
    set('.gs-identity small', 'CRYSTAL VIGIL / 02');
    const hint = document.querySelector('.gs-hint'); if (hint) hint.innerHTML = 'B · ARMORY &nbsp; E · ABILITY &nbsp; F · LIGHT &nbsp; G T H N · ITEMS &nbsp; 3–7 · RIFLE KIT';
    g.gsDressLabel = () => `${D.S.items.medkits} MEDKITS`;

    if (pick) {
      // the engine's mode buttons give way to this map's single mode
      const modeSeg = pick.querySelector('.seg[aria-labelledby="l-tm"]');
      if (modeSeg) modeSeg.innerHTML = map.modes.map((m) => `<button aria-pressed="true" disabled>${m.name}</button>`).join('');
      const engineNote = pick.querySelector('[data-f="modenote"]'); if (engineNote) engineNote.style.display = 'none';
      const lab = document.createElement('label'); lab.id = 'l-cls'; lab.textContent = 'Class';
      const classes = document.createElement('div'); classes.className = 'seg'; classes.setAttribute('role', 'group'); classes.setAttribute('aria-labelledby', 'l-cls');
      classes.innerHTML = V.CLASS_ORDER.map((id) => `<button data-class="${id}" aria-pressed="false">${V.CLASSES[id].name}</button>`).join('');
      const note = document.createElement('div'); note.className = 'm-pick-note';
      const refresh = () => {
        const id = D.S.nextClass, c = V.CLASSES[id];
        for (const b of classes.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.class === id));
        note.textContent = `${c.tag}. ${V.KITS[c.kit].name} · ${c.passive}. ${c.ability.name} (E): ${c.ability.desc}`;
      };
      classes.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; e.stopPropagation(); D.setClass(b.dataset.class); g.events.emit('ui:click', {}); refresh(); });
      pick.append(lab, classes, note);
      refresh();
      this.squad(g, pick);
    }
    // controls: at a glance on the title, in full in the panel
    const legend = document.querySelector('.m-legend');
    if (legend) {
      const row = document.createElement('div');
      row.innerHTML = '<span><kbd>B</kbd> Armory</span><span><kbd>E</kbd> Ability</span><span><kbd>F</kbd> Light</span><span><kbd>G</kbd><kbd>T</kbd><kbd>H</kbd><kbd>N</kbd> Items</span><span><kbd>3</kbd>–<kbd>7</kbd> Kit</span><span><kbd>Enter</kbd> Call a wave</span>';
      const first = legend.firstElementChild;
      if (first && /Fire select/.test(first.textContent)) first.replaceWith(row); else legend.prepend(row);
      for (const s of legend.querySelectorAll('span')) { if (/Cut relay/.test(s.textContent)) s.remove(); }
    }
    const controls = document.querySelector('[data-pane="controls"]');
    if (controls) {
      const old = controls.querySelector('.panel-note'); if (old && /Rifle starts in automatic/.test(old.textContent)) old.remove();
      const note = document.createElement('p'); note.className = 'panel-note';
      note.textContent = 'Crystal Vigil: B opens the armory (the fight pauses). E uses your class ability; Z and X use Shockwave and Crystal Aegis once bought. G throws a grenade, T a flare, H uses a medkit, N drops a mine. F toggles the flashlight, V is melee. 3 to 7 switch rifle kits you own. Enter calls the next wave at once: press it during a wave to pile more on top, as many as you dare, for a bigger bonus. Hold Alt while aiming to steady your breath.';
      controls.prepend(note);
      for (const dt of controls.querySelectorAll('dt')) { if (/Cut relay/.test(dt.textContent)) dt.parentElement.remove(); else if (/^Melee$/.test(dt.textContent)) { const dd = dt.nextElementSibling; if (dd && /F/.test(dd.textContent)) dd.innerHTML = '<kbd>V</kbd>'; } }
    }
  },
};
