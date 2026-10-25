// ===== Vie de l'île : GPS, circulation, pilotes rivaux, activités, habitants =====
// Logique pure (aucun DOM, aucun Three.js) testée sous Node (tests/isleai.test.js) ; rendu et entrées dans island.js / game.js.
// I = buildIsland(ISLE). On roule à gauche (voitures à volant à droite, comme au Japon).
// Un « agent » (voiture de la circulation ou rival) avance sur une route e, dans le sens dir (+1 de a vers b), à la distance s.

const LIFE_LANE = 3.2; // décalage de la voie depuis l'axe (m)
const lifeWrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const lifeClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const EcoL = () => (typeof Economy !== 'undefined' ? Economy : require('./economy.js'));

// ---------- réseau : graphe, courbure, profils de vitesse (calculés une fois, rangés dans I.life) ----------
function lifeOf(I) {
  if (I.life) return I.life;
  const adj = {};
  for (const k of Object.keys(I.def.nodes)) adj[k] = [];
  I.roads.forEach((r, e) => { adj[r.a].push({ e, dir: 1, to: r.b }); adj[r.b].push({ e, dir: -1, to: r.a }); });
  const prof = I.roads.map((r) => {
    const n = r.count, raw = new Float32Array(n), k = new Float32Array(n);
    for (let i = 1; i < n - 1; i++) raw[i] = lifeWrap(Math.atan2(r.tz[i + 1], r.tx[i + 1]) - Math.atan2(r.tz[i - 1], r.tx[i - 1])) / (2 * r.step);
    raw[0] = raw[1]; raw[n - 1] = raw[n - 2];
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let q = -6; q <= 6; q++) { const j = i + q; if (j >= 0 && j < n) { s += raw[j]; c++; } } k[i] = s / c; }
    // vitesse possible : accélération latérale limitée, freinage limité dans les deux sens de parcours
    const speeds = (aLat, vMin, vMax, dec) => {
      const v = new Float32Array(n);
      for (let i = 0; i < n; i++) v[i] = lifeClamp(Math.sqrt(aLat / Math.max(Math.abs(k[i]), 1e-4)), vMin, vMax);
      for (let i = n - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * dec * r.step));
      for (let i = 1; i < n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] * v[i - 1] + 2 * dec * r.step));
      return v;
    };
    return { k, civ: speeds(2.6, 6, 16.5, 3), race: speeds(7.5, 10, 31, 6) };
  });
  I.life = { adj, prof };
  return I.life;
}

// point sur une route : position et tangente dans le sens de parcours, décalage latéral (positif = à droite du sens)
function roadPose(I, e, dir, s, lat, out) {
  const r = I.roads[e], u = lifeClamp(dir > 0 ? s : r.length - s, 0, r.length) / r.step;
  const i = Math.min(r.count - 2, Math.floor(u)), t = u - i;
  let tx = r.tx[i] + (r.tx[i + 1] - r.tx[i]) * t, tz = r.tz[i] + (r.tz[i + 1] - r.tz[i]) * t;
  const l = Math.hypot(tx, tz) || 1; tx = tx / l * dir; tz = tz / l * dir;
  const o = out || {};
  o.x = r.px[i] + (r.px[i + 1] - r.px[i]) * t - tz * lat;
  o.z = r.pz[i] + (r.pz[i + 1] - r.pz[i]) * t + tx * lat;
  o.tx = tx; o.tz = tz; o.i = i;
  return o;
}
const roadEnd = (I, e, dir) => (dir > 0 ? I.roads[e].b : I.roads[e].a);

