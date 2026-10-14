// ===== Voitures procédurales : caisse lissée (loft), habitacle vitré, livrée peinte, pièces modulaires =====
// Repère local : x = avant, y = haut, z = droite. Toutes les pièces statiques sont fusionnées par matériau
// (une poignée d'appels de dessin) ; les 4 roues sont des InstancedMesh (un appel par matériau pour les 4).
const BODY_DEFS = {
  // fa/ra : essieux ; R : rayon de roue ; rr : rayon de jante ; tw : largeur de pneu ; *Top : hauteurs (m)
  hachi: { fa: 1.12, ra: -1.18, w: 1.66, nose: 0.86, tail: 0.8, R: 0.31, rr: 0.195, tw: 0.2, sill: 0.27, noseTop: 0.6, hood: 0.79, cowl: 0.86, deck: 0.92, roof: 1.33, wsLen: 0.6, roofEnd: -0.6, gEnd: -1.84, bpil: -0.34, cpil: -1.2, tumble: 0.19, inset: 0.06, bulge: 0.012, crown: 0.02, head: 'popup', tailL: 'twin', wing: 'lip' },
  kouki: { fa: 1.22, ra: -1.3, w: 1.74, nose: 0.98, tail: 0.88, R: 0.32, rr: 0.21, tw: 0.22, sill: 0.25, noseTop: 0.56, hood: 0.75, cowl: 0.84, deck: 0.93, roof: 1.3, wsLen: 0.78, roofEnd: -0.8, gEnd: -1.42, bpil: -0.3, cpil: -1.0, tumble: 0.22, inset: 0.075, bulge: 0.026, crown: 0.012, head: 'projector', tailL: 'bar', wing: 'gt' },
  raijin: { fa: 1.3, ra: -1.36, w: 1.8, nose: 1.06, tail: 0.86, R: 0.33, rr: 0.225, tw: 0.25, sill: 0.24, noseTop: 0.53, hood: 0.69, cowl: 0.84, deck: 0.95, roof: 1.25, wsLen: 0.88, roofEnd: -0.55, gEnd: -1.62, bpil: -0.36, cpil: -1.02, tumble: 0.25, inset: 0.1, bulge: 0.036, crown: -0.01, head: 'oval', tailL: 'round', wing: 'hoop' },
};
const KIT_BULGE = { stock: 0, flares: 0.045, wide: 0.1 };

// ---------- petits outils géométriques ----------
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function bake(geo, x, y, z, rx, ry, rz) {
  _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e);
  _m4.compose(_v1.set(x, y, z), _q, _v2.set(1, 1, 1));
  return geo.applyMatrix4(_m4);
}
function tube(a, b, r, seg) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg || 6, 1, true);
  _q.setFromUnitVectors(_up, d.normalize());
  _m4.compose(_v1.addVectors(a, b).multiplyScalar(0.5), _q, _v2.set(1, 1, 1));
  return g.applyMatrix4(_m4);
}
function mergeGeos(list) {
  const parts = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    if (!n.attributes.normal) n.computeVertexNormals();
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    return n;
  });
  let count = 0;
  for (const g of parts) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
// fusionne les maillages enfants d'un groupe par matériau (utilisé aussi par world.js)
function mergeByMaterial(group, keep, skip) {
  group.updateMatrix();
  const buckets = new Map();
  for (const o of [...group.children]) {
    if (!o.isMesh || o.isInstancedMesh || skip.includes(o) || Array.isArray(o.material)) continue;
    o.updateMatrix();
    const g = o.geometry.clone().applyMatrix4(o.matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!buckets.has(o.material)) buckets.set(o.material, { list: [], shadow: false, order: o.renderOrder });
    const b = buckets.get(o.material);
    b.list.push(g); b.shadow = b.shadow || o.castShadow;
    group.remove(o);
  }
  for (const [mat, b] of buckets) {
    const geo = keep(mergeGeos(b.list));
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = b.shadow; m.renderOrder = b.order;
    group.add(m);
  }
}
// loft : anneaux de points [x, y, z, u, v] ; matOf(i, j) choisit le matériau du quad (anneaux i→i+1, points j→j+1)
function loft(rings, matOf) {
  const M = rings[0].length, S = rings.length;
  const pos = new Float32Array(S * M * 3), uv = new Float32Array(S * M * 2);
  rings.forEach((r, i) => r.forEach((p, j) => { const k = i * M + j; pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2]; uv[k * 2] = p[3]; uv[k * 2 + 1] = p[4]; }));
  const all = [], per = new Map();
  for (let i = 0; i < S - 1; i++) for (let j = 0; j < M - 1; j++) {
    const key = matOf(i, j);
    if (key == null) continue;
    const a = i * M + j, b = a + 1, c = a + M, d = c + 1;
    all.push(a, b, c, c, b, d);
    if (!per.has(key)) per.set(key, []);
    per.get(key).push(a, b, c, c, b, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(all); g.computeVertexNormals();
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
function capGeo(ring, front, uv) {
  let cy = 0, cz = 0;
  for (const p of ring) { cy += p[1]; cz += p[2]; }
  cy /= ring.length; cz /= ring.length;
  const pos = [], x = ring[0][0];
  const n = ring.length;
  for (let j = 0; j < n; j++) {
    const a = ring[j], b = ring[(j + 1) % n];
    if (front) pos.push(x, cy, cz, a[0], a[1], a[2], b[0], b[1], b[2]);
    else pos.push(x, cy, cz, b[0], b[1], b[2], a[0], a[1], a[2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0).map((_, i) => (i % 2 ? uv[1] : uv[0])), 2));
  g.computeVertexNormals();
  return g;
}
function quadGeo(p0, p1, p2, p3, uv) { // p0 bas-gauche, p1 bas-droite, p2 haut-droite, p3 haut-gauche (sens trigo = face visible)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...p0, ...p1, ...p2, ...p0, ...p2, ...p3], 3));
  const [u0, v0, u1, v1] = uv || [0, 0, 1, 1];
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1], 2));
  g.computeVertexNormals();
  return g;
}
const hexStr = (n) => '#' + n.toString(16).padStart(6, '0');
const isDarkHex = (hex) => { const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255; return r * 0.3 + g * 0.59 + b * 0.11 < 110; };

