// Réglages d'atelier : effet réel sur la physique, neutres par défaut. node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { CAR_SPECS, createCarState, stepCar } = require('../src/physics.js');
const E = require('../src/economy.js');

const DT = 1 / 120;
const perf0 = () => E.defaultCar('kouki').perf;
const tune = (o) => Object.assign(E.defaultCar('kouki').tune, o);
const spec = (o, perf) => E.tunedSpec(CAR_SPECS.kouki, perf || perf0(), tune(o));

function run(s, script, secs, v0) {
  const c = createCarState(s, 0, 0, 0);
  c.vx = v0 || 0;
  for (let t = 0; t < secs; t += DT) stepCar(c, script(t, c), DT, 1);
  return c;
}
// freinage en ligne droite depuis 90 km/h : distance d'arrêt
function stopDist(s) {
  const c = createCarState(s, 0, 0, 0);
  c.vx = 25; c.speed = 25; c.fwd = 25;
  let t = 0;
  while (c.fwd > 0.5 && t < 10) { stepCar(c, { steer: 0, throttle: 0, brake: 1, handbrake: 0 }, DT, 1); t += DT; }
  return c.x;
}
// freinage en appui (trail braking) : angle de lacet pris
function trailYaw(s) {
  return Math.abs(run(s, (t) => ({ steer: 0.5, throttle: 0, brake: t > 0.4 ? 0.8 : 0, handbrake: 0 }), 1.4, 22).heading);
}
// virage à allure modérée, en accroche : dérive maximale
function cornerSlip(s) {
  let maxB = 0;
  run(s, (t, c) => { maxB = Math.max(maxB, Math.abs(c.slip)); return { steer: 0.25, throttle: 0.3, brake: 0, handbrake: 0 }; }, 2.5, 16);
  return maxB;
}

test('réglages par défaut : physique strictement identique à la fiche d’origine', () => {
  const script = (t) => ({ steer: t > 2 && t < 2.5 ? 1 : t > 2.5 ? 0.2 : 0, throttle: 1, brake: t > 6 && t < 6.6 ? 1 : 0, handbrake: t > 2 && t < 2.4 ? 1 : 0 });
  const a = run(Object.assign({}, CAR_SPECS.kouki), script, 8);
  const b = run(E.tunedSpec(CAR_SPECS.kouki, perf0(), E.defaultCar('kouki').tune), script, 8);
  for (const k of ['x', 'z', 'heading', 'omega', 'vx', 'vz']) assert.equal(b[k], a[k], k);
});

test('puissance de freinage : freins mordants = arrêt plus court', () => {
  const soft = stopDist(spec({ brakePower: 0 })), hard = stopDist(spec({ brakePower: 1 }));
  assert.ok(hard < soft * 0.9, `mordant ${hard.toFixed(1)} m contre doux ${soft.toFixed(1)} m`);
});

test('kit de freins (Perfs) : chaque niveau raccourcit le freinage', () => {
  const d0 = stopDist(spec({})), d3 = stopDist(spec({}, Object.assign(perf0(), { brakes: 3 })));
  assert.ok(d3 < d0 * 0.85, `niv. 3 ${d3.toFixed(1)} m contre ${d0.toFixed(1)} m`);
});

test('répartition vers l’arrière : la voiture pivote plus au freinage', () => {
  const front = trailYaw(spec({ brakeBias: 0 })), rear = trailYaw(spec({ brakeBias: 1 }));
  assert.ok(rear > front * 1.08, `arrière ${rear.toFixed(3)} contre avant ${front.toFixed(3)}`);
});

test('raideur : arrière ferme = survireur, avant ferme = sous-vireur', () => {
  const under = cornerSlip(spec({ springF: 1, springR: 0 })), over = cornerSlip(spec({ springF: 0, springR: 1 }));
  assert.ok(over > under * 1.5, `survireur ${over.toFixed(3)} contre sous-vireur ${under.toFixed(3)}`);
});

test('frein à main sec : décroche l’arrière plus fort', () => {
  const pull = (s) => { let m = 0; run(s, (t, c) => { m = Math.max(m, Math.abs(c.slip)); return { steer: 0.6, throttle: 0.3, brake: 0, handbrake: t < 0.35 ? 1 : 0 }; }, 0.6, 20); return m; };
  const soft = pull(spec({ handbrake: 0 })), sharp = pull(spec({ handbrake: 1 }));
  assert.ok(sharp > soft * 1.1, `sec ${sharp.toFixed(3)} contre progressif ${soft.toFixed(3)}`);
});

test('amortisseurs vifs : le transfert de charge s’établit plus vite', () => {
  const ax = (s) => run(s, () => ({ steer: 0, throttle: 0, brake: 1, handbrake: 0 }), 0.08, 20).ax;
  assert.ok(Math.abs(ax(spec({ damper: 1 }))) > Math.abs(ax(spec({ damper: 0 }))) * 1.2);
});

test('arcade : aucun réglage extrême ne fait partir la voiture en tête-à-queue au banc', () => {
  const extremes = [{ brakeBias: 1, handbrake: 1, springF: 0, springR: 1, damper: 1, height: 0, camber: 1 }, { brakeBias: 0, handbrake: 0, springF: 1, springR: 0, damper: 0, height: 1, camber: 0 }];
  for (const o of extremes) {
    let spun = false;
    run(spec(o), (t, c) => { if (Math.abs(c.slip) > 1.9) spun = true; return { steer: t > 4 && t < 4.5 ? 1 : t > 4.5 ? 0.15 : 0, throttle: t > 4 && t < 4.5 ? 0.6 : t >= 10 ? 0.3 : 1, brake: 0, handbrake: t > 4 && t < 4.5 ? 1 : 0 }; }, 12);
    assert.equal(spun, false, JSON.stringify(o));
  }
});

// Relief : le poids projeté freine en montée, pousse en descente ; à plat, rien ne change.
test('relief : pente montante, descendante et plat', () => {
  const s = spec({});
  const coast = (gx) => {
    const c = createCarState(s, 0, 0, 0);
    c.vx = 20; c.gx = gx;
    for (let t = 0; t < 2; t += DT) stepCar(c, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, DT, 1);
    return c.vx;
  };
  const flat = coast(0), up = coast(0.08), down = coast(-0.08);
  assert.ok(up < flat - 1, `montée ${up.toFixed(2)} contre ${flat.toFixed(2)}`);
  assert.ok(down > flat + 1, `descente ${down.toFixed(2)} contre ${flat.toFixed(2)}`);
  // à l'arrêt sur une pente de 8 %, la voiture recule
  const c = createCarState(s, 0, 0, 0); c.gx = 0.08;
  for (let t = 0; t < 1; t += DT) stepCar(c, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, DT, 1);
  assert.ok(c.x < -0.1, `recule de ${(-c.x).toFixed(2)} m`);
});
