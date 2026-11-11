import { game } from './state.js';
import { store } from './base.js';
import { cycleCam } from './camera.js';
import { closeIsleMap } from './island/map.js';
import { isle } from './island/world.js';
import { respawn } from './loop.js';
import { closeShop } from './menus.js';
import { ensureAudio } from './score.js';
import { pauseGame, resumeGame, screenId, show } from './session.js';
import { clearTouch, closeLayoutEditor } from './touch.js';

export const keys = new Set();
export const touch = { left: false, right: false, gas: false, brake: false, hb: false };
export const input = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };

export function init() {
  game.helpSeen = store.get('seenHelp', false);
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (
      ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k) &&
      game.phase !== 'menu' &&
      !document.activeElement.closest('.screen')
    )
      e.preventDefault();
    keys.add(k);
    if (k === 'escape' || k === 'p') {
      if (game.phase === 'play' || game.phase === 'count') pauseGame();
      else if (game.phase === 'pause' && screenId === 'pause') resumeGame();
      else if (k === 'escape' && screenId === 'layout') closeLayoutEditor();
      else if (k === 'escape' && screenId === 'garage') closeShop();
      else if (k === 'escape' && screenId === 'adventure' && isle) {
        show(null);
        resumeGame();
      } else if (k === 'escape' && screenId === 'isleMap') closeIsleMap();
      else if (k === 'escape' && ['select', 'settings', 'help', 'career', 'adventure', 'multi'].includes(screenId)) {
        game.helpThenSelect = false;
        show(screenId === 'settings' ? game.returnTo : 'menu');
      }
    }
    if (k === 'c' && (game.phase === 'play' || game.phase === 'count')) cycleCam();
    if (k === 'r' && game.phase === 'play') respawn();
    ensureAudio();
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => {
    keys.clear();
    clearTouch();
  });
}
