import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Client Supabase « au nom de l'utilisateur » : les règles RLS s'appliquent côté serveur aussi.
export function supabaseForRequest(req: Request): { sb: SupabaseClient; token: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new HttpError(500, 'Supabase non configuré sur le serveur');
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Connexion requise');
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { sb, token };
}

export async function requireUser(sb: SupabaseClient) {
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'Session expirée, reconnectez-vous');
  return data.user;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function errorResponse(e: unknown) {
  const status = e instanceof HttpError ? e.status : 500;
  const message = e instanceof Error ? e.message : String(e);
  console.error('[api]', message);
  return Response.json({ error: message }, { status });
}

export const BUCKET = 'media';

export async function signedUrl(sb: SupabaseClient, path: string, seconds = 3600): Promise<string> {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error || !data?.signedUrl) throw new HttpError(404, `Fichier introuvable sur le serveur (${path}). Attendez la fin de l'envoi.`);
  return data.signedUrl;
}
