// ===== Aventure : « Le Tour de l’Île », six chapitres et une île à explorer =====
// Logique pure (aucun DOM, aucun Three.js) : le jeu passe le profil, ces fonctions lisent et écrivent profile.story
// et créditent les récompenses par Economy.credit. Les dialogues sont des lignes [personnage, texte].
// Le pilote n’est jamais genré : on lui parle à la deuxième personne, sans accord.

// Economy : même script dans le jeu, module à part sous Node (tests)
const Eco = typeof Economy !== 'undefined' ? Economy : require('./economy.js');

const CAST = {
  narr: { name: '', role: 'Récit', ini: '', col: '#a4a8af' },
  kenji: { name: 'Kenji Arakawa', role: 'Mécano du club', ini: 'KA', col: '#f7d154' },
  lou: { name: 'Lou Payet', role: 'Journal de la glisse', ini: 'LP', col: '#7b8cff' },
  mika: { name: 'Mika', role: 'Cheffe des Kuro Kumo', ini: 'MI', col: '#e8e6f0' },
  hoshi: { name: 'Hoshi', role: 'Marmay des docks', ini: 'HO', col: '#4be38a' },
  ryo: { name: 'Ryo Kaneshiro', role: 'Kaneshiro Holdings', ini: 'RK', col: '#9aa0aa' },
  zelie: { name: 'Mamie Zélie', role: 'Gardienne du volcan', ini: 'MZ', col: '#ff9a4a' },
  daruma: { name: 'Daruma', role: 'Juge du Tour de l’Île', ini: '達', col: '#ff4d4f' },
  sayo: { name: 'Sayo Ishikawa', role: 'Fondatrice du club · lettre', ini: 'SI', col: '#f1efe9' },
  kai: { name: 'Kai', role: 'Pilote des Kuro Kumo', ini: 'KI', col: '#5b5d66' },
  ume: { name: 'Ume', role: 'Pêcheur de la corniche', ini: 'UM', col: '#2fc7d6' },
  sora: { name: 'Sora', role: 'Gardien du refuge', ini: 'SO', col: '#cfe6ff' },
};

const GRADES = ['D', 'C', 'B', 'A', 'S'];

