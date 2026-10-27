'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Bus, Camera, FileText, Import, MapPin, Mic, Sparkles, StickyNote, Video } from 'lucide-react';
import { db } from '@/lib/db';
import { activeActivities, activityAt, heure, jourLong, nextActivity } from '@/lib/time';
import { go, useActivities, useMe, useNow, useProfiles } from '../hooks';
import { AuthorBadge, Card, H2, IconCircle, Thumb } from '../ui';
import { QuickActions } from './Capture';

export default function Now() {
  const now = useNow(20_000);
  const acts = useActivities();
  const me = useMe();
  const current = activityAt(acts, now, 0);
  const others = activeActivities(acts, now).filter((a) => a.id !== current?.id);
  const next = nextActivity(acts, now);
  const profiles = useProfiles();
  const myProfile = me ? profiles[me.id] : undefined;

  const recent = useLiveQuery(async () => {
    const list = await db().media.orderBy('captured_at').reverse().limit(12).toArray();
    return list.filter((m) => !m.deleted_at);
  }, []) ?? [];

  return (
    <div>
      <p className="text-sm text-nuit-400">
        {jourLong(now)} · {heure(now)} (Paris)
      </p>
      <h1 className="mb-4 mt-1 font-titre text-2xl">Bonjour {myProfile?.short_name || myProfile?.full_name?.split(' ')[0] || ''}</h1>

      <Card className="border-ocre-600">
        <p className="text-xs uppercase tracking-wider text-ocre-400">{current ? 'En ce moment' : 'Aucune activité en cours'}</p>
        {current ? (
          <button className="mt-1 block w-full text-left" onClick={() => go(`activite/${current.id}`)}>
            <h2 className="font-titre text-xl leading-snug">{current.title}</h2>
            <p className="mt-1 text-sm text-nuit-200">
              {heure(current.starts_at)} – {heure(current.ends_at)}
            </p>
            {current.venue && (
              <p className="mt-2 flex items-center gap-2 text-sm text-nuit-200">
                <MapPin size={16} className="text-ocre-400" /> {current.venue}, {current.city}
              </p>
            )}
            {current.transport && (
              <p className="mt-1 flex items-center gap-2 text-sm text-nuit-200">
                <Bus size={16} className="text-ocre-400" /> {current.transport}
              </p>
            )}
          </button>
        ) : (
          <p className="mt-1 text-sm text-nuit-200">Vos captures seront rattachées à l'activité la plus proche. Vous pourrez corriger.</p>
        )}
        {others.length > 0 && (
          <div className="mt-3 border-t border-nuit-700 pt-2 text-sm text-nuit-400">
            Aussi en cours :{' '}
            {others.map((o) => (
              <button key={o.id} className="mr-2 underline" onClick={() => go(`activite/${o.id}`)}>
                {o.title}
              </button>
            ))}
          </div>
        )}
      </Card>

      <H2>Capturer</H2>
      <QuickActions activityId={current?.id ?? null} />

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Card onClick={() => go(`capturer?experience=1${current ? `&activite=${current.id}` : ''}`)} className="flex items-center gap-3">
          <IconCircle icon={Sparkles} tone="ocre" />
          <span className="font-semibold leading-tight">Je suis dans une expérience</span>
        </Card>
        <Card onClick={() => go(`importer${current ? `?activite=${current.id}` : ''}`)} className="flex items-center gap-3">
          <IconCircle icon={Import} />
          <span className="font-semibold leading-tight">Importer (Dictaphone, galerie)</span>
        </Card>
      </div>

      {next && (
        <>
          <H2>Ensuite</H2>
          <Card onClick={() => go(`activite/${next.id}`)}>
            <p className="text-sm text-ocre-400">
              {jourLong(next.starts_at)} · {heure(next.starts_at)}
            </p>
            <p className="mt-1 font-semibold">{next.title}</p>
            <p className="mt-1 flex items-center gap-2 text-sm text-nuit-400">
              <MapPin size={14} /> {next.venue}
            </p>
            {next.transport && (
              <p className="mt-1 flex items-center gap-2 text-sm text-nuit-400">
                <Bus size={14} /> {next.transport}
              </p>
            )}
          </Card>
        </>
      )}

      <H2 right={<button className="text-sm text-nuit-400 underline" onClick={() => go('medias')}>Tout voir</button>}>Dernières captures</H2>
      {recent.length === 0 ? (
        <p className="text-sm text-nuit-400">Rien pour l'instant.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {recent.map((m) => (
            <button key={m.id} onClick={() => go(`media/${m.id}`)} className="relative aspect-square overflow-hidden rounded-xl bg-nuit-800">
              {m.thumb_path ? (
                <Thumb path={m.thumb_path} className="h-full w-full" />
              ) : (
                <span className="flex h-full items-center justify-center text-nuit-400">
                  {m.kind === 'audio' || m.kind === 'voice' ? <Mic /> : m.kind === 'video' ? <Video /> : m.kind === 'photo' ? <Camera /> : <FileText />}
                </span>
              )}
              <span className="absolute bottom-1 left-1">
                <AuthorBadge authorId={m.author_id} small />
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="h-6" />
      <Card onClick={() => go('tableau')} className="flex items-center gap-3">
        <IconCircle icon={StickyNote} />
        <div>
          <p className="font-semibold">Tableau du jour</p>
          <p className="text-sm text-nuit-400">Qui a couvert quoi, et les trous de couverture</p>
        </div>
      </Card>
    </div>
  );
}
