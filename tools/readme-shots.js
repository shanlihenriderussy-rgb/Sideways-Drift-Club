// Captures de la page de présentation (README) : docs/screenshots/*.jpg
//   node build.mjs --local && node tools/readme-shots.js
// Le pilote est le bot de tools/expert.js ; la capture part en pleine glisse.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
const out = path.join(root, 'docs', 'screenshots');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const b = await chromium.launch({ proxy, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 600 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1.5 });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  const shot = (n) => p.screenshot({ path: path.join(out, n + '.jpg'), type: 'jpeg', quality: 82 });
  await p.goto('file://' + path.join(root, 'test.html'));
  await p.waitForTimeout(4000);
  await shot('menu');
  await p.tap('#playBtn'); await p.waitForTimeout(300);
  if (await p.isVisible('#help [data-back]')) { await p.tap('#help [data-back]'); await p.waitForTimeout(300); }
  await shot('select');
  await p.evaluate(() => {
    window.__bot = () => {
      const S = window.__sdc, T = S.track, L = S.line, N = T.count, gain = 2.2;
      let hbT = 0;
      clearInterval(window.__botId);
      window.__botId = setInterval(() => {
        const st = S.player, a = (st.idx + 9) % N;
        const vh = st.speed > 3 ? Math.atan2(st.vz, st.vx) : st.heading;
        let e = Math.atan2(L.lz[a] - st.z, L.lx[a] - st.x) - vh;
        while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI;
        const drifting = Math.abs(st.slip) > 0.18, kAhead = T.curv[(st.idx + 12) % N];
        const steer = Math.max(-1, Math.min(1, drifting ? e * gain * 1.6 + Math.sign(kAhead) * 0.1 : e * gain));
        S.touch.left = steer < -0.18; S.touch.right = steer > 0.18;
        const vT = L.v[a] * 0.95;
        S.touch.gas = drifting ? st.speed < vT * 1.15 : st.speed < vT;
        S.touch.brake = !drifting && st.speed > vT * 1.25;
        if (!drifting && Math.abs(kAhead) > 1 / 70 && st.speed > 13 && hbT <= 0) hbT = 0.25;
        S.touch.hb = hbT > 0; hbT -= 0.02;
      }, 20);
    };
  });
  // départ sur une piste, bot au volant, capture dès que l'angle et le score sont là
  const run = async (i, m, name, minT) => {
    await p.evaluate(([i, m]) => { window.__sdc.setTrack(i); window.__sdc.setMode(m); window.__sdc.startRun(); window.__bot(); }, [i, m]);
    for (let k = 0; k < 90; k++) {
      await p.waitForTimeout(500);
      const ok = await p.evaluate((minT) => { const S = window.__sdc; return S.score.runT > minT && Math.abs(S.player.slip) > 0.45 && S.score.combo > 0; }, minT);
      if (ok) break;
    }
    await shot(name);
  };
  await run(0, 'tandem', 'tandem', 8);
  await p.waitForTimeout(6000);
  await p.evaluate(() => window.__sdc.finishRun()); await p.waitForTimeout(800);
  await shot('results');
  for (const [i, n] of [[1, 'akane'], [4, 'yukimi'], [5, 'kaigan'], [2, 'piton']]) await run(i, 'run', n, 6);
  // fond de bannière : même glisse, interface masquée
  await p.addStyleTag({ content: '#hud,#touch{visibility:hidden!important}' });
  await run(5, 'run', 'hero', 6);
  await p.evaluate(() => { clearInterval(window.__botId); window.__sdc.finishRun(); }); await p.waitForTimeout(500);
  await p.tap('#menuBtn'); await p.waitForTimeout(400);
  await p.tap('#garageBtn'); await p.waitForTimeout(1500);
  await shot('garage');
  await p.reload(); await p.waitForTimeout(3000);
  await p.tap('#advBtn'); await p.waitForTimeout(800);
  await shot('aventure');
  await b.close();
})();
