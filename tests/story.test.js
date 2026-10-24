// Aventure : progression, objectifs, récompenses uniques, exploration. node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/economy.js');
const S = require('../src/story.js');
const { TRACKS } = require('../src/track.js');

const fresh = () => E.loadProfile(null, null);
const ace = { score: 99999, grade: 'S', clips: 20, maxAngle: 80, bestCombo: 50000, driftPct: 90, walls: 0 };
const winAll = (p, ci) => S.CHAPTERS[ci].missions.forEach((m, k) => S.finishMission(p, ci, k, ace));

test('six chapitres, un par piste, trois missions chacun, identifiants uniques', () => {
  assert.equal(S.CHAPTERS.length, TRACKS.length);
  assert.deepEqual(S.CHAPTERS.map((c) => c.track).sort(), TRACKS.map((t) => t.id).sort());
  const ids = S.CHAPTERS.flatMap((c) => c.missions.map((m) => m.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const c of S.CHAPTERS) {
    assert.equal(c.missions.length, 3, c.id);
    for (const m of c.missions) {
      assert.ok(['run', 'tandem'].includes(m.mode), m.id);
      assert.ok(S.goalRows(m.goal).length > 0, `${m.id} : objectif vide`);
      for (const l of [...m.brief, ...m.win, ...m.lose]) assert.ok(S.CAST[l[0]], `${m.id} : personnage ${l[0]}`);
    }
    for (const l of [...c.intro, ...c.outro]) assert.ok(S.CAST[l[0]], `${c.id} : personnage ${l[0]}`);
    assert.ok(S.ZONES[c.track] && S.ZONES[c.track].archives.length === 5, `${c.track} : 5 archives`);
  }
});

test('progression : un chapitre s’ouvre quand le précédent est fini, missions dans l’ordre', () => {
  const p = fresh();
  assert.equal(S.chapterOpen(p, 0), true);
  assert.equal(S.chapterOpen(p, 1), false);
  assert.equal(S.nextMission(p, 0), 0);
  assert.equal(S.missionOpen(p, 0, 1), false, 'mission 2 fermée avant la 1');
  assert.equal(S.finishMission(p, 0, 1, ace).ok, false, 'pas de raccourci');
  S.finishMission(p, 0, 0, ace);
  assert.equal(S.nextMission(p, 0), 1);
  S.finishMission(p, 0, 1, ace);
  const last = S.finishMission(p, 0, 2, ace);
  assert.equal(last.chapterDone, true);
  assert.equal(S.chapterOpen(p, 1), true);
  assert.equal(S.currentChapter(p), 1);
});

test('objectifs : chaque critère est vérifié, la récompense n’est payée qu’une fois', () => {
  const p = fresh();
  const m = S.CHAPTERS[0].missions[0]; // 4 000 pts
  const m0 = p.money;
  const miss = S.finishMission(p, 0, 0, { ...ace, score: 3999 });
  assert.equal(miss.ok, false);
  assert.equal(p.money, m0);
  const hit = S.finishMission(p, 0, 0, { ...ace, score: 4000 });
  assert.equal(hit.ok, true); assert.equal(hit.reward, m.reward);
  assert.equal(p.money, m0 + m.reward);
  const again = S.finishMission(p, 0, 0, ace);
  assert.equal(again.ok, true); assert.equal(again.reward, 0);
  assert.equal(p.money, m0 + m.reward);
  // contact mur, note, angle, glisse
  const rows = S.goalRows({ grade: 'B', noWall: true, angle: 50, drift: 40 }, { grade: 'A', walls: 1, maxAngle: 50, driftPct: 39 });
  assert.deepEqual(rows.map((r) => r.ok), [true, true, false, false]); // note, angle, glisse, mur
});

test('exploration : lieux fermés tant que le chapitre l’est, chaque trouvaille payée une fois', () => {
  const p = fresh();
  assert.equal(S.collect(p, 'akane', 'arch', 0), null, 'Akane fermé au début');
  const a = S.collect(p, 'minato', 'arch', 0);
  assert.equal(a.reward, S.ARCHIVE_REWARD);
  assert.equal(S.collect(p, 'minato', 'arch', 0), null);
  assert.ok(S.collect(p, 'minato', 'street', 1).reward > 0);
  assert.ok(S.collect(p, 'minato', 'npc', 0).reward > 0);
  assert.equal(S.collect(p, 'minato', 'arch', 9), null, 'indice hors bornes');
  assert.deepEqual(S.zoneProgress(p, 'minato'), { arch: 1, street: 1, npc: 1 });
  winAll(p, 0); winAll(p, 1);
  assert.ok(S.collect(p, 'akane', 'arch', 0));
});

test('sauvegarde : la progression survit au rechargement, les données invalides sont ignorées', () => {
  const p = fresh();
  winAll(p, 0);
  S.collect(p, 'minato', 'arch', 2);
  const q = E.loadProfile(JSON.parse(JSON.stringify(p)), null);
  assert.equal(S.chapterDone(q, 0), true);
  assert.equal(S.zoneProgress(q, 'minato').arch, 1);
  const bad = E.loadProfile({ v: 1, money: 10, cars: {}, story: { done: 'x', arch: [1] } }, null);
  assert.equal(S.chapterOpen(bad, 1), false);
  assert.deepEqual(S.ensure(bad).arch, {});
});

test('aventure complète : toutes les missions payent, défis de rue plus durs au fil des chapitres', () => {
  const p = fresh();
  const m0 = p.money;
  S.CHAPTERS.forEach((c, ci) => winAll(p, ci));
  const total = S.CHAPTERS.flatMap((c) => c.missions).reduce((a, m) => a + m.reward, 0);
  assert.equal(p.money, m0 + total);
  assert.deepEqual(S.progress(p).missions, S.progress(p).total);
  assert.ok(S.streetFor(5, 0).angle > S.streetFor(0, 0).angle);
  assert.ok(S.streetFor(5, 1).pts > S.streetFor(0, 1).pts);
});
