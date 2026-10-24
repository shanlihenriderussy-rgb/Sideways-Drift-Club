// Tests du système monétaire : node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { CAR_SPECS } = require('../src/physics.js');
const E = require('../src/economy.js');

const fresh = () => E.loadProfile(null, null);

test('nouveau profil : HACHI offerte, solde de départ, rien d’autre', () => {
  const p = fresh();
  assert.equal(p.money, E.START_MONEY);
  assert.deepEqual(Object.keys(p.cars), ['hachi']);
  assert.equal(p.current, 'hachi');
});

test('migration : la voiture de l’ancienne sauvegarde est conservée avec ses couleurs', () => {
  const p = E.loadProfile(null, { car: 'raijin', paint: 'rose', rim: 'or', number: 42 });
  assert.ok(p.cars.raijin && p.cars.hachi);
  assert.equal(p.current, 'raijin');
  assert.equal(p.cars.raijin.paint, 'rose');
  assert.equal(p.cars.raijin.rim, 'or');
  assert.equal(p.cars.raijin.number, 42);
});

test('profil abîmé ou partiel : complété sans perte', () => {
  const p = E.loadProfile({ v: 1, money: 777, current: 'kouki', cars: { kouki: { paint: 'vert' } } }, null);
  assert.equal(p.money, 777);
  assert.equal(p.cars.kouki.paint, 'vert');
  assert.equal(p.cars.kouki.finish, 'gloss');
  assert.deepEqual(p.cars.kouki.perf, { engine: 0, tires: 0, angle: 0, weight: 0, susp: 0, brakes: 0 });
  const bad = E.loadProfile({ v: 1, money: -50, current: 'nope', cars: {} }, null);
  assert.equal(bad.money, 0);
  assert.equal(bad.current, 'hachi');
  assert.ok(bad.cars.hachi);
});

test('achat d’une pièce : débit, possession, équipement, journal', () => {
  const p = fresh();
  p.money = 5000;
  const r = E.buyItem(p, 'hachi', 'wing', 'gt');
  assert.equal(r.ok, true);
  const bonus = r.challenges.reduce((a, c) => a + c.reward, 0); // défi « première pièce »
  assert.equal(p.money, 5000 - E.itemPrice('wing', 'gt') + bonus);
  assert.equal(p.cars.hachi.wing, 'gt');
  assert.ok(E.owns(p.cars.hachi, 'wing', 'gt'));
  assert.ok(p.log.some((l) => l.amount === -E.itemPrice('wing', 'gt')));
  // racheter ce qu'on possède : simple équipement, gratuit
  E.equip(p, 'hachi', 'wing', 'stock');
  const before = p.money;
  assert.equal(E.buyItem(p, 'hachi', 'wing', 'gt').ok, true);
  assert.equal(p.money, before);
});

test('achat refusé si fonds insuffisants : rien ne bouge', () => {
  const p = fresh();
  p.money = 100;
  const r = E.buyItem(p, 'hachi', 'wide', 'wide');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'funds');
  assert.equal(r.missing, E.itemPrice('wide', 'wide') - 100);
  assert.equal(p.money, 100);
  assert.equal(p.cars.hachi.wide, 'stock');
});

test('équiper une pièce non possédée est refusé', () => {
  const p = fresh();
  assert.equal(E.equip(p, 'hachi', 'finish', 'chrome').ok, false);
  assert.equal(E.equip(p, 'hachi', 'paint', 'vert').ok, true); // couleurs gratuites
});

test('première pièce achetée : défi encaissé une seule fois', () => {
  const p = fresh();
  p.money = 10000;
  const r = E.buyItem(p, 'hachi', 'hood', 'vent');
  assert.deepEqual(r.challenges.map((c) => c.id), ['firstPart']);
  const r2 = E.buyItem(p, 'hachi', 'exhaust', 'twin');
  assert.deepEqual(r2.challenges, []);
});

