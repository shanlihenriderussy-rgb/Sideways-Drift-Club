// ===== Modèles de voitures procéduraux (profil latéral extrudé) =====
const PAINTS = [
  { id: 'panda', name: 'Blanc Panda', hex: 0xf1efe9 },
  { id: 'tofu', name: 'Noir Tofu', hex: 0x17171b },
  { id: 'rouge', name: 'Rouge Akane', hex: 0xc8262d },
  { id: 'jaune', name: 'Jaune Kanji', hex: 0xf3b81f },
  { id: 'bleu', name: 'Bleu Lagon', hex: 0x1d76c2 },
  { id: 'vert', name: 'Vert Midori', hex: 0x2f9a5a },
  { id: 'rose', name: 'Rose Sakura', hex: 0xef7fa6 },
  { id: 'violet', name: 'Violet Néon', hex: 0x6b3fd1 },
];
const RIMS = [
  { id: 'bronze', name: 'Bronze', hex: 0xb07a3a },
  { id: 'chrome', name: 'Chrome', hex: 0xd8dde3 },
  { id: 'noir', name: 'Noir mat', hex: 0x222226 },
  { id: 'or', name: 'Or', hex: 0xd9b23a },
];

const BODY_DEFS = {
  hachi: { fa: 1.12, ra: -1.18, width: 1.66, nose: 0.96, tail: 0.9, hood: 0.8, cowl: 0.88, deck: 0.92, roof: 1.33, wsTop: 1.0, roofBack: 0.25, hatch: true, popup: true, wing: 'lip' },
  kouki: { fa: 1.22, ra: -1.3, width: 1.74, nose: 1.02, tail: 0.86, hood: 0.72, cowl: 0.86, deck: 0.92, roof: 1.3, wsTop: 1.35, roofBack: 0.55, hatch: false, popup: false, wing: 'gt' },
  raijin: { fa: 1.3, ra: -1.36, width: 1.8, nose: 1.12, tail: 0.88, hood: 0.66, cowl: 0.84, deck: 0.94, roof: 1.27, wsTop: 1.5, roofBack: 0.15, hatch: true, popup: false, wing: 'hoop' },
};

function makeLiveryTexture(paintHex, number, dark) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 96);
  const accent = dark ? '#ffd23f' : '#16161a';
  g.fillStyle = accent;
  g.beginPath(); g.moveTo(0, 62); g.lineTo(512, 40); g.lineTo(512, 52); g.lineTo(0, 76); g.closePath(); g.fill();
  g.fillStyle = '#e8352f';
  g.beginPath(); g.moveTo(0, 80); g.lineTo(512, 58); g.lineTo(512, 64); g.lineTo(0, 86); g.closePath(); g.fill();
  // rond de numéro
  g.fillStyle = '#f7f4ec'; g.beginPath(); g.arc(250, 44, 34, 0, Math.PI * 2); g.fill();
  g.lineWidth = 5; g.strokeStyle = '#16161a'; g.stroke();
  g.fillStyle = '#16161a'; g.font = '900 40px "Dela Gothic One", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(number), 250, 47);
  g.font = '700 18px "Chakra Petch", sans-serif'; g.fillStyle = accent; g.textAlign = 'left';
  g.fillText('SIDEWAYS DRIFT CLUB', 310, 26);
  g.fillText('ドリフト', 60, 38);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}

