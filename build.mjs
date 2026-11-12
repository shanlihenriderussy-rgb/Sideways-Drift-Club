// Assemble le jeu en un seul document HTML autonome.
//   node build.mjs          -> index.html (Three.js depuis cdnjs), à déployer tel quel (Vercel, GitHub Pages)
//   node build.mjs --local  -> test.html  (Three.js depuis vendor/three.min.js), pour les tests hors ligne
// src/main.js est le point d'entrée : esbuild suit les imports et produit un script unique.
import fs from 'node:fs';
import { build } from 'esbuild';

const local = process.argv.includes('--local');
const read = (f, enc = 'utf8') => fs.readFileSync(new URL(f, import.meta.url), enc);

const bundle = await build({
  entryPoints: [new URL('./src/main.js', import.meta.url).pathname],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: !local,
  legalComments: 'none',
  loader: { '.bin': 'base64' },
  write: false,
});
const js = bundle.outputFiles[0].text.replace(/<\/script/g, '<\\/script');

// favicon SVG et emblème intégrés en data URI : le fichier reste autonome (double-clic, artifact).
// Icônes PNG et manifeste ne sont liés qu'en production.
const svg = read('./assets/favicon.svg')
  .replace(/\s*\n\s*/g, ' ')
  .replace(/<!--.*?-->/g, '');
const icons = local
  ? ''
  : '\n<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">\n<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n<link rel="manifest" href="manifest.webmanifest">';
const logo = 'data:image/webp;base64,' + read('./assets/logo.webp', 'base64');
const three = local
  ? '<script src="vendor/three.min.js"></script>'
  : '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>';

const slots = {
  favicon: `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(svg)}">${icons}`,
  styles: read('./src/ui/styles.css').replace('%LOGO%', logo),
  markup: read('./src/ui/markup.html'),
  three,
  script: js,
};
const doc = read('./src/ui/page.html').replace(/^[ \t]*<!-- @(\w+) -->[ \t]*$/gm, (_, k) => slots[k]);

const out = local ? 'test.html' : 'index.html';
fs.writeFileSync(new URL('./' + out, import.meta.url), doc);
console.log(`${out} · ${(doc.length / 1024).toFixed(0)} Ko (script ${(js.length / 1024).toFixed(0)} Ko)`);
