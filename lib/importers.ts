// Import d'activités (ICS, CSV) et lecture de QR codes / vCard.

import { parisToIso } from './time';

export interface ActivityInput {
  title: string;
  starts_at: string;
  ends_at: string;
  venue?: string | null;
  city?: string | null;
  description?: string | null;
  kind?: string | null;
}

export function parseIcs(text: string): ActivityInput[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const events = unfolded.split('BEGIN:VEVENT').slice(1);
  const out: ActivityInput[] = [];
  for (const ev of events) {
    const get = (k: string) => {
      const m = ev.match(new RegExp(`^${k}(;[^:\\n]*)?:(.*)$`, 'm'));
      return m ? { params: m[1] ?? '', value: m[2].trim() } : null;
    };
    const s = get('DTSTART');
    const e = get('DTEND');
    const sum = get('SUMMARY');
    if (!s || !sum) continue;
    const start = icsDate(s.value, s.params);
    const end = e ? icsDate(e.value, e.params) : new Date(new Date(start).getTime() + 30 * 60_000).toISOString();
    out.push({
      title: unescapeIcs(sum.value),
      starts_at: start,
      ends_at: end,
      venue: get('LOCATION') ? unescapeIcs(get('LOCATION')!.value) : null,
      description: get('DESCRIPTION') ? unescapeIcs(get('DESCRIPTION')!.value).slice(0, 2000) : null,
      kind: 'rdv',
    });
  }
  return out;
}

function icsDate(v: string, params: string): string {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return new Date(v).toISOString();
  const [, y, mo, d, h = '00', mi = '00', , z] = m;
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi)).toISOString();
  // Sans « Z » : on considère l'heure de Paris (TZID=Europe/Paris ou heure locale)
  void params;
  return parisToIso(`${y}-${mo}-${d}`, `${h}:${mi}`);
}

function unescapeIcs(s: string) {
  return s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

export function parseCsvActivities(text: string): ActivityInput[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const header = lines[0].toLowerCase().split(sep).map((h) => h.trim());
  const hasHeader = header.some((h) => /titre|title|date/.test(h));
  const idx = (names: string[], fallback: number) => {
    const i = header.findIndex((h) => names.includes(h));
    return hasHeader && i >= 0 ? i : fallback;
  };
  const iT = idx(['titre', 'title'], 0);
  const iD = idx(['date', 'jour'], 1);
  const iS = idx(['debut', 'début', 'start'], 2);
  const iE = idx(['fin', 'end'], 3);
  const iL = idx(['lieu', 'location', 'venue'], 4);
  const iC = idx(['ville', 'city'], 5);
  const out: ActivityInput[] = [];
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const c = splitCsv(line, sep);
    if (!c[iT] || !c[iD] || !c[iS]) continue;
    const start = parisToIso(c[iD].trim(), c[iS].trim().replace('h', ':'));
    const end = c[iE] ? parisToIso(c[iD].trim(), c[iE].trim().replace('h', ':')) : new Date(new Date(start).getTime() + 30 * 60_000).toISOString();
    out.push({ title: c[iT].trim(), starts_at: start, ends_at: end, venue: c[iL]?.trim() || null, city: c[iC]?.trim() || null, kind: 'rdv' });
  }
  return out;
}

function splitCsv(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (ch === sep && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

// ------------------------------------------------------------------
// QR codes : vCard, MECARD, LinkedIn, Swapcard, URL
// ------------------------------------------------------------------
export interface ContactInput {
  name?: string;
  organization?: string;
  role?: string;
  email?: string;
  phone?: string;
  website?: string;
  linkedin?: string;
  swapcard?: string;
  country?: string;
  vcard?: string;
}

export function parseQr(text: string): ContactInput {
  const t = text.trim();
  if (/^BEGIN:VCARD/i.test(t)) return { ...parseVcard(t), vcard: t };
  if (/^MECARD:/i.test(t)) return parseMecard(t);
  if (/linkedin\.com/i.test(t)) return { linkedin: t };
  if (/swapcard\.com/i.test(t)) return { swapcard: t };
  if (/^mailto:/i.test(t)) return { email: t.replace(/^mailto:/i, '').split('?')[0] };
  if (/^tel:/i.test(t)) return { phone: t.replace(/^tel:/i, '') };
  if (/^https?:\/\//i.test(t)) return { website: t };
  if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(t)) return { email: t };
  return { name: t.slice(0, 120) };
}

export function parseVcard(v: string): ContactInput {
  const unfolded = v.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const out: ContactInput = {};
  for (const line of lines) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).split(';')[0].toUpperCase().replace(/^ITEM\d+\./, '');
    const val = line.slice(i + 1).replace(/\\,/g, ',').replace(/\\;/g, ';').trim();
    if (key === 'FN') out.name = val;
    else if (key === 'N' && !out.name) {
      const [last, first] = val.split(';');
      out.name = [first, last].filter(Boolean).join(' ');
    } else if (key === 'ORG') out.organization = val.split(';').filter(Boolean).join(' – ');
    else if (key === 'TITLE' || key === 'ROLE') out.role = out.role || val;
    else if (key === 'EMAIL') out.email = out.email || val;
    else if (key === 'TEL') out.phone = out.phone || val;
    else if (key === 'URL') {
      if (/linkedin/i.test(val)) out.linkedin = val;
      else if (/swapcard/i.test(val)) out.swapcard = val;
      else out.website = out.website || val;
    } else if (key === 'ADR') {
      const parts = val.split(';');
      if (parts[6]) out.country = parts[6];
    }
  }
  return out;
}

function parseMecard(t: string): ContactInput {
  const body = t.replace(/^MECARD:/i, '');
  const out: ContactInput = {};
  for (const f of body.split(/(?<!\\);/)) {
    const [k, ...rest] = f.split(':');
    const v = rest.join(':');
    if (k === 'N') {
      const [last, first] = v.split(',');
      out.name = [first, last].filter(Boolean).join(' ');
    } else if (k === 'TEL') out.phone = v;
    else if (k === 'EMAIL') out.email = v;
    else if (k === 'ORG') out.organization = v;
    else if (k === 'URL') out.website = v;
  }
  return out;
}

export function buildVcard(c: ContactInput & { name: string }): string {
  const esc = (s?: string | null) => (s ?? '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const parts = c.name.trim().split(/\s+/);
  const first = parts.slice(0, -1).join(' ') || parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(last)};${esc(first)};;;`, `FN:${esc(c.name)}`];
  if (c.organization) lines.push(`ORG:${esc(c.organization)}`);
  if (c.role) lines.push(`TITLE:${esc(c.role)}`);
  if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${c.email}`);
  if (c.phone) lines.push(`TEL;TYPE=CELL:${c.phone}`);
  if (c.website) lines.push(`URL:${c.website}`);
  if (c.linkedin) lines.push(`URL:${c.linkedin}`);
  if (c.country) lines.push(`ADR;TYPE=WORK:;;;;;;${esc(c.country)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}
