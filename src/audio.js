// ===== Son : moteur, crissement, impacts, jingles — 100 % synthétisé (Web Audio) =====
const Sound = (() => {
  let ctx = null, master = null, enabled = true, volume = 0.8;
  let eng = null, screech = null, turbo = null, noiseBuf = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? volume : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    // bruit blanc partagé
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    buildEngine(); buildScreech(); buildTurbo();
  }

  function noiseSrc() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }

  function buildEngine() {
    const out = ctx.createGain(); out.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 2.2;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.6); }
    shaper.curve = curve;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const o3 = ctx.createOscillator(); o3.type = 'sawtooth';
    const g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain();
    g1.gain.value = 0.5; g2.gain.value = 0.32; g3.gain.value = 0.22;
    o1.connect(g1); o2.connect(g2); o3.connect(g3);
    g1.connect(shaper); g2.connect(shaper); g3.connect(shaper);
    // grain : bruit filtré pour l'admission
    const n = noiseSrc(); const nb = ctx.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = 1400; nb.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = 0.0;
    n.connect(nb); nb.connect(ng); ng.connect(lp);
    shaper.connect(lp); lp.connect(out); out.connect(master);
    o1.start(); o2.start(); o3.start(); n.start();
    eng = { out, lp, o1, o2, o3, ng };
  }
  function buildScreech() {
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 9;
    const bp2 = ctx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 2300; bp2.Q.value = 14;
    const g = ctx.createGain(); g.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0.55;
    const makeup = ctx.createGain(); makeup.gain.value = 5; // compense l'atténuation des filtres très sélectifs
    n.connect(bp); n.connect(bp2); bp.connect(g); bp2.connect(g2); g2.connect(g); g.connect(makeup); makeup.connect(master);
    n.start();
    screech = { g, bp, bp2 };
  }
  function buildTurbo() {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2400;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(master); o.start();
    turbo = { o, g, spool: 0 };
  }

  function update(car, kind, active) {
    if (!ctx || !eng) return;
    const t = ctx.currentTime;
    const rpm = car.rpm;
    const cyl = kind === 'raijin' ? 3 : 2; // allumages par tour (6 cyl. = 3, 4 cyl. = 2)
    const f = (rpm / 60) * cyl;
    eng.o1.frequency.setTargetAtTime(f, t, 0.02);
    eng.o2.frequency.setTargetAtTime(f * 0.5, t, 0.02);
    eng.o3.frequency.setTargetAtTime(f * 1.01 + 3, t, 0.02);
    const th = car.throttle;
    eng.lp.frequency.setTargetAtTime(320 + th * 1500 + rpm * 0.1, t, 0.04);
    eng.out.gain.setTargetAtTime(active ? 0.09 + th * 0.16 : 0.0, t, 0.06);
    eng.ng.gain.setTargetAtTime(active ? th * 0.05 : 0, t, 0.05);
    // crissement : dépend de la dérive arrière et de la vitesse
    const slipAmt = Math.max(0, Math.min(1, (car.rearSlip - 0.12) * 2.2)) * Math.min(car.speed / 8, 1);
    const sc = active ? slipAmt * 0.5 : 0;
    screech.g.gain.setTargetAtTime(sc, t, 0.05);
    screech.bp.frequency.setTargetAtTime(900 + car.speed * 9 + Math.sin(t * 13) * 40, t, 0.05);
    // turbo
    if (kind !== 'hachi') {
      turbo.spool += ((th > 0.5 ? 1 : 0) * Math.min(rpm / 6000, 1) - turbo.spool) * 0.05;
      turbo.o.frequency.setTargetAtTime(1800 + turbo.spool * 2600, t, 0.08);
      turbo.g.gain.setTargetAtTime(active ? turbo.spool * 0.018 : 0, t, 0.08);
    } else turbo.g.gain.setTargetAtTime(0, t, 0.1);
  }

  function burst(dur, freq, q, gain, type) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const n = noiseSrc();
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(master);
    n.start(t); n.stop(t + dur + 0.05);
  }
  function tone(freq, dur, gain, type, when, slideTo) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  return {
    init, update,
    get _debug() { return { ctx, master }; },
    get ready() { return !!ctx; },
    setEnabled(v) { enabled = v; if (master) master.gain.setTargetAtTime(v ? volume : 0, ctx.currentTime, 0.05); },
    setVolume(v) { volume = v; if (master && enabled) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
    suspend() { if (ctx && eng) { const t = ctx.currentTime; eng.out.gain.setTargetAtTime(0, t, 0.05); eng.ng.gain.setTargetAtTime(0, t, 0.05); screech.g.gain.setTargetAtTime(0, t, 0.05); turbo.g.gain.setTargetAtTime(0, t, 0.05); } },
    impact(power) { burst(0.35, 420, 1, Math.min(0.9, 0.25 + power * 0.06)); tone(70, 0.25, Math.min(0.6, 0.2 + power * 0.03), 'sine', 0, 40); },
    backfire() { burst(0.09, 700, 1.5, 0.35); tone(90, 0.08, 0.25, 'square'); },
    blowoff() { burst(0.4, 2600, 0.7, 0.12, 'bandpass'); },
    clip() { tone(880, 0.12, 0.18, 'triangle'); tone(1320, 0.18, 0.16, 'triangle', 0.07); },
    bank(big) { tone(523, 0.12, 0.14, 'square'); tone(784, 0.16, 0.12, 'square', 0.08); if (big) tone(1046, 0.24, 0.12, 'square', 0.16); },
    lost() { tone(330, 0.3, 0.16, 'sawtooth', 0, 140); },
    count(go) { tone(go ? 1046 : 523, go ? 0.45 : 0.18, 0.2, 'square'); },
    ui() { tone(660, 0.05, 0.08, 'triangle'); },
    // klaxon : deux notes désaccordées ; vol 0..1 (distance), pitch (petite voiture aiguë, bus grave)
    horn(vol, pitch) { const v = 0.11 * (vol == null ? 1 : vol), f = 420 * (pitch || 1); if (v < 0.006) return; tone(f, 0.34, v, 'square'); tone(f * 1.26, 0.34, v * 0.8, 'square'); tone(f * 0.5, 0.3, v * 0.5, 'sawtooth'); },
    shutter() { burst(0.05, 3200, 0.8, 0.3, 'highpass'); burst(0.07, 1800, 1.2, 0.22, 'bandpass'); tone(2400, 0.04, 0.05, 'triangle', 0.09); },
    ping() { tone(988, 0.1, 0.1, 'triangle'); tone(1480, 0.14, 0.08, 'triangle', 0.06); },
    cash() { tone(1318, 0.09, 0.12, 'square'); tone(1760, 0.16, 0.12, 'square', 0.07); tone(2637, 0.22, 0.07, 'triangle', 0.13); },
  };
})();
