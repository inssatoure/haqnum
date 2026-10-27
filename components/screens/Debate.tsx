'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Mic, Pause, Play, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { formatBytes, formatDuration } from '@/lib/media';
import { closeInterrupted, getInterruptedRecording, pickAudioMime } from '@/lib/recorder';
import { activityAt } from '@/lib/time';
import { go, useActivities, useNow } from '../hooks';
import { useRecorder } from '../recorderStore';
import { Btn, Field, Input, Title, toast } from '../ui';
import { ActivityPicker } from './Capture';

/**
 * Mode Débat : écran noir à faible luminosité, minuteur + Stop.
 * L'écran reste allumé (Wake Lock). Sauvegarde par morceaux de 45 s.
 */
export default function Debate({ resumeId, activityId }: { resumeId?: string; activityId?: string }) {
  const rec = useRecorder();
  const acts = useActivities();
  const now = useNow();
  const [act, setAct] = useState<string | null>(activityId ?? null);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [dim, setDim] = useState(true);
  const [estimate, setEstimate] = useState<string | null>(null);
  const active = rec.phase === 'recording' || rec.phase === 'paused';
  const [cut, setCut] = useState<{ id: string; seconds: number } | null>(null);
  const resumeTarget = resumeId ?? cut?.id;

  // App rouverte directement sur cet écran après une coupure : on propose de reprendre.
  useEffect(() => {
    if (resumeId || rec.phase !== 'idle') return;
    getInterruptedRecording().then((st) => {
      if (st?.media?.status === 'enregistrement') setCut({ id: st.mediaId, seconds: st.savedSeconds });
    });
  }, [resumeId, rec.phase]);

  useEffect(() => {
    if (!act && acts.length) setAct(activityAt(acts, now)?.id ?? null);
  }, [acts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => {
      const free = (e.quota ?? 0) - (e.usage ?? 0);
      // ~64 kbit/s = 0,48 Mo par minute
      const hours = free / (0.48 * 1024 * 1024) / 60;
      setEstimate(hours > 48 ? 'plus de 48 h' : `${hours.toFixed(1)} h`);
    });
  }, []);

  // Si l'app passe en arrière-plan, on sauvegarde le morceau en cours tout de suite.
  useEffect(() => {
    const onVis = async () => {
      if (document.visibilityState === 'hidden' && rec.phase === 'recording') rec.flush();
      if (document.visibilityState === 'visible' && rec.phase !== 'idle') {
        await rec.keepAwake();
        if (rec.phase !== 'interrupted' && !rec.micAlive()) await rec.markInterrupted();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', () => rec.phase === 'recording' && rec.flush());
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [rec]);

  const media = useLiveQuery(() => (rec.state ? db().media.get(rec.state.mediaId) : undefined), [rec.state?.mediaId, rec.state?.partCount]);

  const start = async (resume?: string) => {
    setErr(null);
    try {
      const a = acts.find((x) => x.id === act);
      await rec.start({ activityId: act, title: title.trim() || a?.title || 'Enregistrement', resumeMediaId: resume });
    } catch (e: any) {
      setErr(e?.name === 'NotAllowedError' ? 'Micro refusé. Autorisez le micro : Réglages iPhone > Safari > Micro.' : e?.message ?? 'Impossible de démarrer');
    }
  };

  const stop = async () => {
    const id = await rec.stop();
    toast('Enregistrement sauvegardé');
    if (id) go(`media/${id}`);
  };

  if (rec.phase === 'interrupted') {
    return (
      <div className="pt-6">
        <Title>Enregistrement coupé</Title>
        <p className="mb-4 text-nuit-200">
          Le micro a été coupé (appel, verrouillage ou autre app). {formatDuration(rec.state?.savedSeconds ?? 0)} déjà sauvegardées.
        </p>
        <Btn big tone="rouge" className="mb-3 w-full" onClick={() => start(rec.state!.mediaId)}>
          <Mic /> Reprendre l'enregistrement
        </Btn>
        <Btn big tone="nuit" className="w-full" onClick={stop}>
          Terminer
        </Btn>
      </div>
    );
  }

  if (!active) {
    return (
      <div>
        <Title sub="L'écran reste allumé. Ne verrouillez pas l'iPhone : posez-le, écran vers le haut.">Mode Débat</Title>
        {resumeTarget && (
          <div className="mb-4 rounded-2xl border border-red-500 p-4">
            {cut && <p className="mb-1 font-semibold text-red-200">Enregistrement coupé</p>}
            <p className="mb-3 text-sm">
              Reprendre l'enregistrement interrompu{cut ? ` (${formatDuration(cut.seconds)} déjà sauvegardées)` : ''}. Les morceaux déjà enregistrés sont gardés.
            </p>
            <Btn big tone="rouge" className="w-full" onClick={() => start(resumeTarget)}>
              <Mic /> Reprendre
            </Btn>
            {cut && (
              <button className="mt-3 w-full text-center text-sm text-nuit-400 underline" onClick={async () => { await closeInterrupted(cut.id); setCut(null); }}>
                Garder tel quel et commencer un nouvel enregistrement
              </button>
            )}
          </div>
        )}
        <Field label="Activité">
          <ActivityPicker value={act} onChange={setAct} />
        </Field>
        <Field label="Titre (facultatif)">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Table ronde hacktivisme" />
        </Field>
        {err && <p className="mb-3 rounded-xl bg-red-950 p-3 text-sm text-red-200">{err}</p>}
        <button onClick={() => start()} className="mx-auto mt-4 flex h-36 w-36 flex-col items-center justify-center rounded-full bg-red-600 text-white shadow-2xl active:bg-red-700">
          <Mic size={48} />
          <span className="mt-1 font-semibold">Démarrer</span>
        </button>
        <div className="mt-6 space-y-1 text-sm text-nuit-400">
          <p>Format : {pickAudioMime() || 'par défaut du navigateur'}</p>
          {estimate && <p>Durée d'enregistrement possible avec l'espace libre : {estimate}</p>}
          <p>Si l'écran doit être verrouillé : utilisez le Dictaphone de l'iPhone, puis « Importer ».</p>
        </div>
      </div>
    );
  }

  // Écran d'enregistrement : noir, minimal, pour économiser la batterie.
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-black px-6 py-[calc(env(safe-area-inset-top)+24px)]" onClick={() => setDim(!dim)}>
      <div className={dim ? 'opacity-40' : 'opacity-100'}>
        <p className="text-center text-sm text-neutral-400">{media?.title}</p>
        <p className="mt-1 text-center text-xs text-neutral-500">
          {rec.state?.partCount ?? 0} morceaux sauvegardés · {formatBytes(media?.size_bytes ?? 0)}
          {!rec.hasWakeLock() && ' · écran : gardez-le allumé'}
        </p>
      </div>
      <div className={'flex flex-col items-center ' + (dim ? 'opacity-60' : '')}>
        <span className={rec.phase === 'recording' ? 'mb-3 h-3 w-3 animate-pulse rounded-full bg-red-600' : 'mb-3 h-3 w-3 rounded-full bg-neutral-600'} />
        <p className="font-titre text-6xl tabular-nums text-neutral-200">{formatDuration(rec.elapsed())}</p>
        <p className="mt-2 text-sm text-neutral-500">{rec.phase === 'recording' ? 'Enregistrement en cours' : 'En pause'}</p>
      </div>
      <div className="flex w-full max-w-sm items-center justify-center gap-6 pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
        {rec.phase === 'recording' ? (
          <button aria-label="Pause" onClick={() => rec.pause()} className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-800 text-neutral-200">
            <Pause />
          </button>
        ) : (
          <button aria-label="Continuer" onClick={() => rec.resume()} className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-800 text-neutral-200">
            <Play />
          </button>
        )}
        <button aria-label="Stop" onClick={stop} className="flex h-24 w-24 items-center justify-center rounded-full bg-red-700 text-white">
          <Square size={36} />
        </button>
        <span className="h-16 w-16" />
      </div>
    </div>
  );
}
