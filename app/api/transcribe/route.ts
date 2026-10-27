// Transcription d'un morceau (ou d'une fenêtre d'un gros fichier) avec Groq Whisper.
// Le client orchestre : un appel par morceau / fenêtre de 10 min, puis recolle les textes.

import { audioWindow } from '@/lib/server/ffmpeg';
import { GROQ_DIRECT_EXT, whisper } from '@/lib/server/groq';
import { assertMember, readUrl } from '@/lib/server/storage';
import { errorResponse, HttpError, requireUser, supabaseForRequest } from '@/lib/server/supabase';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { sb } = supabaseForRequest(req);
    await requireUser(sb);
    const body = (await req.json()) as { path: string; size?: number; start?: number; duration?: number; language?: string };
    if (!body.path) throw new HttpError(400, 'path manquant');
    await assertMember(sb, body.path);
    const url = await readUrl(sb, body.path, 3600);
    const ext = (body.path.split('.').pop() ?? '').toLowerCase();
    const direct = body.start == null && GROQ_DIRECT_EXT.includes(ext) && (body.size ?? 0) > 0 && (body.size ?? 0) < 24 * 1024 * 1024;

    let file: Blob;
    let name: string;
    if (direct) {
      const r = await fetch(url);
      if (!r.ok) throw new HttpError(404, 'Fichier illisible');
      file = await r.blob();
      name = `audio.${ext}`;
    } else {
      // Vidéo, .mov, ou gros fichier : on extrait l'audio de la fenêtre demandée.
      const buf = await audioWindow(url, body.start ?? 0, body.duration ?? 600);
      if (buf.length < 1000) return Response.json({ text: '', segments: [] });
      file = new Blob([new Uint8Array(buf)], { type: 'audio/mpeg' });
      name = 'audio.mp3';
    }
    const out = await whisper(file, name, body.language ?? 'fr');
    return Response.json(out);
  } catch (e) {
    return errorResponse(e);
  }
}
