import { game } from './state.js';
import { Sound } from '../audio/sound.js';
import { isTouch, profile, saveProfile, store } from './base.js';
import { isle, leaveIsle } from './island/world.js';
import { refreshWallet, toast } from './menus.js';
import { loadTrack } from './scene.js';
import { announce, ensureAudio, popup, score, vibrate } from './score.js';
import { resumeGame, show, startRun } from './session.js';
import { gy, scene } from './stage.js';
import { clearTouch } from './touch.js';
import { Economy } from '../progress/economy.js';
import { Story } from '../progress/story.js';
import { TRACKS } from '../sim/track.js';
import { $ } from '../util/dom.js';

export let explore = null;
export let dlg = null;
export const trackIndexOf = (id) => TRACKS.findIndex((t) => t.id === id);
export const esc = (t) =>
  String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function advLabel() {
  if (game.adv.explore) return 'EXPLORATION';
  const m = Story.CHAPTERS[game.adv.ci].missions[game.adv.k];
  if (m.mode !== 'tandem') return 'MISSION';
  const lead = Story.CAST[m.brief[0][0]];
  return 'TANDEM · ' + (lead.name || 'LEADER').split(' ')[0].toUpperCase();
}

// dialogues : une ligne à la fois ; toucher, Entrée ou Espace pour continuer, Échap pour passer.
// choices (facultatif) : [{ label, act }] proposés après la dernière ligne ; done(act) reçoit le choix (le dernier = refus).
export function talk(lines, done, choices) {
  if (!lines || !lines.length) {
    if (done) done();
    return;
  }
  dlg = { lines, i: 0, done, choices: choices && choices.length ? choices : null };
  $('dialog').hidden = false;
  showLine();
  if (!isTouch) setTimeout(() => $('dlgNext').focus({ preventScroll: true }), 30);
}
function showLine() {
  const [who, text] = dlg.lines[dlg.i],
    c = Story.CAST[who] || Story.CAST.narr;
  const face = $('dlgFace');
  face.textContent = c.ini;
  face.style.background = c.col;
  face.classList.toggle('narr', who === 'narr');
  $('dlgName').textContent = c.name;
  $('dlgRole').textContent = who === 'narr' ? '' : c.role;
  $('dlgText').textContent = text;
  document.querySelector('.dlg-card').classList.toggle('narr', who === 'narr');
  const last = dlg.i === dlg.lines.length - 1,
    ask = last && dlg.choices;
  $('dlgNext').firstElementChild.textContent = last ? 'Continuer' : 'Suite';
  $('dlgFoot').hidden = !!ask;
  const ch = $('dlgChoices');
  ch.hidden = !ask;
  ch.innerHTML = ask
    ? dlg.choices
        .map(
          (c, k) =>
            `<button class="btn${k === 0 ? ' primary' : k === dlg.choices.length - 1 ? ' ghost' : ''}" data-choice="${k}"><i aria-hidden="true">${k + 1}</i><span>${esc(c.label)}</span></button>`,
        )
        .join('')
    : '';
  if (ask && !isTouch)
    setTimeout(() => {
      const b = ch.querySelector('button');
      if (b) b.focus({ preventScroll: true });
    }, 30);
  announce(
    (c.name ? c.name + ' : ' : '') + text + (ask ? '. Choix : ' + dlg.choices.map((x) => x.label).join(', ') : ''),
  );
}
function dlgNext(all, pick) {
  if (!dlg) return;
  Sound.ui();
  if (!all && dlg.i < dlg.lines.length - 1) {
    dlg.i++;
    showLine();
    return;
  }
  // une question attend sa réponse : passer saute jusqu'à elle, on ne la contourne pas
  if (dlg.choices && pick == null) {
    if (dlg.i !== dlg.lines.length - 1) {
      dlg.i = dlg.lines.length - 1;
      showLine();
    }
    return;
  }
  const done = dlg.done,
    act = dlg.choices ? dlg.choices[pick].act : undefined;
  dlg = null;
  $('dialog').hidden = true;
  $('dlgChoices').hidden = true;
  $('dlgFoot').hidden = false;
  if (done) done(act);
}

