'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { db } from '@/lib/db';
import { FICHE_TYPES, type FicheField } from '@/lib/fiches';
import { currentPosition } from '@/lib/metadata';
import { canEdit, create, remove, update } from '@/lib/repo';
import type { Fiche } from '@/lib/types';
import Comments from '../Comments';
import { go } from '../hooks';
import { MediaGrid, NotesList } from '../MediaGrid';
import { AuthorBadge, Btn, cx, Empty, Field, H2, Input, Select, TextArea, Title, toast } from '../ui';
import { ActivityPicker, QuickActions } from './Capture';

export default function FicheEdit({ id, type, activityId }: { id?: string; type?: string; activityId?: string }) {
  const f = useLiveQuery(() => (id ? db().fiches.get(id) : undefined), [id]);
  const creating = useRef(false);
  // Nouvelle fiche : on la crée tout de suite pour pouvoir y attacher des médias.
  useEffect(() => {
    if (id || creating.current || !type || !FICHE_TYPES[type]) return;
    creating.current = true;
    (async () => {
      const a = activityId ? await db().activities.get(activityId) : undefined;
      const pos = await currentPosition(1500);
      const n = await create('fiches', {
        type,
        title: '',
        activity_id: activityId ?? null,
        data: type === 'lieu' ? { ville: a?.city ?? '' } : type === 'oeuvre' ? { lieu: a?.venue ?? '' } : {},
        lat: pos?.lat ?? a?.lat ?? null,
        lng: pos?.lng ?? a?.lng ?? null,
      });
      window.location.replace(`#/fiche/${n.id}`);
    })();
  }, [id, type, activityId]);
  if (!id) return <p className="text-nuit-400">Création…</p>;
  if (!f) return <Empty>Fiche introuvable.</Empty>;
  return <FicheForm key={f.id} f={f} />;
}

function FicheForm({ f }: { f: Fiche }) {
  const def = FICHE_TYPES[f.type];
  const mine = canEdit(f);
  const [title, setTitle] = useState(f.title);
  const [data, setData] = useState<Record<string, any>>(f.data ?? {});
  const [dirty, setDirty] = useState(false);
  const media = useLiveQuery(async () => (await db().media.where('fiche_id').equals(f.id).toArray()).filter((m) => !m.deleted_at), [f.id]) ?? [];
  const notes = useLiveQuery(async () => (await db().notes.where('fiche_id').equals(f.id).toArray()).filter((m) => !m.deleted_at), [f.id]) ?? [];

  const save = async () => {
    await update('fiches', f.id, { title: title.trim() || 'Sans titre', data });
    setDirty(false);
    toast('Fiche enregistrée');
  };
  // Sauvegarde automatique toutes les 5 s si modifiée (rien ne se perd).
  useEffect(() => {
    if (!dirty || !mine) return;
    const t = setTimeout(() => void update('fiches', f.id, { title: title.trim() || 'Sans titre', data }).then(() => setDirty(false)), 5000);
    return () => clearTimeout(t);
  }, [dirty, title, data, f.id, mine]);

  const groups = [...new Set(def.fields.map((x) => x.group ?? ''))];
  const setField = (k: string, v: any) => {
    setData({ ...data, [k]: v });
    setDirty(true);
  };

  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-sm text-ocre-400">
        {def.label} <AuthorBadge authorId={f.author_id} small />
        {f.data?.reference && <span className="text-xs text-nuit-400">(annoncée au programme)</span>}
      </div>
      {mine ? (
        <Field label={def.titleLabel}>
          <Input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className="font-titre text-xl" />
        </Field>
      ) : (
        <Title>{f.title}</Title>
      )}
      {mine && (
        <Field label="Activité">
          <ActivityPicker value={f.activity_id} onChange={(v) => update('fiches', f.id, { activity_id: v })} />
        </Field>
      )}
      <H2>Médias</H2>
      {mine && <QuickActions activityId={f.activity_id ?? null} ficheId={f.id} />}
      <div className="mt-3"><MediaGrid items={media} /></div>
      <div className="mt-2"><NotesList notes={notes} /></div>

      {groups.map((g) => (
        <div key={g}>
          {g && <H2>{g}</H2>}
          {def.fields.filter((x) => (x.group ?? '') === g).map((fd) => (
            <FieldInput key={fd.key} fd={fd} value={data[fd.key]} readOnly={!mine} onChange={(v) => setField(fd.key, v)} />
          ))}
        </div>
      ))}
      {mine ? (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+150px)] mt-4 flex gap-2">
          <Btn big className="flex-1" onClick={save}>{dirty ? 'Enregistrer' : 'Enregistré ✓'}</Btn>
          <Btn big tone="ghost" onClick={async () => { if (confirm('Supprimer cette fiche ?')) { await remove('fiches', f.id); go('fiches'); } }}><Trash2 size={18} /></Btn>
        </div>
      ) : (
        <p className="mt-4 text-xs text-nuit-400">{f.author_id ? 'Fiche de l’autre observateur : vous pouvez la commenter.' : 'Fiche de référence. Créez votre propre fiche pour la compléter.'}</p>
      )}
      {!mine && !f.author_id && (
        <Btn tone="nuit" className="mt-2" onClick={async () => { const n = await create('fiches', { type: f.type, title: f.title, activity_id: f.activity_id ?? null, data: { ...f.data, reference: false } }); go(`fiche/${n.id}`); }}>
          Compléter cette œuvre (ma fiche)
        </Btn>
      )}
      <Comments table="fiches" id={f.id} />
    </div>
  );
}

function FieldInput({ fd, value, onChange, readOnly }: { fd: FicheField; value: any; onChange: (v: any) => void; readOnly: boolean }) {
  if (readOnly) {
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) return null;
    return (
      <div className="mb-3">
        <p className="text-sm text-nuit-400">{fd.label}</p>
        <p className="whitespace-pre-wrap">{Array.isArray(value) ? value.join(', ') : String(value)}</p>
      </div>
    );
  }
  if (fd.kind === 'tags') {
    const arr: string[] = Array.isArray(value) ? value : value ? [String(value)] : [];
    return (
      <Field label={fd.label}>
        <div className="flex flex-wrap gap-2">
          {fd.options!.map((o) => (
            <button key={o} type="button" onClick={() => onChange(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])} className={cx('rounded-full px-3 py-1.5 text-sm', arr.includes(o) ? 'bg-ocre-500 text-nuit-950' : 'bg-white/[0.05] text-nuit-200')}>
              {o}
            </button>
          ))}
        </div>
      </Field>
    );
  }
  if (fd.kind === 'select') {
    return (
      <Field label={fd.label}>
        <Select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {fd.options!.map((o) => <option key={o}>{o}</option>)}
        </Select>
      </Field>
    );
  }
  if (fd.kind === 'long') return <Field label={fd.label}><TextArea value={value ?? ''} placeholder={fd.hint} onChange={(e) => onChange(e.target.value)} rows={3} /></Field>;
  return <Field label={fd.label}><Input value={value ?? ''} placeholder={fd.hint} onChange={(e) => onChange(e.target.value)} /></Field>;
}
