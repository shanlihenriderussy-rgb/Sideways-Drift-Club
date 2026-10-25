// ===== Multijoueur : sessions pair à pair sur l'île (WebRTC, sans serveur de jeu) =====
// Un hôte, jusqu'à 3 invités. L'hôte relaie tout (étoile). Chaque appareil simule sa voiture et envoie son état ~15 fois/s ;
// les voitures des autres sont interpolées avec 120 ms de retard. Trafic et rivaux restent propres à chaque appareil.
// Invitation sans serveur : l'hôte donne un code (offre), l'invité renvoie un code (réponse). Rien n'est stocké en ligne.
// Données échangées : pseudo, voiture et livrée, position. Mode « même Wi-Fi » par défaut : aucun serveur tiers ;
// mode « Internet » : serveur STUN public (il voit l'adresse IP de chaque joueur). Les joueurs voient l'IP les uns des autres.
// Partie pure (protocole, relais, interpolation, codes) testée sous Node : tests/net.test.js.

const NET_MAX = 4, NET_HZ = 15, NET_DELAY = 0.12, NET_MSG_MAX = 8192;
const NET_KINDS = ['hachi', 'kouki', 'raijin'];
const EMOTES = { horn: 'Klaxon', gg: 'GG !', wave: 'Salut !', fire: 'En feu !', follow: 'Suis-moi !' };
const NET_COLORS = ['#f7d154', '#7b8cff', '#4be38a', '#ff8fb3'];

// ---------- état compact d'une voiture ----------
const ST_KEYS = ['x', 'z', 'heading', 'vx', 'vz', 'speed', 'slip', 'rearSlip', 'steerAngle', 'wheelRot', 'rollAngle', 'pitchAngle', 'rpm', 'throttle'];
const r3 = (v) => Math.round(v * 1000) / 1000;
function encodeState(t, st, combo, braking) {
  const d = [Math.round(t)];
  for (const k of ST_KEYS) d.push(r3(st[k] || 0));
  d.push(Math.round(combo || 0), braking ? 1 : 0);
  return d;
}
// tableau reçu → état, ou null s'il est invalide (nombres finis, position sur l'île)
function decodeState(d) {
  if (!Array.isArray(d) || d.length !== ST_KEYS.length + 3) return null;
  for (const v of d) if (typeof v !== 'number' || !isFinite(v)) return null;
  const o = { t: d[0] };
  ST_KEYS.forEach((k, i) => { o[k] = d[i + 1]; });
  if (Math.abs(o.x) > 6000 || Math.abs(o.z) > 6000 || Math.abs(o.speed) > 200) return null;
  o.combo = Math.max(0, Math.min(1e7, d[ST_KEYS.length + 1])); o.brake = d[ST_KEYS.length + 2] === 1;
  return o;
}

// ---------- pseudo et voiture d'un pair (tout ce qui vient du réseau est filtré) ----------
function cleanName(s) {
  const n = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>&"']/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return n || 'Pilote';
}
function sanitizePeer(raw, Eco) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = NET_KINDS.includes(raw.kind) ? raw.kind : 'hachi';
  let cfg = raw.cfg && typeof raw.cfg === 'object' ? raw.cfg : {};
  if (Array.isArray(cfg.owned)) cfg = Object.assign({}, cfg, { owned: cfg.owned.slice(0, 200) });
  const E = Eco || (typeof Economy !== 'undefined' ? Economy : require('./economy.js'));
  // pour l'affichage, une pièce déclarée possédée suffit : on garde la livrée de l'autre joueur telle quelle
  return { name: cleanName(raw.name), kind, cfg: E.sanitizeCar(kind, cfg) };
}