// goal : { score, grade, clips, angle, combo, drift (% du run en glisse), noWall }
const CHAPTERS = [
  {
    id: 'ch1', track: 'minato', title: 'L’héritage', jp: '遺産',
    pitch: 'Le garage du club va être rasé. Sayo t’a laissé sa HACHI, et un dernier pari.',
    intro: [
      ['narr', 'Docks de Minato, 23 h. La pluie vient de s’arrêter. Le garage du Sideways Drift Club sent l’huile et le café froid.'],
      ['kenji', 'Alors c’est toi. Sayo parlait de toi dans toutes ses lettres. Elle t’a laissé sa HACHI… et ses parts du club.'],
      ['kenji', 'Je ne vais pas te mentir : il reste trois membres, un compresseur qui tousse, et un courrier recommandé.'],
      ['narr', 'Sur l’établi, une lettre à en-tête doré : KANESHIRO HOLDINGS. « Le terminal sera rasé le 1er décembre. »'],
      ['kenji', 'Sauf si le club remporte le Tour de l’Île. Le règlement du port le dit : le champion garde son garage. Sayo l’a fait écrire en 1995.'],
      ['kenji', 'Six lieux, six épreuves, et un juge que personne n’a jamais vu sans son masque : Daruma. Montre-moi d’abord que tu sais glisser.'],
    ],
    missions: [
      {
        id: 'ch1m1', title: 'Premiers tours', mode: 'run', goal: { score: 4000 }, reward: 1500,
        brief: [['kenji', 'Un tour, rien de plus. Lance la voiture, tiens l’angle, et ne regarde pas le mur : on va toujours là où on regarde.']],
        win: [['kenji', 'Pas mal. Sayo aussi freinait trop tard, la première fois.']],
        lose: [['kenji', 'Le mur ne bouge pas : c’est à toi de bouger. On recommence.']],
      },
      {
        id: 'ch1m2', title: 'Raser les conteneurs', mode: 'run', goal: { clips: 3 }, reward: 2000,
        brief: [['kenji', 'Les juges regardent les clips. Dehors, le pare-chocs arrière frôle le mur. Dedans, l’avant embrasse le cône. Trois clips.']],
        win: [['hoshi', 'J’ai tout filmé ! Trois clips, monsieur Kenji, trois !'], ['kenji', 'Hoshi traîne au garage depuis ses huit ans. Ne lui donne pas les clés, surtout.']],
        lose: [['kenji', 'Plus près. Le mur ne mord pas, il juge.']],
      },
      {
        id: 'ch1m3', title: 'Le tandem du vieux', mode: 'tandem', goal: { grade: 'C' }, reward: 3000,
        brief: [['kenji', 'Dernière leçon. Je prends la voiture du club et je mène. Colle-toi à ma portière et ne me lâche pas.']],
        win: [['kenji', '… Bon. Tu as la main de Sayo. Demain, on va voir quelqu’un qui peut faire parler de nous.']],
        lose: [['kenji', 'Trop loin. Un tandem, c’est une conversation : si tu ne m’entends pas, tu es déjà seul.']],
      },
    ],
    outro: [['kenji', 'Le Tour de l’Île se gagne aussi dans les journaux. Il nous faut du public, des sponsors. Direction Shiohama, à l’aube.']],
  },
  {
    id: 'ch2', track: 'shiohama', title: 'La une', jp: '一面',
    pitch: 'Lou Payet, reporter du Journal de la glisse, cherche une histoire. Donne-lui des chiffres.',
    intro: [
      ['narr', 'Quai de Shiohama, 6 h. Les mouettes, l’odeur du gasoil, et une voix derrière toi.'],
      ['lou', 'Lou Payet, Journal de la glisse. Le club de Sayo Ishikawa relancé par une recrue au volant de sa HACHI ? C’est ma une de la semaine. Si tu la mérites.'],
      ['lou', 'Mes lecteurs veulent du spectacle. Tu fais les chiffres, je fais les mots.'],
    ],
    missions: [
      {
        id: 'ch2m1', title: 'La page trois', mode: 'run', goal: { grade: 'B' }, reward: 2500,
        brief: [['lou', 'Une note B des juges, et je t’offre la page trois.']],
        win: [['lou', '« Le retour du Sideways ». Ça sonne bien, non ?']],
        lose: [['lou', 'Page douze, entre la météo et les petites annonces. Retente.']],
      },
      {
        id: 'ch2m2', title: 'Grand angle', mode: 'run', goal: { angle: 50, combo: 4000 }, reward: 2500,
        brief: [['lou', 'Le photographe veut un cliché de profil. Passe les 50°, et enchaîne un combo de 4 000.']],
        win: [['lou', 'Cette photo va faire le tour de l’île avant toi.']],
        lose: [['lou', 'Joli, mais pas assez de travers pour une couverture.']],
      },
      {
        id: 'ch2m3', title: 'Propre comme un sou neuf', mode: 'run', goal: { score: 9000, noWall: true }, reward: 3500,
        brief: [['kenji', 'Les sponsors détestent la tôle froissée. 9 000 points, zéro contact avec le mur.']],
        win: [['lou', 'Kaizen Pneus m’a écrit : ils veulent voir ta voiture.'], ['narr', 'Dans le même numéro, un entrefilet : sur le col d’Akane, le crew Kuro Kumo « ne laisse passer personne ».']],
        lose: [['kenji', 'Un sponsor qui voit une portière pliée, c’est un sponsor qui raccroche.']],
      },
    ],
    outro: [['lou', 'Un conseil : si tu montes à Akane, ne parle pas du club à Mika. Elle a ses raisons.']],
  },
  {
    id: 'ch3', track: 'akane', title: 'Les Nuages noirs', jp: '黒雲',
    pitch: 'Le crew Kuro Kumo règne sur les lacets d’Akane. Sa cheffe, Mika, déteste le club.',
    intro: [
      ['narr', 'Col d’Akane, au couchant. Une dizaine de voitures noires au sommet, un drapeau brodé d’un nuage : 黒雲.'],
      ['mika', 'Le Sideways ? Je croyais que le club était mort avec la vieille.'],
      ['kenji', 'Respecte Sayo, Mika.'],
      ['mika', 'Kenji. Toujours là pour les grands discours. Ici, ça se règle dans les lacets. Trois épreuves. Tu perds, tu redescends à pied.'],
    ],
    missions: [
      {
        id: 'ch3m1', title: 'Les épingles', mode: 'run', goal: { score: 12000 }, reward: 3000,
        brief: [['mika', 'Mes pilotes montent le col à 12 000. Fais pareil, on verra après.']],
        win: [['mika', 'Hm. De la chance.']],
        lose: [['mika', 'La descente à pied, c’est par là.']],
      },
      {
        id: 'ch3m2', title: 'L’ombre de Kuro Kumo', mode: 'tandem', goal: { grade: 'B' }, reward: 4000,
        brief: [['kai', 'Kai, Kuro Kumo. Je mène, tu suis. Si tu me perds dans les lacets, c’est fini pour toi.']],
        win: [['narr', 'Au dernier lacet, Kai lève la main par la fenêtre. Chez les Kuro Kumo, c’est un salut.']],
        lose: [['kai', 'Je ne t’ai même pas vu dans le rétro.']],
      },
      {
        id: 'ch3m3', title: 'Le roi du col', mode: 'run', goal: { grade: 'A', angle: 55 }, reward: 5000,
        brief: [['mika', 'Note A, et au moins 55° quelque part. Je veux savoir si tu glisses vraiment, ou si tu pries.']],
        win: [['mika', '… D’accord. Tu peux rouler sur mon col.'], ['mika', 'Mais ne crois pas qu’on soit amis. Mon père paie mes pneus. Mon père, c’est Ryo Kaneshiro.']],
        lose: [['mika', 'Tu pries. Ça se voit d’ici.']],
      },
    ],
    outro: [['kenji', 'Kaneshiro… Je savais qu’on finirait par le croiser.'], ['narr', 'Kenji n’en dit pas plus. Il fixe la route du bord de mer, là où les Kuro Kumo s’entraînent la nuit.']],
  },
  {
    id: 'ch4', track: 'kaigan', title: 'La corniche', jp: '断崖',
    pitch: 'Ryo Kaneshiro sort de sa limousine. Il a une offre, et une vieille rancune contre le club.',
    intro: [
      ['narr', 'Corniche de Kaigan. L’océan cogne la falaise. Une limousine grise attend sur le parking du belvédère.'],
      ['ryo', 'Alors voici l’héritage de Sayo. Vous conduisez bien. Elle aussi. Ça ne l’a pas empêchée de tout perdre.'],
      ['ryo', 'Je vous propose un marché : renoncez au Tour, et je rachète vos parts au double. Vous repartez riche.'],
      ['kenji', 'Le club n’est pas à vendre.'],
      ['ryo', 'Tout est à vendre, Kenji. Tu es bien placé pour le savoir.'],
    ],
    missions: [
      {
        id: 'ch4m1', title: 'Au bord du vide', mode: 'run', goal: { drift: 45 }, reward: 3500,
        brief: [['kenji', 'Oublie-le. La corniche est longue : glisse au moins 45 % du run.']],
        win: [['kenji', 'Voilà. La route est à toi, pas à lui.']],
        lose: [['kenji', 'Trop de ligne droite dans ta tête. Mets la voiture de travers et laisse-la y rester.']],
      },
      {
        id: 'ch4m2', title: 'Duel au crépuscule', mode: 'tandem', goal: { grade: 'B', noWall: true }, reward: 5000,
        brief: [['mika', 'Mon père veut que je te batte ici. Moi, je veux juste un vrai tandem. Sans contact, d’accord ?']],
        win: [['mika', 'Tu sais pourquoi mon père déteste le club ? Ils l’ont chassé en 2006, pour un accident au volcan.'], ['mika', 'Il n’en parle jamais. Kenji non plus, je parie.']],
        lose: [['mika', 'Sans contact, j’ai dit. On la refait.']],
      },
      {
        id: 'ch4m3', title: 'Le grand large', mode: 'run', goal: { score: 22000 }, reward: 5500,
        brief: [['lou', 'Toute l’île a lu le duel ce matin. Un gros score sur la corniche, et les sponsors font la queue.']],
        win: [['lou', 'Kaizen Pneus signe. Et quelqu’un a déposé une enveloppe au journal pour toi : un masque de Daruma, et un mot. « Piton Volcan. »']],
        lose: [['lou', 'Les sponsors aiment les chiffres ronds. Plus gros, le chiffre.']],
      },
    ],
    outro: [['kenji', 'Le volcan… Il faut que je te raconte quelque chose avant d’y monter. Pas ce soir.']],
  },
  {
    id: 'ch5', track: 'piton', title: 'Ce que Kenji cache', jp: '秘密',
    pitch: 'Au pied du cratère, Kenji avoue ce qui s’est passé en 2006. Et Sayo a laissé une lettre.',
    intro: [
      ['narr', 'Piton Volcan. La route grimpe vers le cratère entre les cannes et le basalte.'],
      ['zelie', 'Lé bon, marmay ? Alors c’est toi qui roules avec Kenji. Ça fait vingt ans qu’il n’est pas monté ici, celui-là.'],
      ['zelie', 'Mi koné l’histoire. Mais c’est à lui de la raconter.'],
      ['kenji', 'En 2006, on roulait de nuit ici, Sayo, Ryo et moi. J’ai pris la voiture de Ryo sans lui demander. Je l’ai mise dans le ravin.'],
      ['kenji', 'Le club a cru que c’était lui. Je n’ai rien dit. Sayo l’a exclu. J’avais vingt-cinq ans, et j’avais peur.'],
      ['kenji', 'Sayo l’a su des années plus tard. Elle m’a pardonné. Lui ne l’a jamais su.'],
    ],
    missions: [
      {
        id: 'ch5m1', title: 'Le carrousel', mode: 'run', goal: { clips: 4, score: 14000 }, reward: 4500,
        brief: [['kenji', 'Le carrousel du cratère ne pardonne rien. Quatre clips, 14 000 points. Fais-le pour nous deux.']],
        win: [['kenji', 'Merci. Je crois que j’avais besoin de voir quelqu’un réussir ici.']],
        lose: [['zelie', 'Le volcan, il prend son temps. Prends le tien aussi.']],
      },
      {
        id: 'ch5m2', title: 'La lettre de Sayo', mode: 'run', goal: { grade: 'A' }, reward: 5500,
        brief: [
          ['narr', 'Dans la boîte à gants de la HACHI, une enveloppe jaunie : « Pour quand tu monteras au volcan. »'],
          ['sayo', 'Si tu lis ça, Kenji t’a tout dit. Ne le juge pas. Gagne pour lui, et dis la vérité à Ryo.'],
          ['sayo', 'Le club, ce n’est pas un garage. C’est une parole tenue.'],
        ],
        win: [['zelie', 'Sayo aurait été fière. Allons, descends dire ça à qui de droit.']],
        lose: [['zelie', 'Relis la lettre, marmay. Et remonte.']],
      },
      {
        id: 'ch5m3', title: 'Vérité au cratère', mode: 'tandem', goal: { grade: 'B', combo: 6000 }, reward: 6000,
        brief: [['mika', 'Kenji m’a appelée. Il veut parler à mon père. Avant ça… un dernier tandem autour du cratère ?']],
        win: [
          ['mika', 'Mon père a écouté Kenji jusqu’au bout. Il n’a rien dit. Puis il a sorti un masque de son manteau.'],
          ['daruma', 'Rendez-vous au col de Yukimi, à la première neige. Le Tour de l’Île se jouera là-haut.'],
        ],
        lose: [['mika', 'Encore un tour. Mon père peut attendre, il a attendu vingt ans.']],
      },
    ],
    outro: [['lou', 'Daruma, c’était Ryo Kaneshiro depuis le début ?! Je tiens la une du siècle.']],
  },
  {
    id: 'ch6', track: 'yukimi', title: 'Le Tour de l’Île', jp: '島一周',
    pitch: 'Finale dans la neige contre Mika. Les docks se jouent sur un tandem.',
    intro: [
      ['narr', 'Col de Yukimi, première neige. Tout le club est là, les Kuro Kumo aussi, et la moitié de l’île derrière les barrières.'],
      ['daruma', 'Pendant vingt ans, j’ai jugé ce Tour pour comprendre ce que Sayo voyait dans ce club.'],
      ['daruma', 'La règle est simple. Bats ma fille dans la neige, et les docks restent au Sideways. Sinon, les bulldozers passent le 1er décembre.'],
      ['mika', 'Ne me fais pas de cadeau. Moi, je ne t’en ferai pas.'],
    ],
    missions: [
      {
        id: 'ch6m1', title: 'Reconnaissance', mode: 'run', goal: { score: 12000, noWall: true }, reward: 5000,
        brief: [['kenji', 'La neige glisse partout, pas seulement là où tu veux. Doux sur les gaz. Un run propre pour reconnaître le tracé.']],
        win: [['kenji', 'Propre. Garde ce rythme.']],
        lose: [['kenji', 'Le mur est plus près qu’il n’en a l’air, avec la neige. Encore une fois.']],
      },
      {
        id: 'ch6m2', title: 'Le serpentin', mode: 'run', goal: { grade: 'A', clips: 6 }, reward: 7000,
        brief: [['lou', 'Les juges regardent le serpentin à la loupe. Six clips, note A. Toute l’île retient son souffle.']],
        win: [['lou', 'Les tribunes chantent le nom du club. Je n’avais jamais entendu ça.']],
        lose: [['lou', 'Le serpentin a mangé plus fort que toi. Retente.']],
      },
      {
        id: 'ch6m3', title: 'Finale : Sideways contre Kuro Kumo', mode: 'tandem', goal: { grade: 'A', noWall: true }, reward: 12000,
        brief: [['mika', 'Dernier tandem. Je mène. Si tu tiens ma portière jusqu’à la ligne sans toucher un mur, les docks sont à toi.']],
        win: [
          ['daruma', 'Le Sideways Drift Club garde ses docks.'],
          ['ryo', 'Et moi… je retire ma rancune. Kenji, tu me dois une voiture depuis 2006.'],
          ['kenji', 'Je te la prépare au garage. Si tu reviens rouler avec nous.'],
        ],
        lose: [['mika', 'Pas encore. Remonte au départ, je t’attends.']],
      },
    ],
    outro: [
      ['lou', 'Journal de la glisse, édition spéciale : « Le Sideways est de retour. »'],
      ['mika', 'Kuro Kumo et Sideways, même garage le dimanche. Mon père appelle ça une fusion. Moi, j’appelle ça un club.'],
      ['kenji', 'Sayo avait raison. Le club, c’est une parole tenue. Bienvenue chez toi.'],
      ['narr', 'Fin du Tour de l’Île. Les six lieux restent ouverts : il reste des souvenirs du club à retrouver.'],
    ],
  },
];

