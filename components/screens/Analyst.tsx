'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { askAnalyst } from '@/lib/ai-client';
import { db } from '@/lib/db';
import { create } from '@/lib/repo';
import { useMe } from '../hooks';
import Markdown from '../Markdown';
import { Btn, TextArea, Title } from '../ui';

const EXAMPLES = [
  'Quelles œuvres utilisaient l’IA ?',
  'Résume le débat de jeudi',
  'Qu’a dit un intervenant sur le hacktivisme ?',
  'Qu’a vu Moctar que je n’ai pas vu ?',
  'Qui dois-je relancer ?',
  'Propose une programmation pour Dakar',
];

/** Agent analyste : répond uniquement à partir des données, avec sources et auteurs. */
export default function Analyst() {
  const me = useMe();
  const history = useLiveQuery(async () => (await db().analyses.where('kind').equals('chat').toArray()).filter((a) => a.author_id === me?.id && !a.deleted_at).sort((a, b) => a.created_at.localeCompare(b.created_at)), [me?.id]) ?? [];
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ask = async (question: string) => {
    if (!question.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const hist = history.slice(-3).flatMap((h) => [
        { role: 'user' as const, content: h.title ?? '' },
        { role: 'assistant' as const, content: (h.markdown ?? '').slice(0, 3000) },
      ]);
      const answer = await askAnalyst(question, hist);
      await create('analyses', { kind: 'chat', title: question, markdown: answer, content: {}, model: null });
      setQ('');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Title sub="Il répond uniquement à partir de vos données, et cite qui a vu quoi.">Agent analyste</Title>
      {history.length === 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button key={e} onClick={() => ask(e)} className="rounded-full bg-nuit-900 px-3 py-2 text-left text-sm text-nuit-200">{e}</button>
          ))}
        </div>
      )}
      <div className="space-y-4">
        {history.map((h) => (
          <div key={h.id}>
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl bg-ocre-500 px-3 py-2 text-nuit-950">{h.title}</p>
            <div className="mt-2 rounded-2xl bg-nuit-900 p-3 text-sm"><Markdown text={h.markdown ?? ''} /></div>
          </div>
        ))}
      </div>
      {busy && <p className="mt-3 animate-pulse text-ocre-400">L’analyste lit toutes les données…</p>}
      {err && <p className="mt-3 rounded-xl bg-red-950 p-3 text-sm text-red-200">{err}</p>}
      <form className="mt-4 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
        <TextArea rows={2} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Votre question" />
        <Btn type="submit" disabled={busy || !q.trim()} className="h-[52px]"><Send size={18} /></Btn>
      </form>
    </div>
  );
}
