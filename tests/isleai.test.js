// Vie de l'île : GPS, circulation, rivaux, activités, habitants. node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { ISLE, buildIsland } = require('../src/island.js');
const L = require('../src/isleai.js');
const E = require('../src/economy.js');
const S = require('../src/story.js');

const I = buildIsland(ISLE);
const node = (k) => ISLE.nodes[k];

test('GPS : trajet continu, plus long que le vol d’oiseau, qui finit à destination', () => {
  const keys = Object.keys(ISLE.nodes);
  for (const a of keys) for (const b of keys) {
    if (a === b) continue;
    const [x0, z0] = node(a), [x1, z1] = node(b);
    const r = L.route(I, x0 + 3, z0 + 2, x1, z1);
    assert.ok(r, `${a} → ${b}`);
    assert.ok(r.len >= Math.hypot(x1 - x0, z1 - z0) - 20, `${a} → ${b} : ${r.len}`);
    // les segments se raccordent (fin d'un segment = début du suivant, à un carrefour)
    for (let k = 1; k < r.segs.length; k++) {
      const p = r.segs[k - 1], q = r.segs[k], rp = I.roads[p.e], rq = I.roads[q.e];
      assert.ok(Math.hypot(rp.px[p.i1] - rq.px[q.i0], rp.pz[p.i1] - rq.pz[q.i0]) < 1, `${a} → ${b} : raccord ${k}`);
    }
    let walked = 0;
    const end = L.routeWalk(I, r, null, (x, z, d) => { walked = d; });
    assert.ok(Math.hypot(end[0] - x1, end[1] - z1) < 3, `${a} → ${b} : arrivée`);
    assert.ok(Math.abs(walked - r.len) < 4, `${a} → ${b} : longueur ${walked} / ${r.len}`);
  }
});

test('GPS : sur la même route, trajet direct', () => {
  const r0 = I.roads[3];
  const r = L.route(I, r0.px[100], r0.pz[100], r0.px[300], r0.pz[300]);
  assert.equal(r.segs.length, 1);
  assert.ok(Math.abs(r.len - 200 * r0.step) < 1e-6);
});

test('circulation : une minute de simulation, tout le monde reste sur sa voie, rien ne se chevauche', () => {
  const T = L.createTraffic(I, 24, 11);
  const player = { x: 1e5, z: 1e5, vx: 0, vz: 0 };
  let overlaps = 0;
  for (let f = 0; f < 60 * 30; f++) {
    const obs = [player, ...T.agents];
    for (const A of T.agents) L.stepAgent(I, A, 1 / 30, obs, T.rand, false);
    if (f % 30) continue;
    for (const A of T.agents) {
      assert.ok(Number.isFinite(A.x) && Number.isFinite(A.z) && Number.isFinite(A.heading), A.id);
      const q = I.nearestRoad(A.x, A.z, {});
      assert.ok(q.d < I.half + 1, `${A.id} hors route : ${q.d}`);
    }
    for (let a = 0; a < T.agents.length; a++) for (let b = a + 1; b < T.agents.length; b++) {
      const A = T.agents[a], B = T.agents[b];
      if (Math.hypot(A.x - B.x, A.z - B.z) < 2.2 && Math.cos(A.heading - B.heading) > 0.5) overlaps++;
    }
  }
  assert.ok(overlaps <= 6, `chevauchements : ${overlaps}`); // seuls des croisements furtifs aux carrefours sont tolérés
  const moving = T.agents.filter((A) => A.speed > 3).length;
  assert.ok(moving >= 12, `voitures qui roulent : ${moving}`);
});

test('circulation : une voiture s’arrête derrière un obstacle, klaxonne puis dépasse', () => {
  const A = L.makeAgent(I, { id: 'a', e: 4, dir: 1, s: 100, speed: 12, lane: -L.LANE, laneT: -L.LANE });
  const p = L.roadPose(I, 4, 1, 160, -L.LANE, {});
  const block = { x: p.x, z: p.z, vx: 0, vz: 0 };
  const rand = () => 0.5;
  let honk = false, minGap = Infinity;
  for (let f = 0; f < 30 * 18; f++) {
    if (L.stepAgent(I, A, 1 / 30, [A, block], rand, false) === 'honk') honk = true;
    const d = Math.hypot(A.x - block.x, A.z - block.z);
    minGap = Math.min(minGap, d);
  }
  assert.ok(honk, 'klaxon');
  assert.ok(minGap > 3, `distance mini à l’obstacle : ${minGap}`);
  assert.ok(A.s > 165, `a fini par dépasser (s = ${A.s})`);
});

test('rival : suit un itinéraire jusqu’à la destination, en glisse dans les virages', () => {
  const [sx, sz] = node('S');
  const R = L.makeAgent(I, { id: 'r', e: 7, dir: 1, s: 5, speed: 0, lane: 0, laneT: 0 });
  const tgt = L.tougeTarget(I, R.x, R.z, 'S');
  assert.ok(tgt && tgt.route.len >= 700 && tgt.route.len <= 1800, `cible ${tgt && tgt.route.len}`);
  R.route = L.agentPlan(I, L.route(I, R.x, R.z, tgt.x, tgt.z));
  const r0 = L.route(I, R.x, R.z, tgt.x, tgt.z);
  if (r0.segs[0].i1 < r0.segs[0].i0) { R.dir = -1; R.s = I.roads[R.e].length - R.s; }
  let maxBeta = 0, t = 0;
  while (!R.arrived && t < 240) { L.stepAgent(I, R, 1 / 30, [R], () => 0.5, true); maxBeta = Math.max(maxBeta, Math.abs(R.beta)); t += 1 / 30; }
  assert.ok(R.arrived, 'arrivé');
  assert.ok(Math.hypot(R.x - tgt.x, R.z - tgt.z) < 20, 'au bon endroit');
  assert.ok(maxBeta > 0.3, `angle de glisse ${maxBeta}`);
  assert.ok(t < tgt.route.len / 8, `temps ${t.toFixed(0)} s pour ${tgt.route.len.toFixed(0)} m`);
  assert.ok(sx && sz);
});

