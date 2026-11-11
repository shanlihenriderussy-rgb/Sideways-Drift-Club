// ---------- favicon vivant : le multiplicateur du combo s'affiche dans l'onglet (bureau) ----------
import { game } from './state.js';
import { isTouch, settings } from './base.js';
import { lap } from './collide.js';
import { drawIsleMinimap } from './island/events.js';
import { isle } from './island/world.js';
import { score } from './score.js';
import { RPM_MAX } from '../sim/physics.js';
import { $ } from '../util/dom.js';
import { clamp } from '../util/math.js';

const favLink = document.querySelector('link[rel="icon"][type="image/svg+xml"]');
const favBase = favLink ? favLink.href : null;
const favImg = new Image();
const favCv = document.createElement('canvas');
let favShown = '';
let favT = 0;
export function updateFavicon(dt) {
  if (isTouch || !favBase) return;
  favT += dt;
  if (favT < 0.25) return;
  favT = 0;
  const key = game.phase === 'play' && score.combo > 0 && score.mult >= 2 ? 'x' + Math.floor(score.mult) : '';
  if (key === favShown) return;
  favShown = key;
  if (!key) {
    favLink.href = favBase;
    return;
  }
  const g = favCv.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  if (favImg.complete) g.drawImage(favImg, 0, 0, 64, 64);
  g.beginPath();
  g.moveTo(26, 30);
  g.arcTo(64, 30, 64, 64, 9);
  g.arcTo(64, 64, 18, 64, 9);
  g.arcTo(18, 64, 18, 30, 9);
  g.arcTo(18, 30, 64, 30, 9);
  g.closePath();
  g.fillStyle = '#7b8cff';
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = '#07080a';
  g.stroke();
  g.fillStyle = '#07080a';
  g.font = '900 28px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(key, 41, 48);
  favLink.href = favCv.toDataURL('image/png');
}

// ---------- HUD ----------
export const hudCache = {};
const hudEl = {};
export const el = (id) => hudEl[id] || (hudEl[id] = $(id));
export function setText(id, v) {
  if (hudCache[id] !== v) {
    hudCache[id] = v;
    el(id).textContent = v;
  }
}
function setNum(id, n) {
  if (hudCache[id] !== n) {
    hudCache[id] = n;
    el(id).textContent = n.toLocaleString('fr-FR');
  }
}
export function setBar(id, k) {
  k = Math.round(k * 200) / 200;
  if (hudCache[id] !== k) {
    hudCache[id] = k;
    el(id).style.transform = `scaleX(${k})`;
  }
}
export function fmtTime(s) {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
}
export function updateHUD(dt) {
  const st = game.player;
  setNum('hudSpeed', Math.round(st.speed * 3.6));
  setText('hudGear', st.reversing ? 'R' : String(st.gear));
  const r = clamp((st.rpm - 900) / (RPM_MAX - 900), 0, 1);
  setBar('rpmFill', r);
  if (hudCache.red !== r > 0.88) {
    hudCache.red = r > 0.88;
    el('rpmBar').classList.toggle('red', r > 0.88);
  }
  setNum('hudTotal', Math.round(score.total));
  setText('hudTime', fmtTime(score.runT));
  if (!isle)
    setText(
      'hudLap',
      game.mode === 'free'
        ? `Tour ${lap.n + 1}`
        : `${Math.round(clamp(lap.progress / game.track.length, 0, 1) * 100)} %`,
    );
  let tandemNear = false;
  if (game.mode === 'tandem') tandemNear = Math.hypot(st.x - game.leader.state.x, st.z - game.leader.state.z) < 11;
  // chaleur du combo : le bord de l'écran rougeoie avec le multiplicateur
  const heat =
    score.combo > 0 ? Math.round(clamp((score.mult - 1.6) / 4.5, 0, 1) * (settings.reduce ? 0.45 : 1) * 20) / 20 : 0;
  if (hudCache.heat !== heat) {
    hudCache.heat = heat;
    el('heat').style.opacity = heat;
  }
  const comboEl = el('combo');
  const active = score.combo > 0;
  if (hudCache.active !== active) {
    hudCache.active = active;
    comboEl.classList.toggle('idle', !active);
  }
  if (active) {
    setNum('comboPts', Math.round(score.combo));
    setText('comboMult', 'x' + score.mult.toFixed(1));
    const ang = (Math.abs(st.slip) * 180) / Math.PI;
    setBar('angleFill', clamp(ang / 70, 0, 1));
    if (hudCache.warn !== score.idle > 0.3) {
      hudCache.warn = score.idle > 0.3;
      comboEl.classList.toggle('warn', score.idle > 0.3);
    }
    setText('comboTag', score.idle > 0.3 ? 'ENCAISSEMENT…' : game.mode === 'tandem' && tandemNear ? 'TANDEM' : 'DRIFT');
  }
  if (game.mode === 'tandem') {
    const d = Math.hypot(st.x - game.leader.state.x, st.z - game.leader.state.z);
    if (hudCache.tmShow !== 'flex') {
      hudCache.tmShow = 'flex';
      el('tandemMeter').style.display = 'flex';
    }
    setBar('tandemFill', clamp(1 - (d - 3) / 22, 0, 1));
  } else if (game.life && game.life.duel && game.life.duel.kind === 'tandem' && game.life.duel.state === 'run') {
    if (hudCache.tmShow !== 'flex') {
      hudCache.tmShow = 'flex';
      el('tandemMeter').style.display = 'flex';
    } // jauge remplie par duelTick
  } else if (hudCache.tmShow !== 'none') {
    hudCache.tmShow = 'none';
    el('tandemMeter').style.display = 'none';
  }
  drawMinimap();
}

