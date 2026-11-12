// Le chemin d'un nouveau joueur, au doigt, sur téléphone en paysage : de « Rouler » au premier virage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PORTRAIT, assertInViewport, noErrors, phase, press, revisit, useBrowser, waitPhase } from './helpers.js';

const B = useBrowser();

test('premier lancement : aide en trois gestes sur un écran, puis le choix de session', async () => {
  const { page } = await B.play({ touch: true });
  await page.tap('#playBtn');
  await page.waitForSelector('#help.brief:not([hidden])', { timeout: 5000 });
  const steps = await page.$$eval('#help .help-grid > div', (els) => els.filter((e) => e.offsetParent !== null).length);
  assert.equal(steps, 3, 'trois gestes visibles');
  await assertInViewport(page, '#help [data-back]', 'bouton « Choisir ma session »');
  assert.equal(await page.textContent('#helpGo'), 'Choisir ma session');
  assert.match(await page.textContent('#help .hint'), /assistance d'une IA/);
  await page.tap('#help [data-back]');
  await page.waitForSelector('#select:not([hidden])', { timeout: 5000 });
});

test('« Tout le détail » déplie l’aide complète sans quitter l’écran', async () => {
  const { page } = await B.play({ touch: true });
  await page.tap('#playBtn');
  await page.waitForSelector('#help.brief:not([hidden])');
  await page.tap('#helpMore');
  assert.ok(await page.isVisible('#help .help-grid .more'));
  assert.ok(await page.isHidden('#helpMore'));
});

for (const [name, size] of [
  ['paysage', undefined],
  ['portrait', PORTRAIT],
]) {
  test(`choix de session (${name}) : « Départ » est visible sans faire défiler`, async () => {
    const { page } = await B.play({ touch: true, size });
    await page.tap('#playBtn');
    await page.tap('#help [data-back]');
    await page.waitForSelector('#select:not([hidden])');
    await assertInViewport(page, '#goBtn', 'bouton Départ');
    // et il le reste quand on fait défiler la liste des pistes jusqu'en bas
    await page.$eval('#select .card', (el) => el.scrollTo(0, el.scrollHeight));
    await assertInViewport(page, '#goBtn', 'bouton Départ après défilement');
  });
}

test('choisir un mode et une piste, Départ : décompte, puis la course avec ses commandes tactiles', async () => {
  const { page, errors } = await B.play({ touch: true });
  await page.tap('#playBtn');
  await page.tap('#help [data-back]');
  await page.waitForSelector('#select:not([hidden])');
  await page.tap('#select [data-mode="free"]');
  assert.equal(await page.getAttribute('#select [data-mode="free"]', 'aria-pressed'), 'true');
  await page.tap('#trackList [data-track="2"]');
  assert.equal(await page.getAttribute('#trackList [data-track="2"]', 'aria-pressed'), 'true');
  await page.tap('#goBtn');
  await waitPhase(page, 'play', 90000);
  assert.equal(
    await page.evaluate(() => window.__sdc.track.def.id),
    await page.evaluate(() => window.__sdc.track.def.id),
  );
  assert.ok(await page.isVisible('#hud'));
  for (const id of ['#tLeft', '#tRight', '#tGas', '#tBrake', '#tHb'])
    await assertInViewport(page, id, `commande ${id}`);
  // le gaz au doigt fait avancer la voiture
  const gas = await page.$('#tGas');
  const g = await gas.boundingBox();
  await page.touchscreen.tap(g.x + g.width / 2, g.y + g.height / 2);
  await page.evaluate(() => {
    window.__sdc.touch.gas = true;
  });
  await page.waitForFunction(() => window.__sdc.player.speed > 3, null, { timeout: 60000 });
  noErrors(errors);
});

test('à la deuxième visite, « Rouler » mène droit au choix de session', async () => {
  const { page } = await B.play();
  await press(page, '#playBtn');
  await page.waitForSelector('#help:not([hidden])');
  await revisit(page);
  await press(page, '#playBtn');
  await page.waitForSelector('#select:not([hidden])', { timeout: 5000 });
  assert.ok(await page.isHidden('#help'));
  assert.equal(await phase(page), 'menu');
});
