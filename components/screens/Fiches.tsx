'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { FICHE_TYPES } from '@/lib/fiches';
import { go, matchAuthor, useAuthorFilter, useMe } from '../hooks';
import { AuthorBadge, AuthorFilterBar, Btn, Card, cx, Empty, Title } from '../ui';

export default function Fiches({ type }: { type?: string }) {
  const me = useMe();
  const { value: filter } = useAuthorFilter();
  const t = type && FICHE_TYPES[type] ? type : 'oeuvre';
  const list = useLiveQuery(async () => (await db().fiches.where('type').equals(t).toArray()).filter((f) => !f.deleted_at).sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [t]) ?? [];
  const shown = list.filter((f) => (f.author_id ? matchAuthor(f.author_id, filter, me?.id) : filter === 'tout'));
  return (
    <div>
      <Title sub="Le cœur de la mission : comprendre le fond.">Fiches</Title>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        {Object.entries(FICHE_TYPES).map(([k, v]) => (
          <button key={k} onClick={() => go(`fiches?type=${k}`)} className={cx('shrink-0 rounded-full px-4 py-2 text-sm font-semibold', k === t ? 'bg-ocre-500 text-nuit-950' : 'bg-nuit-900 text-nuit-200')}>
            {v.label}
          </button>
        ))}
      </div>
      <AuthorFilterBar />
      <Btn className="mb-3 w-full" onClick={() => go(`fiche?type=${t}`)}><Plus size={18} /> Nouvelle fiche {FICHE_TYPES[t].label}</Btn>
      <div className="space-y-2">
        {shown.map((f) => (
          <Card key={f.id} onClick={() => go(`fiche/${f.id}`)}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{f.title}</p>
                <p className="text-sm text-nuit-400">{[f.data.artistes, f.data.lieu, f.data.ville, f.data.domaine, f.data.moderateur].filter(Boolean).join(' · ')}</p>
              </div>
              <AuthorBadge authorId={f.author_id} small />
            </div>
          </Card>
        ))}
        {!shown.length && <Empty>Aucune fiche pour l’instant.</Empty>}
      </div>
    </div>
  );
}
