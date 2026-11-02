'use client';

// Import d'un « dossier de suivi » (zip) dans l'application :
//   00_LISEZ_MOI.md           -> activités (rendez-vous de l'agenda) + note « réponses reçues »
//   01_transcriptions_audio/  -> notes d'écoute (texte brut)
//   02_resumes_reunions/      -> notes de synthèse de sessions
//   03_contacts/              -> contacts (profils Swapcard)
//   05_notes_et_suivi/        -> notes de synthèse par personne / session
// Tout est créé au nom de l'utilisateur connecté, avec des identifiants stables :
// relancer l'import met à jour au lieu de dupliquer. Les brouillons d'e-mails (04_) ne sont pas importés.

import { MISSION_ID } from './config';
import { db } from './db';
import { create } from './repo';
import { parisToIso } from './time';
import type { Activity, Contact } from './types';

export interface DossierPlan {
  activities: PlanActivity[];
  contacts: PlanContact[];
  notes: PlanNote[];
  skipped: string[];
  warnings: string[];
}
interface PlanActivity { id: string; title: string; starts_at: string; ends_at: string; description: string | null }
interface PlanContact { id: string; data: Partial<Contact> & { name: string }; activityHint: string | null }
interface PlanNote { id: string; body: string; kind: 'synthese' | 'resume' | 'brut' | 'contexte'; activityRule: ActivityRule | null }
type ActivityRule = { match: RegExp; fallbackTitle?: RegExp };

