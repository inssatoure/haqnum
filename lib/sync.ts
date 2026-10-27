'use client';

// Synchronisation hors ligne -> Supabase.
// 1) envoie les éléments modifiés localement, 2) envoie les fichiers (reprenable),
// 3) récupère le travail de l'autre observateur.

import * as tus from 'tus-js-client';
import { BUCKET, MISSION_ID, SUPABASE_URL } from './config';
import { db, getMeta, setMeta } from './db';
import { currentUser } from './session';
import { accessToken, supabase } from './supabase';
import { SYNC_TABLES, type LocalBlob, type SyncTable } from './types';

export interface SyncStatus {
  running: boolean;
  online: boolean;
  pendingRows: number;
  pendingFiles: number;
  pendingBytes: number;
  lastSync: string | null;
  error: string | null;
  uploading: string | null;
  uploadPct: number;
}

let status: SyncStatus = {
  running: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pendingRows: 0,
  pendingFiles: 0,
  pendingBytes: 0,
  lastSync: null,
  error: null,
  uploading: null,
  uploadPct: 0,
};
const listeners = new Set<(s: SyncStatus) => void>();
export const getSyncStatus = () => status;
export function onSyncStatus(fn: (s: SyncStatus) => void) {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}
function setStatus(p: Partial<SyncStatus>) {
  status = { ...status, ...p };
  listeners.forEach((fn) => fn(status));
}

let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;
let again = false;

