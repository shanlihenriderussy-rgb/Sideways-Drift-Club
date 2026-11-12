// Fumée de bout en bout : le jeu démarre, un run se joue, l'île se charge, l'atelier s'ouvre,
// deux onglets se voient en multijoueur. Sort en erreur au premier écart.
//   node build.mjs --local && node tools/smoke.mjs [dossier de captures]
import fs from 'node:fs';
import path from 'node:path';
import { launch, openGame, installBot, stopBot, startRun } from './lib/harness.mjs';

const shots = process.argv[2] || null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const browser = await launch();
const ctx = await browser.newContext();
const errors = [];
const fails = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + detail : ''}`);
  if (!ok) fails.push(label);
};
const snap = async (page, name) => {
  if (shots) await page.screenshot({ path: path.join(shots, name + '.png') });
};

const view = { width: 480, height: 270, errors };
const page = await openGame(ctx, view);
check(true, 'démarrage : écran titre');
await snap(page, 'menu');

// run noté, bot au volant
await startRun(page, 1, 'run');
await installBot(page);
await page
  .waitForFunction(() => window.__sdc.score.total + window.__sdc.score.combo > 300, null, { timeout: 120000 })
  .catch(() => {});
const run = await page.evaluate(() => {
  const S = window.__sdc;
  return {
    pts: Math.round(S.score.total + S.score.combo),
    v: S.player.speed,
    calls: window.__sdcDbg.renderer.info.render.calls,
  };
});
check(run.pts > 300, 'run noté : le bot marque des points', `${run.pts} pts, ${run.calls} appels de dessin`);
await snap(page, 'run');
await stopBot(page);
await page.evaluate(() => window.__sdc.finishRun());
await page.waitForFunction(() => window.__sdc.phase === 'results', null, { timeout: 15000 }).catch(() => {});
check(await page.evaluate(() => window.__sdc.phase === 'results'), 'fin de run : résultats');

// atelier
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__sdc && window.__sdc.phase === 'menu');
await page.click('#garageBtn');
await page.waitForTimeout(1200);
check(await page.isVisible('#garage'), 'atelier : écran ouvert');
await snap(page, 'atelier');

// île + multijoueur local (BroadcastChannel entre deux onglets)
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__sdc && window.__sdc.phase === 'menu');
const guest = await openGame(ctx, view);
for (const p of [page, guest]) {
  await p.evaluate(() => window.__sdcDbg.enterIsland());
  await p
    .waitForFunction(() => window.__sdcDbg.isle() && window.__sdc.phase === 'play', null, { timeout: 60000 })
    .catch(() => {});
}
check(await page.evaluate(() => !!window.__sdcDbg.isle()), 'île : monde chargé');
await page.evaluate(() => {
  window.__mpApi = window.__sdcDbg.mpLocal('host');
});
await guest.evaluate(() => {
  window.__mpApi = window.__sdcDbg.mpLocal('guest');
});
const seen = (p) =>
  p
    .waitForFunction(
      () => {
        const m = window.__sdcDbg.mp();
        return m && m.remotes.size >= 1;
      },
      null,
      { timeout: 30000 },
    )
    .then(
      () => true,
      () => false,
    );
check((await seen(page)) && (await seen(guest)), 'multijoueur : les deux onglets se voient');
await page.evaluate(() => {
  window.__sdc.touch.gas = true;
});
const speed = () =>
  guest.evaluate(() => {
    const R = [...window.__sdcDbg.mp().remotes.values()][0];
    return R && R.view ? Math.hypot(R.view.vx, R.view.vz) : -1;
  });
// rendu logiciel : le temps de jeu avance moins vite que le temps réel, on attend un état, pas une durée
await guest
  .waitForFunction(
    () => {
      const R = [...window.__sdcDbg.mp().remotes.values()][0];
      return R && R.view && Math.hypot(R.view.vx, R.view.vz) > 2;
    },
    null,
    { timeout: 60000 },
  )
  .catch(() => {});
const moved = await speed();
check(moved > 1, 'multijoueur : la voiture distante roule chez l’invité', `${moved.toFixed(1)} m/s`);
await snap(page, 'ile-hote');
await snap(guest, 'ile-invite');

check(errors.length === 0, 'aucune erreur de page', errors.slice(0, 5).join(' | '));
await browser.close();
if (fails.length) {
  console.error(`\n${fails.length} écart(s)`);
  process.exit(1);
}
console.log('\nfumée : tout passe');
