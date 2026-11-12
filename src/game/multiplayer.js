// ---------- multijoueur (net.js) : session, voitures des autres, émotes, course et battle de groupe ----------
// mp : null | { S : session, remotes : id → { name, kind, cfg, color, interp, model, tag, view, shown, emote, emoteT }, internet, offer, answer }
import { game } from './state.js';
import { Sound } from '../audio/sound.js';
import { dlg, esc } from './adventure.js';
import { profile, saveProfile, store } from './base.js';
import { carFx } from './camera.js';
import { fmtTime } from './hud.js';
import { input } from './input.js';
import { chat, clearGps, interact, setGps } from './island/interact.js';
import { closeIsleMap, openIsleMap } from './island/map.js';
import { enterIsland, envOn, isle, isleData, nodeName, placePlayer } from './island/world.js';
import { refreshWallet, toast } from './menus.js';
import { lookOf } from './scene.js';
import { bank, ensureAudio, popup, score } from './score.js';
import { countdown, resumeGame, screenId, show } from './session.js';
import { camera, scene } from './stage.js';
import { fitTag, makeTag } from '../island/actors.js';
import { IsleLife } from '../island/life.js';
import { Net } from '../net/index.js';
import { Economy } from '../progress/economy.js';
import { buildCar } from '../render/car/index.js';
import { $ } from '../util/dom.js';

