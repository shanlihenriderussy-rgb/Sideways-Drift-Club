import { game } from '../state.js';
import { Sound } from '../../audio/sound.js';
import { profile, saveProfile, settings, store } from '../base.js';
import { refreshWallet, toast } from '../menus.js';
import { vibrate } from '../score.js';
import { resumeGame, screenId, show } from '../session.js';
import { camera, gy, renderer, scene } from '../stage.js';
import { clearTouch } from '../touch.js';
import { IsleLife } from '../../island/life.js';
import { Economy } from '../../progress/economy.js';
import { $ } from '../../util/dom.js';
import { setPrompt } from './interact.js';

const ALBUM = 'isleAlbum';
const MAX_JPEG = 240000;
let albumBack = 'career';
let flashTimer = null;
export let photoMode = null;

export function openPhoto(spot) {
  game.phase = 'pause';
  Sound.suspend();
  clearTouch();
  setPrompt(null);
  photoMode = { spot, camera: camera.clone(), t: game.last / 1000 };
  $('photoTitle').textContent = spot.def.name;
  $('photoAngle').value = 0;
  $('photoDistance').value = 12;
  $('photoStatus').textContent = '';
  document.body.classList.add('photographing');
  show('photoMode');
}

export function exitPhoto() {
  photoMode = null;
  document.body.classList.remove('photographing');
}

export function photoCamera() {
  const shot = photoMode.camera;
  const car = game.player;
  const {
    look: [x, z],
    lookHeight = 0,
  } = photoMode.spot.def;
  const base = Math.atan2(z - car.z, x - car.x);
  const turn = (Number($('photoAngle').value) * Math.PI) / 180;
  const angle = base + turn;
  const dist = Number($('photoDistance').value);
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const cx = car.x - dx * dist;
  const cz = car.z - dz * dist;
  const ground = gy(car.x, car.z);
  const y = Math.max(ground, gy(cx, cz)) + 1.7 + dist * 0.07;
  const carPitch = Math.atan2(ground + 0.7 - y, dist);
  const landmarkPitch = Math.atan2(gy(x, z) + lookHeight - y, Math.hypot(x - car.x, z - car.z) + dist);
  const span = (landmarkPitch - carPitch) * Math.max(0, Math.cos(turn));
  const pitch = carPitch + span * 0.52;
  shot.position.set(cx, y, cz);
  shot.lookAt(car.x, y + Math.tan(pitch) * dist, car.z);
  shot.aspect = camera.aspect;
  const wide = (Math.atan(Math.tan(Math.abs(span) / 2 + 0.068) / 0.56) * 360) / Math.PI;
  shot.fov = Math.min(82, Math.max(wide, shot.aspect < 1 ? 57 : 43));
  shot.updateProjectionMatrix();
  return shot;
}

function readAlbum() {
  const raw = store.get(ALBUM, null);
  const album = {};
  for (const { id } of IsleLife.PHOTO_SPOTS) {
    const img = raw?.[id];
    if (typeof img === 'string' && img.length < MAX_JPEG && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(img))
      album[id] = img;
  }
  return album;
}

function takePhoto() {
  if (screenId !== 'photoMode' || !photoMode) return;
  let jpg;
  try {
    const source = renderer.domElement;
    const frame = document.querySelector('.photo-frame').getBoundingClientRect();
    const view = source.getBoundingClientRect();
    const rx = source.width / view.width;
    const ry = source.height / view.height;
    const w = frame.width * rx;
    const h = frame.height * ry;
    const scale = Math.min(1, 800 / Math.max(w, h));
    const output = document.createElement('canvas');
    output.width = Math.max(1, Math.round(w * scale));
    output.height = Math.max(1, Math.round(h * scale));
    // Recapture synchrone du tampon WebGL avant que le navigateur ne le libère. Le HUD est superposé en HTML.
    renderer.render(scene, photoCamera());
    output
      .getContext('2d')
      .drawImage(
        source,
        (frame.left - view.left) * rx,
        (frame.top - view.top) * ry,
        w,
        h,
        0,
        0,
        output.width,
        output.height,
      );
    jpg = output.toDataURL('image/jpeg', 0.82);
  } catch {
    jpg = null;
  }
  if (!jpg?.startsWith('data:image/jpeg;base64,') || jpg.length >= MAX_JPEG) {
    photoMessage('La capture a échoué. Réessaie.', 'lost');
    return;
  }
  const { id, name, line } = photoMode.spot.def;
  const kept = store.set(ALBUM, { ...readAlbum(), [id]: jpg });
  const r = IsleLife.photoTaken(profile, id);
  if (r) {
    saveProfile();
    refreshWallet();
    game.life.stats.photos++;
  }
  Sound.shutter();
  vibrate(20);
  if (!settings.reduce) {
    const f = $('flash');
    clearTimeout(flashTimer);
    f.hidden = true;
    f.className = 'soft';
    void f.offsetWidth;
    f.hidden = false;
    flashTimer = setTimeout(() => {
      f.hidden = true;
      f.className = '';
    }, 650);
  }
  const message = kept ? `${name} · photo dans l’album` : 'Photo prise · stockage indisponible';
  photoMessage(message + (r ? ` · +${Economy.fmt(r)} · Lou : « ${line} »` : ''), r ? 'chal' : 'apex');
}

function photoMessage(message, kind) {
  $('photoStatus').textContent = message;
  toast(message, kind);
}

function openAlbum() {
  albumBack = screenId;
  const album = readAlbum();
  const count = Object.keys(album).length;
  $('albumProgress').textContent = count
    ? `${count} / ${IsleLife.PHOTO_SPOTS.length} photos conservées sur cet appareil.`
    : 'Arrête-toi dans un belvédère de l’île pour prendre ta première photo.';
  const photos = IsleLife.isleBag(profile).photo;
  $('albumItems').replaceChildren(
    ...IsleLife.PHOTO_SPOTS.map(({ id, name }) => {
      const li = document.createElement('li');
      const info = document.createElement('div');
      info.className = 'album-meta';
      const title = document.createElement('strong');
      title.textContent = name;
      info.append(title);
      if (album[id]) {
        const img = document.createElement('img');
        img.src = album[id];
        img.alt = name;
        const a = document.createElement('a');
        a.href = album[id];
        a.download = `sideways-${id}.jpg`;
        a.textContent = 'Télécharger';
        a.setAttribute('aria-label', `Télécharger la photo : ${name}`);
        li.append(img);
        info.append(a);
      } else {
        const status = document.createElement('span');
        status.className = 'album-empty';
        status.textContent = photos[id] ? 'À reprendre' : 'À photographier';
        li.append(status);
      }
      li.append(info);
      return li;
    }),
  );
  show('isleAlbum');
}

export function init() {
  $('photoExit').addEventListener('click', resumeGame);
  $('photoShutter').addEventListener('click', takePhoto);
  $('careerAlbum').addEventListener('click', openAlbum);
  $('mapAlbum').addEventListener('click', openAlbum);
  $('albumBack').addEventListener('click', () => show(albumBack));
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.repeat) return;
    if (screenId === 'photoMode') resumeGame();
    else if (screenId === 'isleAlbum') show(albumBack);
  });
}
