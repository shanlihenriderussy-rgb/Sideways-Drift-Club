// Planche de contrôle des voitures : chaque modèle sous plusieurs angles, en plein jour, interface masquée.
//   node build.mjs --local && node tools/shots-cars.mjs [dossier] [voitures] [piste]
import fs from 'node:fs';
import path from 'node:path';
import { launch, openGame } from './lib/harness.mjs';

const out = process.argv[2] || 'shots';
const kinds = (process.argv[3] || 'hachi,kouki,raijin').split(',');
const track = +(process.argv[4] ?? 2);
fs.mkdirSync(out, { recursive: true });
const VIEWS = {
  front: { a: 0.62, r: 5.2, h: 1.25 },
  rear: { a: 2.55, r: 5.4, h: 1.35 },
  side: { a: 1.57, r: 5.6, h: 0.9 },
  top: { a: 0.9, r: 4.6, h: 3.4 },
};
const browser = await launch();
const ctx = await browser.newContext();
const errors = [];
const page = await openGame(ctx, { width: 1280, height: 720, errors });
await page.evaluate((t) => window.__sdc.setTrack(t), track);
await page.click('#garageBtn');
await page.waitForTimeout(800);
await page.addStyleTag({ content: '#garage,.screen,.card,#toasts,#hud{opacity:0!important}' });
const extra = process.env.LOOK ? JSON.parse(process.env.LOOK) : {};
for (const kind of kinds)
  for (const [name, view] of Object.entries(VIEWS)) {
    await page.evaluate(
      ([k, v, extra]) => {
        const D = window.__sdcDbg;
        D.preview(k, Object.assign({}, D.profile.cars[k] || D.defaultCar(k), extra));
        D.view(v);
        D.yaw(0);
      },
      [kind, view, extra],
    );
    await page.waitForTimeout(1400);
    await page.screenshot({ path: path.join(out, `${kind}-${name}.png`) });
  }
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
await browser.close();
