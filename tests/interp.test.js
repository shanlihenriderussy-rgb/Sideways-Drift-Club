// Fluidité des voitures distantes : trajectoire, gigue, pertes, reprise après un trou. node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterp, INTERP } from '../src/net/interp.js';

// voiture en glisse sur un cercle de 25 m à 20 m/s : la vérité à tout instant (ms, horloge de l'émetteur)
const R = 25,
  V = 20,
  W = V / R;
const truth = (t) => {
  const a = (W * t) / 1000;
  return {
    t,
    x: R * Math.cos(a),
    z: R * Math.sin(a),
    heading: a + Math.PI / 2 - 0.6,
    vx: -V * Math.sin(a),
    vz: V * Math.cos(a),
    speed: V,
    slip: -0.6,
    rearSlip: 0,
    steerAngle: 0,
    wheelRot: 0,
    rollAngle: 0,
    pitchAngle: 0,
    rpm: 5000,
    throttle: 1,
    combo: 0,
    brake: false,
  };
};
const rnd = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// Rejoue une session : paquets émis à `hz`, livrés avec latence + gigue, certains perdus ; affichage à 60 images/s.
// Renvoie les écarts mesurés sur la partie stable.
function play({ hz = 30, latency = 40, jit = 0, loss = 0, seed = 1, dur = 6000, hole = null, skew = 123456 }) {
  const I = createInterp(),
    r = rnd(seed);
  const arrivals = [];
  for (let t = 0; t < dur; t += 1000 / hz) {
    if (r() < loss) continue;
    if (hole && t >= hole[0] && t < hole[1]) continue;
    arrivals.push({ at: t + latency + r() * jit, s: truth(t) });
  }
  arrivals.sort((a, b) => a.at - b.at);
  let k = 0,
    prev = null,
    maxErr = 0,
    maxJerk = 0,
    back = 0,
    maxStep = 0;
  for (let now = 0; now < dur; now += 1000 / 60) {
    while (k < arrivals.length && arrivals[k].at <= now) I.push(arrivals[k++].s, arrivals[k - 1].at + skew);
    const o = I.sample(now + skew);
    if (!o || now < 1500) {
      prev = o && { x: o.x, z: o.z, ang: Math.atan2(o.z, o.x) };
      continue;
    }
    // écart à la trajectoire vraie (distance au cercle) et régularité de l'avance le long du cercle
    maxErr = Math.max(maxErr, Math.abs(Math.hypot(o.x, o.z) - R));
    const ang = Math.atan2(o.z, o.x);
    if (prev) {
      let d = ang - prev.ang;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const step = d * R; // m parcourus pendant l'image
      const ideal = V / 60;
      if (step < -1e-6) back++;
      maxJerk = Math.max(maxJerk, Math.abs(step - ideal) / ideal);
      maxStep = Math.max(maxStep, Math.hypot(o.x - prev.x, o.z - prev.z));
    }
    prev = { x: o.x, z: o.z, ang };
  }
  return { maxErr, maxJerk, back, maxStep, delay: I.delay };
}

test('réseau propre : la trajectoire reste à moins de 1 cm du cercle, retard au plancher', () => {
  const r = play({});
  assert.ok(r.maxErr < 0.01, `écart ${r.maxErr.toFixed(4)} m`);
  assert.ok(r.maxJerk < 0.02, `irrégularité ${(r.maxJerk * 100).toFixed(1)} %`);
  assert.equal(r.back, 0);
  assert.equal(r.delay, INTERP.DELAY_MIN);
});

test('à 15 Hz, une interpolation linéaire coupe la courbe (flèche de 9 mm, tangente brisée de 3°) : Hermite fait 20 fois mieux', () => {
  // flèche d'une corde entre deux paquets à 15 Hz : R − R·cos(θ/2), θ = W / 15
  const chord = R - R * Math.cos(W / 15 / 2);
  assert.ok(chord > 0.008, `flèche ${chord.toFixed(4)} m`);
  const got = play({ hz: 15 }).maxErr;
  assert.ok(got < chord / 20, `écart ${got.toFixed(4)} m`);
});

test('gigue de 40 ms et 10 % de pertes : jamais de recul, avance régulière à 15 % près', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = play({ jit: 40, loss: 0.1, seed });
    assert.equal(r.back, 0, `recul (graine ${seed})`);
    assert.ok(r.maxJerk < 0.16, `irrégularité ${(r.maxJerk * 100).toFixed(1)} % (graine ${seed})`);
    assert.ok(r.maxErr < 0.03, `écart ${r.maxErr.toFixed(3)} m (graine ${seed})`);
    assert.ok(r.delay > INTERP.DELAY_MIN && r.delay <= INTERP.DELAY_MAX, `retard adapté : ${r.delay.toFixed(0)} ms`);
  }
});

test('trou de 300 ms : extrapolation le long de l’arc, reprise sans saut', () => {
  const r = play({ hole: [3000, 3300] });
  assert.equal(r.back, 0);
  // une image à 20 m/s parcourt 0,33 m ; un saut de correction brutal en ferait plusieurs
  assert.ok(r.maxStep < 0.33 * 1.6, `plus grand pas ${r.maxStep.toFixed(2)} m`);
  assert.ok(r.maxErr < 0.25, `écart ${r.maxErr.toFixed(2)} m`);
});

test('silence prolongé : l’extrapolation est bornée, la voiture ne part pas à l’infini', () => {
  const I = createInterp();
  for (let t = 0; t <= 1000; t += 33) I.push(truth(t), t);
  I.sample(1000);
  let o = null;
  for (let now = 1016; now < 4000; now += 16) o = I.sample(now);
  const end = truth(990);
  assert.ok(Math.hypot(o.x - end.x, o.z - end.z) < V * INTERP.EXTRAPOLATE_MAX + 0.5);
  assert.ok(o.age > 2.9, 'âge du dernier paquet exposé (le jeu masque la voiture au-delà de 4 s)');
});

test('cap : passage par ±π au plus court ; paquets en désordre ignorés ; vide → null', () => {
  const I = createInterp();
  const s = (t, h) => Object.assign(truth(t), { x: t / 100, z: 0, vx: 10, vz: 0, heading: h });
  I.push(s(1000, 3.1), 5000);
  I.push(s(1100, -3.1), 5100);
  I.push(s(1050, 0), 5101); // plus vieux que le dernier reçu
  assert.equal(I.size, 2);
  const o = I.sample(5050 + I.delay);
  assert.ok(Math.abs(Math.abs(o.heading) - Math.PI) < 0.05, `cap ${o.heading}`);
  assert.ok(Math.abs(o.x - 10.5) < 1e-6, `x ${o.x}`);
  assert.equal(createInterp().sample(0), null);
});

test('replacement (départ de course) : au-delà de 8 m on téléporte, on ne glisse pas à travers la carte', () => {
  const I = createInterp();
  for (let t = 0; t <= 990; t += 33) I.push(truth(t), t);
  for (let now = 900; now < 1200; now += 16) I.sample(now); // on extrapole déjà
  const far = Object.assign(truth(1200), { x: 500, z: 500, vx: 0, vz: 0 });
  I.push(far, 1200);
  I.push(Object.assign({}, far, { t: 1233 }), 1233);
  let o = null;
  for (let now = 1216; now < 1500; now += 16) o = I.sample(now);
  assert.ok(Math.hypot(o.x - 500, o.z - 500) < 0.01);
});
