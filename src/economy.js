// ===== Économie : portefeuille en yens, catalogue de l'atelier, gains, défis, bonus quotidien =====
// Logique pure : le jeu passe le profil, ces fonctions le modifient et renvoient un résultat { ok, ... }.
// Rien n'est envoyé hors de l'appareil : le profil vit dans localStorage (clé sdc:profile).
const START_MONEY = 3000;
const LOG_MAX = 40;
const CAR_PRICES = { hachi: 0, kouki: 18000, raijin: 45000 };

const PAINTS = [
  { id: 'panda', name: 'Blanc Panda', hex: 0xf1efe9 },
  { id: 'tofu', name: 'Noir Tofu', hex: 0x17171b },
  { id: 'rouge', name: 'Rouge Akane', hex: 0xc8262d },
  { id: 'jaune', name: 'Jaune Kanji', hex: 0xf3b81f },
  { id: 'orange', name: 'Orange Mikan', hex: 0xff6a1a },
  { id: 'bleu', name: 'Bleu Lagon', hex: 0x1d76c2 },
  { id: 'cyan', name: 'Cyan Néon', hex: 0x2fc7d6 },
  { id: 'vert', name: 'Vert Midori', hex: 0x2f9a5a },
  { id: 'rose', name: 'Rose Sakura', hex: 0xef7fa6 },
  { id: 'violet', name: 'Violet Néon', hex: 0x6b3fd1 },
  { id: 'gris', name: 'Gris Nardo', hex: 0x8a8f98 },
  { id: 'bordeaux', name: 'Bordeaux', hex: 0x6e1424 },
];
const RIMS = [
  { id: 'bronze', name: 'Bronze', hex: 0xb07a3a },
  { id: 'chrome', name: 'Chrome', hex: 0xd8dde3 },
  { id: 'noir', name: 'Noir mat', hex: 0x222226 },
  { id: 'gun', name: 'Gunmetal', hex: 0x4a4d55 },
  { id: 'or', name: 'Or', hex: 0xd9b23a },
  { id: 'blanc', name: 'Blanc', hex: 0xf2f2f2 },
  { id: 'rouge', name: 'Rouge', hex: 0xc8262d },
  { id: 'bleu', name: 'Bleu', hex: 0x1d76c2 },
];
const SMOKES = [
  { id: 'blanc', name: 'Blanche', hex: 0xeeeae2, price: 0 },
  { id: 'noir', name: 'Noire', hex: 0x3a3a42, price: 1200 },
  { id: 'rose', name: 'Rose', hex: 0xff6fb5, price: 1500 },
  { id: 'bleu', name: 'Bleue', hex: 0x3fa9ff, price: 1500 },
  { id: 'vert', name: 'Verte', hex: 0x4be38a, price: 1500 },
  { id: 'violet', name: 'Violette', hex: 0x9b5cff, price: 1500 },
  { id: 'jaune', name: 'Jaune', hex: 0xffd23f, price: 1500 },
  { id: 'rouge', name: 'Rouge', hex: 0xff3d3d, price: 1500 },
];
const NEONS = [
  { id: 'cyan', name: 'Cyan', hex: 0x38d6ff },
  { id: 'rose', name: 'Rose', hex: 0xff4fc3 },
  { id: 'vert', name: 'Vert', hex: 0x4be38a },
  { id: 'ambre', name: 'Ambre', hex: 0xffb020 },
  { id: 'violet', name: 'Violet', hex: 0x8a5cff },
];

