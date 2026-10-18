// Pistes : tracé valide, zones de clipping, vignette de menu. node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TRACKS, buildTrackData } = require('../src/track.js');

test('entre 5 et 7 pistes, identifiants uniques', () => {
  assert.ok(TRACKS.length >= 5 && TRACKS.length <= 7, `${TRACKS.length} pistes`);
  assert.equal(new Set(TRACKS.map((t) => t.id)).size, TRACKS.length);
});

for (const def of TRACKS) {
  test(`${def.name} : le tracé ne se recoupe pas et laisse la place aux murs`, () => {
    const t = buildTrackData(def);
    const gap = Math.ceil((t.wall * 2 + 30) / t.step); // voisins le long du tracé ignorés
    let worst = Infinity;
    for (let i = 0; i < t.count; i += 2) for (let j = i + gap; j < t.count; j += 2) {
      if (t.count - j + i < gap) continue;
      worst = Math.min(worst, Math.hypot(t.px[i] - t.px[j], t.pz[i] - t.pz[j]));
    }
    assert.ok(worst > t.wall * 2 + 8, `${worst.toFixed(1)} m entre deux portions (min ${(t.wall * 2 + 8).toFixed(1)})`);
  });
  test(`${def.name} : virages notés, longueur raisonnable`, () => {
    const t = buildTrackData(def);
    assert.ok(t.zones.filter((z) => z.type === 'outer').length >= 5, `${t.zones.length / 2} virages`);
    assert.ok(t.length > 900 && t.length < 1900, `${t.length.toFixed(0)} m`);
  });
}

test('chaque piste a sa vignette et un thème de décor', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/head.html'), 'utf8');
  const world = fs.readFileSync(path.join(__dirname, '../src/world.js'), 'utf8');
  for (const t of TRACKS) {
    assert.ok(css.includes(`.sw-${t.id}`), `vignette .sw-${t.id}`);
    assert.ok(new RegExp(`\\n  ${t.theme}: \\{`).test(world), `thème ${t.theme}`);
  }
});

test('défi « toutes les pistes » : seuil aligné sur le nombre de pistes', () => {
  const E = require('../src/economy.js');
  const c = E.CHALLENGES.find((x) => x.id === 'tourAll');
  const p = { stats: { tracks: TRACKS.slice(1).map((t) => t.id) } };
  assert.equal(c.test({}, p), false);
  p.stats.tracks.push(TRACKS[0].id);
  assert.equal(c.test({}, p), true);
});