// ---------- GPS : plus court chemin d'un point à un autre sur le réseau ----------
// renvoie { len, segs: [{ e, i0, i1 }] } (indices locaux de chaque route, i0 → i1 dans le sens du trajet) ou null
function lifeRoute(I, x0, z0, x1, z1) {
  const q0 = I.nearestRoad(x0, z0, {}), q1 = I.nearestRoad(x1, z1, {});
  if (q0.i < 0 || q1.i < 0) return null;
  const { adj } = lifeOf(I);
  const e0 = I.E[q0.i], i0 = q0.i - I.roads[e0].off, e1 = I.E[q1.i], i1 = q1.i - I.roads[e1].off;
  const r0 = I.roads[e0], r1 = I.roads[e1];
  const direct = e0 === e1 ? Math.abs(i1 - i0) * r0.step : Infinity;
  // départ : on rejoint un bout de la route e0 ; plusieurs sources dans Dijkstra
  const dist = {}, prev = {}, done = {};
  for (const k of Object.keys(adj)) dist[k] = Infinity;
  const seed = (node, d, seg) => { if (d < dist[node]) { dist[node] = d; prev[node] = { start: seg }; } };
  seed(r0.a, i0 * r0.step, { e: e0, i0, i1: 0 });
  seed(r0.b, (r0.count - 1 - i0) * r0.step, { e: e0, i0, i1: r0.count - 1 });
  for (;;) {
    let u = null;
    for (const k of Object.keys(dist)) if (!done[k] && dist[k] < Infinity && (u === null || dist[k] < dist[u])) u = k;
    if (u === null) break;
    done[u] = true;
    for (const { e, dir, to } of adj[u]) {
      const d = dist[u] + I.roads[e].length;
      if (d < dist[to]) { dist[to] = d; prev[to] = { from: u, e, dir }; }
    }
  }
  const viaA = dist[r1.a] + i1 * r1.step, viaB = dist[r1.b] + (r1.count - 1 - i1) * r1.step;
  const len = Math.min(direct, viaA, viaB);
  if (!isFinite(len)) return null;
  if (len === direct) return { len, segs: [{ e: e0, i0, i1 }] };
  const endNode = viaA <= viaB ? r1.a : r1.b;
  const segs = [{ e: e1, i0: endNode === r1.a ? 0 : r1.count - 1, i1 }];
  let n = endNode;
  while (prev[n] && !prev[n].start) { const p = prev[n], r = I.roads[p.e]; segs.unshift({ e: p.e, i0: p.dir > 0 ? 0 : r.count - 1, i1: p.dir > 0 ? r.count - 1 : 0 }); n = p.from; }
  segs.unshift(prev[n].start);
  return { len, segs };
}
// point situé à `ahead` mètres le long du trajet (pour la flèche du GPS) ; parcourt aussi le tracé pour la carte
function routeWalk(I, route, ahead, each) {
  let d = 0, last = null;
  for (const sg of route.segs) {
    const r = I.roads[sg.e], st = sg.i1 >= sg.i0 ? 1 : -1;
    for (let i = sg.i0; st > 0 ? i <= sg.i1 : i >= sg.i1; i += st) {
      if (last && i === sg.i0) continue; // point de raccord déjà compté
      if (last) d += r.step;
      last = [r.px[i], r.pz[i]];
      if (each) each(last[0], last[1], d);
      if (ahead != null && d >= ahead) return last;
    }
  }
  return last;
}

// ---------- circulation et rivaux ----------
const TRAFFIC_KINDS = [
  // len, w, h (m), couleurs possibles, part
  { id: 'kei', len: 3.4, w: 1.48, h: 1.62, cols: [0xf1efe9, 0xe8c547, 0x9ad0c2, 0xd8d2c4, 0x7fa6d9], w8: 4 },
  { id: 'sedan', len: 4.6, w: 1.72, h: 1.42, cols: [0x2b2d33, 0xb8bcc4, 0x7a1f24, 0x1f3c66, 0xf4f1e6], w8: 4 },
  { id: 'van', len: 4.7, w: 1.75, h: 1.95, cols: [0xf4f1e6, 0xdcdad3, 0x3b5f8a], w8: 2 },
  { id: 'truck', len: 4.4, w: 1.6, h: 1.8, cols: [0xf4f1e6, 0x2e8b57, 0x5d7fa8], w8: 2 },
  { id: 'bus', len: 9.5, w: 2.3, h: 2.9, cols: [0xf7d154, 0x2fa3c4], w8: 1 },
];

function makeAgent(I, opt) {
  const A = Object.assign({ e: 0, dir: 1, s: 0, speed: 0, lane: -LIFE_LANE, laneT: -LIFE_LANE, k: 1, waitT: 0, hitT: 0, honkT: 0, beta: 0, x: 0, z: 0, heading: 0, route: null, arrived: false, hold: false }, opt);
  const p = roadPose(I, A.e, A.dir, A.s, A.lane, {});
  A.x = p.x; A.z = p.z; A.heading = Math.atan2(p.tz, p.tx);
  return A;
}

