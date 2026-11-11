// ---------- vie de l'île : circulation, rivaux, habitants, belvédères, radars, zones ----------
import { game } from '../state.js';
import { Sound } from '../../audio/sound.js';
import { isTouch, profile, settings } from '../base.js';
import { actsTick, duelTick, renderIsleGoal } from './events.js';
import { scanInteract, updateGps } from './interact.js';
import { castOf, envOn, isleData } from './world.js';
import { battleTick, dropRemoteModel, mp, raceTick, refreshMpHud, remoteModel } from '../multiplayer.js';
import { lookOf } from '../scene.js';
import { lose, popup, score, vibrate } from '../score.js';
import { gy, scene } from '../stage.js';
import { buildIsleSpots, createTrafficLayer, makeTag } from '../../island/actors.js';
import { IsleLife } from '../../island/life.js';
import { Economy } from '../../progress/economy.js';
import { Story } from '../../progress/story.js';
import { buildCar } from '../../render/car.js';
import { $ } from '../../util/dom.js';

export function buildLife() {
  const I = isleData;
  const T = IsleLife.createTraffic(I, isTouch ? 16 : 22, 1 + (Date.now() % 9973));
  // la circulation démarre autour de toi, pas à l'autre bout de l'île
  T.agents.forEach((A, k) => {
    if (k % 2 === 0) IsleLife.respawnNear(I, A, game.player.x, game.player.z, T.rand);
  });
  game.life = {
    T,
    layer: createTrafficLayer(game.world.group, T.agents, I.terrain.at),
    spots: buildIsleSpots(game.world.group, I, castOf),
    rivals: [],
    obs: [],
    me: { x: 0, z: 0, vx: 0, vz: 0 },
    gps: null,
    duel: null,
    zone: null,
    radar: {},
    near: null,
    scanT: 0,
    goalT: 0,
    sendT: 0,
    hostT: 0,
    bumpT: 0,
    race: null,
    battle: null,
    stats: { rivals: 0, stars: 0, photos: 0 },
  };
  for (const def of IsleLife.RIVALS) if (IsleLife.rivalOpen(profile, def, Story)) addRival(def);
  if (mp) for (const R of mp.remotes.values()) remoteModel(R);
  refreshMpHud();
}
export function clearLife() {
  $('prompt').hidden = true;
  $('gps').hidden = true;
  $('mpHud').hidden = true;
  if (!game.life) return;
  game.life.layer.dispose();
  game.life.spots.dispose();
  for (const r of game.life.rivals) {
    r.tag.dispose();
    r.model.dispose();
  }
  if (mp) for (const R of mp.remotes.values()) dropRemoteModel(R);
  game.life = null;
}
function addRival(def) {
  const I = isleData,
    r = I.roads[def.e];
  const A = IsleLife.makeAgent(I, {
    id: def.id,
    e: def.e,
    dir: 1,
    s: r.length * 0.4,
    lane: 0,
    laneT: 0,
    k: def.skill,
    speed: 12,
    wheelRot: 0,
    steerAngle: 0,
    rollAngle: 0,
    pitchAngle: 0,
    rearSlip: 0,
    slip: 0,
    throttle: 1,
    rpm: 5000,
  });
  const model = buildCar(def.car, lookOf(Object.assign(Economy.defaultCar(def.car), def.look), false));
  model.ground = I.terrain.at;
  envOn(model);
  scene.add(model.root);
  const c = castOf(def.who),
    tag = makeTag();
  tag.set(c.name, def.crew, c.col);
  tag.sprite.position.set(0, 2.7, 0);
  model.root.add(tag.sprite);
  game.life.rivals.push({ def, A, model, tag, c, cool: 0, farT: 0, fx: 'R' + game.life.rivals.length });
}

