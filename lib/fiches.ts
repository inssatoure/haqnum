// Champs des fiches de fond. Les valeurs sont rangées dans fiches.data (JSON).

export type FieldKind = 'text' | 'long' | 'select' | 'tags' | 'number';
export interface FicheField {
  key: string;
  label: string;
  kind: FieldKind;
  options?: string[];
  hint?: string;
  group?: string;
}

export const FICHE_TYPES: Record<string, { label: string; titleLabel: string; fields: FicheField[] }> = {
  oeuvre: {
    label: 'Œuvre / Expérience',
    titleLabel: "Titre de l'œuvre",
    fields: [
      { key: 'artistes', label: 'Artiste(s)', kind: 'text', group: 'Identité' },
      { key: 'pays', label: 'Pays', kind: 'text', group: 'Identité' },
      { key: 'production', label: 'Production / coproduction', kind: 'text', group: 'Identité' },
      { key: 'lieu', label: 'Lieu', kind: 'text', group: 'Identité' },
      { key: 'exposition', label: 'Exposition', kind: 'text', group: 'Identité' },
      { key: 'type_oeuvre', label: 'Type', kind: 'tags', options: ['installation', 'VR/XR', 'performance', 'jeu vidéo', 'mapping', 'son', 'IA', 'bio-art', 'vidéo', 'interactive', 'web', 'robotique'], group: 'Identité' },
      { key: 'technologies', label: 'Technologies et matériel', kind: 'long', hint: 'écrans, capteurs, casques, projecteurs, logiciels…', group: 'Technique' },
      { key: 'dispositif', label: 'Dispositif et interaction avec le public', kind: 'long', hint: 'durée, nombre de personnes, médiation', group: 'Technique' },
      { key: 'theme', label: 'Lien avec le thème « Résistance »', kind: 'long', group: 'Sens' },
      { key: 'scenographie', label: 'Scénographie', kind: 'long', hint: 'espace, lumière, son, parcours, signalétique', group: 'Sens' },
      { key: 'ressenti', label: 'Mon ressenti', kind: 'long', group: 'Sens' },
      { key: 'reaction_public', label: 'Réaction du public', kind: 'long', group: 'Sens' },
      { key: 'cout_estime', label: 'Coût estimé', kind: 'text', group: 'Faisabilité au Sénégal' },
      { key: 'materiel_local', label: 'Matériel disponible localement ?', kind: 'long', group: 'Faisabilité au Sénégal' },
      { key: 'artistes_africains', label: 'Artistes africains équivalents ou à inviter', kind: 'long', group: 'Faisabilité au Sénégal' },
    ],
  },
  debat: {
    label: 'Débat / Conférence',
    titleLabel: 'Titre du débat',
    fields: [
      { key: 'moderateur', label: 'Modérateur', kind: 'text', group: 'Qui' },
      { key: 'intervenants', label: 'Intervenants (nom, structure, pays) — un par ligne', kind: 'long', group: 'Qui' },
      { key: 'resume', label: 'Résumé', kind: 'long', group: 'Contenu' },
      { key: 'idees_cles', label: 'Idées clés, thèses', kind: 'long', group: 'Contenu' },
      { key: 'desaccords', label: 'Désaccords', kind: 'long', group: 'Contenu' },
      { key: 'citations', label: 'Citations marquantes (avec l’heure)', kind: 'long', group: 'Contenu' },
      { key: 'references', label: 'Concepts et références (artistes, livres, lois, institutions, financements)', kind: 'long', group: 'Contenu' },
      { key: 'questions_public', label: 'Questions du public', kind: 'long', group: 'Contenu' },
      { key: 'interet_afrique', label: 'Intérêt pour l’Afrique et le Sénégal', kind: 'long', group: 'Pour nous' },
    ],
  },
  lieu: {
    label: 'Lieu / Scénographie',
    titleLabel: 'Nom du lieu',
    fields: [
      { key: 'ville', label: 'Ville', kind: 'text' },
      { key: 'type_lieu', label: 'Type', kind: 'select', options: ['friche', 'citadelle / patrimoine', 'université', 'musée', 'centre d’art', 'théâtre', 'tiers-lieu', 'plein air', 'autre'] },
      { key: 'amenagement', label: 'Aménagement', kind: 'long' },
      { key: 'parcours', label: 'Parcours visiteur', kind: 'long' },
      { key: 'accessibilite', label: 'Accessibilité', kind: 'long' },
      { key: 'jauge', label: 'Jauge', kind: 'text' },
      { key: 'equipements', label: 'Équipements (son, lumière, écrans, réseau)', kind: 'long' },
      { key: 'equivalent_dakar', label: 'Lieu équivalent à Dakar', kind: 'long' },
    ],
  },
  organisation: {
    label: 'Organisation',
    titleLabel: 'Sujet observé',
    fields: [
      { key: 'domaine', label: 'Domaine', kind: 'select', options: ['accueil', 'hébergement', 'transport', 'restauration', 'matchmaking', 'communication', 'traduction', 'partenaires', 'financement', 'départ', 'autre'] },
      { key: 'observation', label: 'Ce que j’ai observé', kind: 'long' },
      { key: 'point_fort', label: 'Point fort', kind: 'long' },
      { key: 'point_faible', label: 'Point faible', kind: 'long' },
      { key: 'idee', label: 'Idée à adapter', kind: 'long' },
      { key: 'cout', label: 'Coût si connu', kind: 'text' },
    ],
  },
};
