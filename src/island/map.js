// ===== L'île : monde ouvert continu (réseau routier, relief, mer, six lieux de l'aventure) =====
// Partie pure (données, routes, terrain, recherche de route) testable sous Node ; buildIslandWorld (Three.js) plus bas.
// Repère : x vers l'est, z vers le sud, y vers le haut (m). Les routes se croisent seulement aux nœuds (carrefours).
import { Economy } from '../progress/economy.js';

export const ISLE = {
  id: 'ile',
  name: 'L’île de Sideways',
  width: 12,
  // forme de l'île : ellipse (au-delà, la mer)
  shape: { cx: 30, cz: 20, rx: 1060, rz: 730 },
  volcano: { x: 90, z: 170, h: 110, r: 330 },
  // nœuds : [x, z, altitude] ; les six lieux de l'aventure sont des nœuds
  nodes: {
    M: [-760, -260, 2],
    S: [40, -520, 2],
    A: [780, -330, 38],
    K: [820, 300, 16],
    P: [60, 120, 52],
    Y: [-700, 360, 58],
    J1: [-330, -430, 3],
    J2: [420, -40, 32],
    J3: [-300, 140, 30],
    J4: [60, 540, 6],
  },
  hubs: { minato: 'M', shiohama: 'S', akane: 'A', kaigan: 'K', piton: 'P', yukimi: 'Y' },
  // arêtes : [de, vers, points de passage [x, z, altitude]]
  edges: [
    [
      'M',
      'J1',
      [
        [-610, -370, 2],
        [-470, -430, 3],
      ],
    ], // quais du nord
    ['J1', 'S', [[-170, -500, 2]]],
    [
      'S',
      'A',
      [
        [260, -580, 6],
        [480, -540, 18],
        [650, -450, 30],
      ],
    ], // côte nord-est, montée
    [
      'A',
      'K',
      [
        [890, -200, 34],
        [820, -110, 30],
        [905, 0, 26],
        [835, 100, 22],
        [905, 200, 19],
      ],
    ], // lacets de la falaise est
    [
      'K',
      'J4',
      [
        [700, 450, 11],
        [430, 575, 7],
        [240, 585, 5],
      ],
    ], // corniche sud
    [
      'J4',
      'Y',
      [
        [-160, 590, 10],
        [-380, 545, 24],
        [-560, 480, 42],
      ],
    ], // montée vers le col enneigé
    [
      'Y',
      'M',
      [
        [-830, 240, 52],
        [-880, 100, 40],
        [-790, -40, 26],
        [-880, -160, 12],
      ],
    ], // descente ouest
    [
      'S',
      'P',
      [
        [60, -380, 8],
        [-20, -260, 18],
        [80, -140, 30],
        [0, -20, 42],
      ],
    ], // route du volcan, nord
    [
      'P',
      'J2',
      [
        [240, 80, 47],
        [340, 20, 40],
      ],
    ],
    [
      'J2',
      'A',
      [
        [560, -120, 35],
        [690, -240, 37],
      ],
    ],
    [
      'J2',
      'K',
      [
        [560, 120, 28],
        [700, 220, 21],
      ],
    ],
    [
      'P',
      'J3',
      [
        [-100, 190, 45],
        [-200, 165, 38],
      ],
    ],
    [
      'J3',
      'M',
      [
        [-430, 40, 22],
        [-560, -80, 12],
        [-680, -180, 5],
      ],
    ],
    [
      'J3',
      'Y',
      [
        [-430, 260, 40],
        [-570, 330, 51],
      ],
    ],
    [
      'P',
      'J4',
      [
        [150, 260, 43],
        [180, 380, 32],
        [90, 440, 22],
        [-10, 480, 13],
      ],
    ], // descente sud du volcan, en lacet
  ],
  // daruma dorés : [arête, position 0..1, côté]
  daruma: [
    [0, 0.5, 1],
    [2, 0.55, -1],
    [3, 0.35, 1],
    [3, 0.8, -1],
    [4, 0.5, 1],
    [5, 0.7, -1],
    [6, 0.45, 1],
    [7, 0.6, -1],
    [9, 0.5, 1],
    [11, 0.5, -1],
    [12, 0.4, 1],
    [14, 0.5, -1],
  ],
  dReward: 500,
};