export async function detUuid(key: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${MISSION_ID}|${key}`));
  const h = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const clean = (s: string) => s.replace(/\r/g, '').trim();
const humanize = (name: string) => name.replace(/\.[a-z]+$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Pays déduit du profil (extension de l'e-mail, ville citée) ; null si incertain. */
function guessCountry(c: { email?: string | null; website?: string | null; bio?: string | null; org?: string | null; name: string }): string | null {
  const hay = norm(`${c.bio ?? ''} ${c.org ?? ''}`);
  const dom = `${c.email ?? ''} ${c.website ?? ''}`.toLowerCase();
  if (/\.qc\.ca|montreal/.test(dom + hay)) return 'Canada';
  if (/\.co\.jp|\.jp\b|tokyo|kyoto/.test(dom + hay)) return 'Japon';
  if (/\.lu\b|luxemb/.test(dom + hay)) return 'Luxembourg';
  if (/\.be\b|namur|bruxelles/.test(dom + hay)) return 'Belgique';
  if (/\.nl\b|utrecht|haarlem/.test(dom + hay)) return 'Pays-Bas';
  if (/\.ch\b|geneve/.test(dom + hay)) return 'Suisse';
  if (/\.de\b|berlin/.test(dom + hay)) return 'Allemagne';
  if (/\.cat\b|catal/.test(dom + hay)) return 'Espagne (Catalogne)';
  if (/britishcouncil|belfast|discoverneon/.test(dom + hay)) return 'Royaume-Uni';
  if (/isamm|tacir|amavi/.test(hay)) return 'Tunisie';
  if (/\.fr\b|institutfrancais|hacnum|avignon|marseille|nantes|cnrs|sorbonne/.test(dom + hay)) return 'France';
  return null;
}

/** Lit le zip et prépare ce qui sera créé (rien n'est écrit tant que commitDossier n'est pas appelé). */
export async function planDossier(file: File): Promise<DossierPlan> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);
  const files = Object.values(zip.files).filter((f) => !f.dir && !/(^|\/)__MACOSX\//.test(f.name) && !/\.DS_Store$/.test(f.name));
  const text = async (re: RegExp) => {
    const out: { name: string; text: string }[] = [];
    for (const f of files) if (re.test(f.name)) out.push({ name: f.name.split('/').pop()!, text: await f.async('string') });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  };

  const plan: DossierPlan = { activities: [], contacts: [], notes: [], skipped: [], warnings: [] };
  const readme = (await text(/00_LISEZ_MOI\.md$/i))[0]?.text ?? '';
  const trans = await text(/01_transcriptions_audio\/.+\.txt$/i);
  const resumes = await text(/02_resumes_reunions\/.+\.md$/i);
  const jsonl = (await text(/03_contacts\/.+\.jsonl$/i))[0]?.text ?? '';
  const tsv = (await text(/03_contacts\/.+\.tsv$/i))[0]?.text ?? '';
  const notes05 = await text(/05_notes_et_suivi\/.+\.md$/i);
  const emails = files.filter((f) => /04_emails\//i.test(f.name)).length;
  if (!readme && !trans.length && !jsonl) plan.warnings.push("Ce zip ne ressemble pas à un dossier de suivi (aucun fichier reconnu).");
  if (emails) plan.skipped.push(`${emails} fichier(s) de brouillons d'e-mails (non importés)`);

  // ---- Rendez-vous de l'agenda (README)
  const months: Record<string, string> = { oct: '10', nov: '11', déc: '12', dec: '12' };
  for (const line of readme.split('\n')) {
    const m = line.match(/^(?:Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)\s+(\d{1,2})\s+(oct|nov|d[ée]c)\w*\s*:\s*(.+)$/i);
    if (!m) continue;
    const date = `2026-${months[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`;
    const body = m[3].split(/\.\s+(?=[A-ZÉ])/)[0];
    for (const seg of body.split(/\s*;\s*/)) {
      if (/cocktail|avant-première|dîner|diner|déjeuner|Moctar/i.test(seg)) continue;
      const t = seg.match(/^(.*?)\s*~?(\d{1,2})h(\d{2})?\s*(.*)$/);
      if (!t || !t[1].trim()) continue;
      let name = t[1].trim();
      let extra = t[4].trim().replace(/\+?\d[\d ]{8,}\d/g, '').replace(/\(([^)]*intoxication[^)]*)\)/i, '(manqué)').replace(/\s{2,}/g, ' ').trim();
      const hh = t[2].padStart(2, '0');
      const mm = (t[3] ?? '00').padStart(2, '0');
      const starts = parisToIso(date, `${hh}:${mm}`);
      const ends = new Date(new Date(starts).getTime() + 30 * 60_000).toISOString();
      plan.activities.push({
        id: await detUuid(`rdv:${date}:${hh}${mm}:${name}`),
        title: `Rendez-vous : ${name}`,
        starts_at: starts,
        ends_at: ends,
        description: extra || null,
      });
    }
  }

  // ---- Contacts
  const ids = new Map<string, string>();
  const tsvNames: { name: string; org: string | null; id: string }[] = [];
  for (const l of tsv.split('\n')) {
    const [label, id] = l.split('\t');
    if (!label || !id) continue;
    const mm = label.match(/^(.*?)\s*\((.*)\)\s*$/);
    const name = (mm ? mm[1] : label).trim();
    ids.set(norm(name), id.trim());
    tsvNames.push({ name, org: mm ? mm[2].trim() : null, id: id.trim() });
  }
  const seen = new Set<string>();
  for (const l of jsonl.split('\n')) {
    if (!l.trim()) continue;
    let d: any;
    try {
      d = JSON.parse(l);
    } catch {
      continue;
    }
    if (!d.name) continue;
    seen.add(norm(d.name));
    const bio: string = d.bio ?? '';
    const phone = bio.match(/Phone shown:\s*([+\d][\d ]{6,})/i)?.[1]?.trim() ?? null;
    const notes = [bio && `Profil : ${bio.replace(/Phone shown:\s*[+\d ]+\.?/i, '').trim()}`, d.instagram && `Instagram : ${d.instagram}`].filter(Boolean).join('\n');
    plan.contacts.push({
      id: await detUuid(`contact:${norm(d.name)}`),
      activityHint: d.name,
      data: {
        name: d.name,
        organization: d.org ?? null,
        role: d.role ?? null,
        email: d.email ?? null,
        phone,
        website: d.website ?? null,
        linkedin: d.linkedin ?? null,
        swapcard: ids.get(norm(d.name)) ?? null,
        country: guessCountry({ email: d.email, website: d.website, bio, org: d.org, name: d.name }),
        category: 'swapcard',
        notes: notes || null,
      },
    });
  }
  for (const t of tsvNames) {
    if (seen.has(norm(t.name))) continue;
    plan.contacts.push({
      id: await detUuid(`contact:${norm(t.name)}`),
      activityHint: t.name,
      data: { name: t.name, organization: t.org, swapcard: t.id, category: 'swapcard', notes: 'Profil Swapcard pas encore lu.' },
    });
  }

  // ---- Notes
  const rule = (re: RegExp, fb?: RegExp): ActivityRule => ({ match: re, fallbackTitle: fb });
  const ruleFor = (name: string): ActivityRule | null => {
    const n = norm(name);
    if (/ikbal/.test(n)) return rule(/ikbal/i);
    if (/stereolux/.test(n)) return rule(/stereolux/i);
    if (/ouverture/.test(n)) return rule(/forum professionnel/i);
    return null;
  };
  for (const t of trans) {
    const title = humanize(t.name);
    plan.notes.push({
      id: await detUuid(`trans:${t.name}`),
      kind: 'brut',
      activityRule: ruleFor(t.name),
      body: `Notes d'écoute — ${title}\n[Texte brut, bruité : noms et chiffres souvent déformés ; à lire avec les notes de synthèse]\n\n${clean(t.text)}`,
    });
  }
  for (const r of resumes) {
    plan.notes.push({
      id: await detUuid(`resume:${r.name}`),
      kind: 'resume',
      activityRule: rule(/Villa Créative/i),
      body: `Résumé de session — ${humanize(r.name)}\n[Résumé automatique : noms d'intervenants à confirmer]\n\n${clean(r.text)}`,
    });
  }
  for (const f of notes05) {
    const parts = f.text.split(/^##\s+/m);
    parts.shift(); // introduction technique : non importée
    for (const sec of parts) {
      const [titleLine, ...rest] = sec.split('\n');
      const title = titleLine.trim();
      const body = clean(rest.join('\n').replace(/^---+\s*$/gm, ''));
      if (!title || !body) continue;
      if (/^les enregistrements/i.test(title)) {
        plan.skipped.push('Liste technique des enregistrements (non importée)');
        continue;
      }
      if (/^promesses/i.test(title)) {
        plan.notes.push({ id: await detUuid(`note05:${title}`), kind: 'synthese', activityRule: null, body: `Suites promises\n[Synthèse]\n\n${body}` });
        continue;
      }
      plan.notes.push({
        id: await detUuid(`note05:${title}`),
        kind: 'synthese',
        activityRule: ruleFor(title),
        body: `${title}\n[Synthèse]\n\n${body}`,
      });
    }
  }
  // Réponses reçues sur Swapcard (extrait du README)
  const rep = readme.match(/##\s*Réponses reçues sur Swapcard[^\n]*\n+([\s\S]*?)(?=\n##\s|$)/i);
  if (rep) plan.notes.push({ id: await detUuid('readme:reponses'), kind: 'contexte', activityRule: null, body: `Réponses reçues sur Swapcard\n[Synthèse]\n\n${clean(rep[1])}` });

  return plan;
}

function findActivity(acts: Activity[], r: ActivityRule | null): string | null {
  if (!r) return null;
  const hits = acts.filter((a) => !a.deleted_at && r.match.test(a.title));
  if (!hits.length) return null;
  // Préfère la plus courte (rendez-vous) ; pour « Forum » : le premier jour.
  hits.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return hits[0].id;
}

export interface DossierResult { activities: number; contacts: number; notes: number }

/** Écrit le plan dans la base locale (puis synchronisation automatique). */
export async function commitDossier(plan: DossierPlan, onProgress?: (done: number, total: number) => void): Promise<DossierResult> {
  const total = plan.activities.length + plan.contacts.length + plan.notes.length;
  let done = 0;
  const tick = () => onProgress?.(++done, total);

  for (const a of plan.activities) {
    await create('activities', { id: a.id, title: a.title, kind: 'rdv', starts_at: a.starts_at, ends_at: a.ends_at, city: 'Aix-en-Provence', description: a.description, source: 'dossier' });
    tick();
  }
  const acts = (await db().activities.toArray()) as Activity[];
  for (const c of plan.contacts) {
    const rdvs = acts.filter((a) => a.source === 'dossier');
    const full = c.activityHint ? norm(c.activityHint) : '';
    const last = full.split(' ').pop() ?? '';
    const byFull = rdvs.find((a) => norm(a.title).includes(full));
    const byLast = last.length > 3 ? rdvs.filter((a) => norm(a.title).includes(last)) : [];
    const hit = byFull ?? (byLast.length === 1 ? byLast[0] : null);
    await create('contacts', { id: c.id, status: hit ? 'a_relancer' : 'aucun', projects: [], activity_id: hit?.id ?? null, ...c.data });
    tick();
  }
  for (const n of plan.notes) {
    const activityId = findActivity(acts, n.activityRule);
    await create('notes', { id: n.id, body: n.body, activity_id: activityId, fiche_id: null, media_id: null });
    tick();
  }
  return { activities: plan.activities.length, contacts: plan.contacts.length, notes: plan.notes.length };
}

