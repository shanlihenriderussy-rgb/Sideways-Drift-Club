// Visuels de la page de présentation : docs/brand/banner.jpg, docs/brand/icon-tachy-256.png
//   node tools/readme-banner.js   (après tools/readme-shots.js, la bannière part de docs/screenshots/hero.jpg)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
const b64 = (f) => fs.readFileSync(path.join(root, f)).toString('base64');
const banner = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Instrument+Serif:ital@1&display=block" rel="stylesheet">
<style>
  html,body{margin:0;width:1280px;height:520px;background:#07080a;overflow:hidden;font-family:Archivo,sans-serif;color:#f2f2ef}
  .bg{position:absolute;top:0;bottom:0;left:560px;right:-380px;background:url(data:image/jpeg;base64,${b64('docs/screenshots/hero.jpg')}) center 60%/cover}
  .shade{position:absolute;inset:0;background:linear-gradient(90deg,#07080a 0%,#07080a 46%,#07080aaa 60%,#07080a00 80%),linear-gradient(0deg,#07080acc,#07080a00 45%)}
  .wrap{position:absolute;left:64px;top:0;bottom:0;display:flex;align-items:center;gap:36px}
  img{width:208px;height:208px;filter:drop-shadow(0 10px 30px #000a)}
  .k{font-size:15px;letter-spacing:.32em;color:#7b8cff;font-weight:700;margin-bottom:6px}
  h1{margin:0;font-size:92px;line-height:.9;font-weight:900;font-stretch:125%;letter-spacing:-.01em}
  .sub{font-size:22px;letter-spacing:.55em;color:#f7d154;font-weight:700;margin:14px 0 18px}
  .dek{font-family:'Instrument Serif',serif;font-style:italic;font-size:30px;color:#e7e7e2}
  .tags{display:flex;gap:10px;margin-top:22px}
  .tags span{border:1px solid #ffffff2e;border-radius:999px;padding:7px 14px;font-size:14px;font-weight:600;background:#07080a99}
</style></head><body>
<div class="bg"></div><div class="shade"></div>
<div class="wrap"><img src="data:image/webp;base64,${b64('assets/logo.webp')}">
<div><div class="k">横滑り倶楽部 · JEU DE DRIFT 3D</div><h1>SIDEWAYS</h1><div class="sub">DRIFT CLUB</div>
<div class="dek">Glisse, clippe, encaisse. Dans ton navigateur.</div>
<div class="tags"><span>Mobile &amp; desktop</span><span>6 pistes</span><span>Monde ouvert</span><span>Mode aventure</span><span>PWA</span></div></div></div>
</body></html>`;
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const b = await chromium.launch({ proxy });
  const p = await b.newPage({ viewport: { width: 1280, height: 520 }, deviceScaleFactor: 1.5 });
  await p.setContent(banner, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(root, 'docs/brand/banner.jpg'), type: 'jpeg', quality: 86 });
  const svg = fs.readFileSync(path.join(root, 'assets/favicon.svg'), 'utf8');
  const q = await b.newPage({ viewport: { width: 256, height: 256 } });
  await q.setContent(`<style>html,body{margin:0;background:transparent}svg{width:256px;height:256px;display:block}</style>${svg}`);
  await q.screenshot({ path: path.join(root, 'docs/brand/icon-tachy-256.png'), omitBackground: true });
  await b.close();
})();
