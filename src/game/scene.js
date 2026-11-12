// ---------- environnement de reflets (ciel) ----------
// reflets : cubemap peinte texel par texel (ciel, soleil à sa place, sol, lumières de nuit), sans rendu flottant
// → fiable sur tous les GPU mobiles
import { game } from './state.js';
import { isTouch, profile } from './base.js';
import { drawMinimapBase } from './hud.js';
import { dropGhost } from './score.js';
import { camera, renderer, resize, scene } from './stage.js';
import { Economy } from '../progress/economy.js';
import { buildCar } from '../render/car/index.js';
import { createParticles, createSkids, puffTexture } from '../render/fx.js';
import { buildWorld } from '../render/world.js';
import { buildDriftLine, createLeader } from '../sim/leader.js';
import { CAR_SPECS, createCarState } from '../sim/physics.js';
import { TRACKS, buildTrackData } from '../sim/track.js';

export function buildEnv() {
  if (game.envMap) game.envMap.dispose();
  const T = game.world.theme;
  const N = 96;
  const top = new THREE.Color(T.skyTop),
    hor = new THREE.Color(T.skyHorizon),
    sun = new THREE.Color(T.sunColor),
    ground = new THREE.Color(T.ground),
    road = new THREE.Color(T.road);
  const sd = new THREE.Vector3(...T.sun).normalize();
  const night = !!T.headlights;
  // direction du texel (u, v ∈ [−1, 1]) pour chaque face, dans l'ordre +x, −x, +y, −y, +z, −z
  const DIRS = [
    (u, v) => [1, -v, -u],
    (u, v) => [-1, -v, u],
    (u, v) => [u, 1, v],
    (u, v) => [u, -1, -v],
    (u, v) => [u, -v, 1],
    (u, v) => [-u, -v, -1],
  ];
  const hash = (a, b) => {
    const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return h - Math.floor(h);
  };
  const face = (dirOf) => {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const img = g.createImageData(N, N);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        let [x, y, z] = dirOf(((i + 0.5) / N) * 2 - 1, ((j + 0.5) / N) * 2 - 1);
        const l = Math.hypot(x, y, z);
        x /= l;
        y /= l;
        z /= l;
        let r, gg, b;
        if (y >= 0) {
          // ciel : horizon clair et brumeux, zénith plus dense
          const t = Math.pow(y, 0.55),
            haze = 0.3 * Math.exp(-y * 10);
          r = hor.r + (top.r - hor.r) * t + hor.r * haze;
          gg = hor.g + (top.g - hor.g) * t + hor.g * haze;
          b = hor.b + (top.b - hor.b) * t + hor.b * haze;
        } else {
          // sol : la piste près de l'horizon, le terrain en dessous
          const t = Math.min(1, -y * 3.5);
          r = (road.r + (ground.r - road.r) * t) * 0.85;
          gg = (road.g + (ground.g - road.g) * t) * 0.85;
          b = (road.b + (ground.b - road.b) * t) * 0.85;
        }
        // soleil (ou lune) : cœur vif et halo large, à sa vraie place dans le ciel
        const s = Math.max(0, x * sd.x + y * sd.y + z * sd.z);
        const glow = Math.pow(s, 90) * 1.6 + Math.pow(s, 8) * 0.28;
        r += sun.r * glow;
        gg += sun.g * glow;
        b += sun.b * glow;
        // de nuit : fenêtres et lampadaires au ras de l'horizon, qui filent en reflets sur la carrosserie
        if (night && y > 0.015 && y < 0.3) {
          const a = Math.atan2(z, x);
          const h = hash(Math.floor(a * 22), Math.floor(y * 46));
          if (h > 0.84) {
            const warm = hash(Math.floor(a * 22) + 7, 3) > 0.4;
            r += warm ? 1.0 : 0.55;
            gg += warm ? 0.72 : 0.75;
            b += warm ? 0.38 : 1.0;
          }
        }
        const o = (j * N + i) * 4;
        img.data[o] = Math.min(255, r * 255);
        img.data[o + 1] = Math.min(255, gg * 255);
        img.data[o + 2] = Math.min(255, b * 255);
        img.data[o + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return c;
  };
  game.envMap = new THREE.CubeTexture(DIRS.map(face));
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
// light : niveau de détail léger (voitures des autres : rivaux, joueurs distants, fantôme)
export function lookOf(cfg, night, light) {
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
    lod: light || game.qLevel === 'low' ? 0 : 1,
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
    game.leaderModel = buildCar(lk, lookOf(lc, night, game.qLevel !== 'high')); // de près en tandem : fin en qualité haute
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