// circulation : n voitures réparties sur le réseau (graine fixe)
function createTraffic(I, n, seed) {
  let s0 = seed || 7;
  const rand = () => { s0 = (s0 * 16807) % 2147483647; return (s0 - 1) / 2147483646; };
  const total = TRAFFIC_KINDS.reduce((a, k) => a + k.w8, 0);
  const pick = () => { let x = rand() * total; for (const k of TRAFFIC_KINDS) { x -= k.w8; if (x <= 0) return k; } return TRAFFIC_KINDS[0]; };
  const agents = [];
  for (let q = 0; q < n; q++) {
    const kind = pick(), e = Math.floor(rand() * I.roads.length), dir = rand() < 0.5 ? 1 : -1;
    agents.push(makeAgent(I, { id: 't' + q, kind, color: kind.cols[Math.floor(rand() * kind.cols.length)], e, dir, s: rand() * I.roads[e].length, k: 0.85 + rand() * 0.25, speed: 8 }));
  }
  return { agents, rand };
}

// au bout d'une route : route suivante (trajet prévu, sinon au hasard, demi-tour seulement en impasse)
function nextRoad(I, A, rand) {
  const node = roadEnd(I, A.e, A.dir), { adj } = lifeOf(I);
  if (A.route) {
    if (!A.route.length) { A.arrived = true; return false; }
    const n = A.route.shift(); A.e = n.e; A.dir = n.dir; return true;
  }
  let opts = adj[node].filter((o) => o.e !== A.e);
  if (!opts.length) opts = adj[node];
  const o = opts[Math.floor(rand() * opts.length) % opts.length];
  A.e = o.e; A.dir = o.dir;
  return true;
}

// obstacles : { x, z, r? } — joueur, joueurs distants, autres agents. Renvoie la distance libre devant (m) dans la voie de A.
// oncoming : ignorer ce qui vient en face (un rival au milieu de la route ne pile pas pour les voitures qui croisent)
function gapAhead(A, obstacles, lateral, oncoming) {
  const fx = Math.cos(A.heading), fz = Math.sin(A.heading);
  let gap = Infinity, who = null;
  for (const o of obstacles) {
    if (o === A) continue;
    if (oncoming && (o.vx || 0) * fx + (o.vz || 0) * fz < -2) continue;
    const dx = o.x - A.x, dz = o.z - A.z, along = dx * fx + dz * fz;
    if (along <= 0 || along > 48) continue;
    const lat = -dx * fz + dz * fx;
    if (Math.abs(lat) < lateral && along < gap) { gap = along; who = o; }
  }
  return { gap, who };
}

