// ---------- déroulé d'une session ----------
import { game } from './state.js';
import { Sound } from '../audio/sound.js';
import {
  advLabel,
  buildExplore,
  clearExplore,
  esc,
  leaveAdventureRun,
  openAdventure,
  talk,
  trackIndexOf,
} from './adventure.js';
import { bests, isTouch, profile, saveProfile, settings, store, today } from './base.js';
import { lap } from './collide.js';
import { el, hudCache } from './hud.js';
import { finishIsle } from './island/render.js';
import { isle, leaveIsle } from './island/world.js';
import { HEADLINES, claimDaily, refreshWallet, toast } from './menus.js';
import { showMoments } from './moments.js';
import { loadTrack, resetPlayer, startIndex } from './scene.js';
import { announce, bank, buildGhost, dropGhost, ensureAudio, ghosts, resetScore, score } from './score.js';
import { camLook, camPos, gy } from './stage.js';
import { clearTouch, setTouchVisible } from './touch.js';
import { Economy } from '../progress/economy.js';
import { Story } from '../progress/story.js';
import { Ghost } from '../sim/ghost.js';
import { TRACKS } from '../sim/track.js';
import { $ } from '../util/dom.js';

export let screenId = null;
export function show(id) {
  if (id === 'garage' && screenId !== 'garage') game.snapCam = true;
  screenId = id;
  if (id) $('prompt').hidden = true;
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  $('toasts').dataset.screen = id || ''; // la place des toasts dépend de l'écran (jamais sur le logotype du titre)
  const scr = id && $(id);
  if (scr) {
    const f = scr.querySelector('.btn.primary, button');
    if (f && !isTouch) setTimeout(() => f.focus({ preventScroll: true }), 30);
  }
}
export function startRun() {
  ensureAudio();
  if (game.track.def.id !== TRACKS[game.trackIdx].id) loadTrack(game.trackIdx);
  resetScore();
  game.skids.clear();
  game.smoke.clear();
  lap.progress = 0;
  lap.n = 0;
  lap.wrongT = 0;
  const idx = game.mode === 'free' ? 4 : startIndex();
  resetPlayer(idx, game.mode === 'free' ? 0 : 16);
  lap.progress = game.mode === 'free' ? 0 : -(game.track.count - idx) * game.track.step;
  game.leader.reset((idx + Math.round(16 / game.track.step)) % game.track.count);
  game.leader.state.speed = 16;
  game.phase = 'count';
  show(null);
  $('hud').hidden = false;
  setTouchVisible();
  $('hudMode').textContent = game.adv
    ? advLabel()
    : game.mode === 'run'
      ? 'RUN NOTÉ'
      : game.mode === 'tandem'
        ? 'TANDEM'
        : 'LIBRE';
  clearExplore();
  if (game.adv && game.adv.explore) buildExplore();
  const goal = $('hudGoal');
  goal.hidden = !game.adv;
  goal.className = 'hud-goal';
  if (game.adv && !game.adv.explore)
    goal.textContent = 'Objectif · ' + Story.goalText(Story.CHAPTERS[game.adv.ci].missions[game.adv.k].goal);
  game.ghostRec = game.mode === 'run' ? Ghost.recorder(profile.current) : null;
  game.hlRec = Ghost.recorder(profile.current);
  buildGhost();
  el('hudBest').classList.remove('ahead', 'behind');
  el('hudBest').dataset.d = '';
  hudCache.hudBest = null;
  const b = bests[game.track.def.id + ':' + game.mode];
  $('hudBest').textContent = b ? 'RECORD ' + b.toLocaleString('fr-FR') : 'RECORD —';
  camPos.set(
    game.player.x - Math.cos(game.player.heading) * 8,
    gy(game.player.x, game.player.z) + 3,
    game.player.z - Math.sin(game.player.heading) * 8,
  );
  camLook.set(game.player.x, gy(game.player.x, game.player.z) + 1, game.player.z);
  countdown();
  requestWake();
  announce(`Départ : ${game.track.def.name}, mode ${$('hudMode').textContent.toLowerCase()}.`);
}
export let countTimer = null;
export function countdown() {
  const el = $('count');
  el.hidden = false;
  let n = 3;
  const tick = () => {
    if (game.phase !== 'count') return;
    el.innerHTML = `<span>${n || 'GO'}</span>`;
    Sound.count(n === 0);
    if (n === 0) {
      game.phase = 'play';
      game.last = performance.now();
      game.acc = 0;
      setTimeout(() => {
        el.hidden = true;
      }, 700);
      return;
    }
    n--;
    countTimer = setTimeout(tick, 800);
  };
  tick();
}
export function pauseGame() {
  if (game.phase !== 'play' && game.phase !== 'count') return;
  clearTimeout(countTimer);
  $('count').hidden = true;
  game.phase = 'pause';
  Sound.suspend();
  clearTouch();
  show('pause');
}
export function resumeGame() {
  show(null);
  game.phase = 'count';
  game.last = performance.now();
  countdownShort();
}
export function countdownShort() {
  const el = $('count');
  el.hidden = false;
  el.innerHTML = '<span>GO</span>';
  setTimeout(() => {
    if (game.phase === 'count') {
      game.phase = 'play';
      game.last = performance.now();
    }
    el.hidden = true;
  }, 500);
}
export function finishRun() {
  if (isle) {
    finishIsle();
    return;
  }
  bank();
  game.phase = 'results';
  Sound.suspend();
  $('hud').hidden = true;
  setTouchVisible();
  $('banner').style.display = 'none';
  const key = game.track.def.id + ':' + game.mode;
  const total = Math.round(score.total);
  const prev = bests[key] || 0;
  const record = total > prev && total > 0;
  if (record) {
    bests[key] = total;
    store.set('bests', bests);
  }
  // nouveau record noté : son run devient le fantôme de la piste
  const ghostSaved = record && game.mode === 'run' && game.ghostRec && game.ghostRec.d.length >= 50;
  if (ghostSaved) {
    ghosts[game.track.def.id] = Ghost.pack(game.ghostRec);
    store.set('ghosts', ghosts);
  }
  game.ghostRec = null;
  dropGhost();
  const par = game.track.def.par * (game.mode === 'tandem' ? 1.25 : 1);
  const r = total / par;
  const grade = r >= 1 ? 'S' : r >= 0.75 ? 'A' : r >= 0.5 ? 'B' : r >= 0.28 ? 'C' : 'D';
  $('resGrade').textContent = game.mode === 'free' ? '—' : grade;
  $('resTotal').textContent = total.toLocaleString('fr-FR') + ' pts';
  $('resRecord').innerHTML = record
    ? `<span class="record">NOUVEAU RECORD</span>${ghostSaved ? '<span class="hint"> · ton fantôme t’attendra au prochain run</span>' : ''}`
    : prev
      ? `<span class="hint">Record : ${prev.toLocaleString('fr-FR')}</span>`
      : '';
  $('resCombo').textContent = Math.round(score.best).toLocaleString('fr-FR');
  $('resClips').textContent = `${score.clips} / ${game.track.zones.length}`;
  $('resAngle').textContent = Math.round(score.maxAngle) + '°';
  $('resDrift').textContent = Math.round((score.driftT / Math.max(score.runT, 1)) * 100) + ' %';
  $('resEyebrow').textContent =
    `${game.mode === 'run' ? 'Run noté' : game.mode === 'tandem' ? 'Tandem' : 'Libre'} · ${game.track.def.name}`;
  $('resHeadline').textContent =
    game.mode === 'free'
      ? '« Séance libre : rien n’est noté, tout est permis. »'
      : record && grade !== 'D'
        ? `« Record battu sur ${game.track.def.name}. »`
        : HEADLINES[grade].replace('%', game.track.def.name);
  // gains en yens + défis
  const res = Economy.applyRun(profile, {
    day: today(),
    trackId: game.track.def.id,
    trackName: game.track.def.name,
    mode: game.mode,
    score: total,
    grade: game.mode === 'free' ? null : grade,
    clips: score.clips,
    zones: game.track.zones.length,
    maxAngle: score.maxAngle,
    bestCombo: Math.round(score.best),
    driftPct: Math.round((score.driftT / Math.max(score.runT, 1)) * 100),
    record: record && game.mode !== 'free',
  });
  saveProfile();
  refreshWallet();
  $('payLines').innerHTML =
    res.payout.lines.map((l) => `<div><span>${l.label}</span><b>+${Economy.fmt(l.amount)}</b></div>`).join('') ||
    '<div><span>Aucun gain sur ce run.</span></div>';
  $('payChal').innerHTML = res.challenges
    .map((c) => `<div>Défi réussi : ${c.label} · +${Economy.fmt(c.reward)}</div>`)
    .join('');
  // aventure : objectifs de la mission, récompense, suite de l'histoire
  let fr = null;
  game.advNext = null;
  $('hudGoal').hidden = true;
  const rg = $('resGoal');
  rg.hidden = !game.adv;
  if (game.adv && !game.adv.explore) {
    const ch = Story.CHAPTERS[game.adv.ci],
      m = ch.missions[game.adv.k];
    fr = Story.finishMission(profile, game.adv.ci, game.adv.k, {
      score: total,
      grade,
      clips: score.clips,
      maxAngle: score.maxAngle,
      bestCombo: Math.round(score.best),
      driftPct: Math.round((score.driftT / Math.max(score.runT, 1)) * 100),
      walls: score.walls,
    });
    saveProfile();
    refreshWallet();
    rg.innerHTML =
      `<div class="h">Mission · ${esc(m.title)} — ${fr.ok ? 'réussie' : 'ratée'}</div>` +
      fr.rows
        .map(
          (r) =>
            `<div class="r ${r.ok ? 'ok' : 'ko'}"><i aria-hidden="true">${r.ok ? '✓' : '✗'}</i><span>${esc(r.label)}<span class="sr">${r.ok ? ', atteint' : ', manqué'}</span></span></div>`,
        )
        .join('');
    if (fr.reward)
      $('payChal').insertAdjacentHTML(
        'afterbegin',
        `<div>Mission réussie : ${esc(m.title)} · +${Economy.fmt(fr.reward)}</div>`,
      );
    if (fr.ok) {
      const ci = Story.nextMission(profile, game.adv.ci) >= 0 ? game.adv.ci : game.adv.ci + 1;
      if (ci < Story.CHAPTERS.length && Story.chapterOpen(profile, ci)) {
        game.advNext = { ci, k: Story.nextMission(profile, ci) };
        game.advSel = ci;
      }
    }
  } else if (game.adv && game.adv.explore) {
    const z = Story.zoneProgress(profile, game.adv.explore);
    rg.innerHTML = `<div class="h">Exploration · ${esc(game.track.def.name)}</div><div class="r"><span>Archives ${z.arch} / 5 · défis de rue ${z.street} / ${Story.STREET.length} · rencontre ${z.npc} / 1</span></div>`;
  }
  $('menuBtn').firstElementChild.textContent = game.adv ? 'Carte' : 'Menu';
  $('againBtn').firstElementChild.textContent = game.advNext ? 'Mission suivante' : 'Rejouer';
  $('payBal').textContent = 'Solde : ' + Economy.fmt(profile.money);
  countUp($('payTotal'), res.payout.total + res.challenges.reduce((a, c) => a + c.reward, 0) + (fr ? fr.reward : 0));
  showMoments(game.mode, total, game.mode === 'free' ? null : grade);
  show('results');
  if (fr) {
    const ch = Story.CHAPTERS[game.adv.ci];
    talk(fr.lines, () => {
      if (!fr.chapterDone) return;
      talk(ch.outro, () => {
        const nx = Story.CHAPTERS[game.adv ? game.adv.ci + 1 : -1];
        if (nx)
          toast(`Chapitre ${game.adv.ci + 2} ouvert : ${nx.title} · ${TRACKS[trackIndexOf(nx.track)].name}`, 'chal');
        else toast('Aventure terminée. Les six lieux restent à explorer.', 'chal');
      });
    });
  }
  announce(
    `Session terminée. ${total} points${game.mode !== 'free' ? ', note ' + grade : ''}.${record ? ' Nouveau record.' : ''}`,
  );
  releaseWake();
}
export function countUp(el, to) {
  const t0 = performance.now(),
    dur = settings.reduce ? 1 : 900;
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    el.textContent = Economy.fmt(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(tick);
    else if (to > 0) Sound.cash();
  };
  requestAnimationFrame(tick);
}
export function toMenu() {
  game.phase = 'menu';
  game.ghostRec = null;
  dropGhost();
  claimDaily();
  refreshWallet();
  Sound.suspend();
  $('hud').hidden = true;
  clearTouch();
  setTouchVisible();
  $('count').hidden = true;
  $('hudGoal').hidden = true;
  if (isle) leaveIsle();
  if (game.adv) {
    leaveAdventureRun();
    openAdventure();
  } else show('menu');
  releaseWake();
}

let wake = null;
export async function requestWake() {
  try {
    if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen');
  } catch (e) {
    wake = null;
  }
}
export function releaseWake() {
  try {
    wake && wake.release();
  } catch (e) {
    /* rien */
  }
  wake = null;
}

export function init() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.phase === 'play') pauseGame();
  });
}
