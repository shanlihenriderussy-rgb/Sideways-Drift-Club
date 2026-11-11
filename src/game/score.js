// ---------- son ----------
import { game } from './state.js';
import { Sound } from '../audio/sound.js';
import { bests, profile, settings, store } from './base.js';
import { el, setText } from './hud.js';
import { isle } from './island/world.js';
import { lookOf } from './scene.js';
import { scene } from './stage.js';
import { Economy } from '../progress/economy.js';
import { buildCar } from '../render/car.js';
import { Ghost } from '../sim/ghost.js';
import { inRange } from '../sim/track.js';
import { $ } from '../util/dom.js';
import { clamp } from '../util/math.js';

export function ensureAudio() {
  if (!settings.sound) return;
  Sound.init();
}
export function vibrate(ms) {
  if (settings.vibe && navigator.vibrate) {
    try {
      navigator.vibrate(ms);
    } catch (e) {
      /* refusé */
    }
  }
}

// ---------- score ----------
export const score = {
  total: 0,
  combo: 0,
  mult: 1,
  idle: 0,
  best: 0,
  clips: 0,
  maxAngle: 0,
  driftT: 0,
  runT: 0,
  offT: 0,
  tandemT: 0,
  lastBank: 0,
  walls: 0,
};
export function resetScore() {
  Object.assign(score, {
    total: 0,
    combo: 0,
    mult: 1,
    idle: 0,
    best: 0,
    clips: 0,
    maxAngle: 0,
    driftT: 0,
    runT: 0,
    offT: 0,
    tandemT: 0,
    walls: 0,
    ev: [],
    c0: 0,
    angT: 0,
  });
  for (const z of game.track.zones) z.hit = false;
}
const WORDS = [
  [1500, 'BIEN'],
  [4000, 'SUPER'],
  [9000, 'ÉNORME'],
  [16000, 'INSENSÉ'],
  [Infinity, 'LÉGENDAIRE'],
];
// ---------- fantôme du record (ghost.js) : rejoue ton meilleur run noté, écart de points en direct ----------
export let ghosts;
export let ghostCar = null;
let ghostT = 0;
const ghostView = { x: 0, z: 0, heading: 0, rollAngle: 0, pitchAngle: 0, wheelRot: 0, steerAngle: 0, rearSlip: 0 };
export function dropGhost() {
  if (ghostCar) {
    ghostCar.model.dispose();
    ghostCar = null;
  }
}
export function buildGhost() {
  dropGhost();
  const g = game.mode === 'run' && !isle ? Ghost.unpack(ghosts[game.track.def.id]) : null;
  if (!g) return;
  const model = buildCar(
    g.kind,
    lookOf(profile.cars[g.kind] || Economy.defaultCar(g.kind), game.world.theme.headlights),
  );
  model.ground = game.track.terrain.at;
  // voiture de verre : tous les matériaux deviennent transparents, l'opacité suit la distance à ta voiture
  const mats = [];
  model.root.traverse((o) => {
    if (!o.material) return;
    for (const m of [].concat(o.material))
      if (!mats.includes(m)) {
        m.userData.o = m.opacity;
        m.transparent = true;
        m.depthWrite = false;
        mats.push(m);
      }
  });
  model.root.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  scene.add(model.root);
  ghostCar = { g, model, mats, fade: -1 };
}
export function updateGhost(dt) {
  const G = ghostCar,
    s = Ghost.at(G.g, score.runT, ghostView);
  ghostView.wheelRot += dt * 50;
  ghostView.steerAngle = -s.rearSlip * 0.5;
  G.model.update(ghostView, dt, false);
  const d = Math.hypot(s.x - game.player.x, s.z - game.player.z);
  const f = (s.done ? 0 : clamp((d - 2.5) / 9, 0, 1)) * 0.38;
  if (Math.abs(f - G.fade) > 0.02) {
    G.fade = f;
    for (const m of G.mats) m.opacity = m.userData.o * f;
    G.model.root.visible = f > 0.01;
  }
  ghostT -= dt;
  if (ghostT <= 0) {
    ghostT = 0.25;
    const delta = Math.round(score.total + score.combo - s.pts),
      b = el('hudBest');
    setText(
      'hudBest',
      `RECORD ${(bests[game.track.def.id + ':run'] || 0).toLocaleString('fr-FR')} · ${delta >= 0 ? '+' : '−'}${Math.abs(delta).toLocaleString('fr-FR')}`,
    );
    const cls = delta >= 0 ? 'ahead' : 'behind';
    if (b.dataset.d !== cls) {
      b.dataset.d = cls;
      b.classList.toggle('ahead', delta >= 0);
      b.classList.toggle('behind', delta < 0);
    }
  }
}

