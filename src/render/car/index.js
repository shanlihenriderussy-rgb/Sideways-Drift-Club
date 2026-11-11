// ===== Voitures : caisse modélisée dans Blender + pièces rapportées, livrée peinte, roues instanciées =====
// La caisse (tôle, vitrages, optiques, joints d'ouvrants, intérieur) vient de assets/models/<voiture>.bin, produit par
// tools/models/build_cars.py : cage de subdivision, occlusion ambiante par sommet, deux niveaux de détail, kit large.
// Les pièces de l'atelier (ailerons, lames, jupes, arceau, sièges…) sont posées ici sur les lignes de la caisse.
// Repère local : x = avant, y = haut, z = droite. Tout ce qui est fixe est fusionné par matière ; les 4 roues sont
// des InstancedMesh (un appel de dessin par matière pour les 4).
import hachiBin from '../../../assets/models/hachi.bin';
import koukiBin from '../../../assets/models/kouki.bin';
import raijinBin from '../../../assets/models/raijin.bin';
import { bake, isDarkHex, joinGeos, loft, quadGeo, tube } from '../geometry.js';
import { bodyLines, decodeModel, expand } from './format.js';
import { ATLAS, atlasUV, carbonTexture, glowTexture, paintLivery } from './livery.js';
import { wheelGeos } from './wheels.js';

