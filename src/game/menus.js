// ---------- menus ----------
import { game } from './state.js';
import { Sound } from '../audio/sound.js';
import { bests, profile, saveProfile, store, today } from './base.js';
import { renderRecs } from './moments.js';
import { buildCars, loadTrack } from './scene.js';
import { announce, ensureAudio } from './score.js';
import { screenId, show } from './session.js';
import { canvas } from './stage.js';
import { Economy } from '../progress/economy.js';
import { TRACKS } from '../sim/track.js';
import { createShop } from '../ui/shop.js';
import { $ } from '../util/dom.js';

export function pressGroup(container, attr, value) {
  for (const b of container.querySelectorAll('[' + attr + ']'))
    b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(value)));
}
export function buildTrackList() {
  const list = $('trackList');
  list.innerHTML = '';
  TRACKS.forEach((t, i) => {
    const b = document.createElement('button');
    b.className = 'opt track-opt';
    b.dataset.track = i;
    const best = bests[t.id + ':' + game.mode];
    b.innerHTML = `<span class="swatch sw-${t.id}" aria-hidden="true"></span><span><b>${t.name}</b><br><small>${t.time} · ${t.jp}</small></span>${best ? `<span class="best">Record<b>${best.toLocaleString('fr-FR')}</b></span>` : ''}`;
    b.setAttribute('aria-pressed', String(i === game.trackIdx));
    b.addEventListener('click', () => {
      game.trackIdx = i;
      store.set('track', i);
      pressGroup(list, 'data-track', i);
      Sound.ui();
      if (game.track.def.id !== t.id) loadTrack(i);
    });
    list.appendChild(b);
  });
}
// ---------- portefeuille : toasts, solde, bonus du jour, carrière ----------
export function toast(text, cls) {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + (cls || '');
  el.textContent = text;
  box.appendChild(el);
  const inGame = !$('hud').hidden;
  while (box.children.length > (inGame ? 2 : 3)) box.firstChild.remove(); // en jeu : deux au plus, la piste reste visible
  document.body.classList.add('toasting');
  setTimeout(() => {
    el.remove();
    if (!box.children.length) document.body.classList.remove('toasting');
  }, 3300);
  announce(text);
}
export function refreshWallet() {
  $('menuWallet').textContent = Economy.fmt(profile.money);
  refreshFrontPage();
}
// manchette et bandeau « dernière minute » du menu : date, numéro d'édition (= runs joués), records par piste
export const HEADLINES = {
  S: '« % : une démonstration. »',
  A: '« Du grand art sur %. »',
  B: '« Belle ligne, angle à creuser. »',
  C: '« Des bases, encore timides. »',
  D: '« Rentrée discrète au paddock. »',
};
function refreshFrontPage() {
  const d = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('mastDate').textContent = d.charAt(0).toUpperCase() + d.slice(1);
  $('mastNo').textContent = 'N° ' + String(profile.stats.runs + 1).padStart(3, '0');
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  // un record par piste qui en a un ; tant qu'il n'y en a aucun, une seule invitation (pas six fois la même)
  const items = TRACKS.filter((t) => bests[t.id + ':run']).map(
    (t) => `<b>${esc(t.name)}</b> · record <i>${bests[t.id + ':run'].toLocaleString('fr-FR')} pts</i>`,
  );
  if (!items.length) items.push(`<b>Aucun record encore</b> · <i>ton premier run noté l’écrira ici</i>`);
  items.push(
    `Ta cagnotte · <i>${Economy.fmt(profile.money)}</i>`,
    `<b>Col de Yukimi</b> · neige tassée, adhérence réduite`,
  );
  const row = items.map((h) => `<span>${h}</span>`).join('');
  $('ticker').innerHTML = row + row; // doublé : défilement sans couture
}
export function claimDaily() {
  const d = Economy.claimDaily(profile, today());
  if (!d) return;
  saveProfile();
  refreshWallet();
  setTimeout(() => {
    toast(`Bonus du jour · +${Economy.fmt(d.amount)}${d.streak > 1 ? ` · série de ${d.streak} jours` : ''}`, 'chal');
    Sound.cash();
  }, 600);
}
export function openCareer() {
  const st = profile.stats;
  const cell = (l, v) => `<div>${l}<b>${v}</b></div>`;
  $('careerStats').innerHTML =
    cell('Solde', Economy.fmt(profile.money)) +
    cell('Runs terminés', st.runs) +
    cell('Total gagné', Economy.fmt(st.earned)) +
    cell('Meilleur gain', Economy.fmt(st.bestPayout));
  $('chalList').innerHTML = Economy.CHALLENGES.map(
    (c) =>
      `<li class="${profile.done[c.id] ? 'done' : ''}"><span class="ck" aria-hidden="true">${profile.done[c.id] ? '✓' : ''}</span><span>${c.label}<span class="sr">${profile.done[c.id] ? ', réussi' : ''}</span></span><b>${Economy.fmt(c.reward)}</b></li>`,
  ).join('');
  const fmtD = (t) => new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  renderRecs();
  $('logList').innerHTML =
    profile.log
      .slice(0, 15)
      .map(
        (l) =>
          `<li><span>${fmtD(l.t)} · ${l.label.replace(/[<>&]/g, '')}</span><b class="${l.amount < 0 ? 'neg' : ''}">${l.amount < 0 ? '−' : '+'}${Economy.fmt(Math.abs(l.amount))}</b></li>`,
      )
      .join('') || '<li><span>Aucun mouvement pour l’instant.</span></li>';
  show('career');
}

