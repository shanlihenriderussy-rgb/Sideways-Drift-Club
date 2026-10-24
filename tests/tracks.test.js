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
    assert.ok(t.turns.length >= 5, `${t.turns.length} virages`);
    assert.ok(t.length > 900 && t.length < 1900, `${t.length.toFixed(0)} m`);
  });
  // Règle des tracés officiels (Formula Drift, D1GP) : un virage porte une zone extérieure OU des points de corde,
  // jamais les deux. Le pare-chocs arrière au mur extérieur et l'avant au cône intérieur dans le même virage :
  // la voiture devrait mesurer toute la largeur de la piste.
  test(`${def.name} : un seul type de clip par virage`, () => {
    const t = buildTrackData(def);
    for (const [k, u] of t.turns.entries()) {
      const types = new Set(t.zones.filter((z) => z.turn === k).map((z) => z.type));
      assert.equal(types.size, 1, `virage ${k + 1} : ${[...types].join(' + ') || 'aucun clip'}`);
      assert.ok(types.has(u.type), `virage ${k + 1} : type ${u.type}`);
    }
    for (const z of t.zones) assert.ok(z.turn >= 0 && z.turn < t.turns.length, 'zone rattachée à un virage');
  });
  test(`${def.name} : initiation en zone extérieure, cordes dans les virages serrés`, () => {
    const t = buildTrackData(def);
    const outer = t.turns.filter((u) => u.type === 'outer'), inner = t.turns.filter((u) => u.type === 'inner');
    assert.equal(t.turns[0].type, 'outer', 'premier virage après le départ : zone extérieure');
    assert.ok(outer.length >= 2 && inner.length >= 2, `${outer.length} zones ext., ${inner.length} cordes`);
    const rest = t.turns.slice(1);
    const rIn = Math.max(...rest.filter((u) => u.type === 'inner').map((u) => u.radius));
    const rOut = Math.min(...rest.filter((u) => u.type === 'outer').map((u) => u.radius));
    assert.ok(rIn <= rOut, `corde à R ${rIn.toFixed(0)} m plus large qu’une zone à R ${rOut.toFixed(0)} m`);
  });
  test(`${def.name} : zones et cordes séparées le long du tracé`, () => {
    const t = buildTrackData(def);
    const ahead = (a, b) => (b - a + t.count) % t.count;
    for (const o of t.zones.filter((z) => z.type === 'outer')) for (const c of t.zones.filter((z) => z.type === 'inner')) {
      const inO = ahead(o.from, c.mid) <= ahead(o.from, o.to);
      assert.ok(!inO, `corde du virage ${c.turn + 1} dans la zone du virage ${o.turn + 1}`);
    }
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

// Relief : pentes praticables, sol raccordé à la route, chaque lieu a du dénivelé.
for (const def of TRACKS) {
  test(`${def.name} : relief praticable et sol raccordé à la route`, () => {
    const t = buildTrackData(def);
    let gmax = 0, hmin = Infinity, hmax = -Infinity, err = 0;
    for (let i = 0; i < t.count; i++) {
      gmax = Math.max(gmax, Math.abs(t.py[(i + 1) % t.count] - t.py[i]) / t.step);
      hmin = Math.min(hmin, t.py[i]); hmax = Math.max(hmax, t.py[i]);
      for (const o of [-t.half, 0, t.half]) err = Math.max(err, Math.abs(t.terrain.at(t.px[i] - t.tz[i] * o, t.pz[i] + t.tx[i] * o) - t.py[i]));
    }
    assert.ok(gmax < 0.13, `pente max ${(gmax * 100).toFixed(1)} %`);
    assert.ok(hmax - hmin >= 5, `dénivelé ${(hmax - hmin).toFixed(1)} m`);
    assert.ok(err < 0.3, `sol à ${err.toFixed(2)} m de la route`);
    assert.equal(t.terrain.at(1e5, 1e5), 0, 'sol lointain au niveau 0');
  });
}

// Silhouettes : deux pistes ne doivent pas se ressembler (proportions, densité de virages, remplissage de la boîte).
// Les six anciens tracés « en patate » tombaient à 0,22 sur deux paires.
test('tracés aux silhouettes distinctes', () => {
  const sig = TRACKS.map((def) => {
    const t = buildTrackData(def);
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (let i = 0; i < t.count; i++) { a = Math.min(a, t.px[i]); b = Math.max(b, t.px[i]); c = Math.min(c, t.pz[i]); d = Math.max(d, t.pz[i]); }
    const w = Math.max(b - a, d - c), h = Math.min(b - a, d - c);
    let area = 0;
    for (let i = 0; i < t.count; i++) { const k = (i + 1) % t.count; area += t.px[i] * t.pz[k] - t.px[k] * t.pz[i]; }
    return { id: def.id, aspect: w / h, density: t.turns.length / (t.length / 1000), fill: Math.abs(area) / 2 / (w * h) };
  });
  for (let i = 0; i < sig.length; i++) for (let j = i + 1; j < sig.length; j++) {
    const A = sig[i], B = sig[j];
    const diff = Math.abs(Math.log(A.aspect / B.aspect)) + Math.abs(Math.log(A.density / B.density)) + Math.abs(Math.log(A.fill / B.fill));
    assert.ok(diff > 0.3, `${A.id} et ${B.id} trop proches (écart ${diff.toFixed(2)})`);
  }
});
