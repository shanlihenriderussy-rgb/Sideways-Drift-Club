// ---------- vie de l'île : circulation instanciée, habitants, radars, zones, étiquettes (navigateur seulement) ----------
// circulation : 3 maillages instanciés par modèle (carrosserie peinte, parties sombres, feux) → ~15 appels de dessin pour tout le trafic
import { IsleLife } from './life.js';
import { mergeGeos } from '../render/geometry.js';
import { canvasTex } from '../render/world.js';

export function createTrafficLayer(group, agents, ground) {
  const box = (w, h, d, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  };
  const wheel = (x, z, r) => {
    const g = new THREE.CylinderGeometry(r, r, 0.24, 10);
    g.rotateX(Math.PI / 2);
    g.translate(x, r, z);
    return g;
  };
  // modèles : +x vers l'avant, longueur L, largeur W, hauteur H
  const shapes = {
    kei: (L, W, H) => ({
      paint: [box(L, 0.78, W, 0, 0.62, 0), box(L * 0.62, 0.58, W * 0.94, -L * 0.06, 1.3, 0)],
      dark: [
        box(L * 0.64, 0.36, W * 0.96, -L * 0.06, 1.3, 0),
        box(0.2, 0.25, W, L / 2, 0.42, 0),
        box(0.2, 0.25, W, -L / 2, 0.42, 0),
      ],
    }),
    sedan: (L, W, H) => ({
      paint: [box(L, 0.66, W, 0, 0.6, 0), box(L * 0.48, 0.5, W * 0.92, -L * 0.05, 1.17, 0)],
      dark: [
        box(L * 0.5, 0.34, W * 0.94, -L * 0.05, 1.16, 0),
        box(0.2, 0.22, W, L / 2, 0.42, 0),
        box(0.2, 0.22, W, -L / 2, 0.42, 0),
      ],
    }),
    van: (L, W, H) => ({
      paint: [box(L, H - 0.35, W, 0, 0.35 + (H - 0.35) / 2, 0)],
      dark: [
        box(L * 0.22, 0.5, W * 1.01, L * 0.36, H - 0.62, 0),
        box(L * 0.7, 0.4, W * 1.01, -L * 0.12, H - 0.62, 0),
        box(0.2, 0.25, W, L / 2, 0.42, 0),
      ],
    }),
    truck: (L, W, H) => ({
      paint: [
        box(L * 0.36, H - 0.35, W, L * 0.32, 0.35 + (H - 0.35) / 2, 0),
        box(L * 0.62, 0.3, W, -L * 0.18, 0.75, 0),
        box(L * 0.62, 0.4, 0.08, -L * 0.18, 1.1, W / 2),
        box(L * 0.62, 0.4, 0.08, -L * 0.18, 1.1, -W / 2),
        box(0.08, 0.4, W, -L / 2 + 0.04, 1.1, 0),
      ],
      dark: [box(L * 0.37, 0.5, W * 1.01, L * 0.32, H - 0.55, 0)],
    }),
    bus: (L, W, H) => ({
      paint: [box(L, H - 0.4, W, 0, 0.4 + (H - 0.4) / 2, 0)],
      dark: [box(L * 0.96, 0.8, W * 1.01, 0, H - 0.9, 0), box(0.06, 1.2, W * 0.9, L / 2 + 0.01, H - 1.05, 0)],
    }),
  };
  const lights = (L, W, kind) => {
    const y = kind === 'bus' ? 0.9 : 0.72,
      f = [box(0.06, 0.16, 0.3, L / 2 + 0.01, y, W / 2 - 0.28), box(0.06, 0.16, 0.3, L / 2 + 0.01, y, -W / 2 + 0.28)];
    const r = [
      box(0.06, 0.2, 0.26, -L / 2 - 0.01, y, W / 2 - 0.24),
      box(0.06, 0.2, 0.26, -L / 2 - 0.01, y, -W / 2 + 0.24),
    ];
    const g = mergeGeos([...f, ...r]),
      n = g.attributes.position.count,
      col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set(i < n / 2 ? [1, 0.96, 0.82] : [0.9, 0.06, 0.05], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };
  const disposables = [],
    meshes = [],
    byKind = {};
  const pm = new THREE.MeshLambertMaterial({ color: 0xffffff }),
    dm = new THREE.MeshLambertMaterial({ color: 0x1a1c20 }),
    lm = new THREE.MeshBasicMaterial({ vertexColors: true });
  disposables.push(pm, dm, lm);
  for (const K of IsleLife.TRAFFIC_KINDS) {
    const list = agents.filter((a) => a.kind.id === K.id);
    if (!list.length) continue;
    const sh = shapes[K.id](K.len, K.w, K.h),
      r = K.id === 'bus' ? 0.48 : 0.31,
      wx = K.len / 2 - (K.id === 'bus' ? 1.6 : 0.72),
      wz = K.w / 2 - 0.12;
    const wheels = [wheel(wx, wz, r), wheel(wx, -wz, r), wheel(-wx, wz, r), wheel(-wx, -wz, r)];
    const geos = [mergeGeos(sh.paint), mergeGeos([...sh.dark, ...wheels]), lights(K.len, K.w, K.id)];
    const ms = geos.map((g, k) => {
      disposables.push(g);
      const m = new THREE.InstancedMesh(g, [pm, dm, lm][k], list.length);
      m.frustumCulled = false;
      m.castShadow = false;
      group.add(m);
      meshes.push(m);
      return m;
    });
    const c = new THREE.Color();
    list.forEach((a, i) => {
      ms[0].setColorAt(i, c.setHex(a.color).convertSRGBToLinear());
    });
    ms[0].instanceColor.needsUpdate = true;
    byKind[K.id] = { list, ms };
  }
  const d = new THREE.Object3D(),
    far = 420 * 420;
  function update(cx, cz) {
    for (const k in byKind) {
      const { list, ms } = byKind[k];
      list.forEach((a, i) => {
        const dx = a.x - cx,
          dz = a.z - cz;
        if (dx * dx + dz * dz > far) d.scale.set(0, 0, 0);
        else {
          const c = Math.cos(a.heading),
            s = Math.sin(a.heading),
            hl = a.kind.len * 0.35;
          const f = ground(a.x + c * hl, a.z + s * hl),
            b = ground(a.x - c * hl, a.z - s * hl);
          d.position.set(a.x, (f + b) / 2, a.z);
          d.rotation.set(0, -a.heading, Math.atan2(f - b, hl * 2) + (a.hitT > 0 ? Math.sin(a.hitT * 30) * 0.01 : 0));
          d.scale.set(1, 1, 1);
        }
        d.updateMatrix();
        for (const m of ms) m.setMatrixAt(i, d.matrix);
      });
      for (const m of ms) m.instanceMatrix.needsUpdate = true;
    }
  }
  return {
    update,
    meshes,
    dispose() {
      for (const m of meshes) group.remove(m);
      for (const x of disposables) x.dispose();
    },
  };
}

// étiquette flottante (sprite) : nom, sous-titre, pastille de couleur ; redessinée à la demande
export function makeTag(keep) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 160;
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(4.4, 1.375, 1);
  sp.renderOrder = 5;
  if (keep) {
    keep(tex);
    keep(mat);
  }
  let last = '';
  function set(title, sub, col, chip) {
    const key = [title, sub, col, chip].join('|');
    if (key === last) return;
    last = key;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 512, 160);
    g.font = '800 46px "Archivo", "Arial Black", sans-serif';
    const tw = Math.min(
      460,
      Math.max(
        g.measureText(title).width,
        sub ? ((g.font = '600 28px "Archivo", sans-serif'), g.measureText(sub).width) : 0,
      ) +
        92 +
        (chip ? 120 : 0),
    );
    const x0 = 256 - tw / 2,
      h = sub ? 112 : 76;
    g.fillStyle = 'rgba(10,11,14,.82)';
    g.beginPath();
    g.moveTo(x0 + 24, 8);
    g.arcTo(x0 + tw, 8, x0 + tw, 8 + h, 24);
    g.arcTo(x0 + tw, 8 + h, x0, 8 + h, 24);
    g.arcTo(x0, 8 + h, x0, 8, 24);
    g.arcTo(x0, 8, x0 + tw, 8, 24);
    g.fill();
    g.strokeStyle = col;
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = col;
    g.beginPath();
    g.arc(x0 + 34, 8 + h / 2, 11, 0, 7);
    g.fill();
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = '#f2f2ef';
    g.font = '800 46px "Archivo", "Arial Black", sans-serif';
    g.fillText(title, x0 + 58, sub ? 44 : 8 + h / 2, tw - 70 - (chip ? 120 : 0));
    if (sub) {
      g.font = '600 28px "Archivo", sans-serif';
      g.fillStyle = '#a4a8af';
      g.fillText(sub, x0 + 58, 88, tw - 70 - (chip ? 120 : 0));
    }
    if (chip) {
      g.fillStyle = '#f7d154';
      const cx = x0 + tw - 118;
      g.fillRect(cx, 8 + h / 2 - 22, 104, 44);
      g.fillStyle = '#15120a';
      g.font = '900 28px "Archivo", sans-serif';
      g.textAlign = 'center';
      g.fillText(chip, cx + 52, 8 + h / 2 + 1);
    }
    tex.needsUpdate = true;
  }
  return {
    sprite: sp,
    set,
    dispose() {
      tex.dispose();
      mat.dispose();
    },
  };
}

