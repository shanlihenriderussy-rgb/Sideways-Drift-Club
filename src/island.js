// ===== L'île : monde ouvert continu (réseau routier, relief, mer, six lieux de l'aventure) =====
// Partie pure (données, routes, terrain, recherche de route) testable sous Node ; buildIslandWorld (Three.js) plus bas.
// Repère : x vers l'est, z vers le sud, y vers le haut (m). Les routes se croisent seulement aux nœuds (carrefours).

const ISLE = {
  id: 'ile', name: 'L’île de Sideways', width: 12,
  // forme de l'île : ellipse (au-delà, la mer)
  shape: { cx: 30, cz: 20, rx: 1060, rz: 730 },
  volcano: { x: 90, z: 170, h: 110, r: 330 },
  // nœuds : [x, z, altitude] ; les six lieux de l'aventure sont des nœuds
  nodes: {
    M: [-760, -260, 2], S: [40, -520, 2], A: [780, -330, 38], K: [820, 300, 16], P: [60, 120, 52], Y: [-700, 360, 58],
    J1: [-330, -430, 3], J2: [420, -40, 32], J3: [-300, 140, 30], J4: [60, 540, 6],
  },
  hubs: { minato: 'M', shiohama: 'S', akane: 'A', kaigan: 'K', piton: 'P', yukimi: 'Y' },
  // arêtes : [de, vers, points de passage [x, z, altitude]]
  edges: [
    ['M', 'J1', [[-610, -370, 2], [-470, -430, 3]]], // quais du nord
    ['J1', 'S', [[-170, -500, 2]]],
    ['S', 'A', [[260, -580, 6], [480, -540, 18], [650, -450, 30]]], // côte nord-est, montée
    ['A', 'K', [[890, -200, 34], [820, -110, 30], [905, 0, 26], [835, 100, 22], [905, 200, 19]]], // lacets de la falaise est
    ['K', 'J4', [[700, 450, 11], [430, 575, 7], [240, 585, 5]]], // corniche sud
    ['J4', 'Y', [[-160, 590, 10], [-380, 545, 24], [-560, 480, 42]]], // montée vers le col enneigé
    ['Y', 'M', [[-830, 240, 52], [-880, 100, 40], [-790, -40, 26], [-880, -160, 12]]], // descente ouest
    ['S', 'P', [[60, -380, 8], [-20, -260, 18], [80, -140, 30], [0, -20, 42]]], // route du volcan, nord
    ['P', 'J2', [[240, 80, 47], [340, 20, 40]]],
    ['J2', 'A', [[560, -120, 35], [690, -240, 37]]],
    ['J2', 'K', [[560, 120, 28], [700, 220, 21]]],
    ['P', 'J3', [[-100, 190, 45], [-200, 165, 38]]],
    ['J3', 'M', [[-430, 40, 22], [-560, -80, 12], [-680, -180, 5]]],
    ['J3', 'Y', [[-430, 260, 40], [-570, 330, 51]]],
    ['P', 'J4', [[150, 260, 43], [180, 380, 32], [90, 440, 22], [-10, 480, 13]]], // descente sud du volcan, en lacet
  ],
  // daruma dorés : [arête, position 0..1, côté]
  daruma: [[0, 0.5, 1], [2, 0.55, -1], [3, 0.35, 1], [3, 0.8, -1], [4, 0.5, 1], [5, 0.7, -1], [6, 0.45, 1], [7, 0.6, -1], [9, 0.5, 1], [11, 0.5, -1], [12, 0.4, 1], [14, 0.5, -1]],
  dReward: 500,
};

const iss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function isleCatmull(p0, p1, p2, p3, t) {
  const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-4;
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const L = (a, b, ta, tb) => [((tb - u) * a[0] + (u - ta) * b[0]) / (tb - ta), ((tb - u) * a[1] + (u - ta) * b[1]) / (tb - ta)];
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  return L(L(A1, A2, t0, t2), L(A2, A3, t1, t3), t1, t2);
}