// Exploration de chaque lieu (mode libre) : archives cachées (coupures du Journal), défis de rue, une rencontre.
// at = position le long du tracé (0..1), side = côté (−1 gauche, +1 droite, 0 centre).
const ZONES = {
  minato: {
    archives: [
      ['1995 · La fondation', 'Sayo Ishikawa loue un hangar du terminal 4 pour 3 000 ¥ par mois. Le panneau « SIDEWAYS » est peint à la main, à l’envers la première fois.'],
      ['1996 · Le règlement du port', 'Sayo obtient une clause unique : le club champion du Tour de l’Île garde son hangar, quoi qu’il arrive.'],
      ['1998 · La HACHI', 'Une HACHI blanche rachetée à un livreur de tofu. Sayo refuse de la repeindre : « Elle a déjà une histoire. »'],
      ['2003 · Trois mousquetaires', 'Photo en une : Sayo, Kenji Arakawa et un jeune pilote prometteur, Ryo Kaneshiro, autour du compresseur.'],
      ['2025 · Dernier article', '« Sayo Ishikawa s’éteint. Le club perd sa voix, mais pas sa voiture. »'],
    ],
    npc: { at: 0.42, side: -1, who: 'hoshi', reward: 800, lines: [['hoshi', 'Lé bon ? Tu sais que les grues, la nuit, on dirait des girafes ? Sayo disait ça.'], ['hoshi', 'Elle me laissait cirer la HACHI. Si tu gagnes le Tour, tu me laisses la cirer aussi ?']] },
  },
  shiohama: {
    archives: [
      ['1997 · Le premier Tour', 'Sept voitures au départ, quarante spectateurs, une glacière. Le Sideways termine deuxième.'],
      ['2000 · Le phare', 'Le gardien du phare de Shiohama allume la lanterne à chaque passage du club. On ne sait pas s’il a le droit.'],
      ['2004 · Doublé', 'Le club gagne le Tour deux ans de suite. Lou Payet, stagiaire, signe son premier article.'],
      ['2006 · L’exclusion', 'Bref communiqué : « Ryo Kaneshiro quitte le Sideways Drift Club. » Aucune explication.'],
      ['2014 · Kaneshiro Holdings', 'Ryo Kaneshiro rachète la moitié du port. Il refuse toute interview sur le drift.'],
    ],
    npc: { at: 0.42, side: 1, who: 'lou', reward: 800, lines: [['lou', 'Tu sais ce qui fait une bonne une ? Un visage, une phrase, et une vérité que personne n’a dite.'], ['lou', 'Pour l’instant, j’ai ton visage. La phrase viendra. La vérité aussi.']] },
  },
  akane: {
    archives: [
      ['1999 · Le col interdit', 'La préfecture ferme Akane la nuit. Le club obtient le droit d’y rouler un dimanche par mois.'],
      ['2008 · Naissance de Kuro Kumo', 'Un nouveau crew s’installe au sommet. Leur cheffe a quinze ans et s’appelle Mika.'],
      ['2012 · Les lacets', 'Record du col : Mika, en RAIJIN noire, au nez et à la barbe des anciens du Sideways.'],
      ['2019 · Le torii', 'Les Kuro Kumo repeignent le torii du col. Les habitants les remercient avec des onigiri.'],
      ['2024 · Défi refusé', 'Mika défie le Sideways. Sayo, malade, décline : « Pas cette année. Mais quelqu’un viendra. »'],
    ],
    npc: { at: 0.42, side: -1, who: 'kai', reward: 800, lines: [['kai', 'Mika fait la dure, mais elle a gardé toutes les coupures de journal sur Sayo.'], ['kai', 'Ne lui dis pas que je t’ai dit ça.']] },
  },
  kaigan: {
    archives: [
      ['2001 · La corniche', 'Inauguration de la route du bord de mer. Le club y roule avant même les officiels.'],
      ['2005 · La tempête', 'Un cyclone emporte une partie de la falaise. Le club aide à dégager la route trois jours durant.'],
      ['2010 · Nuits de corniche', 'Les Kuro Kumo s’entraînent ici chaque nuit de pleine lune. Ume, le pêcheur, compte les passages.'],
      ['2016 · Kaizen Pneus', 'Petite marque locale, Kaizen Pneus cherche un club à sponsoriser. Personne ne répond.'],
      ['2023 · Belvédère', 'Ryo Kaneshiro achète le parking du belvédère. Il y vient seul, le soir, regarder la route.'],
    ],
    npc: { at: 0.42, side: 1, who: 'ume', reward: 800, lines: [['ume', 'Le soir, le monsieur à la limousine regarde passer les voitures. Il ne sourit jamais.'], ['ume', 'Sauf une fois. Une HACHI blanche, il y a longtemps.']] },
  },
  piton: {
    archives: [
      ['2002 · Le carrousel', 'Le club découvre la boucle du cratère. Sayo l’appelle « le carrousel » : on y tourne sans fin.'],
      ['2006 · La nuit du ravin', 'Une voiture au fond du ravin, personne de blessé. Le club ne fait aucun commentaire.'],
      ['2007 · Silence', 'Kenji Arakawa cesse de piloter. Il ne quittera plus le garage.'],
      ['2018 · La lettre', 'Sayo écrit une lettre qu’elle range dans la boîte à gants de la HACHI. Elle ne l’envoie pas.'],
      ['2025 · Mamie Zélie', 'La gardienne du volcan confie au Journal : « Les volcans et les hommes, ça finit toujours par parler. »'],
    ],
    npc: { at: 0.42, side: -1, who: 'zelie', reward: 800, lines: [['zelie', 'Allons, marmay. Ou lé fatigué ? Assieds-toi deux minutes.'], ['zelie', 'Le volcan, il gronde, il fume, et puis un jour il se tait. Les gens, c’est pareil.']] },
  },
  yukimi: {
    archives: [
      ['1996 · Le refuge', 'Le Tour de l’Île se termine pour la première fois au col de Yukimi. Sora, le gardien du refuge, sert le thé aux pilotes.'],
      ['2003 · Daruma', 'Un juge masqué apparaît. Il note sans un mot. On l’appelle Daruma, d’après son masque.'],
      ['2006 · Le juge reste', 'Après l’exclusion de Ryo Kaneshiro, Daruma continue de juger chaque Tour. Personne ne fait le lien.'],
      ['2015 · Neige tardive', 'Un Tour couru sous la neige. Seule Sayo termine sans toucher un mur.'],
      ['2025 · Le dernier Tour ?', 'Kaneshiro Holdings annonce la fin du terminal 4. Le Tour de l’Île pourrait ne jamais revenir.'],
    ],
    npc: { at: 0.42, side: 1, who: 'sora', reward: 800, lines: [['sora', 'Daruma prend toujours son thé sans sucre. Comme quelqu’un qui a quelque chose à se reprocher.'], ['sora', 'Bonne chance pour le Tour. La neige ne choisit personne.']] },
  },
};
const ARCHIVE_AT = [0.14, 0.3, 0.56, 0.72, 0.88];
const ARCHIVE_REWARD = 300;
// défis de rue : une borne au milieu de la piste ; le défi démarre au passage
const STREET = [
  { at: 0.22, type: 'hold', angle: 35, secs: 3, window: 9 },
  { at: 0.64, type: 'combo', pts: 2500, window: 14 },
];
const streetFor = (zi, k) => {
  const s = STREET[k], z = zi * 0.18; // plus exigeant au fil des chapitres
  return s.type === 'hold' ? { ...s, angle: Math.round(s.angle + zi * 3), secs: Math.round((s.secs + z * 2) * 10) / 10 } : { ...s, pts: Math.round(s.pts * (1 + z) / 100) * 100 };
};
const streetReward = (zi) => 1200 + zi * 200;