function mergeByMaterial(group, keep, skip) {
  group.updateMatrix();
  const buckets = new Map();
  for (const o of [...group.children]) {
    if (!o.isMesh || skip.includes(o) || Array.isArray(o.material)) continue;
    o.updateMatrix();
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrix);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!buckets.has(o.material)) buckets.set(o.material, { list: [], shadow: false, order: o.renderOrder });
    const b = buckets.get(o.material);
    b.list.push(g); b.shadow = b.shadow || o.castShadow;
    group.remove(o);
  }
  for (const [mat, b] of buckets) {
    let n = 0;
    for (const g of b.list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const g of b.list) {
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count; g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    keep(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = b.shadow; m.renderOrder = b.order;
    group.add(m);
  }
}

function buildCar(kind, opts) {
  const d = BODY_DEFS[kind];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const disposables = [];
  const keep = (o) => { disposables.push(o); return o; };
  const paint = keep(new THREE.MeshStandardMaterial({ color: opts.paint, metalness: 0.35, roughness: 0.32, envMapIntensity: 1.1 }));
  const glass = keep(new THREE.MeshStandardMaterial({ color: 0x0d1118, metalness: 0.6, roughness: 0.12 }));
  const black = keep(new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.1, roughness: 0.75 }));
  const chromeM = keep(new THREE.MeshStandardMaterial({ color: 0xcfd3d8, metalness: 0.9, roughness: 0.25 }));
  const headM = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: opts.night ? 2.2 : 0.6 }));
  const tailM = keep(new THREE.MeshStandardMaterial({ color: 0x5a0000, emissive: 0xff1a1a, emissiveIntensity: 0.6 }));

  const { fa, ra, width, nose, tail } = d;
  const R = 0.33, AR = 0.44, YB = 0.27;
  // --- profil de caisse
  const s = new THREE.Shape();
  s.moveTo(ra - tail, 0.38);
  s.lineTo(ra - AR - 0.06, YB);
  s.lineTo(ra - AR, R);
  s.absarc(ra, R, AR, Math.PI, 0, true);
  s.lineTo(ra + AR + 0.04, YB);
  s.lineTo(fa - AR - 0.04, YB);
  s.lineTo(fa - AR, R);
  s.absarc(fa, R, AR, Math.PI, 0, true);
  s.lineTo(fa + AR + 0.06, YB);
  s.lineTo(fa + nose - 0.08, 0.32);
  s.lineTo(fa + nose, 0.5);
  s.lineTo(fa + nose - 0.1, d.hood);
  s.lineTo(fa - 0.45, d.cowl);
  s.lineTo(ra - tail + 0.32, d.deck);
  s.lineTo(ra - tail, d.deck - 0.08);
  s.closePath();
  const bev = { depth: width - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 10 };
  const bodyGeo = keep(new THREE.ExtrudeGeometry(s, bev));
  bodyGeo.translate(0, 0, -(width - 0.12) / 2);
  const bodyMesh = new THREE.Mesh(bodyGeo, paint);
  bodyMesh.castShadow = true;
  body.add(bodyMesh);

  // --- habitacle (vitré) + toit peint
  const cab = new THREE.Shape();
  const ws0 = fa - 0.45, ws1 = fa - d.wsTop, rb = ra + d.roofBack;
  const rearBase = d.hatch ? ra - tail + 0.12 : ra - 0.3;
  const rearY = d.hatch ? d.deck - 0.02 : d.deck;
  cab.moveTo(ws0, d.cowl - 0.02);
  cab.lineTo(ws1, d.roof);
  cab.lineTo(rb, d.roof);
  cab.lineTo(rearBase, rearY);
  cab.lineTo(rearBase, d.cowl - 0.02);
  cab.closePath();
  const cw = width - 0.42;
  const cabGeo = keep(new THREE.ExtrudeGeometry(cab, { depth: cw, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 }));
  cabGeo.translate(0, 0, -cw / 2);
  const cabMesh = new THREE.Mesh(cabGeo, glass);
  cabMesh.castShadow = true;
  body.add(cabMesh);
  const roof = new THREE.Mesh(keep(new THREE.BoxGeometry(Math.abs(ws1 - rb) + 0.08, 0.05, cw + 0.06)), paint);
  roof.position.set((ws1 + rb) / 2, d.roof + 0.04, 0);
  body.add(roof);
  // montants de pare-brise
  const pillarGeo = keep(new THREE.BoxGeometry(0.06, Math.hypot(ws1 - ws0, d.roof - d.cowl) + 0.02, 0.07));
  for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(pillarGeo, paint);
    p.position.set((ws0 + ws1) / 2, (d.cowl + d.roof) / 2, sz * (cw / 2 + 0.03));
    p.rotation.z = Math.atan2(ws1 - ws0, d.roof - d.cowl) * -1;
    body.add(p);
  }

  // --- feux
  const hl = keep(new THREE.BoxGeometry(0.06, 0.12, 0.38));
  if (d.popup) {
    for (const sz of [-1, 1]) {
      const pod = new THREE.Mesh(keep(new THREE.BoxGeometry(0.36, 0.14, 0.42)), paint);
      pod.position.set(fa + nose - 0.34, d.hood + 0.1, sz * 0.52);
      pod.rotation.z = -0.35;
      body.add(pod);
      const lens = new THREE.Mesh(hl, headM); lens.position.set(fa + nose - 0.16, d.hood + 0.14, sz * 0.52); body.add(lens);
    }
  } else {
    for (const sz of [-1, 1]) { const l = new THREE.Mesh(hl, headM); l.position.set(fa + nose - 0.06, 0.58, sz * 0.58); l.rotation.z = 0.35; body.add(l); }
  }
  const tl = new THREE.Mesh(keep(new THREE.BoxGeometry(0.05, 0.12, width - 0.3)), tailM);
  tl.position.set(ra - tail - 0.05, d.deck - 0.2, 0);
  body.add(tl);
  // calandre / pare-chocs
  const grille = new THREE.Mesh(keep(new THREE.BoxGeometry(0.05, 0.14, width * 0.55)), black);
  grille.position.set(fa + nose - 0.02, 0.4, 0); body.add(grille);
  const lip = new THREE.Mesh(keep(new THREE.BoxGeometry(0.3, 0.05, width - 0.05)), black);
  lip.position.set(fa + nose - 0.1, 0.27, 0); body.add(lip);
  const diff = new THREE.Mesh(keep(new THREE.BoxGeometry(0.25, 0.08, width - 0.4)), black);
  diff.position.set(ra - tail + 0.1, 0.3, 0); body.add(diff);
  // échappement
  const exh = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 8)), chromeM);
  exh.rotation.z = Math.PI / 2; exh.position.set(ra - tail - 0.05, 0.34, 0.5);
  body.add(exh);
  const flameM = keep(new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  const flame = new THREE.Mesh(keep(new THREE.ConeGeometry(0.1, 0.55, 8)), flameM);
  flame.rotation.z = Math.PI / 2; flame.position.set(ra - tail - 0.42, 0.34, 0.5);
  flame.visible = false;
  body.add(flame);
  // rétroviseurs
  for (const sz of [-1, 1]) {
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(0.16, 0.1, 0.12)), paint);
    m.position.set(ws0 - 0.12, d.cowl + 0.12, sz * (width / 2 + 0.02));
    body.add(m);
  }

  // --- aileron
  if (d.wing === 'gt' || d.wing === 'hoop') {
    const span = d.wing === 'hoop' ? width - 0.1 : width - 0.25;
    const wy = d.deck + (d.wing === 'hoop' ? 0.32 : 0.26);
    const blade = new THREE.Mesh(keep(new THREE.BoxGeometry(0.34, 0.04, span)), d.wing === 'hoop' ? paint : black);
    blade.position.set(ra - tail + 0.28, wy, 0); blade.rotation.z = 0.08;
    body.add(blade);
    for (const sz of [-1, 1]) {
      const st = new THREE.Mesh(keep(new THREE.BoxGeometry(0.12, wy - d.deck + 0.04, 0.04)), d.wing === 'hoop' ? paint : black);
      st.position.set(ra - tail + 0.3, (wy + d.deck) / 2, sz * (span / 2 - 0.12));
      body.add(st);
      const ep = new THREE.Mesh(keep(new THREE.BoxGeometry(0.4, 0.14, 0.03)), black);
      ep.position.set(ra - tail + 0.28, wy + 0.03, sz * span / 2); body.add(ep);
    }
  } else {
    const lipW = new THREE.Mesh(keep(new THREE.BoxGeometry(0.22, 0.04, width - 0.5)), black);
    lipW.position.set(d.hatch ? ra + d.roofBack - 0.1 : ra - tail + 0.2, d.roof + 0.04, 0);
    body.add(lipW);
  }

  // --- livrée latérale
  const liv = keep(makeLiveryTexture(opts.paint, opts.number, opts.darkPaint));
  const livMat = keep(new THREE.MeshStandardMaterial({ map: liv, transparent: true, roughness: 0.4, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2 }));
  const livGeo = keep(new THREE.PlaneGeometry(fa - ra + 0.4, 0.42));
  for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(livGeo, livMat);
    p.position.set((fa + ra) / 2, 0.58, sz * (width / 2 + 0.002));
    if (sz < 0) p.rotation.y = Math.PI;
    body.add(p);
  }

  // --- roues
  const rimM = keep(new THREE.MeshStandardMaterial({ color: opts.rim, metalness: 0.75, roughness: 0.3 }));
  const tireM = keep(new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.9 }));
  const tireGeo = keep(new THREE.CylinderGeometry(R, R, 0.25, 20, 1));
  tireGeo.rotateX(Math.PI / 2);
  const rimGeo = keep(new THREE.CylinderGeometry(0.22, 0.22, 0.26, 16));
  rimGeo.rotateX(Math.PI / 2);
  const spokeGeo = keep(new THREE.BoxGeometry(0.05, 0.4, 0.04));
  const hubGeo = keep(new THREE.CylinderGeometry(0.06, 0.06, 0.28, 8)); hubGeo.rotateX(Math.PI / 2);
  const wheels = [];
  for (const [x, z, front] of [[fa, 1, true], [fa, -1, true], [ra, 1, false], [ra, -1, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, R, z * (width / 2 - 0.06));
    const camber = new THREE.Group();
    camber.rotation.x = -z * (front ? 0.07 : 0.1);
    pivot.add(camber);
    const spin = new THREE.Group();
    camber.add(spin);
    const t = new THREE.Mesh(tireGeo, tireM); t.castShadow = true; spin.add(t);
    const rimDisk = new THREE.Mesh(rimGeo, black); rimDisk.scale.set(0.98, 0.98, 0.9); spin.add(rimDisk);
    for (let k = 0; k < 6; k++) {
      const sp = new THREE.Mesh(spokeGeo, rimM);
      sp.rotation.z = (k / 6) * Math.PI; sp.position.z = z * 0.12;
      spin.add(sp);
    }
    const lipR = new THREE.Mesh(keep(new THREE.TorusGeometry(0.215, 0.022, 6, 20)), rimM);
    lipR.position.z = z * 0.125; spin.add(lipR);
    const hub = new THREE.Mesh(hubGeo, rimM); spin.add(hub);
    root.add(pivot);
    wheels.push({ pivot, spin, front, side: z });
  }

  // ombre portée douce (toujours présente, peu coûteuse)
  const blobTex = keep(new THREE.CanvasTexture((() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  })()));
  const blob = new THREE.Mesh(keep(new THREE.PlaneGeometry(fa - ra + 2.2, width + 0.9)), keep(new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })));
  blob.rotation.x = -Math.PI / 2; blob.position.set((fa + ra) / 2, 0.035, 0);
  blob.renderOrder = 1;
  root.add(blob);

  // fusion des pièces statiques par matériau : ~45 objets → une poignée d'appels de dessin
  mergeByMaterial(body, keep, [flame]);
  for (const w of wheels) mergeByMaterial(w.spin, keep, []);
  const rearX = ra, frontX = fa, halfW = width / 2;
  return {
    root, body, wheels, tailM, headM, flame, paint, rearX, frontX, halfW, length: fa - ra + nose + tail,
    exhaust: new THREE.Vector3(ra - tail - 0.3, 0.34, 0.5),
    update(state, dt, braking) {
      root.position.set(state.x, 0, state.z);
      root.rotation.y = -state.heading;
      body.rotation.set(state.rollAngle * 0.9, 0, state.pitchAngle);
      body.position.y = 0.02 + Math.abs(state.rollAngle) * 0.1;
      for (const w of wheels) {
        w.spin.rotation.z = -state.wheelRot;
        if (w.front) w.pivot.rotation.y = -state.steerAngle;
      }
      tailM.emissiveIntensity = braking ? 3.2 : 0.7;
    },
    dispose() { root.parent && root.parent.remove(root); for (const o of disposables) o.dispose && o.dispose(); },
  };
}
