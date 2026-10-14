// ===== Physique : modèle bicyclette à pneus saturés, réglé pour la glisse =====
// Repère 2D (x, z) au sol. Cap θ : avant = (cos θ, sin θ), droite = (-sin θ, cos θ).
// θ croissant = virage à droite vu de dessus.
const G = 9.81;

const CAR_SPECS = {
  hachi: { name: 'HACHI', tag: 'Coupé léger 4A', mass: 980, a: 1.12, b: 1.18, power: 118000, fmax: 7600, mu: 1.05, lock: 0.95, top: 52, h: 0.48, stats: { power: 2, grip: 4, angle: 4 } },
  kouki: { name: 'KOUKI', tag: 'Coupé turbo S', mass: 1220, a: 1.22, b: 1.30, power: 180000, fmax: 9800, mu: 1.04, lock: 1.0, top: 62, h: 0.5, stats: { power: 3, grip: 3, angle: 5 } },
  raijin: { name: 'RAIJIN', tag: 'GT biturbo 2JZ', mass: 1480, a: 1.30, b: 1.36, power: 255000, fmax: 12200, mu: 1.02, lock: 0.9, top: 72, h: 0.52, stats: { power: 5, grip: 3, angle: 3 } },
};

function tireCurve(k) {
  // k = |α| / α_pic. Monte vite, pic à ~1, retombe doucement vers 0.78.
  const t = Math.tanh(k * 1.25);
  const s = Math.min(Math.max((k - 1.6) / 4.5, 0), 1);
  return t * (1 - 0.22 * s * s * (3 - 2 * s));
}

function createCarState(spec, x, z, heading) {
  return {
    spec, x, z, heading,
    vx: 0, vz: 0, omega: 0,
    steerAngle: 0, // braquage effectif des roues (rad)
    steer: 0, // entrée lissée -1..1
    throttle: 0, brake: 0, handbrake: 0,
    surface: 1, // 1 = bitume, <1 = herbe / gravier
    // sorties utiles au rendu / son / score
    speed: 0, fwd: 0, lat: 0, slip: 0, rearSlip: 0, frontSlip: 0,
    wheelSpin: 0, rpm: 900, gear: 1, shiftTimer: 0, reversing: false,
    wheelRot: 0, rollAngle: 0, pitchAngle: 0, ax: 0, ay: 0,
  };
}

const GEARS = [0, 3.4, 2.3, 1.7, 1.32, 1.06, 0.86];
const FINAL = 4.1, WHEEL_R = 0.31, RPM_MAX = 7800, RPM_IDLE = 900;

