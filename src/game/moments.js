import { game } from './state.js';
import { Sound } from '../audio/sound.js';
import { dlg, esc, openAdventure, playMission, trackIndexOf } from './adventure.js';
import { isTouch, profile, saveSettings, settings, store } from './base.js';
import { carFx, cycleCam, updateCamera } from './camera.js';
import { closeIsleMap } from './island/map.js';
import { enterIsland, isle, isleData } from './island/world.js';
import { respawn } from './loop.js';
import { buildTrackList, openCareer, openShop, pressGroup, toast } from './menus.js';
import { buildCars, loadTrack } from './scene.js';
import { announce, ensureAudio, score } from './score.js';
import { countdownShort, finishRun, pauseGame, resumeGame, show, startRun, toMenu } from './session.js';
import { QUALITY, _camL, camLook, camPos, camera, gy } from './stage.js';
import { openLayoutEditor, refreshTouchUI, setTouchVisible } from './touch.js';
import { Economy } from '../progress/economy.js';
import { Ghost } from '../sim/ghost.js';
import { Replay } from '../sim/replay.js';
import { TRACKS } from '../sim/track.js';
import { $ } from '../util/dom.js';
import { clamp } from '../util/math.js';

let lastRec = null;
export let rp = null;
let recs;
const KIND_TXT = { combo: 'Combo', clip: 'Clip', near: 'Frôlé', angle: 'Angle' };
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
// fin de run : choisit les moments, les affiche, garde l'enregistrement (pistes seulement : l'île se revoit tout de suite)
export function showMoments(modeName, total, grade) {
  const box = $('resMoments');
  const ev = score.ev.slice();
  if (score.maxAngle >= 40)
    ev.push({
      k: 'angle',
      t: score.angT,
      v: Math.round(score.maxAngle),
      label: `Angle max ${Math.round(score.maxAngle)}°`,
    });
  const d = game.hlRec ? game.hlRec.d : [];
  const moments = d.length ? Replay.pickMoments(ev, (d.length / 5 - 1) * Ghost.DT, 3) : [];
  game.hlRec = null;
  lastRec = moments.length
    ? Replay.makeRecording(
        {
          id: 'r' + Date.now().toString(36),
          date: Date.now(),
          track: isle ? 'ile' : game.track.def.id,
          mode: modeName,
          kind: profile.current,
          score: total,
          grade,
        },
        d,
        moments,
      )
    : null;
  if (lastRec && !lastRec.moments.length) lastRec = null;
  if (lastRec && !isle) {
    recs = Replay.addRecording(recs, lastRec);
    store.set('recs', recs);
  }
  box.hidden = false;
  box.innerHTML =
    `<div class="h">Moments forts</div>` +
    (lastRec
      ? `<ol>${lastRec.moments.map((m, k) => `<li><button data-moment="${k}"><i>${mmss(m.t)}</i><span><b>${esc(KIND_TXT[m.k])}</b> ${esc(m.label)}</span><em aria-hidden="true">▶</em></button></li>`).join('')}</ol><button class="btn" data-moment="0"><span>▶ Revoir les moments forts</span></button>`
      : '<p>Pas encore de moment fort : tiens une glisse plus longtemps, ou clippe un mur.</p>');
}