// ---------- état ----------
function ensure(p) {
  const s = p.story && typeof p.story === 'object' ? p.story : {};
  const bag = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
  p.story = { done: bag(s.done), seen: bag(s.seen), arch: bag(s.arch), street: bag(s.street), npc: bag(s.npc) };
  return p.story;
}
const missionDone = (p, id) => !!ensure(p).done[id];
function chapterDone(p, ci) { return CHAPTERS[ci].missions.every((m) => missionDone(p, m.id)); }
function chapterOpen(p, ci) { return ci === 0 || (ci > 0 && ci < CHAPTERS.length && chapterDone(p, ci - 1)); }
// première mission non faite d'un chapitre ouvert, ou -1
function nextMission(p, ci) {
  if (!chapterOpen(p, ci)) return -1;
  return CHAPTERS[ci].missions.findIndex((m) => !missionDone(p, m.id));
}
function missionOpen(p, ci, k) { return chapterOpen(p, ci) && CHAPTERS[ci].missions.slice(0, k).every((m) => missionDone(p, m.id)); }
// chapitre courant : le premier non terminé (ou le dernier)
function currentChapter(p) { const i = CHAPTERS.findIndex((c, ci) => !chapterDone(p, ci)); return i < 0 ? CHAPTERS.length - 1 : i; }
const zoneIndex = (trackId) => CHAPTERS.findIndex((c) => c.track === trackId);
const zoneOpen = (p, trackId) => { const i = zoneIndex(trackId); return i >= 0 && chapterOpen(p, i); };

