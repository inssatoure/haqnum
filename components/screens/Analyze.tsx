'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { db } from '@/lib/db';
import { describePhoto, transcribeMedia } from '@/lib/ai-client';
import { canEdit } from '@/lib/repo';
import { Btn, Card, Title, toast } from '../ui';

/** Lance l'IA sur tout ce qui n'a pas encore été traité : transcription des sons, description des photos. */
export default function Analyze() {
  const todo = useLiveQuery(async () => {
    const media = (await db().media.toArray()).filter((m) => !m.deleted_at);
    const trs = (await db().transcripts.toArray()).filter((t) => !t.deleted_at && t.status !== 'erreur');
    const done = new Set(trs.map((t) => t.media_id));
    const audio = media.filter((m) => ['audio', 'voice', 'video'].includes(m.kind) && !done.has(m.id) && m.parts.length > 0 && m.status !== 'enregistrement');
    const photos = media.filter((m) => m.kind === 'photo' && !m.description && canEdit(m) && m.parts.length > 0);
    return { audio, photos };
  }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [errs, setErrs] = useState<string[]>([]);

  const run = async (label: string, items: { id: string; title?: string | null }[], fn: (id: string) => Promise<unknown>) => {
    const bad: string[] = [];
    for (let i = 0; i < items.length; i++) {
      setBusy(`${label} ${i + 1}/${items.length}…`);
      try {
        await fn(items[i].id);
      } catch (e: any) {
        bad.push(`${items[i].title ?? 'Sans titre'} : ${e?.message ?? e}`);
        if (!navigator.onLine) break;
      }
    }
    setErrs(bad);
    setBusy(null);
    toast(bad.length ? `${bad.length} échec(s)` : 'Terminé');
  };

  if (!todo) return null;
  return (
    <div className="space-y-4 px-4 pb-24 pt-4">
      <Title>Analyser avec l’IA</Title>
      <p className="text-[14px] leading-snug text-nuit-200">L’IA ne traite pas les fichiers toute seule. Ici, vous lancez le travail sur tout ce qui n’a pas encore été analysé. Restez sur cette page, avec internet.</p>
      <Card>
        <div className="text-[15px] font-semibold">Enregistrements à transcrire : {todo.audio.length}</div>
        <Btn tone="ocre" className="mt-2" disabled={!!busy || !todo.audio.length} onClick={() => run('Transcription', todo.audio, (id) => transcribeMedia(id))}>
          <Sparkles size={16} /> Tout transcrire
        </Btn>
      </Card>
      <Card>
        <div className="text-[15px] font-semibold">Photos à décrire : {todo.photos.length}</div>
        <Btn tone="ocre" className="mt-2" disabled={!!busy || !todo.photos.length} onClick={() => run('Photo', todo.photos, (id) => describePhoto(id))}>
          <Sparkles size={16} /> Décrire toutes les photos
        </Btn>
      </Card>
      {busy && <p className="text-[14px] text-ocre-300">{busy}</p>}
      {errs.map((e, i) => (
        <p key={i} className="text-[13px] text-red-300">{e}</p>
      ))}
    </div>
  );
}
