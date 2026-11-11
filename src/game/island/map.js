// ---------- carte de l'île : repères, et un toucher règle le GPS ----------
import { game } from '../state.js';
import { Sound } from '../../audio/sound.js';
import { esc, trackIndexOf } from '../adventure.js';
import { profile } from '../base.js';
import { clearGps, setGps, setPrompt } from './interact.js';
import { castOf, isle, isleData } from './world.js';
import { mp } from '../multiplayer.js';
import { countTimer, resumeGame, show } from '../session.js';
import { clearTouch } from '../touch.js';
import { IsleLife } from '../../island/life.js';
import { Economy } from '../../progress/economy.js';
import { Story } from '../../progress/story.js';
import { TRACKS } from '../../sim/track.js';
import { $ } from '../../util/dom.js';

let mapItems = [];
export function openIsleMap() {
  if (!isle || !game.life) return;
  if (game.phase === 'play' || game.phase === 'count') {
    clearTimeout(countTimer);
    $('count').hidden = true;
    game.phase = 'pause';
    Sound.suspend();
    clearTouch();
  }
  setPrompt(null);
  renderIsleMap();
  show('isleMap');
}
export function closeIsleMap() {
  show(null);
  resumeGame();
}
function renderIsleMap() {
  const I = isleData,
    L = game.life,
    cv = $('mapCv'),
    g = cv.getContext('2d'),
    W = cv.width,
    H = cv.height;
  const { cx, cz, rx, rz } = I.def.shape,
    s = Math.min(W / (rx * 2.12), H / (rz * 2.2)),
    ox = W / 2 - cx * s,
    oz = H / 2 - cz * s;
  const T = (x, z) => [ox + x * s, oz + z * s];
  const bag = IsleLife.isleBag(profile),
    found = bag.found;
  mapItems = [];
  const item = (o) => {
    mapItems.push(o);
    return mapItems.length - 1;
  };
  // fond : mer, île, volcan, routes
  g.fillStyle = '#0b2733';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#123a4a';
  g.beginPath();
  g.ellipse(...T(cx, cz), rx * s * 1.04, rz * s * 1.05, 0, 0, 7);
  g.fill();
  g.fillStyle = '#3f5a2c';
  g.beginPath();
  g.ellipse(...T(cx, cz), rx * s, rz * s, 0, 0, 7);
  g.fill();
  const V = I.def.volcano,
    gr = g.createRadialGradient(...T(V.x, V.z), 0, ...T(V.x, V.z), V.r * s);
  gr.addColorStop(0, '#2c2725');
  gr.addColorStop(0.35, '#55493f');
  gr.addColorStop(1, 'rgba(63,90,44,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(...T(V.x, V.z), V.r * s, 0, 7);
  g.fill();
  g.fillStyle = 'rgba(238,242,246,.35)';
  g.beginPath();
  g.ellipse(...T(-640, 330), 200 * s, 130 * s, 0, 0, 7);
  g.fill();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (const r of I.roads) {
    g.beginPath();
    for (let i = 0; i < r.count; i += 3) {
      const [x, y] = T(r.px[i], r.pz[i]);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.lineTo(...T(r.px[r.count - 1], r.pz[r.count - 1]));
    g.strokeStyle = 'rgba(0,0,0,.6)';
    g.lineWidth = 7;
    g.stroke();
    g.strokeStyle = '#e9e5da';
    g.lineWidth = 3.4;
    g.stroke();
  }
  // zones de glisse : le tronçon en jaune
  for (const a of L.spots.acts)
    if (a.def.type === 'zone') {
      const r = I.roads[a.def.e],
        i0 = Math.round(a.def.from * (r.count - 1)),
        i1 = Math.round(a.def.to * (r.count - 1));
      g.beginPath();
      for (let i = i0; i <= i1; i += 3) {
        const [x, y] = T(r.px[i], r.pz[i]);
        i === i0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.strokeStyle = 'rgba(247,209,84,.85)';
      g.lineWidth = 4;
      g.stroke();
    }
  if (L.gps && L.gps.pts.length > 2) {
    const P = L.gps.pts;
    g.beginPath();
    g.moveTo(...T(game.player.x, game.player.z));
    for (let k = 0; k < P.length; k += 2) g.lineTo(...T(P[k], P[k + 1]));
    g.strokeStyle = '#7b8cff';
    g.lineWidth = 4;
    g.setLineDash([8, 6]);
    g.stroke();
    g.setLineDash([]);
  }
  const dot = (x, y, r, col, ring) => {
    g.fillStyle = '#07080a';
    g.beginPath();
    g.arc(x, y, r + 2.5, 0, 7);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, r, 0, 7);
    g.fill();
    if (ring) {
      g.strokeStyle = ring;
      g.lineWidth = 2;
      g.stroke();
    }
  };
  const label = (x, y, t, col) => {
    g.font = '700 12px "Archivo", sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 3.5;
    g.strokeStyle = 'rgba(7,8,10,.85)';
    g.strokeText(t, x, y);
    g.fillStyle = col || '#f2f2ef';
    g.fillText(t, x, y);
  };
  const side = { hubs: [], rivals: [], acts: [], npcs: [], photos: [] };
  for (const [id, hb] of Object.entries(I.hubs)) {
    const [x, y] = T(hb.x, hb.z),
      open = Story.chapterOpen(profile, Story.zoneIndex(id)),
      name = TRACKS[trackIndexOf(id)].name;
    g.fillStyle = '#07080a';
    g.fillRect(x - 7, y - 7, 14, 14);
    g.fillStyle = open ? '#f7d154' : '#6c717a';
    g.fillRect(x - 5, y - 5, 10, 10);
    label(x, y - 12, name);
    side.hubs.push({
      i: item({ x, y, name, set: () => setGps({ name, x: hb.x, z: hb.z, arrive: 13 }) }),
      name,
      sub: open
        ? `chapitre ${Story.zoneIndex(id) + 1}${Story.chapterDone(profile, Story.zoneIndex(id)) ? ' · terminé' : ''}`
        : 'fermé',
      lock: !open,
    });
  }
  for (const a of L.spots.acts) {
    const [x, y] = T(a.x, a.z),
      n = IsleLife.starsOf(a.def, bag.best[a.def.id] || 0);
    dot(x, y, 4.5, a.def.type === 'radar' ? '#7b8cff' : '#f7d154');
    const rec = bag.best[a.def.id] || 0;
    side.acts.push({
      i: item({ x, y, name: a.def.name, set: () => setGps({ name: a.def.name, x: a.x, z: a.z, arrive: 12 }) }),
      name: a.def.name,
      sub: `${a.def.type === 'radar' ? 'radar' : 'zone de glisse'} · ${rec ? `record ${rec.toLocaleString('fr-FR')} ${a.def.type === 'radar' ? 'km/h' : 'pts'}` : 'pas encore tenté'}`,
      stars: n,
    });
  }
  for (const n of L.spots.npcs) {
    const [x, y] = T(n.x, n.z),
      c = castOf(n.def.who);
    dot(x, y, 4, c.col, '#f2f2ef');
    side.npcs.push({
      i: item({ x, y, name: c.name, set: () => setGps({ name: c.name, x: n.x, z: n.z, arrive: 10 }) }),
      name: c.name,
      sub: c.role,
      em: bag.met[n.def.id] ? '✓' : '',
    });
  }
  for (const p of L.spots.photos) {
    const [x, y] = T(p.x, p.z);
    g.fillStyle = '#07080a';
    g.fillRect(x - 6, y - 4.5, 12, 9);
    g.fillStyle = '#7b8cff';
    g.fillRect(x - 4.5, y - 3, 9, 6);
    side.photos.push({
      i: item({ x, y, name: p.def.name, set: () => setGps({ name: p.def.name, x: p.x, z: p.z, arrive: 7 }) }),
      name: p.def.name,
      sub: 'belvédère',
      em: bag.photo[p.def.id] ? '✓' : '',
    });
  }
  I.daruma.forEach((d, k) => {
    if (found[k]) return;
    const [x, y] = T(d.x, d.z);
    dot(x, y, 2.6, '#ffb020');
    item({
      x,
      y,
      name: 'Daruma doré',
      set: () => setGps({ name: 'Daruma doré', x: d.x, z: d.z, arrive: 2, daruma: k }),
    });
  });
  for (const r of L.rivals) {
    const [x, y] = T(r.A.x, r.A.z),
      w = bag.rivals[r.def.id] || 0;
    dot(x, y, 5.5, r.c.col, '#ff4d4f');
    label(x, y - 10, r.c.name, r.c.col);
    side.rivals.push({
      i: item({
        x,
        y,
        name: r.c.name,
        set: () => {
          r.cool = 0;
          setGps({ name: r.c.name, get: () => [r.A.x, r.A.z], arrive: 30 });
        },
      }),
      name: r.c.name,
      sub: `${r.def.crew} · ${r.def.car.toUpperCase()}`,
      em: w ? `battu ×${w}` : Economy.fmt(r.def.reward),
    });
  }
  for (const def of IsleLife.RIVALS)
    if (!L.rivals.some((r) => r.def === def))
      side.rivals.push({ i: -1, name: castOf(def.who).name, sub: `arrive au chapitre ${def.unlock + 1}`, lock: true });
  if (mp)
    for (const R of mp.remotes.values())
      if (R.shown) {
        const [x, y] = T(R.view.x, R.view.z);
        dot(x, y, 5.5, R.color, '#f2f2ef');
        label(x, y - 10, R.name, R.color);
        item({
          x,
          y,
          name: R.name,
          set: () =>
            setGps({
              name: R.name,
              get: () => (R.shown ? [R.view.x, R.view.z] : [game.player.x, game.player.z]),
              arrive: 20,
            }),
        });
      }
  // toi
  const [px, py] = T(game.player.x, game.player.z);
  g.save();
  g.translate(px, py);
  g.rotate(game.player.heading);
  g.fillStyle = '#07080a';
  g.beginPath();
  g.moveTo(12, 0);
  g.lineTo(-8, 8);
  g.lineTo(-8, -8);
  g.closePath();
  g.fill();
  g.fillStyle = '#ff3d3d';
  g.beginPath();
  g.moveTo(9, 0);
  g.lineTo(-5, 5.5);
  g.lineTo(-5, -5.5);
  g.closePath();
  g.fill();
  g.restore();
  const sec = (title, list) =>
    list.length
      ? `<div><h3>${title}</h3><ul>${list.map((o) => `<li class="${o.lock ? 'lock' : ''}"><button ${o.i < 0 ? 'disabled' : `data-i="${o.i}"`}><span>${esc(o.name)}<small>${esc(o.sub || '')}</small></span><em>${o.stars != null ? `${'★'.repeat(o.stars)}<span class="st0">${'☆'.repeat(3 - o.stars)}</span>` : esc(o.em || '')}</em></button></li>`).join('')}</ul></div>`
      : '';
  $('mapSide').innerHTML =
    (L.gps
      ? `<div class="gps-on"><span>GPS : <b>${esc(L.gps.name)}</b></span><button class="btn ghost" data-gps-off>Arrêter</button></div>`
      : '<p class="sub" style="margin:0">Touche un repère pour y régler le GPS.</p>') +
    sec('Rivaux', side.rivals) +
    sec('Activités', side.acts) +
    sec('Lieux de l’aventure', side.hubs) +
    sec('Habitants', side.npcs) +
    sec('Belvédères', side.photos);
  $('mapLegend').innerHTML =
    '<span><i class="sq" style="background:#f7d154"></i>lieux</span><span><i style="background:#f7d154"></i>zones</span><span><i style="background:#7b8cff"></i>radars</span><span><i class="sq" style="background:#7b8cff"></i>belvédères</span><span><i style="background:#ffb020"></i>daruma</span><span><i class="ring"></i>rivaux</span><span><i class="tri"></i>toi</span>';
}
function pickMap(i) {
  const it = mapItems[i];
  if (!it) return;
  it.set();
  renderIsleMap();
}

export function init() {
  $('mapCv').addEventListener('click', (e) => {
    const cv = $('mapCv'),
      b = cv.getBoundingClientRect(),
      x = ((e.clientX - b.left) * cv.width) / b.width,
      y = ((e.clientY - b.top) * cv.height) / b.height;
    let best = -1,
      bd = 22 * 22;
    mapItems.forEach((o, k) => {
      const d = (o.x - x) ** 2 + (o.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    if (best >= 0) {
      Sound.ui();
      pickMap(best);
    }
  });
  $('mapSide').addEventListener('click', (e) => {
    if (e.target.closest('[data-gps-off]')) {
      clearGps();
      renderIsleMap();
      return;
    }
    const b = e.target.closest('[data-i]');
    if (b) {
      Sound.ui();
      pickMap(+b.dataset.i);
    }
  });
  $('mapBtn').addEventListener('click', () => {
    Sound.ui();
    renderIsleMap();
    show('isleMap');
  });
}
