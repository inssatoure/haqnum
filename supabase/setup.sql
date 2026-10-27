-- MIN Observateur : installation complète (schéma + données). À coller en une fois dans Supabase > SQL Editor.
-- AVANT d'exécuter : remplacez issa@exemple.com et moctar@exemple.com plus bas (section « mission_invites »).

-- MIN Observateur : schéma complet
-- À coller dans Supabase > SQL Editor (ou `supabase db push`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Profils, missions, membres
-- ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  short_name text,
  organization text,
  role_title text,
  country text,
  phone text,
  website text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date,
  ends_on date,
  timezone text not null default 'Europe/Paris',
  created_at timestamptz not null default now()
);

create table if not exists public.mission_members (
  mission_id uuid not null references public.missions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'observateur' check (role in ('observateur', 'admin')),
  created_at timestamptz not null default now(),
  primary key (mission_id, user_id)
);

-- Invitations : un e-mail listé ici rejoint la mission à l'inscription.
create table if not exists public.mission_invites (
  mission_id uuid not null references public.missions(id) on delete cascade,
  email text not null,
  role text not null default 'observateur',
  full_name text,
  short_name text,
  organization text,
  color text,
  primary key (mission_id, email)
);

create or replace function public.is_member(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from mission_members where mission_id = m and user_id = auth.uid());
$$;

create or replace function public.is_admin(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from mission_members where mission_id = m and user_id = auth.uid() and role = 'admin');
$$;

-- Nouvel utilisateur : profil + adhésion si invité.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv record;
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  for inv in select * from mission_invites where lower(email) = lower(new.email) loop
    insert into mission_members (mission_id, user_id, role) values (inv.mission_id, new.id, inv.role)
    on conflict do nothing;
    update profiles set
      full_name = coalesce(inv.full_name, full_name),
      short_name = coalesce(inv.short_name, short_name),
      organization = coalesce(inv.organization, organization),
      color = coalesce(inv.color, color)
    where id = new.id;
  end loop;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- Historique de toutes les modifications
-- ---------------------------------------------------------------
create table if not exists public.history (
  id bigserial primary key,
  mission_id uuid,
  table_name text not null,
  row_id uuid not null,
  actor_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  at timestamptz not null default now()
);
create index if not exists history_row_idx on public.history (table_name, row_id);

