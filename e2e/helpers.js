// Outillage commun des tests de bout en bout : un navigateur par fichier, un contexte neuf par test
// (stockage local vierge : chaque test part d'un joueur qui n'a jamais lancé le jeu).
//   npm run e2e            build local + toute la suite
//   node --test e2e/atelier.e2e.js     un seul fichier (après « npm run build:local »)
import { after, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { launch, newContext, openGame } from '../tools/lib/harness.mjs';

export { installBot, stopBot, startRun } from '../tools/lib/harness.mjs';

export const PHONE = { width: 844, height: 390 }; // téléphone en paysage : la taille de référence du jeu
export const PORTRAIT = { width: 390, height: 844 };

// Ouvre et ferme le navigateur autour des tests du fichier. play(opts) → { page, ctx, errors }.
export function useBrowser() {
  let browser;
  const open = [];
  before(async () => {
    browser = await launch();
  });
  // un jeu qui tourne en arrière-plan ralentit tous les suivants : chaque test ferme ce qu'il a ouvert
  afterEach(async () => {
    for (const c of open.splice(0)) await c.close().catch(() => {});
  });
  after(async () => {
    await browser.close();
  });
  return {
    async play({ size = PHONE, touch = false, ctx = null } = {}) {
      const context = ctx || (await newContext(browser, { touch }));
      if (!ctx) open.push(context);
      const errors = [];
      const page = await openGame(context, { ...size, errors });
      return { page, ctx: context, errors };
    },
  };
}

// Recharge la page en gardant le stockage local (même joueur, nouvelle visite).
export async function revisit(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__sdc && window.__sdc.phase === 'menu', null, { timeout: 120000 });
}

export const phase = (page) => page.evaluate(() => window.__sdc.phase);
export const money = (page) => page.evaluate(() => window.__sdcDbg.profile.money);
export const waitPhase = (page, p, timeout = 60000) =>
  page.waitForFunction((p) => window.__sdc.phase === p, p, { timeout });

// Rectangle d'un élément, en pixels de la fenêtre.
export const box = (page, sel) =>
  page.$eval(sel, (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
  });

// L'élément est entièrement dans la fenêtre : le joueur le voit sans faire défiler.
export async function assertInViewport(page, sel, label = sel) {
  const b = await box(page, sel);
  const v = page.viewportSize();
  assert.ok(b.w > 0 && b.h > 0, `${label} n'a pas de taille (masqué ?)`);
  assert.ok(
    b.x >= 0 && b.y >= 0 && b.right <= v.width + 0.5 && b.bottom <= v.height + 0.5,
    `${label} sort de l'écran : ${JSON.stringify(b)} dans ${v.width}×${v.height}`,
  );
}

// Clic sur un élément visible et actif. Sous rendu logiciel (quelques images par seconde), l'attente de stabilité
// de Playwright peut ne jamais aboutir alors que rien ne bouge ; on vérifie donc nous-mêmes que l'élément est
// affiché et actif, on l'amène à l'écran, puis on déclenche le clic. Les parcours tactiles utilisent page.tap().
export async function press(page, sel) {
  await page.waitForSelector(sel, { state: 'visible', timeout: 15000 });
  await page.$eval(sel, (el) => {
    if (el.disabled) throw new Error('élément inactif : ' + (el.id || el.className));
    el.scrollIntoView({ block: 'nearest' });
    el.click();
  });
}

export const overlap = (a, b) => a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;

export const noErrors = (errors) => assert.deepEqual(errors, [], 'erreurs de page : ' + errors.join(' | '));
