// Génère supabase/migrations/002_seed.sql à partir de data/*.json
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const MISSION = '00000000-0000-4000-8000-000000002026';
const prog = JSON.parse(readFileSync(new URL('../data/programme.json', import.meta.url)));
const ref = JSON.parse(readFileSync(new URL('../data/reference.json', import.meta.url)));

const uid = (s) => {
  const h = createHash('md5').update(s).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const q = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

let sql = `-- Données de référence (générées par scripts/gen-seed.mjs)\n`;
sql += `insert into public.missions (id, name, starts_on, ends_on) values ('${MISSION}', 'MIN 2026 – Chroniques', '2026-10-27', '2026-11-02') on conflict (id) do nothing;\n\n`;
sql += `-- Remplacez les e-mails puis créez les comptes (Authentication > Users > Add user).\n`;
sql += `insert into public.mission_invites (mission_id, email, role, full_name, short_name, organization, color) values\n`;
sql += `  ('${MISSION}', 'issa@exemple.com', 'admin', 'Issa Touré', 'Issa', 'Azerty Agency / Metafrik', 'issa'),\n`;
sql += `  ('${MISSION}', 'moctar@exemple.com', 'admin', 'Moctar Sidibé', 'Moctar', 'Kucibok', 'moctar')\n`;
sql += `on conflict (mission_id, email) do update set role = excluded.role, full_name = excluded.full_name, short_name = excluded.short_name, organization = excluded.organization, color = excluded.color;\n\n`;

sql += `insert into public.activities (id, mission_id, title, kind, starts_at, ends_at, city, venue, address, lat, lng, transport, source) values\n`;
sql += prog.activities.map(([s, e, title, kind, v, transport]) => {
  const ven = prog.venues[v];
  return `  ('${uid('act:' + s + title)}', '${MISSION}', ${q(title)}, ${q(kind)}, '${s}:00+01:00', '${e}:00+01:00', ${q(ven.city)}, ${q(ven.name)}, ${q(ven.address)}, ${ven.lat}, ${ven.lng}, ${q(transport)}, 'officiel')`;
}).join(',\n');
sql += `\non conflict (id) do update set title = excluded.title, kind = excluded.kind, starts_at = excluded.starts_at, ends_at = excluded.ends_at, city = excluded.city, venue = excluded.venue, address = excluded.address, lat = excluded.lat, lng = excluded.lng, transport = excluded.transport;\n\n`;

sql += `insert into public.contacts (id, mission_id, name, organization, role, country, phone, website, category, status) values\n`;
sql += ref.contacts.map(([n, o, r, c, p, cat, w]) => `  ('${uid('contact:' + n)}', '${MISSION}', ${q(n)}, ${q(o)}, ${q(r)}, ${q(c)}, ${q(p)}, ${q(w)}, ${q(cat)}, 'aucun')`).join(',\n');
sql += `\non conflict (id) do nothing;\n\n`;

sql += `insert into public.fiches (id, mission_id, type, title, data) values\n`;
sql += ref.oeuvres.map(([t, a, d, l, type]) => `  ('${uid('oeuvre:' + t)}', '${MISSION}', 'oeuvre', ${q(t)}, ${q(JSON.stringify({ artistes: a, description: d, lieu: l, type_oeuvre: type, reference: true }))}::jsonb)`).join(',\n');
sql += `\non conflict (id) do nothing;\n`;

writeFileSync(new URL('../supabase/migrations/002_seed.sql', import.meta.url), sql);

// Même données en JSON pour l'app (premier lancement hors ligne / mode local)
const now = '2026-10-27T00:00:00Z';
const base = { mission_id: MISSION, author_id: null, created_at: now, updated_at: now };
const seed = {
  activities: prog.activities.map(([s, e, title, kind, v, transport]) => {
    const ven = prog.venues[v];
    return { ...base, id: uid('act:' + s + title), title, kind, starts_at: `${s}:00+01:00`, ends_at: `${e}:00+01:00`, city: ven.city, venue: ven.name, address: ven.address, lat: ven.lat, lng: ven.lng, transport: transport || null, source: 'officiel' };
  }),
  contacts: ref.contacts.map(([n, o, r, c, p, cat, w]) => ({ ...base, id: uid('contact:' + n), name: n, organization: o || null, role: r || null, country: c || null, phone: p || null, website: w || null, category: cat, status: 'aucun', projects: [] })),
  fiches: ref.oeuvres.map(([t, a, d, l, type]) => ({ ...base, id: uid('oeuvre:' + t), type: 'oeuvre', title: t, data: { artistes: a, description: d, lieu: l, type_oeuvre: type, reference: true } })),
};
writeFileSync(new URL('../data/seed.json', import.meta.url), JSON.stringify(seed, null, 1));
console.log('002_seed.sql écrit');
