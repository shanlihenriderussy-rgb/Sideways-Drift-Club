---
name: Sideways Drift Club
description: Jeu de drift 3D dans le navigateur, interface de paddock nocturne.
colors:
  asphalt: "#07080a"
  surface-1: "#0e1013"
  surface-2: "#14171b"
  surface-3: "#1b1f24"
  surface-4: "#242930"
  chalk: "#f2f2ef"
  chalk-dim: "#a4a8af"
  chalk-faint: "#6c717a"
  emblem-yellow: "#f7d154"
  emblem-yellow-hover: "#ffdc6a"
  emblem-ink: "#15120a"
  marshal-blue: "#7b8cff"
  tail-red: "#ff4d4f"
  clip-amber: "#ffb020"
  apex-cyan: "#38d6ff"
  flag-green: "#3ddc84"
  newsprint-ink: "#141414"
  ink-blue: "#3349c9"
typography:
  display:
    fontFamily: "Archivo, Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(30px, 5.4vw, 52px)"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 125"
  headline:
    fontFamily: "Archivo, Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(24px, 4vw, 32px)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 116"
  title:
    fontFamily: "Archivo, Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 750
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 112"
  body:
    fontFamily: "Archivo, Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.18em"
  editorial:
    fontFamily: "Instrument Serif, Times New Roman, Georgia, serif"
    fontSize: "clamp(14px, 1.9vw, 18px)"
    fontWeight: 400
  kanji:
    fontFamily: "Noto Sans JP, Hiragino Kaku Gothic ProN, Yu Gothic, sans-serif"
    fontSize: "13px"
    fontWeight: 700
rounded:
  hair: "2px"
  sm: "10px"
  md: "12px"
  lg: "14px"
  card: "20px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "50px"
  button-hover:
    backgroundColor: "{colors.surface-4}"
  button-primary:
    backgroundColor: "{colors.emblem-yellow}"
    textColor: "{colors.emblem-ink}"
    rounded: "{rounded.md}"
    padding: "0 28px"
    height: "54px"
  button-primary-hover:
    backgroundColor: "{colors.emblem-yellow-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.chalk-dim}"
    rounded: "{rounded.md}"
  option:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.lg}"
    padding: "12px 14px"
  chip:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
    height: "44px"
  card:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.card}"
    padding: "24px"
    width: "min(560px, 100%)"
  toast:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.pill}"
    padding: "8px 16px 8px 12px"
  icon-button:
    backgroundColor: "{colors.asphalt}"
    rounded: "{rounded.pill}"
    size: "44px"
---

# Design System: Sideways Drift Club

## Overview

**Creative North Star: "Le Paddock de Nuit"**

Une réunion de nuit sur un parking de col. Tout est sombre sauf ce qui compte : le jaune de l'emblème marque l'action, le reste se lit à la craie sur l'asphalte. La scène 3D est le héros ; l'interface se tient en marge, comme les panneaux et les feuilles de temps scotchées au mur du stand.

La densité est celle d'un outil tenu à deux pouces : cibles larges, peu de texte, chiffres tabulaires. Une seule exception de ton : la feuille de résultats, imprimée sur papier clair comme une une de journal, avec la voix serif en italique. Cette voix éditoriale existe aussi par touches dans la manchette et les chapôs du menu.

Le japonais apparaît en repère graphique (rubriques, signature verticale), jamais comme texte à lire pour jouer.

**Key Characteristics:**
- Fond presque noir, cinq niveaux de surface, aucun gris coloré.
- Un seul jaune pour l'action principale, la sélection, le combo et l'argent.
- Archivo à largeur variable : large pour les titres, normal pour le texte.
- Bordures d'un pixel plutôt qu'ombres.
- Pendant la conduite, le HUD n'a pas de fond : texte et ombre portée seulement.

## Colors

Une palette de nuit : des noirs étagés, une craie claire, un jaune et son complémentaire.

### Primary
- **Jaune de l'Emblème** (`emblem-yellow`) : action principale, élément sélectionné, combo, montants. Texte posé dessus en `emblem-ink`.

### Secondary
- **Bleu Commissaire** (`marshal-blue`) : informations secondaires, rapport engagé, multiplicateur, tandem, rubriques en japonais. Sur papier clair il devient `ink-blue`.

