const { chromium } = require('/opt/node-tools/node_modules/playwright');
// usage: node shot2.js <track> <mode> <prefix> [w h]
(async () => {
  const [tr, mode, pre, W, H] = [+process.argv[2] || 0, process.argv[3] || 'run', process.argv[4] || 't', +process.argv[5] || 844, +process.argv[6] || 390];
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await p.goto('file://' + __dirname + '/test.html');
  await p.waitForTimeout(2500);
  await p.evaluate((t) => window.__sdc.setTrack(t), tr);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `shots/${pre}-menu.png` });
  await p.evaluate((m) => { window.__sdc.setMode(m); window.__sdc.startRun(); }, mode);
  await p.waitForTimeout(3400);
  await p.screenshot({ path: `shots/${pre}-start.png` });
  // pilote automatique simple : suit la piste et lance des glisses dans les virages
  await p.evaluate(() => {
    const S = window.__sdc; const T = S.track;
    window.__bot = setInterval(() => {
      const st = S.player; const N = T.count;
      const ahead = (st.idx + 10) % N;
      let want = Math.atan2(T.pz[ahead] - st.z, T.px[ahead] - st.x) - st.heading;
      while (want > Math.PI) want -= 2 * Math.PI; while (want < -Math.PI) want += 2 * Math.PI;
      const k = T.curv[(st.idx + 8) % N];
      S.input.throttle = 1;
      let steer = Math.max(-1, Math.min(1, want * 2.5));
      const drifting = Math.abs(st.slip) > 0.2;
      if (drifting) steer = Math.max(-1, Math.min(1, want * 3 + Math.sign(k) * 0.2));
      S.touch.right = steer > 0.25; S.touch.left = steer < -0.25;
      S.touch.gas = true;
      S.touch.hb = !drifting && Math.abs(k) > 1 / 40 && st.speed > 14;
    }, 30);
  });
  for (let i = 1; i <= 4; i++) { await p.waitForTimeout(3000); await p.screenshot({ path: `shots/${pre}-run${i}.png` }); }
  const st = await p.evaluate(() => { const s = window.__sdc.player; return { v: s.speed * 3.6, slip: s.slip * 57.3, score: window.__sdc.score.total, combo: window.__sdc.score.combo, fps: window.__sdc.fps, idx: s.idx, clips: window.__sdc.score.clips }; });
  console.log(JSON.stringify(st));
  console.log(errs.slice(0, 20).join('\n'));
  await b.close();
})();
