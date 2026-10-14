const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 640, height: 300 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto('file://' + __dirname + '/test.html');
  await p.waitForTimeout(2000);
  await p.keyboard.press('x'); // geste utilisateur → init audio
  await p.evaluate(() => {
    const { ctx, master } = Sound._debug;
    const an = ctx.createAnalyser(); an.fftSize = 8192;
    // on écoute après le compresseur : on se branche sur la destination via un tap du master
    master.connect(an);
    window.__an = an;
    window.__measure = () => {
      const t = new Float32Array(an.fftSize); an.getFloatTimeDomainData(t);
      let rms = 0, peak = 0; for (const v of t) { rms += v * v; peak = Math.max(peak, Math.abs(v)); }
      const f = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(f);
      // fréquence dominante sous 600 Hz (fondamentale moteur)
      let bi = 1; for (let i = 1; i < f.length; i++) { const hz = i * ctx.sampleRate / an.fftSize; if (hz > 600) break; if (f[i] > f[bi]) bi = i; }
      // énergie 800-2600 Hz (crissement)
      let hi = -200, n = 0; for (let i = 0; i < f.length; i++) { const hz = i * ctx.sampleRate / an.fftSize; if (hz > 1000 && hz < 2000) { hi = Math.max(hi, f[i]); n = 1; } }
      const p = window.__sdc.player;
      return { state: ctx.state, rms: +Math.sqrt(rms / t.length).toFixed(3), peak: +peak.toFixed(3), domHz: Math.round(bi * ctx.sampleRate / an.fftSize), rpm: Math.round(p.rpm), expHz: Math.round(p.rpm / 60 * 2), screechDb: +hi.toFixed(1), slip: +(p.slip * 57.3).toFixed(0), kmh: Math.round(p.speed * 3.6) };
    };
  });
  await p.evaluate(() => { window.__sdc.setMode('free'); window.__sdc.startRun(); });
  await p.waitForTimeout(3000);
  console.log('ralenti   ', JSON.stringify(await p.evaluate(() => __measure())));
  await p.keyboard.down('ArrowUp'); await p.waitForTimeout(1200);
  console.log('gaz 1.2s  ', JSON.stringify(await p.evaluate(() => __measure())));
  await p.waitForTimeout(3300);
  console.log('gaz 4.5s  ', JSON.stringify(await p.evaluate(() => __measure())));
  await p.keyboard.down('ArrowRight'); await p.keyboard.down(' '); await p.waitForTimeout(350); await p.keyboard.up(' ');
  await p.waitForTimeout(500); await p.keyboard.up('ArrowRight'); await p.keyboard.down('ArrowRight');
  for (let i=0;i<3;i++){ await p.waitForTimeout(500); console.log('glisse'+i, JSON.stringify(await p.evaluate(() => __measure()))); }
  console.log('glisse    ', JSON.stringify(await p.evaluate(() => __measure())));
  await p.keyboard.up('ArrowUp'); await p.keyboard.up('ArrowRight'); await p.waitForTimeout(1500);
  console.log('lâché     ', JSON.stringify(await p.evaluate(() => __measure())));
  await p.evaluate(() => window.__sdc.finishRun()); await p.waitForTimeout(800);
  console.log('résultats ', JSON.stringify(await p.evaluate(() => __measure())));
  await b.close();
})();