// carte de l'île : les six lieux dans l'ordre du Tour, en boucle autour du volcan
const MAPXY = {
  minato: [62, 62],
  shiohama: [150, 34],
  akane: [250, 52],
  kaigan: [266, 128],
  piton: [168, 146],
  yukimi: [74, 132],
};
export function openAdventure() {
  if (!Story.chapterOpen(profile, game.advSel)) game.advSel = Story.currentChapter(profile);
  renderAdventure();
  show('adventure');
  const first = !Story.ensure(profile).seen.prologue;
  if (first) {
    Story.ensure(profile).seen.prologue = true;
    saveProfile();
    talk([
      [
        'narr',
        'Le Tour de l’Île : six lieux, six chapitres. Touche un lieu ouvert sur la carte pour lire son histoire, jouer ses missions ou l’explorer librement.',
      ],
    ]);
  }
}
export function renderAdventure() {
  const C = Story.CHAPTERS;
  let svg =
    '<path class="isle" d="M34,96 C26,52 80,14 152,16 C232,14 302,36 300,96 C298,150 242,178 166,176 C92,176 42,150 34,96 Z"/>';
  svg +=
    '<path d="M156,104 l12,-20 l12,20 z" fill="var(--s4)" stroke="var(--hair-2)"/><text x="168" y="116" text-anchor="middle" font-size="7.5" fill="var(--fg-3)" letter-spacing=".1em">VOLCAN</text>';
  C.forEach((c, ci) => {
    const a = MAPXY[c.track],
      b = MAPXY[C[(ci + 1) % C.length].track];
    if (ci < C.length - 1)
      svg += `<path class="route${Story.chapterDone(profile, ci) ? ' done' : ''}" d="M${a[0]},${a[1]} Q${(a[0] + b[0]) / 2 + (168 - (a[0] + b[0]) / 2) * -0.15},${(a[1] + b[1]) / 2 + (96 - (a[1] + b[1]) / 2) * -0.15} ${b[0]},${b[1]}"/>`;
  });
  C.forEach((c, ci) => {
    const [x, y] = MAPXY[c.track],
      open = Story.chapterOpen(profile, ci),
      done = Story.chapterDone(profile, ci);
    const name = TRACKS[trackIndexOf(c.track)].name;
    svg +=
      `<g class="node${open ? ' open' : ' locked'}${done ? ' done' : ''}${ci === game.advSel ? ' sel' : ''}" data-ci="${ci}" tabindex="0" role="button" aria-pressed="${ci === game.advSel}" aria-label="Chapitre ${ci + 1}, ${esc(name)}${done ? ', terminé' : open ? '' : ', fermé'}">` +
      `<circle cx="${x}" cy="${y}" r="11"/><text class="n" x="${x}" y="${y}">${done ? '✓' : ci + 1}</text><text x="${x}" y="${y + 22}">${c.track[0].toUpperCase() + c.track.slice(1)}</text></g>`;
  });
  $('advMap').innerHTML = svg;
  const pr = Story.progress(profile);
  $('advProg').innerHTML =
    `<span>Missions <b>${pr.missions} / ${pr.total}</b></span><span>Trouvailles <b>${pr.found} / ${pr.foundTotal}</b></span><span>Solde <b>${Economy.fmt(profile.money)}</b></span>`;

  const ci = game.advSel,
    ch = C[ci],
    open = Story.chapterOpen(profile, ci),
    nx = Story.nextMission(profile, ci);
  const tname = TRACKS[trackIndexOf(ch.track)].name;
  let h = `<div class="adv-ch"><div class="label">Chapitre ${ci + 1} · ${esc(tname)}</div><h3>${esc(ch.title)}<span class="jp">${ch.jp}</span></h3><p>${open ? esc(ch.pitch) : 'Termine le chapitre précédent pour ouvrir ce lieu.'}</p></div>`;
  h +=
    '<ol class="adv-ms">' +
    ch.missions
      .map((m, k) => {
        const done = Story.missionDone(profile, m.id),
          can = Story.missionOpen(profile, ci, k);
        const cls = done ? 'done' : k === nx ? 'next' : can ? '' : 'locked';
        return `<li class="${cls}"><span class="ck" aria-hidden="true">${done ? '✓' : ''}</span><div><b><span class="mode">${m.mode === 'tandem' ? 'Tandem' : 'Run'}</span>${esc(m.title)}</b><small>${esc(Story.goalText(m.goal))}</small></div><span class="rw">${done ? 'Fait' : Economy.fmt(m.reward)}</span></li>`;
      })
      .join('') +
    '</ol>';
  if (open) {
    h += '<div class="adv-acts">';
    if (nx >= 0)
      h += `<button class="btn primary" data-play="${nx}"><span>Jouer : ${esc(ch.missions[nx].title)}</span></button>`;
    else h += '<button class="btn" data-play="2"><span>Rejouer la finale du chapitre</span></button>';
    h += `<button class="btn" data-explore><span>Explorer le lieu</span></button><button class="btn ghost" data-story><span>Revoir l’histoire</span></button></div>`;
    if (isle)
      h +=
        '<p class="sub" style="margin:0 0 10px">Tu es sur l’île : « Retour » te remet sur la route, là où tu t’es arrêté.</p>';
    const z = Story.zoneProgress(profile, ch.track),
      Z = Story.ZONES[ch.track];
    h += `<div class="adv-explore">Exploration libre : <b>archives ${z.arch} / 5</b> · <b>défis de rue ${z.street} / ${Story.STREET.length}</b> · <b>rencontre ${z.npc} / 1</b>. Les archives flottent au bord de la route, les bornes lancent un défi au passage.</div>`;
    h +=
      `<details class="adv-notes"><summary>Carnet du club · ${z.arch} / 5</summary><ol>` +
      Z.archives
        .map((a, k) =>
          Story.ensure(profile).arch[ch.track + ':' + k]
            ? `<li><b>${esc(a[0])}</b> — ${esc(a[1])}</li>`
            : '<li class="miss">Archive à retrouver sur ce lieu.</li>',
        )
        .join('') +
      '</ol></details>';
  }
  $('advPanel').innerHTML = h;
}
function pickNode(e) {
  const g = e.target.closest('.node');
  if (!g) return;
  const ci = +g.dataset.ci;
  if (!Story.chapterOpen(profile, ci)) {
    toast('Lieu fermé : termine le chapitre précédent.', 'lost');
    return;
  }
  game.advSel = ci;
  Sound.ui();
  renderAdventure();
  const n = $('advMap').querySelector(`[data-ci="${ci}"]`);
  if (n && e.type === 'keydown') n.focus();
}
// la scène derrière les dialogues montre déjà le lieu de la mission
function goTrack(id) {
  const ti = trackIndexOf(id);
  if (game.track.def.id !== id) {
    game.trackIdx = ti;
    loadTrack(ti);
  }
  game.trackIdx = ti;
}
export function playMission(ci, k) {
  if (!Story.missionOpen(profile, ci, k)) return;
  const ch = Story.CHAPTERS[ci],
    m = ch.missions[k];
  ensureAudio();
  Sound.ui();
  leaveIsle();
  game.adv = { ci, k };
  game.mode = m.mode;
  show(null);
  game.phase = 'menu';
  goTrack(ch.track);
  const go = () => talk(m.brief, startRun);
  const seen = Story.ensure(profile).seen;
  if (!seen[ch.id]) {
    seen[ch.id] = true;
    saveProfile();
    talk(ch.intro, go);
  } else go();
}
function exploreZone(ci) {
  if (!Story.chapterOpen(profile, ci)) return;
  const ch = Story.CHAPTERS[ci];
  ensureAudio();
  Sound.ui();
  leaveIsle();
  game.adv = { explore: ch.track, ci };
  game.mode = 'free';
  show(null);
  goTrack(ch.track);
  startRun();
}
export function leaveAdventureRun() {
  clearExplore();
  game.adv = null;
  game.advNext = null;
  game.mode = store.get('mode', 'run');
  $('menuBtn').firstElementChild.textContent = 'Menu';
  $('againBtn').firstElementChild.textContent = 'Rejouer';
}