// Catalogue de l'atelier. tab = onglet ; items = [id, nom, prix]. Les articles à 0 ¥ sont toujours possédés.
const SHOP = [
  { tab: 'body', key: 'front', label: 'Pare-chocs avant', items: [['stock', 'Origine', 0], ['lip', 'Lame carbone', 1200], ['aero', 'Bouclier aéro', 3500]] },
  { tab: 'body', key: 'wide', label: 'Ailes', items: [['stock', 'Origine', 0], ['flares', 'Élargisseurs', 4000], ['wide', 'Kit wide-body', 9000]] },
  { tab: 'body', key: 'wing', label: 'Aileron', items: [['stock', 'Origine', 0], ['none', 'Aucun', 0], ['duck', 'Becquet', 1500], ['gt', 'Aileron GT', 3500], ['swan', 'Col de cygne', 7000]] },
  { tab: 'body', key: 'hood', label: 'Capot', items: [['stock', 'Origine', 0], ['vent', 'Ventilé', 2000], ['carbon', 'Carbone', 3000]] },
  { tab: 'body', key: 'exhaust', label: 'Échappement', items: [['stock', 'Origine', 0], ['twin', 'Double sortie', 1200], ['side', 'Sortie latérale', 2500]] },
  { tab: 'body', key: 'cage', label: 'Arceau', items: [['none', 'Aucun', 0], ['cage', 'Arceau 6 points', 2200]] },
  { tab: 'body', key: 'neon', label: 'Néon sous caisse', swatch: true, items: [['none', 'Aucun', 0], ...NEONS.map((n) => [n.id, n.name, 1500])] },
  { tab: 'paint', key: 'paint', label: 'Couleur', swatch: true, items: PAINTS.map((p) => [p.id, p.name, 0]) },
  { tab: 'paint', key: 'finish', label: 'Finition', items: [['gloss', 'Brillant', 0], ['metal', 'Métallisé', 1500], ['matte', 'Mat', 2500], ['pearl', 'Nacré', 3000], ['chrome', 'Chrome', 12000]] },
  { tab: 'paint', key: 'livery', label: 'Livrée', items: [['none', 'Unie', 0], ['club', 'Club', 0], ['stripes', 'Bandes course', 1000], ['kanji', 'Kanji', 2000], ['splash', 'Éclaboussures', 2500], ['fade', 'Damier fondu', 3000]] },
  { tab: 'paint', key: 'accent', label: 'Couleur de livrée', swatch: true, items: [['auto', 'Auto (contraste)', 0], ...PAINTS.map((p) => [p.id, p.name, 0])] },
  { tab: 'wheels', key: 'rimStyle', label: 'Modèle de jantes', items: [['six', '6 branches', 0], ['five', '5 branches', 1500], ['mesh', 'Mesh', 2500], ['turbine', 'Turbine', 3000], ['dish', 'Deep dish', 3500]] },
  { tab: 'wheels', key: 'rim', label: 'Couleur des jantes', swatch: true, items: RIMS.map((r) => [r.id, r.name, 0]) },
  { tab: 'wheels', key: 'smoke', label: 'Fumée de pneus', swatch: true, items: SMOKES.map((s) => [s.id, s.name, s.price]) },
];
const PERF = [
  { key: 'engine', label: 'Moteur', desc: '+8 % de puissance par niveau', prices: [4000, 9000, 16000] },
  { key: 'tires', label: 'Pneus', desc: '+3 % d’adhérence par niveau', prices: [2500, 5500, 9500] },
  { key: 'angle', label: 'Kit d’angle', desc: 'Plus de braquage, plus d’angle tenu', prices: [3000, 6500, 11000] },
  { key: 'weight', label: 'Allègement', desc: '−4 % de masse par niveau', prices: [3000, 7000, 12000] },
  { key: 'susp', label: 'Suspension', desc: 'Moins de roulis, direction plus vive', prices: [2500, 5000, 9000] },
];
const TUNE = [
  { key: 'height', label: 'Hauteur de caisse', lo: 'Rasante', hi: 'Haute' },
  { key: 'camber', label: 'Carrossage', lo: 'Droit', hi: 'Oni' },
  { key: 'track', label: 'Déport des roues', lo: 'Rentré', hi: 'Affleurant' },
];

const CHALLENGES = [
  { id: 'first', label: 'Termine ton premier run noté', reward: 500, test: (r) => r.mode !== 'free' },
  { id: 'pts10', label: '10 000 pts en un run', reward: 1000, test: (r) => r.score >= 10000 },
  { id: 'pts25', label: '25 000 pts en un run', reward: 2500, test: (r) => r.score >= 25000 },
  { id: 'pts45', label: '45 000 pts en un run', reward: 6000, test: (r) => r.score >= 45000 },
  { id: 'gradeA', label: 'Décroche la note A', reward: 2000, test: (r) => r.mode !== 'free' && (r.grade === 'A' || r.grade === 'S') },
  { id: 'gradeS', label: 'Décroche la note S', reward: 5000, test: (r) => r.mode !== 'free' && r.grade === 'S' },
  { id: 'angle60', label: 'Glisse à 60° ou plus', reward: 1000, test: (r) => r.maxAngle >= 60 },
  { id: 'combo8k', label: 'Combo de 8 000 pts', reward: 2000, test: (r) => r.bestCombo >= 8000 },
  { id: 'clipsAll', label: 'Tous les clips d’une piste en un run', reward: 4000, test: (r) => r.zones > 0 && r.clips >= r.zones },
  { id: 'drift70', label: '70 % d’un run en glisse', reward: 2500, test: (r) => r.mode !== 'free' && r.driftPct >= 70 },
  { id: 'tandemA', label: 'Note A ou S en tandem', reward: 3000, test: (r) => r.mode === 'tandem' && (r.grade === 'A' || r.grade === 'S') },
  { id: 'tour3', label: 'Un run sur chacune des 3 pistes', reward: 3000, test: (r, p) => p.stats.tracks.length >= 3 },
  { id: 'firstPart', label: 'Achète ta première pièce', reward: 500, event: 'buy' },
  { id: 'secondCar', label: 'Achète une deuxième voiture', reward: 2000, event: 'car' },
];

