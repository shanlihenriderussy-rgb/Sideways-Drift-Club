import { game } from './state.js';
import { Sound } from '../audio/sound.js';
import { resetSettings, saveSettings, settings } from './base.js';
import { pressGroup } from './menus.js';
import { MIX, RANGE } from './preferences.js';
import { graphicsPending } from './scene.js';
import { applyWorldGraphics, renderer, resize, setQuality } from './stage.js';
import { refreshTouchUI } from './touch.js';
import { $ } from '../util/dom.js';

const ranges = {
  volume: 'Volume général',
  engine: 'Moteur',
  turbo: 'Turbo',
  tires: 'Pneus',
  effects: 'Chocs, klaxons et effets',
  signals: 'Départs, objectifs et récompenses',
  interface: 'Interface',
  renderScale: 'Résolution de rendu',
  exposure: 'Exposition',
  smokeAmount: 'Densité de la fumée',
  fov: 'Champ de vision',
  shake: 'Secousses de caméra',
  stickDeadzone: 'Zone morte du stick',
  stickSensitivity: 'Sensibilité du stick',
  vibration: 'Intensité des vibrations',
};

function slider(key) {
  const [min, max] = RANGE[key];
  return `<label class="rng" for="pref-${key}"><span>${ranges[key]}<output for="pref-${key}"></output></span><input id="pref-${key}" data-pref="${key}" type="range" min="${min}" max="${max}"></label>`;
}

function select(key, label, options) {
  return `<label class="option-select" for="pref-${key}">${label}<select id="pref-${key}" data-pref="${key}">${Object.entries(
    options,
  )
    .map(([value, title]) => `<option value="${value}">${title}</option>`)
    .join('')}</select></label>`;
}

const profile = 'Selon le profil';
const reloadKeys = ['quality', 'shadows', 'scenery', 'reflections', 'anisotropy', 'fpsTarget', 'renderScale'];

export function syncSettingsUI() {
  pressGroup($('assistSeg'), 'data-v', settings.assist === 1.35 ? 1.3 : settings.assist);
  pressGroup($('qualSeg'), 'data-v', settings.quality);
  for (const el of $('settings').querySelectorAll('[data-pref]')) {
    const key = el.dataset.pref;
    if (el.type === 'checkbox') el.checked = settings[key];
    else el.value = settings[key];
    if (el.type === 'range')
      el.labels[0].querySelector('output').textContent = settings[key] + (key === 'fov' ? '°' : ' %');
    if (key in MIX) el.disabled = !settings.sound;
    if (key === 'shake') el.disabled = settings.reduce;
    if (key === 'vibration') el.disabled = !settings.vibe;
    if (key === 'fpsTarget') el.disabled = settings.quality !== 'auto';
  }
  $('soundTest').disabled = !settings.sound;
  $('minimap').hidden = !settings.minimap;
  const { width, height } = renderer.domElement;
  $('graphicsResolution').textContent = `Rendu actuel · ${width} × ${height} px`;
  $('graphicsPending').hidden = !graphicsPending();
  refreshTouchUI();
}

function apply(key, persist = true) {
  if (key === 'sound' || key in MIX || key === 'reset') {
    Sound.setMix(settings);
    if (key === 'sound' || key === 'reset') Sound.setEnabled(settings.sound);
    if (key === 'sound' && settings.sound) Sound.init();
  }
  if (key === 'reset' || reloadKeys.includes(key)) {
    // Les réglages à chaud ne reconstruisent pas le monde en pause.
    const tierChanged = key === 'quality' || key === 'reset' || key === 'fpsTarget';
    if (tierChanged) {
      game.dprScale = 1;
      game.fastT = 0;
    }
    setQuality(tierChanged ? undefined : game.qLevel);
    resize();
  }
  if (key === 'exposure') applyWorldGraphics();
  if (persist) saveSettings();
  syncSettingsUI();
}

export function init() {
  $('audioMix').innerHTML = Object.keys(MIX).map(slider).join('');
  $('graphicsControls').innerHTML =
    ['renderScale', 'exposure', 'smokeAmount'].map(slider).join('') +
    select('shadows', 'Ombres', {
      auto: profile,
      0: 'Désactivées',
      512: '512 px',
      1024: '1 024 px',
      2048: '2 048 px',
      4096: '4 096 px',
    }) +
    select('scenery', 'Détail du décor', { auto: profile, low: 'Bas', med: 'Moyen', high: 'Élevé', ultra: 'Ultra' }) +
    select('reflections', 'Résolution des reflets', {
      auto: profile,
      48: '48 px',
      96: '96 px',
      192: '192 px',
      256: '256 px',
    }) +
    select('anisotropy', 'Netteté de la piste au loin', {
      auto: profile,
      1: '1×',
      2: '2×',
      4: '4×',
      8: '8×',
      16: '16×',
    }) +
    select('fpsTarget', 'Cible du profil Auto', { 30: '30 i/s', 45: '45 i/s', 60: '60 i/s' });
  $('displayControls').innerHTML =
    slider('fov') + slider('shake') + select('speedUnit', 'Unité du compteur', { kmh: 'km/h', mph: 'mph' });

  $('drivingControls').innerHTML = ['stickDeadzone', 'stickSensitivity', 'vibration'].map(slider).join('');

  const root = $('settings');
  const bind = (e) => {
    const el = e.target;
    const key = el.dataset.pref;
    if (!key) return;
    if (el.type === 'range' && e.type === 'change') {
      saveSettings();
      return;
    }
    if (el.type !== 'range' && e.type !== 'change') return;
    settings[key] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? el.valueAsNumber : el.value;
    apply(key, el.type !== 'range');
  };
  root.addEventListener('input', bind);
  root.addEventListener('change', bind);
  root.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-option-tab]');
    if (!tab) return;
    const key = tab.dataset.optionTab;
    pressGroup(tab.parentElement, 'data-option-tab', key);
    for (const panel of root.querySelectorAll('[data-option-panel]')) panel.hidden = panel.dataset.optionPanel !== key;
    syncSettingsUI();
    Sound.ui();
  });
  for (const [id, key] of [
    ['qualSeg', 'quality'],
    ['assistSeg', 'assist'],
  ]) {
    $(id).addEventListener('click', (e) => {
      const button = e.target.closest('[data-v]');
      if (!button) return;
      settings[key] = key === 'assist' ? Number(button.dataset.v) : button.dataset.v;
      apply(key);
      Sound.ui();
    });
  }
  $('resetSettings').addEventListener('click', () => {
    resetSettings();
    apply('reset');
    Sound.ui();
  });
  $('soundTest').addEventListener('click', Sound.preview);
}