export let mp = null;
const EMOTE_CHIP = { horn: 'TÛT', gg: 'GG', wave: 'SALUT', fire: 'FEU', follow: 'SUIS' };
const mpUi = { view: 'start', status: '', err: '', busy: false, offerIn: '' };
const myName = () => Net.cleanName(store.get('mpName', ''));
export function mpStart(role) {
  const name = Net.cleanName($('mpName') ? $('mpName').value : myName());
  store.set('mpName', name);
  const me = { name, kind: profile.current, cfg: profile.cars[profile.current] };
  mp = {
    S: Net.createSession(me, mpOn, Economy),
    remotes: new Map(),
    internet: !!store.get('mpNet', 0),
    offer: null,
    answer: null,
  };
  if (role === 'host') mp.S.host();
  mpUi.view = role;
  mpUi.status = '';
  mpUi.err = '';
  refreshMpHud();
}
function mpClose(quiet) {
  if (!mp) return;
  if (mp.offer) mp.offer.cancel();
  for (const R of mp.remotes.values()) dropRemoteModel(R);
  mp.S.close();
  mp = null;
  mpUi.view = 'start';
  mpUi.status = '';
  mpUi.answer = '';
  if (game.life) {
    game.life.race = null;
    game.life.battle = null;
  }
  refreshMpHud();
  renderMulti();
  if (!quiet) toast('Session fermée', 'apex');
}
function mpOn(t, d) {
  if (!mp) return;
  if (t === 'peers') {
    refreshMpHud();
    renderMulti();
  } else if (t === 'join') {
    ensureRemote(d.id, d);
    if (mp.S.role === 'host') {
      mpUi.status = '';
    }
    toast(`${d.name} rejoint la session`, 'chal');
    Sound.ping();
  } else if (t === 'leave') {
    const R = mp.remotes.get(d.id);
    if (R) {
      toast(`${R.name} quitte la session`, 'apex');
      dropRemoteModel(R);
      mp.remotes.delete(d.id);
    }
  } else if (t === 'state') {
    const R = mp.remotes.get(d.id);
    if (R) R.interp.push(d.s, performance.now());
  } else if (t === 'emote') showEmote(d.id, d.e);
  else if (t === 'ev') mpEvent(d.id, d.ev);
  else if (t === 'welcome') {
    for (const [id, p] of mp.S.peers) ensureRemote(id, p);
    const host = mp.S.peers.get(0);
    mpUi.status = 'ok';
    renderMulti();
    toast(`Connecté à la session de ${host ? host.name : 'l’hôte'}`, 'chal');
    Sound.ping();
    if (!isle) {
      show(null);
      setTimeout(() => enterIsland(d.at), 40);
    }
  } else if (t === 'closed') {
    toast('Session terminée : l’hôte est parti', 'lost');
    mpClose(true);
  } else if (t === 'full') {
    toast('Session complète : 4 pilotes au maximum', 'lost');
    mpClose(true);
  }
}
function ensureRemote(id, p) {
  if (!mp || id === mp.S.id) return null;
  let R = mp.remotes.get(id);
  if (!R) {
    R = {
      id,
      name: p.name,
      kind: p.kind,
      cfg: p.cfg,
      color: p.color || Net.COLORS[id % 4],
      interp: Net.createInterp(),
      model: null,
      tag: null,
      view: null,
      shown: false,
      emote: null,
      emoteT: 0,
    };
    mp.remotes.set(id, R);
  }
  remoteModel(R);
  refreshMpHud();
  return R;
}
export function remoteModel(R) {
  if (R.model || !isle || !game.life) return;
  R.model = buildCar(R.kind, lookOf(R.cfg, false, true));
  R.model.ground = isleData.terrain.at;
  envOn(R.model);
  scene.add(R.model.root);
  R.model.root.visible = false;
  R.tag = makeTag();
  R.tag.sprite.position.set(0, 2.7, 0);
  R.model.root.add(R.tag.sprite);
}
export function dropRemoteModel(R) {
  if (!R.model) return;
  R.tag.dispose();
  R.model.dispose();
  R.model = null;
  R.tag = null;
  R.shown = false;
}
export function remotesDraw(dt) {
  const now = performance.now(),
    cx = camera.position.x,
    cz = camera.position.z;
  for (const R of mp.remotes.values()) {
    if (!R.model) continue;
    const v = R.interp.sample(now);
    R.view = v;
    R.shown = !!v && v.age < 4;
    R.model.root.visible = R.shown;
    if (!R.shown) continue;
    R.model.update(v, dt, v.brake);
    if ((v.x - cx) ** 2 + (v.z - cz) ** 2 < 150 * 150) carFx(v, R.model, dt, 'M' + R.id, 'L');
    if (R.emoteT > 0) R.emoteT -= dt;
    fitTag(R.tag.sprite, v.x, v.z, cx, cz, 1.7);
    R.tag.set(
      R.name,
      v.combo > 200 ? `combo ${Math.round(v.combo).toLocaleString('fr-FR')}` : R.kind.toUpperCase(),
      R.color,
      R.emoteT > 0 ? EMOTE_CHIP[R.emote] : null,
    );
  }
}
export function refreshMpHud() {
  const on = !!(mp && mp.S.role && isle);
  $('mpHud').hidden = !on;
  $('mpPause').hidden = !(on && mp.S.role === 'host');
  if (!on) return;
  const list = mp.S.peerList().sort((a, b) => a.id - b.id);
  $('mpList').innerHTML = list
    .map(
      (p) =>
        `<span><i style="background:${Net.COLORS[p.id % 4]}"></i>${esc(p.name)}${p.id === mp.S.id ? ' · toi' : ''}</span>`,
    )
    .join('');
  $('hudBest').textContent = 'SESSION À ' + list.length;
}
function sendEmote(e) {
  if (!Net.EMOTES[e]) return;
  if (e === 'horn') Sound.horn(1, 0.9);
  if (!mp || !mp.S.role) return;
  mp.S.emote(e);
  if (e !== 'horn') toast(`Toi : ${Net.EMOTES[e]}`, 'buy');
}
function showEmote(id, e) {
  const R = mp.remotes.get(id);
  if (!R) return;
  R.emote = e;
  R.emoteT = 2.6;
  if (e === 'horn') {
    const d = R.view ? Math.hypot(R.view.x - game.player.x, R.view.z - game.player.z) : 50;
    Sound.horn(Math.max(0.15, 1 - d / 150), 0.9);
  } else {
    toast(`${R.name} : ${Net.EMOTES[e]}`, 'buy');
    if (e === 'follow' && R.view && game.life)
      setGps({
        name: R.name,
        get: () => (R.shown ? [R.view.x, R.view.z] : [game.player.x, game.player.z]),
        arrive: 20,
      });
  }
}
// évènements de groupe : l'hôte lance, tout le monde (hôte compris) les applique
function mpSend(ev) {
  if (!mp || !mp.S.role) return;
  mp.S.event(ev);
  const c = Net.cleanEvent(ev, mp.S.role === 'host');
  if (c) mpEvent(mp.S.id, c);
}
const nameOf = (id) => (mp && id === mp.S.id ? 'Toi' : mp && mp.remotes.get(id) ? mp.remotes.get(id).name : 'Pilote');
function mpEvent(id, ev) {
  if (!isle || !game.life) return;
  const I = isleData;
  if (ev.k === 'race') {
    if (game.life.duel) {
      game.life.duel.r.cool = 10;
      Object.assign(game.life.duel.r.A, { route: null, hold: false });
      game.life.duel = null;
    }
    game.life.zone = null;
    game.life.battle = null;
    const [nx, nz] = I.def.nodes[ev.node] || [];
    if (nx == null) return;
    // grille de départ : deux par rangée derrière l'hôte, dans l'ordre des numéros
    const ids = mp.S.peerList()
        .map((p) => p.id)
        .sort((a, b) => a - b),
      rank = Math.max(0, ids.indexOf(mp.S.id));
    if (ev.at) {
      const back = 6 + 9 * Math.floor(rank / 2),
        q = I.nearestRoad(ev.at.x - Math.cos(ev.at.h) * back, ev.at.z - Math.sin(ev.at.h) * back, {});
      if (q.i >= 0) {
        let h = Math.atan2(I.TZ[q.i], I.TX[q.i]);
        if (Math.cos(h - ev.at.h) < 0) h += Math.PI;
        const lat = rank % 2 ? 2.2 : -2.2;
        placePlayer(I.X[q.i] - Math.sin(h) * lat, I.Z[q.i] + Math.cos(h) * lat, h, 0);
      }
    }
    game.life.race = {
      node: ev.node,
      name: nodeName(ev.node),
      x: nx,
      z: nz,
      t: 0,
      state: 'count',
      results: new Map(),
      mine: false,
      endT: 0,
    };
    setGps({ name: nodeName(ev.node), x: nx, z: nz, race: true });
    show(null);
    game.phase = 'count';
    countdown();
    toast(`Course : premier arrivé à ${nodeName(ev.node)}`, 'chal');
  } else if (ev.k === 'arrive' && game.life.race) {
    if (game.life.race.results.has(id)) return;
    game.life.race.results.set(id, ev.time);
    const pos = game.life.race.results.size;
    toast(`${pos}${pos === 1 ? 'er' : 'e'} · ${nameOf(id)} · ${fmtTime(ev.time)}`, pos === 1 ? 'chal' : 'apex');
  } else if (ev.k === 'battle') {
    game.life.race = null;
    game.life.zone = null;
    game.life.battle = { dur: ev.dur, t: 0, base: score.total + score.combo, scores: new Map(), sent: false, endT: 0 };
    popup('Battle de drift', 'apex');
    Sound.count(true);
    toast(`Battle de drift : ${ev.dur} s, le plus gros score gagne`, 'chal');
  } else if (ev.k === 'score' && game.life.battle) game.life.battle.scores.set(id, ev.pts);
  else if (ev.k === 'cancel') {
    game.life.race = null;
    game.life.battle = null;
    clearGps();
    toast('Épreuve annulée par l’hôte', 'lost');
  }
}
export function raceTick(dt) {
  const R = game.life.race,
    st = game.player;
  if (R.state === 'count') {
    if (game.phase === 'play') R.state = 'run';
    return;
  }
  if (game.phase === 'play' && !R.mine) R.t += dt;
  if (!R.mine && Math.hypot(st.x - R.x, st.z - R.z) < 18) {
    R.mine = true;
    clearGps();
    mpSend({ k: 'arrive', time: Math.max(0.1, R.t) });
    Sound.bank(R.results.size === 1);
  }
  const total = mp ? mp.S.peers.size : 1;
  if (R.results.size >= total || R.t > 300) {
    R.endT += dt;
    if (R.endT > 1.2 || R.t > 300) {
      game.life.race = null;
      clearGps();
      const list = [...R.results.entries()].sort((a, b) => a[1] - b[1]);
      const lines = [
        [
          'narr',
          `Course jusqu’à ${R.name} : ` +
            (list.map(([id, t], k) => `${k + 1}. ${nameOf(id)} (${fmtTime(t)})`).join(' · ') ||
              'personne n’est arrivé.'),
        ],
      ];
      const first = list[0] && list[0][0] === mp.S.id;
      if (first) {
        Economy.credit(profile, 'Course entre amis', 800);
        saveProfile();
        refreshWallet();
        lines.push(['narr', 'Victoire : +¥800.']);
      }
      chat(lines, () => resumeGame());
    }
  }
}
export function battleTick(dt) {
  const B = game.life.battle;
  if (game.phase === 'play' || game.phase === 'count') B.t += dt;
  if (B.t >= B.dur && !B.sent) {
    bank();
    B.sent = true;
    mpSend({ k: 'score', pts: Math.max(0, Math.round(score.total - B.base)) });
  }
  if (B.sent) {
    B.endT += dt;
    if (B.scores.size >= (mp ? mp.S.peers.size : 1) || B.endT > 5) {
      game.life.battle = null;
      const list = [...B.scores.entries()].sort((a, b) => b[1] - a[1]);
      const lines = [
        [
          'narr',
          'Battle de drift : ' +
            list.map(([id, p], k) => `${k + 1}. ${nameOf(id)} (${p.toLocaleString('fr-FR')} pts)`).join(' · '),
        ],
      ];
      if (list[0] && list[0][0] === mp.S.id && list.length > 1) {
        Economy.credit(profile, 'Battle de drift entre amis', 800);
        saveProfile();
        refreshWallet();
        lines.push(['narr', 'Victoire : +¥800.']);
      }
      chat(lines, () => resumeGame());
    }
  }
}
// l'état part 30 fois par seconde en roulant, 4 à l'arrêt, même en pause (les autres voient ta voiture arrêtée)
export function mpSendTick(dt) {
  if (!mp || !mp.S.role || !isle || !game.player) return;
  const st = game.player;
  game.life.sendT -= dt;
  if (game.life.sendT <= 0) {
    const moving = st.speed > 0.3 || Math.abs(st.omega || 0) > 0.05;
    // le reliquat est conservé : la cadence réelle ne dépend pas de la fréquence d'affichage
    game.life.sendT = Math.max(game.life.sendT, -0.05) + 1 / (moving ? Net.HZ : Net.HZ_IDLE);
    mp.S.sendState(Net.encodeState(performance.now(), st, score.combo, input.brake > 0.1 || input.handbrake > 0.5));
  }
  if (mp.S.role === 'host') {
    game.life.hostT -= dt;
    if (game.life.hostT <= 0) {
      game.life.hostT = 1;
      mp.S.setHostAt(game.player.x, game.player.z, game.player.heading);
    }
  }
}

