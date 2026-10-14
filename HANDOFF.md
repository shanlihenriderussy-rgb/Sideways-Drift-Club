# Handoff — Sideways Drift Club

Date : 2026-10-09 · Source : commit `f9cb2f9` (branche orpheline `game/sideways-drift-club`, dépôt `pharmaciedufourachaux`)
Version publiée : https://claude.ai/artifact/GWQqXoGW5RECCCmMESYCtL (v2, privée)

## État
Jeu de drift mobile en 3D, inspiré de FR Legends. Une seule page HTML autonome, avec Three.js r128 chargé depuis cdnjs.
- **Contenu** : 3 pistes (Docks de Minato la nuit, Col d'Akane au coucher du soleil, Piton Volcan de jour) et 3 voitures (HACHI, KOUKI, RAIJIN), avec peinture, jantes et numéro.
- **Modes** : Run noté (1 tour, note S→D), Tandem (leader IA), Libre.
- **Score** : angle × vitesse, multiplicateur jusqu'à x8, zones de clipping extérieures (orange) et cordes (bleu). Le combo est perdu sur un choc, un tête-à-queue ou une sortie de piste.
- **Commandes** : tactile (direction, gaz, frein, frein à main), clavier AZERTY et QWERTY, manette.
- **Accessibilité** : accélérateur automatique, 3 niveaux d'assistance, gaucher, taille des boutons, mouvements réduits, aria-live.
- **Son** : 100 % synthétisé avec Web Audio (moteur, turbo, crissement, impacts).
- **Données** : aucune donnée personnelle. Réglages et records en `localStorage` sur l'appareil. La mention « conçu avec une IA » figure dans l'écran d'aide.

## Mesures de référence
| Mesure | Valeur |
|---|---|
| Appels de dessin / image | 68–79 (cible < 100) |
| JS / image | 0,5–0,8 ms ; 2,8–3,4 ms avec CPU ralenti ×6 |
| Chargement d'une piste | ≤ 350 ms avec CPU ralenti ×6 |
| Audio | fondamentale = tr/min ÷ 60 × 2 ; crissement +12 dB en glisse ; crête 0,81, pas de saturation |
| Barème (`par` dans `src/track.js`) | 32 k / 33 k / 46 k (×1,25 en tandem). Tour propre du bot expert ≈ A |

## Décisions actives
- **Fichier unique** : `build.mjs` concatène `src/*` → `index.html` (document complet). Pas de bundler, pas de dépendance npm.
- **Physique** : modèle bicyclette avec pneus saturés, plus un régulateur d'angle d'arcade (`c.drift`, cible β pilotée par le gaz et la direction). L'assistance 0 désactive le régulateur (mode « Simu »).
- **Reflets** : cubemap peinte sur canvas. **Pas de PMREM**, qui rendait les voitures noires sous swiftshader et présente un risque sur les GPU mobiles.
- **Performances** : pièces des voitures, grues et repères de zones fusionnées par matériau (`mergeByMaterial` dans `car.js`, utilisé aussi par `world.js`).
- **Profondeur** : sol à y = −0,12 avec `polygonOffset`, caméra `near` = 0,5, pour éviter le z-fighting route/sol sur les tampons 16 bits.
- **Leader tandem** : cinématique (trajectoire précalculée dans `ai.js`), pas physique. Élastique de vitesse selon l'écart.
- **Qualité auto** : `med` sur tactile, `high` sur bureau. Descend d'un cran si la moyenne dépasse 24 ms/image.

## Pièges
- **Sens des triangles** : les bandes de route et de murs doivent avoir leur normale vers le haut ou vers la piste. Une inversion rend la route invisible, sans erreur.
- **UV des murs** : `-v * side`, sinon le texte est en miroir d'un côté.
- **`[hidden]`** : la règle `display:none !important` est indispensable, car `.screen` en flex l'écrase.
- **`touch-action`** : `none` sur `body`, mais `pan-y` sur `.card`, sinon les menus ne défilent pas sur mobile.
- **`tools/*.js`** : chemins écrits pour le conteneur d'origine (`require('/opt/node-tools/node_modules/playwright')`, `__dirname + '/test.html'` alors que `test.html` est à la racine). À adapter avant de les relancer ailleurs.
- **`window.__sdc` / `__sdcDbg` / `lossLog` / `Sound._debug`** : points d'accès de test laissés dans le build. Sans effet sur le jeu.
- **Artifact** : publié depuis un fichier local. Pour le mettre à jour depuis une autre session, passer l'URL de l'artifact en `url`.

## Non vérifié (hors de portée de l'environnement)
- Nombre réel d'images par seconde sur un téléphone Android.
- Écoute du son.
- Barème sur de vraies parties humaines.

## Prochaine tranche
1. Créer un dépôt dédié et y pousser ce zip, puis supprimer la branche `game/sideways-drift-club` du dépôt de la pharmacie (`git push origin --delete game/sideways-drift-club`).
2. Faire un test sur Android milieu de gamme : fps en jeu (`window.__sdc.fps`), ressenti de la glisse, niveau sonore. Ajuster `par` après 5 à 10 parties réelles.
3. Pistes d'évolution : enregistrement du meilleur tour en fantôme, 4e piste, réglages de la voiture (angle de braquage, carrossage).

## Reprise rapide
```
unzip sideways-drift-club.zip && cd sideways-drift-club
mkdir -p vendor && curl -o vendor/three.min.js https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js
node build.mjs --local   # test.html à ouvrir dans un navigateur
node build.mjs           # index.html à déployer (Vercel / GitHub Pages)
node tools/tune2.js pid  # banc physique (Node seul)
```
