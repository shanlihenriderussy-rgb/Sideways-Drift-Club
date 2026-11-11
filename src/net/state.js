// État compact d'une voiture sur le réseau : un tableau de nombres, validé à la réception.
export const NET_HZ = 30; // envois par seconde en roulant
export const NET_HZ_IDLE = 4; // à l'arrêt

export const ST_KEYS = [
  'x',
  'z',
  'heading',
  'vx',
  'vz',
  'speed',
  'slip',
  'rearSlip',
  'steerAngle',
  'wheelRot',
  'rollAngle',
  'pitchAngle',
  'rpm',
  'throttle',
];
const r3 = (v) => Math.round(v * 1000) / 1000;
export function encodeState(t, st, combo, braking) {
  const d = [Math.round(t)];
  for (const k of ST_KEYS) d.push(r3(st[k] || 0));
  d.push(Math.round(combo || 0), braking ? 1 : 0);
  return d;
}
// tableau reçu → état, ou null s'il est invalide (nombres finis, position sur l'île)
export function decodeState(d) {
  if (!Array.isArray(d) || d.length !== ST_KEYS.length + 3) return null;
  for (const v of d) if (typeof v !== 'number' || !isFinite(v)) return null;
  const o = { t: d[0] };
  ST_KEYS.forEach((k, i) => {
    o[k] = d[i + 1];
  });
  if (Math.abs(o.x) > 6000 || Math.abs(o.z) > 6000 || Math.abs(o.speed) > 200) return null;
  o.combo = Math.max(0, Math.min(1e7, d[ST_KEYS.length + 1]));
  o.brake = d[ST_KEYS.length + 2] === 1;
  return o;
}
