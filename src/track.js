// ===== Pistes : tracé, échantillonnage, zones de clipping =====
const TRACKS = [
  {
    id: 'minato', name: 'Docks de Minato', jp: '港埠頭', time: 'Nuit · port', par: 32000,
    width: 15, runoff: 3.2,
    pts: [[0, 0], [170, -6], [236, 26], [252, 92], [214, 136], [150, 128], [104, 158], [118, 214], [64, 258], [-36, 250], [-92, 196], [-66, 128], [-124, 86], [-122, 22], [-66, -8]],
    theme: 'night',
  },
  {
    id: 'akane', name: 'Col d’Akane', jp: '茜峠', time: 'Couchant · col', par: 33000,
    width: 14, runoff: 2.8,
    pts: [[0, 0], [120, -38], [214, -18], [262, 56], [222, 122], [138, 106], [72, 150], [104, 232], [30, 296], [-74, 266], [-62, 188], [-136, 132], [-170, 52], [-96, 6]],
    theme: 'sunset',
  },
  {
    id: 'piton', name: 'Piton Volcan', jp: '火山', time: 'Jour · océan', par: 46000,
    width: 15, runoff: 3.4,
    pts: [[0, 0], [150, 18], [232, -36], [306, 8], [290, 110], [196, 140], [134, 218], [34, 236], [-38, 176], [6, 102], [-64, 62], [-134, 94], [-176, 22], [-104, -42]],
    theme: 'day',
  },
  {
    id: 'shiohama', name: 'Quai de Shiohama', jp: '汐浜埠頭', time: 'Aube · port', par: 42000,
    width: 15, runoff: 3.2,
    pts: [[0, 0], [182, 0], [260, 52], [247, 143], [156, 156], [117, 221], [195, 286], [169, 377], [52, 390], [-26, 325], [-104, 364], [-195, 299], [-169, 195], [-78, 156], [-143, 78], [-91, 13]],
    theme: 'dawn',
  },
  {
    id: 'yukimi', name: 'Col de Yukimi', jp: '雪見峠', time: 'Neige · col · grip réduit', par: 34000,
    width: 14, runoff: 3,
    grip: 0.88, // neige tassée : moins d'adhérence partout
    pts: [[0, 0], [143, -26], [234, 39], [195, 130], [260, 208], [221, 312], [104, 325], [52, 247], [-39, 299], [-143, 260], [-117, 156], [-195, 91], [-143, 0], [-65, -39]],
    theme: 'snow',
  },
  {
    id: 'kaigan', name: 'Corniche de Kaigan', jp: '海岸線', time: 'Crépuscule · océan', par: 46000,
    width: 15, runoff: 3.4,
    pts: [[0, 0], [234, -13], [351, 52], [338, 169], [234, 195], [156, 143], [78, 195], [117, 299], [13, 364], [-117, 325], [-182, 221], [-104, 143], [-208, 78], [-156, -13]],
    theme: 'dusk',
  },
];

// Catmull-Rom centripète fermée, échantillonnée à pas constant
function buildTrackData(def) {
  const P = def.pts;
  const n = P.length;
  const raw = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let k = 0; k < 40; k++) {
      const t = k / 40;
      raw.push(catmull(p0, p1, p2, p3, t));
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
  const px = new Float32Array(count), pz = new Float32Array(count);
  let j = 0;
  for (let i = 0; i < count; i++) {
    const d = i * step;
    while (cum[j + 1] < d) j++;
    const a = raw[j], b = raw[(j + 1) % raw.length];
    const t = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
    px[i] = a[0] + (b[0] - a[0]) * t;
    pz[i] = a[1] + (b[1] - a[1]) * t;
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
  const track = { def, count, step, length: total, px, pz, tx, tz, heading, curv: sc, half: def.width / 2, wall: def.width / 2 + def.runoff };
  track.zones = findZones(track);
  return track;
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

// Virages : courbure soutenue. Zone extérieure (arrière près du bord extérieur) et point de corde intérieur (avant).
function findZones(track) {
  const { count, curv, step } = track;
  const zones = [];
  const TH = 1 / 75;
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
      let turn = 0;
      for (let q = i0; q < k; q++) turn += curv[(start + q) % count] * step;
      if (len * step > 18 && Math.abs(turn) > 0.6) {
        const mid = (start + Math.floor((i0 + k) / 2)) % count;
        const sign = Math.sign(turn);
        const span = Math.max(8, Math.floor(len * 0.32));
        zones.push({ type: 'outer', side: -sign, from: (mid - span + count) % count, to: (mid + span) % count, mid, hit: false });
        const apex = (start + i0 + Math.floor(len * 0.55)) % count;
        zones.push({ type: 'inner', side: sign, from: (apex - 5 + count) % count, to: (apex + 5) % count, mid: apex, hit: false });
      }
      i0 = -1;
    }
  }
  return zones;
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

if (typeof module !== 'undefined') module.exports = { TRACKS, buildTrackData, nearest, inRange };
