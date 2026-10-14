// Assemble src/* en un document HTML complet.
//   node build.mjs          -> index.html (Three.js depuis cdnjs), à déployer tel quel (Vercel, GitHub Pages)
//   node build.mjs --local  -> test.html (Three.js depuis vendor/three.min.js), pour les tests hors ligne
import fs from 'fs';
const src = (f) => fs.readFileSync(new URL('./src/' + f, import.meta.url), 'utf8');
const js = ['physics.js', 'track.js', 'world.js', 'car.js', 'fx.js', 'audio.js', 'ai.js', 'game.js']
  .map((f) => `// --- ${f}\n` + src(f).replace(/^if \(typeof module.*$/m, ''))
  .join('\n');
const local = process.argv.includes('--local');
const three = local
  ? '<script src="vendor/three.min.js"></script>'
  : '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>';
const doc = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
${src('head.html')}
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