// écran de session : créer, inviter (code ou lien), rejoindre
function shareLink(code) {
  return /^https?:/.test(location.href) ? location.href.split('#')[0] + '#sdc=' + code : code;
}
async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t);
    toast('Copié', 'apex');
    return;
  } catch (e) {
    /* repli ci-dessous */
  }
  const ta = document.createElement('textarea');
  ta.value = t;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    toast('Copié', 'apex');
  } catch (e) {
    toast('Copie impossible : sélectionne le texte', 'lost');
  }
  ta.remove();
}
async function shareText(t, title) {
  try {
    await navigator.share({ title, text: t });
  } catch (e) {
    copyText(t);
  }
}
export function openMulti(code) {
  if (code) {
    mpUi.offerIn = code;
    if (!mp) mpUi.view = 'join';
  }
  renderMulti();
  show('multi');
}
function renderMulti() {
  const B = $('mpBody');
  if (!B) return;
  const players = () =>
    mp
      ? `<div class="players">${mp.S.peerList()
          .sort((a, b) => a.id - b.id)
          .map(
            (p) =>
              `<div><i style="background:${Net.COLORS[p.id % 4]}"></i>${esc(p.name)}${p.id === mp.S.id ? ' (toi)' : ''}<small>${p.kind.toUpperCase()}${p.id === 0 ? ' · hôte' : ''}</small></div>`,
          )
          .join('')}</div>`
      : '';
  const err = mpUi.err ? `<div class="status ko">${esc(mpUi.err)}</div>` : '';
  const pri = mp && mp.offer ? 'btn' : 'btn primary'; // une invitation en cours garde l'action principale
  const ride = isle
    ? `<button class="${pri}" data-mp="back">Retour sur l’île</button>`
    : `<button class="${pri}" data-mp="ride">Rouler sur l’île</button>`;
  const kept = { a: $('mpAnsIn') && $('mpAnsIn').value, o: $('mpOffIn') && $('mpOffIn').value }; // saisie en cours gardée
  const view =
    mp && mp.S.role === 'host'
      ? 'host'
      : mp && mp.S.role === 'guest' && mp.S.id != null
        ? 'guest'
        : mpUi.view === 'join'
          ? 'join'
          : 'start';
  let h;
  if (view === 'start') {
    const net = store.get('mpNet', 0);
    h = `<p class="sub" style="margin:0">Jusqu’à 4 pilotes sur l’île, chacun sur son appareil. Pas de compte : l’hôte envoie un code d’invitation, l’invité renvoie un code de réponse.</p>
      <label class="f">Pseudo affiché aux autres<input type="text" id="mpName" maxlength="16" autocomplete="off" spellcheck="false" value="${esc(myName() === 'Pilote' ? '' : myName())}" placeholder="Pilote"></label>
      <div class="seg" role="group" aria-label="Réseau"><button class="opt" data-net="0" aria-pressed="${!net}"><b>Même Wi-Fi</b><small>Aucun serveur tiers</small></button><button class="opt" data-net="1" aria-pressed="${!!net}"><b>Internet</b><small>Serveur STUN public de Google</small></button></div>
      <div class="note"><b>Ce qui est partagé :</b> ton pseudo, ta voiture et ta position sur l’île, uniquement avec les joueurs de la session, le temps de la session. Rien n’est enregistré en ligne. La connexion est directe entre appareils : chacun voit l’adresse IP des autres. En mode Internet, un serveur STUN de Google (hors UE) voit aussi ton adresse IP. Évite ton vrai nom comme pseudo.</div>
      ${err}<div class="acts"><button class="btn primary" data-mp="host">Créer une session</button><button class="btn" data-mp="join">Rejoindre une session</button></div>`;
  } else if (view === 'host') {
    const o = mp.offer;
    h = `<div class="status ok">Session ouverte · ${mp.S.peers.size} / ${Net.MAX} pilotes · ${mp.internet ? 'Internet' : 'même Wi-Fi'}</div>${players()}`;
    if (mp.S.peers.size < Net.MAX)
      h += o
        ? `<div class="step"><h3>1 · Envoie l’invitation</h3><textarea readonly id="mpOffer" aria-label="Code d’invitation">${esc(shareLink(o.code))}</textarea><div class="acts"><button class="btn" data-mp="copy">Copier</button>${navigator.share ? '<button class="btn" data-mp="share">Partager…</button>' : ''}</div>
        <h3>2 · Colle sa réponse</h3><textarea id="mpAnsIn" placeholder="SDC1…" aria-label="Code de réponse"></textarea><div class="acts"><button class="btn primary" data-mp="accept"${mpUi.busy ? ' disabled' : ''}>Valider la réponse</button><button class="btn ghost" data-mp="cancelInv">Annuler l’invitation</button></div>${mpUi.status === 'wait' ? '<div class="status">Connexion…</div>' : ''}</div>`
        : `<div class="acts"><button class="btn" data-mp="invite"${mpUi.busy ? ' disabled' : ''}>${mpUi.busy ? 'Préparation…' : 'Inviter un pilote'}</button></div>`;
    h += `${err}<div class="acts">${ride}<button class="btn ghost" data-mp="close">Fermer la session</button></div>`;
  } else if (view === 'guest') {
    h = `<div class="status ok">Connecté · ${mp.S.peers.size} / ${Net.MAX} pilotes</div>${players()}${err}<div class="acts">${ride}<button class="btn ghost" data-mp="close">Quitter la session</button></div>`;
  } else {
    h = `<div class="step"><h3>1 · Colle l’invitation reçue</h3><textarea id="mpOffIn" placeholder="Lien ou code SDC1…" aria-label="Code d’invitation">${esc(mpUi.offerIn || '')}</textarea><div class="acts"><button class="btn primary" data-mp="answer"${mpUi.busy ? ' disabled' : ''}>${mpUi.busy ? 'Préparation…' : 'Créer ma réponse'}</button></div></div>`;
    if (mp && mp.answer)
      h += `<div class="step"><h3>2 · Renvoie ce code à l’hôte</h3><textarea readonly id="mpAns" aria-label="Code de réponse">${esc(mp.answer)}</textarea><div class="acts"><button class="btn" data-mp="copyAns">Copier</button>${navigator.share ? '<button class="btn" data-mp="shareAns">Partager…</button>' : ''}</div><div class="status">En attente de l’hôte…</div></div>`;
    h += `${err}<div class="acts"><button class="btn ghost" data-mp="close">Annuler</button></div>`;
  }
  B.innerHTML = h;
  if (kept.a && $('mpAnsIn')) $('mpAnsIn').value = kept.a;
  if (kept.o && $('mpOffIn')) $('mpOffIn').value = kept.o;
}

