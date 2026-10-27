'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Plus, QrCode, ScanLine, Search } from 'lucide-react';
import { useState } from 'react';
import { CONTACT_STATUS } from '@/lib/config';
import { db } from '@/lib/db';
import { contactsCsv, contactsVcf, downloadText } from '@/lib/export';
import { parseQr } from '@/lib/importers';
import { create } from '@/lib/repo';
import { activityAt } from '@/lib/time';
import type { Contact } from '@/lib/types';
import QrScanner from '../QrScanner';
import { go, matchAuthor, useActivities, useAuthorFilter, useMe } from '../hooks';
import { AuthorBadge, AuthorFilterBar, Btn, cx, Input, Sheet, Title, toast } from '../ui';
import { MyQr } from './MyQr';

export default function Contacts() {
  const me = useMe();
  const acts = useActivities();
  const { value: filter } = useAuthorFilter();
  const [q, setQ] = useState('');
  const [scan, setScan] = useState(false);
  const [myQr, setMyQr] = useState(false);
  const [cat, setCat] = useState<'tous' | 'rencontres' | 'reference'>('tous');
  const list = useLiveQuery(async () => (await db().contacts.toArray()).filter((c) => !c.deleted_at).sort((a, b) => a.name.localeCompare(b.name)), []) ?? [];

  const shown = list.filter((c) => {
    if (cat === 'rencontres' && !c.author_id) return false;
    if (cat === 'reference' && c.author_id) return false;
    if (c.author_id && !matchAuthor(c.author_id, filter, me?.id)) return false;
    if (!c.author_id && filter !== 'tout') return false;
    if (!q) return true;
    const hay = `${c.name} ${c.organization ?? ''} ${c.role ?? ''} ${c.country ?? ''}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const onScan = async (text: string) => {
    setScan(false);
    const data = parseQr(text);
    const act = activityAt(acts, new Date());
    const c = await create('contacts', {
      name: data.name || data.email || data.linkedin || data.swapcard || 'Nouveau contact',
      organization: data.organization ?? null,
      role: data.role ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      website: data.website ?? null,
      linkedin: data.linkedin ?? null,
      swapcard: data.swapcard ?? null,
      country: data.country ?? null,
      vcard: data.vcard ?? null,
      status: 'a_relancer',
      projects: [],
      activity_id: act?.id ?? null,
      notes: data.vcard ? null : `QR scanné : ${text.slice(0, 300)}`,
    });
    toast('Contact ajouté');
    go(`contact/${c.id}`);
  };

  return (
    <div>
      <Title sub="Rencontres, organisateurs, délégation.">Contacts</Title>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Btn onClick={() => go('contact')}><Plus size={18} /> Ajouter</Btn>
        <Btn tone="nuit" onClick={() => setScan(true)}><ScanLine size={18} /> Scanner</Btn>
        <Btn tone="nuit" onClick={() => setMyQr(true)}><QrCode size={18} /> Mon QR</Btn>
      </div>
      <div className="relative mb-3">
        <Search size={18} className="absolute left-3 top-3.5 text-nuit-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un nom, une structure, un pays" className="pl-10" />
      </div>
      <div className="mb-3 flex gap-2">
        {(['tous', 'rencontres', 'reference'] as const).map((k) => (
          <button key={k} onClick={() => setCat(k)} className={cx('rounded-full px-3 py-1.5 text-sm', cat === k ? 'bg-ocre-500 text-nuit-950' : 'bg-nuit-900 text-nuit-200')}>
            {k === 'tous' ? 'Tous' : k === 'rencontres' ? 'Nos rencontres' : 'Organisateurs / délégation'}
          </button>
        ))}
      </div>
      <AuthorFilterBar />
      <div className="divide-y divide-nuit-800 rounded-2xl border border-nuit-700 bg-nuit-900">
        {shown.map((c) => <Row key={c.id} c={c} />)}
        {!shown.length && <p className="p-4 text-sm text-nuit-400">Aucun contact.</p>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Btn tone="ghost" onClick={() => downloadText('contacts-min2026.csv', contactsCsv(shown), 'text/csv')}><Download size={18} /> CSV</Btn>
        <Btn tone="ghost" onClick={() => downloadText('contacts-min2026.vcf', contactsVcf(shown), 'text/vcard')}><Download size={18} /> vCard</Btn>
      </div>
      <Sheet open={scan} onClose={() => setScan(false)} title="Scanner un QR code">
        {scan && <QrScanner onResult={onScan} />}
      </Sheet>
      <Sheet open={myQr} onClose={() => setMyQr(false)} title="Mon QR code">
        {myQr && <MyQr />}
      </Sheet>
    </div>
  );
}

function Row({ c }: { c: Contact }) {
  return (
    <button onClick={() => go(`contact/${c.id}`)} className="flex w-full items-center gap-3 p-3 text-left active:bg-nuit-800">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-nuit-700 font-titre text-sable">{c.name.slice(0, 1)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{c.name}</span>
        <span className="block truncate text-xs text-nuit-400">{[c.role, c.organization, c.country].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <AuthorBadge authorId={c.author_id} small />
        {c.author_id && c.status && c.status !== 'aucun' && <span className="text-[10px] text-ocre-400">{CONTACT_STATUS[c.status]}</span>}
      </span>
    </button>
  );
}
