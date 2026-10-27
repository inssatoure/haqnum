'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Download } from 'lucide-react';
import { useRef, useState } from 'react';
import { saveMediaFile } from '@/lib/capture';
import { EXPENSE_CATEGORIES } from '@/lib/config';
import { db } from '@/lib/db';
import { downloadText, toCsv } from '@/lib/export';
import { create, remove } from '@/lib/repo';
import { dateHeure } from '@/lib/time';
import { useMe } from '../hooks';
import { Btn, Card, Field, H2, Input, Select, Thumb, Title, toast } from '../ui';

/** Dépenses personnelles (chacun voit les siennes). */
export default function Expenses() {
  const me = useMe();
  const list = useLiveQuery(async () => (await db().expenses.toArray()).filter((e) => !e.deleted_at && e.author_id === me?.id).sort((a, b) => b.spent_at.localeCompare(a.spent_at)), [me?.id]) ?? [];
  const receipts = useLiveQuery(async () => {
    const ids = list.map((e) => e.receipt_media_id).filter(Boolean) as string[];
    const ms = await db().media.bulkGet(ids);
    return Object.fromEntries(ms.filter(Boolean).map((m) => [m!.id, m!]));
  }, [list.length]) ?? {};
  const [f, setF] = useState({ amount: '', currency: 'EUR', category: 'Repas', label: '' });
  const [receipt, setReceipt] = useState<File | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const total = list.reduce<Record<string, number>>((acc, e) => ((acc[e.currency] = (acc[e.currency] ?? 0) + (e.amount ?? 0)), acc), {});

  return (
    <div>
      <Title sub="Hors prise en charge (hébergement, transports, repas du programme sont pris en charge).">Dépenses personnelles</Title>
      <Card>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Montant"><Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Devise">
            <Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}><option>EUR</option><option>XOF</option><option>USD</option></Select>
          </Field>
          <Field label="Catégorie">
            <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
          </Field>
        </div>
        <Field label="Libellé"><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Ex. taxi gare" /></Field>
        <div className="flex gap-2">
          <Btn tone="nuit" onClick={() => ref.current?.click()}><Camera size={18} /> {receipt ? 'Reçu ✓' : 'Photo du reçu'}</Btn>
          <Btn
            className="flex-1"
            onClick={async () => {
              const amount = Number(f.amount.replace(',', '.'));
              if (!amount) return toast('Indiquez un montant');
              const receiptId = receipt ? await saveMediaFile(receipt, { kind: 'receipt', source: 'camera' }) : null;
              await create('expenses', { amount, currency: f.currency, category: f.category, label: f.label || null, spent_at: new Date().toISOString(), receipt_media_id: receiptId });
              setF({ ...f, amount: '', label: '' });
              setReceipt(null);
              toast('Dépense ajoutée');
            }}
          >
            Ajouter
          </Btn>
        </div>
        <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
      </Card>
      <H2 right={<button className="flex items-center gap-1 text-sm text-nuit-400" onClick={() => downloadText('depenses.csv', toCsv(list.map((e) => ({ date: e.spent_at, montant: e.amount, devise: e.currency, categorie: e.category, libelle: e.label }))), 'text/csv')}><Download size={14} /> CSV</button>}>
        Total : {Object.entries(total).map(([c, v]) => `${v.toFixed(2)} ${c}`).join(' · ') || '0'}
      </H2>
      <div className="space-y-2">
        {list.map((e) => (
          <Card key={e.id} className="flex items-center gap-3">
            {e.receipt_media_id && receipts[e.receipt_media_id] ? <Thumb path={receipts[e.receipt_media_id].thumb_path} className="h-12 w-12 rounded-lg" /> : <span className="h-12 w-12 rounded-lg bg-white/[0.05]" />}
            <div className="flex-1">
              <p className="font-semibold">{e.amount?.toFixed(2)} {e.currency} · {e.category}</p>
              <p className="text-xs text-nuit-400">{e.label} · {dateHeure(e.spent_at)}</p>
            </div>
            <button className="text-xs text-red-300" onClick={() => remove('expenses', e.id)}>Suppr.</button>
          </Card>
        ))}
      </div>
    </div>
  );
}
