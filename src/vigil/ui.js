/* Crystal Vigil's HUD additions (crystal integrity, cash, carried items, abilities, rifle kits) and the armory. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const money = (n) => '$' + Math.floor(n).toLocaleString('en-US');
  const ROMAN = ['', 'I', 'II', 'III'];
  const TABS = [['guns', 'Rifle kits'], ['gear', 'Gear'], ['abilities', 'Abilities'], ['defenses', 'Defenses']];

  function catalog(g, S) {
    const D = V.director, A = D.api, items = [], p = g.player, DEF = V.DEF;
    for (const id of V.KIT_ORDER) {
      const k = V.KITS[id];
      items.push({
        id, tab: 'guns', name: k.name, desc: k.desc, stat: `${k.dmg}${k.pellets ? '×' + k.pellets : ''} dmg · ${k.rpm} rpm · ${k.mag} rds · key ${k.slot}`,
        price: () => k.price, state: () => (S.kits[id] ? (S.kit === id ? 'EQUIPPED' : 'OWNED') : null), buy: () => { A.giveKit(id, true); A.applyClassStats(true); },
      });
    }
    items.push({ id: 'ammo', tab: 'guns', name: 'Ammo Resupply', desc: 'Refills magazines and reserve ammunition for every kit you own.', stat: 'All kits', price: () => 150, state: () => (A.ammoFull() ? 'FULL' : null), buy: () => A.refillAmmo() });
    const stock = (id, key, name, desc, price, max, hotkey) => items.push({
      id, tab: 'gear', name, desc, stat: () => `Carried ${S.items[key]}/${max} · key ${hotkey}`, price: () => price, state: () => (S.items[key] >= max ? 'MAX' : null), buy: () => { S.items[key]++; },
    });
    stock('grenade', 'grenades', 'Frag Grenade', 'Thrown explosive with a two-second fuse. Clears a packed doorway.', 120, 6, 'G');
    stock('flare', 'flares', 'Flare', 'Throw to light an area red for 24 seconds.', 60, 6, 'T');
    stock('medkit', 'medkits', 'Medkit', 'Restores 60 health (full health for the Medic).', 150, 5, 'H');
    stock('mine', 'mines', 'Proximity Mine', 'Placed at your feet. Detonates when a zombie steps close.', 200, 5, 'N');
    items.push({ id: 'armor', tab: 'gear', name: 'Body Armor', desc: '100 armor points. Armor absorbs 60% of incoming damage until it breaks.', stat: () => `Armor ${Math.ceil(S.armor)}/100`, price: () => 350, state: () => (S.armor >= 100 ? 'FULL' : null), buy: () => { S.armor = 100; } });
    items.push({ id: 'respawn', tab: 'gear', name: 'Respawn', desc: 'One extra life. Without one, going down leaves the crystal to your guards and turrets until the wave ends.', stat: () => `Held ${S.tokens}/3`, price: () => 1000 + 500 * S.tokensBought, state: () => (S.tokens >= 3 ? 'MAX' : null), buy: () => { S.tokens++; S.tokensBought++; if (S.down && S.down.waiting) { S.tokens--; A.respawn(); } } });
    items.push({ id: 'repair', tab: 'gear', name: 'Crystal Repair', desc: "Restores 25% of the crystal's integrity.", stat: () => `Crystal ${Math.ceil((S.crystal.hp / S.crystal.max) * 100)}%`, price: () => 500, state: () => (S.crystal.hp >= S.crystal.max ? 'FULL' : null), buy: () => D.healCrystal(0.25) });
    items.push({
      id: 'abilityup', tab: 'abilities', name: () => `${S.cls.ability.name} ${ROMAN[Math.min(3, S.abilityLvl + 1)]}`,
      desc: () => `Upgrade your class ability (E): stronger effect and an 18% shorter cooldown. ${S.cls.ability.desc}`, stat: () => `Rank ${S.abilityLvl}/3`,
      price: () => 900 * S.abilityLvl, state: () => (S.abilityLvl >= 3 ? 'MAX' : null), buy: () => { S.abilityLvl++; },
    });
    const perk = (id, name, desc, price, stat) => items.push({ id, tab: 'abilities', name, desc, stat, price: () => price, state: () => (S.perks[id] ? 'OWNED' : null), buy: () => { S.perks[id] = true; if (id === 'extmag') A.applyKit(S.kit, false); A.applyClassStats(true); } });
    perk('shockwave', 'Shockwave', 'Active (Z): blast every zombie within 9m away from you, stunning and damaging them. 30s cooldown.', 900, 'Active · key Z');
    perk('aegis', 'Crystal Aegis', 'Active (X): the crystal cannot be damaged for 10 seconds. 90s cooldown.', 1400, 'Active · key X');
    perk('hollow', 'Hollow Points', '+20% damage with every gun.', 1200, 'Passive');
    perk('quickhands', 'Quick Hands', 'Reload 35% faster.', 600, 'Passive');
    perk('extmag', 'Extended Mags', '+40% magazine size on every rifle kit.', 900, 'Passive');
    perk('thickskin', 'Thick Skin', 'Take 25% less damage.', 800, 'Passive');
    perk('marathon', 'Marathon', '+12% move speed and sprint more than twice as long.', 500, 'Passive');
    perk('scavenger', 'Scavenger', '+25% cash from every kill.', 700, 'Passive');
    const deploy = (kind, base, desc, stat) => items.push({
      id: kind, tab: 'defenses', name: DEF[kind].name, desc, stat: () => `${stat} · ${V.defenses.count(kind) + V.defenses.pendingCount(kind)}/${DEF[kind].max} deployed`,
      price: () => Math.round((base * (S.cls.defDiscount || 1)) / 10) * 10,
      state: () => (V.defenses.count(kind) + V.defenses.pendingCount(kind) >= DEF[kind].max ? 'MAX' : !p.alive ? 'DOWN' : null), buy: (price) => V.defenses.beginPlace(kind, price),
    });
    deploy('guard', 900, 'A rifleman who holds the spot you choose and fires three-round bursts at anything in sight. Place after closing the armory.', '220 HP · 26m range');
    deploy('turret', 1200, 'Automated machine gun on a tripod. High rate of fire, never sleeps. Place after closing the armory.', '320 HP · 22m range');
    deploy('floodlight', 300, 'A bright work light on a stand. Lights up an approach so you and your guards can see what is coming.', 'Cannot be destroyed');
    items.push({ id: 'fix', tab: 'defenses', name: 'Repair Defenses', desc: 'Restores every guard and turret to full health.', stat: 'All guards and turrets', price: () => 250, state: () => (V.defenses.damaged() ? null : 'FULL'), buy: () => V.defenses.repairAll() });
    return items;
  }

  V.ui = {
    install(g, S) {
      const self = this, ui = document.getElementById('ui');
      const hud = el('div', 'vg-hud');
      hud.innerHTML = `
        <div class="vg-crystal"><span class="vg-k">Crystal</span><div class="vg-bar"><i id="vg-cfill"></i></div><b id="vg-cpct">100%</b></div>
        <div class="vg-cash" id="vg-cash">$0</div>
        <div class="vg-left">
          <div class="vg-row" id="vg-tokens"></div>
          <div class="vg-row vg-armor" id="vg-armor"><span class="vg-k">Armor</span><div class="vg-bar thin"><i id="vg-afill"></i></div></div>
          <div class="vg-row" id="vg-items"></div>
          <div class="vg-row" id="vg-abil"></div>
        </div>
        <div class="vg-kits" id="vg-kits"></div>
        <div class="vg-toasts" id="vg-toasts"></div>
        <div class="vg-down" id="vg-down"></div>`;
      ui.appendChild(hud);
      const $ = (id) => document.getElementById(id);
      const shop = el('div', 'vg-shop');
      shop.innerHTML = `<div class="vg-panel"><header><h2>Armory</h2><span id="vg-shopnote"></span><b id="vg-shopcash">$0</b><button class="btn small" id="vg-shopclose">Close <kbd>B</kbd></button></header>
        <nav id="vg-tabs">${TABS.map(([id, name]) => `<button data-tab="${id}">${name}</button>`).join('')}</nav><div id="vg-grid"></div>
        <p class="vg-foot">The fight is paused while the armory is open. Guards, turrets and floodlights are set down after you close it.</p></div>`;
      ui.appendChild(shop);
      const items = catalog(g, S);
      let tab = 'guns', last = {};
      const val = (x, a) => (typeof x === 'function' ? x(a) : x);
      function render() {
        $('vg-shopcash').textContent = money(S.money);
        for (const b of $('vg-tabs').children) b.classList.toggle('on', b.dataset.tab === tab);
        const q = V.defenses.queue.length;
        $('vg-shopnote').textContent = q ? `${q} item${q > 1 ? 's' : ''} to place when you close the armory` : `${S.cls.name} · ${S.cls.passive}`;
        $('vg-grid').innerHTML = items.filter((i) => i.tab === tab).map((i) => {
          const price = i.price(), st = i.state(), poor = !st && S.money < price;
          return `<button class="vg-card${st ? ' done' : poor ? ' poor' : ''}" data-id="${i.id}"><span class="cn">${val(i.name)}</span><span class="cs">${val(i.stat) || ''}</span><span class="cd">${val(i.desc)}</span><span class="cp">${st || money(price)}</span></button>`;
        }).join('');
      }
      function buy(item) {
        if (!item) return;
        const price = item.price(), st = item.state();
        if (st === 'OWNED' && item.tab === 'guns') { V.director.api.applyKit(item.id, true); V.director.api.applyClassStats(true); V.audio.play('ui_click'); render(); return; }
        if (st || S.money < price) { V.audio.play('deny'); return; }
        S.money -= price; item.buy(price); V.audio.play('purchase'); render();
      }
      $('vg-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.tab; V.audio.play('ui_click'); render(); });
      $('vg-grid').addEventListener('click', (e) => { const c = e.target.closest('.vg-card'); if (c) buy(items.find((i) => i.id === c.dataset.id)); });
      $('vg-shopclose').addEventListener('click', () => V.director.closeShop());

      const toasts = [];
      Object.assign(self, {
        root: hud, shop,
        toast(text) { const t = el('div', 'vg-toast', text); $('vg-toasts').appendChild(t); toasts.push({ el: t, life: 4.2 }); while (toasts.length > 4) toasts.shift().el.remove(); },
        openShop() { document.body.classList.add('vg-shop-open'); render(); },
        closeShop() { document.body.classList.remove('vg-shop-open'); },
        setVisible(on) { hud.classList.toggle('on', !!on); },
        reset() { for (const t of toasts) t.el.remove(); toasts.length = 0; last = {}; },
        update(dt) {
          for (let i = toasts.length - 1; i >= 0; i--) { const t = toasts[i]; t.life -= dt; if (t.life < 0.5) t.el.classList.add('out'); if (t.life <= 0) { t.el.remove(); toasts.splice(i, 1); } }
          if (!hud.classList.contains('on')) return;
          const set = (key, v, fn) => { if (last[key] !== v) { last[key] = v; fn(v); } };
          const frac = S.crystal.hp / S.crystal.max;
          set('cf', Math.round(frac * 200), () => { $('vg-cfill').style.width = (frac * 100).toFixed(1) + '%'; $('vg-cpct').textContent = Math.ceil(frac * 100) + '%'; hud.classList.toggle('crit', frac < 0.3); });
          set('shield', S.crystal.shield > 0, (v) => hud.classList.toggle('shield', v));
          set('cash', Math.floor(S.money), (v) => { $('vg-cash').textContent = money(v); });
          set('tok', S.tokens, (v) => { $('vg-tokens').innerHTML = `<span class="vg-k">Respawns</span>${'<i class="vg-pip"></i>'.repeat(v) || '<em>none</em>'}`; });
          set('arm', Math.ceil(S.armor), (v) => { $('vg-armor').classList.toggle('has', v > 0); $('vg-afill').style.width = v + '%'; });
          const it = S.items;
          set('items', `${it.grenades}|${it.flares}|${it.medkits}|${it.mines}`, () => {
            $('vg-items').innerHTML = [['G', 'Grenade', it.grenades], ['T', 'Flare', it.flares], ['H', 'Medkit', it.medkits], ['N', 'Mine', it.mines]].map(([k, n, c]) => `<span class="vg-chip${c ? '' : ' off'}"><kbd>${k}</kbd>${n}<b>${c}</b></span>`).join('');
          });
          const cdt = (v) => (v > 0 ? Math.ceil(v) + 's' : 'ready');
          set('abil', `${S.cls.id}|${cdt(S.cd.ability)}|${S.perks.shockwave ? cdt(S.cd.shock) : ''}|${S.perks.aegis ? cdt(S.cd.aegis) : ''}|${S.torch}|${S.buff.adrenaline > 0}|${S.buff.overclock > 0}`, () => {
            const chip = (k, n, cd, on) => `<span class="vg-chip${cd > 0 ? ' off' : ''}${on ? ' live' : ''}"><kbd>${k}</kbd>${n}<b>${cdt(cd)}</b></span>`;
            $('vg-abil').innerHTML = chip('E', S.cls.ability.name, S.cd.ability, S.buff.adrenaline > 0 || S.buff.overclock > 0) + (S.perks.shockwave ? chip('Z', 'Shockwave', S.cd.shock) : '') + (S.perks.aegis ? chip('X', 'Aegis', S.cd.aegis, S.crystal.shield > 0) : '') + `<span class="vg-chip${S.torch ? ' live' : ''}"><kbd>F</kbd>Light</span>`;
          });
          set('kits', `${S.kit}|${Object.keys(S.kits).join(',')}`, () => {
            $('vg-kits').innerHTML = V.KIT_ORDER.filter((id) => S.kits[id]).map((id) => `<span class="vg-kit${id === S.kit ? ' on' : ''}"><kbd>${V.KITS[id].slot}</kbd>${V.KITS[id].name}</span>`).join('');
          });
          const down = S.down ? (S.down.waiting ? 'Down — your defenses must hold until the wave ends' : `Down — back on your feet in ${Math.max(1, Math.ceil(4 - S.down.t))}`) : S.over ? 'The crystal has fallen' : S.placing ? `Placing ${V.DEF[S.placing.kind].name} — click to set down, right click to cancel` : '';
          set('down', down, (v) => { $('vg-down').textContent = v; $('vg-down').classList.toggle('on', !!v); });
        },
      });
    },
    toast() {}, update() {}, reset() {}, setVisible() {}, openShop() {}, closeShop() {},
  };
})();
