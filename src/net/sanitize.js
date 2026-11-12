// Tout ce qui vient d'un pair est filtré ici : pseudo, voiture, évènements de groupe.
import { Economy } from '../progress/economy.js';

export const NET_MAX = 4;
export const NET_MSG_MAX = 8192;
const NET_KINDS = ['hachi', 'kouki', 'raijin'];
export const EMOTES = { horn: 'Klaxon', gg: 'GG !', wave: 'Salut !', fire: 'En feu !', follow: 'Suis-moi !' };
export const NET_COLORS = ['#f7d154', '#7b8cff', '#4be38a', '#ff8fb3'];

export function cleanName(s) {
  const n = String(s == null ? '' : s)
    .replace(/[\u0000-\u001f\u007f<>&"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return n || 'Pilote';
}
export function sanitizePeer(raw, Eco) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = NET_KINDS.includes(raw.kind) ? raw.kind : 'hachi';
  let cfg = raw.cfg && typeof raw.cfg === 'object' ? raw.cfg : {};
  if (Array.isArray(cfg.owned)) cfg = Object.assign({}, cfg, { owned: cfg.owned.slice(0, 200) });
  const E = Eco || Economy;
  // pour l'affichage, une pièce déclarée possédée suffit : on garde la livrée de l'autre joueur telle quelle
  return { name: cleanName(raw.name), kind, cfg: E.sanitizeCar(kind, cfg) };
}

// évènements de groupe : départ de course ou de battle (hôte seulement), arrivée, score
const NODE_RE = /^[A-Z][A-Z0-9]{0,3}$/;
export function cleanEvent(ev, fromHost) {
  if (!ev || typeof ev !== 'object') return null;
  if (ev.k === 'race' && fromHost && NODE_RE.test(ev.node)) {
    const o = { k: 'race', node: ev.node },
      at = ev.at; // grille de départ autour de l'hôte
    if (
      at &&
      [at.x, at.z, at.h].every((v) => typeof v === 'number' && isFinite(v)) &&
      Math.abs(at.x) < 6000 &&
      Math.abs(at.z) < 6000
    )
      o.at = { x: at.x, z: at.z, h: at.h };
    return o;
  }
  if (ev.k === 'battle' && fromHost)
    return { k: 'battle', dur: Math.max(30, Math.min(180, Math.round(+ev.dur) || 90)) };
  if (ev.k === 'arrive' && isFinite(ev.time) && ev.time > 0 && ev.time < 3600)
    return { k: 'arrive', time: Math.round(ev.time * 10) / 10 };
  if (ev.k === 'score' && isFinite(ev.pts) && ev.pts >= 0)
    return { k: 'score', pts: Math.min(1e7, Math.round(ev.pts)) };
  if (ev.k === 'cancel' && fromHost) return { k: 'cancel' };
  return null;
}