const KIT_BULGE = { stock: 0, flares: 0.045, wide: 0.1 };
const SOURCES = { hachi: hachiBin, kouki: koukiBin, raijin: raijinBin };
const MODELS = {};
function modelOf(kind) {
  if (!MODELS[kind]) {
    const bin = atob(SOURCES[kind]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    MODELS[kind] = decodeModel(bytes);
  }
  return MODELS[kind];
}
// cotes d'une voiture (essieux, largeur, roues) : celles du fichier modèle
export const bodyDef = (kind) => modelOf(kind).meta;

// teintes des glaces (lumière du jour) : optique claire, clignotant
const DECO = { lens: [0.62, 0.66, 0.72], amber: [1.0, 0.42, 0.04] };
const AO_FLOOR = 0.32; // l'occlusion ne descend pas au noir : le sol renvoie toujours un peu de lumière

// Caisse du modèle → géométries par matière du jeu, avec les coordonnées de livrée et l'occlusion en couleur de sommet.
function bodyGeos(model, lodIndex, kit, X0, L, wT0) {
  const blocks = expand(model, lodIndex, kit);
  const out = new Map();
  const push = (key, g) => {
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(g);
  };
  for (const [name, b] of Object.entries(blocks)) {
    const n = b.pos.length / 3;
    const uv = new Float32Array(n * 2),
      col = new Float32Array(n * 3);
    const tint = DECO[name];
    for (let i = 0; i < n; i++) {
      const x = b.pos[i * 3],
        y = b.pos[i * 3 + 1],
        z = b.pos[i * 3 + 2];
      if (name === 'paint_side') {
        uv[i * 2] = (x - X0) / L;
        uv[i * 2 + 1] = z > 0 ? 0.7 + 0.3 * (1 - y) : 0.3 * y;
      } else if (name === 'paint_top') {
        uv[i * 2] = (x - X0) / L;
        uv[i * 2 + 1] = 0.5 + 0.2 * Math.max(-1, Math.min(1, z / wT0));
      } else {
        uv[i * 2] = ATLAS.plain[0];
        uv[i * 2 + 1] = ATLAS.plain[1];
      }
      const a = AO_FLOOR + (1 - AO_FLOOR) * b.ao[i];
      col[i * 3] = a * (tint ? tint[0] : 1);
      col[i * 3 + 1] = a * (tint ? tint[1] : 1);
      col[i * 3 + 2] = a * (tint ? tint[2] : 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(b.nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(b.index, 1));
    push(name.startsWith('paint') ? 'paint' : name === 'chrome' ? 'cage' : tint ? 'deco' : name, g);
  }
  return out;
}

let _carbonTex = null,
  _glowTex = null;

// look : { paint, accent, finish, livery, number, rimStyle, rim, front, wide, wing, hood, exhaust, cage, neon, tune, night, lod }
// lod : 1 = niveau fin (ta voiture), 0 = niveau léger (les autres, ou qualité basse)
export function buildCar(kind, look) {
  const model = modelOf(kind);
  const d = model.meta;
  const lod = look.lod == null ? 1 : look.lod;
  const root = new THREE.Group();
  root.rotation.order = 'YZX'; // cap, puis tangage, puis dévers (relief)
  const body = new THREE.Group();
  root.add(body);
  const disposables = [];
  const keep = (o) => {
    disposables.push(o);
    return o;
  };
  const { fa, ra, R, X0, X1, ws0, ws1, AR } = d;
  const L = X1 - X0,
    W = d.w / 2;
  const wide = KIT_BULGE[look.wide] || 0;
  const tune = look.tune || { height: 0.5, camber: 0.35, track: 0.5 };
  const { section, surfY } = bodyLines(d, wide);
  const wT0 = W - d.edgeIn;
  const floorY = d.floor;
  // extrémités réelles de la caisse (boucliers bombés) et sections de référence pour les pièces de bouclier
  const XF = d.noseX,
    XR = d.tailX;
  const sF = section(X1 - 0.08),
    sR = section(X0 + 0.08);

  const parts = bodyGeos(model, lod ? 0 : 1, wide, X0, L, wT0); // matière → géométries
  const add = (key, geo) => {
    if (!parts.has(key)) parts.set(key, []);
    parts.get(key).push(geo);
    return geo;
  };
  const plainUV = (g) => {
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, ATLAS.plain[0], ATLAS.plain[1]);
    return g;
  };

  // assombrit une pièce par sa couleur de sommet (dessous de caisse, passages de roue : presque pas de lumière)
  const shade = (g, k) => {
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(k), 3));
    return g;
  };

  // ---------- plancher et passages de roue (sombres) ----------
  {
    // plancher en retrait des bords : la caisse est ouverte dessous, il ne doit pas dépasser des boucliers
    const g = new THREE.PlaneGeometry(L - 0.7, W * 2 - 0.5);
    g.rotateX(Math.PI / 2);
    add('trim', shade(bake(g, (X0 + X1) / 2, d.sill + 0.04, 0), 0.25));
  }
  for (const wx of [fa, ra]) {
    const g = new THREE.CylinderGeometry(
      AR + 0.01,
      AR + 0.01,
      section(wx).wB * 2 - 0.1,
      lod ? 20 : 12,
      1,
      true,
      Math.PI / 2,
      Math.PI,
    );
    add('trim', shade(bake(g.rotateX(Math.PI / 2), wx, R, 0), 0.35));
  }

  // ---------- intérieur : baquets, tableau de bord, volant à droite (JDM) ----------
  if (lod) {
    const race = look.seat === 'bucket' || look.seat === 'harness';
    const sm = race ? 'seat' : 'trim';
    for (const sz of [-1, 1]) {
      const z = sz * 0.36,
        x = ws0 - 1.0;
      add(sm, bake(new THREE.BoxGeometry(0.46, 0.1, 0.44), x, floorY + 0.12, z));
      if (race) {
        // baquet enveloppant : dossier haut, joues latérales, passages de harnais
        add(sm, bake(new THREE.BoxGeometry(0.08, 0.78, 0.44), x - 0.27, floorY + 0.52, z, 0, 0, 0.18));
        for (const k of [-1, 1])
          add(sm, bake(new THREE.BoxGeometry(0.3, 0.42, 0.05), x - 0.17, floorY + 0.42, z + k * 0.22, 0, 0, 0.18));
        if (look.seat === 'harness')
          for (const k of [-1, 1])
            add('tow', bake(new THREE.BoxGeometry(0.02, 0.62, 0.05), x - 0.2, floorY + 0.5, z + k * 0.1, 0, 0, 0.32));
      } else add(sm, bake(new THREE.BoxGeometry(0.1, 0.62, 0.46), x - 0.26, floorY + 0.45, z, 0, 0, 0.22));
    }
    add('trim', bake(new THREE.BoxGeometry(0.34, 0.16, (wT0 - 0.1) * 2), ws0 - 0.2, d.cowl - 0.12, 0));
    if (look.wheelS === 'deep') {
      // volant deep dish : jante épaisse, branches creusées, repère jaune à midi
      add(
        'trim',
        bake(new THREE.TorusGeometry(0.17, 0.03, 8, 20), ws0 - 0.52, d.cowl - 0.05, 0.36, 0, Math.PI / 2 - 0.35, 0),
      );
      add(
        'trim',
        bake(new THREE.ConeGeometry(0.15, 0.1, 10, 1, true), ws0 - 0.47, d.cowl - 0.07, 0.36, 0, 0, Math.PI / 2 + 0.35),
      );
      add(
        'tow',
        bake(
          new THREE.BoxGeometry(0.03, 0.06, 0.035),
          ws0 - 0.52 - Math.sin(0.35) * 0.0,
          d.cowl + 0.12,
          0.36,
          0,
          0,
          -0.35,
        ),
      );
    } else
      add(
        'trim',
        bake(new THREE.TorusGeometry(0.16, 0.022, 6, 16), ws0 - 0.48, d.cowl - 0.06, 0.36, 0, Math.PI / 2 - 0.35, 0),
      );
  }
  // arceau
  if (look.cage === 'cage') {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const hx = ws0 - 1.42,
      top = d.roof - 0.07,
      zc = wT0 - 0.2,
      ax = ws1 - 0.05;
    const tubes = [
      [V(hx, floorY, -zc), V(hx, top, -zc)],
      [V(hx, floorY, zc), V(hx, top, zc)],
      [V(hx, top, -zc), V(hx, top, zc)],
      [V(hx, floorY, -zc), V(hx, top, zc)],
      [V(hx, top, -zc), V(ax, top, -zc + 0.08)],
      [V(hx, top, zc), V(ax, top, zc - 0.08)],
      [V(ax, top, -zc + 0.08), V(ws0 - 0.2, d.cowl - 0.05, -zc - 0.02)],
      [V(ax, top, zc - 0.08), V(ws0 - 0.2, d.cowl - 0.05, zc + 0.02)],
      [V(hx, floorY + 0.1, -zc - 0.03), V(ws0 - 0.25, d.cowl - 0.2, -zc - 0.03)],
      [V(hx, floorY + 0.1, zc + 0.03), V(ws0 - 0.25, d.cowl - 0.2, zc + 0.03)],
      [V(hx, top, -zc), V(hx - 0.55, floorY + 0.15, -zc + 0.05)],
      [V(hx, top, zc), V(hx - 0.55, floorY + 0.15, zc - 0.05)],
    ];
    for (const [a, b] of tubes) add('cage', tube(a, b, 0.022, 6));
  }

  // ---------- rétroviseurs : coque profilée sur un pied, au coin de la vitre de porte ----------
  for (const sz of [-1, 1]) {
    const shell = (rx, ry, rz) => {
      const g = new THREE.SphereGeometry(1, lod ? 14 : 8, lod ? 10 : 6);
      g.scale(rx, ry, rz);
      return g;
    };
    if (look.mirror === 'fender') {
      // rétros d'aile JDM : petit miroir noir sur tige fine, au-dessus de la roue avant
      const x = fa + 0.18,
        z = sz * (section(x).wT - 0.04),
        y = surfY(x, z);
      add('trim', bake(new THREE.CylinderGeometry(0.007, 0.01, 0.15, 6), x, y + 0.07, z, 0, 0, -0.2));
      add('trim', bake(shell(0.035, 0.034, 0.05), x - 0.015, y + 0.165, z));
      continue;
    }
    const x = ws0 - 0.2,
      s = section(x),
      zf = s.wB - 0.085; // pied de vitre
    if (look.mirror === 'aero') {
      // rétro aéro : goutte de carbone sur un bras fin
      add('carbon', bake(shell(0.085, 0.036, 0.05), x - 0.03, s.yS + 0.1, sz * (zf + 0.15), 0, sz * 0.12, 0));
      add('trim', bake(new THREE.BoxGeometry(0.05, 0.012, 0.13), x, s.yS + 0.085, sz * (zf + 0.07), sz * 0.25, 0, 0));
    } else {
      add(
        'paint',
        plainUV(bake(shell(0.07, 0.048, 0.062), x - 0.02, s.yS + 0.085, sz * (zf + 0.105), 0, sz * 0.15, 0)),
      );
      add('trim', bake(new THREE.BoxGeometry(0.05, 0.03, 0.07), x + 0.005, s.yS + 0.05, sz * (zf + 0.045)));
    }
  }

  // ---------- phares : position des faisceaux ; blocs escamotables relevés la nuit ----------
  const headLamps = [];
  for (const [x, y, z] of d.lamps) for (const sz of [1, -1]) headLamps.push({ x, y, z: sz * z });
  if (d.head === 'popup' && look.night) {
    for (const h of headLamps) {
      const y = surfY(h.x, h.z);
      add('paint', plainUV(bake(new THREE.BoxGeometry(0.3, 0.15, 0.4), h.x, y + 0.04, h.z)));
      add('head', bake(new THREE.BoxGeometry(0.02, 0.11, 0.32), h.x + 0.155, y + 0.045, h.z));
    }
  }
  if (look.front === 'canard') {
    // canards : deux ailettes carbone par coin de bouclier, sous les phares, inclinées vers l'avant
    for (const sz of [-1, 1])
      for (const [dy, dx] of [
        [0.05, 0.1],
        [0.12, 0.16],
      ]) {
        const x = X1 - dx,
          s = section(x);
        add(
          'carbon',
          bake(new THREE.BoxGeometry(0.15, 0.01, 0.09), x, s.yBot + dy, sz * (s.wB + 0.02), 0, sz * 0.35, -0.22),
        );
      }
  }
  if (look.front === 'lip' || look.front === 'aero' || look.front === 'canard') {
    const depth = look.front === 'aero' ? 0.32 : 0.22;
    add(
      'carbon',
      bake(new THREE.BoxGeometry(depth, 0.025, sF.wL * 2 * 0.98), XF - depth / 2 + 0.05, sF.yBot - 0.025, 0),
    );
  }
  if (look.front === 'aero') {
    for (const sz of [-1, 1]) {
      add(
        'carbon',
        bake(new THREE.BoxGeometry(0.2, 0.012, 0.12), XF - 0.1, sF.yBot + 0.09, sz * (sF.wB - 0.02), 0, 0, 0.2),
      );
      const s = section((fa + ra) / 2);
      add(
        'carbon',
        bake(
          new THREE.BoxGeometry(fa - ra - AR * 2 - 0.1, 0.05, 0.07),
          (fa + ra) / 2,
          d.sill - 0.01,
          sz * (s.wL + 0.01),
        ),
      );
    }
  }

  // jupes latérales entre les passages de roue
  if (look.skirt === 'skirt' || look.skirt === 'carbon') {
    const x0 = ra + AR + 0.04,
      x1 = fa - AR - 0.04,
      xm = (x0 + x1) / 2;
    for (const sz of [-1, 1]) {
      const s = section(xm);
      const g = new THREE.BoxGeometry(x1 - x0, 0.09, 0.06);
      add(
        look.skirt === 'carbon' ? 'carbon' : 'paint',
        look.skirt === 'carbon'
          ? bake(g, xm, d.sill - 0.005, sz * (s.wL + 0.015))
          : plainUV(bake(g, xm, d.sill - 0.005, sz * (s.wL + 0.015))),
      );
      add('trim', bake(new THREE.BoxGeometry(x1 - x0, 0.012, 0.08), xm, d.sill - 0.05, sz * (s.wL + 0.02)));
    }
  }

  // ---------- capot ----------
  if (look.hood === 'carbon') {
    // peau de carbone posée sur le capot, entre les joints (pied de pare-brise, arêtes d'aile, avant)
    const hx = [];
    for (let x = ws0 + 0.1; x <= X1 - 0.33; x += 0.07) hx.push(x);
    const hr = hx.map((x) => {
      const s = section(x);
      return [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9].map((k) => {
        const z = k * (s.wT - 0.02);
        return [x, surfY(x, z) + 0.007, z, x * 4, z * 4];
      });
    });
    for (const [, g] of loft(hr, () => 'carbon')) add('carbon', g);
  } else if (look.hood === 'vent') {
    for (const sz of [-1, 1])
      for (let k = 0; k < 5; k++) {
        const x = ws0 + 0.24 + k * 0.06,
          z = sz * section(x).wT * 0.45;
        add('trim', bake(new THREE.BoxGeometry(0.03, 0.022, 0.26), x, surfY(x, z) + 0.004, z, 0, 0, -0.5));
      }
  }

  // ---------- arrière : plaque, diffuseur ----------
  const plateY = d.plate[1];
  add(
    'paint',
    quadGeo(
      [XR - 0.006, plateY - 0.065, -0.2],
      [XR - 0.006, plateY - 0.065, 0.2],
      [XR - 0.006, plateY + 0.065, 0.2],
      [XR - 0.006, plateY + 0.065, -0.2],
      atlasUV(ATLAS.plate),
    ),
  );
  if (look.diffuser === 'fins') {
    // diffuseur carbone relevé vers l'arrière, ailettes hautes
    add('carbon', bake(new THREE.BoxGeometry(0.5, 0.02, sR.wL * 1.75), XR + 0.22, sR.yBot - 0.03, 0, 0, 0, -0.16));
    for (let k = -3; k <= 3; k++)
      add('carbon', bake(new THREE.BoxGeometry(0.48, 0.13, 0.014), XR + 0.22, sR.yBot - 0.07, k * 0.13, 0, 0, -0.16));
  }
  // sangles de remorquage rouges (avant droit, arrière gauche)
  if (look.tow === 'tow') {
    const strap = (x, y, z, rz) => {
      const g = new THREE.TorusGeometry(0.07, 0.012, 4, 14, Math.PI * 1.2);
      g.scale(1, 1, 2.2);
      add('tow', bake(g, x, y, z, Math.PI / 2, 0, rz));
    };
    strap(XF + 0.03, sF.yBot + 0.02, sF.wB * 0.45, Math.PI);
    strap(XR - 0.03, sR.yBot + 0.02, -sR.wB * 0.42, 0);
  }

  // ---------- échappement + flammes ----------
  const flameM = keep(
    new THREE.MeshBasicMaterial({
      color: 0xffa040,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const flame = new THREE.Group();
  flame.visible = false;
  const flameGeo = keep(new THREE.ConeGeometry(0.1, 0.55, 8));
  const tips = [];
  if (look.exhaust === 'side') {
    tips.push({ p: [ra + AR + 0.18, d.sill + 0.04, -(section(ra + AR + 0.18).wL + 0.02)], dir: [0, 0, -1] });
  } else if (look.exhaust === 'twin') {
    for (const sz of [-1, 1])
      tips.push({ p: [XR + 0.06, sR.yBot + 0.04, sz * sR.wB * 0.62], dir: [-1, 0, 0], r: 0.058 });
  } else tips.push({ p: [XR + 0.06, sR.yBot + 0.04, -sR.wB * 0.55], dir: [-1, 0, 0], r: 0.05 });
  for (const t of tips) {
    const [x, y, z] = t.p,
      side = t.dir[2] !== 0;
    const r = t.r || 0.055;
    add(
      'cage',
      bake(
        new THREE.CylinderGeometry(r, r, 0.22, 12, 1, true),
        x,
        y,
        z,
        side ? Math.PI / 2 : 0,
        0,
        side ? 0 : Math.PI / 2,
      ),
    );
    add(
      'trim',
      bake(
        new THREE.CircleGeometry(r * 0.8, 10),
        x + t.dir[0] * 0.09,
        y,
        z + t.dir[2] * 0.09,
        0,
        side ? Math.PI : -Math.PI / 2,
        0,
      ),
    );
    const f = new THREE.Mesh(flameGeo, flameM);
    if (side) f.rotation.x = -Math.PI / 2;
    else f.rotation.z = Math.PI / 2;
    f.position.set(x + t.dir[0] * 0.37, y, z + t.dir[2] * 0.37);
    flame.add(f);
  }
  body.add(flame);

  // ---------- toit : écope, pare-soleil, galerie ----------
  {
    const xr = (ws1 + d.roofEnd) / 2,
      yr = surfY(xr, 0);
    if (look.roof === 'scoop') {
      const sh = new THREE.Shape();
      sh.moveTo(0.36, 0);
      sh.lineTo(-0.1, 0);
      sh.lineTo(-0.1, 0.07);
      sh.lineTo(0.02, 0.075);
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false });
      add('paint', plainUV(g.translate(ws1 - 0.32, surfY(ws1 - 0.1, 0) - 0.01, -0.15)));
      add(
        'trim',
        bake(new THREE.BoxGeometry(0.01, 0.055, 0.26), ws1 + 0.04 - 0.32 + 0.08, surfY(ws1 - 0.1, 0) + 0.03, 0),
      );
    } else if (look.roof === 'visor') {
      const x = ws1 + 0.06,
        s = section(x);
      add(
        'trim',
        bake(new THREE.BoxGeometry(0.2, 0.012, (s.wT - d.tumble) * 1.9), x + 0.05, surfY(x, 0) + 0.004, 0, 0, 0, -0.32),
      );
    } else if (look.roof === 'rack') {
      // galerie tubulaire et pneu de rechange couché (assistance de drift)
      const zr = (section(xr).wT - d.tumble) * 0.82,
        len = (ws1 - d.roofEnd) * 0.85;
      for (const sz of [-1, 1]) {
        add('cage', bake(new THREE.BoxGeometry(len, 0.025, 0.025), xr, yr + 0.07, sz * zr));
        for (const k of [-1, 1])
          add('trim', bake(new THREE.BoxGeometry(0.04, 0.07, 0.04), xr + k * len * 0.42, yr + 0.035, sz * zr));
      }
      for (const k of [-1, 1])
        add('cage', bake(new THREE.BoxGeometry(0.025, 0.025, zr * 2), xr + k * len * 0.3, yr + 0.085, 0));
      const tire = new THREE.TorusGeometry(0.24, 0.09, 8, 18);
      tire.rotateX(Math.PI / 2);
      add('trim', bake(tire, xr, yr + 0.18, 0));
    }
  }

  // ---------- aileron ----------
  const wing = look.wing === 'stock' || !look.wing ? d.wing : look.wing;
  const deckAt = (x) => surfY(x, 0);
  if (wing === 'lip') {
    const s = section(d.roofEnd);
    add(
      'paint',
      bake(new THREE.BoxGeometry(0.24, 0.035, (s.wT - d.tumble) * 2), d.roofEnd - 0.06, d.roof + 0.0, 0, 0, 0, -0.18),
    );
  } else if (wing === 'duck') {
    const x = X0 + 0.16,
      s = section(x);
    const sh = new THREE.Shape();
    sh.moveTo(0.18, 0);
    sh.lineTo(-0.16, 0);
    sh.lineTo(-0.2, 0.09);
    sh.lineTo(-0.12, 0.08);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: s.wT * 1.9, bevelEnabled: false });
    add('paint', g.translate(x, deckAt(x) - 0.01, -s.wT * 0.95));
  } else if (wing === 'gt' || wing === 'hoop' || wing === 'swan') {
    const swan = wing === 'swan',
      hoop = wing === 'hoop';
    const chord = swan ? 0.36 : 0.32,
      aoa = -0.12; // incidence : bord de fuite relevé (appui)
    const x = X0 + (swan ? 0.22 : 0.3),
      y = d.deck + (swan ? 0.36 : hoop ? 0.24 : 0.3);
    const span = hoop ? W * 2 - 0.08 : W * 2 - (swan ? 0.04 : 0.25);
    const bladeMat = hoop ? 'paint' : swan ? 'carbon' : 'trim';
    const put = (g) => (bladeMat === 'paint' ? plainUV(g) : g);
    // profil d'aile inversé : extrados plat en haut, ventre bombé en dessous ; bord d'attaque vers l'avant (+x)
    const foil = (c, t) => {
      const sh = new THREE.Shape();
      sh.moveTo(c / 2, 0);
      for (let i = 1; i <= 12; i++) {
        const u = i / 12;
        sh.lineTo(c / 2 - u * c, 0.004 * Math.sin(Math.PI * u));
      }
      for (let i = 11; i >= 1; i--) {
        const u = i / 12;
        sh.lineTo(c / 2 - u * c, -t * Math.sin(Math.PI * Math.pow(u, 0.6)));
      }
      sh.closePath();
      return new THREE.ExtrudeGeometry(sh, { depth: span, bevelEnabled: false, curveSegments: 4 }).translate(
        0,
        0,
        -span / 2,
      );
    };
    add(bladeMat, put(bake(foil(chord, 0.035), x, y, 0, 0, 0, aoa)));
    // volet (deuxième élément) au-dessus du bord de fuite, plus incliné
    const fx = x - chord / 2 + 0.03,
      fy = y + 0.055;
    add(bladeMat, put(bake(foil(0.13, 0.016), fx, fy, 0, 0, 0, -0.55)));
    // dérives : plaques fines qui ferment les extrémités de la lame et du volet
    const ep = new THREE.Shape();
    ep.moveTo(chord / 2 + 0.02, -0.045);
    ep.lineTo(-chord / 2 - 0.02, -0.06);
    ep.lineTo(-chord / 2 - 0.04, 0.1);
    ep.lineTo(-chord / 2 + 0.08, 0.1);
    ep.lineTo(chord / 2 + 0.03, 0.012);
    ep.closePath();
    const epMat = hoop ? 'paint' : swan ? 'carbon' : 'trim';
    for (const sz of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(ep, { depth: 0.012, bevelEnabled: false }).translate(
        0,
        0,
        sz > 0 ? 0 : -0.012,
      );
      add(epMat, epMat === 'paint' ? plainUV(bake(g, x, y, (sz * span) / 2)) : bake(g, x, y, (sz * span) / 2));
    }
    for (const sz of [-1, 1]) {
      const zs = sz * (span / 2 - (hoop ? 0.02 : swan ? 0.24 : 0.2));
      if (swan) {
        // col de cygne : plaque qui part du coffre devant la lame, monte au-dessus et redescend
        // s'accrocher sur l'extrados (la lame pend sous ses supports)
        const xb = x + 0.26,
          yb = surfY(xb, zs) - 0.01;
        const P0 = [xb, yb],
          P1 = [xb + 0.02, y + 0.16],
          P2 = [x + 0.14, y + 0.2],
          P3 = [x - 0.02, y + 0.012];
        const bez = (t) => {
          const u = 1 - t;
          return [0, 1].map(
            (k) => u * u * u * P0[k] + 3 * u * u * t * P1[k] + 3 * u * t * t * P2[k] + t * t * t * P3[k],
          );
        };
        const L = [],
          Rr = [],
          n = 14;
        for (let i = 0; i <= n; i++) {
          const t = i / n,
            p = bez(t),
            q = bez(Math.min(1, t + 0.01)),
            o = bez(Math.max(0, t - 0.01));
          let tx = q[0] - o[0],
            ty = q[1] - o[1];
          const l = Math.hypot(tx, ty) || 1;
          tx /= l;
          ty /= l;
          const w = 0.026 + 0.022 * (1 - t) * (1 - t); // plus large au pied
          L.push([p[0] - ty * w, p[1] + tx * w]);
          Rr.push([p[0] + ty * w, p[1] - tx * w]);
        }
        const sh = new THREE.Shape();
        sh.moveTo(...L[0]);
        for (const q of L.slice(1)) sh.lineTo(...q);
        for (const q of Rr.reverse()) sh.lineTo(...q);
        sh.closePath();
        add(
          'carbon',
          new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: false, curveSegments: 2 }).translate(
            0,
            0,
            zs - 0.008,
          ),
        );
        // platine de fixation sur le coffre
        add('trim', bake(new THREE.BoxGeometry(0.12, 0.012, 0.06), xb, yb + 0.006, zs));
      } else {
        const base = surfY(x + 0.02, zs) - 0.01;
        add(
          bladeMat,
          put(bake(new THREE.BoxGeometry(0.12, y - base, 0.035), x + 0.02, (y + base) / 2, zs, 0, 0, hoop ? -0.15 : 0)),
        );
      }
    }
  }

  // bavettes derrière chaque roue
  if (look.flaps === 'flaps') {
    for (const wx of [fa, ra])
      for (const sz of [-1, 1]) {
        const s = section(wx);
        const z = sz * (s.wB - d.tw / 2 - 0.01),
          x = wx - AR + 0.02;
        add('trim', bake(new THREE.BoxGeometry(0.012, R * 0.95, d.tw + 0.02), x, R * 0.5 + 0.02, z));
        add('tow', bake(new THREE.BoxGeometry(0.014, 0.05, d.tw + 0.02), x, R * 0.9, z));
      }
  }

  // ---------- matériaux ----------
  const FIN = {
    gloss: [0.25, 0.28, 1.0],
    metal: [0.6, 0.3, 1.2],
    matte: [0.05, 0.78, 0.45],
    pearl: [0.45, 0.18, 1.4],
    chrome: [1.0, 0.07, 1.7],
  };
  const [met, rough, envI] = FIN[look.finish] || FIN.gloss;
  const liv = keep(paintLivery(look, d, X0, L, wT0));
  // peinture : vernis (clearcoat) sur le niveau fin ; l'occlusion ambiante cuite dans Blender module la couleur par sommet
  const coat = lod && look.finish !== 'matte';
  const paintOpts = { map: liv, metalness: met, roughness: rough, envMapIntensity: envI, vertexColors: true };
  const mats = {
    paint: keep(
      coat
        ? new THREE.MeshPhysicalMaterial({
            ...paintOpts,
            clearcoat: 1,
            clearcoatRoughness: look.finish === 'chrome' ? 0.02 : 0.06,
          })
        : new THREE.MeshStandardMaterial(paintOpts),
    ),
    glass: keep(
      new THREE.MeshStandardMaterial({
        color: look.tint === 'dark' ? 0x020305 : 0x0b1018,
        metalness: 0.85,
        roughness: 0.06,
        transparent: true,
        opacity: look.tint === 'dark' ? 0.97 : look.tint === 'smoke' ? 0.92 : 0.84,
        envMapIntensity: 1.3,
      }),
    ),
    trim: keep(
      new THREE.MeshStandardMaterial({
        color: 0x101012,
        metalness: 0.1,
        roughness: 0.62,
        envMapIntensity: 0.5,
        side: THREE.DoubleSide,
        vertexColors: true,
      }),
    ),
    cage: keep(new THREE.MeshStandardMaterial({ color: 0xd6dadf, metalness: 0.95, roughness: 0.16 })),
    // glaces d'optiques et clignotants : une seule matière brillante, teintée par sommet
    deco: keep(
      new THREE.MeshStandardMaterial({ metalness: 0.3, roughness: 0.12, envMapIntensity: 1.4, vertexColors: true }),
    ),
    // phares : réflecteur chromé sous glace le jour, allumé la nuit
    head: keep(
      new THREE.MeshStandardMaterial({
        color: look.lights === 'yellow' ? 0xe8d9a8 : 0xdfe6f0,
        emissive: look.lights === 'yellow' ? 0xffb020 : 0xfff3d0,
        emissiveIntensity: look.night ? 2.4 : 0.06,
        roughness: 0.08,
        metalness: 0.95,
        envMapIntensity: 1.5,
      }),
    ),
    tow: keep(new THREE.MeshStandardMaterial({ color: 0x7c0810, roughness: 0.85, metalness: 0, envMapIntensity: 0.1 })), // rouge sangle : sombre, sinon le ciel le rend rose
    seat: keep(new THREE.MeshStandardMaterial({ color: 0xb81f2a, roughness: 0.92, metalness: 0 })),
    tail: keep(
      new THREE.MeshStandardMaterial({
        color: 0xa30b14,
        emissive: 0xff1a1a,
        emissiveIntensity: 0.55,
        roughness: 0.2,
        metalness: 0.1,
      }),
    ),
  };
  if (parts.has('carbon')) {
    if (!_carbonTex) _carbonTex = carbonTexture();
    mats.carbon = keep(
      new THREE.MeshStandardMaterial({ map: _carbonTex, metalness: 0.35, roughness: 0.32, envMapIntensity: 1.1 }),
    );
  }
  for (const [k, list] of parts) {
    const m = new THREE.Mesh(keep(joinGeos(list)), mats[k]);
    m.castShadow = k !== 'glass';
    if (k === 'glass') m.renderOrder = 3;
    body.add(m);
  }

  // ---------- roues : InstancedMesh (pneu, jante, fût, disque, étrier) ----------
  const kit = look.brakes | 0;
  const wg = wheelGeos(look.rimStyle || 'six', R, d.rr, d.tw, lod, kit);
  const wMats = {
    tire: keep(new THREE.MeshStandardMaterial({ color: 0x19191b, roughness: 0.92, metalness: 0 })),
    rim: keep(new THREE.MeshStandardMaterial({ color: look.rim, metalness: 0.8, roughness: 0.26 })),
    dark: mats.trim,
    // disques : rougeoient quand ils chauffent (state.brakeTemp)
    disc: keep(
      new THREE.MeshStandardMaterial({
        color: kit ? 0x8a8b90 : 0x77787d,
        metalness: 0.8,
        roughness: kit ? 0.35 : 0.45,
        emissive: 0xff4a10,
        emissiveIntensity: 0,
      }),
    ),
    caliper: keep(
      new THREE.MeshStandardMaterial({
        color: kit ? 0xf2b51d : isDarkHex(look.accent) ? 0xd8262d : look.accent,
        metalness: 0.3,
        roughness: 0.4,
      }),
    ),
  };
  const inst = {};
  for (const k of ['tire', 'rim', 'dark', 'disc', 'caliper']) {
    const m = new THREE.InstancedMesh(keep(wg[k]), wMats[k], 4);
    m.frustumCulled = false;
    m.castShadow = k === 'tire';
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(m);
    inst[k] = m;
  }
  const camb = 0.02 + tune.camber * 0.2;
  const trackOff = (tune.track - 1) * 0.08;
  const wheels = [];
  for (const [x, side, front] of [
    [fa, 1, true],
    [fa, -1, true],
    [ra, 1, false],
    [ra, -1, false],
  ]) {
    const s = section(x);
    const pivot = new THREE.Object3D();
    pivot.position.set(x, R, side * (s.wB - d.tw / 2 - 0.012 + trackOff));
    const cam = new THREE.Object3D();
    cam.rotation.x = -side * camb * (front ? 0.55 : 1);
    const flip = new THREE.Object3D();
    flip.rotation.y = side < 0 ? Math.PI : 0;
    const spin = new THREE.Object3D();
    const cal = new THREE.Matrix4().makeRotationZ(side > 0 ? 0 : Math.PI - 2 * wg.caliperAngle);
    wheels.push({ pivot, cam, flip, spin, cal, front, side });
  }
  const mA = new THREE.Matrix4(),
    mB = new THREE.Matrix4();
  const writeWheels = () => {
    wheels.forEach((w, i) => {
      w.pivot.updateMatrix();
      w.cam.updateMatrix();
      w.flip.updateMatrix();
      w.spin.updateMatrix();
      mA.multiplyMatrices(w.pivot.matrix, w.cam.matrix).multiply(w.flip.matrix);
      mB.multiplyMatrices(mA, w.cal);
      inst.caliper.setMatrixAt(i, mB);
      mA.multiply(w.spin.matrix);
      inst.tire.setMatrixAt(i, mA);
      inst.rim.setMatrixAt(i, mA);
      inst.dark.setMatrixAt(i, mA);
      inst.disc.setMatrixAt(i, mA);
    });
    for (const k in inst) inst[k].instanceMatrix.needsUpdate = true;
  };
  writeWheels();

  // ---------- ombre douce + néon ----------
  if (!_glowTex) _glowTex = glowTexture();
  const blobTex = _glowTex;
  const blob = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(L + 1.2, W * 2 + 0.9)),
    keep(
      new THREE.MeshBasicMaterial({
        map: blobTex,
        color: 0x000000,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      }),
    ),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.set((X0 + X1) / 2, 0.035, 0);
  blob.renderOrder = 1;
  root.add(blob);
  if (look.neon != null) {
    const neon = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(L + 1.6, W * 2 + 1.6)),
      keep(
        new THREE.MeshBasicMaterial({
          map: blobTex,
          color: look.neon,
          transparent: true,
          opacity: look.night ? 0.95 : 0.45,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    );
    neon.rotation.x = -Math.PI / 2;
    neon.position.set((X0 + X1) / 2, 0.04, 0);
    neon.renderOrder = 2;
    root.add(neon);
  }

  const rideY = (tune.height - 0.5) * 0.12;
  return {
    root,
    body,
    wheels,
    flame,
    tailM: mats.tail,
    headM: mats.head,
    paint: mats.paint,
    rearX: ra,
    frontX: fa,
    halfW: W,
    length: L,
    headLamps,
    exhaust: new THREE.Vector3(tips[0].p[0], tips[0].p[1], tips[0].p[2]),
    ground: null, // hauteur du sol (x, z) → m ; posée par le jeu (relief)
    update(state, dt, braking) {
      // relief : la caisse se pose sur 4 points du sol (tangage et dévers suivent la pente)
      let y = 0,
        pitchG = 0,
        rollG = 0;
      const H = this.ground;
      if (H) {
        const c = Math.cos(state.heading),
          s = Math.sin(state.heading),
          hl = (fa - ra) / 2,
          hw = W * 0.9;
        const xm = state.x + (c * (fa + ra)) / 2,
          zm = state.z + (s * (fa + ra)) / 2;
        const f = H(xm + c * hl, zm + s * hl),
          r = H(xm - c * hl, zm - s * hl),
          rt = H(xm - s * hw, zm + c * hw),
          lt = H(xm + s * hw, zm - c * hw);
        y = (f + r + rt + lt) / 4;
        pitchG = Math.atan2(f - r, hl * 2);
        rollG = -Math.atan2(rt - lt, hw * 2);
      }
      root.position.set(state.x, y, state.z);
      root.rotation.set(rollG, -state.heading, pitchG);
      body.rotation.set(state.rollAngle * 0.9, 0, state.pitchAngle);
      body.position.y = rideY + Math.abs(state.rollAngle) * 0.1;
      for (const w of wheels) {
        w.spin.rotation.z = w.side > 0 ? -state.wheelRot : state.wheelRot;
        if (w.front) w.pivot.rotation.y = -state.steerAngle;
      }
      writeWheels();
      const heat = state.brakeTemp || 0;
      wMats.disc.emissiveIntensity = heat > 0.25 ? (heat - 0.25) * (heat - 0.25) * 4 : 0;
      mats.tail.emissiveIntensity = braking ? 3.2 : 0.55;
    },
    flicker() {
      for (const f of flame.children) f.scale.set(1, 0.7 + Math.random() * 0.8, 1);
    },
    dispose() {
      root.parent && root.parent.remove(root);
      for (const o of disposables) o.dispose && o.dispose();
    },
  };
}