// lecteur : chaque moment avec sa caméra (poursuite, travelling, bord de piste), ralenti autour d'un clip ou d'un frôlé
export const rv = {
  x: 0,
  z: 0,
  heading: 0,
  vx: 0,
  vz: 0,
  speed: 0,
  slip: 0,
  rearSlip: 0,
  steerAngle: 0,
  wheelRot: 0,
  rollAngle: 0,
  pitchAngle: 0,
  throttle: 1,
  wheelSpin: 0,
  rpm: 3000,
  fwd: 0,
};
function playRecording(rec, back, from) {
  if (!rec || !rec.moments.length) return;
  if (!isle && rec.track !== game.track.def.id) {
    const ti = trackIndexOf(rec.track);
    if (ti < 0) {
      toast('Piste inconnue', 'lost');
      return;
    }
    game.trackIdx = ti;
    loadTrack(ti);
  }
  if (isle && rec.track !== 'ile') return;
  rp = {
    rec,
    back,
    backPhase: game.phase,
    i: Math.max(0, Math.min(rec.moments.length - 1, from || 0)),
    u: 0,
    paused: false,
    rate: 1,
    swapped: false,
    cam: null,
  };
  if (rec.kind !== profile.current) {
    game.showKind = rec.kind;
    game.showCfg = profile.cars[rec.kind] || Economy.defaultCar(rec.kind);
    buildCars(true);
    rp.swapped = true;
  }
  if (isle) game.playerModel.ground = isleData.terrain.at;
  ensureAudio();
  game.phase = 'replay';
  show(null);
  $('hud').hidden = true;
  $('prompt').hidden = true;
  setTouchVisible();
  $('replay').hidden = false;
  startMoment(rp.i);
  announce('Replay des moments forts. Espace : pause, flèches : moment précédent ou suivant, Échap : fermer.');
}
function startMoment(i) {
  const m = rp.rec.moments[i];
  rp.i = i;
  rp.u = 0;
  rv.wheelRot = 0;
  game.skids.clear();
  game.smoke.clear();
  const s = Replay.playAt(m, 0, rv);
  // caméra : 1er moment en poursuite, 2e en travelling, 3e au bord de la piste (fixe, téléobjectif)
  const style = ['chase', 'orbit', 'side'][i % 3];
  rp.cam = { style };
  if (style === 'side') {
    const mid = Replay.playAt(m, Replay.momentDur(m) * 0.55, {});
    const nx = -Math.sin(mid.heading),
      nz = Math.cos(mid.heading),
      sd = i % 2 ? 1 : -1;
    const cx = mid.x + nx * 11 * sd + Math.cos(mid.heading) * 6,
      cz = mid.z + nz * 11 * sd + Math.sin(mid.heading) * 6;
    rp.cam.pos = new THREE.Vector3(cx, gy(cx, cz) + 2.2, cz);
  }
  camPos.set(s.x - Math.cos(s.heading) * 7, gy(s.x, s.z) + 2.6, s.z - Math.sin(s.heading) * 7);
  camLook.set(s.x, gy(s.x, s.z) + 0.8, s.z);
  const n = rp.rec.moments.length;
  $('rpTitle').textContent = `${KIND_TXT[m.k]} · ${m.label}`;
  $('rpSub').textContent =
    `Moment ${i + 1} / ${n} · ${mmss(m.t)} · ${rp.rec.track === 'ile' ? 'L’île' : TRACKS[trackIndexOf(rp.rec.track)].name}`;
  const cut = $('rpCut');
  cut.classList.remove('on');
  void cut.offsetWidth;
  if (!settings.reduce) cut.classList.add('on');
}
export function replayFrame(dt) {
  const m = rp.rec.moments[rp.i],
    dur = Replay.momentDur(m);
  // ralenti en douceur autour de l'instant fort
  const near = m.slow ? Math.abs(m.a + rp.u - m.t) : 9;
  const want = rp.paused ? 0 : near < 0.9 ? 0.35 : 1;
  rp.rate += (want - rp.rate) * Math.min(1, dt * 6);
  const dd = dt * rp.rate;
  rp.u += dd;
  const s = Replay.playAt(m, rp.u, rv);
  rv.slip = s.rearSlip;
  rv.fwd = s.speed;
  rv.wheelRot += (s.speed / 0.31) * dd;
  rv.steerAngle +=
    (clamp(-s.yaw * 0.12 - s.rearSlip * 0.6 * Math.sign(s.yaw || 1), -0.65, 0.65) - rv.steerAngle) *
    Math.min(1, dt * 8);
  rv.rollAngle += (clamp(-s.yaw * s.speed * 0.004, -0.09, 0.09) - rv.rollAngle) * Math.min(1, dt * 5);
  rv.rpm = Math.min(7600, 2600 + s.speed * 150 + s.rearSlip * 1500);
  rv.throttle = rp.paused ? 0 : 1;
  game.playerModel.root.visible = true;
  game.leaderModel.root.visible = false;
  game.playerModel.update(rv, dt, false);
  if (dd > 0) carFx(rv, game.playerModel, dd, 'P');
  const C = rp.cam;
  if (C.style === 'chase') updateCamera(dt, rv, false);
  else if (C.style === 'orbit') updateCamera(dt, rv, true);
  else {
    camera.position.copy(C.pos);
    camLook.lerp(_camL.set(rv.x, gy(rv.x, rv.z) + 0.7, rv.z), 1 - Math.exp(-dt * 8));
    camera.lookAt(camLook);
    camera.fov += (34 - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
  Sound.update(rv, rp.rec.kind, !rp.paused);
  $('rpBar').style.transform = `scaleX(${clamp(rp.u / dur, 0, 1).toFixed(3)})`;
  $('rpSlow').hidden = rp.rate > 0.6 || rp.paused;
  if (s.end && !rp.paused) {
    if (rp.i + 1 < rp.rec.moments.length) startMoment(rp.i + 1);
    else stopReplay();
  }
}
function stopReplay() {
  if (!rp) return;
  const r = rp;
  rp = null;
  $('replay').hidden = true;
  Sound.suspend();
  if (r.swapped) {
    game.showKind = null;
    game.showCfg = null;
    buildCars(true);
    if (isle) game.playerModel.ground = isleData.terrain.at;
  }
  game.phase = r.backPhase === 'replay' ? 'results' : r.backPhase;
  game.skids.clear();
  show(r.back);
  if (r.back === 'career') openCareer();
}
const rpBtn = (id, f) =>
  $(id).addEventListener('click', () => {
    if (rp) {
      Sound.ui();
      f();
    }
  });

// Carrière : les enregistrements gardés sur l'appareil
export function renderRecs() {
  const fmtD = (t) => new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  $('recList').innerHTML =
    recs
      .map((r) => {
        const ti = trackIndexOf(r.track),
          name = ti >= 0 ? TRACKS[ti].name : r.track;
        return `<li><button class="rec-play" data-rec="${esc(r.id)}" aria-label="Revoir : ${esc(name)}, ${r.score} points"><em aria-hidden="true">▶</em><span><b>${esc(name)}</b> · ${r.mode === 'run' ? 'Run noté' : r.mode === 'tandem' ? 'Tandem' : 'Libre'}${r.grade ? ' · note ' + esc(r.grade) : ''} · ${r.score.toLocaleString('fr-FR')} pts<small>${fmtD(r.date)} · ${r.moments.map((m) => esc(KIND_TXT[m.k])).join(', ')}</small></span></button><button class="rec-del" data-del="${esc(r.id)}" aria-label="Supprimer cet enregistrement">✕</button></li>`;
      })
      .join('') ||
    '<li class="empty"><span>Aucun enregistrement : tes moments forts apparaîtront ici après un run sur piste.</span></li>';
}

export function syncSettingsUI() {
  pressGroup($('assistSeg'), 'data-v', settings.assist);
  pressGroup($('qualSeg'), 'data-v', settings.quality);
  $('optAutoGas').checked = settings.autoGas;
  $('optSound').checked = settings.sound;
  $('optMotion').checked = settings.reduce;
  $('optVibe').checked = settings.vibe;
  refreshTouchUI();
}
const segBind = (id, key, conv) =>
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    settings[key] = conv ? conv(b.dataset.v) : b.dataset.v;
    saveSettings();
    syncSettingsUI();
    Sound.ui();
    if (key === 'quality') {
      game.qLevel = settings.quality === 'auto' ? (isTouch ? 'med' : 'high') : settings.quality;
      game.quality = QUALITY[game.qLevel];
      game.dprScale = 1;
      loadTrack(game.trackIdx);
    }
  });
