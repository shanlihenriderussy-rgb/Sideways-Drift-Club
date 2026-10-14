// ===== Monde : ciel, sol, route, murs, vibreurs, décor, zones =====
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const THEMES = {
  night: {
    skyTop: 0x05071a, skyHorizon: 0x30235a, skyBottom: 0x0b0a16, sun: [0.3, 0.55, -0.6], sunColor: 0x9fb4ff, sunSize: 0.9996,
    fog: 0x1d1838, fogNear: 70, fogFar: 520, hemiSky: 0x5a64a8, hemiGround: 0x1a1420, hemi: 0.75, dir: 0.45, dirColor: 0xaab8ff,
    ground: '#25262c', groundSpeck: '#34353d', shoulder: '#3a3a40', road: '#2e2f35', line: '#e8e2cf',
    wallA: '#f2c230', wallB: '#1a1a1e', wallText: '#111', lamps: true, headlights: true, exposure: 1.15,
  },
  sunset: {
    skyTop: 0x27306e, skyHorizon: 0xff8a5b, skyBottom: 0x3a2a3a, sun: [-0.75, 0.12, 0.45], sunColor: 0xffc27a, sunSize: 0.9985,
    fog: 0xd7826a, fogNear: 110, fogFar: 760, hemiSky: 0xffc9a0, hemiGround: 0x3b3550, hemi: 0.85, dir: 1.35, dirColor: 0xffb47a,
    ground: '#4c5a2e', groundSpeck: '#5f6d38', shoulder: '#7c7058', road: '#3b3c42', line: '#f4efe2',
    wallA: '#f4f1ea', wallB: '#c8302c', wallText: '#1b1b1b', lamps: false, headlights: false, exposure: 1.05,
  },
  day: {
    skyTop: 0x2f7fd6, skyHorizon: 0xcfe7f3, skyBottom: 0x6a8aa0, sun: [0.45, 0.75, 0.35], sunColor: 0xfff3d6, sunSize: 0.9992,
    fog: 0xb9d7e6, fogNear: 160, fogFar: 950, hemiSky: 0xdff1ff, hemiGround: 0x4a4238, hemi: 0.9, dir: 1.7, dirColor: 0xfff1d8,
    ground: '#2f2b29', groundSpeck: '#3f5a2c', shoulder: '#4a4440', road: '#3a3b40', line: '#ffffff',
    wallA: '#ffffff', wallB: '#1f6fb2', wallText: '#0e2236', lamps: false, headlights: false, exposure: 1.0,
  },
};

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

function noiseFill(g, w, h, base, speck, n, sz) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const r = rng(7);
  for (let i = 0; i < n; i++) {
    g.globalAlpha = 0.05 + r() * 0.18;
    g.fillStyle = r() > 0.5 ? speck : '#000';
    const s = 1 + r() * sz;
    g.fillRect(r() * w, r() * h, s, s);
  }
  g.globalAlpha = 1;
}