const iss = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function isleCatmull(p0, p1, p2, p3, t) {
  const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-4;
  const t0 = 0,
    t1 = t0 + d(p0, p1),
    t2 = t1 + d(p1, p2),
    t3 = t2 + d(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const L = (a, b, ta, tb) => [
    ((tb - u) * a[0] + (u - ta) * b[0]) / (tb - ta),
    ((tb - u) * a[1] + (u - ta) * b[1]) / (tb - ta),
  ];
  const A1 = L(p0, p1, t0, t1),
    A2 = L(p1, p2, t1, t2),
    A3 = L(p2, p3, t2, t3);
  return L(L(A1, A2, t0, t2), L(A2, A3, t1, t3), t1, t2);
}

// une arête → polyligne échantillonnée tous les 1,5 m (Catmull-Rom centripète ouverte, altitude lissée, nœuds exacts)
function sampleEdge(P) {
  const n = P.length,
    ext = [
      [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1], P[0][2]],
      ...P,
      [2 * P[n - 1][0] - P[n - 2][0], 2 * P[n - 1][1] - P[n - 2][1], P[n - 1][2]],
    ];
  const raw = [];
  for (let i = 1; i < n; i++) {
    const [p0, p1, p2, p3] = [ext[i - 1], ext[i], ext[i + 1], ext[i + 2]];
    for (let k = 0; k < 30; k++) {
      const t = k / 30,
        q = isleCatmull(p0, p1, p2, p3, t);
      const h =
        0.5 *
        (2 * p1[2] +
          (p2[2] - p0[2]) * t +
          (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * t * t +
          (3 * p1[2] - p0[2] - 3 * p2[2] + p3[2]) * t * t * t);
      raw.push([q[0], q[1], h]);
    }
  }
  raw.push(P[n - 1].slice());
  const cum = [0];
  for (let i = 1; i < raw.length; i++)
    cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  const total = cum[cum.length - 1],
    count = Math.max(2, Math.round(total / 1.5) + 1),
    step = total / (count - 1);
  const px = new Float32Array(count),
    pz = new Float32Array(count),
    hy = new Float32Array(count);
  let j = 0;
  for (let i = 0; i < count; i++) {
    const d = Math.min(i * step, total);
    while (j < raw.length - 2 && cum[j + 1] < d) j++;
    const t = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
    px[i] = raw[j][0] + (raw[j + 1][0] - raw[j][0]) * t;
    pz[i] = raw[j][1] + (raw[j + 1][1] - raw[j][1]) * t;
    hy[i] = raw[j][2] + (raw[j + 1][2] - raw[j][2]) * t;
  }
  // lissage de l'altitude (±18 m), extrémités tenues à la hauteur des nœuds
  const py = new Float32Array(count),
    r = 12;
  for (let i = 0; i < count; i++) {
    const w = Math.min(r, i, count - 1 - i);
    let s = 0;
    for (let k = -w; k <= w; k++) s += hy[i + k];
    py[i] = s / (2 * w + 1);
  }
  const tx = new Float32Array(count),
    tz = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 1),
      b = Math.min(count - 1, i + 1);
    const dx = px[b] - px[a],
      dz = pz[b] - pz[a],
      l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l;
    tz[i] = dz / l;
  }
  return { count, step, length: total, px, pz, py, tx, tz };
}

