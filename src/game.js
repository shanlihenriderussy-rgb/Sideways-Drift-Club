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
  const garage = Object.assign({ car: 'kouki', paint: 'panda', rim: 'bronze', number: 15 }, store.get('garage', {}));
  const bests = store.get('bests', {});
  const saveSettings = () => store.set('settings', settings);
  const saveGarage = () => store.set('garage', garage);

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
  let quality = QUALITY[qLevel];

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pr));
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
  }

  let sharedPuff = null;
  function buildFx() {
    if (smoke) { scene.remove(smoke.points); smoke.dispose(); }
    if (sparks) { scene.remove(sparks.points); sparks.dispose(); }
    if (skids) { scene.remove(skids.mesh); skids.dispose(); }
    const puff = sharedPuff || (sharedPuff = puffTexture());
    const night = track.def.theme === 'night';
    smoke = createParticles(quality.smoke, { map: puff, color: night ? 0x8d8a9e : 0xeeeae2, drag: 1.6, gravity: 0.35 });
    sparks = createParticles(160, { map: puff, color: 0xffb040, drag: 0.6, gravity: -14, additive: true, floor: true });
    skids = createSkids(isTouch ? 1800 : 3000);
    scene.add(skids.mesh); scene.add(smoke.points); scene.add(sparks.points);
    const fog = scene.fog;
    for (const p of [smoke, sparks]) { p.mat.uniforms.fogCol.value.copy(fog.color); p.mat.uniforms.fogNear.value = fog.near; p.mat.uniforms.fogFar.value = fog.far; }
    resize();
  }

  function paintHex() { return PAINTS.find((p) => p.id === garage.paint).hex; }
  function buildCars() {
    if (playerModel) playerModel.dispose();
    if (leaderModel) leaderModel.dispose();
    const night = world.theme.headlights;
    const ph = paintHex();
    playerModel = buildCar(garage.car, { paint: ph, rim: RIMS.find((r) => r.id === garage.rim).hex, number: garage.number, darkPaint: isDark(ph), night });
    scene.add(playerModel.root);
    // le leader porte une livrée contrastée
    const lp = garage.paint === 'tofu' ? 0xf1efe9 : 0x17171b;
    const lk = garage.car === 'raijin' ? 'kouki' : 'raijin';
    leaderModel = buildCar(lk, { paint: lp, rim: 0xd9b23a, number: 1, darkPaint: isDark(lp), night });
    scene.add(leaderModel.root);
    for (const m of [playerModel, leaderModel]) m.root.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial) { o.material.envMap = envMap; o.material.needsUpdate = true; } });
    if (night) {
      if (!playerModel.lamp) {
        const sl = new THREE.SpotLight(0xfff0d0, 2.4, 70, 0.55, 0.5, 1.4);
        sl.position.set(1.8, 0.7, 0); sl.target.position.set(18, 0, 0);
        playerModel.root.add(sl); playerModel.root.add(sl.target);
        playerModel.lamp = sl;
      }
    }
    resetPlayer(startIndex(), 0);
    const keepS = leader && leader.track === track ? leader.state.s : null;
    leader = createLeader(track, line, 10);
    leader.track = track;
    if (keepS != null) { leader.state.s = keepS; leader.update(1 / 60, 1); }
  }
  const isDark = (hex) => { const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255; return r * 0.3 + g * 0.59 + b * 0.11 < 110; };

  function startIndex() { return track.count - Math.round(40 / track.step); }
  function resetPlayer(idx, speed) {
    const st = createCarState(CAR_SPECS[garage.car], track.px[idx], track.pz[idx], track.heading[idx]);
    st.vx = Math.cos(st.heading) * speed; st.vz = Math.sin(st.heading) * speed; st.speed = speed; st.fwd = speed;
    st.gear = speed > 15 ? 3 : speed > 8 ? 2 : 1;
    if (player) { st.idx = idx; }
    player = st;
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
      else if (k === 'escape' && ['select', 'garage', 'settings', 'help'].includes(screenId)) { helpThenSelect = false; show(screenId === 'settings' ? returnTo : 'menu'); }
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

  // ---------- iPhone : plus de zoom sur double-tap ni pincement ----------
  // (user-scalable=no est ignoré par iOS ; ces gardes le sont moins.)
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    const gameSurface = e.target === canvas || e.target.closest('#touch, #hud') ;
    if (gameSurface && !e.target.closest('.icon-btn') && now - lastTouchEnd < 350) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
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
  const score = { total: 0, combo: 0, mult: 1, idle: 0, best: 0, clips: 0, maxAngle: 0, driftT: 0, runT: 0, offT: 0, tandemT: 0, lastBank: 0 };
  function resetScore() {
    Object.assign(score, { total: 0, combo: 0, mult: 1, idle: 0, best: 0, clips: 0, maxAngle: 0, driftT: 0, runT: 0, offT: 0, tandemT: 0 });
    for (const z of track.zones) z.hit = false;
  }
  const WORDS = [[1500, 'BIEN'], [4000, 'SUPER'], [9000, 'ÉNORME'], [16000, 'INSENSÉ'], [Infinity, 'LÉGENDAIRE']];
  function bank() {
    if (score.combo < 1) { score.combo = 0; score.mult = 1; return; }
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

  // point de la voiture en coordonnées monde (x local avant, z local droite)
  function carPoint(st, lx, lz) {
    const c = Math.cos(st.heading), s = Math.sin(st.heading);
    return [st.x + c * lx - s * lz, st.z + s * lx + c * lz];
  }
  function latOf(i, x, z) { return (x - track.px[i]) * -track.tz[i] + (z - track.pz[i]) * track.tx[i]; }

  function updateScore(dt) {
    const st = player;
    const ang = Math.abs(st.slip) * 180 / Math.PI;
    const onRoad = Math.abs(st.lat0) < track.half + 0.6;
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

    // zones de clipping
    if (drifting) {
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
          for (let k = 0; k < Math.min(30, vn * 4); k++) sparks.emit(cx, 0.5, cz, (Math.random() - 0.5) * 6 + st.vx * 0.3, 2 + Math.random() * 4, (Math.random() - 0.5) * 6 + st.vz * 0.3, 0.4 + Math.random() * 0.3, 0.25, 0.08, 1);
        }
        if (vn > 3 && phase === 'play') lose('Contact mur');
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
      const t = performance.now() / 1000;
      const a = t * 0.25;
      const r = portrait ? 8.5 : 7;
      if (snapCam) { camPos.set(st.x + Math.cos(a) * r, 1.7, st.z + Math.sin(a) * r); camLook.set(st.x, 0.5, st.z); snapCam = false; }
      camPos.lerp(new THREE.Vector3(st.x + Math.cos(a) * r, 1.7, st.z + Math.sin(a) * r), 1 - Math.exp(-dt * 3));
      // la voiture se cadre à gauche (le panneau occupe la droite) ou en haut en portrait
      const right = new THREE.Vector3().subVectors(camPos, new THREE.Vector3(st.x, 0, st.z)).normalize();
      const side = new THREE.Vector3(right.z, 0, -right.x);
      const look = new THREE.Vector3(st.x, portrait ? -0.4 : 0.6, st.z).addScaledVector(side, portrait ? 0 : 2.3);
      camLook.lerp(look, 1 - Math.exp(-dt * 6));
      camera.fov += ((portrait ? 64 : 46) - camera.fov) * 0.1;
    } else if (attract) {
      const t = performance.now() / 1000;
      const a = t * 0.18;
      const r = portrait ? 11 : 8.5;
      const tx = st.x + Math.cos(a) * r, tz = st.z + Math.sin(a) * r;
      camPos.lerp(new THREE.Vector3(tx, 2.2, tz), 1 - Math.exp(-dt * 2));
      camLook.lerp(new THREE.Vector3(st.x, 0.8, st.z), 1 - Math.exp(-dt * 6));
      camera.fov += ((portrait ? 70 : 50) - camera.fov) * 0.1;
    } else {
      const C = CAMS[camMode];
      const hx = Math.cos(st.heading), hz = Math.sin(st.heading);
      const sp = Math.hypot(st.vx, st.vz);
      let dx = hx, dz = hz;
      if (sp > 4) { const w = 0.6; dx = hx * (1 - w) + (st.vx / sp) * w; dz = hz * (1 - w) + (st.vz / sp) * w; const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
      const dist = (C.dist + Math.min(sp, 30) * 0.03) * (portrait ? 1.25 : 1);
      const target = new THREE.Vector3(st.x - dx * dist, C.h * (portrait ? 1.25 : 1), st.z - dz * dist);
      camPos.lerp(target, 1 - Math.exp(-dt * (camMode === 2 ? 9 : 5.5)));
      const look = new THREE.Vector3(st.x + hx * 2.2, C.look + (portrait ? 0.3 : 0), st.z + hz * 2.2);
      camLook.lerp(look, 1 - Math.exp(-dt * 10));
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
  function carFx(st, model, dt, id) {
    const slip = st.rearSlip;
    const k = clamp((slip - 0.12) * 2.2, 0, 1) * clamp(st.speed / 8, 0, 1);
    const spin = clamp((st.wheelSpin || 0) - 0.6, 0, 1) * clamp(st.throttle, 0, 1);
    const intensity = Math.max(k, spin * 0.8);
    for (const sz of [-1, 1]) {
      const [x, z] = carPoint(st, model.rearX, sz * (model.halfW - 0.08));
      skids.mark(id + sz, x, z, intensity, 0.28 + Math.min(Math.abs(st.slip), 0.8) * 0.25);
      const n = intensity * dt * (quality.smoke > 900 ? 46 : 26);
      let emit = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
      while (emit-- > 0) {
        const j = () => (Math.random() - 0.5);
        smoke.emit(x + j() * 0.4, 0.35, z + j() * 0.4, st.vx * 0.25 + j() * 2.4, 0.4 + Math.random() * 0.9, st.vz * 0.25 + j() * 2.4, 1.6 + Math.random() * 1.4, 1.0, 4.6 + intensity * 2.6, 0.26 * (0.45 + intensity * 0.6));
      }
    }
  }

  // ---------- boucle ----------
  let last = performance.now(), acc = 0, frameAvg = 16, frameN = 0, qCheckT = 0;
  const STEP = 1 / 120;
  const perf = { js: 0, render: 0 };
  function frame(now) {
    requestAnimationFrame(frame);
    const tA = performance.now();
    let dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    frameAvg += (dt * 1000 - frameAvg) * 0.05;
    autoQuality(dt);
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
      } else {
        leader.update(dt, 1);
        playerModel.update(leader.state, dt, false);
        carFx(leader.state, playerModel, dt, 'L');
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
          stepCar(player, input, STEP, settings.assist);
          collide(player, STEP);
          acc -= STEP;
        }
        updateProgress(dt);
        updateScore(dt);
        if (mode === 'tandem') {
          let gap = (leader.state.s - lapS()) ;
          const L = track.length; gap = ((gap % L) + L) % L; if (gap > L / 2) gap -= L;
          const scale = gap > 34 ? 0.82 : gap > 22 ? 0.92 : gap < 7 ? 1.06 : 1;
          leader.update(dt, scale);
          carFx(leader.state, leaderModel, dt, 'L');
        }
        // gaz coupé → retour de flamme occasionnel
        if (player.prevThrottle > 0.8 && player.throttle < 0.4 && player.rpm > 5200) { playerModel.flame.visible = true; playerModel.flameT = 0.12; Sound.backfire(); if (garage.car !== 'hachi') Sound.blowoff(); }
        player.prevThrottle = player.throttle;
        updateStuck(dt);
      } else {
        // compte à rebours : moteur qui rugit sur place
        player.rpm += ((1500 + input.throttle * 5000) - player.rpm) * Math.min(1, dt * 6);
        player.throttle = input.throttle;
      }
      if (playerModel.flameT > 0) { playerModel.flameT -= dt; playerModel.flame.scale.set(1, 0.7 + Math.random() * 0.8, 1); if (playerModel.flameT <= 0) playerModel.flame.visible = false; }
      playerModel.update(player, dt, input.brake > 0.1 || input.handbrake > 0.5);
      leaderModel.update(leader.state, dt, false);
      carFx(player, playerModel, dt, 'P');
      updateCamera(dt, player, false);
      Sound.update(player, garage.car, true);
      updateHUD(dt);
    } else if (phase === 'pause') {
      updateCamera(0, player, false);
    }

    if (phase !== 'pause') { smoke.update(dt); sparks.update(dt); }
    world.update(t);
    // ombre qui suit la voiture visible
    const focus = phase === 'play' || phase === 'count' || phase === 'pause' ? player : leader.state;
    if (focus) {
      world.sun.target.position.set(focus.x, 0, focus.z);
      const sd = world.theme.sun;
      world.sun.position.set(focus.x + sd[0] * 60, Math.max(sd[1], 0.35) * 60, focus.z + sd[2] * 60);
    }
    const tB = performance.now();
    renderer.render(scene, camera);
    perf.js += (tB - tA - perf.js) * 0.05; perf.render += (performance.now() - tB - perf.render) * 0.05;
  }
  function lapS() { return (track.count + player.idx) % track.count * track.step + (lap.n * track.length) ; }

  let stuckT = 0;
  function updateStuck(dt) {
    const offFar = Math.abs(player.lat0) > track.wall + 2;
    if ((player.speed < 1.2 && input.throttle > 0.5) || offFar) stuckT += dt; else stuckT = 0;
    if (stuckT > 2.5) { stuckT = 0; respawn(); }
  }
  function respawn() {
    const i = player.idx;
    lose('Replacement');
    resetPlayer(i, 10);
    player.prevIdx = i;
    popup('Replacé sur la piste', 'apex');
  }

  // qualité automatique : on descend d'un cran si ça rame durablement
  function autoQuality(dt) {
    if (settings.quality !== 'auto' || phase !== 'play') return;
    qCheckT += dt;
    if (qCheckT < 3) return;
    qCheckT = 0;
    if (frameAvg > 24 && qLevel !== 'low') {
      qLevel = qLevel === 'high' ? 'med' : 'low';
      quality = QUALITY[qLevel];
      world.sun.castShadow = quality.shadows;
      resize();
    }
  }

  // ---------- HUD ----------
  const hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  function fmtTime(s) { const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; }
  function updateHUD(dt) {
    const st = player;
    setText('hudSpeed', String(Math.round(st.speed * 3.6)));
    setText('hudGear', st.reversing ? 'R' : String(st.gear));
    const r = clamp((st.rpm - 900) / (RPM_MAX - 900), 0, 1);
    $('rpmFill').style.width = (r * 100).toFixed(1) + '%';
    $('rpmBar').classList.toggle('red', r > 0.88);
    setText('hudTotal', Math.round(score.total).toLocaleString('fr-FR'));
    setText('hudTime', fmtTime(score.runT));
    setText('hudLap', mode === 'free' ? `Tour ${lap.n + 1}` : `${Math.round(clamp(lap.progress / track.length, 0, 1) * 100)} %`);
    let tandemNear = false;
    if (mode === 'tandem') tandemNear = Math.hypot(st.x - leader.state.x, st.z - leader.state.z) < 11;
    const comboEl = $('combo');
    const active = score.combo > 0;
    comboEl.classList.toggle('idle', !active);
    if (active) {
      setText('comboPts', Math.round(score.combo).toLocaleString('fr-FR'));
      setText('comboMult', 'x' + score.mult.toFixed(1));
      const ang = Math.abs(st.slip) * 180 / Math.PI;
      $('angleFill').style.width = clamp(ang / 70 * 100, 0, 100).toFixed(0) + '%';
      comboEl.classList.toggle('warn', score.idle > 0.3);
      setText('comboTag', score.idle > 0.3 ? 'ENCAISSEMENT…' : (mode === 'tandem' && tandemNear ? 'TANDEM' : 'DRIFT'));
    }
    if (mode === 'tandem') {
      const d = Math.hypot(st.x - leader.state.x, st.z - leader.state.z);
      $('tandemMeter').style.display = 'flex';
      $('tandemFill').style.width = clamp((1 - (d - 3) / 22) * 100, 0, 100).toFixed(0) + '%';
    } else $('tandemMeter').style.display = 'none';
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
    $('hudMode').textContent = mode === 'run' ? 'RUN NOTÉ' : mode === 'tandem' ? 'TANDEM' : 'LIBRE';
    const b = bests[track.def.id + ':' + mode];
    $('hudBest').textContent = b ? 'RECORD ' + b.toLocaleString('fr-FR') : 'RECORD —';
    camPos.set(player.x - Math.cos(player.heading) * 8, 3, player.z - Math.sin(player.heading) * 8);
    camLook.set(player.x, 1, player.z);
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
    const par = track.def.par * (mode === 'tandem' ? 1.25 : 1);
    const r = total / par;
    const grade = r >= 1 ? 'S' : r >= 0.75 ? 'A' : r >= 0.5 ? 'B' : r >= 0.28 ? 'C' : 'D';
    $('resGrade').textContent = mode === 'free' ? '—' : grade;
    $('resTotal').textContent = total.toLocaleString('fr-FR') + ' pts';
    $('resRecord').innerHTML = record ? '<span class="record">NOUVEAU RECORD</span>' : prev ? `<span class="hint">Record : ${prev.toLocaleString('fr-FR')}</span>` : '';
    $('resCombo').textContent = Math.round(score.best).toLocaleString('fr-FR');
    $('resClips').textContent = `${score.clips} / ${track.zones.length}`;
    $('resAngle').textContent = Math.round(score.maxAngle) + '°';
    $('resDrift').textContent = Math.round(score.driftT / Math.max(score.runT, 1) * 100) + ' %';
    $('resEyebrow').textContent = `${mode === 'run' ? 'Run noté' : mode === 'tandem' ? 'Tandem' : 'Libre'} · ${track.def.name}`;
    show('results');
    announce(`Session terminée. ${total} points${mode !== 'free' ? ', note ' + grade : ''}.${record ? ' Nouveau record.' : ''}`);
    releaseWake();
  }
  function toMenu() {
    phase = 'menu';
    Sound.suspend();
    $('hud').hidden = true; clearTouch(); setTouchVisible(); $('count').hidden = true;
    show('menu');
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
  function buildGarage() {
    const cl = $('carList'); cl.innerHTML = '';
    for (const [k, s] of Object.entries(CAR_SPECS)) {
      const b = document.createElement('button');
      b.className = 'opt'; b.dataset.car = k;
      b.innerHTML = `<b>${s.name}</b><small>${s.tag}</small>`;
      b.addEventListener('click', () => { garage.car = k; saveGarage(); pressGroup(cl, 'data-car', k); refreshStats(); buildCars(); Sound.ui(); });
      cl.appendChild(b);
    }
    pressGroup(cl, 'data-car', garage.car);
    const sw = (container, items, keyName) => {
      container.innerHTML = '';
      for (const it of items) {
        const b = document.createElement('button');
        b.className = 'sw'; b.dataset.sw = it.id; b.style.background = '#' + it.hex.toString(16).padStart(6, '0');
        b.setAttribute('aria-label', it.name); b.title = it.name;
        b.addEventListener('click', () => { garage[keyName] = it.id; saveGarage(); pressGroup(container, 'data-sw', it.id); buildCars(); Sound.ui(); });
        container.appendChild(b);
      }
      pressGroup(container, 'data-sw', garage[keyName]);
    };
    sw($('paintList'), PAINTS, 'paint');
    sw($('rimList'), RIMS, 'rim');
    $('numOut').textContent = garage.number;
    refreshStats();
  }
  function refreshStats() {
    const s = CAR_SPECS[garage.car].stats;
    const bar = (n) => `<span class="bar" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
    $('carStats').innerHTML = `<div class="stat"><span>Puissance</span>${bar(s.power)}</div><div class="stat"><span>Agilité</span>${bar(s.grip)}</div><div class="stat"><span>Angle</span>${bar(s.angle)}</div><span class="sr">Puissance ${s.power} sur 5, agilité ${s.grip} sur 5, angle ${s.angle} sur 5.</span>`;
  }
  const stepNum = (d) => { garage.number = ((garage.number - 1 + d + 99) % 99) + 1; $('numOut').textContent = garage.number; saveGarage(); buildCars(); Sound.ui(); };
  $('numUp').addEventListener('click', () => stepNum(1));
  $('numDown').addEventListener('click', () => stepNum(-1));

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
    if (key === 'quality') { qLevel = settings.quality === 'auto' ? (isTouch ? 'med' : 'high') : settings.quality; quality = QUALITY[qLevel]; loadTrack(trackIdx); }
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
  $('garageBtn').addEventListener('click', () => { ensureAudio(); buildGarage(); show('garage'); });
  $('settingsBtn').addEventListener('click', () => { returnTo = 'menu'; syncSettingsUI(); show('settings'); });
  $('pSettingsBtn').addEventListener('click', () => { returnTo = 'pause'; syncSettingsUI(); show('settings'); });
  $('layoutBtn').addEventListener('click', openLayoutEditor);
  $('helpBtn').addEventListener('click', go('help'));
  for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => {
    Sound.ui();
    const scr = b.closest('.screen').id;
    if (scr === 'help' && helpThenSelect) { helpThenSelect = false; openSelect(); return; }
    show(scr === 'settings' ? returnTo : 'menu');
  });
  $('goBtn').addEventListener('click', startRun);
  $('resumeBtn').addEventListener('click', resumeGame);
  $('resetBtn').addEventListener('click', () => { show(null); respawn(); phase = 'count'; countdownShort(); });
  $('restartBtn').addEventListener('click', startRun);
  $('quitBtn').addEventListener('click', () => { if (mode === 'free' && score.runT > 5) finishRun(); else toMenu(); });
  $('pauseBtn').addEventListener('click', pauseGame);
  $('camBtn').addEventListener('click', cycleCam);
  $('againBtn').addEventListener('click', startRun);
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
    camPos.set(leader.state.x + 8, 3, leader.state.z + 8);
    camLook.set(leader.state.x, 1, leader.state.z);
    // quelques secondes de simulation pour que la fumée soit déjà là
    for (let i = 0; i < 90; i++) { leader.update(1 / 60, 1); carFx(leader.state, playerModel, 1 / 60, 'L'); smoke.update(1 / 60); }
    $('loading').remove();
    show('menu');
    requestAnimationFrame((n) => { last = n; frame(n); });
    // accès de test (non utilisé par le jeu)
    window.__sdcDbg = { scene, envMap: () => envMap, renderer, perf, setQuality: (q) => { qLevel = q; quality = QUALITY[q]; loadTrack(trackIdx); } };
    window.__sdc = { get phase() { return phase; }, get player() { return player; }, get score() { return score; }, get track() { return track; }, get line() { return line; }, lossLog, startRun, input, touch, layouts, tState: () => tState, openLayoutEditor, setMode: (m) => { mode = m; }, setTrack: (i) => { trackIdx = i; loadTrack(i); }, finishRun, get fps() { return 1000 / frameAvg; } };
  }
  if (document.fonts && document.fonts.ready) Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(boot);
  else boot();
})();
