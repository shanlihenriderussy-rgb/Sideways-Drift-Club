// Un run noté complet joué par le pilote automatique : sert à vérifier qu'une piste reste « scorable ».
//   node build.mjs --local && node tools/bot-run.mjs [piste 0-5] [gain de direction]
import { launch, openGame, installBot, startRun } from './lib/harness.mjs';

const track = +process.argv[2] || 0;
const browser = await launch();
const page = await openGame(await browser.newContext(), { width: 320, height: 180 });
await startRun(page, track, 'run');
await installBot(page, +process.argv[3] || 2.2);
await page.waitForFunction(() => window.__sdc.phase === 'results', null, { timeout: 400000 }).catch(() => {});
const r = await page.evaluate(() => {
  const s = window.__sdc.score;
  return {
    phase: window.__sdc.phase,
    temps: +s.runT.toFixed(1),
    total: Math.round(s.total),
    clips: s.clips,
    meilleurCombo: Math.round(s.best),
  };
});
console.log(`piste ${track}`, JSON.stringify(r));
await browser.close();
