// ---------- démarrage ----------
import { game } from './state.js';
import { Sound } from '../audio/sound.js';
import { profile, settings } from './base.js';
import { carFx } from './camera.js';
import { input, touch } from './input.js';
import { startDuel } from './island/events.js';
import { gpsAct, interact } from './island/interact.js';
import { openIsleMap } from './island/map.js';
import { enterIsland, isleData } from './island/world.js';
import { frame, frameAvg, perf } from './loop.js';
import { claimDaily, refreshWallet } from './menus.js';
import { syncSettingsUI } from './moments.js';
import { mp, mpStart, openMulti } from './multiplayer.js';
import { buildCars, loadTrack } from './scene.js';
import { lossLog, score } from './score.js';
import { finishRun, show, startRun } from './session.js';
import { QUALITY, camLook, camPos, gy, renderer, resize, scene } from './stage.js';
import { applyLayout, layouts, openLayoutEditor, tState } from './touch.js';
import { IsleLife } from '../island/life.js';
import { Net } from '../net/index.js';
import { $ } from '../util/dom.js';

function boot() {
  syncSettingsUI();
  applyLayout();
  Sound.setEnabled(settings.sound);
  loadTrack(game.trackIdx);
  resize();
  addEventListener('resize', resize);
  camPos.set(game.leader.state.x + 8, gy(game.leader.state.x, game.leader.state.z) + 3, game.leader.state.z + 8);
  camLook.set(game.leader.state.x, gy(game.leader.state.x, game.leader.state.z) + 1, game.leader.state.z);
  // quelques secondes de simulation pour que la fumée soit déjà là
  for (let i = 0; i < 90; i++) {
    game.leader.update(1 / 60, 1);
    carFx(game.leader.state, game.playerModel, 1 / 60, 'L', 'P');
    game.smoke.update(1 / 60);
  }
  $('loading').remove();
  show('menu');
  refreshWallet();
  claimDaily();
  // lien d'invitation multijoueur (…#sdc=CODE) : on ouvre directement l'écran pour rejoindre
  const inv = location.hash.match(/sdc=(SDC1[zr]\.[A-Za-z0-9_-]+)/);
  if (inv) {
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch (e) {
      /* pas grave */
    }
    openMulti(inv[1]);
  }
  requestAnimationFrame((n) => {
    game.last = n;
    frame(n);
  });
  // accès de test (non utilisé par le jeu)
  window.__sdcDbg = {
    scene,
    envMap: () => game.envMap,
    renderer,
    perf,
    setQuality: (q) => {
      game.qLevel = q;
      game.quality = QUALITY[q];
      loadTrack(game.trackIdx);
    },
    carRoot: () => game.playerModel.root,
    trace: (on) => {
      const t = game.dbgTrace;
      game.dbgTrace = on ? [] : null;
      return t;
    },
    profile,
    isle: () => isleData,
    life: () => game.life,
    mp: () => mp,
    enterIsland,
    interact,
    openIsleMap,
    gpsAct,
    startDuel: (k, kind) => {
      const r = game.life && game.life.rivals.find((x) => x.def.id === k);
      if (r) startDuel(r, kind, kind === 'race' ? IsleLife.tougeTarget(isleData, r.A.x, r.A.z) : null);
    },
    mpStart,
    mpLocal: (role) => {
      const api = Net.localLinks('sdc-test');
      if (role === 'host') {
        mpStart('host');
        api.listen();
        api.onguest = (l) => mp.S.addGuestLink(l);
      } else {
        mpStart('guest');
        api.knock().then((l) => mp.S.join(l));
      }
      return api;
    },
    preview: (k, c) => {
      game.showKind = k;
      game.showCfg = c;
      buildCars();
    },
    view: (v) => {
      game.shopView = v;
      game.snapCam = true;
    },
    yaw: (y) => {
      game.garageYaw = y;
    },
  };
  window.__sdc = {
    get phase() {
      return game.phase;
    },
    get player() {
      return game.player;
    },
    get score() {
      return score;
    },
    get track() {
      return game.track;
    },
    get line() {
      return game.line;
    },
    lossLog,
    startRun,
    input,
    touch,
    layouts,
    tState: () => tState,
    openLayoutEditor,
    setMode: (m) => {
      game.mode = m;
    },
    setTrack: (i) => {
      game.trackIdx = i;
      loadTrack(i);
    },
    finishRun,
    get fps() {
      return 1000 / frameAvg;
    },
  };
}

export function init() {
  if (document.fonts && document.fonts.ready)
    Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(boot);
  else boot();
}
