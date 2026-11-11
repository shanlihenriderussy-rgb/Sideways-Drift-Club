import { game } from './state.js';
import { Sound } from '../audio/sound.js';
import { explore, updateExplore } from './adventure.js';
import { profile, settings } from './base.js';
import { carFx, updateCamera } from './camera.js';
import { collide, lap, updateProgress } from './collide.js';
import { updateFavicon, updateHUD } from './hud.js';
import { input } from './input.js';
import { lifeCollide, lifeTick } from './island/life.js';
import { lifeDraw } from './island/render.js';
import { isle, isleCollide, isleRespawn, isleTick } from './island/world.js';
import { replayFrame, rp, rv } from './moments.js';
import { mpSendTick } from './multiplayer.js';
import { resetPlayer } from './scene.js';
import { ghostCar, lose, popup, score, updateGhost, updateScore } from './score.js';
import { screenId } from './session.js';
import { QUALITY, _grad, camera, curTer, gy, renderer, resize, scene, showroom } from './stage.js';
import { readInput } from './touch.js';
import { Ghost } from '../sim/ghost.js';
import { stepCar } from '../sim/physics.js';

export let frameAvg = 16;
let frameN = 0;
let qCheckT = 0;
export const STEP = 1 / 120;
export const perf = { js: 0, render: 0 };
export function frame(now) {
  requestAnimationFrame(frame);
  const tA = performance.now();
  let dt = Math.min((now - game.last) / 1000, 0.1);
  game.last = now;
  frameAvg += (dt * 1000 - frameAvg) * 0.05;
  const t = now / 1000;

  if (game.phase === 'replay' && rp) {
    replayFrame(dt);
  } else if (game.phase === 'menu' || game.phase === 'results' || (game.phase === 'pause' && !game.player)) {
    // mode attraction : ta voiture (garage) glisse seule, la caméra tourne autour
    game.playerModel.root.visible = true;
    game.leaderModel.root.visible = false;
    if (screenId === 'garage') {
      // vitrine : voiture garée sur la ligne, plateau tournant
      const i0 = 6;
      showroom.x = game.track.px[i0];
      showroom.z = game.track.pz[i0];
      showroom.heading = game.track.heading[i0];
      showroom.wheelRot = 0;
      showroom.steerAngle = 0.32;
      showroom.rollAngle = 0;
      showroom.pitchAngle = 0;
      game.playerModel.update(showroom, dt, false);
      updateCamera(dt, showroom, 'garage');
    } else if (isle && game.player) {
      // sur l'île : ta voiture garée là où la balade s'arrête, la caméra tourne autour
      game.playerModel.update(game.player, dt, false);
      updateCamera(dt, game.player, true);
    } else {
      game.leader.update(dt, 1);
      game.playerModel.update(game.leader.state, dt, false);
      carFx(game.leader.state, game.playerModel, dt, 'L', 'P');
      updateCamera(dt, game.leader.state, true);
    }
    Sound.update(game.leader.state, 'raijin', false);
  } else if (game.phase === 'play' || game.phase === 'count') {
    game.playerModel.root.visible = true;
    game.leaderModel.root.visible = game.mode === 'tandem';
    readInput();
    if (game.phase === 'play') {
      game.acc += dt;
      while (game.acc >= STEP) {
        game.player.x0 = game.player.x;
        game.player.z0 = game.player.z;
        game.player.h0 = game.player.heading;
        curTer().grad(game.player.x, game.player.z, _grad);
        game.player.gx = _grad[0];
        game.player.gz = _grad[1];
        stepCar(game.player, input, STEP, settings.assist);
        if (isle) {
          isleCollide(game.player);
          if (game.life) lifeCollide(game.player);
        } else collide(game.player, STEP);
        game.acc -= STEP;
      }
      if (!isle) updateProgress(dt);
      updateScore(dt);
      if (game.ghostRec) Ghost.push(game.ghostRec, score.runT, game.player, score.total + score.combo);
      if (game.hlRec) Ghost.push(game.hlRec, score.runT, game.player, score.total + score.combo);
      if (explore) updateExplore(dt);
      if (isle) isleTick(dt);
      if (game.mode === 'tandem') {
        let gap = game.leader.state.s - lapS();
        const L = game.track.length;
        gap = ((gap % L) + L) % L;
        if (gap > L / 2) gap -= L;
        const scale = gap > 34 ? 0.82 : gap > 22 ? 0.92 : gap < 7 ? 1.06 : 1;
        game.leader.update(dt, scale);
        carFx(game.leader.state, game.leaderModel, dt, 'L');
      }
      // gaz coupé → retour de flamme occasionnel
      if (game.player.prevThrottle > 0.8 && game.player.throttle < 0.4 && game.player.rpm > 5200) {
        game.playerModel.flame.visible = true;
        game.playerModel.flameT = 0.12;
        Sound.backfire();
        if (profile.current !== 'hachi') Sound.blowoff();
      }
      game.player.prevThrottle = game.player.throttle;
      updateStuck(dt);
    } else {
      // compte à rebours : moteur qui rugit sur place
      game.player.rpm += (1500 + input.throttle * 5000 - game.player.rpm) * Math.min(1, dt * 6);
      game.player.throttle = input.throttle;
    }
    if (game.playerModel.flameT > 0) {
      game.playerModel.flameT -= dt;
      game.playerModel.flicker();
      if (game.playerModel.flameT <= 0) game.playerModel.flame.visible = false;
    }
    // affichage interpolé entre les deux derniers pas physiques : mouvement régulier à 60, 90, 120 ou 144 Hz
    const pv = interp(game.player, game.phase === 'play' ? game.acc / STEP : 1);
    game.playerModel.update(pv, dt, input.brake > 0.1 || input.handbrake > 0.5);
    if (ghostCar && game.phase === 'play') updateGhost(dt);
    game.leaderModel.update(game.leader.state, dt, false);
    carFx(pv, game.playerModel, dt, 'P');
    updateCamera(dt, pv, false);
    Sound.update(game.player, profile.current, true);
    updateHUD(dt);
  } else if (game.phase === 'pause') {
    updateCamera(0, game.player, false);
  }

  if (isle && game.life && game.player) {
    if (game.phase === 'play' || game.phase === 'count') lifeTick(dt);
    lifeDraw(dt, t);
    mpSendTick(dt);
  }
  if (game.phase !== 'pause') {
    const fx = game.phase === 'replay' && rp ? dt * rp.rate : dt;
    game.smoke.update(fx);
    game.sparks.update(fx);
  }
  game.skids.flush();
  updateFavicon(dt);
  game.world.update(t, camera.position);
  // ombre qui suit la voiture visible
  const focus =
    game.phase === 'replay' && rp
      ? rv
      : game.phase === 'play' || game.phase === 'count' || game.phase === 'pause'
        ? game.player
        : game.leader.state;
  if (focus) {
    const fy = gy(focus.x, focus.z);
    game.world.sun.target.position.set(focus.x, fy, focus.z);
    const sd = game.world.theme.sun;
    game.world.sun.position.set(focus.x + sd[0] * 60, fy + Math.max(sd[1], 0.35) * 60, focus.z + sd[2] * 60);
  }
  if (game.dbgTrace && game.phase === 'play') {
    const o = game.playerModel.root.position;
    game.dbgTrace.push(now, o.x, o.z, game.player.speed);
  }
  const tB = performance.now();
  renderer.render(scene, camera);
  perf.js += (tB - tA - perf.js) * 0.05;
  perf.render += (performance.now() - tB - perf.render) * 0.05;
  autoQuality(dt); // après le rendu : un éventuel redimensionnement s'applique à l'image suivante
}
const view = {};
function interp(st, a) {
  for (const k in st) view[k] = st[k];
  if (st.x0 === undefined) return view;
  let dh = st.heading - st.h0;
  if (dh > Math.PI) dh -= 2 * Math.PI;
  else if (dh < -Math.PI) dh += 2 * Math.PI;
  view.x = st.x0 + (st.x - st.x0) * a;
  view.z = st.z0 + (st.z - st.z0) * a;
  view.heading = st.h0 + dh * a;
  return view;
}
function lapS() {
  return ((game.track.count + game.player.idx) % game.track.count) * game.track.step + lap.n * game.track.length;
}

