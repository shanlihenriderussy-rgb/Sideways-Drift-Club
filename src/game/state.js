// État mutable partagé entre les modules du jeu.
// Règle : un module lit ce qu'il veut par import, mais toute valeur réaffectée depuis plusieurs modules vit ici.
// Les valeurs à `undefined` sont posées au démarrage par le module qui les possède (indiqué à droite).
export const game = {
  // --- qualité d'affichage (stage.js, loop.js)
  qLevel: undefined, // 'low' | 'med' | 'high'
  quality: undefined, // entrée de QUALITY correspondante
  dprScale: 1, // résolution dynamique : facteur appliqué au pixel ratio
  fastT: 0, // secondes d'aisance cumulées avant de remonter la résolution

  // --- session en cours
  phase: 'menu', // menu | count | play | pause | results | replay
  mode: undefined, // 'run' | 'tandem' | 'free' (stage.js)
  trackIdx: undefined, // piste choisie (stage.js)
  returnTo: 'menu', // écran de retour après un run
  last: undefined, // horodatage de la dernière image (boot.js)
  acc: 0, // reliquat de temps à simuler (pas fixe de 1/120 s)

  // --- monde chargé (scene.js)
  track: null,
  world: null,
  line: null, // ligne de drift du leader
  envMap: null,

  // --- voitures
  player: null, // état physique
  playerModel: null,
  leader: null,
  leaderModel: null,

  // --- effets
  smoke: null,
  sparks: null,
  skids: null,
  shake: 0,

  // --- caméra
  camMode: undefined, // vue choisie (stage.js)
  snapCam: false, // prochaine image : placer la caméra sans lissage

  // --- atelier
  showKind: null, // aperçu : voiture affichée à la place de la voiture possédée
  showCfg: null,
  shopView: undefined, // cadrage de l'atelier (menus.js)
  garageYaw: 0,
  shopReturn: 'menu',

  // --- aide
  helpThenSelect: false,
  helpSeen: undefined, // (input.js)

  // --- aventure
  adv: null, // { ci, k } mission | { explore, ci } exploration
  advSel: undefined, // chapitre affiché (adventure.js)
  advNext: null,

  // --- île
  life: null, // circulation, rivaux, épreuves, GPS

  // --- enregistrements
  ghostRec: null, // fantôme en cours d'enregistrement
  hlRec: null, // enregistrement des moments forts

  // --- essais
  dbgTrace: null,
};
