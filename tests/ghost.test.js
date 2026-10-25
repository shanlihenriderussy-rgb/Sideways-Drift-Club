// Fantôme du record : enregistrement, stockage vérifié, relecture interpolée. node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/ghost.js');

const run = (secs) => {
  const R = G.recorder('kouki');
  for (let t = 0; t <= secs + 1e-9; t += 1 / 60) G.push(R, t, { x: t * 10, z: -t, heading: 3.1 + t * 0.01, rearSlip: 0.3 }, t * 100);
  return R;
};

test('un échantillon toutes les 0,1 s, quelle que soit la cadence', () => {
  const R = run(2);
  assert.ok(R.d.length / 5 >= 20 && R.d.length / 5 <= 21, R.d.length / 5);
});

test('aller-retour par le stockage, puis relecture interpolée', () => {
  const g = G.unpack(JSON.parse(JSON.stringify(G.pack(run(5)))));
  assert.ok(g); assert.equal(g.kind, 'kouki');
  const o = G.at(g, 2.25);
  assert.ok(Math.abs(o.x - 22.5) < 0.2, o.x); // au plus une image (1/60 s) de décalage
  assert.ok(Math.abs(o.pts - 225) < 2.5, o.pts); // 100 pts/s × 1/60 s + arrondi
  assert.ok(!o.done);
  assert.ok(G.at(g, 99).done);
  assert.equal(G.at(g, 99).x, g.d[g.d.length - 5], 'reste au dernier point');
});

test('cap interpolé par le plus court chemin autour de ±π', () => {
  const R = G.recorder('hachi');
  G.push(R, 0, { x: 0, z: 0, heading: 3.1 }, 0);
  G.push(R, 0.1, { x: 0, z: 0, heading: -3.1 }, 0);
  for (let k = 2; k < 12; k++) G.push(R, k / 10, { x: 0, z: 0, heading: -3.1 }, 0);
  const o = G.at(G.unpack(G.pack(R)), 0.05);
  assert.ok(Math.abs(Math.abs(o.heading) - Math.PI) < 0.01, o.heading);
});

test('données abîmées ou trafiquées refusées', () => {
  const ok = G.pack(run(2));
  assert.equal(G.unpack(null), null);
  assert.equal(G.unpack({ ...ok, v: 2 }), null);
  assert.equal(G.unpack({ ...ok, kind: 'tank' }), null);
  assert.equal(G.unpack({ ...ok, d: ok.d.slice(0, 7) }), null);
  assert.equal(G.unpack({ ...ok, d: ok.d.map((v, i) => (i === 3 ? 'x' : v)) }), null);
  assert.equal(G.unpack({ ...ok, d: new Array(5 * 7000).fill(0) }), null);
});
