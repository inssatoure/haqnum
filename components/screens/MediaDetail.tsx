'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Mic, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { moveToActivity, saveVoiceNote } from '@/lib/capture';
import { db } from '@/lib/db';
import { fetchBlob, formatBytes, formatDuration, mediaUrl } from '@/lib/media';
import { canEdit, create, remove, update } from '@/lib/repo';
import { dateHeure } from '@/lib/time';
import { transcribeMedia } from '@/lib/ai-client';
import type { Media } from '@/lib/types';
import Comments from '../Comments';
import { go } from '../hooks';
import { MediaGrid, NotesList } from '../MediaGrid';
import { AuthorBadge, Btn, Empty, Field, H2, Input, Sheet, TextArea, useMediaUrl, toast } from '../ui';
import { ActivityPicker, VoiceNote } from './Capture';
import { TranscriptView } from '../TranscriptView';

const KIND: Record<string, string> = { photo: 'Photo', video: 'Vidéo', audio: 'Audio', voice: 'Note vocale', receipt: 'Reçu', card: 'Carte de visite' };

export default function MediaDetail({ id }: { id: string }) {
  const m = useLiveQuery(() => db().media.get(id), [id]);
  const children = useLiveQuery(async () => (await db().media.where('parent_id').equals(id).toArray()).filter((x) => !x.deleted_at), [id]) ?? [];
  const notes = useLiveQuery(async () => (await db().notes.where('media_id').equals(id).toArray()).filter((x) => !x.deleted_at), [id]) ?? [];
  const transcript = useLiveQuery(async () => (await db().transcripts.where('media_id').equals(id).toArray()).filter((t) => !t.deleted_at).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0], [id]);
  const [voice, setVoice] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  if (!m) return <Empty>Élément introuvable.</Empty>;
  const mine = canEdit(m);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm text-nuit-400">
        <AuthorBadge authorId={m.author_id} /> {KIND[m.kind]} · {dateHeure(m.captured_at)} · {m.device}
      </div>
      <h1 className="mb-3 font-titre text-xl">{m.title || m.original_name || KIND[m.kind]}</h1>
      <Viewer m={m} />
      <p className="mt-2 text-xs text-nuit-400">
        {formatBytes(m.size_bytes ?? 0)}
        {m.duration_s ? ` · ${formatDuration(m.duration_s)}` : ''}
        {m.parts.length > 1 ? ` · ${m.parts.length} morceaux` : ''}
        {m.lat != null ? ` · GPS ${m.lat.toFixed(4)}, ${m.lng?.toFixed(4)}` : ''}
        {' · '}
        {m.status === 'envoye' ? 'en ligne' : m.status === 'interrompu' ? 'enregistrement coupé' : 'sur ce téléphone, en attente d’envoi'}
        {m.time_source ? ` · heure : ${m.time_source}` : ''}
      </p>

      <Field label="Activité">
        {mine ? (
          <ActivityPicker value={m.activity_id} onChange={(a) => moveToActivity(m.id, a)} />
        ) : (
          <button className="text-left text-ocre-400 underline" onClick={() => m.activity_id && go(`activite/${m.activity_id}`)}>Voir l'activité</button>
        )}
      </Field>
      {mine && (
        <Field label="Titre">
          <Input defaultValue={m.title ?? ''} onBlur={(e) => e.target.value !== (m.title ?? '') && update('media', m.id, { title: e.target.value })} />
        </Field>
      )}

      {(m.kind === 'audio' || m.kind === 'voice' || m.kind === 'video') && (
        <>
          <H2>Transcription</H2>
          {transcript ? (
            <TranscriptView t={transcript} media={m} />
          ) : (
            <Btn
              tone="nuit"
              disabled={!!busy}
              onClick={async () => {
                setBusy('Transcription…');
                try {
                  await transcribeMedia(m.id, (s) => setBusy(s));
                  toast('Transcription terminée');
                } catch (e: any) {
                  toast(e.message);
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy ?? 'Transcrire (Groq Whisper)'}
            </Btn>
          )}
        </>
      )}

      <H2>Descriptions et notes</H2>
      <MediaGrid items={children} />
      <div className="mt-2"><NotesList notes={notes} /></div>
      <div className="mt-3 flex gap-2">
        <Btn tone="terre" onClick={() => setVoice(true)}><Mic size={18} /> Note vocale</Btn>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note écrite" />
        <Btn tone="nuit" onClick={async () => { if (!note.trim()) return; await create('notes', { body: note.trim(), media_id: m.id, activity_id: m.activity_id ?? null }); setNote(''); }}>OK</Btn>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Btn tone="ghost" onClick={() => downloadOriginal(m)}><Download size={18} /> Original</Btn>
        {mine && (
          <Btn tone="ghost" className="text-red-300" onClick={async () => { if (confirm('Supprimer cet élément ? (il reste dans l’historique)')) { await remove('media', m.id); history.back(); } }}>
            <Trash2 size={18} /> Supprimer
          </Btn>
        )}
      </div>
      <Comments table="media" id={m.id} />
      <Sheet open={voice} onClose={() => setVoice(false)} title="Note vocale">
        {voice && <VoiceNote onSaved={async (b, s) => { await saveVoiceNote(b, s, { activityId: m.activity_id ?? null, parentId: m.id }); setVoice(false); toast('Note vocale enregistrée'); }} />}
      </Sheet>
    </div>
  );
}

