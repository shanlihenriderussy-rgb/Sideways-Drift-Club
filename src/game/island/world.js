// ---------- l'île : monde ouvert continu (island.js) et sa vie (isleai.js) ----------
// isle : null hors de l'île | { I : routes + terrain (calculés une fois), hubName : lieu le plus proche affiché }
// life : circulation, rivaux, repères, GPS, duel, zone de glisse, radars, invite d'interaction (null hors de l'île)
import { game } from '../state.js';
import { Sound } from '../../audio/sound.js';
import { clearExplore, trackIndexOf } from '../adventure.js';
import { isTouch, profile, saveProfile } from '../base.js';
import { el } from '../hud.js';
import { drawIsleMinimapBase, renderIsleGoal } from './events.js';
import { clearGps } from './interact.js';
import { buildLife, clearLife } from './life.js';
import { STEP } from '../loop.js';
import { refreshWallet, toast } from '../menus.js';
import { mp } from '../multiplayer.js';
import { buildCars, buildEnv, buildFx, loadTrack } from '../scene.js';
import { announce, dropGhost, ensureAudio, lose, popup, resetScore, vibrate } from '../score.js';
import { countdown, requestWake, show } from '../session.js';
import { camLook, camPos, camera, gy, renderer, scene } from '../stage.js';
import { setTouchVisible } from '../touch.js';
import { IsleLife } from '../../island/life.js';
import { ISLE, buildIsland, isleCollect, isleFound } from '../../island/map.js';
import { buildIslandWorld } from '../../island/scenery.js';
import { Economy } from '../../progress/economy.js';
import { Story } from '../../progress/story.js';
import { Ghost } from '../../sim/ghost.js';
import { CAR_SPECS, createCarState } from '../../sim/physics.js';
import { TRACKS } from '../../sim/track.js';
import { $ } from '../../util/dom.js';

export let isle = null;
export let isleData = null;
export const isleQ = { i: -1, d: Infinity, lat: 0, edge: -1 };
export const castOf = (who) => Story.CAST[who] || Story.CAST.narr;
export const nodeName = (k) => {
  const id = Object.keys(ISLE.hubs).find((h) => ISLE.hubs[h] === k);
  return id ? TRACKS[trackIndexOf(id)].name : IsleLife.NODE_NAMES[k] || k;
};
export const fmtDist = (m) =>
  m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
export const envOn = (m) =>
  m.root.traverse((o) => {
    if (o.material && o.material.isMeshStandardMaterial) {
      o.material.envMap = game.envMap;
      o.material.needsUpdate = true;
    }
  });
export const starsTxt = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