// un pas d'un agent. rival = conduite de course en glisse sur l'axe de la route. Renvoie un évènement éventuel ('honk').
const _pose = {};
function stepAgent(I, A, dt, obstacles, rand, rival) {
  const { prof } = lifeOf(I);
  let ev = null;
  if (A.hitT > 0) { A.hitT -= dt; if (A.hitT <= 0) ev = 'honk'; }
  // vitesse visée : profil de la route un peu plus loin, puis voiture devant
  const r = I.roads[A.e], pr = prof[A.e];
  const look = (m) => { const u = lifeClamp(A.dir > 0 ? A.s + m : r.length - A.s - m, 0, r.length); return Math.round(u / r.step); };
  const vArr = rival ? pr.race : pr.civ;
  let target = Math.min(vArr[look(0)], vArr[look(12)], vArr[look(24)]) * A.k;
  if (A.hold || A.arrived || A.hitT > 0) target = 0;
  const { gap, who } = gapAhead(A, obstacles, rival ? 1.8 : 2.6, rival);
  if (gap < Infinity && A.hitT <= 0) {
    const safe = rival ? 6 : 8;
    const vf = Math.sqrt(2 * (rival ? 7 : 4) * Math.max(0, gap - safe)); // vitesse à laquelle on s'arrête encore à temps
    if (vf < target) {
      target = vf;
      // bloqué derrière quelqu'un d'arrêté : on klaxonne, puis on dépasse par l'autre voie
      if (A.speed < 1.5) A.waitT += dt; else A.waitT = Math.max(0, A.waitT - dt);
      if (A.waitT > 2.2 && A.honkT <= 0) { ev = 'honk'; A.honkT = 5; }
      if (A.waitT > 3.2 && who && Math.hypot(who.vx || 0, who.vz || 0) < 2) { A.laneT = rival ? (A.laneT > 0 ? -2.6 : 2.6) : LIFE_LANE * 0.5; A.passS = 45; A.waitT = 0; }
    }
  } else A.waitT = Math.max(0, A.waitT - dt);
  if (A.honkT > 0) A.honkT -= dt;
  const acc = target > A.speed ? (rival ? 6 : 2.4) : (rival ? 9 : 6);
  A.speed += lifeClamp(target - A.speed, -acc * dt, acc * dt);
  A.s += A.speed * dt;
  if (A.passS != null) { A.passS -= A.speed * dt; if (A.passS <= 0) { A.passS = null; A.laneT = rival ? 0 : -LIFE_LANE; } }
  A.lane += lifeClamp(A.laneT - A.lane, -2.2 * dt, 2.2 * dt);
  while (A.s > I.roads[A.e].length) {
    const over = A.s - I.roads[A.e].length;
    if (!nextRoad(I, A, rand)) { A.s = I.roads[A.e].length; A.speed = 0; break; }
    A.s = over;
  }
  const p = roadPose(I, A.e, A.dir, A.s, A.lane, _pose);
  const ox = A.x, oz = A.z;
  // lissage de la position (les voies se raccordent mal au milieu des carrefours)
  const kx = Math.min(1, dt * 9);
  A.x += (p.x - A.x) * kx; A.z += (p.z - A.z) * kx;
  A.vx = (A.x - ox) / Math.max(dt, 1e-4); A.vz = (A.z - oz) / Math.max(dt, 1e-4);
  let path = Math.atan2(p.tz, p.tx);
  if (rival) {
    // angle de glisse : anticipe le virage le plus serré des 30 m à venir (la courbure change de signe en sens inverse)
    let m = 0;
    for (let q = 0; q < 30; q += 3) { const c = pr.k[look(q)] * A.dir; if (Math.abs(c) > Math.abs(m)) m = c; }
    const b = A.speed > 9 ? Math.sign(m) * Math.min(0.8, Math.abs(m) * 28 + (Math.abs(m) > 1 / 90 ? 0.3 : 0)) : 0;
    A.beta += (b - A.beta) * Math.min(1, dt * 3);
    path += A.beta;
  }
  const dh = lifeWrap(path - A.heading);
  A.heading = lifeWrap(A.heading + dh * Math.min(1, dt * 7));
  A.yaw = dh;
  return ev;
}

// voiture trop loin du joueur : on la replace sur une route à 260–560 m de lui (hors de vue, dans le brouillard)
function respawnNear(I, A, x, z, rand, lane) {
  for (let t = 0; t < 40; t++) {
    const i = Math.floor(rand() * I.N), d = Math.hypot(I.X[i] - x, I.Z[i] - z);
    if (d < 260 || d > 560) continue;
    const e = I.E[i], r = I.roads[e], li = i - r.off, dir = rand() < 0.5 ? 1 : -1;
    Object.assign(A, { e, dir, s: (dir > 0 ? li : r.count - 1 - li) * r.step, speed: 9, hitT: 0, waitT: 0, passS: null, route: null, arrived: false, hold: false, beta: 0 });
    A.lane = A.laneT = lane == null ? -LIFE_LANE : lane;
    const p = roadPose(I, e, dir, A.s, A.lane, {});
    A.x = p.x; A.z = p.z; A.heading = Math.atan2(p.tz, p.tx);
    return true;
  }
  return false;
}
// noms des carrefours (les lieux de l'aventure portent le nom de leur piste)
const NODE_NAMES = { J1: 'Carrefour des quais', J2: 'Carrefour du plateau', J3: 'Carrefour des cannes', J4: 'Carrefour du sud' };

