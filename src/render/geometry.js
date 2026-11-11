// ===== Voitures procédurales : caisse lissée (loft), habitacle vitré, livrée peinte, pièces modulaires =====
// Repère local : x = avant, y = haut, z = droite. Toutes les pièces statiques sont fusionnées par matériau
// (une poignée d'appels de dessin) ; les 4 roues sont des InstancedMesh (un appel par matériau pour les 4).
export const BODY_DEFS = {
  // fa/ra : essieux ; R : rayon de roue ; rr : rayon de jante ; tw : largeur de pneu ; *Top : hauteurs (m)
  hachi: {
    fa: 1.12,
    ra: -1.18,
    w: 1.66,
    nose: 0.86,
    tail: 0.8,
    R: 0.31,
    rr: 0.195,
    tw: 0.2,
    sill: 0.27,
    noseTop: 0.6,
    hood: 0.79,
    cowl: 0.86,
    deck: 0.92,
    roof: 1.33,
    wsLen: 0.6,
    roofEnd: -0.6,
    gEnd: -1.84,
    bpil: -0.34,
    cpil: -1.2,
    tumble: 0.19,
    inset: 0.06,
    bulge: 0.012,
    crown: 0.02,
    head: 'popup',
    tailL: 'twin',
    wing: 'lip',
  },
  kouki: {
    fa: 1.22,
    ra: -1.3,
    w: 1.74,
    nose: 0.98,
    tail: 0.88,
    R: 0.32,
    rr: 0.21,
    tw: 0.22,
    sill: 0.25,
    noseTop: 0.56,
    hood: 0.75,
    cowl: 0.84,
    deck: 0.93,
    roof: 1.3,
    wsLen: 0.78,
    roofEnd: -0.8,
    gEnd: -1.42,
    bpil: -0.3,
    cpil: -1.0,
    tumble: 0.22,
    inset: 0.075,
    bulge: 0.026,
    crown: 0.012,
    head: 'projector',
    tailL: 'bar',
    wing: 'gt',
  },
  raijin: {
    fa: 1.3,
    ra: -1.36,
    w: 1.8,
    nose: 1.06,
    tail: 0.86,
    R: 0.33,
    rr: 0.225,
    tw: 0.25,
    sill: 0.24,
    noseTop: 0.53,
    hood: 0.69,
    cowl: 0.84,
    deck: 0.95,
    roof: 1.25,
    wsLen: 0.88,
    roofEnd: -0.55,
    gEnd: -1.62,
    bpil: -0.36,
    cpil: -1.02,
    tumble: 0.25,
    inset: 0.1,
    bulge: 0.036,
    crown: -0.01,
    head: 'oval',
    tailL: 'round',
    wing: 'hoop',
  },
};
export const KIT_BULGE = { stock: 0, flares: 0.045, wide: 0.1 };

// ---------- petits outils géométriques ----------
const _m4 = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _e = new THREE.Euler(),
  _v1 = new THREE.Vector3(),
  _v2 = new THREE.Vector3(),
  _up = new THREE.Vector3(0, 1, 0);
export function bake(geo, x, y, z, rx, ry, rz) {
  _e.set(rx || 0, ry || 0, rz || 0);
  _q.setFromEuler(_e);
  _m4.compose(_v1.set(x, y, z), _q, _v2.set(1, 1, 1));
  return geo.applyMatrix4(_m4);
}
export function tube(a, b, r, seg) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg || 6, 1, true);
  _q.setFromUnitVectors(_up, d.normalize());
  _m4.compose(_v1.addVectors(a, b).multiplyScalar(0.5), _q, _v2.set(1, 1, 1));
  return g.applyMatrix4(_m4);
}
export function mergeGeos(list) {
  const parts = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    if (!n.attributes.normal) n.computeVertexNormals();
    if (!n.attributes.uv)
      n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    return n;
  });
  let count = 0;
  for (const g of parts) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3),
    nor = new Float32Array(count * 3),
    uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
