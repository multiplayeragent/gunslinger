/* The player behind this browser on Multiplayer Agent: one durable identity shared by co-op rooms, leaderboards and
   saved progress. With the placeholder key in mp.config.js, or the SDK unreachable, nothing here is available and
   every caller keeps to what it has on this machine. */
(function () {
  'use strict';
  const cfg = () => window.MP_CONFIG || {};
  let player = null, pending = null;
  const O = (window.GunslingerOnline = {
    available() { return !!(window.MP && cfg().key && !/REPLACE_ME/.test(cfg().key)); },
    /* the SDK loads beside the game: resolves true once it and a key are there, false after about 15 s without */
    whenAvailable() {
      return new Promise((resolve) => {
        let tries = 0;
        const wait = () => { if (O.available()) resolve(true); else if (++tries < 60) setTimeout(wait, 250); else resolve(false); };
        wait();
      });
    },
    /* the durable (anonymous until claimed) player, or null */
    async identity() {
      if (player || !O.available()) return player;
      if (!pending) {
        pending = (async () => {
          try { const p = window.MP.auth({ key: cfg().key, apiUrl: cfg().apiUrl }); const me = await p.getPlayer(); player = p; O.me = me || null; }
          catch (e) { console.warn('[online] no player identity: ' + (e && e.message)); }
          pending = null; return player;
        })();
      }
      return pending;
    },
    me: null,
    /* the name typed on the title (the co-op lobby's too: src/vigil/net.js keeps it under the same key) */
    callsign(set) {
      const clean = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
      try {
        if (set !== undefined) { const n = clean(set); if (n) localStorage.setItem('gunslinger.name', n); }
        let n = clean(localStorage.getItem('gunslinger.name'));
        if (!n) { n = 'Warden ' + (100 + Math.floor(Math.random() * 900)); localStorage.setItem('gunslinger.name', n); }
        return n;
      } catch (e) { return set !== undefined ? clean(set) || 'Warden' : 'Warden'; }
    },
    /* how a leaderboard row names its player: a claimed username, or a callsign made from the id */
    nameOf(entry) { return (entry && entry.username) || 'Warden ' + String((entry && entry.playerId) || '').replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase(); },
  });
})();