test('performances : 3 niveaux, prix croissants, plafond', () => {
  const p = fresh();
  p.money = 1e6;
  for (let i = 0; i < 3; i++) assert.equal(E.buyPerf(p, 'hachi', 'engine').ok, true);
  assert.equal(p.cars.hachi.perf.engine, 3);
  const r = E.buyPerf(p, 'hachi', 'engine');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'max');
});

test('fiche tunée : sans amélioration elle est identique, avec elle évolue dans le bon sens', () => {
  const base = CAR_SPECS.kouki;
  const same = E.tunedSpec(base, { engine: 0, tires: 0, angle: 0, weight: 0, susp: 0 });
  for (const k of ['power', 'fmax', 'mu', 'lock', 'mass', 'top', 'h']) assert.equal(same[k], base[k], k);
  const up = E.tunedSpec(base, { engine: 3, tires: 3, angle: 3, weight: 3, susp: 3 });
  assert.ok(up.power > base.power && up.mu > base.mu && up.lock > base.lock && up.mass < base.mass);
  assert.ok(up.driftSteer > 0.42 && up.steerRate > 4.2 && up.rollK < 1);
  assert.equal(base.power, CAR_SPECS.kouki.power, 'la fiche de base n’est pas modifiée');
});

test('achat de voiture : débit, nouvelle config, sélection, défi', () => {
  const p = fresh();
  p.money = E.CAR_PRICES.kouki + 10;
  const r = E.buyCar(p, 'kouki');
  assert.equal(r.ok, true);
  assert.equal(p.money, 10 + 2000); // défi « deuxième voiture » crédité
  assert.equal(p.current, 'kouki');
  assert.ok(p.cars.kouki);
  assert.equal(E.buyCar(p, 'raijin').reason, 'funds');
});

test('gains de run : barème lisible et cohérent', () => {
  const run = { trackId: 'minato', mode: 'run', score: 30000, grade: 'A', clips: 6, zones: 10, maxAngle: 55, bestCombo: 6000, driftPct: 55, record: true };
  const pay = E.computePayout(run);
  const sum = pay.lines.reduce((a, l) => a + l.amount, 0);
  assert.equal(pay.total, sum);
  assert.ok(pay.total > 2000 && pay.total < 6000, String(pay.total));
  // le tandem paie davantage pour le même score
  assert.ok(E.computePayout({ ...run, mode: 'tandem' }).total > pay.total);
  // le mode libre paie moins, sans note
  const free = E.computePayout({ ...run, mode: 'free', grade: null, record: false });
  assert.ok(free.total < pay.total / 2);
  // score nul : aucun gain
  assert.equal(E.computePayout({ ...run, score: 0, clips: 0, record: false, grade: 'D', bestCombo: 0 }).total, 0);
});

test('fin de run : crédit, statistiques, défis débloqués une seule fois', () => {
  const p = fresh();
  const run = { trackId: 'akane', mode: 'run', score: 26000, grade: 'A', clips: 4, zones: 8, maxAngle: 62, bestCombo: 9000, driftPct: 40, record: true };
  const res = E.applyRun(p, run);
  const ids = res.challenges.map((c) => c.id).sort();
  assert.deepEqual(ids, ['angle45', 'angle60', 'clips3', 'combo3k', 'combo8k', 'first', 'gradeA', 'gradeB', 'pts10', 'pts25', 'pts5', 'trackA:akane']);
  const expected = E.START_MONEY + res.payout.total + res.challenges.reduce((a, c) => a + c.reward, 0);
  assert.equal(p.money, expected);
  assert.equal(p.stats.runs, 1);
  assert.deepEqual(p.stats.tracks, ['akane']);
  assert.deepEqual(E.applyRun(p, run).challenges, []);
});

