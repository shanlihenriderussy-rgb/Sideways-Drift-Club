// Lecture des carrosseries exportées par tools/models (fichiers assets/models/*.bin). Pur : aucun appel à Three.js.
//
// Fichier : « SDCM », longueur de l'en-tête (uint32), en-tête JSON, puis pour chaque niveau de détail
//   sommets  : 12 octets — position 3 × uint16 (dans la boîte min/size), normale 3 × int8, occlusion uint8, matière uint8
//   indices  : uint16 (ou uint32)
// Seule la moitié droite (z ≥ 0) est stockée : expand() refait le miroir. Le kit large n'est pas stocké : c'est une
// déformation calculée ici à partir des lignes de la caisse (les flancs s'écartent autour des passages de roue).

export const MODEL_MAGIC = 'SDCM';

export function decodeModel(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== MODEL_MAGIC) throw new Error('modèle illisible : en-tête ' + magic);
  const headLen = view.getUint32(4, true);
  const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headLen)));
  const base = 8 + headLen;
  const lods = meta.lods.map((L) => {
    const n = L.verts;
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3),
      ao = new Float32Array(n),
      mat = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const o = base + L.vOff + i * 12;
      for (let k = 0; k < 3; k++) {
        pos[i * 3 + k] = L.min[k] + (view.getUint16(o + k * 2, true) / 65535) * L.size[k];
        nor[i * 3 + k] = view.getInt8(o + 6 + k) / 127;
      }
      ao[i] = bytes[o + 9] / 255;
      mat[i] = bytes[o + 10];
    }
    const count = L.groups.reduce((s, g) => s + g.count, 0);
    const index = new Uint32Array(count);
    for (let i = 0; i < count; i++)
      index[i] = L.index32 ? view.getUint32(base + L.iOff + i * 4, true) : view.getUint16(base + L.iOff + i * 2, true);
    return { verts: n, pos, nor, ao, mat, index, groups: L.groups };
  });
  return { meta, lods };
}

// Écartement du kit large en un point de la caisse (m) : plein sur les flancs, 30 % au-dessus de la ligne d'épaule
// (capot, coffre, pavillon suivent un peu), nul sur l'axe. Les mêmes lignes servent à poser roues et pièces.
export function kitShift(lines, kit, x, y, z) {
  if (!kit) return 0;
  const s = lines.section(x);
  const b = s.wB - s.wB0; // écartement des flancs à cette abscisse
  if (b <= 0) return 0;
  const up = Math.max(0, Math.min(1, (y - s.yS) / 0.06));
  return b * (1 - 0.7 * up) * Math.min(1, Math.abs(z) / (s.wB0 * 0.6));
}

// Demi-modèle → modèle complet : sommets dupliqués en z → −z, triangles retournés. kit : élargissement (m).
// Renvoie un bloc par matière : { pos, nor, ao, mat (indice de matière par sommet), index }.
export function expand(model, lodIndex, kit = 0) {
  const L = model.lods[Math.min(lodIndex, model.lods.length - 1)];
  const lines = kit ? bodyLines(model.meta, kit) : null;
  const out = {};
  for (const g of L.groups) {
    // sommets utilisés par ce groupe, renumérotés
    const remap = new Map();
    const src = [];
    const idx = new Uint32Array(g.count * 2);
    for (let i = 0; i < g.count; i++) {
      const v = L.index[g.start + i];
      let r = remap.get(v);
      if (r === undefined) {
        r = src.length;
        remap.set(v, r);
        src.push(v);
      }
      idx[i] = r;
    }
    const n = src.length;
    // triangles du côté gauche : mêmes sommets + n, sens inversé
    for (let i = 0; i < g.count; i += 3) {
      idx[g.count + i] = idx[i] + n;
      idx[g.count + i + 1] = idx[i + 2] + n;
      idx[g.count + i + 2] = idx[i + 1] + n;
    }
    const pos = new Float32Array(n * 6),
      nor = new Float32Array(n * 6),
      ao = new Float32Array(n * 2),
      mat = new Uint8Array(n * 2);
    for (let i = 0; i < n; i++) {
      const v = src[i] * 3;
      const x = L.pos[v],
        y = L.pos[v + 1];
      const z = L.pos[v + 2] + (lines ? kitShift(lines, kit, x, y, L.pos[v + 2]) : 0);
      pos.set([x, y, z], i * 3);
      pos.set([x, y, -z], (n + i) * 3);
      nor.set([L.nor[v], L.nor[v + 1], L.nor[v + 2]], i * 3);
      nor.set([L.nor[v], L.nor[v + 1], -L.nor[v + 2]], (n + i) * 3);
      ao[i] = ao[n + i] = L.ao[src[i]];
      mat[i] = mat[n + i] = L.mat[src[i]];
    }
    out[g.mat] = { pos, nor, ao, mat, index: idx };
  }
  return out;
}

// Lignes de la caisse relevées à l'export : section(x) et hauteur de surface, pour poser les pièces rapportées.
export function bodyLines(meta, kit = 0) {
  const { X0, X1, n, nz, profile, surf } = meta;
  const L = X1 - X0,
    W = meta.w / 2;
  const AR = meta.AR;
  const bump = (dx, half) => (Math.abs(dx) < half ? 0.5 + 0.5 * Math.cos((Math.PI * dx) / half) : 0);
  const at = (arr, x) => {
    const f = Math.max(0, Math.min(n - 1.0001, ((x - X0) / L) * (n - 1)));
    const i = Math.floor(f);
    return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
  };
  const kitAt = (x) => kit * (bump(x - meta.fa, AR * 1.6) + bump(x - meta.ra, AR * 1.6));
  // hauteur de la surface extérieure (caisse ou vitrage) à la verticale de (x, z)
  const surfY = (x, z) => {
    const fx = Math.max(0, Math.min(n - 1.0001, ((x - X0) / L) * (n - 1)));
    const fz = Math.max(0, Math.min(nz - 1.0001, (Math.abs(z) / W) * (nz - 1)));
    const i = Math.floor(fx),
      j = Math.floor(fz),
      u = fx - i,
      v = fz - j;
    const a = surf[i][j],
      b = surf[i + 1][j],
      c = surf[i][j + 1],
      d = surf[i + 1][j + 1];
    // hors de la caisse (0) : on garde le voisin intérieur plutôt que de plonger vers le sol
    const pick = (p, q, t) => (q <= 0 ? p : p <= 0 ? q : p + (q - p) * t);
    return pick(pick(a, b, u), pick(c, d, u), v);
  };
  const section = (x) => {
    const wB = at(profile.wB, x) + kitAt(x);
    const yS = at(profile.yS, x),
      yBot = at(profile.yBot, x);
    return { yS, yBot, yC: surfY(x, 0), wB, wB0: wB - kitAt(x), wT: wB - meta.edgeIn, wL: wB - 0.05 };
  };
  return { section, surfY, bump };
}
