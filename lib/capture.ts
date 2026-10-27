'use client';

// Création des médias : capture directe (appareil photo, micro) et import groupé (galerie, Dictaphone).

import { db } from './db';
import { audioDuration, extFromMime, imageThumb, storeBlob, videoFrames } from './media';
import { currentPosition, readFileMeta } from './metadata';
import { create, update, uuid } from './repo';
import { activityAt, distanceKm } from './time';
import type { Activity, Media, MediaKind } from './types';

export function kindOfFile(f: File): MediaKind {
  const t = f.type;
  const n = f.name.toLowerCase();
  if (t.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/.test(n)) return 'photo';
  if (t.startsWith('video/') || /\.(mov|mp4|m4v)$/.test(n)) return 'video';
  return 'audio';
}

export interface ImportPlan {
  file: File;
  kind: MediaKind;
  capturedAt: string;
  timeSource: string;
  lat: number | null;
  lng: number | null;
  durationS: number | null;
  exif: Record<string, unknown> | null;
  activityId: string | null;
}

/** Étape 1 : lire les fichiers et proposer une activité pour chacun (l'utilisateur peut corriger). */
export async function planImport(files: File[]): Promise<ImportPlan[]> {
  const acts = (await db().activities.toArray()).filter((a) => !a.deleted_at);
  const plans: ImportPlan[] = [];
  for (const file of files) {
    const meta = await readFileMeta(file);
    const kind = kindOfFile(file);
    let at = meta.capturedAt!;
    // Dictaphone : l'heure du fichier est souvent la FIN de l'enregistrement ; mvhd donne le début.
    plans.push({
      file,
      kind,
      capturedAt: at,
      timeSource: meta.timeSource,
      lat: meta.lat,
      lng: meta.lng,
      durationS: meta.durationS,
      exif: meta.exif,
      activityId: guessActivity(acts, at, meta.lat, meta.lng, meta.durationS)?.id ?? null,
    });
  }
  return plans.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

/** Heure + lieu : on prend l'activité en cours ; si plusieurs, la plus proche géographiquement. */
export function guessActivity(acts: Activity[], at: string, lat: number | null, lng: number | null, durationS?: number | null): Activity | null {
  // Pour un long audio, le milieu de l'enregistrement est plus représentatif que le début.
  const mid = durationS ? new Date(new Date(at).getTime() + (durationS * 1000) / 2) : new Date(at);
  const t = mid.getTime();
  const candidates = acts.filter((a) => new Date(a.starts_at).getTime() <= t && new Date(a.ends_at).getTime() > t);
  if (lat != null && lng != null && candidates.length > 1) {
    const withPos = candidates.filter((a) => a.lat != null && a.lng != null);
    withPos.sort((a, b) => distanceKm({ lat, lng }, { lat: a.lat!, lng: a.lng! }) - distanceKm({ lat, lng }, { lat: b.lat!, lng: b.lng! }));
    if (withPos.length) {
      const nearest = withPos[0];
      const nonTransport = candidates.filter((c) => c.kind !== 'transport' && c.venue === nearest.venue);
      if (nonTransport.length) return activityAt(nonTransport, mid);
    }
  }
  return activityAt(acts, mid);
}

/** Étape 2 : enregistrer les fichiers importés (original gardé tel quel). */
export async function commitImport(plans: ImportPlan[], onProgress?: (i: number) => void): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i];
    const id = await saveMediaFile(p.file, {
      kind: p.kind,
      source: 'import',
      activityId: p.activityId,
      capturedAt: p.capturedAt,
      timeSource: p.timeSource,
      lat: p.lat,
      lng: p.lng,
      durationS: p.durationS,
      exif: p.exif,
    });
    ids.push(id);
    onProgress?.(i + 1);
  }
  return ids;
}

export interface SaveOpts {
  kind: MediaKind;
  source: Media['source'];
  activityId?: string | null;
  ficheId?: string | null;
  contactId?: string | null;
  parentId?: string | null;
  capturedAt?: string;
  timeSource?: string;
  lat?: number | null;
  lng?: number | null;
  durationS?: number | null;
  exif?: Record<string, unknown> | null;
  title?: string | null;
}