test('défi « 3 pistes » : débloqué au troisième circuit différent', () => {
  const p = fresh();
  const base = { mode: 'run', score: 100, grade: 'D', clips: 0, zones: 8, maxAngle: 10, bestCombo: 0, driftPct: 5, record: false };
  E.applyRun(p, { ...base, trackId: 'minato' });
  E.applyRun(p, { ...base, trackId: 'minato' });
  assert.ok(!p.done.tour3);
  E.applyRun(p, { ...base, trackId: 'akane' });
  const r = E.applyRun(p, { ...base, trackId: 'piton' });
  assert.ok(r.challenges.some((c) => c.id === 'tour3'));
});

test('bonus quotidien : une fois par jour, série qui monte puis plafonne, remise à zéro après un trou', () => {
  const p = fresh();
  const m0 = p.money;
  const d1 = E.claimDaily(p, '2026-10-14');
  assert.equal(d1.streak, 1);
  assert.equal(E.claimDaily(p, '2026-10-14'), null);
  const d2 = E.claimDaily(p, '2026-10-15');
  assert.equal(d2.streak, 2);
  assert.ok(d2.amount > d1.amount);
  assert.equal(p.money, m0 + d1.amount + d2.amount);
  for (const d of ['16', '17', '18', '19', '20', '21', '22']) E.claimDaily(p, '2026-10-' + d);
  assert.equal(E.dailyAmount(p.daily.streak), E.dailyAmount(7));
  assert.equal(E.claimDaily(p, '2026-10-25').streak, 1);
  // passage de mois
  const q = fresh();
  E.claimDaily(q, '2026-10-31');
  assert.equal(E.claimDaily(q, '2026-11-01').streak, 2);
});

test('journal borné', () => {
  const p = fresh();
  for (let i = 0; i < 100; i++) E.credit(p, 'test', 1);
  assert.equal(p.log.length, E.LOG_MAX);
  assert.equal(p.money, E.START_MONEY + 100);
});

test('format monétaire', () => {
  assert.match(E.fmt(12500), /^¥12\s?500$/u);
});

test('prime du premier run de la journée : une fois par jour, jamais en libre', () => {
  const p = fresh();
  const run = { trackId: 'minato', mode: 'run', score: 8000, grade: 'C', clips: 1, zones: 8, maxAngle: 30, bestCombo: 1000, driftPct: 30, record: false, day: '2026-10-24' };
  const has = (res) => res.payout.lines.some((l) => l.label === 'Premier run du jour');
  assert.equal(has(E.applyRun(p, { ...run, mode: 'free' })), false);
  assert.equal(has(E.applyRun(p, run)), true);
  assert.equal(has(E.applyRun(p, run)), false);
  assert.equal(has(E.applyRun(p, { ...run, day: '2026-10-25' })), true);
  // la date survit au rechargement du profil
  assert.equal(E.loadProfile(JSON.parse(JSON.stringify(p))).stats.lastDay, '2026-10-25');
});

test('gains assouplis : un run moyen paie de quoi s’offrir une pièce', () => {
  const run = { trackId: 'akane', mode: 'run', score: 12000, grade: 'C', clips: 2, zones: 8, maxAngle: 40, bestCombo: 2500, driftPct: 35, record: false };
  assert.ok(E.computePayout(run).total >= 1500, String(E.computePayout(run).total));
  assert.equal(E.dailyAmount(1), 1000);
  assert.equal(E.dailyAmount(7), 4000);
  assert.ok(E.CHALLENGES.length >= 30);
  assert.equal(new Set(E.CHALLENGES.map((c) => c.id)).size, E.CHALLENGES.length, 'identifiants de défis uniques');
});

test('défis par piste alignés sur les pistes du jeu', () => {
  const { TRACKS } = require('../src/track.js');
  const ids = E.CHALLENGES.filter((c) => c.id.startsWith('trackA:')).map((c) => c.id.slice(7)).sort();
  assert.deepEqual(ids, TRACKS.map((t) => t.id).sort());
});
