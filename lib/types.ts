// Types partagés entre l'app, la base locale (Dexie) et Supabase.

export type SyncTable =
  | 'activities'
  | 'assignments'
  | 'media'
  | 'notes'
  | 'fiches'
  | 'contacts'
  | 'expenses'
  | 'comments'
  | 'transcripts'
  | 'analyses'
  | 'reports';

export const SYNC_TABLES: SyncTable[] = [
  'activities',
  'assignments',
  'media',
  'notes',
  'fiches',
  'contacts',
  'expenses',
  'comments',
  'transcripts',
  'analyses',
  'reports',
];

export interface Base {
  id: string;
  mission_id: string;
  author_id: string | null;
  device?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  server_updated_at?: string | null;
  /** 1 = modifié localement, pas encore envoyé */
  _dirty?: 0 | 1;
}

export interface Activity extends Base {
  title: string;
  kind?: string | null;
  starts_at: string;
  ends_at: string;
  city?: string | null;
  venue?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  transport?: string | null;
  description?: string | null;
  source?: string | null;
}

export interface Assignment extends Base {
  activity_id: string;
}

export type MediaKind = 'photo' | 'video' | 'audio' | 'voice' | 'receipt' | 'card';

export interface MediaPart {
  i: number;
  path: string;
  mime: string;
  size: number;
  started_at?: string;
  duration_s?: number;
  interrupted?: boolean;
}

export interface Media extends Base {
  kind: MediaKind;
  source?: 'camera' | 'import' | 'debate' | 'voice_note' | null;
  activity_id?: string | null;
  fiche_id?: string | null;
  contact_id?: string | null;
  parent_id?: string | null;
  title?: string | null;
  caption?: string | null;
  original_name?: string | null;
  mime?: string | null;
  size_bytes?: number | null;
  duration_s?: number | null;
  captured_at: string;
  time_source?: string | null;
  lat?: number | null;
  lng?: number | null;
  exif?: Record<string, unknown> | null;
  parts: MediaPart[];
  thumb_path?: string | null;
  frames: string[];
  status?: 'local' | 'enregistrement' | 'interrompu' | 'envoi' | 'envoye' | null;
  description?: string | null;
}

export interface Note extends Base {
  activity_id?: string | null;
  fiche_id?: string | null;
  media_id?: string | null;
  body: string;
  lat?: number | null;
  lng?: number | null;
}

export type FicheType = 'oeuvre' | 'debat' | 'lieu' | 'organisation';

export interface Fiche extends Base {
  type: FicheType;
  title: string;
  activity_id?: string | null;
  data: Record<string, any>;
  lat?: number | null;
  lng?: number | null;
}

export interface Contact extends Base {
  name: string;
  organization?: string | null;
  role?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  linkedin?: string | null;
  swapcard?: string | null;
  status?: string | null;
  projects: string[];
  activity_id?: string | null;
  notes?: string | null;
  category?: string | null;
  vcard?: string | null;
}

export interface Expense extends Base {
  amount: number | null;
  currency: string;
  category?: string | null;
  label?: string | null;
  spent_at: string;
  receipt_media_id?: string | null;
}

export interface Comment extends Base {
  target_table: string;
  target_id: string;
  body: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string | null;
  part?: number;
}

export interface Transcript extends Base {
  media_id: string;
  status: 'en_cours' | 'termine' | 'erreur';
  language?: string | null;
  text?: string | null;
  segments: TranscriptSegment[];
  speakers: Record<string, string>;
  provider?: string | null;
  error?: string | null;
}

export interface Analysis extends Base {
  kind: 'synthese' | 'regards' | 'doublons' | 'jour' | 'chat';
  activity_id?: string | null;
  day?: string | null;
  title?: string | null;
  content: Record<string, any>;
  markdown?: string | null;
  model?: string | null;
}

export interface Report extends Base {
  kind: string;
  title?: string | null;
  markdown?: string | null;
  params: Record<string, any>;
}

export interface Profile {
  id: string;
  email?: string | null;
  full_name?: string | null;
  short_name?: string | null;
  organization?: string | null;
  role_title?: string | null;
  country?: string | null;
  phone?: string | null;
  website?: string | null;
  color?: string | null;
}

/** Fichier binaire en attente d'envoi (gardé localement jusqu'à confirmation). */
export interface LocalBlob {
  path: string;
  media_id: string;
  blob: Blob;
  mime: string;
  uploaded: 0 | 1;
  created_at: string;
  attempts?: number;
  last_error?: string | null;
}
