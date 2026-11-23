// ---------- rendu ----------
import { game } from './state.js';
import { isTouch, settings, store } from './base.js';
import { graphicsProfile } from './preferences.js';
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
export const preferredQuality = () => (settings.quality === 'auto' ? (isTouch ? 'med' : 'high') : settings.quality);

export function setQuality(level = preferredQuality()) {
  game.qLevel = level;
  game.quality = graphicsProfile(level, settings);
  applyWorldGraphics();
}

export function applyWorldGraphics() {
  if (!game.world) return;
  renderer.toneMappingExposure = (game.world.theme.exposure * settings.exposure) / 100;
  const sun = game.world.sun;
  const size = Math.min(renderer.capabilities.maxTextureSize, game.quality.shadows);
  sun.castShadow = size > 0;
  if (!size || sun.shadow.mapSize.x !== size) {
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    if (size) sun.shadow.mapSize.set(size, size);
  }
}

export function configureSun(sun) {
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -14;
  sc.right = sc.top = 14;
  sc.near = 1;
  sc.far = 160;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
}

export function resize() {
  const w = window.innerWidth,
    h = window.innerHeight;
  const { pr, boost } = game.quality;
  const requested = (Math.min(window.devicePixelRatio || 1, pr) * boost * game.dprScale * settings.renderScale) / 100;
  renderer.setPixelRatio(
    Math.min(
      requested,
      Math.sqrt(8_300_000 / Math.max(1, w * h)),
      renderer.capabilities.maxTextureSize / Math.max(1, w, h),
    ),
  );
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (game.smoke) game.smoke.mat.uniforms.scale.value = h * renderer.getPixelRatio() * 0.5;
  if (game.sparks) game.sparks.mat.uniforms.scale.value = h * renderer.getPixelRatio() * 0.5;
}
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
  setQuality();

  // ---------- état global ----------
  game.trackIdx = clamp(store.get('track', 0), 0, TRACKS.length - 1);
  game.mode = store.get('mode', 'run');
  game.camMode = store.get('cam', 0);
}
