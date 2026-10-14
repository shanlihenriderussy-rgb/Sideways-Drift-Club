# Sideways Drift Club

Jeu de drift mobile en 3D, jouable dans le navigateur. Inspiration FR Legends.
Jeu en ligne : https://sideways-drift-club.vercel.app/ (Vercel, depuis `main`). Artifact privé : https://claude.ai/artifact/GWQqXoGW5RECCCmMESYCtL

> Branche orpheline, indépendante du site de la pharmacie : ne jamais la fusionner dans `main`.

## Construire
```
node build.mjs            # index.html (Three.js r128 via cdnjs), à déployer tel quel
node build.mjs --local    # test.html avec vendor/three.min.js pour les tests hors ligne
```
`vendor/three.min.js` : `curl -o vendor/three.min.js https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`

## Structure
| Fichier | Rôle |
|---|---|
| `src/physics.js` | Modèle bicyclette, pneus saturés, régulateur d'angle de drift (assistance) |
| `src/track.js` | Tracés, échantillonnage, zones de clipping, barème (`par`) |
| `src/world.js` | Ciel, route, murs, vibreurs, décor instancié par thème |
| `src/car.js` | Voitures procédurales (profil extrudé), fusion des maillages par matériau |
| `src/fx.js` | Fumée (points), traces de gomme, étincelles |
| `src/audio.js` | Moteur, turbo, crissement synthétisés (Web Audio) |
| `src/ai.js` | Leader tandem sur trajectoire précalculée |
| `src/game.js` | Boucle, caméra, score, collisions, entrées, interface |
| `tools/` | Bancs d'essai : physique (Node), captures, tour complet, bot expert, perf, CPU ralenti, analyse audio (Playwright) |

## Mesures de référence (2026-10-09)
- Appels de dessin : 68–79 par image. JS : 0,5–0,8 ms/image ; 2,8–3,4 ms avec CPU ralenti ×6.
- Audio : fondamentale moteur = régime/60×2 ; crissement +12 dB au-dessus du moteur en glisse ; pas de saturation.
- Barème : tour propre du bot expert ≈ A ; S exige un combo enchaîné.

## Données
Aucune donnée personnelle. Réglages et records en `localStorage` sur l'appareil du joueur.
Jeu conçu et codé avec l'assistance d'une IA (mention dans l'écran d'aide).