// assist : 0 = aucune, 1 = normale, 1.35 = forte
function stepCar(c, input, dt, assist) {
  const s = c.spec;
  const L = s.a + s.b;
  const cos = Math.cos(c.heading), sin = Math.sin(c.heading);
  let vx = c.vx * cos + c.vz * sin; // vitesse longitudinale
  let vy = -c.vx * sin + c.vz * cos; // vitesse latérale (vers la droite)
  const speed = Math.hypot(vx, vy);

  // --- entrées lissées
  const tSteer = input.steer;
  const rate = Math.abs(tSteer) > Math.abs(c.steer) && Math.sign(tSteer) === Math.sign(c.steer || tSteer) ? 4.2 : 7.5;
  c.steer += Math.max(-rate * dt, Math.min(rate * dt, tSteer - c.steer));
  c.throttle += (input.throttle - c.throttle) * Math.min(1, dt * 10);
  c.brake += (input.brake - c.brake) * Math.min(1, dt * 12);
  c.handbrake = input.handbrake;

  // --- marche arrière : frein maintenu à l'arrêt
  if (input.brake > 0.5 && vx < 0.6 && input.throttle < 0.1) c.reversing = true;
  if (input.throttle > 0.1 || (c.reversing && input.brake < 0.1 && vx > -0.5)) c.reversing = false;

  // --- braquage : contre-braquage assisté + entrée
  const vxa = Math.max(Math.abs(vx), 1.5);
  const beta = Math.atan2(vy, vxa);
  const slide = Math.min(Math.max((Math.abs(beta) - 0.06) / 0.18, 0), 1);
  const speedK = Math.min(speed / 28, 1);
  const gripSteer = s.lock * (0.62 - 0.38 * speedK);
  const driftSteer = 0.42;
  const frontVel = Math.atan2(vy + c.omega * s.a, vxa);
  let target = c.steer * (gripSteer * (1 - slide) + driftSteer * slide);
  if (vx > 0.5) target += assist * slide * frontVel * 0.92;
  if (c.reversing) target = c.steer * s.lock * 0.6;
  target = Math.max(-s.lock, Math.min(s.lock, target));
  c.steerAngle += (target - c.steerAngle) * Math.min(1, dt * 14);
  const delta = c.steerAngle;

  // --- charges avec transfert de masse longitudinal
  const mg = s.mass * G;
  let Nf = mg * s.b / L - s.mass * c.ax * s.h / L;
  let Nr = mg * s.a / L + s.mass * c.ax * s.h / L;
  Nf = Math.max(Nf, mg * 0.2); Nr = Math.max(Nr, mg * 0.2);

  const mu = s.mu * c.surface;
  const dirX = vx >= 0 ? 1 : -1;
  const alphaF = Math.atan2(vy + c.omega * s.a, vxa) - delta * dirX;
  const alphaR = Math.atan2(vy - c.omega * s.b, vxa);
  const AP = 0.13; // angle de dérive au pic d'adhérence

  // --- force motrice (roues arrière)
  let drive = 0;
  if (c.reversing) {
    drive = -input.brake * s.fmax * 0.45 * (vx > -7 ? 1 : 0);
  } else {
    const vRef = Math.max(vx, 4);
    drive = c.throttle * Math.min(s.fmax, s.power / vRef);
    if (vx > s.top) drive *= Math.max(0, 1 - (vx - s.top) / 4);
    if (c.shiftTimer > 0) drive *= 0.35;
  }
  // freinage
  let brakeF = 0, rearBrake = 0;
  if (!c.reversing && c.brake > 0.01) brakeF = c.brake * mg * 0.95;
  if (c.handbrake > 0.5) rearBrake = Nr * mu * 0.75;

  // --- cercle de friction arrière : l'excès de motricité tue l'adhérence latérale
  // état de glisse entretenu (arcade) : une fois la dérive lancée, le gaz garde l'arrière libre
  const wantDrift = Math.abs(beta) > 0.14 && vx > 6 && c.throttle > 0.3 && !c.reversing;
  const dropDrift = Math.abs(beta) < 0.06 || c.throttle < 0.15 || vx < 4 || (-c.steer * Math.sign(beta) < -0.5 && Math.abs(beta) < 0.22) || (Math.abs(beta) < 0.1 && -c.steer * Math.sign(beta) < 0.15);
  c.drift = Math.max(0, Math.min(1, (c.drift || 0) + (wantDrift ? dt * 3 : dropDrift ? -dt * 2.5 : 0)));
  const rearCap = Nr * mu * (c.handbrake > 0.5 ? 0.52 : 1) * (1 - 0.36 * c.drift * c.throttle);
  const lon = Math.abs(drive) + rearBrake;
  const spinRatio = lon / rearCap;
  c.wheelSpin += ((Math.max(0, spinRatio - 0.72) * 2.2 + Math.abs(alphaR) * 1.5) - c.wheelSpin) * Math.min(1, dt * 6);
  const latFloor = 0.5 + 0.12 * c.throttle; // en glisse, garde de quoi tenir l'angle
  const latCapR = Math.sqrt(Math.max(rearCap * rearCap - lon * lon * 0.8, (rearCap * latFloor) ** 2));
  const driveEff = Math.sign(drive) * Math.min(Math.abs(drive), rearCap * 0.95);

  const Fyf = -Nf * mu * tireCurve(Math.abs(alphaF) / AP) * Math.sign(alphaF);
  const Fyr = -latCapR * tireCurve(Math.abs(alphaR) / (AP * 1.1)) * Math.sign(alphaR);

  // résistances
  const drag = 0.42 * speed * speed + 160 * Math.min(speed, 1) + (1 - c.surface) * 2600 * Math.min(speed / 5, 1);

  let Fx = driveEff - Fyf * Math.sin(delta);
  let Fy = Fyf * Math.cos(delta) + Fyr;
  // freins (opposés à la vitesse)
  const bTot = brakeF + rearBrake * 0.55;
  if (speed > 0.05) {
    Fx -= (vx / speed) * (bTot + drag);
    Fy -= (vy / speed) * (bTot * 0.4 + drag);
  }

  // --- couple de lacet
  let torque = s.a * Fyf * Math.cos(delta) - s.b * Fyr;
  const I = s.mass * s.a * s.b * 1.05;
  // aide à la glisse (arcade) : un régulateur d'angle tient la dérive.
  // gaz = plus d'angle ; braquer vers l'intérieur = plus d'angle, vers l'extérieur = sortie.
  if (vx > 4 && c.drift > 0 && assist > 0) {
    const dir = beta < 0 ? -1 : 1;
    const into = -c.steer * dir;
    const bt = Math.max(0.05, Math.min(1.05, 0.3 + 0.26 * c.throttle + 0.42 * into));
    const target = dir * bt;
    const bdot = (beta - (c.prevBeta ?? beta)) / dt;
    const k = c.drift * Math.min(assist, 1.25);
    torque += I * k * (16 * (beta - target) + 6.5 * bdot);
    Fx += c.throttle * c.drift * s.mass * 1.6 * Math.cos(beta);
    Fx -= c.drift * Math.abs(Math.sin(beta)) * s.mass * 2.2 * Math.min(speed / 10, 1);
  }
  c.prevBeta = beta;

  // --- intégration (monde)
  const ax = Fx / s.mass, ay = Fy / s.mass;
  vx += (ax + c.omega * vy) * dt;
  vy += (ay - c.omega * vx) * dt;
  c.omega += (torque / I) * dt;

  // basse vitesse : convergence vers le modèle cinématique (évite les instabilités)
  if (speed < 3) {
    const kin = (vx * Math.tan(delta)) / L;
    const k = 1 - speed / 3;
    c.omega += (kin - c.omega) * Math.min(1, dt * 12 * k);
    vy *= 1 - Math.min(1, dt * 8 * k);
    if (Math.abs(drive) < 1 && c.brake > 0.05 && Math.abs(vx) < 0.4) vx *= 0.8;
  }

  c.heading += c.omega * dt;
  const nc = Math.cos(c.heading), ns = Math.sin(c.heading);
  c.vx = vx * nc - vy * ns;
  c.vz = vx * ns + vy * nc;
  c.x += c.vx * dt; c.z += c.vz * dt;

  // --- sorties
  c.ax += (ax - c.ax) * Math.min(1, dt * 8);
  c.ay += (ay - c.ay) * Math.min(1, dt * 8);
  c.speed = Math.hypot(vx, vy);
  c.fwd = vx; c.lat = vy;
  c.slip = Math.atan2(vy, Math.max(Math.abs(vx), 0.5));
  c.rearSlip = Math.abs(alphaR);
  c.frontSlip = Math.abs(alphaF);
  c.wheelRot += (vx / WHEEL_R) * dt * (1 + Math.min(c.wheelSpin, 1.5) * 0.6);
  c.rollAngle += ((-ay * 0.012) - c.rollAngle) * Math.min(1, dt * 7);
  c.pitchAngle += ((ax * 0.008) - c.pitchAngle) * Math.min(1, dt * 7);

  // --- boîte auto (pour le son et la coupure de couple)
  c.shiftTimer = Math.max(0, c.shiftTimer - dt);
  const wheelV = Math.abs(vx) * (1 + Math.min(c.wheelSpin, 1.2) * 0.45);
  let rpm = RPM_IDLE + (wheelV / WHEEL_R) * GEARS[c.gear] * FINAL * 60 / (2 * Math.PI);
  if (c.reversing) { c.gear = 1; }
  else if (rpm > RPM_MAX - 300 && c.gear < 6 && c.throttle > 0.3) { c.gear++; c.shiftTimer = 0.18; }
  else if (c.gear > 1) {
    const lower = RPM_IDLE + (wheelV / WHEEL_R) * GEARS[c.gear - 1] * FINAL * 60 / (2 * Math.PI);
    if (lower < 5600) { if (rpm < 3300) c.gear--; }
  }
  rpm = RPM_IDLE + (wheelV / WHEEL_R) * GEARS[c.gear] * FINAL * 60 / (2 * Math.PI);
  if (c.throttle > 0.2 && wheelV < 3) rpm = Math.max(rpm, RPM_IDLE + c.throttle * 3400);
  c.rpm += (Math.min(rpm, RPM_MAX + 200) - c.rpm) * Math.min(1, dt * 14);
  return c;
}

if (typeof module !== 'undefined') module.exports = { CAR_SPECS, createCarState, stepCar, tireCurve, RPM_MAX, RPM_IDLE };