// ---------- interpolation : instantanés horodatés par l'émetteur ----------
function createInterp() {
  const buf = [];
  let off = null; // décalage d'horloge estimé (réception − émission), en ms
  const out = {};
  return {
    push(s, recvMs) {
      const o = recvMs - s.t;
      off = off == null || o < off ? o : off + (o - off) * 0.02; // descend vite, remonte lentement (gigue)
      if (buf.length && s.t <= buf[buf.length - 1].t) return;
      buf.push(s); if (buf.length > 30) buf.shift();
    },
    // état affiché à l'instant local nowMs ; null tant qu'on n'a rien reçu
    sample(nowMs) {
      if (!buf.length) return null;
      const t = nowMs - off - NET_DELAY * 1000;
      let a = buf[0], b = buf[buf.length - 1];
      if (t <= a.t) b = a;
      else if (t >= b.t) a = b;
      else for (let i = 1; i < buf.length; i++) if (buf[i].t >= t) { a = buf[i - 1]; b = buf[i]; break; }
      const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
      for (const key of ST_KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
      let dh = b.heading - a.heading; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      out.heading = a.heading + dh * k;
      // extrapolation courte si les paquets tardent (max 0,4 s)
      const ex = Math.min(0.4, Math.max(0, (t - b.t) / 1000));
      if (ex > 0) { out.x += b.vx * ex; out.z += b.vz * ex; }
      out.combo = b.combo; out.brake = b.brake; out.age = (nowMs - off - b.t) / 1000;
      return out;
    },
    get size() { return buf.length; },
  };
}

// ---------- session : hôte (relais) ou invité ; un lien = { send(msg, fast), close(), onmessage, onclose } ----------
// me : { name, kind, cfg }. on(type, data) reçoit : 'peers' (liste), 'join'/'leave' (pair), 'state' (id, état),
// 'emote' (id, e), 'ev' (id, évènement de groupe), 'welcome' (données de l'hôte), 'closed'.
function createSession(me, on, Eco) {
  const S = { role: null, id: null, peers: new Map(), links: new Map(), me, nextId: 1, hostAt: null };
  const emit = (t, d) => { try { on(t, d); } catch (e) { /* l'interface ne doit pas casser le réseau */ } };
  const peerList = () => [...S.peers.entries()].map(([id, p]) => ({ id, name: p.name, kind: p.kind, cfg: p.cfg }));
  const bySize = (msg) => { try { const s = typeof msg === 'string' ? msg : JSON.stringify(msg); return s.length <= NET_MSG_MAX ? s : null; } catch (e) { return null; } };
  function sendTo(link, msg, fast) { const s = bySize(msg); if (s) try { link.send(s, fast); } catch (e) { /* lien fermé */ } }
  function broadcast(msg, except, fast) { for (const [id, l] of S.links) if (id !== except) sendTo(l, msg, fast); }
  function parse(raw) { if (typeof raw !== 'string' || raw.length > NET_MSG_MAX) return null; try { const m = JSON.parse(raw); return m && typeof m === 'object' ? m : null; } catch (e) { return null; } }

  // hôte : chaque invité reçoit un numéro à son arrivée
  S.host = () => { S.role = 'host'; S.id = 0; S.peers.set(0, { name: cleanName(me.name), kind: me.kind, cfg: me.cfg, color: NET_COLORS[0] }); return S; };
  S.addGuestLink = (link) => {
    let id = null;
    link.onmessage = (raw) => {
      const m = parse(raw); if (!m) return;
      if (id == null) {
        if (m.t !== 'hello') return;
        if (S.peers.size >= NET_MAX) { sendTo(link, { t: 'full' }); link.close(); return; }
        const p = sanitizePeer(m, Eco); if (!p) return;
        id = S.nextId++;
        p.color = NET_COLORS[id % NET_COLORS.length];
        S.peers.set(id, p); S.links.set(id, link);
        sendTo(link, { t: 'welcome', id, peers: peerList(), at: S.hostAt });
        broadcast({ t: 'join', id, name: p.name, kind: p.kind, cfg: p.cfg }, id);
        emit('join', { id, ...p }); emit('peers', peerList());
        return;
      }
      relay(id, m);
    };
    link.onclose = () => { if (id == null) return; S.links.delete(id); S.peers.delete(id); broadcast({ t: 'leave', id }); emit('leave', { id }); emit('peers', peerList()); };
  };
  function relay(id, m) {
    if (m.t === 'st') { const s = decodeState(m.d); if (!s) return; emit('state', { id, s }); broadcast({ t: 'st', id, d: m.d }, id, true); }
    else if (m.t === 'emote' && EMOTES[m.e]) { emit('emote', { id, e: m.e }); broadcast({ t: 'emote', id, e: m.e }, id); }
    else if (m.t === 'ev' && m.ev && typeof m.ev === 'object') { const ev = cleanEvent(m.ev, false); if (ev) { emit('ev', { id, ev }); broadcast({ t: 'ev', id, ev }, id); } }
  }

  // invité : un seul lien, vers l'hôte
  S.join = (link) => {
    S.role = 'guest';
    S.links.set(0, link);
    link.onmessage = (raw) => {
      const m = parse(raw); if (!m) return;
      if (m.t === 'welcome' && Number.isInteger(m.id) && Array.isArray(m.peers)) {
        S.id = m.id; S.peers.clear();
        for (const q of m.peers.slice(0, NET_MAX)) { const p = sanitizePeer(q, Eco); if (p && Number.isInteger(q.id)) { p.color = NET_COLORS[q.id % NET_COLORS.length]; S.peers.set(q.id, p); } }
        S.hostAt = m.at && isFinite(m.at.x) && isFinite(m.at.z) && isFinite(m.at.h) ? { x: +m.at.x, z: +m.at.z, h: +m.at.h } : null;
        emit('welcome', { id: S.id, at: S.hostAt }); emit('peers', peerList());
      } else if (m.t === 'join' && Number.isInteger(m.id)) { const p = sanitizePeer(m, Eco); if (p) { p.color = NET_COLORS[m.id % NET_COLORS.length]; S.peers.set(m.id, p); emit('join', { id: m.id, ...p }); emit('peers', peerList()); } }
      else if (m.t === 'leave' && Number.isInteger(m.id)) { S.peers.delete(m.id); emit('leave', { id: m.id }); emit('peers', peerList()); }
      else if (m.t === 'st' && Number.isInteger(m.id) && m.id !== S.id) { const s = decodeState(m.d); if (s) emit('state', { id: m.id, s }); }
      else if (m.t === 'emote' && Number.isInteger(m.id) && EMOTES[m.e]) emit('emote', { id: m.id, e: m.e });
      else if (m.t === 'ev' && Number.isInteger(m.id)) { const ev = cleanEvent(m.ev, m.id === 0); if (ev) emit('ev', { id: m.id, ev }); }
      else if (m.t === 'full') emit('full', {});
    };
    link.onclose = () => { S.links.clear(); S.peers.clear(); emit('closed', {}); };
    sendTo(link, { t: 'hello', name: cleanName(me.name), kind: me.kind, cfg: me.cfg });
  };

  // envois locaux
  S.sendState = (d) => { if (S.role === 'host') broadcast({ t: 'st', id: 0, d }, null, true); else if (S.role === 'guest') sendTo(S.links.get(0), { t: 'st', d }, true); };
  S.emote = (e) => { if (!EMOTES[e]) return; if (S.role === 'host') broadcast({ t: 'emote', id: 0, e }); else if (S.links.get(0)) sendTo(S.links.get(0), { t: 'emote', e }); };
  S.event = (ev) => { const c = cleanEvent(ev, S.role === 'host'); if (!c) return; if (S.role === 'host') broadcast({ t: 'ev', id: 0, ev: c }); else if (S.links.get(0)) sendTo(S.links.get(0), { t: 'ev', ev: c }); };
  S.setHostAt = (x, z, h) => { S.hostAt = { x, z, h }; };
  S.close = () => { for (const l of S.links.values()) try { l.close(); } catch (e) { /* déjà fermé */ } S.links.clear(); S.peers.clear(); S.role = null; };
  S.peerList = peerList;
  return S;
}
// évènements de groupe : départ de course ou de battle (hôte seulement), arrivée, score
const NODE_RE = /^[A-Z][A-Z0-9]{0,3}$/;
function cleanEvent(ev, fromHost) {
  if (!ev || typeof ev !== 'object') return null;
  if (ev.k === 'race' && fromHost && NODE_RE.test(ev.node)) {
    const o = { k: 'race', node: ev.node }, at = ev.at; // grille de départ autour de l'hôte
    if (at && [at.x, at.z, at.h].every((v) => typeof v === 'number' && isFinite(v)) && Math.abs(at.x) < 6000 && Math.abs(at.z) < 6000) o.at = { x: at.x, z: at.z, h: at.h };
    return o;
  }
  if (ev.k === 'battle' && fromHost) return { k: 'battle', dur: Math.max(30, Math.min(180, Math.round(+ev.dur) || 90)) };
  if (ev.k === 'arrive' && isFinite(ev.time) && ev.time > 0 && ev.time < 3600) return { k: 'arrive', time: Math.round(ev.time * 10) / 10 };
  if (ev.k === 'score' && isFinite(ev.pts) && ev.pts >= 0) return { k: 'score', pts: Math.min(1e7, Math.round(ev.pts)) };
  if (ev.k === 'cancel' && fromHost) return { k: 'cancel' };
  return null;
}

// ---------- codes d'invitation : description de session WebRTC compressée, base64url ----------
const CODE_PREFIX = 'SDC1';
const b64u = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/')); const u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; };
async function streamBytes(bytes, Stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw')));
  return new Uint8Array(await res.arrayBuffer());
}
async function packCode(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream !== 'undefined') return CODE_PREFIX + 'z.' + b64u(await streamBytes(raw, CompressionStream));
  return CODE_PREFIX + 'r.' + b64u(raw);
}
// accepte le code seul, ou un lien qui le contient (…#sdc=CODE) ; null si illisible
async function unpackCode(text) {
  try {
    const m = String(text || '').replace(/\s+/g, '').match(/SDC1([zr])\.([A-Za-z0-9_-]+)/);
    if (!m || m[2].length > 20000) return null;
    let bytes = unb64u(m[2]);
    if (m[1] === 'z') { if (typeof DecompressionStream === 'undefined') return null; bytes = await streamBytes(bytes, DecompressionStream); }
    const o = JSON.parse(new TextDecoder().decode(bytes));
    return o && typeof o === 'object' && (o.k === 'o' || o.k === 'a') && typeof o.sdp === 'string' && o.sdp.length < 12000 ? o : null;
  } catch (e) { return null; }
}

