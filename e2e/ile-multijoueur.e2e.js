// L'île et le multijoueur : le monde ouvert se charge, deux joueurs se voient, se suivent et se quittent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { noErrors, press, useBrowser, waitPhase } from './helpers.js';

const B = useBrowser();
const enter = async (page) => {
  await page.evaluate(() => window.__sdcDbg.enterIsland());
  await page.waitForFunction(() => window.__sdcDbg.isle() && window.__sdc.phase === 'play', null, { timeout: 120000 });
};

test('« L’île » depuis le menu charge le monde ouvert ; la carte s’ouvre et se referme', async () => {
  const { page, errors } = await B.play({ size: { width: 480, height: 270 } });
  await press(page, '#isleBtn');
  await page.waitForFunction(() => window.__sdcDbg.isle() && window.__sdc.phase === 'play', null, { timeout: 120000 });
  assert.ok(await page.evaluate(() => window.__sdcDbg.life().T.agents.length > 0), 'pas de circulation');
  await page.keyboard.press('m');
  await page.waitForSelector('#isleMap:not([hidden])', { timeout: 10000 });
  await page.keyboard.press('m');
  await page.waitForSelector('#isleMap', { state: 'hidden', timeout: 10000 });
  await waitPhase(page, 'play', 30000);
  noErrors(errors);
});

test('deux joueurs : ils se voient, la voiture de l’hôte roule chez l’invité, un message passe', async () => {
  const size = { width: 480, height: 270 };
  const { page: host, ctx, errors } = await B.play({ size });
  const { page: guest } = await B.play({ size, ctx }); // même contexte : le lien local passe par BroadcastChannel
  await enter(host);
  await enter(guest);
  await host.evaluate(() => {
    window.__mp = window.__sdcDbg.mpLocal('host');
  });
  await guest.evaluate(() => {
    window.__mp = window.__sdcDbg.mpLocal('guest');
  });
  const seesOne = (p) =>
    p.waitForFunction(
      () => {
        const m = window.__sdcDbg.mp();
        return m && m.remotes.size === 1;
      },
      null,
      { timeout: 60000 },
    );
  await seesOne(host);
  await seesOne(guest);
  assert.ok(await guest.isVisible('#mpHud'), 'liste des pilotes absente chez l’invité');

  // l'hôte accélère : sa voiture avance chez l'invité, sans erreur d'affichage
  await host.evaluate(() => {
    window.__sdc.touch.gas = true;
  });
  await guest.waitForFunction(
    () => {
      const R = [...window.__sdcDbg.mp().remotes.values()][0];
      return R && R.view && Math.hypot(R.view.vx, R.view.vz) > 2;
    },
    null,
    { timeout: 90000 },
  );
  const v = await guest.evaluate(() => {
    const R = [...window.__sdcDbg.mp().remotes.values()][0];
    return { x: R.view.x, z: R.view.z, shown: R.shown };
  });
  assert.ok(Number.isFinite(v.x) && Number.isFinite(v.z) && v.shown, JSON.stringify(v));

  // message rapide de l'hôte : reçu par l'invité
  await host.evaluate(() => window.__sdcDbg.mp().S.emote('gg'));
  await guest.waitForFunction(() => [...window.__sdcDbg.mp().remotes.values()][0].emote === 'gg', null, {
    timeout: 15000,
  });

  noErrors(errors);
});

test('la pause sur l’île propose la carte et le retour au menu', async () => {
  const { page } = await B.play({ size: { width: 480, height: 270 } });
  await enter(page);
  await page.keyboard.press('Escape');
  await waitPhase(page, 'pause');
  assert.ok(await page.isVisible('#mapBtn'));
  await press(page, '#quitBtn');
  await page.waitForSelector('#menu:not([hidden])', { timeout: 30000 });
});
