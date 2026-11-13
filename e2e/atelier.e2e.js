// L'atelier : aperçu avant achat, achat débité et conservé, refus quand l'argent manque, abandon de l'aperçu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertInViewport, money, noErrors, press, revisit, useBrowser } from './helpers.js';

const B = useBrowser();
const open = async (page) => {
  await press(page, '#garageBtn');
  await page.waitForSelector('#garage:not([hidden])', { timeout: 10000 });
};
const rim = (page) => page.evaluate(() => window.__sdcDbg.profile.cars.hachi.rimStyle);

test('les six rayons s’ouvrent', async () => {
  const { page, errors } = await B.play();
  await open(page);
  const tabs = await page.$$eval('#shopTabs [data-tab]', (els) => els.map((e) => e.dataset.tab));
  assert.ok(tabs.length >= 6, `rayons : ${tabs}`);
  for (const t of tabs) {
    await press(page, `#shopTabs [data-tab="${t}"]`);
    assert.equal(await page.getAttribute(`#shopTabs [data-tab="${t}"]`, 'aria-selected'), 'true', `rayon ${t}`);
    assert.ok((await page.$eval('#shopBody', (el) => el.children.length)) > 0, `rayon ${t} vide`);
  }
  noErrors(errors);
});

test('sur téléphone, les rayons hors écran sont signalés par un fondu ; le bouton de sortie dit ce qu’il fait', async () => {
  const { page } = await B.play();
  await open(page);
  await page.waitForFunction(() => document.querySelector('#shopTabs').classList.contains('more-right'), null, {
    timeout: 5000,
  });
  await page.$eval('#shopTabs', (el) => el.scrollTo(el.scrollWidth, 0));
  await page.waitForFunction(
    () => {
      const c = document.querySelector('#shopTabs').classList;
      return c.contains('more-left') && !c.contains('more-right');
    },
    null,
    { timeout: 5000 },
  );
  assert.equal((await page.textContent('#shopDone')).trim(), 'Reprendre la route');
});

test('acheter des jantes : aperçu, prix annoncé, solde débité, achat conservé à la visite suivante', async () => {
  const { page } = await B.play();
  await open(page);
  const before = await money(page);
  await press(page, '#shopTabs [data-tab="wheels"]');
  await press(page, '#shopBody [data-key="rimStyle"][data-id="five"]');
  // l'aperçu ne change rien tant qu'on n'a pas payé
  assert.equal(await rim(page), 'six');
  assert.ok(await page.isVisible('#shopBuy'));
  await assertInViewport(page, '#shopBuy', 'bouton Acheter');
  assert.match(await page.textContent('#shopBuy'), /1\s?500/);
  await press(page, '#shopBuy');
  // 1 500 ¥ débités ; un défi (« premier achat ») peut rendre une prime au passage, jamais plus que le prix
  const after = await money(page);
  assert.ok(after < before && after >= before - 1500, `solde ${before} → ${after}`);
  assert.equal(await rim(page), 'five');
  assert.ok(
    await page.evaluate(() => window.__sdcDbg.profile.log.some((l) => l.amount === -1500)),
    'achat absent du journal',
  );
  await revisit(page);
  assert.equal(await money(page), after);
  assert.equal(await rim(page), 'five');
});

test('quitter l’atelier sans payer abandonne l’aperçu', async () => {
  const { page } = await B.play();
  await open(page);
  const before = await money(page);
  await press(page, '#shopTabs [data-tab="wheels"]');
  await press(page, '#shopBody [data-key="rimStyle"][data-id="mesh"]');
  await press(page, '#shopDone');
  await page.waitForSelector('#menu:not([hidden])', { timeout: 10000 });
  assert.equal(await rim(page), 'six');
  assert.equal(await money(page), before);
});

test('voiture trop chère : achat refusé, le manque est annoncé, rien n’est débité', async () => {
  const { page } = await B.play();
  await open(page);
  const before = await money(page);
  await press(page, '#shopBody [data-car="raijin"]');
  const text = await page.textContent('#garage');
  assert.match(text, /il manque|manque/i, 'le manque n’est pas annoncé');
  const buy = await page.$('#garage button:has-text("Acheter")');
  if (buy) assert.equal(await buy.isDisabled(), true, 'le bouton Acheter devrait être inactif');
  assert.equal(await money(page), before);
  assert.equal(await page.evaluate(() => window.__sdcDbg.profile.current), 'hachi');
});