// étiquette lisible à toute distance : taille à l'écran à peu près constante (largeur ≈ 22 % de la distance, 1,4 à 7 m),
// cachée tout près (le bouton d'interaction prend le relais) et au-delà de 220 m. base : hauteur du bas de l'étiquette.
export function fitTag(sp, x, z, cx, cz, base) {
  const d = Math.hypot(x - cx, z - cz);
  sp.visible = d > 7 && d < 220;
  if (!sp.visible) return;
  const k = Math.min(7, Math.max(1.4, d * 0.22));
  sp.scale.set(k, k / 3.2, 1);
  sp.position.y = base + k / 6.4;
}

// repères de l'île : habitants, belvédères, radars, zones de glisse. Renvoie les objets animés et de quoi les nettoyer.
export function buildIsleSpots(group, I, castOf) {
  const keepL = [],
    keep = (o) => {
      keepL.push(o);
      return o;
    },
    at = I.terrain.at,
    L = IsleLife;
  const out = { npcs: [], photos: [], acts: [] };
  // habitants : silhouette (jambes, buste à la couleur du personnage, bras, tête, cheveux) + étiquette
  const legsG = keep(
    mergeGeos([
      (() => {
        const g = new THREE.CylinderGeometry(0.11, 0.1, 0.82, 7);
        g.translate(-0.13, 0.41, 0);
        return g;
      })(),
      (() => {
        const g = new THREE.CylinderGeometry(0.11, 0.1, 0.82, 7);
        g.translate(0.13, 0.41, 0);
        return g;
      })(),
    ]),
  );
  const bodyG = keep(new THREE.CylinderGeometry(0.25, 0.29, 0.66, 10));
  bodyG.translate(0, 1.15, 0);
  const armsG = keep(
    mergeGeos([
      (() => {
        const g = new THREE.CylinderGeometry(0.075, 0.07, 0.62, 6);
        g.rotateZ(0.12);
        g.translate(-0.35, 1.13, 0);
        return g;
      })(),
      (() => {
        const g = new THREE.CylinderGeometry(0.075, 0.07, 0.62, 6);
        g.rotateZ(-0.12);
        g.translate(0.35, 1.13, 0);
        return g;
      })(),
    ]),
  );
  const headG = keep(new THREE.SphereGeometry(0.2, 14, 10));
  headG.translate(0, 1.7, 0);
  const hairG = keep(new THREE.SphereGeometry(0.215, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55));
  hairG.translate(0, 1.72, -0.01);
  const skin = keep(new THREE.MeshLambertMaterial({ color: 0xc98f66 })),
    dark = keep(new THREE.MeshLambertMaterial({ color: 0x23252b })),
    hair = keep(new THREE.MeshLambertMaterial({ color: 0x1a1512 }));
  for (const n of L.ISLE_NPCS) {
    const c = castOf(n.who),
      p = L.spotPos(I, n.e, n.at, n.side, 2.6),
      g = new THREE.Group(),
      cloth = keep(new THREE.MeshLambertMaterial({ color: new THREE.Color(c.col) }));
    g.add(
      new THREE.Mesh(legsG, dark),
      new THREE.Mesh(bodyG, cloth),
      new THREE.Mesh(armsG, cloth),
      new THREE.Mesh(headG, skin),
      new THREE.Mesh(hairG, n.who === 'zelie' ? keep(new THREE.MeshLambertMaterial({ color: 0xd8d4cc })) : hair),
    );
    const tag = makeTag(keep);
    tag.set(c.name, c.role, c.col, 'PARLER');
    tag.sprite.position.y = 3.3;
    g.add(tag.sprite);
    g.position.set(p.x, at(p.x, p.z), p.z);
    g.rotation.y = -Math.atan2(-p.tz, -p.tx) + Math.PI / 2;
    group.add(g);
    out.npcs.push({ def: n, x: p.x, z: p.z, obj: g, tag });
  }
  // belvédères : cercle au sol + étiquette appareil photo
  const ringG = keep(new THREE.RingGeometry(4.2, 5, 40));
  ringG.rotateX(-Math.PI / 2);
  const ringM = keep(
    new THREE.MeshBasicMaterial({
      color: 0x7b8cff,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  for (const s of L.PHOTO_SPOTS) {
    const p = L.spotPos(I, s.e, s.at, s.side, 4.5),
      g = new THREE.Group();
    const ring = new THREE.Mesh(ringG, ringM);
    ring.position.y = 0.15;
    ring.renderOrder = 2;
    g.add(ring);
    const tag = makeTag(keep);
    tag.set('Belvédère', s.name, '#7b8cff', 'PHOTO');
    tag.sprite.position.y = 3.2;
    g.add(tag.sprite);
    g.position.set(p.x, at(p.x, p.z), p.z);
    group.add(g);
    out.photos.push({ def: s, x: p.x, z: p.z, obj: g, tag });
  }
  // radars : portique au-dessus de la route ; zones : arches de départ et d'arrivée
  const postM = keep(new THREE.MeshLambertMaterial({ color: 0x24272d })),
    postG = keep(new THREE.BoxGeometry(0.35, 6.4, 0.35));
  postG.translate(0, 3.2, 0);
  const span = (I.half + 1.6) * 2;
  const beamG = keep(new THREE.BoxGeometry(0.5, 0.6, span + 0.4));
  const banner = (text, sub, col) =>
    keep(
      canvasTex(1024, 128, (c, w, h) => {
        c.fillStyle = '#0d0f12';
        c.fillRect(0, 0, w, h);
        c.fillStyle = col;
        c.fillRect(0, 0, w, 8);
        c.fillRect(0, h - 8, w, 8);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = col;
        c.font = '900 50px "Archivo", "Arial Black", sans-serif';
        c.fillText(text + (sub ? '  ·  ' + sub : ''), w / 2, h / 2 + 2);
      }),
    );
  const gantry = (x, z, tx, tz, tex) => {
    const g = new THREE.Group();
    for (const sd of [-1, 1]) {
      const m = new THREE.Mesh(postG, postM);
      m.position.z = (sd * span) / 2;
      g.add(m);
    }
    const b = new THREE.Mesh(beamG, postM);
    b.position.y = 6.4;
    g.add(b);
    for (const sd of [-1, 1]) {
      const f = new THREE.Mesh(
        keep(new THREE.PlaneGeometry(span, 1.1)),
        keep(new THREE.MeshBasicMaterial({ map: tex })),
      );
      f.position.set(sd * 0.27, 6.4, 0);
      f.rotation.y = (sd * Math.PI) / 2;
      g.add(f);
    }
    g.position.set(x, at(x, z), z);
    g.rotation.y = -Math.atan2(tz, tx);
    group.add(g);
    return g;
  };
  for (const a of L.ACTIVITIES) {
    const r = I.roads[a.e];
    if (a.type === 'radar') {
      const p = L.roadPose(I, a.e, 1, a.at * r.length, 0, {});
      const g = gantry(p.x, p.z, p.tx, p.tz, banner('RADAR', a.name.replace('Radar ', '').toUpperCase(), '#7b8cff'));
      const cam = new THREE.Mesh(
        keep(new THREE.BoxGeometry(0.6, 0.45, 0.5)),
        keep(new THREE.MeshBasicMaterial({ color: 0xe8e6e0 })),
      );
      cam.position.set(0, 5.75, 0);
      g.add(cam);
      out.acts.push({ def: a, x: p.x, z: p.z, tx: p.tx, tz: p.tz, obj: g });
    } else {
      const p0 = L.roadPose(I, a.e, 1, a.from * r.length, 0, {}),
        p1 = L.roadPose(I, a.e, 1, a.to * r.length, 0, {});
      gantry(p0.x, p0.z, p0.tx, p0.tz, banner('ZONE DE GLISSE', 'DÉPART', '#f7d154'));
      gantry(p1.x, p1.z, p1.tx, p1.tz, banner('ZONE DE GLISSE', 'ARRIVÉE', '#f7d154'));
      out.acts.push({ def: a, x: p0.x, z: p0.z, tx: p0.tx, tz: p0.tz, x1: p1.x, z1: p1.z });
    }
  }
  out.update = (t, cx, cz) => {
    for (const n of out.npcs) {
      fitTag(n.tag.sprite, n.x, n.z, cx, cz, 2.2);
      n.tag.sprite.position.y += Math.sin(t * 2 + n.x) * 0.06;
    }
    for (const p of out.photos) fitTag(p.tag.sprite, p.x, p.z, cx, cz, 2.4);
    ringM.opacity = 0.4 + 0.25 * Math.sin(t * 2.6);
  };
  out.dispose = () => {
    for (const o of keepL) o.dispose && o.dispose();
  };
  return out;
}
