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
    ground: '#2b2c33', groundSpeck: '#3c3d46', shoulder: '#3a3a40', road: '#2e2f35', line: '#e8e2cf',
    wallA: '#f2c230', wallB: '#1a1a1e', wallText: '#111', lamps: true, headlights: true, exposure: 1.15,
    ridge: [0x141228, 0x0c0a1c], ridgeTop: [0x2a2352, 0x1a1636],
  },
  sunset: {
    skyTop: 0x27306e, skyHorizon: 0xff8a5b, skyBottom: 0x3a2a3a, sun: [-0.75, 0.12, 0.45], sunColor: 0xffc27a, sunSize: 0.9985,
    fog: 0xd7826a, fogNear: 110, fogFar: 760, hemiSky: 0xffc9a0, hemiGround: 0x3b3550, hemi: 0.85, dir: 1.35, dirColor: 0xffb47a,
    ground: '#4c5a2e', groundSpeck: '#5f6d38', shoulder: '#7c7058', road: '#3b3c42', line: '#f4efe2',
    wallA: '#e9ebee', wallB: '#c8302c', wallText: '#1b1b1b', lamps: false, headlights: false, exposure: 1.05,
    ridge: [0xa8607a, 0x6a3f63], ridgeTop: [0x8a4a6c, 0x4a2c50],
  },
  day: {
    skyTop: 0x2f7fd6, skyHorizon: 0xcfe7f3, skyBottom: 0x6a8aa0, sun: [0.45, 0.75, 0.35], sunColor: 0xfff3d6, sunSize: 0.9992,
    fog: 0xb9d7e6, fogNear: 160, fogFar: 950, hemiSky: 0xdff1ff, hemiGround: 0x4a4238, hemi: 0.9, dir: 1.7, dirColor: 0xfff1d8,
    ground: '#2f2b29', groundSpeck: '#3f5a2c', shoulder: '#4a4440', road: '#3a3b40', line: '#ffffff',
    wallA: '#ffffff', wallB: '#1f6fb2', wallText: '#0e2236', lamps: false, headlights: false, exposure: 1.0,
    ridge: [0x8fb3c4, 0x5f8a6a], ridgeTop: [0x7a9fb2, 0x3f6a4c],
  },
  // variantes : decor = famille de décor (night | sunset | day), sky = calque de ciel
  dawn: {
    decor: 'night', sky: 'sunset',
    skyTop: 0x34457a, skyHorizon: 0xffb38a, skyBottom: 0x2a2a3a, sun: [0.8, 0.08, -0.3], sunColor: 0xffc9a0, sunSize: 0.9988,
    fog: 0x9c8ca6, fogNear: 90, fogFar: 640, hemiSky: 0xd8c8e0, hemiGround: 0x2a2630, hemi: 0.8, dir: 1.0, dirColor: 0xffc8a0,
    ground: '#34353c', groundSpeck: '#45464f', shoulder: '#44444a', road: '#34353b', line: '#ece6d4',
    wallA: '#f2c230', wallB: '#1a1a1e', wallText: '#111', lamps: true, headlights: false, exposure: 1.05,
    ridge: [0x5a5878, 0x3a3858], ridgeTop: [0x8a7a98, 0x5a5070],
  },
  snow: {
    decor: 'sunset', sky: 'day',
    skyTop: 0x6f8fb8, skyHorizon: 0xe6eef5, skyBottom: 0x9aa8b8, sun: [-0.5, 0.35, 0.5], sunColor: 0xfff4e6, sunSize: 0.999,
    fog: 0xdfe8f0, fogNear: 80, fogFar: 600, hemiSky: 0xeef4ff, hemiGround: 0x8a94a8, hemi: 1.0, dir: 1.1, dirColor: 0xfff2e0,
    ground: '#e4eaf0', groundSpeck: '#c9d3de', shoulder: '#b8c0c8', road: '#45474d', line: '#f4efe2',
    wallA: '#e9ebee', wallB: '#2a6fc8', wallText: '#1b1b1b', lamps: false, headlights: false, exposure: 0.95,
    ridge: [0xbcc8d8, 0x8a9ab0], ridgeTop: [0xffffff, 0xe8eef6],
    blotch: ['#ffffff', '#d4dde6', '#c2ccd8', '#f2f5f8'], pines: [0x6f8a7a, 0x8aa094, 0xa8bab0, 0x5a7466], maples: [0xe8eef4, 0xd8e2ec, 0xc8302c, 0xf4f6f8],
  },
  dusk: {
    decor: 'day', sky: 'sunset',
    skyTop: 0x1e2458, skyHorizon: 0xe07a8a, skyBottom: 0x3a3050, sun: [0.6, 0.06, -0.5], sunColor: 0xff9a6a, sunSize: 0.9986,
    fog: 0x8a6a8a, fogNear: 120, fogFar: 820, hemiSky: 0xd0a0c0, hemiGround: 0x3a3040, hemi: 0.8, dir: 0.9, dirColor: 0xff9a7a,
    ground: '#2f2b29', groundSpeck: '#3f4a2c', shoulder: '#4a4440', road: '#3a3b40', line: '#ffffff',
    wallA: '#ffffff', wallB: '#d4502a', wallText: '#2a0e0e', lamps: true, headlights: true, exposure: 1.1,
    ridge: [0x4a3a6a, 0x2a2a4a], ridgeTop: [0x6a4a7a, 0x3a3050],
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

function noiseFill(g, w, h, base, speck, n, sz, seed) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const r = rng(seed || 7);
  for (let i = 0; i < n; i++) {
    g.globalAlpha = 0.05 + r() * 0.18;
    g.fillStyle = r() > 0.5 ? speck : '#000';
    const s = 1 + r() * sz;
    g.fillRect(r() * w, r() * h, s, s);
  }
  g.globalAlpha = 1;
}
// taches douces (variations de teinte à grande échelle), raccordables en mosaïque
function blotches(g, w, h, colors, n, rmin, rmax, alpha, seed) {
  const r = rng(seed || 11);
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = rmin + r() * (rmax - rmin);
    const col = colors[Math.floor(r() * colors.length)];
    for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
      if ((ox > 0 && x + rad < w) || (ox < 0 && x - rad > 0) || (oy > 0 && y + rad < h) || (oy < 0 && y - rad > 0)) continue;
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = alpha; g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  g.globalAlpha = 1;
}