export function buildIsland(def) {
  const D = def || ISLE,
    half = D.width / 2,
    wall = half + 3;
  const node = (k) => D.nodes[k];
  const roads = D.edges.map(([a, b, ctrl]) => ({ a, b, ...sampleEdge([node(a), ...ctrl, node(b)]) }));
  // tous les points de route à la suite : index global → (route, point)
  let N = 0;
  for (const r of roads) {
    r.off = N;
    N += r.count;
  }
  const X = new Float32Array(N),
    Z = new Float32Array(N),
    Y = new Float32Array(N),
    TX = new Float32Array(N),
    TZ = new Float32Array(N),
    E = new Uint16Array(N);
  roads.forEach((r, e) => {
    X.set(r.px, r.off);
    Z.set(r.pz, r.off);
    Y.set(r.py, r.off);
    TX.set(r.tx, r.off);
    TZ.set(r.tz, r.off);
    E.fill(e, r.off, r.off + r.count);
  });
  const { cx, cz, rx, rz } = D.shape;
  const x0 = cx - rx * 1.3,
    z0 = cz - rz * 1.35,
    x1 = cx + rx * 1.3,
    z1 = cz + rz * 1.35;
  // grille de recherche (cases de 24 m)
  const HC = 24,
    hx = Math.ceil((x1 - x0) / HC),
    hz = Math.ceil((z1 - z0) / HC);
  const cells = Array.from({ length: hx * hz }, () => []);
  const cellOf = (x, z) => {
    const ix = Math.floor((x - x0) / HC),
      iz = Math.floor((z - z0) / HC);
    return ix < 0 || iz < 0 || ix >= hx || iz >= hz ? -1 : iz * hx + ix;
  };
  for (let i = 0; i < N; i++) {
    const c = cellOf(X[i], Z[i]);
    if (c >= 0) cells[c].push(i);
  }
  // route la plus proche à moins de ~70 m : { i, d, lat, edge } ; d = Infinity au-delà
  const res = { i: -1, d: Infinity, lat: 0, edge: -1 };
  function nearestRoad(x, z, out) {
    const o = out || res;
    o.i = -1;
    o.d = Infinity;
    const ix = Math.floor((x - x0) / HC),
      iz = Math.floor((z - z0) / HC);
    let best = Infinity;
    for (let a = -3; a <= 3; a++)
      for (let b = -3; b <= 3; b++) {
        const cx2 = ix + a,
          cz2 = iz + b;
        if (cx2 < 0 || cz2 < 0 || cx2 >= hx || cz2 >= hz) continue;
        for (const i of cells[cz2 * hx + cx2]) {
          const dx = x - X[i],
            dz = z - Z[i],
            d2 = dx * dx + dz * dz;
          if (d2 < best) {
            best = d2;
            o.i = i;
          }
        }
      }
    if (o.i >= 0) {
      o.d = Math.sqrt(best);
      o.lat = (x - X[o.i]) * -TZ[o.i] + (z - Z[o.i]) * TX[o.i];
      o.edge = E[o.i];
    }
    return o;
  }
  // ---------- terrain ----------
  const V = D.volcano;
  const ellipse = (x, z) => Math.hypot((x - cx) / rx, (z - cz) / rz);
  function base(x, z) {
    const e = ellipse(x, z);
    if (e >= 1) return -8 * Math.min(1, (e - 1) * 6);
    const dv2 = (x - V.x) ** 2 + (z - V.z) ** 2;
    const volc = V.h * Math.exp(-dv2 / (V.r * V.r)) * (1 - 0.35 * Math.exp(-dv2 / (60 * 60))); // cratère
    const hills =
      14 *
      (0.5 +
        0.25 * Math.sin(x * 0.011 + 1) * Math.cos(z * 0.013 - 0.5) +
        0.15 * Math.sin(x * 0.027 - z * 0.021 + 2) +
        0.1 * Math.cos(x * 0.005 + z * 0.007));
    return (volc + hills) * iss(1.0, 0.8, e);
  }
  const CELL = 10,
    nx = Math.ceil((x1 - x0) / CELL) + 1,
    nz = Math.ceil((z1 - z0) / CELL) + 1;
  const h = new Float32Array(nx * nz),
    dist = new Float32Array(nx * nz);
  const TC = 48,
    tx2 = Math.ceil((x1 - x0) / TC),
    tz2 = Math.ceil((z1 - z0) / TC),
    tcells = Array.from({ length: tx2 * tz2 }, () => []);
  for (let i = 0; i < N; i += 4) {
    const ix = Math.floor((X[i] - x0) / TC),
      iz = Math.floor((Z[i] - z0) / TC);
    if (ix >= 0 && iz >= 0 && ix < tx2 && iz < tz2) tcells[iz * tx2 + ix].push(i);
  }
  const R = 130;
  for (let gz = 0; gz < nz; gz++)
    for (let gx = 0; gx < nx; gx++) {
      const x = x0 + gx * CELL,
        z = z0 + gz * CELL,
        k = gz * nx + gx;
      const ix = Math.floor((x - x0) / TC),
        iz = Math.floor((z - z0) / TC);
      let sw = 0,
        sh = 0,
        dm = Infinity;
      for (let a = -3; a <= 3; a++)
        for (let b = -3; b <= 3; b++) {
          const cx2 = ix + a,
            cz2 = iz + b;
          if (cx2 < 0 || cz2 < 0 || cx2 >= tx2 || cz2 >= tz2) continue;
          for (const i of tcells[cz2 * tx2 + cx2]) {
            const dx = x - X[i],
              dz = z - Z[i],
              d2 = dx * dx + dz * dz;
            if (d2 > R * R) continue;
            if (d2 < dm) dm = d2;
            const w = 1 / ((d2 + 4) * (d2 + 4));
            sw += w;
            sh += w * Y[i];
          }
        }
      const d = Math.sqrt(dm),
        b0 = base(x, z);
      h[k] = sw > 0 ? (sh / sw) * (1 - iss(wall + 4, 110, d)) + b0 * iss(wall + 4, 110, d) : b0;
      dist[k] = d;
    }
  function at(x, z) {
    let fx = (x - x0) / CELL,
      fz = (z - z0) / CELL;
    if (fx <= 0 || fz <= 0 || fx >= nx - 1 || fz >= nz - 1) return -8;
    const ix = fx | 0,
      iz = fz | 0;
    fx -= ix;
    fz -= iz;
    const a = iz * nx + ix;
    return (h[a] * (1 - fx) + h[a + 1] * fx) * (1 - fz) + (h[a + nx] * (1 - fx) + h[a + nx + 1] * fx) * fz;
  }
  function grad(x, z, out) {
    out[0] = (at(x + 1, z) - at(x - 1, z)) / 2;
    out[1] = (at(x, z + 1) - at(x, z - 1)) / 2;
    return out;
  }
  const terrain = { at, grad, x0, z0, nx, nz, cell: CELL, h, dist };
  // lieux : point du nœud, cap le long de la première route qui en part
  const hubs = {};
  for (const [tid, k] of Object.entries(D.hubs)) {
    const [x, z] = node(k);
    const e = roads.findIndex((r) => r.a === k || r.b === k),
      r = roads[e],
      first = r.a === k;
    const i = first ? 0 : r.count - 1,
      sgn = first ? 1 : -1;
    hubs[tid] = { x, z, heading: Math.atan2(r.tz[i] * sgn, r.tx[i] * sgn), node: k };
  }
  const daruma = D.daruma.map(([e, f, side]) => {
    const r = roads[e],
      i = Math.round(f * (r.count - 1)),
      lat = side * (half - 2);
    return { x: r.px[i] - r.tz[i] * lat, z: r.pz[i] + r.tx[i] * lat };
  });
  return {
    def: D,
    half,
    wall,
    roads,
    N,
    X,
    Z,
    Y,
    TX,
    TZ,
    E,
    nearestRoad,
    terrain,
    base,
    ellipse,
    hubs,
    daruma,
    bounds: { x0, z0, x1, z1 },
  };
}

// collecte d'un daruma doré : récompense une seule fois (profil.isle.found)
export function isleCollect(p, k) {
  if (!p.isle || typeof p.isle !== 'object') p.isle = { found: {} };
  if (!p.isle.found || typeof p.isle.found !== 'object') p.isle.found = {};
  if (k < 0 || k >= ISLE.daruma.length || p.isle.found[k]) return 0;
  p.isle.found[k] = true;
  Economy.credit(p, 'Daruma doré · l’île', ISLE.dReward);
  return ISLE.dReward;
}
export const isleFound = (p) =>
  p.isle && p.isle.found ? Object.keys(p.isle.found).filter((k) => p.isle.found[k]).length : 0;
