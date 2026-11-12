// Livrée : une texture unique enveloppe la caisse.
// Disposition (v vers le haut de l'image) : flanc droit v∈[0,7 ; 1] (v = 0,7 + 0,3(1 − y)), dessus v∈[0,3 ; 0,7]
// (v = 0,5 + 0,2 z/wT), flanc gauche v∈[0 ; 0,3] (v = 0,3 y) ; u = (x − X0)/L. Les zones y < 0,2 m ne sont jamais
// visibles sur la caisse : elles servent d'atlas (plaque, bandeau de pare-brise, zone de peinture unie).
// Les joints d'ouvrants ne sont plus peints : ils sont creusés dans le maillage (tools/models).
import { hexStr, isDarkHex } from '../geometry.js';
import { rng } from '../world.js';

export const LIV_W = 1024,
  LIV_H = 512;
export const ATLAS = { plain: [4 / LIV_W, 1 - 507 / LIV_H], plate: [10, 1, 100, 30], banner: [200, 1, 1000, 30] };
export const atlasUV = (r) => [r[0] / LIV_W, 1 - r[3] / LIV_H, r[2] / LIV_W, 1 - r[1] / LIV_H];
const SPONSORS = ['NO GRIP', 'TOUGE', '974', '横滑り', 'CLIP IT', 'KAIZEN'];