test('rivaux : ouverts au fil de l’aventure, victoire payée pleine une fois puis un cinquième', () => {
  const p = E.loadProfile(null);
  assert.ok(L.rivalOpen(p, L.RIVALS.find((r) => r.id === 'nana'), S), 'Nana roule dès le début');
  assert.ok(!L.rivalOpen(p, L.RIVALS.find((r) => r.id === 'kai'), S), 'Kai attend le chapitre 2');
  for (const m of S.CHAPTERS[0].missions) S.ensure(p).done[m.id] = true;
  assert.ok(L.rivalOpen(p, L.RIVALS.find((r) => r.id === 'nana'), S));
  assert.ok(!L.rivalOpen(p, L.RIVALS.find((r) => r.id === 'mika'), S));
  const m0 = p.money;
  assert.equal(L.rivalWin(p, 'nana', 'race'), 1800);
  assert.equal(L.rivalWin(p, 'nana', 'tandem'), 400);
  assert.equal(p.money, m0 + 2200);
  assert.equal(L.rivalWin(p, 'personne', 'race'), 0);
  for (const r of L.RIVALS) {
    assert.ok(I.roads[r.e], r.id);
    assert.ok(S.CAST[r.who] || L.RIVAL_CAST[r.who], r.who);
    const c = E.sanitizeCar ? E.sanitizeCar(r.car, Object.assign(E.defaultCar(r.car), r.look)) : null;
    if (c) for (const k of Object.keys(r.look)) if (k !== 'number') assert.ok(E.itemPrice(k, r.look[k]) != null || k === 'rim' || k === 'paint', `${r.id} : ${k}`);
  }
});

test('activités : étoiles payées une seule fois, meilleure valeur gardée', () => {
  const p = E.loadProfile(null), m0 = p.money;
  const r1 = L.recordActivity(p, 'radar-quais', 100);
  assert.equal(r1.stars, 1); assert.equal(r1.reward, 400);
  const r2 = L.recordActivity(p, 'radar-quais', 95);
  assert.equal(r2.reward, 0); assert.equal(r2.best, 100); assert.ok(!r2.record);
  const r3 = L.recordActivity(p, 'radar-quais', 150);
  assert.equal(r3.stars, 3); assert.equal(r3.reward, 700 + 1200);
  assert.equal(p.money, m0 + 2300);
  assert.equal(L.recordActivity(p, 'inconnue', 10), null);
  assert.equal(L.recordActivity(p, 'zone-falaise', NaN), null);
  for (const a of L.ACTIVITIES) {
    assert.ok(I.roads[a.e], a.id);
    assert.equal(a.stars.length, 3);
    assert.ok(a.stars[0] < a.stars[1] && a.stars[1] < a.stars[2], a.id);
  }
});

test('habitants et belvédères : récompense à la première rencontre, choix proposés', () => {
  const p = E.loadProfile(null), m0 = p.money;
  for (const n of L.ISLE_NPCS) {
    const t = L.npcTalk(p, n.id, S);
    assert.ok(t.lines.length && t.choices.length && t.first, n.id);
    for (const [who] of t.lines) assert.ok(S.CAST[who], who);
    const q = L.spotPos(I, n.e, n.at, n.side);
    assert.ok(I.nearestRoad(q.x, q.z, {}).d > I.half, `${n.id} hors de la chaussée`);
  }
  assert.equal(L.npcMet(p, 'kenji'), L.NPC_REWARD);
  assert.equal(L.npcMet(p, 'kenji'), 0);
  assert.ok(!L.npcTalk(p, 'kenji', S).first);
  assert.equal(L.photoTaken(p, 'phare'), 500);
  assert.equal(L.photoTaken(p, 'phare'), 0);
  assert.equal(p.money, m0 + L.NPC_REWARD + 500);
  for (const s of L.PHOTO_SPOTS) assert.ok(I.roads[s.e], s.id);
});

test('profil trafiqué : les sacs de l’île sont réparés', () => {
  const p = { isle: { found: [], rivals: 'x', best: null } };
  const b = L.isleBag(p);
  for (const k of ['found', 'rivals', 'best', 'met', 'photo']) assert.equal(typeof b[k], 'object');
  assert.ok(!Array.isArray(b.found));
});

test('circulation : une voiture trop loin revient près du joueur, sur une route', () => {
  const T = L.createTraffic(I, 3, 5), A = T.agents[0];
  const [x, z] = ISLE.nodes.P;
  assert.ok(L.respawnNear(I, A, x, z, T.rand));
  const d = Math.hypot(A.x - x, A.z - z);
  assert.ok(d >= 250 && d <= 570, `distance ${d}`);
  assert.ok(I.nearestRoad(A.x, A.z, {}).d < I.half);
  for (const k of Object.keys(ISLE.nodes)) assert.ok(ISLE.hubs[Object.keys(ISLE.hubs).find((h) => ISLE.hubs[h] === k)] || L.NODE_NAMES[k], k);
});
