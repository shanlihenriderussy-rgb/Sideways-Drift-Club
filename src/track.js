// ===== Pistes : tracé, échantillonnage, zones de clipping =====
// pts : [x, z, altitude] ; l'altitude est interpolée le long du tracé puis lissée (pente < 13 %).
// terrain : relief du décor autour de la route (hills = amplitude des collines, sea = côté de l'eau, laissé à plat).
// Chaque lieu a sa signature : grille à angles droits, lacets en épingles, tige et carrousel, triangle rapide,
// serpentin serré, corniche étirée entre falaise et océan.
const TRACKS = [
  {
    id: 'minato', name: 'Docks de Minato', jp: '港埠頭', time: 'Nuit · port · angles droits', par: 32000,
    width: 15, runoff: 3.2,
    // grille du terminal : virages à 90° entre les piles de conteneurs, rampe vers le quai haut
    pts: [[0, 0, 0], [200, 0, 0], [290, 0, 0], [312, 8, 0], [320, 30, 0.5], [320, 100, 2.5], [312, 122, 3], [290, 130, 3], [240, 130, 3], [218, 138, 3], [210, 160, 3.5], [210, 200, 5], [202, 222, 5.5], [180, 230, 5.5], [110, 230, 5.5], [88, 222, 5.5], [80, 200, 5], [80, 165, 3.5], [72, 145, 2.5], [50, 138, 2], [-40, 138, 1], [-62, 130, 0.5], [-70, 108, 0], [-70, 30, 0], [-62, 8, 0], [-40, 0, 0]],
    theme: 'night', terrain: { hills: 0, sea: 'minZ' },
  },
  {
    id: 'akane', name: 'Col d’Akane', jp: '茜峠', time: 'Couchant · lacets en montée', par: 34000,
    width: 14, runoff: 2.8,
    // trois épingles empilées qui grimpent le col, redescente rapide par la crête
    pts: [[0, 0, 0], [80, 2, 1.5], [150, -4, 3.5], [188, -6, 5], [204, -32, 6], [192, -58, 7], [150, -64, 8], [90, -60, 10], [20, -70, 12], [2, -94, 13], [16, -120, 14], [56, -124, 15], [120, -120, 17], [188, -134, 19], [204, -160, 20], [190, -186, 21], [150, -192, 22], [60, -196, 23], [0, -190, 23], [-40, -200, 22.5], [-78, -176, 20], [-80, -130, 16], [-60, -100, 12.5], [-84, -60, 8], [-80, -20, 3.5], [-46, 0, 1]],
    theme: 'sunset', terrain: { hills: 14 },
  },
  {
    id: 'piton', name: 'Piton Volcan', jp: '火山', time: 'Jour · carrousel du cratère', par: 36000,
    width: 15, runoff: 3.4,
    // tige à chicanes qui monte le flanc, carrousel autour du cratère, redescente par l'autre voie
    pts: [[40, 0, 1], [100, 0, 2.5], [130, -14, 4], [160, 0, 5.5], [250, 0, 10], [300, -16, 13], [334, -40, 15.5], [374, -48, 17], [416, -32, 18], [438, 8, 18.5], [432, 50, 18], [402, 80, 17], [360, 86, 16], [324, 70, 14.5], [296, 48, 13], [250, 46, 10.5], [190, 46, 7.5], [160, 60, 6], [130, 46, 4.5], [70, 46, 2.5], [14, 46, 1], [-8, 30, 0.5], [-6, 8, 0.5], [12, 0, 0.8]],
    theme: 'day', terrain: { hills: 10, sea: 'maxZ' },
  },
  {
    id: 'shiohama', name: 'Quai de Shiohama', jp: '汐浜埠頭', time: 'Aube · triangle rapide', par: 34000,
    width: 15, runoff: 3.2,
    // triangle du port : grande ligne droite, double apex, épingle au phare, pont en dos d'âne au retour
    pts: [[40, 0, 0], [200, 0, 0], [310, 0, 0], [350, -14, 0.5], [368, -44, 1], [362, -80, 2], [336, -120, 3], [290, -190, 4], [250, -250, 5], [232, -285, 5.5], [204, -298, 6], [176, -286, 6], [166, -256, 6.5], [160, -210, 8], [134, -176, 9], [104, -170, 9], [84, -140, 7.5], [60, -96, 4.5], [34, -52, 2], [10, -20, 0.5], [14, -2, 0]],
    theme: 'dawn', terrain: { hills: 3 },
  },
  {
    id: 'yukimi', name: 'Col de Yukimi', jp: '雪見峠', time: 'Neige · serpentin · grip réduit', par: 36000,
    width: 14, runoff: 3,
    grip: 0.88, // neige tassée : moins d'adhérence partout
    // serpentin de huit virages enchaînés en descente, remontée par la route du refuge
    pts: [[0, 0, 26], [29, -24, 25], [58, 0, 23.5], [87, 24, 22], [116, 0, 20.5], [145, -24, 19], [174, 0, 17.5], [203, 24, 16], [232, 0, 14.5], [261, -24, 13], [290, 0, 11.5], [319, 24, 10], [348, 0, 8.5], [377, -24, 7], [406, 0, 6], [435, 24, 5], [464, 0, 4.5], [500, 4, 4.5], [526, 30, 5], [520, 64, 6], [490, 84, 7], [420, 92, 9.5], [360, 92, 12], [330, 110, 13.5], [300, 140, 15], [260, 140, 16], [230, 110, 17], [200, 92, 18], [60, 92, 23], [0, 100, 25], [-40, 90, 26], [-56, 60, 26.5], [-44, 24, 26.5], [-20, 4, 26.2]],
    theme: 'snow', terrain: { hills: 18 },
  },
  {
    id: 'kaigan', name: 'Corniche de Kaigan', jp: '海岸線', time: 'Crépuscule · falaise et océan', par: 46000,
    width: 15, runoff: 3.4,
    // longue route du bord de mer, puis retour technique sur la falaise
    pts: [[0, 0, 7], [200, 30, 4], [400, 40, 2], [560, 20, 3], [640, -20, 6], [668, -70, 9.5], [640, -118, 13], [590, -120, 15], [550, -90, 16], [510, -110, 17], [470, -90, 18], [420, -60, 18.5], [370, -70, 19.5], [330, -100, 20.5], [280, -90, 21], [230, -60, 21], [170, -70, 20.5], [110, -100, 19.5], [50, -90, 18], [-10, -104, 16], [-46, -80, 13.5], [-50, -40, 10.5], [-30, -10, 8.5]],
    theme: 'dusk', terrain: { hills: 12, sea: 'maxZ' },
  },
];

