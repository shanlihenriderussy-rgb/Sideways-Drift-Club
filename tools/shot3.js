const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const W = +process.argv[2] || 844, H = +process.argv[3] || 390, pre = process.argv[4] || 'ui';
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await p.goto('file://' + __dirname + '/test.html');
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `shots/${pre}-menu.png` });
  await p.tap('#playBtn'); await p.waitForTimeout(300); await p.screenshot({ path: `shots/${pre}-firsthelp.png` }); await p.tap('#help [data-back]'); await p.waitForTimeout(300); await p.screenshot({ path: `shots/${pre}-select.png` });
  await p.tap('[data-back]'); await p.tap('#garageBtn'); await p.waitForTimeout(600); await p.screenshot({ path: `shots/${pre}-garage.png` });
  await p.tap('#garage [data-back]'); await p.tap('#settingsBtn'); await p.waitForTimeout(300); await p.screenshot({ path: `shots/${pre}-settings.png` });
  await p.tap('#settings [data-back]'); await p.tap('#helpBtn'); await p.waitForTimeout(300); await p.screenshot({ path: `shots/${pre}-help.png` });
  await p.tap('#help [data-back]'); await p.tap('#playBtn'); await p.waitForTimeout(200); await p.tap('[data-mode="tandem"]'); await p.tap('#goBtn');
  await p.waitForTimeout(3400);
  // gaz tactile
  const gas = await p.$('#tGas'); const bb = await gas.boundingBox();
  await p.evaluate(() => { window.__sdc.touch.gas = true; });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `shots/${pre}-play.png` });
  await p.evaluate(() => { window.__sdc.finishRun(); });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `shots/${pre}-results.png` });
  await b.close();
})();