// ---------- livrée : texture unique enveloppant la caisse ----------
// Disposition (v vers le haut de l'image) : flanc droit v∈[0.7,1] (v = 0.7 + 0.3(1-y)), dessus v∈[0.3,0.7]
// (v = 0.5 + 0.2 z/wT), flanc gauche v∈[0,0.3] (v = 0.3 y) ; u = (x - X0)/L. Les zones y < 0.2 ne sont jamais
// visibles sur la caisse : elles servent d'atlas (plaque, bandeau de pare-brise, zone de peinture unie).
const LIV_W = 1024, LIV_H = 512;
const ATLAS = { plain: [4 / LIV_W, 1 - 507 / LIV_H], plate: [10, 1, 100, 30], banner: [200, 1, 1000, 30] };
const atlasUV = (r) => [r[0] / LIV_W, 1 - r[3] / LIV_H, r[2] / LIV_W, 1 - r[1] / LIV_H];
const SPONSORS = ['NO GRIP', 'TOUGE', '974', '横滑り', 'CLIP IT', 'KAIZEN'];

function paintLivery(look, d, X0, L, wT0) {
  const c = document.createElement('canvas');
  c.width = LIV_W; c.height = LIV_H;
  const g = c.getContext('2d');
  const paint = hexStr(look.paint), acc = hexStr(look.accent);
  const dark = isDarkHex(look.paint);
  const ink = dark ? '#f3efe4' : '#141418';
  const sx = LIV_W / L, kY = 153.6, kZ = 102.4 / wT0;
  const P = (band, x, s) => band === 'R' ? [(x - X0) * sx, kY * s] : band === 'L' ? [(x - X0) * sx, LIV_H - kY * s] : [(x - X0) * sx, 256 - kZ * s];
  const poly = (band, pts, fill, alpha) => {
    g.globalAlpha = alpha == null ? 1 : alpha; g.fillStyle = fill; g.beginPath();
    pts.forEach(([x, s], i) => { const [px, py] = P(band, x, s); i ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.closePath(); g.fill(); g.globalAlpha = 1;
  };
  const rect = (band, x0, s0, x1, s1, fill, alpha) => poly(band, [[x0, s0], [x1, s0], [x1, s1], [x0, s1]], fill, alpha);
  const line = (band, x0, s0, x1, s1, w) => {
    const [ax, ay] = P(band, x0, s0), [bx, by] = P(band, x1, s1);
    g.strokeStyle = dark ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.34)'; g.lineWidth = w || 2.2;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
  };
  // texte posé droit sur la carrosserie (corrige l'anisotropie et le sens de lecture de chaque bande)
  const text = (band, str, x, s, size, fill, opts) => {
    const [px, py] = P(band, x, s);
    g.save();
    if (band === 'R') g.setTransform(1, 0, 0, -kY / sx, px, py);
    else if (band === 'L') g.setTransform(-1, 0, 0, kY / sx, px, py);
    else g.setTransform(0, -kZ / sx, -1, 0, px, py);
    g.font = `${(opts && opts.weight) || 900} ${size * sx}px ${(opts && opts.font) || '"Dela Gothic One", "Arial Black", sans-serif'}`;
    g.textAlign = (opts && opts.align) || 'center'; g.textBaseline = 'middle';
    if (opts && opts.stroke) { g.lineWidth = opts.stroke * sx; g.strokeStyle = opts.strokeColor || ink; g.lineJoin = 'round'; g.strokeText(str, 0, 0); }
    g.fillStyle = fill; g.fillText(str, 0, 0);
    g.restore();
  };
  // fond + finition
  g.fillStyle = paint; g.fillRect(0, 0, LIV_W, LIV_H);
  if (look.finish === 'metal' || look.finish === 'pearl') {
    const r = rng(look.number * 31 + 7);
    for (let i = 0; i < 9000; i++) { g.globalAlpha = 0.05 + r() * 0.08; g.fillStyle = r() > 0.5 ? '#ffffff' : '#000000'; g.fillRect(r() * LIV_W, r() * LIV_H, 1.5, 1.5); }
    g.globalAlpha = 1;
  }
  if (look.finish === 'pearl') {
    const gr = g.createLinearGradient(0, 0, LIV_W, LIV_H);
    gr.addColorStop(0, 'rgba(255,170,255,0.16)'); gr.addColorStop(0.5, 'rgba(120,220,255,0.12)'); gr.addColorStop(1, 'rgba(255,240,170,0.16)');
    g.fillStyle = gr; g.fillRect(0, 0, LIV_W, LIV_H);
  }
  const ws0 = d.fa - 0.42, mid = (ws0 + d.bpil) / 2;
  const sides = ['R', 'L'];
  // ----- livrées
  const roundel = (band, x, y, r) => {
    const [px, py] = P(band, x, y);
    g.save(); g.translate(px, py); g.scale(1, band === 'T' ? kZ / sx : kY / sx);
    g.fillStyle = '#f7f4ec'; g.beginPath(); g.arc(0, 0, r * sx, 0, Math.PI * 2); g.fill();
    g.lineWidth = 0.025 * sx; g.strokeStyle = '#16161a'; g.stroke();
    g.restore();
    text(band, String(look.number), x, y + (band === 'T' ? 0 : -0.005), r * 1.15, '#16161a');
  };
  const sponsors = (band) => {
    const items = [[d.fa + 0.18, 0.44, SPONSORS[look.number % 6]], [d.ra + 0.5, 0.43, SPONSORS[(look.number + 2) % 6]], [d.ra - 0.22, 0.6, SPONSORS[(look.number + 4) % 6]]];
    for (const [x, y, s] of items) {
      rect(band, x - 0.2, y - 0.045, x + 0.2, y + 0.045, '#f7f4ec');
      text(band, s, band === 'L' ? x : x, y, 0.06, '#16161a', { weight: 700, font: '"Chakra Petch", "Arial", sans-serif' });
    }
  };
  if (look.livery === 'club') {
    for (const b of sides) {
      poly(b, [[X0, 0.43], [X0 + L, 0.6], [X0 + L, 0.645], [X0, 0.49]], acc);
      poly(b, [[X0, 0.36], [X0 + L, 0.535], [X0 + L, 0.555], [X0, 0.385]], '#e8352f');
      text(b, 'SIDEWAYS DRIFT CLUB', d.ra + 0.05, 0.72, 0.065, acc, { weight: 700, font: '"Chakra Petch", "Arial", sans-serif' });
      text(b, 'ドリフト', d.fa + 0.25, 0.64, 0.08, acc, { weight: 700, font: '"Chakra Petch", sans-serif' });
      roundel(b, mid, 0.56, 0.13);
      sponsors(b);
    }
  } else if (look.livery === 'stripes') {
    for (const sgn of [-1, 1]) rect('T', X0, sgn * 0.06, X0 + L, sgn * 0.17, acc);
    for (const b of sides) { rect(b, X0, 0.33, X0 + L, 0.37, acc); rect(b, X0, 0.385, X0 + L, 0.395, acc); roundel(b, mid, 0.56, 0.13); sponsors(b); }
    roundel('T', d.fa + 0.25, 0, 0.12);
  } else if (look.livery === 'kanji') {
    for (const b of sides) {
      text(b, '横滑り', (X0 + d.fa) / 2 + 0.1, 0.52, 0.34, acc, { stroke: 0.035, strokeColor: ink });
      rect(b, X0, 0.31, X0 + L, 0.34, acc);
      roundel(b, d.fa + 0.25, 0.55, 0.1);
    }
    text('T', 'SIDEWAYS', d.fa + 0.1, 0, 0.16, acc, { stroke: 0.02, strokeColor: ink });
  } else if (look.livery === 'splash') {
    const r = rng(look.number * 97 + 3);
    for (let i = 0; i < 140; i++) {
      g.globalAlpha = 0.95; g.fillStyle = r() > 0.25 ? acc : ink;
      const x = r() * LIV_W, y = 40 + r() * (LIV_H - 80), s = 6 + r() * r() * 46;
      g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
      if (r() > 0.6) { g.fillRect(x - s * 0.15, y, s * 0.3, s * (1.5 + r() * 2)); g.beginPath(); g.arc(x, y + s * 2.6, s * 0.22, 0, Math.PI * 2); g.fill(); }
    }
    g.globalAlpha = 1;
    for (const b of sides) roundel(b, mid, 0.56, 0.13);
  } else if (look.livery === 'fade') {
    const cell = 0.085;
    for (const b of ['R', 'L', 'T']) {
      const s0 = b === 'T' ? -0.9 : 0.2, s1 = b === 'T' ? 0.9 : 0.95;
      for (let x = X0, i = 0; x < X0 + L; x += cell, i++) {
        const a = Math.max(0, 1 - (x - X0) / (L * 0.72));
        if (a <= 0.02) continue;
        for (let s = s0, k = 0; s < s1; s += cell, k++) if ((i + k) % 2) rect(b, x, s, x + cell, s + cell, acc, a * a);
      }
    }
    for (const b of sides) { roundel(b, mid, 0.56, 0.13); sponsors(b); }
  }
  // ----- lignes d'ouvrants (portes, capot, coffre) et détails
  for (const b of sides) {
    const top = d.cowl - 0.03;
    line(b, ws0 + 0.02, d.sill + 0.05, ws0 + 0.02, top);
    line(b, d.bpil - 0.03, d.sill + 0.05, d.bpil - 0.03, top);
    line(b, ws0 + 0.02, d.sill + 0.06, d.bpil - 0.03, d.sill + 0.06);
    rect(b, d.bpil + 0.08, top - 0.12, d.bpil + 0.22, top - 0.09, dark ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.45)');
  }
  { const [px, py] = P('L', d.ra + 0.62, d.cowl - 0.16); g.strokeStyle = dark ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.beginPath(); g.ellipse(px, py, 0.06 * sx, 0.06 * kY, 0, 0, Math.PI * 2); g.stroke(); }
  const hw = wT0 * 0.86;
  line('T', ws0 + 0.05, -hw, ws0 + 0.05, hw);
  line('T', ws0 + 0.05, -hw, X0 + L - 0.18, -hw * 0.92);
  line('T', ws0 + 0.05, hw, X0 + L - 0.18, hw * 0.92);
  const trunk = d.hatch ? X0 + 0.1 : d.gEnd + 0.04;
  line('T', trunk, -hw, trunk, hw);
  // ----- atlas : plaque d'immatriculation, bandeau de pare-brise
  { const [x0, y0, x1, y1] = ATLAS.plate; g.fillStyle = '#f4f1e6'; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.strokeStyle = '#2a2a2e'; g.lineWidth = 2; g.strokeRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2); g.fillStyle = '#1b3a26'; g.font = '700 19px "Chakra Petch", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('974·' + String(look.number).padStart(2, '0'), (x0 + x1) / 2, (y0 + y1) / 2 + 1); }
  { const [x0, y0, x1, y1] = ATLAS.banner; g.fillStyle = '#0d0d10'; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.fillStyle = acc === paint && !dark ? '#ffd23f' : (isDarkHex(look.accent) ? '#ffd23f' : acc); g.font = '400 22px "Dela Gothic One", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SIDEWAYS  ·  横滑り倶楽部  ·  DRIFT', (x0 + x1) / 2, (y0 + y1) / 2 + 1); }
  { g.fillStyle = paint; g.fillRect(0, 498, 24, 14); }
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  return t;
}

function carbonTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#131317'; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const gr = (x + y) % 2 ? g.createLinearGradient(x * 8, 0, x * 8 + 8, 0) : g.createLinearGradient(0, y * 8, 0, y * 8 + 8);
    gr.addColorStop(0, '#1c1c22'); gr.addColorStop(0.5, '#3a3a44'); gr.addColorStop(1, '#1c1c22');
    g.fillStyle = gr; g.fillRect(x * 8 + 0.5, y * 8 + 0.5, 7, 7);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
  return t;
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let _carbonTex = null, _glowTex = null;

// ---------- roues (géométrie face extérieure vers +z) ----------
function wheelGeos(style, R, rr, tw, lod) {
  const seg = lod ? 26 : 16;
  const fz = tw / 2 - 0.018;
  const rim = [], dark = [];
  // pneu : profil de révolution (flancs arrondis)
  const h = tw / 2, prof = [[rr - 0.004, -h + 0.01], [R - 0.045, -h], [R - 0.012, -h + 0.02], [R, -h + 0.05], [R, h - 0.05], [R - 0.012, h - 0.02], [R - 0.045, h], [rr - 0.004, h - 0.01]];
  const tire = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  tire.rotateX(Math.PI / 2);
  // fût + fond (empêche de voir à travers la roue)
  dark.push(new THREE.CylinderGeometry(rr - 0.004, rr - 0.004, tw - 0.03, seg, 1, true).rotateX(Math.PI / 2));
  dark.push(new THREE.CircleGeometry(rr - 0.004, seg).translate(0, 0, -h + 0.03));
  // lèvre, moyeu, écrous
  rim.push(new THREE.TorusGeometry(rr - 0.008, 0.013, 6, seg).translate(0, 0, fz + 0.004));
  rim.push(new THREE.CylinderGeometry(0.042, 0.048, 0.03, 12).rotateX(Math.PI / 2).translate(0, 0, fz - 0.03));
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; rim.push(new THREE.CylinderGeometry(0.011, 0.011, 0.022, 6).rotateX(Math.PI / 2).translate(Math.cos(a) * 0.066, Math.sin(a) * 0.066, fz - 0.012)); }
  const spoke = (r0, r1, w, depth, ang, z, twist, slant) => {
    const len = r1 - r0;
    const g = new THREE.BoxGeometry(len, w, depth);
    if (twist) g.rotateX(twist);
    g.translate(r0 + len / 2, 0, z);
    if (slant) g.rotateZ(slant);
    rim.push(g.rotateZ(ang));
  };
  const n = { six: 6, five: 5, mesh: 10, turbine: 12, dish: 5 }[style] || 6;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    if (style === 'five') { spoke(0.04, rr * 0.55, 0.075, 0.04, a, fz - 0.035); spoke(rr * 0.5, rr - 0.012, 0.05, 0.035, a, fz - 0.012); }
    else if (style === 'mesh') { spoke(0.05, rr - 0.012, 0.018, 0.02, a, fz - 0.02, 0, 0.42); spoke(0.05, rr - 0.012, 0.018, 0.02, a + Math.PI / n, fz - 0.024, 0, -0.42); }
    else if (style === 'turbine') spoke(0.05, rr - 0.02, 0.04, 0.03, a, fz - 0.02, 0.7);
    else if (style === 'dish') spoke(0.04, rr - 0.075, 0.05, 0.035, a, fz - 0.075);
    else spoke(0.04, rr - 0.012, 0.045, 0.032, a, fz - 0.016);
  }
  if (style === 'dish') {
    rim.push(new THREE.CylinderGeometry(rr - 0.002, rr - 0.002, 0.07, seg, 1, true).rotateX(Math.PI / 2).translate(0, 0, fz - 0.035));
    rim.push(new THREE.RingGeometry(rr - 0.08, rr - 0.002, seg).translate(0, 0, fz - 0.07));
  }
  if (style === 'mesh') rim.push(new THREE.TorusGeometry(0.06, 0.012, 5, 12).translate(0, 0, fz - 0.03));
  const disc = new THREE.CylinderGeometry(rr - 0.035, rr - 0.035, 0.022, seg).rotateX(Math.PI / 2).translate(0, 0, fz - 0.095);
  const ca = 2.25; // étrier en haut, vers l'arrière
  const caliper = new THREE.BoxGeometry(0.075, 0.15, 0.06).rotateZ(ca - Math.PI / 2).translate(Math.cos(ca) * (rr - 0.065), Math.sin(ca) * (rr - 0.065), fz - 0.075);
  return { tire: mergeGeos([tire]), rim: mergeGeos(rim), dark: mergeGeos(dark), disc: mergeGeos([disc]), caliper: mergeGeos([caliper]), caliperAngle: ca };
}

