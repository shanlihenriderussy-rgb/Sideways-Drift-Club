import { Economy } from '../progress/economy.js';

export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const reduceDefault = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- persistance (facultative) ----------
export const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('sdc:' + k);
      return v == null ? d : JSON.parse(v);
    } catch (e) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('sdc:' + k, JSON.stringify(v));
    } catch (e) {
      /* stockage indisponible */
    }
  },
};
export const settings = Object.assign(
  { assist: 1, autoGas: false, sound: true, reduce: reduceDefault, vibe: true, quality: 'auto' },
  store.get('settings', {}),
);
// profil de jeu : portefeuille, voitures possédées et leurs pièces (voir economy.js). L'ancienne clé « garage » est migrée.
export const profile = Economy.loadProfile(store.get('profile', null), store.get('garage', null));
export const bests = store.get('bests', {});
export const saveSettings = () => store.set('settings', settings);
export const saveProfile = () => store.set('profile', profile);
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function init() {
  saveProfile();
}
