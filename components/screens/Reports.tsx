'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, FileText, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DOSSIER_SECTIONS, MISSION_SECTIONS } from '@/lib/ai-prompts';
import { generateSection, runAnalysis } from '@/lib/ai-client';
import { db } from '@/lib/db';
import { downloadText, exportDocx, exportJson, exportZip } from '@/lib/export';
import { create, update } from '@/lib/repo';
import { dateHeure, dayKey, jourLong } from '@/lib/time';
import type { Report } from '@/lib/types';
import { useActivities, useNow, useProfiles } from '../hooks';
import Markdown from '../Markdown';
import { AuthorBadge, Btn, Card, Field, H2, Select, Title, toast } from '../ui';

export default function Reports() {
  const acts = useActivities();
  const now = useNow();
  const profiles = useProfiles();
  const days = useMemo(() => [...new Set(acts.map((a) => dayKey(a.starts_at)))].sort(), [acts]);
  const [day, setDay] = useState(days.includes(dayKey(now)) ? dayKey(now) : days[0] ?? dayKey(now));
  const [who, setWho] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const reports = useLiveQuery(async () => (await db().reports.toArray()).filter((r) => !r.deleted_at).sort((a, b) => b.created_at.localeCompare(a.created_at)), []) ?? [];

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label);
    try {
      const id = await fn();
      if (id) setOpen(id);
      toast(`${label} prêt`);
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(null);
    }
  };

  const multiSection = async (kind: 'dossier' | 'mission', title: string, authorId?: string) => {
    const sections = kind === 'dossier' ? DOSSIER_SECTIONS : MISSION_SECTIONS;
    const r = await create('reports', { kind, title, markdown: `# ${title}\n\n_En cours de rédaction…_`, params: { sections: sections.map((s) => s.key), author_id: authorId ?? null } });
    let md = `# ${title}\n\n`;
    for (let i = 0; i < sections.length; i++) {
      setBusy(`${title} : section ${i + 1}/${sections.length}`);
      let body = '';
      try {
        body = await generateSection(kind, sections[i].key, authorId);
      } catch (e: any) {
        body = `_Section non générée : ${e.message}_`;
      }
      md += `## ${sections[i].title}\n\n${body}\n\n`;
      await update('reports', r.id, { markdown: md });
    }
    return r.id;
  };

  return (
    <div>
      <Title sub="Générés par l’IA à partir de vos données, avec les sources et les auteurs.">Rapports et exports</Title>

      <Card>
        <p className="mb-2 font-semibold">Rapport du jour</p>
        <Field label="Jour">
          <Select value={day} onChange={(e) => setDay(e.target.value)}>
            {days.map((d) => <option key={d} value={d}>{jourLong(d + 'T12:00:00Z')}</option>)}
          </Select>
        </Field>
        <Field label="Observateur">
          <Select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Les deux (rapport combiné)</option>
            {Object.values(profiles).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </Select>
        </Field>
        <Btn className="w-full" disabled={!!busy} onClick={() => run('Rapport du jour', async () => {
          const name = who ? profiles[who]?.short_name : null;
          const title = `Rapport du ${jourLong(day + 'T12:00:00Z')}${name ? ` — ${name}` : ''}`;
          const a = await runAnalysis(who ? 'observateur' : 'jour', { day, authorId: who || undefined, title });
          const r = await create('reports', { kind: 'jour', title, markdown: a.markdown, params: { day, author_id: who || null } });
          return r.id;
        })}>Générer</Btn>
      </Card>

      <div className="mt-3 grid gap-3">
        <Card>
          <p className="font-semibold">Rapport de mission</p>
          <p className="mb-2 text-sm text-nuit-400">Pour l’Institut français du Sénégal et l’ambassade de France.</p>
          <Btn className="w-full" disabled={!!busy} onClick={() => run('Rapport de mission', () => multiSection('mission', 'Rapport de mission — MIN 2026 / Chroniques', who || undefined))}>Générer</Btn>
        </Card>
        <Card>
          <p className="font-semibold">Dossier de reproduction de la Biennale</p>
          <p className="mb-2 text-sm text-nuit-400">9 sections : vision, catalogue, débats, scénographie, organisation, financement, 10 regards, proposition Sénégal, contacts.</p>
          <Btn className="w-full" disabled={!!busy} onClick={() => run('Dossier de reproduction', () => multiSection('dossier', 'Dossier de reproduction — Biennale des imaginaires numériques au Sénégal'))}>Générer (plusieurs minutes)</Btn>
        </Card>
      </div>
      <Card className="mt-3">
        <p className="font-semibold">Doublons entre les deux observateurs</p>
        <p className="mb-2 text-sm text-nuit-400">Même contact, même œuvre saisis deux fois. Rien n’est effacé : les deux sources restent.</p>
        <Btn tone="nuit" className="w-full" disabled={!!busy} onClick={() => run('Recherche de doublons', async () => {
          const a = await runAnalysis('doublons', { title: 'Doublons détectés' });
          const groups: any[] = a.content?.json?.groupes ?? [];
          const md = groups.length
            ? `# Doublons détectés\n\n${groups.map((g) => `## ${g.titre} (${g.type})\n- ${g.elements.join('\n- ')}\n\n_${g.raison}_`).join('\n\n')}`
            : '# Doublons détectés\n\nAucun doublon probable.';
          const r = await create('reports', { kind: 'doublons', title: 'Doublons détectés', markdown: md, params: {} });
          return r.id;
        })}>Chercher les doublons</Btn>
      </Card>
      {busy && <p className="mt-3 animate-pulse text-ocre-400">{busy}…</p>}

      <H2>Rapports générés</H2>
      <div className="space-y-2">
        {reports.map((r) => <ReportItem key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />)}
        {!reports.length && <p className="text-sm text-nuit-400">Aucun rapport pour l’instant.</p>}
      </div>

      <H2>Exports des données</H2>
      <div className="grid gap-2">
        <Btn tone="nuit" disabled={!!busy} onClick={() => run('Archive ZIP', async () => { await exportZip((s) => setBusy(s)); })}><Archive size={18} /> Archive ZIP de tous les médias originaux</Btn>
        <Btn tone="nuit" onClick={async () => downloadText('MIN2026_donnees.json', JSON.stringify(await exportJson(), null, 1), 'application/json')}><FileText size={18} /> Toutes les données (JSON)</Btn>
        <p className="text-xs text-nuit-400">Contacts en CSV / vCard : écran Contacts. Conseil : faites l’archive ZIP depuis un ordinateur (fichiers vidéo lourds).</p>
      </div>
    </div>
  );
}

