// Session en étoile : l'hôte relaie tout. Un lien = { send(msg, fast), close(), onmessage, onclose }.
import { EMOTES, NET_COLORS, NET_MAX, NET_MSG_MAX, cleanEvent, cleanName, sanitizePeer } from './sanitize.js';
import { decodeState } from './state.js';

// me : { name, kind, cfg }. on(type, data) reçoit : 'peers' (liste), 'join'/'leave' (pair), 'state' (id, état),
// 'emote' (id, e), 'ev' (id, évènement de groupe), 'welcome' (données de l'hôte), 'closed'.
export function createSession(me, on, Eco) {
  const S = { role: null, id: null, peers: new Map(), links: new Map(), me, nextId: 1, hostAt: null };
  const emit = (t, d) => {
    try {
      on(t, d);
    } catch (e) {
      /* l'interface ne doit pas casser le réseau */
    }
  };
  const peerList = () => [...S.peers.entries()].map(([id, p]) => ({ id, name: p.name, kind: p.kind, cfg: p.cfg }));
  const bySize = (msg) => {
    try {
      const s = typeof msg === 'string' ? msg : JSON.stringify(msg);
      return s.length <= NET_MSG_MAX ? s : null;
    } catch (e) {
      return null;
    }
  };
  function sendTo(link, msg, fast) {
    const s = bySize(msg);
    if (s)
      try {
        link.send(s, fast);
      } catch (e) {
        /* lien fermé */
      }
  }
  function broadcast(msg, except, fast) {
    for (const [id, l] of S.links) if (id !== except) sendTo(l, msg, fast);
  }
  function parse(raw) {
    if (typeof raw !== 'string' || raw.length > NET_MSG_MAX) return null;
    try {
      const m = JSON.parse(raw);
      return m && typeof m === 'object' ? m : null;
    } catch (e) {
      return null;
    }
  }

  // hôte : chaque invité reçoit un numéro à son arrivée
  S.host = () => {
    S.role = 'host';
    S.id = 0;
    S.peers.set(0, { name: cleanName(me.name), kind: me.kind, cfg: me.cfg, color: NET_COLORS[0] });
    return S;
  };
  S.addGuestLink = (link) => {
    let id = null;
    link.onmessage = (raw) => {
      const m = parse(raw);
      if (!m) return;
      if (id == null) {
        if (m.t !== 'hello') return;
        if (S.peers.size >= NET_MAX) {
          sendTo(link, { t: 'full' });
          link.close();
          return;
        }
        const p = sanitizePeer(m, Eco);
        if (!p) return;
        id = S.nextId++;
        p.color = NET_COLORS[id % NET_COLORS.length];
        S.peers.set(id, p);
        S.links.set(id, link);
        sendTo(link, { t: 'welcome', id, peers: peerList(), at: S.hostAt });
        broadcast({ t: 'join', id, name: p.name, kind: p.kind, cfg: p.cfg }, id);
        emit('join', { id, ...p });
        emit('peers', peerList());
        return;
      }
      relay(id, m);
    };
    link.onclose = () => {
      if (id == null) return;
      S.links.delete(id);
      S.peers.delete(id);
      broadcast({ t: 'leave', id });
      emit('leave', { id });
      emit('peers', peerList());
    };
  };
  function relay(id, m) {
    if (m.t === 'st') {
      const s = decodeState(m.d);
      if (!s) return;
      emit('state', { id, s });
      broadcast({ t: 'st', id, d: m.d }, id, true);
    } else if (m.t === 'emote' && EMOTES[m.e]) {
      emit('emote', { id, e: m.e });
      broadcast({ t: 'emote', id, e: m.e }, id);
    } else if (m.t === 'ev' && m.ev && typeof m.ev === 'object') {
      const ev = cleanEvent(m.ev, false);
      if (ev) {
        emit('ev', { id, ev });
        broadcast({ t: 'ev', id, ev }, id);
      }
    }
  }

  // invité : un seul lien, vers l'hôte
  S.join = (link) => {
    S.role = 'guest';
    S.links.set(0, link);
    link.onmessage = (raw) => {
      const m = parse(raw);
      if (!m) return;
      if (m.t === 'welcome' && Number.isInteger(m.id) && Array.isArray(m.peers)) {
        S.id = m.id;
        S.peers.clear();
        for (const q of m.peers.slice(0, NET_MAX)) {
          const p = sanitizePeer(q, Eco);
          if (p && Number.isInteger(q.id)) {
            p.color = NET_COLORS[q.id % NET_COLORS.length];
            S.peers.set(q.id, p);
          }
        }
        S.hostAt =
          m.at && isFinite(m.at.x) && isFinite(m.at.z) && isFinite(m.at.h)
            ? { x: +m.at.x, z: +m.at.z, h: +m.at.h }
            : null;
        emit('welcome', { id: S.id, at: S.hostAt });
        emit('peers', peerList());
      } else if (m.t === 'join' && Number.isInteger(m.id)) {
        const p = sanitizePeer(m, Eco);
        if (p) {
          p.color = NET_COLORS[m.id % NET_COLORS.length];
          S.peers.set(m.id, p);
          emit('join', { id: m.id, ...p });
          emit('peers', peerList());
        }
      } else if (m.t === 'leave' && Number.isInteger(m.id)) {
        S.peers.delete(m.id);
        emit('leave', { id: m.id });
        emit('peers', peerList());
      } else if (m.t === 'st' && Number.isInteger(m.id) && m.id !== S.id) {
        const s = decodeState(m.d);
        if (s) emit('state', { id: m.id, s });
      } else if (m.t === 'emote' && Number.isInteger(m.id) && EMOTES[m.e]) emit('emote', { id: m.id, e: m.e });
      else if (m.t === 'ev' && Number.isInteger(m.id)) {
        const ev = cleanEvent(m.ev, m.id === 0);
        if (ev) emit('ev', { id: m.id, ev });
      } else if (m.t === 'full') emit('full', {});
    };
    link.onclose = () => {
      S.links.clear();
      S.peers.clear();
      emit('closed', {});
    };
    sendTo(link, { t: 'hello', name: cleanName(me.name), kind: me.kind, cfg: me.cfg });
  };

  // envois locaux
  S.sendState = (d) => {
    if (S.role === 'host') broadcast({ t: 'st', id: 0, d }, null, true);
    else if (S.role === 'guest') sendTo(S.links.get(0), { t: 'st', d }, true);
  };
  S.emote = (e) => {
    if (!EMOTES[e]) return;
    if (S.role === 'host') broadcast({ t: 'emote', id: 0, e });
    else if (S.links.get(0)) sendTo(S.links.get(0), { t: 'emote', e });
  };
  S.event = (ev) => {
    const c = cleanEvent(ev, S.role === 'host');
    if (!c) return;
    if (S.role === 'host') broadcast({ t: 'ev', id: 0, ev: c });
    else if (S.links.get(0)) sendTo(S.links.get(0), { t: 'ev', ev: c });
  };
  S.setHostAt = (x, z, h) => {
    S.hostAt = { x, z, h };
  };
  S.close = () => {
    for (const l of S.links.values())
      try {
        l.close();
      } catch (e) {
        /* déjà fermé */
      }
    S.links.clear();
    S.peers.clear();
    S.role = null;
  };
  S.peerList = peerList;
  return S;
}
