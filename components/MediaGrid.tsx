'use client';

import { Camera, FileText, Mic, Video } from 'lucide-react';
import { formatDuration } from '@/lib/media';
import { heure } from '@/lib/time';
import type { Media, Note } from '@/lib/types';
import { go } from './hooks';
import { AuthorBadge, Thumb } from './ui';

export function MediaGrid({ items }: { items: Media[] }) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((m) => (
        <button key={m.id} onClick={() => go(`media/${m.id}`)} className="relative aspect-square overflow-hidden rounded-xl bg-nuit-800 text-left">
          {m.thumb_path ? (
            <Thumb path={m.thumb_path} className="h-full w-full" />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-1 text-nuit-200">
              {m.kind === 'video' ? <Video /> : m.kind === 'photo' ? <Camera /> : m.kind === 'audio' || m.kind === 'voice' ? <Mic /> : <FileText />}
              <span className="text-xs">{formatDuration(m.duration_s)}</span>
            </span>
          )}
          {m.kind === 'video' && m.thumb_path && <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[10px]">▶ {formatDuration(m.duration_s)}</span>}
          <span className="absolute bottom-1 left-1 flex items-center gap-1">
            <AuthorBadge authorId={m.author_id} small />
            <span className="rounded bg-black/60 px-1 text-[10px]">{heure(m.captured_at)}</span>
          </span>
          {m.status === 'interrompu' && <span className="absolute right-1 top-1 rounded bg-red-600 px-1 text-[10px]">coupé</span>}
        </button>
      ))}
    </div>
  );
}

export function NotesList({ notes }: { notes: Note[] }) {
  if (!notes.length) return null;
  return (
    <div className="space-y-2">
      {notes.map((n) => (
        <div key={n.id} className="rounded-xl bg-nuit-900 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs text-nuit-400">
            <AuthorBadge authorId={n.author_id} small /> {heure(n.created_at)}
          </div>
          <p className="whitespace-pre-wrap text-sm">{n.body}</p>
        </div>
      ))}
    </div>
  );
}
