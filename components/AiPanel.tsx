'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Brain, Users } from 'lucide-react';
import { useState } from 'react';
import { runAnalysis, type AiTask } from '@/lib/ai-client';
import { db } from '@/lib/db';
import { dateHeure } from '@/lib/time';
import Markdown from './Markdown';
import { AuthorBadge, Btn, H2, toast } from './ui';

/** Analyses IA d'une activité (ou d'un jour) : synthèse commune + 10 regards. */
export function AiPanel({ activityId, day }: { activityId?: string; day?: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const list = useLiveQuery(async () => {
    const all = activityId ? await db().analyses.where('activity_id').equals(activityId).toArray() : await db().analyses.where('day').equals(day ?? '').toArray();
    return all.filter((a) => !a.deleted_at && a.kind !== 'chat').sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [activityId, day]) ?? [];

  const run = async (task: AiTask, title: string) => {
    setBusy(title);
    try {
      const a = await runAnalysis(task, { activityId, day, title });
      setOpen(a.id);
      toast('Analyse prête');
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <H2>Analyse IA</H2>
      <div className="grid grid-cols-2 gap-2">
        <Btn tone="nuit" disabled={!!busy} onClick={() => run('synthese', 'Synthèse commune')}>
          <Users size={18} /> Synthèse commune
        </Btn>
        <Btn tone="nuit" disabled={!!busy} onClick={() => run('regards', 'Les 10 regards experts')}>
          <Brain size={18} /> 10 regards
        </Btn>
      </div>
      {busy && <p className="mt-2 animate-pulse text-sm text-ocre-400">{busy} en cours… (1 à 3 min)</p>}
      <div className="mt-3 space-y-2">
        {list.map((a) => (
          <div key={a.id} className="rounded-2xl border border-nuit-700 bg-nuit-900">
            <button className="flex w-full items-center justify-between p-3 text-left" onClick={() => setOpen(open === a.id ? null : a.id)}>
              <span>
                <span className="font-semibold">{a.title}</span>
                <span className="block text-xs text-nuit-400">{dateHeure(a.created_at)} · lancé par</span>
              </span>
              <AuthorBadge authorId={a.author_id} small />
            </button>
            {open === a.id && a.markdown && (
              <div className="border-t border-nuit-700 p-3 text-sm">
                <Markdown text={a.markdown} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