// Catmull-Rom centripète fermée, échantillonnée à pas constant
function buildTrackData(def) {
  const P = def.pts;
  const n = P.length;
  const raw = [], rawH = [];
  const alt = (p) => p[2] || 0;
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let k = 0; k < 40; k++) {
      const t = k / 40;
      raw.push(catmull(p0, p1, p2, p3, t));
      // altitude : Catmull-Rom uniforme 1D sur le même paramètre
      const [h0, h1, h2, h3] = [alt(p0), alt(p1), alt(p2), alt(p3)];
      rawH.push(0.5 * (2 * h1 + (h2 - h0) * t + (2 * h0 - 5 * h1 + 4 * h2 - h3) * t * t + (3 * h1 - h0 - 3 * h2 + h3) * t * t * t));
    }
  }
  // longueur cumulée puis ré-échantillonnage à 1.5 m
  const cum = [0];
  for (let i = 1; i <= raw.length; i++) {
    const a = raw[i - 1], b = raw[i % raw.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[raw.length];
  const STEP = 1.5;
  const count = Math.floor(total / STEP);
  const step = total / count;
  const px = new Float32Array(count), pz = new Float32Array(count), hr = new Float32Array(count);
  let j = 0;
  for (let i = 0; i < count; i++) {
    const d = i * step;
    while (cum[j + 1] < d) j++;
    const a = raw[j], b = raw[(j + 1) % raw.length];
    const t = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
    px[i] = a[0] + (b[0] - a[0]) * t;
    pz[i] = a[1] + (b[1] - a[1]) * t;
    hr[i] = rawH[j] + (rawH[(j + 1) % raw.length] - rawH[j]) * t;
  }
  // altitude lissée sur ±24 m (deux passes) : pas de cassure de pente sous les roues
  let py = hr;
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(count), r = Math.round(24 / step);
    for (let i = 0; i < count; i++) { let s = 0; for (let k = -r; k <= r; k++) s += py[(i + k + count) % count]; out[i] = s / (2 * r + 1); }
    py = out;
  }
  const tx = new Float32Array(count), tz = new Float32Array(count), heading = new Float32Array(count), curv = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = (i - 1 + count) % count, b = (i + 1) % count;
    const dx = px[b] - px[a], dz = pz[b] - pz[a];
    const l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l; tz[i] = dz / l;
    heading[i] = Math.atan2(tz[i], tx[i]);
  }
  for (let i = 0; i < count; i++) {
    const a = (i - 3 + count) % count, b = (i + 3) % count;
    let dh = heading[b] - heading[a];
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    curv[i] = dh / (6 * step);
  }
  // lissage de la courbure
  const sc = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let s = 0;
    for (let k = -6; k <= 6; k++) s += curv[(i + k + count) % count];
    sc[i] = s / 13;
  }
  const track = { def, count, step, length: total, px, pz, py, tx, tz, heading, curv: sc, half: def.width / 2, wall: def.width / 2 + def.runoff };
  track.zones = findZones(track);
  track.terrain = buildTerrain(track);
  return track;
}

