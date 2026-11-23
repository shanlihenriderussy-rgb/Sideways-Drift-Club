import { joinGeos } from '../render/geometry.js';
import { IsleLife } from './life.js';

export const CARGO_COLORS = [0x9c3b2d, 0x2d5570, 0x3e6a5a, 0xc18a30, 0x6d7583, 0x934525];

export function portLayout(island) {
  const cargo = [];
  const sheds = [];
  const cranes = [];
  const q = {};
  const anchor = (s, lateral) => IsleLife.roadPose(island, 0, 1, s, lateral);
  const spot = (a, along, across, yaw, lift = 0) => [
    a.x + a.tx * along - a.tz * across,
    a.z + a.tz * along + a.tx * across,
    yaw - Math.atan2(a.tz, a.tx),
    lift,
  ];
  const isClear = (p, radius) => {
    const [x, z] = p;
    return island.terrain.at(x, z) > 0.7 && island.nearestRoad(x, z, q).d > radius + island.half + 2;
  };
  for (const [yard, [s, lat]] of [
    [82, 20],
    [150, -21],
    [226, 22],
    [298, -24],
  ].entries()) {
    const a = anchor(s, lat);
    for (let row = 0; row < 3; row++) {
      for (let bay = 0; bay < 3; bay++) {
        const p = spot(a, (bay - 1) * 12.6, Math.sign(lat) * row * 3.35, lat > 0 ? 0 : Math.PI);
        if (!isClear(p, 7)) continue;
        cargo.push(p);
        if ((yard + bay + row * 2) % 4 === 1) cargo.push([...p.slice(0, 3), 2.62]);
      }
    }
  }
  for (const [s, lat] of [
    [54, -35],
    [132, 40],
    [203, -39],
    [283, 43],
  ]) {
    const p = spot(anchor(s, lat), 0, 0, lat > 0 ? 0 : Math.PI);
    if (isClear(p, 16)) sheds.push(p);
  }
  for (const [s, lat] of [
    [94, 49],
    [242, -49],
  ]) {
    const p = spot(anchor(s, lat), 0, 0, lat > 0 ? 0 : Math.PI);
    if (isClear(p, 15)) cranes.push(p);
  }
  return { cargo, sheds, cranes };
}

function paint(geo, hex) {
  const color = new THREE.Color(hex).convertSRGBToLinear();
  const rgb = [color.r, color.g, color.b];
  const data = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < data.length; i += 3) data.set(rgb, i);
  geo.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geo;
}
const box = (w, h, d, x, y, z, hex) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);

export function cargoGeometry(detail) {
  // Tôle ondulée et verrous sur les portes, sans texture supplémentaire.
  const segments = detail ? 24 : 12;
  const body = new THREE.BoxGeometry(12, 2.6, 2.5, segments, 1, 1);
  const pos = body.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    if (Math.abs(x) < 5.95 && Math.abs(z) > 1.2 && Math.round(((x + 6) * segments) / 12) % 2) pos.setZ(i, z * 0.959);
  }
  body.translate(0, 1.3, 0);
  body.computeVertexNormals();
  const pieces = [
    paint(body, 0xdfdfdf),
    box(0.08, 2.46, 0.045, 6.03, 1.3, 0, 0x626262),
    box(12.1, 0.11, 2.53, 0, 0.085, 0, 0xababab),
    box(12.1, 0.09, 2.53, 0, 2.55, 0, 0xbcbcbc),
  ];
  for (const z of [-0.84, -0.32, 0.32, 0.84]) {
    pieces.push(box(0.095, 2.28, 0.046, 6.05, 1.31, z, 0xd2d2d2));
  }
  return joinGeos(pieces);
}

export function shedGeometry() {
  const pieces = [
    box(27, 8.5, 14, 0, 4.05, 0, 0x6f7c87),
    box(27.25, 0.68, 14.25, 0, 0.18, 0, 0x414950),
    box(27.3, 0.35, 14.2, 0, 7.53, 0, 0xc0ad7b),
  ];
  for (const sign of [-1, 1]) {
    const roof = new THREE.BoxGeometry(28.1, 0.3, 7.65).rotateX(sign * 0.235).translate(0, 9.15, sign * 3.68);
    pieces.push(paint(roof, 0x303f50));
    const gable = new THREE.BufferGeometry();
    const x = sign * 13.502;
    const corners = [x, 8.28, -sign * 7.005, x, 10.07, 0, x, 8.28, sign * 7.005];
    gable.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
    gable.computeVertexNormals();
    pieces.push(paint(gable, 0x596b7c));
  }
  for (const x of [-8.5, 0, 8.5]) {
    pieces.push(box(6.25, 5.1, 0.24, x, 2.42, -7.08, 0x252b31));
    pieces.push(box(5.8, 4.88, 0.1, x, 2.39, -7.245, 0x8a9ba8));
    for (let i = 1; i <= 5; i++) {
      pieces.push(box(5.76, 0.055, 0.06, x, i * 0.8, -7.31, 0x53646f));
    }
    pieces.push(box(1.9, 0.36, 0.24, x, 5.55, -7.1, 0xd3a947));
  }
  return joinGeos(pieces);
}

export function craneGeometry() {
  const steel = 0x596879;
  const safety = 0xd79a3f;
  const pieces = [
    box(19.5, 1.4, 1.1, 0, 15.6, 0, safety),
    box(19.5, 0.48, 1.6, 0, 16.36, 0, steel),
    box(2.7, 1.42, 2.5, 2.4, 14.1, 0, 0x354752),
    box(2.0, 0.19, 2.0, 2.4, 7.65, 0, safety),
  ];
  for (const x of [-8.5, 8.5]) {
    pieces.push(box(1.4, 1.2, 7, x, 0.55, 0, steel));
    pieces.push(box(0.9, 14.9, 0.95, x, 7.65, 0, steel));
    for (const z of [-2.6, 2.6]) {
      const brace = new THREE.BoxGeometry(0.6, 9.0, 0.55).rotateX(-Math.sign(z) * 0.31).translate(x, 4.74, z / 2);
      pieces.push(paint(brace, steel));
    }
  }
  for (const z of [-0.69, 0.69]) pieces.push(box(0.07, 6.14, 0.07, 2.4, 10.8, z, 0x303641));
  return joinGeos(pieces);
}
