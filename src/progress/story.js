// ===== Aventure : « Le Tour de l’Île », six chapitres et une île à explorer =====
// Logique pure (aucun DOM, aucun Three.js) : le jeu passe le profil, ces fonctions lisent et écrivent profile.story
// et créditent les récompenses par Economy.credit. Les dialogues sont des lignes [personnage, texte].
// Le pilote n’est jamais genré : on lui parle à la deuxième personne, sans accord.
import { Economy } from './economy.js';

// Economy : même script dans le jeu, module à part sous Node (tests)
const Eco = Economy;

const CAST = {
  narr: { name: '', role: 'Récit', ini: '', col: '#a4a8af' },
  kenji: { name: 'Kenji Arakawa', role: 'Mécano du club', ini: 'KA', col: '#f7d154' },
  lou: { name: 'Lou Payet', role: 'Journal de la glisse', ini: 'LP', col: '#7b8cff' },
  mika: { name: 'Mika', role: 'Cheffe des Kuro Kumo', ini: 'MI', col: '#e8e6f0' },
  hoshi: { name: 'Hoshi', role: 'Marmay des docks', ini: 'HO', col: '#4be38a' },
  ryo: { name: 'Ryo Kaneshiro', role: 'Kaneshiro Holdings', ini: 'RK', col: '#9aa0aa' },
  zelie: { name: 'Mamie Zélie', role: 'Gardienne du volcan', ini: 'MZ', col: '#ff9a4a' },
  daruma: { name: 'Daruma', role: 'Juge masqué du Tour', ini: '達', col: '#ff4d4f' },
  sayo: { name: 'Sayo Ishikawa', role: 'Fondatrice du club · lettre', ini: 'SI', col: '#f1efe9' },
  kai: { name: 'Kai', role: 'Pilote des Kuro Kumo', ini: 'KI', col: '#5b5d66' },
  ume: { name: 'Ume', role: 'Pêcheur de la corniche', ini: 'UM', col: '#2fc7d6' },
  sora: { name: 'Sora', role: 'Gardien du refuge', ini: 'SO', col: '#cfe6ff' },
};

const GRADES = ['D', 'C', 'B', 'A', 'S'];