export function requestSync(delay = 1500) {
  void refreshPending();
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

export async function refreshPending() {
  const d = db();
  let rows = 0;
  for (const t of SYNC_TABLES) rows += await d.table_(t).where('_dirty').equals(1).count();
  const files = await d.blobs.where('uploaded').equals(0).toArray();
  setStatus({
    pendingRows: rows,
    pendingFiles: files.length,
    pendingBytes: files.reduce((a, b) => a + (b.blob?.size ?? 0), 0),
  });
}

export async function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

const LOCAL_FIELDS = ['_dirty'];
function clean(row: any) {
  const out: any = {};
  for (const k of Object.keys(row)) if (!LOCAL_FIELDS.includes(k) && k !== 'server_updated_at') out[k] = row[k];
  return out;
}

async function syncOnce() {
  const sb = supabase();
  const me = currentUser();
  if (!sb || !me || me.local) {
    await refreshPending();
    return;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setStatus({ online: false });
    await refreshPending();
    return;
  }
  setStatus({ running: true, online: true, error: null });
  const d = db();
  try {
    // 1) Éléments
    for (const t of SYNC_TABLES) await pushTable(t);
    // 2) Fichiers
    await uploadPending();
    // 3) Éléments des autres
    for (const t of SYNC_TABLES) await pullTable(t);
    // Les fichiers envoyés pendant cette passe ont pu marquer des médias à renvoyer
    for (const t of ['media'] as SyncTable[]) await pushTable(t);
    setStatus({ lastSync: new Date().toISOString() });
    await setMeta('last_sync', new Date().toISOString());
  } catch (e: any) {
    setStatus({ error: e?.message ?? String(e) });
  } finally {
    setStatus({ running: false, uploading: null, uploadPct: 0 });
    await refreshPending();
  }

  async function pushTable(t: SyncTable) {
    const table = d.table_(t);
    const dirty = await table.where('_dirty').equals(1).toArray();
    for (let i = 0; i < dirty.length; i += 100) {
      const batch = dirty.slice(i, i + 100);
      const { error } = await sb!.from(t).upsert(batch.map(clean), { onConflict: 'id' });
      if (error) {
        // On tente un par un pour ne pas bloquer toute la file sur un seul élément.
        for (const row of batch) {
          const r = await sb!.from(t).upsert(clean(row), { onConflict: 'id' });
          if (r.error) {
            console.warn('sync push', t, row.id, r.error.message);
            continue;
          }
          await markClean(t, row);
        }
        continue;
      }
      for (const row of batch) await markClean(t, row);
    }
  }

  async function markClean(t: SyncTable, row: any) {
    const table = d.table_(t);
    await d.transaction('rw', table, async () => {
      const cur = await table.get(row.id);
      if (cur && cur.updated_at === row.updated_at) await table.update(row.id, { _dirty: 0 });
    });
  }

  async function pullTable(t: SyncTable) {
    const table = d.table_(t);
    let cursor = (await getMeta<string>(`cursor_${t}`)) ?? '1970-01-01T00:00:00Z';
    for (;;) {
      const { data, error } = await sb!
        .from(t)
        .select('*')
        .eq('mission_id', MISSION_ID)
        .gt('server_updated_at', cursor)
        .order('server_updated_at', { ascending: true })
        .limit(500);
      if (error) throw new Error(`${t}: ${error.message}`);
      if (!data?.length) break;
      await d.transaction('rw', table, async () => {
        for (const remote of data) {
          const local = await table.get(remote.id);
          if (local?._dirty && local.updated_at > remote.updated_at) continue;
          await table.put({ ...remote, _dirty: 0 });
        }
      });
      cursor = data[data.length - 1].server_updated_at;
      await setMeta(`cursor_${t}`, cursor);
      if (data.length < 500) break;
    }
  }
}

async function uploadPending() {
  const d = db();
  const pending = await d.blobs.where('uploaded').equals(0).toArray();
  // Petits fichiers d'abord (miniatures, notes vocales, morceaux audio), vidéos ensuite.
  pending.sort((a, b) => a.blob.size - b.blob.size);
  const touched = new Set<string>();
  for (const b of pending) {
    if (!navigator.onLine) break;
    try {
      setStatus({ uploading: b.path, uploadPct: 0 });
      await uploadBlob(b, (pct) => setStatus({ uploadPct: pct }));
      await d.blobs.update(b.path, { uploaded: 1, last_error: null });
      touched.add(b.media_id);
    } catch (e: any) {
      await d.blobs.update(b.path, { attempts: (b.attempts ?? 0) + 1, last_error: e?.message ?? String(e) });
      console.warn('upload', b.path, e);
    }
  }
  // Un média passe à « envoyé » quand tous ses fichiers sont en ligne.
  for (const mediaId of touched) {
    const m = await d.media.get(mediaId);
    if (!m || m.status === 'enregistrement') continue;
    const left = await d.blobs.where('media_id').equals(mediaId).filter((x) => x.uploaded === 0).count();
    if (left === 0 && m.status !== 'envoye') {
      await d.media.update(mediaId, { status: 'envoye', updated_at: new Date().toISOString(), _dirty: 1 });
    }
  }
}

async function uploadBlob(b: LocalBlob, onPct: (n: number) => void) {
  const token = await accessToken();
  if (!token) throw new Error('Session expirée');
  // Petits fichiers : envoi direct, plus rapide.
  if (b.blob.size < 5 * 1024 * 1024) {
    const sb = supabase()!;
    const { error } = await sb.storage.from(BUCKET).upload(b.path, b.blob, { contentType: b.mime, upsert: true });
    if (error) throw new Error(error.message);
    onPct(100);
    return;
  }
  // Gros fichiers : envoi par morceaux de 6 Mo, avec reprise après coupure.
  await new Promise<void>((resolve, reject) => {
    const up = new tus.Upload(b.blob, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 2000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${token}`, 'x-upsert': 'true' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: BUCKET, objectName: b.path, contentType: b.mime, cacheControl: '3600' },
      chunkSize: 6 * 1024 * 1024,
      onError: (err) => reject(err),
      onProgress: (sent, total) => onPct(Math.round((sent / total) * 100)),
      onSuccess: () => resolve(),
    });
    up.findPreviousUploads().then((prev) => {
      if (prev.length) up.resumeFromPreviousUpload(prev[0]);
      up.start();
    });
  });
}

/** Lance la synchronisation automatique (au démarrage, en ligne, toutes les 30 s). */
export function startAutoSync() {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => {
    setStatus({ online: true });
    requestSync(200);
  });
  window.addEventListener('offline', () => setStatus({ online: false }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestSync(500);
  });
  setInterval(() => void syncNow(), 30_000);
  requestSync(300);
}
