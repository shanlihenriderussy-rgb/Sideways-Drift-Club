// Multijoueur : protocole, relais de l'hôte, filtrage, interpolation, codes d'invitation. node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../src/net.js');
const E = require('../src/economy.js');

// deux bouts d'un lien en mémoire (livraison asynchrone, comme un vrai canal)
function pair() {
  const a = { open: true }, b = { open: true };
  const wire = (from, to) => {
    from.send = (s) => { if (from.open) queueMicrotask(() => to.onmessage && to.onmessage(s)); };
    from.close = () => { if (!from.open) return; from.open = false; to.open = false; queueMicrotask(() => { from.onclose && from.onclose(); to.onclose && to.onclose(); }); };
  };
  wire(a, b); wire(b, a);
  return [a, b];
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const me = (name, kind) => ({ name, kind, cfg: E.defaultCar(kind) });

test('état compact : aller-retour, rejet des valeurs absurdes', () => {
  const st = { x: 12.3456, z: -40, heading: 1.2, vx: 3, vz: 4, speed: 5, slip: 0.3, rearSlip: 0.4, steerAngle: 0.1, wheelRot: 33, rollAngle: 0.01, pitchAngle: 0, rpm: 6000, throttle: 1 };
  const d = N.encodeState(1234.5, st, 999.4, true);
  const o = N.decodeState(JSON.parse(JSON.stringify(d)));
  assert.equal(o.x, 12.346); assert.equal(o.rpm, 6000); assert.equal(o.combo, 999); assert.equal(o.brake, true);
  assert.equal(N.decodeState([...d.slice(0, 3), NaN, ...d.slice(4)]), null);
  assert.equal(N.decodeState(d.slice(1)), null);
  assert.equal(N.decodeState('x'), null);
  const far = d.slice(); far[1] = 1e9;
  assert.equal(N.decodeState(far), null);
});

test('pseudo et voiture d’un pair : filtrés', () => {
  assert.equal(N.cleanName('<img src=x onerror=alert(1)>Léa'), 'img src=x onerror=alert(1)Léa'.slice(0, 16));
  assert.equal(N.cleanName('   '), 'Pilote');
  assert.equal(N.cleanName('a\u0000b\nc'), 'abc');
  const p = N.sanitizePeer({ name: 'Zoé', kind: 'tank', cfg: { paint: 'pas-une-couleur', number: 1e6, owned: new Array(5000).fill('x') } }, E);
  assert.equal(p.kind, 'hachi'); assert.equal(p.cfg.paint, E.defaultCar('hachi').paint); assert.ok(p.cfg.owned.length <= 200);
  assert.equal(N.sanitizePeer(null, E), null);
});

test('session : l’hôte accueille, relaie états et émotes, annonce les départs', async () => {
  const got = { h: [], g1: [], g2: [] };
  const H = N.createSession(me('Hôte', 'raijin'), (t, d) => got.h.push([t, d]), E).host();
  H.setHostAt(10, 20, 0.5);
  const G1 = N.createSession(me('Un', 'hachi'), (t, d) => got.g1.push([t, d]), E);
  const G2 = N.createSession(me('Deux', 'kouki'), (t, d) => got.g2.push([t, d]), E);
  const [h1, g1] = pair(), [h2, g2] = pair();
  H.addGuestLink(h1); G1.join(g1); await tick();
  H.addGuestLink(h2); G2.join(g2); await tick();
  assert.equal(G1.id, 1); assert.equal(G2.id, 2);
  assert.deepEqual(G2.hostAt, { x: 10, z: 20, h: 0.5 });
  assert.equal(G1.peers.size, 3, 'G1 connaît tout le monde');
  assert.equal(G2.peers.get(1).name, 'Un');
  // état de G1 → hôte et G2
  const d = N.encodeState(5, { x: 1, z: 2, heading: 0, speed: 3 }, 0, false);
  G1.sendState(d); await tick();
  assert.ok(got.h.some(([t, v]) => t === 'state' && v.id === 1 && v.s.x === 1));
  assert.ok(got.g2.some(([t, v]) => t === 'state' && v.id === 1 && v.s.z === 2));
  assert.ok(!got.g1.some(([t, v]) => t === 'state' && v.id === 1), 'pas d’écho');
  // émotes : seules les connues passent
  G2.emote('gg'); G2.emote('<script>'); await tick();
  assert.equal(got.g1.filter(([t]) => t === 'emote').length, 1);
  // évènements de groupe : un invité ne peut pas lancer de course, l'hôte si
  G1.event({ k: 'race', node: 'S' }); H.event({ k: 'race', node: 'S' }); await tick();
  assert.equal(got.g2.filter(([t, v]) => t === 'ev' && v.ev.k === 'race').length, 1);
  G1.event({ k: 'arrive', time: 83.27 }); await tick();
  assert.ok(got.g2.some(([t, v]) => t === 'ev' && v.id === 1 && v.ev.time === 83.3));
  // départ de G1
  g1.close(); await tick(); await tick();
  assert.ok(got.g2.some(([t, v]) => t === 'leave' && v.id === 1));
  assert.equal(H.peers.size, 2);
});

test('session pleine : le cinquième est refusé', async () => {
  const H = N.createSession(me('H', 'hachi'), () => {}, E).host();
  const full = [];
  for (let k = 0; k < 4; k++) {
    const [a, b] = pair();
    H.addGuestLink(a);
    N.createSession(me('G' + k, 'hachi'), (t) => { if (t === 'full') full.push(k); }, E).join(b);
    await tick();
  }
  assert.equal(H.peers.size, 4);
  assert.deepEqual(full, [3]);
});

test('messages invalides ignorés sans casser la session', async () => {
  const H = N.createSession(me('H', 'hachi'), () => {}, E).host();
  const [a, b] = pair();
  H.addGuestLink(a);
  b.send('pas du json'); b.send(JSON.stringify({ t: 'st', d: [1, 2] })); b.send('x'.repeat(20000));
  await tick();
  assert.equal(H.peers.size, 1, 'pas d’inscription sans bonjour');
  b.send(JSON.stringify({ t: 'hello', name: 'Ok', kind: 'kouki', cfg: {} })); await tick();
  assert.equal(H.peers.size, 2);
});

test('interpolation : entre deux instantanés, avec retard fixe, cap au plus court', () => {
  const I = N.createInterp();
  const s = (t, x, h) => ({ t, x, z: 0, heading: h, vx: 10, vz: 0, speed: 10, slip: 0, rearSlip: 0, steerAngle: 0, wheelRot: 0, rollAngle: 0, pitchAngle: 0, rpm: 0, throttle: 0, combo: 0, brake: false });
  I.push(s(1000, 0, 3.1), 5000); I.push(s(1100, 1, -3.1), 5100);
  const o = I.sample(5000 + 50 + N.DELAY * 1000);
  assert.ok(Math.abs(o.x - 0.5) < 1e-9, o.x);
  assert.ok(Math.abs(Math.abs(o.heading) - Math.PI) < 0.01, 'passe par ±π, pas par 0');
  const late = I.sample(5100 + 300 + N.DELAY * 1000);
  assert.ok(late.x > 1 && late.x <= 1 + 10 * 0.4 + 1e-9, 'extrapolation bornée');
  assert.equal(N.createInterp().sample(0), null);
});

test('codes d’invitation : aller-retour, lien accepté, déchets refusés', async () => {
  const sdp = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' + 'a=candidate:1 1 udp 2122260223 192.168.1.20 54321 typ host\r\n'.repeat(4);
  const code = await N.packCode({ k: 'o', sdp, net: 0 });
  assert.ok(code.startsWith('SDC1'));
  assert.ok(code.length < sdp.length, 'compressé');
  assert.deepEqual(await N.unpackCode(code), { k: 'o', sdp, net: 0 });
  assert.deepEqual(await N.unpackCode('https://exemple.test/#sdc=' + code), { k: 'o', sdp, net: 0 });
  assert.equal(await N.unpackCode('SDC1z.@@@'), null);
  assert.equal(await N.unpackCode('bonjour'), null);
  assert.equal(await N.unpackCode(await N.packCode({ k: 'x', sdp: 'a' })), null);
});

test('course : seul l’hôte la lance, grille de départ filtrée', () => {
  assert.deepEqual(N.cleanEvent({ k: 'race', node: 'S', at: { x: 1, z: 2, h: 0.5 } }, true), { k: 'race', node: 'S', at: { x: 1, z: 2, h: 0.5 } });
  assert.deepEqual(N.cleanEvent({ k: 'race', node: 'S', at: { x: 'a', z: 2, h: 0 } }, true), { k: 'race', node: 'S' });
  assert.equal(N.cleanEvent({ k: 'race', node: 'S' }, false), null);
  assert.equal(N.cleanEvent({ k: 'race', node: 'drop table' }, true), null);
  assert.deepEqual(N.cleanEvent({ k: 'battle', dur: 9999 }, true), { k: 'battle', dur: 180 });
  assert.equal(N.cleanEvent({ k: 'score', pts: -5 }, false), null);
});
