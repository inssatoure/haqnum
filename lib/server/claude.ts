import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { HttpError } from './supabase';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(500, 'Clé ANTHROPIC_API_KEY manquante sur le serveur');
  if (!client) client = new Anthropic();
  return client;
}

export type Block = Anthropic.Beta.BetaContentBlockParam;

/**
 * Appel Claude en streaming (évite les délais d'attente), avec repli automatique
 * vers un autre modèle si la demande est refusée par les filtres de sécurité.
 */
export async function askClaude(opts: {
  system: string;
  corpus?: string;
  content: Block[];
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}): Promise<string> {
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: opts.system }];
  // Le corpus (toutes les données de la mission) est stable : on le met en cache.
  if (opts.corpus) system.push({ type: 'text', text: opts.corpus, cache_control: { type: 'ephemeral' } });
  const stream = anthropic().beta.messages.stream({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: opts.effort ?? 'high' },
    system,
    messages: [{ role: 'user', content: opts.content }],
  } as any);
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new HttpError(422, "L'IA a refusé cette demande.");
  return msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export function imageBlock(base64: string, mediaType = 'image/jpeg'): Block {
  return { type: 'image', source: { type: 'base64', media_type: mediaType as any, data: base64 } };
}
