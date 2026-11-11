// ---------- caméra ----------
import { game } from './state.js';
import { settings, store } from './base.js';
import { smokeCol } from './scene.js';
import { carPoint, popup } from './score.js';
import { _camL, _camT, camLook, camPos, camera, gy } from './stage.js';
import { clamp } from '../util/math.js';

const CAMS = [
  { dist: 4.7, h: 1.7, look: 1.1, name: 'Chasse' },
  { dist: 8.6, h: 3.4, look: 0.8, name: 'Large' },
  { dist: 3.9, h: 1.35, look: 1.1, name: 'Basse' },
];
export function cycleCam() {
  game.camMode = (game.camMode + 1) % CAMS.length;
  store.set('cam', game.camMode);
  popup('Caméra ' + CAMS[game.camMode].name, 'apex');
}
export function updateCamera(dt, st, attract) {
  const portrait = camera.aspect < 1;
  if (attract === 'garage') {
    // vue par rayon de l'atelier (angle relatif au cap de la voiture), + rotation au doigt
    const t = performance.now() / 1000;
    const V = game.shopView;
    const a = (V.a == null ? t * 0.25 : V.a + (settings.reduce ? 0 : Math.sin(t * 0.4) * 0.07)) + game.garageYaw;
    const r = V.r * (portrait ? 1.3 : 1);
    const hx = Math.cos(st.heading),
      hz = Math.sin(st.heading);
    const cx = st.x + hx * (V.fwd || 0),
      cz = st.z + hz * (V.fwd || 0);
    const g0 = gy(cx, cz);
    _camT.set(cx + Math.cos(st.heading + a) * r, 0, cz + Math.sin(st.heading + a) * r);
    _camT.y = Math.max(g0, gy(_camT.x, _camT.z)) + V.h * (portrait ? 1.15 : 1);
    if (game.snapCam) {
      camPos.copy(_camT);
      camLook.set(cx, g0 + 0.5, cz);
      game.snapCam = false;
    }
    camPos.lerp(_camT, 1 - Math.exp(-dt * 3.2));
    // la voiture se cadre à gauche (le panneau occupe la droite) ou en haut en portrait
    let rx = camPos.x - cx,
      rz = camPos.z - cz;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl;
    rz /= rl;
    const off = portrait || V.noOff ? 0 : (2.3 * V.r) / 7;
    _camL.set(cx + rz * off, g0 + (portrait ? 0.45 - 0.3 * r : V.look || 0.6), cz - rx * off); // portrait : voiture dans le tiers haut, au-dessus du panneau
    camLook.lerp(_camL, 1 - Math.exp(-dt * 6));
    camera.fov += ((portrait ? 64 : 46) - camera.fov) * 0.1;
  } else if (attract) {
    const t = performance.now() / 1000;
    const a = t * 0.18;
    const r = portrait ? 11 : 8.5;
    const tx = st.x + Math.cos(a) * r,
      tz = st.z + Math.sin(a) * r;
    const g0 = gy(st.x, st.z);
    camPos.lerp(_camT.set(tx, Math.max(g0, gy(tx, tz)) + 2.2, tz), 1 - Math.exp(-dt * 2));
    camLook.lerp(_camL.set(st.x, g0 + 0.8, st.z), 1 - Math.exp(-dt * 6));
    camera.fov += ((portrait ? 70 : 50) - camera.fov) * 0.1;
  } else {
    const C = CAMS[game.camMode];
    const hx = Math.cos(st.heading),
      hz = Math.sin(st.heading);
    const sp = Math.hypot(st.vx, st.vz);
    let dx = hx,
      dz = hz;
    if (sp > 4) {
      const w = 0.6;
      dx = hx * (1 - w) + (st.vx / sp) * w;
      dz = hz * (1 - w) + (st.vz / sp) * w;
      const l = Math.hypot(dx, dz);
      dx /= l;
      dz /= l;
    }
    const dist = (C.dist + Math.min(sp, 30) * 0.03) * (portrait ? 1.25 : 1);
    // relief : la caméra suit la hauteur de la voiture et ne passe jamais sous le sol derrière elle
    const g0 = gy(st.x, st.z),
      cxp = st.x - dx * dist,
      czp = st.z - dz * dist;
    camPos.lerp(
      _camT.set(cxp, Math.max(g0, gy(cxp, czp) + 0.6) + C.h * (portrait ? 1.25 : 1), czp),
      1 - Math.exp(-dt * (game.camMode === 2 ? 9 : 5.5)),
    );
    camLook.lerp(
      _camL.set(st.x + hx * 2.2, gy(st.x + hx * 2.2, st.z + hz * 2.2) + C.look + (portrait ? 0.3 : 0), st.z + hz * 2.2),
      1 - Math.exp(-dt * 10),
    );
    const fov = (portrait ? 70 : 54) + (settings.reduce ? 0 : Math.min(sp, 40) * 0.26);
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
  }
  camera.position.copy(camPos);
  if (game.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * game.shake * 0.5;
    camera.position.y += (Math.random() - 0.5) * game.shake * 0.3;
    game.shake = Math.max(0, game.shake - dt * 2.5);
  }
  camera.lookAt(camLook);
  camera.updateProjectionMatrix();
}

// ---------- effets par voiture ----------
export function carFx(st, model, dt, id, colId) {
  const col = smokeCol[colId || id];
  const slip = st.rearSlip;
  const k = clamp((slip - 0.12) * 2.2, 0, 1) * clamp(st.speed / 8, 0, 1);
  const spin = clamp((st.wheelSpin || 0) - 0.6, 0, 1) * clamp(st.throttle, 0, 1);
  const intensity = Math.max(k, spin * 0.8);
  for (const sz of [-1, 1]) {
    const [x, z] = carPoint(st, model.rearX, sz * (model.halfW - 0.08));
    const y = gy(x, z);
    game.skids.mark(id + sz, x, z, intensity, 0.28 + Math.min(Math.abs(st.slip), 0.8) * 0.25, y);
    const n = intensity * dt * (game.quality.smoke > 900 ? 46 : 26);
    let emit = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    while (emit-- > 0) {
      const j = () => Math.random() - 0.5;
      game.smoke.emit(
        x + j() * 0.4,
        y + 0.35,
        z + j() * 0.4,
        st.vx * 0.25 + j() * 2.4,
        0.4 + Math.random() * 0.9,
        st.vz * 0.25 + j() * 2.4,
        1.6 + Math.random() * 1.4,
        1.0,
        4.6 + intensity * 2.6,
        0.26 * (0.45 + intensity * 0.6),
        col,
      );
    }
  }
}