// une arête → polyligne échantillonnée tous les 1,5 m (Catmull-Rom centripète ouverte, altitude lissée, nœuds exacts)
function sampleEdge(P) {
  const n = P.length, ext = [[2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1], P[0][2]], ...P, [2 * P[n - 1][0] - P[n - 2][0], 2 * P[n - 1][1] - P[n - 2][1], P[n - 1][2]]];
  const raw = [];
  for (let i = 1; i < n; i++) {
    const [p0, p1, p2, p3] = [ext[i - 1], ext[i], ext[i + 1], ext[i + 2]];
    for (let k = 0; k < 30; k++) {
      const t = k / 30, q = isleCatmull(p0, p1, p2, p3, t);
      const h = 0.5 * (2 * p1[2] + (p2[2] - p0[2]) * t + (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * t * t + (3 * p1[2] - p0[2] - 3 * p2[2] + p3[2]) * t * t * t);
      raw.push([q[0], q[1], h]);
    }
  }
  raw.push(P[n - 1].slice());
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  const total = cum[cum.length - 1], count = Math.max(2, Math.round(total / 1.5) + 1), step = total / (count - 1);
  const px = new Float32Array(count), pz = new Float32Array(count), hy = new Float32Array(count);
  let j = 0;
  for (let i = 0; i < count; i++) {
    const d = Math.min(i * step, total);
    while (j < raw.length - 2 && cum[j + 1] < d) j++;
    const t = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
    px[i] = raw[j][0] + (raw[j + 1][0] - raw[j][0]) * t; pz[i] = raw[j][1] + (raw[j + 1][1] - raw[j][1]) * t; hy[i] = raw[j][2] + (raw[j + 1][2] - raw[j][2]) * t;
  }
  // lissage de l'altitude (±18 m), extrémités tenues à la hauteur des nœuds
  const py = new Float32Array(count), r = 12;
  for (let i = 0; i < count; i++) {
    const w = Math.min(r, i, count - 1 - i);
    let s = 0; for (let k = -w; k <= w; k++) s += hy[i + k];
    py[i] = s / (2 * w + 1);
  }
  const tx = new Float32Array(count), tz = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 1), b = Math.min(count - 1, i + 1);
    const dx = px[b] - px[a], dz = pz[b] - pz[a], l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l; tz[i] = dz / l;
  }
  return { count, step, length: total, px, pz, py, tx, tz };
}

