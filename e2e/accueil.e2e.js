// Écran titre et navigation : le jeu démarre, chaque rubrique s'ouvre et se referme, rien ne masque la marque.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PHONE, PORTRAIT, assertInViewport, box, noErrors, overlap, phase, press, useBrowser } from './helpers.js';

const B = useBrowser();

test('démarrage : écran titre, solde de départ, bonus du jour crédité, aucune erreur', async () => {
  const { page, errors } = await B.play();
  assert.equal(await phase(page), 'menu');
  assert.ok(await page.isVisible('#menu'));
  // 3 000 ¥ de départ + 1 000 ¥ de bonus du premier jour
  assert.equal(await page.textContent('#menuWallet'), '¥4 000');
  await assertInViewport(page, '#playBtn', 'bouton Rouler');
  noErrors(errors);
});

for (const [name, size] of [
  ['paysage', PHONE],
  ['portrait', PORTRAIT],
]) {
  test(`écran titre (${name}) : le toast du bonus ne recouvre ni le logotype ni le solde`, async () => {
    const { page } = await B.play({ size });
    await page.waitForSelector('#toasts .toast', { timeout: 5000 });
    const toast = await box(page, '#toasts .toast');
    assert.ok(!overlap(toast, await box(page, '#logoTitle')), 'le toast recouvre le logotype');
    assert.ok(!overlap(toast, await box(page, '#menuWallet')), 'le toast recouvre le solde');
    await assertInViewport(page, '#toasts .toast', 'toast');
  });
}

test('chaque rubrique du menu s’ouvre, puis Retour ramène à l’écran titre', async () => {
  const { page, errors } = await B.play();
  for (const [btn, screen] of [
    ['#advBtn', '#adventure'],
    ['#multiBtn', '#multi'],
    ['#careerBtn', '#career'],
    ['#settingsBtn', '#settings'],
    ['#helpBtn', '#help'],
  ]) {
    await press(page, btn);
    await page.waitForSelector(`${screen}:not([hidden])`, { timeout: 5000 });
    assert.ok(await page.isHidden('#menu'), `${screen} : le menu reste affiché`);
    await assertInViewport(page, `${screen} [data-back]`, `Retour de ${screen}`);
    await press(page, `${screen} [data-back]`);
    await page.waitForSelector('#menu:not([hidden])', { timeout: 5000 });
  }
  noErrors(errors);
});

test('clavier : Échap referme une rubrique', async () => {
  const { page } = await B.play();
  await press(page, '#settingsBtn');
  await page.waitForSelector('#settings:not([hidden])');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#menu:not([hidden])', { timeout: 5000 });
});

test('« Comment jouer » depuis le menu montre l’aide complète, avec la mention d’assistance par IA', async () => {
  const { page } = await B.play();
  await press(page, '#helpBtn');
  await page.waitForSelector('#help:not([hidden])');
  assert.equal(await page.$eval('#help', (el) => el.classList.contains('brief')), false);
  assert.ok(await page.isVisible('#help .help-grid .more'), 'étape « Encaisser » absente');
  assert.match(await page.textContent('#help .hint'), /assistance d'une IA/);
});

test('nouveau joueur : le bandeau n’annonce qu’une fois l’absence de record, et tutoie', async () => {
  const { page } = await B.play();
  const ticker = await page.textContent('#ticker');
  assert.equal(ticker.split('Aucun record encore').length - 1, 2, 'une invitation, doublée pour le défilement');
  assert.doesNotMatch(ticker, /vous|votre/i);
  assert.match(ticker, /Ta cagnotte/);
});
