# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Joueur mobile occasionnel. Il ouvre le jeu sur un téléphone Android milieu de gamme, souvent en paysage, pour des sessions de 2 à 5 minutes, avec un réseau variable. Il joue au pouce, sans tutoriel long, et veut rouler dans les secondes qui suivent l'ouverture.

Clavier et manette sont pris en charge, mais ne sont pas le cas principal.

## Product Purpose

Sideways Drift Club est un jeu de drift en 3D jouable dans le navigateur. Le joueur lance la voiture, tient l'angle, clippe les murs et encaisse un combo.

Réussite : un nouveau joueur termine un premier run noté sans aide extérieure, puis revient pour battre son record.

## Positioning

Un jeu de drift complet (pistes, île en monde ouvert, atelier, multijoueur) qui s'ouvre par un lien : rien à installer, pas de compte, pas de publicité, et la progression reste sur l'appareil.

## Operating Context

- Ouverture par lien ou par icône (PWA installable).
- Sessions courtes, téléphone tenu à deux mains en paysage ; le portrait reste utilisable pour les menus.
- Multijoueur pair à pair (WebRTC), jusqu'à 4 pilotes, invitation par code ou par lien.
- Réseau mobile irrégulier : le jeu doit rester jouable hors ligne une fois chargé.

## Capabilities and Constraints

**Contrainte ferme, confirmée par le propriétaire du produit**

- Le jeu reste fluide sur un petit Android. La fluidité est une exigence, pas un absolu : un effet visuel peut coûter de la performance tant que le jeu reste fluide sur l'appareil cible. On ne sacrifie pas tout le reste à la performance.

**État actuel, non déclaré intangible**

- Aucun compte, aucune publicité, aucune donnée personnelle collectée ; progression en stockage local.
- Yens fictifs, aucun achat réel.
- Livraison en un seul `index.html` autonome, Three.js r128 chargé depuis cdnjs.
- Interface en français, joueur tutoyé.
- 6 pistes, 3 modes (Run noté, Tandem, Libre), île en monde ouvert, aventure en 6 chapitres, atelier (3 voitures), carrière avec 36 défis.

**Vocabulaire du jeu**

Run noté, Tandem, Libre, clip, frôlé, combo, fantôme, Atelier, Carrière, Aventure, île, cagnotte.

**Non décidé**

- Appareil de référence précis et seuil d'images par seconde qui définit « fluide ».
- Langues autres que le français.

## Brand Commitments

- Nom : Sideways Drift Club. Emblème du club dans `assets/logo.webp`, favicon dans `assets/favicon.svg`.
- Voix : directe, tutoiement, phrases courtes, vocabulaire de la glisse.
- Inspiration revendiquée dans le README : FR Legends. Le jeu n'en reprend ni le nom, ni les voitures, ni les circuits.

## Evidence on Hand

- Captures du jeu : `docs/screenshots/`. Visuels de marque : `docs/brand/`.
- Tests : 133 tests unitaires, 24 parcours de bout en bout (`e2e/`).
- Absences à ne pas inventer : aucune mesure sur un vrai téléphone, aucun chiffre d'audience, aucun témoignage de joueur, fluidité du multijoueur vérifiée en simulation uniquement.

## Product Principles

1. **Rouler d'abord.** Le chemin entre l'ouverture et le premier virage est le plus court possible.
2. **Le pouce décide.** Chaque écran se pilote au doigt, cibles larges, action principale toujours visible.
3. **Fluide sur l'appareil cible.** Une nouveauté qui fait saccader un petit Android n'est pas finie.
4. **La course est le héros.** L'interface s'efface derrière la 3D pendant la conduite.
5. **Rien n'est promis qui n'est pas mesuré.** Les limites connues sont écrites.

## Accessibility & Inclusion

- Cibles tactiles d'au moins 44 px, zones sûres des écrans à encoche respectées.
- Commandes tactiles déplaçables, redimensionnables, miroir gauche/droite.
- Focus clavier visible, `prefers-reduced-motion` respecté sur les animations d'interface.
- Aucun niveau WCAG cible n'a été fixé.
