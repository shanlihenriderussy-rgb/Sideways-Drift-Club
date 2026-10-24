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
  { tab: 'body', key: 'front', label: 'Pare-chocs avant', items: [['stock', 'Origine', 0], ['lip', 'Lame carbone', 1200], ['canard', 'Lame + canards', 2400], ['aero', 'Bouclier aéro', 3500]] },
  { tab: 'body', key: 'skirt', label: 'Bas de caisse', items: [['stock', 'Origine', 0], ['skirt', 'Jupes peintes', 1800], ['carbon', 'Jupes carbone', 3200]] },
  { tab: 'body', key: 'wide', label: 'Ailes', items: [['stock', 'Origine', 0], ['flares', 'Élargisseurs', 4000], ['wide', 'Kit wide-body', 9000]] },
  { tab: 'body', key: 'wing', label: 'Aileron', items: [['stock', 'Origine', 0], ['none', 'Aucun', 0], ['duck', 'Becquet', 1500], ['gt', 'Aileron GT', 3500], ['swan', 'Col de cygne', 7000]] },
  { tab: 'body', key: 'hood', label: 'Capot', items: [['stock', 'Origine', 0], ['vent', 'Ventilé', 2000], ['carbon', 'Carbone', 3000]] },
  { tab: 'body', key: 'diffuser', label: 'Diffuseur arrière', items: [['stock', 'Origine', 0], ['fins', 'Diffuseur à ailettes', 2400]] },
  { tab: 'body', key: 'exhaust', label: 'Échappement', items: [['stock', 'Origine', 0], ['twin', 'Double sortie', 1200], ['side', 'Sortie latérale', 2500]] },
  { tab: 'body', key: 'mirror', label: 'Rétroviseurs', items: [['stock', 'Origine', 0], ['aero', 'Rétros aéro', 900], ['fender', 'Rétros d’aile (JDM)', 1600]] },
  { tab: 'body', key: 'roof', label: 'Toit', items: [['none', 'Lisse', 0], ['scoop', 'Écope de toit', 1400], ['visor', 'Pare-soleil', 1100], ['rack', 'Galerie + pneu', 2600]] },
  { tab: 'body', key: 'lights', label: 'Phares', items: [['stock', 'Blancs', 0], ['yellow', 'Ampoules jaunes', 800]] },
  { tab: 'body', key: 'neon', label: 'Néon sous caisse', swatch: true, items: [['none', 'Aucun', 0], ...NEONS.map((n) => [n.id, n.name, 1500])] },
  { tab: 'chassis', key: 'cage', label: 'Arceau', items: [['none', 'Aucun', 0], ['cage', 'Arceau 6 points', 2200]] },
  { tab: 'chassis', key: 'seat', label: 'Baquets', items: [['stock', 'Origine', 0], ['bucket', 'Baquets course', 1500], ['harness', 'Baquets + harnais', 2600]] },
  { tab: 'chassis', key: 'wheelS', label: 'Volant', items: [['stock', 'Origine', 0], ['deep', 'Volant deep dish', 900]] },
  { tab: 'chassis', key: 'tow', label: 'Sangles de remorquage', items: [['none', 'Aucune', 0], ['tow', 'Sangles rouges', 600]] },
  { tab: 'chassis', key: 'flaps', label: 'Bavettes', items: [['none', 'Aucune', 0], ['flaps', 'Bavettes rally', 700]] },
  { tab: 'paint', key: 'paint', label: 'Couleur', swatch: true, items: PAINTS.map((p) => [p.id, p.name, 0]) },
  { tab: 'paint', key: 'finish', label: 'Finition', items: [['gloss', 'Brillant', 0], ['metal', 'Métallisé', 1500], ['matte', 'Mat', 2500], ['pearl', 'Nacré', 3000], ['chrome', 'Chrome', 12000]] },
  { tab: 'paint', key: 'livery', label: 'Livrée', items: [['none', 'Unie', 0], ['club', 'Club', 0], ['stripes', 'Bandes course', 1000], ['kanji', 'Kanji', 2000], ['splash', 'Éclaboussures', 2500], ['fade', 'Damier fondu', 3000]] },
  { tab: 'paint', key: 'accent', label: 'Couleur de livrée', swatch: true, items: [['auto', 'Auto (contraste)', 0], ...PAINTS.map((p) => [p.id, p.name, 0])] },
  { tab: 'paint', key: 'tint', label: 'Vitres', items: [['stock', 'Claires', 0], ['smoke', 'Fumées', 600], ['dark', 'Teinte sombre', 900]] },
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
  { key: 'brakes', label: 'Kit de freins', desc: '+10 % de freinage par niveau, disques et étriers plus gros', prices: [2000, 4500, 8000] },
];
// Réglages gratuits et réversibles. def = valeur neutre : la physique y est strictement celle de la fiche.
// fx : effet en jeu, affiché sous le curseur.
const TUNE = [
  { key: 'brakePower', group: 'Freins', label: 'Puissance de freinage', lo: 'Douce', hi: 'Mordante', def: 0.5, fx: 'Distance d’arrêt ±20 %' },
  { key: 'brakeBias', group: 'Freins', label: 'Répartition avant / arrière', lo: 'Avant', hi: 'Arrière', def: 0.5, fx: 'Vers l’arrière : la voiture pivote au freinage' },
  { key: 'handbrake', group: 'Freins', label: 'Frein à main', lo: 'Progressif', hi: 'Sec', def: 0.5, fx: 'Sec : l’arrière décroche d’un coup' },
  { key: 'springF', group: 'Suspension', label: 'Raideur avant', lo: 'Souple', hi: 'Ferme', def: 0.5, fx: 'Ferme : moins d’accroche avant en appui' },
  { key: 'springR', group: 'Suspension', label: 'Raideur arrière', lo: 'Souple', hi: 'Ferme', def: 0.5, fx: 'Ferme : l’arrière glisse plus facilement' },
  { key: 'damper', group: 'Suspension', label: 'Amortisseurs', lo: 'Lents', hi: 'Vifs', def: 0.5, fx: 'Vifs : transferts de charge immédiats' },
  { key: 'height', group: 'Suspension', label: 'Hauteur de caisse', lo: 'Rasante', hi: 'Haute', def: 0.5, fx: 'Basse : moins de transfert, plus stable' },
  { key: 'camber', group: 'Suspension', label: 'Carrossage', lo: 'Droit', hi: 'Oni', def: 0.35, fx: 'Plus d’accroche avant en glisse, freinage moindre' },
  { key: 'track', group: 'Style', label: 'Déport des roues', lo: 'Rentré', hi: 'Affleurant', def: 0.5, fx: 'Esthétique' },
];
const defaultTune = () => Object.fromEntries(TUNE.map((t) => [t.key, t.def]));

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
  { id: 'tour3', label: 'Un run sur 3 pistes différentes', reward: 3000, test: (r, p) => p.stats.tracks.length >= 3 },
  { id: 'tourAll', label: 'Un run sur chacune des 6 pistes', reward: 6000, test: (r, p) => p.stats.tracks.length >= 6 }, // = TRACKS.length (vérifié par les tests)
  { id: 'firstPart', label: 'Achète ta première pièce', reward: 500, event: 'buy' },
  { id: 'secondCar', label: 'Achète une deuxième voiture', reward: 2000, event: 'car' },
  // paliers faciles : de l'argent dès les premières sessions
  { id: 'pts5', label: '5 000 pts en un run', reward: 600, test: (r) => r.mode !== 'free' && r.score >= 5000 },
  { id: 'gradeB', label: 'Décroche la note B', reward: 800, test: (r) => r.mode !== 'free' && ['B', 'A', 'S'].includes(r.grade) },
  { id: 'clips3', label: '3 clips en un run', reward: 600, test: (r) => r.clips >= 3 },
  { id: 'angle45', label: 'Glisse à 45° ou plus', reward: 500, test: (r) => r.maxAngle >= 45 },
  { id: 'combo3k', label: 'Combo de 3 000 pts', reward: 700, test: (r) => r.bestCombo >= 3000 },
  { id: 'tandem1', label: 'Termine un run en tandem', reward: 800, test: (r) => r.mode === 'tandem' },
  { id: 'free1', label: 'Fais une session libre', reward: 300, test: (r) => r.mode === 'free' },
  // assiduité
  { id: 'runs5', label: '5 runs terminés', reward: 1500, test: (r, p) => p.stats.runs >= 5 },
  { id: 'runs20', label: '20 runs terminés', reward: 4000, test: (r, p) => p.stats.runs >= 20 },
  { id: 'runs50', label: '50 runs terminés', reward: 10000, test: (r, p) => p.stats.runs >= 50 },
  { id: 'earn50k', label: '¥50 000 gagnés au total', reward: 5000, test: (r, p) => p.stats.earned >= 50000 },
  // exploits
  { id: 'pts70', label: '70 000 pts en un run', reward: 10000, test: (r) => r.score >= 70000 },
  { id: 'angle75', label: 'Glisse à 75° ou plus', reward: 3000, test: (r) => r.maxAngle >= 75 },
  { id: 'combo15k', label: 'Combo de 15 000 pts', reward: 4000, test: (r) => r.bestCombo >= 15000 },
  { id: 'tandemS', label: 'Note S en tandem', reward: 6000, test: (r) => r.mode === 'tandem' && r.grade === 'S' },
  // une note A ou S sur chaque piste (identifiants alignés sur TRACKS, vérifié par les tests)
  ...[['minato', 'les Docks de Minato'], ['akane', 'le Col d’Akane'], ['piton', 'le Piton Volcan'], ['shiohama', 'le Quai de Shiohama'], ['yukimi', 'le Col de Yukimi'], ['kaigan', 'la Corniche de Kaigan']]
    .map(([id, name]) => ({ id: 'trackA:' + id, label: `Note A ou S sur ${name}`, reward: 2500, test: (r) => r.mode !== 'free' && r.trackId === id && (r.grade === 'A' || r.grade === 'S') })),
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
    skirt: 'stock', diffuser: 'stock', mirror: 'stock', roof: 'none', lights: 'stock', tint: 'stock',
    seat: 'stock', wheelS: 'stock', tow: 'none', flaps: 'none',
    perf: { engine: 0, tires: 0, angle: 0, weight: 0, susp: 0, brakes: 0 },
    tune: defaultTune(),
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
    if (typeof raw.stats.lastDay === 'string') p.stats.lastDay = raw.stats.lastDay;
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
// tune : réglages d'atelier ; chaque écart à la valeur neutre est centré sur 0 pour que le neutre soit exact.
function tunedSpec(base, perf, tune) {
  const e = perf.engine | 0, t = perf.tires | 0, a = perf.angle | 0, w = perf.weight | 0, s = perf.susp | 0, b = perf.brakes | 0;
  const d = (k) => { const def = TUNE.find((x) => x.key === k).def; const v = tune && Number.isFinite(tune[k]) ? tune[k] : def; return v - def; };
  const stiff = (d('springF') + d('springR')) / 2;
  return Object.assign({}, base, {
    brakeK: (1 + 0.1 * b) * (1 + 0.4 * d('brakePower')),
    brakeRear: d('brakeBias'), // −0,5 (avant) … +0,5 (arrière)
    hbK: d('handbrake'),
    latBal: d('springF') - d('springR'), // > 0 : avant plus ferme → sous-vireur
    damp: 1 + 0.8 * d('damper'),
    camber: d('camber'),
    power: base.power * (1 + 0.08 * e),
    fmax: base.fmax * (1 + 0.06 * e),
    top: base.top + 2 * e,
    mu: base.mu * (1 + 0.03 * t),
    lock: base.lock + 0.06 * a,
    driftSteer: 0.42 + 0.05 * a,
    angleBoost: 0.04 * a,
    mass: base.mass * (1 - 0.04 * w),
    steerRate: 4.2 * (1 + 0.1 * s) * (1 + 0.2 * stiff),
    rollK: (1 - 0.18 * s) * (1 - 0.6 * stiff),
    h: base.h - 0.01 * s + 0.08 * d('height'),
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

const GRADE_BONUS = { S: 2500, A: 1400, B: 700, C: 300, D: 100 };
const FIRST_RUN_BONUS = 1500; // premier run noté de la journée
// run : { trackId, mode, score, grade, clips, zones, maxAngle, bestCombo, driftPct, record }
// firstToday : premier run noté du jour (prime en plus)
function computePayout(r, firstToday) {
  const lines = [];
  const add = (label, amount) => { amount = Math.round(amount); if (amount > 0) lines.push({ label, amount }); };
  if (r.mode === 'free') {
    add('Session libre', Math.min(3500, r.score * 0.03));
  } else {
    add(r.mode === 'tandem' ? 'Points (tandem ×1,25)' : 'Points', r.score * 0.07 * (r.mode === 'tandem' ? 1.25 : 1));
    if (r.score > 0) add('Note ' + r.grade, GRADE_BONUS[r.grade] || 0);
    add(`Clips (${r.clips})`, r.clips * 100);
    if (r.zones > 0 && r.clips >= r.zones) add('Tous les clips', 1800);
    if (r.bestCombo >= 10000) add('Gros combo', 900); else if (r.bestCombo >= 5000) add('Beau combo', 450); else if (r.bestCombo >= 2000) add('Combo', 200);
    if (r.record) add('Nouveau record', 1200);
    if (firstToday && r.score > 0) add('Premier run du jour', FIRST_RUN_BONUS);
  }
  return { lines, total: lines.reduce((a, l) => a + l.amount, 0) };
}

// r.day (AAAA-MM-JJ, facultatif) : déclenche la prime du premier run noté de la journée
function applyRun(p, r) {
  const firstToday = !!r.day && r.mode !== 'free' && r.score > 0 && p.stats.lastDay !== r.day;
  const payout = computePayout(r, firstToday);
  if (firstToday) p.stats.lastDay = r.day;
  if (payout.total > 0) credit(p, r.mode === 'free' ? 'Session libre' : 'Run · ' + (r.trackName || r.trackId), payout.total);
  p.stats.runs++;
  p.stats.bestPayout = Math.max(p.stats.bestPayout, payout.total);
  if (r.mode !== 'free' && !p.stats.tracks.includes(r.trackId)) p.stats.tracks.push(r.trackId);
  const met = CHALLENGES.filter((c) => c.test && !p.done[c.id] && c.test(r, p)).map((c) => c.id);
  const challenges = unlock(p, met);
  return { payout, challenges, balance: p.money };
}

// bonus quotidien : 1 000 ¥ le premier jour, +500 ¥ par jour de série, plafond au 7e jour (4 000 ¥)
const dailyAmount = (streak) => 1000 + 500 * Math.min(Math.max(streak, 1) - 1, 6);
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
  defaultTune, START_MONEY, LOG_MAX, CAR_PRICES, PAINTS, RIMS, SMOKES, NEONS, SHOP, PERF, TUNE, CHALLENGES,
  defaultCar, loadProfile, itemPrice, owns, equip, buyItem, perfPrice, buyPerf, buyCar, setTune,
  tunedSpec, carStats, computePayout, applyRun, dailyAmount, dailyPreview, claimDaily, credit, fmt,
};
if (typeof module !== 'undefined') module.exports = Economy;
