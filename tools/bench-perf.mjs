// Mesures de rendu : appels de dessin, triangles, temps de script par image, temps de chargement d'une piste.
// Rendu logiciel : les images par seconde ne veulent rien dire ici ; les compteurs et le temps de script, si.
//   node build.mjs --local && node tools/bench-perf.mjs [ralentissement CPU, ex. 6]
import { launch, openGame } from './lib/harness.mjs';

const throttle = +process.argv[2] || 1;
const browser = await launch();
const ctx = await browser.newContext();
const page = await openGame(ctx);
if (throttle > 1) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: throttle });
for (const q of ['low', 'med', 'high'])
  for (const t of [0, 1, 2]) {
    const load = await page.evaluate(
      ([q, t]) => {
        window.__sdcDbg.setQuality(q);
        const a = performance.now();
        window.__sdc.setTrack(t);
        const ms = performance.now() - a;
        window.__sdc.setMode('tandem');
        window.__sdc.startRun();
        window.__sdc.touch.gas = true;
        return ms;
      },
      [q, t],
    );
    await page.waitForTimeout(5000);
    const r = await page.evaluate(() => {
      const i = window.__sdcDbg.renderer.info;
      return {
        calls: i.render.calls,
        tris: i.render.triangles,
        geos: i.memory.geometries,
        tex: i.memory.textures,
        js: window.__sdcDbg.perf.js,
      };
    });
    console.log(
      `qualité ${q.padEnd(4)} piste ${t} · ${r.calls} appels · ${(r.tris / 1000).toFixed(0)} k triangles · script ${r.js.toFixed(2)} ms/image · chargement ${load.toFixed(0)} ms · ${r.geos} géométries, ${r.tex} textures`,
    );
  }
await browser.close();
