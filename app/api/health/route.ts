// État de la configuration serveur (sans jamais renvoyer les clés).
export const runtime = 'nodejs';

export async function GET() {
  return Response.json({
    supabase: true,
    supabase_key_env_ok: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test((process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()),
    groq: Boolean(process.env.GROQ_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    gemini_model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
    default_engine: process.env.AI_DEFAULT_ENGINE || 'gemini',
    r2: Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET),
    pyannote: Boolean(process.env.PYANNOTE_API_KEY),
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
  });
}
