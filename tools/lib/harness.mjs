// Outils de banc : ouvre test.html (build local) dans Chromium et expose le pilote automatique.
//   node build.mjs --local   avant tout banc
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const id of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try {
      return require(id);
    } catch (e) {
      /* suivant */
    }
  }
  throw new Error('Playwright introuvable : npm i -D playwright');
}

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const PAGE = 'file://' + path.join(ROOT, 'test.html');
// rendu logiciel : fonctionne sans carte graphique (CI, conteneur)
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export async function launch() {
  if (!fs.existsSync(path.join(ROOT, 'test.html')))
    throw new Error('test.html absent : lancer « node build.mjs --local »');
  return loadPlaywright().chromium.launch({ args: GL_ARGS });
}

// Contexte de navigation : densité de pixels et tactile se règlent ici (pas au niveau de la page).
export const newContext = (browser, { scale = 1, touch = false } = {}) =>
  browser.newContext({ deviceScaleFactor: scale, hasTouch: touch, isMobile: touch });

// Ouvre le jeu et attend l'écran titre. `errors` reçoit les erreurs de page.
export async function openGame(ctx, { width = 844, height = 390, errors = [] } = {}) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__sdc && window.__sdc.phase === 'menu', null, { timeout: 120000 });
  return page;
}

// Pilote automatique : suit la ligne de drift, lance la glisse au frein à main, tient l'angle au volant.
export function installBot(page, gain = 2.2) {
  return page.evaluate((gain) => {
    clearInterval(window.__botId);
    let hbT = 0;
    window.__botId = setInterval(() => {
      const S = window.__sdc,
        T = S.track,
        L = S.line,
        N = T.count,
        st = S.player;
      const a = (st.idx + 9) % N;
      const vh = st.speed > 3 ? Math.atan2(st.vz, st.vx) : st.heading;
      let e = Math.atan2(L.lz[a] - st.z, L.lx[a] - st.x) - vh;
      while (e > Math.PI) e -= 2 * Math.PI;
      while (e < -Math.PI) e += 2 * Math.PI;
      const drifting = Math.abs(st.slip) > 0.18,
        kAhead = T.curv[(st.idx + 12) % N];
      // en glisse : braquer vers l'intérieur resserre la trajectoire
      const steer = Math.max(-1, Math.min(1, drifting ? e * gain * 1.6 + Math.sign(kAhead) * 0.1 : e * gain));
      S.touch.left = steer < -0.18;
      S.touch.right = steer > 0.18;
      const vT = L.v[a] * 0.95;
      S.touch.gas = drifting ? st.speed < vT * 1.15 : st.speed < vT;
      S.touch.brake = !drifting && st.speed > vT * 1.25;
      if (!drifting && Math.abs(kAhead) > 1 / 70 && st.speed > 13 && hbT <= 0) hbT = 0.25;
      S.touch.hb = hbT > 0;
      hbT -= 0.02;
    }, 20);
  }, gain);
}
export const stopBot = (page) =>
  page.evaluate(() => {
    clearInterval(window.__botId);
    const t = window.__sdc.touch;
    t.left = t.right = t.gas = t.brake = t.hb = false;
  });

export const startRun = (page, track, mode = 'run') =>
  page.evaluate(
    ([t, m]) => {
      const S = window.__sdc;
      S.setTrack(t);
      S.setMode(m);
      S.startRun();
    },
    [track, mode],
  );
