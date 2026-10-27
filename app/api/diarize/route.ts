// Séparation des voix (« qui parle ») avec l'API pyannoteAI.
// POST : recolle les morceaux en un MP3, l'envoie à pyannote, renvoie l'identifiant de tâche.
// GET ?job=… : renvoie l'état et les tours de parole.

import { concatAudio } from '@/lib/server/ffmpeg';
import { readUrl, upload } from '@/lib/server/storage';
import { errorResponse, HttpError, requireUser, supabaseForRequest } from '@/lib/server/supabase';

export const runtime = 'nodejs';
export const maxDuration = 300;

const API = 'https://api.pyannote.ai/v1';

function key() {
  const k = process.env.PYANNOTE_API_KEY;
  if (!k) throw new HttpError(501, 'Séparation des voix non configurée (PYANNOTE_API_KEY)');
  return k;
}

export async function POST(req: Request) {
  try {
    const k = key();
    const { sb } = supabaseForRequest(req);
    const user = await requireUser(sb);
    const { media_id, mission_id } = (await req.json()) as { media_id: string; mission_id: string };
    const { data: m, error } = await sb.from('media').select('id, parts').eq('id', media_id).single();
    if (error || !m) throw new HttpError(404, 'Média introuvable sur le serveur');
    const parts = (m.parts ?? []) as { path: string }[];
    if (!parts.length) throw new HttpError(400, 'Aucun fichier');
    const urls = await Promise.all(parts.map((p) => readUrl(sb, p.path)));
    const mp3 = await concatAudio(urls);
    const path = `${mission_id}/${user.id}/diarize/${media_id}.mp3`;
    await upload(sb, path, new Blob([new Uint8Array(mp3)], { type: 'audio/mpeg' }), 'audio/mpeg');
    const url = await readUrl(sb, path, 6 * 3600);
    const r = await fetch(`${API}/diarize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!r.ok) throw new HttpError(502, `pyannote : ${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return Response.json({ job: j.jobId ?? j.id });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(req: Request) {
  try {
    const k = key();
    const { sb } = supabaseForRequest(req);
    await requireUser(sb);
    const job = new URL(req.url).searchParams.get('job');
    if (!job) throw new HttpError(400, 'job manquant');
    const r = await fetch(`${API}/jobs/${job}`, { headers: { Authorization: `Bearer ${k}` } });
    if (!r.ok) throw new HttpError(502, `pyannote : ${r.status}`);
    const j = await r.json();
    return Response.json({ status: j.status, turns: j.output?.diarization ?? null, error: j.output?.error ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}
