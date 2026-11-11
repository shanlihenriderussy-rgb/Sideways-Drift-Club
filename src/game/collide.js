// ---------- collisions ----------
import { game } from './state.js';
import { Sound } from '../audio/sound.js';
import { settings } from './base.js';
import { carPoint, latOf, lose, popup, score, vibrate } from './score.js';
import { finishRun } from './session.js';
import { gy } from './stage.js';
import { nearest } from '../sim/track.js';
import { $ } from '../util/dom.js';

export function collide(st, dt) {
  const near = nearest(game.track, st.x, st.z, st.idx, 24);
  st.idx = near.i;
  st.lat0 = near.lat;
  st.surface = Math.abs(near.lat) > game.track.half + 0.4 ? 0.62 : 1;
  st.grip = game.track.def.grip || 1;
  const corners = [
    [game.playerModel.frontX + 0.9, game.playerModel.halfW],
    [game.playerModel.frontX + 0.9, -game.playerModel.halfW],
    [game.playerModel.rearX - 0.85, game.playerModel.halfW],
    [game.playerModel.rearX - 0.85, -game.playerModel.halfW],
  ];
  let worst = 0,
    side = 0,
    cornerX = 0;
  for (const [lx, lz] of corners) {
    const [x, z] = carPoint(st, lx, lz);
    const lat = latOf(st.idx, x, z);
    const pen = Math.abs(lat) - (game.track.wall - 0.1);
    if (pen > worst) {
      worst = pen;
      side = Math.sign(lat);
      cornerX = lx;
    }
  }
  if (worst > 0) {
    const nx = -game.track.tz[st.idx] * side,
      nz = game.track.tx[st.idx] * side; // normale sortante
    st.x -= nx * worst;
    st.z -= nz * worst;
    const vn = st.vx * nx + st.vz * nz;
    if (vn > 0) {
      st.vx -= nx * vn * 1.3;
      st.vz -= nz * vn * 1.3;
      st.vx *= 0.94;
      st.vz *= 0.94;
      st.omega += -side * Math.sign(cornerX) * vn * 0.12;
      if (vn > 1.6) {
        Sound.impact(vn);
        vibrate(Math.min(120, vn * 12));
        if (!settings.reduce) game.shake = Math.min(1, game.shake + vn * 0.08);
        const [cx, cz] = carPoint(st, cornerX, side * game.playerModel.halfW);
        for (let k = 0; k < Math.min(30, vn * 4); k++)
          game.sparks.emit(
            cx,
            gy(cx, cz) + 0.5,
            cz,
            (Math.random() - 0.5) * 6 + st.vx * 0.3,
            2 + Math.random() * 4,
            (Math.random() - 0.5) * 6 + st.vz * 0.3,
            0.4 + Math.random() * 0.3,
            0.25,
            0.08,
            1,
          );
      }
      if (vn > 3 && game.phase === 'play') {
        score.walls++;
        lose('Contact mur');
      }
    }
  }
  // contact avec le leader
  if (game.leader && game.mode === 'tandem' && game.phase === 'play') {
    const dx = st.x - game.leader.state.x,
      dz = st.z - game.leader.state.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.3 && d > 0.01) {
      const push = 3.3 - d;
      st.x += (dx / d) * push;
      st.z += (dz / d) * push;
      const rel = (st.vx - game.leader.state.vx) * (-dx / d) + (st.vz - game.leader.state.vz) * (-dz / d);
      if (rel > 0) {
        st.vx -= (-dx / d) * rel * 1.2;
        st.vz -= (-dz / d) * rel * 1.2;
      }
      if (rel > 2.5) {
        Sound.impact(rel);
        lose('Touchette');
      }
    }
  }
}

// ---------- progression du tour ----------
export const lap = { progress: 0, n: 0, wrongT: 0, done: false };
export function updateProgress(dt) {
  let d = game.player.idx - game.player.prevIdx;
  if (d > game.track.count / 2) d -= game.track.count;
  if (d < -game.track.count / 2) d += game.track.count;
  game.player.prevIdx = game.player.idx;
  lap.progress += d * game.track.step;
  const wrong = game.player.fwd > 3 && Math.cos(game.player.heading - game.track.heading[game.player.idx]) < -0.3;
  lap.wrongT = wrong ? lap.wrongT + dt : Math.max(0, lap.wrongT - dt * 2);
  $('banner').style.display = lap.wrongT > 1 ? 'block' : 'none';
  // franchissement de la ligne (indice qui repasse par 0 en avançant)
  if (d > 0 && game.player.idx < d + 2 && lap.progress > game.track.length * 0.7) {
    lap.n++;
    lap.progress = 0;
    for (const z of game.track.zones) z.hit = false;
    if (game.mode !== 'free') finishRun();
    else popup(`Tour ${lap.n + 1}`, 'apex');
  }
}
