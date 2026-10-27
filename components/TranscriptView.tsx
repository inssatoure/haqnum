'use client';

import { useState } from 'react';
import { diarizeTranscript, transcribeMedia } from '@/lib/ai-client';
import { formatDuration } from '@/lib/media';
import { canEdit, update } from '@/lib/repo';
import { heure } from '@/lib/time';
import type { Media, Transcript } from '@/lib/types';
import { AuthorBadge, Btn, Input, toast } from './ui';

const SPK_COLORS = ['text-ocre-400', 'text-moctar', 'text-sky-300', 'text-pink-300', 'text-lime-300', 'text-violet-300'];

export function seekMedia(mediaId: string, seconds: number) {
  window.dispatchEvent(new CustomEvent('media-seek', { detail: { mediaId, seconds } }));
}

export function TranscriptView({ t, media }: { t: Transcript; media: Media }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [rename, setRename] = useState(false);
  const mine = canEdit(t);
  const base = new Date(media.captured_at).getTime();
  const spkKeys = [...new Set(t.segments.map((s) => s.speaker).filter(Boolean) as string[])];

  if (t.status === 'erreur') {
    return (
      <div className="rounded-xl bg-red-950/50 p-3 text-sm">
        <p>Erreur : {t.error}</p>
        <Btn tone="nuit" className="mt-2" onClick={async () => { setBusy('…'); try { await transcribeMedia(media.id, setBusy); } catch (e: any) { toast(e.message); } finally { setBusy(null); } }}>{busy ?? 'Réessayer'}</Btn>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-nuit-400">
        <AuthorBadge authorId={t.author_id} small /> {t.provider} · {t.status === 'en_cours' ? 'en cours…' : `${t.segments.length} phrases`}
        {mine && t.status === 'termine' && (
          <>
            <button className="ml-auto underline" disabled={!!busy} onClick={async () => { setBusy('…'); try { await diarizeTranscript(t.id, setBusy); toast('Voix séparées'); } catch (e: any) { toast(e.message); } finally { setBusy(null); } }}>
              {busy ?? (spkKeys.length ? 'Refaire « qui parle »' : 'Séparer les voix')}
            </button>
            {spkKeys.length > 0 && <button className="underline" onClick={() => setRename(!rename)}>Nommer les voix</button>}
          </>
        )}
      </div>
      {rename && (
        <div className="mb-3 space-y-2 rounded-xl bg-nuit-900 p-3">
          {spkKeys.map((k) => (
            <div key={k} className="flex items-center gap-2">
              <span className="w-24 text-xs text-nuit-400">{k}</span>
              <Input defaultValue={t.speakers[k] ?? ''} placeholder="Nom, structure" onBlur={(e) => update('transcripts', t.id, { speakers: { ...t.speakers, [k]: e.target.value } })} />
            </div>
          ))}
        </div>
      )}
      <div className="max-h-[60vh] space-y-1.5 overflow-y-auto rounded-xl bg-nuit-900 p-3 text-sm">
        {t.segments.map((s, i) => {
          const prev = t.segments[i - 1];
          const showSpk = s.speaker && s.speaker !== prev?.speaker;
          const color = s.speaker ? SPK_COLORS[spkKeys.indexOf(s.speaker) % SPK_COLORS.length] : '';
          return (
            <p key={i}>
              <button className="mr-2 text-xs text-nuit-400 underline" onClick={() => seekMedia(media.id, s.start)} title={formatDuration(s.start)}>
                {heure(new Date(base + s.start * 1000))}
              </button>
              {showSpk && <span className={`mr-1 font-semibold ${color}`}>{t.speakers[s.speaker!] || s.speaker} :</span>}
              {s.text}
            </p>
          );
        })}
      </div>
    </div>
  );
}
