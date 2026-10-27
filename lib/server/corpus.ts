import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { download } from './storage';

// Construit le « corpus » : toutes les observations, chacune avec une étiquette de source
// du type [Moctar, audio 14:32] que l'IA doit citer.

const TZ = 'Europe/Paris';
const hm = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const H = (d: string | number | Date) => hm.format(new Date(d));
const dayKey = (d: string) => dayKeyFmt.format(new Date(d));

export interface Scope {
  mission_id: string;
  activity_ids?: string[];
  day?: string; // AAAA-MM-JJ
  author_id?: string; // rapport d'un seul observateur
}

export interface CorpusImage {
  path: string;
  label: string;
}

const KIND_FR: Record<string, string> = { photo: 'photo', video: 'vidéo', audio: 'audio', voice: 'vocal', receipt: 'reçu', card: 'carte de visite' };
const FICHE_FR: Record<string, string> = { oeuvre: 'fiche œuvre', debat: 'fiche débat', lieu: 'fiche lieu', organisation: 'fiche organisation' };

export async function buildCorpus(sb: SupabaseClient, scope: Scope, opts: { maxImages?: number } = {}) {
  const m = scope.mission_id;
  const q = (t: string) => sb.from(t).select('*').eq('mission_id', m).is('deleted_at', null);
  const [acts, media, notes, fiches, contacts, comments, transcripts, members] = await Promise.all([
    q('activities').order('starts_at'),
    q('media'),
    q('notes'),
    q('fiches'),
    q('contacts'),
    q('comments'),
    q('transcripts'),
    sb.from('mission_members').select('user_id, role').eq('mission_id', m),
  ]);
  const ids = (members.data ?? []).map((x: any) => x.user_id);
  const { data: profiles } = ids.length ? await sb.from('profiles').select('*').in('id', ids) : { data: [] as any[] };
  const name = (id: string | null) => {
    if (!id) return 'Programme officiel';
    const p = (profiles ?? []).find((x: any) => x.id === id);
    return p?.short_name || p?.full_name?.split(' ')[0] || 'Observateur';
  };

  let activities = (acts.data ?? []) as any[];
  if (scope.activity_ids?.length) activities = activities.filter((a) => scope.activity_ids!.includes(a.id));
  if (scope.day) activities = activities.filter((a) => dayKey(a.starts_at) === scope.day);
  const actIds = new Set(activities.map((a) => a.id));
  const inScope = (row: any, timeField = 'created_at') => {
    if (scope.author_id && row.author_id !== scope.author_id) return false;
    if (row.activity_id) return actIds.has(row.activity_id);
    if (scope.activity_ids?.length) return false;
    if (scope.day) return dayKey(row[timeField]) === scope.day;
    return true;
  };

  const M = ((media.data ?? []) as any[]).filter((x) => inScope(x, 'captured_at'));
  const N = ((notes.data ?? []) as any[]).filter((x) => inScope(x));
  const F = ((fiches.data ?? []) as any[]).filter((x) => (x.author_id ? inScope(x) : !scope.activity_ids?.length && !scope.day && !scope.author_id));
  const C = ((contacts.data ?? []) as any[]).filter((x) => (x.author_id ? inScope(x) : !scope.activity_ids?.length && !scope.day && !scope.author_id));
  const T = (transcripts.data ?? []) as any[];
  const CM = ((comments.data ?? []) as any[]).filter((x) => !scope.author_id || x.author_id === scope.author_id);
  const mediaById = new Map(M.map((x) => [x.id, x]));

  const out: string[] = [];
  const images: CorpusImage[] = [];
  const maxImages = opts.maxImages ?? 0;

  out.push('# OBSERVATEURS');
  for (const p of profiles ?? []) out.push(`- ${p.short_name || p.full_name} : ${p.full_name ?? ''}, ${p.organization ?? ''}`);
  out.push('');

  const groups = new Map<string | null, any[]>();
  for (const a of activities) groups.set(a.id, []);
  groups.set(null, []);
  const push = (actId: string | null, line: { t: string; text: string }) => {
    const key = actId && groups.has(actId) ? actId : null;
    groups.get(key)!.push(line);
  };

  for (const x of M) {
    const tag = `[${name(x.author_id)}, ${KIND_FR[x.kind] ?? x.kind} ${H(x.captured_at)}]`;
    const bits: string[] = [];
    if (x.title) bits.push(`titre : ${x.title}`);
    if (x.caption) bits.push(`légende : ${x.caption}`);
    if (x.description) bits.push(`description : ${x.description}`);
    if (x.duration_s) bits.push(`durée ${Math.round(x.duration_s / 60)} min`);
    if (x.parent_id) {
      const parent = mediaById.get(x.parent_id);
      if (parent) bits.push(`décrit la ${KIND_FR[parent.kind]} de ${H(parent.captured_at)}`);
    }
    const imgPath = x.kind === 'photo' || x.kind === 'card' ? x.thumb_path : x.kind === 'video' ? (x.frames ?? [])[0] : null;
    if (imgPath && images.length < maxImages) {
      images.push({ path: imgPath, label: tag });
      bits.push(`image n°${images.length} jointe`);
      if (x.kind === 'video') {
        for (const fp of (x.frames ?? []).slice(1, 3)) {
          if (images.length >= maxImages) break;
          images.push({ path: fp, label: `${tag} (autre image de la vidéo)` });
        }
      }
    }
    push(x.activity_id, { t: x.captured_at, text: `${tag} ${bits.join(' ; ')}` });

    // Transcription : une ligne par ~30 s, avec l'heure exacte
    const tr = T.filter((t) => t.media_id === x.id && t.status === 'termine').sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    if (tr?.segments?.length) {
      const base = new Date(x.captured_at).getTime();
      const names: Record<string, string> = tr.speakers ?? {};
      let buf = '';
      let bufStart = 0;
      let bufSpk: string | null = null;
      const flush = () => {
        if (!buf.trim()) return;
        const who = bufSpk ? ` ${names[bufSpk] || bufSpk} :` : '';
        push(x.activity_id, { t: new Date(base + bufStart * 1000).toISOString(), text: `[${name(x.author_id)}, ${x.kind === 'voice' ? 'vocal' : x.kind === 'video' ? 'vidéo' : 'audio'} ${H(base + bufStart * 1000)}]${who} « ${buf.trim()} »` });
        buf = '';
      };
      for (const s of tr.segments) {
        const spk = s.speaker ?? null;
        if (buf && (spk !== bufSpk || s.start - bufStart > 30)) flush();
        if (!buf) {
          bufStart = s.start;
          bufSpk = spk;
        }
        buf += ' ' + s.text;
      }
      flush();
    }
  }
  for (const n of N) {
    const parent = n.media_id ? mediaById.get(n.media_id) : null;
    push(n.activity_id ?? parent?.activity_id ?? null, {
      t: n.created_at,
      text: `[${name(n.author_id)}, note ${H(n.created_at)}]${parent ? ` (sur la ${KIND_FR[parent.kind]} de ${H(parent.captured_at)})` : ''} ${n.body}`,
    });
  }
  for (const f of F) {
    const fields = Object.entries(f.data ?? {})
      .filter(([k, v]) => v !== '' && v != null && k !== 'reference' && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => `${k} : ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' ; ');
    push(f.activity_id ?? null, { t: f.created_at, text: `[${name(f.author_id)}, ${FICHE_FR[f.type] ?? f.type} « ${f.title} »] ${fields}` });
  }
  for (const c of C) {
    const fields = [c.organization, c.role, c.country, c.email, c.phone, c.status && `suivi : ${c.status}`, c.projects?.length && `projets : ${c.projects.join(', ')}`, c.notes && `notes : ${c.notes}`]
      .filter(Boolean)
      .join(' ; ');
    push(c.activity_id ?? null, { t: c.created_at, text: `[${name(c.author_id)}, contact « ${c.name} »] ${fields}` });
  }
  for (const c of CM) {
    const target = mediaById.get(c.target_id);
    const actId = target?.activity_id ?? (actIds.has(c.target_id) ? c.target_id : null);
    if ((scope.activity_ids?.length || scope.day) && !actId) continue;
    push(actId, { t: c.created_at, text: `[${name(c.author_id)}, commentaire ${H(c.created_at)}] ${c.body}` });
  }

  for (const a of activities) {
    const lines = groups.get(a.id)!;
    out.push(`# ACTIVITÉ : ${a.title}`);
    out.push(`${dayFmt.format(new Date(a.starts_at))}, ${H(a.starts_at)}–${H(a.ends_at)} · ${a.venue ?? ''}, ${a.city ?? ''}${a.description ? ` · ${a.description}` : ''}`);
    if (!lines.length) out.push('(aucune observation enregistrée)');
    for (const l of lines.sort((x, y) => x.t.localeCompare(y.t))) out.push(l.text);
    out.push('');
  }
  const loose = groups.get(null)!;
  if (loose.length) {
    out.push('# HORS ACTIVITÉ (fiches, contacts, notes générales)');
    for (const l of loose.sort((x, y) => x.t.localeCompare(y.t))) out.push(l.text);
  }

  return {
    text: out.join('\n'),
    images,
    stats: { activities: activities.length, media: M.length, notes: N.length, fiches: F.length, contacts: C.length },
  };
}

export async function loadImages(sb: SupabaseClient, images: CorpusImage[]): Promise<{ label: string; base64: string }[]> {
  const res = await Promise.all(
    images.map(async (im) => {
      const data = await download(sb, im.path);
      if (!data) return null;
      const buf = Buffer.from(await data.arrayBuffer());
      if (buf.length > 4.5 * 1024 * 1024) return null;
      return { label: im.label, base64: buf.toString('base64') };
    }),
  );
  return res.filter(Boolean) as { label: string; base64: string }[];
}
