// IA analyste : synthèse commune, 10 regards, rapport du jour, doublons, chat, sections de rapports.

import { BASE_SYSTEM, DOSSIER_SECTIONS, MISSION_SECTIONS, TASKS } from '@/lib/ai-prompts';
import { askAI, type Engine } from '@/lib/server/ai';
import { buildCorpus, loadImages } from '@/lib/server/corpus';
import { errorResponse, HttpError, requireUser, supabaseForRequest } from '@/lib/server/supabase';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface Body {
  task: 'synthese' | 'regards' | 'jour' | 'observateur' | 'doublons' | 'chat' | 'section';
  mission_id: string;
  activity_id?: string;
  day?: string;
  author_id?: string;
  question?: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  report?: 'dossier' | 'mission';
  section?: string;
  engine?: Engine;
}

export async function POST(req: Request) {
  try {
    const { sb } = supabaseForRequest(req);
    await requireUser(sb);
    const b = (await req.json()) as Body;
    if (!b.mission_id) throw new HttpError(400, 'mission_id manquant');

    const withImages = b.task === 'synthese' || b.task === 'regards' || (b.task === 'section' && ['catalogue', 'scenographie'].includes(b.section ?? ''));
    const corpus = await buildCorpus(
      sb,
      { mission_id: b.mission_id, activity_ids: b.activity_id ? [b.activity_id] : undefined, day: b.day, author_id: b.author_id },
      { maxImages: withImages ? (b.activity_id ? 16 : 24) : 0 },
    );
    if (corpus.stats.media + corpus.stats.notes + corpus.stats.fiches === 0 && b.task !== 'chat' && b.task !== 'section') {
      throw new HttpError(400, 'Pas encore de données à analyser (rien de capturé ou pas encore synchronisé).');
    }

    let instruction = '';
    let effort: 'medium' | 'high' = 'high';
    let maxTokens = 32000;
    if (b.task === 'section') {
      const list = b.report === 'mission' ? MISSION_SECTIONS : DOSSIER_SECTIONS;
      const s = list.find((x) => x.key === b.section);
      if (!s) throw new HttpError(400, 'Section inconnue');
      instruction = `Rédige la section « ${s.title} » du ${b.report === 'mission' ? 'rapport de mission' : 'dossier de reproduction de la Biennale'}.\nContenu attendu : ${s.brief}\nCommence directement par le contenu (le titre de section sera ajouté automatiquement). Utilise des sous-titres ###.`;
    } else if (b.task === 'chat') {
      if (!b.question) throw new HttpError(400, 'Question vide');
      const hist = (b.history ?? []).slice(-6).map((h) => `${h.role === 'user' ? 'Question' : 'Réponse'} : ${h.content}`).join('\n\n');
      instruction = `${TASKS.chat}\n${hist ? `\nÉchanges précédents :\n${hist}\n` : ''}\nQUESTION : ${b.question}`;
      effort = 'medium';
      maxTokens = 16000;
    } else {
      instruction = TASKS[b.task];
      if (!instruction) throw new HttpError(400, 'Tâche inconnue');
      if (b.task === 'doublons') effort = 'medium';
    }

    const images = corpus.images.length ? await loadImages(sb, corpus.images) : [];
    const { text, model, engine } = await askAI({
      engine: b.engine,
      system: BASE_SYSTEM,
      corpus: `CORPUS DES OBSERVATIONS\n\n${corpus.text}`,
      images,
      instruction,
      effort,
      maxTokens,
    });

    let json: unknown = null;
    if (b.task === 'doublons') {
      const m = text.match(/\{[\s\S]*\}/);
      try {
        json = m ? JSON.parse(m[0]) : null;
      } catch {
        json = null;
      }
    }
    return Response.json({ markdown: text, json, model, engine, stats: corpus.stats });
  } catch (e) {
    return errorResponse(e);
  }
}