// look : { paint, accent, finish, livery, number, rimStyle, rim, front, wide, wing, hood, exhaust, cage, neon, tune, night, lod }
function buildCar(kind, look) {
  const d = BODY_DEFS[kind];
  const lod = look.lod == null ? 1 : look.lod;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const disposables = [];
  const keep = (o) => { disposables.push(o); return o; };
  const parts = new Map(); // matériau → géométries
  const add = (key, geo) => { if (!parts.has(key)) parts.set(key, []); parts.get(key).push(geo); return geo; };

  const { fa, ra, R } = d;
  const X0 = ra - d.tail, X1 = fa + d.nose, L = X1 - X0, W = d.w / 2;
  const AR = R + 0.075, archTop = R + AR;
  const ws0 = fa - 0.42, ws1 = ws0 - d.wsLen;
  const wide = KIT_BULGE[look.wide] || 0;
  const bulgeAmt = d.bulge + wide;
  const tune = look.tune || { height: 0.5, camber: 0.35, track: 0.5 };

  // ---------- profils de la caisse ----------
  const bump = (dx, len) => (Math.abs(dx) < len ? 0.5 + 0.5 * Math.cos(Math.PI * dx / len) : 0);
  const plan = (x) => {
    let f = 1;
    if (x > X1 - 0.42) { const u = (x - (X1 - 0.42)) / 0.42; f -= 0.13 * u * u; }
    if (x < X0 + 0.36) { const u = (X0 + 0.36 - x) / 0.36; f -= 0.1 * u * u; }
    return f;
  };
  const topY = (x) => {
    const xr = X1 - 0.3;
    if (x >= ws0) {
      if (x > xr) { const u = (x - xr) / 0.3; return d.hood - (d.hood - d.noseTop) * u * u; }
      const t = (x - ws0) / (xr - ws0);
      return d.cowl + (d.hood - d.cowl) * Math.pow(t, 1.15);
    }
    const xd = X0 + 0.28;
    if (x > xd) return d.cowl + (d.deck - d.cowl) * (ws0 - x) / (ws0 - xd);
    const u = (xd - x) / 0.28;
    return d.deck - 0.14 * u * u;
  };
  const botY = (x) => {
    let y = d.sill;
    if (x > X1 - 0.45) { const u = (x - (X1 - 0.45)) / 0.45; y += 0.08 * u * u; }
    if (x < X0 + 0.45) { const u = (X0 + 0.45 - x) / 0.45; y += 0.1 * u * u; }
    for (const wx of [fa, ra]) { const dx = x - wx; if (Math.abs(dx) <= AR) y = Math.max(y, R + Math.sqrt(AR * AR - dx * dx)); }
    return y;
  };
  const section = (x) => {
    const yC = topY(x);
    let yS = yC - d.crown;
    for (const wx of [fa, ra]) yS = Math.max(yS, archTop + 0.075 - (1 - bump(x - wx, AR * 1.5)) * 0.6);
    const yBot = Math.min(botY(x), yS - 0.07);
    const bl = bulgeAmt * (bump(x - fa, AR * 1.55) + bump(x - ra, AR * 1.55));
    const wB = W * plan(x) + bl;
    const wT = (W - d.inset) * plan(x) * (x > X1 - 0.42 ? plan(x) : 1) + bl * 0.35;
    return { yC, yS, yBot, wB, wT, wL: wB - 0.035 };
  };
  const topAt = (x, z) => { const s = section(x); const k = Math.min(1, Math.abs(z) / s.wT); return s.yC + (s.yS - s.yC) * k * k; };
  const wT0 = W - d.inset;

  // ---------- caisse (loft) ----------
  const gStart = d.gEnd, cabin = (x) => x < ws0 - 0.04 && x > gStart + 0.06;
  const floorY = d.sill + 0.12;
  const xs = [];
  const stepX = lod ? 0.06 : 0.1;
  for (let x = X0; x < X1; x += stepX) xs.push(x);
  xs.push(X1);
  for (const wx of [fa, ra]) for (const k of [-1, -0.7, -0.35, 0, 0.35, 0.7, 1]) xs.push(wx + k * AR);
  xs.push(ws0 - 0.04, ws0 - 0.035, gStart + 0.06, gStart + 0.065);
  xs.sort((a, b) => a - b);
  const xsU = xs.filter((x, i) => i === 0 || x - xs[i - 1] > 0.004);
  const U = (x) => (x - X0) / L;
  const rings = xsU.map((x) => {
    const s = section(x), u = U(x);
    const h2 = Math.min(0.06, (s.yS - s.yBot) * 0.25);
    const yBelt = s.yBot + (s.yS - s.yBot) * 0.5;
    const vSide = (y, sgn) => (sgn > 0 ? 0.7 + 0.3 * (1 - y) : 0.3 * y);
    const side = (sgn) => {
      const p0 = [x, s.yBot, sgn * s.wL, u, vSide(s.yBot, sgn)];
      const p1 = [x, yBelt, sgn * s.wB, u, vSide(yBelt, sgn)];
      const p2 = [x, s.yS - h2, sgn * (s.wB - 0.012), u, vSide(s.yS - h2, sgn)];
      const vTop = 0.5 + 0.2 * sgn;
      const p3 = [x, s.yS - 0.012, sgn * (s.wT + (s.wB - s.wT) * 0.4), u, (vSide(s.yS - h2, sgn) + vTop) / 2];
      const p4 = [x, s.yS, sgn * s.wT, u, vTop];
      return [p0, p1, p2, p3, p4];
    };
    let top;
    if (cabin(x)) {
      const zi = s.wT - 0.05, zf = s.wT - 0.08, pu = ATLAS.plain;
      top = [[x, s.yS - 0.01, -zi, ...pu], [x, floorY, -zf, ...pu], [x, floorY, zf, ...pu], [x, s.yS - 0.01, zi, ...pu]];
    } else {
      top = [-0.55, -0.18, 0.18, 0.55].map((k) => { const z = k * s.wT; return [x, topAt(x, z), z, u, 0.5 + 0.2 * k]; });
    }
    return [...side(-1), ...top, ...side(1).reverse()];
  });
  for (const [, g] of loft(rings, () => 'paint')) add('paint', g);
  add('paint', capGeo(rings[rings.length - 1], true, ATLAS.plain));
  add('paint', capGeo(rings[0], false, ATLAS.plain));
  // plancher, passages de roue
  { const g = new THREE.PlaneGeometry(L - 0.3, W * 2 - 0.12); g.rotateX(Math.PI / 2); add('trim', bake(g, (X0 + X1) / 2, d.sill + 0.02, 0)); }
  for (const wx of [fa, ra]) {
    const g = new THREE.CylinderGeometry(AR, AR, W * 2 + bulgeAmt * 2 - 0.06, lod ? 18 : 10, 1, true, Math.PI / 2, Math.PI);
    add('trim', bake(g.rotateX(Math.PI / 2), wx, R, 0));
  }

  // ---------- habitacle vitré ----------
  {
    const gx = [];
    const n = lod ? 30 : 16;
    for (let i = 0; i <= n; i++) gx.push(gStart + (ws0 - gStart) * (i / n));
    for (const k of [ws1 + 0.02, ws1 - 0.02, d.roofEnd + 0.02, d.roofEnd - 0.02, d.bpil - 0.05, d.bpil + 0.05, d.cpil]) if (k > gStart && k < ws0) gx.push(k);
    gx.sort((a, b) => a - b);
    const roofY = (x) => {
      if (x >= ws1) { const t = (ws0 - x) / (ws0 - ws1); return 1 - Math.pow(1 - t, 1.7); }
      if (x >= d.roofEnd) return 1;
      const t = (x - gStart) / (d.roofEnd - gStart);
      return d.hatch ? Math.pow(t, 0.75) : 1 - Math.pow(1 - t, 2.2);
    };
    const gRings = gx.map((x) => {
      const s = section(x), u = U(x);
      const wb = s.wT - 0.035, yb = s.yS - 0.004;
      const k = roofY(x);
      const yt = yb + (d.roof - yb) * k;
      const wt = wb - d.tumble * (0.4 + 0.6 * k);
      const vt = (z) => 0.5 + 0.2 * Math.max(-1, Math.min(1, z / s.wT));
      const pts = [[-wb, yb], [-(wt + 0.03), yt - 0.055 * k], [-(wt - 0.06), yt], [0, yt + 0.018 * k], [wt - 0.06, yt], [wt + 0.03, yt - 0.055 * k], [wb, yb]];
      return pts.map(([z, y]) => [x, y, z, u, vt(z)]);
    });
    const roofSpan = (x) => x <= ws1 - 0.02 && x >= d.roofEnd + 0.02;
    const gm = loft(gRings, (i, j) => {
      const x = (gx[i] + gx[i + 1]) / 2;
      if (j === 1 || j === 4) return 'paint';
      if (j === 2 || j === 3) return roofSpan(x) ? 'paint' : 'glass';
      if (Math.abs(x - d.bpil) < 0.05) return 'trim';
      if (x < d.cpil) return 'paint';
      return 'glass';
    });
    for (const [k, g] of gm) add(k, g);
    // bandeau de pare-brise (atlas de la livrée)
    {
      const xa = ws0 - (ws0 - ws1) * 0.78, xb = ws1 + 0.01;
      const sa = section(xa), sb = section(xb);
      const ya = sa.yS + (d.roof - sa.yS) * roofY(xa) + 0.006, yb2 = sb.yS + (d.roof - sb.yS) * roofY(xb) + 0.006;
      const za = sa.wT - 0.035 - d.tumble * (0.4 + 0.6 * roofY(xa)) - 0.05, zb = sb.wT - 0.035 - d.tumble - 0.06;
      add('paint', quadGeo([xa + 0.01, ya, za], [xa + 0.01, ya, -za], [xb, yb2, -zb], [xb, yb2, zb], atlasUV(ATLAS.banner)));
    }
  }

  // ---------- intérieur : baquets, tableau de bord, volant à droite (JDM) ----------
  if (lod) {
    for (const sz of [-1, 1]) {
      const z = sz * 0.36, x = ws0 - 1.0;
      add('trim', bake(new THREE.BoxGeometry(0.46, 0.1, 0.44), x, floorY + 0.12, z));
      add('trim', bake(new THREE.BoxGeometry(0.1, 0.62, 0.46), x - 0.26, floorY + 0.45, z, 0, 0, 0.22));
    }
    add('trim', bake(new THREE.BoxGeometry(0.34, 0.16, (wT0 - 0.1) * 2), ws0 - 0.2, d.cowl - 0.12, 0));
    add('trim', bake(new THREE.TorusGeometry(0.16, 0.022, 6, 16), ws0 - 0.48, d.cowl - 0.06, 0.36, 0, Math.PI / 2 - 0.35, 0));
  }
  // arceau
  if (look.cage === 'cage') {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const hx = ws0 - 1.42, top = d.roof - 0.07, zc = wT0 - 0.2, ax = ws1 - 0.05;
    const tubes = [[V(hx, floorY, -zc), V(hx, top, -zc)], [V(hx, floorY, zc), V(hx, top, zc)], [V(hx, top, -zc), V(hx, top, zc)], [V(hx, floorY, -zc), V(hx, top, zc)],
      [V(hx, top, -zc), V(ax, top, -zc + 0.08)], [V(hx, top, zc), V(ax, top, zc - 0.08)], [V(ax, top, -zc + 0.08), V(ws0 - 0.2, d.cowl - 0.05, -zc - 0.02)], [V(ax, top, zc - 0.08), V(ws0 - 0.2, d.cowl - 0.05, zc + 0.02)],
      [V(hx, floorY + 0.1, -zc - 0.03), V(ws0 - 0.25, d.cowl - 0.2, -zc - 0.03)], [V(hx, floorY + 0.1, zc + 0.03), V(ws0 - 0.25, d.cowl - 0.2, zc + 0.03)], [V(hx, top, -zc), V(hx - 0.55, floorY + 0.15, -zc + 0.05)], [V(hx, top, zc), V(hx - 0.55, floorY + 0.15, zc - 0.05)]];
    for (const [a, b] of tubes) add('cage', tube(a, b, 0.022, 6));
  }

  // ---------- rétroviseurs ----------
  for (const sz of [-1, 1]) {
    const s = section(ws0 - 0.08);
    add('paint', bake(new THREE.BoxGeometry(0.14, 0.08, 0.11), ws0 - 0.12, s.yS + 0.075, sz * (s.wT + 0.1), 0, sz * 0.15, 0));
    add('trim', bake(new THREE.BoxGeometry(0.06, 0.025, 0.1), ws0 - 0.1, s.yS + 0.03, sz * (s.wT + 0.03)));
  }

  // ---------- face avant ----------
  const sF = section(X1), sR = section(X0);
  const fz = X1 + 0.004;
  add('trim', quadGeo([fz, sF.yBot + 0.04, sF.wB * 0.66], [fz, sF.yBot + 0.04, -sF.wB * 0.66], [fz, sF.yBot + 0.13, -sF.wB * 0.62], [fz, sF.yBot + 0.13, sF.wB * 0.62]));
  add('trim', quadGeo([fz, sF.yS - 0.11, sF.wB * 0.42], [fz, sF.yS - 0.11, -sF.wB * 0.42], [fz, sF.yS - 0.05, -sF.wB * 0.38], [fz, sF.yS - 0.05, sF.wB * 0.38]));
  const headLamps = [];
  if (d.head === 'popup') {
    for (const sz of [-1, 1]) {
      const x = X1 - 0.36, z = sz * section(x).wT * 0.66, y = topAt(x, z);
      headLamps.push({ x, y, z });
      // bloc escamotable : relevé la nuit, phare tourné vers l'avant
      if (look.night) {
        add('paint', bake(new THREE.BoxGeometry(0.3, 0.15, 0.4), x, y + 0.04, z));
        add('head', bake(new THREE.BoxGeometry(0.02, 0.11, 0.32), x + 0.155, y + 0.045, z));
      } else add('paint', bake(new THREE.BoxGeometry(0.34, 0.03, 0.4), x, y + 0.004, z, 0, 0, -0.08));
    }
    for (const sz of [-1, 1]) add('head', bake(new THREE.BoxGeometry(0.02, 0.05, 0.22), fz + 0.004, sF.yBot + 0.18, sz * sF.wB * 0.6));
  } else if (d.head === 'projector') {
    for (const sz of [-1, 1]) {
      const x = X1 - 0.17, z = sz * sF.wT * 0.78, y = topAt(x, z) - 0.025;
      const slope = Math.atan2(topY(X1 - 0.32) - topY(X1 - 0.02), 0.3);
      add('trim', bake(new THREE.BoxGeometry(0.3, 0.05, 0.36), x, y - 0.012, z, 0, sz * 0.1, -slope));
      for (const k of [-1, 1]) add('head', bake(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 12), x + 0.135, y - 0.008, z + k * 0.09, 0, 0, Math.PI / 2 - slope));
      headLamps.push({ x, y, z });
    }
  } else {
    for (const sz of [-1, 1]) {
      const x = X1 - 0.16, z = sz * sF.wT * 0.76, y = topAt(x, z) - 0.04;
      const g = new THREE.SphereGeometry(1, 14, 8); g.scale(0.2, 0.045, 0.16);
      add('trim', bake(g, x, y - 0.005, z, 0, sz * 0.25, -0.28));
      const l = new THREE.SphereGeometry(1, 10, 6); l.scale(0.045, 0.022, 0.045);
      for (const k of [-1, 1]) add('head', bake(l.clone(), x + 0.1, y + 0.008, z + k * 0.065, 0, 0, -0.3));
      headLamps.push({ x, y, z });
    }
  }
  // pare-chocs avant : lame / bouclier aéro
  if (look.front === 'lip' || look.front === 'aero') {
    const depth = look.front === 'aero' ? 0.32 : 0.22;
    add('carbon', bake(new THREE.BoxGeometry(depth, 0.025, sF.wL * 2 * 0.98), X1 - depth / 2 + 0.07, sF.yBot - 0.025, 0));
  }
  if (look.front === 'aero') {
    for (const sz of [-1, 1]) {
      add('carbon', bake(new THREE.BoxGeometry(0.2, 0.012, 0.12), X1 - 0.06, sF.yBot + 0.09, sz * (sF.wB - 0.02), 0, 0, 0.2));
      const s = section((fa + ra) / 2);
      add('carbon', bake(new THREE.BoxGeometry(fa - ra - AR * 2 - 0.1, 0.05, 0.07), (fa + ra) / 2, d.sill - 0.01, sz * (s.wL + 0.01)));
    }
  }

  // ---------- capot ----------
  if (look.hood === 'carbon') {
    const hx = []; for (let x = ws0 + 0.05; x <= X1 - 0.14; x += 0.08) hx.push(x);
    const hr = hx.map((x) => { const s = section(x); return [-0.88, -0.44, 0, 0.44, 0.88].map((k) => { const z = k * s.wT; return [x, topAt(x, z) + 0.006, z, x * 4, z * 4]; }); });
    for (const [, g] of loft(hr, () => 'carbon')) add('carbon', g);
  } else if (look.hood === 'vent') {
    for (const sz of [-1, 1]) for (let k = 0; k < 5; k++) {
      const x = ws0 + 0.2 + k * 0.06, z = sz * section(x).wT * 0.45;
      add('trim', bake(new THREE.BoxGeometry(0.03, 0.025, 0.28), x, topAt(x, z) + 0.006, z, 0, 0, -0.5));
    }
  }

  // ---------- arrière : feux, plaque, diffuseur ----------
  const rz = X0 - 0.004;
  const tailY = sR.yS - 0.15;
  if (d.tailL === 'twin') {
    for (const sz of [-1, 1]) add('tail', bake(new THREE.BoxGeometry(0.03, 0.13, sR.wB * 0.62), rz, tailY, sz * sR.wB * 0.56));
    add('trim', bake(new THREE.BoxGeometry(0.025, 0.12, sR.wB * 0.5), rz, tailY, 0));
  } else if (d.tailL === 'bar') {
    add('tail', bake(new THREE.BoxGeometry(0.03, 0.09, sR.wB * 1.8), rz, tailY + 0.02, 0));
    for (const sz of [-1, 1]) add('head', bake(new THREE.BoxGeometry(0.032, 0.05, 0.12), rz - 0.002, tailY + 0.02, sz * 0.18));
  } else {
    for (const sz of [-1, 1]) for (const k of [0.38, 0.62]) add('tail', bake(new THREE.CylinderGeometry(0.065, 0.065, 0.04, 14), rz, tailY, sz * sR.wB * k * 1.25, 0, 0, Math.PI / 2));
  }
  add('paint', quadGeo([rz - 0.002, sR.yBot + 0.1, -0.2], [rz - 0.002, sR.yBot + 0.1, 0.2], [rz - 0.002, sR.yBot + 0.23, 0.2], [rz - 0.002, sR.yBot + 0.23, -0.2], atlasUV(ATLAS.plate)));
  add('trim', bake(new THREE.BoxGeometry(0.3, 0.06, sR.wL * 1.7), X0 + 0.12, sR.yBot - 0.015, 0));
  for (let k = -2; k <= 2; k++) add('trim', bake(new THREE.BoxGeometry(0.28, 0.07, 0.012), X0 + 0.12, sR.yBot - 0.05, k * 0.16));

  // ---------- échappement + flammes ----------
  const flameM = keep(new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  const flame = new THREE.Group();
  flame.visible = false;
  const flameGeo = keep(new THREE.ConeGeometry(0.1, 0.55, 8));
  const tips = [];
  if (look.exhaust === 'side') {
    tips.push({ p: [ra + AR + 0.18, d.sill + 0.04, -(section(ra + AR + 0.18).wL + 0.02)], dir: [0, 0, -1] });
  } else if (look.exhaust === 'twin') {
    for (const sz of [-1, 1]) tips.push({ p: [X0 - 0.05, sR.yBot + 0.05, sz * sR.wB * 0.62], dir: [-1, 0, 0], r: 0.058 });
  } else tips.push({ p: [X0 - 0.05, sR.yBot + 0.05, -sR.wB * 0.55], dir: [-1, 0, 0], r: 0.05 });
  for (const t of tips) {
    const [x, y, z] = t.p, side = t.dir[2] !== 0;
    const r = t.r || 0.055;
    add('cage', bake(new THREE.CylinderGeometry(r, r, 0.22, 12, 1, true), x, y, z, side ? Math.PI / 2 : 0, 0, side ? 0 : Math.PI / 2));
    add('trim', bake(new THREE.CircleGeometry(r * 0.8, 10), x + t.dir[0] * 0.09, y, z + t.dir[2] * 0.09, 0, side ? Math.PI : -Math.PI / 2, 0));
    const f = new THREE.Mesh(flameGeo, flameM);
    if (side) f.rotation.x = -Math.PI / 2; else f.rotation.z = Math.PI / 2;
    f.position.set(x + t.dir[0] * 0.37, y, z + t.dir[2] * 0.37);
    flame.add(f);
  }
  body.add(flame);

  // ---------- aileron ----------
  const wing = look.wing === 'stock' || !look.wing ? d.wing : look.wing;
  const deckAt = (x) => topY(x);
  if (wing === 'lip') {
    const s = section(d.roofEnd);
    add('paint', bake(new THREE.BoxGeometry(0.24, 0.035, (s.wT - d.tumble) * 2), d.roofEnd - 0.06, d.roof + 0.0, 0, 0, 0, -0.18));
  } else if (wing === 'duck') {
    const x = X0 + 0.16, s = section(x);
    const sh = new THREE.Shape(); sh.moveTo(0.18, 0); sh.lineTo(-0.16, 0); sh.lineTo(-0.2, 0.09); sh.lineTo(-0.12, 0.08); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: s.wT * 1.9, bevelEnabled: false });
    add('paint', g.translate(x, deckAt(x) - 0.01, -s.wT * 0.95));
  } else if (wing === 'gt' || wing === 'hoop' || wing === 'swan') {
    const x = X0 + (wing === 'swan' ? 0.26 : 0.32), y = d.deck + (wing === 'swan' ? 0.42 : wing === 'hoop' ? 0.24 : 0.3);
    const span = wing === 'hoop' ? W * 2 - 0.08 : W * 2 - (wing === 'swan' ? 0.1 : 0.25);
    const bladeMat = wing === 'hoop' ? 'paint' : wing === 'swan' ? 'carbon' : 'trim';
    add(bladeMat, bake(new THREE.BoxGeometry(0.36, 0.035, span), x, y, 0, 0, 0, 0.1));
    add(bladeMat, bake(new THREE.BoxGeometry(0.1, 0.02, span), x - 0.17, y + 0.025, 0, 0, 0, 0.6));
    for (const sz of [-1, 1]) {
      const zs = sz * (span / 2 - (wing === 'hoop' ? 0.02 : 0.2));
      if (wing === 'swan') {
        add('carbon', bake(new THREE.BoxGeometry(0.06, 0.26, 0.02), x + 0.16, y + 0.06, zs, 0, 0, -0.5));
        add('carbon', bake(new THREE.BoxGeometry(0.05, 0.3, 0.02), x + 0.3, deckAt(x + 0.3) + 0.12, zs, 0, 0, 0.35));
      } else add(bladeMat, bake(new THREE.BoxGeometry(0.12, y - deckAt(x) + 0.02, 0.035), x + 0.02, (y + deckAt(x)) / 2, zs, 0, 0, wing === 'hoop' ? -0.15 : 0));
      add(wing === 'hoop' ? 'paint' : 'trim', bake(new THREE.BoxGeometry(0.42, wing === 'swan' ? 0.22 : 0.15, 0.025), x - 0.01, y + 0.03, sz * span / 2));
    }
  }

  // ---------- matériaux ----------
  const FIN = { gloss: [0.25, 0.28, 1.0], metal: [0.6, 0.3, 1.2], matte: [0.05, 0.78, 0.45], pearl: [0.45, 0.18, 1.4], chrome: [1.0, 0.07, 1.7] };
  const [met, rough, envI] = FIN[look.finish] || FIN.gloss;
  const liv = keep(paintLivery(look, d, X0, L, wT0));
  const mats = {
    paint: keep(new THREE.MeshStandardMaterial({ map: liv, metalness: met, roughness: rough, envMapIntensity: envI })),
    glass: keep(new THREE.MeshStandardMaterial({ color: 0x0b1018, metalness: 0.85, roughness: 0.06, transparent: true, opacity: 0.8, envMapIntensity: 1.3 })),
    trim: keep(new THREE.MeshStandardMaterial({ color: 0x0e0e10, metalness: 0.15, roughness: 0.7, envMapIntensity: 0.45, side: THREE.DoubleSide })),
    cage: keep(new THREE.MeshStandardMaterial({ color: 0xd6dadf, metalness: 0.92, roughness: 0.22 })),
    head: keep(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: look.night ? 2.4 : 0.7 })),
    tail: keep(new THREE.MeshStandardMaterial({ color: 0x5a0000, emissive: 0xff1a1a, emissiveIntensity: 0.7 })),
  };
  if (parts.has('carbon')) { if (!_carbonTex) _carbonTex = carbonTexture(); mats.carbon = keep(new THREE.MeshStandardMaterial({ map: _carbonTex, metalness: 0.35, roughness: 0.32, envMapIntensity: 1.1 })); }
  for (const [k, list] of parts) {
    const m = new THREE.Mesh(keep(mergeGeos(list)), mats[k]);
    m.castShadow = k !== 'glass';
    if (k === 'glass') m.renderOrder = 3;
    body.add(m);
  }

  // ---------- roues : InstancedMesh (pneu, jante, fût, disque, étrier) ----------
  const wg = wheelGeos(look.rimStyle || 'six', R, d.rr, d.tw, lod);
  const wMats = {
    tire: keep(new THREE.MeshStandardMaterial({ color: 0x19191b, roughness: 0.92, metalness: 0 })),
    rim: keep(new THREE.MeshStandardMaterial({ color: look.rim, metalness: 0.8, roughness: 0.26 })),
    dark: mats.trim,
    disc: keep(new THREE.MeshStandardMaterial({ color: 0x77787d, metalness: 0.8, roughness: 0.45 })),
    caliper: keep(new THREE.MeshStandardMaterial({ color: isDarkHex(look.accent) ? 0xd8262d : look.accent, metalness: 0.3, roughness: 0.4 })),
  };
  const inst = {};
  for (const k of ['tire', 'rim', 'dark', 'disc', 'caliper']) {
    const m = new THREE.InstancedMesh(keep(wg[k]), wMats[k], 4);
    m.frustumCulled = false; m.castShadow = k === 'tire';
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(m); inst[k] = m;
  }
  const camb = 0.02 + tune.camber * 0.2;
  const trackOff = (tune.track - 1) * 0.08;
  const wheels = [];
  for (const [x, side, front] of [[fa, 1, true], [fa, -1, true], [ra, 1, false], [ra, -1, false]]) {
    const s = section(x);
    const pivot = new THREE.Object3D(); pivot.position.set(x, R, side * (s.wB - d.tw / 2 - 0.012 + trackOff));
    const cam = new THREE.Object3D(); cam.rotation.x = -side * camb * (front ? 0.55 : 1);
    const flip = new THREE.Object3D(); flip.rotation.y = side < 0 ? Math.PI : 0;
    const spin = new THREE.Object3D();
    const cal = new THREE.Matrix4().makeRotationZ(side > 0 ? 0 : Math.PI - 2 * wg.caliperAngle);
    wheels.push({ pivot, cam, flip, spin, cal, front, side });
  }
  const mA = new THREE.Matrix4(), mB = new THREE.Matrix4();
  const writeWheels = () => {
    wheels.forEach((w, i) => {
      w.pivot.updateMatrix(); w.cam.updateMatrix(); w.flip.updateMatrix(); w.spin.updateMatrix();
      mA.multiplyMatrices(w.pivot.matrix, w.cam.matrix).multiply(w.flip.matrix);
      mB.multiplyMatrices(mA, w.cal);
      inst.caliper.setMatrixAt(i, mB);
      mA.multiply(w.spin.matrix);
      inst.tire.setMatrixAt(i, mA); inst.rim.setMatrixAt(i, mA); inst.dark.setMatrixAt(i, mA); inst.disc.setMatrixAt(i, mA);
    });
    for (const k in inst) inst[k].instanceMatrix.needsUpdate = true;
  };
  writeWheels();

  // ---------- ombre douce + néon ----------
  if (!_glowTex) _glowTex = glowTexture();
  const blobTex = _glowTex;
  const blob = new THREE.Mesh(keep(new THREE.PlaneGeometry(L + 1.2, W * 2 + 0.9)), keep(new THREE.MeshBasicMaterial({ map: blobTex, color: 0x000000, transparent: true, opacity: 0.62, depthWrite: false })));
  blob.rotation.x = -Math.PI / 2; blob.position.set((X0 + X1) / 2, 0.035, 0); blob.renderOrder = 1;
  root.add(blob);
  if (look.neon != null) {
    const neon = new THREE.Mesh(keep(new THREE.PlaneGeometry(L + 1.6, W * 2 + 1.6)), keep(new THREE.MeshBasicMaterial({ map: blobTex, color: look.neon, transparent: true, opacity: look.night ? 0.95 : 0.45, blending: THREE.AdditiveBlending, depthWrite: false })));
    neon.rotation.x = -Math.PI / 2; neon.position.set((X0 + X1) / 2, 0.04, 0); neon.renderOrder = 2;
    root.add(neon);
  }

  const rideY = (tune.height - 0.5) * 0.12;
  return {
    root, body, wheels, flame, tailM: mats.tail, headM: mats.head, paint: mats.paint,
    rearX: ra, frontX: fa, halfW: W, length: L, headLamps,
    exhaust: new THREE.Vector3(tips[0].p[0], tips[0].p[1], tips[0].p[2]),
    update(state, dt, braking) {
      root.position.set(state.x, 0, state.z);
      root.rotation.y = -state.heading;
      body.rotation.set(state.rollAngle * 0.9, 0, state.pitchAngle);
      body.position.y = rideY + Math.abs(state.rollAngle) * 0.1;
      for (const w of wheels) {
        w.spin.rotation.z = w.side > 0 ? -state.wheelRot : state.wheelRot;
        if (w.front) w.pivot.rotation.y = -state.steerAngle;
      }
      writeWheels();
      mats.tail.emissiveIntensity = braking ? 3.2 : 0.7;
    },
    flicker() { for (const f of flame.children) f.scale.set(1, 0.7 + Math.random() * 0.8, 1); },
    dispose() { root.parent && root.parent.remove(root); for (const o of disposables) o.dispose && o.dispose(); },
  };
}
