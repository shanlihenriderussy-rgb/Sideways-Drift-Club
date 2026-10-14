const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 844, height: 390 } });
  await p.goto('file://' + __dirname + '/test.html');
  await p.waitForTimeout(2000);
  const cdp = await p.context().newCDPSession(p);
  for (const rate of [1, 4, 6]) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    for (const t of [0, 1, 2]) {
      await p.evaluate((t) => { window.__sdcDbg.setQuality('med'); window.__sdc.setTrack(t); window.__sdc.setMode('tandem'); window.__sdc.startRun(); window.__sdc.touch.gas = true; }, t);
      await p.waitForTimeout(6000);
      const js = await p.evaluate(() => window.__sdcDbg.perf.js.toFixed(2));
      // coût de chargement d'une piste
      const load = await p.evaluate((t) => { const a = performance.now(); window.__sdc.setTrack(t); return (performance.now() - a).toFixed(0); }, t);
      console.log(`cpu x${rate} piste ${t} : JS/image ${js} ms, chargement piste ${load} ms`);
    }
  }
  await b.close();
})();