create or replace function public.log_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into history (mission_id, table_name, row_id, actor_id, action, old_data, new_data)
  values (
    coalesce(new.mission_id, old.mission_id), tg_table_name, coalesce(new.id, old.id), auth.uid(), lower(tg_op),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

-- Horodatage serveur : sert de curseur de synchronisation.
create or replace function public.touch_server_updated_at() returns trigger
language plpgsql as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

-- ---------------------------------------------------------------
-- Tables synchronisées (même socle de colonnes)
-- id créé sur l'appareil -> aucune collision entre téléphones.
-- author_id null = donnée de référence (programme officiel...).
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['activities','assignments','media','notes','fiches','contacts','expenses','comments','transcripts','analyses','reports'] loop
    execute format($f$
      create table if not exists public.%I (
        id uuid primary key,
        mission_id uuid not null references public.missions(id) on delete cascade,
        author_id uuid references auth.users(id),
        device text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        deleted_at timestamptz,
        server_updated_at timestamptz not null default now()
      )$f$, t);
  end loop;
end $$;

alter table public.activities
  add column if not exists title text not null default '',
  add column if not exists kind text,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists city text,
  add column if not exists venue text,
  add column if not exists address text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists transport text,
  add column if not exists description text,
  add column if not exists source text default 'perso';

alter table public.assignments
  add column if not exists activity_id uuid not null;

alter table public.media
  add column if not exists kind text not null default 'photo',
  add column if not exists source text,
  add column if not exists activity_id uuid,
  add column if not exists fiche_id uuid,
  add column if not exists contact_id uuid,
  add column if not exists parent_id uuid,
  add column if not exists title text,
  add column if not exists caption text,
  add column if not exists original_name text,
  add column if not exists mime text,
  add column if not exists size_bytes bigint,
  add column if not exists duration_s double precision,
  add column if not exists captured_at timestamptz,
  add column if not exists time_source text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists exif jsonb,
  add column if not exists parts jsonb not null default '[]'::jsonb,
  add column if not exists thumb_path text,
  add column if not exists frames jsonb not null default '[]'::jsonb,
  add column if not exists status text default 'local',
  add column if not exists description text;

alter table public.notes
  add column if not exists activity_id uuid,
  add column if not exists fiche_id uuid,
  add column if not exists media_id uuid,
  add column if not exists body text not null default '',
  add column if not exists lat double precision,
  add column if not exists lng double precision;

alter table public.fiches
  add column if not exists type text not null,
  add column if not exists title text not null default '',
  add column if not exists activity_id uuid,
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists lat double precision,
  add column if not exists lng double precision;

alter table public.contacts
  add column if not exists name text not null default '',
  add column if not exists organization text,
  add column if not exists role text,
  add column if not exists country text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists website text,
  add column if not exists linkedin text,
  add column if not exists swapcard text,
  add column if not exists status text default 'a_relancer',
  add column if not exists projects text[] not null default '{}',
  add column if not exists activity_id uuid,
  add column if not exists notes text,
  add column if not exists category text,
  add column if not exists vcard text;

alter table public.expenses
  add column if not exists amount numeric,
  add column if not exists currency text default 'EUR',
  add column if not exists category text,
  add column if not exists label text,
  add column if not exists spent_at timestamptz,
  add column if not exists receipt_media_id uuid;

alter table public.comments
  add column if not exists target_table text not null,
  add column if not exists target_id uuid not null,
  add column if not exists body text not null default '';

alter table public.transcripts
  add column if not exists media_id uuid not null,
  add column if not exists status text default 'en_cours',
  add column if not exists language text,
  add column if not exists text text,
  add column if not exists segments jsonb not null default '[]'::jsonb,
  add column if not exists speakers jsonb not null default '{}'::jsonb,
  add column if not exists provider text,
  add column if not exists error text;

alter table public.analyses
  add column if not exists kind text not null,
  add column if not exists activity_id uuid,
  add column if not exists day date,
  add column if not exists title text,
  add column if not exists content jsonb not null default '{}'::jsonb,
  add column if not exists markdown text,
  add column if not exists model text;

alter table public.reports
  add column if not exists kind text not null,
  add column if not exists title text,
  add column if not exists markdown text,
  add column if not exists params jsonb not null default '{}'::jsonb;

-- Index, triggers et règles de sécurité pour chaque table synchronisée
do $$
declare t text;
begin
  foreach t in array array['activities','assignments','media','notes','fiches','contacts','expenses','comments','transcripts','analyses','reports'] loop
    execute format('create index if not exists %I on public.%I (mission_id, server_updated_at)', t || '_sync_idx', t);
    execute format('drop trigger if exists touch_%I on public.%I', t, t);
    execute format('create trigger touch_%I before insert or update on public.%I for each row execute function public.touch_server_updated_at()', t, t);
    execute format('drop trigger if exists history_%I on public.%I', t, t);
    execute format('create trigger history_%I after insert or update or delete on public.%I for each row execute function public.log_history()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "lecture mission" on public.%I', t);
    execute format('create policy "lecture mission" on public.%I for select using (public.is_member(mission_id))', t);
    execute format('drop policy if exists "creation par auteur" on public.%I', t);
    execute format('create policy "creation par auteur" on public.%I for insert with check (public.is_member(mission_id) and (author_id = auth.uid() or (author_id is null and public.is_admin(mission_id))))', t);
    execute format('drop policy if exists "modification par auteur" on public.%I', t);
    execute format('create policy "modification par auteur" on public.%I for update using (author_id = auth.uid() or (author_id is null and public.is_admin(mission_id))) with check (author_id = auth.uid() or (author_id is null and public.is_admin(mission_id)))', t);
  end loop;
end $$;

-- Profils : lisibles par les membres d'une même mission, modifiables par soi-même.
alter table public.profiles enable row level security;
drop policy if exists "profils visibles" on public.profiles;
create policy "profils visibles" on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from mission_members a join mission_members b on a.mission_id = b.mission_id
    where a.user_id = auth.uid() and b.user_id = profiles.id)
);
drop policy if exists "profil perso" on public.profiles;
create policy "profil perso" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

alter table public.missions enable row level security;
drop policy if exists "missions visibles" on public.missions;
create policy "missions visibles" on public.missions for select using (public.is_member(id));

alter table public.mission_members enable row level security;
drop policy if exists "membres visibles" on public.mission_members;
create policy "membres visibles" on public.mission_members for select using (public.is_member(mission_id));

