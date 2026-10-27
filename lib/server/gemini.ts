import 'server-only';
import { GoogleGenAI } from '@google/genai';
import { HttpError } from './supabase';

// Gemini : moteur économique pour la compréhension (descriptions, synthèses, chat, cartes de visite).
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
// Modèles de repli si le premier est saturé ou ne répond pas.
const FALLBACKS = [GEMINI_MODEL, 'gemini-3-flash-preview', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'].filter((m, i, a) => a.indexOf(m) === i);

let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new HttpError(500, 'Clé GEMINI_API_KEY manquante sur le serveur');
  if (!client) client = new GoogleGenAI({ apiKey: key });
  return client;
}

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export async function askGemini(opts: { system: string; corpus?: string; parts: GeminiPart[]; maxTokens?: number }): Promise<string> {
  const contents = [
    {
      role: 'user',
      parts: [...(opts.corpus ? [{ text: opts.corpus }] : []), ...opts.parts],
    },
  ];
  let lastErr: unknown;
  for (const model of FALLBACKS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await gemini().models.generateContent({
          model,
          contents,
          config: { systemInstruction: opts.system, maxOutputTokens: opts.maxTokens ?? 32000, temperature: 0.2, httpOptions: { timeout: 150_000 } },
        });
        const text = res.text?.trim();
        if (!text) throw new HttpError(422, `Gemini n'a pas répondu (${res.candidates?.[0]?.finishReason ?? 'vide'})`);
        return text;
      } catch (e: any) {
        lastErr = e;
        const status = e?.status ?? e?.code;
        const busy = status === 429 || status === 503 || (typeof status === 'number' && status >= 500) || /demand|overloaded|timeout|aborted/i.test(String(e?.message));
        if (busy && attempt === 0) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        break; // modèle suivant
      }
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw lastErr instanceof HttpError ? lastErr : new HttpError(502, `Gemini : ${msg.slice(0, 300)}`);
}
