// Captures de la page de présentation (README) : docs/screenshots/*.jpg. Le bot pilote, la capture part en pleine glisse.
//   node build.mjs --local && node tools/readme-shots.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launch, newContext, openGame, installBot, stopBot, startRun } from './lib/harness.mjs';

const out = path.join(ROOT, 'docs', 'screenshots');
fs.mkdirSync(out, { recursive: true });
const browser = await launch();
const ctx = await newContext(browser, { scale: 1.5, touch: true });
const page = await openGame(ctx, { width: 1280, height: 600 });
const shot = (n) => page.screenshot({ path: path.join(out, n + '.jpg'), type: 'jpeg', quality: 82 });

await shot('menu');
await page.tap('#playBtn');
await page.waitForTimeout(400);
if (await page.isVisible('#help [data-back]')) {
  await page.tap('#help [data-back]');
  await page.waitForTimeout(300);
}
await shot('select');

// départ sur une piste, bot au volant, capture dès que l'angle et le score sont là
const run = async (track, mode, name, minT) => {
  await startRun(page, track, mode);
  await installBot(page);
  await page
    .waitForFunction(
      (minT) => {
        const S = window.__sdc;
        return S.score.runT > minT && Math.abs(S.player.slip) > 0.45 && S.score.combo > 0;
      },
      minT,
      { timeout: 180000 },
    )
    .catch(() => {});
  await shot(name);
};
await run(0, 'tandem', 'tandem', 8);
await page.waitForTimeout(4000);
await stopBot(page);
await page.evaluate(() => window.__sdc.finishRun());
await page.waitForFunction(() => window.__sdc.phase === 'results', null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(800);
await shot('results');
for (const [i, n] of [
  [1, 'akane'],
  [4, 'yukimi'],
  [5, 'kaigan'],
  [2, 'piton'],
])
  await run(i, 'run', n, 6);
// fond de bannière : même glisse, interface masquée
await page.addStyleTag({ content: '#hud,#touch{visibility:hidden!important}' });
await run(5, 'run', 'hero', 6);
await stopBot(page);

const fresh = async () => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__sdc && window.__sdc.phase === 'menu');
};
await fresh();
await page.tap('#garageBtn');
await page.waitForTimeout(1800);
await shot('garage');
await fresh();
await page.tap('#advBtn');
await page.waitForTimeout(900);
await shot('aventure');
await browser.close();
console.log('captures écrites dans', out);
