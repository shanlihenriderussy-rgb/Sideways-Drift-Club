const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const tr = +process.argv[2] || 0;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto('file://' + __dirname + '/test.html');
  await p.waitForTimeout(2000);
  await p.evaluate((t) => { window.__sdc.setTrack(t); window.__sdc.setMode('run'); window.__sdc.startRun(); }, tr);
  await p.evaluate(() => {
    const S = window.__sdc; const T = S.track;
    window.__bot = setInterval(() => {
      const st = S.player; const N = T.count;
      const ahead = (st.idx + 8) % N;
      let want = Math.atan2(T.pz[ahead] - st.z, T.px[ahead] - st.x) - (st.heading + st.slip * 0);
      // vise la direction de la vitesse, pas du capot
      const vh = Math.atan2(st.vz, st.vx);
      want = Math.atan2(T.pz[ahead] - st.z, T.px[ahead] - st.x) - vh;
      while (want > Math.PI) want -= 2 * Math.PI; while (want < -Math.PI) want += 2 * Math.PI;
      const steer = Math.max(-1, Math.min(1, want * 3));
      S.touch.right = steer > 0.2; S.touch.left = steer < -0.2;
      const k = Math.abs(T.curv[(st.idx + 14) % N]);
      S.touch.gas = st.speed < (k > 1 / 40 ? 14 : 24);
      S.touch.brake = st.speed > (k > 1 / 40 ? 18 : 30);
    }, 20);
  });
  const t0 = Date.now();
  let res;
  for (let i = 0; i < 90; i++) {
    await p.waitForTimeout(2000);
    res = await p.evaluate(() => ({ phase: window.__sdc.phase, idx: window.__sdc.player.idx, v: Math.round(window.__sdc.player.speed * 3.6), t: window.__sdc.score.runT, total: Math.round(window.__sdc.score.total), clips: window.__sdc.score.clips }));
    if (res.phase === 'results') break;
  }
  console.log(JSON.stringify(res), 'wall', (Date.now() - t0) / 1000);
  await p.screenshot({ path: 'shots/lap-end.png' });
  await b.close();
})();
