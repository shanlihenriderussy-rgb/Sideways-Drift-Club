// ---------- interactions : l'objet le plus proche propose une action (E, ou toucher le bouton) ----------
import { game } from '../state.js';
import { Sound } from '../../audio/sound.js';
import { dlg, renderAdventure, talk, trackIndexOf } from '../adventure.js';
import { profile, saveProfile } from '../base.js';
import { setText } from '../hud.js';
import { rivalTalk, takePhoto } from './events.js';
import { castOf, fmtDist, isleData } from './world.js';
import { refreshWallet, toast } from '../menus.js';
import { resumeGame, show } from '../session.js';
import { clearTouch } from '../touch.js';
import { IsleLife } from '../../island/life.js';
import { Economy } from '../../progress/economy.js';
import { Story } from '../../progress/story.js';
import { TRACKS } from '../../sim/track.js';
import { $ } from '../../util/dom.js';

export function scanInteract() {
  const L = game.life,
    I = isleData,
    st = game.player;
  let best = null;
  const cand = (d, max, o) => {
    if (d < max && (!best || d / max < best.w)) best = Object.assign(o, { w: d / max });
  };
  const slow = st.speed < 7;
  for (const [id, hb] of Object.entries(I.hubs)) {
    const open = Story.chapterOpen(profile, Story.zoneIndex(id));
    cand(Math.hypot(st.x - hb.x, st.z - hb.z), 14, {
      kind: 'gate',
      id,
      text: `Entrer : ${TRACKS[trackIndexOf(id)].name}`,
      sub: open ? 'missions, exploration, histoire' : 'lieu fermé · avance dans l’aventure',
      off: !open,
    });
  }
  if (!L.duel && !L.race && !L.battle)
    for (const r of L.rivals)
      if (r.cool <= 0)
        cand(Math.hypot(st.x - r.A.x, st.z - r.A.z), 28, {
          kind: 'rival',
          r,
          text: `Défier ${r.c.name}`,
          sub: slow ? `${r.def.crew} · ${r.def.car.toUpperCase()}` : 'ralentis pour lui parler',
          off: !slow,
        });
  for (const n of L.spots.npcs) {
    const c = castOf(n.def.who);
    cand(Math.hypot(st.x - n.x, st.z - n.z), 11, {
      kind: 'npc',
      n,
      text: `Parler à ${c.name}`,
      sub: slow ? c.role : 'ralentis pour parler',
      off: !slow,
    });
  }
  for (const p of L.spots.photos) {
    const done = IsleLife.isleBag(profile).photo[p.def.id];
    cand(Math.hypot(st.x - p.x, st.z - p.z), 8, {
      kind: 'photo',
      p,
      text: done ? 'Reprendre la photo' : 'Prendre la photo',
      sub: st.speed > 2.5 ? 'arrête-toi dans le cercle' : p.def.name,
      off: st.speed > 2.5,
    });
  }
  setPrompt(best);
}
export function setPrompt(b) {
  if (game.life) game.life.near = b;
  const el = $('prompt');
  if (!b || game.phase !== 'play' || dlg) {
    if (!el.hidden) el.hidden = true;
    return;
  }
  const key = b.kind + b.text + b.sub + b.off;
  if (el.hidden || el.dataset.k !== key) {
    el.dataset.k = key;
    $('promptText').textContent = b.text;
    $('promptSub').textContent = b.sub;
    el.classList.toggle('off', !!b.off);
    el.setAttribute('aria-label', b.text + (b.sub ? ', ' + b.sub : ''));
    if (el.hidden) {
      el.hidden = false;
      Sound.ui();
    }
  }
}
export function interact() {
  const b = game.life && game.life.near;
  if (!b || game.phase !== 'play') return;
  if (b.off) {
    Sound.lost();
    return;
  }
  setPrompt(null);
  if (b.kind === 'gate') {
    game.phase = 'pause';
    clearTouch();
    Sound.suspend();
    game.advSel = Story.zoneIndex(b.id);
    renderAdventure();
    show('adventure');
  } else if (b.kind === 'rival') rivalTalk(b.r);
  else if (b.kind === 'npc') npcChat(b.n);
  else if (b.kind === 'photo') takePhoto(b.p);
}
// dialogue pendant le jeu : la voiture s'arrête le temps de parler
export function chat(lines, done, choices) {
  game.phase = 'pause';
  clearTouch();
  Sound.suspend();
  setPrompt(null);
  talk(lines, done, choices);
}