function ReportItem({ r, open, onToggle }: { r: Report; open: boolean; onToggle: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] shadow-carte">
      <button className="flex w-full items-center justify-between gap-2 p-3 text-left" onClick={onToggle}>
        <span>
          <span className="font-semibold">{r.title}</span>
          <span className="block text-xs text-nuit-400">{dateHeure(r.created_at)}</span>
        </span>
        <AuthorBadge authorId={r.author_id} small />
      </button>
      {open && (
        <div className="border-t border-white/[0.07] p-3">
          <div className="no-print mb-3 flex flex-wrap gap-2">
            <Btn tone="nuit" disabled={busy} onClick={async () => {
              setBusy(true);
              try {
                // Annexe photos : œuvres et activités couvertes (dossier) ou photos du jour.
                const media = (await db().media.toArray()).filter((m) => !m.deleted_at && (m.kind === 'photo' || m.kind === 'video') && m.thumb_path && (!r.params?.day || dayKey(m.captured_at) === r.params.day) && (!r.params?.author_id || m.author_id === r.params.author_id));
                const withFiche = media.filter((m) => m.fiche_id);
                const annex = (withFiche.length >= 6 ? withFiche : media).slice(0, 60);
                await exportDocx(r.title ?? 'Rapport', r.markdown ?? '', { annexMedia: annex, subtitle: `MIN Observateur — généré le ${dateHeure(r.created_at)}` });
              } catch (e: any) {
                toast(e.message);
              } finally {
                setBusy(false);
              }
            }}><FileText size={18} /> Word</Btn>
            <Btn tone="nuit" onClick={() => printReport(r)}><Printer size={18} /> PDF</Btn>
            <Btn tone="ghost" onClick={() => downloadText(`${(r.title ?? 'rapport').slice(0, 50)}.md`, r.markdown ?? '', 'text/markdown')}>Markdown</Btn>
          </div>
          <div className="text-sm"><Markdown text={r.markdown ?? ''} /></div>
        </div>
      )}
    </div>
  );
}

/** PDF : page imprimable (Safari > Partager > Imprimer > Enregistrer en PDF, ou ordinateur > PDF). */
async function printReport(r: Report) {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const html = renderToStaticMarkup(<Markdown text={r.markdown ?? ''} />);
  const media = (await db().media.toArray()).filter((m) => !m.deleted_at && m.kind === 'photo' && m.thumb_path && (!r.params?.day || dayKey(m.captured_at) === r.params.day)).slice(0, 24);
  const { mediaUrl } = await import('@/lib/media');
  const imgs: string[] = [];
  for (const m of media) {
    const u = await mediaUrl(m.thumb_path);
    if (u) imgs.push(`<figure><img src="${u}"/><figcaption>${dateHeure(m.captured_at)} ${m.title ?? ''}</figcaption></figure>`);
  }
  const w = window.open('', '_blank');
  if (!w) return toast('Autorisez les fenêtres pour imprimer');
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${r.title}</title>
<style>body{font-family:Calibri,Carlito,'Segoe UI','Helvetica Neue',sans-serif;color:#111;max-width:780px;margin:24px auto;padding:0 16px;line-height:1.5;text-align:left}
h1,h2,h3{font-family:Georgia,serif;color:#0B1526}h1{border-bottom:3px solid #D08A3A;padding-bottom:6px}
span{font-size:.85em;color:#8a5a1c}figure{display:inline-block;width:46%;margin:1%;vertical-align:top}img{width:100%;border-radius:6px}figcaption{font-size:11px;color:#555}
@page{margin:16mm}</style></head><body><p style="color:#6F85A6">MIN Observateur — ${dateHeure(r.created_at)}</p>${html}${imgs.length ? `<h2>Annexe : photos</h2>${imgs.join('')}` : ''}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 800);
}
