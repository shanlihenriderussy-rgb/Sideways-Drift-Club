// Roues : pneu à épaules rondes et rainures, jante concave à branches chanfreinées, lèvre polie, disque et étrier.
// Face extérieure vers +z ; l'axe de la roue est z.
import { mergeGeos } from '../geometry.js';

const lathe = (profile, seg) =>
  new THREE.LatheGeometry(
    profile.map(([r, z]) => new THREE.Vector2(r, z)),
    seg,
  ).rotateX(Math.PI / 2);

// Branche : prisme effilé à arêtes chanfreinées, du moyeu (r0, z0, largeur w0, angle a0) à la jante (r1, z1, w1, a1).
// Les sections intermédiaires creusent la branche (bow < 0 : concave, vers l'intérieur de la roue).
function spokeGeo({ r0, z0, w0, a0, r1, z1, w1, a1, t, bow = 0, twist = 0 }) {
  const K = 4,
    pos = [];
  const rings = [];
  for (let s = 0; s <= K; s++) {
    const u = s / K;
    const r = r0 + (r1 - r0) * u,
      a = a0 + (a1 - a0) * u,
      w = w0 + (w1 - w0) * u;
    const z = z0 + (z1 - z0) * u + bow * Math.sin(Math.PI * u);
    const c = Math.min(w * 0.28, 0.008);
    const tw = twist * u;
    const T = [-Math.sin(a), Math.cos(a)];
    // section : flanc, chanfrein, dessus, chanfrein, flanc ; (décalage tangent, décalage axial)
    const sec = [
      [-w / 2, -t],
      [-w / 2, -c],
      [-w / 2 + c, 0],
      [w / 2 - c, 0],
      [w / 2, -c],
      [w / 2, -t],
    ];
    rings.push(
      sec.map(([dt, dz]) => {
        const tt = dt * Math.cos(tw) - dz * Math.sin(tw),
          zz = dt * Math.sin(tw) + dz * Math.cos(tw);
        return [r * Math.cos(a) + T[0] * tt, r * Math.sin(a) + T[1] * tt, z + zz];
      }),
    );
  }
  for (let s = 0; s < K; s++)
    for (let j = 0; j < 5; j++) {
      const a = rings[s][j],
        b = rings[s + 1][j],
        c = rings[s + 1][j + 1],
        d = rings[s][j + 1];
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals(); // non indexée : facettes nettes, les chanfreins accrochent la lumière
  return g;
}

// kit : niveau du kit de freins (0..3) → disque et étrier plus grands
export function wheelGeos(style, R, rr, tw, lod, kit) {
  const seg = lod ? 36 : 18;
  const h = tw / 2;
  const fz = h - 0.016; // plan de la lèvre de jante
  const rim = [],
    dark = [];

  // ---------- pneu : talon, flanc bombé, épaule ronde, bande de roulement à trois rainures ----------
  const half = [
    [rr + 0.001, h - 0.014],
    [rr + 0.014, h - 0.002],
    [(rr + R) / 2, h + 0.006],
    [R - 0.034, h + 0.001],
    [R - 0.014, h - 0.012],
    [R - 0.004, h - 0.03],
    [R, h - 0.05],
  ];
  const tread = [];
  if (lod) {
    const gw = 0.007,
      gd = 0.006;
    for (const c of [0.5 * h, 0, -0.5 * h])
      tread.push([R, c + gw + 0.002], [R - gd, c + gw], [R - gd, c - gw], [R, c - gw - 0.002]);
  }
  const prof = [...half, ...tread, ...half.map(([r, z]) => [r, -z]).reverse()];
  const tire = lathe(prof, seg);

  // ---------- fût et fond (on ne voit pas à travers la roue) ----------
  dark.push(new THREE.CylinderGeometry(rr - 0.006, rr - 0.006, tw - 0.03, seg, 1, true).rotateX(Math.PI / 2));
  dark.push(new THREE.CircleGeometry(rr - 0.006, seg).translate(0, 0, -h + 0.03));

  // ---------- jante : lèvre à gradin, voile, moyeu ----------
  const dish = style === 'dish';
  const lip = dish ? 0.08 : 0.012; // profondeur du déport
  rim.push(
    lathe(
      [
        [rr - 0.028, fz - lip],
        [rr - 0.016, fz - lip + 0.004],
        [rr - 0.012, fz - 0.004],
        [rr - 0.006, fz + 0.006],
        [rr + 0.004, fz + 0.008],
        [rr + 0.005, fz + 0.001],
        [rr + 0.001, fz - 0.012],
      ],
      seg,
    ),
  );
  const zc = fz - lip - (dish ? 0.0 : 0.03); // plan du moyeu : en retrait, les branches remontent vers la lèvre
  rim.push(
    lathe(
      [
        [0.0001, zc + 0.016],
        [0.026, zc + 0.016],
        [0.04, zc + 0.008],
        [0.058, zc - 0.004],
        [0.062, zc - 0.03],
      ],
      16,
    ),
  );
  const nuts = style === 'six' ? 4 : 5;
  for (let k = 0; k < nuts; k++) {
    const a = ((k + 0.5) / nuts) * Math.PI * 2;
    rim.push(
      new THREE.CylinderGeometry(0.009, 0.0105, 0.02, 6)
        .rotateX(Math.PI / 2)
        .translate(Math.cos(a) * 0.05, Math.sin(a) * 0.05, zc + 0.004),
    );
  }
  const n = { six: 6, five: 5, mesh: 8, turbine: 12, dish: 5 }[style] || 6;
  const zr = fz - lip + 0.004, // arrivée des branches sur la jante
    rOut = rr - 0.012;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    if (style === 'five')
      rim.push(
        spokeGeo({ r0: 0.045, z0: zc, w0: 0.085, a0: a, r1: rOut, z1: zr, w1: 0.05, a1: a, t: 0.034, bow: -0.006 }),
      );
    else if (style === 'mesh')
      for (const s of [1, -1])
        rim.push(
          spokeGeo({
            r0: 0.05,
            z0: zc - 0.004,
            w0: 0.02,
            a0: a,
            r1: rOut,
            z1: zr,
            w1: 0.016,
            a1: a + (s * Math.PI) / n,
            t: 0.02,
          }),
        );
    else if (style === 'turbine')
      rim.push(
        spokeGeo({
          r0: 0.05,
          z0: zc,
          w0: 0.034,
          a0: a,
          r1: rOut,
          z1: zr,
          w1: 0.026,
          a1: a + 0.3,
          t: 0.026,
          twist: 0.5,
        }),
      );
    else if (dish)
      rim.push(
        spokeGeo({ r0: 0.045, z0: zc, w0: 0.06, a0: a, r1: rr - 0.03, z1: zr - 0.004, w1: 0.045, a1: a, t: 0.03 }),
      );
    else
      rim.push(
        spokeGeo({ r0: 0.045, z0: zc, w0: 0.056, a0: a, r1: rOut, z1: zr, w1: 0.036, a1: a, t: 0.032, bow: -0.008 }),
      );
  }

  // ---------- freins : disque à bol, étrier ----------
  const dr = rr - 0.065 + 0.012 * (kit | 0);
  const zd = Math.min(fz - 0.085, fz - lip - 0.05);
  const disc = mergeGeos([
    new THREE.CylinderGeometry(dr, dr, 0.022, seg).rotateX(Math.PI / 2).translate(0, 0, zd),
    new THREE.CylinderGeometry(dr * 0.42, dr * 0.46, 0.03, 20).rotateX(Math.PI / 2).translate(0, 0, zd + 0.02),
  ]);
  const ca = 2.25; // étrier en haut, vers l'arrière
  const ck = 1 + 0.14 * (kit | 0);
  const caliper = new THREE.BoxGeometry(0.07 * ck, 0.16 * ck, 0.06)
    .rotateZ(ca - Math.PI / 2)
    .translate(Math.cos(ca) * (dr - 0.028), Math.sin(ca) * (dr - 0.028), zd + 0.012);
  return {
    tire: mergeGeos([tire]),
    rim: mergeGeos(rim),
    dark: mergeGeos(dark),
    disc,
    caliper: mergeGeos([caliper]),
    caliperAngle: ca,
  };
}
