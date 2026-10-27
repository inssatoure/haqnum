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

type Tone = 'nuit' | 'ocre' | 'terre' | 'moctar' | 'issa' | 'rouge';

/** Icône dans un cercle (teinte douce, pas de couleur criarde). */
export function IconCircle({ icon: Icon, tone = 'nuit', size = 'md' }: { icon: any; tone?: Tone; size?: 'sm' | 'md' | 'lg' }) {
  const tones: Record<Tone, string> = {
    nuit: 'bg-white/[0.06] text-nuit-200 ring-1 ring-white/[0.06]',
    ocre: 'bg-ocre-500/15 text-ocre-400 ring-1 ring-ocre-500/25',
    terre: 'bg-terre-500/15 text-[#E58C6B] ring-1 ring-terre-500/30',
    moctar: 'bg-moctar/15 text-moctar ring-1 ring-moctar/30',
    issa: 'bg-issa/15 text-issa ring-1 ring-issa/30',
    rouge: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30',
  };
  const sizes = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-12 w-12' };
  const isz = { sm: 15, md: 18, lg: 22 };
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full', tones[tone], sizes[size])}>
      <Icon size={isz[size]} strokeWidth={1.75} />
    </span>
  );
}

export function Btn({
  children, onClick, tone = 'ocre', className, disabled, type = 'button', big,
}: { children: ReactNode; onClick?: () => void; tone?: 'ocre' | 'nuit' | 'terre' | 'ghost' | 'rouge'; className?: string; disabled?: boolean; type?: 'button' | 'submit'; big?: boolean }) {
  const tones = {
    ocre: 'bg-gradient-to-b from-ocre-400 to-ocre-500 text-nuit-950 shadow-[0_1px_0_rgba(255,255,255,0.35)_inset,0_8px_20px_-10px_rgba(207,143,69,0.8)]',
    nuit: 'bg-white/[0.06] text-sable ring-1 ring-white/[0.08] hover:bg-white/[0.09]',
    terre: 'bg-gradient-to-b from-[#C9654A] to-terre-500 text-sable shadow-[0_1px_0_rgba(255,255,255,0.2)_inset]',
    rouge: 'bg-gradient-to-b from-red-500 to-red-600 text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset]',
    ghost: 'bg-transparent text-nuit-200 ring-1 ring-white/10 hover:bg-white/[0.04]',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'press inline-flex items-center justify-center gap-2 rounded-2xl font-semibold tracking-[0.01em] disabled:pointer-events-none disabled:opacity-40',
        big ? 'min-h-[54px] px-5 text-[17px]' : 'min-h-[44px] px-4 text-[15px]',
        tones[tone],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cx(
        'rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-4 shadow-carte',
        onClick && 'press cursor-pointer active:bg-white/[0.06]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5 animate-apparait">
      <h1 className="font-titre text-[28px] leading-[1.15] text-sable">{children}</h1>
      {sub && <p className="mt-1.5 text-[15px] leading-snug text-nuit-400">{sub}</p>}
    </div>
  );
}

/** Titre de section : petite capitale espacée + filet, style éditorial. */
export function H2({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-center gap-3">
      <h2 className="shrink-0 font-corps text-[12px] font-bold uppercase tracking-[0.16em] text-nuit-400">{children}</h2>
      <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
      {right}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-center text-sm text-nuit-400">{children}</p>;
}

export function colorOf(p?: Profile | null): 'issa' | 'moctar' | 'nuit' {
  if (!p) return 'nuit';
  if (p.color === 'issa' || p.color === 'moctar') return p.color;
  const n = (p.short_name || p.full_name || '').toLowerCase();
  if (n.startsWith('issa')) return 'issa';
  if (n.startsWith('moctar')) return 'moctar';
  return 'nuit';
}

/** Badge de l'auteur : pastille de couleur + prénom. */
export function AuthorBadge({ authorId, small }: { authorId?: string | null; small?: boolean }) {
  const profiles = useProfiles();
  const size = small ? 'h-[20px] px-2 text-[11px]' : 'h-6 px-2.5 text-xs';
  if (!authorId) return <span className={cx('inline-flex items-center rounded-full bg-white/[0.07] font-semibold text-nuit-200 backdrop-blur', size)}>Officiel</span>;
  const p = profiles[authorId];
  const c = colorOf(p);
  const name = p?.short_name || p?.full_name?.split(' ')[0] || 'Observateur';
  const cls = c === 'issa' ? 'bg-issa/15 text-issa ring-issa/30' : c === 'moctar' ? 'bg-moctar/15 text-moctar ring-moctar/30' : 'bg-white/[0.07] text-nuit-200 ring-white/10';
  const dot = c === 'issa' ? 'bg-issa' : c === 'moctar' ? 'bg-moctar' : 'bg-nuit-400';
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 backdrop-blur', size, cls)}>
      <span className={cx('h-1.5 w-1.5 rounded-full', dot)} />
      {name}
    </span>
  );
}

export function AuthorFilterBar() {
  const { value, set } = useAuthorFilter();
  const me = useMe();
  const profiles = useProfiles();
  const others = Object.values(profiles).filter((p) => p.id !== me?.id);
  const otherName = others.length === 1 ? others[0].short_name || others[0].full_name?.split(' ')[0] : null;
  const opts: [AuthorFilter, string][] = [
    ['tout', 'Tout'],
    ['moi', 'Mon travail'],
    ['autres', otherName ? `Travail de ${otherName}` : 'Les autres'],
  ];
  return (
    <div className="mb-4 flex gap-1 rounded-2xl bg-white/[0.04] p-1 ring-1 ring-white/[0.06]">
      {opts.map(([k, l]) => (
        <button
          key={k}
          onClick={() => set(k)}
          className={cx('press flex-1 rounded-xl px-2 py-2 text-[13px] font-semibold', value === k ? 'bg-white/[0.1] text-sable shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]' : 'text-nuit-400')}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** Rangée de « pilules » (jours, types…) défilant horizontalement. */
export function Pills<T extends string>({ items, value, onChange }: { items: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
      {items.map(([k, l]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={cx(
            'press shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold ring-1',
            k === value ? 'bg-sable text-nuit-950 ring-sable' : 'bg-white/[0.04] text-nuit-200 ring-white/[0.08]',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex animate-fondu items-end justify-center bg-black/60 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-xl animate-monte overflow-y-auto rounded-t-[28px] border-t border-white/[0.08] bg-nuit-900 px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2 shadow-flottant"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-titre text-[21px] text-sable">{title}</h2>
          <button onClick={onClose} aria-label="Fermer" className="press rounded-full bg-white/[0.06] p-2 text-nuit-200 ring-1 ring-white/[0.08]">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-[13px] font-semibold text-nuit-400">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  'w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[16px] text-sable placeholder:text-nuit-600 transition focus:border-ocre-500/60 focus:bg-white/[0.05] focus:outline-none focus:ring-4 focus:ring-ocre-500/10';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...props} className={cx(inputCls, 'leading-relaxed', props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, 'appearance-none bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10', props.className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238592AB' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", ...props.style }} />;
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
  const [loaded, setLoaded] = useState(false);
  if (!url) return <div className={cx('animate-pulse bg-white/[0.04]', className)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} onLoad={() => setLoaded(true)} className={cx('object-cover transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0', className)} />;
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+12px)] z-[60] -translate-x-1/2 animate-apparait rounded-full bg-sable px-4 py-2.5 text-sm font-semibold text-nuit-950 shadow-flottant">
      {msg}
    </div>
  );
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
