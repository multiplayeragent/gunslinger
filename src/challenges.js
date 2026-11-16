/* The outfits and what earns them: three challenges for each of the twenty-six earned outfits, counted from what
   happens in this game's maps and modes (src/progress.js reports the facts; src/achievements.js counts them).
   The four standard outfits are worn from the start.

   Facts and what each one says about itself:
     kill      type, by ('player' | 'defense'), weapon, dist (m), weak / head, blast, suppressed, multi and multiSame
               (kills, and kills of that type, in the last 4 s, this one included), burst (in the last second),
               lowHp, torch, inChurch, crawling
     relay     a relay cut in Terminal Breach
     mission   Terminal Breach finished: time (s), acc (0-1 or null), retries, hits taken, dressings used, health
     hwave     a Holdout wave cleared: wave
     hend      a Holdout over: score, waves cleared, kills
     wave      a Crystal Vigil wave cleared: wave, crystal and crystalMin (0-1), noDown, cls
     stack     a wave called on top of a running one        place   a defense placed: kind
     sever     a limb taken off                              dress   a field dressing or medkit used
     earn      money earned in Crystal Vigil: n              unlock  an outfit unlocked: count so far
   Every fact also carries map ('harbor' | 'vigil'), mode ('mission' | 'holdout' | 'vigil'), diff, coop and players.

   A new mode adds its own file like this one: report its facts, define its challenges. */
