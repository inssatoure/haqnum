// Description d'une photo (œuvre, scénographie, panneau, document) pour la rendre cherchable et utilisable dans les rapports.

import { askAI } from '@/lib/server/ai';
import { assertMember, download } from '@/lib/server/storage';
import { errorResponse, HttpError, requireUser, supabaseForRequest } from '@/lib/server/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { sb } = supabaseForRequest(req);
    await requireUser(sb);
    const { path, mime, engine } = (await req.json()) as { path: string; mime?: string; engine?: 'gemini' | 'claude' };
    if (!path) throw new HttpError(400, 'path manquant');
    await assertMember(sb, path);
    const blob = await download(sb, path);
    if (!blob) throw new HttpError(404, 'Photo pas encore envoyée');
    if (blob.size > 12 * 1024 * 1024) throw new HttpError(413, 'Photo trop lourde pour l’analyse');
    const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
    const { text } = await askAI({
      engine,
      system: 'Tu décris des photos prises lors d’une mission d’observation (biennale d’arts numériques). Tu décris seulement ce qui est visible, sans rien inventer.',
      images: [{ label: 'photo', base64, mime: mime || blob.type || 'image/jpeg' }],
      instruction:
        'Décris cette photo en français, en 2 à 4 phrases : ce qu’on voit (œuvre, dispositif, lieu, personnes en général sans les identifier, public). Recopie fidèlement tout texte lisible (titre, cartel, panneau, nom de projet). Si c’est une carte de visite ou un document, recopie les informations. Pas d’introduction.',
      effort: 'low',
      maxTokens: 3000,
    });
    return Response.json({ description: text.trim() });
  } catch (e) {
    return errorResponse(e);
  }
}