// goal : { score, grade, clips, angle, combo, drift (% du run en glisse), noWall }
const CHAPTERS = [
  {
    id: 'ch1',
    track: 'minato',
    title: 'L’héritage',
    jp: '遺産',
    pitch: 'Le hangar du club sera rasé le 1er décembre. Sayo t’a laissé sa HACHI, et une clause que personne n’a lue.',
    intro: [
      [
        'narr',
        'Docks de Minato, 23 h. Le rideau du hangar 4 est à moitié levé. Dessous, de la lumière, et quelqu’un qui insulte un compresseur.',
      ],
      ['kenji', 'C’est fermé. … Attends. C’est les clés de la HACHI, ça. Alors c’est toi.'],
      ['kenji', 'Sayo m’avait dit que tu viendrais. Elle ne m’avait pas dit que tu mettrais trois mois.'],
      [
        'narr',
        'Sur l’établi, une lettre recommandée. En-tête doré : KANESHIRO HOLDINGS. Une date entourée au feutre rouge : 1er décembre.',
      ],
      [
        'kenji',
        'Ils rasent le terminal. Le hangar part avec. Il reste une seule sortie, et elle passe par six routes.',
      ],
      [
        'kenji',
        'Le Tour de l’Île. Le club qui le gagne garde son hangar : c’est dans le règlement du port. Sayo a fait ajouter la clause en 1996. Elle ne m’a jamais dit pourquoi.',
      ],
      ['kenji', 'Avant tout ça, montre-moi que tu sais tenir une glisse.'],
    ],
    missions: [
      {
        id: 'ch1m1',
        title: 'Premiers tours',
        mode: 'run',
        goal: { score: 4000 },
        reward: 1500,
        brief: [['kenji', 'Un tour. Tiens l’angle et regarde loin devant. Si tu regardes le mur, tu vas le prendre.']],
        win: [['kenji', 'Hm. Sayo freinait trop tard, elle aussi. Au début.']],
        lose: [['kenji', 'Tu as regardé le mur. Je t’ai vu. Recommence.']],
      },
      {
        id: 'ch1m2',
        title: 'Raser les conteneurs',
        mode: 'run',
        goal: { clips: 3 },
        reward: 2000,
        brief: [
          [
            'kenji',
            'Les juges notent les clips. Dehors, l’arrière frôle le mur. Dedans, l’avant passe au ras du cône. J’en veux trois.',
          ],
        ],
        win: [
          ['hoshi', 'J’ai tout filmé ! Trois ! Monsieur Kenji, vous avez vu ?'],
          ['kenji', 'Hoshi. Il vit à moitié ici depuis ses huit ans. Ne lui prête jamais tes clés.'],
        ],
        lose: [['kenji', 'Plus près. Si tu ne sens pas le mur, les juges non plus.']],
      },
      {
        id: 'ch1m3',
        title: 'Le tandem du vieux',
        mode: 'tandem',
        goal: { grade: 'C' },
        reward: 3000,
        brief: [
          [
            'kenji',
            'Dernier test. Je prends la voiture du club et je mène. Tu colles ma portière. Tu ne la lâches pas.',
          ],
        ],
        win: [
          ['kenji', '… Bon.'],
          ['kenji', 'Tu as les mains de Sayo. Ça ne m’arrange pas beaucoup, mais c’est comme ça.'],
        ],
        lose: [['kenji', 'Trop loin. Je t’ai perdu dans le rétro au deuxième virage.']],
      },
    ],
    outro: [
      [
        'kenji',
        'Pour le Tour, il faut des pneus. Donc un sponsor. Donc qu’on parle de nous. Shiohama, demain, à l’aube. Ne sois pas en retard.',
      ],
      [
        'narr',
        'En fermant, Kenji décroche une photo du mur et la glisse dans un tiroir. Trois pilotes autour d’un compresseur. Un des visages a été découpé.',
      ],
    ],
  },
  {
    id: 'ch2',
    track: 'shiohama',
    title: 'La une',
    jp: '一面',
    pitch: 'Lou Payet cherche une une. Toi, un sponsor. Ça peut s’arranger.',
    intro: [
      ['narr', 'Quai de Shiohama, 6 h. Le phare s’éteint. Quelqu’un tape à ta vitre avec un stylo.'],
      [
        'lou',
        'Lou Payet, Journal de la glisse. La HACHI de Sayo Ishikawa qui ressort du hangar, avec au volant quelqu’un que personne ne connaît ? Il faut que je sache qui tu es.',
      ],
      ['lou', 'Non, ne réponds pas. Roule. Je verrai bien.'],
    ],
    missions: [
      {
        id: 'ch2m1',
        title: 'La page trois',
        mode: 'run',
        goal: { grade: 'B' },
        reward: 2500,
        brief: [
          ['lou', 'Note B et tu passes en page trois. En dessous, tu finis entre la météo et les petites annonces.'],
        ],
        win: [['lou', '« La HACHI rallume Shiohama. » Non. Trop joli. Je trouverai mieux.']],
        lose: [['lou', 'Page douze. Juste sous l’horoscope. Encore un.']],
      },
      {
        id: 'ch2m2',
        title: 'Grand angle',
        mode: 'run',
        goal: { angle: 50, combo: 4000 },
        reward: 2500,
        brief: [
          [
            'lou',
            'Mon photographe veut la voiture de profil, complètement de travers. Plus de 50°, et un combo à 4 000.',
          ],
        ],
        win: [['lou', 'Il a eu sa photo. Il ne dit plus rien. Chez lui, c’est très bon signe.']],
        lose: [['lou', 'Trop droit. On dirait une photo de parking.']],
      },
      {
        id: 'ch2m3',
        title: 'Propre comme un sou neuf',
        mode: 'run',
        goal: { score: 9000, noWall: true },
        reward: 3500,
        brief: [['kenji', 'Les sponsors ont horreur de la tôle froissée. 9 000 points. Pas un contact.']],
        win: [
          ['lou', 'Kaizen Pneus a appelé la rédaction. Ils veulent voir la voiture.'],
          [
            'narr',
            'Page sept du même numéro, un entrefilet : sur le col d’Akane, un crew en noir arrête les voitures qui montent.',
          ],
        ],
        lose: [['kenji', 'Une portière pliée sur une photo, et le sponsor raccroche.']],
      },
    ],
    outro: [
      ['lou', 'Si tu montes à Akane, un conseil : ne dis pas à Mika d’où vient ta voiture.'],
      ['lou', 'Pourquoi ? Demande-lui. J’aimerais bien voir sa tête.'],
    ],
  },
  {
    id: 'ch3',
    track: 'akane',
    title: 'Les Nuages noirs',
    jp: '黒雲',
    pitch: 'Dix voitures noires bloquent le col d’Akane. Leur cheffe reconnaît ta voiture. Elle ne l’aime pas.',
    intro: [
      [
        'narr',
        'Col d’Akane, au couchant. Une dizaine de voitures noires en travers de la route. Sur un drapeau, un nuage brodé : 黒雲.',
      ],
      ['mika', 'Une HACHI blanche. Sérieusement ?'],
      ['mika', 'Je croyais qu’elle était morte avec la vieille.'],
      ['kenji', 'Elle s’appelait Sayo, Mika.'],
      [
        'mika',
        'Je sais comment elle s’appelait. Trois épreuves. Tu perds, tu laisses la voiture ici et tu redescends à pied.',
      ],
    ],
    missions: [
      {
        id: 'ch3m1',
        title: 'Les épingles',
        mode: 'run',
        goal: { score: 12000 },
        reward: 3000,
        brief: [['mika', 'Mes pilotes montent à 12 000. Fais pareil. Après, on parle.']],
        win: [['mika', 'De la chance.']],
        lose: [['mika', 'La descente à pied, c’est à gauche.']],
      },
      {
        id: 'ch3m2',
        title: 'L’ombre de Kuro Kumo',
        mode: 'tandem',
        goal: { grade: 'B' },
        reward: 4000,
        brief: [['kai', 'Kai. Je mène, tu suis. Tu me perds dans les lacets, tu rentres.']],
        win: [
          [
            'narr',
            'Au dernier lacet, Kai sort la main par la fenêtre, deux doigts levés. Plus haut, quelqu’un siffle entre ses dents.',
          ],
        ],
        lose: [['kai', 'Je ne t’ai même pas vu dans le rétro.']],
      },
      {
        id: 'ch3m3',
        title: 'Le roi du col',
        mode: 'run',
        goal: { grade: 'A', angle: 55 },
        reward: 5000,
        brief: [['mika', 'Note A. Et au moins une fois à 55°. Je veux savoir si tu pilotes ou si tu pries.']],
        win: [
          ['mika', '… Tu peux monter sur mon col.'],
          ['mika', 'On n’est pas amis. Mon père paie mes pneus, et mon père veut ton hangar.'],
          ['mika', 'Il s’appelle Ryo Kaneshiro. Demande à ton mécano s’il s’en souvient.'],
        ],
        lose: [['mika', 'Tu pries. Ça s’entend d’ici.']],
      },
    ],
    outro: [
      ['narr', 'Sur la route du retour, Kenji ne dit rien pendant quarante minutes.'],
      ['kenji', 'La corniche, demain soir. Il y sera. Il y est tous les soirs.'],
    ],
  },
  {
    id: 'ch4',
    track: 'kaigan',
    title: 'La corniche',
    jp: '断崖',
    pitch: 'Ryo Kaneshiro t’attend au belvédère avec une offre. Et une vieille histoire qu’il raconte à sa façon.',
    intro: [
      [
        'narr',
        'Corniche de Kaigan. L’océan tape contre la falaise. Sur le parking du belvédère, une limousine grise, moteur allumé.',
      ],
      [
        'ryo',
        'Voici donc la recrue. Vous conduisez bien. Sayo aussi. Ça ne l’a pas empêchée de mourir avec des dettes, dans un hangar qui fuit.',
      ],
      [
        'ryo',
        'Mon offre : vous renoncez au Tour, je rachète les parts du club au double. Vous repartez riche. Kenji repart tranquille.',
      ],
      ['kenji', 'Le club n’est pas à vendre.'],
      ['ryo', 'Tout se vend, Kenji. Toi, par exemple. Et tu ne t’es pas vendu cher.'],
      ['narr', 'Kenji serre la mâchoire. Il ne répond pas.'],
    ],
    missions: [
      {
        id: 'ch4m1',
        title: 'Au bord du vide',
        mode: 'run',
        goal: { drift: 45 },
        reward: 3500,
        brief: [
          ['kenji', 'Ne l’écoute pas. La corniche est longue : glisse au moins 45 % du run. Lui, c’est mon problème.'],
        ],
        win: [['kenji', 'Voilà. Lui, il regarde. Toi, tu roules.']],
        lose: [['kenji', 'Trop de ligne droite. Mets-la de travers et laisse-la y rester.']],
      },
      {
        id: 'ch4m2',
        title: 'Duel au crépuscule',
        mode: 'tandem',
        goal: { grade: 'B', noWall: true },
        reward: 5000,
        brief: [
          [
            'mika',
            'Mon père veut que je t’écrase ici, devant lui. Moi, je veux juste un tandem propre. Pas de contact, d’accord ?',
          ],
        ],
        win: [
          [
            'mika',
            'Tu sais pourquoi il déteste ton club ? Ils l’ont viré en 2006. Une voiture au fond du ravin, au volcan.',
          ],
          ['mika', 'Lui, il jure qu’il n’était pas au volant. Personne ne l’a cru. Même pas moi.'],
        ],
        lose: [['mika', 'Sans contact, j’ai dit. On la refait.']],
      },
      {
        id: 'ch4m3',
        title: 'Le grand large',
        mode: 'run',
        goal: { score: 22000 },
        reward: 5500,
        brief: [['lou', 'Toute l’île a lu le duel ce matin. Un gros score sur la corniche, et Kaizen signe.']],
        win: [
          ['lou', 'Kaizen signe. Autre chose : quelqu’un a laissé une enveloppe au journal, à ton nom. Sans timbre.'],
          [
            'narr',
            'Dedans, un petit Daruma en papier. Un œil peint, l’autre vide. Au dos, deux mots au pinceau : « Piton Volcan. »',
          ],
        ],
        lose: [['lou', 'Kaizen veut un chiffre qui fait peur. Celui-là les fait bâiller.']],
      },
    ],
    outro: [
      ['kenji', 'Le volcan…'],
      ['kenji', 'Avant qu’on monte, il faut que je te parle. Pas ce soir. Demain. Peut-être.'],
    ],
  },
  {
    id: 'ch5',
    track: 'piton',
    title: 'Ce que Kenji cache',
    jp: '秘密',
    pitch: 'Kenji n’est pas monté au volcan depuis vingt ans. Cette fois, il n’a plus d’excuse.',
    intro: [
      [
        'narr',
        'Piton Volcan. La route grimpe entre les cannes et le basalte. Kenji conduit lentement. Il n’a pas allumé la radio.',
      ],
      [
        'zelie',
        'Lé bon, marmay ? … Kenji ! Vingt ans que je t’ai pas vu sur ma route. T’as vieilli, ou c’est la lumière ?',
      ],
      ['zelie', 'Mi koné pourquoi tu es là. Mais c’est pas à moi de causer.'],
      ['kenji', '2006. On roulait ici la nuit. Sayo, Ryo et moi. Ryo avait la plus belle voiture de l’île.'],
      [
        'kenji',
        'Je l’ai prise sans demander. Je voulais juste savoir ce que ça faisait. Troisième virage après les cannes, je l’ai mise au fond du ravin.',
      ],
      ['kenji', 'Le lendemain, tout le monde a cru que c’était lui. J’avais vingt-cinq ans. J’ai laissé faire.'],
      ['kenji', 'Sayo a compris, des années après. Elle n’a rien dit à personne. Lui ne sait toujours pas.'],
    ],
    missions: [
      {
        id: 'ch5m1',
        title: 'Le carrousel',
        mode: 'run',
        goal: { clips: 4, score: 14000 },
        reward: 4500,
        brief: [['kenji', 'Le carrousel du cratère. Quatre clips, 14 000 points. … S’il te plaît.']],
        win: [['kenji', 'Merci. J’avais besoin de voir quelqu’un passer ici sans finir dans le ravin.']],
        lose: [['zelie', 'Doucement, marmay. Le volcan a le temps. Toi aussi.']],
      },
      {
        id: 'ch5m2',
        title: 'La lettre de Sayo',
        mode: 'run',
        goal: { grade: 'A' },
        reward: 5500,
        brief: [
          [
            'narr',
            'Dans la boîte à gants de la HACHI, sous la carte grise, une enveloppe jaunie. Dessus : « Pour quand tu monteras au volcan. »',
          ],
          ['sayo', 'Si tu lis ça, Kenji a enfin parlé. Ne lui en veux pas trop. Il s’en veut assez pour deux.'],
          [
            'sayo',
            'Il reste une chose à faire. Ryo doit savoir. Moi, je n’ai jamais trouvé le courage. Toi, peut-être.',
          ],
        ],
        win: [['zelie', 'Sayo serait contente. Allez, descends. Et va dire ça à qui de droit.']],
        lose: [['zelie', 'Relis la lettre, marmay. Et remonte.']],
      },
      {
        id: 'ch5m3',
        title: 'Vérité au cratère',
        mode: 'tandem',
        goal: { grade: 'B', combo: 6000 },
        reward: 6000,
        brief: [
          [
            'mika',
            'Kenji a appelé mon père. Ils se voient ce soir. Avant… un dernier tandem autour du cratère ? J’ai pas envie d’attendre en bas.',
          ],
        ],
        win: [
          ['mika', 'Ils ont parlé une heure sur le parking. Mon père n’a rien dit. Pas un mot.'],
          ['mika', 'Puis il a sorti un masque de son manteau. Un Daruma. Un seul œil peint.'],
          ['daruma', 'Col de Yukimi, à la première neige. Le Tour se jouera là-haut.'],
        ],
        lose: [['mika', 'Encore un tour. Mon père a attendu vingt ans, il peut attendre dix minutes.']],
      },
    ],
    outro: [
      ['lou', 'Ryo Kaneshiro, c’est Daruma ? Depuis le début ?'],
      ['lou', 'J’ai la une du siècle, et je n’ai pas le droit de l’écrire avant la finale. Je déteste ce métier.'],
    ],
  },
  {
    id: 'ch6',
    track: 'yukimi',
    title: 'Le Tour de l’Île',
    jp: '島一周',
    pitch: 'Première neige sur Yukimi. Mika en face. Le hangar au bout.',
    intro: [
      [
        'narr',
        'Col de Yukimi, première neige. Le club est là, les Kuro Kumo aussi. Derrière les barrières, la moitié de l’île tape des pieds pour se réchauffer.',
      ],
      [
        'daruma',
        'Vingt ans que je juge ce Tour derrière ce masque. Je voulais comprendre ce que Sayo voyait dans ce club. Et pas en moi.',
      ],
      [
        'daruma',
        'Bats ma fille dans la neige, et le hangar reste au Sideways. Sinon, les bulldozers passent le 1er décembre. Pas d’exception.',
      ],
      ['mika', 'Ne me fais pas de cadeau. Je ne t’en ferai pas.'],
    ],
    missions: [
      {
        id: 'ch6m1',
        title: 'Reconnaissance',
        mode: 'run',
        goal: { score: 12000, noWall: true },
        reward: 5000,
        brief: [
          [
            'kenji',
            'Sur la neige, la voiture glisse partout, pas seulement là où tu veux. Doux sur les gaz. Un run propre pour lire la route.',
          ],
        ],
        win: [['kenji', 'Propre. Garde ce rythme.']],
        lose: [['kenji', 'Avec la neige, le mur est plus près qu’il n’en a l’air. Encore.']],
      },
      {
        id: 'ch6m2',
        title: 'Le serpentin',
        mode: 'run',
        goal: { grade: 'A', clips: 6 },
        reward: 7000,
        brief: [
          [
            'lou',
            'Les juges regardent le serpentin à la loupe. Six clips, note A. Les tribunes se taisent quand tu y entres.',
          ],
        ],
        win: [
          [
            'lou',
            'Les tribunes chantent le nom du club. Vingt ans que je couvre le Tour, je n’avais jamais entendu ça.',
          ],
        ],
        lose: [['lou', 'Le serpentin t’a mangé. Ça arrive aux meilleurs. Retente.']],
      },
      {
        id: 'ch6m3',
        title: 'Finale : Sideways contre Kuro Kumo',
        mode: 'tandem',
        goal: { grade: 'A', noWall: true },
        reward: 12000,
        brief: [
          [
            'mika',
            'Dernier tandem. Je mène. Tu tiens ma portière jusqu’à la ligne sans toucher un mur, et le hangar est à toi.',
          ],
        ],
        win: [
          ['daruma', 'Le Sideways Drift Club garde son hangar.'],
          ['narr', 'Ryo retire son masque. Il sort un pinceau de sa poche et peint le deuxième œil.'],
          ['ryo', 'Kenji. Tu me dois une voiture depuis 2006.'],
          ['kenji', 'Je te la prépare. Si tu reviens rouler le dimanche.'],
        ],
        lose: [['mika', 'Pas encore. Remonte au départ, je t’attends.']],
      },
    ],
    outro: [
      [
        'lou',
        'Journal de la glisse, édition spéciale. Titre : « Le Sideways est de retour. » Mon rédacteur trouve ça trop simple. Je l’ai gardé.',
      ],
      [
        'mika',
        'Kuro Kumo et Sideways dans le même hangar le dimanche. Mon père appelle ça une fusion. Moi, j’appelle ça avoir enfin de la place pour se garer.',
      ],
      ['kenji', 'Une voiture, une clause de 1996, et toi. Sayo savait très bien ce qu’elle faisait.'],
      ['kenji', 'Bienvenue chez toi.'],
      [
        'narr',
        'Fin du Tour de l’Île. Les six lieux restent ouverts. Sayo a caché d’autres choses sur l’île, et pas seulement des daruma.',
      ],
    ],
  },
];

