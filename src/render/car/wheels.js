// Roues : pneu en révolution, jante à branches, disque et étrier. Face extérieure vers +z.
import { mergeGeos } from '../geometry.js';

// ---------- roues (géométrie face extérieure vers +z) ----------
// kit : niveau du kit de freins (0..3) → disque et étrier plus grands
export function wheelGeos(style, R, rr, tw, lod, kit) {
  const seg = lod ? 26 : 16;
  const fz = tw / 2 - 0.018;
  const rim = [],
    dark = [];
  // pneu : profil de révolution (flancs arrondis)
  const h = tw / 2,
    prof = [
      [rr - 0.004, -h + 0.01],
      [R - 0.045, -h],
      [R - 0.012, -h + 0.02],
      [R, -h + 0.05],
      [R, h - 0.05],
      [R - 0.012, h - 0.02],
      [R - 0.045, h],
      [rr - 0.004, h - 0.01],
    ];
  const tire = new THREE.LatheGeometry(
    prof.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );
  tire.rotateX(Math.PI / 2);
  // fût + fond (empêche de voir à travers la roue)
  dark.push(new THREE.CylinderGeometry(rr - 0.004, rr - 0.004, tw - 0.03, seg, 1, true).rotateX(Math.PI / 2));
  dark.push(new THREE.CircleGeometry(rr - 0.004, seg).translate(0, 0, -h + 0.03));
  // lèvre, moyeu, écrous
  rim.push(new THREE.TorusGeometry(rr - 0.008, 0.013, 6, seg).translate(0, 0, fz + 0.004));
  rim.push(new THREE.CylinderGeometry(0.042, 0.048, 0.03, 12).rotateX(Math.PI / 2).translate(0, 0, fz - 0.03));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    rim.push(
      new THREE.CylinderGeometry(0.011, 0.011, 0.022, 6)
        .rotateX(Math.PI / 2)
        .translate(Math.cos(a) * 0.066, Math.sin(a) * 0.066, fz - 0.012),
    );
  }
  const spoke = (r0, r1, w, depth, ang, z, twist, slant) => {
    const len = r1 - r0;
    const g = new THREE.BoxGeometry(len, w, depth);
    if (twist) g.rotateX(twist);
    g.translate(r0 + len / 2, 0, z);
    if (slant) g.rotateZ(slant);
    rim.push(g.rotateZ(ang));
  };
  const n = { six: 6, five: 5, mesh: 10, turbine: 12, dish: 5 }[style] || 6;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    if (style === 'five') {
      spoke(0.04, rr * 0.55, 0.075, 0.04, a, fz - 0.035);
      spoke(rr * 0.5, rr - 0.012, 0.05, 0.035, a, fz - 0.012);
    } else if (style === 'mesh') {
      spoke(0.05, rr - 0.012, 0.018, 0.02, a, fz - 0.02, 0, 0.42);
      spoke(0.05, rr - 0.012, 0.018, 0.02, a + Math.PI / n, fz - 0.024, 0, -0.42);
    } else if (style === 'turbine') spoke(0.05, rr - 0.02, 0.04, 0.03, a, fz - 0.02, 0.7);
    else if (style === 'dish') spoke(0.04, rr - 0.075, 0.05, 0.035, a, fz - 0.075);
    else spoke(0.04, rr - 0.012, 0.045, 0.032, a, fz - 0.016);
  }
  if (style === 'dish') {
    rim.push(
      new THREE.CylinderGeometry(rr - 0.002, rr - 0.002, 0.07, seg, 1, true)
        .rotateX(Math.PI / 2)
        .translate(0, 0, fz - 0.035),
    );
    rim.push(new THREE.RingGeometry(rr - 0.08, rr - 0.002, seg).translate(0, 0, fz - 0.07));
  }
  if (style === 'mesh') rim.push(new THREE.TorusGeometry(0.06, 0.012, 5, 12).translate(0, 0, fz - 0.03));
  const dr = rr - 0.07 + 0.012 * (kit | 0);
  const disc = new THREE.CylinderGeometry(dr, dr, 0.022, seg).rotateX(Math.PI / 2).translate(0, 0, fz - 0.095);
  const ca = 2.25; // étrier en haut, vers l'arrière
  const ck = 1 + 0.14 * (kit | 0);
  const caliper = new THREE.BoxGeometry(0.075 * ck, 0.15 * ck, 0.06)
    .rotateZ(ca - Math.PI / 2)
    .translate(Math.cos(ca) * (dr - 0.03), Math.sin(ca) * (dr - 0.03), fz - 0.075);
  return {
    tire: mergeGeos([tire]),
    rim: mergeGeos(rim),
    dark: mergeGeos(dark),
    disc: mergeGeos([disc]),
    caliper: mergeGeos([caliper]),
    caliperAngle: ca,
  };
}

// look : { paint, accent, finish, livery, number, rimStyle, rim, front, wide, wing, hood, exhaust, cage, neon, tune, night, lod }