// ---------- transport WebRTC (navigateur) : deux canaux, rapide (non fiable) pour l'état, fiable pour le reste ----------
const ICE_PUBLIC = [{ urls: 'stun:stun.l.google.com:19302' }];
function rtcLink(pc) {
  const link = { onmessage: null, onclose: null, open: false };
  let rel = null, fast = null, closed = false;
  const wire = (ch) => {
    ch.onmessage = (e) => link.onmessage && link.onmessage(e.data);
    ch.onclose = () => fin();
  };
  const fin = () => { if (closed) return; closed = true; link.open = false; try { pc.close(); } catch (e) { /* déjà fermé */ } link.onclose && link.onclose(); };
  link.attach = (r, f) => { rel = r; fast = f; wire(r); wire(f); };
  link.send = (s, isFast) => { const ch = isFast && fast && fast.readyState === 'open' ? fast : rel; if (ch && ch.readyState === 'open') ch.send(s); };
  link.close = () => fin();
  pc.addEventListener('connectionstatechange', () => { if (['failed', 'closed'].includes(pc.connectionState)) fin(); });
  return link;
}
const gathered = (pc, ms) => new Promise((res) => {
  if (pc.iceGatheringState === 'complete') return res();
  const done = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', done); res(); } };
  pc.addEventListener('icegatheringstatechange', done);
  setTimeout(res, ms || 2500);
});
// hôte : crée une offre ; accept(code de réponse) termine la poignée de main ; ready() résout à l'ouverture
async function rtcOffer(internet) {
  const pc = new RTCPeerConnection({ iceServers: internet ? ICE_PUBLIC : [] });
  const link = rtcLink(pc);
  const rel = pc.createDataChannel('rel', { ordered: true }), fast = pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 });
  link.attach(rel, fast);
  const ready = new Promise((res) => { rel.onopen = () => { link.open = true; res(link); }; });
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  const code = await packCode({ k: 'o', sdp: pc.localDescription.sdp, net: internet ? 1 : 0 });
  return {
    code, link, ready,
    async accept(text) { const o = await unpackCode(text); if (!o || o.k !== 'a') return false; await pc.setRemoteDescription({ type: 'answer', sdp: o.sdp }); return true; },
    cancel() { link.close(); },
  };
}
// invité : lit l'offre, renvoie le code de réponse
async function rtcAnswer(text) {
  const o = await unpackCode(text); if (!o || o.k !== 'o') return null;
  const pc = new RTCPeerConnection({ iceServers: o.net ? ICE_PUBLIC : [] });
  const link = rtcLink(pc);
  let rel = null, fast = null, res = null;
  const ready = new Promise((r) => { res = r; });
  pc.ondatachannel = (e) => {
    if (e.channel.label === 'rel') rel = e.channel; else fast = e.channel;
    if (rel && fast) { link.attach(rel, fast); const go = () => { link.open = true; res(link); }; if (rel.readyState === 'open') go(); else rel.onopen = go; }
  };
  await pc.setRemoteDescription({ type: 'offer', sdp: o.sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  return { code: await packCode({ k: 'a', sdp: pc.localDescription.sdp }), link, ready, internet: !!o.net };
}

// ---------- transport local (onglets d'un même navigateur, pour les essais) ----------
function localLinks(channelName) {
  const bc = new BroadcastChannel(channelName || 'sdc-net');
  const me = Math.random().toString(36).slice(2);
  const links = new Map();
  const mk = (other) => {
    const l = { onmessage: null, onclose: null, open: true };
    l.send = (s) => bc.postMessage({ from: me, to: other, s });
    l.close = () => { bc.postMessage({ from: me, to: other, bye: 1 }); links.delete(other); };
    links.set(other, l);
    return l;
  };
  const api = { onguest: null, host: false };
  bc.onmessage = (e) => {
    const m = e.data; if (!m || m.from === me) return;
    if (m.knock && api.host) { const l = mk(m.from); bc.postMessage({ from: me, to: m.from, ok: 1 }); api.onguest && api.onguest(l); return; }
    if (m.to !== me) return;
    if (m.ok && api.pending) { const l = mk(m.from); const p = api.pending; api.pending = null; p(l); return; }
    const l = links.get(m.from); if (!l) return;
    if (m.bye) { links.delete(m.from); l.onclose && l.onclose(); return; }
    l.onmessage && l.onmessage(m.s);
  };
  api.listen = () => { api.host = true; };
  api.knock = () => new Promise((res) => { api.pending = res; bc.postMessage({ from: me, knock: 1 }); });
  return api;
}

const Net = {
  MAX: NET_MAX, HZ: NET_HZ, DELAY: NET_DELAY, EMOTES, COLORS: NET_COLORS, ST_KEYS,
  encodeState, decodeState, cleanName, sanitizePeer, createInterp, createSession, cleanEvent, packCode, unpackCode,
  rtcOffer, rtcAnswer, localLinks,
};
if (typeof module !== 'undefined') module.exports = Net;
