// Carrosseries exportées de Blender : format lisible, maillage sain, cotes cohérentes avec la physique. node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { decodeModel, expand, expandPart, bodyLines } from '../src/render/car/format.js';
import { CAR_SPECS } from '../src/sim/physics.js';

globalThis.THREE = THREE;
const { wheelGeos } = await import('../src/render/car/wheels.js');

const dir = path.join(import.meta.dirname, '../assets/models');
const load = (kind) => decodeModel(fs.readFileSync(path.join(dir, kind + '.bin')));

for (const kind of Object.keys(CAR_SPECS)) {
  const M = load(kind);
  const d = M.meta;
  const B0 = bodyLines(d);

  test(`${kind} : deux niveaux de détail dans le budget (fin ≤ 45 000 triangles, léger ≤ 12 000)`, () => {
    assert.equal(M.lods.length, 2);
    const tris = M.lods.map((L) => (L.index.length / 3) * 2);
    assert.ok(tris[0] <= 45000 && tris[0] > 15000, `fin : ${tris[0]}`);
    assert.ok(tris[1] <= 12000 && tris[1] > 3000, `léger : ${tris[1]}`);
  });

  test(`${kind} : maillage sain (indices valides, normales unitaires, rien sous le sol ni à gauche de l'axe)`, () => {
    for (const L of M.lods) {
      for (const i of L.index) assert.ok(i < L.verts);
      for (let i = 0; i < L.verts; i++) {
        const n = Math.hypot(L.nor[i * 3], L.nor[i * 3 + 1], L.nor[i * 3 + 2]);
        assert.ok(Math.abs(n - 1) < 0.03, `normale ${n}`);
        assert.ok(L.pos[i * 3 + 1] > 0.1, 'sous le bas de caisse');
        assert.ok(L.pos[i * 3 + 2] >= -1e-6, 'demi-modèle : z ≥ 0');
        assert.ok(L.ao[i] >= 0 && L.ao[i] <= 1);
      }
    }
  });

  test(`${kind} : faces orientées vers l'extérieur (le moteur masque les faces arrière)`, () => {
    // la normale géométrique de chaque triangle de tôle doit s'éloigner de l'épine dorsale de la voiture
    const parts = expand(M, 0);
    for (const name of ['paint_side', 'paint_top', 'paint_plain', 'glass', 'head', 'tail']) {
      const p = parts[name];
      if (!p) continue;
      let out = 0,
        n = 0;
      for (let i = 0; i < p.index.length; i += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => [0, 1, 2].map((j) => p.pos[p.index[i + k] * 3 + j]));
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
          v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const nx = u[1] * v[2] - u[2] * v[1],
          ny = u[2] * v[0] - u[0] * v[2],
          nz = u[0] * v[1] - u[1] * v[0];
        const cx = (a[0] + b[0] + c[0]) / 3,
          cy = (a[1] + b[1] + c[1]) / 3,
          cz = (a[2] + b[2] + c[2]) / 3;
        const sx = Math.max(d.X0 + 0.7, Math.min(d.X1 - 0.7, cx)); // point le plus proche sur l'épine
        if (nx * (cx - sx) + ny * (cy - 0.6) + nz * cz > 0) out++;
        n++;
      }
      // la peinture unie compte aussi les parois des creux (optiques, prises d'air), tournées vers l'intérieur du creux
      const min = name === 'paint_plain' ? 0.8 : 0.9;
      assert.ok(out / n > min, `${name} : ${((out / n) * 100).toFixed(0)} % de faces vers l'extérieur`);
    }
  });

  test(`${kind} : le miroir double sommets et triangles, la caisse est symétrique`, () => {
    const parts = expand(M, 0);
    let tris = 0,
      zmin = 0,
      zmax = 0;
    for (const p of Object.values(parts)) {
      tris += p.index.length / 3;
      for (let i = 2; i < p.pos.length; i += 3) {
        zmin = Math.min(zmin, p.pos[i]);
        zmax = Math.max(zmax, p.pos[i]);
      }
      for (const i of p.index) assert.ok(i < p.pos.length / 3);
    }
    assert.equal(tris, (M.lods[0].index.length / 3) * 2);
    assert.ok(Math.abs(zmin + zmax) < 1e-6);
    assert.ok(parts.paint_side && parts.glass && parts.trim, 'peinture, vitrage et garnitures présents');
  });

  test(`${kind} : cotes cohérentes avec la physique (empattement) et la caisse couvre les roues`, () => {
    const spec = CAR_SPECS[kind];
    assert.ok(
      Math.abs(d.fa - d.ra - (spec.a + spec.b)) < 0.25,
      `empattement ${(d.fa - d.ra).toFixed(2)} contre ${(spec.a + spec.b).toFixed(2)}`,
    );
    const B = bodyLines(d);
    for (const wx of [d.fa, d.ra]) {
      const s = B.section(wx);
      assert.ok(s.wB > d.w / 2 - 0.05 && s.wB < d.w / 2 + 0.08, `demi-largeur aux roues ${s.wB}`);
      assert.ok(
        s.yBot > d.R * 2 + 0.03 && s.yBot < d.R * 2 + 0.12,
        `haut d'arche ${s.yBot} pour une roue de ${d.R * 2}`,
      );
    }
    assert.ok(B.surfY(0, 0) > 1.15 && B.surfY(0, 0) < 1.4, `toit ${B.surfY(0, 0)}`);
    assert.ok(B.surfY(d.fa, 0) < B.surfY(0, 0) - 0.25, 'capot nettement sous le toit');
  });

  test(`${kind} : la bande de roulement des pneus est visible aux deux niveaux de détail`, () => {
    for (const lod of [0, 1]) {
      const wheels = wheelGeos('six', d.R, d.rr, d.tw, lod, 0);
      const { position, normal } = wheels.tire.attributes;
      let treadVertices = 0;
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i),
          y = position.getY(i);
        if (Math.hypot(x, y) < d.R - 1e-6) continue;
        treadVertices++;
        assert.ok(x * normal.getX(i) + y * normal.getY(i) > 0, 'normale du pneu tournée vers le moyeu');
      }
      assert.ok(treadVertices > 0);
    }
  });

  test(`${kind} : le kit large écarte les ailes sans toucher au toit`, () => {
    const base = expand(M, 0).paint_side,
      wide = expand(M, 0, 0.1).paint_side;
    let dz = 0;
    for (let i = 2; i < base.pos.length; i += 3) dz = Math.max(dz, Math.abs(wide.pos[i]) - Math.abs(base.pos[i]));
    assert.ok(dz > 0.07 && dz < 0.13, `élargissement ${dz.toFixed(3)} m`);
    const top = expand(M, 0).glass,
      topW = expand(M, 0, 0.1).glass;
    let dy = 0;
    for (let i = 1; i < top.pos.length; i += 3) dy = Math.max(dy, Math.abs(topW.pos[i] - top.pos[i]));
    assert.ok(dy < 0.01, `vitrage déplacé de ${dy}`);
  });

  test(`${kind} : les pièces basses de l'atelier restent légères et suivent le kit large`, () => {
    const materials = {
      front_lip: 'carbon',
      front_aero: 'carbon',
      front_canards: 'carbon',
      front_winglets: 'carbon',
      skirt_painted: 'paint_plain',
      skirt_carbon: 'carbon',
      skirt_blade: 'carbon',
      diffuser_fins: 'carbon',
    };
    for (const [name, material] of Object.entries(materials)) {
      const part = expandPart(M, name)?.[material];
      assert.ok(part, `${name} absent ou sans matière ${material}`);
      assert.ok(part.index.length > 0 && part.index.length / 3 < 1000, `${name} dépasse son budget`);
      const wide = expandPart(M, name, 0.1)[material];
      let offset = 0;
      for (let i = 0; i < part.pos.length; i += 3) {
        const [x, y, z] = part.pos.subarray(i, i + 3);
        assert.ok(y > 0.12 && y < 0.55, `${name} à une hauteur de ${y} m`);
        if (name.startsWith('front')) assert.ok(x > d.fa, `${name} empiète sur l'arche avant`);
        if (name.startsWith('skirt')) assert.ok(x > d.ra + d.AR && x < d.fa - d.AR, `${name} empiète sur une arche`);
        if (name.startsWith('diffuser')) assert.ok(x < d.ra - d.AR, `${name} empiète sur l'arche arrière`);
        assert.equal(wide.pos[i], x);
        assert.equal(wide.pos[i + 1], y);
        offset = Math.max(offset, Math.abs(wide.pos[i + 2]) - Math.abs(z));
      }
      if (name.startsWith('skirt')) assert.ok(offset > 0.01 && offset < 0.04, `${name} décalée de ${offset} m`);
    }
    assert.ok(M.meta.parts.front_aero.size[0] > M.meta.parts.front_lip.size[0]);
  });

  test(`${kind} : les accessoires de toit et d'habitacle sont exportés avec les bonnes matières`, () => {
    const materials = {
      roof_scoop: ['paint_plain', 'trim'],
      roof_visor: ['trim'],
      roof_rack: ['belt', 'chrome', 'trim'],
      cage_cage: ['chrome', 'trim'],
      seat_stock: ['trim'],
      seat_bucket: ['seat', 'trim'],
      seat_harness: ['belt', 'chrome'],
    };
    for (const [name, expect] of Object.entries(materials)) {
      const blocks = expandPart(M, name);
      assert.ok(blocks, `${name} absent`);
      assert.deepEqual(Object.keys(blocks).sort(), expect);
      const tris = Object.values(blocks).reduce((sum, g) => sum + g.index.length / 3, 0);
      assert.ok(tris > 0 && tris <= 2200, `${name} : ${tris} triangles`);
      for (const g of Object.values(blocks)) {
        for (let i = 0; i < g.pos.length; i += 3) {
          const [x, y, z] = g.pos.subarray(i, i + 3);
          assert.ok(Math.abs(z) < d.w / 2 - 0.15, `${name} dépasse du toit ou de l’habitacle`);
          if (name.startsWith('roof_')) {
            assert.ok(x > d.roofEnd - 0.12 && x < d.ws1 + 0.2 && y > d.roof - 0.09 && y < d.roof + 0.29);
          } else {
            assert.ok(x > d.X0 + 0.4 && x < d.ws0 && y >= d.floor - 0.01 && y < d.roof);
          }
        }
      }
    }
  });

  test(`${kind} : ailerons et rétroviseurs de l'atelier présents, légers, à leur place`, () => {
    const wings = ['duck', 'gt', 'swan', d.wing].map((w) => 'wing_' + w);
    const mirrors = ['stock', 'aero', 'fender'].map((m) => 'mirror_' + m);
    for (const name of [...wings, ...mirrors]) {
      const blocks = expandPart(M, name);
      assert.ok(blocks, `${name} manquant`);
      let tris = 0,
        ymin = 9,
        ymax = 0,
        zmax = 0,
        xmin = 9,
        xmax = -9;
      for (const p of Object.values(blocks)) {
        tris += p.index.length / 3;
        for (let i = 0; i < p.pos.length; i += 3) {
          xmin = Math.min(xmin, p.pos[i]);
          xmax = Math.max(xmax, p.pos[i]);
          ymin = Math.min(ymin, p.pos[i + 1]);
          ymax = Math.max(ymax, p.pos[i + 1]);
          zmax = Math.max(zmax, Math.abs(p.pos[i + 2]));
        }
        for (let i = 0; i < p.nor.length; i += 3)
          assert.ok(Math.abs(Math.hypot(p.nor[i], p.nor[i + 1], p.nor[i + 2]) - 1) < 0.03);
      }
      assert.ok(tris > 50 && tris < 3500, `${name} : ${tris} triangles`);
      if (name.startsWith('wing_')) {
        // posé sur la caisse (pas dans le vide, pas enfoui), à l'arrière ou sur le toit, dans la largeur de la voiture
        assert.ok(ymin > 0.7 && ymin < B0.surfY((xmin + xmax) / 2, 0) + 0.25, `${name} : pied à ${ymin.toFixed(2)} m`);
        assert.ok(
          ymax < 1.5 && zmax <= d.w / 2 + 0.02,
          `${name} : haut ${ymax.toFixed(2)}, demi-envergure ${zmax.toFixed(2)}`,
        );
        assert.ok(xmax < 0, `${name} : derrière le milieu de la voiture`);
      } else {
        assert.ok(zmax > d.w / 2 - 0.2 && zmax < d.w / 2 + 0.2, `${name} : écartement ${zmax.toFixed(2)}`);
        assert.ok(
          ymin > 0.7 && ymax < 1.2 && xmin > 0,
          `${name} : hauteur ${ymin.toFixed(2)}–${ymax.toFixed(2)}, x ${xmin.toFixed(2)}`,
        );
      }
    }
    assert.equal(expandPart(M, 'wing_inconnu'), null);
    // phares escamotables relevés : seulement sur la voiture qui en a, posés sur le capot, optique vers l'avant
    const pop = expandPart(M, 'popup_up');
    assert.equal(!!pop, d.head === 'popup', 'popup_up');
    if (pop) {
      assert.ok(pop.head && pop.paint_plain, 'bloc peint et optique');
      let xmin = 9,
        ymin = 9;
      for (let i = 0; i < pop.head.pos.length; i += 3) {
        xmin = Math.min(xmin, pop.head.pos[i]);
        ymin = Math.min(ymin, pop.head.pos[i + 1]);
      }
      assert.ok(
        xmin > d.fa && ymin > B0.surfY(d.lamps[0][0], d.lamps[0][2]) - 0.02,
        `optique en x ${xmin.toFixed(2)}, y ${ymin.toFixed(2)}`,
      );
    }
  });
}