// ---------- relief : champ de hauteur du sol autour de la route ----------
// Grille de 8 m : près de la route, la hauteur est celle de la route (moyenne pondérée en 1/d⁴ des points du
// tracé, la route reste plate en travers) ; en s'éloignant, elle rejoint des collines douces puis le niveau 0
// au bord de la grille (raccord avec le sol lointain et l'eau). at(x, z) : hauteur bilinéaire ; grad : pente.
function buildTerrain(track) {
  const { count, px, pz, py, wall } = track;
  const opt = track.def.terrain || {};
  const CELL = 8, PAD = 240;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i++) { minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]); minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]); }
  const x0 = minX - PAD, z0 = minZ - PAD;
  const nx = Math.ceil((maxX - minX + PAD * 2) / CELL) + 1, nz = Math.ceil((maxZ - minZ + PAD * 2) / CELL) + 1;
  const h = new Float32Array(nx * nz), dist = new Float32Array(nx * nz);
  // points du tracé sous-échantillonnés (≈ 4,5 m)
  const S = [];
  for (let i = 0; i < count; i += 3) S.push(px[i], pz[i], py[i]);
  const hills = opt.hills || 0;
  const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let gz = 0; gz < nz; gz++) for (let gx = 0; gx < nx; gx++) {
    const x = x0 + gx * CELL, z = z0 + gz * CELL;
    let sw = 0, sh = 0, dm = Infinity;
    for (let k = 0; k < S.length; k += 3) {
      const dx = x - S[k], dz = z - S[k + 1], d2 = dx * dx + dz * dz;
      if (d2 < dm) dm = d2;
      const w = 1 / ((d2 + 4) * (d2 + 4));
      sw += w; sh += w * S[k + 2];
    }
    const d = Math.sqrt(dm), road = sh / sw;
    // collines : somme de sinus, nulles au bord de la grille et côté mer
    const edge = Math.min(gx, gz, nx - 1 - gx, nz - 1 - gz) * CELL;
    const mask = ss(0, 90, edge);
    // côté mer : le sol plonge au niveau 0 avant la plage (falaise si la route est haute)
    const sea = opt.sea === 'maxZ' ? ss(maxZ + 90, maxZ + 40, z) : opt.sea === 'minZ' ? ss(minZ - 90, minZ - 40, z) : 1;
    const n = 0.5 + 0.22 * Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017 - 0.7) + 0.16 * Math.sin(x * 0.047 - z * 0.039 + 2.1) + 0.12 * Math.cos(x * 0.009 + z * 0.012);
    const far = hills * n * mask;
    const f = ss(wall + 6, 150, d);
    // la route garde son altitude près d'elle, puis le sol rejoint les collines (et 0 au bord)
    h[gz * nx + gx] = (road * (1 - f) + far * f) * sea;
    dist[gz * nx + gx] = d;
  }
  function at(x, z) {
    let fx = (x - x0) / CELL, fz = (z - z0) / CELL;
    if (fx <= 0 || fz <= 0 || fx >= nx - 1 || fz >= nz - 1) return 0;
    const ix = fx | 0, iz = fz | 0; fx -= ix; fz -= iz;
    const a = iz * nx + ix;
    return (h[a] * (1 - fx) + h[a + 1] * fx) * (1 - fz) + (h[a + nx] * (1 - fx) + h[a + nx + 1] * fx) * fz;
  }
  // pente horizontale (dh/dx, dh/dz) par différences centrées
  function grad(x, z, out) {
    out[0] = (at(x + 1, z) - at(x - 1, z)) / 2;
    out[1] = (at(x, z + 1) - at(x, z - 1)) / 2;
    return out;
  }
  return { at, grad, x0, z0, nx, nz, cell: CELL, h, dist };
}

