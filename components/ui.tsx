'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { db } from '@/lib/db';
import { mediaUrl } from '@/lib/media';
import type { Profile } from '@/lib/types';
import { useAuthorFilter, useMe, useProfiles, type AuthorFilter } from './hooks';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function IconCircle({ icon: Icon, tone = 'nuit', size = 'md' }: { icon: any; tone?: 'nuit' | 'ocre' | 'terre' | 'moctar' | 'issa' | 'rouge'; size?: 'sm' | 'md' | 'lg' }) {
  const tones: Record<string, string> = {
    nuit: 'bg-nuit-700 text-sable',
    ocre: 'bg-ocre-500 text-nuit-950',
    terre: 'bg-terre-500 text-sable',
    moctar: 'bg-moctar text-nuit-950',
    issa: 'bg-issa text-nuit-950',
    rouge: 'bg-red-600 text-white',
  };
  const sizes = { sm: 'h-8 w-8', md: 'h-11 w-11', lg: 'h-14 w-14' };
  const isz = { sm: 16, md: 20, lg: 26 };
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full', tones[tone], sizes[size])}>
      <Icon size={isz[size]} strokeWidth={2} />
    </span>
  );
}

export function Btn({
  children, onClick, tone = 'ocre', className, disabled, type = 'button', big,
}: { children: ReactNode; onClick?: () => void; tone?: 'ocre' | 'nuit' | 'terre' | 'ghost' | 'rouge'; className?: string; disabled?: boolean; type?: 'button' | 'submit'; big?: boolean }) {
  const tones = {
    ocre: 'bg-ocre-500 text-nuit-950 active:bg-ocre-600',
    nuit: 'bg-nuit-700 text-sable active:bg-nuit-600',
    terre: 'bg-terre-500 text-sable active:bg-terre-600',
    rouge: 'bg-red-600 text-white active:bg-red-700',
    ghost: 'bg-transparent text-sable border border-nuit-600 active:bg-nuit-800',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx('inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition disabled:opacity-40', big ? 'min-h-[56px] px-5 text-lg' : 'min-h-[44px] px-4 text-base', tones[tone], className)}
    >
      {children}
    </button>
  );
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cx('rounded-2xl border border-nuit-700 bg-nuit-900 p-4', onClick && 'cursor-pointer active:bg-nuit-800', className)}>
      {children}
    </div>
  );
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="font-titre text-2xl text-sable">{children}</h1>
      {sub && <p className="mt-1 text-sm text-nuit-400">{sub}</p>}
    </div>
  );
}

export function H2({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between">
      <h2 className="font-titre text-lg text-ocre-400">{children}</h2>
      {right}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-nuit-700 p-4 text-sm text-nuit-400">{children}</p>;
}

export function colorOf(p?: Profile | null): 'issa' | 'moctar' | 'nuit' {
  if (!p) return 'nuit';
  if (p.color === 'issa' || p.color === 'moctar') return p.color;
  const n = (p.short_name || p.full_name || '').toLowerCase();
  if (n.startsWith('issa')) return 'issa';
  if (n.startsWith('moctar')) return 'moctar';
  return 'nuit';
}

/** Badge de l'auteur : couleur propre à chaque observateur. */
export function AuthorBadge({ authorId, small }: { authorId?: string | null; small?: boolean }) {
  const profiles = useProfiles();
  if (!authorId) return <span className={cx('rounded-full bg-nuit-700 font-semibold text-nuit-200', small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs')}>Officiel</span>;
  const p = profiles[authorId];
  const c = colorOf(p);
  const name = p?.short_name || p?.full_name?.split(' ')[0] || 'Observateur';
  const cls = c === 'issa' ? 'bg-issa text-nuit-950' : c === 'moctar' ? 'bg-moctar text-nuit-950' : 'bg-nuit-600 text-sable';
  return <span className={cx('rounded-full font-semibold', cls, small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs')}>{name}</span>;
}

export function AuthorFilterBar() {
  const { value, set } = useAuthorFilter();
  const me = useMe();
  const profiles = useProfiles();
  const others = Object.values(profiles).filter((p) => p.id !== me?.id);
  const otherName = others.length === 1 ? others[0].short_name || others[0].full_name?.split(' ')[0] : 'des autres';
  const opts: [AuthorFilter, string][] = [
    ['tout', 'Tout'],
    ['moi', 'Mon travail'],
    ['autres', `Travail ${otherName && others.length === 1 ? `de ${otherName}` : 'des autres'}`],
  ];
  return (
    <div className="mb-3 flex gap-1 rounded-2xl bg-nuit-900 p-1">
      {opts.map(([k, l]) => (
        <button key={k} onClick={() => set(k)} className={cx('flex-1 rounded-xl px-2 py-2 text-sm font-semibold', value === k ? 'bg-nuit-700 text-sable' : 'text-nuit-400')}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-nuit-900 p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-titre text-xl text-sable">{title}</h2>
          <button onClick={onClose} aria-label="Fermer" className="rounded-full bg-nuit-700 p-2 text-sable">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm text-nuit-400">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = 'w-full rounded-xl border border-nuit-600 bg-nuit-950 px-3 py-3 text-base text-sable placeholder:text-nuit-600 focus:border-ocre-500 focus:outline-none';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...props} className={cx(inputCls, props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, props.className)} />;
}

/** Image / vidéo à partir d'un chemin de stockage (local ou serveur). */
export function useMediaUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    mediaUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

export function Thumb({ path, className, alt = '' }: { path?: string | null; className?: string; alt?: string }) {
  const url = useMediaUrl(path);
  if (!url) return <div className={cx('bg-nuit-800', className)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={cx('object-cover', className)} />;
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+12px)] z-[60] -translate-x-1/2 rounded-full bg-ocre-500 px-4 py-2 text-sm font-semibold text-nuit-950 shadow-lg">{msg}</div>;
}

let toastFn: (m: string) => void = () => {};
export function toast(m: string) {
  toastFn(m);
}
export function useToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: any;
    toastFn = (m) => {
      setMsg(m);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), 2600);
    };
  }, []);
  return msg;
}

export function useCommentsCount(targetId: string) {
  return useLiveQuery(() => db().comments.where('target_id').equals(targetId).filter((c) => !c.deleted_at).count(), [targetId]) ?? 0;
}