(function (global) {
  'use strict';
  const harbor = (c) => c.map === 'harbor', vigil = (c) => c.map === 'vigil';
  const mine = (c) => c.by !== 'defense';
  const hk = (t) => (c) => harbor(c) && (!t || t(c)), vk = (t) => (c) => vigil(c) && mine(c) && (!t || t(c));

  /* outfit id, group, [label, goal, fact, options] x 3 */
  const LIST = [
    // ---- earned in the Harbor
    ['corsair', 'Harbor', [
      ['Reach the boat in Terminal Breach 5 times', 5, 'mission'],
      ['Reach the boat on Standard, Hard and Brutal', 3, 'mission', { distinct: (c) => c.diff }],
      ['Reach the boat in under 6 minutes', 1, 'mission', { test: (c) => c.time < 360 }]]],
    ['duskPatrol', 'Harbor', [
      ['Clear 40 Holdout waves', 40, 'hwave'],
      ['Reach wave 8 in one Holdout', 8, 'hwave', { best: true, add: (c) => c.wave }],
      ['Score 20,000 in one Holdout', 20000, 'hend', { best: true, add: (c) => c.score }]]],
    ['skyhook', 'Harbor', [
      ['Shoot down 150 gulls', 150, 'kill', { test: hk((c) => c.type === 'gull') }],
      ['Shoot down 25 gulls from 40 m or more', 25, 'kill', { test: hk((c) => c.type === 'gull' && c.dist >= 40) }],
      ['Shoot down 3 gulls within 4 seconds, 10 times', 10, 'kill', { test: hk((c) => c.type === 'gull' && c.multiSame === 3) }]]],
    ['circuit', 'Harbor', [
      ['Destroy 250 machines', 250, 'kill', { test: harbor }],
      ['Destroy 60 machines through a weak point', 60, 'kill', { test: hk((c) => c.weak), hint: 'The lit core of a hound, the sensor of a gull.' }],
      ['Destroy 3 machines within 4 seconds, 15 times', 15, 'kill', { test: hk((c) => c.multi === 3) }]]],
    ['stratos', 'Harbor', [
      ['Destroy 60 machines with the KR-7 Marksman', 60, 'kill', { test: hk((c) => c.weapon === 'marksman') }],
      ['Destroy 30 machines from 60 m or more', 30, 'kill', { test: hk((c) => c.dist >= 60) }],
      ['Reach the boat with 60% accuracy or better, 3 times', 3, 'mission', { test: (c) => c.acc != null && c.acc >= 0.6 }]]],
    ['tempest', 'Harbor', [
      ['Clear 20 Holdout waves on Hard or Brutal', 20, 'hwave', { test: (c) => c.diff !== 'standard' }],
      ['Destroy 100 hounds', 100, 'kill', { test: hk((c) => c.type === 'hound') }],
      ['Reach wave 5 of a Holdout on Brutal', 5, 'hwave', { best: true, test: (c) => c.diff === 'brutal', add: (c) => c.wave }]]],
    ['raptor', 'Harbor', [
      ['Reach the boat in under 5 minutes', 1, 'mission', { test: (c) => c.time < 300 }],
      ['Destroy 80 machines with the KR-9 PDW', 80, 'kill', { test: hk((c) => c.weapon === 'pdw') }],
      ['Destroy 50 machines within 10 m', 50, 'kill', { test: hk((c) => c.dist <= 10) }]]],
    ['void', 'Harbor', [
      ['Destroy 80 machines with a suppressed weapon', 80, 'kill', { test: hk((c) => c.suppressed), hint: 'Fit a suppressor in the gunsmith (Tab), or carry the KR-9 PDW.' }],
      ['Reach the boat after taking no more than 5 hits', 1, 'mission', { test: (c) => c.hits <= 5 }],
      ['Destroy 40 machines with the PAC-4 Sidearm', 40, 'kill', { test: hk((c) => c.weapon === 'sidearm') }]]],
    ['duneRider', 'Harbor', [
      ['Reach the boat without a field dressing, 3 times', 3, 'mission', { test: (c) => c.dressings === 0 }],
      ['Destroy 60 machines with the KR-12 Breacher', 60, 'kill', { test: hk((c) => c.weapon === 'breacher') }],
      ['Destroy 25 hounds within 8 m', 25, 'kill', { test: hk((c) => c.type === 'hound' && c.dist <= 8) }]]],
    ['sandveil', 'Harbor', [
      ['Destroy 60 machines with the PAC-45 Heavy', 60, 'kill', { test: hk((c) => c.weapon === 'heavy') }],
      ['Destroy 60 machines in one Holdout', 60, 'hend', { best: true, add: (c) => c.kills }],
      ['Finish 10 Holdouts past wave 3', 10, 'hend', { test: (c) => c.waves >= 3 }]]],
    ['argonaut', 'Harbor', [
      ['Reach the boat on Brutal 3 times', 3, 'mission', { test: (c) => c.diff === 'brutal' }],
      ['Reach the boat with 80 health or more, 3 times', 3, 'mission', { test: (c) => c.health >= 80 }],
      ['Destroy 300 machines in Terminal Breach', 300, 'kill', { test: hk((c) => c.mode === 'mission') }]]],

    // ---- earned in the Churchyard
    ['marshal', 'Churchyard', [
      ['Kill 150 zombies with headshots', 150, 'kill', { test: vk((c) => c.head) }],
      ['Kill 60 zombies with the sidearm', 60, 'kill', { test: vk((c) => c.weapon === 'pistol') }],
      ['Kill 25 zombies with headshots from 25 m or more', 25, 'kill', { test: vk((c) => c.head && c.dist >= 25) }]]],
    ['shade', 'Churchyard', [
      ['Kill 100 zombies with your flashlight off', 100, 'kill', { test: vk((c) => !c.torch && !c.blast) }],
      ['Kill 100 runners', 100, 'kill', { test: vk((c) => c.type === 'runner') }],
      ['Kill 50 zombies within 4 m', 50, 'kill', { test: vk((c) => c.dist <= 4 && !c.blast) }]]],
    ['briar', 'Churchyard', [
      ['Kill 400 walkers', 400, 'kill', { test: vk((c) => c.type === 'walker') }],
      ['Take off 150 limbs', 150, 'sever'],
      ['Clear 30 waves of Crystal Vigil', 30, 'wave']]],
    ['cinder', 'Churchyard', [
      ['Kill 60 spitters', 60, 'kill', { test: vk((c) => c.type === 'spitter') }],
      ['Clear 20 waves as Medic', 20, 'wave', { test: (c) => c.cls === 'medic' }],
      ['Kill 40 zombies while below 35% health', 40, 'kill', { test: vk((c) => c.lowHp) }]]],
    ['verdant', 'Churchyard', [
      ['Kill 120 zombies with the KR-7 Marksman', 120, 'kill', { test: vk((c) => c.weapon === 'dmr') }],
      ['Kill 40 zombies from 30 m or more', 40, 'kill', { test: vk((c) => c.dist >= 30 && !c.blast) }],
      ['Clear 20 waves as Scout', 20, 'wave', { test: (c) => c.cls === 'scout' }]]],
    ['trapper', 'Churchyard', [
      ['Kill 120 zombies with the KR-12 Breacher', 120, 'kill', { test: vk((c) => c.weapon === 'buck' && !c.blast) }],
      ['Kill 3 zombies within one second, 25 times', 25, 'kill', { test: vk((c) => c.burst === 3) }],
      ['Clear 20 waves as Engineer', 20, 'wave', { test: (c) => c.cls === 'engineer' }]]],
    ['oldGuard', 'Churchyard', [
      ['Hire 20 Rifleman Guards', 20, 'place', { test: (c) => c.kind === 'guard' }],
      ['Have your guards and turrets kill 300 zombies', 300, 'kill', { test: (c) => vigil(c) && c.by === 'defense' }],
      ['Clear 10 waves on Brutal', 10, 'wave', { test: (c) => c.diff === 'brutal' }]]],
    ['whiteout', 'Churchyard', [
      ['Clear 25 waves with the crystal above 90%', 25, 'wave', { test: (c) => c.crystal > 0.9 }],
      ['Clear wave 10 with the crystal never below half', 10, 'wave', { best: true, test: (c) => c.crystalMin >= 0.5, add: (c) => c.wave }],
      ['Kill 100 zombies that got inside the church', 100, 'kill', { test: vk((c) => c.inChurch) }]]],
    ['jaguar', 'Churchyard', [
      ['Kill 5 abominations', 5, 'kill', { test: vk((c) => c.type === 'boss'), hint: 'One comes with every fifth wave.' }],
      ['Kill 150 crawling zombies', 150, 'kill', { test: vk((c) => c.crawling), hint: 'Take a leg off and it keeps coming.' }],
      ['Kill 100 zombies with the KR-9 PDW', 100, 'kill', { test: vk((c) => c.weapon === 'cqb' && !c.blast) }]]],
    ['nomad', 'Churchyard', [
      ['Reach wave 15 in one vigil', 15, 'wave', { best: true, add: (c) => c.wave }],
      ['Earn $60,000 in Crystal Vigil', 60000, 'earn', { add: (c) => c.n }],
      ['Call a wave on top of a running one 15 times', 15, 'stack', { hint: 'Press Enter while a wave is still on.' }]]],
    ['bulwark', 'Churchyard', [
      ['Clear 20 waves without going down', 20, 'wave', { test: (c) => c.noDown }],
      ['Kill 150 zombies with the KR-7 Support', 150, 'kill', { test: vk((c) => c.weapon === 'lmg' && !c.blast) }],
      ['Kill 40 brutes', 40, 'kill', { test: vk((c) => c.type === 'brute') }]]],

    // ---- earned anywhere, or together
    ['sapper', 'Anywhere', [
      ['Destroy 25 machines with explosions', 25, 'kill', { test: hk((c) => c.blast), hint: 'Shoot a red drum when machines are next to it.' }],
      ['Kill 100 zombies with grenades and mines', 100, 'kill', { test: vk((c) => c.blast) }],
      ['Reach the boat without a retry, 3 times', 3, 'mission', { test: (c) => c.retries === 0 }]]],
    ['yellowVest', 'Anywhere', [
      ['Cut 45 relays', 45, 'relay'],
      ['Use 20 field dressings or medkits', 20, 'dress'],
      ['Place 30 guards, turrets and floodlights', 30, 'place']]],
    ['standard', 'Anywhere', [
      ['Clear 30 waves with a squad', 30, 'wave', { test: (c) => c.coop, hint: 'Co-op on the title screen: send the invite link.' }],
      ['Reach wave 10 with a squad', 10, 'wave', { best: true, test: (c) => c.coop, add: (c) => c.wave }],
      ['Kill 300 zombies while in a squad', 300, 'kill', { test: vk((c) => c.coop) }]]],
    ['aurum', 'Anywhere', [
      ['Unlock 12 outfits', 12, 'unlock', { best: true, add: (c) => c.count }],
      ['Destroy 1,500 machines and zombies', 1500, 'kill', { test: mine }],
      ['Reach wave 20 in one vigil', 20, 'wave', { best: true, add: (c) => c.wave }]]],
  ];
  const BASE = ['assault', 'smg', 'sniper', 'shotgun'];
  const GROUPS = ['Standard issue', 'Harbor', 'Churchyard', 'Anywhere'];

  function install(A) {
    for (const id of BASE) A.define(id, { group: 'Standard issue' }, []);
    for (const [outfit, group, rows] of LIST) {
      A.define(outfit, { group }, rows.map(([label, goal, fact, o], i) => ({ id: outfit + '.' + (i + 1), label, goal, fact, ...(o || {}) })));
    }
    return A;
  }
  const api = { install, LIST, BASE, GROUPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.GunslingerChallenges = api; if (window.GunslingerAchievements) install(window.GunslingerAchievements); }
})(typeof globalThis !== 'undefined' ? globalThis : this);