export function init() {
  $('emotes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-emote]');
    if (b) sendEmote(b.dataset.emote);
  });
  $('mpRaceBtn').addEventListener('click', () => {
    if (!mp || !isle) return;
    const tgt = IsleLife.tougeTarget(isleData, game.player.x, game.player.z);
    if (!tgt) return;
    Sound.ui();
    mpSend({ k: 'race', node: tgt.node, at: { x: game.player.x, z: game.player.z, h: game.player.heading } });
  });
  $('mpBattleBtn').addEventListener('click', () => {
    if (!mp || !isle) return;
    Sound.ui();
    show(null);
    mpSend({ k: 'battle', dur: 90 });
    resumeGame();
  });
  $('mpBody').addEventListener('click', async (e) => {
    const n = e.target.closest('[data-net]');
    if (n) {
      store.set('mpNet', +n.dataset.net);
      Sound.ui();
      const nm = $('mpName') && $('mpName').value;
      renderMulti();
      if (nm != null && $('mpName')) $('mpName').value = nm;
      return;
    }
    const b = e.target.closest('[data-mp]');
    if (!b) return;
    const a = b.dataset.mp;
    Sound.ui();
    mpUi.err = '';
    if (a === 'host') {
      mpStart('host');
      renderMulti();
    } else if (a === 'join') {
      store.set('mpName', Net.cleanName($('mpName').value));
      mpUi.view = 'join';
      renderMulti();
    } else if (a === 'invite') {
      mpUi.busy = true;
      renderMulti();
      try {
        const o = await Net.rtcOffer(mp.internet);
        mp.offer = o;
        mp.S.addGuestLink(o.link);
        o.ready.then(() => {
          if (mp && mp.offer === o) {
            mp.offer = null;
            mpUi.status = '';
            renderMulti();
          }
        });
      } catch (err) {
        mpUi.err = 'Connexion directe indisponible sur ce navigateur.';
      }
      mpUi.busy = false;
      renderMulti();
    } else if (a === 'copy' || a === 'share') {
      const t = $('mpOffer').value;
      if (a === 'copy') copyText(t);
      else shareText(t, 'Sideways Drift Club · invitation');
    } else if (a === 'accept') {
      const o = mp.offer;
      if (!o) return;
      mpUi.busy = true;
      const ok = await o.accept($('mpAnsIn').value).catch(() => false);
      mpUi.busy = false;
      if (!ok) mpUi.err = 'Code de réponse illisible : recopie-le en entier.';
      else {
        mpUi.status = 'wait';
        setTimeout(() => {
          if (mp && mp.offer === o && !o.link.open) {
            mpUi.err = 'Connexion impossible. Même Wi-Fi des deux côtés ? Sinon, essaie le mode Internet.';
            mpUi.status = '';
            o.cancel();
            mp.offer = null;
            renderMulti();
          }
        }, 15000);
      }
      renderMulti();
    } else if (a === 'cancelInv') {
      if (mp.offer) mp.offer.cancel();
      mp.offer = null;
      renderMulti();
    } else if (a === 'answer') {
      const text = $('mpOffIn').value;
      mpUi.offerIn = text;
      mpUi.busy = true;
      renderMulti();
      try {
        const ans = await Net.rtcAnswer(text);
        if (!ans) mpUi.err = 'Invitation illisible : copie le lien ou le code en entier.';
        else {
          if (mp) mpClose(true);
          mpStart('guest');
          mpUi.view = 'join';
          mp.answer = ans.code;
          mp.internet = ans.internet;
          const m0 = mp;
          ans.ready.then((link) => {
            if (mp === m0) mp.S.join(link);
          });
          setTimeout(() => {
            if (mp === m0 && mp.S.id == null) {
              mpUi.err = 'L’hôte n’a pas répondu. Vérifie qu’il a bien validé ta réponse.';
              renderMulti();
            }
          }, 90000);
        }
      } catch (err) {
        mpUi.err = 'Connexion directe indisponible sur ce navigateur.';
      }
      mpUi.busy = false;
      renderMulti();
    } else if (a === 'copyAns' || a === 'shareAns') {
      const t = $('mpAns').value;
      if (a === 'copyAns') copyText(t);
      else shareText(t, 'Sideways Drift Club · réponse');
    } else if (a === 'close') {
      mpClose();
      mpUi.view = 'start';
      renderMulti();
    } else if (a === 'ride') {
      show(null);
      toast('Chargement de l’île…', 'apex');
      setTimeout(() => enterIsland(mp && mp.S.role === 'guest' ? mp.S.hostAt : null), 40);
    } else if (a === 'back') {
      show(null);
      resumeGame();
    }
  });
  $('multiBtn').addEventListener('click', () => {
    Sound.ui();
    ensureAudio();
    openMulti();
  });

  // touches de l'île : E interagir, M carte, H klaxon, 1-4 messages rapides en session
  addEventListener('keydown', (e) => {
    if (e.repeat || dlg || !isle || (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)))
      return;
    const k = e.key.toLowerCase();
    if (k === 'e' && game.phase === 'play') interact();
    else if (k === 'm' && (game.phase === 'play' || game.phase === 'count')) openIsleMap();
    else if (k === 'm' && screenId === 'isleMap') closeIsleMap();
    else if (k === 'h' && game.phase === 'play') sendEmote('horn');
    else if (mp && game.phase === 'play' && /^[1-4]$/.test(k)) sendEmote(['wave', 'gg', 'follow', 'fire'][+k - 1]);
  });
}