// ---------- rivaux : pilotes de rue qui sillonnent l'île ----------
// car : modèle, cfg : livrée (pièces gratuites ou réservées aux rivaux), unlock : chapitre de l'aventure ouvert
const RIVALS = [
  { id: 'kai', who: 'kai', name: 'Kai', car: 'kouki', crew: 'Kuro Kumo', skill: 0.92, reward: 2500, unlock: 1, e: 2, look: { paint: 'gris', livery: 'stripes', number: 9, rimStyle: 'mesh', rim: 'noir' },
    hello: [['kai', 'Tiens, la recrue du Sideways. Tu roules seul la nuit, toi aussi ?']], win: [['kai', 'Bien joué. Mika va entendre parler de toi.']], lose: [['kai', 'Trop sage. Sur l’île, on ne t’attend pas.']] },
  { id: 'nana', who: 'nana', name: 'Nana', car: 'hachi', crew: 'Livraisons de nuit', skill: 0.88, reward: 1800, unlock: 0, e: 7, look: { paint: 'rose', livery: 'club', number: 42, rimStyle: 'six', rim: 'blanc' },
    hello: [['nana', 'Je livre des gâteaux patate au refuge avant l’aube. Toi, tu as l’air d’avoir du temps à perdre.']], win: [['nana', 'Les gâteaux sont arrivés cassés. C’est de ta faute. Bravo quand même.']], lose: [['nana', 'Livrée à l’heure, comme toujours. Reviens quand tu veux.']] },
  { id: 'tetsu', who: 'tetsu', name: 'Tetsu', car: 'raijin', crew: 'Kuro Kumo', skill: 0.98, reward: 4000, unlock: 3, e: 14, look: { paint: 'bordeaux', livery: 'kanji', number: 3, rimStyle: 'dish', rim: 'gun' },
    hello: [['tetsu', 'Tetsu. Vingt ans de col. Mika m’a dit de te tester. Je teste.']], win: [['tetsu', '… Le club a retrouvé un pilote. Sayo serait contente.']], lose: [['tetsu', 'Pas encore. Mais tu as de l’angle.']] },
  { id: 'mika', who: 'mika', name: 'Mika', car: 'raijin', crew: 'Kuro Kumo', skill: 1.02, reward: 6000, unlock: 4, e: 6, look: { paint: 'panda', livery: 'kanji', number: 1, rimStyle: 'turbine', rim: 'or' },
    hello: [['mika', 'Encore toi ? Mon col, ma route, ma règle : on se mesure ou tu dégages.']], win: [['mika', 'Tch. La prochaine fois, je ne retiens pas mes coups.']], lose: [['mika', 'Tu vois la différence, maintenant ?']] },
];
const RIVAL_CAST = {
  nana: { name: 'Nana', role: 'Livreuse de nuit', ini: 'NA', col: '#ff8fb3' },
  tetsu: { name: 'Tetsu', role: 'Doyen des Kuro Kumo', ini: 'TE', col: '#8a8f99' },
};
// chapitre c ouvert (0 = toujours) : les rivaux arrivent au fil de l'aventure
function rivalOpen(p, def, StoryM) { return def.unlock <= 0 || !StoryM || StoryM.chapterOpen(p, Math.min(def.unlock, StoryM.CHAPTERS.length - 1)); }
function isleBag(p) {
  if (!p.isle || typeof p.isle !== 'object') p.isle = { found: {} };
  for (const k of ['found', 'rivals', 'best', 'met', 'photo']) if (!p.isle[k] || typeof p.isle[k] !== 'object' || Array.isArray(p.isle[k])) p.isle[k] = {};
  return p.isle;
}
// victoire sur un rival : récompense pleine la première fois, un cinquième ensuite
function rivalWin(p, id, kind) {
  const def = RIVALS.find((r) => r.id === id); if (!def) return 0;
  const b = isleBag(p), n = Number.isInteger(b.rivals[id]) ? b.rivals[id] : 0;
  const amount = n === 0 ? def.reward : Math.round(def.reward / 5 / 100) * 100;
  b.rivals[id] = n + 1;
  EcoL().credit(p, `${kind === 'tandem' ? 'Tandem de rue' : 'Touge'} contre ${def.name}`, amount);
  return amount;
}
// destination d'un touge : un lieu de l'île à 700–1 800 m par la route, le plus proche de 1 200 m
function tougeTarget(I, x, z, exclude) {
  let best = null, bd = Infinity;
  for (const [k, [nx, nz]] of Object.entries(I.def.nodes)) {
    if (k === exclude) continue;
    const r = lifeRoute(I, x, z, nx, nz); if (!r) continue;
    const sc = r.len < 700 || r.len > 1800 ? 1e6 + Math.abs(r.len - 1200) : Math.abs(r.len - 1200);
    if (sc < bd) { bd = sc; best = { node: k, x: nx, z: nz, route: r }; }
  }
  return best;
}
// itinéraire d'agent (liste de { e, dir }) à partir d'un trajet GPS calculé depuis la position de l'agent
function agentPlan(I, route) {
  return route.segs.slice(1).map((sg) => ({ e: sg.e, dir: sg.i1 >= sg.i0 ? 1 : -1 }));
}

