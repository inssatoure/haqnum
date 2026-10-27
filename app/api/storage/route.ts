// Liens signés pour envoyer / lire les fichiers directement sur Cloudflare R2.
// Écriture : uniquement dans son propre dossier {mission}/{moi}/…  Lecture : membres de la mission.

import { assertMember, completeMultipart, createMultipart, listParts, presign, r2Enabled } from '@/lib/server/storage';
import { errorResponse, HttpError, requireUser, supabaseForRequest } from '@/lib/server/supabase';

export const runtime = 'nodejs';

type Body =
  | { op: 'info' }
  | { op: 'read'; paths: string[] }
  | { op: 'put'; path: string }
  | { op: 'mp-create'; path: string; contentType: string }
  | { op: 'mp-urls'; path: string; uploadId: string; parts: number[] }
  | { op: 'mp-list'; path: string; uploadId: string }
  | { op: 'mp-complete'; path: string; uploadId: string; parts: { n: number; etag: string }[] };

export async function POST(req: Request) {
  try {
    const { sb } = supabaseForRequest(req);
    const user = await requireUser(sb);
    const b = (await req.json()) as Body;
    if (b.op === 'info') return Response.json({ r2: r2Enabled() });
    if (!r2Enabled()) throw new HttpError(501, 'R2 non configuré');

    const own = (path: string) => {
      const seg = path.split('/');
      if (seg.length < 3 || seg[1] !== user.id || path.includes('..')) throw new HttpError(403, 'Écriture refusée hors de votre dossier');
    };

    switch (b.op) {
      case 'read': {
        const paths = (b.paths ?? []).slice(0, 200);
        if (paths.length) await assertMember(sb, paths[0]);
        const missions = new Set(paths.map((p) => p.split('/')[0]));
        if (missions.size > 1) throw new HttpError(400, 'Une seule mission par demande');
        const urls: Record<string, string> = {};
        for (const p of paths) urls[p] = await presign(p, 'GET', 6 * 3600);
        return Response.json({ urls });
      }
      case 'put':
        own(b.path);
        await assertMember(sb, b.path);
        return Response.json({ url: await presign(b.path, 'PUT', 3600) });
      case 'mp-create':
        own(b.path);
        await assertMember(sb, b.path);
        return Response.json({ uploadId: await createMultipart(b.path, b.contentType || 'application/octet-stream') });
      case 'mp-urls': {
        own(b.path);
        const urls: Record<number, string> = {};
        for (const n of b.parts.slice(0, 100)) urls[n] = await presign(b.path, 'PUT', 3600, { partNumber: String(n), uploadId: b.uploadId });
        return Response.json({ urls });
      }
      case 'mp-list':
        own(b.path);
        return Response.json({ parts: await listParts(b.path, b.uploadId) });
      case 'mp-complete':
        own(b.path);
        await completeMultipart(b.path, b.uploadId, b.parts);
        return Response.json({ ok: true });
    }
    throw new HttpError(400, 'Opération inconnue');
  } catch (e) {
    return errorResponse(e);
  }
}