// fusionne les maillages enfants d'un groupe par matériau (utilisé aussi par world.js)
export function mergeByMaterial(group, keep, skip) {
  group.updateMatrix();
  const buckets = new Map();
  for (const o of [...group.children]) {
    if (!o.isMesh || o.isInstancedMesh || skip.includes(o) || Array.isArray(o.material)) continue;
    o.updateMatrix();
    const g = o.geometry.clone().applyMatrix4(o.matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!buckets.has(o.material)) buckets.set(o.material, { list: [], shadow: false, order: o.renderOrder });
    const b = buckets.get(o.material);
    b.list.push(g);
    b.shadow = b.shadow || o.castShadow;
    group.remove(o);
  }
  for (const [mat, b] of buckets) {
    const geo = keep(mergeGeos(b.list));
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = b.shadow;
    m.renderOrder = b.order;
    group.add(m);
  }
}
// loft : anneaux de points [x, y, z, u, v] ; matOf(i, j) choisit le matériau du quad (anneaux i→i+1, points j→j+1)
export function loft(rings, matOf) {
  const M = rings[0].length,
    S = rings.length;
  const pos = new Float32Array(S * M * 3),
    uv = new Float32Array(S * M * 2);
  rings.forEach((r, i) =>
    r.forEach((p, j) => {
      const k = i * M + j;
      pos[k * 3] = p[0];
      pos[k * 3 + 1] = p[1];
      pos[k * 3 + 2] = p[2];
      uv[k * 2] = p[3];
      uv[k * 2 + 1] = p[4];
    }),
  );
  const all = [],
    per = new Map();
  for (let i = 0; i < S - 1; i++)
    for (let j = 0; j < M - 1; j++) {
      const key = matOf(i, j);
      if (key == null) continue;
      const a = i * M + j,
        b = a + 1,
        c = a + M,
        d = c + 1;
      all.push(a, b, c, c, b, d);
      if (!per.has(key)) per.set(key, []);
      per.get(key).push(a, b, c, c, b, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(all);
  g.computeVertexNormals();
  const out = new Map();
  for (const [key, idx] of per) {
    const h = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv']) h.setAttribute(k, g.attributes[k]);
    h.setIndex(idx);
    out.set(key, h.toNonIndexed());
  }
  g.dispose();
  return out;
}
// capot d'extrémité : éventail depuis le centre d'un anneau plan (x constant)
export function capGeo(ring, front, uv) {
  let cy = 0,
    cz = 0;
  for (const p of ring) {
    cy += p[1];
    cz += p[2];
  }
  cy /= ring.length;
  cz /= ring.length;
  const pos = [],
    x = ring[0][0];
  const n = ring.length;
  for (let j = 0; j < n; j++) {
    const a = ring[j],
      b = ring[(j + 1) % n];
    if (front) pos.push(x, cy, cz, a[0], a[1], a[2], b[0], b[1], b[2]);
    else pos.push(x, cy, cz, b[0], b[1], b[2], a[0], a[1], a[2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      new Array((pos.length / 3) * 2).fill(0).map((_, i) => (i % 2 ? uv[1] : uv[0])),
      2,
    ),
  );
  g.computeVertexNormals();
  return g;
}
export function quadGeo(p0, p1, p2, p3, uv) {
  // p0 bas-gauche, p1 bas-droite, p2 haut-droite, p3 haut-gauche (sens trigo = face visible)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...p0, ...p1, ...p2, ...p0, ...p2, ...p3], 3));
  const [u0, v0, u1, v1] = uv || [0, 0, 1, 1];
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1], 2));
  g.computeVertexNormals();
  return g;
}
export const hexStr = (n) => '#' + n.toString(16).padStart(6, '0');
export const isDarkHex = (hex) => {
  const r = (hex >> 16) & 255,
    g = (hex >> 8) & 255,
    b = hex & 255;
  return r * 0.3 + g * 0.59 + b * 0.11 < 110;
};
