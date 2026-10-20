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
| `src/physics.js` | Modèle bicyclette, pneus saturés, régulateur d'angle de drift (assistance) ; lit les champs de fiche tunée (`steerRate`, `driftSteer`, `angleBoost`, `rollK`, `brakeK`, `brakeRear`, `hbK`, `latBal`, `damp`, `camber`) et l'adhérence de piste (`grip`) |
| `src/economy.js` | Portefeuille en yens, catalogue de l'atelier, gains de fin de run, défis, bonus quotidien, fiche tunée. Logique pure, testée |
| `src/track.js` | 6 tracés, échantillonnage, virages et clips (un type par virage, règle des tracés officiels), barème (`par`), adhérence (`grip`, neige) |
| `src/world.js` | Ciel (nuages, étoiles), crêtes, route et murs par lieu, décor instancié par thème, tribune, eau animée. Thèmes `dawn`, `snow`, `dusk` = palettes posées sur une famille de décor (`decor`) |
| `src/car.js` | Voitures procédurales : caisse lissée (loft), habitacle, livrée peinte, pièces modulaires, roues instanciées |
| `src/fx.js` | Fumée colorée (points), traces de gomme (envoi GPU partiel), étincelles |
| `src/audio.js` | Moteur, turbo, crissement synthétisés (Web Audio) |
| `src/ai.js` | Leader tandem sur trajectoire précalculée |
| `src/shop.js` | Atelier : 6 rayons, aperçu avant achat, barre d'achat |
| `src/game.js` | Boucle (pas fixe 120 Hz + interpolation), caméra, score, collisions, entrées, interface, carrière |
| `assets/favicon.svg`, `icons/`, `manifest.webmanifest` | Favicon (intégré au build), icônes d'application, manifeste PWA |
| `tests/` | `node --test tests/*.test.js` : économie, effets physiques des réglages, validité des tracés |
| `tools/` | Bancs d'essai : physique (Node), captures, tour complet, bot expert, perf, CPU ralenti, analyse audio (Playwright) |

## Économie et atelier
- Monnaie fictive (¥), sans achat réel. Départ : HACHI offerte + ¥3 000. KOUKI ¥18 000, RAIJIN ¥45 000.
- Gains : 5 % des points (×1,25 en tandem), bonus de note, clips, combo, record ; mode libre : 2 % plafonné. Bonus quotidien de ¥500 à ¥2 000 selon la série. 15 défis à récompense unique.
- Atelier : carrosserie (pare-chocs, ailes, aileron, capot, échappement, arceau, néon), peinture (12 couleurs, 5 finitions, 6 livrées, numéro), roues (5 jantes, 8 couleurs, fumée colorée), performances (6 pièces × 3 niveaux, dont kit de freins visible sur les roues), réglages gratuits avec fiche technique en direct.
- Réglages : freins (puissance, répartition avant/arrière, frein à main), suspension (raideur avant, raideur arrière, amortisseurs, hauteur, carrossage), style (déport). Valeur neutre = physique d'origine ; aux extrêmes : arrêt ±20 %, équilibre sous-vireur ↔ survireur, sans tête-à-queue au banc.
- Pistes : Docks de Minato, Col d'Akane, Piton Volcan, Quai de Shiohama (aube), Col de Yukimi (neige, adhérence ×0,88), Corniche de Kaigan (crépuscule, lampadaires).

## Mesures de référence (2026-10-14)
- Appels de dessin : 65–68 par image en tandem. JS : 0,4–0,5 ms/image ; 1,9–2,8 ms avec CPU ralenti ×6.
- Saccade d'affichage (écart image à image du déplacement) : 0,1 % à 60, 90, 120 et 144 Hz (avant : 14 à 60 % au-delà de 60 Hz).
- Chargement d'une piste avec CPU ×6 : 0,38–0,52 s (décor bien plus riche ; hors partie).
- Audio : fondamentale moteur = régime/60×2 ; crissement +12 dB au-dessus du moteur en glisse ; pas de saturation.

## Données
Aucune donnée personnelle. Réglages, records et profil de jeu (`sdc:profile` : solde, voitures, pièces, défis, 40 derniers mouvements) en `localStorage` sur l'appareil du joueur. Rien n'est envoyé.
Jeu conçu et codé avec l'assistance d'une IA (mention dans l'écran d'aide).

## Commandes tactiles
Réglages → *Personnaliser* : déplacer chaque bouton, taille générale + taille par bouton, transparence, miroir, réinitialisation. Disposition enregistrée par orientation (`localStorage`, clé `sdc:touchLayout`). Un doigt peut glisser d'un bouton à l'autre sans lâcher (hit-test + hystérésis de 28 px). Zoom : bloqué sur la surface de jeu (`touch-action: none`, garde `touchend`, `gesture*`), autorisé dans les menus (`pan-y pinch-zoom`) ; le viewport ne l’interdit pas (WCAG 1.4.4).
