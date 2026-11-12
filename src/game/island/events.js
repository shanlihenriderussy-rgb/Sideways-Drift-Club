// ---------- duels de rue contre les rivaux ----------
import { game } from '../state.js';
import { Sound } from '../../audio/sound.js';
import { isTouch, profile, saveProfile, settings } from '../base.js';
import { fmtTime, setBar } from '../hud.js';
import { chat, clearGps, setGps } from './interact.js';
import { fmtDist, isle, isleData, isleQ, nodeName, placePlayer, starsTxt } from './world.js';
import { refreshWallet, toast } from '../menus.js';
import { mp } from '../multiplayer.js';
import { announce, bank, popup, score, vibrate } from '../score.js';
import { countdown, resumeGame, show } from '../session.js';
import { camPos, gy } from '../stage.js';
import { IsleLife } from '../../island/life.js';
import { ISLE, isleFound } from '../../island/map.js';
import { Economy } from '../../progress/economy.js';
import { $ } from '../../util/dom.js';
import { clamp } from '../../util/math.js';

export function rivalTalk(r) {
  const I = isleData,
    wins = IsleLife.isleBag(profile).rivals[r.def.id] || 0;
  const reward = wins ? Math.round(r.def.reward / 5 / 100) * 100 : r.def.reward;
  let near = null,
    nd = Infinity;
  for (const [k, [x, z]] of Object.entries(I.def.nodes)) {
    const d = Math.hypot(x - r.A.x, z - r.A.z);
    if (d < nd) {
      nd = d;
      near = k;
    }
  }
  const tgt = IsleLife.tougeTarget(I, r.A.x, r.A.z, nd < 60 ? near : null);
  const lines = r.def.hello.slice();
  if (wins)
    lines.push([
      'narr',
      `${r.c.name} : ${wins} défaite${wins > 1 ? 's' : ''} contre toi. Revanche payée ${Economy.fmt(reward)}.`,
    ]);
  chat(
    lines,
    (act) => {
      if (act === 'race' && tgt) startDuel(r, 'race', tgt);
      else if (act === 'tandem') startDuel(r, 'tandem');
      else {
        r.cool = 25;
        resumeGame();
      }
    },
    [
      ...(tgt
        ? [{ label: `Touge → ${nodeName(tgt.node)} · ${fmtDist(tgt.route.len)} · ${Economy.fmt(reward)}`, act: 'race' }]
        : []),
      { label: `Tandem de rue · 45 s · ${Economy.fmt(reward)}`, act: 'tandem' },
      { label: 'Pas maintenant', act: 'bye' },
    ],
  );
}
export function startDuel(r, kind, tgt) {
  const I = isleData,
    A = r.A,
    L = game.life;
  Object.assign(A, { hold: true, arrived: false, route: null, passS: null, speed: 0, beta: 0, waitT: 0 });
  if (kind === 'race') {
    // côte à côte, tournés vers la destination
    const route = IsleLife.route(I, A.x, A.z, tgt.x, tgt.z),
      sg = route.segs[0],
      dir = sg.i1 >= sg.i0 ? 1 : -1,
      rr = I.roads[sg.e];
    A.e = sg.e;
    A.dir = dir;
    A.s = (dir > 0 ? sg.i0 : rr.count - 1 - sg.i0) * rr.step;
    A.route = IsleLife.agentPlan(I, route);
    A.lane = A.laneT = 2.1;
  } else {
    // le rival mène, tu pars 14 m derrière lui
    A.s = Math.max(16, Math.min(I.roads[A.e].length - 30, A.s));
    A.lane = A.laneT = 0;
    A.k = r.def.skill * 0.86;
  }
  const p = IsleLife.roadPose(I, A.e, A.dir, A.s, A.lane, {});
  A.x = p.x;
  A.z = p.z;
  A.heading = Math.atan2(p.tz, p.tx);
  const q =
    kind === 'race'
      ? IsleLife.roadPose(I, A.e, A.dir, A.s, -2.1, {})
      : IsleLife.roadPose(I, A.e, A.dir, A.s - 14, 0, {});
  placePlayer(q.x, q.z, Math.atan2(q.tz, q.tx), 0);
  L.duel = {
    r,
    kind,
    tgt,
    t: 0,
    state: 'count',
    near: 0,
    both: 0,
    far: 0,
    dur: 45,
    pRem: tgt ? tgt.route.len : 0,
    rRem: tgt ? tgt.route.len : 0,
    chkT: 0,
  };
  if (kind === 'race') setGps({ name: nodeName(tgt.node), x: tgt.x, z: tgt.z, race: true });
  camPos.set(
    game.player.x - Math.cos(game.player.heading) * 8,
    gy(game.player.x, game.player.z) + 3,
    game.player.z - Math.sin(game.player.heading) * 8,
  );
  show(null);
  game.phase = 'count';
  countdown();
  announce(
    kind === 'race'
      ? `Touge contre ${r.c.name} jusqu’à ${nodeName(tgt.node)}.`
      : `Tandem de rue derrière ${r.c.name} : reste collé pendant 45 secondes.`,
  );
}
export function duelTick(dt) {
  const D = game.life.duel,
    A = D.r.A,
    st = game.player,
    I = isleData;
  if (D.state === 'count') {
    if (game.phase === 'play') {
      D.state = 'run';
      A.hold = false;
      A.laneT = D.kind === 'race' ? 1.2 : 0;
    }
    return;
  }
  if (game.phase !== 'play') return;
  D.t += dt;
  if (D.kind === 'race') {
    D.chkT -= dt;
    if (D.chkT <= 0) {
      D.chkT = 0.3;
      const rp = IsleLife.route(I, st.x, st.z, D.tgt.x, D.tgt.z),
        rr = A.arrived ? null : IsleLife.route(I, A.x, A.z, D.tgt.x, D.tgt.z);
      if (rp) D.pRem = rp.len;
      D.rRem = A.arrived ? 0 : rr ? rr.len : D.rRem;
      const gap = D.pRem - D.rRem; // élastique léger : le rival ne s'envole pas, ne t'attend pas non plus
      A.k = D.r.def.skill * (gap > 160 ? 0.9 : gap < -120 ? 1.06 : 1);
    }
    if (Math.hypot(st.x - D.tgt.x, st.z - D.tgt.z) < 18) {
      endDuel(true);
      return;
    }
    if (A.arrived || D.t > 300) {
      endDuel(false, A.arrived ? `${D.r.c.name} arrive le premier.` : 'Trop long : le rival est rentré.');
      return;
    }
  } else {
    const d = Math.hypot(st.x - A.x, st.z - A.z),
      ang = (Math.abs(st.slip) * 180) / Math.PI;
    if (d < 15) {
      D.near += dt;
      if (ang > 12 && Math.abs(A.beta) > 0.2) D.both += dt;
    }
    D.far = d > 110 ? D.far + dt : Math.max(0, D.far - dt);
    setBar('tandemFill', clamp(1 - (d - 3) / 22, 0, 1));
    if (D.far > 4) {
      endDuel(false, 'Distancé : le rival a disparu dans les virages.');
      return;
    }
    if (D.t >= D.dur) endDuel(tandemPct(D) >= 50);
  }
}
const tandemPct = (D) => Math.round(Math.min(1, (D.near + D.both * 0.5) / D.dur) * 100);
function endDuel(win, why) {
  const D = game.life.duel,
    r = D.r,
    A = r.A;
  game.life.duel = null;
  r.cool = 40;
  Object.assign(A, { route: null, arrived: false, hold: false, k: r.def.skill, laneT: 0 });
  if (D.kind === 'race') clearGps();
  let amount = 0;
  if (win) {
    amount = IsleLife.rivalWin(profile, r.def.id, D.kind);
    saveProfile();
    refreshWallet();
    game.life.stats.rivals++;
    Sound.bank(true);
  } else Sound.lost();
  const lines = (win ? r.def.win : r.def.lose).slice();
  if (D.kind === 'tandem')
    lines.unshift([
      'narr',
      `Tandem : ${tandemPct(D)} % (il fallait 50 %)${D.both > 1 ? ` · ${Math.round(D.both)} s de glisse à deux` : ''}.`,
    ]);
  if (why) lines.unshift(['narr', why]);
  chat(lines, () => {
    if (amount) toast(`Victoire contre ${r.c.name} · +${Economy.fmt(amount)}`, 'chal');
    resumeGame();
  });
}

