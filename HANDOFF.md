# Handoff — Sideways Drift Club

Date : 2026-10-14 · Branche : `claude/optimistic-fermi-xni0xz` (dépôt `shanlihenriderussy-rgb/Sideways-Drift-Club`)
Version publiée : https://claude.ai/artifact/GWQqXoGW5RECCCmMESYCtL (v2, privée — pas encore mise à jour) · Vercel depuis `main`

## État
Jeu de drift mobile en 3D, inspiré de FR Legends. Une seule page HTML autonome, avec Three.js r128 chargé depuis cdnjs.
- **Contenu** : 3 pistes (Docks de Minato la nuit, Col d'Akane au coucher du soleil, Piton Volcan de jour) et 3 voitures (HACHI, KOUKI, RAIJIN).
- **Voitures** : caisse lissée (loft) avec passages de roue et ailes galbées, habitacle vitré avec intérieur (baquets, volant à droite), livrée peinte sur la caisse, phares et feux propres à chaque modèle, 5 dessins de jantes, freins visibles.
- **Décors** : ciel peint (nuages, étoiles, halo de ville), deux crêtes de montagnes, route et murs par lieu, décor détaillé par thème, tribune, piles de pneus, chevrons de virage, eau animée.
- **Économie** (`src/economy.js`) : portefeuille en ¥ (monnaie fictive), gains de fin de run détaillés, bonus quotidien en série, 14 défis, historique, migration de l'ancienne clé `sdc:garage`.
- **Atelier** (`src/shop.js`) : voitures, carrosserie, peinture, roues, performances (impact physique), réglages visuels ; aperçu avant achat ; caméra par rayon ; rotation au doigt.
- **Fluidité** : affichage interpolé entre pas physiques, envois GPU partiels, HUD en transform, shaders précompilés, résolution dynamique.
- **Favicon** : SVG intégré, icônes d'application, manifeste ; en combo, l'onglet affiche le multiplicateur.
- **Modes, commandes, accessibilité, son** : inchangés (voir README).
- **Données** : aucune donnée personnelle. Réglages, records et profil en `localStorage`. Mention « conçu avec une IA » dans l'aide ; « monnaie fictive, sans achat réel » dans Carrière.

## Mesures de référence
| Mesure | Valeur |
|---|---|
| Appels de dessin / image (tandem) | 65–68 (cible < 100) |
| JS / image | 0,4–0,5 ms ; 1,9–2,8 ms avec CPU ralenti ×6 |
| Saccade d'affichage 60/90/120/144 Hz | 0,1 % (avant : 0,4 % à 60 Hz, 14–60 % au-delà) |
| Chargement d'une piste, CPU ×6 | 0,38–0,52 s (avant : ≤ 0,35 s, décor bien plus pauvre) |
| Tests économie | 16/16 (`node --test tests/*.test.js`) |
| Banc physique sans amélioration | identique à l'origine (`tools/tune.js`, `tools/tune2.js hold`) |
| Bot expert, Col d'Akane, KOUKI | 21,3 k en moyenne contre 22,0 k pour la version d'origine (bruit d'un run à l'autre : 17 à 27 k) |

## Décisions actives
- **Fichier unique** : `build.mjs` concatène `src/*` → `index.html`. Ordre : physics, economy, track, world, car, fx, audio, ai, shop, game. Le favicon SVG est intégré en data URI ; icônes PNG et manifeste ne sont liés qu'en production (pas dans `test.html`).
- **Économie pure** : `economy.js` ne touche ni au DOM ni à Three.js ; tout passe par le profil et renvoie `{ ok, reason, … }`. Les pièces à 0 ¥ sont toujours possédées. Une pièce équipée mais non payée revient à l'origine au chargement.
- **Fiche tunée** : `tunedSpec` copie la fiche de base. Sans amélioration, la physique est strictement identique (vérifié au banc).
- **Livrée** : une texture 1024×512 enveloppe la caisse. Flanc droit v∈[0,7;1], dessus v∈[0,3;0,7], flanc gauche v∈[0;0,3]. Les zones y < 0,2 m servent d'atlas (plaque, bandeau de pare-brise, peinture unie des faces avant/arrière).
- **Roues** : `InstancedMesh` (pneu, jante, fût, disque, étrier), 4 instances. Roues gauches tournées de π (pas de miroir : un déterminant négatif inverserait les faces).
- **Atelier** : l'aperçu ne reconstruit que ta voiture (`buildCars(true)`). Quitter l'atelier abandonne l'aperçu non payé.
- **Interpolation** : `player.x0/z0/h0` mémorisés avant chaque pas de 1/120 s ; affichage, caméra et fumée lisent l'état interpolé, score et collisions l'état physique.
- **Qualité auto** : la résolution baisse d'abord (en 1–2 pas, coût ∝ dpr²), puis un cran de qualité ; elle remonte après 8 s d'aisance. Appliquée après le rendu.
- **Reflets** : cubemap peinte sur canvas. Pas de PMREM.
- **Profondeur** : sol à y = −0,12 avec `polygonOffset`, caméra `near` = 0,5.

## Pièges
- **Sens des triangles** : bandes de route et murs, normale vers le haut ou vers la piste. Le loft de caisse : quad (i,j)→(i,j+1)→(i+1,j) pour une normale sortante.
- **Texte de livrée** : chaque bande a son propre sens (flanc droit retourné verticalement, flanc gauche en miroir, dessus tourné). Passer par `text()` dans `paintLivery`, jamais `fillText` direct.
- **Canvas** : `getImageData` sur un canvas accéléré force une relecture GPU très lente, et `createImageData`/`putImageData` n'est pas plus rapide que `fillRect` ici. Réduire le nombre de mouchetures plutôt.
- **Passages de roue** : demi-cylindre `thetaStart = π/2` (sinon il pend sous la caisse).
- **`[hidden]`** : la règle `display:none !important` est indispensable.
- **`touch-action`** : `none` sur `body`, `pan-y` sur `.card`, `pan-x` sur les onglets de l'atelier.
- **`tools/*.js`** : chemins écrits pour le conteneur d'origine (`__dirname + '/test.html'`). Remplacer par le chemin absolu de `test.html` avant de lancer.
- **three.js local** : cdnjs peut être bloqué par le proxy ; `npm pack three@0.128.0` puis copier `package/build/three.min.js` dans `vendor/`.
- **Points d'accès de test** : `window.__sdc`, `__sdcDbg` (dont `preview`, `view`, `trace`, `profile`), `lossLog`, `Sound._debug`. Sans effet sur le jeu.

## Non vérifié (hors de portée de l'environnement)
- Images par seconde réelles sur un Android milieu de gamme (rendu logiciel ici).
- Équilibre de l'économie sur de vraies parties (prix, gains, rythme de progression).
- Ergonomie de l'atelier sur petit écran tactile réel (vérifiée en émulation 844×390 et 390×844).
- Écoute du son (nouveau jingle d'encaissement).

## Prochaine tranche
1. Test sur téléphone : fps (`window.__sdc.fps`), lisibilité de l'atelier, temps de chargement d'une piste.
2. Ajuster prix et gains après 10 parties réelles (`CAR_PRICES`, `SHOP`, `PERF`, `computePayout`).
3. Mettre à jour l'artifact publié depuis `index.html` (passer son URL en `url`).
4. Pistes d'évolution : fantôme du meilleur tour, 4e piste, vente de pièces.

## Reprise rapide
```
mkdir -p vendor && npm pack three@0.128.0 && tar xzf three-0.128.0.tgz package/build/three.min.js && cp package/build/three.min.js vendor/
node build.mjs --local        # test.html à ouvrir dans un navigateur
node build.mjs                # index.html à déployer (Vercel / GitHub Pages)
node --test tests/*.test.js   # économie
node tools/tune2.js hold      # banc physique (Node seul)
```
