// Moments forts et enregistrements : choix des moments, découpe, stockage vérifié, lecture. node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/replay.js');
const G = require('../src/ghost.js');

const traj = (secs) => { const r = G.recorder('kouki'); for (let t = 0; t <= secs + 1e-9; t += 1 / 60) G.push(r, t, { x: t * 15, z: Math.sin(t), heading: 0.2, rearSlip: 0.4 }, t * 50); return r.d; };

test('les 3 meilleurs moments, sans chevauchement, dans l’ordre du run', () => {
  const ev = [
    { k: 'combo', t: 20, t0: 14, v: 9000, label: 'ÉNORME' },
    { k: 'combo', t: 22, t0: 21, v: 600, label: 'BIEN' }, // chevauche le précédent, plus faible
    { k: 'clip', t: 40, v: 400, label: 'Clip extérieur' },
    { k: 'near', t: 55, v: 900, label: 'Frôlé' },
    { k: 'angle', t: 70, v: 58, label: 'Angle max 58°' },
    { k: 'combo', t: 80, v: 200, label: 'petit' },
  ];
  const m = R.pickMoments(ev, 90, 3);
  assert.equal(m.length, 3);
  assert.deepEqual(m.map((x) => x.k), ['combo', 'near', 'angle']);
  for (let i = 1; i < m.length; i++) assert.ok(m[i].a >= m[i - 1].b, 'pas de chevauchement');
  assert.ok(m[0].b - m[0].a <= 9.01, 'fenêtre de 9 s au plus');
  assert.ok(m[1].slow, 'un frôlé se revoit au ralenti');
});

test('fenêtres bornées au run, moments trop courts écartés, aucun évènement = aucun moment', () => {
  assert.deepEqual(R.pickMoments([], 30), []);
  const m = R.pickMoments([{ k: 'clip', t: 0.2, v: 250 }, { k: 'inconnu', t: 5, v: 1e9 }], 0.5);
  assert.equal(m.length, 0);
  const m2 = R.pickMoments([{ k: 'clip', t: 1, v: 250 }], 30);
  assert.equal(m2[0].a, 0);
});

test('enregistrement : découpe de la trajectoire, aller-retour par le stockage, lecture', () => {
  const d = traj(30);
  const moments = R.pickMoments([{ k: 'combo', t: 12, t0: 8, v: 5000, label: 'SUPER' }, { k: 'clip', t: 25, v: 400, label: 'Clip' }], 30);
  const rec = R.makeRecording({ id: 'r1', date: 1, track: 'minato', mode: 'run', kind: 'kouki', score: 12000, grade: 'A' }, d, moments);
  assert.equal(rec.moments.length, 2);
  const back = R.checkRecording(JSON.parse(JSON.stringify(rec)));
  assert.ok(back);
  const m = back.moments[0], o = R.playAt(m, 1.0);
  assert.ok(Math.abs(o.x - (m.a + 1) * 15) < 0.3, `${o.x} / ${(m.a + 1) * 15}`);
  assert.ok(Math.abs(o.speed - 15) < 1.5, o.speed);
  assert.ok(R.playAt(m, 99).end);
  assert.ok(Math.abs(R.momentDur(m) - (m.b - m.a)) < 0.25);
});

test('enregistrements abîmés ou trafiqués refusés, liste limitée à 8, plus récent en tête', () => {
  const d = traj(20), mm = R.pickMoments([{ k: 'combo', t: 10, t0: 6, v: 3000, label: 'x' }], 20);
  const mk = (id) => R.makeRecording({ id, date: Date.now(), track: 'akane', mode: 'run', kind: 'hachi', score: 5000 }, d, mm);
  assert.equal(R.checkRecording(null), null);
  assert.equal(R.checkRecording({ ...mk('a'), track: '../x' }), null);
  assert.equal(R.checkRecording({ ...mk('a'), kind: 'tank' }), null);
  const bad = mk('b'); bad.moments[0].d[3] = 'x';
  assert.equal(R.checkRecording(bad), null);
  let list = [];
  for (let i = 0; i < 11; i++) list = R.addRecording(list, mk('r' + i));
  assert.equal(list.length, R.MAX);
  assert.equal(list[0].id, 'r10');
  list = R.addRecording([...list, { v: 9 }], mk('r10'));
  assert.equal(list.filter((x) => x.id === 'r10').length, 1, 'pas de doublon');
});