// exploration : archives (daruma flottants), bornes de défi de rue, rencontre (colonne de lumière)
export function buildExplore() {
  const id = game.adv.explore,
    Z = Story.ZONES[id],
    S = Story.ensure(profile),
    N = game.track.count;
  const group = new THREE.Group(),
    items = [],
    mats = [],
    geos = [];
  const mat = (c, add) => {
    const m = new THREE.MeshBasicMaterial({
      color: c,
      transparent: !!add,
      opacity: add ? 0.35 : 1,
      blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !add,
    });
    mats.push(m);
    return m;
  };
  const geo = (g) => {
    geos.push(g);
    return g;
  };
  const at = (f, lat) => {
    const i = Math.round(f * N) % N;
    return { i, x: game.track.px[i] - game.track.tz[i] * lat, z: game.track.pz[i] + game.track.tx[i] * lat };
  };
  const body = geo(new THREE.SphereGeometry(0.55, 14, 10)),
    face = geo(new THREE.CircleGeometry(0.3, 14)),
    red = mat(0xd8262d),
    white = mat(0xf4f1e6);
  Story.ARCHIVE_AT.forEach((f, k) => {
    if (S.arch[id + ':' + k]) return;
    const p = at(f, (k % 2 ? 1 : -1) * (game.track.half - 2.2));
    const g = new THREE.Group();
    const b = new THREE.Mesh(body, red);
    b.scale.set(1, 1.15, 1);
    g.add(b);
    const fc = new THREE.Mesh(face, white);
    fc.position.set(0, 0.08, 0.5);
    g.add(fc);
    g.position.set(p.x, gy(p.x, p.z) + 1.2, p.z);
    group.add(g);
    items.push({ kind: 'arch', k, ...p, r: 2.6, obj: g });
  });
  const postG = geo(new THREE.CylinderGeometry(0.14, 0.14, 4.2, 8)),
    barG = geo(new THREE.BoxGeometry(0.3, 0.5, game.track.def.width + 1.4)),
    blue = mat(0x7b8cff),
    glow = mat(0x7b8cff, true);
  Story.STREET.forEach((s, k) => {
    if (S.street[id + ':' + k]) return;
    const p = at(s.at, 0),
      g = new THREE.Group(),
      y = gy(p.x, p.z);
    for (const sd of [-1, 1]) {
      const q = new THREE.Mesh(postG, blue);
      q.position.set(0, 2.1, sd * (game.track.half + 0.7));
      g.add(q);
    }
    const bar = new THREE.Mesh(barG, glow);
    bar.position.y = 4.1;
    g.add(bar);
    g.position.set(p.x, y, p.z);
    g.rotation.y = -game.track.heading[p.i];
    group.add(g);
    items.push({ kind: 'street', k, ...p, obj: g, def: Story.streetFor(game.adv.ci, k) });
  });
  if (!S.npc[id + ':0']) {
    const n = Z.npc,
      p = at(n.at, n.side * (game.track.half - 3)),
      c = Story.CAST[n.who];
    const beam = new THREE.Mesh(
      geo(new THREE.CylinderGeometry(1.1, 1.1, 9, 16, 1, true)),
      mat(new THREE.Color(c.col).getHex(), true),
    );
    beam.position.set(p.x, gy(p.x, p.z) + 4.5, p.z);
    group.add(beam);
    items.push({ kind: 'npc', k: 0, ...p, r: 3.6, obj: beam, npc: n });
  }
  scene.add(group);
  explore = { id, group, items, mats, geos, active: null, t: 0 };
  renderExploreHud();
}
export function clearExplore() {
  if (!explore) return;
  scene.remove(explore.group);
  for (const m of explore.mats) m.dispose();
  for (const g of explore.geos) g.dispose();
  explore = null;
}
function renderExploreHud() {
  if (!explore || explore.active) return;
  const z = Story.zoneProgress(profile, explore.id);
  const el = $('hudGoal');
  el.className = 'hud-goal';
  el.textContent = `Exploration · archives ${z.arch}/5 · défis de rue ${z.street}/${Story.STREET.length} · rencontre ${z.npc}/1`;
}
export function updateExplore(dt) {
  const st = game.player,
    N = game.track.count,
    E = explore;
  E.t += dt;
  for (const it of E.items) {
    if (it.taken) continue;
    if (it.kind === 'arch') {
      it.obj.rotation.y += dt * 1.6;
      it.obj.position.y += Math.sin(E.t * 2 + it.k) * dt * 0.25;
    }
    let hit;
    if (it.kind === 'street') {
      let d = Math.abs(st.idx - it.i);
      d = Math.min(d, N - d);
      hit = d <= 2 && !E.active;
    } else hit = Math.hypot(st.x - it.x, st.z - it.z) < it.r;
    if (!hit) continue;
    if (it.kind === 'arch') {
      it.taken = true;
      it.obj.visible = false;
      const r = Story.collect(profile, E.id, 'arch', it.k);
      if (r) {
        saveProfile();
        refreshWallet();
        Sound.clip();
        vibrate(30);
        popup(`Archive +${Economy.fmt(r.reward)}`, 'clip');
        toast(`Archive retrouvée : ${Story.ZONES[E.id].archives[it.k][0]} (à lire dans le carnet)`, 'chal');
      }
      renderExploreHud();
    } else if (it.kind === 'npc') {
      it.taken = true;
      it.obj.visible = false;
      meet(it.npc);
    } else {
      E.active = { it, t: it.def.window, prog: 0 };
      popup('Défi de rue !', 'apex');
      Sound.clip();
    }
  }
  const a = E.active;
  if (a) {
    const d = a.it.def,
      el = $('hudGoal');
    a.t -= dt;
    if (d.type === 'hold') {
      if ((Math.abs(st.slip) * 180) / Math.PI >= d.angle && st.speed > 8) a.prog += dt;
    } else a.prog = Math.max(a.prog, score.combo);
    const need = d.type === 'hold' ? d.secs : d.pts;
    el.className = 'hud-goal street';
    el.textContent =
      d.type === 'hold'
        ? `Défi de rue · tiens ${d.angle}° : ${a.prog.toFixed(1)} / ${d.secs} s · reste ${Math.ceil(a.t)} s`
        : `Défi de rue · combo de ${d.pts.toLocaleString('fr-FR')} pts : ${Math.round(a.prog).toLocaleString('fr-FR')} · reste ${Math.ceil(a.t)} s`;
    if (a.prog >= need) {
      a.it.taken = true;
      a.it.obj.visible = false;
      E.active = null;
      const r = Story.collect(profile, E.id, 'street', a.it.k);
      if (r) {
        saveProfile();
        refreshWallet();
        Sound.bank(true);
        toast(`Défi de rue réussi · +${Economy.fmt(r.reward)}`, 'chal');
      }
      renderExploreHud();
    } else if (a.t <= 0) {
      E.active = null;
      popup('Défi raté · repasse sous la borne', 'lost');
      renderExploreHud();
    }
  }
}
// rencontre : la partie s'arrête le temps du dialogue
function meet(n) {
  game.phase = 'pause';
  clearTouch();
  Sound.suspend();
  talk(n.lines, () => {
    const r = Story.collect(profile, explore ? explore.id : '', 'npc', 0);
    if (r) {
      saveProfile();
      refreshWallet();
      toast(`${r.label} · +${Economy.fmt(r.reward)}`, 'chal');
    }
    renderExploreHud();
    resumeGame();
  });
}

