'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Bus, Camera, FileText, FlaskConical, Import, LayoutDashboard, MapPin, Mic, Sparkles, Video } from 'lucide-react';
import { IS_SANDBOX, setSandbox } from '@/lib/config';
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
  const firstName = myProfile?.short_name || myProfile?.full_name?.split(' ')[0] || '';

  const recent = useLiveQuery(async () => {
    const list = await db().media.orderBy('captured_at').reverse().limit(12).toArray();
    return list.filter((m) => !m.deleted_at && m.kind !== 'receipt');
  }, []) ?? [];

  const progress = current
    ? Math.min(1, Math.max(0, (now.getTime() - new Date(current.starts_at).getTime()) / (new Date(current.ends_at).getTime() - new Date(current.starts_at).getTime())))
    : 0;

  return (
    <div>
      <div className="mb-5 animate-apparait">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-nuit-400">
          {jourLong(now)} · {heure(now)} · Paris
        </p>
        <h1 className="mt-1.5 font-titre text-[30px] leading-tight">{firstName ? `Bonjour ${firstName}` : 'Bonjour'}</h1>
      </div>

      {/* Activité en cours */}
      <div className="relative overflow-hidden rounded-[24px] border border-ocre-500/25 bg-gradient-to-br from-ocre-500/[0.14] via-white/[0.03] to-transparent p-5 shadow-carte">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-ocre-500/10 blur-3xl" />
        <div className="flex items-center gap-2">
          {current && <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ocre-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-ocre-400" /></span>}
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ocre-400">{current ? 'En ce moment' : 'Aucune activité en cours'}</p>
        </div>
        {current ? (
          <button className="press mt-2 block w-full text-left" onClick={() => go(`activite/${current.id}`)}>
            <h2 className="font-titre text-[22px] leading-snug text-sable">{current.title}</h2>
            <div className="mt-3 flex items-center gap-3 text-[13px] text-nuit-200">
              <span className="tabular-nums">{heure(current.starts_at)}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full bg-gradient-to-r from-ocre-500 to-ocre-400" style={{ width: `${Math.round(progress * 100)}%` }} />
              </span>
              <span className="tabular-nums">{heure(current.ends_at)}</span>
            </div>
            <div className="mt-3 space-y-1.5 text-[14px] text-nuit-200">
              {current.venue && <p className="flex items-center gap-2"><MapPin size={15} className="shrink-0 text-ocre-400" /> {current.venue}{current.city ? `, ${current.city}` : ''}</p>}
              {current.transport && <p className="flex items-center gap-2"><Bus size={15} className="shrink-0 text-ocre-400" /> {current.transport}</p>}
            </div>
          </button>
        ) : (
          <p className="mt-2 text-[14px] leading-snug text-nuit-200">Vos captures seront rattachées à l'activité la plus proche. Vous pourrez corriger.</p>
        )}
        {others.length > 0 && (
          <div className="mt-4 border-t border-white/[0.08] pt-3 text-[13px] text-nuit-400">
            Aussi en cours :{' '}
            {others.map((o) => (
              <button key={o.id} className="mr-2 text-nuit-200 underline decoration-white/20 underline-offset-4" onClick={() => go(`activite/${o.id}`)}>
                {o.title}
              </button>
            ))}
          </div>
        )}
      </div>

      <H2>Capturer</H2>
      <QuickActions activityId={current?.id ?? null} />

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Card onClick={() => go(`capturer?experience=1${current ? `&activite=${current.id}` : ''}`)} className="flex flex-col gap-3">
          <IconCircle icon={Sparkles} tone="ocre" />
          <span className="text-[15px] font-semibold leading-tight">Je suis dans une expérience</span>
        </Card>
        <Card onClick={() => go(`importer${current ? `?activite=${current.id}` : ''}`)} className="flex flex-col gap-3">
          <IconCircle icon={Import} />
          <span className="text-[15px] font-semibold leading-tight">Importer<span className="block text-[13px] font-normal text-nuit-400">Dictaphone, galerie</span></span>
        </Card>
      </div>

      {next && (
        <>
          <H2>Ensuite</H2>
          <Card onClick={() => go(`activite/${next.id}`)} className="flex items-center gap-4">
            <div className="flex w-14 shrink-0 flex-col items-center rounded-2xl bg-white/[0.05] py-2 ring-1 ring-white/[0.06]">
              <span className="font-titre text-[18px] tabular-nums text-sable">{heure(next.starts_at)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-nuit-400">{jourLong(next.starts_at)}</p>
              <p className="truncate font-semibold">{next.title}</p>
              <p className="truncate text-[13px] text-nuit-400">{next.venue}{next.transport ? ` · ${next.transport}` : ''}</p>
            </div>
            <ArrowRight size={18} className="shrink-0 text-nuit-400" />
          </Card>
        </>
      )}

      <H2 right={<button className="text-[13px] font-semibold text-nuit-400" onClick={() => go('medias')}>Tout voir</button>}>Dernières captures</H2>
      {recent.length === 0 ? (
        <p className="text-[14px] text-nuit-400">Rien pour l'instant. Le bouton orange en bas sert à capturer.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {recent.map((m) => (
            <button key={m.id} onClick={() => go(`media/${m.id}`)} className="press relative aspect-square overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06]">
              {m.thumb_path ? (
                <Thumb path={m.thumb_path} className="h-full w-full" />
              ) : (
                <span className="flex h-full items-center justify-center text-nuit-400">
                  {m.kind === 'audio' || m.kind === 'voice' ? <Mic size={20} /> : m.kind === 'video' ? <Video size={20} /> : m.kind === 'photo' ? <Camera size={20} /> : <FileText size={20} />}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/60 to-transparent" />
              <span className="absolute bottom-1.5 left-1.5">
                <AuthorBadge authorId={m.author_id} small />
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-3">
        <Card onClick={() => go('tableau')} className="flex items-center gap-3">
          <IconCircle icon={LayoutDashboard} />
          <div className="flex-1">
            <p className="font-semibold">Tableau du jour</p>
            <p className="text-[13px] text-nuit-400">Qui a couvert quoi, et les trous de couverture</p>
          </div>
          <ArrowRight size={18} className="text-nuit-400" />
        </Card>
        {!IS_SANDBOX && (
          <Card onClick={() => setSandbox(true)} className="flex items-center gap-3">
            <IconCircle icon={FlaskConical} tone="ocre" />
            <div className="flex-1">
              <p className="font-semibold">Bac à sable</p>
              <p className="text-[13px] text-nuit-400">Essayer le micro, la caméra, l'IA, sans toucher à la vraie mission</p>
            </div>
            <ArrowRight size={18} className="text-nuit-400" />
          </Card>
        )}
      </div>
    </div>
  );
}