// contact avec la circulation, les rivaux et les autres joueurs : deux disques par voiture, seul le joueur local est repoussé
export function lifeCollide(st) {
  const L = game.life,
    c = Math.cos(st.heading),
    s = Math.sin(st.heading);
  const P0x = st.x + c * 1.05,
    P0z = st.z + s * 1.05,
    P1x = st.x - c * 1.05,
    P1z = st.z - s * 1.05;
  const hit = (ox, oz, oh, half, rad, ovx, ovz, A, r) => {
    const oc = Math.cos(oh),
      os = Math.sin(oh);
    for (const q of [half, -half]) {
      const qx = ox + oc * q,
        qz = oz + os * q;
      for (const [px, pz] of [
        [P0x, P0z],
        [P1x, P1z],
      ]) {
        let dx = px - qx,
          dz = pz - qz;
        const d = Math.hypot(dx, dz),
          m = 1.0 + rad;
        if (d >= m || d < 1e-4) continue;
        dx /= d;
        dz /= d;
        st.x += dx * (m - d);
        st.z += dz * (m - d);
        const vrel = (st.vx - ovx) * dx + (st.vz - ovz) * dz;
        if (vrel < 0) {
          st.vx -= dx * vrel * 1.25;
          st.vz -= dz * vrel * 1.25;
          st.omega += (px === P0x ? 1 : -1) * (dx * -s + dz * c) * vrel * 0.06;
          bump(-vrel, qx, qz, A, r);
        }
        return;
      }
    }
  };
  for (const A of L.T.agents) {
    if (Math.abs(A.x - st.x) < 9 && Math.abs(A.z - st.z) < 9)
      hit(A.x, A.z, A.heading, A.kind.len / 2 - A.kind.w / 2, A.kind.w / 2 + 0.05, A.vx || 0, A.vz || 0, A, null);
  }
  for (const r of L.rivals) {
    const A = r.A;
    if (Math.abs(A.x - st.x) < 9 && Math.abs(A.z - st.z) < 9)
      hit(A.x, A.z, A.heading, 1.05, 1.0, A.vx || 0, A.vz || 0, null, r);
  }
  if (mp)
    for (const R of mp.remotes.values()) {
      const v = R.view;
      if (R.shown && Math.abs(v.x - st.x) < 9 && Math.abs(v.z - st.z) < 9)
        hit(v.x, v.z, v.heading, 1.05, 1.0, v.vx, v.vz, null, null);
    }
}
function bump(v, x, z, A, r) {
  if (A) {
    if (v > 1.5 && A.hitT <= 0) A.hitT = 2.5 + Math.random() * 2;
    A.speed *= 0.5;
  }
  if (v < 1.6 || game.life.bumpT > 0) return;
  game.life.bumpT = 0.35;
  Sound.impact(v);
  vibrate(Math.min(120, v * 12));
  if (!settings.reduce) game.shake = Math.min(1, game.shake + v * 0.06);
  for (let k = 0; k < Math.min(24, v * 4); k++)
    game.sparks.emit(
      x,
      gy(x, z) + 0.6,
      z,
      (Math.random() - 0.5) * 6,
      2 + Math.random() * 4,
      (Math.random() - 0.5) * 6,
      0.4 + Math.random() * 0.3,
      0.25,
      0.08,
      1,
    );
  if (v > 3 && game.phase === 'play') lose(A ? 'Accrochage' : 'Touchette');
}