const DEFAULT_LOOK = {
  hachi: { paint: 'panda', number: 86 },
  kouki: { paint: 'rouge', number: 15 },
  raijin: { paint: 'tofu', number: 22 },
};
function defaultCar(kind) {
  const d = DEFAULT_LOOK[kind] || DEFAULT_LOOK.hachi;
  return {
    paint: d.paint, finish: 'gloss', livery: 'club', accent: 'auto', number: d.number,
    rimStyle: 'six', rim: 'bronze', smoke: 'blanc',
    front: 'stock', wide: 'stock', wing: 'stock', hood: 'stock', exhaust: 'stock', cage: 'none', neon: 'none',
    perf: { engine: 0, tires: 0, angle: 0, weight: 0, susp: 0 },
    tune: { height: 0.5, camber: 0.35, track: 0.5 },
    owned: [],
  };
}

const shopEntry = (key) => SHOP.find((s) => s.key === key);
function itemPrice(key, id) {
  const e = shopEntry(key);
  const it = e && e.items.find((i) => i[0] === id);
  return it ? it[2] : null;
}
function owns(cfg, key, id) {
  const pr = itemPrice(key, id);
  return pr === 0 || (pr != null && cfg.owned.includes(key + ':' + id));
}

function sanitizeCar(kind, raw) {
  const c = defaultCar(kind);
  if (!raw || typeof raw !== 'object') return c;
  for (const s of SHOP) if (itemPrice(s.key, raw[s.key]) != null) c[s.key] = raw[s.key];
  if (Number.isInteger(raw.number) && raw.number >= 1 && raw.number <= 99) c.number = raw.number;
  if (Array.isArray(raw.owned)) c.owned = raw.owned.filter((o) => typeof o === 'string');
  for (const p of PERF) { const v = raw.perf && raw.perf[p.key]; if (Number.isInteger(v)) c.perf[p.key] = Math.max(0, Math.min(3, v)); }
  for (const t of TUNE) { const v = raw.tune && raw.tune[t.key]; if (typeof v === 'number' && isFinite(v)) c.tune[t.key] = Math.max(0, Math.min(1, v)); }
  // une pièce équipée mais non payée (sauvegarde trafiquée ou ancienne) revient à l'origine
  for (const s of SHOP) if (!owns(c, s.key, c[s.key])) c[s.key] = defaultCar(kind)[s.key];
  return c;
}

function newProfile(legacy) {
  const p = { v: 1, money: START_MONEY, current: 'hachi', cars: { hachi: defaultCar('hachi') }, log: [], daily: { last: null, streak: 0 }, done: {}, stats: { runs: 0, earned: 0, spent: 0, tracks: [], bestPayout: 0 } };
  if (legacy && typeof legacy === 'object' && CAR_PRICES[legacy.car] != null) {
    // joueur d'avant l'économie : il garde la voiture qu'il pilotait, avec ses couleurs
    const c = p.cars[legacy.car] || (p.cars[legacy.car] = defaultCar(legacy.car));
    if (PAINTS.some((x) => x.id === legacy.paint)) c.paint = legacy.paint;
    if (RIMS.some((x) => x.id === legacy.rim)) c.rim = legacy.rim;
    if (Number.isInteger(legacy.number) && legacy.number >= 1 && legacy.number <= 99) c.number = legacy.number;
    p.current = legacy.car;
  }
  return p;
}