function buildIsland(def) {
  const D = def || ISLE, half = D.width / 2, wall = half + 3;
  const node = (k) => D.nodes[k];
  const roads = D.edges.map(([a, b, ctrl]) => ({ a, b, ...sampleEdge([node(a), ...ctrl, node(b)]) }));
  // tous les points de route à la suite : index global → (route, point)
  let N = 0; for (const r of roads) { r.off = N; N += r.count; }
  const X = new Float32Array(N), Z = new Float32Array(N), Y = new Float32Array(N), TX = new Float32Array(N), TZ = new Float32Array(N), E = new Uint16Array(N);
  roads.forEach((r, e) => { X.set(r.px, r.off); Z.set(r.pz, r.off); Y.set(r.py, r.off); TX.set(r.tx, r.off); TZ.set(r.tz, r.off); E.fill(e, r.off, r.off + r.count); });
  const { cx, cz, rx, rz } = D.shape;
  const x0 = cx - rx * 1.3, z0 = cz - rz * 1.35, x1 = cx + rx * 1.3, z1 = cz + rz * 1.35;
  // grille de recherche (cases de 24 m)
  const HC = 24, hx = Math.ceil((x1 - x0) / HC), hz = Math.ceil((z1 - z0) / HC);
  const cells = Array.from({ length: hx * hz }, () => []);
  const cellOf = (x, z) => { const ix = Math.floor((x - x0) / HC), iz = Math.floor((z - z0) / HC); return ix < 0 || iz < 0 || ix >= hx || iz >= hz ? -1 : iz * hx + ix; };
  for (let i = 0; i < N; i++) { const c = cellOf(X[i], Z[i]); if (c >= 0) cells[c].push(i); }
  // route la plus proche à moins de ~70 m : { i, d, lat, edge } ; d = Infinity au-delà
  const res = { i: -1, d: Infinity, lat: 0, edge: -1 };
  function nearestRoad(x, z, out) {
    const o = out || res;
    o.i = -1; o.d = Infinity;
    const ix = Math.floor((x - x0) / HC), iz = Math.floor((z - z0) / HC);
    let best = Infinity;
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
      const cx2 = ix + a, cz2 = iz + b;
      if (cx2 < 0 || cz2 < 0 || cx2 >= hx || cz2 >= hz) continue;
      for (const i of cells[cz2 * hx + cx2]) { const dx = x - X[i], dz = z - Z[i], d2 = dx * dx + dz * dz; if (d2 < best) { best = d2; o.i = i; } }
    }
    if (o.i >= 0) { o.d = Math.sqrt(best); o.lat = (x - X[o.i]) * -TZ[o.i] + (z - Z[o.i]) * TX[o.i]; o.edge = E[o.i]; }
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
    const hills = 14 * (0.5 + 0.25 * Math.sin(x * 0.011 + 1) * Math.cos(z * 0.013 - 0.5) + 0.15 * Math.sin(x * 0.027 - z * 0.021 + 2) + 0.1 * Math.cos(x * 0.005 + z * 0.007));
    return (volc + hills) * iss(1.0, 0.8, e);
  }
  const CELL = 10, nx = Math.ceil((x1 - x0) / CELL) + 1, nz = Math.ceil((z1 - z0) / CELL) + 1;
  const h = new Float32Array(nx * nz), dist = new Float32Array(nx * nz);
  const TC = 48, tx2 = Math.ceil((x1 - x0) / TC), tz2 = Math.ceil((z1 - z0) / TC), tcells = Array.from({ length: tx2 * tz2 }, () => []);
  for (let i = 0; i < N; i += 4) { const ix = Math.floor((X[i] - x0) / TC), iz = Math.floor((Z[i] - z0) / TC); if (ix >= 0 && iz >= 0 && ix < tx2 && iz < tz2) tcells[iz * tx2 + ix].push(i); }
  const R = 130;
  for (let gz = 0; gz < nz; gz++) for (let gx = 0; gx < nx; gx++) {
    const x = x0 + gx * CELL, z = z0 + gz * CELL, k = gz * nx + gx;
    const ix = Math.floor((x - x0) / TC), iz = Math.floor((z - z0) / TC);
    let sw = 0, sh = 0, dm = Infinity;
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
      const cx2 = ix + a, cz2 = iz + b;
      if (cx2 < 0 || cz2 < 0 || cx2 >= tx2 || cz2 >= tz2) continue;
      for (const i of tcells[cz2 * tx2 + cx2]) {
        const dx = x - X[i], dz = z - Z[i], d2 = dx * dx + dz * dz;
        if (d2 > R * R) continue;
        if (d2 < dm) dm = d2;
        const w = 1 / ((d2 + 4) * (d2 + 4)); sw += w; sh += w * Y[i];
      }
    }
    const d = Math.sqrt(dm), b0 = base(x, z);
    h[k] = sw > 0 ? (sh / sw) * (1 - iss(wall + 4, 110, d)) + b0 * iss(wall + 4, 110, d) : b0;
    dist[k] = d;
  }
  function at(x, z) {
    let fx = (x - x0) / CELL, fz = (z - z0) / CELL;
    if (fx <= 0 || fz <= 0 || fx >= nx - 1 || fz >= nz - 1) return -8;
    const ix = fx | 0, iz = fz | 0; fx -= ix; fz -= iz;
    const a = iz * nx + ix;
    return (h[a] * (1 - fx) + h[a + 1] * fx) * (1 - fz) + (h[a + nx] * (1 - fx) + h[a + nx + 1] * fx) * fz;
  }
  function grad(x, z, out) { out[0] = (at(x + 1, z) - at(x - 1, z)) / 2; out[1] = (at(x, z + 1) - at(x, z - 1)) / 2; return out; }
  const terrain = { at, grad, x0, z0, nx, nz, cell: CELL, h, dist };
  // lieux : point du nœud, cap le long de la première route qui en part
  const hubs = {};
  for (const [tid, k] of Object.entries(D.hubs)) {
    const [x, z] = node(k);
    const e = roads.findIndex((r) => r.a === k || r.b === k), r = roads[e], first = r.a === k;
    const i = first ? 0 : r.count - 1, sgn = first ? 1 : -1;
    hubs[tid] = { x, z, heading: Math.atan2(r.tz[i] * sgn, r.tx[i] * sgn), node: k };
  }
  const daruma = D.daruma.map(([e, f, side]) => { const r = roads[e], i = Math.round(f * (r.count - 1)), lat = side * (half - 2); return { x: r.px[i] - r.tz[i] * lat, z: r.pz[i] + r.tx[i] * lat }; });
  return { def: D, half, wall, roads, N, X, Z, Y, TX, TZ, E, nearestRoad, terrain, base, ellipse, hubs, daruma, bounds: { x0, z0, x1, z1 } };
}

// collecte d'un daruma doré : récompense une seule fois (profil.isle.found)
function isleCollect(p, k) {
  if (!p.isle || typeof p.isle !== 'object') p.isle = { found: {} };
  if (!p.isle.found || typeof p.isle.found !== 'object') p.isle.found = {};
  if (k < 0 || k >= ISLE.daruma.length || p.isle.found[k]) return 0;
  p.isle.found[k] = true;
  (typeof Economy !== 'undefined' ? Economy : require('./economy.js')).credit(p, 'Daruma doré · l’île', ISLE.dReward);
  return ISLE.dReward;
}
const isleFound = (p) => (p.isle && p.isle.found ? Object.keys(p.isle.found).filter((k) => p.isle.found[k]).length : 0);