// spawn : { x, z, h } facultatif (multijoueur : on arrive derrière l'autre joueur)
export function enterIsland(spawn) {
  ensureAudio();
  clearExplore();
  game.adv = null;
  game.advNext = null;
  if (!isleData) isleData = buildIsland(ISLE);
  clearLife();
  if (game.world) game.world.dispose();
  const I = isleData;
  isle = { I, hubName: '' };
  game.world = buildIslandWorld(scene, I, game.quality);
  renderer.toneMappingExposure = game.world.theme.exposure;
  buildEnv();
  buildFx();
  buildCars(true);
  game.playerModel.ground = I.terrain.at;
  const found = (profile.isle && profile.isle.found) || {};
  game.world.daruma.forEach((g, k) => {
    g.visible = !found[k];
  });
  game.mode = 'free';
  resetScore();
  game.skids.clear();
  game.smoke.clear();
  let x, z, h;
  const q = spawn ? I.nearestRoad(spawn.x - Math.cos(spawn.h) * 12, spawn.z - Math.sin(spawn.h) * 12, {}) : null;
  if (q && q.i >= 0) {
    x = I.X[q.i];
    z = I.Z[q.i];
    h = Math.atan2(I.TZ[q.i], I.TX[q.i]);
    if (Math.cos(h - spawn.h) < 0) h += Math.PI;
  } else {
    const hb = I.hubs.minato;
    x = hb.x + Math.cos(hb.heading) * 14;
    z = hb.z + Math.sin(hb.heading) * 14;
    h = hb.heading;
  }
  placePlayer(x, z, h, 0);
  dropGhost();
  el('hudBest').classList.remove('ahead', 'behind');
  game.hlRec = Ghost.recorder(profile.current);
  buildLife();
  game.phase = 'count';
  show(null);
  $('hud').hidden = false;
  setTouchVisible();
  $('hudMode').textContent = 'L’ÎLE';
  $('hudBest').textContent = mp ? 'SESSION À ' + mp.S.peers.size : 'MONDE OUVERT';
  $('hudGoal').hidden = false;
  renderIsleGoal();
  $('mapBtn').hidden = false;
  drawIsleMinimapBase();
  camPos.set(
    game.player.x - Math.cos(game.player.heading) * 8,
    gy(game.player.x, game.player.z) + 3,
    game.player.z - Math.sin(game.player.heading) * 8,
  );
  camLook.set(game.player.x, gy(game.player.x, game.player.z) + 1, game.player.z);
  try {
    renderer.compile(scene, camera);
  } catch (e) {
    /* facultatif */
  }
  countdown();
  requestWake();
  announce(
    'L’île de Sideways : roule où tu veux. Approche-toi des gens, des portes et des pilotes pour interagir. M ouvre la carte.',
  );
  if (!IsleLife.isleBag(profile).met.tuto) {
    IsleLife.isleBag(profile).met.tuto = true;
    saveProfile();
    setTimeout(
      () =>
        toast(
          isTouch
            ? 'Approche-toi d’un repère, puis touche le bouton qui apparaît en bas'
            : 'Approche-toi d’un repère, puis appuie sur E · M : carte et GPS',
          'chal',
        ),
      3400,
    );
  }
}
// voiture du joueur posée à l'arrêt (ou lancée) sur l'île
export function placePlayer(x, z, h, speed) {
  const spec =
    game.player && game.player.spec && isle
      ? game.player.spec
      : Economy.tunedSpec(
          CAR_SPECS[profile.current],
          profile.cars[profile.current].perf,
          profile.cars[profile.current].tune,
        );
  const st = createCarState(spec, x, z, h);
  st.vx = Math.cos(h) * speed;
  st.vz = Math.sin(h) * speed;
  Object.assign(st, { x0: x, z0: z, h0: h, idx: 0, prevIdx: 0, wetT: 0, roadD: 0 });
  game.player = st;
  if (game.skids) {
    game.skids.mark('P-1', x, z, 0, 0.3);
    game.skids.mark('P1', x, z, 0, 0.3);
  }
}
// retour au jeu sur piste : on reconstruit la piste courante
export function leaveIsle() {
  if (!isle) return;
  clearLife();
  isle = null;
  $('hudGoal').hidden = true;
  $('mapBtn').hidden = true;
  $('mpPause').hidden = true;
  loadTrack(game.trackIdx);
}
export function isleCollide(st) {
  const q = isleData.nearestRoad(st.x, st.z, isleQ);
  st.roadD = q.d;
  st.lat0 = q.lat;
  st.surface = q.d > isleData.half + 0.4 ? 0.62 : 1;
  // la mer : l'eau freine fort, puis on est replacé
  if (isleData.terrain.at(st.x, st.z) < 0.2) {
    st.wetT = (st.wetT || 0) + STEP;
    st.vx *= 0.985;
    st.vz *= 0.985;
  } else st.wetT = 0;
}
export function isleRespawn() {
  const q = isleData.nearestRoad(game.player.x, game.player.z, {});
  let i = q.i;
  const wet = game.player.wetT > 0.5;
  const I = isleData;
  if (i < 0) {
    let bd = Infinity;
    for (let k = 0; k < I.N; k += 2) {
      const d = (I.X[k] - game.player.x) ** 2 + (I.Z[k] - game.player.z) ** 2;
      if (d < bd) {
        bd = d;
        i = k;
      }
    }
  } // loin de tout : la route la plus proche de l'île
  let h = Math.atan2(I.TZ[i], I.TX[i]);
  let dh = h - game.player.heading;
  while (dh > Math.PI) dh -= 2 * Math.PI;
  while (dh < -Math.PI) dh += 2 * Math.PI;
  if (Math.abs(dh) > Math.PI / 2) h += Math.PI; // garde le sens dans lequel on roulait
  lose('Replacement');
  placePlayer(I.X[i], I.Z[i], h, 8);
  popup(wet ? 'Plouf · replacé sur la route' : 'Replacé sur la route', 'apex');
}
export function isleTick(dt) {
  const st = game.player,
    I = isleData;
  if (st.wetT > 0.8) {
    st.wetT = 0;
    isleRespawn();
    return;
  }
  // lieu le plus proche (affiché sous le chrono)
  let best = null,
    bd = Infinity;
  for (const [id, hb] of Object.entries(I.hubs)) {
    const d = Math.hypot(st.x - hb.x, st.z - hb.z);
    if (d < bd) {
      bd = d;
      best = id;
    }
  }
  const tr = TRACKS.find((t) => t.id === best);
  const label = bd < 60 ? tr.name : `${tr.name} · ${fmtDist(bd)}`;
  if (label !== isle.hubName) {
    isle.hubName = label;
    $('hudLap').textContent = label;
  }
  // daruma dorés
  I.daruma.forEach((d, k) => {
    const g = game.world.daruma[k];
    if (!g.visible || Math.hypot(st.x - d.x, st.z - d.z) > 3) return;
    g.visible = false;
    const r = isleCollect(profile, k);
    if (r) {
      saveProfile();
      refreshWallet();
      Sound.clip();
      vibrate(30);
      popup(`Daruma doré +${Economy.fmt(r)}`, 'clip');
      toast(`Daruma doré ${isleFound(profile)} / ${ISLE.daruma.length}`, 'chal');
      if (game.life && game.life.gps && game.life.gps.daruma === k) clearGps();
    }
  });
}

export function init() {
  Object.assign(Story.CAST, IsleLife.RIVAL_CAST);
}
