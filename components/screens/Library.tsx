'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/lib/db';
import { dayKey, jourLong } from '@/lib/time';
import { matchAuthor, useAuthorFilter, useMe } from '../hooks';
import { MediaGrid } from '../MediaGrid';
import { AuthorFilterBar, cx, Empty, H2, Title } from '../ui';

const KINDS: [string, string][] = [['tout', 'Tout'], ['photo', 'Photos'], ['video', 'Vidéos'], ['audio', 'Audios'], ['voice', 'Vocaux']];

export default function Library() {
  const me = useMe();
  const { value: filter } = useAuthorFilter();
  const [kind, setKind] = useState('tout');
  const list = useLiveQuery(async () => (await db().media.orderBy('captured_at').reverse().toArray()).filter((m) => !m.deleted_at && !['receipt'].includes(m.kind)), []) ?? [];
  const shown = list.filter((m) => matchAuthor(m.author_id, filter, me?.id) && (kind === 'tout' || m.kind === kind));
  const byDay = new Map<string, typeof shown>();
  for (const m of shown) {
    const k = dayKey(m.captured_at);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(m);
  }
  return (
    <div>
      <Title sub={`${shown.length} élément(s)`}>Captures</Title>
      <AuthorFilterBar />
      <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4">
        {KINDS.map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} className={cx('shrink-0 rounded-full px-3 py-1.5 text-sm', kind === k ? 'bg-ocre-500 text-nuit-950' : 'bg-white/[0.03] text-nuit-200')}>{l}</button>
        ))}
      </div>
      {!shown.length && <Empty>Rien pour l’instant.</Empty>}
      {[...byDay.entries()].map(([d, items]) => (
        <div key={d}>
          <H2>{jourLong(d + 'T12:00:00Z')}</H2>
          <MediaGrid items={items} />
        </div>
      ))}
    </div>
  );
}
