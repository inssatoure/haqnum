import 'server-only';
import { HttpError } from './supabase';

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

const GROQ_LIMIT = 24 * 1024 * 1024;
export const GROQ_DIRECT_EXT = ['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm'];

/** Transcription Groq Whisper (verbose_json = segments horodatés). */
export async function whisper(file: Blob, filename: string, language = 'fr'): Promise<{ text: string; language?: string; segments: WhisperSegment[] }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new HttpError(500, 'Clé GROQ_API_KEY manquante sur le serveur');
  if (file.size > GROQ_LIMIT) throw new HttpError(413, 'Fichier trop gros pour Whisper (découpage nécessaire)');
  const form = new FormData();
  form.append('file', file, filename);
  form.append('model', process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  if (language) form.append('language', language);
  form.append('temperature', '0');
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (res.ok) {
      const j = await res.json();
      return {
        text: j.text ?? '',
        language: j.language,
        segments: (j.segments ?? []).map((s: any) => ({ start: s.start, end: s.end, text: String(s.text ?? '').trim() })),
      };
    }
    lastErr = `${res.status} ${await res.text()}`;
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    break;
  }
  throw new HttpError(502, `Groq : ${lastErr.slice(0, 300)}`);
}