let stuckT = 0;
function updateStuck(dt) {
  const offFar = isle ? game.player.wetT > 0.8 : Math.abs(game.player.lat0) > game.track.wall + 2;
  if ((game.player.speed < 1.2 && input.throttle > 0.5) || offFar) stuckT += dt;
  else stuckT = 0;
  if (stuckT > 2.5) {
    stuckT = 0;
    respawn();
  }
}
export function respawn() {
  if (isle) {
    isleRespawn();
    return;
  }
  const i = game.player.idx;
  lose('Replacement');
  resetPlayer(i, 10);
  game.player.prevIdx = i;
  popup('Replacé sur la piste', 'apex');
}

// qualité automatique : d'abord la résolution par petits pas (invisible), puis un cran de qualité si ça ne suffit pas.
// Remonte doucement quand l'appareil a de la marge.
function autoQuality(dt) {
  if (settings.quality !== 'auto' || game.phase !== 'play') return;
  qCheckT += dt;
  if (qCheckT < 2) return;
  qCheckT = 0;
  if (frameAvg > 20) {
    // le coût de rendu suit le nombre de pixels (dpr²) : on vise 60 i/s en un ou deux pas, pas en dix
    game.fastT = 0;
    const want = Math.max(0.6, game.dprScale * Math.sqrt(16.7 / frameAvg));
    if (game.dprScale - want > 0.05) {
      game.dprScale = want;
      resize();
    } else if (frameAvg > 24 && game.qLevel !== 'low') {
      game.qLevel = game.qLevel === 'high' ? 'med' : 'low';
      game.quality = QUALITY[game.qLevel];
      game.world.sun.castShadow = game.quality.shadows;
      game.dprScale = Math.min(1, game.dprScale + 0.2);
      resize();
    }
  } else if (frameAvg < 14 && game.dprScale < 1) {
    game.fastT += 2;
    if (game.fastT >= 8) {
      game.fastT = 0;
      game.dprScale = Math.min(1, game.dprScale + 0.1);
      resize();
    }
  } else game.fastT = 0;
}

export function init() {
  // ---------- boucle ----------
  game.last = performance.now();
}
