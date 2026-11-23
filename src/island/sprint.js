// Contre-la-montre de l'île : cotes et franchissements en mètres, résultats en millisecondes.
import { Economy } from '../progress/economy.js';
import { Ghost } from '../sim/ghost.js';
import { IsleLife } from './life.js';

export const SPRINTS = [
  { id: 'quais', name: 'Sprint des quais', e: 0, dir: 1, medals: [25000, 19500, 16300] },
  { id: 'corniche', name: 'Sprint de la corniche', e: 4, dir: -1, medals: [45000, 34500, 28300] },
  { id: 'col', name: 'Sprint du col', e: 13, dir: 1, medals: [26000, 19500, 16500] },
];
export const SPRINT_LIMIT = 120000;
const REWARDS = [600, 1000, 1800];

export function buildSprint(island, def) {
  const length = island.roads[def.e].length;
  const start = 32;
  const finish = length - 35;
  const count = Math.ceil((finish - start) / 82);
  const pose = (s) => IsleLife.roadPose(island, def.e, def.dir, s, 0);
  const gates = Array.from({ length: count }, (_, i) => pose(start + ((i + 1) / count) * (finish - start)));
  return { def, start: pose(start), gates, length: finish - start, half: island.half + 0.4 };
}

export const sprintMedals = (def, ms) => (ms > 0 ? def.medals.filter((limit) => ms <= limit).length : 0);

export function fmtSprintTime(ms) {
  const cs = Math.floor(ms / 10);
  return `${Math.floor(cs / 6000)}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

export const newSprint = (course) => ({ course, next: 0, ms: 0, off: 0, splits: [], end: null });

// Intersection entre le déplacement du joueur et la ligne du portique, avec interpolation du temps d'arrivée.
function crossGate(gate, half, x0, z0, x, z) {
  const before = (x0 - gate.x) * gate.tx + (z0 - gate.z) * gate.tz;
  const after = (x - gate.x) * gate.tx + (z - gate.z) * gate.tz;
  if (before >= 0 || after < 0) return null;
  const t = -before / (after - before);
  const lateral = (z0 + (z - z0) * t - gate.z) * gate.tx - (x0 + (x - x0) * t - gate.x) * gate.tz;
  return Math.abs(lateral) <= half ? t : null;
}

export function stepSprint(run, car, dt, onCourse = true) {
  if (run.end) return;
  run.off = onCourse ? 0 : run.off + dt;
  if (run.off >= 2.25) {
    run.end = 'offroad';
    return;
  }
  const { gates, half } = run.course;
  const gate = gates[run.next];
  const t = onCourse ? crossGate(gate, half, car.x0, car.z0, car.x, car.z) : null;
  if (t !== null && run.ms + t * dt * 1000 <= SPRINT_LIMIT) {
    run.next++;
    const split = Math.max(1, Math.round(run.ms + t * dt * 1000));
    run.splits.push(split);
    if (run.next === gates.length) {
      run.ms = split;
      run.end = 'finish';
      return;
    }
  }
  run.ms += dt * 1000;
  if (run.ms >= SPRINT_LIMIT) {
    run.ms = SPRINT_LIMIT;
    run.end = 'timeout';
  }
}

export function unpackSprintGhost(raw, course, best) {
  if (!raw || !best || raw.ms !== best || !Array.isArray(raw.splits) || raw.splits.length !== course.gates.length)
    return null;
  let prev = 0;
  for (const ms of raw.splits) {
    if (!Number.isInteger(ms) || ms <= prev) return null;
    prev = ms;
  }
  if (prev !== best || !Array.isArray(raw.path?.d)) return null;
  const g = Ghost.unpack(raw.path);
  if (!g || Math.abs(g.dur - best / 1000) > Ghost.DT + 0.015) return null;
  for (let i = 0; i < g.d.length; i += 5) {
    if (Math.abs(g.d[i]) > 1500 || Math.abs(g.d[i + 1]) > 1200 || Math.abs(g.d[i + 2]) > Math.PI + 0.001) return null;
  }
  return { g, splits: raw.splits };
}

export function recordSprint(profile, def, ms) {
  if (!SPRINTS.includes(def) || !Number.isInteger(ms) || ms < 1 || ms > SPRINT_LIMIT) return null;
  const { sprints } = IsleLife.isleBag(profile);
  const prev = sprints[def.id] || 0;
  const record = !prev || ms < prev;
  const best = record ? ms : prev;
  const medals = sprintMedals(def, ms);
  const oldMedals = sprintMedals(def, prev);
  const newMedals = sprintMedals(def, best) - oldMedals;
  const reward = REWARDS.slice(oldMedals, oldMedals + newMedals).reduce((sum, value) => sum + value, 0);
  if (record) sprints[def.id] = best;
  if (reward) Economy.credit(profile, `${def.name} · ${'★'.repeat(medals)}`, reward);
  return { best, record, medals, newMedals, reward };
}
