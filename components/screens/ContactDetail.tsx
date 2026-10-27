'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Mail, Phone, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { readBusinessCard } from '@/lib/ai-client';
import { saveMediaFile } from '@/lib/capture';
import { CONTACT_STATUS, PROJECTS } from '@/lib/config';
import { db } from '@/lib/db';
import { imageThumb } from '@/lib/media';
import { canEdit, create, remove, update } from '@/lib/repo';
import { activityAt } from '@/lib/time';
import type { Contact } from '@/lib/types';
import Comments from '../Comments';
import { go, useActivities } from '../hooks';
import { MediaGrid } from '../MediaGrid';
import { AuthorBadge, Btn, cx, Field, H2, Input, Select, TextArea, Title, toast } from '../ui';
import { ActivityPicker, QuickActions } from './Capture';

const EMPTY = { name: '', organization: '', role: '', country: '', email: '', phone: '', website: '', linkedin: '', swapcard: '', status: 'a_relancer', projects: [] as string[], activity_id: null as string | null, notes: '' };

export default function ContactDetail({ id }: { id?: string }) {
  const c = useLiveQuery(() => (id ? db().contacts.get(id) : undefined), [id]);
  const media = useLiveQuery(async () => (id ? (await db().media.where('contact_id').equals(id).toArray()).filter((m) => !m.deleted_at) : []), [id]) ?? [];
  const acts = useActivities();
  if (id && !c) return <p className="text-nuit-400">Chargement…</p>;
  if (c && !canEdit(c)) return <ReadOnly c={c} media={media} />;
  return <ContactForm key={c?.id ?? 'new'} c={c} defaultActivity={activityAt(acts, new Date())?.id ?? null} media={media} />;
}

