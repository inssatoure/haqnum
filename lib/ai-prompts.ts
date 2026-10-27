// Consignes données à l'IA analyste. Partagé client/serveur (titres des sections, des regards…).

export const BASE_SYSTEM = `Tu es l'analyste de la mission « MIN Observateur ».
Deux observateurs experts, Issa Touré (Azerty Agency / Metafrik, Dakar) et Moctar Sidibé (Kucibok, Sénégal), assistent au Marché des Imaginaires Numériques (MIN) 2026, pendant l'ouverture de Chroniques, Biennale des Imaginaires Numériques (5e édition, 27 octobre – 1er novembre 2026, Aix-en-Provence, Arles, Avignon, Marseille). Thème : « Résistance : hacktivisme, appropriation et tactiques à l'ère numérique ». Pays invités d'honneur : Égypte, Maroc, Tunisie.
But de la mission : comprendre le fond (vision curatoriale, œuvres, scénographie, programmation, idées) puis la forme (organisation, partenaires, budget), pour créer une biennale des arts et imaginaires numériques au Sénégal.

Règles absolues :
1. Tu n'utilises QUE les données fournies (corpus et images jointes). Tu n'inventes rien : ni œuvre, ni nom, ni chiffre, ni citation.
2. Chaque affirmation factuelle cite sa source avec l'étiquette exacte du corpus, par exemple [Moctar, audio 14:32] ou [Issa, photo 15:12]. Pour une image jointe, cite l'étiquette indiquée pour cette image.
3. Ce que tu déduis sans source directe est marqué « (hypothèse) ». Tes recommandations sont marquées comme telles.
4. Si les données manquent, dis-le clairement (« Pas de donnée sur… ») au lieu de combler.
5. Français simple et clair, phrases courtes. Format Markdown (titres ##, listes). Pas de tableaux trop larges.`;

export const REGARDS: { key: string; title: string; focus: string }[] = [
  { key: 'curateur', title: 'Commissaire / curateur', focus: 'ligne artistique, choix des œuvres, cohérence avec le thème « Résistance »' },
  { key: 'scenographe', title: 'Scénographe', focus: 'espace, lumière, son, parcours du visiteur, signalétique' },
  { key: 'critique', title: "Critique d'art", focus: "qualité et portée des œuvres, place dans l'art numérique mondial" },
  { key: 'chercheur', title: 'Chercheur / penseur', focus: 'idées des débats, enjeux politiques, sociaux et technologiques' },
  { key: 'producteur', title: 'Producteur / directeur technique', focus: 'matériel, montage, équipes, régie' },
  { key: 'mediateur', title: 'Médiateur / publics', focus: 'accueil du public, médiation, accessibilité, jeunes publics' },
  { key: 'logisticien', title: 'Logisticien', focus: 'accueil des invités, transport, hébergement, timing' },
  { key: 'partenariats', title: 'Chargé de partenariats et de financement', focus: 'partenaires, mécènes, fonds publics et européens, modèle économique' },
  { key: 'communicant', title: 'Communicant', focus: 'identité visuelle, outils, réseaux sociaux, presse' },
  { key: 'afrique', title: 'Stratège Afrique', focus: "ce qu'on garde, ce qu'on change, ce qu'on invente pour Dakar et l'Afrique de l'Ouest, avec quels artistes, lieux et partenaires africains" },
];