function loadProfile(raw, legacy) {
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return newProfile(legacy);
  const p = newProfile(null);
  p.money = Number.isFinite(raw.money) ? Math.max(0, Math.round(raw.money)) : START_MONEY;
  if (raw.cars && typeof raw.cars === 'object') for (const k of Object.keys(CAR_PRICES)) if (raw.cars[k]) p.cars[k] = sanitizeCar(k, raw.cars[k]);
  if (!p.cars.hachi) p.cars.hachi = defaultCar('hachi');
  p.current = p.cars[raw.current] ? raw.current : 'hachi';
  if (Array.isArray(raw.log)) p.log = raw.log.filter((l) => l && typeof l.label === 'string' && Number.isFinite(l.amount)).slice(0, LOG_MAX);
  if (raw.daily && typeof raw.daily === 'object') p.daily = { last: typeof raw.daily.last === 'string' ? raw.daily.last : null, streak: Number.isInteger(raw.daily.streak) ? raw.daily.streak : 0 };
  if (raw.done && typeof raw.done === 'object') for (const c of CHALLENGES) if (raw.done[c.id]) p.done[c.id] = true;
  if (raw.stats && typeof raw.stats === 'object') {
    for (const k of ['runs', 'earned', 'spent', 'bestPayout']) if (Number.isFinite(raw.stats[k])) p.stats[k] = raw.stats[k];
    if (Array.isArray(raw.stats.tracks)) p.stats.tracks = raw.stats.tracks.filter((t) => typeof t === 'string');
  }
  return p;
}

function credit(p, label, amount) {
  p.money = Math.max(0, p.money + amount);
  p.log.unshift({ t: Date.now(), label, amount });
  if (p.log.length > LOG_MAX) p.log.length = LOG_MAX;
  if (amount > 0) p.stats.earned += amount; else p.stats.spent -= amount;
}

function unlock(p, ids) {
  const out = [];
  for (const id of ids) {
    const c = CHALLENGES.find((x) => x.id === id);
    if (!c || p.done[id]) continue;
    p.done[id] = true;
    credit(p, 'Défi : ' + c.label, c.reward);
    out.push({ id, label: c.label, reward: c.reward });
  }
  return out;
}
const eventChallenges = (ev) => CHALLENGES.filter((c) => c.event === ev).map((c) => c.id);

function equip(p, kind, key, id) {
  const cfg = p.cars[kind];
  if (!cfg || itemPrice(key, id) == null) return { ok: false, reason: 'unknown' };
  if (!owns(cfg, key, id)) return { ok: false, reason: 'locked' };
  cfg[key] = id;
  return { ok: true };
}

function buyItem(p, kind, key, id) {
  const cfg = p.cars[kind];
  const price = itemPrice(key, id);
  if (!cfg || price == null) return { ok: false, reason: 'unknown' };
  if (owns(cfg, key, id)) { cfg[key] = id; return { ok: true, spent: 0, challenges: [] }; }
  if (p.money < price) return { ok: false, reason: 'funds', missing: price - p.money };
  const e = shopEntry(key);
  credit(p, `${e.label} : ${e.items.find((i) => i[0] === id)[1]}`, -price);
  cfg.owned.push(key + ':' + id);
  cfg[key] = id;
  return { ok: true, spent: price, challenges: unlock(p, eventChallenges('buy')) };
}

function perfPrice(cfg, key) {
  const pf = PERF.find((x) => x.key === key);
  if (!pf) return null;
  const lvl = cfg.perf[key];
  return lvl >= pf.prices.length ? null : pf.prices[lvl];
}
function buyPerf(p, kind, key) {
  const cfg = p.cars[kind];
  const pf = PERF.find((x) => x.key === key);
  if (!cfg || !pf) return { ok: false, reason: 'unknown' };
  const price = perfPrice(cfg, key);
  if (price == null) return { ok: false, reason: 'max' };
  if (p.money < price) return { ok: false, reason: 'funds', missing: price - p.money };
  cfg.perf[key]++;
  credit(p, `${pf.label} niveau ${cfg.perf[key]}`, -price);
  return { ok: true, spent: price, level: cfg.perf[key], challenges: unlock(p, eventChallenges('buy')) };
}

function buyCar(p, kind) {
  const price = CAR_PRICES[kind];
  if (price == null) return { ok: false, reason: 'unknown' };
  if (p.cars[kind]) { p.current = kind; return { ok: true, spent: 0, challenges: [] }; }
  if (p.money < price) return { ok: false, reason: 'funds', missing: price - p.money };
  credit(p, 'Voiture : ' + kind.toUpperCase(), -price);
  p.cars[kind] = defaultCar(kind);
  p.current = kind;
  return { ok: true, spent: price, challenges: unlock(p, eventChallenges('car')) };
}

function setTune(p, kind, key, v) {
  const cfg = p.cars[kind];
  if (!cfg || !TUNE.some((t) => t.key === key) || !Number.isFinite(v)) return { ok: false };
  cfg.tune[key] = Math.max(0, Math.min(1, v));
  return { ok: true };
}