// ---------- objectifs ----------
const fmtN = (n) => Math.round(n).toLocaleString('fr-FR');
function goalRows(goal, run) {
  const rows = [];
  const row = (label, ok) => rows.push({ label, ok: run ? !!ok : null });
  const r = run || {};
  if (goal.score != null) row(`${fmtN(goal.score)} pts`, r.score >= goal.score);
  if (goal.grade) row(`Note ${goal.grade} ou mieux`, r.grade && GRADES.indexOf(r.grade) >= GRADES.indexOf(goal.grade));
  if (goal.clips != null) row(`${goal.clips} clips`, r.clips >= goal.clips);
  if (goal.angle != null) row(`Angle ${goal.angle}°`, r.maxAngle >= goal.angle);
  if (goal.combo != null) row(`Combo ${fmtN(goal.combo)} pts`, r.bestCombo >= goal.combo);
  if (goal.drift != null) row(`${goal.drift} % en glisse`, r.driftPct >= goal.drift);
  if (goal.noWall) row('Aucun contact mur', r.walls === 0);
  return rows;
}
const goalText = (goal) => goalRows(goal).map((r) => r.label).join(' · ');

// fin de mission : objectifs, récompense à la première réussite, fin de chapitre
// run : { score, grade, clips, maxAngle, bestCombo, driftPct, walls }
function finishMission(p, ci, k, run) {
  const ch = CHAPTERS[ci], m = ch && ch.missions[k];
  if (!m || !missionOpen(p, ci, k)) return { ok: false, rows: [], reward: 0, first: false, chapterDone: false };
  const rows = goalRows(m.goal, run);
  const ok = rows.every((r) => r.ok);
  const first = ok && !missionDone(p, m.id);
  if (first) {
    ensure(p).done[m.id] = true;
    Eco.credit(p, `Aventure : ${m.title}`, m.reward);
  }
  return { ok, rows, reward: first ? m.reward : 0, first, chapterDone: first && chapterDone(p, ci), lines: ok ? m.win : m.lose };
}