// ---------- belvédères, radars, zones de glisse ----------
export function takePhoto(p) {
  const f = $('flash');
  f.hidden = true;
  void f.offsetWidth;
  f.hidden = settings.reduce;
  setTimeout(() => {
    f.hidden = true;
  }, 650);
  Sound.shutter();
  vibrate(20);
  const r = IsleLife.photoTaken(profile, p.def.id);
  if (r) {
    saveProfile();
    refreshWallet();
    game.life.stats.photos++;
    toast(`Lou : « ${p.def.line} » · +${Economy.fmt(r)}`, 'chal');
  } else toast(`Belle photo : ${p.def.name}`, 'apex');
}
export function actsTick(dt) {
  const L = game.life,
    st = game.player,
    kmh = st.speed * 3.6;
  for (const a of L.spots.acts) {
    if (a.def.type !== 'radar') continue;
    const d = Math.hypot(st.x - a.x, st.z - a.z),
      id = a.def.id;
    if (d < 9) L.radar[id] = Math.max(L.radar[id] || 0, kmh);
    else if (L.radar[id] != null && d > 16) {
      const v = L.radar[id];
      delete L.radar[id];
      if (v > 40 && game.phase === 'play') radarFlash(a.def, v);
    }
  }
  if (!L.zone && !L.duel && !L.race && game.phase === 'play') {
    for (const a of L.spots.acts) {
      if (a.def.type !== 'zone' || Math.hypot(st.x - a.x, st.z - a.z) > 9) continue;
      if (st.vx * a.tx + st.vz * a.tz < 4) continue; // dans le bon sens, lancé
      L.zone = { a, base: score.total + score.combo, t: 0, offT: 0 };
      const best = IsleLife.isleBag(profile).best[a.def.id] || 0;
      popup('Zone de glisse', 'apex');
      Sound.ping();
      toast(
        `${a.def.name} : glisse jusqu’à l’arche d’arrivée${best ? ` · record ${best.toLocaleString('fr-FR')}` : ''}`,
        'apex',
      );
      break;
    }
  }
  const Z = L.zone;
  if (Z) {
    Z.t += dt;
    Z.offT = isleQ.edge !== Z.a.def.e || isleQ.d > isleData.half + 4 ? Z.offT + dt : 0;
    if (Z.offT > 3 || Z.t > 240) {
      L.zone = null;
      popup('Zone abandonnée', 'lost');
      return;
    }
    if (Math.hypot(st.x - Z.a.x1, st.z - Z.a.z1) < 11) {
      bank();
      const v = Math.max(0, Math.round(score.total - Z.base)),
        r = IsleLife.recordActivity(profile, Z.a.def.id, v);
      L.zone = null;
      popup(`${Z.a.def.name} · ${v.toLocaleString('fr-FR')} ${starsTxt(r.stars)}`, r.stars ? 'clip' : 'apex');
      if (r.reward) {
        saveProfile();
        refreshWallet();
        L.stats.stars += r.stars - r.prev;
        toast(`${Z.a.def.name} · ${starsTxt(r.stars)} · +${Economy.fmt(r.reward)}`, 'chal');
        Sound.cash();
      } else if (r.record) {
        saveProfile();
        toast(`${Z.a.def.name} : record personnel`, 'apex');
      } else
        toast(`${Z.a.def.name} : ${v.toLocaleString('fr-FR')} pts (record ${r.best.toLocaleString('fr-FR')})`, 'apex');
    }
  }
}
function radarFlash(def, v) {
  const r = IsleLife.recordActivity(profile, def.id, Math.round(v));
  const f = $('flash');
  if (!settings.reduce) {
    f.hidden = true;
    f.className = 'soft';
    void f.offsetWidth;
    f.hidden = false;
    setTimeout(() => {
      f.hidden = true;
      f.className = '';
    }, 650);
  }
  Sound.shutter();
  popup(`Radar ${Math.round(v)} km/h ${starsTxt(r.stars)}`, r.stars ? 'clip' : 'apex');
  if (r.reward) {
    saveProfile();
    refreshWallet();
    game.life.stats.stars += r.stars - r.prev;
    toast(`${def.name} · ${starsTxt(r.stars)} · +${Economy.fmt(r.reward)}`, 'chal');
    Sound.cash();
  } else if (r.record) {
    saveProfile();
    toast(`${def.name} : record personnel, ${Math.round(v)} km/h`, 'apex');
  }
}

