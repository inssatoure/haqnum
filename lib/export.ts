'use client';

// Exports : CSV, vCard, Word (.docx avec photos), PDF (impression), archive ZIP des originaux.

import { buildVcard } from './importers';
import { db } from './db';
import { fetchBlob } from './media';
import { dayKey, heure } from './time';
import type { Contact, Media } from './types';

export function downloadBlob(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export function downloadText(name: string, text: string, mime = 'text/plain') {
  downloadBlob(name, new Blob(['﻿' + text], { type: `${mime};charset=utf-8` }));
}

export function toCsv(rows: Record<string, any>[]): string {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: any) => {
    const s = v == null ? '' : Array.isArray(v) ? v.join(' | ') : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n');
}

export function contactsCsv(list: Contact[]) {
  return toCsv(list.map((c) => ({ nom: c.name, structure: c.organization, role: c.role, pays: c.country, email: c.email, telephone: c.phone, linkedin: c.linkedin, swapcard: c.swapcard, site: c.website, suivi: c.status, projets: c.projects, notes: c.notes })));
}

export function contactsVcf(list: Contact[]) {
  return list.map((c) => c.vcard || buildVcard({ name: c.name, organization: c.organization ?? undefined, role: c.role ?? undefined, email: c.email ?? undefined, phone: c.phone ?? undefined, website: c.website ?? undefined, linkedin: c.linkedin ?? undefined, country: c.country ?? undefined })).join('\r\n');
}

const safe = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9 _.-]/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'sans_titre';

/** Archive ZIP de tous les médias originaux, classés jour / activité / auteur. */
export async function exportZip(onProgress?: (s: string) => void): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const media = (await db().media.toArray()).filter((m) => !m.deleted_at);
  const acts = new Map((await db().activities.toArray()).map((a) => [a.id, a]));
  const profiles = new Map((await db().profiles.toArray()).map((p) => [p.id, p]));
  const index: Record<string, any>[] = [];
  let n = 0;
  let missing = 0;
  for (const m of media) {
    n++;
    onProgress?.(`Préparation ${n}/${media.length}…`);
    const act = m.activity_id ? acts.get(m.activity_id) : null;
    const author = profiles.get(m.author_id ?? '')?.short_name ?? 'inconnu';
    const folder = `${dayKey(m.captured_at)}/${act ? `${heure(act.starts_at).replace('h', 'h')}_${safe(act.title)}` : 'sans_activite'}/${safe(author)}`;
    for (const p of m.parts) {
      const b = await fetchBlob(p.path);
      if (!b) {
        missing++;
        continue;
      }
      const name = `${heure(m.captured_at).replace('h', '-')}_${m.kind}_${m.id.slice(0, 6)}_${p.path.split('/').pop()}`;
      zip.file(`${folder}/${name}`, b, { binary: true, date: new Date(m.captured_at) });
      index.push({ fichier: `${folder}/${name}`, type: m.kind, auteur: author, appareil: m.device, capture: m.captured_at, activite: act?.title, gps: m.lat != null ? `${m.lat},${m.lng}` : '', titre: m.title });
    }
  }
  zip.file('index.csv', '﻿' + toCsv(index));
  zip.file('donnees.json', JSON.stringify(await exportJson(), null, 1));
  onProgress?.('Compression…');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, (meta) => onProgress?.(`Compression ${Math.round(meta.percent)}%`));
  downloadBlob(`MIN2026_medias_${new Date().toISOString().slice(0, 10)}.zip`, blob);
  if (missing) onProgress?.(`${missing} fichier(s) introuvable(s) (pas encore envoyés depuis l’autre téléphone)`);
}

export async function exportJson() {
  const d = db();
  const strip = (rows: any[]) => rows.map(({ _dirty, ...r }) => r);
  return {
    exporte_le: new Date().toISOString(),
    activites: strip(await d.activities.toArray()),
    medias: strip(await d.media.toArray()),
    notes: strip(await d.notes.toArray()),
    fiches: strip(await d.fiches.toArray()),
    contacts: strip(await d.contacts.toArray()),
    transcriptions: strip(await d.transcripts.toArray()),
    analyses: strip(await d.analyses.toArray()),
    commentaires: strip(await d.comments.toArray()),
    observateurs: await d.profiles.toArray(),
  };
}

// ------------------------------------------------------------------
// Word (.docx)
// ------------------------------------------------------------------
export async function exportDocx(title: string, markdown: string, opts: { annexMedia?: Media[]; subtitle?: string } = {}) {
  const docx = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, AlignmentType } = docx;
  const children: any[] = [];
  children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title, font: 'Georgia' })] }));
  if (opts.subtitle) children.push(new Paragraph({ children: [new TextRun({ text: opts.subtitle, italics: true, color: '6F85A6' })] }));

  const runs = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\])/g).filter(Boolean);
    return parts.map((p) =>
      p.startsWith('**')
        ? new TextRun({ text: p.slice(2, -2), bold: true })
        : p.startsWith('[')
          ? new TextRun({ text: p, color: p.toLowerCase().startsWith('[moctar') ? '1F8A79' : p.toLowerCase().startsWith('[issa') ? 'B06F26' : '555555', size: 18 })
          : new TextRun({ text: p }),
    );
  };
  for (const raw of markdown.split('\n')) {
    const l = raw.trimEnd();
    if (!l.trim()) continue;
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    const li = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (h) {
      const level = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][Math.min(h[1].length, 3)];
      children.push(new Paragraph({ heading: level, children: [new TextRun({ text: h[2].replace(/\*\*/g, ''), font: 'Georgia' })] }));
    } else if (li) children.push(new Paragraph({ bullet: { level: /^\s{2,}/.test(l) ? 1 : 0 }, children: runs(li[1]) }));
    else if (l.startsWith('>')) children.push(new Paragraph({ indent: { left: 400 }, children: [new TextRun({ text: l.replace(/^>\s?/, ''), italics: true })] }));
    else children.push(new Paragraph({ children: runs(l), alignment: AlignmentType.LEFT }));
  }

  if (opts.annexMedia?.length) {
    const profiles = new Map((await db().profiles.toArray()).map((p) => [p.id, p]));
    const acts = new Map((await db().activities.toArray()).map((a) => [a.id, a]));
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Annexe : photos', font: 'Georgia' })] }));
    for (const m of opts.annexMedia) {
      const path = m.thumb_path;
      if (!path) continue;
      const b = await fetchBlob(path);
      if (!b) continue;
      const buf = new Uint8Array(await b.arrayBuffer());
      const dim = await imageSize(b);
      const w = 420;
      const h = Math.round((dim.h / dim.w) * w) || 300;
      children.push(new Paragraph({ children: [new ImageRun({ data: buf, transformation: { width: w, height: h }, type: 'jpg' } as any)] }));
      const act = m.activity_id ? acts.get(m.activity_id) : null;
      children.push(new Paragraph({ children: [new TextRun({ text: `[${profiles.get(m.author_id ?? '')?.short_name ?? '?'}, ${m.kind} ${heure(m.captured_at)}] ${act?.title ?? ''} ${m.title ?? ''}`, size: 18, color: '555555' })] }));
    }
  }

  const doc = new Document({
    creator: 'MIN Observateur',
    title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }],
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(`${safe(title)}.docx`, blob);
}

async function imageSize(b: Blob): Promise<{ w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(b);
    return { w: bmp.width, h: bmp.height };
  } catch {
    return { w: 4, h: 3 };
  }
}