function buildWorld(scene, track, quality) {
  const T = THEMES[track.def.theme];
  const group = new THREE.Group();
  scene.add(group);
  const disposables = [];
  const keep = (o) => { disposables.push(o); return o; };

  // --- ciel
  const skyMat = keep(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(T.skyTop) }, hor: { value: new THREE.Color(T.skyHorizon) }, bot: { value: new THREE.Color(T.skyBottom) },
      sunDir: { value: new THREE.Vector3(...T.sun).normalize() }, sunCol: { value: new THREE.Color(T.sunColor) }, sunSize: { value: T.sunSize },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top, hor, bot, sunCol, sunDir; uniform float sunSize; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(hor, top, pow(clamp(h,0.0,1.0), 0.55)) : mix(hor, bot, pow(clamp(-h*3.0,0.0,1.0),0.6));
      float d = dot(normalize(vP), normalize(sunDir)); c += sunCol * (smoothstep(sunSize, 1.0, d) * 1.6 + pow(max(d,0.0), 16.0) * 0.35);
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(1600, 32, 16)), skyMat);
  sky.renderOrder = -1;
  group.add(sky);
  scene.fog = new THREE.Fog(T.fog, T.fogNear, T.fogFar);
  scene.background = new THREE.Color(T.fog);

  // --- lumières
  const hemi = new THREE.HemisphereLight(T.hemiSky, T.hemiGround, T.hemi);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(T.dirColor, T.dir);
  sun.position.set(...T.sun).multiplyScalar(60);
  if (quality.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 160;
    sun.shadow.bias = -0.0006;
  }
  group.add(sun); group.add(sun.target);

  // --- sol
  const groundTex = keep(canvasTex(256, 256, (g, w, h) => noiseFill(g, w, h, T.ground, T.groundSpeck, 2200, 3), true));
  groundTex.repeat.set(220, 220);
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(3200, 3200)), keep(new THREE.MeshLambertMaterial({ map: groundTex, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 })));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.12;
  ground.receiveShadow = !!quality.shadows;
  group.add(ground);

  // --- route
  const roadTex = keep(canvasTex(256, 512, (g, w, h) => {
    noiseFill(g, w, h, T.road, '#6a6a72', 9000, 2);
    g.fillStyle = T.line;
    g.fillRect(6, 0, 7, h); g.fillRect(w - 13, 0, 7, h);
    g.globalAlpha = 0.12; g.fillStyle = '#000';
    g.fillRect(w * 0.28, 0, w * 0.1, h); g.fillRect(w * 0.62, 0, w * 0.1, h); // traces d'usure
    g.globalAlpha = 1;
  }, true));
  const N = track.count;
  const { px, pz, tx, tz, half, wall } = track;
  function strip(off0, off1, y, vScale, uFlip) {
    const pos = new Float32Array((N + 1) * 2 * 3), uv = new Float32Array((N + 1) * 2 * 2), idx = [];
    for (let k = 0; k <= N; k++) {
      const i = k % N;
      const nx = -tz[i], nz = tx[i];
      pos.set([px[i] + nx * off0, y, pz[i] + nz * off0, px[i] + nx * off1, y, pz[i] + nz * off1], k * 6);
      const v = (k * track.step) / vScale;
      uv.set(uFlip ? [1, v, 0, v] : [0, v, 1, v], k * 4);
      if (k < N) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return keep(geo);
  }
  const road = new THREE.Mesh(strip(-half, half, 0.01, 16), keep(new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92, metalness: 0 })));
  road.receiveShadow = !!quality.shadows;
  group.add(road);
  const shTex = keep(canvasTex(128, 128, (g, w, h) => noiseFill(g, w, h, T.shoulder, '#8a8478', 1400, 2), true));
  const shMat = keep(new THREE.MeshLambertMaterial({ map: shTex }));
  group.add(new THREE.Mesh(strip(-wall, -half, 0.005, 6), shMat));
  group.add(new THREE.Mesh(strip(half, wall, 0.005, 6), shMat));

  // --- vibreurs (là où ça tourne)
  const curbTex = keep(canvasTex(32, 64, (g, w, h) => { g.fillStyle = '#d42a2a'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f5f2ea'; g.fillRect(0, h / 2, w, h / 2); }, true));
  {
    const pos = [], uv = [], idx = [];
    let vi = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        if (Math.abs(track.curv[i]) < 1 / 85 || Math.abs(track.curv[j]) < 1 / 85) continue;
        for (const q of [i, j]) {
          const nx = -tz[q] * side, nz = tx[q] * side;
          const v = (q === j && j === 0 ? N : q) * track.step / 3;
          pos.push(px[q] + nx * (half - 1.1), 0.03, pz[q] + nz * (half - 1.1), px[q] + nx * (half + 0.4), 0.06, pz[q] + nz * (half + 0.4));
          uv.push(0, v, 1, v);
        }
        if (side > 0) idx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
        else idx.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3);
        vi += 4;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    group.add(new THREE.Mesh(keep(geo), keep(new THREE.MeshLambertMaterial({ map: curbTex }))));
  }

  // --- murs (glissières béton peintes, panneaux)
  const words = ['SIDEWAYS', 'ドリフト', 'TOUGE CLUB', '974', 'NO GRIP', '横滑り', 'CLIP IT'];
  const wallTex = keep(canvasTex(1024, 64, (g, w, h) => {
    const seg = w / 8;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? T.wallA : T.wallB; g.fillRect(i * seg, 0, seg, h);
      if (i % 4 === 1) {
        g.fillStyle = i % 2 ? T.wallText : T.wallA;
        g.font = '900 34px "Dela Gothic One", "Arial Black", sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(words[i % words.length], i * seg + seg / 2, h / 2 + 2);
      }
    }
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, h - 6, w, 6);
  }, true));
  const wallMat = keep(new THREE.MeshLambertMaterial({ map: wallTex }));
  const wallTop = keep(new THREE.MeshLambertMaterial({ color: 0x8b8b8f }));
  for (const side of [-1, 1]) {
    const pos = [], uv = [], idx = [], tpos = [], tidx = [];
    for (let k = 0; k <= N; k++) {
      const i = k % N;
      const nx = -tz[i] * side, nz = tx[i] * side;
      const x = px[i] + nx * wall, z = pz[i] + nz * wall;
      const v = k * track.step / 24;
      pos.push(x, -0.15, z, x, 1.05, z); uv.push(-v * side, 0, -v * side, 1);
      const x2 = x + nx * 0.5, z2 = z + nz * 0.5;
      tpos.push(x, 1.05, z, x2, 1.05, z2);
      if (k < N) {
        const a = k * 2;
        if (side > 0) { idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); tidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        else { idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); tidx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    group.add(new THREE.Mesh(keep(geo), wallMat));
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tpos, 3));
    tg.setIndex(tidx); tg.computeVertexNormals();
    group.add(new THREE.Mesh(keep(tg), wallTop));
  }

  // --- ligne de départ + portique
  {
    const i0 = 0;
    const nx = -tz[i0], nz = tx[i0];
    const chk = keep(canvasTex(128, 32, (g, w, h) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; g.fillRect(x * 8, y * 8, 8, 8); } }));
    const line = new THREE.Mesh(keep(new THREE.PlaneGeometry(track.def.width, 2)), keep(new THREE.MeshLambertMaterial({ map: chk })));
    line.rotation.x = -Math.PI / 2; line.rotation.z = -track.heading[i0] + Math.PI / 2;
    line.position.set(px[i0], 0.03, pz[i0]);
    group.add(line);
    const gant = new THREE.Group();
    const pil = keep(new THREE.BoxGeometry(0.6, 6, 0.6));
    const pm = keep(new THREE.MeshLambertMaterial({ color: 0x1c1c22 }));
    for (const s of [-1, 1]) { const p = new THREE.Mesh(pil, pm); p.position.set(0, 3, s * (wall + 0.8)); gant.add(p); }
    const banTex = keep(canvasTex(1024, 128, (g, w, h) => {
      g.fillStyle = '#111'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffd23f'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
      g.font = '900 64px "Dela Gothic One", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ffd23f'; g.fillText('SIDEWAYS · ' + track.def.jp, w / 2, h / 2 + 4);
    }));
    const span = (wall + 0.8) * 2 + 0.6;
    const beam = new THREE.Mesh(keep(new THREE.BoxGeometry(0.5, 1.4, span)), pm);
    beam.position.y = 6;
    gant.add(beam);
    gant.position.set(px[i0], 0, pz[i0]);
    gant.rotation.y = -track.heading[i0];
    group.add(gant);
    // panneau lisible : plan face au pilote
    const face = new THREE.Mesh(keep(new THREE.PlaneGeometry((wall + 0.8) * 2 + 0.6, 1.4)), keep(new THREE.MeshBasicMaterial({ map: banTex, fog: true })));
    face.position.set(-0.27, 6, 0); face.rotation.y = -Math.PI / 2;
    gant.add(face);
  }

  // --- zones de clipping
  const zoneMeshes = [];
  const zoneMat = (col) => keep(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, col: { value: new THREE.Color(col) }, hit: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time, hit; uniform vec3 col; varying vec2 vUv;
      void main(){ float stripe = step(0.5, fract(vUv.y * 0.5 - time * 0.8));
      float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
      vec3 c = mix(col, vec3(0.3, 1.0, 0.55), hit);
      float a = (0.18 + stripe * 0.22) * (0.6 + edge * 0.4) + hit * 0.25;
      gl_FragColor = vec4(c * a, a); }`,
  }));
  const poleGeo = keep(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6));
  const markGroup = new THREE.Group();
  const markMats = { outer: keep(new THREE.MeshBasicMaterial({ color: 0xffb020 })), inner: keep(new THREE.MeshBasicMaterial({ color: 0x38d6ff })) };
  const flagGeo = keep(new THREE.ConeGeometry(0.5, 1.2, 4));
  for (const z of track.zones) {
    const mat = zoneMat(z.type === 'outer' ? 0xffb020 : 0x38d6ff);
    let o0, o1;
    if (z.type === 'outer') { o0 = z.side * (half - 3.2); o1 = z.side * (half + 0.6); }
    else { o0 = z.side * (half - 3.6); o1 = z.side * (half - 0.2); }
    const pos = [], uv = [], idx = [];
    let k = 0, i = z.from;
    for (;;) {
      const nx = -tz[i], nz = tx[i];
      pos.push(px[i] + nx * o0, 0.05, pz[i] + nz * o0, px[i] + nx * o1, 0.05, pz[i] + nz * o1);
      uv.push(0, k * track.step / 2, 1, k * track.step / 2);
      if (k > 0) { const a = (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3, a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      if (i === z.to) break;
      i = (i + 1) % N; k++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const m = new THREE.Mesh(keep(geo), mat);
    m.renderOrder = 2;
    group.add(m);
    // poteaux / cône repère
    const markers = [];
    const pm = markMats[z.type];
    const at = z.type === 'outer' ? [z.from, z.to] : [z.mid];
    for (const q of at) {
      const off = z.type === 'outer' ? z.side * (wall - 0.4) : z.side * (half + 0.9);
      const x = px[q] - tz[q] * off, zz = pz[q] + tx[q] * off;
      const pole = new THREE.Mesh(poleGeo, pm); pole.position.set(x, 1.2, zz); markGroup.add(pole);
      const fl = new THREE.Mesh(flagGeo, pm); fl.position.set(x, 2.6, zz); fl.rotation.x = Math.PI; markGroup.add(fl);
    }
    zoneMeshes.push({ zone: z, mat, markers });
  }

  mergeByMaterial(markGroup, keep, []);
  group.add(markGroup);

  // --- décor
  const R = rng(track.def.id.length * 977 + 13);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < N; i++) { minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]); minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]); }
  function clearOf(x, z, d) {
    const d2 = d * d;
    for (let i = 0; i < N; i += 2) { const dx = x - px[i], dz = z - pz[i]; if (dx * dx + dz * dz < d2) return false; }
    return true;
  }
  function scatter(count, minD, pad) {
    const out = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 30) {
      const x = minX - pad + R() * (maxX - minX + pad * 2), z = minZ - pad + R() * (maxZ - minZ + pad * 2);
      if (clearOf(x, z, minD)) out.push([x, z]);
    }
    return out;
  }
  const dummy = new THREE.Object3D();
  function instanced(geo, mat, list, setup) {
    const m = new THREE.InstancedMesh(keep(geo), keep(mat), list.length);
    list.forEach((p, i) => { dummy.position.set(p[0], 0, p[1]); dummy.rotation.set(0, R() * Math.PI * 2, 0); dummy.scale.set(1, 1, 1); setup && setup(dummy, i, m); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
    m.instanceMatrix.needsUpdate = true;
    group.add(m);
    return m;
  }
  const dens = quality.scenery;

  // lampadaires le long des murs (lumière simulée au sol la nuit)
  if (T.lamps) {
    const lamps = [];
    for (let i = 0; i < N; i += Math.round(34 / track.step)) {
      const side = (Math.floor(i / 20) % 2) ? 1 : -1;
      lamps.push([i, side]);
    }
    const postGeo = new THREE.CylinderGeometry(0.12, 0.16, 8, 6); postGeo.translate(0, 4, 0);
    const armGeo = new THREE.BoxGeometry(0.15, 0.15, 3); armGeo.translate(0, 8, -1.5);
    const headGeo = new THREE.BoxGeometry(0.5, 0.18, 0.9); headGeo.translate(0, 7.9, -2.9);
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
    const place = (geo, mat) => {
      const m = new THREE.InstancedMesh(keep(geo), keep(mat), lamps.length);
      lamps.forEach(([i, side], n) => {
        const nx = -tz[i] * side, nz = tx[i] * side;
        dummy.position.set(px[i] + nx * (wall + 1.2), 0, pz[i] + nz * (wall + 1.2));
        dummy.rotation.set(0, Math.atan2(nx, nz), 0); dummy.scale.set(1, 1, 1);
        dummy.updateMatrix(); m.setMatrixAt(n, dummy.matrix);
      });
      group.add(m);
    };
    place(postGeo, darkMat); place(armGeo, darkMat); place(headGeo, glowMat);
    // flaques de lumière (additives)
    const poolTex = keep(canvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,190,110,0.85)'); gr.addColorStop(0.5, 'rgba(255,160,80,0.28)'); gr.addColorStop(1, 'rgba(255,140,60,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }));
    poolTex.encoding = THREE.LinearEncoding;
    const pool = new THREE.InstancedMesh(keep(new THREE.PlaneGeometry(16, 16)), keep(new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })), lamps.length);
    lamps.forEach(([i, side], n) => {
      const nx = -tz[i] * side, nz = tx[i] * side;
      dummy.position.set(px[i] + nx * (wall - 2.2), 0.04, pz[i] + nz * (wall - 2.2));
      dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); pool.setMatrixAt(n, dummy.matrix);
    });
    pool.renderOrder = 1;
    group.add(pool);
  }

  if (track.def.theme === 'night') {
    // conteneurs empilés + grues
    const cols = [0xc0392b, 0x1f6fb2, 0x2e8b57, 0xe0a526, 0x7a3fb0, 0xd35400, 0x5d6d7e];
    const spots = scatter(Math.round(150 * dens), track.wall + 9, 70);
    const cont = instanced(new THREE.BoxGeometry(12, 2.6, 2.5), new THREE.MeshLambertMaterial({ color: 0xffffff }), spots, (d, i, m) => {
      d.position.y = 1.3 + (R() < 0.35 ? 2.6 : 0);
      d.rotation.y = Math.round(R() * 4) * Math.PI / 2 + (R() - 0.5) * 0.1;
    });
    const c = new THREE.Color();
    for (let i = 0; i < spots.length; i++) cont.setColorAt(i, c.setHex(cols[Math.floor(R() * cols.length)]));
    cont.instanceColor.needsUpdate = true;
    const cranes = scatter(5, track.wall + 26, 40);
    const legGeo = new THREE.BoxGeometry(1.2, 34, 1.2); legGeo.translate(0, 17, 0);
    const craneMat = new THREE.MeshLambertMaterial({ color: 0xd9822b });
    const craneGroup = new THREE.Group();
    for (const [x, z] of cranes) {
      const g = new THREE.Group();
      for (const [a, b] of [[-6, -5], [6, -5], [-6, 5], [6, 5]]) { const l = new THREE.Mesh(keep(legGeo), keep(craneMat)); l.position.set(a, 0, b); g.add(l); }
      const boom = new THREE.Mesh(keep(new THREE.BoxGeometry(46, 2, 2)), craneMat); boom.position.set(10, 34, 0); g.add(boom);
      const red = new THREE.Mesh(keep(new THREE.SphereGeometry(0.6, 8, 6)), keep(new THREE.MeshBasicMaterial({ color: 0xff3030 }))); red.position.set(32, 35.5, 0); g.add(red);
      g.position.set(x, 0, z); g.rotation.y = R() * Math.PI;
      g.updateMatrix();
      for (const c of [...g.children]) { c.updateMatrix(); c.matrix.premultiply(g.matrix); c.matrix.decompose(c.position, c.quaternion, c.scale); craneGroup.add(c); }
    }
    mergeByMaterial(craneGroup, keep, []);
    group.add(craneGroup);
  } else if (track.def.theme === 'sunset') {
    const spots = scatter(Math.round(420 * dens), track.wall + 4, 120);
    const coneA = new THREE.ConeGeometry(2.6, 6.5, 7); coneA.translate(0, 6.2, 0);
    const coneB = new THREE.ConeGeometry(1.9, 4.8, 7); coneB.translate(0, 9.4, 0);
    const trunk = new THREE.CylinderGeometry(0.28, 0.4, 3.4, 5); trunk.translate(0, 1.7, 0);
    const scales = spots.map(() => 0.7 + R() * 0.9);
    const setS = (d, i) => { const s = scales[i]; d.scale.set(s, s, s); };
    instanced(trunk, new THREE.MeshLambertMaterial({ color: 0x4a3326 }), spots, setS);
    instanced(coneA, new THREE.MeshPhongMaterial({ color: 0x2f5a3a, flatShading: true, shininess: 0 }), spots, setS);
    instanced(coneB, new THREE.MeshPhongMaterial({ color: 0x3c6e45, flatShading: true, shininess: 0 }), spots, setS);
  } else {
    // palmiers, roches basaltiques, océan
    const spots = scatter(Math.round(170 * dens), track.wall + 4, 90);
    const trunk = new THREE.CylinderGeometry(0.22, 0.34, 8, 6); trunk.translate(0, 4, 0);
    // couronne en étoile : 7 palmes retombantes
    const leaf = new THREE.ConeGeometry(4.4, 2.2, 14, 1, true);
    { const pa = leaf.attributes.position; for (let v = 0; v < pa.count; v++) { if (pa.getY(v) < 0) { const ang = Math.atan2(pa.getZ(v), pa.getX(v)); const seg = Math.round(((ang + Math.PI) / (2 * Math.PI)) * 14); if (seg % 2) { pa.setX(v, pa.getX(v) * 0.3); pa.setZ(v, pa.getZ(v) * 0.3); pa.setY(v, pa.getY(v) + 0.9); } } } leaf.computeVertexNormals(); }
    leaf.translate(0, 8.4, 0);
    const scales = spots.map(() => 0.75 + R() * 0.6);
    const setS = (d, i) => { const s = scales[i]; d.scale.set(s, s, s); d.rotation.z = (R() - 0.5) * 0.18; };
    instanced(trunk, new THREE.MeshLambertMaterial({ color: 0x7a5a3c }), spots, setS);
    instanced(leaf, new THREE.MeshPhongMaterial({ color: 0x2f8a3e, side: THREE.DoubleSide, flatShading: true, shininess: 0 }), spots, setS);
    const rocks = scatter(Math.round(140 * dens), track.wall + 3, 90);
    instanced(new THREE.DodecahedronGeometry(1.6, 0), new THREE.MeshPhongMaterial({ color: 0x24221f, flatShading: true, shininess: 4 }), rocks, (d) => { const s = 0.5 + R() * 1.6; d.scale.set(s * 1.4, s * 0.8, s); d.position.y = s * 0.3; });
    const ocean = new THREE.Mesh(keep(new THREE.PlaneGeometry(4000, 1600)), keep(new THREE.MeshLambertMaterial({ color: 0x1d6f9e })));
    ocean.rotation.x = -Math.PI / 2; ocean.position.set((minX + maxX) / 2, 0.0, maxZ + 900);
    group.add(ocean);
  }

  // montagnes lointaines (silhouettes)
  {
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const mtnCol = track.def.theme === 'night' ? 0x141228 : track.def.theme === 'sunset' ? 0x5a3d5c : 0x4f6f7d;
    const geo = new THREE.ConeGeometry(1, 1, 5);
    geo.translate(0, 0.5, 0);
    const list = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + R() * 0.2;
      const r = 900 + R() * 300;
      list.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
    if (track.def.theme === 'day') list.push([cx - 260, cz - 820]);
    instanced(geo, new THREE.MeshBasicMaterial({ color: mtnCol, fog: false }), list, (d, i) => {
      const big = i === 26;
      const h = big ? 420 : 120 + R() * 220; const w = big ? 700 : 220 + R() * 260;
      d.scale.set(w, h, w);
    });
  }

  function update(t) {
    for (const zm of zoneMeshes) {
      zm.mat.uniforms.time.value = t;
      zm.mat.uniforms.hit.value += ((zm.zone.flash || 0) - zm.mat.uniforms.hit.value) * 0.15;
      zm.zone.flash = Math.max(0, (zm.zone.flash || 0) - 0.02);
    }
  }
  function dispose() {
    scene.remove(group);
    for (const d of disposables) d.dispose && d.dispose();
  }
  return { group, sun, theme: T, update, dispose, skyMat };
}
