// ---------- rendu ----------
import { game } from './state.js';
import { isTouch, settings, store } from './base.js';
import { isle } from './island/world.js';
import { TRACKS } from '../sim/track.js';
import { $ } from '../util/dom.js';
import { clamp } from '../util/math.js';

export const canvas = $('gl');
export const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: (window.devicePixelRatio || 1) < 2,
  powerPreference: 'high-performance',
});
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 2400);
export const QUALITY = {
  low: { pr: 1, shadows: false, smoke: 500, scenery: 0.45 },
  med: { pr: 1.35, shadows: false, smoke: 900, scenery: 0.75 },
  high: { pr: 1.75, shadows: true, smoke: 1400, scenery: 1 },
};

export function resize() {
  const w = window.innerWidth,
    h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, game.quality.pr) * game.dprScale);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (game.smoke) game.smoke.mat.uniforms.scale.value = h * renderer.getPixelRatio() * 0.5;
  if (game.sparks) game.sparks.mat.uniforms.scale.value = h * renderer.getPixelRatio() * 0.5;
}
let timeScale = 1;
export const camPos = new THREE.Vector3();
export const camLook = new THREE.Vector3();
export const _camT = new THREE.Vector3();
export const _camL = new THREE.Vector3(); // tampons : aucune allocation par image
// relief : hauteur du sol (terrain de la piste) et pente, sans allocation
export const curTer = () => (isle ? isle.I.terrain : game.track.terrain);
export const gy = (x, z) => curTer().at(x, z);
export const _grad = [0, 0];
export const showroom = { x: 0, z: 0, heading: 0, wheelRot: 0, steerAngle: 0, rollAngle: 0, pitchAngle: 0 };

export function init() {
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  game.qLevel = settings.quality === 'auto' ? (isTouch ? 'med' : 'high') : settings.quality;
  game.quality = QUALITY[game.qLevel];

  // ---------- état global ----------
  game.trackIdx = clamp(store.get('track', 0), 0, TRACKS.length - 1);
  game.mode = store.get('mode', 'run');
  game.camMode = store.get('cam', 0);
}
