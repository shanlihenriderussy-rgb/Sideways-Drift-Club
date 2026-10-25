// ===== Moments forts et enregistrements : les meilleurs instants d'un run, rejouables =====
// Logique pure (aucun DOM, aucun Three.js) testée sous Node (tests/replay.test.js).
// Pendant le run, le jeu note des évènements { k, t, t0?, v, label } : combo encaissé, clip, frôlé, angle record.
// En fin de run : les 3 meilleurs moments sans chevauchement, chacun avec sa fenêtre de trajectoire (échantillons du
// fantôme, 0,1 s). Les enregistrements des pistes sont gardés sur l'appareil (localStorage, sdc:recs), 8 au plus.

const RP_N = 5, RP_DT = 0.1, RP_MAX_RECS = 8, RP_MAX_WIN = 9;
const RP_KINDS = ['hachi', 'kouki', 'raijin'];

// valeur comparable entre types de moments, fenêtre de replay [a, b] et ralenti
function momentOf(e, dur) {
  let a, b, w, slow = false;
  if (e.k === 'combo') { b = e.t + 1.5; a = Math.max(b - RP_MAX_WIN, (e.t0 != null ? e.t0 : e.t - 4) - 1); w = e.v; }
  else if (e.k === 'clip') { a = e.t - 3; b = e.t + 2; w = e.v * 6; slow = true; }
  else if (e.k === 'near') { a = e.t - 2.5; b = e.t + 1.5; w = e.v * 4; slow = true; }
  else if (e.k === 'angle') { a = e.t - 2.5; b = e.t + 2; w = e.v * 50; }
  else return null;
  a = Math.max(0, a); b = Math.min(dur, b);
  if (!(b - a >= 1)) return null;
  return { k: e.k, t: e.t, a: Math.round(a * 10) / 10, b: Math.round(b * 10) / 10, w, v: Math.round(e.v), label: String(e.label || '').slice(0, 60), slow };
}
// les n meilleurs moments sans chevauchement, dans l'ordre du run
function pickMoments(events, dur, n) {
  const all = (events || []).map((e) => momentOf(e, dur)).filter(Boolean).sort((x, y) => y.w - x.w);
  const out = [];
  for (const m of all) {
    if (out.length >= (n || 3)) break;
    if (out.some((o) => m.a < o.b && o.a < m.b)) continue;
    out.push(m);
  }
  return out.sort((x, y) => x.a - y.a);
}
// découpe la trajectoire (échantillons du fantôme) pour chaque moment
function cutMoments(d, moments) {
  const n = Math.floor(d.length / RP_N);
  return moments.map((m) => {
    const i0 = Math.max(0, Math.floor(m.a / RP_DT)), i1 = Math.min(n - 1, Math.ceil(m.b / RP_DT));
    return Object.assign({}, m, { d: d.slice(i0 * RP_N, (i1 + 1) * RP_N) });
  }).filter((m) => m.d.length >= RP_N * 8);
}
// enregistrement complet d'un run, prêt à stocker
function makeRecording(info, d, moments) {
  return { v: 1, id: info.id, date: info.date, track: info.track, mode: info.mode, kind: info.kind, score: Math.round(info.score || 0), grade: info.grade || null, moments: cutMoments(d, moments) };
}
// relu du stockage : vérifié champ par champ, null si abîmé
function checkRecording(r) {
  if (!r || typeof r !== 'object' || r.v !== 1 || !RP_KINDS.includes(r.kind) || typeof r.track !== 'string' || !/^[a-z]{2,16}$/.test(r.track)) return null;
  if (!Array.isArray(r.moments) || !r.moments.length || r.moments.length > 5) return null;
  for (const m of r.moments) {
    if (!m || !['combo', 'clip', 'near', 'angle'].includes(m.k) || !Array.isArray(m.d) || m.d.length % RP_N || m.d.length > RP_N * 120 || m.d.length < RP_N * 8) return null;
    for (const v of m.d) if (typeof v !== 'number' || !isFinite(v)) return null;
    if (typeof m.label !== 'string' || m.label.length > 60) return null;
  }
  if (!Number.isFinite(r.score) || !Number.isFinite(r.date)) return null;
  return r;
}
// nouvel enregistrement en tête de liste, 8 au plus (les plus anciens partent)
function addRecording(list, r) {
  const out = (Array.isArray(list) ? list : []).map(checkRecording).filter(Boolean).filter((x) => x.id !== r.id);
  out.unshift(r);
  return out.slice(0, RP_MAX_RECS);
}
// lecture : état interpolé d'un moment à l'instant u (s depuis son début) ; vitesse déduite de la trajectoire
function playAt(m, u, out) {
  const o = out || {}, d = m.d, n = d.length / RP_N, f = Math.max(0, Math.min(n - 1.001, u / RP_DT)), i = Math.floor(f), k = f - i;
  const a = i * RP_N, b = a + RP_N;
  let dh = d[b + 2] - d[a + 2]; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
  o.x = d[a] + (d[b] - d[a]) * k; o.z = d[a + 1] + (d[b + 1] - d[a + 1]) * k;
  o.heading = d[a + 2] + dh * k; o.rearSlip = d[a + 3] + (d[b + 3] - d[a + 3]) * k;
  o.vx = (d[b] - d[a]) / RP_DT; o.vz = (d[b + 1] - d[a + 1]) / RP_DT; o.speed = Math.hypot(o.vx, o.vz); o.yaw = dh / RP_DT;
  o.pts = d[a + 4] + (d[b + 4] - d[a + 4]) * k; o.end = u >= (n - 1) * RP_DT;
  return o;
}
const momentDur = (m) => (m.d.length / RP_N - 1) * RP_DT;

const Replay = { pickMoments, cutMoments, makeRecording, checkRecording, addRecording, playAt, momentDur, MAX: RP_MAX_RECS };
if (typeof module !== 'undefined') module.exports = Replay;