// bandeau d'objectif de l'île : duel, zone, course ou battle en cours, sinon l'avancement
export function renderIsleGoal() {
  const L = game.life,
    el = $('hudGoal');
  if (!el || !isle) return;
  let t,
    cls = 'hud-goal';
  if (L && L.duel) {
    const D = L.duel,
      n = D.r.c.name;
    cls += ' street';
    if (D.state === 'count')
      t =
        D.kind === 'race'
          ? `Touge contre ${n} · jusqu’à ${nodeName(D.tgt.node)}`
          : `Tandem de rue · colle ${n} pendant 45 s`;
    else if (D.kind === 'race') {
      const g = Math.round(D.rRem - D.pRem);
      t = `Touge · ${n} · ${fmtDist(D.pRem)} · ${g >= 0 ? `devant de ${Math.abs(g)} m` : `derrière de ${Math.abs(g)} m`}`;
    } else t = `Tandem · ${n} · ${tandemPct(D)} % / 50 % · ${Math.max(0, Math.ceil(D.dur - D.t))} s`;
  } else if (L && L.zone) {
    const Z = L.zone,
      v = Math.max(0, Math.round(score.total + score.combo - Z.base)),
      next = Z.a.def.stars.find((s) => s > v);
    cls += ' street';
    t = `Zone · ${Z.a.def.name} · ${v.toLocaleString('fr-FR')} pts${next ? ` · ★ à ${next.toLocaleString('fr-FR')}` : ' · ★★★'}`;
  } else if (L && L.race) {
    const R = L.race;
    cls += ' street';
    t =
      R.state === 'count'
        ? `Course → ${R.name}`
        : `Course → ${R.name} · ${fmtTime(R.t)} · arrivés ${R.results.size} / ${mp ? mp.S.peers.size : 1}`;
  } else if (L && L.battle) {
    const B = L.battle;
    cls += ' street';
    t = `Battle de drift · ${Math.round(score.total + score.combo - B.base).toLocaleString('fr-FR')} pts · ${Math.max(0, Math.ceil(B.dur - B.t))} s`;
  } else {
    const bag = IsleLife.isleBag(profile),
      stars = IsleLife.ACTIVITIES.reduce((a, d) => a + IsleLife.starsOf(d, bag.best[d.id] || 0), 0);
    t = `Daruma ${isleFound(profile)}/${ISLE.daruma.length} · ★ ${stars}/${IsleLife.ACTIVITIES.length * 3}${isTouch ? '' : ' · M : carte'}`;
  }
  if (el.className !== cls) el.className = cls;
  if (el.textContent !== t) el.textContent = t;
}

