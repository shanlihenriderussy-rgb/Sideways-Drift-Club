// Bannière de la page de présentation : docs/brand/banner.jpg (à partir de docs/screenshots/hero.jpg) et icône.
//   node tools/readme-shots.mjs && node tools/readme-banner.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launch } from './lib/harness.mjs';

const b64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString('base64');
const banner = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Instrument+Serif:ital@1&display=block" rel="stylesheet">
<style>
  html,body{margin:0;width:1280px;height:520px;background:#07080a;overflow:hidden;font-family:Archivo,"Arial Black",sans-serif;color:#f2f2ef}
  .bg{position:absolute;top:0;bottom:0;left:560px;right:-380px;background:url(data:image/jpeg;base64,${b64('docs/screenshots/hero.jpg')}) center 60%/cover}
  .shade{position:absolute;inset:0;background:linear-gradient(90deg,#07080a 0%,#07080a 46%,#07080aaa 60%,#07080a00 80%),linear-gradient(0deg,#07080acc,#07080a00 45%)}
  .wrap{position:absolute;left:64px;top:0;bottom:0;display:flex;align-items:center;gap:36px}
  img{width:208px;height:208px;filter:drop-shadow(0 10px 30px #000a)}
  .k{font-size:15px;letter-spacing:.32em;color:#7b8cff;font-weight:700;margin-bottom:6px}
  h1{margin:0;font-size:92px;line-height:.9;font-weight:900;font-stretch:125%;letter-spacing:-.01em}
  .sub{font-size:22px;letter-spacing:.55em;color:#f7d154;font-weight:700;margin:14px 0 18px}
  .dek{font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:30px;color:#e7e7e2}
  .tags{display:flex;gap:10px;margin-top:22px}
  .tags span{border:1px solid #ffffff2e;border-radius:999px;padding:7px 14px;font-size:14px;font-weight:600;background:#07080a99}
</style></head><body>
<div class="bg"></div><div class="shade"></div>
<div class="wrap"><img src="data:image/webp;base64,${b64('assets/logo.webp')}">
<div><div class="k">横滑り倶楽部 · JEU DE DRIFT 3D</div><h1>SIDEWAYS</h1><div class="sub">DRIFT CLUB</div>
<div class="dek">Glisse, clippe, encaisse. Dans ton navigateur.</div>
<div class="tags"><span>Mobile &amp; desktop</span><span>6 pistes</span><span>Monde ouvert</span><span>Multijoueur</span><span>PWA</span></div></div></div>
</body></html>`;
const browser = await launch();
const p = await browser.newPage({ viewport: { width: 1280, height: 520 }, deviceScaleFactor: 1.5 });
// les polices viennent de Google Fonts : si le réseau les bloque, la bannière sort avec les polices de repli
await p.setContent(banner, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
await Promise.race([p.evaluate(() => document.fonts.ready), new Promise((r) => setTimeout(r, 5000))]);
const fonts = await p.evaluate(() => document.fonts.check('900 20px Archivo'));
if (!fonts)
  console.warn('⚠ police Archivo indisponible : bannière rendue avec la police de repli, à refaire avec accès réseau');
await p.screenshot({ path: path.join(ROOT, 'docs/brand/banner.jpg'), type: 'jpeg', quality: 86 });
await browser.close();
console.log('docs/brand/banner.jpg', fonts ? '' : '(police de repli)');
