// ===== Jeu : état, boucle, caméra, score, collisions, entrées, interface =====
(() => {
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const reduceDefault = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- persistance (facultative) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('sdc:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('sdc:' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
  };
  const settings = Object.assign({ assist: 1, autoGas: false, sound: true, reduce: reduceDefault, vibe: true, quality: 'auto' }, store.get('settings', {}));
  // profil de jeu : portefeuille, voitures possédées et leurs pièces (voir economy.js). L'ancienne clé « garage » est migrée.
  const profile = Economy.loadProfile(store.get('profile', null), store.get('garage', null));
  const bests = store.get('bests', {});
  const saveSettings = () => store.set('settings', settings);
  const saveProfile = () => store.set('profile', profile);
  saveProfile();
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // ---------- rendu ----------
  const canvas = $('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 2, powerPreference: 'high-performance' });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 2400);
  const QUALITY = {
    low: { pr: 1, shadows: false, smoke: 500, scenery: 0.45 },
    med: { pr: 1.35, shadows: false, smoke: 900, scenery: 0.75 },
    high: { pr: 1.75, shadows: true, smoke: 1400, scenery: 1 },
  };
  let qLevel = settings.quality === 'auto' ? (isTouch ? 'med' : 'high') : settings.quality;
  let dprScale = 1, fastT = 0; // résolution dynamique (qualité auto)
  let quality = QUALITY[qLevel];

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pr) * dprScale);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (smoke) smoke.mat.uniforms.scale.value = h * renderer.getPixelRatio() * 0.5;
    if (sparks) sparks.mat.uniforms.scale.value = h * renderer.getPixelRatio() * 0.5;
  }

  // ---------- état global ----------
  let trackIdx = clamp(store.get('track', 0), 0, TRACKS.length - 1);
  let mode = store.get('mode', 'run');
  let track = null, world = null, line = null, envMap = null;
  let player = null, playerModel = null, leader = null, leaderModel = null;
  let smoke = null, sparks = null, skids = null;
  let phase = 'menu'; // menu | count | play | pause | results
  let camMode = store.get('cam', 0);
  let shake = 0, timeScale = 1;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const _camT = new THREE.Vector3(), _camL = new THREE.Vector3(); // tampons : aucune allocation par image
  // relief : hauteur du sol (terrain de la piste) et pente, sans allocation
  const curTer = () => (isle ? isle.I.terrain : track.terrain);
  const gy = (x, z) => curTer().at(x, z);
  const _grad = [0, 0];
  const showroom = { x: 0, z: 0, heading: 0, wheelRot: 0, steerAngle: 0, rollAngle: 0, pitchAngle: 0 };

  // ---------- environnement de reflets (ciel) ----------
  // reflets : cubemap peinte (dégradé du ciel), sans rendu flottant → fiable sur tous les GPU mobiles
  function buildEnv() {
    if (envMap) envMap.dispose();
    const T = world.theme;
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    const face = (kind) => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      if (kind === 'top') { g.fillStyle = hex(T.skyTop); g.fillRect(0, 0, 64, 64); }
      else if (kind === 'bottom') { g.fillStyle = T.ground; g.fillRect(0, 0, 64, 64); }
      else {
        const gr = g.createLinearGradient(0, 0, 0, 64);
        gr.addColorStop(0, hex(T.skyTop)); gr.addColorStop(0.48, hex(T.skyHorizon)); gr.addColorStop(0.52, T.road); gr.addColorStop(1, T.ground);
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
        if (kind === 'sun') { const r = g.createRadialGradient(32, 26, 0, 32, 26, 26); r.addColorStop(0, hex(T.sunColor)); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }
      }
      return c;
    };
    envMap = new THREE.CubeTexture([face('sun'), face('side'), face('top'), face('bottom'), face('side'), face('side')]);
    envMap.encoding = THREE.sRGBEncoding;
    envMap.needsUpdate = true;
  }

  function loadTrack(i) {
    dropGhost();
    if (world) world.dispose();
    trackIdx = i;
    track = buildTrackData(TRACKS[i]);
    world = buildWorld(scene, track, quality);
    renderer.toneMappingExposure = world.theme.exposure;
    line = buildDriftLine(track);
    buildEnv();
    buildFx();
    buildCars();
    drawMinimapBase();
    // compile tous les shaders maintenant (fumée, étincelles, leader, flammes…) : pas d'à-coup au premier affichage
    try { renderer.compile(scene, camera); } catch (e) { /* facultatif */ }
  }

  let sharedPuff = null;
  function buildFx() {
    if (smoke) { scene.remove(smoke.points); smoke.dispose(); }
    if (sparks) { scene.remove(sparks.points); sparks.dispose(); }
    if (skids) { scene.remove(skids.mesh); skids.dispose(); }
    const puff = sharedPuff || (sharedPuff = puffTexture());
    const night = track.def.theme === 'night';
    smoke = createParticles(quality.smoke, { map: puff, color: 0xffffff, drag: 1.6, gravity: 0.35, colored: true });
    sparks = createParticles(160, { map: puff, color: 0xffb040, drag: 0.6, gravity: -14, additive: true, floor: true });
    skids = createSkids(isTouch ? 1800 : 3000);
    scene.add(skids.mesh); scene.add(smoke.points); scene.add(sparks.points);
    const fog = scene.fog;
    for (const p of [smoke, sparks]) { p.mat.uniforms.fogCol.value.copy(fog.color); p.mat.uniforms.fogNear.value = fog.near; p.mat.uniforms.fogFar.value = fog.far; }
    resize();
  }

  // aperçu de l'atelier : voiture et config affichées à la place de la config possédée (null = possédée)
  let showKind = null, showCfg = null;
  const hexOf = (list, id, d) => { const it = list.find((x) => x.id === id); return it ? it.hex : d; };
  function lookOf(cfg, night) {
    const paint = hexOf(Economy.PAINTS, cfg.paint, 0xf1efe9);
    const accent = cfg.accent === 'auto' ? (isDark(paint) ? 0xffd23f : 0x16161a) : hexOf(Economy.PAINTS, cfg.accent, 0xffd23f);
    return {
      paint, accent, finish: cfg.finish, livery: cfg.livery, number: cfg.number, rimStyle: cfg.rimStyle, rim: hexOf(Economy.RIMS, cfg.rim, 0xb07a3a),
      front: cfg.front, wide: cfg.wide, wing: cfg.wing, hood: cfg.hood, exhaust: cfg.exhaust, cage: cfg.cage,
      skirt: cfg.skirt, diffuser: cfg.diffuser, mirror: cfg.mirror, roof: cfg.roof, lights: cfg.lights, tint: cfg.tint, seat: cfg.seat, wheelS: cfg.wheelS, tow: cfg.tow, flaps: cfg.flaps,
      neon: cfg.neon === 'none' ? null : hexOf(Economy.NEONS, cfg.neon, null), tune: cfg.tune, brakes: cfg.perf.brakes, night, lod: qLevel === 'low' ? 0 : 1,
    };
  }
  const smokeCol = { P: new THREE.Color(), L: new THREE.Color() };
  function setSmoke(id, cfg) {
    const night = track.def.theme === 'night';
    if (cfg.smoke === 'blanc') smokeCol[id].setHex(night ? 0x8d8a9e : 0xeeeae2); else smokeCol[id].setHex(hexOf(Economy.SMOKES, cfg.smoke, 0xeeeae2));
  }
  // le leader du tandem : livrée fixe, contrastée avec la tienne
  function leaderCfg(kind) {
    const c = Economy.defaultCar(kind);
    const mine = profile.cars[profile.current];
    Object.assign(c, { paint: mine.paint === 'tofu' ? 'panda' : 'tofu', accent: 'jaune', livery: 'stripes', number: 1, rimStyle: 'mesh', rim: 'or', front: 'lip', wing: 'gt', smoke: 'blanc' });
    return c;
  }
  // playerOnly : aperçu de l'atelier, on ne reconstruit que ta voiture (ni le leader, ni l'état physique)
  function buildCars(playerOnly) {
    if (playerModel) playerModel.dispose();
    if (leaderModel && !playerOnly) leaderModel.dispose();
    const night = world.theme.headlights;
    const kind = showKind || profile.current;
    const cfg = showCfg || profile.cars[kind];
    playerModel = buildCar(kind, lookOf(cfg, night));
    playerModel.ground = track.terrain.at;
    scene.add(playerModel.root);
    setSmoke('P', cfg);
    if (!playerOnly) {
      const lk = profile.current === 'raijin' ? 'kouki' : 'raijin';
      const lc = leaderCfg(lk);
      leaderModel = buildCar(lk, lookOf(lc, night));
      leaderModel.ground = track.terrain.at;
      setSmoke('L', lc);
      scene.add(leaderModel.root);
    }
    for (const m of playerOnly ? [playerModel] : [playerModel, leaderModel]) m.root.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial) { o.material.envMap = envMap; o.material.needsUpdate = true; } });
    if (night) {
      if (!playerModel.lamp) {
        const sl = new THREE.SpotLight(0xfff0d0, 2.4, 70, 0.55, 0.5, 1.4);
        sl.position.set(1.8, 0.7, 0); sl.target.position.set(18, 0, 0);
        playerModel.root.add(sl); playerModel.root.add(sl.target);
        playerModel.lamp = sl;
      }
    }
    if (playerOnly) return;
    resetPlayer(startIndex(), 0);
    const keepS = leader && leader.track === track ? leader.state.s : null;
    leader = createLeader(track, line, 10);
    leader.track = track;
    if (keepS != null) { leader.state.s = keepS; leader.update(1 / 60, 1); }
  }
  const isDark = (hex) => { const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255; return r * 0.3 + g * 0.59 + b * 0.11 < 110; };

  function startIndex() { return track.count - Math.round(40 / track.step); }
  function resetPlayer(idx, speed) {
    const st = createCarState(Economy.tunedSpec(CAR_SPECS[profile.current], profile.cars[profile.current].perf, profile.cars[profile.current].tune), track.px[idx], track.pz[idx], track.heading[idx]);
    st.vx = Math.cos(st.heading) * speed; st.vz = Math.sin(st.heading) * speed; st.speed = speed; st.fwd = speed;
    st.gear = speed > 15 ? 3 : speed > 8 ? 2 : 1;
    if (player) { st.idx = idx; }
    player = st;
    player.x0 = st.x; player.z0 = st.z; player.h0 = st.heading;
    player.idx = idx;
    player.prevIdx = idx;
    if (skids) { skids.mark('P-1', st.x, st.z, 0, 0.3); skids.mark('P1', st.x, st.z, 0, 0.3); }
  }

  // ---------- entrées ----------
  let helpThenSelect = false, helpSeen = store.get('seenHelp', false);
  const keys = new Set();
  const touch = { left: false, right: false, gas: false, brake: false, hb: false };
  const input = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k) && phase !== 'menu' && !document.activeElement.closest('.screen')) e.preventDefault();
    keys.add(k);
    if (k === 'escape' || k === 'p') {
      if (phase === 'play' || phase === 'count') pauseGame();
      else if (phase === 'pause' && screenId === 'pause') resumeGame();
      else if (k === 'escape' && screenId === 'layout') closeLayoutEditor();
      else if (k === 'escape' && screenId === 'garage') closeShop();
      else if (k === 'escape' && screenId === 'adventure' && isle) { show(null); resumeGame(); }
      else if (k === 'escape' && screenId === 'isleMap') closeIsleMap();
      else if (k === 'escape' && ['select', 'settings', 'help', 'career', 'adventure', 'multi'].includes(screenId)) { helpThenSelect = false; show(screenId === 'settings' ? returnTo : 'menu'); }
    }
    if (k === 'c' && (phase === 'play' || phase === 'count')) cycleCam();
    if (k === 'r' && phase === 'play') respawn();
    ensureAudio();
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => { keys.clear(); clearTouch(); });

  // ========== commandes tactiles : disposition + contrôleur à doigts glissants ==========
  const TKEYS = ['left', 'right', 'gas', 'brake', 'hb'];
  const TEL = { left: $('tLeft'), right: $('tRight'), gas: $('tGas'), brake: $('tBrake'), hb: $('tHb') };
  // proportions de chaque bouton par rapport à la taille de base s (largeur, hauteur, rayon relatif)
  const TDIM = { left: [1, 1], right: [1, 1], gas: [1.05, 1.5], brake: [0.95, 1.05], hb: [0.95, 0.95] };
  const GAP = 12, MARGIN = 14;
  const layouts = store.get('touchLayout', {}); // { l: {pos, sc, size, op}, p: {...} }  l = paysage, p = portrait
  let tState = { rects: {}, W: 0, H: 0, s: 76, ori: 'l' };
  let editing = false, selKey = null;

  function safeInsets() {
    const pr = document.createElement('div');
    pr.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(pr);
    const c = getComputedStyle(pr);
    const r = { t: parseFloat(c.paddingTop) || 0, r: parseFloat(c.paddingRight) || 0, b: parseFloat(c.paddingBottom) || 0, l: parseFloat(c.paddingLeft) || 0 };
    pr.remove();
    return r;
  }
  const curOri = () => (innerWidth >= innerHeight ? 'l' : 'p');
  const getLay = () => layouts[curOri()] || null;
  function ensureLay() { const o = curOri(); if (!layouts[o]) layouts[o] = { pos: {}, sc: {}, size: 1, op: 1 }; return layouts[o]; }
  const saveLayouts = () => store.set('touchLayout', layouts);

  // positions par défaut : pédales à droite, direction à gauche (centres, en px)
  function defaultCenters(W, H, s, ins) {
    const c = {};
    const w = (k) => TDIM[k][0] * s, h = (k) => TDIM[k][1] * s;
    const bottom = H - ins.b - MARGIN;
    c.left = [ins.l + MARGIN + w('left') / 2, bottom - h('left') / 2];
    c.right = [c.left[0] + w('left') / 2 + GAP + w('right') / 2, c.left[1]];
    c.gas = [W - ins.r - MARGIN - w('gas') / 2, bottom - h('gas') / 2];
    c.brake = [c.gas[0] - w('gas') / 2 - GAP - w('brake') / 2, bottom - h('brake') / 2];
    c.hb = [c.brake[0], c.brake[1] - h('brake') / 2 - GAP - h('hb') / 2];
    return c;
  }

  function applyLayout() {
    const W = innerWidth, H = innerHeight, ori = curOri(), lay = getLay();
    const base = W < 560 || H < 420 ? 66 : 76;
    const gsize = lay ? lay.size : 1, op = lay ? lay.op : 1;
    const sGlobal = base * gsize;
    const ins = safeInsets();
    const defs = defaultCenters(W, H, sGlobal, ins);
    const rects = {};
    for (const k of TKEYS) {
      const sc = (lay && lay.sc[k]) || 1;
      const w = TDIM[k][0] * sGlobal * sc, h = TDIM[k][1] * sGlobal * sc;
      let cx, cy;
      if (lay && lay.pos[k]) { cx = lay.pos[k][0] * W; cy = lay.pos[k][1] * H; } else { cx = defs[k][0]; cy = defs[k][1]; }
      // reste entièrement visible, hors encoche
      cx = clamp(cx, ins.l + 4 + w / 2, W - ins.r - 4 - w / 2);
      cy = clamp(cy, ins.t + 4 + h / 2, H - ins.b - 4 - h / 2);
      rects[k] = { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, cx, cy, w, h };
      const el = TEL[k];
      el.style.width = w + 'px'; el.style.height = h + 'px';
      el.style.transform = `translate(${(cx - w / 2).toFixed(1)}px, ${(cy - h / 2).toFixed(1)}px)`;
      el.style.borderRadius = k === 'left' || k === 'right' ? '50%' : Math.min(w, h) * 0.22 + 'px';
      const tt = el.querySelector('.tt');
      if (tt) tt.style.fontSize = (k === 'gas' ? Math.min(w, h) * 0.26 : Math.min(w, h) * 0.17) + 'px';
    }
    tState = { rects, W, H, s: sGlobal, ori, ins };
    $('touch').style.setProperty('--op', op);
    document.documentElement.style.setProperty('--btn', sGlobal + 'px');
  }
  // le transform sert au placement : l'état « enfoncé » passe par une ombre interne pour ne pas l'écraser
  const style = document.createElement('style');
  style.textContent = '.tbtn.on { transform-origin: center; filter: brightness(1.15); } #touch.editing .tbtn.drag { filter: brightness(1.2); }';
  document.head.appendChild(style);

  // ---------- contrôleur : un doigt = un bouton, mais il peut glisser sans lâcher ----------
  const ptrs = new Map(); // pointerId -> { k, t }
  let ptrClock = 0;
  const inside = (r, x, y, m) => x >= r.x0 - m && x <= r.x1 + m && y >= r.y0 - m && y <= r.y1 + m;
  // 1) bouton réellement sous le doigt (le plus proche du centre si deux se touchent) ; 2) sinon on garde le bouton
  // courant tant que le doigt reste à moins de 28 px (pas de coupure dans les interstices) ; 3) sinon le plus proche à 28 px.
  function hitTest(x, y, cur) {
    const R = tState.rects;
    let best = null, bd = Infinity;
    for (const k of TKEYS) {
      if (!inside(R[k], x, y, 0)) continue;
      const d = Math.hypot((x - R[k].cx) / R[k].w, (y - R[k].cy) / R[k].h);
      if (d < bd) { bd = d; best = k; }
    }
    if (best) return best;
    if (cur && inside(R[cur], x, y, 28)) return cur;
    for (const k of TKEYS) {
      if (!inside(R[k], x, y, 28)) continue;
      const d = Math.hypot((x - R[k].cx) / R[k].w, (y - R[k].cy) / R[k].h);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  function recomputeTouch() {
    const on = { left: 0, right: 0, gas: 0, brake: 0, hb: 0 };
    for (const p of ptrs.values()) if (p.k && p.t > on[p.k]) on[p.k] = p.t;
    touch.gas = !!on.gas; touch.brake = !!on.brake; touch.hb = !!on.hb;
    // deux doigts sur les deux flèches : le dernier arrivé gagne
    touch.left = !!on.left && on.left > on.right;
    touch.right = !!on.right && on.right > on.left;
    refreshTouchUI();
  }
  let drag = null; // { id, k, dx, dy } en mode éditeur
  const layer = $('touch');
  layer.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.tbtn');
    if (!btn) return;
    e.preventDefault();
    try { btn.setPointerCapture(e.pointerId); } catch (err) { /* pas critique */ }
    if (editing) {
      selectKey(btn.dataset.k);
      const r = tState.rects[btn.dataset.k];
      drag = { id: e.pointerId, k: btn.dataset.k, dx: e.clientX - r.cx, dy: e.clientY - r.cy };
      btn.classList.add('drag');
      return;
    }
    ensureAudio();
    ptrs.set(e.pointerId, { k: hitTest(e.clientX, e.clientY, btn.dataset.k) || btn.dataset.k, t: ++ptrClock });
    recomputeTouch();
  });
  layer.addEventListener('pointermove', (e) => {
    if (editing) {
      if (!drag || drag.id !== e.pointerId) return;
      const lay = ensureLay(), R = tState.rects;
      if (!lay.pos[drag.k]) for (const k of TKEYS) lay.pos[k] = [R[k].cx / tState.W, R[k].cy / tState.H]; // fige tout au premier geste
      lay.pos[drag.k] = [(e.clientX - drag.dx) / tState.W, (e.clientY - drag.dy) / tState.H];
      applyLayout();
      return;
    }
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const k = hitTest(e.clientX, e.clientY, p.k);
    if (k !== p.k) { p.k = k; p.t = ++ptrClock; recomputeTouch(); }
  });
  const release = (e) => {
    if (editing) {
      if (drag && drag.id === e.pointerId) { TEL[drag.k].classList.remove('drag'); drag = null; saveLayouts(); }
      return;
    }
    if (ptrs.delete(e.pointerId)) recomputeTouch();
  };
  layer.addEventListener('pointerup', release);
  layer.addEventListener('pointercancel', release);
  layer.addEventListener('lostpointercapture', release);
  function clearTouch() { ptrs.clear(); for (const k in touch) touch[k] = false; refreshTouchUI(); }
  function refreshTouchUI() {
    TEL.left.classList.toggle('on', touch.left); TEL.right.classList.toggle('on', touch.right);
    TEL.gas.classList.toggle('on', touch.gas || (settings.autoGas && !touch.brake && !touch.hb));
    TEL.brake.classList.toggle('on', touch.brake); TEL.hb.classList.toggle('on', touch.hb);
  }
  function setTouchVisible() {
    layer.classList.toggle('on', editing || (isTouch && (phase === 'play' || phase === 'count' || phase === 'pause')));
    layer.classList.toggle('editing', editing);
  }

  // ---------- éditeur ----------
  const pct = (v) => Math.round(v * 100) + ' %';
  function selectKey(k) {
    selKey = k;
    for (const q of TKEYS) TEL[q].classList.toggle('sel', q === k);
    syncLayoutUI();
  }
  function syncLayoutUI() {
    const lay = getLay();
    $('layAll').value = Math.round((lay ? lay.size : 1) * 100); $('layAllOut').textContent = pct(lay ? lay.size : 1);
    $('layOp').value = Math.round((lay ? lay.op : 1) * 100); $('layOpOut').textContent = pct(lay ? lay.op : 1);
    const sel = $('laySel'); sel.disabled = !selKey;
    const names = { left: 'gauche', right: 'droite', gas: 'gaz', brake: 'frein', hb: 'frein à main' };
    $('laySelLbl').firstChild.textContent = selKey ? `Bouton ${names[selKey]} ` : 'Taille du bouton ';
    const v = selKey && lay && lay.sc[selKey] ? lay.sc[selKey] : 1;
    sel.value = Math.round(v * 100); $('laySelOut').textContent = selKey ? pct(v) : '—';
  }
  $('layAll').addEventListener('input', (e) => { ensureLay().size = e.target.value / 100; applyLayout(); syncLayoutUI(); });
  $('laySel').addEventListener('input', (e) => { if (!selKey) return; ensureLay().sc[selKey] = e.target.value / 100; applyLayout(); syncLayoutUI(); });
  $('layOp').addEventListener('input', (e) => { ensureLay().op = e.target.value / 100; applyLayout(); syncLayoutUI(); });
  for (const id of ['layAll', 'laySel', 'layOp']) $(id).addEventListener('change', saveLayouts);
  $('layReset').addEventListener('click', () => { delete layouts[curOri()]; saveLayouts(); selKey = null; for (const q of TKEYS) TEL[q].classList.remove('sel'); applyLayout(); syncLayoutUI(); });
  $('layMirror').addEventListener('click', () => {
    const lay = ensureLay(), R = tState.rects;
    for (const k of TKEYS) lay.pos[k] = [1 - (lay.pos[k] ? lay.pos[k][0] : R[k].cx / tState.W), lay.pos[k] ? lay.pos[k][1] : R[k].cy / tState.H];
    saveLayouts(); applyLayout();
  });
  function openLayoutEditor() {
    editing = true; selKey = null;
    for (const q of TKEYS) TEL[q].classList.remove('sel');
    clearTouch(); applyLayout(); syncLayoutUI(); setTouchVisible();
    show('layout');
  }
  function closeLayoutEditor() {
    editing = false; drag = null; saveLayouts();
    setTouchVisible(); show(returnTo);
  }
  $('layDone').addEventListener('click', closeLayoutEditor);
  addEventListener('resize', () => { applyLayout(); if (editing) syncLayoutUI(); });
  addEventListener('orientationchange', () => setTimeout(() => { applyLayout(); if (editing) syncLayoutUI(); }, 250));

  // ---------- pas de zoom pendant le jeu, zoom libre dans les menus (accessibilité WCAG 1.4.4) ----------
  // Le viewport autorise le zoom ; la surface de jeu le bloque (touch-action: none + ces gardes pour iOS),
  // les cartes de menu l'acceptent (touch-action: pan-y pinch-zoom).
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    const gameSurface = e.target === canvas || e.target.closest('#touch, #hud') ;
    if (gameSurface && !e.target.closest('.icon-btn') && now - lastTouchEnd < 350) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => { if (!(e.target.closest && e.target.closest('.card'))) e.preventDefault(); }, { passive: false });
  // ne bloque le glisser que hors des cartes défilantes et des curseurs
  document.addEventListener('touchmove', (e) => { if (!e.target.closest('.card, input[type=range]')) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('#touch') || e.target === canvas) e.preventDefault(); });

  let padPrev = {};
  function readInput() {
    const has = (...k) => k.some((x) => keys.has(x));
    let steer = 0, gas = 0, brake = 0, hb = 0;
    if (has('arrowleft', 'a', 'q') || touch.left) steer -= 1;
    if (has('arrowright', 'd') || touch.right) steer += 1;
    if (has('arrowup', 'w', 'z') || touch.gas) gas = 1;
    if (has('arrowdown', 's') || touch.brake) brake = 1;
    if (has(' ', 'shift') || touch.hb) hb = 1;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.12) steer = clamp(ax * 1.1, -1, 1);
      const bv = (i) => (p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0);
      gas = Math.max(gas, bv(7));
      brake = Math.max(brake, bv(6));
      if (bv(0) > 0.5 || bv(1) > 0.5 || bv(5) > 0.5) hb = 1;
      const start = bv(9) > 0.5;
      if (start && !padPrev.start) { if (phase === 'play') pauseGame(); else if (phase === 'pause') resumeGame(); }
      const y = bv(3) > 0.5;
      if (y && !padPrev.y && phase === 'play') cycleCam();
      padPrev = { start, y };
      break;
    }
    if (settings.autoGas) gas = brake > 0 || hb > 0 ? 0 : 1;
    input.steer = steer; input.throttle = gas; input.brake = brake; input.handbrake = hb;
  }

  // ---------- son ----------
  function ensureAudio() {
    if (!settings.sound) return;
    Sound.init();
  }
  function vibrate(ms) { if (settings.vibe && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* refusé */ } } }

  // ---------- score ----------
  const score = { total: 0, combo: 0, mult: 1, idle: 0, best: 0, clips: 0, maxAngle: 0, driftT: 0, runT: 0, offT: 0, tandemT: 0, lastBank: 0, walls: 0 };
  function resetScore() {
    Object.assign(score, { total: 0, combo: 0, mult: 1, idle: 0, best: 0, clips: 0, maxAngle: 0, driftT: 0, runT: 0, offT: 0, tandemT: 0, walls: 0 });
    for (const z of track.zones) z.hit = false;
  }
  const WORDS = [[1500, 'BIEN'], [4000, 'SUPER'], [9000, 'ÉNORME'], [16000, 'INSENSÉ'], [Infinity, 'LÉGENDAIRE']];
  // ---------- fantôme du record (ghost.js) : rejoue ton meilleur run noté, écart de points en direct ----------
  const ghosts = store.get('ghosts', {});
  let ghostRec = null, ghostCar = null, ghostT = 0;
  const ghostView = { x: 0, z: 0, heading: 0, rollAngle: 0, pitchAngle: 0, wheelRot: 0, steerAngle: 0, rearSlip: 0 };
  function dropGhost() { if (ghostCar) { ghostCar.model.dispose(); ghostCar = null; } }
  function buildGhost() {
    dropGhost();
    const g = mode === 'run' && !isle ? Ghost.unpack(ghosts[track.def.id]) : null;
    if (!g) return;
    const model = buildCar(g.kind, lookOf(profile.cars[g.kind] || Economy.defaultCar(g.kind), world.theme.headlights));
    model.ground = track.terrain.at;
    // voiture de verre : tous les matériaux deviennent transparents, l'opacité suit la distance à ta voiture
    const mats = [];
    model.root.traverse((o) => { if (!o.material) return; for (const m of [].concat(o.material)) if (!mats.includes(m)) { m.userData.o = m.opacity; m.transparent = true; m.depthWrite = false; mats.push(m); } });
    model.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    scene.add(model.root);
    ghostCar = { g, model, mats, fade: -1 };
  }
  function updateGhost(dt) {
    const G = ghostCar, s = Ghost.at(G.g, score.runT, ghostView);
    ghostView.wheelRot += dt * 50; ghostView.steerAngle = -s.rearSlip * 0.5;
    G.model.update(ghostView, dt, false);
    const d = Math.hypot(s.x - player.x, s.z - player.z);
    const f = (s.done ? 0 : clamp((d - 2.5) / 9, 0, 1)) * 0.38;
    if (Math.abs(f - G.fade) > 0.02) { G.fade = f; for (const m of G.mats) m.opacity = m.userData.o * f; G.model.root.visible = f > 0.01; }
    ghostT -= dt;
    if (ghostT <= 0) {
      ghostT = 0.25;
      const delta = Math.round(score.total + score.combo - s.pts), b = el('hudBest');
      setText('hudBest', `RECORD ${(bests[track.def.id + ':run'] || 0).toLocaleString('fr-FR')} · ${delta >= 0 ? '+' : '−'}${Math.abs(delta).toLocaleString('fr-FR')}`);
      const cls = delta >= 0 ? 'ahead' : 'behind';
      if (b.dataset.d !== cls) { b.dataset.d = cls; b.classList.toggle('ahead', delta >= 0); b.classList.toggle('behind', delta < 0); }
    }
  }

  function bank() {
    if (score.combo < 1) { score.combo = 0; score.mult = 1; return; }
    if (score.combo >= 1500) pulseHeat();
    const pts = Math.round(score.combo);
    score.total += pts;
    score.best = Math.max(score.best, pts);
    if (pts >= 150) {
      const word = WORDS.find((w) => pts < w[0])[1];
      popup(`${word} +${pts.toLocaleString('fr-FR')}`, 'bank');
      Sound.bank(pts > 9000);
    }
    score.combo = 0; score.mult = 1;
  }
  const lossLog = {};
  function lose(reason) {
    if (score.combo > 50) { lossLog[reason] = (lossLog[reason] || 0) + 1; lossLog.pts = (lossLog.pts || 0) + Math.round(score.combo); }
    if (score.combo > 50) {
      popup(`${reason} · combo perdu`, 'lost');
      Sound.lost(); vibrate(60);
    }
    score.combo = 0; score.mult = 1; score.idle = 0;
  }
  function popup(text, cls) {
    const box = $('popups');
    const el = document.createElement('div');
    el.className = 'pop ' + cls; el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 1650);
  }
  function announce(t) { $('live').textContent = t; }
  // encaissement d'un gros combo : un éclat du halo (sans effet si « mouvement réduit »)
  function pulseHeat() { if (settings.reduce) return; const h = $('heat'); h.classList.remove('pulse'); void h.offsetWidth; h.classList.add('pulse'); }

  // point de la voiture en coordonnées monde (x local avant, z local droite)
  function carPoint(st, lx, lz) {
    const c = Math.cos(st.heading), s = Math.sin(st.heading);
    return [st.x + c * lx - s * lz, st.z + s * lx + c * lz];
  }
  function latOf(i, x, z) { return (x - track.px[i]) * -track.tz[i] + (z - track.pz[i]) * track.tx[i]; }

  function updateScore(dt) {
    const st = player;
    const ang = Math.abs(st.slip) * 180 / Math.PI;
    const onRoad = isle ? st.roadD < isle.I.half + 0.6 : Math.abs(st.lat0) < track.half + 0.6;
    const drifting = ang > 12 && st.speed > 8 && st.fwd > 2 && onRoad;
    score.runT += dt;
    if (drifting) {
      score.driftT += dt;
      score.maxAngle = Math.max(score.maxAngle, Math.min(ang, 90));
      let tandemK = 1;
      if (leader && mode === 'tandem') {
        const d = Math.hypot(st.x - leader.state.x, st.z - leader.state.z);
        if (d < 11 && leader.drifting) { tandemK = 1.6; score.tandemT += dt; score.mult = Math.min(8, score.mult + dt * 0.18); }
      }
      const pts = (Math.min(ang, 70) - 8) * (st.speed * 3.6 / 10) * dt * 1.1 * tandemK;
      score.combo += pts * score.mult;
      score.mult = Math.min(8, score.mult + dt * 0.1);
      score.idle = 0;
    } else if (score.combo > 0) {
      score.idle += dt;
      if (score.idle > 1.25) bank();
    }
    if (ang > 105 && st.speed > 3) lose('Tête-à-queue');
    if (!onRoad && st.speed > 4) { score.offT += dt; if (score.offT > 0.45) lose('Hors piste'); } else score.offT = 0;

    // zones de clipping (pas sur l'île)
    if (drifting && !isle) {
      for (const z of track.zones) {
        if (z.hit) continue;
        const inZ = inRange(st.idx, z.from, z.to, track.count);
        if (!inZ) continue;
        if (z.type === 'outer') {
          const [rx, rz] = carPoint(st, playerModel.rearX - 0.8, 0);
          const lat = latOf(st.idx, rx, rz) * z.side;
          if (lat > track.half - 3.2) { z.hit = true; z.flash = 1; score.clips++; score.mult = Math.min(8, score.mult + 0.5); score.combo += 400 * score.mult; popup('Clip extérieur +400', 'clip'); Sound.clip(); vibrate(25); }
        } else {
          const [fx, fz] = carPoint(st, playerModel.frontX + 0.7, 0);
          const lat = latOf(st.idx, fx, fz) * z.side;
          if (lat > track.half - 3.6) { z.hit = true; z.flash = 1; score.clips++; score.mult = Math.min(8, score.mult + 0.35); score.combo += 250 * score.mult; popup('Corde +250', 'apex'); Sound.clip(); vibrate(20); }
        }
      }
    }
  }

  // ---------- collisions ----------
  function collide(st, dt) {
    const near = nearest(track, st.x, st.z, st.idx, 24);
    st.idx = near.i; st.lat0 = near.lat;
    st.surface = Math.abs(near.lat) > track.half + 0.4 ? 0.62 : 1;
    st.grip = track.def.grip || 1;
    const corners = [[playerModel.frontX + 0.9, playerModel.halfW], [playerModel.frontX + 0.9, -playerModel.halfW], [playerModel.rearX - 0.85, playerModel.halfW], [playerModel.rearX - 0.85, -playerModel.halfW]];
    let worst = 0, side = 0, cornerX = 0;
    for (const [lx, lz] of corners) {
      const [x, z] = carPoint(st, lx, lz);
      const lat = latOf(st.idx, x, z);
      const pen = Math.abs(lat) - (track.wall - 0.1);
      if (pen > worst) { worst = pen; side = Math.sign(lat); cornerX = lx; }
    }
    if (worst > 0) {
      const nx = -track.tz[st.idx] * side, nz = track.tx[st.idx] * side; // normale sortante
      st.x -= nx * worst; st.z -= nz * worst;
      const vn = st.vx * nx + st.vz * nz;
      if (vn > 0) {
        st.vx -= nx * vn * 1.3; st.vz -= nz * vn * 1.3;
        st.vx *= 0.94; st.vz *= 0.94;
        st.omega += -side * Math.sign(cornerX) * vn * 0.12;
        if (vn > 1.6) {
          Sound.impact(vn); vibrate(Math.min(120, vn * 12));
          if (!settings.reduce) shake = Math.min(1, shake + vn * 0.08);
          const [cx, cz] = carPoint(st, cornerX, side * playerModel.halfW);
          for (let k = 0; k < Math.min(30, vn * 4); k++) sparks.emit(cx, gy(cx, cz) + 0.5, cz, (Math.random() - 0.5) * 6 + st.vx * 0.3, 2 + Math.random() * 4, (Math.random() - 0.5) * 6 + st.vz * 0.3, 0.4 + Math.random() * 0.3, 0.25, 0.08, 1);
        }
        if (vn > 3 && phase === 'play') { score.walls++; lose('Contact mur'); }
      }
    }
    // contact avec le leader
    if (leader && mode === 'tandem' && phase === 'play') {
      const dx = st.x - leader.state.x, dz = st.z - leader.state.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.3 && d > 0.01) {
        const push = 3.3 - d;
        st.x += dx / d * push; st.z += dz / d * push;
        const rel = (st.vx - leader.state.vx) * (-dx / d) + (st.vz - leader.state.vz) * (-dz / d);
        if (rel > 0) { st.vx -= (-dx / d) * rel * 1.2; st.vz -= (-dz / d) * rel * 1.2; }
        if (rel > 2.5) { Sound.impact(rel); lose('Touchette'); }
      }
    }
  }

  // ---------- progression du tour ----------
  const lap = { progress: 0, n: 0, wrongT: 0, done: false };
  function updateProgress(dt) {
    let d = player.idx - player.prevIdx;
    if (d > track.count / 2) d -= track.count;
    if (d < -track.count / 2) d += track.count;
    player.prevIdx = player.idx;
    lap.progress += d * track.step;
    const wrong = player.fwd > 3 && (Math.cos(player.heading - track.heading[player.idx]) < -0.3);
    lap.wrongT = wrong ? lap.wrongT + dt : Math.max(0, lap.wrongT - dt * 2);
    $('banner').style.display = lap.wrongT > 1 ? 'block' : 'none';
    // franchissement de la ligne (indice qui repasse par 0 en avançant)
    if (d > 0 && player.idx < d + 2 && lap.progress > track.length * 0.7) {
      lap.n++;
      lap.progress = 0;
      for (const z of track.zones) z.hit = false;
      if (mode !== 'free') finishRun();
      else popup(`Tour ${lap.n + 1}`, 'apex');
    }
  }

  // ---------- caméra ----------
  const CAMS = [{ dist: 4.7, h: 1.7, look: 1.1, name: 'Chasse' }, { dist: 8.6, h: 3.4, look: 0.8, name: 'Large' }, { dist: 3.9, h: 1.35, look: 1.1, name: 'Basse' }];
  function cycleCam() { camMode = (camMode + 1) % CAMS.length; store.set('cam', camMode); popup('Caméra ' + CAMS[camMode].name, 'apex'); }
  function updateCamera(dt, st, attract) {
    const portrait = camera.aspect < 1;
    if (attract === 'garage') {
      // vue par rayon de l'atelier (angle relatif au cap de la voiture), + rotation au doigt
      const t = performance.now() / 1000;
      const V = shopView;
      const a = (V.a == null ? t * 0.25 : V.a + (settings.reduce ? 0 : Math.sin(t * 0.4) * 0.07)) + garageYaw;
      const r = V.r * (portrait ? 1.3 : 1);
      const hx = Math.cos(st.heading), hz = Math.sin(st.heading);
      const cx = st.x + hx * (V.fwd || 0), cz = st.z + hz * (V.fwd || 0);
      const g0 = gy(cx, cz);
      _camT.set(cx + Math.cos(st.heading + a) * r, 0, cz + Math.sin(st.heading + a) * r);
      _camT.y = Math.max(g0, gy(_camT.x, _camT.z)) + V.h * (portrait ? 1.15 : 1);
      if (snapCam) { camPos.copy(_camT); camLook.set(cx, g0 + 0.5, cz); snapCam = false; }
      camPos.lerp(_camT, 1 - Math.exp(-dt * 3.2));
      // la voiture se cadre à gauche (le panneau occupe la droite) ou en haut en portrait
      let rx = camPos.x - cx, rz = camPos.z - cz; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
      const off = portrait || V.noOff ? 0 : 2.3 * V.r / 7;
      _camL.set(cx + rz * off, g0 + (portrait ? 0.45 - 0.3 * r : (V.look || 0.6)), cz - rx * off); // portrait : voiture dans le tiers haut, au-dessus du panneau
      camLook.lerp(_camL, 1 - Math.exp(-dt * 6));
      camera.fov += ((portrait ? 64 : 46) - camera.fov) * 0.1;
    } else if (attract) {
      const t = performance.now() / 1000;
      const a = t * 0.18;
      const r = portrait ? 11 : 8.5;
      const tx = st.x + Math.cos(a) * r, tz = st.z + Math.sin(a) * r;
      const g0 = gy(st.x, st.z);
      camPos.lerp(_camT.set(tx, Math.max(g0, gy(tx, tz)) + 2.2, tz), 1 - Math.exp(-dt * 2));
      camLook.lerp(_camL.set(st.x, g0 + 0.8, st.z), 1 - Math.exp(-dt * 6));
      camera.fov += ((portrait ? 70 : 50) - camera.fov) * 0.1;
    } else {
      const C = CAMS[camMode];
      const hx = Math.cos(st.heading), hz = Math.sin(st.heading);
      const sp = Math.hypot(st.vx, st.vz);
      let dx = hx, dz = hz;
      if (sp > 4) { const w = 0.6; dx = hx * (1 - w) + (st.vx / sp) * w; dz = hz * (1 - w) + (st.vz / sp) * w; const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
      const dist = (C.dist + Math.min(sp, 30) * 0.03) * (portrait ? 1.25 : 1);
      // relief : la caméra suit la hauteur de la voiture et ne passe jamais sous le sol derrière elle
      const g0 = gy(st.x, st.z), cxp = st.x - dx * dist, czp = st.z - dz * dist;
      camPos.lerp(_camT.set(cxp, Math.max(g0, gy(cxp, czp) + 0.6) + C.h * (portrait ? 1.25 : 1), czp), 1 - Math.exp(-dt * (camMode === 2 ? 9 : 5.5)));
      camLook.lerp(_camL.set(st.x + hx * 2.2, gy(st.x + hx * 2.2, st.z + hz * 2.2) + C.look + (portrait ? 0.3 : 0), st.z + hz * 2.2), 1 - Math.exp(-dt * 10));
      const fov = (portrait ? 70 : 54) + (settings.reduce ? 0 : Math.min(sp, 40) * 0.26);
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
    }
    camera.position.copy(camPos);
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * shake * 0.3;
      shake = Math.max(0, shake - dt * 2.5);
    }
    camera.lookAt(camLook);
    camera.updateProjectionMatrix();
  }

  // ---------- effets par voiture ----------
  function carFx(st, model, dt, id, colId) {
    const col = smokeCol[colId || id];
    const slip = st.rearSlip;
    const k = clamp((slip - 0.12) * 2.2, 0, 1) * clamp(st.speed / 8, 0, 1);
    const spin = clamp((st.wheelSpin || 0) - 0.6, 0, 1) * clamp(st.throttle, 0, 1);
    const intensity = Math.max(k, spin * 0.8);
    for (const sz of [-1, 1]) {
      const [x, z] = carPoint(st, model.rearX, sz * (model.halfW - 0.08));
      const y = gy(x, z);
      skids.mark(id + sz, x, z, intensity, 0.28 + Math.min(Math.abs(st.slip), 0.8) * 0.25, y);
      const n = intensity * dt * (quality.smoke > 900 ? 46 : 26);
      let emit = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
      while (emit-- > 0) {
        const j = () => (Math.random() - 0.5);
        smoke.emit(x + j() * 0.4, y + 0.35, z + j() * 0.4, st.vx * 0.25 + j() * 2.4, 0.4 + Math.random() * 0.9, st.vz * 0.25 + j() * 2.4, 1.6 + Math.random() * 1.4, 1.0, 4.6 + intensity * 2.6, 0.26 * (0.45 + intensity * 0.6), col);
      }
    }
  }

  // ---------- boucle ----------
  let last = performance.now(), acc = 0, frameAvg = 16, frameN = 0, qCheckT = 0;
  let dbgTrace = null; // banc de mesure de saccade (tools)
  const STEP = 1 / 120;
  const perf = { js: 0, render: 0 };
  function frame(now) {
    requestAnimationFrame(frame);
    const tA = performance.now();
    let dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    frameAvg += (dt * 1000 - frameAvg) * 0.05;
    const t = now / 1000;

    if (phase === 'menu' || phase === 'results' || (phase === 'pause' && !player)) {
      // mode attraction : ta voiture (garage) glisse seule, la caméra tourne autour
      playerModel.root.visible = true;
      leaderModel.root.visible = false;
      if (screenId === 'garage') {
        // vitrine : voiture garée sur la ligne, plateau tournant
        const i0 = 6;
        showroom.x = track.px[i0]; showroom.z = track.pz[i0]; showroom.heading = track.heading[i0];
        showroom.wheelRot = 0; showroom.steerAngle = 0.32; showroom.rollAngle = 0; showroom.pitchAngle = 0;
        playerModel.update(showroom, dt, false);
        updateCamera(dt, showroom, 'garage');
      } else if (isle && player) {
        // sur l'île : ta voiture garée là où la balade s'arrête, la caméra tourne autour
        playerModel.update(player, dt, false);
        updateCamera(dt, player, true);
      } else {
        leader.update(dt, 1);
        playerModel.update(leader.state, dt, false);
        carFx(leader.state, playerModel, dt, 'L', 'P');
        updateCamera(dt, leader.state, true);
      }
      Sound.update(leader.state, 'raijin', false);
    } else if (phase === 'play' || phase === 'count') {
      playerModel.root.visible = true;
      leaderModel.root.visible = mode === 'tandem';
      readInput();
      if (phase === 'play') {
        acc += dt;
        while (acc >= STEP) {
          player.x0 = player.x; player.z0 = player.z; player.h0 = player.heading;
          curTer().grad(player.x, player.z, _grad); player.gx = _grad[0]; player.gz = _grad[1];
          stepCar(player, input, STEP, settings.assist);
          if (isle) { isleCollide(player); if (life) lifeCollide(player); } else collide(player, STEP);
          acc -= STEP;
        }
        if (!isle) updateProgress(dt);
        updateScore(dt);
        if (ghostRec) Ghost.push(ghostRec, score.runT, player, score.total + score.combo);
        if (explore) updateExplore(dt);
        if (isle) isleTick(dt);
        if (mode === 'tandem') {
          let gap = (leader.state.s - lapS()) ;
          const L = track.length; gap = ((gap % L) + L) % L; if (gap > L / 2) gap -= L;
          const scale = gap > 34 ? 0.82 : gap > 22 ? 0.92 : gap < 7 ? 1.06 : 1;
          leader.update(dt, scale);
          carFx(leader.state, leaderModel, dt, 'L');
        }
        // gaz coupé → retour de flamme occasionnel
        if (player.prevThrottle > 0.8 && player.throttle < 0.4 && player.rpm > 5200) { playerModel.flame.visible = true; playerModel.flameT = 0.12; Sound.backfire(); if (profile.current !== 'hachi') Sound.blowoff(); }
        player.prevThrottle = player.throttle;
        updateStuck(dt);
      } else {
        // compte à rebours : moteur qui rugit sur place
        player.rpm += ((1500 + input.throttle * 5000) - player.rpm) * Math.min(1, dt * 6);
        player.throttle = input.throttle;
      }
      if (playerModel.flameT > 0) { playerModel.flameT -= dt; playerModel.flicker(); if (playerModel.flameT <= 0) playerModel.flame.visible = false; }
      // affichage interpolé entre les deux derniers pas physiques : mouvement régulier à 60, 90, 120 ou 144 Hz
      const pv = interp(player, phase === 'play' ? acc / STEP : 1);
      playerModel.update(pv, dt, input.brake > 0.1 || input.handbrake > 0.5);
      if (ghostCar && phase === 'play') updateGhost(dt);
      leaderModel.update(leader.state, dt, false);
      carFx(pv, playerModel, dt, 'P');
      updateCamera(dt, pv, false);
      Sound.update(player, profile.current, true);
      updateHUD(dt);
    } else if (phase === 'pause') {
      updateCamera(0, player, false);
    }

    if (isle && life && player) {
      if (phase === 'play' || phase === 'count') lifeTick(dt);
      lifeDraw(dt, t);
      mpSendTick(dt);
    }
    if (phase !== 'pause') { smoke.update(dt); sparks.update(dt); }
    skids.flush();
    updateFavicon(dt);
    world.update(t, camera.position);
    // ombre qui suit la voiture visible
    const focus = phase === 'play' || phase === 'count' || phase === 'pause' ? player : leader.state;
    if (focus) {
      const fy = gy(focus.x, focus.z);
      world.sun.target.position.set(focus.x, fy, focus.z);
      const sd = world.theme.sun;
      world.sun.position.set(focus.x + sd[0] * 60, fy + Math.max(sd[1], 0.35) * 60, focus.z + sd[2] * 60);
    }
    if (dbgTrace && phase === 'play') { const o = playerModel.root.position; dbgTrace.push(now, o.x, o.z, player.speed); }
    const tB = performance.now();
    renderer.render(scene, camera);
    perf.js += (tB - tA - perf.js) * 0.05; perf.render += (performance.now() - tB - perf.render) * 0.05;
    autoQuality(dt); // après le rendu : un éventuel redimensionnement s'applique à l'image suivante
  }
  const view = {};
  function interp(st, a) {
    for (const k in st) view[k] = st[k];
    if (st.x0 === undefined) return view;
    let dh = st.heading - st.h0;
    if (dh > Math.PI) dh -= 2 * Math.PI; else if (dh < -Math.PI) dh += 2 * Math.PI;
    view.x = st.x0 + (st.x - st.x0) * a; view.z = st.z0 + (st.z - st.z0) * a; view.heading = st.h0 + dh * a;
    return view;
  }
  function lapS() { return (track.count + player.idx) % track.count * track.step + (lap.n * track.length) ; }

  let stuckT = 0;
  function updateStuck(dt) {
    const offFar = isle ? player.wetT > 0.8 : Math.abs(player.lat0) > track.wall + 2;
    if ((player.speed < 1.2 && input.throttle > 0.5) || offFar) stuckT += dt; else stuckT = 0;
    if (stuckT > 2.5) { stuckT = 0; respawn(); }
  }
  function respawn() {
    if (isle) { isleRespawn(); return; }
    const i = player.idx;
    lose('Replacement');
    resetPlayer(i, 10);
    player.prevIdx = i;
    popup('Replacé sur la piste', 'apex');
  }

  // qualité automatique : d'abord la résolution par petits pas (invisible), puis un cran de qualité si ça ne suffit pas.
  // Remonte doucement quand l'appareil a de la marge.
  function autoQuality(dt) {
    if (settings.quality !== 'auto' || phase !== 'play') return;
    qCheckT += dt;
    if (qCheckT < 2) return;
    qCheckT = 0;
    if (frameAvg > 20) {
      // le coût de rendu suit le nombre de pixels (dpr²) : on vise 60 i/s en un ou deux pas, pas en dix
      fastT = 0;
      const want = Math.max(0.6, dprScale * Math.sqrt(16.7 / frameAvg));
      if (dprScale - want > 0.05) { dprScale = want; resize(); }
      else if (frameAvg > 24 && qLevel !== 'low') {
        qLevel = qLevel === 'high' ? 'med' : 'low';
        quality = QUALITY[qLevel];
        world.sun.castShadow = quality.shadows;
        dprScale = Math.min(1, dprScale + 0.2);
        resize();
      }
    } else if (frameAvg < 14 && dprScale < 1) {
      fastT += 2;
      if (fastT >= 8) { fastT = 0; dprScale = Math.min(1, dprScale + 0.1); resize(); }
    } else fastT = 0;
  }

  // ---------- favicon vivant : le multiplicateur du combo s'affiche dans l'onglet (bureau) ----------
  const favLink = document.querySelector('link[rel="icon"][type="image/svg+xml"]');
  const favBase = favLink ? favLink.href : null;
  const favImg = new Image();
  if (favBase) favImg.src = favBase;
  const favCv = document.createElement('canvas'); favCv.width = favCv.height = 64;
  let favShown = '', favT = 0;
  function updateFavicon(dt) {
    if (isTouch || !favBase) return;
    favT += dt; if (favT < 0.25) return; favT = 0;
    const key = phase === 'play' && score.combo > 0 && score.mult >= 2 ? 'x' + Math.floor(score.mult) : '';
    if (key === favShown) return;
    favShown = key;
    if (!key) { favLink.href = favBase; return; }
    const g = favCv.getContext('2d');
    g.clearRect(0, 0, 64, 64);
    if (favImg.complete) g.drawImage(favImg, 0, 0, 64, 64);
    g.beginPath(); g.moveTo(26, 30); g.arcTo(64, 30, 64, 64, 9); g.arcTo(64, 64, 18, 64, 9); g.arcTo(18, 64, 18, 30, 9); g.arcTo(18, 30, 64, 30, 9); g.closePath();
    g.fillStyle = '#7b8cff'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#07080a'; g.stroke();
    g.fillStyle = '#07080a'; g.font = '900 28px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(key, 41, 48);
    favLink.href = favCv.toDataURL('image/png');
  }

  // ---------- HUD ----------
  const hudCache = {}, hudEl = {};
  const el = (id) => hudEl[id] || (hudEl[id] = $(id));
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; el(id).textContent = v; } }
  function setNum(id, n) { if (hudCache[id] !== n) { hudCache[id] = n; el(id).textContent = n.toLocaleString('fr-FR'); } }
  function setBar(id, k) { k = Math.round(k * 200) / 200; if (hudCache[id] !== k) { hudCache[id] = k; el(id).style.transform = `scaleX(${k})`; } }
  function fmtTime(s) { const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; }
  function updateHUD(dt) {
    const st = player;
    setNum('hudSpeed', Math.round(st.speed * 3.6));
    setText('hudGear', st.reversing ? 'R' : String(st.gear));
    const r = clamp((st.rpm - 900) / (RPM_MAX - 900), 0, 1);
    setBar('rpmFill', r);
    if (hudCache.red !== r > 0.88) { hudCache.red = r > 0.88; el('rpmBar').classList.toggle('red', r > 0.88); }
    setNum('hudTotal', Math.round(score.total));
    setText('hudTime', fmtTime(score.runT));
    if (!isle) setText('hudLap', mode === 'free' ? `Tour ${lap.n + 1}` : `${Math.round(clamp(lap.progress / track.length, 0, 1) * 100)} %`);
    let tandemNear = false;
    if (mode === 'tandem') tandemNear = Math.hypot(st.x - leader.state.x, st.z - leader.state.z) < 11;
    // chaleur du combo : le bord de l'écran rougeoie avec le multiplicateur
    const heat = score.combo > 0 ? Math.round(clamp((score.mult - 1.6) / 4.5, 0, 1) * (settings.reduce ? 0.45 : 1) * 20) / 20 : 0;
    if (hudCache.heat !== heat) { hudCache.heat = heat; el('heat').style.opacity = heat; }
    const comboEl = el('combo');
    const active = score.combo > 0;
    if (hudCache.active !== active) { hudCache.active = active; comboEl.classList.toggle('idle', !active); }
    if (active) {
      setNum('comboPts', Math.round(score.combo));
      setText('comboMult', 'x' + score.mult.toFixed(1));
      const ang = Math.abs(st.slip) * 180 / Math.PI;
      setBar('angleFill', clamp(ang / 70, 0, 1));
      if (hudCache.warn !== score.idle > 0.3) { hudCache.warn = score.idle > 0.3; comboEl.classList.toggle('warn', score.idle > 0.3); }
      setText('comboTag', score.idle > 0.3 ? 'ENCAISSEMENT…' : (mode === 'tandem' && tandemNear ? 'TANDEM' : 'DRIFT'));
    }
    if (mode === 'tandem') {
      const d = Math.hypot(st.x - leader.state.x, st.z - leader.state.z);
      if (hudCache.tmShow !== 'flex') { hudCache.tmShow = 'flex'; el('tandemMeter').style.display = 'flex'; }
      setBar('tandemFill', clamp(1 - (d - 3) / 22, 0, 1));
    } else if (life && life.duel && life.duel.kind === 'tandem' && life.duel.state === 'run') {
      if (hudCache.tmShow !== 'flex') { hudCache.tmShow = 'flex'; el('tandemMeter').style.display = 'flex'; } // jauge remplie par duelTick
    } else if (hudCache.tmShow !== 'none') { hudCache.tmShow = 'none'; el('tandemMeter').style.display = 'none'; }
    drawMinimap();
  }

  // ---------- mini-carte ----------
  let mmBase = null, mmT = null;
  function drawMinimapBase() {
    const c = document.createElement('canvas'); c.width = c.height = 208;
    const g = c.getContext('2d');
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < track.count; i++) { minX = Math.min(minX, track.px[i]); maxX = Math.max(maxX, track.px[i]); minZ = Math.min(minZ, track.pz[i]); maxZ = Math.max(maxZ, track.pz[i]); }
    const s = 176 / Math.max(maxX - minX, maxZ - minZ);
    const ox = 104 - (minX + maxX) / 2 * s, oz = 104 - (minZ + maxZ) / 2 * s;
    mmT = (x, z) => [ox + x * s, oz + z * s];
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i <= track.count; i++) { const [x, y] = mmT(track.px[i % track.count], track.pz[i % track.count]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 12; g.stroke();
    g.strokeStyle = 'rgba(243,239,228,.85)'; g.lineWidth = 6; g.stroke();
    for (const z of track.zones) {
      const [x, y] = mmT(track.px[z.mid] - track.tz[z.mid] * z.side * track.half, track.pz[z.mid] + track.tx[z.mid] * z.side * track.half);
      g.fillStyle = z.type === 'outer' ? '#ffb020' : '#38d6ff';
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    }
    const [sx, sy] = mmT(track.px[0], track.pz[0]);
    g.fillStyle = '#ffd23f'; g.fillRect(sx - 5, sy - 5, 10, 10);
    mmBase = c;
  }
  function drawMinimap() {
    const g = $('minimap').getContext('2d');
    g.clearRect(0, 0, 208, 208);
    if (isle) { drawIsleMinimap(g); return; }
    g.drawImage(mmBase, 0, 0);
    const dot = (st, col, r) => { const [x, y] = mmT(st.x, st.z); g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, r + 2.5, 0, 7); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
    if (mode === 'tandem') dot(leader.state, '#ff7ad9', 6);
    dot(player, '#ff3d3d', 7);
  }

  // ---------- déroulé d'une session ----------
  let screenId = null, snapCam = false;
  function show(id) {
    if (id === 'garage' && screenId !== 'garage') snapCam = true;
    screenId = id;
    if (id) $('prompt').hidden = true;
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    const scr = id && $(id);
    if (scr) { const f = scr.querySelector('.btn.primary, button'); if (f && !isTouch) setTimeout(() => f.focus({ preventScroll: true }), 30); }
  }
  let returnTo = 'menu';
  function startRun() {
    ensureAudio();
    if (track.def.id !== TRACKS[trackIdx].id) loadTrack(trackIdx);
    resetScore();
    skids.clear(); smoke.clear();
    lap.progress = 0; lap.n = 0; lap.wrongT = 0;
    const idx = mode === 'free' ? 4 : startIndex();
    resetPlayer(idx, mode === 'free' ? 0 : 16);
    lap.progress = mode === 'free' ? 0 : -(track.count - idx) * track.step;
    leader.reset((idx + Math.round(16 / track.step)) % track.count);
    leader.state.speed = 16;
    phase = 'count';
    show(null);
    $('hud').hidden = false;
    setTouchVisible();
    $('hudMode').textContent = adv ? advLabel() : mode === 'run' ? 'RUN NOTÉ' : mode === 'tandem' ? 'TANDEM' : 'LIBRE';
    clearExplore();
    if (adv && adv.explore) buildExplore();
    const goal = $('hudGoal');
    goal.hidden = !adv; goal.className = 'hud-goal';
    if (adv && !adv.explore) goal.textContent = 'Objectif · ' + Story.goalText(Story.CHAPTERS[adv.ci].missions[adv.k].goal);
    ghostRec = mode === 'run' ? Ghost.recorder(profile.current) : null;
    buildGhost();
    el('hudBest').classList.remove('ahead', 'behind'); el('hudBest').dataset.d = ''; hudCache.hudBest = null;
    const b = bests[track.def.id + ':' + mode];
    $('hudBest').textContent = b ? 'RECORD ' + b.toLocaleString('fr-FR') : 'RECORD —';
    camPos.set(player.x - Math.cos(player.heading) * 8, gy(player.x, player.z) + 3, player.z - Math.sin(player.heading) * 8);
    camLook.set(player.x, gy(player.x, player.z) + 1, player.z);
    countdown();
    requestWake();
    announce(`Départ : ${track.def.name}, mode ${$('hudMode').textContent.toLowerCase()}.`);
  }
  let countTimer = null;
  function countdown() {
    const el = $('count');
    el.hidden = false;
    let n = 3;
    const tick = () => {
      if (phase !== 'count') return;
      el.innerHTML = `<span>${n || 'GO'}</span>`;
      Sound.count(n === 0);
      if (n === 0) { phase = 'play'; last = performance.now(); acc = 0; setTimeout(() => { el.hidden = true; }, 700); return; }
      n--; countTimer = setTimeout(tick, 800);
    };
    tick();
  }
  function pauseGame() {
    if (phase !== 'play' && phase !== 'count') return;
    clearTimeout(countTimer); $('count').hidden = true;
    phase = 'pause';
    Sound.suspend();
    clearTouch();
    show('pause');
  }
  function resumeGame() {
    show(null);
    phase = 'count';
    last = performance.now();
    countdownShort();
  }
  function countdownShort() {
    const el = $('count'); el.hidden = false;
    el.innerHTML = '<span>GO</span>';
    setTimeout(() => { if (phase === 'count') { phase = 'play'; last = performance.now(); } el.hidden = true; }, 500);
  }
  function finishRun() {
    if (isle) { finishIsle(); return; }
    bank();
    phase = 'results';
    Sound.suspend();
    $('hud').hidden = true;
    setTouchVisible();
    $('banner').style.display = 'none';
    const key = track.def.id + ':' + mode;
    const total = Math.round(score.total);
    const prev = bests[key] || 0;
    const record = total > prev && total > 0;
    if (record) { bests[key] = total; store.set('bests', bests); }
    // nouveau record noté : son run devient le fantôme de la piste
    const ghostSaved = record && mode === 'run' && ghostRec && ghostRec.d.length >= 50;
    if (ghostSaved) { ghosts[track.def.id] = Ghost.pack(ghostRec); store.set('ghosts', ghosts); }
    ghostRec = null; dropGhost();
    const par = track.def.par * (mode === 'tandem' ? 1.25 : 1);
    const r = total / par;
    const grade = r >= 1 ? 'S' : r >= 0.75 ? 'A' : r >= 0.5 ? 'B' : r >= 0.28 ? 'C' : 'D';
    $('resGrade').textContent = mode === 'free' ? '—' : grade;
    $('resTotal').textContent = total.toLocaleString('fr-FR') + ' pts';
    $('resRecord').innerHTML = record ? `<span class="record">NOUVEAU RECORD</span>${ghostSaved ? '<span class="hint"> · ton fantôme t’attendra au prochain run</span>' : ''}` : prev ? `<span class="hint">Record : ${prev.toLocaleString('fr-FR')}</span>` : '';
    $('resCombo').textContent = Math.round(score.best).toLocaleString('fr-FR');
    $('resClips').textContent = `${score.clips} / ${track.zones.length}`;
    $('resAngle').textContent = Math.round(score.maxAngle) + '°';
    $('resDrift').textContent = Math.round(score.driftT / Math.max(score.runT, 1) * 100) + ' %';
    $('resEyebrow').textContent = `${mode === 'run' ? 'Run noté' : mode === 'tandem' ? 'Tandem' : 'Libre'} · ${track.def.name}`;
    $('resHeadline').textContent = mode === 'free' ? '« Séance libre : rien n’est noté, tout est permis. »' : record && grade !== 'D' ? `« Record battu sur ${track.def.name}. »` : HEADLINES[grade].replace('%', track.def.name);
    // gains en yens + défis
    const res = Economy.applyRun(profile, { day: today(), trackId: track.def.id, trackName: track.def.name, mode, score: total, grade: mode === 'free' ? null : grade, clips: score.clips, zones: track.zones.length, maxAngle: score.maxAngle, bestCombo: Math.round(score.best), driftPct: Math.round(score.driftT / Math.max(score.runT, 1) * 100), record: record && mode !== 'free' });
    saveProfile(); refreshWallet();
    $('payLines').innerHTML = res.payout.lines.map((l) => `<div><span>${l.label}</span><b>+${Economy.fmt(l.amount)}</b></div>`).join('') || '<div><span>Aucun gain sur ce run.</span></div>';
    $('payChal').innerHTML = res.challenges.map((c) => `<div>Défi réussi : ${c.label} · +${Economy.fmt(c.reward)}</div>`).join('');
    // aventure : objectifs de la mission, récompense, suite de l'histoire
    let fr = null;
    advNext = null;
    $('hudGoal').hidden = true;
    const rg = $('resGoal');
    rg.hidden = !adv;
    if (adv && !adv.explore) {
      const ch = Story.CHAPTERS[adv.ci], m = ch.missions[adv.k];
      fr = Story.finishMission(profile, adv.ci, adv.k, { score: total, grade, clips: score.clips, maxAngle: score.maxAngle, bestCombo: Math.round(score.best), driftPct: Math.round(score.driftT / Math.max(score.runT, 1) * 100), walls: score.walls });
      saveProfile(); refreshWallet();
      rg.innerHTML = `<div class="h">Mission · ${esc(m.title)} — ${fr.ok ? 'réussie' : 'ratée'}</div>` + fr.rows.map((r) => `<div class="r ${r.ok ? 'ok' : 'ko'}"><i aria-hidden="true">${r.ok ? '✓' : '✗'}</i><span>${esc(r.label)}<span class="sr">${r.ok ? ', atteint' : ', manqué'}</span></span></div>`).join('');
      if (fr.reward) $('payChal').insertAdjacentHTML('afterbegin', `<div>Mission réussie : ${esc(m.title)} · +${Economy.fmt(fr.reward)}</div>`);
      if (fr.ok) {
        const ci = Story.nextMission(profile, adv.ci) >= 0 ? adv.ci : adv.ci + 1;
        if (ci < Story.CHAPTERS.length && Story.chapterOpen(profile, ci)) { advNext = { ci, k: Story.nextMission(profile, ci) }; advSel = ci; }
      }
    } else if (adv && adv.explore) {
      const z = Story.zoneProgress(profile, adv.explore);
      rg.innerHTML = `<div class="h">Exploration · ${esc(track.def.name)}</div><div class="r"><span>Archives ${z.arch} / 5 · défis de rue ${z.street} / ${Story.STREET.length} · rencontre ${z.npc} / 1</span></div>`;
    }
    $('menuBtn').firstElementChild.textContent = adv ? 'Carte' : 'Menu';
    $('againBtn').firstElementChild.textContent = advNext ? 'Mission suivante' : 'Rejouer';
    $('payBal').textContent = 'Solde : ' + Economy.fmt(profile.money);
    countUp($('payTotal'), res.payout.total + res.challenges.reduce((a, c) => a + c.reward, 0) + (fr ? fr.reward : 0));
    show('results');
    if (fr) {
      const ch = Story.CHAPTERS[adv.ci];
      talk(fr.lines, () => {
        if (!fr.chapterDone) return;
        talk(ch.outro, () => {
          const nx = Story.CHAPTERS[adv ? adv.ci + 1 : -1];
          if (nx) toast(`Chapitre ${adv.ci + 2} ouvert : ${nx.title} · ${TRACKS[trackIndexOf(nx.track)].name}`, 'chal');
          else toast('Aventure terminée. Les six lieux restent à explorer.', 'chal');
        });
      });
    }
    announce(`Session terminée. ${total} points${mode !== 'free' ? ', note ' + grade : ''}.${record ? ' Nouveau record.' : ''}`);
    releaseWake();
  }
  function countUp(el, to) {
    const t0 = performance.now(), dur = settings.reduce ? 1 : 900;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = Economy.fmt(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick); else if (to > 0) Sound.cash();
    };
    requestAnimationFrame(tick);
  }
  function toMenu() {
    phase = 'menu';
    ghostRec = null; dropGhost();
    claimDaily(); refreshWallet();
    Sound.suspend();
    $('hud').hidden = true; clearTouch(); setTouchVisible(); $('count').hidden = true;
    $('hudGoal').hidden = true;
    if (isle) leaveIsle();
    if (adv) { leaveAdventureRun(); openAdventure(); } else show('menu');
    releaseWake();
  }

  let wake = null;
  async function requestWake() { try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch (e) { wake = null; } }
  function releaseWake() { try { wake && wake.release(); } catch (e) { /* rien */ } wake = null; }
  document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'play') pauseGame(); });

  // ---------- menus ----------
  function pressGroup(container, attr, value) {
    for (const b of container.querySelectorAll('[' + attr + ']')) b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(value)));
  }
  function buildTrackList() {
    const list = $('trackList');
    list.innerHTML = '';
    TRACKS.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'opt track-opt'; b.dataset.track = i;
      const best = bests[t.id + ':' + mode];
      b.innerHTML = `<span class="swatch sw-${t.id}" aria-hidden="true"></span><span><b>${t.name}</b><br><small>${t.time} · ${t.jp}</small></span><span class="best">Record<b>${best ? best.toLocaleString('fr-FR') : '—'}</b></span>`;
      b.setAttribute('aria-pressed', String(i === trackIdx));
      b.addEventListener('click', () => { trackIdx = i; store.set('track', i); pressGroup(list, 'data-track', i); Sound.ui(); if (track.def.id !== t.id) loadTrack(i); });
      list.appendChild(b);
    });
  }
  for (const b of document.querySelectorAll('[data-mode]')) {
    b.addEventListener('click', () => { mode = b.dataset.mode; store.set('mode', mode); pressGroup(document.querySelector('#select .modes'), 'data-mode', mode); buildTrackList(); Sound.ui(); });
  }
  // ---------- portefeuille : toasts, solde, bonus du jour, carrière ----------
  function toast(text, cls) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (cls || ''); el.textContent = text;
    box.appendChild(el);
    const inGame = !$('hud').hidden;
    while (box.children.length > (inGame ? 2 : 3)) box.firstChild.remove(); // en jeu : deux au plus, la piste reste visible
    document.body.classList.add('toasting');
    setTimeout(() => { el.remove(); if (!box.children.length) document.body.classList.remove('toasting'); }, 3300);
    announce(text);
  }
  function refreshWallet() { $('menuWallet').textContent = Economy.fmt(profile.money); refreshFrontPage(); }
  // manchette et bandeau « dernière minute » du menu : date, numéro d'édition (= runs joués), records par piste
  const HEADLINES = { S: '« % : une démonstration. »', A: '« Du grand art sur %. »', B: '« Belle ligne, angle à creuser. »', C: '« Des bases, encore timides. »', D: '« Rentrée discrète au paddock. »' };
  function refreshFrontPage() {
    const d = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('mastDate').textContent = d.charAt(0).toUpperCase() + d.slice(1);
    $('mastNo').textContent = 'N° ' + String(profile.stats.runs + 1).padStart(3, '0');
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const items = TRACKS.map((t) => { const b = bests[t.id + ':run']; return b ? `<b>${esc(t.name)}</b> · record <i>${b.toLocaleString('fr-FR')} pts</i>` : `<b>${esc(t.name)}</b> · <i>aucun record, la piste vous attend</i>`; });
    items.push(`Votre cagnotte · <i>${Economy.fmt(profile.money)}</i>`, `<b>Col de Yukimi</b> · neige tassée, adhérence réduite`);
    const row = items.map((h) => `<span>${h}</span>`).join('');
    $('ticker').innerHTML = row + row; // doublé : défilement sans couture
  }
  function claimDaily() {
    const d = Economy.claimDaily(profile, today());
    if (!d) return;
    saveProfile(); refreshWallet();
    setTimeout(() => { toast(`Bonus du jour · +${Economy.fmt(d.amount)}${d.streak > 1 ? ` · série de ${d.streak} jours` : ''}`, 'chal'); Sound.cash(); }, 600);
  }
  function openCareer() {
    const st = profile.stats;
    const cell = (l, v) => `<div>${l}<b>${v}</b></div>`;
    $('careerStats').innerHTML = cell('Solde', Economy.fmt(profile.money)) + cell('Runs terminés', st.runs) + cell('Total gagné', Economy.fmt(st.earned)) + cell('Meilleur gain', Economy.fmt(st.bestPayout));
    $('chalList').innerHTML = Economy.CHALLENGES.map((c) => `<li class="${profile.done[c.id] ? 'done' : ''}"><span class="ck" aria-hidden="true">${profile.done[c.id] ? '✓' : ''}</span><span>${c.label}<span class="sr">${profile.done[c.id] ? ', réussi' : ''}</span></span><b>${Economy.fmt(c.reward)}</b></li>`).join('');
    const fmtD = (t) => new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    $('logList').innerHTML = profile.log.slice(0, 15).map((l) => `<li><span>${fmtD(l.t)} · ${l.label.replace(/[<>&]/g, '')}</span><b class="${l.amount < 0 ? 'neg' : ''}">${l.amount < 0 ? '−' : '+'}${Economy.fmt(Math.abs(l.amount))}</b></li>`).join('') || '<li><span>Aucun mouvement pour l’instant.</span></li>';
    show('career');
  }

  // ---------- atelier ----------
  const SHOP_VIEWS = { car: { a: null, r: 7, h: 1.7 }, body: { a: 0.75, r: 6.4, h: 1.5 }, paint: { a: 1.57, r: 6.6, h: 1.35 }, wheels: { a: 0.62, r: 3.3, h: 0.55, look: 0.35, fwd: 1.2 }, chassis: { a: 1.15, r: 4.4, h: 2.1, look: 0.75 }, perf: { a: 2.5, r: 5.6, h: 1.25 }, tune: { a: 1.2, r: 5.4, h: 0.45, look: 0.4 } };
  let shopView = SHOP_VIEWS.car, garageYaw = 0;
  const shop = createShop({
    profile,
    save() { saveProfile(); refreshWallet(); },
    preview(kind, cfg) { showKind = kind; showCfg = cfg; buildCars(true); },
    setView(tab) { shopView = SHOP_VIEWS[tab] || SHOP_VIEWS.car; garageYaw = 0; },
    close() { closeShop(); },
    carChanged() { /* la fiche physique est relue au départ du run (resetPlayer) */ },
    sound: Sound,
    toast,
  });
  function openShop() { ensureAudio(); show('garage'); shop.open(); }
  function closeShop() { shop.leave(); showKind = null; showCfg = null; buildCars(); Sound.ui(); show(shopReturn); shopReturn = 'menu'; }
  let shopReturn = 'menu';
  // glisser sur la scène pour tourner autour de la voiture
  let yawDrag = null;
  canvas.addEventListener('pointerdown', (e) => { if (screenId === 'garage') yawDrag = { x: e.clientX, y0: garageYaw, id: e.pointerId }; });
  addEventListener('pointermove', (e) => { if (yawDrag && yawDrag.id === e.pointerId) garageYaw = yawDrag.y0 - (e.clientX - yawDrag.x) * 0.008; });
  addEventListener('pointerup', () => { yawDrag = null; });


  // ---------- aventure : « Le Tour de l'Île » (logique dans story.js) ----------
  // adv : null (jeu normal) | { ci, k } mission en cours | { explore: trackId, ci } exploration d'un lieu
  let adv = null, advSel = Story.currentChapter(profile), advNext = null, explore = null, dlg = null;
  const trackIndexOf = (id) => TRACKS.findIndex((t) => t.id === id);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function advLabel() {
    if (adv.explore) return 'EXPLORATION';
    const m = Story.CHAPTERS[adv.ci].missions[adv.k];
    if (m.mode !== 'tandem') return 'MISSION';
    const lead = Story.CAST[m.brief[0][0]];
    return 'TANDEM · ' + (lead.name || 'LEADER').split(' ')[0].toUpperCase();
  }

  // dialogues : une ligne à la fois ; toucher, Entrée ou Espace pour continuer, Échap pour passer.
  // choices (facultatif) : [{ label, act }] proposés après la dernière ligne ; done(act) reçoit le choix (le dernier = refus).
  function talk(lines, done, choices) {
    if (!lines || !lines.length) { if (done) done(); return; }
    dlg = { lines, i: 0, done, choices: choices && choices.length ? choices : null };
    $('dialog').hidden = false;
    showLine();
    if (!isTouch) setTimeout(() => $('dlgNext').focus({ preventScroll: true }), 30);
  }
  function showLine() {
    const [who, text] = dlg.lines[dlg.i], c = Story.CAST[who] || Story.CAST.narr;
    const face = $('dlgFace');
    face.textContent = c.ini; face.style.background = c.col; face.classList.toggle('narr', who === 'narr');
    $('dlgName').textContent = c.name; $('dlgRole').textContent = who === 'narr' ? '' : c.role;
    $('dlgText').textContent = text;
    document.querySelector('.dlg-card').classList.toggle('narr', who === 'narr');
    const last = dlg.i === dlg.lines.length - 1, ask = last && dlg.choices;
    $('dlgNext').firstElementChild.textContent = last ? 'Continuer' : 'Suite';
    $('dlgFoot').hidden = !!ask;
    const ch = $('dlgChoices');
    ch.hidden = !ask;
    ch.innerHTML = ask ? dlg.choices.map((c, k) => `<button class="btn${k === 0 ? ' primary' : k === dlg.choices.length - 1 ? ' ghost' : ''}" data-choice="${k}"><i aria-hidden="true">${k + 1}</i><span>${esc(c.label)}</span></button>`).join('') : '';
    if (ask && !isTouch) setTimeout(() => { const b = ch.querySelector('button'); if (b) b.focus({ preventScroll: true }); }, 30);
    announce((c.name ? c.name + ' : ' : '') + text + (ask ? '. Choix : ' + dlg.choices.map((x) => x.label).join(', ') : ''));
  }
  function dlgNext(all, pick) {
    if (!dlg) return;
    Sound.ui();
    if (!all && dlg.i < dlg.lines.length - 1) { dlg.i++; showLine(); return; }
    // une question attend sa réponse : passer saute jusqu'à elle, on ne la contourne pas
    if (dlg.choices && pick == null) { if (dlg.i !== dlg.lines.length - 1) { dlg.i = dlg.lines.length - 1; showLine(); } return; }
    const done = dlg.done, act = dlg.choices ? dlg.choices[pick].act : undefined;
    dlg = null; $('dialog').hidden = true; $('dlgChoices').hidden = true; $('dlgFoot').hidden = false;
    if (done) done(act);
  }
  $('dialog').addEventListener('click', (e) => {
    const c = e.target.closest('[data-choice]');
    if (c) { dlgNext(false, +c.dataset.choice); return; }
    if (dlg && dlg.choices && dlg.i === dlg.lines.length - 1) return; // on attend un choix
    dlgNext(!!e.target.closest('#dlgSkip'));
  });
  addEventListener('keydown', (e) => {
    if (!dlg) return;
    const asking = dlg.choices && dlg.i === dlg.lines.length - 1;
    if (asking && /^[1-9]$/.test(e.key) && +e.key <= dlg.choices.length) { e.preventDefault(); e.stopImmediatePropagation(); dlgNext(false, +e.key - 1); return; }
    if (asking && (e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.dataset.choice != null) { e.stopImmediatePropagation(); return; } // le bouton choisi reçoit son clic
    if (asking && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); dlgNext(false, dlg.choices.length - 1); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) dlgNext(false); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); dlgNext(true); }
  }, true);

  // carte de l'île : les six lieux dans l'ordre du Tour, en boucle autour du volcan
  const MAPXY = { minato: [62, 62], shiohama: [150, 34], akane: [250, 52], kaigan: [266, 128], piton: [168, 146], yukimi: [74, 132] };
  function openAdventure() {
    if (!Story.chapterOpen(profile, advSel)) advSel = Story.currentChapter(profile);
    renderAdventure();
    show('adventure');
    const first = !Story.ensure(profile).seen.prologue;
    if (first) { Story.ensure(profile).seen.prologue = true; saveProfile(); talk([['narr', 'Le Tour de l’Île : six lieux, six chapitres. Touche un lieu ouvert sur la carte pour lire son histoire, jouer ses missions ou l’explorer librement.']]); }
  }
  function renderAdventure() {
    const C = Story.CHAPTERS;
    let svg = '<path class="isle" d="M34,96 C26,52 80,14 152,16 C232,14 302,36 300,96 C298,150 242,178 166,176 C92,176 42,150 34,96 Z"/>';
    svg += '<path d="M156,104 l12,-20 l12,20 z" fill="var(--s4)" stroke="var(--hair-2)"/><text x="168" y="116" text-anchor="middle" font-size="7.5" fill="var(--fg-3)" letter-spacing=".1em">VOLCAN</text>';
    C.forEach((c, ci) => {
      const a = MAPXY[c.track], b = MAPXY[C[(ci + 1) % C.length].track];
      if (ci < C.length - 1) svg += `<path class="route${Story.chapterDone(profile, ci) ? ' done' : ''}" d="M${a[0]},${a[1]} Q${(a[0] + b[0]) / 2 + (168 - (a[0] + b[0]) / 2) * -0.15},${(a[1] + b[1]) / 2 + (96 - (a[1] + b[1]) / 2) * -0.15} ${b[0]},${b[1]}"/>`;
    });
    C.forEach((c, ci) => {
      const [x, y] = MAPXY[c.track], open = Story.chapterOpen(profile, ci), done = Story.chapterDone(profile, ci);
      const name = TRACKS[trackIndexOf(c.track)].name;
      svg += `<g class="node${open ? ' open' : ' locked'}${done ? ' done' : ''}${ci === advSel ? ' sel' : ''}" data-ci="${ci}" tabindex="0" role="button" aria-pressed="${ci === advSel}" aria-label="Chapitre ${ci + 1}, ${esc(name)}${done ? ', terminé' : open ? '' : ', fermé'}">`
        + `<circle cx="${x}" cy="${y}" r="11"/><text class="n" x="${x}" y="${y}">${done ? '✓' : ci + 1}</text><text x="${x}" y="${y + 22}">${c.track[0].toUpperCase() + c.track.slice(1)}</text></g>`;
    });
    $('advMap').innerHTML = svg;
    const pr = Story.progress(profile);
    $('advProg').innerHTML = `<span>Missions <b>${pr.missions} / ${pr.total}</b></span><span>Trouvailles <b>${pr.found} / ${pr.foundTotal}</b></span><span>Solde <b>${Economy.fmt(profile.money)}</b></span>`;

    const ci = advSel, ch = C[ci], open = Story.chapterOpen(profile, ci), nx = Story.nextMission(profile, ci);
    const tname = TRACKS[trackIndexOf(ch.track)].name;
    let h = `<div class="adv-ch"><div class="label">Chapitre ${ci + 1} · ${esc(tname)}</div><h3>${esc(ch.title)}<span class="jp">${ch.jp}</span></h3><p>${open ? esc(ch.pitch) : 'Termine le chapitre précédent pour ouvrir ce lieu.'}</p></div>`;
    h += '<ol class="adv-ms">' + ch.missions.map((m, k) => {
      const done = Story.missionDone(profile, m.id), can = Story.missionOpen(profile, ci, k);
      const cls = done ? 'done' : k === nx ? 'next' : can ? '' : 'locked';
      return `<li class="${cls}"><span class="ck" aria-hidden="true">${done ? '✓' : ''}</span><div><b><span class="mode">${m.mode === 'tandem' ? 'Tandem' : 'Run'}</span>${esc(m.title)}</b><small>${esc(Story.goalText(m.goal))}</small></div><span class="rw">${done ? 'Fait' : Economy.fmt(m.reward)}</span></li>`;
    }).join('') + '</ol>';
    if (open) {
      h += '<div class="adv-acts">';
      if (nx >= 0) h += `<button class="btn primary" data-play="${nx}"><span>Jouer : ${esc(ch.missions[nx].title)}</span></button>`;
      else h += '<button class="btn" data-play="2"><span>Rejouer la finale du chapitre</span></button>';
      h += `<button class="btn" data-explore><span>Explorer le lieu</span></button><button class="btn ghost" data-story><span>Revoir l’histoire</span></button></div>`;
      if (isle) h += '<p class="sub" style="margin:0 0 10px">Tu es sur l’île : « Retour » te remet sur la route, là où tu t’es arrêté.</p>';
      const z = Story.zoneProgress(profile, ch.track), Z = Story.ZONES[ch.track];
      h += `<div class="adv-explore">Exploration libre : <b>archives ${z.arch} / 5</b> · <b>défis de rue ${z.street} / ${Story.STREET.length}</b> · <b>rencontre ${z.npc} / 1</b>. Les archives flottent au bord de la route, les bornes lancent un défi au passage.</div>`;
      h += `<details class="adv-notes"><summary>Carnet du club · ${z.arch} / 5</summary><ol>` + Z.archives.map((a, k) => Story.ensure(profile).arch[ch.track + ':' + k] ? `<li><b>${esc(a[0])}</b> — ${esc(a[1])}</li>` : '<li class="miss">Archive à retrouver sur ce lieu.</li>').join('') + '</ol></details>';
    }
    $('advPanel').innerHTML = h;
  }
  function pickNode(e) {
    const g = e.target.closest('.node'); if (!g) return;
    const ci = +g.dataset.ci;
    if (!Story.chapterOpen(profile, ci)) { toast('Lieu fermé : termine le chapitre précédent.', 'lost'); return; }
    advSel = ci; Sound.ui(); renderAdventure();
    const n = $('advMap').querySelector(`[data-ci="${ci}"]`); if (n && e.type === 'keydown') n.focus();
  }
  $('advMap').addEventListener('click', pickNode);
  $('advMap').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickNode(e); } });
  $('advPanel').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const ch = Story.CHAPTERS[advSel];
    if (b.dataset.play != null) playMission(advSel, +b.dataset.play);
    else if (b.dataset.explore != null) exploreZone(advSel);
    else if (b.dataset.story != null) { Sound.ui(); talk(Story.chapterDone(profile, advSel) ? [...ch.intro, ...ch.outro] : ch.intro); }
  });
  // la scène derrière les dialogues montre déjà le lieu de la mission
  function goTrack(id) { const ti = trackIndexOf(id); if (track.def.id !== id) { trackIdx = ti; loadTrack(ti); } trackIdx = ti; }
  function playMission(ci, k) {
    if (!Story.missionOpen(profile, ci, k)) return;
    const ch = Story.CHAPTERS[ci], m = ch.missions[k];
    ensureAudio(); Sound.ui();
    leaveIsle();
    adv = { ci, k }; mode = m.mode;
    show(null); phase = 'menu';
    goTrack(ch.track);
    const go = () => talk(m.brief, startRun);
    const seen = Story.ensure(profile).seen;
    if (!seen[ch.id]) { seen[ch.id] = true; saveProfile(); talk(ch.intro, go); } else go();
  }
  function exploreZone(ci) {
    if (!Story.chapterOpen(profile, ci)) return;
    const ch = Story.CHAPTERS[ci];
    ensureAudio(); Sound.ui();
    leaveIsle();
    adv = { explore: ch.track, ci }; mode = 'free';
    show(null); goTrack(ch.track);
    startRun();
  }
  function leaveAdventureRun() {
    clearExplore();
    adv = null; advNext = null;
    mode = store.get('mode', 'run');
    $('menuBtn').firstElementChild.textContent = 'Menu';
    $('againBtn').firstElementChild.textContent = 'Rejouer';
  }

  // exploration : archives (daruma flottants), bornes de défi de rue, rencontre (colonne de lumière)
  function buildExplore() {
    const id = adv.explore, Z = Story.ZONES[id], S = Story.ensure(profile), N = track.count;
    const group = new THREE.Group(), items = [], mats = [], geos = [];
    const mat = (c, add) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: !!add, opacity: add ? 0.35 : 1, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !add }); mats.push(m); return m; };
    const geo = (g) => { geos.push(g); return g; };
    const at = (f, lat) => { const i = Math.round(f * N) % N; return { i, x: track.px[i] - track.tz[i] * lat, z: track.pz[i] + track.tx[i] * lat }; };
    const body = geo(new THREE.SphereGeometry(0.55, 14, 10)), face = geo(new THREE.CircleGeometry(0.3, 14)), red = mat(0xd8262d), white = mat(0xf4f1e6);
    Story.ARCHIVE_AT.forEach((f, k) => {
      if (S.arch[id + ':' + k]) return;
      const p = at(f, (k % 2 ? 1 : -1) * (track.half - 2.2));
      const g = new THREE.Group();
      const b = new THREE.Mesh(body, red); b.scale.set(1, 1.15, 1); g.add(b);
      const fc = new THREE.Mesh(face, white); fc.position.set(0, 0.08, 0.5); g.add(fc);
      g.position.set(p.x, gy(p.x, p.z) + 1.2, p.z);
      group.add(g); items.push({ kind: 'arch', k, ...p, r: 2.6, obj: g });
    });
    const postG = geo(new THREE.CylinderGeometry(0.14, 0.14, 4.2, 8)), barG = geo(new THREE.BoxGeometry(0.3, 0.5, track.def.width + 1.4)), blue = mat(0x7b8cff), glow = mat(0x7b8cff, true);
    Story.STREET.forEach((s, k) => {
      if (S.street[id + ':' + k]) return;
      const p = at(s.at, 0), g = new THREE.Group(), y = gy(p.x, p.z);
      for (const sd of [-1, 1]) { const q = new THREE.Mesh(postG, blue); q.position.set(0, 2.1, sd * (track.half + 0.7)); g.add(q); }
      const bar = new THREE.Mesh(barG, glow); bar.position.y = 4.1; g.add(bar);
      g.position.set(p.x, y, p.z); g.rotation.y = -track.heading[p.i];
      group.add(g); items.push({ kind: 'street', k, ...p, obj: g, def: Story.streetFor(adv.ci, k) });
    });
    if (!S.npc[id + ':0']) {
      const n = Z.npc, p = at(n.at, n.side * (track.half - 3)), c = Story.CAST[n.who];
      const beam = new THREE.Mesh(geo(new THREE.CylinderGeometry(1.1, 1.1, 9, 16, 1, true)), mat(new THREE.Color(c.col).getHex(), true));
      beam.position.set(p.x, gy(p.x, p.z) + 4.5, p.z);
      group.add(beam); items.push({ kind: 'npc', k: 0, ...p, r: 3.6, obj: beam, npc: n });
    }
    scene.add(group);
    explore = { id, group, items, mats, geos, active: null, t: 0 };
    renderExploreHud();
  }
  function clearExplore() {
    if (!explore) return;
    scene.remove(explore.group);
    for (const m of explore.mats) m.dispose();
    for (const g of explore.geos) g.dispose();
    explore = null;
  }
  function renderExploreHud() {
    if (!explore || explore.active) return;
    const z = Story.zoneProgress(profile, explore.id);
    const el = $('hudGoal'); el.className = 'hud-goal';
    el.textContent = `Exploration · archives ${z.arch}/5 · défis de rue ${z.street}/${Story.STREET.length} · rencontre ${z.npc}/1`;
  }
  function updateExplore(dt) {
    const st = player, N = track.count, E = explore;
    E.t += dt;
    for (const it of E.items) {
      if (it.taken) continue;
      if (it.kind === 'arch') { it.obj.rotation.y += dt * 1.6; it.obj.position.y += Math.sin(E.t * 2 + it.k) * dt * 0.25; }
      let hit;
      if (it.kind === 'street') { let d = Math.abs(st.idx - it.i); d = Math.min(d, N - d); hit = d <= 2 && !E.active; }
      else hit = Math.hypot(st.x - it.x, st.z - it.z) < it.r;
      if (!hit) continue;
      if (it.kind === 'arch') {
        it.taken = true; it.obj.visible = false;
        const r = Story.collect(profile, E.id, 'arch', it.k);
        if (r) { saveProfile(); refreshWallet(); Sound.clip(); vibrate(30); popup(`Archive +${Economy.fmt(r.reward)}`, 'clip'); toast(`Archive retrouvée : ${Story.ZONES[E.id].archives[it.k][0]} (à lire dans le carnet)`, 'chal'); }
        renderExploreHud();
      } else if (it.kind === 'npc') {
        it.taken = true; it.obj.visible = false;
        meet(it.npc);
      } else {
        E.active = { it, t: it.def.window, prog: 0 };
        popup('Défi de rue !', 'apex'); Sound.clip();
      }
    }
    const a = E.active;
    if (a) {
      const d = a.it.def, el = $('hudGoal');
      a.t -= dt;
      if (d.type === 'hold') { if (Math.abs(st.slip) * 180 / Math.PI >= d.angle && st.speed > 8) a.prog += dt; }
      else a.prog = Math.max(a.prog, score.combo);
      const need = d.type === 'hold' ? d.secs : d.pts;
      el.className = 'hud-goal street';
      el.textContent = d.type === 'hold' ? `Défi de rue · tiens ${d.angle}° : ${a.prog.toFixed(1)} / ${d.secs} s · reste ${Math.ceil(a.t)} s` : `Défi de rue · combo de ${d.pts.toLocaleString('fr-FR')} pts : ${Math.round(a.prog).toLocaleString('fr-FR')} · reste ${Math.ceil(a.t)} s`;
      if (a.prog >= need) {
        a.it.taken = true; a.it.obj.visible = false; E.active = null;
        const r = Story.collect(profile, E.id, 'street', a.it.k);
        if (r) { saveProfile(); refreshWallet(); Sound.bank(true); toast(`Défi de rue réussi · +${Economy.fmt(r.reward)}`, 'chal'); }
        renderExploreHud();
      } else if (a.t <= 0) { E.active = null; popup('Défi raté · repasse sous la borne', 'lost'); renderExploreHud(); }
    }
  }
  // rencontre : la partie s'arrête le temps du dialogue
  function meet(n) {
    phase = 'pause'; clearTouch(); Sound.suspend();
    talk(n.lines, () => {
      const r = Story.collect(profile, explore ? explore.id : '', 'npc', 0);
      if (r) { saveProfile(); refreshWallet(); toast(`${r.label} · +${Economy.fmt(r.reward)}`, 'chal'); }
      renderExploreHud();
      resumeGame();
    });
  }


  // ---------- l'île : monde ouvert continu (island.js) et sa vie (isleai.js) ----------
  // isle : null hors de l'île | { I : routes + terrain (calculés une fois), hubName : lieu le plus proche affiché }
  // life : circulation, rivaux, repères, GPS, duel, zone de glisse, radars, invite d'interaction (null hors de l'île)
  let isle = null, isleData = null, life = null;
  const isleQ = { i: -1, d: Infinity, lat: 0, edge: -1 };
  Object.assign(Story.CAST, IsleLife.RIVAL_CAST);
  const castOf = (who) => Story.CAST[who] || Story.CAST.narr;
  const nodeName = (k) => { const id = Object.keys(ISLE.hubs).find((h) => ISLE.hubs[h] === k); return id ? TRACKS[trackIndexOf(id)].name : IsleLife.NODE_NAMES[k] || k; };
  const fmtDist = (m) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);
  const envOn = (m) => m.root.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial) { o.material.envMap = envMap; o.material.needsUpdate = true; } });
  const starsTxt = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

  // spawn : { x, z, h } facultatif (multijoueur : on arrive derrière l'autre joueur)
  function enterIsland(spawn) {
    ensureAudio();
    clearExplore(); adv = null; advNext = null;
    if (!isleData) isleData = buildIsland(ISLE);
    clearLife();
    if (world) world.dispose();
    const I = isleData;
    isle = { I, hubName: '' };
    world = buildIslandWorld(scene, I, quality);
    renderer.toneMappingExposure = world.theme.exposure;
    buildEnv(); buildFx(); buildCars(true);
    playerModel.ground = I.terrain.at;
    const found = (profile.isle && profile.isle.found) || {};
    world.daruma.forEach((g, k) => { g.visible = !found[k]; });
    mode = 'free';
    resetScore();
    skids.clear(); smoke.clear();
    let x, z, h;
    const q = spawn ? I.nearestRoad(spawn.x - Math.cos(spawn.h) * 12, spawn.z - Math.sin(spawn.h) * 12, {}) : null;
    if (q && q.i >= 0) {
      x = I.X[q.i]; z = I.Z[q.i]; h = Math.atan2(I.TZ[q.i], I.TX[q.i]);
      if (Math.cos(h - spawn.h) < 0) h += Math.PI;
    } else { const hb = I.hubs.minato; x = hb.x + Math.cos(hb.heading) * 14; z = hb.z + Math.sin(hb.heading) * 14; h = hb.heading; }
    placePlayer(x, z, h, 0);
    dropGhost(); el('hudBest').classList.remove('ahead', 'behind');
    buildLife();
    phase = 'count';
    show(null);
    $('hud').hidden = false;
    setTouchVisible();
    $('hudMode').textContent = 'L’ÎLE';
    $('hudBest').textContent = mp ? 'SESSION À ' + mp.S.peers.size : 'MONDE OUVERT';
    $('hudGoal').hidden = false; renderIsleGoal();
    $('mapBtn').hidden = false;
    drawIsleMinimapBase();
    camPos.set(player.x - Math.cos(player.heading) * 8, gy(player.x, player.z) + 3, player.z - Math.sin(player.heading) * 8);
    camLook.set(player.x, gy(player.x, player.z) + 1, player.z);
    try { renderer.compile(scene, camera); } catch (e) { /* facultatif */ }
    countdown();
    requestWake();
    announce('L’île de Sideways : roule où tu veux. Approche-toi des gens, des portes et des pilotes pour interagir. M ouvre la carte.');
    if (!IsleLife.isleBag(profile).met.tuto) {
      IsleLife.isleBag(profile).met.tuto = true; saveProfile();
      setTimeout(() => toast(isTouch ? 'Approche-toi d’un repère, puis touche le bouton qui apparaît en bas' : 'Approche-toi d’un repère, puis appuie sur E · M : carte et GPS', 'chal'), 3400);
    }
  }
  // voiture du joueur posée à l'arrêt (ou lancée) sur l'île
  function placePlayer(x, z, h, speed) {
    const spec = player && player.spec && isle ? player.spec : Economy.tunedSpec(CAR_SPECS[profile.current], profile.cars[profile.current].perf, profile.cars[profile.current].tune);
    const st = createCarState(spec, x, z, h);
    st.vx = Math.cos(h) * speed; st.vz = Math.sin(h) * speed;
    Object.assign(st, { x0: x, z0: z, h0: h, idx: 0, prevIdx: 0, wetT: 0, roadD: 0 });
    player = st;
    if (skids) { skids.mark('P-1', x, z, 0, 0.3); skids.mark('P1', x, z, 0, 0.3); }
  }
  // retour au jeu sur piste : on reconstruit la piste courante
  function leaveIsle() {
    if (!isle) return;
    clearLife();
    isle = null;
    $('hudGoal').hidden = true; $('mapBtn').hidden = true; $('mpPause').hidden = true;
    loadTrack(trackIdx);
  }
  function isleCollide(st) {
    const q = isleData.nearestRoad(st.x, st.z, isleQ);
    st.roadD = q.d; st.lat0 = q.lat;
    st.surface = q.d > isleData.half + 0.4 ? 0.62 : 1;
    // la mer : l'eau freine fort, puis on est replacé
    if (isleData.terrain.at(st.x, st.z) < 0.2) { st.wetT = (st.wetT || 0) + STEP; st.vx *= 0.985; st.vz *= 0.985; } else st.wetT = 0;
  }
  function isleRespawn() {
    const q = isleData.nearestRoad(player.x, player.z, {});
    let i = q.i;
    const wet = player.wetT > 0.5;
    const I = isleData;
    if (i < 0) { let bd = Infinity; for (let k = 0; k < I.N; k += 2) { const d = (I.X[k] - player.x) ** 2 + (I.Z[k] - player.z) ** 2; if (d < bd) { bd = d; i = k; } } } // loin de tout : la route la plus proche de l'île
    let h = Math.atan2(I.TZ[i], I.TX[i]);
    let dh = h - player.heading; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    if (Math.abs(dh) > Math.PI / 2) h += Math.PI; // garde le sens dans lequel on roulait
    lose('Replacement');
    placePlayer(I.X[i], I.Z[i], h, 8);
    popup(wet ? 'Plouf · replacé sur la route' : 'Replacé sur la route', 'apex');
  }
  function isleTick(dt) {
    const st = player, I = isleData;
    if (st.wetT > 0.8) { st.wetT = 0; isleRespawn(); return; }
    // lieu le plus proche (affiché sous le chrono)
    let best = null, bd = Infinity;
    for (const [id, hb] of Object.entries(I.hubs)) { const d = Math.hypot(st.x - hb.x, st.z - hb.z); if (d < bd) { bd = d; best = id; } }
    const tr = TRACKS.find((t) => t.id === best);
    const label = bd < 60 ? tr.name : `${tr.name} · ${fmtDist(bd)}`;
    if (label !== isle.hubName) { isle.hubName = label; $('hudLap').textContent = label; }
    // daruma dorés
    I.daruma.forEach((d, k) => {
      const g = world.daruma[k];
      if (!g.visible || Math.hypot(st.x - d.x, st.z - d.z) > 3) return;
      g.visible = false;
      const r = isleCollect(profile, k);
      if (r) { saveProfile(); refreshWallet(); Sound.clip(); vibrate(30); popup(`Daruma doré +${Economy.fmt(r)}`, 'clip'); toast(`Daruma doré ${isleFound(profile)} / ${ISLE.daruma.length}`, 'chal'); if (life && life.gps && life.gps.daruma === k) clearGps(); }
    });
  }

  // ---------- vie de l'île : circulation, rivaux, habitants, belvédères, radars, zones ----------
  function buildLife() {
    const I = isleData;
    const T = IsleLife.createTraffic(I, isTouch ? 16 : 22, 1 + (Date.now() % 9973));
    // la circulation démarre autour de toi, pas à l'autre bout de l'île
    T.agents.forEach((A, k) => { if (k % 2 === 0) IsleLife.respawnNear(I, A, player.x, player.z, T.rand); });
    life = {
      T, layer: createTrafficLayer(world.group, T.agents, I.terrain.at), spots: buildIsleSpots(world.group, I, castOf),
      rivals: [], obs: [], me: { x: 0, z: 0, vx: 0, vz: 0 }, gps: null, duel: null, zone: null, radar: {}, near: null,
      scanT: 0, goalT: 0, sendT: 0, hostT: 0, bumpT: 0, race: null, battle: null, stats: { rivals: 0, stars: 0, photos: 0 },
    };
    for (const def of IsleLife.RIVALS) if (IsleLife.rivalOpen(profile, def, Story)) addRival(def);
    if (mp) for (const R of mp.remotes.values()) remoteModel(R);
    refreshMpHud();
  }
  function clearLife() {
    $('prompt').hidden = true; $('gps').hidden = true; $('mpHud').hidden = true;
    if (!life) return;
    life.layer.dispose(); life.spots.dispose();
    for (const r of life.rivals) { r.tag.dispose(); r.model.dispose(); }
    if (mp) for (const R of mp.remotes.values()) dropRemoteModel(R);
    life = null;
  }
  function addRival(def) {
    const I = isleData, r = I.roads[def.e];
    const A = IsleLife.makeAgent(I, { id: def.id, e: def.e, dir: 1, s: r.length * 0.4, lane: 0, laneT: 0, k: def.skill, speed: 12, wheelRot: 0, steerAngle: 0, rollAngle: 0, pitchAngle: 0, rearSlip: 0, slip: 0, throttle: 1, rpm: 5000 });
    const model = buildCar(def.car, lookOf(Object.assign(Economy.defaultCar(def.car), def.look), false));
    model.ground = I.terrain.at; envOn(model); scene.add(model.root);
    const c = castOf(def.who), tag = makeTag();
    tag.set(c.name, def.crew, c.col); tag.sprite.position.set(0, 2.7, 0); model.root.add(tag.sprite);
    life.rivals.push({ def, A, model, tag, c, cool: 0, farT: 0, fx: 'R' + life.rivals.length });
  }

  // contact avec la circulation, les rivaux et les autres joueurs : deux disques par voiture, seul le joueur local est repoussé
  function lifeCollide(st) {
    const L = life, c = Math.cos(st.heading), s = Math.sin(st.heading);
    const P0x = st.x + c * 1.05, P0z = st.z + s * 1.05, P1x = st.x - c * 1.05, P1z = st.z - s * 1.05;
    const hit = (ox, oz, oh, half, rad, ovx, ovz, A, r) => {
      const oc = Math.cos(oh), os = Math.sin(oh);
      for (const q of [half, -half]) {
        const qx = ox + oc * q, qz = oz + os * q;
        for (const [px, pz] of [[P0x, P0z], [P1x, P1z]]) {
          let dx = px - qx, dz = pz - qz;
          const d = Math.hypot(dx, dz), m = 1.0 + rad;
          if (d >= m || d < 1e-4) continue;
          dx /= d; dz /= d;
          st.x += dx * (m - d); st.z += dz * (m - d);
          const vrel = (st.vx - ovx) * dx + (st.vz - ovz) * dz;
          if (vrel < 0) { st.vx -= dx * vrel * 1.25; st.vz -= dz * vrel * 1.25; st.omega += (px === P0x ? 1 : -1) * (dx * -s + dz * c) * vrel * 0.06; bump(-vrel, qx, qz, A, r); }
          return;
        }
      }
    };
    for (const A of L.T.agents) { if (Math.abs(A.x - st.x) < 9 && Math.abs(A.z - st.z) < 9) hit(A.x, A.z, A.heading, A.kind.len / 2 - A.kind.w / 2, A.kind.w / 2 + 0.05, A.vx || 0, A.vz || 0, A, null); }
    for (const r of L.rivals) { const A = r.A; if (Math.abs(A.x - st.x) < 9 && Math.abs(A.z - st.z) < 9) hit(A.x, A.z, A.heading, 1.05, 1.0, A.vx || 0, A.vz || 0, null, r); }
    if (mp) for (const R of mp.remotes.values()) { const v = R.view; if (R.shown && Math.abs(v.x - st.x) < 9 && Math.abs(v.z - st.z) < 9) hit(v.x, v.z, v.heading, 1.05, 1.0, v.vx, v.vz, null, null); }
  }
  function bump(v, x, z, A, r) {
    if (A) { if (v > 1.5 && A.hitT <= 0) A.hitT = 2.5 + Math.random() * 2; A.speed *= 0.5; }
    if (v < 1.6 || life.bumpT > 0) return;
    life.bumpT = 0.35;
    Sound.impact(v); vibrate(Math.min(120, v * 12));
    if (!settings.reduce) shake = Math.min(1, shake + v * 0.06);
    for (let k = 0; k < Math.min(24, v * 4); k++) sparks.emit(x, gy(x, z) + 0.6, z, (Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6, 0.4 + Math.random() * 0.3, 0.25, 0.08, 1);
    if (v > 3 && phase === 'play') lose(A ? 'Accrochage' : 'Touchette');
  }

  // un pas de vie (jeu ou compte à rebours) : circulation, rivaux, interactions, GPS, duel, activités, multijoueur
  function lifeTick(dt) {
    const L = life, I = isleData, st = player;
    if (L.bumpT > 0) L.bumpT -= dt;
    const obs = L.obs; obs.length = 0;
    L.me.x = st.x; L.me.z = st.z; L.me.vx = st.vx; L.me.vz = st.vz; obs.push(L.me);
    for (const r of L.rivals) obs.push(r.A);
    if (mp) for (const R of mp.remotes.values()) if (R.shown) obs.push(R.view);
    for (const A of L.T.agents) obs.push(A);
    for (const A of L.T.agents) {
      const dx = A.x - st.x, dz = A.z - st.z, d2 = dx * dx + dz * dz;
      if (d2 > 640 * 640) { IsleLife.respawnNear(I, A, st.x, st.z, L.T.rand); continue; }
      const ev = IsleLife.stepAgent(I, A, dt, obs, L.T.rand, false);
      if (ev === 'honk' && d2 < 110 * 110) Sound.horn(1 - Math.sqrt(d2) / 110, A.kind.id === 'bus' ? 0.72 : A.kind.id === 'kei' ? 1.22 : 1);
    }
    nearMiss(dt);
    rivalsTick(dt);
    if (L.duel) duelTick(dt);
    actsTick(dt);
    if (L.race) raceTick(dt);
    if (L.battle) battleTick(dt);
    L.scanT -= dt;
    if (L.scanT <= 0) { L.scanT = 0.1; scanInteract(); updateGps(); }
    L.goalT -= dt;
    if (L.goalT <= 0) { L.goalT = 0.2; renderIsleGoal(); }
  }
  // « Frôlé ! » : passer en glisse à moins d'un mètre d'une voiture sans la toucher rapporte des points (une fois par voiture et par passage)
  function nearMiss(dt) {
    const st = player, L = life;
    const drifting = phase === 'play' && Math.abs(st.slip) * 180 / Math.PI > 15 && st.speed > 9 && score.combo > 0;
    const c = Math.cos(st.heading), s = Math.sin(st.heading);
    for (const A of L.T.agents) {
      if (A.nearCool > 0) A.nearCool -= dt;
      if (!drifting || A.nearCool > 0 || A.hitT > 0 || Math.abs(A.x - st.x) > 9 || Math.abs(A.z - st.z) > 9) continue;
      const half = A.kind.len / 2 - A.kind.w / 2, rad = A.kind.w / 2 + 0.05, oc = Math.cos(A.heading), os = Math.sin(A.heading);
      let gap = Infinity;
      for (const q of [half, 0, -half]) for (const p of [1.05, -1.05]) gap = Math.min(gap, Math.hypot(st.x + c * p - A.x - oc * q, st.z + s * p - A.z - os * q) - 1.0 - rad);
      if (gap > 1.1 || gap < 0.05 || L.bumpT > 0) continue;
      A.nearCool = 6;
      const pts = Math.round(300 * score.mult);
      score.combo += pts; score.mult = Math.min(8, score.mult + 0.3); L.stats.near = (L.stats.near || 0) + 1;
      popup(`Frôlé +${pts.toLocaleString('fr-FR')}`, 'clip'); Sound.clip(); vibrate(15);
      if (Math.random() < 0.6) Sound.horn(0.5, A.kind.id === 'bus' ? 0.72 : 1.1);
    }
  }
  function rivalsTick(dt) {
    const L = life, I = isleData, st = player;
    for (const r of L.rivals) {
      const A = r.A, d = Math.hypot(A.x - st.x, A.z - st.z), mine = L.duel && L.duel.r === r;
      if (r.cool > 0) r.cool -= dt;
      if (!mine) {
        // il roule ; s'il te voit de près, il ralentit, se range et t'attend
        const free = r.cool <= 0 && !L.duel && !L.race && !L.battle;
        A.k = r.def.skill * (free && d < 110 ? 0.55 : 1);
        A.hold = free && d < 40;
        A.laneT = A.hold ? -4.3 : A.passS != null ? A.laneT : 0;
        r.farT = d > 900 ? r.farT + dt : 0;
        if (r.farT > 40) { r.farT = 0; IsleLife.respawnNear(I, A, st.x, st.z, L.T.rand, 0); A.k = r.def.skill; }
      }
      IsleLife.stepAgent(I, A, dt, L.obs, L.T.rand, true);
      // état lu par le modèle 3D et la fumée
      A.wheelRot += A.speed / 0.31 * dt * (1 + Math.abs(A.beta));
      A.steerAngle += ((-A.beta * 0.9) - A.steerAngle) * Math.min(1, dt * 8);
      A.rollAngle += ((-A.beta * 0.07 * Math.min(A.speed / 15, 1)) - A.rollAngle) * Math.min(1, dt * 5);
      A.slip = -A.beta; A.rearSlip = Math.abs(A.beta) * 1.2; A.throttle = A.hold ? 0 : 1; A.fwd = A.speed;
    }
  }

  // ---------- interactions : l'objet le plus proche propose une action (E, ou toucher le bouton) ----------
  function scanInteract() {
    const L = life, I = isleData, st = player;
    let best = null;
    const cand = (d, max, o) => { if (d < max && (!best || d / max < best.w)) best = Object.assign(o, { w: d / max }); };
    const slow = st.speed < 7;
    for (const [id, hb] of Object.entries(I.hubs)) {
      const open = Story.chapterOpen(profile, Story.zoneIndex(id));
      cand(Math.hypot(st.x - hb.x, st.z - hb.z), 14, { kind: 'gate', id, text: `Entrer : ${TRACKS[trackIndexOf(id)].name}`, sub: open ? 'missions, exploration, histoire' : 'lieu fermé · avance dans l’aventure', off: !open });
    }
    if (!L.duel && !L.race && !L.battle) for (const r of L.rivals) if (r.cool <= 0) cand(Math.hypot(st.x - r.A.x, st.z - r.A.z), 28, { kind: 'rival', r, text: `Défier ${r.c.name}`, sub: slow ? `${r.def.crew} · ${r.def.car.toUpperCase()}` : 'ralentis pour lui parler', off: !slow });
    for (const n of L.spots.npcs) { const c = castOf(n.def.who); cand(Math.hypot(st.x - n.x, st.z - n.z), 11, { kind: 'npc', n, text: `Parler à ${c.name}`, sub: slow ? c.role : 'ralentis pour parler', off: !slow }); }
    for (const p of L.spots.photos) { const done = IsleLife.isleBag(profile).photo[p.def.id]; cand(Math.hypot(st.x - p.x, st.z - p.z), 8, { kind: 'photo', p, text: done ? 'Reprendre la photo' : 'Prendre la photo', sub: st.speed > 2.5 ? 'arrête-toi dans le cercle' : p.def.name, off: st.speed > 2.5 }); }
    setPrompt(best);
  }
  function setPrompt(b) {
    if (life) life.near = b;
    const el = $('prompt');
    if (!b || phase !== 'play' || dlg) { if (!el.hidden) el.hidden = true; return; }
    const key = b.kind + b.text + b.sub + b.off;
    if (el.hidden || el.dataset.k !== key) {
      el.dataset.k = key; $('promptText').textContent = b.text; $('promptSub').textContent = b.sub;
      el.classList.toggle('off', !!b.off); el.setAttribute('aria-label', b.text + (b.sub ? ', ' + b.sub : ''));
      if (el.hidden) { el.hidden = false; Sound.ui(); }
    }
  }
  function interact() {
    const b = life && life.near;
    if (!b || phase !== 'play') return;
    if (b.off) { Sound.lost(); return; }
    setPrompt(null);
    if (b.kind === 'gate') { phase = 'pause'; clearTouch(); Sound.suspend(); advSel = Story.zoneIndex(b.id); renderAdventure(); show('adventure'); }
    else if (b.kind === 'rival') rivalTalk(b.r);
    else if (b.kind === 'npc') npcChat(b.n);
    else if (b.kind === 'photo') takePhoto(b.p);
  }
  $('prompt').addEventListener('click', () => interact());
  // dialogue pendant le jeu : la voiture s'arrête le temps de parler
  function chat(lines, done, choices) { phase = 'pause'; clearTouch(); Sound.suspend(); setPrompt(null); talk(lines, done, choices); }

  function npcChat(n) {
    const t = IsleLife.npcTalk(profile, n.def.id, Story);
    chat(t.lines, (act) => {
      const r = IsleLife.npcMet(profile, n.def.id);
      if (r) { saveProfile(); refreshWallet(); toast(`Rencontre : ${castOf(n.def.who).name} · +${Economy.fmt(r)}`, 'chal'); }
      gpsAct(act);
      resumeGame();
    }, t.choices.map((c) => ({ label: c.label, act: c.act })));
  }
  // choix d'un habitant ou de la carte → destination du GPS
  function gpsAct(act) {
    const I = isleData, st = player, L = life;
    if (act === 'story') {
      if (Story.chapterDone(profile, Story.CHAPTERS.length - 1)) { toast('Le Tour est gagné : tous les lieux restent ouverts', 'chal'); return; }
      const id = Story.CHAPTERS[Story.currentChapter(profile)].track, hb = I.hubs[id];
      setGps({ name: TRACKS[trackIndexOf(id)].name, x: hb.x, z: hb.z, arrive: 13 });
    } else if (act === 'daruma') {
      let k = -1, bd = Infinity;
      I.daruma.forEach((d, j) => { if (!world.daruma[j].visible) return; const dd = Math.hypot(d.x - st.x, d.z - st.z); if (dd < bd) { bd = dd; k = j; } });
      if (k < 0) toast('Tous les daruma dorés sont trouvés !', 'chal');
      else setGps({ name: 'Daruma doré', x: I.daruma[k].x, z: I.daruma[k].z, arrive: 2, daruma: k });
    } else if (act === 'rival') {
      let best = null, bd = Infinity;
      for (const r of L.rivals) { const d = Math.hypot(r.A.x - st.x, r.A.z - st.z); if (d < bd) { bd = d; best = r; } }
      if (!best) toast('Aucun rival ne roule encore : avance dans l’aventure', 'lost');
      else { best.cool = 0; setGps({ name: best.c.name, get: () => [best.A.x, best.A.z], arrive: 30 }); }
    } else if (act === 'activity') {
      const bag = IsleLife.isleBag(profile);
      let best = null, bd = Infinity;
      for (const a of L.spots.acts) { const n = IsleLife.starsOf(a.def, bag.best[a.def.id] || 0); const d = Math.hypot(a.x - st.x, a.z - st.z) + n * 3000; if (n < 3 && d < bd) { bd = d; best = a; } }
      if (!best) toast('Trois étoiles partout. Respect.', 'chal');
      else setGps({ name: best.def.name, x: best.x, z: best.z, arrive: 12 });
    }
  }

  // ---------- GPS : flèche, distance par la route, tracé sur la mini-carte ----------
  function setGps(g) {
    if (!life) return;
    life.gps = Object.assign({ route: null, t: 0, pts: [], ang: null, arrive: 16 }, g);
    const el = $('gps'); el.hidden = false; el.classList.toggle('race', !!g.race);
    updateGps(true); Sound.ping();
    if (!g.race) toast(`GPS : ${g.name}`, 'apex');
  }
  function clearGps() { if (!life) return; life.gps = null; $('gps').hidden = true; }
  function updateGps(force) {
    const G = life && life.gps; if (!G) return;
    const I = isleData, st = player;
    if (G.get) { const p = G.get(); G.x = p[0]; G.z = p[1]; }
    G.t -= 0.1;
    if (force || G.t <= 0) {
      G.t = 0.5; G.route = IsleLife.route(I, st.x, st.z, G.x, G.z); G.pts.length = 0;
      if (G.route) { let k = 0; IsleLife.routeWalk(I, G.route, null, (x, z) => { if (k++ % 6 === 0) G.pts.push(x, z); }); }
      G.pts.push(G.x, G.z);
    }
    const straight = Math.hypot(G.x - st.x, G.z - st.z);
    if (!G.race && straight < G.arrive) { toast(`Arrivée : ${G.name}`, 'chal'); Sound.ping(); clearGps(); return; }
    const ahead = G.route && straight > 45 ? IsleLife.routeWalk(I, G.route, 30) : null;
    const tx = ahead ? ahead[0] : G.x, tz = ahead ? ahead[1] : G.z;
    let a = (Math.atan2(tz - st.z, tx - st.x) - st.heading) * 180 / Math.PI;
    if (G.ang == null) G.ang = a; else { let d = a - G.ang; d -= Math.round(d / 360) * 360; G.ang += d; }
    $('gpsArrow').style.transform = `rotate(${G.ang.toFixed(1)}deg)`;
    setText('gpsName', G.name);
    setText('gpsDist', fmtDist(G.route ? G.route.len : straight) + (G.race ? ' · course' : ''));
  }

  // ---------- duels de rue contre les rivaux ----------
  function rivalTalk(r) {
    const I = isleData, wins = IsleLife.isleBag(profile).rivals[r.def.id] || 0;
    const reward = wins ? Math.round(r.def.reward / 5 / 100) * 100 : r.def.reward;
    let near = null, nd = Infinity;
    for (const [k, [x, z]] of Object.entries(I.def.nodes)) { const d = Math.hypot(x - r.A.x, z - r.A.z); if (d < nd) { nd = d; near = k; } }
    const tgt = IsleLife.tougeTarget(I, r.A.x, r.A.z, nd < 60 ? near : null);
    const lines = r.def.hello.slice();
    if (wins) lines.push(['narr', `${r.c.name} : ${wins} défaite${wins > 1 ? 's' : ''} contre toi. Revanche payée ${Economy.fmt(reward)}.`]);
    chat(lines, (act) => {
      if (act === 'race' && tgt) startDuel(r, 'race', tgt);
      else if (act === 'tandem') startDuel(r, 'tandem');
      else { r.cool = 25; resumeGame(); }
    }, [
      ...(tgt ? [{ label: `Touge → ${nodeName(tgt.node)} · ${fmtDist(tgt.route.len)} · ${Economy.fmt(reward)}`, act: 'race' }] : []),
      { label: `Tandem de rue · 45 s · ${Economy.fmt(reward)}`, act: 'tandem' },
      { label: 'Pas maintenant', act: 'bye' },
    ]);
  }
  function startDuel(r, kind, tgt) {
    const I = isleData, A = r.A, L = life;
    Object.assign(A, { hold: true, arrived: false, route: null, passS: null, speed: 0, beta: 0, waitT: 0 });
    if (kind === 'race') {
      // côte à côte, tournés vers la destination
      const route = IsleLife.route(I, A.x, A.z, tgt.x, tgt.z), sg = route.segs[0], dir = sg.i1 >= sg.i0 ? 1 : -1, rr = I.roads[sg.e];
      A.e = sg.e; A.dir = dir; A.s = (dir > 0 ? sg.i0 : rr.count - 1 - sg.i0) * rr.step;
      A.route = IsleLife.agentPlan(I, route);
      A.lane = A.laneT = 2.1;
    } else {
      // le rival mène, tu pars 14 m derrière lui
      A.s = Math.max(16, Math.min(I.roads[A.e].length - 30, A.s));
      A.lane = A.laneT = 0; A.k = r.def.skill * 0.86;
    }
    const p = IsleLife.roadPose(I, A.e, A.dir, A.s, A.lane, {});
    A.x = p.x; A.z = p.z; A.heading = Math.atan2(p.tz, p.tx);
    const q = kind === 'race' ? IsleLife.roadPose(I, A.e, A.dir, A.s, -2.1, {}) : IsleLife.roadPose(I, A.e, A.dir, A.s - 14, 0, {});
    placePlayer(q.x, q.z, Math.atan2(q.tz, q.tx), 0);
    L.duel = { r, kind, tgt, t: 0, state: 'count', near: 0, both: 0, far: 0, dur: 45, pRem: tgt ? tgt.route.len : 0, rRem: tgt ? tgt.route.len : 0, chkT: 0 };
    if (kind === 'race') setGps({ name: nodeName(tgt.node), x: tgt.x, z: tgt.z, race: true });
    camPos.set(player.x - Math.cos(player.heading) * 8, gy(player.x, player.z) + 3, player.z - Math.sin(player.heading) * 8);
    show(null); phase = 'count'; countdown();
    announce(kind === 'race' ? `Touge contre ${r.c.name} jusqu’à ${nodeName(tgt.node)}.` : `Tandem de rue derrière ${r.c.name} : reste collé pendant 45 secondes.`);
  }
  function duelTick(dt) {
    const D = life.duel, A = D.r.A, st = player, I = isleData;
    if (D.state === 'count') { if (phase === 'play') { D.state = 'run'; A.hold = false; A.laneT = D.kind === 'race' ? 1.2 : 0; } return; }
    if (phase !== 'play') return;
    D.t += dt;
    if (D.kind === 'race') {
      D.chkT -= dt;
      if (D.chkT <= 0) {
        D.chkT = 0.3;
        const rp = IsleLife.route(I, st.x, st.z, D.tgt.x, D.tgt.z), rr = A.arrived ? null : IsleLife.route(I, A.x, A.z, D.tgt.x, D.tgt.z);
        if (rp) D.pRem = rp.len; D.rRem = A.arrived ? 0 : rr ? rr.len : D.rRem;
        const gap = D.pRem - D.rRem; // élastique léger : le rival ne s'envole pas, ne t'attend pas non plus
        A.k = D.r.def.skill * (gap > 160 ? 0.9 : gap < -120 ? 1.06 : 1);
      }
      if (Math.hypot(st.x - D.tgt.x, st.z - D.tgt.z) < 18) { endDuel(true); return; }
      if (A.arrived || D.t > 300) { endDuel(false, A.arrived ? `${D.r.c.name} arrive le premier.` : 'Trop long : le rival est rentré.'); return; }
    } else {
      const d = Math.hypot(st.x - A.x, st.z - A.z), ang = Math.abs(st.slip) * 180 / Math.PI;
      if (d < 15) { D.near += dt; if (ang > 12 && Math.abs(A.beta) > 0.2) D.both += dt; }
      D.far = d > 110 ? D.far + dt : Math.max(0, D.far - dt);
      setBar('tandemFill', clamp(1 - (d - 3) / 22, 0, 1));
      if (D.far > 4) { endDuel(false, 'Distancé : le rival a disparu dans les virages.'); return; }
      if (D.t >= D.dur) endDuel(tandemPct(D) >= 50);
    }
  }
  const tandemPct = (D) => Math.round(Math.min(1, (D.near + D.both * 0.5) / D.dur) * 100);
  function endDuel(win, why) {
    const D = life.duel, r = D.r, A = r.A;
    life.duel = null; r.cool = 40;
    Object.assign(A, { route: null, arrived: false, hold: false, k: r.def.skill, laneT: 0 });
    if (D.kind === 'race') clearGps();
    let amount = 0;
    if (win) { amount = IsleLife.rivalWin(profile, r.def.id, D.kind); saveProfile(); refreshWallet(); life.stats.rivals++; Sound.bank(true); } else Sound.lost();
    const lines = (win ? r.def.win : r.def.lose).slice();
    if (D.kind === 'tandem') lines.unshift(['narr', `Tandem : ${tandemPct(D)} % (il fallait 50 %)${D.both > 1 ? ` · ${Math.round(D.both)} s de glisse à deux` : ''}.`]);
    if (why) lines.unshift(['narr', why]);
    chat(lines, () => { if (amount) toast(`Victoire contre ${r.c.name} · +${Economy.fmt(amount)}`, 'chal'); resumeGame(); });
  }

  // ---------- belvédères, radars, zones de glisse ----------
  function takePhoto(p) {
    const f = $('flash'); f.hidden = true; void f.offsetWidth; f.hidden = settings.reduce; setTimeout(() => { f.hidden = true; }, 650);
    Sound.shutter(); vibrate(20);
    const r = IsleLife.photoTaken(profile, p.def.id);
    if (r) { saveProfile(); refreshWallet(); life.stats.photos++; toast(`Lou : « ${p.def.line} » · +${Economy.fmt(r)}`, 'chal'); }
    else toast(`Belle photo : ${p.def.name}`, 'apex');
  }
  function actsTick(dt) {
    const L = life, st = player, kmh = st.speed * 3.6;
    for (const a of L.spots.acts) {
      if (a.def.type !== 'radar') continue;
      const d = Math.hypot(st.x - a.x, st.z - a.z), id = a.def.id;
      if (d < 9) L.radar[id] = Math.max(L.radar[id] || 0, kmh);
      else if (L.radar[id] != null && d > 16) { const v = L.radar[id]; delete L.radar[id]; if (v > 40 && phase === 'play') radarFlash(a.def, v); }
    }
    if (!L.zone && !L.duel && !L.race && phase === 'play') {
      for (const a of L.spots.acts) {
        if (a.def.type !== 'zone' || Math.hypot(st.x - a.x, st.z - a.z) > 9) continue;
        if (st.vx * a.tx + st.vz * a.tz < 4) continue; // dans le bon sens, lancé
        L.zone = { a, base: score.total + score.combo, t: 0, offT: 0 };
        const best = IsleLife.isleBag(profile).best[a.def.id] || 0;
        popup('Zone de glisse', 'apex'); Sound.ping();
        toast(`${a.def.name} : glisse jusqu’à l’arche d’arrivée${best ? ` · record ${best.toLocaleString('fr-FR')}` : ''}`, 'apex');
        break;
      }
    }
    const Z = L.zone;
    if (Z) {
      Z.t += dt;
      Z.offT = isleQ.edge !== Z.a.def.e || isleQ.d > isleData.half + 4 ? Z.offT + dt : 0;
      if (Z.offT > 3 || Z.t > 240) { L.zone = null; popup('Zone abandonnée', 'lost'); return; }
      if (Math.hypot(st.x - Z.a.x1, st.z - Z.a.z1) < 11) {
        bank();
        const v = Math.max(0, Math.round(score.total - Z.base)), r = IsleLife.recordActivity(profile, Z.a.def.id, v);
        L.zone = null;
        popup(`${Z.a.def.name} · ${v.toLocaleString('fr-FR')} ${starsTxt(r.stars)}`, r.stars ? 'clip' : 'apex');
        if (r.reward) { saveProfile(); refreshWallet(); L.stats.stars += r.stars - r.prev; toast(`${Z.a.def.name} · ${starsTxt(r.stars)} · +${Economy.fmt(r.reward)}`, 'chal'); Sound.cash(); }
        else if (r.record) { saveProfile(); toast(`${Z.a.def.name} : record personnel`, 'apex'); }
        else toast(`${Z.a.def.name} : ${v.toLocaleString('fr-FR')} pts (record ${r.best.toLocaleString('fr-FR')})`, 'apex');
      }
    }
  }
  function radarFlash(def, v) {
    const r = IsleLife.recordActivity(profile, def.id, Math.round(v));
    const f = $('flash'); if (!settings.reduce) { f.hidden = true; f.className = 'soft'; void f.offsetWidth; f.hidden = false; setTimeout(() => { f.hidden = true; f.className = ''; }, 650); }
    Sound.shutter();
    popup(`Radar ${Math.round(v)} km/h ${starsTxt(r.stars)}`, r.stars ? 'clip' : 'apex');
    if (r.reward) { saveProfile(); refreshWallet(); life.stats.stars += r.stars - r.prev; toast(`${def.name} · ${starsTxt(r.stars)} · +${Economy.fmt(r.reward)}`, 'chal'); Sound.cash(); }
    else if (r.record) { saveProfile(); toast(`${def.name} : record personnel, ${Math.round(v)} km/h`, 'apex'); }
  }

  // bandeau d'objectif de l'île : duel, zone, course ou battle en cours, sinon l'avancement
  function renderIsleGoal() {
    const L = life, el = $('hudGoal');
    if (!el || !isle) return;
    let t, cls = 'hud-goal';
    if (L && L.duel) {
      const D = L.duel, n = D.r.c.name;
      cls += ' street';
      if (D.state === 'count') t = D.kind === 'race' ? `Touge contre ${n} · jusqu’à ${nodeName(D.tgt.node)}` : `Tandem de rue · colle ${n} pendant 45 s`;
      else if (D.kind === 'race') { const g = Math.round(D.rRem - D.pRem); t = `Touge · ${n} · ${fmtDist(D.pRem)} · ${g >= 0 ? `devant de ${Math.abs(g)} m` : `derrière de ${Math.abs(g)} m`}`; }
      else t = `Tandem · ${n} · ${tandemPct(D)} % / 50 % · ${Math.max(0, Math.ceil(D.dur - D.t))} s`;
    } else if (L && L.zone) {
      const Z = L.zone, v = Math.max(0, Math.round(score.total + score.combo - Z.base)), next = Z.a.def.stars.find((s) => s > v);
      cls += ' street';
      t = `Zone · ${Z.a.def.name} · ${v.toLocaleString('fr-FR')} pts${next ? ` · ★ à ${next.toLocaleString('fr-FR')}` : ' · ★★★'}`;
    } else if (L && L.race) {
      const R = L.race; cls += ' street';
      t = R.state === 'count' ? `Course → ${R.name}` : `Course → ${R.name} · ${fmtTime(R.t)} · arrivés ${R.results.size} / ${mp ? mp.S.peers.size : 1}`;
    } else if (L && L.battle) {
      const B = L.battle; cls += ' street';
      t = `Battle de drift · ${Math.round(score.total + score.combo - B.base).toLocaleString('fr-FR')} pts · ${Math.max(0, Math.ceil(B.dur - B.t))} s`;
    } else {
      const bag = IsleLife.isleBag(profile), stars = IsleLife.ACTIVITIES.reduce((a, d) => a + IsleLife.starsOf(d, bag.best[d.id] || 0), 0);
      t = `Daruma ${isleFound(profile)}/${ISLE.daruma.length} · ★ ${stars}/${IsleLife.ACTIVITIES.length * 3}${isTouch ? '' : ' · M : carte'}`;
    }
    if (el.className !== cls) el.className = cls;
    if (el.textContent !== t) el.textContent = t;
  }

  // mini-carte de l'île entière : routes, portes, GPS, daruma restants, rivaux, autres joueurs, voiture
  let isleMM = null;
  function drawIsleMinimapBase() {
    const I = isleData, c = document.createElement('canvas'); c.width = c.height = 208;
    const g = c.getContext('2d'), { cx, cz, rx, rz } = I.def.shape;
    const s = 196 / (rx * 2.1), ox = 104 - cx * s, oz = 104 - cz * s;
    const T = (x, z) => [ox + x * s, oz + z * s];
    g.fillStyle = 'rgba(29,79,99,.55)'; g.beginPath(); g.ellipse(104, 104, 102, 102, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(79,107,50,.75)'; g.beginPath(); g.ellipse(...T(cx, cz), rx * s, rz * s, 0, 0, 7); g.fill();
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (const r of I.roads) {
      g.beginPath();
      for (let i = 0; i < r.count; i += 4) { const [x, y] = T(r.px[i], r.pz[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
      const [ex, ey] = T(r.px[r.count - 1], r.pz[r.count - 1]); g.lineTo(ex, ey);
      g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 4.5; g.stroke();
      g.strokeStyle = 'rgba(243,239,228,.9)'; g.lineWidth = 2.2; g.stroke();
    }
    for (const hb of Object.values(I.hubs)) { const [x, y] = T(hb.x, hb.z); g.fillStyle = '#f7d154'; g.fillRect(x - 4, y - 4, 8, 8); }
    isleMM = { c, T };
  }
  function drawIsleMinimap(g) {
    const T = isleMM.T, L = life;
    g.drawImage(isleMM.c, 0, 0);
    if (L && L.gps && L.gps.pts.length > 2) {
      const P = L.gps.pts; g.beginPath(); g.moveTo(...T(player.x, player.z));
      for (let k = 0; k < P.length; k += 2) g.lineTo(...T(P[k], P[k + 1]));
      g.strokeStyle = L.gps.race ? '#f7d154' : '#7b8cff'; g.lineWidth = 3; g.stroke();
      const [gx, gz] = T(L.gps.x, L.gps.z); g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(gx, gz, 4, 0, 7); g.fill();
    }
    const found = (profile.isle && profile.isle.found) || {};
    g.fillStyle = '#ffb020';
    isleData.daruma.forEach((d, k) => { if (found[k]) return; const [x, y] = T(d.x, d.z); g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); });
    if (L) {
      g.fillStyle = 'rgba(255,255,255,.55)';
      for (const A of L.T.agents) { const [x, y] = T(A.x, A.z); g.fillRect(x - 1, y - 1, 2, 2); }
      for (const r of L.rivals) { const [x, y] = T(r.A.x, r.A.z); g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, 4.2, 0, 7); g.fill(); g.fillStyle = r.c.col; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    }
    if (mp) for (const R of mp.remotes.values()) if (R.shown) { const [x, y] = T(R.view.x, R.view.z); g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.fillStyle = R.color; g.beginPath(); g.arc(x, y, 3.6, 0, 7); g.fill(); }
    const [x, y] = T(player.x, player.z), h = player.heading;
    g.save(); g.translate(x, y); g.rotate(h);
    g.fillStyle = '#000'; g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, 6); g.lineTo(-6, -6); g.closePath(); g.fill();
    g.fillStyle = '#ff3d3d'; g.beginPath(); g.moveTo(7, 0); g.lineTo(-4, 4.5); g.lineTo(-4, -4.5); g.closePath(); g.fill();
    g.restore();
  }

  // ---------- rendu de la vie : circulation, rivaux, autres joueurs (aussi pendant la pause : les autres roulent) ----------
  function lifeDraw(dt, t) {
    const L = life, cx = camera.position.x, cz = camera.position.z;
    L.layer.update(cx, cz);
    L.spots.update(t, cx, cz);
    for (const r of L.rivals) {
      const A = r.A, d2 = (A.x - cx) ** 2 + (A.z - cz) ** 2, vis = d2 < 300 * 300;
      r.model.root.visible = vis;
      if (!vis) continue;
      r.model.update(A, dt, A.hold || A.speed < 3);
      if (d2 < 140 * 140 && phase !== 'pause') carFx(A, r.model, dt, r.fx, 'L');
      const chip = r.cool <= 0 && !L.duel && Math.hypot(A.x - player.x, A.z - player.z) < 110 ? 'DÉFI' : null;
      const wins = IsleLife.isleBag(profile).rivals[r.def.id] || 0;
      r.tag.set(r.c.name, `${r.def.crew}${wins ? ` · battu ×${wins}` : ''}`, r.c.col, chip);
      fitTag(r.tag.sprite, A.x, A.z, cx, cz, 1.7);
    }
    if (mp) remotesDraw(dt);
  }

  // fin de balade : gains du mode libre, trouvailles et rencontres de l'île
  function finishIsle() {
    bank();
    phase = 'results';
    Sound.suspend();
    $('hud').hidden = true; $('hudGoal').hidden = true; $('prompt').hidden = true;
    setTouchVisible();
    const total = Math.round(score.total), driftPct = Math.round(score.driftT / Math.max(score.runT, 1) * 100);
    $('resGrade').textContent = '—';
    $('resTotal').textContent = total.toLocaleString('fr-FR') + ' pts';
    $('resRecord').innerHTML = '';
    $('resCombo').textContent = Math.round(score.best).toLocaleString('fr-FR');
    $('resClips').textContent = '—';
    $('resAngle').textContent = Math.round(score.maxAngle) + '°';
    $('resDrift').textContent = driftPct + ' %';
    $('resEyebrow').textContent = 'Balade · L’île de Sideways';
    const S = life ? life.stats : { rivals: 0, stars: 0, photos: 0 };
    $('resHeadline').textContent = S.rivals ? `« ${S.rivals} ${S.rivals > 1 ? 'rivaux battus' : 'rival battu'} sur les routes de l’île. »` : '« Une île, neuf kilomètres de routes, et personne pour te dire où tourner. »';
    const res = Economy.applyRun(profile, { day: today(), trackId: 'ile', trackName: 'L’île', mode: 'free', score: total, grade: null, clips: 0, zones: 0, maxAngle: score.maxAngle, bestCombo: Math.round(score.best), driftPct, record: false });
    saveProfile(); refreshWallet();
    const bag = IsleLife.isleBag(profile), stars = IsleLife.ACTIVITIES.reduce((a, d) => a + IsleLife.starsOf(d, bag.best[d.id] || 0), 0);
    const met = IsleLife.ISLE_NPCS.filter((n) => bag.met[n.id]).length, photos = IsleLife.PHOTO_SPOTS.filter((p) => bag.photo[p.id]).length;
    const rg = $('resGoal'); rg.hidden = false;
    rg.innerHTML = `<div class="h">L’île · cette balade</div><div class="r"><span>Temps sur la route ${fmtTime(score.runT)} · rivaux battus ${S.rivals} · frôlés ${S.near || 0} · étoiles gagnées ${S.stars} · photos ${S.photos}</span></div>`
      + `<div class="h">L’île · en tout</div><div class="r"><span>Daruma ${isleFound(profile)} / ${ISLE.daruma.length} · étoiles ${stars} / ${IsleLife.ACTIVITIES.length * 3} · rencontres ${met} / ${IsleLife.ISLE_NPCS.length} · photos ${photos} / ${IsleLife.PHOTO_SPOTS.length}</span></div>`;
    $('payLines').innerHTML = res.payout.lines.map((l) => `<div><span>${l.label}</span><b>+${Economy.fmt(l.amount)}</b></div>`).join('') || '<div><span>Aucun gain sur cette balade.</span></div>';
    $('payChal').innerHTML = res.challenges.map((c) => `<div>Défi réussi : ${c.label} · +${Economy.fmt(c.reward)}</div>`).join('');
    $('payBal').textContent = 'Solde : ' + Economy.fmt(profile.money);
    $('menuBtn').firstElementChild.textContent = 'Menu';
    $('againBtn').firstElementChild.textContent = 'Reprendre la route';
    countUp($('payTotal'), res.payout.total + res.challenges.reduce((a, c) => a + c.reward, 0));
    show('results');
    releaseWake();
  }

  // ---------- carte de l'île : repères, et un toucher règle le GPS ----------
  let mapItems = [];
  function openIsleMap() {
    if (!isle || !life) return;
    if (phase === 'play' || phase === 'count') { clearTimeout(countTimer); $('count').hidden = true; phase = 'pause'; Sound.suspend(); clearTouch(); }
    setPrompt(null);
    renderIsleMap(); show('isleMap');
  }
  function closeIsleMap() { show(null); resumeGame(); }
  function renderIsleMap() {
    const I = isleData, L = life, cv = $('mapCv'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
    const { cx, cz, rx, rz } = I.def.shape, s = Math.min(W / (rx * 2.12), H / (rz * 2.2)), ox = W / 2 - cx * s, oz = H / 2 - cz * s;
    const T = (x, z) => [ox + x * s, oz + z * s];
    const bag = IsleLife.isleBag(profile), found = bag.found;
    mapItems = [];
    const item = (o) => { mapItems.push(o); return mapItems.length - 1; };
    // fond : mer, île, volcan, routes
    g.fillStyle = '#0b2733'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#123a4a'; g.beginPath(); g.ellipse(...T(cx, cz), rx * s * 1.04, rz * s * 1.05, 0, 0, 7); g.fill();
    g.fillStyle = '#3f5a2c'; g.beginPath(); g.ellipse(...T(cx, cz), rx * s, rz * s, 0, 0, 7); g.fill();
    const V = I.def.volcano, gr = g.createRadialGradient(...T(V.x, V.z), 0, ...T(V.x, V.z), V.r * s);
    gr.addColorStop(0, '#2c2725'); gr.addColorStop(0.35, '#55493f'); gr.addColorStop(1, 'rgba(63,90,44,0)'); g.fillStyle = gr; g.beginPath(); g.arc(...T(V.x, V.z), V.r * s, 0, 7); g.fill();
    g.fillStyle = 'rgba(238,242,246,.35)'; g.beginPath(); g.ellipse(...T(-640, 330), 200 * s, 130 * s, 0, 0, 7); g.fill();
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (const r of I.roads) {
      g.beginPath();
      for (let i = 0; i < r.count; i += 3) { const [x, y] = T(r.px[i], r.pz[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.lineTo(...T(r.px[r.count - 1], r.pz[r.count - 1]));
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 7; g.stroke(); g.strokeStyle = '#e9e5da'; g.lineWidth = 3.4; g.stroke();
    }
    // zones de glisse : le tronçon en jaune
    for (const a of L.spots.acts) if (a.def.type === 'zone') {
      const r = I.roads[a.def.e], i0 = Math.round(a.def.from * (r.count - 1)), i1 = Math.round(a.def.to * (r.count - 1));
      g.beginPath(); for (let i = i0; i <= i1; i += 3) { const [x, y] = T(r.px[i], r.pz[i]); i === i0 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.strokeStyle = 'rgba(247,209,84,.85)'; g.lineWidth = 4; g.stroke();
    }
    if (L.gps && L.gps.pts.length > 2) {
      const P = L.gps.pts; g.beginPath(); g.moveTo(...T(player.x, player.z)); for (let k = 0; k < P.length; k += 2) g.lineTo(...T(P[k], P[k + 1]));
      g.strokeStyle = '#7b8cff'; g.lineWidth = 4; g.setLineDash([8, 6]); g.stroke(); g.setLineDash([]);
    }
    const dot = (x, y, r, col, ring) => { g.fillStyle = '#07080a'; g.beginPath(); g.arc(x, y, r + 2.5, 0, 7); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); if (ring) { g.strokeStyle = ring; g.lineWidth = 2; g.stroke(); } };
    const label = (x, y, t, col) => { g.font = '700 12px "Archivo", sans-serif'; g.textAlign = 'center'; g.lineWidth = 3.5; g.strokeStyle = 'rgba(7,8,10,.85)'; g.strokeText(t, x, y); g.fillStyle = col || '#f2f2ef'; g.fillText(t, x, y); };
    const side = { hubs: [], rivals: [], acts: [], npcs: [], photos: [] };
    for (const [id, hb] of Object.entries(I.hubs)) {
      const [x, y] = T(hb.x, hb.z), open = Story.chapterOpen(profile, Story.zoneIndex(id)), name = TRACKS[trackIndexOf(id)].name;
      g.fillStyle = '#07080a'; g.fillRect(x - 7, y - 7, 14, 14); g.fillStyle = open ? '#f7d154' : '#6c717a'; g.fillRect(x - 5, y - 5, 10, 10);
      label(x, y - 12, name);
      side.hubs.push({ i: item({ x, y, name, set: () => setGps({ name, x: hb.x, z: hb.z, arrive: 13 }) }), name, sub: open ? `chapitre ${Story.zoneIndex(id) + 1}${Story.chapterDone(profile, Story.zoneIndex(id)) ? ' · terminé' : ''}` : 'fermé', lock: !open });
    }
    for (const a of L.spots.acts) {
      const [x, y] = T(a.x, a.z), n = IsleLife.starsOf(a.def, bag.best[a.def.id] || 0);
      dot(x, y, 4.5, a.def.type === 'radar' ? '#7b8cff' : '#f7d154');
      const rec = bag.best[a.def.id] || 0;
      side.acts.push({ i: item({ x, y, name: a.def.name, set: () => setGps({ name: a.def.name, x: a.x, z: a.z, arrive: 12 }) }), name: a.def.name, sub: `${a.def.type === 'radar' ? 'radar' : 'zone de glisse'} · ${rec ? `record ${rec.toLocaleString('fr-FR')} ${a.def.type === 'radar' ? 'km/h' : 'pts'}` : 'pas encore tenté'}`, stars: n });
    }
    for (const n of L.spots.npcs) {
      const [x, y] = T(n.x, n.z), c = castOf(n.def.who);
      dot(x, y, 4, c.col, '#f2f2ef');
      side.npcs.push({ i: item({ x, y, name: c.name, set: () => setGps({ name: c.name, x: n.x, z: n.z, arrive: 10 }) }), name: c.name, sub: c.role, em: bag.met[n.def.id] ? '✓' : '' });
    }
    for (const p of L.spots.photos) {
      const [x, y] = T(p.x, p.z);
      g.fillStyle = '#07080a'; g.fillRect(x - 6, y - 4.5, 12, 9); g.fillStyle = '#7b8cff'; g.fillRect(x - 4.5, y - 3, 9, 6);
      side.photos.push({ i: item({ x, y, name: p.def.name, set: () => setGps({ name: p.def.name, x: p.x, z: p.z, arrive: 7 }) }), name: p.def.name, sub: 'belvédère', em: bag.photo[p.def.id] ? '✓' : '' });
    }
    I.daruma.forEach((d, k) => { if (found[k]) return; const [x, y] = T(d.x, d.z); dot(x, y, 2.6, '#ffb020'); item({ x, y, name: 'Daruma doré', set: () => setGps({ name: 'Daruma doré', x: d.x, z: d.z, arrive: 2, daruma: k }) }); });
    for (const r of L.rivals) {
      const [x, y] = T(r.A.x, r.A.z), w = bag.rivals[r.def.id] || 0;
      dot(x, y, 5.5, r.c.col, '#ff4d4f'); label(x, y - 10, r.c.name, r.c.col);
      side.rivals.push({ i: item({ x, y, name: r.c.name, set: () => { r.cool = 0; setGps({ name: r.c.name, get: () => [r.A.x, r.A.z], arrive: 30 }); } }), name: r.c.name, sub: `${r.def.crew} · ${r.def.car.toUpperCase()}`, em: w ? `battu ×${w}` : Economy.fmt(r.def.reward) });
    }
    for (const def of IsleLife.RIVALS) if (!L.rivals.some((r) => r.def === def)) side.rivals.push({ i: -1, name: castOf(def.who).name, sub: `arrive au chapitre ${def.unlock + 1}`, lock: true });
    if (mp) for (const R of mp.remotes.values()) if (R.shown) { const [x, y] = T(R.view.x, R.view.z); dot(x, y, 5.5, R.color, '#f2f2ef'); label(x, y - 10, R.name, R.color); item({ x, y, name: R.name, set: () => setGps({ name: R.name, get: () => (R.shown ? [R.view.x, R.view.z] : [player.x, player.z]), arrive: 20 }) }); }
    // toi
    const [px, py] = T(player.x, player.z);
    g.save(); g.translate(px, py); g.rotate(player.heading); g.fillStyle = '#07080a'; g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, 8); g.lineTo(-8, -8); g.closePath(); g.fill();
    g.fillStyle = '#ff3d3d'; g.beginPath(); g.moveTo(9, 0); g.lineTo(-5, 5.5); g.lineTo(-5, -5.5); g.closePath(); g.fill(); g.restore();
    const sec = (title, list) => list.length ? `<div><h3>${title}</h3><ul>${list.map((o) => `<li class="${o.lock ? 'lock' : ''}"><button ${o.i < 0 ? 'disabled' : `data-i="${o.i}"`}><span>${esc(o.name)}<small>${esc(o.sub || '')}</small></span><em>${o.stars != null ? `${'★'.repeat(o.stars)}<span class="st0">${'☆'.repeat(3 - o.stars)}</span>` : esc(o.em || '')}</em></button></li>`).join('')}</ul></div>` : '';
    $('mapSide').innerHTML = (L.gps ? `<div class="gps-on"><span>GPS : <b>${esc(L.gps.name)}</b></span><button class="btn ghost" data-gps-off>Arrêter</button></div>` : '<p class="sub" style="margin:0">Touche un repère pour y régler le GPS.</p>')
      + sec('Rivaux', side.rivals) + sec('Activités', side.acts) + sec('Lieux de l’aventure', side.hubs) + sec('Habitants', side.npcs) + sec('Belvédères', side.photos);
    $('mapLegend').innerHTML = '<span><i class="sq" style="background:#f7d154"></i>lieux</span><span><i style="background:#f7d154"></i>zones</span><span><i style="background:#7b8cff"></i>radars</span><span><i class="sq" style="background:#7b8cff"></i>belvédères</span><span><i style="background:#ffb020"></i>daruma</span><span><i class="ring"></i>rivaux</span><span><i class="tri"></i>toi</span>';
  }
  function pickMap(i) { const it = mapItems[i]; if (!it) return; it.set(); renderIsleMap(); }
  $('mapCv').addEventListener('click', (e) => {
    const cv = $('mapCv'), b = cv.getBoundingClientRect(), x = (e.clientX - b.left) * cv.width / b.width, y = (e.clientY - b.top) * cv.height / b.height;
    let best = -1, bd = 22 * 22;
    mapItems.forEach((o, k) => { const d = (o.x - x) ** 2 + (o.y - y) ** 2; if (d < bd) { bd = d; best = k; } });
    if (best >= 0) { Sound.ui(); pickMap(best); }
  });
  $('mapSide').addEventListener('click', (e) => {
    if (e.target.closest('[data-gps-off]')) { clearGps(); renderIsleMap(); return; }
    const b = e.target.closest('[data-i]'); if (b) { Sound.ui(); pickMap(+b.dataset.i); }
  });
  $('mapBtn').addEventListener('click', () => { Sound.ui(); renderIsleMap(); show('isleMap'); });

  // ---------- multijoueur (net.js) : session, voitures des autres, émotes, course et battle de groupe ----------
  // mp : null | { S : session, remotes : id → { name, kind, cfg, color, interp, model, tag, view, shown, emote, emoteT }, internet, offer, answer }
  let mp = null;
  const EMOTE_CHIP = { horn: 'TÛT', gg: 'GG', wave: 'SALUT', fire: 'FEU', follow: 'SUIS' };
  const mpUi = { view: 'start', status: '', err: '', busy: false, offerIn: '' };
  const myName = () => Net.cleanName(store.get('mpName', ''));
  function mpStart(role) {
    const name = Net.cleanName($('mpName') ? $('mpName').value : myName());
    store.set('mpName', name);
    const me = { name, kind: profile.current, cfg: profile.cars[profile.current] };
    mp = { S: Net.createSession(me, mpOn, Economy), remotes: new Map(), internet: !!store.get('mpNet', 0), offer: null, answer: null };
    if (role === 'host') mp.S.host();
    mpUi.view = role; mpUi.status = ''; mpUi.err = '';
    refreshMpHud();
  }
  function mpClose(quiet) {
    if (!mp) return;
    if (mp.offer) mp.offer.cancel();
    for (const R of mp.remotes.values()) dropRemoteModel(R);
    mp.S.close();
    mp = null; mpUi.view = 'start'; mpUi.status = ''; mpUi.answer = '';
    if (life) { life.race = null; life.battle = null; }
    refreshMpHud(); renderMulti();
    if (!quiet) toast('Session fermée', 'apex');
  }
  function mpOn(t, d) {
    if (!mp) return;
    if (t === 'peers') { refreshMpHud(); renderMulti(); }
    else if (t === 'join') { ensureRemote(d.id, d); if (mp.S.role === 'host') { mpUi.status = ''; } toast(`${d.name} rejoint la session`, 'chal'); Sound.ping(); }
    else if (t === 'leave') { const R = mp.remotes.get(d.id); if (R) { toast(`${R.name} quitte la session`, 'apex'); dropRemoteModel(R); mp.remotes.delete(d.id); } }
    else if (t === 'state') { const R = mp.remotes.get(d.id); if (R) R.interp.push(d.s, performance.now()); }
    else if (t === 'emote') showEmote(d.id, d.e);
    else if (t === 'ev') mpEvent(d.id, d.ev);
    else if (t === 'welcome') {
      for (const [id, p] of mp.S.peers) ensureRemote(id, p);
      const host = mp.S.peers.get(0);
      mpUi.status = 'ok'; renderMulti();
      toast(`Connecté à la session de ${host ? host.name : 'l’hôte'}`, 'chal'); Sound.ping();
      if (!isle) { show(null); setTimeout(() => enterIsland(d.at), 40); }
    } else if (t === 'closed') { toast('Session terminée : l’hôte est parti', 'lost'); mpClose(true); }
    else if (t === 'full') { toast('Session complète : 4 pilotes au maximum', 'lost'); mpClose(true); }
  }
  function ensureRemote(id, p) {
    if (!mp || id === mp.S.id) return null;
    let R = mp.remotes.get(id);
    if (!R) { R = { id, name: p.name, kind: p.kind, cfg: p.cfg, color: p.color || Net.COLORS[id % 4], interp: Net.createInterp(), model: null, tag: null, view: null, shown: false, emote: null, emoteT: 0 }; mp.remotes.set(id, R); }
    remoteModel(R);
    refreshMpHud();
    return R;
  }
  function remoteModel(R) {
    if (R.model || !isle || !life) return;
    R.model = buildCar(R.kind, lookOf(R.cfg, false));
    R.model.ground = isleData.terrain.at; envOn(R.model); scene.add(R.model.root); R.model.root.visible = false;
    R.tag = makeTag(); R.tag.sprite.position.set(0, 2.7, 0); R.model.root.add(R.tag.sprite);
  }
  function dropRemoteModel(R) { if (!R.model) return; R.tag.dispose(); R.model.dispose(); R.model = null; R.tag = null; R.shown = false; }
  function remotesDraw(dt) {
    const now = performance.now(), cx = camera.position.x, cz = camera.position.z;
    for (const R of mp.remotes.values()) {
      if (!R.model) continue;
      const v = R.interp.sample(now);
      R.view = v; R.shown = !!v && v.age < 4;
      R.model.root.visible = R.shown;
      if (!R.shown) continue;
      R.model.update(v, dt, v.brake);
      if ((v.x - cx) ** 2 + (v.z - cz) ** 2 < 150 * 150) carFx(v, R.model, dt, 'M' + R.id, 'L');
      if (R.emoteT > 0) R.emoteT -= dt;
      fitTag(R.tag.sprite, v.x, v.z, cx, cz, 1.7);
      R.tag.set(R.name, v.combo > 200 ? `combo ${Math.round(v.combo).toLocaleString('fr-FR')}` : R.kind.toUpperCase(), R.color, R.emoteT > 0 ? EMOTE_CHIP[R.emote] : null);
    }
  }
  function refreshMpHud() {
    const on = !!(mp && mp.S.role && isle);
    $('mpHud').hidden = !on;
    $('mpPause').hidden = !(on && mp.S.role === 'host');
    if (!on) return;
    const list = mp.S.peerList().sort((a, b) => a.id - b.id);
    $('mpList').innerHTML = list.map((p) => `<span><i style="background:${Net.COLORS[p.id % 4]}"></i>${esc(p.name)}${p.id === mp.S.id ? ' · toi' : ''}</span>`).join('');
    $('hudBest').textContent = 'SESSION À ' + list.length;
  }
  function sendEmote(e) {
    if (!Net.EMOTES[e]) return;
    if (e === 'horn') Sound.horn(1, 0.9);
    if (!mp || !mp.S.role) return;
    mp.S.emote(e);
    if (e !== 'horn') toast(`Toi : ${Net.EMOTES[e]}`, 'buy');
  }
  function showEmote(id, e) {
    const R = mp.remotes.get(id); if (!R) return;
    R.emote = e; R.emoteT = 2.6;
    if (e === 'horn') { const d = R.view ? Math.hypot(R.view.x - player.x, R.view.z - player.z) : 50; Sound.horn(Math.max(0.15, 1 - d / 150), 0.9); }
    else { toast(`${R.name} : ${Net.EMOTES[e]}`, 'buy'); if (e === 'follow' && R.view && life) setGps({ name: R.name, get: () => (R.shown ? [R.view.x, R.view.z] : [player.x, player.z]), arrive: 20 }); }
  }
  $('emotes').addEventListener('click', (e) => { const b = e.target.closest('[data-emote]'); if (b) sendEmote(b.dataset.emote); });
  // évènements de groupe : l'hôte lance, tout le monde (hôte compris) les applique
  function mpSend(ev) { if (!mp || !mp.S.role) return; mp.S.event(ev); const c = Net.cleanEvent(ev, mp.S.role === 'host'); if (c) mpEvent(mp.S.id, c); }
  const nameOf = (id) => (mp && id === mp.S.id ? 'Toi' : mp && mp.remotes.get(id) ? mp.remotes.get(id).name : 'Pilote');
  function mpEvent(id, ev) {
    if (!isle || !life) return;
    const I = isleData;
    if (ev.k === 'race') {
      if (life.duel) { life.duel.r.cool = 10; Object.assign(life.duel.r.A, { route: null, hold: false }); life.duel = null; }
      life.zone = null; life.battle = null;
      const [nx, nz] = I.def.nodes[ev.node] || [];
      if (nx == null) return;
      // grille de départ : deux par rangée derrière l'hôte, dans l'ordre des numéros
      const ids = mp.S.peerList().map((p) => p.id).sort((a, b) => a - b), rank = Math.max(0, ids.indexOf(mp.S.id));
      if (ev.at) {
        const back = 6 + 9 * Math.floor(rank / 2), q = I.nearestRoad(ev.at.x - Math.cos(ev.at.h) * back, ev.at.z - Math.sin(ev.at.h) * back, {});
        if (q.i >= 0) {
          let h = Math.atan2(I.TZ[q.i], I.TX[q.i]); if (Math.cos(h - ev.at.h) < 0) h += Math.PI;
          const lat = rank % 2 ? 2.2 : -2.2;
          placePlayer(I.X[q.i] - Math.sin(h) * lat, I.Z[q.i] + Math.cos(h) * lat, h, 0);
        }
      }
      life.race = { node: ev.node, name: nodeName(ev.node), x: nx, z: nz, t: 0, state: 'count', results: new Map(), mine: false, endT: 0 };
      setGps({ name: nodeName(ev.node), x: nx, z: nz, race: true });
      show(null); phase = 'count'; countdown();
      toast(`Course : premier arrivé à ${nodeName(ev.node)}`, 'chal');
    } else if (ev.k === 'arrive' && life.race) {
      if (life.race.results.has(id)) return;
      life.race.results.set(id, ev.time);
      const pos = life.race.results.size;
      toast(`${pos}${pos === 1 ? 'er' : 'e'} · ${nameOf(id)} · ${fmtTime(ev.time)}`, pos === 1 ? 'chal' : 'apex');
    } else if (ev.k === 'battle') {
      life.race = null; life.zone = null;
      life.battle = { dur: ev.dur, t: 0, base: score.total + score.combo, scores: new Map(), sent: false, endT: 0 };
      popup('Battle de drift', 'apex'); Sound.count(true);
      toast(`Battle de drift : ${ev.dur} s, le plus gros score gagne`, 'chal');
    } else if (ev.k === 'score' && life.battle) life.battle.scores.set(id, ev.pts);
    else if (ev.k === 'cancel') { life.race = null; life.battle = null; clearGps(); toast('Épreuve annulée par l’hôte', 'lost'); }
  }
  function raceTick(dt) {
    const R = life.race, st = player;
    if (R.state === 'count') { if (phase === 'play') R.state = 'run'; return; }
    if (phase === 'play' && !R.mine) R.t += dt;
    if (!R.mine && Math.hypot(st.x - R.x, st.z - R.z) < 18) {
      R.mine = true; clearGps();
      mpSend({ k: 'arrive', time: Math.max(0.1, R.t) });
      Sound.bank(R.results.size === 1);
    }
    const total = mp ? mp.S.peers.size : 1;
    if (R.results.size >= total || R.t > 300) {
      R.endT += dt;
      if (R.endT > 1.2 || R.t > 300) {
        life.race = null; clearGps();
        const list = [...R.results.entries()].sort((a, b) => a[1] - b[1]);
        const lines = [['narr', `Course jusqu’à ${R.name} : ` + (list.map(([id, t], k) => `${k + 1}. ${nameOf(id)} (${fmtTime(t)})`).join(' · ') || 'personne n’est arrivé.')]];
        const first = list[0] && list[0][0] === mp.S.id;
        if (first) { Economy.credit(profile, 'Course entre amis', 800); saveProfile(); refreshWallet(); lines.push(['narr', 'Victoire : +¥800.']); }
        chat(lines, () => resumeGame());
      }
    }
  }
  function battleTick(dt) {
    const B = life.battle;
    if (phase === 'play' || phase === 'count') B.t += dt;
    if (B.t >= B.dur && !B.sent) {
      bank(); B.sent = true;
      mpSend({ k: 'score', pts: Math.max(0, Math.round(score.total - B.base)) });
    }
    if (B.sent) {
      B.endT += dt;
      if (B.scores.size >= (mp ? mp.S.peers.size : 1) || B.endT > 5) {
        life.battle = null;
        const list = [...B.scores.entries()].sort((a, b) => b[1] - a[1]);
        const lines = [['narr', 'Battle de drift : ' + list.map(([id, p], k) => `${k + 1}. ${nameOf(id)} (${p.toLocaleString('fr-FR')} pts)`).join(' · ')]];
        if (list[0] && list[0][0] === mp.S.id && list.length > 1) { Economy.credit(profile, 'Battle de drift entre amis', 800); saveProfile(); refreshWallet(); lines.push(['narr', 'Victoire : +¥800.']); }
        chat(lines, () => resumeGame());
      }
    }
  }
  $('mpRaceBtn').addEventListener('click', () => {
    if (!mp || !isle) return;
    const tgt = IsleLife.tougeTarget(isleData, player.x, player.z);
    if (!tgt) return;
    Sound.ui();
    mpSend({ k: 'race', node: tgt.node, at: { x: player.x, z: player.z, h: player.heading } });
  });
  $('mpBattleBtn').addEventListener('click', () => { if (!mp || !isle) return; Sound.ui(); show(null); mpSend({ k: 'battle', dur: 90 }); resumeGame(); });
  // l'état part 15 fois par seconde, même en pause (les autres voient ta voiture arrêtée)
  function mpSendTick(dt) {
    if (!mp || !mp.S.role || !isle || !player) return;
    life.sendT -= dt;
    if (life.sendT <= 0) { life.sendT = 1 / Net.HZ; mp.S.sendState(Net.encodeState(performance.now(), player, score.combo, input.brake > 0.1 || input.handbrake > 0.5)); }
    if (mp.S.role === 'host') { life.hostT -= dt; if (life.hostT <= 0) { life.hostT = 1; mp.S.setHostAt(player.x, player.z, player.heading); } }
  }

  // écran de session : créer, inviter (code ou lien), rejoindre
  function shareLink(code) { return /^https?:/.test(location.href) ? location.href.split('#')[0] + '#sdc=' + code : code; }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); toast('Copié', 'apex'); return; } catch (e) { /* repli ci-dessous */ }
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Copié', 'apex'); } catch (e) { toast('Copie impossible : sélectionne le texte', 'lost'); }
    ta.remove();
  }
  async function shareText(t, title) { try { await navigator.share({ title, text: t }); } catch (e) { copyText(t); } }
  function openMulti(code) {
    if (code) { mpUi.offerIn = code; if (!mp) mpUi.view = 'join'; }
    renderMulti(); show('multi');
  }
  function renderMulti() {
    const B = $('mpBody'); if (!B) return;
    const players = () => mp ? `<div class="players">${mp.S.peerList().sort((a, b) => a.id - b.id).map((p) => `<div><i style="background:${Net.COLORS[p.id % 4]}"></i>${esc(p.name)}${p.id === mp.S.id ? ' (toi)' : ''}<small>${p.kind.toUpperCase()}${p.id === 0 ? ' · hôte' : ''}</small></div>`).join('')}</div>` : '';
    const err = mpUi.err ? `<div class="status ko">${esc(mpUi.err)}</div>` : '';
    const pri = mp && mp.offer ? 'btn' : 'btn primary'; // une invitation en cours garde l'action principale
    const ride = isle ? `<button class="${pri}" data-mp="back">Retour sur l’île</button>` : `<button class="${pri}" data-mp="ride">Rouler sur l’île</button>`;
    const kept = { a: $('mpAnsIn') && $('mpAnsIn').value, o: $('mpOffIn') && $('mpOffIn').value }; // saisie en cours gardée
    const view = mp && mp.S.role === 'host' ? 'host' : mp && mp.S.role === 'guest' && mp.S.id != null ? 'guest' : mpUi.view === 'join' ? 'join' : 'start';
    let h;
    if (view === 'start') {
      const net = store.get('mpNet', 0);
      h = `<p class="sub" style="margin:0">Jusqu’à 4 pilotes sur l’île, chacun sur son appareil. Pas de compte : l’hôte envoie un code d’invitation, l’invité renvoie un code de réponse.</p>
        <label class="f">Pseudo affiché aux autres<input type="text" id="mpName" maxlength="16" autocomplete="off" spellcheck="false" value="${esc(myName() === 'Pilote' ? '' : myName())}" placeholder="Pilote"></label>
        <div class="seg" role="group" aria-label="Réseau"><button class="opt" data-net="0" aria-pressed="${!net}"><b>Même Wi-Fi</b><small>Aucun serveur tiers</small></button><button class="opt" data-net="1" aria-pressed="${!!net}"><b>Internet</b><small>Serveur STUN public de Google</small></button></div>
        <div class="note"><b>Ce qui est partagé :</b> ton pseudo, ta voiture et ta position sur l’île, uniquement avec les joueurs de la session, le temps de la session. Rien n’est enregistré en ligne. La connexion est directe entre appareils : chacun voit l’adresse IP des autres. En mode Internet, un serveur STUN de Google (hors UE) voit aussi ton adresse IP. Évite ton vrai nom comme pseudo.</div>
        ${err}<div class="acts"><button class="btn primary" data-mp="host">Créer une session</button><button class="btn" data-mp="join">Rejoindre une session</button></div>`;
    } else if (view === 'host') {
      const o = mp.offer;
      h = `<div class="status ok">Session ouverte · ${mp.S.peers.size} / ${Net.MAX} pilotes · ${mp.internet ? 'Internet' : 'même Wi-Fi'}</div>${players()}`;
      if (mp.S.peers.size < Net.MAX) h += o ? `<div class="step"><h3>1 · Envoie l’invitation</h3><textarea readonly id="mpOffer" aria-label="Code d’invitation">${esc(shareLink(o.code))}</textarea><div class="acts"><button class="btn" data-mp="copy">Copier</button>${navigator.share ? '<button class="btn" data-mp="share">Partager…</button>' : ''}</div>
          <h3>2 · Colle sa réponse</h3><textarea id="mpAnsIn" placeholder="SDC1…" aria-label="Code de réponse"></textarea><div class="acts"><button class="btn primary" data-mp="accept"${mpUi.busy ? ' disabled' : ''}>Valider la réponse</button><button class="btn ghost" data-mp="cancelInv">Annuler l’invitation</button></div>${mpUi.status === 'wait' ? '<div class="status">Connexion…</div>' : ''}</div>`
        : `<div class="acts"><button class="btn" data-mp="invite"${mpUi.busy ? ' disabled' : ''}>${mpUi.busy ? 'Préparation…' : 'Inviter un pilote'}</button></div>`;
      h += `${err}<div class="acts">${ride}<button class="btn ghost" data-mp="close">Fermer la session</button></div>`;
    } else if (view === 'guest') {
      h = `<div class="status ok">Connecté · ${mp.S.peers.size} / ${Net.MAX} pilotes</div>${players()}${err}<div class="acts">${ride}<button class="btn ghost" data-mp="close">Quitter la session</button></div>`;
    } else {
      h = `<div class="step"><h3>1 · Colle l’invitation reçue</h3><textarea id="mpOffIn" placeholder="Lien ou code SDC1…" aria-label="Code d’invitation">${esc(mpUi.offerIn || '')}</textarea><div class="acts"><button class="btn primary" data-mp="answer"${mpUi.busy ? ' disabled' : ''}>${mpUi.busy ? 'Préparation…' : 'Créer ma réponse'}</button></div></div>`;
      if (mp && mp.answer) h += `<div class="step"><h3>2 · Renvoie ce code à l’hôte</h3><textarea readonly id="mpAns" aria-label="Code de réponse">${esc(mp.answer)}</textarea><div class="acts"><button class="btn" data-mp="copyAns">Copier</button>${navigator.share ? '<button class="btn" data-mp="shareAns">Partager…</button>' : ''}</div><div class="status">En attente de l’hôte…</div></div>`;
      h += `${err}<div class="acts"><button class="btn ghost" data-mp="close">Annuler</button></div>`;
    }
    B.innerHTML = h;
    if (kept.a && $('mpAnsIn')) $('mpAnsIn').value = kept.a;
    if (kept.o && $('mpOffIn')) $('mpOffIn').value = kept.o;
  }
  $('mpBody').addEventListener('click', async (e) => {
    const n = e.target.closest('[data-net]');
    if (n) { store.set('mpNet', +n.dataset.net); Sound.ui(); const nm = $('mpName') && $('mpName').value; renderMulti(); if (nm != null && $('mpName')) $('mpName').value = nm; return; }
    const b = e.target.closest('[data-mp]'); if (!b) return;
    const a = b.dataset.mp; Sound.ui(); mpUi.err = '';
    if (a === 'host') { mpStart('host'); renderMulti(); }
    else if (a === 'join') { store.set('mpName', Net.cleanName($('mpName').value)); mpUi.view = 'join'; renderMulti(); }
    else if (a === 'invite') {
      mpUi.busy = true; renderMulti();
      try {
        const o = await Net.rtcOffer(mp.internet);
        mp.offer = o; mp.S.addGuestLink(o.link);
        o.ready.then(() => { if (mp && mp.offer === o) { mp.offer = null; mpUi.status = ''; renderMulti(); } });
      } catch (err) { mpUi.err = 'Connexion directe indisponible sur ce navigateur.'; }
      mpUi.busy = false; renderMulti();
    } else if (a === 'copy' || a === 'share') { const t = $('mpOffer').value; if (a === 'copy') copyText(t); else shareText(t, 'Sideways Drift Club · invitation'); }
    else if (a === 'accept') {
      const o = mp.offer; if (!o) return;
      mpUi.busy = true;
      const ok = await o.accept($('mpAnsIn').value).catch(() => false);
      mpUi.busy = false;
      if (!ok) mpUi.err = 'Code de réponse illisible : recopie-le en entier.';
      else {
        mpUi.status = 'wait';
        setTimeout(() => { if (mp && mp.offer === o && !o.link.open) { mpUi.err = 'Connexion impossible. Même Wi-Fi des deux côtés ? Sinon, essaie le mode Internet.'; mpUi.status = ''; o.cancel(); mp.offer = null; renderMulti(); } }, 15000);
      }
      renderMulti();
    } else if (a === 'cancelInv') { if (mp.offer) mp.offer.cancel(); mp.offer = null; renderMulti(); }
    else if (a === 'answer') {
      const text = $('mpOffIn').value; mpUi.offerIn = text;
      mpUi.busy = true; renderMulti();
      try {
        const ans = await Net.rtcAnswer(text);
        if (!ans) mpUi.err = 'Invitation illisible : copie le lien ou le code en entier.';
        else {
          if (mp) mpClose(true);
          mpStart('guest'); mpUi.view = 'join'; mp.answer = ans.code; mp.internet = ans.internet;
          const m0 = mp;
          ans.ready.then((link) => { if (mp === m0) mp.S.join(link); });
          setTimeout(() => { if (mp === m0 && mp.S.id == null) { mpUi.err = 'L’hôte n’a pas répondu. Vérifie qu’il a bien validé ta réponse.'; renderMulti(); } }, 90000);
        }
      } catch (err) { mpUi.err = 'Connexion directe indisponible sur ce navigateur.'; }
      mpUi.busy = false; renderMulti();
    } else if (a === 'copyAns' || a === 'shareAns') { const t = $('mpAns').value; if (a === 'copyAns') copyText(t); else shareText(t, 'Sideways Drift Club · réponse'); }
    else if (a === 'close') { mpClose(); mpUi.view = 'start'; renderMulti(); }
    else if (a === 'ride') { show(null); toast('Chargement de l’île…', 'apex'); setTimeout(() => enterIsland(mp && mp.S.role === 'guest' ? mp.S.hostAt : null), 40); }
    else if (a === 'back') { show(null); resumeGame(); }
  });
  $('multiBtn').addEventListener('click', () => { Sound.ui(); ensureAudio(); openMulti(); });

  // touches de l'île : E interagir, M carte, H klaxon, 1-4 messages rapides en session
  addEventListener('keydown', (e) => {
    if (e.repeat || dlg || !isle || document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'e' && phase === 'play') interact();
    else if (k === 'm' && (phase === 'play' || phase === 'count')) openIsleMap();
    else if (k === 'm' && screenId === 'isleMap') closeIsleMap();
    else if (k === 'h' && phase === 'play') sendEmote('horn');
    else if (mp && phase === 'play' && /^[1-4]$/.test(k)) sendEmote(['wave', 'gg', 'follow', 'fire'][+k - 1]);
  });

  function syncSettingsUI() {
    pressGroup($('assistSeg'), 'data-v', settings.assist);
    pressGroup($('qualSeg'), 'data-v', settings.quality);
    $('optAutoGas').checked = settings.autoGas; $('optSound').checked = settings.sound;
    $('optMotion').checked = settings.reduce; $('optVibe').checked = settings.vibe;
    refreshTouchUI();
  }
  const segBind = (id, key, conv) => $(id).addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    settings[key] = conv ? conv(b.dataset.v) : b.dataset.v; saveSettings(); syncSettingsUI(); Sound.ui();
    if (key === 'quality') { qLevel = settings.quality === 'auto' ? (isTouch ? 'med' : 'high') : settings.quality; quality = QUALITY[qLevel]; dprScale = 1; loadTrack(trackIdx); }
  });
  segBind('assistSeg', 'assist', Number); segBind('qualSeg', 'quality');
  const tog = (id, key, after) => $(id).addEventListener('change', (e) => { settings[key] = e.target.checked; saveSettings(); syncSettingsUI(); after && after(); });
  tog('optAutoGas', 'autoGas'); tog('optMotion', 'reduce'); tog('optVibe', 'vibe');
  tog('optSound', 'sound', () => { if (settings.sound) Sound.init(); Sound.setEnabled(settings.sound); });

  const go = (id) => () => { Sound.ui(); show(id); };
  $('playBtn').addEventListener('click', () => {
    ensureAudio();
    if (!helpSeen) { helpSeen = true; store.set('seenHelp', true); helpThenSelect = true; show('help'); return; }
    openSelect();
  });
  function openSelect() { buildTrackList(); pressGroup(document.querySelector('#select .modes'), 'data-mode', mode); show('select'); }
  $('garageBtn').addEventListener('click', () => { shopReturn = 'menu'; openShop(); });
  $('resShopBtn').addEventListener('click', () => { shopReturn = 'results'; openShop(); });
  $('careerBtn').addEventListener('click', () => { Sound.ui(); openCareer(); });
  $('settingsBtn').addEventListener('click', () => { returnTo = 'menu'; syncSettingsUI(); show('settings'); });
  $('pSettingsBtn').addEventListener('click', () => { returnTo = 'pause'; syncSettingsUI(); show('settings'); });
  $('layoutBtn').addEventListener('click', openLayoutEditor);
  $('helpBtn').addEventListener('click', go('help'));
  $('advBtn').addEventListener('click', () => { Sound.ui(); ensureAudio(); openAdventure(); });
  // construire l'île prend un instant sur mobile : on l'annonce d'abord
  $('isleBtn').addEventListener('click', () => { Sound.ui(); toast('Chargement de l’île…', 'apex'); setTimeout(() => enterIsland(), 40); });
  for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => {
    Sound.ui();
    const scr = b.closest('.screen').id;
    if (scr === 'help' && helpThenSelect) { helpThenSelect = false; openSelect(); return; }
    if (scr === 'adventure' && isle) { show(null); resumeGame(); return; } // retour sur la route de l'île
    if (scr === 'isleMap') { closeIsleMap(); return; }
    show(scr === 'settings' ? returnTo : 'menu');
  });
  $('goBtn').addEventListener('click', startRun);
  $('resumeBtn').addEventListener('click', resumeGame);
  $('resetBtn').addEventListener('click', () => { show(null); respawn(); phase = 'count'; countdownShort(); });
  $('restartBtn').addEventListener('click', () => { if (isle) enterIsland(); else startRun(); });
  $('quitBtn').addEventListener('click', () => { if (mode === 'free' && score.runT > 5) finishRun(); else toMenu(); });
  $('pauseBtn').addEventListener('click', pauseGame);
  $('camBtn').addEventListener('click', cycleCam);
  $('againBtn').addEventListener('click', () => { if (advNext) { const n = advNext; advNext = null; playMission(n.ci, n.k); } else if (isle) enterIsland(); else startRun(); });
  $('menuBtn').addEventListener('click', toMenu);
  if (isTouch) $('kbHint').hidden = true;

  // ---------- démarrage ----------
  function boot() {
    syncSettingsUI();
    applyLayout();
    Sound.setEnabled(settings.sound);
    loadTrack(trackIdx);
    resize();
    addEventListener('resize', resize);
    camPos.set(leader.state.x + 8, gy(leader.state.x, leader.state.z) + 3, leader.state.z + 8);
    camLook.set(leader.state.x, gy(leader.state.x, leader.state.z) + 1, leader.state.z);
    // quelques secondes de simulation pour que la fumée soit déjà là
    for (let i = 0; i < 90; i++) { leader.update(1 / 60, 1); carFx(leader.state, playerModel, 1 / 60, 'L', 'P'); smoke.update(1 / 60); }
    $('loading').remove();
    show('menu');
    refreshWallet();
    claimDaily();
    // lien d'invitation multijoueur (…#sdc=CODE) : on ouvre directement l'écran pour rejoindre
    const inv = location.hash.match(/sdc=(SDC1[zr]\.[A-Za-z0-9_-]+)/);
    if (inv) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* pas grave */ } openMulti(inv[1]); }
    requestAnimationFrame((n) => { last = n; frame(n); });
    // accès de test (non utilisé par le jeu)
    window.__sdcDbg = { scene, envMap: () => envMap, renderer, perf, setQuality: (q) => { qLevel = q; quality = QUALITY[q]; loadTrack(trackIdx); }, carRoot: () => playerModel.root, trace: (on) => { const t = dbgTrace; dbgTrace = on ? [] : null; return t; }, profile, isle: () => isleData, life: () => life, mp: () => mp, enterIsland, interact, openIsleMap, gpsAct, startDuel: (k, kind) => { const r = life && life.rivals.find((x) => x.def.id === k); if (r) startDuel(r, kind, kind === 'race' ? IsleLife.tougeTarget(isleData, r.A.x, r.A.z) : null); }, mpStart, mpLocal: (role) => { const api = Net.localLinks('sdc-test'); if (role === 'host') { mpStart('host'); api.listen(); api.onguest = (l) => mp.S.addGuestLink(l); } else { mpStart('guest'); api.knock().then((l) => mp.S.join(l)); } return api; }, preview: (k, c) => { showKind = k; showCfg = c; buildCars(); }, view: (v) => { shopView = v; snapCam = true; }, yaw: (y) => { garageYaw = y; } };
    window.__sdc = { get phase() { return phase; }, get player() { return player; }, get score() { return score; }, get track() { return track; }, get line() { return line; }, lossLog, startRun, input, touch, layouts, tState: () => tState, openLayoutEditor, setMode: (m) => { mode = m; }, setTrack: (i) => { trackIdx = i; loadTrack(i); }, finishRun, get fps() { return 1000 / frameAvg; } };
  }
  if (document.fonts && document.fonts.ready) Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(boot);
  else boot();
})();