// un pas de vie (jeu ou compte à rebours) : circulation, rivaux, interactions, GPS, duel, activités, multijoueur
export function lifeTick(dt) {
  const L = game.life,
    I = isleData,
    st = game.player;
  if (L.bumpT > 0) L.bumpT -= dt;
  const obs = L.obs;
  obs.length = 0;
  L.me.x = st.x;
  L.me.z = st.z;
  L.me.vx = st.vx;
  L.me.vz = st.vz;
  obs.push(L.me);
  for (const r of L.rivals) obs.push(r.A);
  if (mp) for (const R of mp.remotes.values()) if (R.shown) obs.push(R.view);
  for (const A of L.T.agents) obs.push(A);
  for (const A of L.T.agents) {
    const dx = A.x - st.x,
      dz = A.z - st.z,
      d2 = dx * dx + dz * dz;
    if (d2 > 640 * 640) {
      IsleLife.respawnNear(I, A, st.x, st.z, L.T.rand);
      continue;
    }
    const ev = IsleLife.stepAgent(I, A, dt, obs, L.T.rand, false);
    if (ev === 'honk' && d2 < 110 * 110)
      Sound.horn(1 - Math.sqrt(d2) / 110, A.kind.id === 'bus' ? 0.72 : A.kind.id === 'kei' ? 1.22 : 1);
  }
  nearMiss(dt);
  rivalsTick(dt);
  if (L.duel) duelTick(dt);
  actsTick(dt);
  if (L.race) raceTick(dt);
  if (L.battle) battleTick(dt);
  L.scanT -= dt;
  if (L.scanT <= 0) {
    L.scanT = 0.1;
    scanInteract();
    updateGps();
  }
  L.goalT -= dt;
  if (L.goalT <= 0) {
    L.goalT = 0.2;
    renderIsleGoal();
  }
}
// « Frôlé ! » : passer en glisse à moins d'un mètre d'une voiture sans la toucher rapporte des points (une fois par voiture et par passage)
function nearMiss(dt) {
  const st = game.player,
    L = game.life;
  const drifting = game.phase === 'play' && (Math.abs(st.slip) * 180) / Math.PI > 15 && st.speed > 9 && score.combo > 0;
  const c = Math.cos(st.heading),
    s = Math.sin(st.heading);
  for (const A of L.T.agents) {
    if (A.nearCool > 0) A.nearCool -= dt;
    if (!drifting || A.nearCool > 0 || A.hitT > 0 || Math.abs(A.x - st.x) > 9 || Math.abs(A.z - st.z) > 9) continue;
    const half = A.kind.len / 2 - A.kind.w / 2,
      rad = A.kind.w / 2 + 0.05,
      oc = Math.cos(A.heading),
      os = Math.sin(A.heading);
    let gap = Infinity;
    for (const q of [half, 0, -half])
      for (const p of [1.05, -1.05])
        gap = Math.min(gap, Math.hypot(st.x + c * p - A.x - oc * q, st.z + s * p - A.z - os * q) - 1.0 - rad);
    if (gap > 1.1 || gap < 0.05 || L.bumpT > 0) continue;
    A.nearCool = 6;
    const pts = Math.round(300 * score.mult);
    score.combo += pts;
    score.mult = Math.min(8, score.mult + 0.3);
    L.stats.near = (L.stats.near || 0) + 1;
    popup(`Frôlé +${pts.toLocaleString('fr-FR')}`, 'clip');
    score.ev.push({
      k: 'near',
      t: score.runT,
      v: pts,
      label: `Frôlé un ${{ kei: 'kei', sedan: 'berline', van: 'fourgon', truck: 'kei-truck', bus: 'bus' }[A.kind.id]} en glisse`,
    });
    Sound.clip();
    vibrate(15);
    if (Math.random() < 0.6) Sound.horn(0.5, A.kind.id === 'bus' ? 0.72 : 1.1);
  }
}
function rivalsTick(dt) {
  const L = game.life,
    I = isleData,
    st = game.player;
  for (const r of L.rivals) {
    const A = r.A,
      d = Math.hypot(A.x - st.x, A.z - st.z),
      mine = L.duel && L.duel.r === r;
    if (r.cool > 0) r.cool -= dt;
    if (!mine) {
      // il roule ; s'il te voit de près, il ralentit, se range et t'attend
      const free = r.cool <= 0 && !L.duel && !L.race && !L.battle;
      A.k = r.def.skill * (free && d < 110 ? 0.55 : 1);
      A.hold = free && d < 40;
      A.laneT = A.hold ? -4.3 : A.passS != null ? A.laneT : 0;
      r.farT = d > 900 ? r.farT + dt : 0;
      if (r.farT > 40) {
        r.farT = 0;
        IsleLife.respawnNear(I, A, st.x, st.z, L.T.rand, 0);
        A.k = r.def.skill;
      }
    }
    IsleLife.stepAgent(I, A, dt, L.obs, L.T.rand, true);
    // état lu par le modèle 3D et la fumée
    A.wheelRot += (A.speed / 0.31) * dt * (1 + Math.abs(A.beta));
    A.steerAngle += (-A.beta * 0.9 - A.steerAngle) * Math.min(1, dt * 8);
    A.rollAngle += (-A.beta * 0.07 * Math.min(A.speed / 15, 1) - A.rollAngle) * Math.min(1, dt * 5);
    A.slip = -A.beta;
    A.rearSlip = Math.abs(A.beta) * 1.2;
    A.throttle = A.hold ? 0 : 1;
    A.fwd = A.speed;
  }
}
