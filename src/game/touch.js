// ========== commandes tactiles : disposition + contrôleur à doigts glissants ==========
import { game } from './state.js';
import { isTouch, settings, store } from './base.js';
import { cycleCam } from './camera.js';
import { input, keys, touch } from './input.js';
import { ensureAudio } from './score.js';
import { pauseGame, resumeGame, show } from './session.js';
import { canvas } from './stage.js';
import { $ } from '../util/dom.js';
import { clamp } from '../util/math.js';

const TKEYS = ['left', 'right', 'gas', 'brake', 'hb'];
const TEL = { left: $('tLeft'), right: $('tRight'), gas: $('tGas'), brake: $('tBrake'), hb: $('tHb') };
// proportions de chaque bouton par rapport à la taille de base s (largeur, hauteur, rayon relatif)
const TDIM = { left: [1, 1], right: [1, 1], gas: [1.05, 1.5], brake: [0.95, 1.05], hb: [0.95, 0.95] };
const GAP = 12;
const MARGIN = 14;
export let layouts; // { l: {pos, sc, size, op}, p: {...} }  l = paysage, p = portrait
export let tState = { rects: {}, W: 0, H: 0, s: 76, ori: 'l' };
let editing = false;
let selKey = null;

function safeInsets() {
  const pr = document.createElement('div');
  pr.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(pr);
  const c = getComputedStyle(pr);
  const r = {
    t: parseFloat(c.paddingTop) || 0,
    r: parseFloat(c.paddingRight) || 0,
    b: parseFloat(c.paddingBottom) || 0,
    l: parseFloat(c.paddingLeft) || 0,
  };
  pr.remove();
  return r;
}
const curOri = () => (innerWidth >= innerHeight ? 'l' : 'p');
const getLay = () => layouts[curOri()] || null;
function ensureLay() {
  const o = curOri();
  if (!layouts[o]) layouts[o] = { pos: {}, sc: {}, size: 1, op: 1 };
  return layouts[o];
}
const saveLayouts = () => store.set('touchLayout', layouts);

// positions par défaut : pédales à droite, direction à gauche (centres, en px)
function defaultCenters(W, H, s, ins) {
  const c = {};
  const w = (k) => TDIM[k][0] * s,
    h = (k) => TDIM[k][1] * s;
  const bottom = H - ins.b - MARGIN;
  c.left = [ins.l + MARGIN + w('left') / 2, bottom - h('left') / 2];
  c.right = [c.left[0] + w('left') / 2 + GAP + w('right') / 2, c.left[1]];
  c.gas = [W - ins.r - MARGIN - w('gas') / 2, bottom - h('gas') / 2];
  c.brake = [c.gas[0] - w('gas') / 2 - GAP - w('brake') / 2, bottom - h('brake') / 2];
  c.hb = [c.brake[0], c.brake[1] - h('brake') / 2 - GAP - h('hb') / 2];
  return c;
}

export function applyLayout() {
  const W = innerWidth,
    H = innerHeight,
    ori = curOri(),
    lay = getLay();
  const base = W < 560 || H < 420 ? 66 : 76;
  const gsize = lay ? lay.size : 1,
    op = lay ? lay.op : 1;
  const sGlobal = base * gsize;
  const ins = safeInsets();
  const defs = defaultCenters(W, H, sGlobal, ins);
  const rects = {};
  for (const k of TKEYS) {
    const sc = (lay && lay.sc[k]) || 1;
    const w = TDIM[k][0] * sGlobal * sc,
      h = TDIM[k][1] * sGlobal * sc;
    let cx, cy;
    if (lay && lay.pos[k]) {
      cx = lay.pos[k][0] * W;
      cy = lay.pos[k][1] * H;
    } else {
      cx = defs[k][0];
      cy = defs[k][1];
    }
    // reste entièrement visible, hors encoche
    cx = clamp(cx, ins.l + 4 + w / 2, W - ins.r - 4 - w / 2);
    cy = clamp(cy, ins.t + 4 + h / 2, H - ins.b - 4 - h / 2);
    rects[k] = { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, cx, cy, w, h };
    const el = TEL[k];
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.style.transform = `translate(${(cx - w / 2).toFixed(1)}px, ${(cy - h / 2).toFixed(1)}px)`;
    el.style.borderRadius = k === 'left' || k === 'right' ? '50%' : Math.min(w, h) * 0.22 + 'px';
    const tt = el.querySelector('.tt');
    if (tt) tt.style.fontSize = (k === 'gas' ? Math.min(w, h) * 0.26 : Math.min(w, h) * 0.17) + 'px';
  }
  tState = { rects, W, H, s: sGlobal, ori, ins };
  $('touch').style.setProperty('--op', op);
  document.documentElement.style.setProperty('--btn', sGlobal + 'px');
}
// le transform sert au placement : l'état « enfoncé » passe par une ombre interne pour ne pas l'écraser
const style = document.createElement('style');

