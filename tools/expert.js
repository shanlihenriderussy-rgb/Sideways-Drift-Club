const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const tr = +process.argv[2] || 0, gain = +(process.argv[3] || 2.2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 320, height: 180 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto('file://' + __dirname + '/test.html');
  await p.waitForTimeout(1500);
  await p.evaluate((t) => { window.__sdc.setTrack(t); window.__sdc.setMode('run'); window.__sdc.startRun(); }, tr);
  await p.evaluate((gain) => {
    const S = window.__sdc, T = S.track, L = S.line, N = T.count;
    let hbT = 0;
    window.__log = { lost: 0, banks: 0 };
    setInterval(() => {
      const st = S.player;
      const a = (st.idx + 9) % N;
      const vh = st.speed > 3 ? Math.atan2(st.vz, st.vx) : st.heading;
      let e = Math.atan2(L.lz[a] - st.z, L.lx[a] - st.x) - vh;
      while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI;
      const drifting = Math.abs(st.slip) > 0.18;
      const kAhead = T.curv[(st.idx + 12) % N];
      let steer;
      if (drifting) {
        // en glisse : braquer vers l'intérieur resserre la trajectoire
        steer = Math.max(-1, Math.min(1, e * gain * 1.6 + Math.sign(kAhead) * 0.1));
      } else steer = Math.max(-1, Math.min(1, e * gain));
      S.touch.left = steer < -0.18; S.touch.right = steer > 0.18;
      const vT = L.v[a] * 0.95;
      S.touch.gas = drifting ? st.speed < vT * 1.15 : st.speed < vT;
      S.touch.brake = !drifting && st.speed > vT * 1.25;
      if (!drifting && Math.abs(kAhead) > 1 / 70 && st.speed > 13 && hbT <= 0) hbT = 0.25;
      S.touch.hb = hbT > 0; hbT -= 0.02;
    }, 20);
  }, gain);
  let res;
  for (let i = 0; i < 100; i++) {
    await p.waitForTimeout(2000);
    res = await p.evaluate(() => ({ phase: window.__sdc.phase, t: +window.__sdc.score.runT.toFixed(1), total: Math.round(window.__sdc.score.total), combo: Math.round(window.__sdc.score.combo), mult: +window.__sdc.score.mult.toFixed(1), clips: window.__sdc.score.clips, best: Math.round(window.__sdc.score.best), loss: JSON.stringify(window.__sdc.lossLog), drift: Math.round(window.__sdc.score.driftT / Math.max(1, window.__sdc.score.runT) * 100) }));
    if (res.phase === 'results') break;
  }
  console.log('track', tr, JSON.stringify(res));
  await b.close();
})();