// exploration : archive, défi de rue ou rencontre ; récompense une seule fois
function collect(p, trackId, kind, k) {
  const zi = zoneIndex(trackId), Z = ZONES[trackId];
  if (zi < 0 || !Z || !zoneOpen(p, trackId)) return null;
  const s = ensure(p), key = trackId + ':' + k;
  const bag = kind === 'arch' ? s.arch : kind === 'street' ? s.street : kind === 'npc' ? s.npc : null;
  if (!bag || bag[key]) return null;
  let reward, label;
  if (kind === 'arch') { if (!Z.archives[k]) return null; reward = ARCHIVE_REWARD; label = 'Archive : ' + Z.archives[k][0]; }
  else if (kind === 'street') { if (!STREET[k]) return null; reward = streetReward(zi); label = 'Défi de rue · ' + CHAPTERS[zi].title; }
  else { if (k !== 0) return null; reward = Z.npc.reward; label = 'Rencontre : ' + CAST[Z.npc.who].name; }
  bag[key] = true;
  Eco.credit(p, label, reward);
  return { reward, label };
}
function zoneProgress(p, trackId) {
  const s = ensure(p), n = (bag, len) => Array.from({ length: len }, (_, k) => bag[trackId + ':' + k]).filter(Boolean).length;
  return { arch: n(s.arch, 5), street: n(s.street, STREET.length), npc: n(s.npc, 1) };
}
function progress(p) {
  const all = CHAPTERS.flatMap((c) => c.missions);
  let found = 0;
  for (const c of CHAPTERS) { const z = zoneProgress(p, c.track); found += z.arch + z.street + z.npc; }
  return { missions: all.filter((m) => missionDone(p, m.id)).length, total: all.length, found, foundTotal: CHAPTERS.length * (5 + STREET.length + 1) };
}

const Story = {
  CAST, CHAPTERS, ZONES, STREET, ARCHIVE_AT, ARCHIVE_REWARD, GRADES,
  ensure, missionDone, chapterDone, chapterOpen, nextMission, missionOpen, currentChapter, zoneIndex, zoneOpen,
  goalRows, goalText, finishMission, collect, zoneProgress, progress, streetFor, streetReward,
};
if (typeof module !== 'undefined') module.exports = Story;
