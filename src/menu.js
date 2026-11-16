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
    // The player's name, always: it is what the leaderboards call them (src/leaderboards.js) and what a squad sees.
    const O = window.GunslingerOnline, BD = window.GunslingerBoards;
    if (O && O.callsign) {
      const nl = document.createElement('label'); nl.id = 'l-name'; nl.textContent = 'Name'; nl.htmlFor = 'gs-name';
      const ni = document.createElement('input'); ni.id = 'gs-name'; ni.className = 'vg-name gs-name'; ni.maxLength = 16; ni.spellcheck = false; ni.autocomplete = 'off'; ni.value = O.callsign();
      const told = () => { const N = window.Vigil && window.Vigil.net; if (N && N.name) N.name(ni.value); if (BD && BD.publishName) BD.publishName(); };
      ni.addEventListener('change', () => { ni.value = O.callsign(ni.value); told(); g.events.emit('ui:click', {}); });
      for (const ev of ['keydown', 'keyup', 'keypress']) ni.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === 'keydown' && e.key === 'Enter') ni.blur(); });
      ni.addEventListener('click', (e) => e.stopPropagation());
      pick.prepend(ni); pick.prepend(nl);
      this.nameInput = ni;
      if (BD && BD.publishName && O.whenAvailable) O.whenAvailable().then((ok) => { if (ok) BD.publishName(); });
    }
    this.pick = pick;
    // Back to the title screen (to change map, mode, class or squad) from the pause menu and the end cards.
    for (const s of ['paused', 'dead', 'complete']) {
      const card = document.querySelector(`.m-screen[data-s="${s}"]`), last = card && [...card.querySelectorAll('button.btn')].pop();
      if (!last || card.querySelector('[data-act="title"]')) continue;
      const b = document.createElement('button'); b.className = 'btn'; b.dataset.act = 'title'; b.textContent = 'Main menu';
      b.addEventListener('click', () => { if (g.game.title) g.game.title(); else location.reload(); });
      last.after(b);
    }
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
    panel.innerHTML = '<div class="vg-lobby-row"><b class="vg-code"></b><button class="vg-copy" type="button">Copy invite</button><button class="vg-private" type="button">New room</button></div><div class="vg-roster"></div>';
    pick.append(lab, seg, panel);
    const coop = seg.querySelector('[data-sq="coop"]'), name = window.GunslingerMenu.nameInput || null, code = panel.querySelector('.vg-code'), roster = panel.querySelector('.vg-roster'), copy = panel.querySelector('.vg-copy');
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
      if (m === 'coop') { if (name) name.value = N.name(); N.join(N.code || N.defaultCode()); } else N.leave();
      draw();
    };
    N.onChange(draw);
    seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; e.stopPropagation(); if (b.dataset.sq !== mode) { g.events.emit('ui:click', {}); setMode(b.dataset.sq); } });
    panel.addEventListener('click', (e) => e.stopPropagation());
    copy.addEventListener('click', () => {
      const link = N.link(), done = () => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy invite'; }, 1600); };
      const show = () => { if (typeof window.prompt === 'function') window.prompt('Invite link', link); else { copy.textContent = link; } };      // (a desktop shell has no prompt)
      try { navigator.clipboard.writeText(link).then(done, show); } catch (e) { show(); }
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
    const hint = document.querySelector('.gs-hint'); if (hint) hint.innerHTML = 'B · ARMORY &nbsp; E · ABILITY &nbsp; F · LIGHT &nbsp; G T H N · ITEMS &nbsp; 3–9, 0 · WEAPON';
    // with the controls layer the primer is written from the bindings (src/gunslinger.js asks for it)
    g.gsHint = (L, pad, row) => row([['armory', 'ARMORY'], ['dash', 'DASH'], ['ability', 'ABILITY'], ['torch', 'LIGHT'], ['grenade', 'GRENADE'], ['medkit', 'MEDKIT'], ['wave', 'CALL WAVE']]) + (pad ? ' &nbsp; ' + row([['next', 'NEXT WEAPON']]) : ' &nbsp; 3–9, 0 · WEAPON');
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
        note.textContent = `${c.tag}. ${c.passive}. ${c.ability.name} (E): ${c.ability.desc}`;
      };
      classes.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; e.stopPropagation(); D.setClass(b.dataset.class); g.events.emit('ui:click', {}); refresh(); });
      pick.append(lab, classes, note);
      refresh();
      // Start: wave 1, or any wave that is a multiple of five and has been reached before (src/vigil/save.js)
      if (V.reach && D.setStart) {
        const sl = document.createElement('label'); sl.id = 'l-start'; sl.textContent = 'Start';
        const starts = document.createElement('div'); starts.className = 'seg vg-starts'; starts.setAttribute('role', 'group'); starts.setAttribute('aria-labelledby', 'l-start');
        const sn = document.createElement('div'); sn.className = 'm-pick-note';
        const draw = () => {
          const list = V.reach.starts(), at = D.setStart(D.startWave());
          sl.hidden = starts.hidden = sn.hidden = list.length < 2;
          starts.innerHTML = list.slice(-6).map((n) => `<button data-start="${n}" aria-pressed="${n === at}">Wave ${n}</button>`).join('');
          sn.textContent = at > 1 ? `A new vigil begins at wave ${at} with the money and kit of a first wave. Only your Skills carry over.` : 'Reach a wave that is a multiple of five and a new vigil can begin there.';
        };
        starts.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; e.stopPropagation(); D.setStart(+b.dataset.start); g.events.emit('ui:click', {}); draw(); });
        pick.append(sl, starts, sn);
        V.runSave.on(draw); g.events.on('game:state', ({ state }) => { if (state === 'title') draw(); });
        draw();
      }
      this.squad(g, pick);
    }
    // A night put away (src/vigil/save.js) is taken up again from here. It is offered first; beginning a new one
    // leaves it be until the new night's first wave is cleared.
    const deploy = document.querySelector('[data-act="deploy"]');
    if (deploy && V.runSave && deploy.before) {
      const cont = document.createElement('button'); cont.className = 'btn primary'; cont.type = 'button'; cont.dataset.gs = 'continue'; cont.hidden = true;
      const line = document.createElement('p'); line.className = 'vg-saved'; line.hidden = true;
      deploy.before(cont);
      if (deploy.parentElement && deploy.parentElement.after) deploy.parentElement.after(line);
      const refresh = () => {
        const d = V.runSave.read();
        cont.hidden = !d; line.hidden = !d;
        deploy.classList.toggle('primary', !d); deploy.textContent = d ? 'Begin a new vigil' : 'Begin the vigil';
        if (d) { cont.textContent = `Continue · wave ${(d.wave | 0) + 1}`; line.textContent = 'Saved vigil: ' + V.runSaveLine(d) + '. It is lost if the crystal falls.'; }
      };
      cont.addEventListener('click', (e) => { e.stopPropagation(); const d = V.runSave.read(); if (!d) { refresh(); return; } D.resumeNext(d); deploy.click(); });
      deploy.addEventListener('click', (e) => { if (e.isTrusted) D.resumeNext(null); }, true);           // a new night was asked for by hand
      V.runSave.on(refresh);
      g.events.on('game:state', ({ state }) => { if (state === 'title') refresh(); });
      refresh();
    }
    // controls: at a glance on the title, in full in the panel
    const legend = document.querySelector('.m-legend');
    if (legend) {
      const row = document.createElement('div');
      row.innerHTML = '<span><kbd>B</kbd> Armory</span><span><kbd>E</kbd> Ability</span><span><kbd>F</kbd> Light</span><span><kbd>G</kbd><kbd>T</kbd><kbd>H</kbd><kbd>N</kbd> Items</span><span><kbd>3</kbd>–<kbd>9</kbd><kbd>0</kbd> Weapon</span><span><kbd>Tab</kbd> Gunsmith</span><span><kbd>L</kbd> Laser</span><span><kbd>Enter</kbd> Call a wave</span>';
      // the harbor's own row (weapons 1–6, laser/light on T, fire mode, dressings) does not apply here
      for (const r of [...legend.children]) if (/Dress wound/.test(r.textContent)) r.remove();
      const first = legend.firstElementChild;
      if (first && /Fire select/.test(first.textContent)) first.replaceWith(row); else legend.prepend(row);
      for (const s of legend.querySelectorAll('span')) { if (/Cut relay/.test(s.textContent)) s.remove(); }
    }
    const controls = !(window.GunslingerControls && window.GunslingerControls.model) && document.querySelector('[data-pane="controls"]');      // (the binding table says it otherwise)
    if (controls) {
      for (const old of controls.querySelectorAll('.panel-note')) if (/Rifle starts in automatic|Select weapon platform/.test(old.textContent)) old.remove();
      const note = document.createElement('p'); note.className = 'panel-note';
      note.textContent = 'Crystal Vigil: B opens the armory (the fight pauses). E uses your class ability; Z and X use Shockwave and Crystal Aegis once bought. G throws a grenade, T a flare, H uses a medkit, N drops a mine. F toggles the flashlight, V is melee. You carry every rifle from the start: 3 to 7 switch rifle kits and 0 draws the pump shotgun, 8 and 9 draw the flak cannon and the rocket launcher once you have bought them in the armory, Q swaps between rifle and sidearm, 2 with a sidearm out changes pistol, and the mouse wheel steps through them. Tab opens the gunsmith for the weapon in hand; L toggles its laser; I inspects it. Enter calls the next wave at once: press it during a wave to pile more on top, as many as you dare, for a bigger bonus. Hold Alt while aiming to steady your breath.';
      controls.prepend(note);
      for (const dt of controls.querySelectorAll('dt')) { if (/Cut relay/.test(dt.textContent)) dt.parentElement.remove(); else if (/^Melee$/.test(dt.textContent)) { const dd = dt.nextElementSibling; if (dd && /F/.test(dd.textContent)) dd.innerHTML = '<kbd>V</kbd>'; } }
    }
  },
};