// ---------- activités : radars de vitesse et zones de glisse ----------
// e : route, at (radar) ou from/to (zone) en fraction de la longueur ; stars : seuils (km/h ou points)
const ACTIVITIES = [
  { id: 'radar-quais', type: 'radar', name: 'Radar des quais', e: 1, at: 0.5, stars: [90, 115, 140] },
  { id: 'radar-corniche', type: 'radar', name: 'Radar de la corniche', e: 4, at: 0.55, stars: [100, 130, 160] },
  { id: 'radar-ouest', type: 'radar', name: 'Radar de la plaine', e: 12, at: 0.45, stars: [95, 125, 150] },
  { id: 'zone-falaise', type: 'zone', name: 'Lacets de la falaise', e: 3, from: 0.08, to: 0.92, stars: [4000, 9000, 16000] },
  { id: 'zone-volcan', type: 'zone', name: 'Montée du volcan', e: 7, from: 0.15, to: 0.95, stars: [3500, 8000, 14000] },
  { id: 'zone-epingles', type: 'zone', name: 'Épingles du sud', e: 14, from: 0.05, to: 0.95, stars: [3000, 7000, 12000] },
  { id: 'zone-neige', type: 'zone', name: 'Descente de Yukimi', e: 6, from: 0.1, to: 0.9, stars: [3500, 8000, 14000] },
];
const STAR_REWARD = { radar: [400, 700, 1200], zone: [600, 1000, 1800] };
const starsOf = (def, v) => def.stars.filter((t) => v >= t).length;
// enregistre un passage : meilleure valeur, étoiles nouvelles payées une fois chacune
function recordActivity(p, id, value) {
  const def = ACTIVITIES.find((a) => a.id === id);
  if (!def || !(value >= 0)) return null;
  const b = isleBag(p), prev = typeof b.best[id] === 'number' ? b.best[id] : 0;
  const s0 = starsOf(def, prev), s1 = starsOf(def, value);
  let reward = 0;
  for (let k = s0; k < s1; k++) reward += STAR_REWARD[def.type][k];
  if (value > prev) b.best[id] = Math.round(value);
  if (reward) EcoL().credit(p, `${def.name} · ${'★'.repeat(s1)}`, reward);
  return { stars: s1, prev: s0, reward, best: Math.max(prev, Math.round(value)), record: value > prev };
}