export function paintLivery(look, d, X0, L, wT0) {
  const c = document.createElement('canvas');
  c.width = LIV_W;
  c.height = LIV_H;
  const g = c.getContext('2d');
  const paint = hexStr(look.paint),
    acc = hexStr(look.accent);
  const dark = isDarkHex(look.paint);
  const ink = dark ? '#f3efe4' : '#141418';
  const sx = LIV_W / L,
    kY = 153.6,
    kZ = 102.4 / wT0;
  const P = (band, x, s) =>
    band === 'R'
      ? [(x - X0) * sx, kY * s]
      : band === 'L'
        ? [(x - X0) * sx, LIV_H - kY * s]
        : [(x - X0) * sx, 256 - kZ * s];
  const poly = (band, pts, fill, alpha) => {
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.fillStyle = fill;
    g.beginPath();
    pts.forEach(([x, s], i) => {
      const [px, py] = P(band, x, s);
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    });
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
  };
  const rect = (band, x0, s0, x1, s1, fill, alpha) =>
    poly(
      band,
      [
        [x0, s0],
        [x1, s0],
        [x1, s1],
        [x0, s1],
      ],
      fill,
      alpha,
    );
  // texte posé droit sur la carrosserie (corrige l'anisotropie et le sens de lecture de chaque bande)
  const text = (band, str, x, s, size, fill, opts) => {
    const [px, py] = P(band, x, s);
    g.save();
    if (band === 'R') g.setTransform(1, 0, 0, -kY / sx, px, py);
    else if (band === 'L') g.setTransform(-1, 0, 0, kY / sx, px, py);
    else g.setTransform(0, -kZ / sx, -1, 0, px, py);
    g.font = `${(opts && opts.weight) || 900} ${size * sx}px ${(opts && opts.font) || '"Dela Gothic One", "Arial Black", sans-serif'}`;
    g.textAlign = (opts && opts.align) || 'center';
    g.textBaseline = 'middle';
    if (opts && opts.stroke) {
      g.lineWidth = opts.stroke * sx;
      g.strokeStyle = opts.strokeColor || ink;
      g.lineJoin = 'round';
      g.strokeText(str, 0, 0);
    }
    g.fillStyle = fill;
    g.fillText(str, 0, 0);
    g.restore();
  };
  // fond + finition
  g.fillStyle = paint;
  g.fillRect(0, 0, LIV_W, LIV_H);
  if (look.finish === 'metal' || look.finish === 'pearl') {
    const r = rng(look.number * 31 + 7);
    for (let i = 0; i < 9000; i++) {
      g.globalAlpha = 0.05 + r() * 0.08;
      g.fillStyle = r() > 0.5 ? '#ffffff' : '#000000';
      g.fillRect(r() * LIV_W, r() * LIV_H, 1.5, 1.5);
    }
    g.globalAlpha = 1;
  }
  if (look.finish === 'pearl') {
    const gr = g.createLinearGradient(0, 0, LIV_W, LIV_H);
    gr.addColorStop(0, 'rgba(255,170,255,0.16)');
    gr.addColorStop(0.5, 'rgba(120,220,255,0.12)');
    gr.addColorStop(1, 'rgba(255,240,170,0.16)');
    g.fillStyle = gr;
    g.fillRect(0, 0, LIV_W, LIV_H);
  }
  const ws0 = d.fa - 0.42,
    mid = (ws0 + d.bpil) / 2;
  const sides = ['R', 'L'];
  // ----- livrées
  const roundel = (band, x, y, r) => {
    const [px, py] = P(band, x, y);
    g.save();
    g.translate(px, py);
    g.scale(1, band === 'T' ? kZ / sx : kY / sx);
    g.fillStyle = '#f7f4ec';
    g.beginPath();
    g.arc(0, 0, r * sx, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 0.025 * sx;
    g.strokeStyle = '#16161a';
    g.stroke();
    g.restore();
    text(band, String(look.number), x, y + (band === 'T' ? 0 : -0.005), r * 1.15, '#16161a');
  };
  const sponsors = (band) => {
    const items = [
      [d.fa + 0.18, 0.44, SPONSORS[look.number % 6]],
      [d.ra + 0.5, 0.43, SPONSORS[(look.number + 2) % 6]],
      [d.ra - 0.22, 0.6, SPONSORS[(look.number + 4) % 6]],
    ];
    for (const [x, y, s] of items) {
      rect(band, x - 0.2, y - 0.045, x + 0.2, y + 0.045, '#f7f4ec');
      text(band, s, band === 'L' ? x : x, y, 0.06, '#16161a', {
        weight: 700,
        font: '"Chakra Petch", "Arial", sans-serif',
      });
    }
  };
  if (look.livery === 'club') {
    for (const b of sides) {
      poly(
        b,
        [
          [X0, 0.43],
          [X0 + L, 0.6],
          [X0 + L, 0.645],
          [X0, 0.49],
        ],
        acc,
      );
      poly(
        b,
        [
          [X0, 0.36],
          [X0 + L, 0.535],
          [X0 + L, 0.555],
          [X0, 0.385],
        ],
        '#e8352f',
      );
      text(b, 'SIDEWAYS DRIFT CLUB', d.ra + 0.05, 0.72, 0.065, acc, {
        weight: 700,
        font: '"Chakra Petch", "Arial", sans-serif',
      });
      text(b, 'ドリフト', d.fa + 0.25, 0.64, 0.08, acc, { weight: 700, font: '"Chakra Petch", sans-serif' });
      roundel(b, mid, 0.56, 0.13);
      sponsors(b);
    }
  } else if (look.livery === 'stripes') {
    for (const sgn of [-1, 1]) rect('T', X0, sgn * 0.06, X0 + L, sgn * 0.17, acc);
    for (const b of sides) {
      rect(b, X0, 0.33, X0 + L, 0.37, acc);
      rect(b, X0, 0.385, X0 + L, 0.395, acc);
      roundel(b, mid, 0.56, 0.13);
      sponsors(b);
    }
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
      g.globalAlpha = 0.95;
      g.fillStyle = r() > 0.25 ? acc : ink;
      const x = r() * LIV_W,
        y = 40 + r() * (LIV_H - 80),
        s = 6 + r() * r() * 46;
      g.beginPath();
      g.arc(x, y, s, 0, Math.PI * 2);
      g.fill();
      if (r() > 0.6) {
        g.fillRect(x - s * 0.15, y, s * 0.3, s * (1.5 + r() * 2));
        g.beginPath();
        g.arc(x, y + s * 2.6, s * 0.22, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    for (const b of sides) roundel(b, mid, 0.56, 0.13);
  } else if (look.livery === 'fade') {
    const cell = 0.085;
    for (const b of ['R', 'L', 'T']) {
      const s0 = b === 'T' ? -0.9 : 0.2,
        s1 = b === 'T' ? 0.9 : 0.95;
      for (let x = X0, i = 0; x < X0 + L; x += cell, i++) {
        const a = Math.max(0, 1 - (x - X0) / (L * 0.72));
        if (a <= 0.02) continue;
        for (let s = s0, k = 0; s < s1; s += cell, k++) if ((i + k) % 2) rect(b, x, s, x + cell, s + cell, acc, a * a);
      }
    }
    for (const b of sides) {
      roundel(b, mid, 0.56, 0.13);
      sponsors(b);
    }
  }
  // ----- atlas : plaque d'immatriculation, bandeau de pare-brise
  {
    const [x0, y0, x1, y1] = ATLAS.plate;
    g.fillStyle = '#f4f1e6';
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = '#2a2a2e';
    g.lineWidth = 2;
    g.strokeRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
    g.fillStyle = '#1b3a26';
    g.font = '700 19px "Chakra Petch", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('974·' + String(look.number).padStart(2, '0'), (x0 + x1) / 2, (y0 + y1) / 2 + 1);
  }
  {
    const [x0, y0, x1, y1] = ATLAS.banner;
    g.fillStyle = '#0d0d10';
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = acc === paint && !dark ? '#ffd23f' : isDarkHex(look.accent) ? '#ffd23f' : acc;
    g.font = '400 22px "Dela Gothic One", "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SIDEWAYS  ·  横滑り倶楽部  ·  DRIFT', (x0 + x1) / 2, (y0 + y1) / 2 + 1);
  }
  {
    g.fillStyle = paint;
    g.fillRect(0, 498, 24, 14);
  }
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 8;
  return t;
}

export function carbonTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#131317';
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const gr =
        (x + y) % 2 ? g.createLinearGradient(x * 8, 0, x * 8 + 8, 0) : g.createLinearGradient(0, y * 8, 0, y * 8 + 8);
      gr.addColorStop(0, '#1c1c22');
      gr.addColorStop(0.5, '#3a3a44');
      gr.addColorStop(1, '#1c1c22');
      g.fillStyle = gr;
      g.fillRect(x * 8 + 0.5, y * 8 + 0.5, 7, 7);
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.encoding = THREE.sRGBEncoding;
  return t;
}
export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
