// Transports : WebRTC (deux canaux : rapide et non fiable pour l'état, fiable pour le reste) et lien local entre onglets.
import { packCode, unpackCode } from './invite.js';

const ICE_PUBLIC = [{ urls: 'stun:stun.l.google.com:19302' }];
function rtcLink(pc) {
  const link = { onmessage: null, onclose: null, open: false };
  let rel = null,
    fast = null,
    closed = false;
  const wire = (ch) => {
    ch.onmessage = (e) => link.onmessage && link.onmessage(e.data);
    ch.onclose = () => fin();
  };
  const fin = () => {
    if (closed) return;
    closed = true;
    link.open = false;
    try {
      pc.close();
    } catch (e) {
      /* déjà fermé */
    }
    link.onclose && link.onclose();
  };
  link.attach = (r, f) => {
    rel = r;
    fast = f;
    wire(r);
    wire(f);
  };
  link.send = (s, isFast) => {
    const ch = isFast && fast && fast.readyState === 'open' ? fast : rel;
    if (ch && ch.readyState === 'open') ch.send(s);
  };
  link.close = () => fin();
  pc.addEventListener('connectionstatechange', () => {
    if (['failed', 'closed'].includes(pc.connectionState)) fin();
  });
  return link;
}
const gathered = (pc, ms) =>
  new Promise((res) => {
    if (pc.iceGatheringState === 'complete') return res();
    const done = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', done);
        res();
      }
    };
    pc.addEventListener('icegatheringstatechange', done);
    setTimeout(res, ms || 2500);
  });
// hôte : crée une offre ; accept(code de réponse) termine la poignée de main ; ready() résout à l'ouverture
export async function rtcOffer(internet) {
  const pc = new RTCPeerConnection({ iceServers: internet ? ICE_PUBLIC : [] });
  const link = rtcLink(pc);
  const rel = pc.createDataChannel('rel', { ordered: true }),
    fast = pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 });
  link.attach(rel, fast);
  const ready = new Promise((res) => {
    rel.onopen = () => {
      link.open = true;
      res(link);
    };
  });
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  const code = await packCode({ k: 'o', sdp: pc.localDescription.sdp, net: internet ? 1 : 0 });
  return {
    code,
    link,
    ready,
    async accept(text) {
      const o = await unpackCode(text);
      if (!o || o.k !== 'a') return false;
      await pc.setRemoteDescription({ type: 'answer', sdp: o.sdp });
      return true;
    },
    cancel() {
      link.close();
    },
  };
}
// invité : lit l'offre, renvoie le code de réponse
export async function rtcAnswer(text) {
  const o = await unpackCode(text);
  if (!o || o.k !== 'o') return null;
  const pc = new RTCPeerConnection({ iceServers: o.net ? ICE_PUBLIC : [] });
  const link = rtcLink(pc);
  let rel = null,
    fast = null,
    res = null;
  const ready = new Promise((r) => {
    res = r;
  });
  pc.ondatachannel = (e) => {
    if (e.channel.label === 'rel') rel = e.channel;
    else fast = e.channel;
    if (rel && fast) {
      link.attach(rel, fast);
      const go = () => {
        link.open = true;
        res(link);
      };
      if (rel.readyState === 'open') go();
      else rel.onopen = go;
    }
  };
  await pc.setRemoteDescription({ type: 'offer', sdp: o.sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  return { code: await packCode({ k: 'a', sdp: pc.localDescription.sdp }), link, ready, internet: !!o.net };
}

// ---------- transport local (onglets d'un même navigateur, pour les essais) ----------
export function localLinks(channelName) {
  const bc = new BroadcastChannel(channelName || 'sdc-net');
  const me = Math.random().toString(36).slice(2);
  const links = new Map();
  const mk = (other) => {
    const l = { onmessage: null, onclose: null, open: true };
    l.send = (s) => bc.postMessage({ from: me, to: other, s });
    l.close = () => {
      bc.postMessage({ from: me, to: other, bye: 1 });
      links.delete(other);
    };
    links.set(other, l);
    return l;
  };
  const api = { onguest: null, host: false };
  bc.onmessage = (e) => {
    const m = e.data;
    if (!m || m.from === me) return;
    if (m.knock && api.host) {
      const l = mk(m.from);
      bc.postMessage({ from: me, to: m.from, ok: 1 });
      api.onguest && api.onguest(l);
      return;
    }
    if (m.to !== me) return;
    if (m.ok && api.pending) {
      const l = mk(m.from);
      const p = api.pending;
      api.pending = null;
      p(l);
      return;
    }
    const l = links.get(m.from);
    if (!l) return;
    if (m.bye) {
      links.delete(m.from);
      l.onclose && l.onclose();
      return;
    }
    l.onmessage && l.onmessage(m.s);
  };
  api.listen = () => {
    api.host = true;
  };
  api.knock = () =>
    new Promise((res) => {
      api.pending = res;
      bc.postMessage({ from: me, knock: 1 });
    });
  return api;
}