// ---------- habitants et belvédères ----------
// e, at, side : où ils se tiennent ; talk(p, S) → { lines, choices } ; les choix : 'daruma', 'rival', 'story', 'activity', 'bye'
const ISLE_NPCS = [
  { id: 'kenji', who: 'kenji', e: 0, at: 0.07, side: 1 },
  { id: 'lou', who: 'lou', e: 1, at: 0.9, side: -1 },
  { id: 'zelie', who: 'zelie', e: 7, at: 0.88, side: 1 },
  { id: 'ume', who: 'ume', e: 4, at: 0.25, side: 1 },
  { id: 'sora', who: 'sora', e: 5, at: 0.9, side: -1 },
  { id: 'hoshi', who: 'hoshi', e: 12, at: 0.82, side: -1 },
];
const NPC_LINES = {
  kenji: (p, S) => {
    const ci = S ? S.currentChapter(p) : 0, done = S && S.chapterDone(p, S.CHAPTERS.length - 1);
    if (done) return [['kenji', 'Le garage est sauvé, et tu traînes encore sur les quais ? Va donc voir si Mika a envie de perdre.']];
    return [['kenji', ci === 0 ? 'Tu ne tiens pas en place, hein ? L’île est grande. Garde un œil sur le compte-tours et un autre sur les camions.' : `Prochaine étape : ${S.CHAPTERS[ci].title}. Je t’indique la route si tu veux.`]];
  },
  lou: () => [['lou', 'Il me faut des photos de l’île pour le supplément du dimanche. Les belvédères, au bord de la route : arrête-toi, et clic.']],
  zelie: () => [['zelie', 'Ou lé là, marmay ! Les daruma dorés, c’est Sayo qui les a posés partout sur l’île. Elle aimait les chasses au trésor.']],
  ume: () => [['ume', 'Le radar de la corniche, il flashe tout le monde. Moi, je compte les passages : le record, c’est 160.']],
  sora: () => [['sora', 'Le thé est chaud. Les Kuro Kumo descendent par ici le soir. Fais attention à la neige, elle ne prévient pas.']],
  hoshi: () => [['hoshi', 'Je connais toutes les routes ! Enfin presque. Tu veux que je te montre où il y a un daruma ?']],
};
const NPC_CHOICES = [
  { act: 'story', label: 'Où va l’aventure ?' },
  { act: 'daruma', label: 'Un daruma doré dans le coin ?' },
  { act: 'rival', label: 'Où roulent les rivaux ?' },
  { act: 'activity', label: 'Un défi à tenter ?' },
  { act: 'bye', label: 'À plus tard' },
];
const NPC_REWARD = 300;
function npcTalk(p, id, S) {
  const n = ISLE_NPCS.find((x) => x.id === id); if (!n) return null;
  const b = isleBag(p), first = !b.met[id];
  return { lines: NPC_LINES[id](p, S), choices: NPC_CHOICES, first };
}
function npcMet(p, id) {
  const b = isleBag(p);
  if (b.met[id] || !ISLE_NPCS.some((x) => x.id === id)) return 0;
  b.met[id] = true;
  EcoL().credit(p, 'Rencontre sur l’île', NPC_REWARD);
  return NPC_REWARD;
}
// belvédères : s'arrêter dans le cercle et prendre la photo
const PHOTO_SPOTS = [
  { id: 'phare', name: 'Le phare de Shiohama', e: 2, at: 0.12, side: -1, look: [120, -600], reward: 500, line: 'Le phare au premier plan, la mer derrière. Ça, c’est une une.' },
  { id: 'cratere', name: 'Le cratère', e: 14, at: 0.12, side: 1, look: [90, 170], reward: 500, line: 'Le volcan qui fume au-dessus de ta voiture. Mes lecteurs vont adorer.' },
  { id: 'falaise', name: 'La falaise est', e: 3, at: 0.5, side: 1, look: [1300, 0], reward: 500, line: 'L’océan à perte de vue. On sent le vent jusque dans le journal.' },
  { id: 'col', name: 'Le col enneigé', e: 13, at: 0.8, side: -1, look: [-700, 360], reward: 500, line: 'La neige, les pins, le silence. On dirait une carte postale de 1996.' },
];
function photoTaken(p, id) {
  const def = PHOTO_SPOTS.find((x) => x.id === id), b = isleBag(p);
  if (!def || b.photo[id]) return 0;
  b.photo[id] = true;
  EcoL().credit(p, 'Photo : ' + def.name, def.reward);
  return def.reward;
}
// position d'un repère posé sur une route (côté = −1 gauche / +1 droite du sens a → b)
function spotPos(I, e, at, side, off) {
  const r = I.roads[e];
  return roadPose(I, e, 1, at * r.length, side * (I.half + (off == null ? 3.5 : off)), {});
}

const IsleLife = {
  LANE: LIFE_LANE, TRAFFIC_KINDS, RIVALS, RIVAL_CAST, ACTIVITIES, STAR_REWARD, ISLE_NPCS, NPC_CHOICES, NPC_REWARD, PHOTO_SPOTS,
  NODE_NAMES, lifeOf, roadPose, roadEnd, route: lifeRoute, respawnNear, routeWalk, makeAgent, createTraffic, stepAgent, gapAhead, nextRoad,
  rivalOpen, rivalWin, tougeTarget, agentPlan, starsOf, recordActivity, npcTalk, npcMet, photoTaken, spotPos, isleBag,
};
if (typeof module !== 'undefined') module.exports = IsleLife;