// Fiche physique améliorée (copie) : jamais de mutation de la fiche de base.
function tunedSpec(base, perf) {
  const e = perf.engine | 0, t = perf.tires | 0, a = perf.angle | 0, w = perf.weight | 0, s = perf.susp | 0;
  return Object.assign({}, base, {
    power: base.power * (1 + 0.08 * e),
    fmax: base.fmax * (1 + 0.06 * e),
    top: base.top + 2 * e,
    mu: base.mu * (1 + 0.03 * t),
    lock: base.lock + 0.06 * a,
    driftSteer: 0.42 + 0.05 * a,
    angleBoost: 0.04 * a,
    mass: base.mass * (1 - 0.04 * w),
    steerRate: 4.2 * (1 + 0.1 * s),
    rollK: 1 - 0.18 * s,
    h: base.h - 0.01 * s,
  });
}
// statistiques affichées (0..5, décimales permises) : base + gain des pièces
function carStats(base, perf) {
  return {
    power: Math.min(5, base.stats.power + perf.engine * 0.45 + perf.weight * 0.2),
    grip: Math.min(5, base.stats.grip + perf.tires * 0.35 + perf.susp * 0.3),
    angle: Math.min(5, base.stats.angle + perf.angle * 0.5),
  };
}

const GRADE_BONUS = { S: 1500, A: 800, B: 400, C: 150, D: 0 };
// run : { trackId, mode, score, grade, clips, zones, maxAngle, bestCombo, driftPct, record }
function computePayout(r) {
  const lines = [];
  const add = (label, amount) => { amount = Math.round(amount); if (amount > 0) lines.push({ label, amount }); };
  if (r.mode === 'free') {
    add('Session libre', Math.min(2500, r.score * 0.02));
  } else {
    add(r.mode === 'tandem' ? 'Points (tandem ×1,25)' : 'Points', r.score * 0.05 * (r.mode === 'tandem' ? 1.25 : 1));
    if (r.score > 0) add('Note ' + r.grade, GRADE_BONUS[r.grade] || 0);
    add(`Clips (${r.clips})`, r.clips * 50);
    if (r.zones > 0 && r.clips >= r.zones) add('Tous les clips', 1000);
    if (r.bestCombo >= 10000) add('Gros combo', 500); else if (r.bestCombo >= 5000) add('Beau combo', 250);
    if (r.record) add('Nouveau record', 750);
  }
  return { lines, total: lines.reduce((a, l) => a + l.amount, 0) };
}

function applyRun(p, r) {
  const payout = computePayout(r);
  if (payout.total > 0) credit(p, r.mode === 'free' ? 'Session libre' : 'Run · ' + (r.trackName || r.trackId), payout.total);
  p.stats.runs++;
  p.stats.bestPayout = Math.max(p.stats.bestPayout, payout.total);
  if (r.mode !== 'free' && !p.stats.tracks.includes(r.trackId)) p.stats.tracks.push(r.trackId);
  const met = CHALLENGES.filter((c) => c.test && !p.done[c.id] && c.test(r, p)).map((c) => c.id);
  const challenges = unlock(p, met);
  return { payout, challenges, balance: p.money };
}

// bonus quotidien : 500 ¥ le premier jour, +250 ¥ par jour de série, plafond au 7e jour
const dailyAmount = (streak) => 500 + 250 * Math.min(Math.max(streak, 1) - 1, 6);
function dayNum(s) { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; }
function dailyPreview(p, today) {
  if (p.daily.last === today) return null;
  const streak = p.daily.last && dayNum(today) - dayNum(p.daily.last) === 1 ? p.daily.streak + 1 : 1;
  return { streak, amount: dailyAmount(streak) };
}
function claimDaily(p, today) {
  const pv = dailyPreview(p, today);
  if (!pv) return null;
  p.daily = { last: today, streak: pv.streak };
  credit(p, `Bonus du jour (série ${pv.streak})`, pv.amount);
  return pv;
}

const fmt = (n) => '¥' + Math.round(n).toLocaleString('fr-FR');

const Economy = {
  START_MONEY, LOG_MAX, CAR_PRICES, PAINTS, RIMS, SMOKES, NEONS, SHOP, PERF, TUNE, CHALLENGES,
  defaultCar, loadProfile, itemPrice, owns, equip, buyItem, perfPrice, buyPerf, buyCar, setTune,
  tunedSpec, carStats, computePayout, applyRun, dailyAmount, dailyPreview, claimDaily, credit, fmt,
};
if (typeof module !== 'undefined') module.exports = Economy;
