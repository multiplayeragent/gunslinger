/* Crystal Vigil's HUD additions (crystal integrity, cash, carried items, abilities, rifle kits) and the armory. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const money = (n) => '$' + Math.floor(n).toLocaleString('en-US');
  // the key or controller button an action is on (src/controls.js), or the key it was made with
  const CT = () => (window.GunslingerControls && window.GunslingerControls.model ? window.GunslingerControls : null);
  const L = (id, was) => { const c = CT(), t = c && c.label(id); return c ? t || '—' : was; };
  const ROMAN = ['', 'I', 'II', 'III'];
  const TABS = [['guns', 'Weapons'], ['gear', 'Gear'], ['abilities', 'Abilities'], ['defenses', 'Defenses'], ['skills', 'Lifeforce']];
  const SHOP_FOOT = 'The fight is paused while the armory is open. Guards, turrets and floodlights are set down after you close it. Ammunition is not sold here: it is at the pile by the crates on the east wall.';
  const TREE_FOOT = 'Lifeforce is the green light the dead leave where they fall: walk into it to take it. What it buys here works at once and is gone when the night ends. These are not the Skills on the title screen: those are bought with levels, and kept.';

  function catalog(g, S) {
    const D = V.director, A = D.api, items = [], p = g.player, DEF = V.DEF;
    // a night starts with the pistol: every other weapon is bought here, and comes with some of the ammunition it takes
    for (const id of V.KIT_ORDER) {
      const k = V.KITS[id];
      items.push({
        id, tab: 'guns', fresh: !!k.buy, name: k.name, desc: k.desc, stat: (k.shell ? `${k.dmg} blast · ${V.SHELLS[k.shell].radius} m` : `${k.dmg}${k.pellets ? '×' + k.pellets : ''} dmg · ${k.rpm} rpm`) + ` · ${k.gives} ${V.AMMO[k.ammo].name} · key ${k.slot}`,
        price: () => k.price, state: () => (S.kits[id] ? (S.kit === id ? 'EQUIPPED' : 'OWNED') : null), buy: () => { A.giveKit(id, true); A.applyClassStats(true); },
        equip: () => { A.applyKit(id, true); A.applyClassStats(true); },
      });
    }
    for (const id of V.SIDEARM_ORDER) {
      const s = V.SIDEARMS[id];
      items.push({
        id: 'side-' + id, tab: 'guns', name: s.name, desc: s.desc, stat: `${s.dmg} dmg · sidearm · Q, then 2 to change`,
        price: () => s.price, state: () => (S.sidearm === id ? 'EQUIPPED' : 'OWNED'), buy: () => A.giveSidearm(id), equip: () => A.giveSidearm(id),
      });
    }
    const stock = (id, key, name, desc, price, max, hotkey) => items.push({
      id, tab: 'gear', name, desc, stat: () => `Carried ${S.items[key]}/${max} · ${L(id, hotkey)}`, price: () => price, state: () => (S.items[key] >= max ? 'MAX' : null), buy: () => { S.items[key]++; },
    });
    stock('grenade', 'grenades', 'Frag Grenade', 'Thrown explosive with a two-second fuse. Clears a packed doorway.', 120, 6, 'G');
    stock('flare', 'flares', 'Flare', 'Throw to light an area red for 24 seconds.', 60, 6, 'T');
    stock('medkit', 'medkits', 'Medkit', 'Restores 60 health (full health for the Medic).', 150, 5, 'H');
    stock('mine', 'mines', 'Proximity Mine', 'Placed at your feet. Detonates when a zombie steps close.', 200, 5, 'N');
    items.push({ id: 'armor', tab: 'gear', name: 'Body Armor', desc: '100 armor points. Armor absorbs 60% of incoming damage until it breaks.', stat: () => `Armor ${Math.ceil(S.armor)}/100`, price: () => 350, state: () => (S.armor >= 100 ? 'FULL' : null), buy: () => { S.armor = 100; } });
    items.push({ id: 'respawn', tab: 'gear', name: 'Respawn', desc: 'One extra life. Without one, going down leaves the crystal to your guards and turrets until the wave ends.', stat: () => `Held ${S.tokens}/3`, price: () => 1000 + 500 * S.tokensBought, state: () => (S.tokens >= 3 ? 'MAX' : null), buy: () => { S.tokens++; S.tokensBought++; if (S.down && S.down.waiting) { S.tokens--; A.respawn(); } } });
    // The two repairs are paid for by what is broken (`partial`: with less money than that, what there is buys its share).
    const gone = () => Math.max(0, 1 - S.crystal.hp / S.crystal.max);
    items.push({ id: 'repair', tab: 'gear', name: 'Crystal Repair', partial: true, desc: 'Mends the crystal. You pay for what is broken: all of it if you can, or as much as your money covers.',
      stat: () => `Crystal ${Math.ceil((S.crystal.hp / S.crystal.max) * 100)}%`, price: () => Math.max(10, V.repairCost([{ worth: V.REPAIR.crystal, gone: gone() }])),
      state: () => (S.crystal.hp >= S.crystal.max ? 'FULL' : null), buy: (paid, price) => D.healCrystal(gone() * Math.min(1, paid / price)) });
    items.push({
      id: 'abilityup', tab: 'abilities', name: () => `${S.cls.ability.name} ${ROMAN[Math.min(3, S.abilityLvl + 1)]}`,
      desc: () => `Upgrade your class ability (${L('ability', 'E')}): stronger effect and an 18% shorter cooldown. ${S.cls.ability.desc}`, stat: () => `Rank ${S.abilityLvl}/3`,
      price: () => 900 * S.abilityLvl, state: () => (S.abilityLvl >= 3 ? 'MAX' : null), buy: () => { S.abilityLvl++; },
    });
    const perk = (id, name, desc, price, stat) => items.push({ id, tab: 'abilities', name, desc, stat, price: () => price, state: () => (S.perks[id] ? 'OWNED' : null), buy: () => { S.perks[id] = true; if (id === 'extmag') A.applyKit(S.kit, false); A.applyClassStats(true); } });
    perk('shockwave', 'Shockwave', 'Active: blast every zombie within 9m away from you, stunning and damaging them. 30s cooldown.', 900, () => 'Active · ' + L('shockwave', 'Z'));
    perk('aegis', 'Crystal Aegis', 'Active: the crystal cannot be damaged for 10 seconds. 90s cooldown.', 1400, () => 'Active · ' + L('aegis', 'X'));
    perk('hollow', 'Hollow Points', '+20% damage with every gun.', 1200, 'Passive');
    perk('quickhands', 'Quick Hands', '+15% rate of fire with every rifle.', 600, 'Passive');
    perk('extmag', 'Bandolier', 'Carry 40% more of every kind of ammunition.', 900, 'Passive');
    perk('brace', 'Recoil Harness', '30% less recoil with every gun.', 500, 'Passive');
    perk('thickskin', 'Thick Skin', 'Take 25% less damage.', 800, 'Passive');
    perk('marathon', 'Marathon', '+12% move speed and sprint more than twice as long.', 500, 'Passive');
    perk('scavenger', 'Scavenger', '+25% cash from every kill.', 700, 'Passive');
    const deploy = (kind, base, desc, stat) => items.push({
      id: kind, tab: 'defenses', name: DEF[kind].name, desc, stat: () => `${stat} · ${V.defenses.count(kind) + V.defenses.pendingCount(kind)}/${DEF[kind].max} deployed`,
      price: () => Math.round((base * (S.cls.defDiscount || 1)) / 10) * 10,
      state: () => (V.defenses.count(kind) + V.defenses.pendingCount(kind) >= DEF[kind].max ? 'MAX' : !p.alive ? 'DOWN' : null), buy: (price) => V.defenses.beginPlace(kind, price),
    });
    deploy('guard', DEF.guard.price, 'A rifleman who holds the spot you choose and fires three-round bursts at anything in sight. Place after closing the armory.', '220 HP · 26m range');
    deploy('turret', DEF.turret.price, 'Automated machine gun on a tripod. High rate of fire, never sleeps. Place after closing the armory.', '320 HP · 22m range');
    deploy('floodlight', DEF.floodlight.price, 'A bright work light on a stand. Lights up an approach so you and your guards can see what is coming.', 'Cannot be destroyed');
    items.push({ id: 'fix', tab: 'defenses', name: 'Repair Defenses', partial: true, desc: `Mends every guard and turret. You pay for the damage: ${Math.round(V.REPAIR.defense * 100)}% of what each cost new, for the share of it that is gone. All of it if you can, or as much as your money covers.`,
      stat: 'All guards and turrets', price: () => Math.max(10, V.defenses.repairCost()), state: () => (V.defenses.damaged() ? null : 'FULL'), buy: (paid, price) => V.defenses.repairAll(Math.min(1, paid / price)) });
    return items;
  }

  V.ui = {
    install(g, S) {
      const self = this, ui = document.getElementById('ui');
      const hud = el('div', 'vg-hud');
      hud.innerHTML = `
        <div class="vg-hurt" id="vg-hurt"></div>
        <div class="vg-pops" id="vg-pops"></div>
        <div class="vg-bosses" id="vg-bosses"></div>
        <div class="vg-crystal"><span class="vg-k">Crystal</span><div class="vg-bar"><i id="vg-cfill"></i></div><b id="vg-cpct">100%</b></div>
        <div class="vg-cash" id="vg-cash">$0</div>
        <div class="vg-life" id="vg-life"><i class="vg-wisp"></i><b id="vg-lifen">0</b><span>Lifeforce</span></div>
        <div class="vg-left">
          <div class="vg-row" id="vg-tokens"></div>
          <div class="vg-row vg-armor" id="vg-armor"><span class="vg-k">Armor</span><div class="vg-bar thin"><i id="vg-afill"></i></div></div>
          <div class="vg-row" id="vg-items"></div>
          <div class="vg-row" id="vg-abil"></div>
        </div>
        <div class="vg-kits" id="vg-kits"></div>
        <div class="vg-pools" id="vg-pools"></div>
        <div class="vg-toasts" id="vg-toasts"></div>
        <div class="vg-down" id="vg-down"></div>`;
      ui.appendChild(hud);
      const $ = (id) => document.getElementById(id);
      const shop = el('div', 'vg-shop');
      shop.innerHTML = `<div class="vg-panel"><header><h2>Armory</h2><span id="vg-shopnote"></span><b id="vg-shoplife-wrap" title="Lifeforce"><i class="vg-wisp"></i><span id="vg-shoplife">0</span></b><b id="vg-shopcash">$0</b><button class="btn small" id="vg-shopclose">Close <kbd>B</kbd></button></header>
        <nav id="vg-tabs">${TABS.map(([id, name]) => `<button data-tab="${id}">${name}</button>`).join('')}</nav><div id="vg-grid"></div>
        <p class="vg-foot" id="vg-foot"></p></div>`;
      ui.appendChild(shop);
      const items = catalog(g, S), A = V.director.api;
      let tab = 'guns', last = {};
      const val = (x, a) => (typeof x === 'function' ? x(a) : x);
      // what the armory asks: the card's own price times the night's rate (`V.ECON.cost`; `costNew` for a gun that
      // is not in the starting rack), to the nearest ten dollars
      const priceOf = (i) => Math.round((i.price() * ((i.fresh ? V.ECON.costNew : V.ECON.cost) || 1)) / 10) * 10;
      function render() {
        $('vg-shopcash').textContent = money(S.money);
        $('vg-shopclose').innerHTML = `Close <kbd>${CT() && CT().device() === 'pad' ? 'B' : L('armory', 'B')}</kbd>`;
        for (const b of $('vg-tabs').children) b.classList.toggle('on', b.dataset.tab === tab);
        const q = V.defenses.queue.length;
        $('vg-shopnote').textContent = q ? `${q} item${q > 1 ? 's' : ''} to place when you close the armory` : `${S.cls.name} · ${S.cls.passive}`;
        const LF = V.life, tree = tab === 'skills' && LF;
        $('vg-shoplife').textContent = LF ? LF.have : '';
        $('vg-grid').classList.toggle('tree', !!tree);
        $('vg-foot').textContent = tree ? TREE_FOOT : SHOP_FOOT;
        if (tree) { $('vg-grid').innerHTML = skillTree(LF); return; }
        $('vg-grid').innerHTML = items.filter((i) => i.tab === tab).map((i) => {
          const price = priceOf(i), st = i.state(), poor = !st && (i.partial ? S.money < 10 : S.money < price);
          return `<button class="vg-card${st ? ' done' : poor ? ' poor' : ''}" data-id="${i.id}"><span class="cn">${val(i.name)}</span><span class="cs">${val(i.stat) || ''}</span><span class="cd">${val(i.desc)}</span><span class="cp">${st || money(price)}</span></button>`;
        }).join('');
      }
      // The Lifeforce tab: the night's own skills, three branches side by side, each skill under the one it needs.
      function skillTree(LF) {
        return V.RITE_BRANCHES.map((branch) => {
          const nodes = V.RITES.filter((s) => s.branch === branch).map((s) => {
            const have = LF.rank(s.id), why = LF.blocked(s.id), price = LF.price(s.id);
            const cls = !why ? ' open' : why === 'Learned' ? ' done' : /lifeforce/.test(why) ? ' poor' : ' locked';
            const pips = Array.from({ length: s.max }, (_, i) => `<i class="${i < have ? 'on' : ''}"></i>`).join('');
            const label = why === 'Learned' ? 'Learned' : cls === ' locked' ? why : `<i class="vg-wisp"></i>${price}`;
            return `<button class="vg-node${cls}" data-skill="${s.id}"><span class="nn">${s.name}</span><span class="np">${pips}</span><span class="nd">${s.text}</span><span class="nc">${label}</span></button>`;
          }).join('');
          return `<section class="vg-branch"><h3>${branch}</h3>${nodes}</section>`;
        }).join('') + tradeRow(LF);
      }
      // under the tree: lifeforce given up for money, a lot at a time or all of it
      function tradeRow(LF) {
        const L = V.LIFE, lot = L.lot, have = LF.have;
        const b = (n, label, pay) => `<button class="vg-trade-b${n ? '' : ' poor'}" data-trade="${n || ''}"${n ? '' : ' disabled'}><i class="vg-wisp"></i>${label}<b>${money(pay)}</b></button>`;
        return `<section class="vg-trade"><h3>Trade</h3><p>Lifeforce can be given up for money: $${L.cash} a point.</p>${b(have >= lot ? lot : 0, `${lot} for`, lot * L.cash)}${b(have > 0 ? 'all' : 0, have > 0 ? `All ${have} for` : 'All for', have * L.cash)}</section>`;
      }
      function trade(n) {
        if (A.sellLife(n === 'all' ? 'all' : +n) > 0) V.audio.play('purchase'); else V.audio.play('deny');
        render();
      }
      function learn(id) {
        if (!id) return;
        if (A.learnSkill(id)) { V.audio.play('purchase'); V.audio.play('life_pick', { gain: 0.7, pitch: 1.5 }); } else V.audio.play('deny');
        render();
      }
      function buy(item) {
        if (!item) return;
        const price = priceOf(item), st = item.state();
        if (st === 'OWNED' && item.equip) { item.equip(); V.audio.play('ui_click'); render(); return; }
        // (a repair takes what there is, up to its price, and mends that share)
        const pay = item.partial ? Math.min(price, Math.floor(S.money)) : price;
        if (st || S.money < pay || pay < (item.partial ? 10 : 0)) { V.audio.play('deny'); return; }
        S.money -= pay; item.buy(pay, price); V.audio.play('purchase'); render();
      }
      $('vg-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.tab; V.audio.play('ui_click'); render(); });
      $('vg-grid').addEventListener('click', (e) => { const t = e.target.closest('.vg-trade-b'); if (t) { trade(t.dataset.trade); return; } const n = e.target.closest('.vg-node'); if (n) { learn(n.dataset.skill); return; } const c = e.target.closest('.vg-card'); if (c) buy(items.find((i) => i.id === c.dataset.id)); });
      $('vg-shopclose').addEventListener('click', () => V.director.closeShop());

      const toasts = [];
      const T = g.THREE, calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      let vw = window.innerWidth, vh = window.innerHeight;
      window.addEventListener('resize', () => { vw = window.innerWidth; vh = window.innerHeight; });

      // ---- money that rises off a kill: a small pool of labels pinned to where the body fell ----
      const POP_LIFE = 1.15, pops = [], popV = T ? new T.Vector3() : null;
      for (let i = 0; i < 14; i++) { const e = el('div', 'vg-pop'); $('vg-pops').appendChild(e); pops.push({ el: e, t: POP_LIFE, x: 0, y: 0, z: 0, dx: 0, on: false }); }
      function cashPop(pos, amount, kind) {
        if (!popV || !pos || !(amount > 0)) return;
        // the oldest label is reused when all are in the air
        let p = pops.find((q) => !q.on); if (!p) p = pops.reduce((a, b) => (b.t > a.t ? b : a));
        p.on = true; p.t = 0; p.x = pos.x; p.y = pos.y; p.z = pos.z; p.dx = (Math.random() - 0.5) * 26;
        p.el.className = 'vg-pop' + (kind ? ' ' + kind : '');
        p.el.textContent = '+' + money(amount);
        const cash = $('vg-cash'); cash.classList.remove('gain'); void cash.offsetWidth; cash.classList.add('gain');
      }
      function updatePops(dt) {
        for (const p of pops) {
          if (!p.on) continue;
          p.t += dt;
          const k = p.t / POP_LIFE;
          if (k >= 1) { p.on = false; p.el.style.opacity = '0'; continue; }
          popV.set(p.x, p.y + (calm ? 0.15 : 0.15 + 0.75 * (1 - (1 - k) * (1 - k))), p.z).project(g.camera);
          if (popV.z > 1 || popV.z < -1) { p.el.style.opacity = '0'; continue; }                          // behind the camera
          const sx = (popV.x * 0.5 + 0.5) * vw + p.dx, sy = (-popV.y * 0.5 + 0.5) * vh;
          const near = Math.hypot(p.x - g.camera.position.x, p.z - g.camera.position.z);
          const size = Math.max(0.72, Math.min(1.15, 1.2 - near / 55)) * (calm ? 1 : 1 + 0.35 * Math.max(0, 1 - p.t / 0.14));
          p.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%) scale(${size.toFixed(3)})`;
          p.el.style.opacity = (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4).toFixed(2);
        }
      }

      // ---- what a hit did: a number rising off the body. One a body a frame: a shotgun's pellets are added up ----
      const HIT_LIFE = 0.75, hits = [], struck = new Map();
      for (let i = 0; i < 22; i++) { const e = el('div', 'vg-hit'); $('vg-pops').appendChild(e); hits.push({ el: e, t: HIT_LIFE, x: 0, y: 0, z: 0, dx: 0, on: false }); }
      function hitNumber(z, amount, head) { if (!(amount >= 1) || !z || !z.pos || !popV) return; const a = struck.get(z) || { n: 0, head: false }; a.n += amount; a.head = a.head || !!head; struck.set(z, a); }
      function updateHits(dt) {
        for (const [z, a] of struck) {
          let h = hits.find((q) => !q.on); if (!h) h = hits.reduce((p, q) => (q.t > p.t ? q : p));
          const Z = g.enemies, top = (Z && Z.centreY ? Z.centreY(z) : z.pos.y + 1) + 0.75;
          h.on = true; h.t = 0; h.x = z.pos.x; h.y = top; h.z = z.pos.z; h.dx = (Math.random() - 0.5) * 40;
          h.el.className = 'vg-hit' + (a.head ? ' head' : '') + (a.n >= 140 ? ' big' : ''); h.el.textContent = Math.round(a.n);
        }
        struck.clear();
        for (const h of hits) {
          if (!h.on) continue;
          h.t += dt; const k = h.t / HIT_LIFE;
          if (k >= 1) { h.on = false; h.el.style.opacity = '0'; continue; }
          popV.set(h.x, h.y + (calm ? 0 : 0.7 * k), h.z).project(g.camera);
          if (popV.z > 1 || popV.z < -1) { h.el.style.opacity = '0'; continue; }
          const sx = (popV.x * 0.5 + 0.5) * vw + h.dx * (0.3 + k), sy = (-popV.y * 0.5 + 0.5) * vh;
          h.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%) scale(${(calm ? 1 : 1 + 0.6 * Math.max(0, 1 - h.t / 0.09)).toFixed(3)})`;
          h.el.style.opacity = (k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45).toFixed(2);
        }
      }

      // ---- being hit: red closes in from the edges, thickest on the side the blow came from, and stays in
      // closer the less health is left ----
      const hurtEl = $('vg-hurt'), fwd = T ? new T.Vector3() : null;
      const hurt = { flash: 0, hx: 0, hy: 0, shown: false, beat: 0 };
      function hurtHit(amount, from) {
        hurt.flash = Math.min(1, hurt.flash + 0.34 + amount / 55);
        hurt.hx = hurt.hy = 0;
        if (from && fwd) {
          // where the blow came from, as seen by the player: right / left, and in front / behind
          g.camera.getWorldDirection(fwd);
          const dx = from.x - g.camera.position.x, dz = from.z - g.camera.position.z, d = Math.hypot(dx, dz) || 1, fl = Math.hypot(fwd.x, fwd.z) || 1;
          const fx = fwd.x / fl, fz = fwd.z / fl;
          hurt.hx = (dx * -fz + dz * fx) / d; hurt.hy = (dx * fx + dz * fz) / d;
        }
      }
      function updateHurt(dt) {
        const p = g.player, hf = p.alive && p.maxHealth > 0 ? Math.max(0, Math.min(1, p.health / p.maxHealth)) : 1;
        const low = S.down || S.over ? 0 : Math.max(0, Math.min(1, (0.55 - hf) / 0.45));
        hurt.flash = Math.max(0, hurt.flash - dt * (0.9 + hurt.flash * 1.4));
        if (hurt.flash < 0.004 && low <= 0) { if (hurt.shown) { hurt.shown = false; hurtEl.style.opacity = '0'; } return; }
        hurt.shown = true;
        // a slow pulse while badly hurt: it reads as a heartbeat without moving anything
        hurt.beat += dt * (1.1 + low * 1.5);
        const pulse = calm ? 0.5 : 0.5 + 0.5 * Math.sin(hurt.beat * 6.283);
        const a = Math.min(0.9, hurt.flash * 0.8 + low * (0.4 + 0.2 * pulse));
        const r = Math.max(28, 76 - 32 * low - 18 * hurt.flash);                                         // where clear turns to red, % of the way out: the middle always stays readable
        const k = Math.min(1, hurt.flash * 1.6);
        hurtEl.style.opacity = a.toFixed(3);
        hurtEl.style.setProperty('--r', r.toFixed(1) + '%');
        hurtEl.style.setProperty('--cx', (50 - hurt.hx * 16 * k).toFixed(1) + '%');
        hurtEl.style.setProperty('--cy', (50 + hurt.hy * 12 * k).toFixed(1) + '%');
      }

      Object.assign(self, {
        root: hud, shop, cashPop, hurt: hurtHit, hit: hitNumber,
        // lifeforce gathered: the count by the cash jumps
        lifeGain() { const e = $('vg-life'); e.classList.remove('gain'); void e.offsetWidth; e.classList.add('gain'); },
        showTab(id) { if (TABS.some((t) => t[0] === id)) { tab = id; render(); } },
        toast(text) { const t = el('div', 'vg-toast', text); $('vg-toasts').appendChild(t); toasts.push({ el: t, life: 4.2 }); while (toasts.length > 4) toasts.shift().el.remove(); },
        openShop() {
          // the engine's pause menu is hidden under the armory but still listening to a controller: a slider left
          // focused in its Settings would be moved by the stick, unseen
          const f = document.activeElement; if (f && f !== document.body && f.closest && f.closest('.menu') && f.blur) f.blur();
          document.body.classList.add('vg-shop-open'); render();
        },
        closeShop() { document.body.classList.remove('vg-shop-open'); },
        setVisible(on) { hud.classList.toggle('on', !!on); },
        reset() { for (const t of toasts) t.el.remove(); toasts.length = 0; last = {}; for (const p of pops) { p.on = false; p.el.style.opacity = '0'; } for (const h of hits) { h.on = false; h.el.style.opacity = '0'; } struck.clear(); hurt.flash = 0; hurt.shown = false; hurtEl.style.opacity = '0'; },
        update(dt) {
          for (let i = toasts.length - 1; i >= 0; i--) { const t = toasts[i]; t.life -= dt; if (t.life < 0.5) t.el.classList.add('out'); if (t.life <= 0) { t.el.remove(); toasts.splice(i, 1); } }
          if (!hud.classList.contains('on')) return;
          if (popV) { updatePops(dt); updateHits(dt); updateHurt(dt); }
          const set = (key, v, fn) => { if (last[key] !== v) { last[key] = v; fn(v); } };
          // a boss in the yard: its health across the top of the screen, on every machine
          let bosses = '', nb = 0;
          for (const z of (g.enemies && g.enemies.list) || []) if (z.alive && z.type === 'boss' && z.state !== 2 && nb < 3) { nb++; bosses += Math.max(0, Math.round(500 * z.hp / (z.maxHp || 1))) + ' '; }
          set('boss', bosses, (v) => { $('vg-bosses').innerHTML = v.trim() ? v.trim().split(' ').map((f) => `<div class="vg-bossbar"><span>Abomination</span><div><i style="width:${(+f / 5).toFixed(1)}%"></i></div></div>`).join('') : ''; });
          const frac = S.crystal.hp / S.crystal.max;
          set('cf', Math.round(frac * 200), () => { $('vg-cfill').style.width = (frac * 100).toFixed(1) + '%'; $('vg-cpct').textContent = Math.ceil(frac * 100) + '%'; hud.classList.toggle('crit', frac < 0.3); });
          set('shield', S.crystal.shield > 0, (v) => hud.classList.toggle('shield', v));
          set('cash', Math.floor(S.money), (v) => { $('vg-cash').textContent = money(v); });
          set('life', V.life ? V.life.have : -1, (v) => { $('vg-lifen').textContent = v < 0 ? '' : v; $('vg-life').classList.toggle('none', v < 0); });
          set('tok', S.tokens, (v) => { $('vg-tokens').innerHTML = `<span class="vg-k">Respawns</span>${'<i class="vg-pip"></i>'.repeat(v) || '<em>none</em>'}`; });
          set('arm', Math.ceil(S.armor), (v) => { $('vg-armor').classList.toggle('has', v > 0); $('vg-afill').style.width = v + '%'; });
          const it = S.items;
          const rev = CT() ? CT().rev : 0, pad = !!CT() && CT().device() === 'pad';
          set('items', `${it.grenades}|${it.flares}|${it.medkits}|${it.mines}|${rev}`, () => {
            $('vg-items').innerHTML = [[L('grenade', 'G'), 'Grenade', it.grenades], [L('flare', 'T'), 'Flare', it.flares], [L('medkit', 'H'), 'Medkit', it.medkits], [L('mine', 'N'), 'Mine', it.mines]].map(([k, n, c]) => `<span class="vg-chip${c ? '' : ' off'}"><kbd>${k}</kbd>${n}<b>${c}</b></span>`).join('');
          });
          const cdt = (v) => (v > 0 ? Math.ceil(v) + 's' : 'ready');
          set('abil', `${S.cls.id}|${cdt(S.cd.ability)}|${S.perks.shockwave ? cdt(S.cd.shock) : ''}|${S.perks.aegis ? cdt(S.cd.aegis) : ''}|${S.torch}|${S.buff.adrenaline > 0}|${S.buff.overclock > 0}|${rev}`, () => {
            const chip = (k, n, cd, on) => `<span class="vg-chip${cd > 0 ? ' off' : ''}${on ? ' live' : ''}"><kbd>${k}</kbd>${n}<b>${cdt(cd)}</b></span>`;
            $('vg-abil').innerHTML = chip(L('ability', 'E'), S.cls.ability.name, S.cd.ability, S.buff.adrenaline > 0 || S.buff.overclock > 0) + (S.perks.shockwave ? chip(L('shockwave', 'Z'), 'Shockwave', S.cd.shock) : '') + (S.perks.aegis ? chip(L('aegis', 'X'), 'Aegis', S.cd.aegis, S.crystal.shield > 0) : '') + `<span class="vg-chip${S.torch ? ' live' : ''}"><kbd>${L('torch', 'F')}</kbd>Light</span>`;
          });
          const kinds = Object.keys(V.AMMO).filter((t) => Object.keys(S.kits).some((id) => V.KITS[id].ammo === t));
          set('kits', `${S.kit}|${Object.keys(S.kits).join(',')}|${pad}|${kinds.map((t) => A.have(t) + '/' + A.capOf(t)).join(',')}|${g.weapon.current}`, () => {
            // (a controller has no number row: it steps through them)
            $('vg-kits').innerHTML = V.KIT_ORDER.filter((id) => S.kits[id]).map((id) => `<span class="vg-kit${id === S.kit ? ' on' : ''}">${pad ? '' : `<kbd>${V.KITS[id].slot}</kbd>`}${V.KITS[id].name}</span>`).join('');
            // what is carried of each kind the guns owned take, the kind in hand marked (under the gun panel)
            const inHand = S.kit && g.weapon.current !== 'pistol' ? V.KITS[S.kit].ammo : '';
            $('vg-pools').innerHTML = kinds.map((t) => `<span class="vg-pool${t === inHand ? ' on' : ''}${A.have(t) ? '' : ' out'}">${V.AMMO[t].short} <b>${A.have(t)}</b></span>`).join('');
          });
          const down = S.down ? (S.down.waiting ? 'Down — your defenses must hold until the wave ends' : `Down — back on your feet in ${Math.max(1, Math.ceil(4 - S.down.t))}`) : S.over ? 'The crystal has fallen' : S.placing ? `Placing ${V.DEF[S.placing.kind].name} — ${pad ? L('fire', 'RT') + ' to set down, ' + L('ads', 'LT') + ' to cancel' : 'click to set down, right click to cancel'}`
            : S.pile ? (!S.pile.guns ? 'Ammunition — buy a gun in the armory first' : S.pile.cost > 0 ? `${pad ? L('use', 'X') : L('use', 'E')} — fill up on ammunition for ${money(S.pile.cost)}` : 'Ammunition — you are carrying all you can') : '';
          set('down', down, (v) => { $('vg-down').textContent = v; $('vg-down').classList.toggle('on', !!v); });
        },
      });
    },
    toast() {}, update() {}, reset() {}, setVisible() {}, openShop() {}, closeShop() {}, cashPop() {}, hurt() {}, hit() {}, lifeGain() {}, showTab() {},
  };
})();
