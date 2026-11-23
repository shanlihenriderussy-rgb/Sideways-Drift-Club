import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIsland, ISLE } from '../src/island/map.js';
import { IsleLife } from '../src/island/life.js';
import {
  buildSprint,
  fmtSprintTime,
  newSprint,
  recordSprint,
  SPRINT_LIMIT,
  SPRINTS,
  stepSprint,
  unpackSprintGhost,
} from '../src/island/sprint.js';
import { Economy } from '../src/progress/economy.js';
import { Ghost } from '../src/sim/ghost.js';
import { CAR_SPECS, createCarState, stepCar } from '../src/sim/physics.js';
import { clamp } from '../src/util/math.js';

const island = buildIsland(ISLE);
const step = (run, gate, direction = 1, lat = 0) => {
  const { x, z, tx, tz } = gate;
  stepSprint(
    run,
    {
      x0: x - direction * tx - lat * tz,
      z0: z - direction * tz + lat * tx,
      x: x + direction * tx - lat * tz,
      z: z + direction * tz + lat * tx,
    },
    0.1,
  );
};

test('les trois chronos ont des portes orientées et réparties sur des routes différentes', () => {
  assert.equal(new Set(SPRINTS.map(({ e }) => e)).size, 3);
  for (const def of SPRINTS) {
    const course = buildSprint(island, def);
    assert.ok(course.length > 350 && course.gates.length >= 5);
    let last = course.start;
    for (const g of course.gates) {
      const road = island.nearestRoad(g.x, g.z, {});
      assert.equal(road.edge, def.e);
      assert.ok(road.d < 1);
      assert.ok(Math.hypot(g.x - last.x, g.z - last.z) > 35);
      assert.ok((g.i - last.i) * def.dir > 0);
      last = g;
    }
  }
});

test('un portique doit être franchi dans le bon sens, sur la route et dans l’ordre', () => {
  const run = newSprint(buildSprint(island, SPRINTS[0]));
  const [first, second] = run.course.gates;
  step(run, second);
  step(run, first, -1);
  step(run, first, 1, run.course.half + 0.1);
  assert.equal(run.next, 0);
  for (const g of run.course.gates) step(run, g);
  assert.equal(run.next, run.course.gates.length);
  assert.equal(run.end, 'finish');
  assert.equal(run.ms, 100 * (run.next + 2) + 50);
  step(run, run.course.gates.at(-1));
  assert.equal(run.ms, 100 * (run.next + 2) + 50);
});

test('une arrivée après la limite de temps ne valide pas le chrono', () => {
  const run = newSprint(buildSprint(island, SPRINTS[0]));
  run.next = run.course.gates.length - 1;
  run.ms = SPRINT_LIMIT - 30;
  step(run, run.course.gates.at(-1));
  assert.equal(run.end, 'timeout');
  assert.equal(run.ms, SPRINT_LIMIT);
});

test('une brève sortie de route est tolérée, une sortie prolongée annule le chrono', () => {
  const run = newSprint(buildSprint(island, SPRINTS[0]));
  const stopped = { x0: 0, z0: 0, x: 0, z: 0 };
  stepSprint(run, stopped, 1.9, false);
  stepSprint(run, stopped, 0.1, true);
  stepSprint(run, stopped, 2.1, false);
  assert.equal(run.end, null);
  stepSprint(run, stopped, 0.2, false);
  assert.equal(run.end, 'offroad');
});

test('un fantôme est relu seulement s’il correspond au record et aux portes', () => {
  const course = buildSprint(island, SPRINTS[0]);
  const ms = 17000;
  const rec = Ghost.recorder('hachi');
  Ghost.push(rec, ms / 1000, { ...course.start, heading: 0 }, 0);
  const splits = course.gates.map((_, i) => Math.round((ms * (i + 1)) / course.gates.length));
  const raw = { ms, splits, path: Ghost.pack(rec) };
  assert.ok(unpackSprintGhost(raw, course, ms));
  assert.equal(unpackSprintGhost(raw, course, ms - 1), null);
  assert.equal(unpackSprintGhost({ ...raw, splits: splits.slice(1) }, course, ms), null);
  raw.path.d[2] = 1e50;
  assert.equal(unpackSprintGhost(raw, course, ms), null);
});

test('les trois temps or sont réalisables en HACHI d’origine avec la physique du jeu', () => {
  const dt = 1 / 120;
  const grad = [];
  const query = {};
  for (const def of SPRINTS) {
    const course = buildSprint(island, def);
    const run = newSprint(course);
    const { x, z, tx, tz } = course.start;
    const car = createCarState(CAR_SPECS.hachi, x, z, Math.atan2(tz, tx));
    const road = island.roads[def.e];
    const speeds = IsleLife.lifeOf(island).prof[def.e].race;
    while (!run.end) {
      island.nearestRoad(car.x, car.z, query);
      assert.equal(query.edge, def.e);
      assert.ok(query.d < island.half, def.name);
      const i = query.i - road.off;
      const s = def.dir > 0 ? i * road.step : road.length - i * road.step;
      const p = IsleLife.roadPose(island, def.e, def.dir, s + 6 + car.speed * 0.44, 0);
      const angle = Math.atan2(p.z - car.z, p.x - car.x) - car.heading;
      const next = clamp(i + def.dir * Math.round(Math.max(3, car.speed * 0.25) / road.step), 0, road.count - 1);
      const delta = Math.min(33, speeds[next] + 4) - car.speed;
      const input = {
        steer: clamp(2.9 * Math.atan2(Math.sin(angle), Math.cos(angle)) - 0.12 * car.omega, -1, 1),
        throttle: clamp(0.2 + delta * 0.5, 0, 1),
        brake: clamp(-delta * 0.18, 0, 0.75),
        handbrake: 0,
      };
      island.terrain.grad(car.x, car.z, grad);
      Object.assign(car, { x0: car.x, z0: car.z, gx: grad[0], gz: grad[1] });
      stepCar(car, input, dt, 1);
      stepSprint(run, car, dt);
    }
    assert.equal(run.end, 'finish');
    assert.ok(run.ms < def.medals[2], `${def.name} : ${fmtSprintTime(run.ms)}`);
  }
});

test('le meilleur chrono et les primes de médailles résistent à la sauvegarde', () => {
  const def = SPRINTS[0];
  const p = Economy.loadProfile(null);
  const startMoney = p.money;
  assert.equal(recordSprint(p, def, 29000).reward, 0);
  assert.equal(recordSprint(p, def, 23000).reward, 600);
  assert.equal(recordSprint(p, def, 16300).reward, 2800);
  p.isle.best['radar-quais'] = 142;
  p.isle.rivals.nana = 2;
  p.isle.photo.phare = true;
  p.isle.found[4] = true;
  p.isle.met.kenji = true;
  p.isle.sprints.invalide = -5;
  const reloaded = Economy.loadProfile(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(reloaded.isle, {
    found: { 4: true },
    best: { 'radar-quais': 142 },
    rivals: { nana: 2 },
    photo: { phare: true },
    met: { kenji: true },
    sprints: { quais: 16300 },
  });
  assert.deepEqual(recordSprint(reloaded, def, 15500), {
    best: 15500,
    medals: 3,
    newMedals: 0,
    reward: 0,
    record: true,
  });
  assert.equal(recordSprint(reloaded, def, 20000).best, 15500);
  assert.equal(reloaded.money, startMoney + 3400);
  assert.equal(fmtSprintTime(59999), '0:59.99');
  assert.equal(fmtSprintTime(60000), '1:00.00');
});
