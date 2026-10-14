const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 844, height: 390 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto('file://' + __dirname + '/test.html');
  await p.waitForTimeout(2000);
  for (const q of ['med', 'low', 'high']) for (const t of [0, 1, 2]) {
    await p.evaluate(([q, t]) => { window.__sdcDbg.setQuality(q); window.__sdc.setTrack(t); window.__sdc.setMode('tandem'); window.__sdc.startRun(); window.__sdc.touch.gas = true; }, [q, t]);
    await p.waitForTimeout(5000);
    const r = await p.evaluate(() => { const i = window.__sdcDbg.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, js: window.__sdcDbg.perf.js.toFixed(2), heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : 0 }; });
    console.log(q, t, JSON.stringify(r));
  }
  await b.close();
})();
