import test from 'node:test';
import assert from 'node:assert/strict';
import { money, noErrors, press, revisit, useBrowser, waitPhase } from './helpers.js';

const B = useBrowser();
const entry = '#mapSide button:has-text("Sprint des quais")';
const finishChoice = '#dlgChoices [data-choice="1"]';
const waitForPrompt = (page) =>
  page.waitForFunction(() => {
    const p = document.querySelector('#prompt');
    return !p.hidden && document.querySelector('#promptText').textContent === 'Sprint des quais';
  });

async function enter(page) {
  await press(page, '#isleBtn');
  await waitPhase(page, 'play', 120000);
}

async function atStart(page) {
  await page.evaluate(() => {
    const course = window.__sdcDbg.life().spots.sprints[0];
    const { x, z, tx, tz } = course.start;
    Object.assign(window.__sdc.player, { x, z, heading: Math.atan2(tz, tx), vx: 0, vz: 0, speed: 0 });
  });
  await waitForPrompt(page);
  await press(page, '#prompt');
  await press(page, '#dlgChoices [data-choice="0"]');
  await waitPhase(page, 'play', 30000);
}

test('chrono : GPS, départ, portes, médaille, sauvegarde et fantôme du record', async () => {
  const { page, errors } = await B.play({ size: { width: 844, height: 390 }, touch: true });
  await enter(page);
  const before = await money(page);
  await page.keyboard.press('m');
  await press(page, entry);
  assert.match(await page.textContent('#mapSide .gps-on'), /Sprint des quais/);
  await press(page, '#isleMap [data-back]');
  await waitPhase(page, 'play');
  await atStart(page);
  assert.match(await page.textContent('#hudGoal'), /0\/6 portes/);
  await page.waitForFunction(() => window.__sdcDbg.life().sprint.ms > 1100);
  const count = await page.evaluate(() => window.__sdcDbg.life().sprint.course.gates.length);
  // Le moteur simule le franchissement, en plaçant la voiture à moins d'un mètre de chaque porte.
  for (let n = 0; n < count; n++) {
    await page.evaluate((i) => {
      const { x, z, tx, tz } = window.__sdcDbg.life().sprint.course.gates[i];
      Object.assign(window.__sdc.player, {
        x: x - 0.8 * tx,
        z: z - 0.8 * tz,
        heading: Math.atan2(tz, tx),
        vx: tx * 12,
        vz: tz * 12,
      });
    }, n);
    await page.waitForFunction((i) => {
      const run = window.__sdcDbg.life().sprint;
      return run ? run.next > i : !document.querySelector('#dialog').hidden;
    }, n);
  }
  assert.match(await page.textContent('#dlgText'), /★★★.*Nouveau record/);
  assert.equal(await money(page), before + 3400);
  const best = await page.evaluate(() => window.__sdcDbg.profile.isle.sprints.quais);
  assert.ok(best > 1000);
  await press(page, finishChoice);
  await revisit(page);
  await press(page, '#careerBtn');
  assert.match(await page.textContent('#careerSprintList'), /Sprint des quais · 3\/3 médailles/);
  await press(page, '#career [data-back]');
  await enter(page);
  await page.keyboard.press('m');
  assert.match(await page.locator(entry).textContent(), /Record.*★★★/);
  await press(page, '#isleMap [data-back]');
  await waitPhase(page, 'play');
  await atStart(page);
  assert.equal(await page.evaluate(() => window.__sdcDbg.life().sprint.rival?.splits.at(-1)), best);
  await page.keyboard.press('r');
  await page.waitForFunction(() => window.__sdcDbg.life().sprint === null);
  assert.equal(await money(page), before + 3400);
  noErrors(errors);
});
