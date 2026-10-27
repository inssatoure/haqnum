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
