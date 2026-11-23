import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildIsland, ISLE } from '../src/island/map.js';

globalThis.THREE = THREE;
const { cargoGeometry, craneGeometry, portLayout, shedGeometry } = await import('../src/island/port.js');
const island = buildIsland(ISLE);

test('le port laisse libre la chaussée et chaque conteneur surélevé a un support', () => {
  const { cargo, sheds, cranes } = portLayout(island);
  assert.ok(cargo.length >= 30 && sheds.length >= 3 && cranes.length >= 1);
  for (const [list, radius] of [
    [cargo, 7],
    [sheds, 16],
    [cranes, 15],
  ]) {
    for (const [x, z] of list) {
      assert.ok(island.terrain.at(x, z) > 0.7);
      assert.ok(island.nearestRoad(x, z, {}).d > radius + island.half + 2);
    }
  }
  const base = new Set(cargo.filter((p) => !p[3]).map((p) => p.slice(0, 3).join(',')));
  const stacked = cargo.filter((p) => p[3]);
  assert.ok(stacked.length > 0);
  for (const p of stacked) assert.ok(base.has(p.slice(0, 3).join(',')));
});

test('les conteneurs ont un maillage allégé en qualité basse et les couleurs restent groupées', () => {
  const coarse = cargoGeometry(false);
  const fine = cargoGeometry(true);
  assert.ok(coarse.index.count < fine.index.count);
  for (const geo of [coarse, fine, shedGeometry(), craneGeometry()]) {
    assert.equal(geo.attributes.color.count, geo.attributes.position.count);
    assert.ok(geo.index.count / 3 < 400);
  }
});