function Viewer({ m }: { m: Media }) {
  const first = m.parts[0]?.path;
  const url = useMediaUrl(m.kind === 'photo' || m.kind === 'receipt' || m.kind === 'card' ? first : null);
  if (m.kind === 'photo' || m.kind === 'receipt' || m.kind === 'card') {
    // eslint-disable-next-line @next/next/no-img-element
    return url ? <img src={url} alt="" className="w-full rounded-2xl" /> : <div className="h-60 rounded-2xl bg-nuit-800" />;
  }
  if (m.kind === 'video') return <VideoPlayer path={first} mediaId={m.id} />;
  return <PartsPlayer m={m} />;
}

function VideoPlayer({ path, mediaId }: { path?: string; mediaId: string }) {
  const url = useMediaUrl(path);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.mediaId === mediaId && ref.current) {
        ref.current.currentTime = d.seconds;
        void ref.current.play();
      }
    };
    window.addEventListener('media-seek', on);
    return () => window.removeEventListener('media-seek', on);
  }, [mediaId]);
  return url ? <video ref={ref} src={url} controls playsInline className="w-full rounded-2xl bg-black" /> : <div className="h-60 rounded-2xl bg-nuit-800" />;
}

/** Lecture enchaînée des morceaux d'un enregistrement Débat. */
export function PartsPlayer({ m }: { m: Media }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [i, setI] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [pendingSeek, setPendingSeek] = useState<number | null>(null);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const parts = m.parts;
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.mediaId === m.id) setSeekTo(d.seconds + Math.random() * 1e-6);
    };
    window.addEventListener('media-seek', on);
    return () => window.removeEventListener('media-seek', on);
  }, [m.id]);
  useEffect(() => {
    if (!parts[i]) return;
    mediaUrl(parts[i].path).then(setUrl);
  }, [i, parts]);
  useEffect(() => {
    if (seekTo == null) return;
    // Trouver le morceau qui contient la seconde demandée
    let acc = 0;
    for (let k = 0; k < parts.length; k++) {
      const d = parts[k].duration_s ?? 0;
      if (seekTo < acc + d || k === parts.length - 1) {
        setPendingSeek(seekTo - acc);
        if (k !== i) setI(k);
        else if (ref.current) {
          ref.current.currentTime = seekTo - acc;
          void ref.current.play();
          setPendingSeek(null);
        }
        break;
      }
      acc += d;
    }
  }, [seekTo]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!parts.length) return <Empty>Aucun morceau sauvegardé.</Empty>;
  return (
    <div className="rounded-2xl bg-nuit-900 p-3">
      <audio
        ref={ref}
        src={url ?? undefined}
        controls
        className="w-full"
        onLoadedMetadata={() => {
          if (pendingSeek != null && ref.current) {
            ref.current.currentTime = pendingSeek;
            void ref.current.play();
            setPendingSeek(null);
          }
        }}
        onEnded={() => {
          if (i < parts.length - 1) {
            setI(i + 1);
            setTimeout(() => ref.current?.play(), 300);
          }
        }}
      />
      {parts.length > 1 && (
        <p className="mt-1 text-xs text-nuit-400">
          Morceau {i + 1}/{parts.length}
          {parts[i]?.started_at ? ` · début ${dateHeure(parts[i].started_at!)}` : ''}
        </p>
      )}
    </div>
  );
}

async function downloadOriginal(m: Media) {
  for (const p of m.parts) {
    const b = await fetchBlob(p.path);
    if (!b) continue;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `${m.captured_at.slice(0, 16).replace(/[:T]/g, '-')}_${p.path.split('/').pop()}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}