// ---------- rendu Three.js de l'île (navigateur seulement) ----------
// Même interface que buildWorld : { group, sun, theme, update(t, cam), dispose, heightAt } + daruma et portes.
function buildIslandWorld(scene, I, quality) {
  const T = Object.assign({}, THEMES.day, { fogNear: 320, fogFar: 1700, fog: 0xc4dceb, exposure: 1.0 });
  const group = new THREE.Group();
  scene.add(group);
  const disposables = [], animated = [];
  const keep = (o) => { disposables.push(o); return o; };
  const R = rng(974), ter = I.terrain, at = ter.at, half = I.half;
  const ssw = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hubList = Object.entries(I.hubs);
  const nearestHub = (x, z) => { let best = null, bd = Infinity; for (const [id, hb] of hubList) { const d = Math.hypot(x - hb.x, z - hb.z); if (d < bd) { bd = d; best = id; } } return [best, bd]; };
  const V = I.def.volcano;

  // ciel (suit la caméra), brouillard, lumières
  const { mesh: sky, mat: skyMat } = makeSky(T, 'day', keep);
  animated.push(skyMat); group.add(sky);
  scene.fog = new THREE.Fog(T.fog, T.fogNear, T.fogFar);
  scene.background = new THREE.Color(T.fog);
  group.add(new THREE.HemisphereLight(T.hemiSky, T.hemiGround, T.hemi));
  const sun = new THREE.DirectionalLight(T.dirColor, T.dir);
  sun.position.set(...T.sun).multiplyScalar(60);
  if (quality.shadows) {
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 160;
    sun.shadow.bias = -0.0006;
  }
  group.add(sun); group.add(sun.target);

  // ---------- sol : grille du terrain, couleurs par région ----------
  {
    const { nx, nz, x0, z0, cell, h, dist } = ter;
    const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), col = new Float32Array(nx * nz * 3), idx = [];
    const C = (hex) => new THREE.Color(hex);
    const sand = C(0xc9b58c), grass = [C(0x4f6b32), C(0x3f5a2c), C(0x6b7a38)], rock = C(0x6a625a), basalt = C(0x2c2725), snow = C(0xeef2f6), port = C(0x45464b), shoulder = C(0x7c7058), seabed = C(0x1d4f63);
    const tmp = new THREE.Color();
    const mh = I.hubs.minato;
    for (let gz = 0; gz < nz; gz++) for (let gx = 0; gx < nx; gx++) {
      const k = gz * nx + gx, x = x0 + gx * cell, z = z0 + gz * cell, y = h[k], e = I.ellipse(x, z), d = dist[k];
      const drop = 0.28 * (1 - ssw(I.wall, I.wall + 10, d));
      pos.set([x, y - 0.12 - drop, z], k * 3);
      uv.set([x / 24, -z / 24], k * 2);
      const n = 0.5 + 0.5 * Math.sin(x * 0.031 + Math.cos(z * 0.027) * 2.1);
      tmp.copy(grass[0]).lerp(grass[1], n).lerp(grass[2], 0.35 * (0.5 + 0.5 * Math.sin(z * 0.019 - x * 0.007)));
      if (y > 62) tmp.lerp(rock, Math.min(1, (y - 62) / 20));
      if (Math.hypot(x - V.x, z - V.z) < 150 && y > 55) tmp.lerp(basalt, 0.85);
      if ((x < -330 && z > 140 && y > 36) || y > 96) tmp.lerp(snow, Math.min(1, (y - 30) / 12));
      if (Math.hypot(x - mh.x, z - mh.z) < 230) tmp.lerp(port, 0.85);
      if (y < 1.6 && e > 0.66) tmp.lerp(sand, 0.9);
      if (y < -0.3) tmp.lerp(seabed, Math.min(1, -y / 3));
      if (d < I.wall + 2) tmp.lerp(shoulder, 0.6);
      tmp.convertSRGBToLinear();
      col.set([tmp.r, tmp.g, tmp.b], k * 3);
      if (gx < nx - 1 && gz < nz - 1) idx.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const tex = keep(canvasTex(256, 256, (c, w, hh) => { noiseFill(c, w, hh, '#d6d6d2', '#ffffff', 2600, 3, 41); blotches(c, w, hh, ['rgba(0,0,0,1)', 'rgba(255,255,255,1)'], 18, 20, 70, 0.08, 43); }, true));
    const m = new THREE.Mesh(keep(g), keep(new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 })));
    m.receiveShadow = !!quality.shadows;
    group.add(m);
  }
  // mer tout autour (suivie au besoin par le décor lointain)
  {
    const { cx, cz } = I.def.shape;
    const { mesh, mat } = makeWater(T, keep, 9000, 9000, cx, cz, 0x0c4f7a, 0x2fa3c4, 1.6);
    animated.push(mat); group.add(mesh);
    // îles lointaines : un anneau de crêtes bas sur l'horizon
    const rm = keep(new THREE.ShaderMaterial({
      fog: false, side: THREE.DoubleSide,
      uniforms: { a: { value: new THREE.Color(0x7fa3b8) }, b: { value: new THREE.Color(0x5f8a7a) }, hor: { value: new THREE.Color(T.fog) } },
      vertexShader: 'attribute float weight; varying float vW; varying float vY; void main(){ vW = weight; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 a, b, hor; varying float vW; varying float vY; void main(){ vec3 c = mix(a, b, vW); c = mix(hor, c, smoothstep(-10.0, 60.0, vY) * 0.6 + 0.2); gl_FragColor = vec4(c, 1.0); }',
    }));
    group.add(new THREE.Mesh(keep(ridgeGeo(cx, cz, 2300, -30, 150, 77, 120, (a) => Math.sin(a * 3) > 0.2)), rm));
  }

  // ---------- routes : chaussée, accotements, carrefours ----------
  {
    const roadTex = keep(canvasTex(256, 512, (g, w, h) => {
      noiseFill(g, w, h, '#3a3b40', '#6a6a72', 7000, 2.2, 5);
      blotches(g, w, h, ['rgba(0,0,0,1)'], 10, 20, 60, 0.06, 31);
      g.fillStyle = '#f4f1e6'; g.fillRect(8, 0, 7, h); g.fillRect(w - 15, 0, 7, h);
      for (let y = 0; y < h; y += 128) g.fillRect(w / 2 - 3, y, 6, 64);
    }, true));
    roadTex.anisotropy = 8;
    const strips = (o0, o1, lift, vScale) => {
      const pos = [], uv = [], idx = [];
      let base = 0;
      I.roads.forEach((r, e) => {
        for (let i = 0; i < r.count; i++) {
          const nx2 = -r.tz[i], nz2 = r.tx[i];
          for (const o of [o0, o1]) { const x = r.px[i] + nx2 * o, z = r.pz[i] + nz2 * o; pos.push(x, at(x, z) + lift + e * 0.003, z); }
          const v = i * r.step / vScale; uv.push(0, v, 1, v);
          if (i < r.count - 1) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        }
        base += r.count * 2;
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      return keep(g);
    };
    const road = new THREE.Mesh(strips(-half, half, 0.02, 20), keep(new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9, metalness: 0 })));
    road.receiveShadow = !!quality.shadows;
    group.add(road);
    const shMat = keep(new THREE.MeshLambertMaterial({ color: 0x8a8070 }));
    group.add(new THREE.Mesh(strips(-half - 1.8, -half, 0.012, 6), shMat));
    group.add(new THREE.Mesh(strips(half, half + 1.8, 0.012, 6), shMat));
    // carrefours : disques de bitume uni par-dessus les bandes qui se chevauchent
    const asphalt = keep(new THREE.MeshStandardMaterial({ color: 0x35363b, roughness: 0.92 }));
    for (const [x, z] of Object.values(I.def.nodes)) {
      const deg = I.def.edges.filter(([a, b]) => I.def.nodes[a][0] === x && I.def.nodes[a][1] === z || I.def.nodes[b][0] === x && I.def.nodes[b][1] === z).length;
      if (deg < 2) continue;
      const c = new THREE.CircleGeometry(half + 1.2, 28); c.rotateX(-Math.PI / 2);
      const pa = c.attributes.position; for (let v = 0; v < pa.count; v++) pa.setY(v, at(x + pa.getX(v), z + pa.getZ(v)) + 0.06);
      c.translate(x, 0, z); c.computeVertexNormals();
      group.add(new THREE.Mesh(keep(c), asphalt));
    }
  }

  // ---------- décor instancié ----------
  const dummy = new THREE.Object3D(), tcol = new THREE.Color();
  const instanced = (geo, mat, list, setup, colors) => {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(keep(geo), keep(mat), list.length);
    list.forEach((p, i) => {
      dummy.position.set(p[0], at(p[0], p[1]), p[1]); dummy.rotation.set(0, p[2] != null ? p[2] : R() * Math.PI * 2, 0); dummy.scale.set(1, 1, 1);
      if (setup) setup(dummy, i, p); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
      if (colors) m.setColorAt(i, tcol.setHex(colors[Math.floor(R() * colors.length)]));
    });
    m.instanceMatrix.needsUpdate = true; if (colors) m.instanceColor.needsUpdate = true;
    group.add(m);
    return m;
  };
  // balises réfléchissantes et lampadaires le long des routes
  {
    const posts = [], lamps = [];
    I.roads.forEach((r) => {
      for (let i = 0; i < r.count; i += 16) for (const sd of [-1, 1]) { const o = sd * (half + 2.1); posts.push([r.px[i] - r.tz[i] * o, r.pz[i] + r.tx[i] * o, Math.atan2(r.tx[i], r.tz[i])]); }
      for (let i = 0; i < r.count; i += 30) {
        const [, hd] = nearestHub(r.px[i], r.pz[i]); if (hd > 240) continue;
        const sd = (i / 30) % 2 ? 1 : -1, o = sd * (half + 2.6);
        lamps.push([r.px[i] - r.tz[i] * o, r.pz[i] + r.tx[i] * o, Math.atan2(-r.tz[i] * sd, r.tx[i] * sd)]);
      }
    });
    const pg = new THREE.BoxGeometry(0.14, 1.0, 0.14); pg.translate(0, 0.5, 0);
    instanced(pg, new THREE.MeshLambertMaterial({ color: 0xf2f2ee }), posts);
    const rg = new THREE.BoxGeometry(0.15, 0.12, 0.15); rg.translate(0, 0.92, 0);
    instanced(rg, new THREE.MeshBasicMaterial({ color: 0xff8a1e }), posts);
    const post = new THREE.CylinderGeometry(0.12, 0.16, 8, 6); post.translate(0, 4, 0);
    const arm = new THREE.BoxGeometry(0.15, 0.15, 2.6); arm.translate(0, 8, 1.3);
    instanced(mergeGeos([post, arm]), new THREE.MeshLambertMaterial({ color: 0x2a2a30 }), lamps);
    const head = new THREE.BoxGeometry(0.5, 0.18, 0.9); head.translate(0, 7.9, 2.5);
    instanced(head, new THREE.MeshBasicMaterial({ color: 0xffd38a }), lamps);
  }
  // végétation, rochers, bâtiments : région = lieu le plus proche + altitude
  {
    const lists = { pine: [], snowpine: [], maple: [], palm: [], rock: [], basalt: [], cont: [], ware: [], house: [], cane: [] };
    const target = Math.round(1900 * quality.scenery);
    const { x0, z0, x1, z1 } = I.bounds, q = {};
    let tries = 0, n = 0;
    while (n < target && tries++ < target * 6) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
      const e = I.ellipse(x, z); if (e > 0.93) continue;
      const y = at(x, z); if (y < 0.8) continue;
      const rd = I.nearestRoad(x, z, q).d;
      const [hub, hd] = nearestHub(x, z);
      if (hd < 40) continue;
      const big = rd < half + 26;
      if (rd < half + 4) continue;
      const dv = Math.hypot(x - V.x, z - V.z);
      let type;
      if (hub === 'minato' && hd < 300) type = big ? 'cont' : R() < 0.75 ? 'cont' : 'ware';
      else if ((x < -330 && z > 140 && y > 34) || y > 90) type = R() < 0.85 ? 'snowpine' : 'rock';
      else if (dv < 170 && y > 50) type = R() < 0.7 ? 'basalt' : 'rock';
      else if (y < 7 && e > 0.66) type = R() < 0.8 ? 'palm' : 'rock';
      else if ((hub === 'shiohama' || hub === 'kaigan') && hd < 260) type = big || R() < 0.4 ? 'house' : 'palm';
      else if (hub === 'piton' && y < 45 && !big && R() < 0.35) type = 'cane';
      else if (hub === 'akane') type = R() < 0.35 ? 'maple' : 'pine';
      else type = y > 26 ? (R() < 0.8 ? 'pine' : 'rock') : (R() < 0.5 ? 'palm' : R() < 0.5 ? 'maple' : 'pine');
      if ((type === 'ware' || type === 'cane' || type === 'house') && rd < half + 14) continue;
      lists[type].push([x, z]); n++;
    }
    const sc = (lo, hi) => (d) => { const s2 = lo + R() * (hi - lo); d.scale.set(s2, s2 * (0.9 + R() * 0.25), s2); };
    const trees = [...lists.pine, ...lists.snowpine, ...lists.maple];
    const trunk = new THREE.CylinderGeometry(0.25, 0.38, 3.4, 5); trunk.translate(0, 1.7, 0);
    instanced(trunk, new THREE.MeshLambertMaterial({ color: 0x4a3326 }), trees, sc(0.8, 1.5));
    const pine = (() => { const parts = []; for (let k = 0; k < 4; k++) { const c = new THREE.ConeGeometry(2.8 - k * 0.55, 3.6, 6, 1); c.translate(0, 3.6 + k * 2.1, 0); parts.push(c); } return mergeGeos(parts); })();
    const flat = () => new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 0 });
    instanced(pine, flat(), lists.pine, sc(0.8, 1.5), [0x2f5a3a, 0x3c6e45, 0x28503a, 0x456f3e]);
    instanced(pine.clone(), flat(), lists.snowpine, sc(0.8, 1.4), [0xdfe8ee, 0xc8d6de, 0x8aa094, 0xeef2f6]);
    const maple = new THREE.IcosahedronGeometry(3, 1); maple.translate(0, 5.2, 0);
    instanced(maple, flat(), lists.maple, sc(0.8, 1.4), [0xc8352a, 0xe0612b, 0xd9902e, 0x6f9a3a, 0xe8b13a]);
    // palmiers : tronc courbe + palmes
    const tc = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.2, 4.5, 0), new THREE.Vector3(1.5, 8.4, 0));
    instanced(new THREE.TubeGeometry(tc, 6, 0.26, 5, false), new THREE.MeshLambertMaterial({ color: 0x7a5a3c }), lists.palm, sc(0.75, 1.3));
    const fronds = [];
    for (let k = 0; k < 8; k++) { const f = new THREE.PlaneGeometry(4.4, 0.9, 4, 1); const pa = f.attributes.position; for (let v = 0; v < pa.count; v++) { const x = pa.getX(v) + 2.2, y = pa.getY(v); pa.setXYZ(v, x, -0.09 * x * x + Math.abs(y) * 0.5, y * (1 - x / 6)); } f.rotateY((k / 8) * Math.PI * 2); f.translate(1.5, 8.4, 0); fronds.push(f); }
    instanced(mergeGeos(fronds), new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide, flatShading: true, shininess: 0 }), lists.palm, sc(0.75, 1.3), [0x2f8a3e, 0x3b9a47, 0x2a7a3a]);
    instanced(new THREE.DodecahedronGeometry(1.8, 0), flat(), lists.rock, (d) => { const s2 = 0.6 + R() * 1.8; d.scale.set(s2 * 1.3, s2, s2); }, [0x6b6460, 0x7d7268, 0x5a5452]);
    instanced(new THREE.DodecahedronGeometry(1.6, 0), flat(), lists.basalt, (d) => { const s2 = 0.6 + R() * 2; d.scale.set(s2 * 1.4, s2 * 0.8, s2); }, [0x24221f, 0x2e2a26, 0x1b1a19]);
    const cont = new THREE.BoxGeometry(12, 2.6, 2.5); cont.translate(0, 1.3, 0);
    instanced(cont, new THREE.MeshLambertMaterial({ color: 0xffffff }), lists.cont, (d) => { if (R() < 0.3) d.position.y += 2.6; d.rotation.y = Math.round(R() * 4) * Math.PI / 2; }, [0xc0392b, 0x1f6fb2, 0x2e8b57, 0xe0a526, 0x7a3fb0, 0xd35400, 0x5d6d7e]);
    const ware = new THREE.BoxGeometry(36, 12, 22); ware.translate(0, 6, 0);
    instanced(ware, new THREE.MeshLambertMaterial({ color: 0x4a4d56 }), lists.ware);
    const house = new THREE.BoxGeometry(7, 4, 6); house.translate(0, 2, 0);
    instanced(house, new THREE.MeshLambertMaterial({ color: 0xffffff }), lists.house, sc(0.9, 1.3), [0xf1efe9, 0xe8dcc8, 0xd8e4ec, 0xf4e2c8]);
    const roof = new THREE.ConeGeometry(5.4, 2.4, 4); roof.rotateY(Math.PI / 4); roof.translate(0, 5.2, 0);
    instanced(roof, new THREE.MeshLambertMaterial({ color: 0xffffff }), lists.house, sc(0.9, 1.3), [0xc8302c, 0x1d76c2, 0x2f9a5a, 0x6e1424]);
    const cane = new THREE.BoxGeometry(30, 2.2, 20); cane.translate(0, 1.1, 0);
    instanced(cane, new THREE.MeshLambertMaterial({ color: 0x7aa043 }), lists.cane);
  }

  // ---------- repères : phare, fumée du volcan, portes des lieux ----------
  {
    const lh = new THREE.Group(), lx = 120, lz = -600, ly = at(lx, lz);
    for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(keep(new THREE.CylinderGeometry(2.4 - k * 0.25, 2.6 - k * 0.25, 4, 12)), keep(new THREE.MeshLambertMaterial({ color: k % 2 ? 0xc8262d : 0xf4f1e6 }))); c.position.y = 2 + k * 4; lh.add(c); }
    const lamp = new THREE.Mesh(keep(new THREE.SphereGeometry(1.2, 10, 8)), keep(new THREE.MeshBasicMaterial({ color: 0xfff2b0 }))); lamp.position.y = 21; lh.add(lamp);
    lh.position.set(lx, ly, lz); group.add(lh);
    const puff = keep(canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }));
    const pts = []; for (let k = 0; k < 14; k++) pts.push(V.x + k * 6 + (R() - 0.5) * 20, V.h + 10 + k * 18, V.z + (R() - 0.5) * 20);
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    group.add(new THREE.Points(keep(pg), keep(new THREE.PointsMaterial({ map: puff, size: 70, color: 0xe8e6e2, transparent: true, opacity: 0.5, depthWrite: false }))));
  }
  const gates = [];
  {
    const pm = keep(new THREE.MeshLambertMaterial({ color: 0x1c1c22 }));
    const ringMat = keep(new THREE.MeshBasicMaterial({ color: 0xf7d154, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    for (const [id, hb] of hubList) {
      const t = TRACKS.find((x) => x.id === id);
      const g = new THREE.Group();
      const span = (half + 1.4) * 2;
      for (const sd of [-1, 1]) { const p = new THREE.Mesh(keep(new THREE.BoxGeometry(0.7, 7, 0.7)), pm); p.position.set(0, 3.5, sd * span / 2); g.add(p); }
      const tex = keep(canvasTex(1024, 128, (c, w, h) => {
        c.fillStyle = '#111'; c.fillRect(0, 0, w, h); c.fillStyle = '#f7d154'; c.fillRect(0, 0, w, 8); c.fillRect(0, h - 8, w, 8);
        c.font = '900 56px "Archivo", "Arial Black", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f7d154';
        c.fillText(`${t.jp} · ${t.name.toUpperCase()}`, w / 2, h / 2 + 3);
      }));
      const beam = new THREE.Mesh(keep(new THREE.BoxGeometry(0.6, 1.5, span + 0.7)), pm); beam.position.y = 7; g.add(beam);
      for (const sd of [-1, 1]) { const f = new THREE.Mesh(keep(new THREE.PlaneGeometry(span, 1.3)), keep(new THREE.MeshBasicMaterial({ map: tex }))); f.position.set(sd * 0.31, 7, 0); f.rotation.y = sd * Math.PI / 2; g.add(f); }
      g.position.set(hb.x, at(hb.x, hb.z), hb.z); g.rotation.y = -hb.heading;
      group.add(g);
      const ring = new THREE.Mesh(keep(new THREE.RingGeometry(9, 10.5, 40)), ringMat);
      ring.rotation.x = -Math.PI / 2; ring.position.set(hb.x, at(hb.x, hb.z) + 0.12, hb.z); ring.renderOrder = 2;
      group.add(ring);
      gates.push({ id, x: hb.x, z: hb.z, ring });
    }
  }
  // daruma dorés (le jeu cache ceux déjà trouvés)
  const daruma = [];
  {
    const body = keep(new THREE.SphereGeometry(0.6, 14, 10)), face = keep(new THREE.CircleGeometry(0.32, 14));
    const gold = keep(new THREE.MeshStandardMaterial({ color: 0xf2b51d, metalness: 0.9, roughness: 0.25, emissive: 0x3a2600 })), white = keep(new THREE.MeshBasicMaterial({ color: 0xf4f1e6 }));
    I.daruma.forEach((d) => {
      const g = new THREE.Group();
      const b = new THREE.Mesh(body, gold); b.scale.set(1, 1.15, 1); g.add(b);
      const f = new THREE.Mesh(face, white); f.position.set(0, 0.08, 0.55); g.add(f);
      g.position.set(d.x, at(d.x, d.z) + 1.3, d.z);
      group.add(g); daruma.push(g);
    });
  }

  function update(t, cam) {
    for (const m of animated) m.uniforms.time.value = t;
    if (cam) sky.position.copy(cam);
    const pulse = 0.35 + 0.25 * Math.sin(t * 3);
    for (const gt of gates) gt.ring.material.opacity = pulse;
    for (let k = 0; k < daruma.length; k++) { const g = daruma[k]; g.rotation.y = t * 1.6 + k; }
  }
  function dispose() { scene.remove(group); for (const d of disposables) d.dispose && d.dispose(); }
  return { group, sun, theme: T, update, dispose, skyMat, heightAt: at, daruma, gates };
}

if (typeof module !== 'undefined') module.exports = { ISLE, buildIsland, isleCollect, isleFound };