### Tertiary
- **Ambre de Clip** (`clip-amber`) et **Cyan de Corde** (`apex-cyan`) : uniquement pour les zones de piste, extérieur et intérieur.
- **Rouge Feu Arrière** (`tail-red`) : erreur, retard sur le fantôme, refus d'achat.
- **Vert Drapeau** (`flag-green`) : acquis, défi rempli, avance sur le fantôme.

### Neutral
- **Asphalte** (`asphalt`) : fond de page et voile des écrans.
- **Surfaces 1 à 4** : de la plus profonde à la plus haute ; le survol monte d'un cran.
- **Craie** (`chalk`), **Craie Atténuée** (`chalk-dim`), **Craie Pâle** (`chalk-faint`) : texte principal, texte secondaire, libellés discrets.
- **Encre Papier** (`newsprint-ink`) : texte de la feuille de résultats.
- Filets : blanc à 8 % et 15 % d'opacité.

### Named Rules
**La Règle du Jaune Unique.** Le jaune désigne une seule action principale par écran. Deux boutons jaunes côte à côte, c'est une erreur.

**La Règle des Couleurs de Piste.** Ambre et cyan ne sortent jamais de leur rôle de zones de clip et de corde.

## Typography

**Display Font:** Archivo variable, axe largeur de 62 à 125 (repli Inter, Segoe UI, system-ui)
**Body Font:** Archivo, largeur 100
**Label/Mono Font:** Archivo en capitales espacées ; Instrument Serif italique pour la voix éditoriale ; Noto Sans JP 700 pour les repères japonais

**Character:** Une grotesque large et lourde, proche du lettrage de carrosserie, tempérée par une serif italique qui donne le ton du journal du club.

### Hierarchy
- **Display** (900, largeur 125, `clamp(30px, 5.4vw, 52px)`, 0.95) : le logotype de l'écran titre, rien d'autre.
- **Headline** (800, largeur 116, `clamp(24px, 4vw, 32px)`, 1.05) : titre de chaque carte, suivi d'un double filet.
- **Title** (750, largeur 112, 15px) : nom d'une option, d'une pièce, d'une piste.
- **Body** (400, 14.5px, 1.5) : chapô des cartes, en craie atténuée. 13px pour les lignes de détail.
- **Label** (700, 11px, espacement 0.18em, capitales) : surtitres, libellés de statistiques.
- **Editorial** (Instrument Serif italique, 14 à 18px) : manchette, chapôs du menu, une des résultats, chiffres d'exception.

### Named Rules
**La Règle des Chiffres Alignés.** Tout nombre qui change à l'écran utilise les chiffres tabulaires.

**La Règle de la Largeur.** L'emphase passe par l'axe de largeur avant de passer par la taille.

## Layout

Chaque écran est une couche plein cadre posée sur le canevas 3D, avec les zones sûres de l'appareil comme marges (16px minimum).

- **Menu titre** : bloc de marque en haut à gauche, sommaire en liste à gauche, la voiture occupe la droite. Dégradé sombre de gauche à droite pour la lisibilité.
- **Cartes** : largeur `min(560px, 100%)`, centrées, défilement interne. La rangée d'actions reste collée en bas de la carte.
- **Atelier** : panneau latéral droit de 450px, la voiture reste visible à gauche.
- **HUD** : grille à trois colonnes en haut (minimap, score, boutons), commandes tactiles dans les coins bas.
- **Rythme** : 4, 8, 12, 16, 24px.
- **Paysage bas** (hauteur ≤ 560px) : cartes resserrées, grilles en deux colonnes, chapôs masqués. Sous 420px de haut, les boutons tactiles passent de 76 à 64px.
- **Portrait** (largeur ≤ 700px) : colonnes empilées, signature japonaise masquée, conseil de rotation affiché.

## Elevation & Depth

Système presque plat. La profondeur vient de l'étagement des surfaces et de filets d'un pixel. Les ombres servent seulement à détacher un calque du jeu en mouvement.