export function bank() {
  if (score.combo < 1) {
    score.combo = 0;
    score.mult = 1;
    return;
  }
  if (score.combo >= 1500) pulseHeat();
  const pts = Math.round(score.combo);
  score.total += pts;
  score.best = Math.max(score.best, pts);
  if (pts >= 150) {
    const word = WORDS.find((w) => pts < w[0])[1];
    popup(`${word} +${pts.toLocaleString('fr-FR')}`, 'bank');
    if (pts >= 400 && score.ev)
      score.ev.push({
        k: 'combo',
        t: score.runT,
        t0: score.c0,
        v: pts,
        label: `${word} · ${pts.toLocaleString('fr-FR')} pts`,
      });
    Sound.bank(pts > 9000);
  }
  score.combo = 0;
  score.mult = 1;
}
export const lossLog = {};
export function lose(reason) {
  if (score.combo > 50) {
    lossLog[reason] = (lossLog[reason] || 0) + 1;
    lossLog.pts = (lossLog.pts || 0) + Math.round(score.combo);
  }
  if (score.combo > 50) {
    popup(`${reason} · combo perdu`, 'lost');
    Sound.lost();
    vibrate(60);
  }
  score.combo = 0;
  score.mult = 1;
  score.idle = 0;
}
export function popup(text, cls) {
  const box = $('popups');
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), 1650);
}
export function announce(t) {
  $('live').textContent = t;
}
// encaissement d'un gros combo : un éclat du halo (sans effet si « mouvement réduit »)
function pulseHeat() {
  if (settings.reduce) return;
  const h = $('heat');
  h.classList.remove('pulse');
  void h.offsetWidth;
  h.classList.add('pulse');
}

// point de la voiture en coordonnées monde (x local avant, z local droite)
export function carPoint(st, lx, lz) {
  const c = Math.cos(st.heading),
    s = Math.sin(st.heading);
  return [st.x + c * lx - s * lz, st.z + s * lx + c * lz];
}
export function latOf(i, x, z) {
  return (x - game.track.px[i]) * -game.track.tz[i] + (z - game.track.pz[i]) * game.track.tx[i];
}

export function updateScore(dt) {
  const st = game.player;
  const ang = (Math.abs(st.slip) * 180) / Math.PI;
  const onRoad = isle ? st.roadD < isle.I.half + 0.6 : Math.abs(st.lat0) < game.track.half + 0.6;
  const drifting = ang > 12 && st.speed > 8 && st.fwd > 2 && onRoad;
  score.runT += dt;
  if (drifting) {
    score.driftT += dt;
    if (Math.min(ang, 90) > score.maxAngle) {
      score.maxAngle = Math.min(ang, 90);
      score.angT = score.runT;
    }
    let tandemK = 1;
    if (game.leader && game.mode === 'tandem') {
      const d = Math.hypot(st.x - game.leader.state.x, st.z - game.leader.state.z);
      if (d < 11 && game.leader.drifting) {
        tandemK = 1.6;
        score.tandemT += dt;
        score.mult = Math.min(8, score.mult + dt * 0.18);
      }
    }
    const pts = (Math.min(ang, 70) - 8) * ((st.speed * 3.6) / 10) * dt * 1.1 * tandemK;
    if (score.combo <= 0) score.c0 = score.runT; // début du combo (moments forts)
    score.combo += pts * score.mult;
    score.mult = Math.min(8, score.mult + dt * 0.1);
    score.idle = 0;
  } else if (score.combo > 0) {
    score.idle += dt;
    if (score.idle > 1.25) bank();
  }
  if (ang > 105 && st.speed > 3) lose('Tête-à-queue');
  if (!onRoad && st.speed > 4) {
    score.offT += dt;
    if (score.offT > 0.45) lose('Hors piste');
  } else score.offT = 0;

  // zones de clipping (pas sur l'île)
  if (drifting && !isle) {
    for (const z of game.track.zones) {
      if (z.hit) continue;
      const inZ = inRange(st.idx, z.from, z.to, game.track.count);
      if (!inZ) continue;
      if (z.type === 'outer') {
        const [rx, rz] = carPoint(st, game.playerModel.rearX - 0.8, 0);
        const lat = latOf(st.idx, rx, rz) * z.side;
        if (lat > game.track.half - 3.2) {
          z.hit = true;
          z.flash = 1;
          score.clips++;
          score.mult = Math.min(8, score.mult + 0.5);
          score.combo += 400 * score.mult;
          popup('Clip extérieur +400', 'clip');
          score.ev.push({ k: 'clip', t: score.runT, v: 400, label: 'Clip extérieur, l’arrière au mur' });
          Sound.clip();
          vibrate(25);
        }
      } else {
        const [fx, fz] = carPoint(st, game.playerModel.frontX + 0.7, 0);
        const lat = latOf(st.idx, fx, fz) * z.side;
        if (lat > game.track.half - 3.6) {
          z.hit = true;
          z.flash = 1;
          score.clips++;
          score.mult = Math.min(8, score.mult + 0.35);
          score.combo += 250 * score.mult;
          popup('Corde +250', 'apex');
          score.ev.push({ k: 'clip', t: score.runT, v: 250, label: 'Corde, l’avant au cône' });
          Sound.clip();
          vibrate(20);
        }
      }
    }
  }
}

export function init() {
  ghosts = store.get('ghosts', {});
}
