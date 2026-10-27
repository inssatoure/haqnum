// Lecture d'une carte de visite (photo) -> champs du contact.

import { askAI } from '@/lib/server/ai';
import { errorResponse, HttpError, requireUser, supabaseForRequest } from '@/lib/server/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { sb } = supabaseForRequest(req);
    await requireUser(sb);
    const { image, media_type, engine } = (await req.json()) as { image: string; media_type?: string; engine?: 'gemini' | 'claude' };
    if (!image) throw new HttpError(400, 'Image manquante');
    const { text } = await askAI({
      engine,
      system: 'Tu lis des cartes de visite. Tu recopies exactement ce qui est écrit, sans rien inventer.',
      images: [{ label: 'carte de visite', base64: image, mime: media_type || 'image/jpeg' }],
      instruction:
        'Extrais les informations de cette carte de visite. Réponds UNIQUEMENT en JSON valide : {"name":"","organization":"","role":"","email":"","phone":"","website":"","linkedin":"","country":""}. Laisse vide ce qui n’est pas écrit.',
      effort: 'low',
      maxTokens: 2000,
    });
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new HttpError(422, 'Carte illisible');
    return Response.json(JSON.parse(m[0]));
  } catch (e) {
    return errorResponse(e);
  }
}