/** Enregistre un fichier (photo, vidéo, audio) avec miniature et images clés. */
export async function saveMediaFile(file: Blob & { name?: string }, o: SaveOpts): Promise<string> {
  const id = uuid();
  const mime = file.type || (o.kind === 'photo' ? 'image/jpeg' : o.kind === 'video' ? 'video/quicktime' : 'audio/mp4');
  const ext = extFromMime(mime, file.name);
  const path = await storeBlob(id, `original.${ext}`, file, mime);
  let thumb: string | null = null;
  const frames: string[] = [];
  let duration = o.durationS ?? null;

  if (o.kind === 'photo' || o.kind === 'receipt' || o.kind === 'card') {
    const t = await imageThumb(file);
    if (t) thumb = await storeBlob(id, 'thumb.jpg', t, 'image/jpeg');
  } else if (o.kind === 'video') {
    const v = await videoFrames(file, 4);
    duration = duration ?? v.duration;
    for (let k = 0; k < v.frames.length; k++) frames.push(await storeBlob(id, `frame-${k + 1}.jpg`, v.frames[k], 'image/jpeg'));
    if (v.frames[0]) thumb = frames[0];
  } else if (!duration) {
    duration = await audioDuration(file);
  }

  await create('media', {
    id,
    kind: o.kind,
    source: o.source,
    activity_id: o.activityId ?? null,
    fiche_id: o.ficheId ?? null,
    contact_id: o.contactId ?? null,
    parent_id: o.parentId ?? null,
    title: o.title ?? null,
    original_name: file.name ?? null,
    mime,
    size_bytes: file.size,
    duration_s: duration,
    captured_at: o.capturedAt ?? new Date().toISOString(),
    time_source: o.timeSource ?? 'appareil',
    lat: o.lat ?? null,
    lng: o.lng ?? null,
    exif: o.exif ?? null,
    parts: [{ i: 1, path, mime, size: file.size, duration_s: duration ?? undefined }],
    thumb_path: thumb,
    frames,
    status: 'local',
  });
  return id;
}

/** Capture directe (appareil photo / vidéo de l'iPhone via le sélecteur) : position GPS du téléphone. */
export async function captureFromCamera(file: File, ctx: { activityId: string | null; ficheId?: string | null; contactId?: string | null; kind?: MediaKind }) {
  const [pos, meta] = await Promise.all([currentPosition(4000), readFileMeta(file)]);
  const recent = meta.capturedAt && Math.abs(Date.now() - new Date(meta.capturedAt).getTime()) < 10 * 60_000;
  return saveMediaFile(file, {
    kind: ctx.kind ?? kindOfFile(file),
    source: 'camera',
    activityId: ctx.activityId,
    ficheId: ctx.ficheId,
    contactId: ctx.contactId,
    capturedAt: recent ? meta.capturedAt! : new Date().toISOString(),
    timeSource: recent ? meta.timeSource : 'appareil',
    lat: meta.lat ?? pos?.lat ?? null,
    lng: meta.lng ?? pos?.lng ?? null,
    durationS: meta.durationS,
    exif: meta.exif,
  });
}

/** Note vocale courte liée à un média, une fiche ou une activité. */
export async function saveVoiceNote(blob: Blob, seconds: number, ctx: { activityId: string | null; parentId?: string | null; ficheId?: string | null; contactId?: string | null }) {
  const pos = await currentPosition(2000);
  return saveMediaFile(Object.assign(blob, { name: undefined }), {
    kind: 'voice',
    source: 'voice_note',
    activityId: ctx.activityId,
    parentId: ctx.parentId,
    ficheId: ctx.ficheId,
    contactId: ctx.contactId,
    capturedAt: new Date(Date.now() - seconds * 1000).toISOString(),
    durationS: Math.round(seconds),
    lat: pos?.lat ?? null,
    lng: pos?.lng ?? null,
  });
}

export async function moveToActivity(mediaId: string, activityId: string | null) {
  await update('media', mediaId, { activity_id: activityId });
}
