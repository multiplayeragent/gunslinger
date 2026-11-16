/* Leaderboards on Multiplayer Agent, one or more for every map and mode.

   A board is declared once (define) with where it belongs, what it ranks and how a score reads; the game submits a
   run's result by the board's id and the title screen lists them by map and mode. A new mode adds its boards the
   same way. Every board keeps a player's best (or, for a career total, the running sum); the server stores one
   whole number per player, so a board whose score is not simply "bigger is better" packs it (see breach-time).

   Without a key or a connection every call resolves to null and nothing is shown as ranked. */
(function () {
  'use strict';
  const boards = new Map(), cache = new Map();
  const online = () => window.GunslingerOnline;
  const num = (n) => Math.round(n).toLocaleString('en-US');
  const DIFFS = ['standard', 'hard', 'brutal'];
  const clock = (ms) => { const s = ms / 1000, m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(1).padStart(4, '0'); };

  /* Names. The service names a leaderboard row only for a player who has made an account (a username and a
     password); everyone else is an id, which this game used to show as "Warden 3F2A". So the name typed on the
     title rides on two boards of its own: up to sixteen characters of forty (A-Z, 0-9, space, - _ .), eight to a
     board, each packed into one whole number under a rank (the player's longest vigil), so that the hundred names
     a read returns are those of the players most likely to be on a board. Names are therefore capitals, and
     anybody may call themselves anything: these are client scores like the rest. */
  const ABC = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.', PART = 8, SPAN = Math.pow(ABC.length, PART), TOP = 1300, NAMES = ['gunslinger-callsign-1', 'gunslinger-callsign-2'];
  const cleanName = (v) => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9 \-_.]/g, '').replace(/\s+/g, ' ').trim().slice(0, PART * 2);
  const packName = (name, rank) => {
    const n = cleanName(name).padEnd(PART * 2, ' '), r = Math.max(0, Math.min(TOP, Math.round(rank || 0)));
    return [0, 1].map((p) => { let code = 0; for (let i = 0; i < PART; i++) code = code * ABC.length + ABC.indexOf(n[p * PART + i]); return r * SPAN + code; });
  };
  const unpackName = (a, b) => {
    let out = '';
    for (const score of [a, b]) { let code = Math.round(score || 0) % SPAN, part = ''; for (let i = 0; i < PART; i++) { part = ABC[code % ABC.length] + part; code = Math.floor(code / ABC.length); } out += part; }
    return out.replace(/\s+/g, ' ').trim();
  };
  let names = null, namesAt = 0, sent = '', queue = Promise.resolve();

  const B = (window.GunslingerBoards = {
    cleanName, packName, unpackName,
    /* the player's own name as a board shows it */
    myName() { return cleanName(online() && online().callsign ? online().callsign() : ''); },
    /* put the name where the others can read it; rank: the player's longest vigil if it is known. Asked for
       often (at the title, on a new best), sent only when the name or the rank has changed. */
    publishName(rank) { return (queue = queue.then(() => B.sendName(rank), () => B.sendName(rank))); },        // one at a time: the last asked for is the last sent
    async sendName(rank) {
      if (!B.available() || B.muted) return false;
      const name = B.myName(); if (!name) return false;
      try {
        const who = await online().identity(); if (!who) return false;
        if (rank == null) { const mine = await who.leaderboard('vigil-waves').myRank(); rank = (mine && mine.score) || 0; }
        const key = name + '|' + rank + '|' + (online().me && online().me.id); if (key === sent) return true;
        const parts = packName(name, rank);
        await Promise.all(NAMES.map((board, i) => who.leaderboard(board).submit(parts[i], 'set')));
        sent = key; names = null;
        return true;
      } catch (e) { console.warn('[boards] name not sent: ' + (e && e.message)); return false; }
    },
    /* every name that can be read, by player id; kept for a minute */
    async names() {
      if (names && Date.now() - namesAt < 60000) return names;
      const out = {};
      try {
        const who = await online().identity(); if (!who) return out;
        const [a, b] = await Promise.all(NAMES.map((board) => who.leaderboard(board).top(100)));
        const second = {}; for (const e of (b && b.entries) || []) second[e.playerId] = e.score;
        for (const e of (a && a.entries) || []) { const n = unpackName(e.score, second[e.playerId] || 0); if (n) out[e.playerId] = n; }
        names = out; namesAt = Date.now();
      } catch (e) { /* the rows keep their ids */ }
      return out;
    },
    /* { id, name (the board on the server), map, mode, title (the mode), what (what it ranks), kind: 'max' | 'inc',
         encode?(value) -> whole number, text(score) -> how a score reads } */
    define(def) { boards.set(def.id, { kind: 'max', encode: (v) => Math.round(+v || 0), ...def }); return B; },
    get(id) { return boards.get(id) || null; },
    list(map) { return [...boards.values()].filter((b) => !map || b.map === map); },
    maps() { const seen = []; for (const b of boards.values()) if (seen.indexOf(b.map) < 0) seen.push(b.map); return seen; },
    available() { return !!(online() && online().available()); },

    /* a run's result; resolves { score, rank, total, text, best } (best: this was the player's best) or null */
    async submit(id, value) {
      const def = boards.get(id); if (!def || !B.available() || B.muted) return null;
      const score = def.encode(value); if (!(score > 0)) return null;
      try {
        const who = await online().identity(); if (!who) return null;
        const res = await who.leaderboard(def.name).submit(score, def.kind === 'inc' ? 'inc' : 'max');
        cache.delete(id);
        if (!res) return null;
        if (id === 'vigil-waves') B.publishName(res.score);                 // the name rides under the longest vigil
        return { score: res.score, rank: res.rank, total: res.total, text: def.text(res.score), best: def.kind === 'inc' || res.score === score };
      } catch (e) { console.warn('[boards] ' + id + ' not submitted: ' + (e && e.message)); return null; }
    },
    /* the top of a board and where this player stands; kept for half a minute */
    async top(id, n = 10) {
      const def = boards.get(id); if (!def || !B.available()) return null;
      const hit = cache.get(id); if (hit && hit.n >= n && Date.now() - hit.at < 30000) return hit.data;
      try {
        const who = await online().identity(); if (!who) return null;
        const b = who.leaderboard(def.name), [t, mine, called] = await Promise.all([b.top(n), b.myRank(), B.names()]);
        const me = online().me && online().me.id, mineIs = B.myName();
        const data = {
          entries: (t.entries || []).map((e) => ({ rank: e.rank, name: (me && e.playerId === me && mineIs) || e.username || called[e.playerId] || online().nameOf(e), text: def.text(e.score), score: e.score, me: !!me && e.playerId === me })),
          total: t.total || 0,
          mine: mine && mine.rank ? { rank: mine.rank, total: mine.total, text: def.text(mine.score), score: mine.score } : null,
        };
        cache.set(id, { at: Date.now(), n, data });
        return data;
      } catch (e) { return null; }
    },
    clock, num,
  });

  // ---- the Harbor
  /* fastest run: the server keeps the highest number, so the score is the time left in an hour, in milliseconds,
     with the difficulty in the last two bits (it only breaks ties between equal times) */
  B.define({ id: 'breach-time', name: 'gunslinger-breach-time', map: 'harbor', mode: 'mission', title: 'Terminal Breach', what: 'Fastest extraction',
    encode: (v) => { const ms = Math.max(0, Math.min(3599999, Math.round((+v.time || 0) * 1000))); return (3600000 - ms) * 4 + Math.max(0, DIFFS.indexOf(v.diff)); },
    text: (s) => clock(3600000 - Math.floor(s / 4)) + ' · ' + (DIFFS[s % 4] || 'hard') });
  B.define({ id: 'holdout-score', name: 'gunslinger-holdout-score', map: 'harbor', mode: 'holdout', title: 'Holdout', what: 'Highest score', text: (s) => num(s) });
  B.define({ id: 'holdout-waves', name: 'gunslinger-holdout-waves', map: 'harbor', mode: 'holdout', title: 'Holdout', what: 'Most waves cleared', text: (s) => 'wave ' + s });
  // ---- the Churchyard (the first two boards predate this file and keep their names)
  B.define({ id: 'vigil-waves', name: 'vigil-waves', map: 'vigil', mode: 'vigil', title: 'Crystal Vigil', what: 'Longest vigil', text: (s) => 'wave ' + s });
  B.define({ id: 'vigil-kills', name: 'vigil-kills', map: 'vigil', mode: 'vigil', title: 'Crystal Vigil', what: 'Most zombies in one vigil', text: (s) => num(s) });
  B.define({ id: 'vigil-squad', name: 'gunslinger-vigil-squad-waves', map: 'vigil', mode: 'squad', title: 'Crystal Vigil · Squad', what: 'Longest vigil with a squad', text: (s) => 'wave ' + s });
  // ---- across every map
  B.define({ id: 'career-kills', name: 'gunslinger-career-kills', map: 'career', mode: 'career', title: 'Career', what: 'Machines and zombies destroyed', kind: 'inc', text: (s) => num(s) });
  B.define({ id: 'career-outfits', name: 'gunslinger-outfits', map: 'career', mode: 'career', title: 'Career', what: 'Outfits earned', text: (s) => s + ' of 26' });
  B.MAP_NAMES = { harbor: 'Harbor', vigil: 'Churchyard', career: 'Career' };
  // ?noboards=1: play without writing to the boards (scripted runs, recordings)
  try { B.muted = new URLSearchParams(location.search).has('noboards'); } catch (e) { B.muted = false; }
})();