function ContactForm({ c, defaultActivity, media }: { c?: Contact; defaultActivity: string | null; media: any[] }) {
  const [f, setF] = useState(() => (c ? { ...EMPTY, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ''])), projects: c.projects ?? [], activity_id: c.activity_id ?? null } : { ...EMPTY, activity_id: defaultActivity }));
  const [busy, setBusy] = useState<string | null>(null);
  const cardRef = useRef<HTMLInputElement>(null);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.name.trim()) return toast('Le nom est obligatoire');
    const row = {
      name: f.name.trim(), organization: f.organization || null, role: f.role || null, country: f.country || null, email: f.email || null, phone: f.phone || null,
      website: f.website || null, linkedin: f.linkedin || null, swapcard: f.swapcard || null, status: f.status, projects: f.projects, activity_id: f.activity_id, notes: f.notes || null,
    };
    if (c) await update('contacts', c.id, row);
    else {
      const n = await create('contacts', row);
      go(`contact/${n.id}`);
    }
    toast('Contact enregistré');
  };

  const onCard = async (file?: File) => {
    if (!file) return;
    setBusy('Lecture de la carte…');
    try {
      let contactId = c?.id;
      if (!contactId) {
        const n = await create('contacts', { name: f.name || 'Carte de visite', status: 'a_relancer', projects: [], activity_id: f.activity_id });
        contactId = n.id;
      }
      await saveMediaFile(file, { kind: 'card', source: 'camera', contactId, activityId: f.activity_id });
      const small = (await imageThumb(file, 1600)) ?? file;
      const r = await readBusinessCard(small);
      const merged = { ...f };
      for (const k of ['name', 'organization', 'role', 'email', 'phone', 'website', 'linkedin', 'country'] as const) if (r[k] && !(merged as any)[k]) (merged as any)[k] = r[k];
      if (merged.name === 'Carte de visite' && r.name) merged.name = r.name;
      setF(merged);
      await update('contacts', contactId, { name: merged.name || 'Carte de visite', organization: merged.organization || null, role: merged.role || null, email: merged.email || null, phone: merged.phone || null, website: merged.website || null, linkedin: merged.linkedin || null, country: merged.country || null });
      toast('Carte lue, vérifiez les champs');
      if (!c) go(`contact/${contactId}`);
    } catch (e: any) {
      toast(`Photo gardée. Lecture auto impossible : ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <Title sub={c ? undefined : 'Ajout rapide : le nom suffit, le reste peut attendre.'}>{c ? c.name : 'Nouveau contact'}</Title>
      <Btn tone="nuit" className="mb-4 w-full" onClick={() => cardRef.current?.click()} disabled={!!busy}>
        <Camera size={18} /> {busy ?? 'Photographier une carte de visite'}
      </Btn>
      <input ref={cardRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onCard(e.target.files?.[0]); e.target.value = ''; }} />
      <Field label="Nom"><Input value={f.name} onChange={set('name')} autoFocus={!c} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Structure"><Input value={f.organization} onChange={set('organization')} /></Field>
        <Field label="Rôle"><Input value={f.role} onChange={set('role')} /></Field>
        <Field label="Pays"><Input value={f.country} onChange={set('country')} /></Field>
        <Field label="Téléphone"><Input type="tel" value={f.phone} onChange={set('phone')} /></Field>
      </div>
      <Field label="E-mail"><Input type="email" value={f.email} onChange={set('email')} /></Field>
      <Field label="LinkedIn / Swapcard / site"><Input value={f.linkedin || f.swapcard || f.website} onChange={(e) => { const v = e.target.value; setF({ ...f, linkedin: /linkedin/i.test(v) ? v : f.linkedin, swapcard: /swapcard/i.test(v) ? v : f.swapcard, website: !/linkedin|swapcard/i.test(v) ? v : f.website }); }} /></Field>
      <Field label="Suivi">
        <Select value={f.status} onChange={set('status')}>
          {Object.entries(CONTACT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Projets liés">
        <div className="flex flex-wrap gap-2">
          {PROJECTS.map((p) => (
            <button key={p} type="button" onClick={() => setF({ ...f, projects: f.projects.includes(p) ? f.projects.filter((x) => x !== p) : [...f.projects, p] })} className={cx('rounded-full px-3 py-1.5 text-sm', f.projects.includes(p) ? 'bg-ocre-500 text-nuit-950' : 'bg-white/[0.05] text-nuit-200')}>
              {p}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Rencontré pendant"><ActivityPicker value={f.activity_id} onChange={(v) => setF({ ...f, activity_id: v })} /></Field>
      <Field label="Notes"><TextArea value={f.notes} onChange={set('notes')} rows={3} /></Field>
      <Btn big className="w-full" onClick={save}>Enregistrer</Btn>
      {c && (
        <>
          <H2>Notes vocales et photos</H2>
          <QuickActions activityId={c.activity_id ?? null} contactId={c.id} />
          <div className="mt-3"><MediaGrid items={media} /></div>
          <Btn tone="ghost" className="mt-6 text-red-300" onClick={async () => { if (confirm('Supprimer ce contact ?')) { await remove('contacts', c.id); go('contacts'); } }}>
            <Trash2 size={18} /> Supprimer
          </Btn>
          <Comments table="contacts" id={c.id} />
        </>
      )}
    </div>
  );
}

function ReadOnly({ c, media }: { c: Contact; media: any[] }) {
  return (
    <div>
      <div className="mb-2"><AuthorBadge authorId={c.author_id} /></div>
      <Title sub={[c.role, c.organization, c.country].filter(Boolean).join(' · ')}>{c.name}</Title>
      <div className="space-y-2">
        {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-ocre-400"><Mail size={16} /> {c.email}</a>}
        {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-ocre-400"><Phone size={16} /> {c.phone}</a>}
        {(c.linkedin || c.swapcard || c.website) && <a href={c.linkedin || c.swapcard || c.website!} target="_blank" rel="noreferrer" className="block truncate text-ocre-400 underline">{c.linkedin || c.swapcard || c.website}</a>}
        {c.status && c.author_id && <p className="text-sm">Suivi : {CONTACT_STATUS[c.status]}</p>}
        {c.projects?.length > 0 && <p className="text-sm">Projets : {c.projects.join(', ')}</p>}
        {c.notes && <p className="whitespace-pre-wrap text-sm text-nuit-200">{c.notes}</p>}
      </div>
      <p className="mt-4 text-xs text-nuit-400">{c.author_id ? 'Contact saisi par l’autre observateur : vous pouvez le commenter.' : 'Contact de référence (organisateurs, délégation).'}</p>
      <div className="mt-3"><MediaGrid items={media} /></div>
      {!c.author_id && (
        <Btn tone="nuit" className="mt-4" onClick={async () => {
          const n = await create('contacts', { name: c.name, organization: c.organization, role: c.role, country: c.country, phone: c.phone, email: c.email, status: 'a_relancer', projects: [], notes: 'Copie depuis la liste de référence' });
          go(`contact/${n.id}`);
        }}>Ajouter à mes rencontres (suivi)</Btn>
      )}
      <Comments table="contacts" id={c.id} />
    </div>
  );
}
