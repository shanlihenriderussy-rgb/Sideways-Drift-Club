// Un run noté de bout en bout : glisse, pause, résultats, gains crédités et conservés.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  installBot,
  money,
  noErrors,
  phase,
  press,
  revisit,
  startRun,
  stopBot,
  useBrowser,
  waitPhase,
} from './helpers.js';

const B = useBrowser();

test('le pilote automatique marque des points ; pause et reprise ; résultats ; gains crédités puis conservés', async () => {
  const { page, errors } = await B.play();
  const before = await money(page);
  await startRun(page, 1, 'run');
  await installBot(page);
  await page.waitForFunction(() => window.__sdc.score.total + window.__sdc.score.combo > 300, null, {
    timeout: 180000,
  });
  assert.ok(await page.isVisible('#hud'));
  assert.notEqual((await page.textContent('#hudSpeed')).trim(), '0', 'le compteur de vitesse ne bouge pas');

  // pause : le temps de run s'arrête, la reprise le relance
  await press(page, '#pauseBtn');
  await waitPhase(page, 'pause');
  assert.ok(await page.isVisible('#pause'));
  const t0 = await page.evaluate(() => window.__sdc.score.runT);
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__sdc.score.runT), t0, 'le chrono tourne pendant la pause');
  await press(page, '#resumeBtn');
  await page.waitForFunction(() => ['count', 'play'].includes(window.__sdc.phase), null, { timeout: 15000 });
  await waitPhase(page, 'play', 30000);

  // fin de run : note, total, gains
  await stopBot(page);
  await page.evaluate(() => window.__sdc.finishRun());
  await waitPhase(page, 'results', 30000);
  assert.ok(await page.isVisible('#results'));
  assert.match((await page.textContent('#resGrade')).trim(), /^[SABCD]$/);
  assert.ok(Number((await page.textContent('#resTotal')).replace(/\D/g, '')) > 0, 'total nul');
  const after = await money(page);
  assert.ok(after > before, `gains non crédités : ${before} → ${after}`);

  // nouvelle visite : le solde et le run sont là
  await revisit(page);
  assert.equal(await money(page), after);
  assert.ok(await page.evaluate(() => window.__sdcDbg.profile.stats.runs >= 1), 'run non compté dans la carrière');
  noErrors(errors);
});

test('recommencer depuis la pause remet le score à zéro', async () => {
  const { page } = await B.play();
  await startRun(page, 0, 'run');
  await installBot(page);
  await page.waitForFunction(() => window.__sdc.score.runT > 3, null, { timeout: 120000 });
  await stopBot(page);
  await press(page, '#pauseBtn');
  await waitPhase(page, 'pause');
  await press(page, '#restartBtn');
  await page.waitForFunction(() => ['count', 'play'].includes(window.__sdc.phase), null, { timeout: 15000 });
  assert.ok(await page.evaluate(() => window.__sdc.score.runT < 1 && window.__sdc.score.total === 0));
});

test('quitter depuis la pause ramène à l’écran titre', async () => {
  const { page } = await B.play();
  await startRun(page, 0, 'free');
  await waitPhase(page, 'play', 90000);
  await page.keyboard.press('Escape');
  await waitPhase(page, 'pause');
  await press(page, '#quitBtn');
  await page.waitForSelector('#menu:not([hidden])', { timeout: 15000 });
  assert.equal(await phase(page), 'menu');
});
