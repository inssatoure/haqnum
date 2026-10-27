'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Plus, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { ACTIVITY_KINDS } from '@/lib/config';
import { db } from '@/lib/db';
import { parseCsvActivities, parseIcs } from '@/lib/importers';
import { create, update } from '@/lib/repo';
import { dayKey, heure, isoToParisInputs, jourPill, parisToIso } from '@/lib/time';
import type { Activity } from '@/lib/types';
import { go, matchAuthor, useActivities, useAuthorFilter, useMe, useNow } from '../hooks';
import { AuthorBadge, AuthorFilterBar, Btn, cx, Field, Input, Select, Sheet, TextArea, Title, toast } from '../ui';

export default function Programme() {
  const acts = useActivities();
  const me = useMe();
  const now = useNow();
  const { value: filter } = useAuthorFilter();
  const days = useMemo(() => [...new Set(acts.map((a) => dayKey(a.starts_at)))].sort(), [acts]);
  const today = dayKey(now);
  const [day, setDay] = useState<string>(days.includes(today) ? today : days[0] ?? today);
  const [edit, setEdit] = useState<Partial<Activity> | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const assignments = useLiveQuery(async () => (await db().assignments.toArray()).filter((a) => !a.deleted_at), []) ?? [];
  const counts = useLiveQuery(async () => {
    const m: Record<string, Record<string, number>> = {};
    const add = (actId: string | null | undefined, author: string | null) => {
      if (!actId || !author) return;
      m[actId] ??= {};
      m[actId][author] = (m[actId][author] ?? 0) + 1;
    };
    (await db().media.toArray()).forEach((x) => !x.deleted_at && add(x.activity_id, x.author_id));
    (await db().notes.toArray()).forEach((x) => !x.deleted_at && add(x.activity_id, x.author_id));
    return m;
  }, []) ?? {};

  const list = acts.filter((a) => dayKey(a.starts_at) === (days.includes(day) ? day : days[0]));

  const toggleGo = async (a: Activity) => {
    const mine = assignments.find((x) => x.activity_id === a.id && x.author_id === me?.id);
    if (mine) await update('assignments', mine.id, { deleted_at: new Date().toISOString() });
    else await create('assignments', { activity_id: a.id });
  };

  return (
    <div>
      <Title sub="Heure de Paris. « J'y vais » pour se répartir les sessions.">Programme</Title>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {days.map((d) => (
          <button key={d} onClick={() => setDay(d)} className={cx('shrink-0 rounded-full px-4 py-2 text-sm font-semibold', d === day ? 'bg-ocre-500 text-nuit-950' : 'bg-white/[0.03] text-nuit-200', d === today && d !== day && 'ring-1 ring-ocre-500')}>
            {jourPill(d)}
          </button>
        ))}
      </div>
      <AuthorFilterBar />
      <div className="space-y-2">
        {list.map((a) => {
          const isNow = new Date(a.starts_at) <= now && new Date(a.ends_at) > now;
          const goers = assignments.filter((x) => x.activity_id === a.id);
          const iGo = goers.some((x) => x.author_id === me?.id);
          const c = counts[a.id] ?? {};
          const authors = Object.keys(c).filter((k) => matchAuthor(k, filter, me?.id));
          if (filter !== 'tout' && !authors.length && !goers.some((g) => matchAuthor(g.author_id, filter, me?.id))) return null;
          return (
            <div key={a.id} className={cx('rounded-2xl border bg-white/[0.03] p-3', isNow ? 'border-ocre-500' : 'border-white/[0.07]')}>
              <button className="block w-full text-left" onClick={() => go(`activite/${a.id}`)}>
                <div className="flex items-baseline gap-2">
                  <span className="w-24 shrink-0 text-sm font-semibold text-ocre-400">
                    {heure(a.starts_at)}–{heure(a.ends_at)}
                  </span>
                  <span className="font-semibold leading-snug">{a.title}</span>
                </div>
                <p className="mt-0.5 pl-[6.5rem] text-xs text-nuit-400">
                  {a.venue}
                  {a.kind ? ` · ${ACTIVITY_KINDS[a.kind] ?? a.kind}` : ''}
                  {a.author_id ? ' · ajouté' : ''}
                </p>
              </button>
              <div className="mt-2 flex flex-wrap items-center gap-2 pl-[6.5rem]">
                {goers.map((g) => (
                  <span key={g.id} className="flex items-center gap-1 text-xs text-nuit-200">
                    <AuthorBadge authorId={g.author_id} small /> y va
                  </span>
                ))}
                {authors.map((k) => (
                  <span key={k} className="flex items-center gap-1 text-xs text-nuit-400">
                    <AuthorBadge authorId={k} small /> {c[k]} capture(s)
                  </span>
                ))}
                {a.kind !== 'transport' && (
                  <button onClick={() => toggleGo(a)} className={cx('ml-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold', iGo ? 'bg-moctar/20 text-moctar' : 'bg-white/[0.08] text-sable')}>
                    {iGo && <Check size={14} />} J'y vais
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2">
        <Btn tone="nuit" onClick={() => setEdit({ starts_at: parisToIso(day, '10:00'), ends_at: parisToIso(day, '11:00'), kind: 'rdv' })}>
          <Plus size={18} /> Ajouter
        </Btn>
        <Btn tone="nuit" onClick={() => setImportOpen(true)}>
          <Upload size={18} /> CSV / ICS
        </Btn>
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Modifier' : 'Nouvelle activité'}>
        {edit && <ActivityForm initial={edit} onDone={() => setEdit(null)} />}
      </Sheet>
      <Sheet open={importOpen} onClose={() => setImportOpen(false)} title="Importer des activités">
        <ImportActivities onDone={() => setImportOpen(false)} />
      </Sheet>
    </div>
  );
}

export function ActivityForm({ initial, onDone }: { initial: Partial<Activity>; onDone: () => void }) {
  const s = isoToParisInputs(initial.starts_at ?? new Date().toISOString());
  const e = isoToParisInputs(initial.ends_at ?? new Date().toISOString());
  const [f, setF] = useState({
    title: initial.title ?? '',
    kind: initial.kind ?? 'rdv',
    date: s.date,
    start: s.time,
    end: e.time,
    venue: initial.venue ?? '',
    city: initial.city ?? '',
    transport: initial.transport ?? '',
    description: initial.description ?? '',
  });
  const set = (k: keyof typeof f) => (ev: any) => setF({ ...f, [k]: ev.target.value });
  return (
    <form
      onSubmit={async (ev) => {
        ev.preventDefault();
        const row = {
          title: f.title.trim(),
          kind: f.kind,
          starts_at: parisToIso(f.date, f.start),
          ends_at: parisToIso(f.date, f.end),
          venue: f.venue || null,
          city: f.city || null,
          transport: f.transport || null,
          description: f.description || null,
        };
        try {
          if (initial.id) await update('activities', initial.id, row);
          else await create('activities', { ...row, source: 'perso' });
          toast('Activité enregistrée');
          onDone();
        } catch (er: any) {
          toast(er.message);
        }
      }}
    >
      <Field label="Titre"><Input required value={f.title} onChange={set('title')} /></Field>
      <Field label="Type">
        <Select value={f.kind} onChange={set('kind')}>
          {Object.entries(ACTIVITY_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Jour"><Input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Début"><Input type="time" value={f.start} onChange={set('start')} /></Field>
        <Field label="Fin"><Input type="time" value={f.end} onChange={set('end')} /></Field>
      </div>
      <Field label="Lieu"><Input value={f.venue} onChange={set('venue')} /></Field>
      <Field label="Ville"><Input value={f.city} onChange={set('city')} /></Field>
      <Field label="Transport / bus"><Input value={f.transport} onChange={set('transport')} /></Field>
      <Field label="Description"><TextArea value={f.description} onChange={set('description')} rows={3} /></Field>
      <Btn type="submit" big className="w-full">Enregistrer</Btn>
    </form>
  );
}

function ImportActivities({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <p className="mb-3 text-sm text-nuit-200">
        ICS : export d'agenda (Swapcard, Google, Apple). CSV : colonnes <code>titre;date;debut;fin;lieu;ville</code> (date AAAA-MM-JJ, heures HH:MM, heure de Paris).
      </p>
      <Btn big className="w-full" onClick={() => ref.current?.click()}>Choisir un fichier</Btn>
      {msg && <p className="mt-3 text-sm text-ocre-400">{msg}</p>}
      <input
        ref={ref}
        type="file"
        accept=".ics,.csv,text/calendar,text/csv"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const text = await file.text();
          const rows = /\.ics$/i.test(file.name) || text.includes('BEGIN:VCALENDAR') ? parseIcs(text) : parseCsvActivities(text);
          for (const r of rows) await create('activities', { ...r, source: /\.ics$/i.test(file.name) ? 'ics' : 'csv' });
          setMsg(`${rows.length} activité(s) ajoutée(s).`);
          toast(`${rows.length} activité(s) importée(s)`);
          setTimeout(onDone, 800);
        }}
      />
    </div>
  );
}
