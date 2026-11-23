import test from 'node:test';
import assert from 'node:assert/strict';
import { noErrors, press, revisit, useBrowser, waitPhase } from './helpers.js';

const B = useBrowser();

test('Aventure : terminer une mission, revoir un moment fort et retrouver la suite', async () => {
  const { page, errors } = await B.play();
  await press(page, '#advBtn');
  assert.match(await page.textContent('#advPanel [data-play="0"]'), /Premiers tours/);
  await press(page, '#advPanel [data-play="0"]');
  await press(page, '#dlgSkip');
  await press(page, '#dlgNext');
  await waitPhase(page, 'play', 60000);
  assert.match(await page.textContent('#hudGoal'), /4[\s\u202f]?000/);
  // Le chronomètre et l'enregistreur tournent réellement. Le résultat sportif est fixé pour isoler le parcours.
  await page.waitForFunction(() => window.__sdc.score.runT > 4, null, { timeout: 120000 });
  await page.evaluate(() => {
    const { score } = window.__sdc;
    Object.assign(score, { total: 4200, maxAngle: 48, angT: 2 });
    window.__sdc.finishRun();
  });
  await press(page, '#dlgNext');
  assert.match(await page.textContent('#resGoal'), /mission.*réussie/i);
  assert.match(await page.textContent('#payChal'), /Premiers tours.*1[\s\u202f]?500/);
  await press(page, '#resMoments ol button');
  await waitPhase(page, 'replay');
  await press(page, '#rpPause');
  assert.match(await page.getAttribute('#rpPause', 'aria-label'), /Lecture/);
  await press(page, '#rpClose');
  await waitPhase(page, 'results');
  assert.match(await page.textContent('#againBtn'), /Mission suivante/);
  await revisit(page);
  await press(page, '#advBtn');
  assert.match(await page.textContent('#advPanel [data-play="1"]'), /Raser les conteneurs/);
  noErrors(errors);
});
