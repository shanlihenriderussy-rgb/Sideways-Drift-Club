// Assemble src/* en un document HTML complet.
//   node build.mjs          -> index.html (Three.js depuis cdnjs), à déployer tel quel (Vercel, GitHub Pages)
//   node build.mjs --local  -> test.html (Three.js depuis vendor/three.min.js), pour les tests hors ligne
import fs from 'fs';
const src = (f) => fs.readFileSync(new URL('./src/' + f, import.meta.url), 'utf8');
const js = ['physics.js', 'economy.js', 'track.js', 'world.js', 'car.js', 'fx.js', 'audio.js', 'ai.js', 'shop.js', 'story.js', 'isleai.js', 'net.js', 'island.js', 'game.js']
  .map((f) => `// --- ${f}\n` + src(f).replace(/^if \(typeof module.*$/m, ''))
  .join('\n');
const local = process.argv.includes('--local');
// favicon SVG intégré (fonctionne aussi en fichier unique / artifact) ; icônes PNG et manifeste servis à côté en production
const favicon = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(fs.readFileSync(new URL('./assets/favicon.svg', import.meta.url), 'utf8').replace(/\s*\n\s*/g, ' ').replace(/<!--.*?-->/g, ''))}">`
  + (local ? '' : '\n<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">\n<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n<link rel="manifest" href="manifest.webmanifest">');
const three = local
  ? '<script src="vendor/three.min.js"></script>'
  : '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>';
// logo : intégré en data URI (fonctionne aussi en fichier unique / artifact)
const logo = 'data:image/webp;base64,' + fs.readFileSync(new URL('./assets/logo.webp', import.meta.url)).toString('base64');
const doc = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${favicon}
${src('head.html').replace('%LOGO%', logo)}
</head>
<body>
${src('body.html')}
${three}
<script>
"use strict";
${js}
</script>
</body>
</html>
`;
const out = local ? 'test.html' : 'index.html';
fs.writeFileSync(new URL('./' + out, import.meta.url), doc);
console.log('ok', out, doc.length);
