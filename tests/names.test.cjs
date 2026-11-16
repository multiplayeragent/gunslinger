const { test } = require('node:test');
const assert = require('node:assert/strict');

// The name on the leaderboards (src/leaderboards.js): the service names a row only for a player with an account, so the
// name typed on the title is packed into two whole numbers on two boards of its own.
function load(online) {
  const window = { GunslingerOnline: online || null };
  global.window = window;
  delete require.cache[require.resolve('../src/leaderboards.js')];
  require('../src/leaderboards.js');                 // (the file looks its window up when it is called, so the stand-in stays)
  return window.GunslingerBoards;
}

test('a name packs into two whole numbers a double holds exactly, under a rank, and comes back as it went', () => {
  const B = load();
  for (const [typed, rank, shown] of [['Player1', 20, 'PLAYER1'], ['Warden 947', 0, 'WARDEN 947'], ['  two   spaces ', 3, 'TWO SPACES'], ['a_very-long.name 99', 1300, 'A_VERY-LONG.NAME'], ['<b>x</b>', 1, 'BXB'], ['', 9, '']]) {
    const [a, b] = B.packName(typed, rank);
    assert.ok(Number.isSafeInteger(a) && Number.isSafeInteger(b) && a >= 0 && b >= 0, typed);
    assert.equal(B.unpackName(a, b), shown, typed);
    assert.equal(B.cleanName(typed), shown);
  }
  // the rank is the high part: a longer vigil sorts above any name, so a read of the top hundred is the hundred longest
  assert.ok(B.packName('AAAAAAAA', 5)[0] > B.packName('........', 4)[0]);
  assert.ok(B.packName('ZZZZZZZZZZZZZZZZ', 99999)[0] <= Number.MAX_SAFE_INTEGER, 'a rank past the top is held to it');
  assert.equal(B.unpackName(0, 0), '');
});

test('a board row is called by the name on the boards, the player\'s own by the one just typed, and an id only when there is none', async () => {
  const boards = {
    'vigil-waves': [{ rank: 1, playerId: 'p-one', username: null, score: 9 }, { rank: 2, playerId: 'p-me', username: null, score: 4 }, { rank: 3, playerId: 'p-acct', username: 'ada', score: 2 }, { rank: 4, playerId: 'p-none-ab12', username: null, score: 1 }],
  };
  const sent = [];
  const who = {
    leaderboard(name) {
      return {
        async top() { return { entries: boards[name] || [], total: (boards[name] || []).length }; },
        async myRank() { const e = (boards[name] || []).find((x) => x.playerId === 'p-me'); return e ? { score: e.score, rank: e.rank, total: 4 } : { score: null, rank: null, total: 0 }; },
        async submit(score, mode) { sent.push([name, score, mode]); const list = (boards[name] = boards[name] || []), e = list.find((x) => x.playerId === 'p-me'); if (e) e.score = score; else list.push({ rank: list.length + 1, playerId: 'p-me', username: null, score }); return { score, rank: 1, total: list.length }; },
      };
    },
  };
  let typed = 'Old Name';
  const online = { available: () => true, identity: async () => who, me: { id: 'p-me' }, callsign: () => typed, nameOf: (e) => 'Warden ' + String(e.playerId).slice(-4).toUpperCase() };
  const B = load(online);
  // somebody else's name is already on the name boards
  const other = B.packName('First One', 9);
  boards['gunslinger-callsign-1'] = [{ rank: 1, playerId: 'p-one', score: other[0] }]; boards['gunslinger-callsign-2'] = [{ rank: 1, playerId: 'p-one', score: other[1] }];
  assert.equal(await B.publishName(), true);
  assert.deepEqual(sent.map((s) => [s[0], s[2]]), [['gunslinger-callsign-1', 'set'], ['gunslinger-callsign-2', 'set']]);
  assert.equal(B.unpackName(sent[0][1], sent[1][1]), 'OLD NAME'); assert.equal(Math.floor(sent[0][1] / Math.pow(40, 8)), 4, 'under the longest vigil');
  await B.publishName(); assert.equal(sent.length, 2, 'not sent again while nothing has changed');
  typed = 'New Name'; await B.publishName(); assert.equal(sent.length, 4); assert.equal(B.unpackName(sent[2][1], sent[3][1]), 'NEW NAME');
  const t = await B.top('vigil-waves', 10);
  assert.deepEqual(t.entries.map((e) => e.name), ['FIRST ONE', 'NEW NAME', 'ada', 'Warden AB12']);
  // muted (a scripted run): nothing is written
  B.muted = true; typed = 'Third'; assert.equal(await B.publishName(), false); assert.equal(sent.length, 4);
});