// Exploration de chaque lieu (mode libre) : archives cachées (coupures du Journal), défis de rue, une rencontre.
// at = position le long du tracé (0..1), side = côté (−1 gauche, +1 droite, 0 centre).
const ZONES = {
  minato: {
    archives: [
      [
        '1995 · La fondation',
        'Une pilote de 24 ans loue le hangar 4 du terminal pour 3 000 ¥ par mois. Elle peint « SIDEWAYS » sur la porte. À l’envers, la première fois.',
      ],
      [
        '1996 · Une clause bizarre',
        'Le règlement du port gagne un article : le club champion du Tour garde son hangar. Signé S. Ishikawa. Personne ne sait comment elle l’a obtenu.',
      ],
      [
        '1998 · La HACHI',
        'Une HACHI blanche rachetée à une infirmière de nuit qui partait en métropole. Sayo refuse de la repeindre : « Elle a déjà une histoire. »',
      ],
      [
        '2003 · Les trois du hangar 4',
        'Photo en une : Sayo Ishikawa, Kenji Arakawa et Ryo Kaneshiro autour d’un compresseur. Légende : « L’avenir du drift sur l’île. »',
      ],
      [
        '2025 · Nécrologie',
        '« Sayo Ishikawa s’est éteinte mardi. Le club perd sa fondatrice. Sa HACHI reste au hangar 4, sous une bâche. »',
      ],
    ],
    npc: {
      at: 0.42,
      side: -1,
      who: 'hoshi',
      reward: 800,
      lines: [
        ['hoshi', 'Lé bon ? La nuit, les grues, on dirait des girafes. C’est Sayo qui disait ça.'],
        ['hoshi', 'Elle me laissait cirer la HACHI. Si tu gagnes, je pourrai encore ? Je fais pas de traces, promis.'],
      ],
    },
  },
  shiohama: {
    archives: [
      [
        '1997 · Le premier Tour',
        'Sept voitures au départ, quarante spectateurs, une glacière. Le Sideways finit deuxième, derrière un livreur de pain.',
      ],
      [
        '2000 · Le phare',
        'Le gardien du phare allume la lanterne chaque fois que le club passe. En plein jour. La mairie lui a écrit trois fois.',
      ],
      ['2004 · Doublé', 'Le Sideways gagne le Tour pour la deuxième année. Article signé L. Payet, stagiaire.'],
      [
        '2006 · Départ',
        'Communiqué de quatre lignes : « Ryo Kaneshiro quitte le Sideways Drift Club. » Le club refuse de commenter.',
      ],
      [
        '2014 · Kaneshiro Holdings',
        'Ryo Kaneshiro rachète la moitié du port. Interrogé sur le drift, il répond : « Question suivante. »',
      ],
    ],
    npc: {
      at: 0.42,
      side: 1,
      who: 'lou',
      reward: 800,
      lines: [
        ['lou', 'Pour une bonne une, il faut un visage et une phrase. Le reste, c’est de la mise en page.'],
        ['lou', 'Ton visage, je l’ai. La phrase, je l’attends encore.'],
      ],
    },
  },
  akane: {
    archives: [
      [
        '1999 · Le col interdit',
        'La préfecture ferme Akane la nuit. Le club obtient une dérogation : un dimanche par mois. Sayo remercie le préfet avec un gâteau patate.',
      ],
      [
        '2008 · Kuro Kumo',
        'Un nouveau crew s’installe au sommet du col. Leur cheffe a quinze ans. Elle refuse de donner son nom de famille.',
      ],
      [
        '2012 · Le record',
        'Mika bat le record du col en RAIJIN noire. L’ancien tenait depuis 2002. Il était à Sayo Ishikawa.',
      ],
      [
        '2019 · Le torii',
        'Les Kuro Kumo repeignent le torii du col. Les habitants leur apportent des onigiri. Personne ne sait qui a payé la peinture.',
      ],
      [
        '2024 · Défi refusé',
        'Mika défie le Sideways. Sayo, déjà malade, répond par lettre : « Pas cette année. Quelqu’un viendra. »',
      ],
    ],
    npc: {
      at: 0.42,
      side: -1,
      who: 'kai',
      reward: 800,
      lines: [
        ['kai', 'Mika joue les dures. Elle garde tous les articles sur Sayo dans une boîte à chaussures.'],
        ['kai', 'Tu lui répètes ça, je te pousse dans le ravin.'],
      ],
    },
  },
  kaigan: {
    archives: [
      [
        '2001 · La corniche',
        'Inauguration de la route du bord de mer. Le Sideways la descend en glisse une heure avant le ruban. Amende : 8 000 ¥.',
      ],
      [
        '2005 · Le cyclone',
        'Un cyclone arrache un pan de falaise. Le club dégage la route pendant trois jours, à la pelle.',
      ],
      [
        '2010 · Nuits de corniche',
        'Les Kuro Kumo s’entraînent ici les soirs de pleine lune. Ume, pêcheur, compte les passages dans un cahier d’écolier.',
      ],
      [
        '2016 · Kaizen Pneus',
        'Petite marque locale, Kaizen Pneus cherche un club à sponsoriser. L’annonce reste sans réponse.',
      ],
      [
        '2023 · Le belvédère',
        'Ryo Kaneshiro rachète le parking du belvédère. Il y vient seul, le soir. Il ne descend jamais de voiture.',
      ],
    ],
    npc: {
      at: 0.42,
      side: 1,
      who: 'ume',
      reward: 800,
      lines: [
        ['ume', 'Le monsieur à la limousine, il regarde passer les voitures. Il sourit jamais.'],
        ['ume', 'Sauf une fois. Une HACHI blanche, y a longtemps. Il a même klaxonné.'],
      ],
    },
  },
  piton: {
    archives: [
      [
        '2002 · Le carrousel',
        'Le club découvre la boucle du cratère. Sayo la baptise « le carrousel » : une fois dedans, on n’a plus envie d’en sortir.',
      ],
      [
        '2006 · La nuit du ravin',
        'Une voiture de sport retrouvée au fond du ravin, vide. Pas de blessé, pas de plainte. Le club ne commente pas.',
      ],
      ['2007 · Retraite', 'Kenji Arakawa raccroche son casque à 26 ans. Il ne quittera plus l’établi du hangar 4.'],
      [
        '2018 · Une nuit chez Zélie',
        'Sayo Ishikawa passe une nuit entière à écrire dans la case de Mamie Zélie. Au matin, elle repart sans rien poster.',
      ],
      ['2025 · Mamie Zélie', 'La gardienne du volcan, au Journal : « Ce ravin rend tout. Il prend juste son temps. »'],
    ],
    npc: {
      at: 0.42,
      side: -1,
      who: 'zelie',
      reward: 800,
      lines: [
        ['zelie', 'Allons, marmay, assieds-toi deux minutes. Ou lé fatigué, sa i voi.'],
        ['zelie', 'Kenji montait ici tous les samedis, avant. Depuis 2006, plus rien. Demande-lui pourquoi.'],
      ],
    },
  },
  yukimi: {
    archives: [
      [
        '1996 · Le refuge',
        'Pour la première fois, le Tour se termine au col de Yukimi. Sora, gardien du refuge, sert le thé aux pilotes. Gratuit pour le dernier.',
      ],
      [
        '2007 · Daruma',
        'Un juge masqué apparaît au Tour. Il note sans parler et repart avant la remise des prix. On l’appelle Daruma.',
      ],
      [
        '2011 · L’œil vide',
        'Daruma n’a jamais peint le deuxième œil de son masque. Interrogé, il ne répond pas. Il ne répond jamais.',
      ],
      [
        '2015 · Neige tardive',
        'Tour couru sous la neige. Seule Sayo termine sans toucher un mur. Daruma reste longtemps debout devant sa voiture.',
      ],
      [
        '2025 · Le dernier Tour ?',
        'Kaneshiro Holdings confirme la démolition du terminal 4. Sans club au départ, le Tour pourrait s’arrêter là.',
      ],
    ],
    npc: {
      at: 0.42,
      side: 1,
      who: 'sora',
      reward: 800,
      lines: [
        ['sora', 'Daruma prend son thé sans sucre. Toujours la même table : celle d’où on voit le volcan.'],
        ['sora', 'Bonne chance. Et méfie-toi de l’ombre sous les pins : c’est là que ça gèle en premier.'],
      ],
    },
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
  const s = STREET[k],
    z = zi * 0.18; // plus exigeant au fil des chapitres
  return s.type === 'hold'
    ? { ...s, angle: Math.round(s.angle + zi * 3), secs: Math.round((s.secs + z * 2) * 10) / 10 }
    : { ...s, pts: Math.round((s.pts * (1 + z)) / 100) * 100 };
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
function chapterDone(p, ci) {
  return CHAPTERS[ci].missions.every((m) => missionDone(p, m.id));
}
function chapterOpen(p, ci) {
  return ci === 0 || (ci > 0 && ci < CHAPTERS.length && chapterDone(p, ci - 1));
}
// première mission non faite d'un chapitre ouvert, ou -1
function nextMission(p, ci) {
  if (!chapterOpen(p, ci)) return -1;
  return CHAPTERS[ci].missions.findIndex((m) => !missionDone(p, m.id));
}
function missionOpen(p, ci, k) {
  return chapterOpen(p, ci) && CHAPTERS[ci].missions.slice(0, k).every((m) => missionDone(p, m.id));
}
// chapitre courant : le premier non terminé (ou le dernier)
function currentChapter(p) {
  const i = CHAPTERS.findIndex((c, ci) => !chapterDone(p, ci));
  return i < 0 ? CHAPTERS.length - 1 : i;
}
const zoneIndex = (trackId) => CHAPTERS.findIndex((c) => c.track === trackId);
const zoneOpen = (p, trackId) => {
  const i = zoneIndex(trackId);
  return i >= 0 && chapterOpen(p, i);
};

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
const goalText = (goal) =>
  goalRows(goal)
    .map((r) => r.label)
    .join(' · ');

// fin de mission : objectifs, récompense à la première réussite, fin de chapitre
// run : { score, grade, clips, maxAngle, bestCombo, driftPct, walls }
function finishMission(p, ci, k, run) {
  const ch = CHAPTERS[ci],
    m = ch && ch.missions[k];
  if (!m || !missionOpen(p, ci, k)) return { ok: false, rows: [], reward: 0, first: false, chapterDone: false };
  const rows = goalRows(m.goal, run);
  const ok = rows.every((r) => r.ok);
  const first = ok && !missionDone(p, m.id);
  if (first) {
    ensure(p).done[m.id] = true;
    Eco.credit(p, `Aventure : ${m.title}`, m.reward);
  }
  return {
    ok,
    rows,
    reward: first ? m.reward : 0,
    first,
    chapterDone: first && chapterDone(p, ci),
    lines: ok ? m.win : m.lose,
  };
}

// exploration : archive, défi de rue ou rencontre ; récompense une seule fois
function collect(p, trackId, kind, k) {
  const zi = zoneIndex(trackId),
    Z = ZONES[trackId];
  if (zi < 0 || !Z || !zoneOpen(p, trackId)) return null;
  const s = ensure(p),
    key = trackId + ':' + k;
  const bag = kind === 'arch' ? s.arch : kind === 'street' ? s.street : kind === 'npc' ? s.npc : null;
  if (!bag || bag[key]) return null;
  let reward, label;
  if (kind === 'arch') {
    if (!Z.archives[k]) return null;
    reward = ARCHIVE_REWARD;
    label = 'Archive : ' + Z.archives[k][0];
  } else if (kind === 'street') {
    if (!STREET[k]) return null;
    reward = streetReward(zi);
    label = 'Défi de rue · ' + CHAPTERS[zi].title;
  } else {
    if (k !== 0) return null;
    reward = Z.npc.reward;
    label = 'Rencontre : ' + CAST[Z.npc.who].name;
  }
  bag[key] = true;
  Eco.credit(p, label, reward);
  return { reward, label };
}
function zoneProgress(p, trackId) {
  const s = ensure(p),
    n = (bag, len) => Array.from({ length: len }, (_, k) => bag[trackId + ':' + k]).filter(Boolean).length;
  return { arch: n(s.arch, 5), street: n(s.street, STREET.length), npc: n(s.npc, 1) };
}
function progress(p) {
  const all = CHAPTERS.flatMap((c) => c.missions);
  let found = 0;
  for (const c of CHAPTERS) {
    const z = zoneProgress(p, c.track);
    found += z.arch + z.street + z.npc;
  }
  return {
    missions: all.filter((m) => missionDone(p, m.id)).length,
    total: all.length,
    found,
    foundTotal: CHAPTERS.length * (5 + STREET.length + 1),
  };
}

export const Story = {
  CAST,
  CHAPTERS,
  ZONES,
  STREET,
  ARCHIVE_AT,
  ARCHIVE_REWARD,
  GRADES,
  ensure,
  missionDone,
  chapterDone,
  chapterOpen,
  nextMission,
  missionOpen,
  currentChapter,
  zoneIndex,
  zoneOpen,
  goalRows,
  goalText,
  finishMission,
  collect,
  zoneProgress,
  progress,
  streetFor,
  streetReward,
};
