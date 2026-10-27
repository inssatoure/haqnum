'use client';

// Appels aux routes IA depuis l'app. Les résultats sont enregistrés comme éléments de la mission
// (auteur = celui qui a lancé l'analyse), donc visibles et synchronisés pour les deux.

import { MISSION_ID } from './config';
import { db } from './db';
import { create, update } from './repo';
import { currentUser } from './session';
import { accessToken } from './supabase';
import { syncNow } from './sync';
import type { Analysis, Media, TranscriptSegment } from './types';

export type Engine = 'gemini' | 'claude';

/** Moteur IA choisi dans Réglages (Gemini par défaut : économique). */
export function getEngine(): Engine {
  try {
    return localStorage.getItem('min_engine') === 'claude' ? 'claude' : 'gemini';
  } catch {
    return 'gemini';
  }
}
export function setEngine(e: Engine) {
  try {
    localStorage.setItem('min_engine', e);
  } catch {
    /* ignore */
  }
}

export async function api<T = any>(path: string, body?: Record<string, unknown>, method = 'POST'): Promise<T> {
  const token = await accessToken();
  if (!token) throw new Error('Connectez-vous au serveur pour utiliser l’IA (mode local : IA indisponible).');
  if (!navigator.onLine) throw new Error('Pas de connexion internet. Réessayez plus tard : vos fichiers sont gardés.');
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(path.startsWith('/api/ai') ? { engine: getEngine(), ...body } : body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
  return j as T;
}

/** S'assure que les fichiers d'un média sont bien en ligne avant de lancer un traitement serveur. */
async function ensureUploaded(m: Media) {
  const pending = await db().blobs.where('media_id').equals(m.id).filter((b) => b.uploaded === 0).count();
  if (pending) {
    await syncNow();
    const still = await db().blobs.where('media_id').equals(m.id).filter((b) => b.uploaded === 0).count();
    if (still) throw new Error("Les fichiers ne sont pas encore envoyés. Attendez la fin de l'envoi (voir en haut).");
  }
}

const WINDOW_S = 600;

/** Transcription complète : morceau par morceau (et fenêtres de 10 min pour les gros fichiers). */
export async function transcribeMedia(mediaId: string, onStatus?: (s: string) => void) {
  const m = await db().media.get(mediaId);
  if (!m) throw new Error('Média introuvable');
  await ensureUploaded(m);
  const segments: TranscriptSegment[] = [];
  let offset = 0;
  let language: string | undefined;
  const jobs: { path: string; size: number; start?: number; duration?: number; partIndex: number; offset: number }[] = [];
  m.parts.forEach((p, k) => {
    const dur = p.duration_s ?? (m.parts.length === 1 ? m.duration_s ?? 0 : 0);
    const big = p.size > 23 * 1024 * 1024 || m.kind === 'video' || /\.(mov|heic|bin)$/i.test(p.path);
    if (big && dur > 0) {
      for (let s = 0; s < dur; s += WINDOW_S) jobs.push({ path: p.path, size: p.size, start: s, duration: Math.min(WINDOW_S, dur - s), partIndex: k, offset: offset + s });
    } else if (big) {
      jobs.push({ path: p.path, size: p.size, start: 0, duration: 3 * 3600, partIndex: k, offset });
    } else {
      jobs.push({ path: p.path, size: p.size, partIndex: k, offset });
    }
    offset += dur;
  });

  const tr = await create('transcripts', { media_id: m.id, status: 'en_cours', segments: [], speakers: {}, provider: 'groq-whisper' });
  try {
    for (let i = 0; i < jobs.length; i++) {
      onStatus?.(`Transcription ${i + 1}/${jobs.length}…`);
      const j = jobs[i];
      const r = await api<{ text: string; language?: string; segments: { start: number; end: number; text: string }[] }>('/api/transcribe', {
        path: j.path,
        size: j.size,
        start: j.start,
        duration: j.duration,
      });
      language = language ?? r.language;
      for (const s of r.segments) segments.push({ start: s.start + j.offset, end: s.end + j.offset, text: s.text, part: j.partIndex + 1 });
      await update('transcripts', tr.id, { segments, text: segments.map((s) => s.text).join(' ') });
    }
    await update('transcripts', tr.id, { status: 'termine', language: language ?? 'fr', segments, text: segments.map((s) => s.text).join(' ') });
  } catch (e: any) {
    await update('transcripts', tr.id, { status: 'erreur', error: e.message });
    throw e;
  }
  return tr.id;
}

/** Séparation des voix (pyannote) puis attribution à chaque phrase. */
export async function diarizeTranscript(transcriptId: string, onStatus?: (s: string) => void) {
  const t = await db().transcripts.get(transcriptId);
  if (!t) throw new Error('Transcription introuvable');
  const me = currentUser();
  if (t.author_id !== me?.id) throw new Error('Seul l’auteur de la transcription peut la modifier.');
  onStatus?.('Envoi pour séparer les voix…');
  const { job } = await api<{ job: string }>('/api/diarize', { media_id: t.media_id, mission_id: MISSION_ID });
  for (let k = 0; k < 120; k++) {
    await new Promise((r) => setTimeout(r, 5000));
    onStatus?.(`Séparation des voix… (${(k + 1) * 5} s)`);
    const r = await api<{ status: string; turns: { speaker: string; start: number; end: number }[] | null; error?: string }>(`/api/diarize?job=${encodeURIComponent(job)}`, undefined, 'GET');
    if (r.status === 'succeeded' && r.turns) {
      const segs = t.segments.map((s) => {
        let best: string | null = null;
        let bestOv = 0;
        for (const tu of r.turns!) {
          const ov = Math.min(s.end, tu.end) - Math.max(s.start, tu.start);
          if (ov > bestOv) {
            bestOv = ov;
            best = tu.speaker;
          }
        }
        return { ...s, speaker: best };
      });
      const speakers: Record<string, string> = { ...t.speakers };
      [...new Set(segs.map((s) => s.speaker).filter(Boolean) as string[])].forEach((sp, i) => (speakers[sp] ??= `Voix ${i + 1}`));
      await update('transcripts', t.id, { segments: segs, speakers, provider: 'groq-whisper + pyannote' });
      return;
    }
    if (r.status === 'failed' || r.status === 'canceled') throw new Error(`Séparation des voix échouée ${r.error ?? ''}`);
  }
  throw new Error('Séparation des voix : délai dépassé');
}

export type AiTask = 'synthese' | 'regards' | 'jour' | 'observateur' | 'doublons';

export async function runAnalysis(task: AiTask, opts: { activityId?: string; day?: string; authorId?: string; title: string }): Promise<Analysis> {
  await syncNow();
  const r = await api<{ markdown: string; json: any; model: string; stats: any }>('/api/ai', {
    task,
    mission_id: MISSION_ID,
    activity_id: opts.activityId,
    day: opts.day,
    author_id: opts.authorId,
  });
  const kind: Analysis['kind'] = task === 'observateur' ? 'jour' : task;
  return (await create('analyses', {
    kind,
    activity_id: opts.activityId ?? null,
    day: opts.day ?? null,
    title: opts.title,
    markdown: r.markdown,
    content: { task, json: r.json, stats: r.stats, author_scope: opts.authorId ?? null },
    model: r.model,
  })) as unknown as Analysis;
}

export async function askAnalyst(question: string, history: { role: 'user' | 'assistant'; content: string }[]) {
  const r = await api<{ markdown: string; model: string }>('/api/ai', { task: 'chat', mission_id: MISSION_ID, question, history });
  return r.markdown;
}

export async function generateSection(report: 'dossier' | 'mission', section: string, authorId?: string) {
  const r = await api<{ markdown: string; model: string }>('/api/ai', { task: 'section', mission_id: MISSION_ID, report, section, author_id: authorId });
  return r.markdown;
}

export async function readBusinessCard(file: Blob): Promise<Record<string, string>> {
  const b64 = await blobToBase64(file);
  return api('/api/ai/card', { image: b64, media_type: file.type || 'image/jpeg' });
}

export function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = rej;
    r.readAsDataURL(b);
  });
}
