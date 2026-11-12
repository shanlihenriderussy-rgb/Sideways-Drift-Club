// Affichage fluide des voitures distantes à partir d'instantanés horodatés par l'émetteur.
//
// Trois mécanismes, dans l'ordre où ils comptent :
//  1. Courbe de Hermite sur la position : chaque instantané porte sa vitesse, la trajectoire affichée
//     passe par les points reçus avec la bonne tangente (une interpolation linéaire casse la vitesse à
//     chaque paquet, ce qui se voit en glisse).
//  2. Tampon de gigue adaptatif : le retard d'affichage suit la gigue mesurée (2 intervalles d'envoi +
//     2 × gigue) au lieu d'un retard fixe. Réseau propre : ~70 ms. Réseau agité : jusqu'à 400 ms.
//     L'horloge de lecture rattrape sa cible en accélérant ou ralentissant de 15 % au plus, jamais par saut.
//  3. Paquets en retard : extrapolation courte le long de l'arc (vitesse + taux de lacet), puis l'écart
//     à l'arrivée du paquet suivant est résorbé en ~120 ms au lieu d'être affiché d'un coup.
import { ST_KEYS } from './state.js';

const LERP_KEYS = ST_KEYS.filter((k) => k !== 'x' && k !== 'z' && k !== 'heading');
const wrap = (a) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const INTERP = {
  DELAY_MIN: 70, // ms
  DELAY_MAX: 400,
  EXTRAPOLATE_MAX: 0.35, // s
  BLEND_MS: 120, // résorption d'un écart
  SNAP_M: 8, // au-delà, on téléporte (replacement, départ de course)
  HERMITE_MAX_GAP: 0.3, // s : au-delà (reprise après l'arrêt), interpolation linéaire
};

export function createInterp() {
  const buf = []; // instantanés, t croissant (horloge de l'émetteur, ms)
  const lat = []; // derniers écarts réception − émission (ms)
  let off = null; // décalage d'horloge : plus petit écart de la fenêtre
  let jitter = 0; // gigue lissée (ms)
  let gap = 1000 / 30; // intervalle d'envoi lissé (ms)
  let delay = INTERP.DELAY_MIN;
  let playT = null; // horloge de lecture (temps de l'émetteur)
  let lastNow = 0;
  let cx = 0,
    cz = 0,
    ch = 0; // écart en cours de résorption
  const out = {},
    tmpA = {},
    tmpB = {};

  // pose brute à l'instant t (horloge de l'émetteur), sans correction
  function pose(t, o) {
    const first = buf[0],
      last = buf[buf.length - 1];
    if (t <= first.t) return Object.assign(o, first);
    if (t >= last.t) {
      Object.assign(o, last);
      const ex = Math.min(INTERP.EXTRAPOLATE_MAX, (t - last.t) / 1000);
      if (ex > 0) {
        // arc de cercle : la vitesse tourne au taux de lacet observé sur le dernier intervalle
        let w = 0;
        if (buf.length > 1) {
          const p = buf[buf.length - 2],
            dt = (last.t - p.t) / 1000;
          if (dt > 0.005 && dt < INTERP.HERMITE_MAX_GAP) w = clamp(wrap(last.heading - p.heading) / dt, -3, 3);
        }
        const a = (w * ex) / 2,
          c = Math.cos(a),
          s = Math.sin(a);
        o.x = last.x + (last.vx * c - last.vz * s) * ex;
        o.z = last.z + (last.vx * s + last.vz * c) * ex;
        o.heading = last.heading + w * ex;
      }
      return o;
    }
    let i = buf.length - 1;
    while (buf[i - 1].t > t) i--;
    const a = buf[i - 1],
      b = buf[i];
    const T = (b.t - a.t) / 1000,
      k = (t - a.t) / (b.t - a.t);
    for (const key of LERP_KEYS) o[key] = a[key] + (b[key] - a[key]) * k;
    o.heading = a.heading + wrap(b.heading - a.heading) * k;
    if (T <= INTERP.HERMITE_MAX_GAP) {
      const k2 = k * k,
        k3 = k2 * k;
      const h00 = 2 * k3 - 3 * k2 + 1,
        h10 = k3 - 2 * k2 + k,
        h01 = -2 * k3 + 3 * k2,
        h11 = k3 - k2;
      o.x = h00 * a.x + h10 * T * a.vx + h01 * b.x + h11 * T * b.vx;
      o.z = h00 * a.z + h10 * T * a.vz + h01 * b.z + h11 * T * b.vz;
    } else {
      o.x = a.x + (b.x - a.x) * k;
      o.z = a.z + (b.z - a.z) * k;
    }
    o.combo = a.combo;
    o.brake = a.brake;
    return o;
  }

  return {
    push(s, recvMs) {
      const last = buf[buf.length - 1];
      if (last && s.t <= last.t) return; // canal non ordonné : un paquet plus vieux que le dernier ne sert plus
      // horloge : le plus petit écart récent est le trajet sans attente ; le reste est de la gigue
      lat.push(recvMs - s.t);
      if (lat.length > 64) lat.shift();
      off = Math.min(...lat);
      const dev = recvMs - s.t - off;
      jitter += (dev - jitter) * (dev > jitter ? 0.25 : 0.02); // monte vite, redescend lentement
      if (last) gap += (clamp(s.t - last.t, 15, 100) - gap) * 0.1;
      delay = clamp(2 * gap + 2 * jitter, INTERP.DELAY_MIN, INTERP.DELAY_MAX);

      // paquet attendu pendant une extrapolation : garder la pose affichée, résorber l'écart ensuite
      const late = playT != null && last && playT > last.t;
      if (late) pose(playT, tmpA);
      buf.push(s);
      if (buf.length > 40) buf.shift();
      if (late) {
        pose(playT, tmpB);
        const dx = tmpA.x + cx - tmpB.x,
          dz = tmpA.z + cz - tmpB.z;
        if (dx * dx + dz * dz > INTERP.SNAP_M * INTERP.SNAP_M) cx = cz = ch = 0;
        else {
          cx = dx;
          cz = dz;
          ch = wrap(tmpA.heading + ch - tmpB.heading);
        }
      }
    },
    // état affiché à l'instant local nowMs ; null tant qu'on n'a rien reçu
    sample(nowMs) {
      if (!buf.length) return null;
      const target = nowMs - off - delay;
      const dt = playT == null ? 0 : clamp(nowMs - lastNow, 0, 100);
      if (playT == null || Math.abs(target - playT - dt) > 600) {
        playT = target;
        cx = cz = ch = 0;
      } else {
        playT += dt * (1 + clamp((target - playT - dt) / 250, -0.15, 0.15));
        const k = Math.exp(-dt / INTERP.BLEND_MS);
        cx *= k;
        cz *= k;
        ch *= k;
      }
      lastNow = nowMs;
      pose(playT, out);
      out.x += cx;
      out.z += cz;
      out.heading += ch;
      out.age = (nowMs - off - buf[buf.length - 1].t) / 1000;
      return out;
    },
    get size() {
      return buf.length;
    },
    get delay() {
      return delay;
    },
    get jitter() {
      return jitter;
    },
  };
}
