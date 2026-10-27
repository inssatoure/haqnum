export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
export const MISSION_ID = process.env.NEXT_PUBLIC_MISSION_ID || '00000000-0000-4000-8000-000000002026';
export const TZ = 'Europe/Paris';
export const BUCKET = 'media';

/** Durée d'un morceau d'enregistrement en mode Débat (ms). */
export const CHUNK_MS = (() => {
  // Réglable pour les tests automatiques (localStorage « min_chunk_ms »).
  try {
    const v = typeof localStorage !== 'undefined' ? Number(localStorage.getItem('min_chunk_ms')) : 0;
    if (v >= 500) return v;
  } catch {
    /* ignore */
  }
  return 45_000;
})();

export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const PROJECTS = ['Biennale Sénégal', 'Teranga Valley', 'Metafrik', 'Musée Théodore Monod'];

export const CONTACT_STATUS: Record<string, string> = {
  a_relancer: 'À relancer',
  relance: 'Relancé',
  en_discussion: 'En discussion',
  partenaire: 'Partenaire',
  aucun: 'Pas de suivi',
};

export const ACTIVITY_KINDS: Record<string, string> = {
  accueil: 'Accueil',
  repas: 'Repas',
  transport: 'Transport',
  visite: 'Visite',
  talk: 'Talk',
  forum: 'Forum',
  matchmaking: 'Matchmaking',
  cocktail: 'Cocktail',
  expo: 'Exposition',
  performance: 'Performance',
  demo: 'Démo',
  rdv: 'Rendez-vous',
  libre: 'Temps libre',
};

export const EXPENSE_CATEGORIES = ['Repas', 'Transport', 'Hébergement', 'Matériel', 'Communication', 'Autre'];
