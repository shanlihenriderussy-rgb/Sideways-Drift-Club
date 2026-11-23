import test from 'node:test';
import assert from 'node:assert/strict';
import { box, noErrors, press, revisit, useBrowser } from './helpers.js';

const B = useBrowser();
const open = async (page) => {
  await press(page, '#settingsBtn');
  await press(page, '#layoutBtn');
  await page.waitForSelector('#layout:not([hidden])');
};
const settled = (page) =>
  page.waitForFunction(() => {
    const { x0, y0 } = window.__sdc.tState().rects.gas;
    const { x, y } = document.querySelector('#tGas').getBoundingClientRect();
    return Math.abs(x - x0) < 1 && Math.abs(y - y0) < 1;
  });

test('commandes tactiles : déplacer et redimensionner l’accélérateur, puis retrouver sa disposition', async () => {
  const { page, errors } = await B.play({ touch: true });
  await open(page);
  const original = await box(page, '#tGas');
  const x = original.x + original.w / 2;
  const y = original.y + original.h / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 32, y - 30, { steps: 5 });
  await page.mouse.up();
  assert.match(await page.textContent('#laySelLbl'), /gaz/i);
  await page.$eval('#laySel', (el) => {
    el.value = 125;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settled(page);
  const changed = await box(page, '#tGas');
  assert.ok(changed.x + changed.w / 2 < x - 20, 'déplacement du bouton');
  assert.ok(changed.w > original.w + 10, 'agrandissement du bouton');
  await press(page, '#layDone');
  await revisit(page);
  await open(page);
  await settled(page);
  const restored = await box(page, '#tGas');
  assert.ok(Math.abs(restored.x - changed.x) < 1);
  assert.ok(Math.abs(restored.y - changed.y) < 1);
  assert.equal(restored.w, changed.w);
  noErrors(errors);
});
