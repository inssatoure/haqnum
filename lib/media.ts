'use client';

// Fichiers : stockage local de l'original, URL d'affichage, chemins de stockage.

import { BUCKET, MISSION_ID } from './config';
import { db } from './db';
import { currentUser } from './session';
import { supabase } from './supabase';
import { requestSync } from './sync';
import { r2ReadUrl, isR2Enabled } from './storage-client';

export function extFromMime(mime: string, fallbackName?: string): string {
  const fromName = fallbackName?.split('.').pop()?.toLowerCase();
  if (fromName && fromName.length <= 5 && fromName !== fallbackName?.toLowerCase()) return fromName;
  if (mime.includes('mp4') && mime.startsWith('audio')) return 'm4a';
  if (mime.includes('aac')) return 'aac';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg') && mime.startsWith('audio')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('png')) return 'png';
  if (mime.includes('heic')) return 'heic';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return 'bin';
}

export function storagePath(mediaId: string, file: string): string {
  const me = currentUser();
  return `${MISSION_ID}/${me?.id ?? 'local'}/${mediaId}/${file}`;
}

/** Garde le fichier en local (IndexedDB) et le met dans la file d'envoi. */
export async function storeBlob(mediaId: string, file: string, blob: Blob, mime?: string): Promise<string> {
  const path = storagePath(mediaId, file);
  await db().blobs.put({
    path,
    media_id: mediaId,
    blob,
    mime: mime || blob.type || 'application/octet-stream',
    uploaded: 0,
    created_at: new Date().toISOString(),
  });
  requestSync();
  return path;
}

const urlCache = new Map<string, string>();

/** URL affichable : fichier local s'il existe, sinon lien signé du serveur. */
export async function mediaUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (urlCache.has(path)) return urlCache.get(path)!;
  const local = await db().blobs.get(path);
  if (local?.blob) {
    const u = URL.createObjectURL(local.blob);
    urlCache.set(path, u);
    return u;
  }
  const sb = supabase();
  if (!sb) return null;
  if (await isR2Enabled()) {
    const u = await r2ReadUrl(path);
    if (u) urlCache.set(path, u);
    return u;
  }
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 6);
  if (data?.signedUrl) {
    urlCache.set(path, data.signedUrl);
    return data.signedUrl;
  }
  return null;
}

/** Récupère le fichier original (local ou téléchargé). */
export async function fetchBlob(path: string): Promise<Blob | null> {
  const local = await db().blobs.get(path);
  if (local?.blob) return local.blob;
  const sb = supabase();
  if (!sb) return null;
  if (await isR2Enabled()) {
    const u = await r2ReadUrl(path);
    if (!u) return null;
    const r = await fetch(u);
    return r.ok ? await r.blob() : null;
  }
  const { data } = await sb.storage.from(BUCKET).download(path);
  return data ?? null;
}

/** Miniature JPEG (pour les listes) à partir d'une image. */
export async function imageThumb(file: Blob, max = 480): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file);
    const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * r);
    c.height = Math.round(bmp.height * r);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.75));
  } catch {
    return null;
  }
}

/** Images clés d'une vidéo (pour que l'IA puisse la décrire) + durée. */
export async function videoFrames(file: Blob, count = 4, max = 720): Promise<{ frames: Blob[]; duration: number | null }> {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  const frames: Blob[] = [];
  let duration: number | null = null;
  try {
    await withTimeout(new Promise((res, rej) => {
      v.onloadedmetadata = res;
      v.onerror = rej;
    }), 8000);
    duration = isFinite(v.duration) ? v.duration : null;
    const d = duration ?? 1;
    for (let k = 0; k < count; k++) {
      const t = Math.min(d - 0.1, (d * (k + 0.5)) / count);
      v.currentTime = Math.max(0, t);
      await withTimeout(new Promise((res) => (v.onseeked = res)), 6000);
      const r = Math.min(1, max / Math.max(v.videoWidth || max, v.videoHeight || max));
      const c = document.createElement('canvas');
      c.width = Math.round((v.videoWidth || max) * r);
      c.height = Math.round((v.videoHeight || max) * r);
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
      const b: Blob | null = await new Promise((res) => c.toBlob((x) => res(x), 'image/jpeg', 0.7));
      if (b) frames.push(b);
    }
  } catch {
    /* Safari peut refuser certaines vidéos : on garde quand même l'original */
  } finally {
    URL.revokeObjectURL(url);
  }
  return { frames, duration };
}

export async function audioDuration(file: Blob): Promise<number | null> {
  const url = URL.createObjectURL(file);
  const a = document.createElement('audio');
  a.preload = 'metadata';
  a.src = url;
  try {
    await withTimeout(new Promise((res, rej) => {
      a.onloadedmetadata = res;
      a.onerror = rej;
    }), 6000);
    if (a.duration === Infinity) {
      a.currentTime = 1e7;
      await withTimeout(new Promise((res) => (a.ontimeupdate = res)), 3000);
    }
    return isFinite(a.duration) ? a.duration : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} Ko`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} Mo`;
  return `${(n / 1024 ** 3).toFixed(2)} Go`;
}

export function formatDuration(s: number | null | undefined): string {
  if (!s && s !== 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
