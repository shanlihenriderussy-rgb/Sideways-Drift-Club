import { game } from '../state.js';
import { Sound } from '../../audio/sound.js';
import { profile, saveProfile, store } from '../base.js';
import { setText } from '../hud.js';
import { refreshWallet } from '../menus.js';
import { mp } from '../multiplayer.js';
import { announce, bank, dropGhost, popup, spawnGhost } from '../score.js';
import { countdown, resumeGame, show } from '../session.js';
import { camLook, camPos, gy } from '../stage.js';
import { clearTouch } from '../touch.js';
import { Economy } from '../../progress/economy.js';
import { IsleLife } from '../../island/life.js';
import { fmtSprintTime, newSprint, recordSprint, stepSprint, unpackSprintGhost } from '../../island/sprint.js';
import { Ghost } from '../../sim/ghost.js';
import { $ } from '../../util/dom.js';
import { renderIsleGoal } from './events.js';
import { chat, clearGps, setGps } from './interact.js';
import { fmtDist, isleData, isleQ, placePlayer, starsTxt } from './world.js';

const roadLabel = 'L’ÎLE';
const recordings = 'sprintGhosts';
export const sprintRoad = () => game.life?.sprint?.course.def.e ?? -1;

export function sprintBrief(course) {
  const times = course.def.medals.map(fmtSprintTime).join(' / ');
  chat(
    [
      [
        'narr',
        `${course.def.name} · ${fmtDist(course.length)} · ${course.gates.length} portes à franchir dans l’ordre. Reste sur la route. Bronze / argent / or · ${times}.`,
      ],
    ],
    (act) => {
      if (act === 'go') startSprint(course);
      else resumeGame();
    },
    [
      { label: 'Prendre le départ', act: 'go' },
      { label: 'Reprendre la route', act: 'bye' },
    ],
  );
}

export function startSprint(course) {
  const L = game.life;
  if (!L || mp || L.duel || L.zone || L.race || L.battle) {
    resumeGame();
    return;
  }
  const { x, z, tx, tz } = course.start;
  const run = (L.sprint = newSprint(course));
  L.radar = {};
  bank();
  placePlayer(x, z, Math.atan2(tz, tx), 0);
  const best = sprintRecord(course.def);
  run.rival = unpackSprintGhost(store.get(recordings, null)?.[course.def.id], course, best);
  run.rec = Ghost.recorder(profile.current);
  sampleGhost(run);
  spawnGhost(run.rival?.g, isleData.terrain.at);
  const ground = gy(x, z);
  camPos.set(x - tx * 8, ground + 3, z - tz * 8);
  camLook.set(x + tx * 2, ground + 1, z + tz * 2);
  clearTouch();
  game.phase = 'count';
  show(null);
  $('hudMode').textContent = 'CONTRE-LA-MONTRE';
  $('restartBtn').firstElementChild.textContent = 'Recommencer le chrono';
  setText('hudBest', best ? 'RECORD ' + fmtSprintTime(best) : 'RECORD —');
  $('hudBest').classList.remove('ahead', 'behind');
  showGate(run);
  renderIsleGoal();
  countdown();
  announce(`${course.def.name}. ${course.gates.length} portes. Le chrono démarre au GO.`);
}

function sampleGhost(run) {
  const time = run.ms / 1000;
  if (time < run.rec.next) return;
  const { x, z, heading, rearSlip } = game.player;
  Ghost.push(run.rec, time, { x, z, heading: Math.atan2(Math.sin(heading), Math.cos(heading)), rearSlip }, 0);
}

export function advanceSprint(dt) {
  const run = game.life.sprint;
  if (run.end) return;
  stepSprint(run, game.player, dt, isleQ.edge === run.course.def.e && isleQ.d <= run.course.half + 1.25);
  sampleGhost(run);
}

function showGate(run) {
  const { gates } = run.course;
  const { x, z } = gates[run.next];
  const last = run.next === gates.length - 1;
  game.life.spots.showSprintGate(gates[run.next], last);
  setGps({ name: last ? 'Arrivée' : `Porte ${run.next + 1}/${gates.length}`, x, z, race: true });
  run.shown = run.next;
}

export function updateSprint() {
  const run = game.life.sprint;
  if (run.end) {
    endSprint(run);
  } else if (run.shown !== run.next) {
    showGate(run);
    popup(`Porte ${run.next}/${run.course.gates.length} · ${fmtSprintTime(run.ms)}`, 'clip');
    announce(`Porte ${run.next} validée.`);
    if (run.rival) {
      const k = run.next - 1;
      const delta = run.splits[k] - run.rival.splits[k];
      const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
      const split = `${sign}${(Math.abs(delta) / 1000).toFixed(2).replace('.', ',')} s`;
      setText('hudBest', `RECORD ${fmtSprintTime(run.rival.splits.at(-1))} · ${split}`);
      $('hudBest').classList.toggle('ahead', delta < 0);
      $('hudBest').classList.toggle('behind', delta > 0);
    }
  }
}

export function clearSprint() {
  const L = game.life;
  if (!L?.sprint) return false;
  L.sprint = null;
  L.spots.showSprintGate(null);
  clearGps();
  dropGhost();
  $('hudMode').textContent = roadLabel;
  $('restartBtn').firstElementChild.textContent = 'Recommencer';
  setText('hudBest', 'MONDE OUVERT');
  $('hudBest').classList.remove('ahead', 'behind');
  renderIsleGoal();
  return true;
}

function endSprint(run) {
  const { course, ms } = run;
  clearSprint();
  let result = `${course.def.name} · Temps écoulé. Franchis toutes les portes en moins de deux minutes.`;
  if (run.end === 'offroad') result = `${course.def.name} · Chrono annulé. Reste sur la route entre les portes.`;
  if (run.end === 'finish') {
    const r = recordSprint(profile, course.def, ms);
    if (r.record) {
      saveProfile();
      const ghosts = store.get(recordings, null);
      store.set(recordings, { ...ghosts, [course.def.id]: { ms, splits: run.splits, path: Ghost.pack(run.rec) } });
    }
    if (r.reward) {
      refreshWallet();
      game.life.stats.medals += r.newMedals;
      Sound.cash();
    } else Sound.ping();
    result = `${course.def.name} · ${fmtSprintTime(ms)} · ${starsTxt(r.medals)}. ${r.record ? 'Nouveau record !' : `Record ${fmtSprintTime(r.best)}.`}${r.reward ? ` +${Economy.fmt(r.reward)}` : ''}`;
  } else Sound.lost();
  chat(
    [['narr', result]],
    (act) => {
      if (act === 'again') startSprint(course);
      else resumeGame();
    },
    [
      { label: 'Retenter le chrono', act: 'again' },
      { label: 'Reprendre la route', act: 'bye' },
    ],
  );
}

export function sprintRecord(def) {
  return IsleLife.isleBag(profile).sprints[def.id] || 0;
}
