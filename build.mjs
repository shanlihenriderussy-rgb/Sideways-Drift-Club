import fs from 'fs';
const src = (f) => fs.readFileSync(new URL('./src/' + f, import.meta.url), 'utf8');
const js = ['physics.js', 'track.js', 'world.js', 'car.js', 'fx.js', 'audio.js', 'ai.js', 'game.js'].map((f) => `// --- ${f}\n` + src(f).replace(/^if \(typeof module.*$/m, '')).join('\n');
const local = process.argv.includes('--local');
const three = local ? '<script src="vendor/three.min.js"></script>' : '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>';
const html = `${src('head.html')}\n${src('body.html')}\n${three}\n<script>\n"use strict";\n${js}\n</script>\n`;
const head = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>';
fs.writeFileSync(new URL(local ? './test.html' : './sideways-drift-club.html', import.meta.url), local ? head + html + '</body></html>' : html);
console.log('ok', html.length);