// ---------- mini-carte ----------
let mmBase = null;
let mmT = null;
export function drawMinimapBase() {
  const c = document.createElement('canvas');
  c.width = c.height = 208;
  const g = c.getContext('2d');
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < game.track.count; i++) {
    minX = Math.min(minX, game.track.px[i]);
    maxX = Math.max(maxX, game.track.px[i]);
    minZ = Math.min(minZ, game.track.pz[i]);
    maxZ = Math.max(maxZ, game.track.pz[i]);
  }
  const s = 176 / Math.max(maxX - minX, maxZ - minZ);
  const ox = 104 - ((minX + maxX) / 2) * s,
    oz = 104 - ((minZ + maxZ) / 2) * s;
  mmT = (x, z) => [ox + x * s, oz + z * s];
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i <= game.track.count; i++) {
    const [x, y] = mmT(game.track.px[i % game.track.count], game.track.pz[i % game.track.count]);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.strokeStyle = 'rgba(0,0,0,.6)';
  g.lineWidth = 12;
  g.stroke();
  g.strokeStyle = 'rgba(243,239,228,.85)';
  g.lineWidth = 6;
  g.stroke();
  for (const z of game.track.zones) {
    const [x, y] = mmT(
      game.track.px[z.mid] - game.track.tz[z.mid] * z.side * game.track.half,
      game.track.pz[z.mid] + game.track.tx[z.mid] * z.side * game.track.half,
    );
    g.fillStyle = z.type === 'outer' ? '#ffb020' : '#38d6ff';
    g.beginPath();
    g.arc(x, y, 4, 0, Math.PI * 2);
    g.fill();
  }
  const [sx, sy] = mmT(game.track.px[0], game.track.pz[0]);
  g.fillStyle = '#ffd23f';
  g.fillRect(sx - 5, sy - 5, 10, 10);
  mmBase = c;
}
function drawMinimap() {
  const g = $('minimap').getContext('2d');
  g.clearRect(0, 0, 208, 208);
  if (isle) {
    drawIsleMinimap(g);
    return;
  }
  g.drawImage(mmBase, 0, 0);
  const dot = (st, col, r) => {
    const [x, y] = mmT(st.x, st.z);
    g.fillStyle = '#000';
    g.beginPath();
    g.arc(x, y, r + 2.5, 0, 7);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, r, 0, 7);
    g.fill();
  };
  if (game.mode === 'tandem') dot(game.leader.state, '#ff7ad9', 6);
  dot(game.player, '#ff3d3d', 7);
}

export function init() {
  if (favBase) favImg.src = favBase;
  favCv.width = favCv.height = 64;
}