function catmull(p0, p1, p2, p3, t) {
  // centripète (alpha = 0.5)
  const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-4;
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a, b, ta, tb) => [((tb - u) * a[0] + (u - ta) * b[0]) / (tb - ta), ((tb - u) * a[1] + (u - ta) * b[1]) / (tb - ta)];
  const A1 = lerp(p0, p1, t0, t1), A2 = lerp(p1, p2, t1, t2), A3 = lerp(p2, p3, t2, t3);
  const B1 = lerp(A1, A2, t0, t2), B2 = lerp(A2, A3, t1, t3);
  return lerp(B1, B2, t1, t2);
}

// Virages et clips, sur le modèle des tracés officiels (Formula Drift, D1GP) : chaque virage porte une zone
// extérieure (pare-chocs arrière au mur) OU des points de corde (pare-chocs avant au cône), jamais les deux.
// Viser le mur extérieur puis la corde du même virage demanderait une voiture aussi large que la piste.
// Répartition : le premier virage après le départ est l'initiation, en zone extérieure ; ensuite les virages
// les plus serrés reçoivent les cordes, les plus larges les zones. Une épingle (≥ 140°) a deux cônes.
function findZones(track) {
  const turns = findTurns(track);
  const { count } = track;
  const at = (u, f) => (u.from + Math.round(u.len * f)) % count;
  const rest = turns.slice(1).sort((a, b) => a.radius - b.radius);
  const nInner = Math.max(2, Math.round(rest.length / 2));
  turns.forEach((u) => { u.type = 'outer'; });
  rest.slice(0, nInner).forEach((u) => { u.type = 'inner'; });
  const zones = [];
  turns.forEach((u, k) => {
    if (u.type === 'outer') {
      const half = Math.max(6, Math.round(u.len * 0.3));
      const mid = at(u, 0.45);
      zones.push({ type: 'outer', turn: k, side: -u.dir, from: (mid - half + count) % count, to: (mid + half) % count, mid, hit: false });
    } else {
      const spots = u.angle >= 140 * Math.PI / 180 ? [at(u, 0.35), at(u, 0.72)] : [u.apex];
      for (const c of spots) zones.push({ type: 'inner', turn: k, side: u.dir, from: (c - 5 + count) % count, to: (c + 5) % count, mid: c, hit: false });
    }
  });
  track.turns = turns;
  return zones;
}

// Virage = courbure soutenue (> 1/75 m⁻¹ sur plus de 18 m, plus de 0,6 rad), dans l'ordre de course depuis la ligne.
function findTurns(track) {
  const { count, curv, step } = track;
  const TH = 1 / 75;
  const turns = [];
  let i0 = -1;
  // démarre là où la courbure est faible pour ne pas couper un virage
  let start = 0;
  for (let i = 0; i < count; i++) if (Math.abs(curv[i]) < TH * 0.4) { start = i; break; }
  for (let k = 0; k <= count; k++) {
    const i = (start + k) % count;
    const on = Math.abs(curv[i]) > TH;
    if (on && i0 < 0) i0 = k;
    if ((!on || k === count) && i0 >= 0) {
      const len = k - i0;
      let turn = 0, peak = 0, apex = 0;
      for (let q = i0; q < k; q++) {
        const c = curv[(start + q) % count];
        turn += c * step;
        if (Math.abs(c) > peak) { peak = Math.abs(c); apex = (start + q) % count; }
      }
      if (len * step > 18 && Math.abs(turn) > 0.6) {
        turns.push({ from: (start + i0) % count, len, apex, dir: Math.sign(turn), angle: Math.abs(turn), radius: 1 / peak });
      }
      i0 = -1;
    }
  }
  return turns;
}

function inRange(i, from, to, count) {
  return from <= to ? i >= from && i <= to : i >= from || i <= to;
}

// Point le plus proche (recherche locale autour d'un indice connu)
function nearest(track, x, z, hint, radius) {
  const { count, px, pz } = track;
  let best = hint, bd = Infinity;
  const r = radius == null ? count : radius;
  for (let k = -r; k <= r; k++) {
    const i = ((hint + k) % count + count) % count;
    const dx = x - px[i], dz = z - pz[i];
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
    if (r === count && k >= count / 2) break;
  }
  // décalage latéral signé (positif = droite de la direction de course)
  const lat = (x - px[best]) * -track.tz[best] + (z - pz[best]) * track.tx[best];
  return { i: best, lat };
}

if (typeof module !== 'undefined') module.exports = { TRACKS, buildTrackData, buildTerrain, nearest, inRange };
