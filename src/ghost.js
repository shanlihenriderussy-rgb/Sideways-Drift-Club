// ===== Fantôme du record : trajectoire du meilleur run, rejouée en transparence, et écart de points en direct =====
// Logique pure (aucun DOM, aucun Three.js) testée sous Node (tests/ghost.test.js). Un échantillon toutes les 0,1 s de run :
// x, z, cap, dérive arrière, points (total + combo en cours). Stockage compact et vérifié (localStorage, clé sdc:ghosts).

const GHOST_DT = 0.1, GHOST_N = 5, GHOST_MAX = 6000; // 10 min de run au plus
const GHOST_KINDS = ['hachi', 'kouki', 'raijin'];

function ghostRecorder(kind) {
  return { kind, d: [], next: 0 };
}
// à appeler à chaque image du run : n'ajoute un échantillon que toutes les 0,1 s
function ghostPush(R, t, st, pts) {
  while (t >= R.next && R.d.length < GHOST_MAX * GHOST_N) {
    R.d.push(Math.round(st.x * 100) / 100, Math.round(st.z * 100) / 100, Math.round(st.heading * 1000) / 1000, Math.round((st.rearSlip || 0) * 100) / 100, Math.round(pts));
    R.next += GHOST_DT;
  }
}
const ghostPack = (R) => ({ v: 1, kind: R.kind, d: R.d.slice() });
// données relues du stockage → fantôme, ou null si elles sont abîmées
function ghostUnpack(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== 1 || !GHOST_KINDS.includes(raw.kind) || !Array.isArray(raw.d)) return null;
  const d = raw.d;
  if (d.length < GHOST_N * 10 || d.length % GHOST_N || d.length > GHOST_MAX * GHOST_N) return null;
  for (const v of d) if (typeof v !== 'number' || !isFinite(v)) return null;
  return { kind: raw.kind, d, n: d.length / GHOST_N, dur: (d.length / GHOST_N - 1) * GHOST_DT };
}
// état du fantôme à l'instant t du run (interpolé) ; done = run du fantôme terminé
function ghostAt(G, t, out) {
  const o = out || {}, f = Math.max(0, t / GHOST_DT), i = Math.min(G.n - 2, Math.floor(f)), k = Math.min(1, f - i);
  const a = i * GHOST_N, b = a + GHOST_N, d = G.d;
  let dh = d[b + 2] - d[a + 2]; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
  o.x = d[a] + (d[b] - d[a]) * k; o.z = d[a + 1] + (d[b + 1] - d[a + 1]) * k;
  o.heading = d[a + 2] + dh * k; o.rearSlip = d[a + 3] + (d[b + 3] - d[a + 3]) * k;
  o.pts = d[a + 4] + (d[b + 4] - d[a + 4]) * k; o.done = t >= G.dur;
  return o;
}

const Ghost = { DT: GHOST_DT, recorder: ghostRecorder, push: ghostPush, pack: ghostPack, unpack: ghostUnpack, at: ghostAt };
if (typeof module !== 'undefined') module.exports = Ghost;
