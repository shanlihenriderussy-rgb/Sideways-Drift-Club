// ---------- environnement de reflets (ciel) ----------
// reflets : cubemap peinte (dégradé du ciel), sans rendu flottant → fiable sur tous les GPU mobiles
import { game } from './state.js';
import { isTouch, profile } from './base.js';
import { drawMinimapBase } from './hud.js';
import { dropGhost } from './score.js';
import { camera, renderer, resize, scene } from './stage.js';
import { Economy } from '../progress/economy.js';
import { buildCar } from '../render/car.js';
import { createParticles, createSkids, puffTexture } from '../render/fx.js';
import { buildWorld } from '../render/world.js';
import { buildDriftLine, createLeader } from '../sim/leader.js';
import { CAR_SPECS, createCarState } from '../sim/physics.js';
import { TRACKS, buildTrackData } from '../sim/track.js';

export function buildEnv() {
  if (game.envMap) game.envMap.dispose();
  const T = game.world.theme;
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const face = (kind) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    if (kind === 'top') {
      g.fillStyle = hex(T.skyTop);
      g.fillRect(0, 0, 64, 64);
    } else if (kind === 'bottom') {
      g.fillStyle = T.ground;
      g.fillRect(0, 0, 64, 64);
    } else {
      const gr = g.createLinearGradient(0, 0, 0, 64);
      gr.addColorStop(0, hex(T.skyTop));
      gr.addColorStop(0.48, hex(T.skyHorizon));
      gr.addColorStop(0.52, T.road);
      gr.addColorStop(1, T.ground);
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      if (kind === 'sun') {
        const r = g.createRadialGradient(32, 26, 0, 32, 26, 26);
        r.addColorStop(0, hex(T.sunColor));
        r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r;
        g.fillRect(0, 0, 64, 64);
      }
    }
    return c;
  };
  game.envMap = new THREE.CubeTexture([
    face('sun'),
    face('side'),
    face('top'),
    face('bottom'),
    face('side'),
    face('side'),
  ]);
  game.envMap.encoding = THREE.sRGBEncoding;
  game.envMap.needsUpdate = true;
}

export function loadTrack(i) {
  dropGhost();
  if (game.world) game.world.dispose();
  game.trackIdx = i;
  game.track = buildTrackData(TRACKS[i]);
  game.world = buildWorld(scene, game.track, game.quality);
  renderer.toneMappingExposure = game.world.theme.exposure;
  game.line = buildDriftLine(game.track);
  buildEnv();
  buildFx();
  buildCars();
  drawMinimapBase();
  // compile tous les shaders maintenant (fumée, étincelles, leader, flammes…) : pas d'à-coup au premier affichage
  try {
    renderer.compile(scene, camera);
  } catch (e) {
    /* facultatif */
  }
}

