'use client';

// Envoi / lecture des fichiers sur Cloudflare R2 via des liens signés fournis par /api/storage.
// Gros fichiers : envoi en morceaux de 10 Mo, reprenable (l'état est gardé dans IndexedDB).

import { db, getMeta, setMeta } from './db';
import { accessToken } from './supabase';
import type { LocalBlob } from './types';

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const token = await accessToken();
  if (!token) throw new Error('Session expirée');
  const r = await fetch('/api/storage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Stockage : erreur ${r.status}`);
  return j as T;
}

let r2Cache: boolean | null = null;
/** R2 est-il actif sur le serveur ? (mémorisé pour le hors ligne) */
export async function isR2Enabled(): Promise<boolean> {
  if (r2Cache !== null) return r2Cache;
  try {
    const { r2 } = await call<{ r2: boolean }>({ op: 'info' });
    r2Cache = r2;
    await setMeta('r2', r2);
  } catch {
    r2Cache = (await getMeta<boolean>('r2')) ?? false;
  }
  return r2Cache;
}

const PART = 10 * 1024 * 1024;

function putWithProgress(url: string, body: Blob, contentType: string | null, onPct?: (n: number) => void): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    if (contentType) x.setRequestHeader('Content-Type', contentType);
    x.upload.onprogress = (e) => e.lengthComputable && onPct?.(Math.round((e.loaded / e.total) * 100));
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve(x.getResponseHeader('ETag')) : reject(new Error(`R2 ${x.status}`)));
    x.onerror = () => reject(new Error('Réseau coupé pendant l’envoi'));
    x.ontimeout = () => reject(new Error('Envoi trop long'));
    x.send(body);
  });
}

export async function uploadToR2(b: LocalBlob & { blob: Blob; mp?: { uploadId: string; parts: { n: number; etag: string }[] } }, onPct: (n: number) => void) {
  if (b.blob.size <= PART) {
    const { url } = await call<{ url: string }>({ op: 'put', path: b.path });
    await putWithProgress(url, b.blob, b.mime, onPct);
    return;
  }
  // Envoi en plusieurs morceaux, reprenable.
  let mp = b.mp;
  if (!mp) {
    const { uploadId } = await call<{ uploadId: string }>({ op: 'mp-create', path: b.path, contentType: b.mime });
    mp = { uploadId, parts: [] };
    await db().blobs.update(b.path, { mp } as any);
  }
  const total = Math.ceil(b.blob.size / PART);
  const done = new Map(mp.parts.map((p) => [p.n, p.etag]));
  const missing = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !done.has(n));
  for (let k = 0; k < missing.length; k += 20) {
    const batch = missing.slice(k, k + 20);
    const { urls } = await call<{ urls: Record<number, string> }>({ op: 'mp-urls', path: b.path, uploadId: mp.uploadId, parts: batch });
    for (const n of batch) {
      const chunk = b.blob.slice((n - 1) * PART, Math.min(n * PART, b.blob.size));
      const etag = await putWithProgress(urls[n], chunk, null, (p) => onPct(Math.round(((done.size + p / 100) / total) * 100)));
      if (!etag) throw new Error('R2 : ETag manquant (vérifiez la règle CORS « ExposeHeaders: ETag »)');
      done.set(n, etag);
      mp = { uploadId: mp.uploadId, parts: [...done.entries()].map(([nn, e]) => ({ n: nn, etag: e })) };
      await db().blobs.update(b.path, { mp } as any);
    }
  }
  await call({ op: 'mp-complete', path: b.path, uploadId: mp.uploadId, parts: mp.parts });
}

const readCache = new Map<string, { url: string; at: number }>();
export async function r2ReadUrl(path: string): Promise<string | null> {
  const hit = readCache.get(path);
  if (hit && Date.now() - hit.at < 5 * 3600 * 1000) return hit.url;
  try {
    const { urls } = await call<{ urls: Record<string, string> }>({ op: 'read', paths: [path] });
    const url = urls[path];
    if (url) readCache.set(path, { url, at: Date.now() });
    return url ?? null;
  } catch {
    return null;
  }
}