alter table public.mission_invites enable row level security;
drop policy if exists "invitations admin" on public.mission_invites;
create policy "invitations admin" on public.mission_invites for all using (public.is_admin(mission_id)) with check (public.is_admin(mission_id));

alter table public.history enable row level security;
drop policy if exists "historique visible" on public.history;
create policy "historique visible" on public.history for select using (public.is_member(mission_id));

-- ---------------------------------------------------------------
-- Stockage des fichiers originaux
-- Chemin : {mission_id}/{author_id}/{media_id}/{fichier}
-- ---------------------------------------------------------------
-- Pas de limite propre au bucket : c'est la limite du projet qui s'applique (50 Mo par fichier en offre gratuite).
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

drop policy if exists "media lecture mission" on storage.objects;
create policy "media lecture mission" on storage.objects for select
  using (bucket_id = 'media' and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "media ecriture auteur" on storage.objects;
create policy "media ecriture auteur" on storage.objects for insert
  with check (bucket_id = 'media' and (storage.foldername(name))[2] = auth.uid()::text
              and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "media maj auteur" on storage.objects;
create policy "media maj auteur" on storage.objects for update
  using (bucket_id = 'media' and (storage.foldername(name))[2] = auth.uid()::text);

-- Appelée à chaque connexion : rattache l'utilisateur aux missions où il est invité
-- (utile si le compte a été créé avant l'invitation).
create or replace function public.join_invited_missions() returns void
language plpgsql security definer set search_path = public as $$
declare inv record; em text;
begin
  select email into em from auth.users where id = auth.uid();
  insert into profiles (id, email, full_name) values (auth.uid(), em, split_part(em, '@', 1)) on conflict (id) do nothing;
  for inv in select * from mission_invites where lower(email) = lower(em) loop
    insert into mission_members (mission_id, user_id, role) values (inv.mission_id, auth.uid(), inv.role)
    on conflict (mission_id, user_id) do update set role = excluded.role;
    update profiles set
      full_name = coalesce(inv.full_name, profiles.full_name),
      short_name = coalesce(inv.short_name, profiles.short_name),
      organization = coalesce(inv.organization, profiles.organization),
      color = coalesce(inv.color, profiles.color)
    where id = auth.uid() and profiles.short_name is null;
  end loop;
end $$;
grant execute on function public.join_invited_missions() to authenticated;


-- Données de référence (générées par scripts/gen-seed.mjs)
insert into public.missions (id, name, starts_on, ends_on) values ('00000000-0000-4000-8000-000000002026', 'MIN 2026 – Chroniques', '2026-10-27', '2026-11-02') on conflict (id) do nothing;

-- Remplacez les e-mails puis créez les comptes (Authentication > Users > Add user).
insert into public.mission_invites (mission_id, email, role, full_name, short_name, organization, color) values
  ('00000000-0000-4000-8000-000000002026', 'issa@exemple.com', 'admin', 'Issa Touré', 'Issa', 'Azerty Agency / Metafrik', 'issa'),
  ('00000000-0000-4000-8000-000000002026', 'moctar@exemple.com', 'admin', 'Moctar Sidibé', 'Moctar', 'Kucibok', 'moctar')
on conflict (mission_id, email) do update set role = excluded.role, full_name = excluded.full_name, short_name = excluded.short_name, organization = excluded.organization, color = excluded.color;

insert into public.activities (id, mission_id, title, kind, starts_at, ends_at, city, venue, address, lat, lng, transport, source) values
  ('3b3b3c2a-4f53-4bf7-8b4b-2d55532ab567', '00000000-0000-4000-8000-000000002026', 'Rendez-vous dans le hall de l''hôtel', 'accueil', '2026-10-27T19:00:00+01:00', '2026-10-27T19:30:00+01:00', 'Aix-en-Provence', 'Odalys Centre Rotonde', '24 Bd Albert Charrier, 13090 Aix-en-Provence', 43.5249, 5.4437, null, 'officiel'),
  ('d32628d9-9783-4397-875d-b2234450e9a0', '00000000-0000-4000-8000-000000002026', 'Dîner de la délégation', 'repas', '2026-10-27T19:30:00+01:00', '2026-10-27T22:00:00+01:00', 'Aix-en-Provence', 'Le Bistrot', '5 rue Campra, Aix-en-Provence', 43.5299, 5.4471, 'À pied depuis l''hôtel', 'officiel'),
  ('02bf1edc-2e2b-48c9-8d92-787a58c71aad', '00000000-0000-4000-8000-000000002026', 'Départ de l''hôtel', 'transport', '2026-10-28T08:00:00+01:00', '2026-10-28T08:15:00+01:00', 'Aix-en-Provence', 'Odalys Centre Rotonde', '24 Bd Albert Charrier, 13090 Aix-en-Provence', 43.5249, 5.4437, null, 'officiel'),
  ('e0843d51-68d3-40db-8c99-ec713fafc04c', '00000000-0000-4000-8000-000000002026', 'Bus vers Avignon', 'transport', '2026-10-28T08:15:00+01:00', '2026-10-28T10:00:00+01:00', 'Aix-en-Provence', 'Arrêt de bus « Roi René »', 'Bd du Roi René, Aix-en-Provence', 43.5246, 5.4472, 'Bus à l''arrêt « Roi René » à 8h15', 'officiel'),
  ('69860c78-8d34-41ac-8d0c-64ec2e70eb9b', '00000000-0000-4000-8000-000000002026', 'Café à la Villa Créative', 'accueil', '2026-10-28T10:00:00+01:00', '2026-10-28T10:30:00+01:00', 'Avignon', 'Villa Créative', 'Avignon', 43.9478, 4.8085, null, 'officiel'),
  ('a5ed1032-ed1e-47fa-8433-5758f8c91b14', '00000000-0000-4000-8000-000000002026', 'Visite guidée du Grenier à Sel ou de la Villa Créative', 'visite', '2026-10-28T10:30:00+01:00', '2026-10-28T12:30:00+01:00', 'Avignon', 'Villa Créative', 'Avignon', 43.9478, 4.8085, null, 'officiel'),
  ('839b5640-2771-46ac-8e43-a25033ea0aa8', '00000000-0000-4000-8000-000000002026', 'Déjeuner à la Villa Créative', 'repas', '2026-10-28T12:30:00+01:00', '2026-10-28T13:50:00+01:00', 'Avignon', 'Villa Créative', 'Avignon', 43.9478, 4.8085, null, 'officiel'),
  ('706da91f-849b-4304-82d7-8e9cf916f650', '00000000-0000-4000-8000-000000002026', 'Bus vers Arles', 'transport', '2026-10-28T13:50:00+01:00', '2026-10-28T15:00:00+01:00', 'Avignon', 'Villa Créative', 'Avignon', 43.9478, 4.8085, 'Départ 13h50', 'officiel'),
  ('419eb518-a79e-4e33-8afb-c37c4b4897af', '00000000-0000-4000-8000-000000002026', 'Visite guidée d''Octobre Numérique – Faire Monde', 'visite', '2026-10-28T15:00:00+01:00', '2026-10-28T16:30:00+01:00', 'Arles', 'Octobre Numérique – Faire Monde', 'Arles', 43.6766, 4.6278, 'Anima Ludens, Le langage des phalènes (Mathilde Reynaud), Melencolia 110010100 (Guillaume Pascale)', 'officiel'),
  ('4bdd608f-a340-4aa0-81f0-91dbb3e39249', '00000000-0000-4000-8000-000000002026', 'Talks', 'talk', '2026-10-28T16:30:00+01:00', '2026-10-28T17:00:00+01:00', 'Arles', 'Octobre Numérique – Faire Monde', 'Arles', 43.6766, 4.6278, null, 'officiel'),
  ('6371e97d-ea65-4d81-8763-c054558bcd9f', '00000000-0000-4000-8000-000000002026', 'Matchmaking (rendez-vous d''environ 30 min)', 'matchmaking', '2026-10-28T17:00:00+01:00', '2026-10-28T18:30:00+01:00', 'Arles', 'Octobre Numérique – Faire Monde', 'Arles', 43.6766, 4.6278, null, 'officiel'),
  ('968c17d1-8a5a-44d4-85e2-37877f0bdb1a', '00000000-0000-4000-8000-000000002026', 'Cocktail', 'cocktail', '2026-10-28T18:30:00+01:00', '2026-10-28T20:00:00+01:00', 'Arles', 'Octobre Numérique – Faire Monde', 'Arles', 43.6766, 4.6278, null, 'officiel'),
  ('93ef12b5-6172-4365-8f50-e34f564c665b', '00000000-0000-4000-8000-000000002026', 'Bus retour vers Aix', 'transport', '2026-10-28T20:00:00+01:00', '2026-10-28T21:30:00+01:00', 'Arles', 'Octobre Numérique – Faire Monde', 'Arles', 43.6766, 4.6278, 'Départ 20h00', 'officiel'),
  ('5a9bef59-5444-41dd-8a16-f6d7420bf352', '00000000-0000-4000-8000-000000002026', 'Départ vers le forum', 'transport', '2026-10-29T08:10:00+01:00', '2026-10-29T09:00:00+01:00', 'Aix-en-Provence', 'Quai 18, avenue Mouret', 'Avenue Mouret, Aix-en-Provence', 43.5232, 5.4458, 'Bus toutes les 15 min de 8h30 à 10h, Quai 18 avenue Mouret', 'officiel'),
  ('43230bbd-2151-4f59-85fe-7c3c3d318d15', '00000000-0000-4000-8000-000000002026', 'Forum professionnel (conférences, talks, networking)', 'forum', '2026-10-29T09:00:00+01:00', '2026-10-29T17:00:00+01:00', 'Aix-en-Provence', 'Forum professionnel MIN', 'Aix-en-Provence', 43.5186, 5.4529, 'Traduction en direct', 'officiel'),
  ('85b9563e-2640-4f82-84b7-7237f0130247', '00000000-0000-4000-8000-000000002026', 'Matchmaking fonds européens : ARTEFUNKT (Louk), table 5', 'matchmaking', '2026-10-29T15:00:00+01:00', '2026-10-29T15:15:00+01:00', 'Aix-en-Provence', 'Forum professionnel MIN', 'Aix-en-Provence', 43.5186, 5.4529, null, 'officiel'),
  ('8233ecc6-2c0a-44d1-80a7-c2498790eaf9', '00000000-0000-4000-8000-000000002026', 'Cocktail et visite de Futurs Solaires', 'expo', '2026-10-29T18:00:00+01:00', '2026-10-29T20:30:00+01:00', 'Aix-en-Provence', 'La Manufacture (Futurs Solaires)', 'Aix-en-Provence', 43.5235, 5.4398, null, 'officiel'),
  ('71484f7f-1a2c-4e5c-815e-a3aaf315f911', '00000000-0000-4000-8000-000000002026', 'Avant-première : A Salty protest #2 (Étienne Guiol)', 'performance', '2026-10-29T21:00:00+01:00', '2026-10-29T22:30:00+01:00', 'Aix-en-Provence', 'La Manufacture (Futurs Solaires)', 'Aix-en-Provence', 43.5235, 5.4398, 'Lieu à confirmer', 'officiel'),
  ('f558e4e9-ff5e-4395-8f09-90a5b974bec1', '00000000-0000-4000-8000-000000002026', 'Départ vers le 6MIC', 'transport', '2026-10-30T08:10:00+01:00', '2026-10-30T09:00:00+01:00', 'Aix-en-Provence', 'Quai 18, avenue Mouret', 'Avenue Mouret, Aix-en-Provence', 43.5232, 5.4458, 'Bus toutes les 30 min de 8h30 à 10h', 'officiel'),
  ('f9e0276a-ac29-494a-8ea4-c21c2bbc0247', '00000000-0000-4000-8000-000000002026', 'Forum au 6MIC', 'forum', '2026-10-30T09:00:00+01:00', '2026-10-30T16:30:00+01:00', 'Aix-en-Provence', '6MIC', 'Aix-en-Provence', 43.5186, 5.4529, 'Déjeuner networking offert par le British Council', 'officiel'),
  ('60a9b582-89ff-4afc-8518-44cc6b6c10f3', '00000000-0000-4000-8000-000000002026', 'Matchmaking fonds européens : Diversion (Paul Bouchard), table 2', 'matchmaking', '2026-10-30T14:15:00+01:00', '2026-10-30T14:30:00+01:00', 'Aix-en-Provence', '6MIC', 'Aix-en-Provence', 43.5186, 5.4529, null, 'officiel'),
  ('74081be0-5287-4613-8348-ac4f64799202', '00000000-0000-4000-8000-000000002026', 'Dîner Chez les Copains', 'repas', '2026-10-30T19:30:00+01:00', '2026-10-30T22:00:00+01:00', 'Aix-en-Provence', 'Chez les Copains', 'Aix-en-Provence', 43.5283, 5.4474, null, 'officiel'),
  ('d6fc66de-ae36-4374-81b4-53bc6062327e', '00000000-0000-4000-8000-000000002026', 'Départ de l''hôtel', 'transport', '2026-10-31T08:00:00+01:00', '2026-10-31T08:15:00+01:00', 'Aix-en-Provence', 'Odalys Centre Rotonde', '24 Bd Albert Charrier, 13090 Aix-en-Provence', 43.5249, 5.4437, null, 'officiel'),
  ('b9d49b1d-dd5f-4eeb-8599-68c5cc08313c', '00000000-0000-4000-8000-000000002026', 'Bus vers Marseille', 'transport', '2026-10-31T08:15:00+01:00', '2026-10-31T10:00:00+01:00', 'Aix-en-Provence', 'Arrêt de bus « Roi René »', 'Bd du Roi René, Aix-en-Provence', 43.5246, 5.4472, 'Bus à l''arrêt « Roi René » à 8h15', 'officiel'),
  ('3829f4b1-3a7c-48ae-886f-48fdf7463ffb', '00000000-0000-4000-8000-000000002026', 'Expositions et EMAP Open Lab', 'expo', '2026-10-31T10:00:00+01:00', '2026-10-31T12:00:00+01:00', 'Marseille', 'Friche la Belle de Mai', '41 rue Jobin, 13003 Marseille', 43.3105, 5.3906, 'Predictive Constellations, Noemi Iglesias Barrios', 'officiel'),
  ('cbf42a3c-2d6e-47e3-8ccd-9f19aa786ad4', '00000000-0000-4000-8000-000000002026', 'Déjeuner aux Grandes Tables', 'repas', '2026-10-31T12:00:00+01:00', '2026-10-31T13:15:00+01:00', 'Marseille', 'Friche la Belle de Mai', '41 rue Jobin, 13003 Marseille', 43.3105, 5.3906, null, 'officiel'),
  ('809c3ec5-6d40-43cf-8cc9-4cc72438f28a', '00000000-0000-4000-8000-000000002026', 'Bus vers la Vieille Charité', 'transport', '2026-10-31T13:15:00+01:00', '2026-10-31T14:15:00+01:00', 'Marseille', 'Friche la Belle de Mai', '41 rue Jobin, 13003 Marseille', 43.3105, 5.3906, null, 'officiel'),
  ('78e84414-2e1c-4296-8a93-507ae6d421fb', '00000000-0000-4000-8000-000000002026', 'Visite guidée de la Vieille Charité', 'visite', '2026-10-31T14:15:00+01:00', '2026-10-31T15:30:00+01:00', 'Marseille', 'La Vieille Charité', '2 rue de la Charité, 13002 Marseille', 43.2996, 5.3677, null, 'officiel'),
  ('85503aac-3f55-4498-8e15-ae8f1f383add', '00000000-0000-4000-8000-000000002026', 'Bus vers la Citadelle', 'transport', '2026-10-31T15:30:00+01:00', '2026-10-31T16:00:00+01:00', 'Marseille', 'La Vieille Charité', '2 rue de la Charité, 13002 Marseille', 43.2996, 5.3677, null, 'officiel'),
  ('7b45ea86-8b4c-4d14-8e43-93e1518958f0', '00000000-0000-4000-8000-000000002026', 'Démo TRAVERSE (VR : Artou, L''Île des morts)', 'demo', '2026-10-31T16:00:00+01:00', '2026-10-31T18:40:00+01:00', 'Marseille', 'La Citadelle de Marseille', 'Fort Saint-Nicolas, Marseille', 43.292, 5.3635, null, 'officiel'),
  ('58aef840-c375-44c8-8bd3-f30937df5c7d', '00000000-0000-4000-8000-000000002026', 'Networking', 'cocktail', '2026-10-31T18:40:00+01:00', '2026-10-31T19:30:00+01:00', 'Marseille', 'La Citadelle de Marseille', 'Fort Saint-Nicolas, Marseille', 43.292, 5.3635, null, 'officiel'),
  ('a7c5c803-2012-4cac-8278-e0d4ab24b657', '00000000-0000-4000-8000-000000002026', 'Bus retour vers Aix', 'transport', '2026-10-31T19:30:00+01:00', '2026-10-31T20:45:00+01:00', 'Marseille', 'La Citadelle de Marseille', 'Fort Saint-Nicolas, Marseille', 43.292, 5.3635, null, 'officiel'),
  ('455cc4f7-cd18-4635-83c1-0f73e2f543b7', '00000000-0000-4000-8000-000000002026', 'Dîner au Papagayo', 'repas', '2026-10-31T20:45:00+01:00', '2026-10-31T23:00:00+01:00', 'Aix-en-Provence', 'Papagayo', 'Aix-en-Provence', 43.5268, 5.447, null, 'officiel'),
  ('2b2dd61a-bc9c-4c44-809d-fae6444f06e7', '00000000-0000-4000-8000-000000002026', 'Temps libre : expositions de la Biennale ou rendez-vous', 'libre', '2026-11-01T09:00:00+01:00', '2026-11-01T20:00:00+01:00', 'Aix-en-Provence', 'Odalys Centre Rotonde', '24 Bd Albert Charrier, 13090 Aix-en-Provence', 43.5249, 5.4437, null, 'officiel'),
  ('029a11df-c36d-4a58-874d-2387100b3e78', '00000000-0000-4000-8000-000000002026', 'Départ de l''hôtel (avant 12h)', 'transport', '2026-11-02T08:00:00+01:00', '2026-11-02T12:00:00+01:00', 'Aix-en-Provence', 'Odalys Centre Rotonde', '24 Bd Albert Charrier, 13090 Aix-en-Provence', 43.5249, 5.4437, null, 'officiel')
on conflict (id) do update set title = excluded.title, kind = excluded.kind, starts_at = excluded.starts_at, ends_at = excluded.ends_at, city = excluded.city, venue = excluded.venue, address = excluded.address, lat = excluded.lat, lng = excluded.lng, transport = excluded.transport;

insert into public.contacts (id, mission_id, name, organization, role, country, phone, category, status) values
  ('7b2cdad7-bd49-47ba-8d7f-462ebd24fac2', '00000000-0000-4000-8000-000000002026', 'Hannah Bellicha', 'Institut français – Pôle Création numérique et audiovisuelle', 'Cheffe de pôle', 'France', null, 'organisateur', 'aucun'),
  ('f8cf4601-590f-4c14-8e0d-264852494a7c', '00000000-0000-4000-8000-000000002026', 'Ambre Falkowiez', 'Institut français – Pôle Création numérique et audiovisuelle', 'Chargée de projet', 'France', null, 'organisateur', 'aucun'),
  ('1a39e715-b167-48eb-8cbc-96cb49ee611e', '00000000-0000-4000-8000-000000002026', 'Nadia Bouissehak', 'Institut français – Pôle Création numérique et audiovisuelle', null, 'France', null, 'organisateur', 'aucun'),
  ('9d01c808-df7c-49c5-8751-79070bdc1fdb', '00000000-0000-4000-8000-000000002026', 'Olivier Delpoux', 'Institut français – Pôle Création numérique et audiovisuelle', null, 'France', null, 'organisateur', 'aucun'),
  ('e31e9604-64ad-446e-82c0-b52783f1331d', '00000000-0000-4000-8000-000000002026', 'Ludovic Guillot', 'Institut français', 'Directeur de la création artistique et des industries culturelles', 'France', null, 'organisateur', 'aucun'),
  ('0eee4a52-3d66-4fac-844b-01c047b2c464', '00000000-0000-4000-8000-000000002026', 'Vianney Quignon', 'HACNUM', 'Coordinateur', 'France', '+33 7 77 84 11 39', 'organisateur', 'aucun'),
  ('719b48bd-7022-4ed4-8741-8c8c234f20f8', '00000000-0000-4000-8000-000000002026', 'Gwladys Bernard', 'HACNUM', 'Projets internationaux', 'France', null, 'organisateur', 'aucun'),
  ('d2ed7175-943a-4620-84c0-0a3275eae2a0', '00000000-0000-4000-8000-000000002026', 'Céline Berthoumieux', 'HACNUM / Chroniques', 'Déléguée générale, co-directrice de Chroniques', 'France', null, 'organisateur', 'aucun'),
  ('558cb98e-d636-44de-8c83-780c022167dc', '00000000-0000-4000-8000-000000002026', 'Seda Grigoryan', 'ASA Armenia', null, 'Arménie', null, 'delegation', 'aucun'),
  ('d15f6841-5c80-4028-89c8-18fe54a70593', '00000000-0000-4000-8000-000000002026', 'Junior François Adasopo', 'Lumartis', null, 'Burundi', null, 'delegation', 'aucun'),
  ('1dd008a4-8840-4c00-8abf-40df6ed11f01', '00000000-0000-4000-8000-000000002026', 'Gabriela Moldovan', null, 'Curatrice', 'Roumanie', null, 'delegation', 'aucun'),
  ('2fed575c-eda1-4210-8736-ce9e657f8387', '00000000-0000-4000-8000-000000002026', 'Moctar Sidibé', 'Kucibok', null, 'Sénégal', null, 'delegation', 'aucun'),
  ('22b965bd-8f53-4d21-8891-30f381f6da2f', '00000000-0000-4000-8000-000000002026', 'Balé Hormo', 'WenakLabs', null, 'Tchad', null, 'delegation', 'aucun'),
  ('14c823aa-6a65-4e3a-82c1-f5f119d317bf', '00000000-0000-4000-8000-000000002026', 'Issa Touré', 'Azerty Agency / Metafrik', 'Fondateur', 'Sénégal', null, 'delegation', 'aucun'),
  ('f2b3cf38-e78f-406f-86cf-23c2d9f379a4', '00000000-0000-4000-8000-000000002026', 'Louk', 'ARTEFUNKT', 'Fonds européens', null, null, 'matchmaking', 'aucun'),
  ('84f3bda1-1776-4cd7-8167-7809dac016c0', '00000000-0000-4000-8000-000000002026', 'Paul Bouchard', 'Diversion', 'Fonds européens', null, null, 'matchmaking', 'aucun')
on conflict (id) do nothing;

insert into public.fiches (id, mission_id, type, title, data) values
  ('c61f8704-9de5-4c5a-868f-b31cc4d0e7ea', '00000000-0000-4000-8000-000000002026', 'oeuvre', 'Anima Ludens', '{"artistes":"","description":"Imaginaires du jeu vidéo japonais","lieu":"Octobre Numérique – Faire Monde, Arles","type_oeuvre":"jeu vidéo","reference":true}'::jsonb),
  ('c4dbe93c-f78e-45f3-8f11-1f65ccc7a8dd', '00000000-0000-4000-8000-000000002026', 'oeuvre', 'Le langage des phalènes', '{"artistes":"Mathilde Reynaud","description":"","lieu":"Octobre Numérique – Faire Monde, Arles","type_oeuvre":"","reference":true}'::jsonb),
  ('d562b8ff-c638-45d5-8dc5-9f17b0008bb8', '00000000-0000-4000-8000-000000002026', 'oeuvre', 'Melencolia 110010100', '{"artistes":"Guillaume Pascale","description":"","lieu":"Octobre Numérique – Faire Monde, Arles","type_oeuvre":"","reference":true}'::jsonb),
  ('9619d261-9848-40e5-8af7-f32fccd559b0', '00000000-0000-4000-8000-000000002026', 'oeuvre', 'Futurs Solaires', '{"artistes":"","description":"","lieu":"La Manufacture, Aix-en-Provence","type_oeuvre":"","reference":true}'::jsonb),
  ('a5bb2a4d-f56e-4eeb-835c-ec44cb5ee6a7', '00000000-0000-4000-8000-000000002026', 'oeuvre', 'A Salty protest #2', '{"artistes":"Étienne Guiol","description":"Avant-première","lieu":"Aix-en-Provence","type_oeuvre":"performance","reference":true}'::jsonb),
  ('d455af78-b75f-483f-8fc6-56eb96f99fac', '00000000-0000-4000-8000-000000002026', 'oeuvre', 'Predictive Constellations', '{"artistes":"Noemi Iglesias Barrios","description":"EMAP Open Lab","lieu":"Friche la Belle de Mai, Marseille","type_oeuvre":"","reference":true}'::jsonb),
  ('fea68224-19cb-4c61-8623-51d8755dadb1', '00000000-0000-4000-8000-000000002026', 'oeuvre', 'TRAVERSE – Artou', '{"artistes":"","description":"Œuvre VR","lieu":"La Citadelle de Marseille","type_oeuvre":"VR/XR","reference":true}'::jsonb),
  ('1d054572-5fbc-497c-825d-de172e8c2477', '00000000-0000-4000-8000-000000002026', 'oeuvre', 'TRAVERSE – L''Île des morts', '{"artistes":"","description":"Œuvre VR","lieu":"La Citadelle de Marseille","type_oeuvre":"VR/XR","reference":true}'::jsonb)
on conflict (id) do nothing;