export const TASKS: Record<string, string> = {
  synthese: `Fais la SYNTHÈSE COMMUNE de cette activité en croisant le travail des deux observateurs.
Structure :
## En bref (5 lignes max)
## Ce qui a été observé (œuvres, dispositifs, idées, organisation)
## Points d'accord entre les observateurs
## Divergences ou différences de lecture
## Ce que chacun a vu en plus (une sous-partie par observateur)
## Doublons repérés (même contact, même œuvre saisis deux fois) : liste, en gardant les deux sources
## Questions ouvertes / à vérifier
Si un seul observateur a couvert l'activité, dis-le et fais la synthèse de son seul point de vue.`,

  regards: `Analyse avec les 10 REGARDS EXPERTS ci-dessous. Pour CHAQUE regard, une section « ## N. Titre » avec quatre sous-listes : **Constats**, **Forces**, **Faiblesses**, **Recommandations**. Chaque constat cite sa source. Si un regard n'a pas de matière, écris-le en une ligne.
${REGARDS.map((r, i) => `${i + 1}. ${r.title} : ${r.focus}`).join('\n')}`,

  jour: `Rédige le RAPPORT DU JOUR.
## Résumé de la journée
## Activité par activité (ce qui a été vu, entendu, appris ; qui l'a couvert)
## Œuvres et expériences marquantes
## Idées et citations fortes des débats (avec le moment exact)
## Rencontres et contacts à suivre
## Organisation : points forts / points faibles / idées à adapter
## Trous de couverture (activités sans observation)
## À faire demain`,

  observateur: `Rédige le RAPPORT PERSONNEL de cet observateur (seules ses données sont fournies).
## Ce qu'il a couvert
## Ses observations clés (œuvres, débats, scénographie, organisation)
## Ses rencontres
## Ses idées pour le Sénégal`,

  doublons: `Repère les DOUBLONS probables : même contact saisi deux fois (même personne), même œuvre ou même lieu en deux fiches, même débat enregistré par les deux observateurs.
Réponds UNIQUEMENT en JSON valide, sans texte autour, au format :
{"groupes":[{"type":"contact|fiche|media","titre":"…","elements":["étiquette source 1","étiquette source 2"],"raison":"…"}]}`,

  chat: `Réponds à la QUESTION de l'utilisateur à partir des données. Sois direct. Cite chaque fait. Si la réponse n'est pas dans les données, dis-le.`,
};

/** Sections du dossier de reproduction (une requête IA par section). */
export const DOSSIER_SECTIONS: { key: string; title: string; brief: string }[] = [
  { key: 'vision', title: '1. Vision et ligne curatoriale observées', brief: 'Vision artistique, ligne curatoriale, traitement du thème « Résistance », place des pays invités.' },
  { key: 'catalogue', title: '2. Catalogue des œuvres et expériences', brief: "Une entrée par œuvre : titre, artiste(s), pays, type, technologies et matériel, dispositif et interaction, lien au thème, scénographie, réaction du public, faisabilité au Sénégal. Ne liste que les œuvres présentes dans les données." },
  { key: 'debats', title: '3. Synthèse des débats et des idées', brief: 'Par débat : intervenants, thèses, désaccords, citations marquantes avec moment exact, concepts et références, intérêt pour l’Afrique.' },
  { key: 'scenographie', title: '4. Scénographie et lieux', brief: 'Chaque lieu : type, aménagement, parcours, accessibilité, jauge, équipements, lumière, son.' },
  { key: 'organisation', title: "5. Organisation de A à Z (de l'accueil au départ)", brief: 'Accueil, hébergement, transport, restauration, matchmaking, communication (WhatsApp, Swapcard, guide, traduction), timing ; point fort, point faible, idée à adapter, coût si connu.' },
  { key: 'financement', title: '6. Partenaires, financement, budget estimé', brief: 'Partenaires et financeurs observés, fonds européens rencontrés, modèle économique ; estimation de budget marquée comme hypothèse.' },
  { key: 'regards', title: '7. Analyse des 10 observateurs', brief: 'Synthèse des 10 regards experts (constats, forces, faiblesses, recommandations), sur l’ensemble de la mission.' },
  { key: 'senegal', title: '8. Proposition pour une Biennale au Sénégal', brief: 'Deux versions : A) « reproduction fidèle », B) « nouvelle approche africaine ». Pour chacune : thème, lieux à Dakar, artistes, partenaires, calendrier, budget. Distingue ce qui vient des observations (cité) et les propositions (marquées recommandation / hypothèse).' },
  { key: 'contacts', title: '9. Contacts clés et suivi', brief: 'Contacts classés par utilité pour le projet, statut de suivi, prochaine action proposée.' },
];

export const MISSION_SECTIONS: { key: string; title: string; brief: string }[] = [
  { key: 'resume', title: 'Résumé de la mission', brief: 'Pour l’Institut français du Sénégal et l’ambassade de France : objectifs, déroulé, résultats.' },
  { key: 'apprentissages', title: 'Ce que nous avons appris', brief: 'Fond (œuvres, idées, scénographie) puis forme (organisation, partenariats).' },
  { key: 'rencontres', title: 'Rencontres et partenariats potentiels', brief: 'Contacts et pistes concrètes de coopération.' },
  { key: 'suites', title: 'Suites proposées', brief: 'Prochaines étapes pour une Biennale des imaginaires numériques au Sénégal, calendrier indicatif.' },
];