### Shadow Vocabulary
- **Carte** (`0 1px 0 rgba(255,255,255,.05) inset, 0 30px 80px rgba(0,0,0,.55)`) : la carte au-dessus du voile.
- **Toast** (`0 12px 32px rgba(0,0,0,.45)`) : notification flottante.
- **Halo du bouton principal** (`0 8px 24px rgba(247,209,84,.18)`) : seul halo coloré autorisé.
- **Anneau de sélection** (`0 0 0 1px` jaune, en dedans) : double la bordure de l'élément choisi.
- **Texte du HUD** (`text-shadow` noir diffus) : lisibilité sur la piste, sans panneau.

### Named Rules
**La Règle du HUD Sans Fond.** En course, aucun panneau opaque : texte, ombre et anneau fin seulement.

## Shapes

Coins doux, jamais ronds par défaut. Contrôles à 12px, options et encarts à 14px, cartes à 20px. La pilule (999px) est réservée aux toasts et aux étiquettes ; le cercle aux boutons d'icône, aux pastilles de couleur et aux commandes tactiles. Les barres de progression et les soulignements d'onglet ont 2px.

Bordure standard : 1px en blanc à 8 %, 15 % pour les contrôles.

## Components

### Buttons
Franc et tactile : une hauteur généreuse, un retour immédiat.
- **Shape:** coins doux (12px), hauteur minimale 50px, texte 15px en 700, largeur 112.
- **Primary:** fond Jaune de l'Emblème, texte encre, 54px de haut, 16px en 800, halo jaune.
- **Hover / Focus:** la surface monte d'un cran ; appui `scale(.97)` en 120 ms ; focus par contour jaune de 2px décalé de 3px.
- **Ghost:** fond transparent, texte atténué, pour « Retour » et les sorties.
- **Sommaire du menu :** les boutons du menu titre sont une liste typographique avec un chapô en serif italique.

### Chips
- **Style:** surface 2, filet fin, 44px minimum, libellé 13px et prix ou état en dessous.
- **State:** sélection par bordure et anneau jaunes sur fond jaune à 12 %. Survol en bleu. Variante pastille de couleur de 48px.
- Prix en jaune, « acquis » en vert.

### Cards / Containers
- **Corner Style:** 20px.
- **Background:** dégradé vertical sombre presque opaque, filet à 8 %.
- **Shadow Strategy:** ombre de carte, voir Elevation & Depth.
- **Internal Padding:** 24px, 16 à 20px en paysage bas.
- **Entrée:** montée de 10px en 320 ms, courbe `cubic-bezier(.2,.8,.2,1)`.
- **Pied:** rangée d'actions collante avec fondu.

### Inputs / Fields
- **Options (modes, pistes, voitures):** blocs de 64px minimum, titre et description, même état sélectionné que les chips.
- **Curseurs:** piste native teintée en jaune, 32px de haut, valeur en bleu à droite.

### Navigation
- **Onglets de l'Atelier:** texte seul, 42px, soulignement jaune de 2px qui s'étire en 250 ms. Fondu sur le bord quand des onglets restent hors écran.

### Toast
Pilule sombre avec une pastille lumineuse : verte pour un gain, jaune pour un défi, bleue pour un achat. Visible 3,2 secondes, jamais par-dessus le logotype ni le score.

### Feuille de résultats
Signature du jeu : la carte passe sur papier clair, encre sombre, titres en serif, note des juges en grand. Le pied garde son propre fond.

### Commandes tactiles
Boutons ronds de 76px, translucides, déplaçables. État appuyé : voile jaune à 40 % et `scale(.94)`.

## Do's and Don'ts

### Do:
- **Do** garder une seule action jaune par écran.
- **Do** donner au moins 44px à toute cible tactile et respecter les zones sûres.
- **Do** laisser l'action principale visible sans défilement, y compris à 844×390.
- **Do** utiliser les chiffres tabulaires pour scores, temps et montants.
- **Do** vérifier chaque écran en paysage 844×390 et en portrait 390×844.
- **Do** tutoyer le joueur.

### Don't:
- **Don't** poser un panneau opaque sur la piste pendant la conduite.
- **Don't** utiliser l'ambre ou le cyan hors des zones de clip et de corde.
- **Don't** ajouter d'ombre colorée autre que le halo du bouton principal.
- **Don't** couvrir le logotype ou le score avec un toast.
- **Don't** introduire une quatrième famille de caractères.
- **Don't** ajouter un effet d'interface (flou, filtre, animation continue) sans vérifier que le jeu reste fluide sur l'appareil cible.
