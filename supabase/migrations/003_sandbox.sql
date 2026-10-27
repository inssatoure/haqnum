-- Bac à sable : une mission de test séparée, pour essayer les enregistrements sans toucher à la vraie mission.
-- Les données y sont gardées. À exécuter une fois dans Supabase > SQL Editor.

insert into public.missions (id, name, starts_on, ends_on)
values ('00000000-0000-4000-8000-00000000b0b0', 'Bac à sable (tests)', '2026-10-27', '2026-11-02')
on conflict (id) do nothing;

-- Mêmes membres et mêmes invitations que la vraie mission.
insert into public.mission_members (mission_id, user_id, role)
select '00000000-0000-4000-8000-00000000b0b0', user_id, role from public.mission_members
where mission_id = '00000000-0000-4000-8000-000000002026'
on conflict do nothing;

insert into public.mission_invites (mission_id, email, role, full_name, short_name, organization, color)
select '00000000-0000-4000-8000-00000000b0b0', email, role, full_name, short_name, organization, color from public.mission_invites
where mission_id = '00000000-0000-4000-8000-000000002026'
on conflict do nothing;

-- Copie du programme et des données de référence (identifiants transformés, comme dans l'app).
create or replace function pg_temp.sbx(u uuid) returns uuid language sql immutable as $$
  select (lpad(to_hex((('x' || substr(u::text, 1, 8))::bit(32)::bigint # 2779096485::bigint)), 8, '0') || substr(u::text, 9))::uuid
$$;

insert into public.activities (id, mission_id, author_id, title, kind, starts_at, ends_at, city, venue, address, lat, lng, transport, description, source)
select pg_temp.sbx(id), '00000000-0000-4000-8000-00000000b0b0', null, title, kind, starts_at, ends_at, city, venue, address, lat, lng, transport, description, source
from public.activities where mission_id = '00000000-0000-4000-8000-000000002026' and author_id is null
on conflict (id) do nothing;

insert into public.contacts (id, mission_id, author_id, name, organization, role, country, phone, category, status)
select pg_temp.sbx(id), '00000000-0000-4000-8000-00000000b0b0', null, name, organization, role, country, phone, category, status
from public.contacts where mission_id = '00000000-0000-4000-8000-000000002026' and author_id is null
on conflict (id) do nothing;

insert into public.fiches (id, mission_id, author_id, type, title, data)
select pg_temp.sbx(id), '00000000-0000-4000-8000-00000000b0b0', null, type, title, data
from public.fiches where mission_id = '00000000-0000-4000-8000-000000002026' and author_id is null
on conflict (id) do nothing;
