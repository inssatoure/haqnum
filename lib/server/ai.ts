import 'server-only';
import { askClaude, imageBlock, MODEL as CLAUDE_MODEL, type Block } from './claude';
import { askGemini, GEMINI_MODEL, type GeminiPart } from './gemini';
import { HttpError } from './supabase';

// Choix du moteur : Gemini (économique, par défaut) ou Claude (qualité, rapports finaux).
export type Engine = 'gemini' | 'claude';

export interface AiInput {
  engine?: Engine;
  system: string;
  corpus?: string;
  images?: { label: string; base64: string; mime?: string }[];
  instruction: string;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
}

export function resolveEngine(requested?: string): Engine {
  const want = (requested || process.env.AI_DEFAULT_ENGINE || 'gemini') as Engine;
  const hasGemini = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY);
  if (want === 'gemini' && hasGemini) return 'gemini';
  if (want === 'claude' && hasClaude) return 'claude';
  if (hasGemini) return 'gemini';
  if (hasClaude) return 'claude';
  throw new HttpError(500, 'Aucune clé IA configurée (GEMINI_API_KEY ou ANTHROPIC_API_KEY)');
}

export async function askAI(i: AiInput): Promise<{ text: string; model: string; engine: Engine }> {
  const engine = resolveEngine(i.engine);
  if (engine === 'gemini') {
    const parts: GeminiPart[] = [];
    (i.images ?? []).forEach((im, k) => {
      parts.push({ text: `Image n°${k + 1} : ${im.label}` });
      parts.push({ inlineData: { mimeType: im.mime ?? 'image/jpeg', data: im.base64 } });
    });
    parts.push({ text: i.instruction });
    const text = await askGemini({ system: i.system, corpus: i.corpus, parts, maxTokens: i.maxTokens });
    return { text, model: GEMINI_MODEL, engine };
  }
  const content: Block[] = [];
  (i.images ?? []).forEach((im, k) => {
    content.push({ type: 'text', text: `Image n°${k + 1} : ${im.label}` });
    content.push(imageBlock(im.base64, im.mime));
  });
  content.push({ type: 'text', text: i.instruction });
  const text = await askClaude({ system: i.system, corpus: i.corpus, content, maxTokens: i.maxTokens, effort: i.effort });
  return { text, model: CLAUDE_MODEL, engine };
}
