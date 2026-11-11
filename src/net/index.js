// ===== Multijoueur : sessions pair à pair sur l'île (WebRTC, sans serveur de jeu) =====
// Un hôte, jusqu'à 3 invités. L'hôte relaie tout (étoile). Chaque appareil simule sa voiture et envoie son
// état 30 fois par seconde en roulant (4 à l'arrêt) ; les voitures des autres sont reconstruites par
// interp.js. Trafic et rivaux restent propres à chaque appareil.
// Invitation sans serveur : l'hôte donne un code (offre), l'invité renvoie un code (réponse).
// Données échangées : pseudo, voiture et livrée, position. Mode « même Wi-Fi » par défaut : aucun serveur
// tiers ; mode « Internet » : serveur STUN public (il voit l'adresse IP de chaque joueur). Les joueurs
// voient l'IP les uns des autres.
// Tout sauf links.js est pur et testé sous Node : tests/net.test.js, tests/interp.test.js.
import { createInterp, INTERP } from './interp.js';
import { packCode, unpackCode } from './invite.js';
import { localLinks, rtcAnswer, rtcOffer } from './links.js';
import { EMOTES, NET_COLORS, NET_MAX, cleanEvent, cleanName, sanitizePeer } from './sanitize.js';
import { createSession } from './session.js';
import { NET_HZ, NET_HZ_IDLE, ST_KEYS, decodeState, encodeState } from './state.js';

export const Net = {
  MAX: NET_MAX,
  HZ: NET_HZ,
  HZ_IDLE: NET_HZ_IDLE,
  INTERP,
  EMOTES,
  COLORS: NET_COLORS,
  ST_KEYS,
  encodeState,
  decodeState,
  cleanName,
  sanitizePeer,
  createInterp,
  createSession,
  cleanEvent,
  packCode,
  unpackCode,
  rtcOffer,
  rtcAnswer,
  localLinks,
};