let sharedPuff = null;
export function buildFx() {
  if (game.smoke) {
    scene.remove(game.smoke.points);
    game.smoke.dispose();
  }
  if (game.sparks) {
    scene.remove(game.sparks.points);
    game.sparks.dispose();
  }
  if (game.skids) {
    scene.remove(game.skids.mesh);
    game.skids.dispose();
  }
  const puff = sharedPuff || (sharedPuff = puffTexture());
  const night = game.track.def.theme === 'night';
  game.smoke = createParticles(game.quality.smoke, {
    map: puff,
    color: 0xffffff,
    drag: 1.6,
    gravity: 0.35,
    colored: true,
  });
  game.sparks = createParticles(160, {
    map: puff,
    color: 0xffb040,
    drag: 0.6,
    gravity: -14,
    additive: true,
    floor: true,
  });
  game.skids = createSkids(isTouch ? 1800 : 3000);
  scene.add(game.skids.mesh);
  scene.add(game.smoke.points);
  scene.add(game.sparks.points);
  const fog = scene.fog;
  for (const p of [game.smoke, game.sparks]) {
    p.mat.uniforms.fogCol.value.copy(fog.color);
    p.mat.uniforms.fogNear.value = fog.near;
    p.mat.uniforms.fogFar.value = fog.far;
  }
  resize();
}
const hexOf = (list, id, d) => {
  const it = list.find((x) => x.id === id);
  return it ? it.hex : d;
};
export function lookOf(cfg, night) {
  const paint = hexOf(Economy.PAINTS, cfg.paint, 0xf1efe9);
  const accent =
    cfg.accent === 'auto' ? (isDark(paint) ? 0xffd23f : 0x16161a) : hexOf(Economy.PAINTS, cfg.accent, 0xffd23f);
  return {
    paint,
    accent,
    finish: cfg.finish,
    livery: cfg.livery,
    number: cfg.number,
    rimStyle: cfg.rimStyle,
    rim: hexOf(Economy.RIMS, cfg.rim, 0xb07a3a),
    front: cfg.front,
    wide: cfg.wide,
    wing: cfg.wing,
    hood: cfg.hood,
    exhaust: cfg.exhaust,
    cage: cfg.cage,
    skirt: cfg.skirt,
    diffuser: cfg.diffuser,
    mirror: cfg.mirror,
    roof: cfg.roof,
    lights: cfg.lights,
    tint: cfg.tint,
    seat: cfg.seat,
    wheelS: cfg.wheelS,
    tow: cfg.tow,
    flaps: cfg.flaps,
    neon: cfg.neon === 'none' ? null : hexOf(Economy.NEONS, cfg.neon, null),
    tune: cfg.tune,
    brakes: cfg.perf.brakes,
    night,
    lod: game.qLevel === 'low' ? 0 : 1,
  };
}
export const smokeCol = { P: new THREE.Color(), L: new THREE.Color() };
function setSmoke(id, cfg) {
  const night = game.track.def.theme === 'night';
  if (cfg.smoke === 'blanc') smokeCol[id].setHex(night ? 0x8d8a9e : 0xeeeae2);
  else smokeCol[id].setHex(hexOf(Economy.SMOKES, cfg.smoke, 0xeeeae2));
}
// le leader du tandem : livrée fixe, contrastée avec la tienne
function leaderCfg(kind) {
  const c = Economy.defaultCar(kind);
  const mine = profile.cars[profile.current];
  Object.assign(c, {
    paint: mine.paint === 'tofu' ? 'panda' : 'tofu',
    accent: 'jaune',
    livery: 'stripes',
    number: 1,
    rimStyle: 'mesh',
    rim: 'or',
    front: 'lip',
    wing: 'gt',
    smoke: 'blanc',
  });
  return c;
}
// playerOnly : aperçu de l'atelier, on ne reconstruit que ta voiture (ni le leader, ni l'état physique)
export function buildCars(playerOnly) {
  if (game.playerModel) game.playerModel.dispose();
  if (game.leaderModel && !playerOnly) game.leaderModel.dispose();
  const night = game.world.theme.headlights;
  const kind = game.showKind || profile.current;
  const cfg = game.showCfg || profile.cars[kind];
  game.playerModel = buildCar(kind, lookOf(cfg, night));
  game.playerModel.ground = game.track.terrain.at;
  scene.add(game.playerModel.root);
  setSmoke('P', cfg);
  if (!playerOnly) {
    const lk = profile.current === 'raijin' ? 'kouki' : 'raijin';
    const lc = leaderCfg(lk);
    game.leaderModel = buildCar(lk, lookOf(lc, night));
    game.leaderModel.ground = game.track.terrain.at;
    setSmoke('L', lc);
    scene.add(game.leaderModel.root);
  }
  for (const m of playerOnly ? [game.playerModel] : [game.playerModel, game.leaderModel])
    m.root.traverse((o) => {
      if (o.material && o.material.isMeshStandardMaterial) {
        o.material.envMap = game.envMap;
        o.material.needsUpdate = true;
      }
    });
  if (night) {
    if (!game.playerModel.lamp) {
      const sl = new THREE.SpotLight(0xfff0d0, 2.4, 70, 0.55, 0.5, 1.4);
      sl.position.set(1.8, 0.7, 0);
      sl.target.position.set(18, 0, 0);
      game.playerModel.root.add(sl);
      game.playerModel.root.add(sl.target);
      game.playerModel.lamp = sl;
    }
  }
  if (playerOnly) return;
  resetPlayer(startIndex(), 0);
  const keepS = game.leader && game.leader.track === game.track ? game.leader.state.s : null;
  game.leader = createLeader(game.track, game.line, 10);
  game.leader.track = game.track;
  if (keepS != null) {
    game.leader.state.s = keepS;
    game.leader.update(1 / 60, 1);
  }
}
const isDark = (hex) => {
  const r = (hex >> 16) & 255,
    g = (hex >> 8) & 255,
    b = hex & 255;
  return r * 0.3 + g * 0.59 + b * 0.11 < 110;
};

export function startIndex() {
  return game.track.count - Math.round(40 / game.track.step);
}
export function resetPlayer(idx, speed) {
  const st = createCarState(
    Economy.tunedSpec(
      CAR_SPECS[profile.current],
      profile.cars[profile.current].perf,
      profile.cars[profile.current].tune,
    ),
    game.track.px[idx],
    game.track.pz[idx],
    game.track.heading[idx],
  );
  st.vx = Math.cos(st.heading) * speed;
  st.vz = Math.sin(st.heading) * speed;
  st.speed = speed;
  st.fwd = speed;
  st.gear = speed > 15 ? 3 : speed > 8 ? 2 : 1;
  if (game.player) {
    st.idx = idx;
  }
  game.player = st;
  game.player.x0 = st.x;
  game.player.z0 = st.z;
  game.player.h0 = st.heading;
  game.player.idx = idx;
  game.player.prevIdx = idx;
  if (game.skids) {
    game.skids.mark('P-1', st.x, st.z, 0, 0.3);
    game.skids.mark('P1', st.x, st.z, 0, 0.3);
  }
}
