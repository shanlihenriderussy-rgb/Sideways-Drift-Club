// ---------- rendu de la vie : circulation, rivaux, autres joueurs (aussi pendant la pause : les autres roulent) ----------
import { game } from '../state.js';
import { Sound } from '../../audio/sound.js';
import { profile, saveProfile, today } from '../base.js';
import { carFx } from '../camera.js';
import { fmtTime } from '../hud.js';
import { refreshWallet } from '../menus.js';
import { showMoments } from '../moments.js';
import { mp, remotesDraw } from '../multiplayer.js';
import { bank, score } from '../score.js';
import { countUp, releaseWake, show } from '../session.js';
import { camera } from '../stage.js';
import { setTouchVisible } from '../touch.js';
import { fitTag } from '../../island/actors.js';
import { IsleLife } from '../../island/life.js';
import { ISLE, isleFound } from '../../island/map.js';
import { Economy } from '../../progress/economy.js';
import { $ } from '../../util/dom.js';

export function lifeDraw(dt, t) {
  const L = game.life,
    cx = camera.position.x,
    cz = camera.position.z;
  L.layer.update(cx, cz);
  L.spots.update(t, cx, cz);
  for (const r of L.rivals) {
    const A = r.A,
      d2 = (A.x - cx) ** 2 + (A.z - cz) ** 2,
      vis = d2 < 300 * 300;
    r.model.root.visible = vis;
    if (!vis) continue;
    r.model.update(A, dt, A.hold || A.speed < 3);
    if (d2 < 140 * 140 && game.phase !== 'pause') carFx(A, r.model, dt, r.fx, 'L');
    const chip = r.cool <= 0 && !L.duel && Math.hypot(A.x - game.player.x, A.z - game.player.z) < 110 ? 'DÉFI' : null;
    const wins = IsleLife.isleBag(profile).rivals[r.def.id] || 0;
    r.tag.set(r.c.name, `${r.def.crew}${wins ? ` · battu ×${wins}` : ''}`, r.c.col, chip);
    fitTag(r.tag.sprite, A.x, A.z, cx, cz, 1.7);
  }
  if (mp) remotesDraw(dt);
}

// fin de balade : gains du mode libre, trouvailles et rencontres de l'île
export function finishIsle() {
  bank();
  game.phase = 'results';
  Sound.suspend();
  $('hud').hidden = true;
  $('hudGoal').hidden = true;
  $('prompt').hidden = true;
  setTouchVisible();
  const total = Math.round(score.total),
    driftPct = Math.round((score.driftT / Math.max(score.runT, 1)) * 100);
  $('resGrade').textContent = '—';
  $('resTotal').textContent = total.toLocaleString('fr-FR') + ' pts';
  $('resRecord').innerHTML = '';
  $('resCombo').textContent = Math.round(score.best).toLocaleString('fr-FR');
  $('resClips').textContent = '—';
  $('resAngle').textContent = Math.round(score.maxAngle) + '°';
  $('resDrift').textContent = driftPct + ' %';
  $('resEyebrow').textContent = 'Balade · L’île de Sideways';
  const S = game.life ? game.life.stats : { rivals: 0, stars: 0, photos: 0 };
  $('resHeadline').textContent = S.rivals
    ? `« ${S.rivals} ${S.rivals > 1 ? 'rivaux battus' : 'rival battu'} sur les routes de l’île. »`
    : '« Une île, neuf kilomètres de routes, et personne pour te dire où tourner. »';
  const res = Economy.applyRun(profile, {
    day: today(),
    trackId: 'ile',
    trackName: 'L’île',
    mode: 'free',
    score: total,
    grade: null,
    clips: 0,
    zones: 0,
    maxAngle: score.maxAngle,
    bestCombo: Math.round(score.best),
    driftPct,
    record: false,
  });
  saveProfile();
  refreshWallet();
  const bag = IsleLife.isleBag(profile),
    stars = IsleLife.ACTIVITIES.reduce((a, d) => a + IsleLife.starsOf(d, bag.best[d.id] || 0), 0);
  const met = IsleLife.ISLE_NPCS.filter((n) => bag.met[n.id]).length,
    photos = IsleLife.PHOTO_SPOTS.filter((p) => bag.photo[p.id]).length;
  const rg = $('resGoal');
  rg.hidden = false;
  rg.innerHTML =
    `<div class="h">L’île · cette balade</div><div class="r"><span>Temps sur la route ${fmtTime(score.runT)} · rivaux battus ${S.rivals} · frôlés ${S.near || 0} · étoiles gagnées ${S.stars} · photos ${S.photos}</span></div>` +
    `<div class="h">L’île · en tout</div><div class="r"><span>Daruma ${isleFound(profile)} / ${ISLE.daruma.length} · étoiles ${stars} / ${IsleLife.ACTIVITIES.length * 3} · rencontres ${met} / ${IsleLife.ISLE_NPCS.length} · photos ${photos} / ${IsleLife.PHOTO_SPOTS.length}</span></div>`;
  $('payLines').innerHTML =
    res.payout.lines.map((l) => `<div><span>${l.label}</span><b>+${Economy.fmt(l.amount)}</b></div>`).join('') ||
    '<div><span>Aucun gain sur cette balade.</span></div>';
  $('payChal').innerHTML = res.challenges
    .map((c) => `<div>Défi réussi : ${c.label} · +${Economy.fmt(c.reward)}</div>`)
    .join('');
  $('payBal').textContent = 'Solde : ' + Economy.fmt(profile.money);
  $('menuBtn').firstElementChild.textContent = 'Menu';
  $('againBtn').firstElementChild.textContent = 'Reprendre la route';
  countUp($('payTotal'), res.payout.total + res.challenges.reduce((a, c) => a + c.reward, 0));
  showMoments('free', total, null);
  show('results');
  releaseWake();
}
