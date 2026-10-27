// Valeurs publiques du projet Supabase (la clé « anon » n'est pas secrète : la sécurité vient des règles RLS).
// Elles servent de secours si la variable d'environnement est absente ou mal copiée (ex. version masquée « •••• »).
const DEFAULT_SUPABASE_URL = 'https://mbjsfoqpcbvpnrrpjiqy.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ianNmb3FwY2J2cG5ycnBqaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwODk4OTcsImV4cCI6MjEwODY2NTg5N30.eznKLrbWaymt-_FbuSogDd_dE6E3u973iVxwVUX2rmw';
const valid = (v: string | undefined, re: RegExp) => (v && re.test(v.trim()) ? v.trim() : '');
export const SUPABASE_URL = valid(process.env.NEXT_PUBLIC_SUPABASE_URL, /^https:\/\/[a-z0-9.-]+$/) || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY = valid(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/) || DEFAULT_SUPABASE_ANON_KEY;
export const MAIN_MISSION_ID = process.env.NEXT_PUBLIC_MISSION_ID || '00000000-0000-4000-8000-000000002026';
/** Bac à sable : mission de test séparée (base locale, serveur et fichiers distincts). */
export const SANDBOX_MISSION_ID = '00000000-0000-4000-8000-00000000b0b0';
export const IS_SANDBOX = (() => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('min_sandbox') === '1';
  } catch {
    return false;
  }
})();
export const MISSION_ID = IS_SANDBOX ? SANDBOX_MISSION_ID : MAIN_MISSION_ID;

/** Identifiant des données de référence copiées dans le bac à sable (bijection, même calcul qu'en SQL). */
export function sandboxId(id: string): string {
  const head = ((parseInt(id.slice(0, 8), 16) ^ 0xa5a5a5a5) >>> 0).toString(16).padStart(8, '0');
  return head + id.slice(8);
}

/** Passe dans / sort du bac à sable (recharge l'app sur l'autre jeu de données). */
export function setSandbox(on: boolean) {
  try {
    localStorage.setItem('min_sandbox', on ? '1' : '0');
  } catch {
    /* ignore */
  }
  window.location.hash = '#/maintenant';
  window.location.reload();
}
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
