'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Mic, PenLine, Square, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { captureFromCamera, saveVoiceNote } from '@/lib/capture';
import { db } from '@/lib/db';
import { formatDuration } from '@/lib/media';
import { currentPosition } from '@/lib/metadata';
import { QuickRecorder } from '@/lib/recorder';
import { create } from '@/lib/repo';
import { activityAt, heure, jourCourt } from '@/lib/time';
import type { Activity } from '@/lib/types';
import { go, useActivities, useNow } from '../hooks';
import { Btn, Card, Field, H2, IconCircle, Input, Select, Sheet, TextArea, Thumb, Title, toast } from '../ui';

/** Gros boutons de capture : photo, vidéo, vocal, note. */
export function QuickActions({ activityId, ficheId, contactId, onSaved }: { activityId: string | null; ficheId?: string | null; contactId?: string | null; onSaved?: (id: string, kind: string) => void }) {
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [voiceOpen, setVoiceOpen] = useState<{ parentId?: string } | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [afterMedia, setAfterMedia] = useState<string | null>(null);

  const onFile = async (f: File | undefined, kind: 'photo' | 'video') => {
    if (!f) return;
    setBusy(true);
    try {
      const id = await captureFromCamera(f, { activityId, ficheId, contactId, kind });
      toast(kind === 'photo' ? 'Photo enregistrée' : 'Vidéo enregistrée');
      setAfterMedia(id);
      onSaved?.(id, kind);
    } catch (e: any) {
      toast(e?.message ?? 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const btn = 'press flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-white/[0.05] to-white/[0.015] py-3 text-[13px] font-semibold text-sable shadow-carte disabled:opacity-50';
  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        <button className={btn} onClick={() => photoRef.current?.click()} disabled={busy}>
          <IconCircle icon={Camera} tone="ocre" /> Photo
        </button>
        <button className={btn} onClick={() => videoRef.current?.click()} disabled={busy}>
          <IconCircle icon={Video} tone="ocre" /> Vidéo
        </button>
        <button className={btn} onClick={() => setVoiceOpen({})}>
          <IconCircle icon={Mic} tone="terre" /> Vocal
        </button>
        <button className={btn} onClick={() => setNoteOpen(true)}>
          <IconCircle icon={PenLine} /> Note
        </button>
      </div>
      {busy && <p className="mt-2 text-sm text-ocre-400">Enregistrement du fichier…</p>}
      <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onFile(e.target.files?.[0], 'photo'); e.target.value = ''; }} />
      <input ref={videoRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => { onFile(e.target.files?.[0], 'video'); e.target.value = ''; }} />

      <Sheet open={!!afterMedia} onClose={() => setAfterMedia(null)} title="Décrire ce que vous voyez ?">
        <AfterMedia mediaId={afterMedia} onVoice={() => { setVoiceOpen({ parentId: afterMedia! }); setAfterMedia(null); }} onDone={() => setAfterMedia(null)} />
      </Sheet>
      <Sheet open={!!voiceOpen} onClose={() => setVoiceOpen(null)} title={voiceOpen?.parentId ? 'Note vocale sur la capture' : 'Note vocale'}>
        {voiceOpen && (
          <VoiceNote
            onSaved={async (blob, s) => {
              const id = await saveVoiceNote(blob, s, { activityId, parentId: voiceOpen.parentId, ficheId, contactId });
              toast('Note vocale enregistrée');
              onSaved?.(id, 'voice');
              setVoiceOpen(null);
            }}
          />
        )}
      </Sheet>
      <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title="Note rapide">
        <QuickNote
          onSave={async (body) => {
            const pos = await currentPosition(1500);
            const n = await create('notes', { body, activity_id: activityId, fiche_id: ficheId ?? null, media_id: null, lat: pos?.lat ?? null, lng: pos?.lng ?? null });
            toast('Note enregistrée');
            onSaved?.(n.id, 'note');
            setNoteOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}

function AfterMedia({ mediaId, onVoice, onDone }: { mediaId: string | null; onVoice: () => void; onDone: () => void }) {
  const m = useLiveQuery(() => (mediaId ? db().media.get(mediaId) : undefined), [mediaId]);
  const [text, setText] = useState('');
  if (!m) return null;
  return (
    <div>
      {m.thumb_path && <Thumb path={m.thumb_path} className="mb-3 h-40 w-full rounded-xl" />}
      <Btn big tone="terre" className="mb-3 w-full" onClick={onVoice}>
        <Mic /> Décrire à voix haute
      </Btn>
      <TextArea placeholder="… ou écrire une légende" value={text} onChange={(e) => setText(e.target.value)} rows={3} />
      <div className="mt-3 flex gap-2">
        <Btn
          className="flex-1"
          onClick={async () => {
            if (text.trim()) await create('notes', { body: text.trim(), media_id: m.id, activity_id: m.activity_id ?? null, fiche_id: m.fiche_id ?? null });
            onDone();
          }}
        >
          {text.trim() ? 'Enregistrer' : 'Plus tard'}
        </Btn>
      </div>
    </div>
  );
}

export function VoiceNote({ onSaved }: { onSaved: (b: Blob, seconds: number) => Promise<void> }) {
  const rec = useRef<QuickRecorder | null>(null);
  const [on, setOn] = useState(false);
  const [t, setT] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!on) return;
    const i = setInterval(() => setT((Date.now() - (rec.current?.startedAt ?? Date.now())) / 1000), 300);
    return () => clearInterval(i);
  }, [on]);
  useEffect(() => () => rec.current?.cancel(), []);
  return (
    <div className="flex flex-col items-center py-4">
      <p className="mb-5 font-titre text-[44px] tabular-nums text-sable">{formatDuration(t)}</p>
      {err && <p className="mb-3 text-sm text-red-300">{err}</p>}
      {!on ? (
        <button
          className="press flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-b from-[#C9654A] to-terre-500 text-sable shadow-flottant"
          aria-label="Démarrer la note vocale"
          onClick={async () => {
            try {
              rec.current = new QuickRecorder();
              await rec.current.start();
              setOn(true);
            } catch (e: any) {
              setErr("Micro refusé. Autorisez le micro dans Réglages > Safari.");
            }
          }}
        >
          <Mic size={40} />
        </button>
      ) : (
        <button
          className="rec-pulse flex h-24 w-24 items-center justify-center rounded-full bg-red-600 text-white"
          aria-label="Arrêter et enregistrer"
          onClick={async () => {
            const r = await rec.current!.stop();
            setOn(false);
            await onSaved(r.blob, r.seconds);
          }}
        >
          <Square size={36} />
        </button>
      )}
      <p className="mt-3 text-sm text-nuit-400">{on ? 'Appuyez pour arrêter et enregistrer' : 'Appuyez pour parler'}</p>
    </div>
  );
}

