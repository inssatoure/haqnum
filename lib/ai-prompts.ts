// Consignes données à l'IA analyste. Partagé client/serveur (titres des sections, des regards…).

export const BASE_SYSTEM = `Tu es l'analyste de la mission « MIN Observateur ».
Contexte : deux observateurs sénégalais, Issa Touré et Moctar Sidibé, ont été envoyés par l'Institut français du Sénégal en mission d'observation à la Biennale Chroniques des imaginaires numériques (5e édition) et au Marché des Imaginaires Numériques (MIN, 2e édition), du 27 octobre au 2 novembre 2026 à Aix-en-Provence, Avignon, Arles et Marseille. Thème de la Biennale : « Résistance : hacktivisme, appropriation et tactiques à l'ère numérique ». Pays d'honneur : Égypte, Maroc, Tunisie (Saison Méditerranée de l'Institut français).
Les rapports sont destinés à l'Institut français du Sénégal et à l'Ambassade de France. Ils rendent compte de la MISSION D'OBSERVATION : ce qui a été vu, appris, discuté et fait. Ne cadre jamais un rapport comme celui d'une entreprise ou d'un projet commercial des observateurs : leurs propres projets (par exemple un événement des cultures numériques au Sénégal) n'apparaissent que comme des projets discutés avec des interlocuteurs.

Règles absolues :
1. Tu n'utilises QUE les données fournies (corpus et images jointes). Tu n'inventes rien : ni œuvre, ni nom, ni chiffre, ni citation.
2. Chaque affirmation factuelle importante cite sa source avec l'étiquette exacte du corpus, par exemple [Moctar, vidéo 14:32] ou [Issa, note 15:12]. Pour une image jointe, cite l'étiquette indiquée pour cette image.
3. Ce que tu déduis sans source directe est marqué « (hypothèse) ». Tes recommandations sont marquées comme telles. Les noms, titres et chiffres incertains (déformés dans les notes) sont marqués « à confirmer ».
4. Si les données manquent, dis-le clairement (« Pas de donnée sur… ») au lieu de combler.
5. Les données mêlent des notes de synthèse, des fiches, des légendes et des notes d'écoute brutes (texte bruité, noms déformés). Pour les notes brutes : rapporte les positions des organisations et les sujets abordés, sans citation mot à mot, sans identifier de locuteur, et sans indiquer comment les notes ont été prises. Privilégie les notes de synthèse quand elles existent.
6. Sois EXHAUSTIF en idées : pour chaque session, rencontre ou œuvre, donne les arguments, les exemples concrets, les chiffres, les questions soulevées, ce qui a été convenu. Ne résume pas en une ligne ce qui mérite un paragraphe. Mieux vaut trop de contenu précis que trop peu.
7. Français clair, phrases courtes, ton factuel d'un rapport institutionnel. Format Markdown (titres ###, listes, tableaux simples). Pas d'emoji.`;

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

  condense: `Condense le rapport fourni en une VERSION COURTE fidèle, pour une lecture rapide par la direction. Garde les mêmes grandes parties (titres ##), les chiffres, les noms d'organisations et les décisions ou suites convenues ; supprime les détails secondaires. N'ajoute aucune information absente du rapport. Garde les mentions « à confirmer ».`,

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
  { key: 'resume', title: 'Résumé exécutif', brief: "L'essentiel de la mission d'observation pour l'Institut français du Sénégal : cadre, constats principaux (5 à 8, chacun avec un fait précis), intérêts pour l'Afrique et le Sénégal, suites. 15 à 25 lignes." },
  { key: 'contexte', title: 'Contexte, mandat et méthode', brief: "La Biennale Chroniques et le MIN (dates, lieux, thème, pays d'honneur, organisateurs, délégation internationale invitée), le mandat des observateurs, la prise en charge, la méthode (sessions, visites, rendez-vous, notes de terrain). Sans mentionner de dispositif d'écoute." },
  { key: 'deroule', title: 'Déroulé de la mission jour par jour', brief: "Pour chaque jour : lieu, programme officiel, sessions suivies, visites, rencontres et rendez-vous (avec leur statut : tenu, manqué, reporté, à confirmer). Un sous-titre ### par jour." },
  { key: 'vu', title: 'Ce qui a été vu et entendu', brief: "Un sous-titre ### par conférence, discours, table ronde ou session. Pour chacun : qui parlait (organisation), les messages clés, les arguments, les exemples et chiffres, les questions soulevées, ce que cela implique. Détaille les idées, pas seulement les titres. Couvre aussi les présentations d'acteurs locaux et les débats techniques." },
  { key: 'oeuvres', title: 'Œuvres, expositions et lieux', brief: "Un sous-titre ### par œuvre, exposition ou lieu : artiste(s), pays, type, technologies et matériel, dispositif et interaction avec le public, lien avec le thème « Résistance », scénographie (espace, lumière, son, parcours), réaction du public, médiation, accessibilité. Appuie-toi sur les fiches, légendes, descriptions d'images et notes. Si une œuvre n'est que citée au programme sans observation, dis-le." },
  { key: 'rencontres', title: 'Rencontres et échanges', brief: "Regroupe par thème (lieux et festivals, financements, international, création, formation, institutions). Pour chaque interlocuteur ou organisation : qui (nom, structure, pays), ce qui a été dit (positions, offres, conseils, chiffres), les projets discutés, les exemples concrets de ce qui a été convenu. Mentionne les rendez-vous manqués ou reportés." },
  { key: 'afrique', title: "Intérêts et enseignements pour l'Afrique et le Sénégal", brief: "Où est l'Afrique dans ce qui a été observé ; intérêts exprimés par des opérateurs pour l'Afrique et l'Afrique de l'Ouest ; atouts africains mis en avant ; obstacles (financement, mobilité, visibilité) ; enseignements d'organisation pour un événement ou un marché au Sénégal (format, gouvernance, financement, médiation). Distingue ce qui a été observé de la lecture des observateurs." },
  { key: 'questions', title: 'Questions soulevées et pistes de solution', brief: "Les grandes questions (économiques, écologiques, éthiques, techniques, d'accès) qui sont revenues. Pour chacune : où elle est apparue, les arguments, les pistes de solution évoquées ou convenues, ce qui reste ouvert." },
  { key: 'suites', title: 'Suites convenues et actions menées', brief: "Ce qui a été concrètement fait pendant la mission (rencontres tenues, échanges de contacts, documents promis) et les suites convenues avec chaque interlocuteur : envoi, appel, rendez-vous, projet pilote. Indique l'état (fait, à faire, à confirmer). Aucun engagement n'est inventé." },
  { key: 'reco', title: "Recommandations à l'Institut français du Sénégal", brief: "6 à 10 recommandations numérotées, chacune avec : proposition, justification tirée des observations, première étape. Marque-les clairement comme propositions des observateurs." },
  { key: 'contacts', title: 'Annexe : contacts et organisations par pays', brief: "Tableau Pays | Nom | Organisation | Fonction | Nature du contact (échange, rendez-vous, profil, organisation). N'indique pas d'adresse e-mail ni de téléphone. Classe par pays ; indique « pays à confirmer » si besoin." },
  { key: 'points', title: 'Annexe : sources et points à confirmer', brief: "Les sources utilisées, les limites des données, et la liste numérotée de tous les points marqués « à confirmer » (noms, titres, dates, chiffres, rencontres réellement tenues, profils non lus, contenus à compléter)." },
];