// ---------- contrôleur : un doigt = un bouton, mais il peut glisser sans lâcher ----------
const ptrs = new Map(); // pointerId -> { k, t }
let ptrClock = 0;
const inside = (r, x, y, m) => x >= r.x0 - m && x <= r.x1 + m && y >= r.y0 - m && y <= r.y1 + m;
// 1) bouton réellement sous le doigt (le plus proche du centre si deux se touchent) ; 2) sinon on garde le bouton
// courant tant que le doigt reste à moins de 28 px (pas de coupure dans les interstices) ; 3) sinon le plus proche à 28 px.
function hitTest(x, y, cur) {
  const R = tState.rects;
  let best = null,
    bd = Infinity;
  for (const k of TKEYS) {
    if (!inside(R[k], x, y, 0)) continue;
    const d = Math.hypot((x - R[k].cx) / R[k].w, (y - R[k].cy) / R[k].h);
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  if (best) return best;
  if (cur && inside(R[cur], x, y, 28)) return cur;
  for (const k of TKEYS) {
    if (!inside(R[k], x, y, 28)) continue;
    const d = Math.hypot((x - R[k].cx) / R[k].w, (y - R[k].cy) / R[k].h);
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}
function recomputeTouch() {
  const on = { left: 0, right: 0, gas: 0, brake: 0, hb: 0 };
  for (const p of ptrs.values()) if (p.k && p.t > on[p.k]) on[p.k] = p.t;
  touch.gas = !!on.gas;
  touch.brake = !!on.brake;
  touch.hb = !!on.hb;
  // deux doigts sur les deux flèches : le dernier arrivé gagne
  touch.left = !!on.left && on.left > on.right;
  touch.right = !!on.right && on.right > on.left;
  refreshTouchUI();
}
let drag = null; // { id, k, dx, dy } en mode éditeur
const layer = $('touch');
const release = (e) => {
  if (editing) {
    if (drag && drag.id === e.pointerId) {
      TEL[drag.k].classList.remove('drag');
      drag = null;
      saveLayouts();
    }
    return;
  }
  if (ptrs.delete(e.pointerId)) recomputeTouch();
};
export function clearTouch() {
  ptrs.clear();
  for (const k in touch) touch[k] = false;
  refreshTouchUI();
}
export function refreshTouchUI() {
  TEL.left.classList.toggle('on', touch.left);
  TEL.right.classList.toggle('on', touch.right);
  TEL.gas.classList.toggle('on', touch.gas || (settings.autoGas && !touch.brake && !touch.hb));
  TEL.brake.classList.toggle('on', touch.brake);
  TEL.hb.classList.toggle('on', touch.hb);
}
export function setTouchVisible() {
  layer.classList.toggle(
    'on',
    editing || (isTouch && (game.phase === 'play' || game.phase === 'count' || game.phase === 'pause')),
  );
  layer.classList.toggle('editing', editing);
}

// ---------- éditeur ----------
const pct = (v) => Math.round(v * 100) + ' %';
function selectKey(k) {
  selKey = k;
  for (const q of TKEYS) TEL[q].classList.toggle('sel', q === k);
  syncLayoutUI();
}
function syncLayoutUI() {
  const lay = getLay();
  $('layAll').value = Math.round((lay ? lay.size : 1) * 100);
  $('layAllOut').textContent = pct(lay ? lay.size : 1);
  $('layOp').value = Math.round((lay ? lay.op : 1) * 100);
  $('layOpOut').textContent = pct(lay ? lay.op : 1);
  const sel = $('laySel');
  sel.disabled = !selKey;
  const names = { left: 'gauche', right: 'droite', gas: 'gaz', brake: 'frein', hb: 'frein à main' };
  $('laySelLbl').firstChild.textContent = selKey ? `Bouton ${names[selKey]} ` : 'Taille du bouton ';
  const v = selKey && lay && lay.sc[selKey] ? lay.sc[selKey] : 1;
  sel.value = Math.round(v * 100);
  $('laySelOut').textContent = selKey ? pct(v) : '—';
}
export function openLayoutEditor() {
  editing = true;
  selKey = null;
  for (const q of TKEYS) TEL[q].classList.remove('sel');
  clearTouch();
  applyLayout();
  syncLayoutUI();
  setTouchVisible();
  show('layout');
}
export function closeLayoutEditor() {
  editing = false;
  drag = null;
  saveLayouts();
  setTouchVisible();
  show(game.returnTo);
}

// ---------- pas de zoom pendant le jeu, zoom libre dans les menus (accessibilité WCAG 1.4.4) ----------
// Le viewport autorise le zoom ; la surface de jeu le bloque (touch-action: none + ces gardes pour iOS),
// les cartes de menu l'acceptent (touch-action: pan-y pinch-zoom).
let lastTouchEnd = 0;

let padPrev = {};
export function readInput() {
  const has = (...k) => k.some((x) => keys.has(x));
  let steer = 0,
    gas = 0,
    brake = 0,
    hb = 0;
  if (has('arrowleft', 'a', 'q') || touch.left) steer -= 1;
  if (has('arrowright', 'd') || touch.right) steer += 1;
  if (has('arrowup', 'w', 'z') || touch.gas) gas = 1;
  if (has('arrowdown', 's') || touch.brake) brake = 1;
  if (has(' ', 'shift') || touch.hb) hb = 1;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    const ax = p.axes[0] || 0;
    if (Math.abs(ax) > 0.12) steer = clamp(ax * 1.1, -1, 1);
    const bv = (i) => (p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0);
    gas = Math.max(gas, bv(7));
    brake = Math.max(brake, bv(6));
    if (bv(0) > 0.5 || bv(1) > 0.5 || bv(5) > 0.5) hb = 1;
    const start = bv(9) > 0.5;
    if (start && !padPrev.start) {
      if (game.phase === 'play') pauseGame();
      else if (game.phase === 'pause') resumeGame();
    }
    const y = bv(3) > 0.5;
    if (y && !padPrev.y && game.phase === 'play') cycleCam();
    padPrev = { start, y };
    break;
  }
  if (settings.autoGas) gas = brake > 0 || hb > 0 ? 0 : 1;
  input.steer = steer;
  input.throttle = gas;
  input.brake = brake;
  input.handbrake = hb;
}

export function init() {
  layouts = store.get('touchLayout', {});
  style.textContent =
    '.tbtn.on { transform-origin: center; filter: brightness(1.15); } #touch.editing .tbtn.drag { filter: brightness(1.2); }';
  document.head.appendChild(style);
  layer.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.tbtn');
    if (!btn) return;
    e.preventDefault();
    try {
      btn.setPointerCapture(e.pointerId);
    } catch (err) {
      /* pas critique */
    }
    if (editing) {
      selectKey(btn.dataset.k);
      const r = tState.rects[btn.dataset.k];
      drag = { id: e.pointerId, k: btn.dataset.k, dx: e.clientX - r.cx, dy: e.clientY - r.cy };
      btn.classList.add('drag');
      return;
    }
    ensureAudio();
    ptrs.set(e.pointerId, { k: hitTest(e.clientX, e.clientY, btn.dataset.k) || btn.dataset.k, t: ++ptrClock });
    recomputeTouch();
  });
  layer.addEventListener('pointermove', (e) => {
    if (editing) {
      if (!drag || drag.id !== e.pointerId) return;
      const lay = ensureLay(),
        R = tState.rects;
      if (!lay.pos[drag.k]) for (const k of TKEYS) lay.pos[k] = [R[k].cx / tState.W, R[k].cy / tState.H]; // fige tout au premier geste
      lay.pos[drag.k] = [(e.clientX - drag.dx) / tState.W, (e.clientY - drag.dy) / tState.H];
      applyLayout();
      return;
    }
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const k = hitTest(e.clientX, e.clientY, p.k);
    if (k !== p.k) {
      p.k = k;
      p.t = ++ptrClock;
      recomputeTouch();
    }
  });
  layer.addEventListener('pointerup', release);
  layer.addEventListener('pointercancel', release);
  layer.addEventListener('lostpointercapture', release);
  $('layAll').addEventListener('input', (e) => {
    ensureLay().size = e.target.value / 100;
    applyLayout();
    syncLayoutUI();
  });
  $('laySel').addEventListener('input', (e) => {
    if (!selKey) return;
    ensureLay().sc[selKey] = e.target.value / 100;
    applyLayout();
    syncLayoutUI();
  });
  $('layOp').addEventListener('input', (e) => {
    ensureLay().op = e.target.value / 100;
    applyLayout();
    syncLayoutUI();
  });
  for (const id of ['layAll', 'laySel', 'layOp']) $(id).addEventListener('change', saveLayouts);
  $('layReset').addEventListener('click', () => {
    delete layouts[curOri()];
    saveLayouts();
    selKey = null;
    for (const q of TKEYS) TEL[q].classList.remove('sel');
    applyLayout();
    syncLayoutUI();
  });
  $('layMirror').addEventListener('click', () => {
    const lay = ensureLay(),
      R = tState.rects;
    for (const k of TKEYS)
      lay.pos[k] = [
        1 - (lay.pos[k] ? lay.pos[k][0] : R[k].cx / tState.W),
        lay.pos[k] ? lay.pos[k][1] : R[k].cy / tState.H,
      ];
    saveLayouts();
    applyLayout();
  });
  $('layDone').addEventListener('click', closeLayoutEditor);
  addEventListener('resize', () => {
    applyLayout();
    if (editing) syncLayoutUI();
  });
  addEventListener('orientationchange', () =>
    setTimeout(() => {
      applyLayout();
      if (editing) syncLayoutUI();
    }, 250),
  );
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      const gameSurface = e.target === canvas || e.target.closest('#touch, #hud');
      if (gameSurface && !e.target.closest('.icon-btn') && now - lastTouchEnd < 350) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend'])
    document.addEventListener(
      ev,
      (e) => {
        if (!(e.target.closest && e.target.closest('.card'))) e.preventDefault();
      },
      { passive: false },
    );
  // ne bloque le glisser que hors des cartes défilantes et des curseurs
  document.addEventListener(
    'touchmove',
    (e) => {
      if (!e.target.closest('.card, input[type=range]')) e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('#touch') || e.target === canvas) e.preventDefault();
  });
}
