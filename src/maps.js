/* Map registry and selection. Loaded after the map definitions and before the engine.
   The engine reads window.GunslingerMap while it parses, so the choice is made here, at load. */
(function () {
  'use strict';
  const KEY = 'gunslinger.map.v1';
  const maps = (window.GunslingerMaps = window.GunslingerMaps || {});
  maps.harbor = Object.assign({
    id: 'harbor', name: 'Harbor', place: 'Terminal breach',
    modes: [
      { id: 'mission', name: 'Mission', note: 'Cut three relays and reach the boat. About five minutes.' },
      { id: 'holdout', name: 'Holdout', note: 'Endless waves that keep growing. Resupply between waves. How long can you hold?' },
    ],
  }, maps.harbor || {});
  const order = ['harbor', ...Object.keys(maps).filter((id) => id !== 'harbor')];
  let id = null;
  try { const q = new URLSearchParams(location.search); id = q.get('map') || (q.get('room') ? 'vigil' : null); } catch {}      // an invite link names a room on the churchyard
  if (!id) { try { id = localStorage.getItem(KEY); } catch {} }
  if (!maps[id]) id = 'harbor';
  const active = maps[id];
  window.GunslingerMap = active.engine ? active : null;
  window.GunslingerMapSelect = {
    id, order, active,
    get(mapId) { return maps[mapId]; },
    choose(mapId) {
      if (!maps[mapId] || mapId === id) return false;
      try { localStorage.setItem(KEY, mapId); } catch {}
      try {
        const url = new URL(location.href);
        url.searchParams.set('map', mapId);          // the address then says which map it is, and works where storage is blocked
        location.replace(url.toString());
      } catch { location.reload(); }
      return true;
    },
  };
  if (active.bootLine && typeof document !== 'undefined') {
    const msg = document.getElementById('boot-msg');
    if (msg) msg.textContent = active.bootLine;
  }
})();
