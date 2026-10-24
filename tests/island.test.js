// L'île (monde ouvert) : réseau routier praticable, terrain raccordé, lieux de l'aventure, daruma. node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { ISLE, buildIsland, isleCollect, isleFound } = require('../src/island.js');
const { TRACKS } = require('../src/track.js');
const E = require('../src/economy.js');

const I = buildIsland(ISLE);

test('réseau connexe : on peut rouler de n’importe quel nœud à tous les autres', () => {
  const adj = {};
  for (const [a, b] of ISLE.edges) { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); }
  const seen = new Set(['M']), q = ['M'];
  while (q.length) for (const n of adj[q.shift()]) if (!seen.has(n)) { seen.add(n); q.push(n); }
  assert.deepEqual([...seen].sort(), Object.keys(ISLE.nodes).sort());
  assert.ok(I.roads.reduce((a, r) => a + r.length, 0) > 7000, 'au moins 7 km de routes');
});

test('les six lieux de l’aventure sont des nœuds de l’île', () => {
  assert.deepEqual(Object.keys(ISLE.hubs).sort(), TRACKS.map((t) => t.id).sort());
  for (const k of Object.values(ISLE.hubs)) assert.ok(ISLE.nodes[k], k);
});

test('routes praticables : pente < 13 %, sur l’île, sol raccordé', () => {
  I.roads.forEach((r, e) => {
    for (let i = 1; i < r.count; i++) assert.ok(Math.abs(r.py[i] - r.py[i - 1]) / r.step < 0.13, `route ${e} : pente au point ${i}`);
    for (let i = 0; i < r.count; i += 5) {
      assert.ok(I.ellipse(r.px[i], r.pz[i]) < 0.92, `route ${e} : dans la mer au point ${i}`);
      assert.ok(Math.abs(I.terrain.at(r.px[i], r.pz[i]) - r.py[i]) < 0.3, `route ${e} : sol décollé au point ${i}`);
    }
  });
});

test('pas de croisement hors des carrefours', () => {
  const nodes = Object.values(ISLE.nodes);
  const nearNode = (x, z) => nodes.some(([nx, nz]) => Math.hypot(x - nx, z - nz) < 45);
  let worst = Infinity;
  for (let i = 0; i < I.N; i += 4) {
    if (nearNode(I.X[i], I.Z[i])) continue;
    for (let j = 0; j < I.N; j += 4) {
      if (I.E[j] === I.E[i] || nearNode(I.X[j], I.Z[j])) continue;
      worst = Math.min(worst, Math.hypot(I.X[i] - I.X[j], I.Z[i] - I.Z[j]));
    }
  }
  assert.ok(worst > ISLE.width + 6, `${worst.toFixed(1)} m entre deux routes`);
});

test('recherche de route : sur la chaussée, à côté, loin', () => {
  const r = I.roads[3], i = 100;
  const on = I.nearestRoad(r.px[i], r.pz[i], {});
  assert.ok(on.d < 0.01);
  const side = I.nearestRoad(r.px[i] - r.tz[i] * 5, r.pz[i] + r.tx[i] * 5, {});
  assert.ok(Math.abs(side.d - 5) < 0.6 && side.lat > 4, `latéral ${side.lat}`);
  assert.equal(I.nearestRoad(5000, 5000, {}).d, Infinity);
  assert.ok(I.terrain.at(5000, 5000) < 0, 'au large : la mer');
});

test('daruma dorés : sur la route, payés une fois, comptés', () => {
  for (const d of I.daruma) assert.ok(I.nearestRoad(d.x, d.z, {}).d < I.half, 'daruma sur la chaussée');
  const p = E.loadProfile(null, null), m0 = p.money;
  assert.equal(isleCollect(p, 0), ISLE.dReward);
  assert.equal(isleCollect(p, 0), 0);
  assert.equal(isleCollect(p, 99), 0);
  assert.equal(p.money, m0 + ISLE.dReward);
  assert.equal(isleFound(p), 1);
  assert.equal(isleFound(E.loadProfile(JSON.parse(JSON.stringify(p)), null)), 1, 'gardé au rechargement');
});
