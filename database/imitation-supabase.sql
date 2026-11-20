-- BTM AI — Imitation minimale de Supabase pour tester les migrations sur un
-- PostgreSQL local (sans Docker). À n'utiliser QUE sur une base locale de test.
--
-- Reproduit : les rôles anon / authenticated / service_role, les droits par
-- défaut que Supabase donne sur le schéma public, auth.uid() / auth.jwt() /
-- auth.role() (lus dans request.jwt.claims comme PostgREST), une table
-- auth.users réduite aux colonnes utilisées par nos migrations, et un
-- realtime.messages factice.
--
-- NE reproduit PAS : Supabase Auth (inscription, connexion, jetons, e-mails),
-- PostgREST (l'API REST), Realtime, Storage, les extensions propres à Supabase.
-- Un test qui passe ici ne prouve rien sur ces services.

-- Rôles de l'API (sans connexion : on y entre avec SET ROLE dans les tests).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- Droits par défaut de Supabase sur public : tout pour les trois rôles. C'est
-- ce qui donne TRUNCATE, TRIGGER… aux comptes connectés tant qu'une migration
-- ne les retire pas : on le reproduit pour que les tests le voient.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- auth
-- ---------------------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  banned_until timestamptz,
  deleted_at timestamptz,
  is_anonymous boolean not null default false,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Mêmes définitions que Supabase : les revendications du jeton sont posées par
-- PostgREST dans request.jwt.claims ; les tests les posent avec set_config.
create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.email() returns text
language sql stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')::text
$$;

grant execute on function auth.jwt(), auth.uid(), auth.role(), auth.email() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- realtime (factice) : seulement ce que la migration admin_flow_realtime touche.
-- ---------------------------------------------------------------------------
create schema if not exists realtime;
grant usage on schema realtime to anon, authenticated, service_role;

create table if not exists realtime.messages (
  id bigserial primary key,
  topic text not null,
  extension text not null,
  payload jsonb,
  event text,
  private boolean default false,
  inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;
grant select on realtime.messages to authenticated;

create or replace function realtime.topic() returns text
language sql stable
as $$
  select nullif(current_setting('realtime.topic', true), '')::text
$$;
grant execute on function realtime.topic() to anon, authenticated, service_role;

-- Schéma « extensions » de Supabase (certaines fonctions y vivent).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
