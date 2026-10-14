// ===== Effets : fumée de pneus, traces de gomme, étincelles =====
function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function createParticles(max, opts) {
  const pos = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max);
  const vel = new Float32Array(max * 3), age = new Float32Array(max).fill(1e9), life = new Float32Array(max).fill(1), s0 = new Float32Array(max), s1 = new Float32Array(max), a0 = new Float32Array(max);
  const colors = opts.colored ? new Float32Array(max * 3).fill(1) : null; // couleur par particule (fumée de pneus colorée)
  const geo = new THREE.BufferGeometry();
  if (colors) geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { map: { value: opts.map }, col: { value: new THREE.Color(opts.color) }, scale: { value: 400 }, fogCol: { value: new THREE.Color(0) }, fogNear: { value: 50 }, fogFar: { value: 500 } },
    defines: colors ? { COLORED: 1 } : {},
    vertexShader: `attribute float aSize; attribute float aAlpha; uniform float scale; varying float vA; varying float vFog;
      #ifdef COLORED
      attribute vec3 aColor; varying vec3 vC;
      #endif
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * scale / max(-mv.z, 0.1); vA = aAlpha; vFog = -mv.z; gl_Position = projectionMatrix * mv;
      #ifdef COLORED
      vC = aColor;
      #endif
      }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 col, fogCol; uniform float fogNear, fogFar; varying float vA; varying float vFog;
      #ifdef COLORED
      varying vec3 vC;
      #endif
      void main(){ vec4 t = texture2D(map, gl_PointCoord); float f = smoothstep(fogNear, fogFar, vFog);
      #ifdef COLORED
      vec3 c = mix(col * vC, fogCol, f);
      #else
      vec3 c = mix(col, fogCol, f);
      #endif
      float near = smoothstep(1.2, 5.0, vFog); gl_FragColor = vec4(c, t.a * vA * near * (1.0 - f * 0.6)); }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let head = 0;
  return {
    points, mat,
    emit(x, y, z, vx, vy, vz, l, sa, sb, al, c) {
      const i = head; head = (head + 1) % max;
      if (colors && c) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      age[i] = 0; life[i] = l; s0[i] = sa; s1[i] = sb; a0[i] = al;
    },
    update(dt) {
      const drag = Math.exp(-opts.drag * dt);
      for (let i = 0; i < max; i++) {
        if (age[i] >= life[i]) { alpha[i] = 0; size[i] = 0; continue; }
        age[i] += dt;
        const k = Math.min(age[i] / life[i], 1);
        vel[i * 3] *= drag; vel[i * 3 + 2] *= drag;
        vel[i * 3 + 1] = vel[i * 3 + 1] * drag + opts.gravity * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (opts.floor && pos[i * 3 + 1] < 0.05) { pos[i * 3 + 1] = 0.05; vel[i * 3 + 1] *= -0.3; }
        size[i] = s0[i] + (s1[i] - s0[i]) * Math.sqrt(k);
        const fadeIn = Math.min(age[i] / 0.08, 1);
        alpha[i] = a0[i] * fadeIn * Math.pow(1 - k, 1.6);
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aSize.needsUpdate = true; geo.attributes.aAlpha.needsUpdate = true;
      if (colors) geo.attributes.aColor.needsUpdate = true;
    },
    clear() { age.fill(1e9); },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

function createSkids(maxQuads) {
  const pos = new Float32Array(maxQuads * 4 * 3), alpha = new Float32Array(maxQuads * 4);
  const idx = new Uint32Array(maxQuads * 6);
  for (let q = 0; q < maxQuads; q++) { const a = q * 4; idx.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], q * 6); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aA', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.02,0.02,0.025, vA); }',
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  let head = 0, dirtyFrom = -1;
  const trackers = new Map();
  return {
    mesh,
    // id : identifiant de roue ; intensity 0..1
    mark(id, x, z, intensity, width) {
      let t = trackers.get(id);
      if (!t) { t = { x, z, on: false, lx: 0, lz: 0, rx: 0, rz: 0, a: 0 }; trackers.set(id, t); }
      if (intensity < 0.08) { t.on = false; t.x = x; t.z = z; return; }
      const dx = x - t.x, dz = z - t.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.45) return;
      const nx = -dz / d * width / 2, nz = dx / d * width / 2;
      const a = Math.min(0.62, intensity * 0.7);
      if (t.on && d < 3) {
        const q = head; head = (head + 1) % maxQuads;
        const o = q * 12;
        pos.set([t.lx, 0.022, t.lz, t.rx, 0.022, t.rz, x + nx, 0.022, z + nz, x - nx, 0.022, z - nz], o);
        alpha.set([t.a, t.a, a, a], q * 4);
        geo.attributes.position.needsUpdate = true; geo.attributes.aA.needsUpdate = true;
      }
      t.on = true; t.x = x; t.z = z; t.lx = x + nx; t.lz = z + nz; t.rx = x - nx; t.rz = z - nz; t.a = a;
    },
    clear() { pos.fill(0); alpha.fill(0); trackers.clear(); geo.attributes.position.needsUpdate = true; geo.attributes.aA.needsUpdate = true; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
