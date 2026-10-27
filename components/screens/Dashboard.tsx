'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { db } from '@/lib/db';
import { dayKey, heure, jourLong } from '@/lib/time';
import { AiPanel } from '../AiPanel';
import { go, useActivities, useNow, useProfiles } from '../hooks';
import { AuthorBadge, colorOf, cx, Title } from '../ui';

/** Tableau du jour : pour chaque activité, ce que chacun a capturé + trous de couverture. */
export default function Dashboard() {
  const acts = useActivities();
  const now = useNow();
  const profiles = useProfiles();
  const days = useMemo(() => [...new Set(acts.map((a) => dayKey(a.starts_at)))].sort(), [acts]);
  const [day, setDay] = useState(days.includes(dayKey(now)) ? dayKey(now) : days[0]);
  const d = day ?? days[0];

  const stats = useLiveQuery(async () => {
    const m: Record<string, Record<string, { photo: number; video: number; audio: number; note: number; fiche: number; contact: number; minutes: number }>> = {};
    const bump = (act: string | null | undefined, author: string | null, k: 'photo' | 'video' | 'audio' | 'note' | 'fiche' | 'contact', minutes = 0) => {
      if (!act || !author) return;
      m[act] ??= {};
      m[act][author] ??= { photo: 0, video: 0, audio: 0, note: 0, fiche: 0, contact: 0, minutes: 0 };
      m[act][author][k]++;
      m[act][author].minutes += minutes;
    };
    for (const x of await db().media.toArray()) {
      if (x.deleted_at) continue;
      const k = x.kind === 'photo' ? 'photo' : x.kind === 'video' ? 'video' : x.kind === 'audio' || x.kind === 'voice' ? 'audio' : null;
      if (k) bump(x.activity_id, x.author_id, k, k === 'audio' ? (x.duration_s ?? 0) / 60 : 0);
    }
    for (const x of await db().notes.toArray()) !x.deleted_at && bump(x.activity_id, x.author_id, 'note');
    for (const x of await db().fiches.toArray()) !x.deleted_at && bump(x.activity_id, x.author_id, 'fiche');
    for (const x of await db().contacts.toArray()) !x.deleted_at && bump(x.activity_id, x.author_id, 'contact');
    const goers: Record<string, string[]> = {};
    for (const g of await db().assignments.toArray()) if (!g.deleted_at) (goers[g.activity_id] ??= []).push(g.author_id!);
    return { m, goers };
  }, []);

  const list = acts.filter((a) => dayKey(a.starts_at) === d && a.kind !== 'transport');
  const holes = list.filter((a) => new Date(a.ends_at) < now && !Object.keys(stats?.m[a.id] ?? {}).length);

  return (
    <div>
      <Title sub="Qui a couvert quoi. Répartissez-vous les sessions parallèles.">Tableau du jour</Title>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        {days.map((k) => (
          <button key={k} onClick={() => setDay(k)} className={cx('shrink-0 rounded-full px-4 py-2 text-sm font-semibold', k === d ? 'bg-ocre-500 text-nuit-950' : 'bg-nuit-900 text-nuit-200')}>
            {jourLong(k + 'T12:00:00Z')}
          </button>
        ))}
      </div>
      {holes.length > 0 && (
        <div className="mb-3 flex gap-3 rounded-2xl border border-terre-500 bg-terre-600/20 p-3 text-sm">
          <AlertTriangle className="shrink-0 text-terre-500" />
          <div>
            <p className="font-semibold">Trous de couverture : {holes.length}</p>
            <p className="text-nuit-200">{holes.map((h) => h.title).join(' · ')}</p>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {list.map((a) => {
          const per = stats?.m[a.id] ?? {};
          const goers = stats?.goers[a.id] ?? [];
          const past = new Date(a.ends_at) < now;
          const empty = !Object.keys(per).length;
          return (
            <button key={a.id} onClick={() => go(`activite/${a.id}`)} className={cx('block w-full rounded-2xl border bg-nuit-900 p-3 text-left', empty && past ? 'border-terre-500' : 'border-nuit-700')}>
              <p className="text-sm text-ocre-400">{heure(a.starts_at)}–{heure(a.ends_at)}</p>
              <p className="font-semibold">{a.title}</p>
              {empty ? (
                <p className="mt-1 text-sm text-nuit-400">
                  {past ? 'Personne n’a rien capturé.' : goers.length ? 'Prévu : ' : 'Personne n’est inscrit.'}
                  {!past && goers.map((g) => <span key={g} className="ml-1"><AuthorBadge authorId={g} small /></span>)}
                </p>
              ) : (
                <div className="mt-2 space-y-1">
                  {Object.entries(per).map(([author, s]) => {
                    const c = colorOf(profiles[author]);
                    return (
                      <div key={author} className="flex items-center gap-2 text-xs">
                        <AuthorBadge authorId={author} small />
                        <span className={c === 'moctar' ? 'text-moctar' : c === 'issa' ? 'text-issa' : 'text-nuit-200'}>
                          {[s.photo && `${s.photo} photo(s)`, s.video && `${s.video} vidéo(s)`, s.audio && `${s.audio} audio (${Math.round(s.minutes)} min)`, s.note && `${s.note} note(s)`, s.fiche && `${s.fiche} fiche(s)`, s.contact && `${s.contact} contact(s)`].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    );
                  })}
                  {Object.keys(per).length >= 2 && <p className="text-[11px] text-ocre-400">Couvert par les deux : synthèse commune possible</p>}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {d && <AiPanelDay day={d} />}
    </div>
  );
}

function AiPanelDay({ day }: { day: string }) {
  return <AiPanel day={day} />;
}
