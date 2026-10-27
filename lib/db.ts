import Dexie, { type Table } from 'dexie';
import { IS_SANDBOX } from './config';
import type {
  Activity,
  Analysis,
  Assignment,
  Comment,
  Contact,
  Expense,
  Fiche,
  LocalBlob,
  Media,
  Note,
  Profile,
  Report,
  SyncTable,
  Transcript,
} from './types';

export interface Meta {
  key: string;
  value: any;
}

export class ObsDB extends Dexie {
  activities!: Table<Activity, string>;
  assignments!: Table<Assignment, string>;
  media!: Table<Media, string>;
  notes!: Table<Note, string>;
  fiches!: Table<Fiche, string>;
  contacts!: Table<Contact, string>;
  expenses!: Table<Expense, string>;
  comments!: Table<Comment, string>;
  transcripts!: Table<Transcript, string>;
  analyses!: Table<Analysis, string>;
  reports!: Table<Report, string>;
  profiles!: Table<Profile, string>;
  blobs!: Table<LocalBlob, string>;
  meta!: Table<Meta, string>;

  constructor() {
    super(IS_SANDBOX ? 'min-observateur-bac-a-sable' : 'min-observateur');
    const base = 'id, mission_id, author_id, updated_at, _dirty';
    this.version(1).stores({
      activities: `${base}, starts_at`,
      assignments: `${base}, activity_id`,
      media: `${base}, activity_id, fiche_id, contact_id, parent_id, captured_at, kind`,
      notes: `${base}, activity_id, fiche_id, media_id`,
      fiches: `${base}, type, activity_id`,
      contacts: `${base}, name, activity_id`,
      expenses: `${base}, spent_at`,
      comments: `${base}, target_id`,
      transcripts: `${base}, media_id`,
      analyses: `${base}, kind, activity_id, day`,
      reports: `${base}, kind`,
      profiles: 'id',
      blobs: 'path, media_id, uploaded',
      meta: 'key',
    });
  }

  table_(name: SyncTable): Table<any, string> {
    return (this as any)[name];
  }
}

let _db: ObsDB | null = null;
export function db(): ObsDB {
  if (!_db) _db = new ObsDB();
  return _db;
}

export async function getMeta<T = any>(key: string): Promise<T | undefined> {
  return (await db().meta.get(key))?.value;
}
export async function setMeta(key: string, value: any) {
  await db().meta.put({ key, value });
}