// ---------- ciel : nuages, étoiles (texture équirectangulaire de l'hémisphère haut) ----------
function skyLayer(kind) {
  return canvasTex(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = rng(kind.length * 131 + 5);
    const wrap = (fn) => { for (const ox of [-w, 0, w]) fn(ox); };
    if (kind === 'night') {
      for (let i = 0; i < 1600; i++) {
        const x = r() * w, y = Math.pow(r(), 0.7) * h * 0.92, b = r();
        g.globalAlpha = 0.25 + b * 0.75; g.fillStyle = b > 0.93 ? '#cfe0ff' : '#ffffff';
        const s = b > 0.97 ? 2.2 : b > 0.8 ? 1.4 : 1;
        g.fillRect(x, y, s, s);
      }
      // voie lactée diffuse
      g.globalAlpha = 1;
      for (let i = 0; i < 70; i++) {
        const t = i / 70, x = t * w, y = h * (0.35 + 0.25 * Math.sin(t * Math.PI * 2));
        wrap((ox) => { const gr = g.createRadialGradient(x + ox, y, 0, x + ox, y, 40); gr.addColorStop(0, 'rgba(160,150,230,0.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x + ox - 40, y - 40, 80, 80); });
      }
      // halo orangé de la ville sur l'horizon
      const gr = g.createLinearGradient(0, h, 0, h * 0.72);
      gr.addColorStop(0, 'rgba(255,140,80,0.32)'); gr.addColorStop(1, 'rgba(255,140,80,0)');
      g.fillStyle = gr; g.fillRect(0, h * 0.72, w, h * 0.28);
    } else if (kind === 'sunset') {
      for (let i = 0; i < 46; i++) {
        const x = r() * w, y = h * (0.62 + r() * 0.36), len = 60 + r() * 220, th = 4 + r() * 10;
        wrap((ox) => {
          g.globalAlpha = 0.55 + r() * 0.3;
          const gr = g.createLinearGradient(0, y - th, 0, y + th);
          gr.addColorStop(0, '#ffd0a0'); gr.addColorStop(0.45, '#f08a7a'); gr.addColorStop(1, '#6a4570');
          g.fillStyle = gr; g.beginPath(); g.ellipse(x + ox, y, len, th, 0, 0, Math.PI * 2); g.fill();
        });
      }
    } else {
      for (let i = 0; i < 36; i++) {
        const cx = r() * w, cy = h * (0.55 + r() * 0.4), sc = 0.6 + r() * 1.1;
        const puffs = 6 + Math.floor(r() * 8);
        for (let k = 0; k < puffs; k++) {
          const x = cx + (r() - 0.5) * 90 * sc, y = cy - r() * 18 * sc, rad = (10 + r() * 18) * sc;
          wrap((ox) => {
            const gr = g.createRadialGradient(x + ox, y - rad * 0.3, rad * 0.2, x + ox, y, rad);
            gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.7, 'rgba(236,242,250,0.8)'); gr.addColorStop(1, 'rgba(200,214,230,0)');
            g.fillStyle = gr; g.beginPath(); g.arc(x + ox, y, rad, 0, Math.PI * 2); g.fill();
          });
        }
      }
    }
    g.globalAlpha = 1;
  });
}

// crête de montagnes : anneau de silhouettes à couleurs de sommet (perspective atmosphérique)
function ridgeGeo(cx, cz, radius, base, amp, seed, seg, mask) {
  const r = rng(seed);
  const waves = [2, 3, 5, 7, 11, 17, 29].map((k) => [k, r() * 6.28, 1 / Math.sqrt(k)]);
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    let n = 0;
    for (const [k, ph, w] of waves) n += Math.abs(Math.sin(k * a + ph)) * w;
    const hgt = mask && mask(a) ? -30 : base + amp * n / 2.2;
    const x = cx + Math.cos(a) * radius, z = cz + Math.sin(a) * radius;
    pos.push(x, -20, z, x, hgt, z);
    col.push(0, 0, 0, 1, 1, 1);
    if (i < seg) { const q = i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('weight', new THREE.Float32BufferAttribute(col.filter((_, i) => i % 3 === 0), 1));
  g.setIndex(idx);
  return g;
}

function buildWorld(scene, track, quality) {
  const T = THEMES[track.def.theme];
  const theme = T.decor || track.def.theme; // famille de décor
  const group = new THREE.Group();
  scene.add(group);
  const disposables = [];
  const keep = (o) => { disposables.push(o); return o; };
  const animated = []; // matériaux à uniform « time »

  // --- ciel
  const skyTex = keep(skyLayer(T.sky || theme));
  skyTex.minFilter = THREE.LinearFilter; skyTex.generateMipmaps = false; // pas de couture au raccord atan
  const skyMat = keep(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(T.skyTop) }, hor: { value: new THREE.Color(T.skyHorizon) }, bot: { value: new THREE.Color(T.skyBottom) },
      sunDir: { value: new THREE.Vector3(...T.sun).normalize() }, sunCol: { value: new THREE.Color(T.sunColor) }, sunSize: { value: T.sunSize },
      layer: { value: skyTex }, time: { value: 0 },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top, hor, bot, sunCol, sunDir; uniform float sunSize, time; uniform sampler2D layer; varying vec3 vP;
      void main(){ vec3 d = normalize(vP); float h = d.y; vec3 c = h > 0.0 ? mix(hor, top, pow(clamp(h,0.0,1.0), 0.55)) : mix(hor, bot, pow(clamp(-h*3.0,0.0,1.0),0.6));
      float s = dot(d, normalize(sunDir)); c += sunCol * (smoothstep(sunSize, 1.0, s) * 1.6 + pow(max(s,0.0), 16.0) * 0.35);
      if (h > 0.0) { vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5 + time * 0.0015, asin(clamp(h, 0.0, 1.0)) / 1.5707963);
        vec4 l = texture2D(layer, uv); c = mix(c, l.rgb * (0.75 + 0.35 * pow(max(s, 0.0), 4.0)), l.a * smoothstep(0.0, 0.04, h)); }
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  animated.push(skyMat);
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(1600, 32, 16)), skyMat);
  sky.renderOrder = -1; sky.userData.fixed = true;
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

  // --- sol (béton de quai, herbe de col, lave et herbe)
  const groundTex = keep(canvasTex(512, 512, (g, w, h) => {
    noiseFill(g, w, h, T.ground, T.groundSpeck, 3500, 3, 3);
    if (theme === 'night') {
      blotches(g, w, h, ['#3a3b44', '#22232a', '#454650'], 30, 40, 120, 0.35, 21);
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke(); }
    } else if (T.blotch) blotches(g, w, h, T.blotch, 46, 30, 110, 0.45, 22);
    else if (theme === 'sunset') blotches(g, w, h, ['#6b7a38', '#3d4a24', '#7a6a42', '#556b2f'], 46, 30, 110, 0.45, 22);
    else blotches(g, w, h, ['#3f5a2c', '#4f6b32', '#1f1c1b', '#3a3230'], 46, 30, 120, 0.5, 23);
  }, true));
  // relief : grille du terrain (track.terrain) autour de la piste, sol plat au-delà ; UV en mètres (une tuile ≈ 29 m)
  const ter = track.terrain;
  const groundMat = keep(new THREE.MeshLambertMaterial({ map: groundTex, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 }));
  {
    const { nx, nz, x0, z0, cell, h, dist } = ter;
    const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), idx = [];
    const ssw = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let gz = 0; gz < nz; gz++) for (let gx = 0; gx < nx; gx++) {
      const k = gz * nx + gx, x = x0 + gx * cell, z = z0 + gz * cell;
      // sous la route et les bas-côtés, le sol s'efface un peu plus bas : jamais de terre qui perce le bitume
      const drop = 0.28 * (1 - ssw(track.wall, track.wall + 10, dist[k]));
      const edge = gx === 0 || gz === 0 || gx === nx - 1 || gz === nz - 1;
      pos.set([x, edge ? -0.6 : h[k] - 0.12 - drop, z], k * 3);
      uv.set([x / 29, -z / 29], k * 2);
      if (gx < nx - 1 && gz < nz - 1) idx.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const relief = new THREE.Mesh(keep(g), groundMat);
    relief.receiveShadow = !!quality.shadows; relief.userData.fixed = true;
    group.add(relief);
    const fg = new THREE.PlaneGeometry(3200, 3200);
    const fuv = fg.attributes.uv; for (let k = 0; k < fuv.count; k++) fuv.setXY(k, fuv.getX(k) * 110, fuv.getY(k) * 110);
    const ground = new THREE.Mesh(keep(fg), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.62;
    ground.userData.fixed = true;
    group.add(ground);
  }

  // --- route : bitume à granulats, usure, fissures, rapiéçages, marquage selon le lieu
  const roadTex = keep(canvasTex(512, 1024, (g, w, h) => {
    noiseFill(g, w, h, T.road, '#6a6a72', 14000, 2.4, 5);
    blotches(g, w, h, ['rgba(0,0,0,1)', 'rgba(255,255,255,1)'], 26, 30, 110, 0.05, 31);
    const r = rng(41);
    // rapiéçages
    for (let i = 0; i < 4; i++) { g.globalAlpha = 0.18; g.fillStyle = r() > 0.5 ? '#1c1c20' : '#4a4a52'; g.fillRect(40 + r() * (w - 160), r() * h, 50 + r() * 90, 60 + r() * 140); }
    g.globalAlpha = 1;
    // fissures
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 30; y += 8 + r() * 18; g.lineTo(x, y); } g.stroke(); }
    // gomme : traînées des runs précédents
    g.globalAlpha = 0.16; g.fillStyle = '#050506';
    g.fillRect(w * 0.26, 0, w * 0.1, h); g.fillRect(w * 0.62, 0, w * 0.1, h);
    for (let i = 0; i < 6; i++) { g.globalAlpha = 0.08 + r() * 0.08; g.lineWidth = 10 + r() * 12; g.strokeStyle = '#050506'; g.beginPath(); const x0 = r() * w; g.moveTo(x0, 0); g.bezierCurveTo(x0 + (r() - 0.5) * 300, h * 0.33, x0 + (r() - 0.5) * 300, h * 0.66, x0, h); g.stroke(); }
    g.globalAlpha = 1;
    // lignes de rive
    g.fillStyle = T.line; g.fillRect(10, 0, 12, h); g.fillRect(w - 22, 0, 12, h);
    if (theme === 'sunset') { g.fillStyle = '#f2b51d'; g.fillRect(w / 2 - 13, 0, 9, h); g.fillRect(w / 2 + 4, 0, 9, h); }
    else if (theme === 'day') { g.fillStyle = T.line; for (let y = 0; y < h; y += 256) g.fillRect(w / 2 - 6, y, 12, 128); }
  }, true));
  roadTex.anisotropy = 8;
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
  const road = new THREE.Mesh(strip(-half, half, 0.01, 20), keep(new THREE.MeshStandardMaterial({ map: roadTex, roughness: theme === 'night' ? 0.62 : 0.9, metalness: theme === 'night' ? 0.08 : 0 })));
  road.receiveShadow = !!quality.shadows;
  group.add(road);
  const shTex = keep(canvasTex(128, 128, (g, w, h) => { noiseFill(g, w, h, T.shoulder, '#8a8478', 1400, 2, 9); blotches(g, w, h, ['rgba(0,0,0,1)'], 8, 10, 30, 0.12, 9); }, true));
  const shMat = keep(new THREE.MeshLambertMaterial({ map: shTex }));
  group.add(new THREE.Mesh(strip(-wall, -half, 0.005, 6), shMat));
  group.add(new THREE.Mesh(strip(half, wall, 0.005, 6), shMat));

  // --- vibreurs (là où ça tourne)
  const curbTex = keep(canvasTex(32, 64, (g, w, h) => { g.fillStyle = '#d42a2a'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f5f2ea'; g.fillRect(0, h / 2, w, h / 2); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, h / 2 - 2, w, 2); g.fillRect(0, h - 2, w, 2); }, true));
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

  // --- murs : béton à bande de danger (port), glissière galvanisée (col), béton peint (volcan)
  const words = ['SIDEWAYS', 'ドリフト', 'TOUGE CLUB', '974', 'NO GRIP', '横滑り', 'CLIP IT', 'KAIZEN'];
  const wallTex = keep(canvasTex(2048, 128, (g, w, h) => {
    const seg = w / 8;
    g.font = '900 52px "Dela Gothic One", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (theme === 'sunset') {
      // glissière en W : deux reflets, ombre, poteaux, réflecteurs
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#6d7076'); gr.addColorStop(0.18, '#e9ebee'); gr.addColorStop(0.32, '#9ea2a8'); gr.addColorStop(0.42, '#f3f4f6');
      gr.addColorStop(0.58, '#a5a9af'); gr.addColorStop(0.7, '#d9dce0'); gr.addColorStop(0.82, '#5c5f66'); gr.addColorStop(1, '#2c2e33');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 128) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, 0, 3, h); g.fillStyle = '#ff9a1e'; g.fillRect(x + 60, h * 0.44, 10, 10); }
      for (let i = 0; i < 8; i++) if (i % 3 === 1) { g.fillStyle = T.wallB; g.fillRect(i * seg + 20, 6, seg - 40, h * 0.34); g.fillStyle = '#fff'; g.fillText(words[i % words.length], i * seg + seg / 2, h * 0.2 + 3); }
    } else {
      noiseFill(g, w, h, theme === 'night' ? '#8d8b86' : '#cfd3d6', '#ffffff', 4000, 2.5, 13);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? T.wallA : T.wallB; g.globalAlpha = 0.92; g.fillRect(i * seg, h * 0.12, seg, h * 0.62); g.globalAlpha = 1;
        if (theme === 'night') { // bande de danger en chevrons
          g.save(); g.beginPath(); g.rect(i * seg, h * 0.74, seg, h * 0.14); g.clip();
          for (let x = i * seg - 40; x < (i + 1) * seg; x += 36) { g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(x, h * 0.88); g.lineTo(x + 18, h * 0.88); g.lineTo(x + 36, h * 0.74); g.lineTo(x + 18, h * 0.74); g.fill(); g.fillStyle = '#111'; }
          g.restore();
        }
        if (i % 2 === 1) { g.fillStyle = i % 4 === 1 ? T.wallText : T.wallA === '#ffffff' ? T.wallB : T.wallA; g.fillText(words[i % words.length], i * seg + seg / 2, h * 0.43 + 3); }
      }
      g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, h - 12, w, 12);
      for (let x = 0; x < w; x += 256) { g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x, 0, 3, h); }
    }
  }, true));
  const wallMat = keep(theme === 'sunset' ? new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.38, metalness: 0.55 }) : new THREE.MeshLambertMaterial({ map: wallTex }));
  const wallTop = keep(new THREE.MeshLambertMaterial({ color: theme === 'sunset' ? 0x60636a : 0x8b8b8f }));
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
    const chk = keep(canvasTex(128, 32, (g) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; g.fillRect(x * 8, y * 8, 8, 8); } }));
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
    const face = new THREE.Mesh(keep(new THREE.PlaneGeometry(span, 1.4)), keep(new THREE.MeshBasicMaterial({ map: banTex, fog: true })));
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
  const tireSpots = [];
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
    const pm = markMats[z.type];
    const at = z.type === 'outer' ? [z.from, z.to] : [z.mid];
    for (const q of at) {
      const off = z.type === 'outer' ? z.side * (wall - 0.4) : z.side * (half + 0.9);
      const x = px[q] - tz[q] * off, zz = pz[q] + tx[q] * off;
      const pole = new THREE.Mesh(poleGeo, pm); pole.position.set(x, 1.2, zz); markGroup.add(pole);
      const fl = new THREE.Mesh(flagGeo, pm); fl.position.set(x, 2.6, zz); fl.rotation.x = Math.PI; markGroup.add(fl);
    }
    if (z.type === 'outer') {
      // piles de pneus derrière le mur extérieur
      for (let q = z.from, n = 0; n < 60 && q !== z.to; q = (q + 1) % N, n++) if (n % 4 === 0) tireSpots.push([q, z.side]);
    }
    zoneMeshes.push({ zone: z, mat });
  }
  mergeByMaterial(markGroup, keep, []);
  group.add(markGroup);

  // --- décor : outils
  const R = rng(track.def.id.length * 977 + 13);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < N; i++) { minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]); minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]); }
  const cxW = (minX + maxX) / 2, czW = (minZ + maxZ) / 2;
  function clearOf(x, z, d) {
    const d2 = d * d;
    for (let i = 0; i < N; i += 2) { const dx = x - px[i], dz = z - pz[i]; if (dx * dx + dz * dz < d2) return false; }
    return true;
  }
  const reserved = []; // [x, z, rayon] : tribune, torii… rien n'y pousse
  function scatter(count, minD, pad, accept) {
    const out = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 30) {
      const x = minX - pad + R() * (maxX - minX + pad * 2), z = minZ - pad + R() * (maxZ - minZ + pad * 2);
      if (reserved.some(([rx, rz, rr]) => (x - rx) ** 2 + (z - rz) ** 2 < rr * rr)) continue;
      if ((!accept || accept(x, z)) && clearOf(x, z, minD)) out.push([x, z]);
    }
    return out;
  }
  const dummy = new THREE.Object3D();
  const tmpCol = new THREE.Color();
  function instanced(geo, mat, list, setup, colors) {
    const m = new THREE.InstancedMesh(keep(geo), keep(mat), list.length);
    list.forEach((p, i) => {
      dummy.position.set(p[0], 0, p[1]); dummy.rotation.set(0, R() * Math.PI * 2, 0); dummy.scale.set(1, 1, 1);
      setup && setup(dummy, i, m); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
      if (colors) m.setColorAt(i, tmpCol.setHex(colors[Math.floor(R() * colors.length)]));
    });
    m.instanceMatrix.needsUpdate = true;
    if (colors) m.instanceColor.needsUpdate = true;
    group.add(m);
    return m;
  }
  // placement le long de la piste, au-delà du mur
  const along = (i, side, d) => { const nx = -tz[i] * side, nz = tx[i] * side; return [px[i] + nx * (wall + d), pz[i] + nz * (wall + d), Math.atan2(nx, nz)]; };
  const dens = quality.scenery;
  const standAt = [Math.round(28 / track.step) % N, theme === 'night' ? 1 : -1];
  const toriiAt = Math.round(60 / track.step) % N;
  { const [x, z] = along(standAt[0], standAt[1], 10); reserved.push([x, z, 24]); }
  if (theme === 'sunset') { const [x, z] = along(toriiAt, 1, 6); reserved.push([x, z, 13]); const [vx, vz] = along((toriiAt + 8) % N, 1, 3); reserved.push([vx, vz, 5]); }

  // piles de pneus peints (toutes pistes)
  if (tireSpots.length) {
    const tg = new THREE.TorusGeometry(0.42, 0.17, 6, 12); tg.rotateX(Math.PI / 2);
    const list = [];
    for (const [q, side] of tireSpots) for (let h = 0; h < 3; h++) list.push([q, side, h]);
    instanced(tg, new THREE.MeshLambertMaterial({ color: 0xffffff }), list.map(([q, side]) => along(q, side, 0.7)), (d, i) => {
      d.position.y = 0.17 + list[i][2] * 0.32; d.rotation.set(0, 0, 0);
    }, [0x1a1a1c, 0x1a1a1c, 0xf2f2f2, 0xd8262d, 0xffd23f]);
  }

  // tribune de spectateurs le long de la ligne droite de départ
  {
    const [i, side] = standAt;
    const [sx, sz, rot] = along(i, side, 7);
    const stand = new THREE.Group();
    const stepsMat = keep(new THREE.MeshLambertMaterial({ color: 0x5b5d66 }));
    const crowdTex = keep(canvasTex(512, 64, (g, w, h) => {
      g.fillStyle = '#2a2a30'; g.fillRect(0, 0, w, h);
      const r = rng(77);
      const cols = ['#e8352f', '#ffd23f', '#f3efe4', '#1d76c2', '#2f9a5a', '#ef7fa6', '#ff6a1a', '#111', '#6b3fd1'];
      for (let row = 0; row < 4; row++) for (let x = 4; x < w; x += 7 + r() * 4) {
        const y = 10 + row * 15 + (r() - 0.5) * 3;
        g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x - 2.5, y, 5, 7);
        g.fillStyle = ['#f1c9a5', '#c68a5f', '#8a5a3a', '#e8b98f'][Math.floor(r() * 4)]; g.beginPath(); g.arc(x, y - 2, 2.4, 0, 7); g.fill();
      }
    }));
    const crowdMat = keep(new THREE.MeshLambertMaterial({ map: crowdTex }));
    const len = 34;
    for (let s = 0; s < 4; s++) {
      const step = new THREE.Mesh(keep(new THREE.BoxGeometry(len, 0.8 + s * 0.8, 1.4)), stepsMat);
      step.position.set(0, (0.8 + s * 0.8) / 2, s * 1.4); stand.add(step);
      const crowd = new THREE.Mesh(keep(new THREE.PlaneGeometry(len - 1, 0.9)), crowdMat);
      crowd.position.set(0, 0.8 + s * 0.8 + 0.45, s * 1.4 - 0.2); crowd.rotation.y = Math.PI; stand.add(crowd);
    }
    const roof = new THREE.Mesh(keep(new THREE.BoxGeometry(len + 2, 0.25, 7)), stepsMat); roof.position.set(0, 6.4, 2.2); roof.rotation.x = -0.08; stand.add(roof);
    for (const x of [-len / 2, 0, len / 2]) { const p = new THREE.Mesh(keep(new THREE.BoxGeometry(0.3, 6.4, 0.3)), stepsMat); p.position.set(x, 3.2, 5.4); stand.add(p); }
    stand.position.set(sx, 0, sz);
    stand.rotation.y = rot; // les gradins montent en s'éloignant de la piste
    mergeByMaterial(stand, keep, []);
    group.add(stand);
  }

  // panneaux de virage (chevrons) à l'extérieur des courbes : col et volcan
  if (theme !== 'night') {
    const chevTex = keep(canvasTex(128, 64, (g, w, h) => {
      g.fillStyle = theme === 'sunset' ? '#ffd23f' : '#f4f4f4'; g.fillRect(0, 0, w, h);
      g.fillStyle = theme === 'sunset' ? '#111' : '#d42a2a';
      for (const x of [18, 58]) { g.beginPath(); g.moveTo(x, 6); g.lineTo(x + 26, h / 2); g.lineTo(x, h - 6); g.lineTo(x + 14, h - 6); g.lineTo(x + 40, h / 2); g.lineTo(x + 14, 6); g.fill(); }
      g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    }));
    const signs = [];
    for (const z of track.zones) if (z.type === 'outer') for (let k = 0; k < 3; k++) {
      const q = (z.from + Math.round((k / 2) * ((z.to - z.from + N) % N))) % N;
      const [x, zz] = along(q, z.side, 2.2); // derrière les piles de pneus
      // le panneau regarde le pilote qui arrive ; la flèche indique le sens du virage
      signs.push({ x, z: zz, h: Math.atan2(tx[q], tz[q]) + Math.PI, flip: z.side > 0 });
    }
    if (signs.length) {
      const board = new THREE.PlaneGeometry(1.6, 0.8); board.translate(0, 1.7, 0);
      const bm = new THREE.InstancedMesh(keep(board), keep(new THREE.MeshLambertMaterial({ map: chevTex, side: THREE.DoubleSide })), signs.length);
      const pg = new THREE.CylinderGeometry(0.05, 0.05, 1.3, 5); pg.translate(0, 0.65, 0);
      const pmI = new THREE.InstancedMesh(keep(pg), keep(new THREE.MeshLambertMaterial({ color: 0x55575c })), signs.length);
      signs.forEach((s, i) => {
        // virage à gauche : on montre le dos du panneau (double face), la flèche apparaît inversée
        dummy.position.set(s.x, 0, s.z); dummy.rotation.set(0, s.h + (s.flip ? Math.PI : 0), 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); bm.setMatrixAt(i, dummy.matrix);
        pmI.setMatrixAt(i, dummy.matrix);
      });
      group.add(bm); group.add(pmI);
    }
  }

  // lampadaires le long des murs (lumière simulée au sol la nuit)
  if (T.lamps) {
    const lamps = [];
    for (let i = 0; i < N; i += Math.round(34 / track.step)) lamps.push([i, (Math.floor(i / 20) % 2) ? 1 : -1]);
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
    const poolTex = keep(canvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,190,110,0.85)'); gr.addColorStop(0.5, 'rgba(255,160,80,0.28)'); gr.addColorStop(1, 'rgba(255,140,60,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }));
    poolTex.encoding = THREE.LinearEncoding;
    const pool = new THREE.InstancedMesh(keep(new THREE.PlaneGeometry(16, 16)), keep(new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })), lamps.length);
    lamps.forEach(([i, side], n) => {
      const nx = -tz[i] * side, nz = tx[i] * side;
      dummy.position.set(px[i] + nx * (wall - 2.2), 0.12, pz[i] + nz * (wall - 2.2));
      dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); pool.setMatrixAt(n, dummy.matrix);
    });
    pool.renderOrder = 1;
    group.add(pool);
  }

  // eau animée (port la nuit, océan le jour)
  function water(w, d, x, z, deep, shallow, sparkle) {
    const mat = keep(new THREE.ShaderMaterial({
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 }, deep: { value: new THREE.Color(deep) }, shallow: { value: new THREE.Color(shallow) }, spark: { value: sparkle }, sunDir: { value: new THREE.Vector3(...T.sun).normalize() }, sunCol: { value: new THREE.Color(T.sunColor) } }]),
      vertexShader: `varying vec3 vW; varying vec2 vUv;
        #include <fog_pars_vertex>
        void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform float time, spark; uniform vec3 deep, shallow, sunDir, sunCol; varying vec3 vW; varying vec2 vUv;
        #include <fog_pars_fragment>
        void main(){
          float w1 = sin(vW.x * 0.09 + time * 0.9) * cos(vW.z * 0.07 - time * 0.7);
          float w2 = sin(vW.x * 0.31 - vW.z * 0.23 + time * 1.7) * 0.5;
          float wave = w1 + w2;
          vec3 c = mix(deep, shallow, clamp(0.5 + wave * 0.25, 0.0, 1.0) * smoothstep(1.0, 0.0, vUv.y));
          float glint = pow(max(0.0, sin(vW.x * 0.6 + time * 2.3) * sin(vW.z * 0.53 - time * 1.9) * (0.6 + 0.4 * wave)), 12.0);
          c += sunCol * glint * spark;
          gl_FragColor = vec4(c, 1.0);
          #include <fog_fragment>
        }`,
    }));
    animated.push(mat);
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, d)), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, -0.05, z);
    m.userData.fixed = true;
    group.add(m);
    return m;
  }

  if (theme === 'night') {
    // --- port de Minato : conteneurs ondulés, portiques, entrepôts éclairés, darse
    const contTex = keep(canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 6) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x + 3, 0, 1, h); }
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 5, w, 5);
      g.font = '900 20px "Arial Black", sans-serif'; g.fillStyle = 'rgba(255,255,255,.85)'; g.textAlign = 'center'; g.fillText('SDC LINES', w / 2, h / 2 + 7);
    }));
    const cols = [0xc0392b, 0x1f6fb2, 0x2e8b57, 0xe0a526, 0x7a3fb0, 0xd35400, 0x5d6d7e, 0x8e2b2b];
    const spots = scatter(Math.round(170 * dens), track.wall + 9, 70, (x, z) => z > minZ - 25);
    instanced(new THREE.BoxGeometry(12, 2.6, 2.5), new THREE.MeshLambertMaterial({ map: contTex }), spots, (d) => {
      const lvl = R(); d.position.y = 1.3 + (lvl < 0.3 ? 2.6 : 0) + (lvl < 0.08 ? 2.6 : 0);
      d.rotation.y = Math.round(R() * 4) * Math.PI / 2 + (R() - 0.5) * 0.1;
    }, cols);
    // portiques de quai
    const craneMat = keep(new THREE.MeshLambertMaterial({ color: 0xd9822b }));
    const cabMat = keep(new THREE.MeshLambertMaterial({ color: 0xe8e4da }));
    const redMat = keep(new THREE.MeshBasicMaterial({ color: 0xff3030 }));
    const cranes = scatter(5, track.wall + 26, 40, (x, z) => z > minZ - 20);
    const craneGroup = new THREE.Group();
    const box = (g, w, h, d, x, y, z, m, rz) => { const b = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), m); b.position.set(x, y, z); if (rz) b.rotation.z = rz; g.add(b); };
    for (const [x, z] of cranes) {
      const g = new THREE.Group();
      for (const [a, b] of [[-6, -5], [6, -5], [-6, 5], [6, 5]]) box(g, 1.2, 34, 1.2, a, 17, b, craneMat);
      for (const y of [10, 22]) for (const b of [-5, 5]) box(g, 13, 0.8, 0.8, 0, y, b, craneMat);
      for (const a of [-6, 6]) box(g, 0.8, 0.8, 11, a, 30, 0, craneMat);
      box(g, 66, 1.6, 1.6, 12, 34, -1.2, craneMat); box(g, 66, 1.6, 1.6, 12, 34, 1.2, craneMat);
      for (let k = -18; k <= 42; k += 6) box(g, 0.35, 3.6, 0.35, k, 35.8, 0, craneMat, k % 12 ? 0.6 : -0.6);
      box(g, 66, 0.6, 3, 12, 37.8, 0, craneMat);
      box(g, 4, 3, 3, 4, 31.5, 0, cabMat);
      box(g, 0.15, 14, 0.15, 26, 26, 0, cabMat);
      const red = new THREE.Mesh(keep(new THREE.SphereGeometry(0.6, 8, 6)), redMat); red.position.set(44, 39, 0); g.add(red);
      g.position.set(x, 0, z); g.rotation.y = R() * Math.PI;
      g.updateMatrix();
      for (const c of [...g.children]) { c.updateMatrix(); c.matrix.premultiply(g.matrix); c.matrix.decompose(c.position, c.quaternion, c.scale); craneGroup.add(c); }
    }
    mergeByMaterial(craneGroup, keep, []);
    group.add(craneGroup);
    // entrepôts : bardage + fenêtres éclairées
    const whTex = keep(canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#4a4d56'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, 0, 3, h); }
      g.fillStyle = '#1a1b20'; for (let x = 12; x < w; x += 28) g.fillRect(x, 18, 18, 14);
      g.fillStyle = '#2a2b30'; g.fillRect(w * 0.35, h * 0.45, w * 0.3, h * 0.55);
    }));
    const whEm = keep(canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      const r = rng(5);
      for (let x = 12; x < w; x += 28) if (r() > 0.3) { g.fillStyle = r() > 0.5 ? '#ffd38a' : '#cfe6ff'; g.fillRect(x, 18, 18, 14); }
    }));
    const whs = scatter(Math.round(14 * dens) + 4, track.wall + 30, 90, (x, z) => z > minZ - 20);
    instanced(new THREE.BoxGeometry(36, 12, 22).translate(0, 6, 0), new THREE.MeshLambertMaterial({ map: whTex, emissive: 0xffffff, emissiveMap: whEm }), whs, (d) => { const s = 0.8 + R() * 0.6; d.scale.set(s, 0.8 + R() * 0.5, s); });
    // darse
    water(2600, 700, cxW, minZ - 25 - 350, 0x060914, 0x16203a, 0.7);
    // ligne d'horizon de la ville : tours aux fenêtres allumées
    const winTex = keep(canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#08080f'; g.fillRect(0, 0, w, h);
      const r = rng(9);
      // étages entiers allumés ou éteints : des bandes lisibles plutôt qu'un bruit de pixels
      for (let y = 0; y < h; y += 8) {
        const lit = r() < 0.55 ? 0.15 : 0.85, warm = r() > 0.3;
        for (let x = 0; x < w; x += 8) if (r() < lit) { g.globalAlpha = 0.6 + r() * 0.4; g.fillStyle = warm ? '#ffcf7a' : '#bcd8ff'; g.fillRect(x + 1, y + 2, 6, 4); }
      }
      g.globalAlpha = 1;
    }, true));
    const towers = [];
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2 + R() * 0.05, rr = 820 + R() * 180;
      const w = 22 + R() * 34, hgt = 40 + Math.pow(R(), 2) * 190;
      const gb = new THREE.BoxGeometry(w, hgt, w * (0.6 + R() * 0.6));
      const uvA = gb.attributes.uv; for (let k = 0; k < uvA.count; k++) uvA.setXY(k, uvA.getX(k) * w / 24, uvA.getY(k) * hgt / 24);
      gb.translate(0, hgt / 2 - 5, 0); gb.rotateY(-a); gb.translate(cxW + Math.cos(a) * rr, 0, czW + Math.sin(a) * rr);
      towers.push(gb);
    }
    const sky = new THREE.Mesh(keep(mergeGeos(towers)), keep(new THREE.MeshBasicMaterial({ map: winTex, fog: false, color: 0x9a92bc })));
    sky.userData.fixed = true;
    group.add(sky);
  } else if (theme === 'sunset') {
    // --- col d'Akane : pins, érables rouges, torii, lanternes, distributeurs, poteaux électriques
    const spots = scatter(Math.round(380 * dens), track.wall + 4, 120);
    const pine = (() => {
      const parts = [];
      for (let k = 0; k < 4; k++) {
        const c = new THREE.ConeGeometry(2.8 - k * 0.55, 3.6, 8, 1);
        const pa = c.attributes.position;
        for (let v = 0; v < pa.count; v++) if (pa.getY(v) < 0 && v % 2) { pa.setX(v, pa.getX(v) * 0.78); pa.setZ(v, pa.getZ(v) * 0.78); }
        c.translate(0, 3.6 + k * 2.1, 0); parts.push(c);
      }
      return mergeGeos(parts);
    })();
    const maple = (() => { const g = new THREE.IcosahedronGeometry(3, 1); const pa = g.attributes.position; const r = rng(3); for (let v = 0; v < pa.count; v++) pa.setXYZ(v, pa.getX(v) * (0.85 + r() * 0.3), pa.getY(v) * (0.7 + r() * 0.25), pa.getZ(v) * (0.85 + r() * 0.3)); g.translate(0, 5.2, 0); return g; })();
    const kinds = spots.map(() => R() < 0.32);
    const pines = spots.filter((_, i) => !kinds[i]), maples = spots.filter((_, i) => kinds[i]);
    const sc = (d) => { const s = 0.7 + R() * 0.9; d.scale.set(s, s * (0.9 + R() * 0.3), s); };
    const trunk = new THREE.CylinderGeometry(0.25, 0.38, 3.4, 5); trunk.translate(0, 1.7, 0);
    instanced(trunk, new THREE.MeshLambertMaterial({ color: 0x4a3326 }), spots, sc);
    instanced(pine, new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 0 }), pines, sc, T.pines || [0x2f5a3a, 0x3c6e45, 0x28503a, 0x456f3e]);
    instanced(maple, new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 0 }), maples, sc, T.maples || [0xc8352a, 0xe0612b, 0xd9902e, 0xb02a3a, 0xe8b13a]);
    // rochers de falaise
    const rocks = scatter(Math.round(60 * dens), track.wall + 5, 60);
    instanced(new THREE.DodecahedronGeometry(2.2, 0), new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 2 }), rocks, (d) => { const s = 0.6 + R() * 1.8; d.scale.set(s * 1.3, s, s); d.position.y = s * 0.5; }, [0x6b6460, 0x7d7268, 0x5a5452]);
    // torii et lanternes près du départ
    {
      const i = toriiAt;
      const [x, z, rot] = along(i, 1, 6);
      const tg = new THREE.Group();
      const red = keep(new THREE.MeshLambertMaterial({ color: 0xd2321e })), blk = keep(new THREE.MeshLambertMaterial({ color: 0x1a1a1a })), stone = keep(new THREE.MeshLambertMaterial({ color: 0x9a948a }));
      for (const s of [-1, 1]) { const p = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.35, 0.42, 7, 10)), red); p.position.set(s * 3.2, 3.5, 0); tg.add(p); const b = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 10)), blk); b.position.set(s * 3.2, 0.25, 0); tg.add(b); }
      const nuki = new THREE.Mesh(keep(new THREE.BoxGeometry(8, 0.45, 0.4)), red); nuki.position.y = 5.6; tg.add(nuki);
      const kasa = new THREE.Mesh(keep(new THREE.BoxGeometry(9.6, 0.5, 0.7)), blk); kasa.position.y = 7.15; tg.add(kasa);
      const sh = new THREE.Mesh(keep(new THREE.BoxGeometry(9.2, 0.45, 0.6)), red); sh.position.y = 6.75; tg.add(sh);
      for (const s of [-1, 1]) { const up = new THREE.Mesh(keep(new THREE.BoxGeometry(1.2, 0.4, 0.7)), blk); up.position.set(s * 4.9, 7.35, 0); up.rotation.z = s * 0.3; tg.add(up); }
      for (const s of [-1, 1]) {
        const lx = s * 6.5;
        for (const [w, h, y] of [[0.9, 0.4, 0.2], [0.35, 1.0, 0.9], [0.8, 0.25, 1.5], [0.6, 0.6, 1.9], [1.0, 0.25, 2.3], [0.3, 0.3, 2.6]]) { const b = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, w)), stone); b.position.set(lx, y, 0); tg.add(b); }
      }
      tg.position.set(x, 0, z); tg.rotation.y = rot;
      mergeByMaterial(tg, keep, []);
      group.add(tg);
      // distributeurs de boissons (ils éclairent le bas-côté)
      const vmTex = keep(canvasTex(64, 128, (g, w, h) => {
        g.fillStyle = '#e9f4ff'; g.fillRect(0, 0, w, h);
        const c = ['#e8352f', '#1d76c2', '#2f9a5a', '#ffd23f', '#ff6a1a', '#6b3fd1'];
        for (let r2 = 0; r2 < 3; r2++) for (let k = 0; k < 6; k++) { g.fillStyle = c[(k + r2) % 6]; g.fillRect(5 + k * 9, 14 + r2 * 22, 6, 14); }
        g.fillStyle = '#222'; g.fillRect(6, 86, w - 12, 30); g.fillStyle = '#e8352f'; g.fillRect(0, 0, w, 8);
      }));
      const [vx, vz, vr] = along((i + 8) % N, 1, 3);
      for (const k of [0, 1]) {
        const vm = new THREE.Mesh(keep(new THREE.BoxGeometry(1, 1.9, 0.8)), keep(new THREE.MeshLambertMaterial({ color: 0xffffff, map: vmTex, emissive: 0xaaccff, emissiveMap: vmTex, emissiveIntensity: 0.55 })));
        vm.position.set(vx + Math.cos(vr) * k * 1.1, 0.95, vz - Math.sin(vr) * k * 1.1); vm.rotation.y = vr + Math.PI;
        group.add(vm);
      }
    }
    // poteaux électriques + câbles
    {
      const poles = [];
      for (let i = 0; i < N; i += Math.round(42 / track.step)) poles.push(along(i, -1, 5));
      const pg = new THREE.CylinderGeometry(0.16, 0.22, 10, 6); pg.translate(0, 5, 0);
      const arm = new THREE.BoxGeometry(2.4, 0.15, 0.15); arm.translate(0, 9.2, 0);
      const pm2 = new THREE.MeshLambertMaterial({ color: 0x5b5148 });
      instanced(mergeGeos([pg, arm]), pm2, poles.map(([x, z]) => [x, z]), (d, i) => d.rotation.set(0, poles[i][2], 0));
      const lp = [];
      for (let k = 0; k < poles.length; k++) {
        const a = poles[k], b = poles[(k + 1) % poles.length];
        for (const o of [-1, 1]) {
          const ax = a[0] + Math.cos(a[2]) * o, az = a[1] - Math.sin(a[2]) * o, bx = b[0] + Math.cos(b[2]) * o, bz = b[1] - Math.sin(b[2]) * o;
          for (let s = 0; s < 6; s++) { const t0 = s / 6, t1 = (s + 1) / 6; const sag = (t) => 9.2 - Math.sin(t * Math.PI) * 0.9; lp.push(ax + (bx - ax) * t0, sag(t0), az + (bz - az) * t0, ax + (bx - ax) * t1, sag(t1), az + (bz - az) * t1); }
        }
      }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      group.add(new THREE.LineSegments(keep(lg), keep(new THREE.LineBasicMaterial({ color: 0x1c1a20 }))));
    }
  } else {
    // --- Piton Volcan : palmiers courbes, champs de cannes, basalte, océan animé, volcan fumant
    const spots = scatter(Math.round(170 * dens), track.wall + 4, 90, (x, z) => z < maxZ + 60);
    const trunkCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.2, 4.5, 0), new THREE.Vector3(1.5, 8.4, 0));
    const trunk = new THREE.TubeGeometry(trunkCurve, 8, 0.26, 6, false);
    const fronds = [];
    for (let k = 0; k < 9; k++) {
      const f = new THREE.PlaneGeometry(4.6, 0.9, 6, 1);
      const pa = f.attributes.position;
      for (let v = 0; v < pa.count; v++) { const x = pa.getX(v) + 2.3, y = pa.getY(v); pa.setXYZ(v, x, -0.09 * x * x + Math.abs(y) * 0.5, y * (1 - x / 6)); }
      f.rotateY((k / 9) * Math.PI * 2 + (k % 2) * 0.2); f.translate(1.5, 8.4, 0);
      fronds.push(f);
    }
    const sc = (d) => { const s = 0.75 + R() * 0.6; d.scale.set(s, s, s); };
    instanced(trunk, new THREE.MeshLambertMaterial({ color: 0x7a5a3c }), spots, sc);
    instanced(mergeGeos(fronds), new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide, flatShading: true, shininess: 0 }), spots, sc, [0x2f8a3e, 0x3b9a47, 0x2a7a3a, 0x4a9a3a]);
    const rocks = scatter(Math.round(140 * dens), track.wall + 3, 90);
    instanced(new THREE.DodecahedronGeometry(1.6, 0), new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 4 }), rocks, (d) => { const s = 0.5 + R() * 1.6; d.scale.set(s * 1.4, s * 0.8, s); d.position.y = s * 0.3; }, [0x24221f, 0x2e2a26, 0x1b1a19]);
    // champs de cannes à sucre (974)
    const caneTex = keep(canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#6f9a3a'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(30,60,20,.45)'; g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(220,230,140,.25)'; g.fillRect(x + 4, 0, 2, h); }
      g.fillStyle = 'rgba(200,210,120,.5)'; g.fillRect(0, 0, w, 10);
    }, true));
    const fields = scatter(Math.round(10 * dens) + 3, track.wall + 22, 80, (x, z) => z < maxZ + 40);
    instanced(new THREE.BoxGeometry(34, 2.4, 22).translate(0, 1.1, 0), new THREE.MeshLambertMaterial({ map: caneTex }), fields, (d) => { d.scale.set(0.7 + R() * 0.6, 0.9 + R() * 0.3, 0.7 + R() * 0.6); });
    // plage + océan
    const beach = new THREE.Mesh(keep(new THREE.PlaneGeometry(4000, 70)), keep(new THREE.MeshLambertMaterial({ color: 0x3a3532 })));
    beach.rotation.x = -Math.PI / 2; beach.position.set(cxW, -0.08, maxZ + 100);
    beach.userData.fixed = true;
    group.add(beach);
    water(4000, 1600, cxW, maxZ + 935, 0x0c4f7a, 0x2fa3c4, 1.6);
    // volcan bouclier fumant
    {
      const prof = [[0, 310], [70, 330], [95, 352], [120, 345], [330, 230], [620, 80], [900, -10]].map(([r2, y]) => new THREE.Vector2(r2, y));
      const vg = new THREE.LatheGeometry(prof, 40);
      const col = new Float32Array(vg.attributes.position.count * 3);
      for (let v = 0; v < vg.attributes.position.count; v++) {
        const y = vg.attributes.position.getY(v), k = Math.max(0, Math.min(1, y / 350));
        tmpCol.setHex(0x4f7a4a).lerp(new THREE.Color(0x5a3e32), Math.min(1, k * 1.6)).lerp(new THREE.Color(0x221c1a), Math.max(0, k - 0.6) * 2.4);
        col.set([tmpCol.r, tmpCol.g, tmpCol.b], v * 3);
      }
      vg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const volc = new THREE.Mesh(keep(vg), keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
      volc.position.set(cxW - 300, -20, czW - 1050);
      volc.userData.fixed = true;
      group.add(volc);
      // panache
      const puffTex = keep(canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }));
      const pts = [];
      for (let k = 0; k < 14; k++) pts.push(volc.position.x + k * 9 + (R() - 0.5) * 30, 360 + k * 26, volc.position.z + (R() - 0.5) * 30);
      const pgm = new THREE.BufferGeometry(); pgm.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const plume = new THREE.Points(keep(pgm), keep(new THREE.PointsMaterial({ map: puffTex, size: 140, color: 0xe8e6e2, transparent: true, opacity: 0.55, depthWrite: false, fog: false })));
      plume.userData.fixed = true;
      group.add(plume);
    }
  }

  // --- crêtes lointaines (2 anneaux) : silhouettes en dégradé, sans brouillard
  {
    const ridgeMat = (bottom, topC) => keep(new THREE.ShaderMaterial({
      fog: false, side: THREE.DoubleSide,
      uniforms: { a: { value: new THREE.Color(bottom) }, b: { value: new THREE.Color(topC) }, hor: { value: new THREE.Color(T.fog) } },
      vertexShader: 'attribute float weight; varying float vW; varying float vY; void main(){ vW = weight; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 a, b, hor; varying float vW; varying float vY; void main(){ vec3 c = mix(a, b, vW); c = mix(hor, c, smoothstep(-10.0, 60.0, vY) * 0.85 + 0.15); gl_FragColor = vec4(c, 1.0); }',
    }));
    const sea = theme === 'day' ? (a) => Math.sin(a) > 0.3 : null; // pas de montagne côté océan
    for (const [r, base, amp, seed, seg, k] of [[1250, 90, 260, 1, 160, 0], [980, 30, theme === 'night' ? 90 : 170, 2, 140, 1]]) {
      const m = new THREE.Mesh(keep(ridgeGeo(cxW, czW, r, base, amp, track.def.id.length * 7 + seed, seg, sea)), ridgeMat(T.ridge[k], T.ridgeTop[k]));
      m.userData.fixed = true;
      group.add(m);
    }
  }

  // --- relief : tout ce qui n'est pas fixe (ciel, eau, lointain, sol) se pose sur le terrain.
  // Groupes (tribune, portique, torii) : déplacés d'un bloc. Maillages simples : chaque sommet suit le sol
  // (route, murs, vibreurs, zones, câbles épousent la pente). Instances : chacune à la hauteur de son pied.
  {
    const _m = new THREE.Matrix4();
    const done = new Set();
    for (const o of group.children) {
      if (o.userData.fixed || o.isLight || o === sun.target) continue;
      if (o.isInstancedMesh) {
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, _m); const e = _m.elements; e[13] += ter.at(e[12], e[14]); o.setMatrixAt(i, _m); }
        o.instanceMatrix.needsUpdate = true;
      } else if (o.isMesh || o.isLineSegments) {
        if (done.has(o.geometry)) continue;
        done.add(o.geometry);
        o.updateMatrix();
        o.geometry.applyMatrix4(o.matrix);
        o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
        const p = o.geometry.attributes.position;
        for (let v = 0; v < p.count; v++) p.setY(v, p.getY(v) + ter.at(p.getX(v), p.getZ(v)));
        p.needsUpdate = true;
        o.geometry.computeBoundingSphere();
      } else o.position.y += ter.at(o.position.x, o.position.z);
    }
  }

  function update(t) {
    for (const m of animated) m.uniforms.time.value = t;
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
  return { group, sun, theme: T, update, dispose, skyMat, heightAt: ter.at };
}
