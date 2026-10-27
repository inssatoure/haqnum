import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AwsClient } from 'aws4fetch';
import { BUCKET, HttpError } from './supabase';

// Stockage des fichiers : Cloudflare R2 si configuré (gros volumes, pas de limite de 50 Mo),
// sinon Supabase Storage. Les chemins sont identiques : {mission}/{auteur}/{media}/{fichier}.

const env = () => ({
  account: process.env.R2_ACCOUNT_ID,
  key: process.env.R2_ACCESS_KEY_ID,
  secret: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET,
});

export const r2Enabled = () => {
  const e = env();
  return Boolean(e.account && e.key && e.secret && e.bucket);
};

let client: AwsClient | null = null;
function r2(): { c: AwsClient; base: string } {
  const e = env();
  if (!r2Enabled()) throw new HttpError(500, 'R2 non configuré');
  if (!client) client = new AwsClient({ accessKeyId: e.key!, secretAccessKey: e.secret!, service: 's3', region: 'auto' });
  return { c: client, base: `https://${e.account}.r2.cloudflarestorage.com/${e.bucket}` };
}

const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/** URL signée temporaire (lecture ou écriture directe depuis le téléphone). */
export async function presign(path: string, method: 'GET' | 'PUT', seconds = 3600, query: Record<string, string> = {}): Promise<string> {
  const { c, base } = r2();
  const u = new URL(`${base}/${enc(path)}`);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  u.searchParams.set('X-Amz-Expires', String(seconds));
  const signed = await c.sign(u.toString(), { method, aws: { signQuery: true } });
  return signed.url;
}

export async function createMultipart(path: string, contentType: string): Promise<string> {
  const { c, base } = r2();
  const r = await c.fetch(`${base}/${enc(path)}?uploads`, { method: 'POST', headers: { 'Content-Type': contentType } });
  if (!r.ok) throw new HttpError(502, `R2 : ${r.status}`);
  const id = (await r.text()).match(/<UploadId>([^<]+)<\/UploadId>/)?.[1];
  if (!id) throw new HttpError(502, 'R2 : UploadId manquant');
  return id;
}

export async function completeMultipart(path: string, uploadId: string, parts: { n: number; etag: string }[]) {
  const { c, base } = r2();
  const xml = `<CompleteMultipartUpload>${parts
    .sort((a, b) => a.n - b.n)
    .map((p) => `<Part><PartNumber>${p.n}</PartNumber><ETag>${p.etag}</ETag></Part>`)
    .join('')}</CompleteMultipartUpload>`;
  const r = await c.fetch(`${base}/${enc(path)}?uploadId=${encodeURIComponent(uploadId)}`, { method: 'POST', body: xml });
  const text = await r.text();
  if (!r.ok || text.includes('<Error>')) throw new HttpError(502, `R2 : ${r.status} ${text.slice(0, 200)}`);
}

export async function listParts(path: string, uploadId: string): Promise<{ n: number; etag: string }[]> {
  const { c, base } = r2();
  const r = await c.fetch(`${base}/${enc(path)}?uploadId=${encodeURIComponent(uploadId)}`);
  if (!r.ok) return [];
  const xml = await r.text();
  return [...xml.matchAll(/<Part>[\s\S]*?<PartNumber>(\d+)<\/PartNumber>[\s\S]*?<ETag>([^<]+)<\/ETag>[\s\S]*?<\/Part>/g)].map((m) => ({ n: Number(m[1]), etag: m[2].replace(/&quot;/g, '"') }));
}

/** Lien de lecture (R2 ou Supabase), utilisé par ffmpeg, Groq, pyannote… */
export async function readUrl(sb: SupabaseClient, path: string, seconds = 3600): Promise<string> {
  if (r2Enabled()) return presign(path, 'GET', seconds);
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error || !data?.signedUrl) throw new HttpError(404, `Fichier introuvable sur le serveur (${path}). Attendez la fin de l'envoi.`);
  return data.signedUrl;
}

export async function download(sb: SupabaseClient, path: string): Promise<Blob | null> {
  if (r2Enabled()) {
    const { c, base } = r2();
    const r = await c.fetch(`${base}/${enc(path)}`);
    return r.ok ? await r.blob() : null;
  }
  const { data } = await sb.storage.from(BUCKET).download(path);
  return data ?? null;
}

export async function upload(sb: SupabaseClient, path: string, body: Blob, contentType: string) {
  if (r2Enabled()) {
    const { c, base } = r2();
    const r = await c.fetch(`${base}/${enc(path)}`, { method: 'PUT', body, headers: { 'Content-Type': contentType } });
    if (!r.ok) throw new HttpError(502, `R2 : ${r.status}`);
    return;
  }
  const { error } = await sb.storage.from(BUCKET).upload(path, body, { upsert: true, contentType });
  if (error) throw new HttpError(500, error.message);
}

/** Vérifie que l'utilisateur est membre de la mission indiquée par le chemin. */
export async function assertMember(sb: SupabaseClient, path: string) {
  const mission = path.split('/')[0];
  const { data } = await sb.from('missions').select('id').eq('id', mission).maybeSingle();
  if (!data) throw new HttpError(403, 'Accès refusé à ce fichier');
}