const tog = (id, key, after) =>
  $(id).addEventListener('change', (e) => {
    settings[key] = e.target.checked;
    saveSettings();
    syncSettingsUI();
    after && after();
  });

const go = (id) => () => {
  Sound.ui();
  show(id);
};
// brief : premier lancement, trois gestes sur un écran puis le choix de session ; sinon l'aide complète
function openHelp(brief) {
  $('help').classList.toggle('brief', brief);
  $('helpGo').textContent = brief ? 'Choisir ma session' : 'Compris';
  show('help');
}
function openSelect() {
  buildTrackList();
  pressGroup(document.querySelector('#select .modes'), 'data-mode', game.mode);
  show('select');
}

export function init() {
  recs = (store.get('recs', []) || []).map(Replay.checkRecording).filter(Boolean);
  $('resMoments').addEventListener('click', (e) => {
    const b = e.target.closest('[data-moment]');
    if (b && lastRec) playRecording(lastRec, 'results', +b.dataset.moment);
  });
  rpBtn('rpPrev', () => startMoment(Math.max(0, rp.i - 1)));
  rpBtn('rpNext', () => (rp.i + 1 < rp.rec.moments.length ? startMoment(rp.i + 1) : stopReplay()));
  rpBtn('rpPause', () => {
    rp.paused = !rp.paused;
    $('rpPause').setAttribute('aria-label', rp.paused ? 'Lecture (Espace)' : 'Pause (Espace)');
    $('rpPause').classList.toggle('paused', rp.paused);
  });
  rpBtn('rpClose', stopReplay);
  addEventListener(
    'keydown',
    (e) => {
      if (!rp || dlg) return;
      const k = e.key;
      if (k === ' ') {
        e.preventDefault();
        $('rpPause').click();
      } else if (k === 'ArrowLeft') $('rpPrev').click();
      else if (k === 'ArrowRight') $('rpNext').click();
      else if (k === 'Escape') {
        e.stopImmediatePropagation();
        stopReplay();
      }
    },
    true,
  );
  $('recList').addEventListener('click', (e) => {
    const p = e.target.closest('[data-rec]'),
      d = e.target.closest('[data-del]');
    if (p) {
      const r = recs.find((x) => x.id === p.dataset.rec);
      if (r) {
        Sound.ui();
        playRecording(r, 'career', 0);
      }
    } else if (d) {
      recs = recs.filter((x) => x.id !== d.dataset.del);
      store.set('recs', recs);
      Sound.ui();
      renderRecs();
    }
  });
  segBind('assistSeg', 'assist', Number);
  segBind('qualSeg', 'quality');
  tog('optAutoGas', 'autoGas');
  tog('optMotion', 'reduce');
  tog('optVibe', 'vibe');
  tog('optSound', 'sound', () => {
    if (settings.sound) Sound.init();
    Sound.setEnabled(settings.sound);
  });
  $('playBtn').addEventListener('click', () => {
    ensureAudio();
    if (!game.helpSeen) {
      game.helpSeen = true;
      store.set('seenHelp', true);
      game.helpThenSelect = true;
      openHelp(true);
      return;
    }
    openSelect();
  });
  $('garageBtn').addEventListener('click', () => {
    game.shopReturn = 'menu';
    openShop();
  });
  $('resShopBtn').addEventListener('click', () => {
    game.shopReturn = 'results';
    openShop();
  });
  $('careerBtn').addEventListener('click', () => {
    Sound.ui();
    openCareer();
  });
  $('settingsBtn').addEventListener('click', () => {
    game.returnTo = 'menu';
    syncSettingsUI();
    show('settings');
  });
  $('pSettingsBtn').addEventListener('click', () => {
    game.returnTo = 'pause';
    syncSettingsUI();
    show('settings');
  });
  $('layoutBtn').addEventListener('click', openLayoutEditor);
  $('helpBtn').addEventListener('click', () => {
    Sound.ui();
    openHelp(false);
  });
  $('helpMore').addEventListener('click', () => {
    Sound.ui();
    $('help').classList.remove('brief');
  });
  $('advBtn').addEventListener('click', () => {
    Sound.ui();
    ensureAudio();
    openAdventure();
  });
  // construire l'île prend un instant sur mobile : on l'annonce d'abord
  $('isleBtn').addEventListener('click', () => {
    Sound.ui();
    toast('Chargement de l’île…', 'apex');
    setTimeout(() => enterIsland(), 40);
  });
  for (const b of document.querySelectorAll('[data-back]'))
    b.addEventListener('click', () => {
      Sound.ui();
      const scr = b.closest('.screen').id;
      if (scr === 'help' && game.helpThenSelect) {
        game.helpThenSelect = false;
        openSelect();
        return;
      }
      if (scr === 'adventure' && isle) {
        show(null);
        resumeGame();
        return;
      } // retour sur la route de l'île
      if (scr === 'isleMap') {
        closeIsleMap();
        return;
      }
      show(scr === 'settings' ? game.returnTo : 'menu');
    });
  $('goBtn').addEventListener('click', startRun);
  $('resumeBtn').addEventListener('click', resumeGame);
  $('resetBtn').addEventListener('click', () => {
    show(null);
    respawn();
    game.phase = 'count';
    countdownShort();
  });
  $('restartBtn').addEventListener('click', () => {
    if (isle) enterIsland();
    else startRun();
  });
  $('quitBtn').addEventListener('click', () => {
    if (game.mode === 'free' && score.runT > 5) finishRun();
    else toMenu();
  });
  $('pauseBtn').addEventListener('click', pauseGame);
  $('camBtn').addEventListener('click', cycleCam);
  $('againBtn').addEventListener('click', () => {
    if (game.advNext) {
      const n = game.advNext;
      game.advNext = null;
      playMission(n.ci, n.k);
    } else if (isle) enterIsland();
    else startRun();
  });
  $('menuBtn').addEventListener('click', toMenu);
  if (isTouch) $('kbHint').hidden = true;
}
