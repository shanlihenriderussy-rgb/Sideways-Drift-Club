// ===== IA « leader » : trajectoire de drift précalculée, pilotée cinématiquement =====
function buildDriftLine(track) {
  const N = track.count, half = track.half;
  const off = new Float32Array(N), vmax = new Float32Array(N), beta = new Float32Array(N);
  const smooth = (src, r) => {
    const out = new Float32Array(N);
    for (let i = 0; i < N; i++) { let s = 0; for (let k = -r; k <= r; k++) s += src[(i + k + N) % N]; out[i] = s / (2 * r + 1); }
    return out;
  };
  const curv = smooth(track.curv, 8);
  for (let i = 0; i < N; i++) {
    const k = curv[i];
    off[i] = -Math.sign(k) * Math.min(Math.abs(k) * 60, 1) * (half - 2.4);
    vmax[i] = Math.max(13, Math.min(29, Math.sqrt(8.5 / Math.max(Math.abs(k), 1e-4))));
  }
  const offS = smooth(smooth(off, 18), 18);
  // profil de vitesse : freinage / accélération limités
  const v = Float32Array.from(vmax);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = N - 1; i >= 0; i--) { const n = (i + 1) % N; v[i] = Math.min(v[i], Math.sqrt(v[n] * v[n] + 2 * 5.5 * track.step)); }
    for (let i = 0; i < N; i++) { const p = (i - 1 + N) % N; v[i] = Math.min(v[i], Math.sqrt(v[p] * v[p] + 2 * 3.8 * track.step)); }
  }
  // angle de dérive : anticipe le virage (regard en avant)
  for (let i = 0; i < N; i++) {
    let m = 0;
    for (let k = 0; k < 22; k++) { const c = curv[(i + k) % N]; if (Math.abs(c) > Math.abs(m)) m = c; }
    const b = Math.min(0.85, Math.abs(m) * 30 + (Math.abs(m) > 1 / 120 ? 0.32 : 0));
    beta[i] = Math.sign(m) * b;
  }
  const betaS = smooth(beta, 10);
  // points de la trajectoire
  const lx = new Float32Array(N), lz = new Float32Array(N);
  for (let i = 0; i < N; i++) { lx[i] = track.px[i] - track.tz[i] * offS[i]; lz[i] = track.pz[i] + track.tx[i] * offS[i]; }
  return { off: offS, v, beta: betaS, lx, lz };
}

function createLeader(track, line, startIdx) {
  const N = track.count;
  const st = {
    s: startIdx * track.step, x: 0, z: 0, heading: 0, speed: 0, rollAngle: 0, pitchAngle: 0, wheelRot: 0, steerAngle: 0, rearSlip: 0, slip: 0,
    vx: 0, vz: 0, throttle: 1, rpm: 5000, fwd: 0,
  };
  let pathHeading = 0, curBeta = 0, prevX = null, prevZ = null;
  function sample(s) {
    const L = track.length;
    let u = ((s % L) + L) % L / track.step;
    const i = Math.floor(u) % N, j = (i + 1) % N, t = u - Math.floor(u);
    return { i, x: line.lx[i] + (line.lx[j] - line.lx[i]) * t, z: line.lz[i] + (line.lz[j] - line.lz[i]) * t, v: line.v[i] + (line.v[j] - line.v[i]) * t, b: line.beta[i] + (line.beta[j] - line.beta[i]) * t };
  }
  function place() {
    const a = sample(st.s), b = sample(st.s + 2.5);
    st.x = a.x; st.z = a.z;
    pathHeading = Math.atan2(b.z - a.z, b.x - a.x);
    return a;
  }
  place();
  st.heading = pathHeading;
  return {
    state: st,
    get index() { return sample(st.s).i; },
    update(dt, speedScale) {
      const a = sample(st.s);
      const target = a.v * speedScale;
      st.speed += Math.max(-8 * dt, Math.min(5 * dt, target - st.speed));
      st.s += st.speed * dt;
      const ox = st.x, oz = st.z;
      place();
      const vx = (st.x - ox) / Math.max(dt, 1e-4), vz = (st.z - oz) / Math.max(dt, 1e-4);
      st.vx = vx; st.vz = vz;
      curBeta += (a.b - curBeta) * Math.min(1, dt * 3);
      let dh = pathHeading + curBeta - st.heading;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      const prevH = st.heading;
      st.heading += dh * Math.min(1, dt * 6);
      st.slip = -curBeta;
      st.rearSlip = Math.abs(curBeta) * 1.2;
      st.steerAngle += ((-curBeta * 0.9) - st.steerAngle) * Math.min(1, dt * 8);
      st.wheelRot += (st.speed / 0.33) * dt * (1 + Math.abs(curBeta));
      const yawRate = (st.heading - prevH) / Math.max(dt, 1e-4);
      st.rollAngle += ((-yawRate * st.speed * 0.006) - st.rollAngle) * Math.min(1, dt * 5);
      st.fwd = st.speed;
      st.rpm = 4200 + Math.abs(curBeta) * 3000 + Math.sin(st.s * 0.05) * 200;
    },
    get drifting() { return Math.abs(curBeta) > 0.2; },
    reset(idx) { st.s = idx * track.step; place(); st.heading = pathHeading; st.speed = line.v[idx] * 0.8; curBeta = 0; },
  };
}
