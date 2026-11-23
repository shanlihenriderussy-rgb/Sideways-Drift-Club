import test from 'node:test';
import assert from 'node:assert/strict';
import { noErrors, press, revisit, useBrowser, waitPhase } from './helpers.js';

const B = useBrowser();
const tab = (page, name) => press(page, `[data-option-tab="${name}"]`);
const slide = (page, id, value) =>
  page.$eval(
    id,
    (el, n) => {
      el.value = n;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    value,
  );

test('le mixage règle les bus audio séparément et conserve les volumes au rechargement', async () => {
  const { page, errors } = await B.play({ touch: true });
  await press(page, '#settingsBtn');
  await tab(page, 'audio');
  await slide(page, '#pref-volume', 45);
  await slide(page, '#pref-engine', 30);
  await slide(page, '#pref-tires', 0);
  await press(page, '#soundTest');
  await page.waitForFunction(() => {
    const { master, buses } = window.__sdcDbg.audio();
    return (
      master &&
      Math.abs(master.gain.value - 0.45) < 0.02 &&
      Math.abs(buses.engine.gain.value - 0.3) < 0.02 &&
      buses.tires.gain.value < 0.02 &&
      buses.turbo.gain.value === 1
    );
  });
  await revisit(page);
  await press(page, '#settingsBtn');
  await tab(page, 'audio');
  assert.equal(await page.inputValue('#pref-volume'), '45');
  assert.equal(await page.inputValue('#pref-engine'), '30');
  assert.equal(await page.inputValue('#pref-tires'), '0');
  await press(page, '#optSound');
  assert.ok(await page.isDisabled('#pref-volume'));
  await press(page, '#resetSettings');
  assert.equal(await page.inputValue('#pref-volume'), '80');
  noErrors(errors);
});

test('le profil Ultra et les réglages à chaud préservent la session en pause sur l’île', async () => {
  const { page, errors } = await B.play({ size: { width: 640, height: 360 } });
  await press(page, '#isleBtn');
  await waitPhase(page, 'play', 120000);
  await press(page, '#pauseBtn');
  const before = await page.evaluate(() => {
    const { player } = window.__sdc;
    return {
      x: player.x,
      z: player.z,
      ratio: window.__sdcDbg.renderer.getPixelRatio(),
      exposure: window.__sdcDbg.renderer.toneMappingExposure,
    };
  });
  await press(page, '#pSettingsBtn');
  await tab(page, 'graphics');
  await press(page, '#qualSeg [data-v="ultra"]');
  assert.ok(await page.isDisabled('#pref-fpsTarget'));
  assert.ok(await page.isVisible('#graphicsPending'));
  await slide(page, '#pref-exposure', 75);
  await page.selectOption('#pref-shadows', '0');
  await page.selectOption('#pref-reflections', '192');
  const after = await page.evaluate(() => {
    const { player, phase } = window.__sdc;
    const D = window.__sdcDbg;
    return {
      x: player.x,
      z: player.z,
      phase,
      onIsland: Boolean(D.life()),
      ratio: D.renderer.getPixelRatio(),
      exposure: D.renderer.toneMappingExposure,
    };
  });
  assert.deepEqual([after.x, after.z, after.phase, after.onIsland], [before.x, before.z, 'pause', true]);
  assert.ok(after.ratio > before.ratio);
  assert.equal(after.exposure, before.exposure * 0.75);
  await tab(page, 'display');
  await press(page, '#optMinimap');
  await page.selectOption('#pref-speedUnit', 'mph');
  await press(page, '#settings [data-back]');
  await press(page, '#resumeBtn');
  await waitPhase(page, 'play');
  await page.waitForFunction(() => document.querySelector('#hudSpeedUnit').textContent === 'MPH');
  assert.ok(await page.isHidden('#minimap'));
  await press(page, '#pauseBtn');
  await press(page, '#restartBtn');
  await waitPhase(page, 'play', 120000);
  assert.equal(await page.evaluate(() => window.__sdcDbg.envMap().image[0].width), 192);
  noErrors(errors);
});
