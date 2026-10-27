// État de la configuration serveur (sans jamais renvoyer les clés).
export const runtime = 'nodejs';

export async function GET() {
  return Response.json({
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    groq: Boolean(process.env.GROQ_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    gemini_model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
    default_engine: process.env.AI_DEFAULT_ENGINE || 'gemini',
    pyannote: Boolean(process.env.PYANNOTE_API_KEY),
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
  });
}