// ---------- atelier ----------
const SHOP_VIEWS = {
  car: { a: null, r: 7, h: 1.7 },
  body: { a: 0.75, r: 6.4, h: 1.5 },
  paint: { a: 1.57, r: 6.6, h: 1.35 },
  wheels: { a: 0.62, r: 3.3, h: 0.55, look: 0.35, fwd: 1.2 },
  chassis: { a: 1.15, r: 4.4, h: 2.1, look: 0.75 },
  perf: { a: 2.5, r: 5.6, h: 1.25 },
  tune: { a: 1.2, r: 5.4, h: 0.45, look: 0.4 },
};
let shop;
export function openShop() {
  ensureAudio();
  show('garage');
  shop.open();
}
export function closeShop() {
  shop.leave();
  game.showKind = null;
  game.showCfg = null;
  buildCars();
  Sound.ui();
  show(game.shopReturn);
  game.shopReturn = 'menu';
}
// glisser sur la scène pour tourner autour de la voiture
let yawDrag = null;

export function init() {
  for (const b of document.querySelectorAll('[data-mode]')) {
    b.addEventListener('click', () => {
      game.mode = b.dataset.mode;
      store.set('mode', game.mode);
      pressGroup(document.querySelector('#select .modes'), 'data-mode', game.mode);
      buildTrackList();
      Sound.ui();
    });
  }
  game.shopView = SHOP_VIEWS.car;
  shop = createShop({
    profile,
    save() {
      saveProfile();
      refreshWallet();
    },
    preview(kind, cfg) {
      game.showKind = kind;
      game.showCfg = cfg;
      buildCars(true);
    },
    setView(tab) {
      game.shopView = SHOP_VIEWS[tab] || SHOP_VIEWS.car;
      game.garageYaw = 0;
    },
    close() {
      closeShop();
    },
    carChanged() {
      /* la fiche physique est relue au départ du run (resetPlayer) */
    },
    sound: Sound,
    toast,
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (screenId === 'garage') yawDrag = { x: e.clientX, y0: game.garageYaw, id: e.pointerId };
  });
  addEventListener('pointermove', (e) => {
    if (yawDrag && yawDrag.id === e.pointerId) game.garageYaw = yawDrag.y0 - (e.clientX - yawDrag.x) * 0.008;
  });
  addEventListener('pointerup', () => {
    yawDrag = null;
  });
}
