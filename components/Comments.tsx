'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/lib/db';
import { create } from '@/lib/repo';
import { dateHeure } from '@/lib/time';
import { AuthorBadge, Btn, Input } from './ui';

/** Commentaires : chacun peut commenter l'élément de l'autre. */
export default function Comments({ table, id }: { table: string; id: string }) {
  const list = useLiveQuery(async () => (await db().comments.where('target_id').equals(id).toArray()).filter((c) => !c.deleted_at).sort((a, b) => a.created_at.localeCompare(b.created_at)), [id]) ?? [];
  const [body, setBody] = useState('');
  return (
    <div className="mt-6">
      <h3 className="mb-2 font-titre text-base text-ocre-400">Commentaires</h3>
      <div className="space-y-2">
        {list.map((c) => (
          <div key={c.id} className="rounded-xl bg-nuit-900 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs text-nuit-400">
              <AuthorBadge authorId={c.author_id} small /> {dateHeure(c.created_at)}
            </div>
            <p className="whitespace-pre-wrap text-sm">{c.body}</p>
          </div>
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!body.trim()) return;
          await create('comments', { target_table: table, target_id: id, body: body.trim() });
          setBody('');
        }}
      >
        <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ajouter un commentaire" />
        <Btn type="submit" tone="nuit">OK</Btn>
      </form>
    </div>
  );
}