function npcChat(n) {
  const t = IsleLife.npcTalk(profile, n.def.id, Story);
  chat(
    t.lines,
    (act) => {
      const r = IsleLife.npcMet(profile, n.def.id);
      if (r) {
        saveProfile();
        refreshWallet();
        toast(`Rencontre : ${castOf(n.def.who).name} · +${Economy.fmt(r)}`, 'chal');
      }
      gpsAct(act);
      resumeGame();
    },
    t.choices.map((c) => ({ label: c.label, act: c.act })),
  );
}
// choix d'un habitant ou de la carte → destination du GPS
export function gpsAct(act) {
  const I = isleData,
    st = game.player,
    L = game.life;
  if (act === 'story') {
    if (Story.chapterDone(profile, Story.CHAPTERS.length - 1)) {
      toast('Le Tour est gagné : tous les lieux restent ouverts', 'chal');
      return;
    }
    const id = Story.CHAPTERS[Story.currentChapter(profile)].track,
      hb = I.hubs[id];
    setGps({ name: TRACKS[trackIndexOf(id)].name, x: hb.x, z: hb.z, arrive: 13 });
  } else if (act === 'daruma') {
    let k = -1,
      bd = Infinity;
    I.daruma.forEach((d, j) => {
      if (!game.world.daruma[j].visible) return;
      const dd = Math.hypot(d.x - st.x, d.z - st.z);
      if (dd < bd) {
        bd = dd;
        k = j;
      }
    });
    if (k < 0) toast('Tous les daruma dorés sont trouvés !', 'chal');
    else setGps({ name: 'Daruma doré', x: I.daruma[k].x, z: I.daruma[k].z, arrive: 2, daruma: k });
  } else if (act === 'rival') {
    let best = null,
      bd = Infinity;
    for (const r of L.rivals) {
      const d = Math.hypot(r.A.x - st.x, r.A.z - st.z);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    if (!best) toast('Aucun rival ne roule encore : avance dans l’aventure', 'lost');
    else {
      best.cool = 0;
      setGps({ name: best.c.name, get: () => [best.A.x, best.A.z], arrive: 30 });
    }
  } else if (act === 'activity') {
    const bag = IsleLife.isleBag(profile);
    let best = null,
      bd = Infinity;
    for (const a of L.spots.acts) {
      const n = IsleLife.starsOf(a.def, bag.best[a.def.id] || 0);
      const d = Math.hypot(a.x - st.x, a.z - st.z) + n * 3000;
      if (n < 3 && d < bd) {
        bd = d;
        best = a;
      }
    }
    if (!best) toast('Trois étoiles partout. Respect.', 'chal');
    else setGps({ name: best.def.name, x: best.x, z: best.z, arrive: 12 });
  }
}

// ---------- GPS : flèche, distance par la route, tracé sur la mini-carte ----------
export function setGps(g) {
  if (!game.life) return;
  game.life.gps = Object.assign({ route: null, t: 0, pts: [], ang: null, arrive: 16 }, g);
  const el = $('gps');
  el.hidden = false;
  el.classList.toggle('race', !!g.race);
  updateGps(true);
  Sound.ping();
  if (!g.race) toast(`GPS : ${g.name}`, 'apex');
}
export function clearGps() {
  if (!game.life) return;
  game.life.gps = null;
  $('gps').hidden = true;
}
export function updateGps(force) {
  const G = game.life && game.life.gps;
  if (!G) return;
  const I = isleData,
    st = game.player;
  if (G.get) {
    const p = G.get();
    G.x = p[0];
    G.z = p[1];
  }
  G.t -= 0.1;
  if (force || G.t <= 0) {
    G.t = 0.5;
    G.route = IsleLife.route(I, st.x, st.z, G.x, G.z);
    G.pts.length = 0;
    if (G.route) {
      let k = 0;
      IsleLife.routeWalk(I, G.route, null, (x, z) => {
        if (k++ % 6 === 0) G.pts.push(x, z);
      });
    }
    G.pts.push(G.x, G.z);
  }
  const straight = Math.hypot(G.x - st.x, G.z - st.z);
  if (!G.race && straight < G.arrive) {
    toast(`Arrivée : ${G.name}`, 'chal');
    Sound.ping();
    clearGps();
    return;
  }
  const ahead = G.route && straight > 45 ? IsleLife.routeWalk(I, G.route, 30) : null;
  const tx = ahead ? ahead[0] : G.x,
    tz = ahead ? ahead[1] : G.z;
  let a = ((Math.atan2(tz - st.z, tx - st.x) - st.heading) * 180) / Math.PI;
  if (G.ang == null) G.ang = a;
  else {
    let d = a - G.ang;
    d -= Math.round(d / 360) * 360;
    G.ang += d;
  }
  $('gpsArrow').style.transform = `rotate(${G.ang.toFixed(1)}deg)`;
  setText('gpsName', G.name);
  setText('gpsDist', fmtDist(G.route ? G.route.len : straight) + (G.race ? ' · course' : ''));
}

export function init() {
  $('prompt').addEventListener('click', () => interact());
}
