// Point d'entrée : initialise les modules du jeu dans l'ordre.
import { init as base } from './game/base.js';
import { init as stage } from './game/stage.js';
import { init as input } from './game/input.js';
import { init as touch } from './game/touch.js';
import { init as score } from './game/score.js';
import { init as loop } from './game/loop.js';
import { init as hud } from './game/hud.js';
import { init as session } from './game/session.js';
import { init as menus } from './game/menus.js';
import { init as adventure } from './game/adventure.js';
import { init as islandWorld } from './game/island/world.js';
import { init as islandInteract } from './game/island/interact.js';
import { init as islandMap } from './game/island/map.js';
import { init as multiplayer } from './game/multiplayer.js';
import { init as moments } from './game/moments.js';
import { init as boot } from './game/boot.js';

for (const init of [
  base,
  stage,
  input,
  touch,
  score,
  loop,
  hud,
  session,
  menus,
  adventure,
  islandWorld,
  islandInteract,
  islandMap,
  multiplayer,
  moments,
  boot,
])
  init();
