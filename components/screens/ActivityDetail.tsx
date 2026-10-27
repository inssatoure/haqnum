'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Bus, Check, Clock, MapPin, Mic, Pencil, Sparkles, Upload } from 'lucide-react';
import { useState } from 'react';
import { ACTIVITY_KINDS } from '@/lib/config';
import { db } from '@/lib/db';
import { create, update } from '@/lib/repo';
import { heure, jourLong } from '@/lib/time';
import Comments from '../Comments';
import { go, matchAuthor, useAuthorFilter, useMe } from '../hooks';
import { MediaGrid, NotesList } from '../MediaGrid';
import { AiPanel } from '../AiPanel';
import { AuthorBadge, AuthorFilterBar, Btn, Card, Empty, H2, Sheet } from '../ui';
import { QuickActions } from './Capture';
import { ActivityForm } from './Programme';

const FICHE_LABEL: Record<string, string> = { oeuvre: 'Œuvre / Expérience', debat: 'Débat / Conférence', lieu: 'Lieu / Scénographie', organisation: 'Organisation' };

export default function ActivityDetail({ id }: { id: string }) {
  const me = useMe();
  const { value: filter } = useAuthorFilter();
  const [edit, setEdit] = useState(false);
  const a = useLiveQuery(() => db().activities.get(id), [id]);
  const data = useLiveQuery(async () => {
    const d = db();
    const live = <T extends { deleted_at?: string | null }>(x: T[]) => x.filter((r) => !r.deleted_at);
    return {
      media: live(await d.media.where('activity_id').equals(id).toArray()).sort((x, y) => x.captured_at.localeCompare(y.captured_at)),
      notes: live(await d.notes.where('activity_id').equals(id).toArray()).filter((n) => !n.media_id),
      fiches: live(await d.fiches.where('activity_id').equals(id).toArray()),
      contacts: live(await d.contacts.where('activity_id').equals(id).toArray()),
      goers: live(await d.assignments.where('activity_id').equals(id).toArray()),
    };
  }, [id]);

  if (!a) return <Empty>Activité introuvable.</Empty>;
  const f = <T extends { author_id: string | null }>(x: T[]) => x.filter((r) => matchAuthor(r.author_id, filter, me?.id));
  const media = f(data?.media ?? []);
  const notes = f(data?.notes ?? []);
  const iGo = data?.goers.some((g) => g.author_id === me?.id);

  return (
    <div>
      <p className="text-sm text-ocre-400">{jourLong(a.starts_at)}</p>
      <h1 className="mt-1 font-titre text-2xl leading-snug">{a.title}</h1>
      <div className="mt-2 space-y-1 text-sm text-nuit-200">
        <p className="flex items-center gap-2"><Clock size={16} className="text-ocre-400" /> {heure(a.starts_at)} – {heure(a.ends_at)}{a.kind ? ` · ${ACTIVITY_KINDS[a.kind] ?? a.kind}` : ''}</p>
        {a.venue && <p className="flex items-center gap-2"><MapPin size={16} className="text-ocre-400" /> {a.venue}{a.address && a.address !== a.city ? `, ${a.address}` : a.city ? `, ${a.city}` : ''}</p>}
        {a.transport && <p className="flex items-center gap-2"><Bus size={16} className="text-ocre-400" /> {a.transport}</p>}
        {a.description && <p className="mt-2 whitespace-pre-wrap">{a.description}</p>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {data?.goers.map((g) => <span key={g.id} className="flex items-center gap-1 text-xs"><AuthorBadge authorId={g.author_id} small /> y va</span>)}
        <button
          className="rounded-full bg-nuit-700 px-3 py-1.5 text-xs font-semibold"
          onClick={async () => {
            const mine = data?.goers.find((g) => g.author_id === me?.id);
            if (mine) await update('assignments', mine.id, { deleted_at: new Date().toISOString() });
            else await create('assignments', { activity_id: id });
          }}
        >
          {iGo ? <span className="flex items-center gap-1"><Check size={14} /> J'y vais</span> : "J'y vais"}
        </button>
        <button className="ml-auto flex items-center gap-1 text-xs text-nuit-400" onClick={() => setEdit(true)}>
          <Pencil size={14} /> Modifier
        </button>
      </div>

      <H2>Capturer ici</H2>
      <QuickActions activityId={id} />
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Btn tone="terre" onClick={() => go(`debat?activite=${id}`)}><Mic size={18} /> Débat</Btn>
        <Btn tone="nuit" onClick={() => go(`capturer?experience=1&activite=${id}`)}><Sparkles size={18} /> Expérience</Btn>
        <Btn tone="nuit" onClick={() => go(`importer?activite=${id}`)}><Upload size={18} /> Importer</Btn>
      </div>

      <H2>Fiches</H2>
      <div className="space-y-2">
        {(data?.fiches ?? []).map((fi) => (
          <Card key={fi.id} onClick={() => go(`fiche/${fi.id}`)} className="flex items-center justify-between">
            <div>
              <p className="text-xs text-ocre-400">{FICHE_LABEL[fi.type]}</p>
              <p className="font-semibold">{fi.title}</p>
            </div>
            <AuthorBadge authorId={fi.author_id} small />
          </Card>
        ))}
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(FICHE_LABEL).map(([t, l]) => (
            <button key={t} onClick={() => go(`fiche?type=${t}&activite=${id}`)} className="rounded-xl border border-dashed border-nuit-600 p-3 text-left text-sm text-nuit-200">
              + {l}
            </button>
          ))}
        </div>
      </div>

      <H2>Captures</H2>
      <AuthorFilterBar />
      {media.length === 0 && notes.length === 0 ? <Empty>Personne n'a encore rien capturé ici.</Empty> : null}
      <MediaGrid items={media} />
      <div className="mt-3"><NotesList notes={notes} /></div>

      {(data?.contacts.length ?? 0) > 0 && (
        <>
          <H2>Rencontres</H2>
          <div className="space-y-2">
            {data!.contacts.map((c) => (
              <Card key={c.id} onClick={() => go(`contact/${c.id}`)} className="flex items-center justify-between">
                <span>{c.name} <span className="text-sm text-nuit-400">{c.organization}</span></span>
                <AuthorBadge authorId={c.author_id} small />
              </Card>
            ))}
          </div>
        </>
      )}

      <AiPanel activityId={id} />
      <Comments table="activities" id={id} />
      <Sheet open={edit} onClose={() => setEdit(false)} title="Modifier l'activité">
        <ActivityForm initial={a} onDone={() => setEdit(false)} />
      </Sheet>
    </div>
  );
}
