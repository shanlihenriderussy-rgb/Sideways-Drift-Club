// Codes d'invitation : description de session WebRTC compressée (deflate-raw) en base64url. Rien n'est stocké en ligne.
const CODE_PREFIX = 'SDC1';
const b64u = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s) => {
  const t = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const u = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i);
  return u;
};
async function streamBytes(bytes, Stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw')));
  return new Uint8Array(await res.arrayBuffer());
}
export async function packCode(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream !== 'undefined')
    return CODE_PREFIX + 'z.' + b64u(await streamBytes(raw, CompressionStream));
  return CODE_PREFIX + 'r.' + b64u(raw);
}
// accepte le code seul, ou un lien qui le contient (…#sdc=CODE) ; null si illisible
export async function unpackCode(text) {
  try {
    const m = String(text || '')
      .replace(/\s+/g, '')
      .match(/SDC1([zr])\.([A-Za-z0-9_-]+)/);
    if (!m || m[2].length > 20000) return null;
    let bytes = unb64u(m[2]);
    if (m[1] === 'z') {
      if (typeof DecompressionStream === 'undefined') return null;
      bytes = await streamBytes(bytes, DecompressionStream);
    }
    const o = JSON.parse(new TextDecoder().decode(bytes));
    return o &&
      typeof o === 'object' &&
      (o.k === 'o' || o.k === 'a') &&
      typeof o.sdp === 'string' &&
      o.sdp.length < 12000
      ? o
      : null;
  } catch (e) {
    return null;
  }
}
