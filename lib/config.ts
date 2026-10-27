// Valeurs publiques du projet Supabase (la clé « anon » n'est pas secrète : la sécurité vient des règles RLS).
// Elles servent de secours si la variable d'environnement est absente ou mal copiée (ex. version masquée « •••• »).
const DEFAULT_SUPABASE_URL = 'https://mbjsfoqpcbvpnrrpjiqy.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ianNmb3FwY2J2cG5ycnBqaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwODk4OTcsImV4cCI6MjEwODY2NTg5N30.eznKLrbWaymt-_FbuSogDd_dE6E3u973iVxwVUX2rmw';
const valid = (v: string | undefined, re: RegExp) => (v && re.test(v.trim()) ? v.trim() : '');
export const SUPABASE_URL = valid(process.env.NEXT_PUBLIC_SUPABASE_URL, /^https:\/\/[a-z0-9.-]+$/) || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY = valid(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/) || DEFAULT_SUPABASE_ANON_KEY;
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

// NEXT_PUBLIC_LOCAL_MODE=1 : mode local sans serveur (tests automatiques).
export const isConfigured = () => process.env.NEXT_PUBLIC_LOCAL_MODE !== '1' && Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

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