export function init() {
  game.advSel = Story.currentChapter(profile);
  $('dialog').addEventListener('click', (e) => {
    const c = e.target.closest('[data-choice]');
    if (c) {
      dlgNext(false, +c.dataset.choice);
      return;
    }
    if (dlg && dlg.choices && dlg.i === dlg.lines.length - 1) return; // on attend un choix
    dlgNext(!!e.target.closest('#dlgSkip'));
  });
  addEventListener(
    'keydown',
    (e) => {
      if (!dlg) return;
      const asking = dlg.choices && dlg.i === dlg.lines.length - 1;
      if (asking && /^[1-9]$/.test(e.key) && +e.key <= dlg.choices.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        dlgNext(false, +e.key - 1);
        return;
      }
      if (
        asking &&
        (e.key === 'Enter' || e.key === ' ') &&
        document.activeElement &&
        document.activeElement.dataset.choice != null
      ) {
        e.stopImmediatePropagation();
        return;
      } // le bouton choisi reçoit son clic
      if (asking && e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        dlgNext(false, dlg.choices.length - 1);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) dlgNext(false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        dlgNext(true);
      }
    },
    true,
  );
  $('advMap').addEventListener('click', pickNode);
  $('advMap').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pickNode(e);
    }
  });
  $('advPanel').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const ch = Story.CHAPTERS[game.advSel];
    if (b.dataset.play != null) playMission(game.advSel, +b.dataset.play);
    else if (b.dataset.explore != null) exploreZone(game.advSel);
    else if (b.dataset.story != null) {
      Sound.ui();
      talk(Story.chapterDone(profile, game.advSel) ? [...ch.intro, ...ch.outro] : ch.intro);
    }
  });
}