function QuickNote({ onSave }: { onSave: (body: string) => Promise<void> }) {
  const [body, setBody] = useState('');
  return (
    <div>
      <TextArea autoFocus value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ce que je vois, ce que j'entends, une idée…" rows={6} />
      <Btn big className="mt-3 w-full" disabled={!body.trim()} onClick={() => onSave(body.trim())}>
        Enregistrer la note
      </Btn>
    </div>
  );
}

/** Choisir l'activité de rattachement. */
export function ActivityPicker({ value, onChange, allowNone = true }: { value: string | null | undefined; onChange: (id: string | null) => void; allowNone?: boolean }) {
  const acts = useActivities();
  const byDay = new Map<string, Activity[]>();
  for (const a of acts) {
    const k = jourCourt(a.starts_at);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(a);
  }
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {allowNone && <option value="">— Sans activité —</option>}
      {[...byDay.entries()].map(([d, list]) => (
        <optgroup key={d} label={d}>
          {list.map((a) => (
            <option key={a.id} value={a.id}>
              {heure(a.starts_at)} · {a.title}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

/** Écran Capturer (et « Je suis dans une expérience »). */
export default function Capture({ experience, activityId }: { experience: boolean; activityId?: string }) {
  const now = useNow();
  const acts = useActivities();
  const [act, setAct] = useState<string | null>(activityId ?? null);
  const [ficheId, setFicheId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  useEffect(() => {
    if (!activityId && acts.length && act === null) setAct(activityAt(acts, now)?.id ?? null);
  }, [acts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const fiche = useLiveQuery(() => (ficheId ? db().fiches.get(ficheId) : undefined), [ficheId]);
  const items = useLiveQuery(async () => {
    if (!ficheId) return [];
    return (await db().media.where('fiche_id').equals(ficheId).toArray()).filter((m) => !m.deleted_at);
  }, [ficheId]) ?? [];

  if (experience && !ficheId) {
    return (
      <div>
        <Title sub="Une fiche Œuvre / Expérience s'ouvre : photos, vidéos, vocaux et notes y sont rangés ensemble.">Je suis dans une expérience</Title>
        <Field label="Nom de l'œuvre ou de l'expérience (peut rester vide)">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. TRAVERSE – L'Île des morts" />
        </Field>
        <Field label="Activité">
          <ActivityPicker value={act} onChange={setAct} />
        </Field>
        <Btn
          big
          className="w-full"
          onClick={async () => {
            const a = acts.find((x) => x.id === act);
            const pos = await currentPosition(2000);
            const f = await create('fiches', {
              type: 'oeuvre',
              title: title.trim() || `Expérience ${heure(new Date())}`,
              activity_id: act,
              data: { lieu: a?.venue ?? '', exposition: '' },
              lat: pos?.lat ?? a?.lat ?? null,
              lng: pos?.lng ?? a?.lng ?? null,
            });
            setFicheId(f.id);
          }}
        >
          Commencer
        </Btn>
      </div>
    );
  }

  return (
    <div>
      <Title sub={experience ? 'Tout ce que vous capturez ici va dans la fiche.' : 'Rattaché automatiquement à l’activité en cours.'}>
        {experience ? fiche?.title ?? 'Expérience' : 'Capturer'}
      </Title>
      {!experience && (
        <Field label="Activité">
          <ActivityPicker value={act} onChange={setAct} />
        </Field>
      )}
      <QuickActions activityId={act} ficheId={ficheId} />
      {experience && ficheId && (
        <>
          <H2>Dans cette fiche ({items.length})</H2>
          <div className="grid grid-cols-4 gap-2">
            {items.map((m) => (
              <button key={m.id} onClick={() => go(`media/${m.id}`)} className="aspect-square overflow-hidden rounded-lg bg-white/[0.05]">
                {m.thumb_path ? <Thumb path={m.thumb_path} className="h-full w-full" /> : <span className="flex h-full items-center justify-center"><Mic size={18} /></span>}
              </button>
            ))}
          </div>
          <Btn big tone="nuit" className="mt-6 w-full" onClick={() => go(`fiche/${ficheId}`)}>
            Remplir la fiche (artiste, dispositif, ressenti…)
          </Btn>
        </>
      )}
      {!experience && (
        <Card className="mt-4" onClick={() => go(`importer${act ? `?activite=${act}` : ''}`)}>
          <p className="font-semibold">Importer depuis la galerie ou le Dictaphone</p>
          <p className="text-sm text-nuit-400">Rattachement automatique par l'heure et le GPS.</p>
        </Card>
      )}
    </div>
  );
}