// mini-carte de l'île entière : routes, portes, GPS, daruma restants, rivaux, autres joueurs, voiture
let isleMM = null;
export function drawIsleMinimapBase() {
  const I = isleData,
    c = document.createElement('canvas');
  c.width = c.height = 208;
  const g = c.getContext('2d'),
    { cx, cz, rx, rz } = I.def.shape;
  const s = 196 / (rx * 2.1),
    ox = 104 - cx * s,
    oz = 104 - cz * s;
  const T = (x, z) => [ox + x * s, oz + z * s];
  g.fillStyle = 'rgba(29,79,99,.55)';
  g.beginPath();
  g.ellipse(104, 104, 102, 102, 0, 0, 7);
  g.fill();
  g.fillStyle = 'rgba(79,107,50,.75)';
  g.beginPath();
  g.ellipse(...T(cx, cz), rx * s, rz * s, 0, 0, 7);
  g.fill();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (const r of I.roads) {
    g.beginPath();
    for (let i = 0; i < r.count; i += 4) {
      const [x, y] = T(r.px[i], r.pz[i]);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    const [ex, ey] = T(r.px[r.count - 1], r.pz[r.count - 1]);
    g.lineTo(ex, ey);
    g.strokeStyle = 'rgba(0,0,0,.55)';
    g.lineWidth = 4.5;
    g.stroke();
    g.strokeStyle = 'rgba(243,239,228,.9)';
    g.lineWidth = 2.2;
    g.stroke();
  }
  for (const hb of Object.values(I.hubs)) {
    const [x, y] = T(hb.x, hb.z);
    g.fillStyle = '#f7d154';
    g.fillRect(x - 4, y - 4, 8, 8);
  }
  isleMM = { c, T };
}
export function drawIsleMinimap(g) {
  const T = isleMM.T,
    L = game.life;
  g.drawImage(isleMM.c, 0, 0);
  if (L && L.gps && L.gps.pts.length > 2) {
    const P = L.gps.pts;
    g.beginPath();
    g.moveTo(...T(game.player.x, game.player.z));
    for (let k = 0; k < P.length; k += 2) g.lineTo(...T(P[k], P[k + 1]));
    g.strokeStyle = L.gps.race ? '#f7d154' : '#7b8cff';
    g.lineWidth = 3;
    g.stroke();
    const [gx, gz] = T(L.gps.x, L.gps.z);
    g.fillStyle = g.strokeStyle;
    g.beginPath();
    g.arc(gx, gz, 4, 0, 7);
    g.fill();
  }
  const found = (profile.isle && profile.isle.found) || {};
  g.fillStyle = '#ffb020';
  isleData.daruma.forEach((d, k) => {
    if (found[k]) return;
    const [x, y] = T(d.x, d.z);
    g.beginPath();
    g.arc(x, y, 2.2, 0, 7);
    g.fill();
  });
  if (L) {
    g.fillStyle = 'rgba(255,255,255,.55)';
    for (const A of L.T.agents) {
      const [x, y] = T(A.x, A.z);
      g.fillRect(x - 1, y - 1, 2, 2);
    }
    for (const r of L.rivals) {
      const [x, y] = T(r.A.x, r.A.z);
      g.fillStyle = '#000';
      g.beginPath();
      g.arc(x, y, 4.2, 0, 7);
      g.fill();
      g.fillStyle = r.c.col;
      g.beginPath();
      g.arc(x, y, 3, 0, 7);
      g.fill();
    }
  }
  if (mp)
    for (const R of mp.remotes.values())
      if (R.shown) {
        const [x, y] = T(R.view.x, R.view.z);
        g.fillStyle = '#000';
        g.beginPath();
        g.arc(x, y, 5, 0, 7);
        g.fill();
        g.fillStyle = R.color;
        g.beginPath();
        g.arc(x, y, 3.6, 0, 7);
        g.fill();
      }
  const [x, y] = T(game.player.x, game.player.z),
    h = game.player.heading;
  g.save();
  g.translate(x, y);
  g.rotate(h);
  g.fillStyle = '#000';
  g.beginPath();
  g.moveTo(9, 0);
  g.lineTo(-6, 6);
  g.lineTo(-6, -6);
  g.closePath();
  g.fill();
  g.fillStyle = '#ff3d3d';
  g.beginPath();
  g.moveTo(7, 0);
  g.lineTo(-4, 4.5);
  g.lineTo(-4, -4.5);
  g.closePath();
  g.fill();
  g.restore();
}
