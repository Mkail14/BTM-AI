-- BTM AI — Base complète : tables, règles (contraintes, RLS), déclencheurs, vues,
-- fonctions et données de référence (mots du lexique, réglages).
--
-- FICHIER GÉNÉRÉ par `pnpm db:complet` : ne pas le modifier à la main.
-- Source : supabase/migrations, mises bout à bout dans l'ordre d'application.
-- Toute modification de la base passe par une nouvelle migration, puis on regénère ce fichier.
--
-- Sur Supabase : à jouer sur un projet vide (Auth fournit le schéma auth).
-- Sur un PostgreSQL local : jouer d'abord database/imitation-supabase.sql (voir database/README.md).
--
-- 68 migrations · 41 tables dans le schéma public :
--   ai_providers, ai_usage, app_reviews, awa_branches, awa_cleanup_ignored, awa_grammar,
--   awa_knowledge, awa_lexicon, awa_library_chunks, awa_library_documents, awa_memories,
--   awa_partner_keys, awa_personalities, awa_questions, awa_settings, awa_word_requests,
--   awa_words, code_exam_bookings, code_exam_requests, conversations, developer_accounts,
--   developer_keys, developer_widgets, drive_connections, known_devices, mesh_actions,
--   mesh_devices, mesh_messages, messages, partners, profiles, saved_addresses, site_settings,
--   site_status_log, sos_alerts, sos_contacts, voice_corrections, voice_prints, wallet_pins,
--   wallet_transactions, wallets

-- ============================================================================
-- 20261027000000_init.sql
-- ============================================================================

-- BTM AI — schéma initial
-- Profils, conversations persistantes, messages, limitation de débit.
-- Toutes les tables exposées sont protégées par RLS : chaque utilisateur ne
-- voit et ne modifie que ses propres données.

-- ---------------------------------------------------------------------------
-- Fonction utilitaire : mise à jour de updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profils
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Création automatique du profil à l'inscription.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Nouvelle conversation'
    check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

alter table public.conversations enable row level security;

create policy "conversations_select_own" on public.conversations
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "conversations_insert_own" on public.conversations
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "conversations_update_own" on public.conversations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "conversations_delete_own" on public.conversations
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 40000),
  status text not null default 'complete'
    check (status in ('complete', 'interrupted', 'error')),
  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

create policy "messages_select_own" on public.messages
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- On ne peut insérer un message que dans une conversation qui nous appartient.
create policy "messages_insert_own" on public.messages
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

-- Pas de politique UPDATE : les messages sont immuables.
-- La suppression passe par celle de la conversation (on delete cascade).

-- Chaque nouveau message fait remonter la conversation dans l'historique.
create or replace function public.touch_conversation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- Les visiteurs anonymes n'ont aucun accès à ces tables.
revoke all on public.profiles, public.conversations, public.messages from anon;

-- ---------------------------------------------------------------------------
-- Limitation de débit (compteurs à fenêtre fixe)
-- Schéma « private » non exposé par l'API REST de Supabase.
-- Les clés sont des empreintes HMAC : aucune adresse IP en clair.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.rate_limit_counters (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

create index rate_limit_counters_window_idx on private.rate_limit_counters (window_start);

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_limit <= 0 or p_window_seconds <= 0 or char_length(p_key) > 200 then
    raise exception 'invalid rate limit arguments';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into private.rate_limit_counters as c (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = c.count + 1
  returning c.count into v_count;

  -- Nettoyage opportuniste des fenêtres expirées (conservées 2 jours maximum).
  if random() < 0.01 then
    delete from private.rate_limit_counters
    where window_start < now() - interval '2 days';
  end if;

  return query select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_window + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer)
  to service_role;

-- ============================================================================
-- 20261027120000_protected_admin.sql
-- ============================================================================

-- BTM AI — compte administrateur protégé
-- Les adresses listées dans private.protected_admins reçoivent le rôle
-- administrateur (app_metadata.role = 'admin') dès que l'e-mail est confirmé,
-- et ne peuvent plus être supprimées, bannies, rétrogradées ni changer d'adresse.
-- Pour lever la protection : supprimer la ligne de private.protected_admins.

create table private.protected_admins (
  email text primary key check (email = lower(email))
);

insert into private.protected_admins (email) values ('contact@btm.yt');

create or replace function private.is_protected_admin(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.protected_admins where email = lower(p_email)
  );
$$;

-- Attribue le rôle et refuse toute modification qui ferait perdre le compte.
create or replace function private.enforce_protected_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.email_confirmed_at is not null
     and private.is_protected_admin(old.email) then
    if new.email is distinct from old.email then
      raise exception 'Compte administrateur protégé : changement d''adresse interdit.';
    end if;
    if new.deleted_at is not null then
      raise exception 'Compte administrateur protégé : suppression interdite.';
    end if;
    if new.banned_until is not null and new.banned_until > now() then
      raise exception 'Compte administrateur protégé : bannissement interdit.';
    end if;
  end if;

  -- Rôle accordé seulement après confirmation de l'e-mail : s'inscrire avec
  -- l'adresse ne suffit pas, il faut en contrôler la boîte de réception.
  if new.email_confirmed_at is not null and private.is_protected_admin(new.email) then
    new.raw_app_meta_data :=
      coalesce(new.raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb;
  end if;

  return new;
end;
$$;

create or replace function private.prevent_protected_admin_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_protected_admin(old.email) then
    raise exception 'Compte administrateur protégé : suppression interdite.';
  end if;
  return old;
end;
$$;

create trigger protected_admin_enforce
  before insert or update on auth.users
  for each row execute function private.enforce_protected_admin();

create trigger protected_admin_no_delete
  before delete on auth.users
  for each row execute function private.prevent_protected_admin_delete();

revoke all on all functions in schema private from public, anon, authenticated;

-- Compte déjà confirmé avant cette migration : rôle appliqué immédiatement.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
where email_confirmed_at is not null
  and lower(email) in (select email from private.protected_admins);

-- ============================================================================
-- 20261028000000_profile_display_name_from_signup.sql
-- ============================================================================

-- Reprend le nom affiché saisi à l'inscription (options.data.display_name).
-- Ces métadonnées sont fournies par le client : la valeur est nettoyée et
-- tronquée ici, et ne sert qu'à l'affichage pour l'utilisateur lui-même.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := nullif(
    left(btrim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'display_name', ''), '\s+', ' ', 'g')), 60),
    ''
  );
  insert into public.profiles (id, display_name) values (new.id, v_name);
  return new;
end;
$$;

-- ============================================================================
-- 20261028120000_admin_platform_stats.sql
-- ============================================================================

-- BTM AI — statistiques du tableau de bord d'administration.
-- Uniquement des comptages : le contenu des conversations n'est jamais lu.
-- Exécutable seulement avec la clé secrète (service_role), après vérification
-- du rôle administrateur côté serveur.
--
-- Visiteurs sans compte : leurs messages ne sont pas enregistrés ; on s'appuie
-- sur les compteurs de limitation de débit (empreintes HMAC d'appareils). Les
-- fenêtres « jour » de ces compteurs commencent à minuit UTC (3 h à Mayotte).

create or replace function public.admin_platform_stats(
  p_anon_daily_limit integer,
  p_user_daily_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day_window timestamptz := to_timestamp(floor(extract(epoch from now()) / 86400) * 86400);
  v_today date := (now() at time zone 'Indian/Mayotte')::date;
begin
  return jsonb_build_object(
    'users_total', (select count(*) from auth.users),
    'users_new_today', (
      select count(*) from auth.users where (created_at at time zone 'Indian/Mayotte')::date = v_today
    ),
    'users_new_7d', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'users_unconfirmed', (select count(*) from auth.users where email_confirmed_at is null),
    'users_active_7d', (
      select count(distinct user_id) from public.messages
      where role = 'user' and created_at >= now() - interval '7 days'
    ),
    'conversations_total', (select count(*) from public.conversations),
    'questions_today', (
      select count(*) from public.messages
      where role = 'user' and (created_at at time zone 'Indian/Mayotte')::date = v_today
    ),
    'questions_7d', (
      select count(*) from public.messages where role = 'user' and created_at >= now() - interval '7 days'
    ),
    'questions_30d', (
      select count(*) from public.messages where role = 'user' and created_at >= now() - interval '30 days'
    ),
    'answers_7d', (
      select count(*) from public.messages where role = 'assistant' and created_at >= now() - interval '7 days'
    ),
    'errors_7d', (
      select count(*) from public.messages
      where role = 'assistant' and status = 'error' and created_at >= now() - interval '7 days'
    ),
    'interrupted_7d', (
      select count(*) from public.messages
      where role = 'assistant' and status = 'interrupted' and created_at >= now() - interval '7 days'
    ),
    'anon_devices_today', (
      select count(*) from private.rate_limit_counters
      where key like 'anon-dev-day:%' and window_start = v_day_window
    ),
    'anon_messages_today', (
      select coalesce(sum(least(count, p_anon_daily_limit)), 0) from private.rate_limit_counters
      where key like 'anon-dev-day:%' and window_start = v_day_window
    ),
    'anon_devices_blocked_today', (
      select count(*) from private.rate_limit_counters
      where key like 'anon-dev-day:%' and window_start = v_day_window and count > p_anon_daily_limit
    ),
    'users_blocked_today', (
      select count(*) from private.rate_limit_counters
      where key like 'user-day:%' and window_start = v_day_window and count > p_user_daily_limit
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'questions', coalesce(m.questions, 0)) order by d.day), '[]'::jsonb)
      from (
        select g::date as day
        from generate_series((v_today - 13)::timestamp, v_today::timestamp, interval '1 day') as g
      ) d
      left join (
        select (created_at at time zone 'Indian/Mayotte')::date as day, count(*) as questions
        from public.messages
        where role = 'user' and created_at >= now() - interval '15 days'
        group by 1
      ) m on m.day = d.day
    )
  );
end;
$$;

revoke all on function public.admin_platform_stats(integer, integer) from public, anon, authenticated;
grant execute on function public.admin_platform_stats(integer, integer) to service_role;

-- ============================================================================
-- 20261028180000_profile_personality.sql
-- ============================================================================

-- Personnalité d'Awa choisie par l'utilisateur (null tant qu'il n'a pas choisi).
-- Modifiable par l'utilisateur via la politique profiles_update_own existante.
alter table public.profiles
  add column if not exists personality text
  check (personality is null or personality in ('mechante', 'gentille', 'cool'));

-- ============================================================================
-- 20261029000000_awa_brain.sql
-- ============================================================================

-- BTM AI — « cerveau » d'Awa
-- Ce qui fait Awa est stocké ici, indépendamment du modèle d'IA utilisé :
--   awa_settings   : nom, identité (caractère) et règles, modifiables sans déploiement ;
--   awa_knowledge  : fiches de connaissances vérifiées (Mayotte, BTM…) ;
--   awa_lexicon    : lexique français ↔ shimaoré validé par des locuteurs ;
--   awa_memories   : ce que chaque utilisateur connecté a dit de lui-même.
-- Les trois premières tables ne sont lisibles que par le serveur (clé secrète)
-- et les administrateurs (app_metadata.role = 'admin') ; la mémoire n'est
-- visible que par son propriétaire.

-- ---------------------------------------------------------------------------
-- Réglages (une seule ligne)
-- ---------------------------------------------------------------------------
create table public.awa_settings (
  id smallint primary key default 1 check (id = 1),
  name text not null default 'Awa' check (char_length(name) between 1 and 40),
  -- null : le texte par défaut défini dans le code est utilisé.
  identity text check (identity is null or char_length(identity) <= 8000),
  rules text check (rules is null or char_length(rules) <= 8000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.awa_settings (id) values (1);

create trigger awa_settings_set_updated_at
  before update on public.awa_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Connaissances
-- ---------------------------------------------------------------------------
create table public.awa_knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) between 1 and 4000),
  -- Mots-clés servant à choisir les fiches pertinentes pour une question.
  keywords text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger awa_knowledge_set_updated_at
  before update on public.awa_knowledge
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Lexique shimaoré validé
-- ---------------------------------------------------------------------------
create table public.awa_lexicon (
  id uuid primary key default gen_random_uuid(),
  french text not null check (char_length(french) between 1 and 200),
  shimaore text not null check (char_length(shimaore) between 1 and 200),
  context text check (context is null or char_length(context) <= 120),
  -- Obligatoire : une entrée n'existe que si un locuteur l'a relue.
  validated_by text not null check (char_length(validated_by) between 1 and 120),
  validated_at date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Accès administrateur (réglages, connaissances, lexique)
-- ---------------------------------------------------------------------------
alter table public.awa_settings enable row level security;
alter table public.awa_knowledge enable row level security;
alter table public.awa_lexicon enable row level security;

create policy "awa_settings_admin_all" on public.awa_settings
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "awa_knowledge_admin_all" on public.awa_knowledge
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "awa_lexicon_admin_all" on public.awa_lexicon
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

-- La ligne de réglages est unique : pas de suppression, même par un admin.
create policy "awa_settings_no_delete" on public.awa_settings
  as restrictive for delete to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- Mémoire par utilisateur
-- ---------------------------------------------------------------------------
create table public.awa_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Une seule valeur par sorte (prenom, lieu, travail, age…) : la plus récente.
  kind text not null check (char_length(kind) between 1 and 40),
  content text not null check (char_length(content) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind)
);

create trigger awa_memories_set_updated_at
  before update on public.awa_memories
  for each row execute function public.set_updated_at();

alter table public.awa_memories enable row level security;

create policy "awa_memories_select_own" on public.awa_memories
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "awa_memories_insert_own" on public.awa_memories
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "awa_memories_update_own" on public.awa_memories
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "awa_memories_delete_own" on public.awa_memories
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.awa_settings, public.awa_knowledge, public.awa_lexicon, public.awa_memories from anon;

-- ============================================================================
-- 20261029120000_awa_personalities.sql
-- ============================================================================

-- BTM AI — comportement des 3 personnalités d'Awa, modifiable depuis /admin.
-- instructions null : le texte par défaut défini dans le code est utilisé.
-- Les garde-fous (pas d'insulte réelle, abandon du rôle en cas de détresse,
-- honnêteté, sécurité) restent fixés dans le code et ne sont pas modifiables ici.

-- Rappel de la migration 20261028180000 (sans effet si déjà appliquée).
alter table public.profiles
  add column if not exists personality text
  check (personality is null or personality in ('mechante', 'gentille', 'cool'));

create table if not exists public.awa_personalities (
  id text primary key check (id in ('mechante', 'gentille', 'cool')),
  instructions text check (instructions is null or char_length(instructions) <= 6000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.awa_personalities (id) values ('mechante'), ('gentille'), ('cool')
on conflict (id) do nothing;

create trigger awa_personalities_set_updated_at
  before update on public.awa_personalities
  for each row execute function public.set_updated_at();

alter table public.awa_personalities enable row level security;

create policy "awa_personalities_admin_all" on public.awa_personalities
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

-- Les trois lignes sont fixes : pas de suppression, même par un admin.
create policy "awa_personalities_no_delete" on public.awa_personalities
  as restrictive for delete to authenticated
  using (false);

revoke all on public.awa_personalities from anon;

-- ============================================================================
-- 20261029180000_awa_personality_behavior.sql
-- ============================================================================

-- BTM AI — personnalités d'Awa décrites par champs (attitude, façon de parler,
-- toujours, jamais, exemples) au lieu d'un bloc de texte libre.
-- behavior null : valeurs par défaut du code. L'ancienne colonne instructions
-- n'a jamais été renseignée ; elle est retirée.

alter table public.awa_personalities
  add column if not exists behavior jsonb
  check (behavior is null or (jsonb_typeof(behavior) = 'object' and octet_length(behavior::text) <= 16000));

alter table public.awa_personalities drop column if exists instructions;

-- ============================================================================
-- 20261030000000_personality_professionnelle.sql
-- ============================================================================

-- BTM AI — la personnalité « gentille » est remplacée par « professionnelle ».
-- Les utilisateurs qui avaient choisi « gentille » passent à « professionnelle » ;
-- l'éventuel réglage admin de « gentille » ne correspond plus et est effacé.

alter table public.profiles drop constraint if exists profiles_personality_check;
update public.profiles set personality = 'professionnelle' where personality = 'gentille';
alter table public.profiles
  add constraint profiles_personality_check
  check (personality is null or personality in ('mechante', 'professionnelle', 'cool'));

alter table public.awa_personalities drop constraint if exists awa_personalities_id_check;
update public.awa_personalities set id = 'professionnelle', behavior = null where id = 'gentille';
insert into public.awa_personalities (id) values ('professionnelle') on conflict (id) do nothing;
alter table public.awa_personalities
  add constraint awa_personalities_id_check
  check (id in ('mechante', 'professionnelle', 'cool'));

-- ============================================================================
-- 20261031000000_ai_providers.sql
-- ============================================================================

-- BTM AI — API d'IA ajoutées depuis /admin/modele-ia
-- Elles s'ajoutent, dans l'ordre de « position », après celles déclarées dans
-- les variables du serveur (AI_*, AI_2_*…). La clé est chiffrée par le serveur
-- (AES-256-GCM) avant d'être écrite : la base seule ne permet pas de la lire.
-- Aucune politique RLS : seule la clé secrète (serveur) accède à la table.

create table public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 60),
  provider text not null check (provider in ('anthropic', 'openai-compatible')),
  base_url text check (base_url is null or char_length(base_url) <= 300),
  model text not null check (char_length(model) between 1 and 200),
  api_key_encrypted text not null check (char_length(api_key_encrypted) <= 2000),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index ai_providers_position_idx on public.ai_providers (position, created_at);

alter table public.ai_providers enable row level security;
revoke all on public.ai_providers from anon, authenticated;

-- ============================================================================
-- 20261101000000_rate_limit_settings.sql
-- ============================================================================

-- BTM AI — Quotas de messages modifiables depuis /admin/modele-ia
-- null : les valeurs du code (src/lib/rate-limit/policies.ts) s'appliquent.
-- Format : { "anonymousDevice": { "minute": 6, "day": 30 }, "anonymousIp": {…}, "user": {…} }

alter table public.awa_settings
  add column rate_limits jsonb check (rate_limits is null or jsonb_typeof(rate_limits) = 'object');

-- ============================================================================
-- 20261102000000_admin_flow_realtime.sql
-- ============================================================================

-- BTM AI — Trajet des messages en direct sur /admin/modele-ia
-- Le serveur diffuse chaque étape sur le canal privé « admin-flow » (clé
-- secrète, hors RLS). Seuls les administrateurs peuvent l'écouter.

create policy "admin_flow_admin_read" on realtime.messages
  for select to authenticated
  using (
    (select realtime.topic()) = 'admin-flow'
    and realtime.messages.extension = 'broadcast'
    and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ============================================================================
-- 20261103000000_awa_words.sql
-- ============================================================================

-- BTM AI — Dictionnaire de mots français ↔ shimaoré (/admin/lexique)
-- À côté des expressions (awa_lexicon), des mots isolés : Awa reçoit ceux qui
-- apparaissent dans le message, et un lot plus large quand on parle shimaoré.
-- Lisible par le serveur (clé secrète) et les administrateurs uniquement.

create table public.awa_words (
  id uuid primary key default gen_random_uuid(),
  french text not null check (char_length(french) between 1 and 80),
  shimaore text not null check (char_length(shimaore) between 1 and 80),
  -- Facultatif : nom, verbe, nombre, famille…
  category text check (category is null or char_length(category) <= 40),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

-- Un même couple n'est enregistré qu'une fois (sans tenir compte des majuscules).
create unique index awa_words_pair_idx on public.awa_words (lower(french), lower(shimaore));

alter table public.awa_words enable row level security;

create policy "awa_words_admin_all" on public.awa_words
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================================
-- 20261103010000_lexicon_variants.sql
-- ============================================================================

-- BTM AI — Une expression du lexique, trois façons de la dire
-- { "professionnelle": "…", "mechante": "…", "cool": "…" } : Awa utilise la
-- version de la personnalité choisie, sinon la colonne shimaore.

alter table public.awa_lexicon
  add column variants jsonb not null default '{}'::jsonb check (jsonb_typeof(variants) = 'object');

-- ============================================================================
-- 20261104000000_awa_partner_keys.sql
-- ============================================================================

-- BTM AI — Sites de GROUPE BTM autorisés à faire parler Awa (route /api/awa)
-- Une ligne par site : empreinte SHA-256 (hexadécimal) du secret partagé avec
-- lui. Le secret lui-même n'est jamais stocké ici.
-- Aucune politique RLS : seule la clé secrète (serveur) accède à la table.

create table public.awa_partner_keys (
  site text primary key check (site in ('btm-batiment')),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.awa_partner_keys enable row level security;
revoke all on public.awa_partner_keys from anon, authenticated;

-- ============================================================================
-- 20261105000000_flow_cuts.sql
-- ============================================================================

-- BTM AI — Liens coupés sur le schéma de /admin/modele-ia
-- Liste des blocs débranchés : « personality », « settings », « knowledge »,
-- « lexicon », « memory », ou l'identifiant d'une API (« env-2 », « db-<uuid> »).
-- Vide : tout est branché.

alter table public.awa_settings
  add column flow_cuts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(flow_cuts) = 'array');

-- ============================================================================
-- 20261106000000_awa_word_requests.sql
-- ============================================================================

-- BTM AI — Mots shimaoré inconnus d'Awa, à traduire par un administrateur
-- Quand un utilisateur emploie un mot shimaoré qu'Awa ne connaît pas, le
-- serveur (clé secrète) l'ajoute ici ; l'administrateur donne la traduction
-- dans /admin/lexique et le mot entre dans le dictionnaire (awa_words).

create table public.awa_word_requests (
  id uuid primary key default gen_random_uuid(),
  shimaore text not null check (char_length(shimaore) between 1 and 80),
  -- Message où le mot est apparu (dernier en date), pour aider à traduire.
  example text check (example is null or char_length(example) <= 300),
  occurrences integer not null default 1 check (occurrences >= 1),
  status text not null default 'pending' check (status in ('pending', 'done', 'ignored')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Un mot n'est demandé qu'une fois (sans tenir compte des majuscules) ; ses retours augmentent occurrences.
create unique index awa_word_requests_word_idx on public.awa_word_requests (lower(shimaore));
create index awa_word_requests_pending_idx on public.awa_word_requests (status, last_seen_at desc);

alter table public.awa_word_requests enable row level security;

create policy "awa_word_requests_admin_all" on public.awa_word_requests
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

-- Signalement depuis le chat (clé secrète) : ajoute le mot ou compte un retour de plus.
create function public.report_unknown_word(p_shimaore text, p_example text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.awa_word_requests (shimaore, example)
  values (p_shimaore, left(p_example, 300))
  on conflict (lower(shimaore)) do update
    set occurrences = public.awa_word_requests.occurrences + 1,
        example = excluded.example,
        last_seen_at = now();
$$;

revoke execute on function public.report_unknown_word(text, text) from public, anon, authenticated;

-- ============================================================================
-- 20261107000000_ai_usage.sql
-- ============================================================================

-- BTM AI — Consommation des API d'IA, pour la barre « Crédit Google » du tableau de bord
-- Une ligne par jour et par modèle : jetons envoyés et reçus (chiffres donnés par l'API).
-- Écrite par le serveur (clé secrète), lisible par les administrateurs.

create table public.ai_usage (
  day date not null default (now() at time zone 'Indian/Mayotte')::date,
  model text not null check (char_length(model) between 1 and 200),
  requests integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (day, model)
);

alter table public.ai_usage enable row level security;

create policy "ai_usage_admin_read" on public.ai_usage
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create function public.record_ai_usage(p_model text, p_input bigint, p_output bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.ai_usage (model, requests, input_tokens, output_tokens)
  values (p_model, 1, greatest(p_input, 0), greatest(p_output, 0))
  on conflict (day, model) do update
    set requests = public.ai_usage.requests + 1,
        input_tokens = public.ai_usage.input_tokens + excluded.input_tokens,
        output_tokens = public.ai_usage.output_tokens + excluded.output_tokens;
$$;

revoke execute on function public.record_ai_usage(text, bigint, bigint) from public, anon, authenticated;

-- ============================================================================
-- 20261108000000_removed_apis.sql
-- ============================================================================

-- BTM AI — API retirées depuis /admin/circuit
-- Les API déclarées dans les variables du serveur (« env-1 », « env-2 »…) ne
-- peuvent pas être effacées de la base : on note seulement qu'elles sont
-- retirées de la chaîne. Vide : toutes les API du serveur sont utilisées.

alter table public.awa_settings
  add column removed_apis jsonb not null default '[]'::jsonb
    check (jsonb_typeof(removed_apis) = 'array');

-- ============================================================================
-- 20261110000000_code_exam_requests.sql
-- ============================================================================

-- BTM AI — Demandes de réservation de l'examen du code (La Poste), faites depuis la conversation
-- Le candidat choisit un créneau puis donne ses informations (vérifiées par le
-- serveur, src/lib/code-exam/candidate.ts). GROUPE BTM traite la demande.
-- Données personnelles : lisibles par le candidat et par les administrateurs seulement.

create table public.code_exam_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Créneau choisi (bureau La Poste et heure de début).
  center_id text not null check (char_length(center_id) between 1 and 20),
  center_name text not null check (char_length(center_name) between 1 and 100),
  starts_at timestamptz not null,
  exam_type text not null check (exam_type in ('B', 'A', 'OC', 'OEI')),
  -- Candidat.
  civility text not null check (civility in ('Mme', 'M.')),
  last_name text not null check (char_length(last_name) between 1 and 60),
  first_name text not null check (char_length(first_name) between 1 and 60),
  birth_date date not null,
  city text not null check (char_length(city) between 2 and 60),
  phone text not null check (phone ~ '^0[1-9][0-9]{8}$'),
  email text not null check (char_length(email) between 3 and 200),
  neph text not null check (neph ~ '^[0-9]{12}$'),
  snu boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'booked', 'cancelled')),
  created_at timestamptz not null default now()
);

create index code_exam_requests_user_idx on public.code_exam_requests (user_id, created_at desc);
create index code_exam_requests_pending_idx on public.code_exam_requests (created_at) where status = 'pending';

alter table public.code_exam_requests enable row level security;

create policy "code_exam_requests_select_own" on public.code_exam_requests
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "code_exam_requests_insert_own" on public.code_exam_requests
  for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'pending');

create policy "code_exam_requests_admin_read" on public.code_exam_requests
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

revoke all on public.code_exam_requests from anon;

-- ============================================================================
-- 20261111000000_wallets.sql
-- ============================================================================

-- BTM AI — Portefeuille : l'utilisateur recharge un solde (5 € à 150 €, plafonné à 150 €)
-- qui sert à payer les services partenaires (réservations…). Sa carte n'est jamais
-- enregistrée chez nous : le paiement passe par Stripe Checkout.
-- Lecture : chacun voit son solde et son historique. Écriture : uniquement le
-- serveur (clé secrète), par les fonctions ci-dessous, après vérification chez Stripe.

create table public.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance_cents integer not null default 0 check (balance_cents >= 0),
  updated_at timestamptz not null default now()
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- topup : recharge ; payment : achat chez un partenaire ; refund : remboursement sur le solde.
  kind text not null check (kind in ('topup', 'payment', 'refund')),
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  label text not null check (char_length(label) between 1 and 120),
  -- Moyen de paiement lisible (« Visa •••• 4242 », « Apple Pay »…), connu une fois payé.
  method text check (char_length(method) <= 60),
  stripe_session_id text unique,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index wallet_transactions_user_idx on public.wallet_transactions (user_id, created_at desc);

alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;

create policy "wallets_select_own" on public.wallets
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "wallet_transactions_select_own" on public.wallet_transactions
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "wallets_admin_read" on public.wallets
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "wallet_transactions_admin_read" on public.wallet_transactions
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

revoke all on public.wallets, public.wallet_transactions from anon;
revoke insert, update, delete on public.wallets, public.wallet_transactions from authenticated;

-- Recharge payée : crédite le solde une seule fois, même si Stripe prévient deux fois
-- (retour sur le site + webhook). Renvoie vrai si le solde vient d'être crédité.
create function public.wallet_complete_topup(p_session_id text, p_method text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  tx public.wallet_transactions;
begin
  select * into tx from public.wallet_transactions
  where stripe_session_id = p_session_id and kind = 'topup'
  for update;
  if not found or tx.status = 'succeeded' then
    return false;
  end if;

  update public.wallet_transactions
  set status = 'succeeded', method = left(p_method, 60), completed_at = now()
  where id = tx.id;

  insert into public.wallets (user_id, balance_cents) values (tx.user_id, tx.amount_cents)
  on conflict (user_id) do update
  set balance_cents = public.wallets.balance_cents + excluded.balance_cents, updated_at = now();
  return true;
end;
$$;

-- Recharge abandonnée ou refusée.
create function public.wallet_fail_topup(p_session_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.wallet_transactions
  set status = 'failed', completed_at = now()
  where stripe_session_id = p_session_id and kind = 'topup' and status = 'pending';
$$;

-- Paiement d'un service partenaire avec le solde. Renvoie l'id de l'opération,
-- ou null si le solde ne suffit pas (rien n'est débité).
create function public.wallet_spend(p_user_id uuid, p_amount_cents integer, p_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tx_id uuid;
begin
  if p_amount_cents <= 0 then
    raise exception 'Montant invalide';
  end if;
  update public.wallets
  set balance_cents = balance_cents - p_amount_cents, updated_at = now()
  where user_id = p_user_id and balance_cents >= p_amount_cents;
  if not found then
    return null;
  end if;
  insert into public.wallet_transactions (user_id, kind, amount_cents, status, label, method, completed_at)
  values (p_user_id, 'payment', p_amount_cents, 'succeeded', left(p_label, 120), 'Portefeuille', now())
  returning id into tx_id;
  return tx_id;
end;
$$;

-- Remboursement d'un service partenaire annulé : recrédite le solde.
create function public.wallet_refund(p_user_id uuid, p_amount_cents integer, p_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tx_id uuid;
begin
  if p_amount_cents <= 0 then
    raise exception 'Montant invalide';
  end if;
  insert into public.wallets (user_id, balance_cents) values (p_user_id, p_amount_cents)
  on conflict (user_id) do update
  set balance_cents = public.wallets.balance_cents + excluded.balance_cents, updated_at = now();
  insert into public.wallet_transactions (user_id, kind, amount_cents, status, label, method, completed_at)
  values (p_user_id, 'refund', p_amount_cents, 'succeeded', left(p_label, 120), 'Portefeuille', now())
  returning id into tx_id;
  return tx_id;
end;
$$;

revoke all on function public.wallet_complete_topup(text, text) from public, anon, authenticated;
revoke all on function public.wallet_fail_topup(text) from public, anon, authenticated;
revoke all on function public.wallet_spend(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.wallet_refund(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.wallet_complete_topup(text, text) to service_role;
grant execute on function public.wallet_fail_topup(text) to service_role;
grant execute on function public.wallet_spend(uuid, integer, text) to service_role;
grant execute on function public.wallet_refund(uuid, integer, text) to service_role;

-- ============================================================================
-- 20261112000000_address_contact_security.sql
-- ============================================================================

-- BTM AI — Adresse du compte, téléphone mieux protégé, e-mails jetables refusés
--
-- 1. Adresse demandée à l'inscription (options.data.address_*), reconfirmée à
--    chaque livraison (src/lib/address.ts). Position GPS facultative.
-- 2. Téléphone gardé dans le profil (lisible par son propriétaire seulement,
--    RLS) au lieu d'être laissé en clair dans le navigateur.
-- 3. Adresses e-mail jetables refusées par la base elle-même, même si
--    quelqu'un contourne le formulaire. Liste identique à
--    src/lib/auth/disposable-email.ts (vérifié par un test).

-- ---------------------------------------------------------------------------
-- 1 et 2. Profil : adresse et téléphone
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists address_commune text
    check (address_commune is null or address_commune in ('Acoua', 'Bandraboua', 'Bandrélé', 'Bouéni', 'Chiconi', 'Chirongui', 'Dembéni', 'Dzaoudzi', 'Kani-Kéli', 'Koungou', 'Mamoudzou', 'Mtsamboro', 'M''Tsangamouji', 'Ouangani', 'Pamandzi', 'Sada', 'Tsingoni')),
  add column if not exists address_line text
    check (address_line is null or char_length(address_line) between 5 and 200),
  -- Rectangle de Mayotte (Grande-Terre, Petite-Terre et le lagon).
  add column if not exists address_lat double precision
    check (address_lat is null or address_lat between -13.05 and -12.6),
  add column if not exists address_lng double precision
    check (address_lng is null or address_lng between 44.95 and 45.35),
  add column if not exists address_accuracy integer
    check (address_accuracy is null or address_accuracy between 0 and 500),
  add column if not exists address_updated_at timestamptz,
  -- Numéro français joignable, sans 08 (spéciaux, surtaxés) : voir normalizePhone.
  add column if not exists phone text
    check (phone is null or phone ~ '^0[1-79][0-9]{8}$'),
  add constraint profiles_address_geo_complete
    check ((address_lat is null) = (address_lng is null) and (address_lat is null) = (address_accuracy is null));

-- Même règle pour les demandes de réservation du code (les anciennes lignes ne sont pas revérifiées).
alter table public.code_exam_requests
  add constraint code_exam_requests_phone_reachable check (phone ~ '^0[1-79][0-9]{8}$') not valid;

-- Reprend le nom et l'adresse saisis à l'inscription. Ces métadonnées viennent
-- du navigateur : chaque valeur est nettoyée, et ignorée si elle est invalide
-- (l'adresse sera redemandée à la première livraison).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text;
  v_commune text;
  v_line text;
begin
  v_name := nullif(left(btrim(regexp_replace(coalesce(v_meta ->> 'display_name', ''), '\s+', ' ', 'g')), 60), '');
  v_commune := v_meta ->> 'address_commune';
  if v_commune is null or v_commune not in ('Acoua', 'Bandraboua', 'Bandrélé', 'Bouéni', 'Chiconi', 'Chirongui', 'Dembéni', 'Dzaoudzi', 'Kani-Kéli', 'Koungou', 'Mamoudzou', 'Mtsamboro', 'M''Tsangamouji', 'Ouangani', 'Pamandzi', 'Sada', 'Tsingoni') then
    v_commune := null;
  end if;
  v_line := btrim(regexp_replace(coalesce(v_meta ->> 'address_line', ''), '\s+', ' ', 'g'));
  if v_commune is null or char_length(v_line) not between 5 and 200 then
    v_commune := null;
    v_line := null;
  end if;

  insert into public.profiles (id, display_name, address_commune, address_line, address_updated_at)
  values (new.id, v_name, v_commune, v_line, case when v_line is null then null else now() end);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. E-mails jetables
-- ---------------------------------------------------------------------------
create table if not exists private.blocked_email_domains (
  domain text primary key check (domain = lower(domain))
);
revoke all on private.blocked_email_domains from public, anon, authenticated;

insert into private.blocked_email_domains (domain) values
  ('0-mail.com'),
  ('10minutemail.com'),
  ('10minutemail.net'),
  ('10minutemail.co.uk'),
  ('20minutemail.com'),
  ('33mail.com'),
  ('anonbox.net'),
  ('anonaddy.me'),
  ('burnermail.io'),
  ('byom.de'),
  ('chacuo.net'),
  ('crazymailing.com'),
  ('cuvox.de'),
  ('dayrep.com'),
  ('deadaddress.com'),
  ('discard.email'),
  ('discardmail.com'),
  ('disposableemailaddresses.com'),
  ('dispostable.com'),
  ('dropmail.me'),
  ('einrot.com'),
  ('email-fake.com'),
  ('emailfake.com'),
  ('emailondeck.com'),
  ('emailtemporanea.com'),
  ('emailtemporanea.net'),
  ('fakeinbox.com'),
  ('fakemail.net'),
  ('fakemailgenerator.com'),
  ('fleckens.hu'),
  ('getairmail.com'),
  ('getnada.com'),
  ('gishpuppy.com'),
  ('guerrillamail.biz'),
  ('guerrillamail.com'),
  ('guerrillamail.de'),
  ('guerrillamail.info'),
  ('guerrillamail.net'),
  ('guerrillamail.org'),
  ('guerrillamailblock.com'),
  ('gustr.com'),
  ('harakirimail.com'),
  ('inboxbear.com'),
  ('inboxkitten.com'),
  ('incognitomail.org'),
  ('jetable.com'),
  ('jetable.fr.nf'),
  ('jetable.net'),
  ('jetable.org'),
  ('jourrapide.com'),
  ('kasmail.com'),
  ('linshiyouxiang.net'),
  ('mail-temp.com'),
  ('mail.tm'),
  ('mail1a.de'),
  ('mail7.io'),
  ('mailcatch.com'),
  ('maildrop.cc'),
  ('mailinator.com'),
  ('mailinator.net'),
  ('mailinator2.com'),
  ('mailnesia.com'),
  ('mailnull.com'),
  ('mailpoof.com'),
  ('mailsac.com'),
  ('meltmail.com'),
  ('minutemail.com'),
  ('moakt.com'),
  ('mohmal.com'),
  ('mintemail.com'),
  ('monemail.fr.nf'),
  ('mvrht.com'),
  ('mytemp.email'),
  ('nada.email'),
  ('nospam.ze.tc'),
  ('nwytg.net'),
  ('one-time.email'),
  ('owlymail.com'),
  ('rhyta.com'),
  ('sharklasers.com'),
  ('spam4.me'),
  ('spambox.us'),
  ('spamgourmet.com'),
  ('spamex.com'),
  ('speed.1s.fr'),
  ('superrito.com'),
  ('teleworm.us'),
  ('temp-mail.io'),
  ('temp-mail.org'),
  ('temp-mail.ru'),
  ('tempail.com'),
  ('tempemail.net'),
  ('tempinbox.com'),
  ('tempmail.com'),
  ('tempmail.dev'),
  ('tempmail.net'),
  ('tempmail.plus'),
  ('tempmailo.com'),
  ('tempmailaddress.com'),
  ('tempr.email'),
  ('throwawaymail.com'),
  ('tmail.ws'),
  ('tmailor.com'),
  ('tmpmail.net'),
  ('tmpmail.org'),
  ('trash-mail.com'),
  ('trashmail.com'),
  ('trashmail.de'),
  ('trashmail.fr'),
  ('trashmail.io'),
  ('trashmail.me'),
  ('trashmail.net'),
  ('trbvm.com'),
  ('vomoto.com'),
  ('wegwerfmail.de'),
  ('wegwerfmail.net'),
  ('wegwerfmail.org'),
  ('yopmail.com'),
  ('yopmail.fr'),
  ('yopmail.net'),
  ('cool.fr.nf'),
  ('courriel.fr.nf'),
  ('moncourrier.fr.nf'),
  ('zetmail.com')
on conflict do nothing;

-- Refuse le compte (création ou changement d'adresse) si le domaine, ou l'un
-- de ses domaines parents, est bloqué : « x.mailinator.com » compris.
create or replace function private.reject_disposable_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text := lower(split_part(coalesce(new.email, ''), '@', 2));
begin
  while v_domain like '%.%' loop
    if exists (select 1 from private.blocked_email_domains where domain = v_domain) then
      raise exception 'Adresse e-mail jetable refusée : %', v_domain using errcode = 'check_violation';
    end if;
    v_domain := substr(v_domain, strpos(v_domain, '.') + 1);
  end loop;
  return new;
end;
$$;

drop trigger if exists reject_disposable_email on auth.users;
create trigger reject_disposable_email
  before insert or update of email on auth.users
  for each row execute function private.reject_disposable_email();

-- ============================================================================
-- 20261113000000_known_devices.sql
-- ============================================================================

-- BTM AI — appareils connus de chaque compte
-- Sert à prévenir par e-mail d'une connexion depuis un nouvel appareil.
-- device_hash : empreinte SHA-256 de l'identifiant aléatoire gardé dans un
-- cookie du navigateur (jamais l'identifiant lui-même). Lu et écrit seulement
-- par le serveur (clé secrète) : aucune politique pour les utilisateurs.

create table public.known_devices (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_hash text not null check (char_length(device_hash) = 64),
  label text not null default '' check (char_length(label) <= 120),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, device_hash)
);

alter table public.known_devices enable row level security;
revoke all on public.known_devices from anon, authenticated;

-- ============================================================================
-- 20261114000000_site_settings.sql
-- ============================================================================

-- BTM AI — réglages du site (une seule ligne, id = 1)
-- maintenance : le site affiche une page d'attente à tous sauf aux administrateurs.
-- demo_mode : la démonstration de commande de repas (restaurants Jéjé Livraison,
-- solde fictif) est visible des administrateurs.
-- bank_* : RIB de GROUPE BTM, vu et modifié par l'administrateur principal seulement.
-- Lu et écrit seulement par le serveur (clé secrète) : aucune politique.

create table public.site_settings (
  id smallint primary key default 1 check (id = 1),
  maintenance boolean not null default false,
  maintenance_message text not null default '' check (char_length(maintenance_message) <= 300),
  demo_mode boolean not null default false,
  bank_holder text not null default '' check (char_length(bank_holder) <= 120),
  bank_name text not null default '' check (char_length(bank_name) <= 120),
  bank_iban text not null default '' check (char_length(bank_iban) <= 34),
  bank_bic text not null default '' check (char_length(bank_bic) <= 11),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.site_settings (id) values (1);

alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;

-- ============================================================================
-- 20261115000000_code_exam_processing.sql
-- ============================================================================

-- BTM AI — Suivi du traitement des demandes de réservation du code
-- À APPLIQUER AVEC LE PARTENARIAT LA POSTE (voir src/lib/code-exam/partner.ts).
-- La page /admin/code fonctionne déjà sans ces colonnes (traitement à la main).

alter table public.code_exam_requests
  -- Référence de la place chez La Poste (renvoyée par leur API).
  add column laposte_reference text check (char_length(laposte_reference) <= 80),
  -- Débit du portefeuille (prix de l'examen) : opération et date.
  add column fee_cents integer check (fee_cents >= 0),
  add column wallet_transaction_id uuid references public.wallet_transactions (id) on delete set null,
  add column paid_at timestamptz,
  -- Convocation La Poste envoyée au candidat.
  add column convocation_sent_at timestamptz,
  -- Qui a traité la demande, et quand.
  add column processed_by uuid references auth.users (id) on delete set null,
  add column processed_at timestamptz;

-- ============================================================================
-- 20261115000000_saved_addresses.sql
-- ============================================================================

-- BTM AI — Carnet d'adresses
--
-- En plus de l'adresse du compte (la maison, dans profiles), chaque personne
-- garde jusqu'à 10 adresses : travail, amis, famille… Proposées à chaque
-- livraison. Mêmes règles que l'adresse du compte (src/lib/address.ts).
-- RLS : chacun ne voit et ne modifie que les siennes.

create table if not exists public.saved_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('travail', 'ami', 'famille', 'autre')),
  label text not null check (char_length(label) between 1 and 40),
  commune text not null
    check (commune in ('Acoua', 'Bandraboua', 'Bandrélé', 'Bouéni', 'Chiconi', 'Chirongui', 'Dembéni', 'Dzaoudzi', 'Kani-Kéli', 'Koungou', 'Mamoudzou', 'Mtsamboro', 'M''Tsangamouji', 'Ouangani', 'Pamandzi', 'Sada', 'Tsingoni')),
  line text not null check (char_length(line) between 5 and 200),
  lat double precision check (lat is null or lat between -13.05 and -12.6),
  lng double precision check (lng is null or lng between 44.95 and 45.35),
  accuracy integer check (accuracy is null or accuracy between 0 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_addresses_geo_complete check ((lat is null) = (lng is null) and (lat is null) = (accuracy is null))
);

create index if not exists saved_addresses_user_idx on public.saved_addresses (user_id, created_at);

alter table public.saved_addresses enable row level security;

drop policy if exists "saved_addresses_own" on public.saved_addresses;
create policy "saved_addresses_own" on public.saved_addresses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.saved_addresses from anon;
grant select, insert, update, delete on public.saved_addresses to authenticated;

-- 10 adresses au plus par compte, vérifié par la base elle-même.
create or replace function public.saved_addresses_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.saved_addresses where user_id = new.user_id) >= 10 then
    raise exception 'Carnet plein : 10 adresses au maximum.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists saved_addresses_limit on public.saved_addresses;
create trigger saved_addresses_limit
  before insert on public.saved_addresses
  for each row execute function public.saved_addresses_limit();

-- ============================================================================
-- 20261116000000_awa_branches.sql
-- ============================================================================

-- BTM AI — Branches de la carte du shimaoré proposées par Awa
--
-- Dans /admin/lexique, le « + » de la carte demande à Awa ce qu'elle aurait
-- aimé savoir dire (d'après les mots qu'elle n'a pas compris en conversation
-- et les trous de son vocabulaire). Elle propose une branche : un nom, une
-- phrase pour expliquer pourquoi, et des mots français. La branche s'ajoute à
-- la carte ; chaque mot y attend sa traduction (enregistrée dans awa_words,
-- catégorie = nom de la branche).

create table if not exists public.awa_branches (
  id uuid primary key default gen_random_uuid(),
  label text not null unique check (char_length(label) between 2 and 30),
  emoji text check (emoji is null or char_length(emoji) <= 8),
  hue integer not null default 200 check (hue between 0 and 359),
  reason text check (reason is null or char_length(reason) <= 300),
  words text[] not null check (cardinality(words) between 1 and 30),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.awa_branches enable row level security;

drop policy if exists "awa_branches_admin_all" on public.awa_branches;
create policy "awa_branches_admin_all" on public.awa_branches
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

revoke all on public.awa_branches from anon;
grant select, insert, update, delete on public.awa_branches to authenticated;

-- ============================================================================
-- 20261117000000_alignement_production.sql
-- ============================================================================

-- BTM AI — Alignement des fichiers sur la base réelle (relevé du 3 novembre 2026)
-- Ne change rien en production : décrit deux éléments qui y existent déjà mais
-- qu'aucun fichier ne créait. Sur une base neuve, il les recrée à l'identique.

-- 1. RLS activé sur les tables privées (sans politique : personne ne les lit par
--    l'API ; seul le serveur, avec la clé secrète, y accède).
alter table private.rate_limit_counters enable row level security;
alter table private.protected_admins enable row level security;
alter table private.blocked_email_domains enable row level security;

-- 2. Ancienne table des places du code, remplacée par code_exam_requests.
--    Vide et utilisée par aucun code : sa suppression sera proposée à part.
create table if not exists public.code_exam_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  center_id text not null check (char_length(center_id) between 1 and 40),
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (center_id, starts_at)
);

alter table public.code_exam_bookings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'code_exam_bookings' and policyname = 'code_exam_bookings_select_own') then
    create policy "code_exam_bookings_select_own" on public.code_exam_bookings
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'code_exam_bookings' and policyname = 'code_exam_bookings_insert_own') then
    create policy "code_exam_bookings_insert_own" on public.code_exam_bookings
      for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'code_exam_bookings' and policyname = 'code_exam_bookings_delete_own') then
    create policy "code_exam_bookings_delete_own" on public.code_exam_bookings
      for delete to authenticated using ((select auth.uid()) = user_id);
  end if;
end
$$;

revoke all on public.code_exam_bookings from anon;

-- ============================================================================
-- 20261118000000_app_reviews.sql
-- ============================================================================

-- BTM AI — Avis des utilisateurs sur l'application, affichés sur la page d'accueil.
-- Un avis par compte (modifiable), écrit et lu uniquement par le serveur (clé
-- secrète) : le serveur vérifie la session, la note, le texte et le quota.
-- Aucun accès direct par l'API pour les visiteurs ou les comptes connectés.

create table public.app_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  -- Nom public figé par le serveur : « Fatima M. » (prénom + initiale), jamais l'e-mail.
  display_name text not null check (char_length(display_name) between 1 and 60),
  commune text check (commune is null or commune in ('Acoua', 'Bandraboua', 'Bandrélé', 'Bouéni', 'Chiconi', 'Chirongui', 'Dembéni', 'Dzaoudzi', 'Kani-Kéli', 'Koungou', 'Mamoudzou', 'Mtsamboro', 'M''Tsangamouji', 'Ouangani', 'Pamandzi', 'Sada', 'Tsingoni')),
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) between 1 and 300),
  -- hidden : retiré de la page d'accueil par un administrateur (insulte, publicité…).
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index app_reviews_published_idx on public.app_reviews (created_at desc) where status = 'published';

create trigger app_reviews_set_updated_at
  before update on public.app_reviews
  for each row execute function public.set_updated_at();

-- RLS sans politique + aucun droit : seul le serveur (service_role) lit et écrit.
alter table public.app_reviews enable row level security;
revoke all on public.app_reviews from anon, authenticated;

-- ============================================================================
-- 20261119000000_prenom_tamilya.sql
-- ============================================================================

-- BTM AI — l'assistante change de prénom : Awa devient Tamilya.
-- Le prénom est fixé dans le code (awa-identity.ts) ; ici, les textes saisis
-- depuis l'administration sont mis à jour pour parler de Tamilya
-- (« d'Awa » → « de Tamilya », « qu'Awa » → « que Tamilya »).
-- Les conversations et souvenirs des utilisateurs ne sont pas touchés.

create or replace function pg_temp.tamilya(t text) returns text
language sql immutable as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(t, '([dD])[''’]Awa\M', '\1e Tamilya', 'g'),
      '([qQ])u[''’]Awa\M', '\1ue Tamilya', 'g'),
    '\mAwa\M', 'Tamilya', 'g')
$$;

alter table public.awa_settings alter column name set default 'Tamilya';

update public.awa_settings
set name = 'Tamilya'
where name = 'Awa';

update public.awa_settings
set identity = pg_temp.tamilya(identity),
    rules = pg_temp.tamilya(rules)
where identity ~ '\mAwa\M' or rules ~ '\mAwa\M';

update public.awa_personalities
set behavior = pg_temp.tamilya(behavior::text)::jsonb
where behavior::text ~ '\mAwa\M';

update public.awa_knowledge
set title = pg_temp.tamilya(title),
    content = pg_temp.tamilya(content)
where title ~ '\mAwa\M' or content ~ '\mAwa\M';

update public.awa_branches
set reason = pg_temp.tamilya(reason)
where reason ~ '\mAwa\M';

-- ============================================================================
-- 20261120000000_durcissement_droits.sql
-- ============================================================================

-- BTM AI — Durcissement des droits (audit du 3 novembre 2026, failles S1 partielle, S2, S13)
-- Compatible avec le code déjà en ligne : rien de ce que fait le site n'est retiré.
-- La suite (S1 complète) est dans 20261120020000_ecritures_par_le_serveur.sql,
-- à appliquer seulement quand le code qui écrit par le serveur est en production.

-- S2 : droits inutiles. TRUNCATE ignore RLS (vider une table entière), TRIGGER et
-- REFERENCES ne servent à aucun compte. Ni les visiteurs ni les comptes ne les gardent.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from anon, authenticated;

-- S13 : fonctions de déclencheur appelables par l'API (/rest/v1/rpc/…). Un déclencheur
-- n'a pas besoin de ce droit pour s'exécuter : on le retire à tout le monde.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.saved_addresses_limit() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.touch_conversation() from public, anon, authenticated;

-- Droits des visiteurs restés sur trois tables (RLS les bloquait déjà, on ferme aussi la porte).
revoke all on public.ai_usage from anon;
revoke all on public.awa_words from anon;
revoke all on public.awa_word_requests from anon;

-- Ancienne table des places du code (vide, plus utilisée) : plus aucune écriture par l'API.
revoke insert, update, delete on public.code_exam_bookings from authenticated;

-- S1 (paiement) : un compte pouvait créer une demande du code déjà « payée »
-- (paid_at, fee_cents, laposte_reference, processed_by…) en écrivant directement
-- dans la table. Seules les colonnes saisies par le candidat restent permises ;
-- le statut reste forcé à « pending » par la politique d'insertion.
revoke insert, update, delete on public.code_exam_requests from authenticated;
grant insert (user_id, center_id, center_name, starts_at, exam_type, civility, last_name, first_name, birth_date, city, phone, email, neph, snu)
  on public.code_exam_requests to authenticated;

-- Un message appartient toujours au compte de sa conversation, quel que soit
-- celui qui écrit (y compris le serveur avec la clé secrète) : une erreur de
-- code ne peut pas glisser un message dans la conversation d'un autre.
create or replace function public.messages_owner_matches() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.conversations c where c.id = new.conversation_id and c.user_id = new.user_id
  ) then
    raise exception 'Le message n''appartient pas au compte de la conversation.' using errcode = '42501';
  end if;
  return new;
end $$;

revoke execute on function public.messages_owner_matches() from public, anon, authenticated;

create trigger messages_owner_matches
  before insert on public.messages
  for each row execute function public.messages_owner_matches();

-- ============================================================================
-- 20261120010000_journal_etat_plateforme.sql
-- ============================================================================

-- BTM AI — État de la plateforme : journal des mises en maintenance et réouvertures
-- Chaque changement d'état garde son auteur (compte et e-mail, conservé même si le
-- compte est supprimé), la date, l'état choisi et le message affiché aux visiteurs.
-- Lu et écrit seulement par le serveur (clé secrète) : aucune politique.

create table public.site_status_log (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users (id) on delete set null,
  changed_by_email text check (char_length(changed_by_email) <= 320),
  maintenance boolean not null,
  message text not null default '' check (char_length(message) <= 300)
);

create index site_status_log_changed_at_idx on public.site_status_log (changed_at desc);

alter table public.site_status_log enable row level security;
revoke all on public.site_status_log from anon, authenticated;

-- Change l'état et l'inscrit au journal dans la même transaction : jamais l'un sans l'autre.
-- p_message null : le message actuel est gardé.
create or replace function public.set_site_status(p_maintenance boolean, p_message text, p_by uuid, p_by_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message text;
begin
  update public.site_settings
  set maintenance = p_maintenance,
      maintenance_message = coalesce(p_message, maintenance_message),
      updated_at = now(),
      updated_by = p_by
  where id = 1
  returning maintenance_message into v_message;
  if not found then
    raise exception 'Réglages du site absents (ligne id = 1).';
  end if;
  insert into public.site_status_log (changed_by, changed_by_email, maintenance, message)
  values (p_by, left(p_by_email, 320), p_maintenance, v_message);
end $$;

revoke execute on function public.set_site_status(boolean, text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_site_status(boolean, text, uuid, text) to service_role;

-- ============================================================================
-- 20261120020000_ecritures_par_le_serveur.sql
-- ============================================================================

-- BTM AI — Faille S1 de l'audit : écritures par le serveur seulement
-- ⚠ À APPLIQUER APRÈS la mise en production du code qui écrit avec la clé secrète
-- (src/lib/conversations/repository.ts, src/lib/ai/memory-store.ts,
-- src/app/api/code-exam/requests/route.ts). Appliquée avant, l'ancien code ne
-- pourrait plus enregistrer les conversations.
--
-- Un compte connecté pouvait, avec la clé publique et son jeton, écrire
-- directement dans la base : faux messages de Tamilya, souvenirs inventés,
-- conversations et demandes du code sans les vérifications ni les quotas du
-- serveur. Il garde la lecture, la suppression de ses conversations et de ses
-- souvenirs (Paramètres), et le renommage d'une conversation.

drop policy if exists "messages_insert_own" on public.messages;
revoke insert, update, delete on public.messages from authenticated;

drop policy if exists "conversations_insert_own" on public.conversations;
revoke insert on public.conversations from authenticated;

drop policy if exists "awa_memories_insert_own" on public.awa_memories;
drop policy if exists "awa_memories_update_own" on public.awa_memories;
revoke insert, update on public.awa_memories from authenticated;

drop policy if exists "code_exam_requests_insert_own" on public.code_exam_requests;
revoke insert on public.code_exam_requests from authenticated;

-- ============================================================================
-- 20261121000000_bandeau_accueil.sql
-- ============================================================================

-- BTM AI — Bandeau de la page d'accueil (alerte, bon plan, publicité), sous la barre du haut,
-- à la manière du site d'Apple : une phrase et un lien facultatif. Modifié et
-- allumé / éteint depuis l'administration (rubrique Bandeau).
-- Dans site_settings : lu et écrit seulement par le serveur (clé secrète), aucune politique.

alter table public.site_settings
  add column announcement_enabled boolean not null default false,
  add column announcement_text text not null default '' check (char_length(announcement_text) <= 140),
  add column announcement_link_label text not null default '' check (char_length(announcement_link_label) <= 40),
  -- Lien interne (« /partenaires ») ou https:// seulement : vérifié aussi par le serveur.
  add column announcement_link_url text not null default '' check (
    char_length(announcement_link_url) <= 300
    and (announcement_link_url = '' or announcement_link_url ~ '^(/[^/\\]|/$|https://)')
  );

-- ============================================================================
-- 20261122000000_conversation_accueil.sql
-- ============================================================================

-- BTM AI — Conversation d'exemple de la page d'accueil, traduite en shimaoré par Tamilya elle-même.
-- Gardée ici pour ne pas redemander la traduction à l'IA à chaque visite. La clé résume le
-- vocabulaire de Tamilya au moment de la traduction : quand on lui apprend ou corrige un mot,
-- la clé change et la conversation est retraduite à la visite suivante.
-- Dans site_settings : lu et écrit seulement par le serveur (clé secrète), aucune politique.

alter table public.site_settings
  add column landing_demo jsonb,
  add column landing_demo_key text;

-- ============================================================================
-- 20261123000000_inscription_google.sql
-- ============================================================================

-- Inscription avec Google : Google ne donne pas « display_name » mais
-- « given_name » (prénom) et « full_name » / « name ». On les prend à défaut,
-- pour que le compte ait un prénom dès la création. Le reste est inchangé.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text;
  v_commune text;
  v_line text;
begin
  v_name := nullif(left(btrim(regexp_replace(coalesce(
    nullif(btrim(v_meta ->> 'display_name'), ''),
    nullif(btrim(v_meta ->> 'given_name'), ''),
    nullif(btrim(v_meta ->> 'full_name'), ''),
    nullif(btrim(v_meta ->> 'name'), ''),
    ''
  ), '\s+', ' ', 'g')), 60), '');
  v_commune := v_meta ->> 'address_commune';
  if v_commune is null or v_commune not in ('Acoua', 'Bandraboua', 'Bandrélé', 'Bouéni', 'Chiconi', 'Chirongui', 'Dembéni', 'Dzaoudzi', 'Kani-Kéli', 'Koungou', 'Mamoudzou', 'Mtsamboro', 'M''Tsangamouji', 'Ouangani', 'Pamandzi', 'Sada', 'Tsingoni') then
    v_commune := null;
  end if;
  v_line := btrim(regexp_replace(coalesce(v_meta ->> 'address_line', ''), '\s+', ' ', 'g'));
  if v_commune is null or char_length(v_line) not between 5 and 200 then
    v_commune := null;
    v_line := null;
  end if;

  insert into public.profiles (id, display_name, address_commune, address_line, address_updated_at)
  values (new.id, v_name, v_commune, v_line, case when v_line is null then null else now() end);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ============================================================================
-- 20261124000000_codes_developpeurs.sql
-- ============================================================================

-- BTM AI — Codes d'accès des développeurs (API de Tamilya, route /api/v1/tamilya)
--
-- Un développeur connecté crée un code depuis /developpeurs. Il l'envoie avec
-- sa propre clé Gemini : Tamilya répond avec son cerveau, sa clé à lui paie.
-- Seule l'empreinte SHA-256 du code est stockée ; la clé Gemini ne l'est jamais.
-- Aucune politique RLS : seul le serveur (clé secrète) lit et écrit la table,
-- après avoir vérifié la session de l'utilisateur.

create table if not exists public.developer_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  -- Début du code, affiché pour le reconnaître (ex. « tml_AbCd12 »).
  prefix text not null check (prefix ~ '^tml_[A-Za-z0-9_-]{6}$'),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists developer_keys_user_idx on public.developer_keys (user_id, created_at desc);

alter table public.developer_keys enable row level security;
revoke all on public.developer_keys from anon, authenticated;

-- ============================================================================
-- 20261125000000_apprentissage_shimaore.sql
-- ============================================================================

-- BTM AI — Apprentissage du shimaoré (/admin/apprentissage)
-- 1. awa_grammar : règles de grammaire courtes (conjugaison, pluriel, pronoms…),
--    données à Tamilya à chaque message pour qu'elle construise ses phrases.
-- 2. awa_cleanup_ignored : entrées du lexique marquées « c'est voulu » dans le
--    nettoyage (un mot emprunté au français n'est pas une faute de frappe).
-- Lisibles par le serveur (clé secrète) et les administrateurs uniquement.

create table public.awa_grammar (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  rule text not null check (char_length(rule) between 1 and 600),
  examples text not null default '' check (char_length(examples) <= 600),
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

alter table public.awa_grammar enable row level security;

create policy "awa_grammar_admin_all" on public.awa_grammar
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create table public.awa_cleanup_ignored (
  -- « words:<id> » ou « lexicon:<id> », et le type de remarque (copie, doublon…).
  ref text not null check (char_length(ref) between 1 and 400),
  kind text not null check (char_length(kind) between 1 and 30),
  created_at timestamptz not null default now(),
  primary key (ref, kind)
);

alter table public.awa_cleanup_ignored enable row level security;

create policy "awa_cleanup_ignored_admin_all" on public.awa_cleanup_ignored
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================================
-- 20261126000000_securite_serveur.sql
-- ============================================================================

-- BTM AI — Sécurité côté serveur (corrections de l'audit).
-- Le site marche aussi sans cette migration : le code retombe sur l'ancien
-- comportement si une fonction est absente (erreur PGRST202).

-- 1. Recharge du portefeuille : plafond de 150 € contrôlé sous verrou.
-- Deux recharges lancées en même temps ne peuvent plus dépasser le plafond :
-- le solde et les recharges en cours (moins de 30 minutes) sont relus sous un
-- verrou propre au compte, puis la recharge « en attente » est créée.
-- Renvoie l'id de l'opération, ou null si le plafond serait dépassé.
create or replace function public.wallet_reserve_topup(p_user_id uuid, p_amount_cents integer, p_label text, p_max_balance_cents integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  engaged integer;
  tx_id uuid;
begin
  if p_amount_cents <= 0 or p_max_balance_cents <= 0 then
    raise exception 'Montant invalide';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('wallet-topup:' || p_user_id::text, 0));
  select coalesce((select balance_cents from public.wallets where user_id = p_user_id), 0)
    + coalesce((select sum(amount_cents) from public.wallet_transactions
                where user_id = p_user_id and kind = 'topup' and status = 'pending'
                  and created_at >= now() - interval '30 minutes'), 0)
  into engaged;
  if engaged + p_amount_cents > p_max_balance_cents then
    return null;
  end if;
  insert into public.wallet_transactions (user_id, kind, amount_cents, status, label)
  values (p_user_id, 'topup', p_amount_cents, 'pending', left(p_label, 120))
  returning id into tx_id;
  return tx_id;
end;
$$;

revoke all on function public.wallet_reserve_topup(uuid, integer, text, integer) from public, anon, authenticated;
grant execute on function public.wallet_reserve_topup(uuid, integer, text, integer) to service_role;

-- 2. Retrait d'un administrateur délégué : ses sessions sont fermées tout de
-- suite (ses jetons de rafraîchissement disparaissent avec elles). Son jeton
-- en cours est en plus refusé par le serveur, qui relit le rôle à jour.
create or replace function public.close_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed integer;
begin
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics closed = row_count;
  return closed;
end;
$$;

revoke all on function public.close_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.close_user_sessions(uuid) to service_role;

-- ============================================================================
-- 20261127000000_index_messages_par_compte.sql
-- ============================================================================

-- BTM AI — Index pour compter vite les messages d'un compte
-- Page /admin (questions par compte), statistiques et réponses de Tamilya aux
-- administrateurs (/admin/apprentissage) : filtres sur user_id, role et date.
-- Un index ne change aucun droit ; s'il manque, tout marche, en plus lent.

create index if not exists messages_user_role_created_idx
  on public.messages (user_id, role, created_at);

-- ============================================================================
-- 20261128000000_voix_tamilya.sql
-- ============================================================================

-- BTM AI — Voix de Tamilya
-- Voix Gemini choisie dans /admin/voix (Leda, Kore, Aoede…). Vide : Leda.

alter table public.awa_settings
  add column if not exists voice text
    check (voice is null or voice ~ '^[A-Za-z]{2,20}$');

-- ============================================================================
-- 20261129000000_bibliotheque_mayotte.sql
-- ============================================================================

-- BTM AI — Bibliothèque Mayotte de Tamilya
-- Documents (pages officielles, articles, textes collés) découpés en passages,
-- chacun avec son « empreinte de sens » (vecteur Gemini, 768 nombres) pour la
-- recherche par le sens. Apprentissage contrôlé : un document ajouté est « à
-- valider » ; seuls les documents publiés par un administrateur servent à
-- Tamilya. Chaque document garde sa source, sa date et son niveau de confiance.
-- Lecture et écriture par le serveur seulement (clé secrète) : aucune règle RLS
-- ouverte aux comptes.

create extension if not exists vector;

create table public.awa_library_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 300),
  source_url text check (source_url is null or source_url ~ '^https://'),
  source_name text not null check (char_length(source_name) between 1 and 120),
  -- officiel : administrations, services publics ; media : presse reconnue ; autre : le reste.
  trust text not null default 'autre' check (trust in ('officiel', 'media', 'autre')),
  published_at timestamptz,
  verified_at timestamptz not null default now(),
  status text not null default 'a_valider' check (status in ('a_valider', 'publie', 'rejete')),
  chars integer not null default 0,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source_url)
);

create table public.awa_library_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.awa_library_documents (id) on delete cascade,
  position integer not null,
  content text not null check (char_length(content) between 1 and 4000),
  embedding vector(768) not null
);

create index awa_library_chunks_document on public.awa_library_chunks (document_id);
create index awa_library_chunks_embedding on public.awa_library_chunks using hnsw (embedding vector_cosine_ops);
create index awa_library_documents_status on public.awa_library_documents (status);

alter table public.awa_library_documents enable row level security;
alter table public.awa_library_chunks enable row level security;

-- Passages publiés les plus proches d'une question (similarité cosinus).
create or replace function public.match_library(query vector(768), match_count integer default 5, min_similarity double precision default 0.6)
returns table (
  content text,
  title text,
  source_name text,
  source_url text,
  trust text,
  published_at timestamptz,
  verified_at timestamptz,
  similarity double precision
)
language sql
stable
set search_path = public
as $$
  select c.content, d.title, d.source_name, d.source_url, d.trust, d.published_at, d.verified_at,
         1 - (c.embedding <=> query) as similarity
  from public.awa_library_chunks c
  join public.awa_library_documents d on d.id = c.document_id
  where d.status = 'publie' and 1 - (c.embedding <=> query) >= min_similarity
  order by c.embedding <=> query
  limit least(match_count, 12);
$$;

revoke execute on function public.match_library(vector, integer, double precision) from public, anon, authenticated;

-- ============================================================================
-- 20261130000000_code_paiement.sql
-- ============================================================================

-- BTM AI — Code de paiement à 4 chiffres
-- Obligatoire pour que Tamilya paie à la voix à la place de la personne.
-- Seule une empreinte est gardée (scrypt + sel), jamais le code lui-même.
-- Après 5 codes faux, le paiement à la voix est bloqué 15 minutes.
-- Lecture et écriture par le serveur seulement (clé secrète) : aucune règle RLS
-- ouverte aux comptes.

create table public.wallet_pins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pin_hash text not null check (char_length(pin_hash) between 32 and 200),
  salt text not null check (char_length(salt) between 16 and 100),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.wallet_pins enable row level security;

-- ============================================================================
-- 20261201000000_tamilya_connect.sql
-- ============================================================================

-- BTM AI — Tamilya Connect (messages relayés de téléphone en téléphone, sans internet)
-- Lecture et écriture par le serveur seulement (clé secrète) : RLS active, aucune règle ouverte aux comptes.

-- Clé publique de chaque appareil (la clé privée reste dans le téléphone).
create table public.mesh_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  public_key text not null unique check (char_length(public_key) between 80 and 200),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
create index mesh_devices_user_idx on public.mesh_devices (user_id);
alter table public.mesh_devices enable row level security;

-- Chaque message une seule fois : un doublon reçoit la même réponse, sans rien refaire (jamais deux paiements).
create table public.mesh_messages (
  id uuid primary key,
  device_id uuid not null references public.mesh_devices (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reply jsonb,
  created_at timestamptz not null default now()
);
create index mesh_messages_created_idx on public.mesh_messages (created_at);
alter table public.mesh_messages enable row level security;

-- Choix proposés par Tamilya (billet, repas) : prix fixé par le serveur, utilisables une seule fois.
create table public.mesh_actions (
  id text primary key check (char_length(id) between 16 and 64),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('barge', 'food')),
  data jsonb not null,
  label text not null check (char_length(label) <= 160),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index mesh_actions_user_idx on public.mesh_actions (user_id);
alter table public.mesh_actions enable row level security;

-- ============================================================================
-- 20261202000000_etats_du_site.sql
-- ============================================================================

-- BTM AI — Trois états du site : en ligne, maintenance, en attente d'un partenaire.
-- En attente : les visiteurs voient une page d'attente, comme en maintenance. La
-- validation du premier partenaire ouvre le site, dans la même transaction.
-- Lu et écrit seulement par le serveur (clé secrète) : aucune politique.

alter table public.site_settings
  add column status text not null default 'online'
  check (status in ('online', 'maintenance', 'waiting_partner'));
update public.site_settings set status = 'maintenance' where maintenance;
alter table public.site_settings drop column maintenance;

alter table public.site_status_log
  add column status text check (status in ('online', 'maintenance', 'waiting_partner')),
  -- Rempli quand la validation d'un partenaire a ouvert le site.
  add column partner_name text check (char_length(partner_name) <= 120);
update public.site_status_log set status = case when maintenance then 'maintenance' else 'online' end;
alter table public.site_status_log alter column status set not null;
alter table public.site_status_log drop column maintenance;

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  activity text not null default '' check (char_length(activity) <= 120),
  created_at timestamptz not null default now(),
  -- null : pas encore validé.
  validated_at timestamptz,
  validated_by uuid references auth.users (id) on delete set null
);

alter table public.partners enable row level security;
revoke all on public.partners from anon, authenticated;

drop function public.set_site_status(boolean, text, uuid, text);

-- Change l'état et l'inscrit au journal dans la même transaction : jamais l'un sans l'autre.
-- p_message null : le message actuel est gardé. Attendre un partenaire alors qu'un
-- partenaire est déjà validé est refusé : plus aucune validation n'ouvrirait le site.
create function public.set_site_status(p_status text, p_message text, p_by uuid, p_by_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message text;
begin
  if p_status = 'waiting_partner' and exists (select 1 from public.partners where validated_at is not null) then
    raise exception 'partner_already_validated';
  end if;
  update public.site_settings
  set status = p_status,
      maintenance_message = coalesce(p_message, maintenance_message),
      updated_at = now(),
      updated_by = p_by
  where id = 1
  returning maintenance_message into v_message;
  if not found then
    raise exception 'Réglages du site absents (ligne id = 1).';
  end if;
  insert into public.site_status_log (changed_by, changed_by_email, status, message)
  values (p_by, left(p_by_email, 320), p_status, v_message);
end $$;

revoke execute on function public.set_site_status(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_site_status(text, text, uuid, text) to service_role;

-- Valide un partenaire et, si le site l'attendait, l'ouvre et l'inscrit au journal.
-- Renvoie 'opened' (site ouvert), 'validated' (état inchangé) ou 'unchanged'
-- (partenaire introuvable ou déjà validé). Une maintenance n'est jamais levée ici.
create function public.validate_partner(p_partner uuid, p_by uuid, p_by_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_message text;
begin
  update public.partners
  set validated_at = now(), validated_by = p_by
  where id = p_partner and validated_at is null
  returning name into v_name;
  if not found then
    return 'unchanged';
  end if;
  update public.site_settings
  set status = 'online', updated_at = now(), updated_by = p_by
  where id = 1 and status = 'waiting_partner'
  returning maintenance_message into v_message;
  if not found then
    return 'validated';
  end if;
  insert into public.site_status_log (changed_by, changed_by_email, status, message, partner_name)
  values (p_by, left(p_by_email, 320), 'online', v_message, v_name);
  return 'opened';
end $$;

revoke execute on function public.validate_partner(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.validate_partner(uuid, uuid, text) to service_role;

-- ============================================================================
-- 20261203000000_inscriptions_fermees_maintenance.sql
-- ============================================================================

-- BTM AI — Aucun nouveau compte pendant la maintenance.
-- L'inscription (e-mail ou Google, site ou application) va directement à Supabase
-- sans passer par notre serveur : seule la base peut la bloquer à coup sûr.
-- Les comptes existants ne sont pas touchés : ils ne créent pas de ligne ici.

create or replace function private.reject_signup_during_maintenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.site_settings where id = 1 and status = 'maintenance') then
    raise exception 'Inscriptions fermées pendant la maintenance.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_signup_during_maintenance() from public, anon, authenticated;

drop trigger if exists reject_signup_during_maintenance on auth.users;
create trigger reject_signup_during_maintenance
  before insert on auth.users
  for each row execute function private.reject_signup_during_maintenance();

-- ============================================================================
-- 20261204000000_corrections_ecoute.sql
-- ============================================================================

-- BTM AI — Corrections d'écoute du vocal : ce que Gemini entend de travers et ce qui a vraiment été dit.
-- Ajoutées par les administrateurs. Elles guident l'écoute de Tamilya et corrigent le texte enregistré.
-- Lu et écrit seulement par le serveur (clé secrète) : aucune politique.

create table public.voice_corrections (
  id uuid primary key default gen_random_uuid(),
  heard text not null check (char_length(heard) between 2 and 80),
  meant text not null check (char_length(meant) between 1 and 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index voice_corrections_heard_idx on public.voice_corrections (lower(heard));

alter table public.voice_corrections enable row level security;
revoke all on public.voice_corrections from anon, authenticated;

-- ============================================================================
-- 20261205000000_banque_documents.sql
-- ============================================================================

-- BTM AI — Banque de documents
--
-- Les documents restent dans le Google Drive de la personne : ici, seul le lien
-- vers son compte Google (jeton chiffré, src/lib/drive/connection.ts).
-- RLS sans politique : seul le serveur lit et écrit, jamais le navigateur.

create table if not exists public.drive_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  google_email text,
  refresh_token text not null,
  connected_at timestamptz not null default now()
);

alter table public.drive_connections enable row level security;

revoke all on public.drive_connections from public, anon, authenticated;

-- ============================================================================
-- 20261206000000_conversations_source.sql
-- ============================================================================

-- BTM AI — d'où vient une conversation : Tamilya normale ou Tamilya Connect (sans internet).
-- Les anciennes conversations Connect ne sont reconnaissables nulle part : elles restent « tamilya ».
alter table public.conversations
  add column if not exists source text not null default 'tamilya'
  check (source in ('tamilya', 'connect'));

-- ============================================================================
-- 20261207000000_autorisation_paiement_voix.sql
-- ============================================================================

-- BTM AI — Autorisation du paiement à la voix, donnée une seule fois
-- La personne accepte l'avertissement une fois : il n'est plus réaffiché.
-- Le code à 4 chiffres reste demandé à chaque paiement.
-- Supprimer le code efface aussi l'autorisation (même ligne).

alter table public.wallet_pins add column voice_pay_consent_at timestamptz;

-- ============================================================================
-- 20261207000000_awa_partner_btm_market.sql
-- ============================================================================

-- BTM AI — BTM Market peut faire parler Tamilya (route /api/awa, site « btm-market »).
-- Le secret du site est ajouté à part (empreinte SHA-256 seulement), jamais dans une migration.
alter table public.awa_partner_keys drop constraint if exists awa_partner_keys_site_check;
alter table public.awa_partner_keys add constraint awa_partner_keys_site_check
  check (site in ('btm-batiment', 'btm-market'));

-- ============================================================================
-- 20261208000000_empreinte_voix.sql
-- ============================================================================

-- BTM AI — Empreinte de voix du titulaire du compte
-- Sert à la double vérification du paiement à la voix : le code à 4 chiffres
-- ET la voix de la personne. Seule l'empreinte est gardée (256 nombres calculés
-- sur le téléphone), jamais l'enregistrement. Donnée biométrique : enregistrée
-- seulement avec l'accord de la personne (consent_at), supprimable à tout moment,
-- effacée avec le compte.
-- Lecture et écriture par le serveur seulement (clé secrète) : aucune règle RLS
-- ouverte aux comptes, l'empreinte n'est jamais renvoyée au navigateur.

create table public.voice_prints (
  user_id uuid primary key references auth.users (id) on delete cascade,
  print real[] not null check (cardinality(print) = 256),
  model text not null check (char_length(model) between 1 and 60),
  consent_at timestamptz not null,
  -- Voix refusées d'affilée : au-delà de 5, paiement à la voix bloqué 15 minutes.
  failed_checks integer not null default 0 check (failed_checks >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

alter table public.voice_prints enable row level security;

-- ============================================================================
-- 20261209000000_proches_sos.sql
-- ============================================================================

-- BTM AI — Proches à prévenir (SOS de Tamilya Connect, app Android)
-- Jusqu'à 4 adresses e-mail par compte. Quand la personne écrit « SOS » dans
-- Tamilya Connect, le message passe de téléphone en téléphone jusqu'au serveur,
-- qui écrit à ces proches (position et batterie du téléphone).
-- Lecture et écriture par le serveur seulement (clé secrète) : aucune règle RLS
-- ouverte aux comptes. Effacées avec le compte.

create table public.sos_contacts (
  user_id uuid not null references auth.users (id) on delete cascade,
  position smallint not null check (position between 1 and 4),
  email text not null check (char_length(email) between 3 and 254),
  created_at timestamptz not null default now(),
  primary key (user_id, position)
);

alter table public.sos_contacts enable row level security;

-- Alertes envoyées : trace pour l'équipe (jamais la position, gardée seulement dans le mail).
create table public.sos_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sent_to smallint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.sos_alerts enable row level security;
create index sos_alerts_user_idx on public.sos_alerts (user_id, created_at desc);

-- ============================================================================
-- 20261210000000_fonctionnalites.sql
-- ============================================================================

-- BTM AI — Fonctionnalités allumées ou éteintes pour tous les utilisateurs (rubrique
-- Fonctionnalités de l'administration). Les administrateurs les ont toujours.
-- Une clé par fonctionnalité ({"documents": true, "livres": false}) ; une clé absente
-- prend la valeur par défaut du code (src/lib/site/features-rules.ts).
-- Dans site_settings : lu et écrit seulement par le serveur (clé secrète), aucune politique.

alter table public.site_settings
  add column if not exists features jsonb not null default '{}'::jsonb
    check (jsonb_typeof(features) = 'object');

-- ============================================================================
-- 20261211000000_mots_imagier_blanchy.sql
-- ============================================================================

-- BTM AI — Mots shimaoré de deux sources écrites, ajoutés au dictionnaire (awa_words)
-- 1. Imagier français-mahorais-malgache (Ph. Baud, R. Badouraly, CASNAV et
--    Rectorat de La Réunion, 2007, Licence Art Libre 1.3) : vocabulaire de l'école.
-- 2. Dictionnaire mahorais-français de Sophie Blanchy (L'Harmattan, 1996),
--    mots cités dans l'introduction (phonologie, classes nominales, verbes).
-- Rien n'est remplacé : un couple déjà connu est ignoré, et un mot français
-- qui a déjà une autre traduction apparaît dans /admin/apprentissage, onglet
-- Nettoyage (« Deux traductions différentes ») pour choisir la bonne.
-- Les deux sources ne sont pas toujours d'accord (jeudi, noir, blanc, maître) :
-- les deux versions sont gardées et signalées de la même façon.

insert into public.awa_words (french, shimaore, category)
values
  -- Imagier : la classe
  ('école', 'likoli', 'école'),
  ('classe', 'likoli', 'école'),
  ('chaise', 'shiri', 'objet'),
  ('crayon', 'kalamu', 'école'),
  ('stylo', 'kalamu', 'école'),
  ('table', 'latabou', 'objet'),
  ('cahier', 'cayé', 'école'),
  ('ciseaux', 'makassi', 'école'),
  ('livre', 'shio', 'école'),
  ('pinceau', 'pinceau', 'école'),
  ('cartable', 'sacochi', 'école'),
  ('gomme', 'gommu', 'école'),
  ('règle', 'régili', 'école'),
  ('feutre', 'fétre', 'école'),
  ('tableau', 'tablo', 'école'),
  ('papier', 'karatasi', 'école'),
  ('dessin', 'sanamwe', 'école'),
  ('éponge', 'chiffon', 'objet'),
  ('leçon', 'musomo', 'école'),
  ('lecture', 'darasa', 'école'),
  ('vacances', 'ouvoumousi', 'école'),
  -- Imagier : les consignes
  ('lire', 'usoma', 'verbe'),
  ('regarder', 'ungalia', 'verbe'),
  ('découper', 'ukatra', 'verbe'),
  ('dessiner', 'usanamwe', 'verbe'),
  ('colorier', 'uthia rangué', 'verbe'),
  ('entourer', 'uzinguidja', 'verbe'),
  ('raconter', 'urongoa', 'verbe'),
  ('écrire', 'uangiha', 'verbe'),
  ('traduire', 'ufaswiri', 'verbe'),
  -- Imagier : les couleurs
  ('couleur', 'rangué', 'couleur'),
  ('rouge', 'djoukounda', 'couleur'),
  ('bleu', 'bilé', 'couleur'),
  ('jaune', 'dzindrano', 'couleur'),
  ('blanc', 'djehou', 'couleur'),
  ('vert', 'dhavo', 'couleur'),
  ('noir', 'dzidhou', 'couleur'),
  -- Imagier : la cour
  ('cour', 'lacourouni', 'école'),
  ('maître', 'fundi likoli', 'école'),
  ('banc', 'shiri', 'objet'),
  ('arbre', 'mwiri', 'nature'),
  ('garçon', 'mwana mutru baba', 'personnes'),
  ('fille', 'mwana mutru mushe', 'personnes'),
  ('goûter', 'gouté', 'nourriture'),
  ('toilettes', 'm''rabani', 'maison'),
  ('ballon', 'bulu', 'objet'),
  ('corde à sauter', 'ngwé ya ouarouka', 'objet'),
  ('toboggan', 'toboggan', 'objet'),
  -- Imagier : le temps
  ('temps', 'wakati', 'temps'),
  ('hier', 'jana', 'temps'),
  ('aujourd''hui', 'léwo', 'temps'),
  ('demain', 'meso', 'temps'),
  ('avant-hier', 'zuzi', 'temps'),
  ('après-demain', 'baada meso', 'temps'),
  ('bientôt', 'tsi hale', 'temps'),
  ('avant', 'kabla', 'temps'),
  ('après', 'baada', 'temps'),
  ('après-midi', 'mutsana', 'temps'),
  ('matin', 'asubuhi', 'temps'),
  ('maintenant', 'avasa', 'temps'),
  ('l''année dernière', 'mwana jana', 'temps'),
  ('l''année prochaine', 'mahani', 'temps'),
  -- Imagier : la cantine
  ('cantine', 'cantine', 'école'),
  ('viande', 'gnyama', 'nourriture'),
  ('cochon', 'puruku', 'animal'),
  ('eau', 'maji', 'nourriture'),
  ('tomate', 'tamati', 'nourriture'),
  ('orange', 'trundra', 'nourriture'),
  ('poisson', 'fie', 'nourriture'),
  ('fourchette', 'fursheti', 'cuisine'),
  ('cuillère', 'sutru', 'cuisine'),
  ('assiette', 'sahani', 'cuisine'),
  ('verre', 'vera', 'cuisine'),
  ('couteau', 'sembea', 'cuisine'),
  ('pain', 'dipé', 'nourriture'),
  -- Imagier : les chiffres
  ('un', 'moja', 'nombre'),
  ('deux', 'mbili', 'nombre'),
  ('trois', 'trarou', 'nombre'),
  ('quatre', 'nne', 'nombre'),
  ('cinq', 'tsano', 'nombre'),
  ('six', 'sita', 'nombre'),
  ('sept', 'saba', 'nombre'),
  ('huit', 'nane', 'nombre'),
  ('neuf', 'shendra', 'nombre'),
  ('dix', 'kumi', 'nombre'),
  -- Imagier : la semaine
  ('semaine', 'mufumo', 'temps'),
  ('lundi', 'mufumoraru', 'jour'),
  ('mardi', 'mufumonne', 'jour'),
  ('mercredi', 'mufumotsano', 'jour'),
  ('jeudi', 'yaoha', 'jour'),
  ('vendredi', 'djumma', 'jour'),
  ('samedi', 'mufumotsi', 'jour'),
  ('dimanche', 'mufumohili', 'jour'),
  -- Imagier : mots d'école
  ('français (langue)', 'shifaranzi', 'culture'),
  ('France', 'faranza', 'lieu'),
  ('Mayotte', 'maore', 'lieu'),
  ('mahorais (langue)', 'shimaore', 'culture'),
  ('malgache (langue)', 'shibushi', 'culture'),
  ('Madagascar', 'madagascar', 'lieu'),
  ('parents', 'wou djama', 'famille'),
  ('bonjour', 'gégé', 'salutation'),
  ('salut', 'gégé', 'salutation'),
  ('au revoir', 'kwahéri', 'salutation'),
  ('merci', 'marahaba', 'politesse'),
  ('oui', 'ewa', 'conversation'),
  ('non', 'ãhã', 'conversation'),
  ('bien', 'ndjema', 'adjectif'),
  ('difficile', 'ndziro', 'adjectif'),
  ('facile', 'ndzandu', 'adjectif'),
  ('malade', 'mwade', 'santé'),
  ('comment tu t''appelles ?', 'wawé wou hiriwa mbani ?', 'phrase'),

  -- Blanchy : mots cités pour la prononciation
  ('sein', 'bele', 'corps'),
  ('chat', 'paha', 'animal'),
  ('cendre', 'vu', 'maison'),
  ('haricot', 'fuu', 'nourriture'),
  ('maison', 'nyumba', 'maison'),
  ('mal', 'mbovu', 'adjectif'),
  ('graine', 'mbiya', 'nature'),
  ('sang', 'damu', 'corps'),
  ('froid', 'baridi', 'météo'),
  ('ennui', 'taabu', 'émotion'),
  ('patate douce', 'batata', 'nourriture'),
  ('éléphant', 'ndovu', 'animal'),
  ('maître', 'fundi', 'métier'),
  ('fusil', 'bunduki', 'objet'),
  ('chèvre', 'mbuzi', 'animal'),
  ('homme blanc', 'mzungu', 'personnes'),
  ('mur', 'pesi', 'maison'),
  ('noix de coco', 'nadzi', 'nourriture'),
  ('idiot', 'daba', 'adjectif'),
  ('remède', 'dalao', 'santé'),
  ('village', 'dago', 'lieu'),
  ('boue', 'godra', 'nature'),
  ('mensonge', 'trambo', 'conversation'),
  ('quelqu''un', 'mutru', 'personnes'),
  ('personne', 'mutru', 'personnes'),
  ('citron', 'ndrimu', 'nourriture'),
  ('guerre', 'kondro', 'culture'),
  ('fin', 'mwandriso', 'temps'),
  ('nom', 'dzina', 'conversation'),
  ('riz', 'tsohole', 'nourriture'),
  ('lancer', 'huvutsa', 'verbe'),
  ('faim', 'ndza', 'santé'),
  ('ami', 'mwandzani', 'personnes'),
  ('natte', 'djavi', 'maison'),
  ('bruit', 'fidjo', 'nature'),
  ('lance', 'tshora', 'objet'),
  ('appât', 'shambwe', 'objet'),
  ('abeille', 'nyoshi', 'animal'),
  ('vache', 'nyombe', 'animal'),
  ('bouche', 'hanyo', 'corps'),
  ('chaussures', 'magoshi', 'vêtement'),
  ('boîte', 'kapoka', 'objet'),
  ('mosquée', 'mukiri', 'religion'),
  ('trou', 'ngama', 'nature'),
  ('porte', 'mulango', 'maison'),
  ('endroit', 'vahanu', 'lieu'),
  ('où ?', 'havi', 'question'),
  ('pirogue', 'laka', 'transport'),
  ('intelligence', 'akili', 'émotion'),
  ('cœur', 'roho', 'corps'),
  ('âme', 'roho', 'religion'),
  ('conte', 'hale', 'culture'),
  ('mer', 'bahari', 'nature'),
  ('jeudi', 'yahoa', 'jour'),
  ('Europe', 'ulaya', 'lieu'),
  ('île', 'shisiwa', 'nature'),
  ('or', 'dhahabu', 'argent'),
  ('s''il te plaît', 'tafadhali', 'politesse'),
  ('histoire', 'hadithi', 'culture'),
  ('trente', 'thalathini', 'nombre'),
  ('cher', 'ghali', 'argent'),
  ('langage', 'lugha', 'conversation'),
  ('nouvelle', 'habari', 'conversation'),
  ('prière', 'swalati', 'religion'),
  ('voie spirituelle', 'twarika', 'religion'),
  -- Blanchy : exemples des classes nominales
  ('enfant', 'mwana', 'famille'),
  ('pêcheur', 'mulozi', 'métier'),
  ('main', 'muhono', 'corps'),
  ('fumée', 'mwesi', 'nature'),
  ('année', 'mwaha', 'temps'),
  ('voiture', 'gari', 'transport'),
  ('balai', 'peo', 'maison'),
  ('dent', 'dzinyo', 'corps'),
  ('animal', 'shinyama', 'animal'),
  ('travail', 'hazi', 'travail'),
  ('vêtement', 'nguo', 'vêtement'),
  ('pluie', 'vua', 'météo'),
  ('toit', 'utro', 'maison'),
  ('machette', 'upanga', 'objet'),
  ('amitié', 'uwandzani', 'émotion'),
  ('beauté', 'uzuri', 'adjectif'),
  ('parole', 'urongozi', 'conversation'),
  ('maladie', 'uwade', 'santé'),
  ('chose', 'shitru', 'objet'),
  ('terre', 'trotro', 'nature'),
  ('lettre', 'barua', 'objet'),
  ('gâteaux', 'mihare', 'nourriture'),
  ('chien', 'mbwa', 'animal'),
  -- Blanchy : adjectifs, forme qui s'accorde avec une personne (classe 1)
  -- ou un arbre (classe 3) quand la personne manque au tableau
  ('long', 'mule', 'adjectif'),
  ('large', 'muvana', 'adjectif'),
  ('neuf (nouveau)', 'mupia', 'adjectif'),
  ('noir', 'mudu', 'couleur'),
  ('joli', 'muzuri', 'adjectif'),
  ('mauvais', 'mwi', 'adjectif'),
  ('bon', 'mwema', 'adjectif'),
  ('petit', 'mutiti', 'adjectif'),
  ('court', 'mukutri', 'adjectif'),
  ('mince', 'mutsala', 'adjectif'),
  ('lourd', 'mudziro', 'adjectif'),
  ('léger', 'mwangu', 'adjectif'),
  ('étranger', 'mudjeni', 'personnes'),
  ('blanc', 'mweu', 'couleur'),
  -- Blanchy : pronoms
  ('moi', 'wami', 'pronom'),
  ('toi', 'wawe', 'pronom'),
  ('lui / elle', 'waye', 'pronom'),
  ('nous', 'wasi', 'pronom'),
  ('vous', 'wanyu', 'pronom'),
  ('eux / elles', 'wawo', 'pronom'),
  -- Blanchy : verbes (infinitif)
  ('chanter', 'uhimba', 'verbe'),
  ('prendre', 'urenga', 'verbe'),
  ('appeler', 'uhira', 'verbe'),
  ('dormir', 'ulala', 'verbe'),
  ('s''appeler', 'uhiriwa', 'verbe'),
  ('faire', 'ufanya', 'verbe'),
  ('ouvrir', 'ubua', 'verbe'),
  ('venir', 'uja', 'verbe'),
  ('aller', 'uendra', 'verbe'),
  ('rester', 'uketsi', 'verbe'),
  ('acheter', 'ununua', 'verbe'),
  ('vendre', 'uudza', 'verbe'),
  ('être', 'uka', 'verbe'),
  ('trouver', 'upara', 'verbe'),
  ('sortir', 'ulawa', 'verbe'),
  ('revenir', 'uregea', 'verbe'),
  ('je veux', 'nitsaha', 'phrase')
on conflict (lower(french), lower(shimaore)) do nothing;

-- ============================================================================
-- 20261212000000_mots_casnav_manuel.sql
-- ============================================================================

-- BTM AI — Mots shimaoré de deux autres sources, ajoutés au dictionnaire (awa_words)
-- 1. « Nisusoma shimaore — J'apprends le shimaoré », CASNAV Réunion, mai 2019
--    (lexique : corps, fruits, légumes, orientation, nombres, couleurs, verbes,
--    géographie, émotions, temps, salutations, mots interrogatifs).
-- 2. « Manuel grammatical de shimaore » (ylangue.free.fr) : listes de vocabulaire.
-- Les lettres ɓ, ɗ et v̄ du manuel sont écrites b, d et v, comme le reste du dictionnaire.
-- Comme 20261211000000_mots_imagier_blanchy.sql, rien n'est remplacé : un couple
-- déjà connu est ignoré, et un mot français qui a déjà une autre traduction
-- apparaît dans /admin/apprentissage, onglet Nettoyage (« Deux traductions
-- différentes ») pour choisir la bonne. Les sources se contredisent souvent
-- (jeudi, vendredi, rouge, vert, bonjour…) : toutes les versions sont gardées.

insert into public.awa_words (french, shimaore, category)
values
  -- CASNAV : le corps humain
  ('tête', 'shitswa', 'corps'),
  ('langue (corps)', 'ilime', 'corps'),
  ('oreille', 'kio', 'corps'),
  ('jambe', 'mundru', 'corps'),
  ('pied', 'mundru', 'corps'),
  ('cuisse', 'paja', 'corps'),
  ('fesse', 'muvumo', 'corps'),
  ('épaule', 'bega', 'corps'),
  ('bras', 'muhono', 'corps'),
  ('paume', 'pi la muhono', 'corps'),
  ('poitrine', 'shifuba', 'corps'),
  ('visage', 'uso', 'corps'),
  ('menton', 'shilevu', 'corps'),
  ('front', 'komo', 'corps'),
  ('nez', 'pua', 'corps'),
  ('cou', 'tsingo', 'corps'),
  ('talon', 'karo', 'corps'),
  ('orteil', 'kofu za mindru', 'corps'),
  ('ventre', 'mimba', 'corps'),
  ('dos', 'mengo', 'corps'),
  ('œil', 'dzitso', 'corps'),
  ('sourcil', 'tsi', 'corps'),
  ('joue', 'savu', 'corps'),
  ('cheveu', 'nyole', 'corps'),
  ('doigt', 'sha', 'corps'),
  ('genou', 'gunguni', 'corps'),
  ('ongle', 'kofu', 'corps'),
  ('narine', 'pembe', 'corps'),
  ('lèvre', 'domu', 'corps'),
  ('nombril', 'trutru', 'corps'),
  ('fièvre', 'buhuo', 'santé'),
  ('je suis fatigué', 'tsilemewa', 'phrase'),
  ('je ne suis pas en forme', 'tsisi fetre', 'phrase'),
  -- CASNAV : fruits, marché
  ('ananas', 'nanasi', 'nourriture'),
  ('avocat (fruit)', 'zavuka', 'nourriture'),
  ('banane verte', 'trovi', 'nourriture'),
  ('banane mûre', 'sindza', 'nourriture'),
  ('coco à boire', 'shijavu', 'nourriture'),
  ('cœur de bœuf (fruit)', 'konokono roho ya nyombe', 'nourriture'),
  ('corossol', 'konokono', 'nourriture'),
  ('datte', 'trendre', 'nourriture'),
  ('fruit du baobab', 'buyu', 'nourriture'),
  ('goyave', 'pwera', 'nourriture'),
  ('grenade (fruit)', 'trundra la pevoni', 'nourriture'),
  ('jaque', 'fenesi', 'nourriture'),
  ('jamblon', 'zambarao', 'nourriture'),
  ('letchi', 'litshi', 'nourriture'),
  ('mandarine', 'balandzi', 'nourriture'),
  ('mangue', 'manga', 'nourriture'),
  ('mangue mûre', 'djoro', 'nourriture'),
  ('melon', 'trango', 'nourriture'),
  ('papaye', 'papaya', 'nourriture'),
  ('pastèque', 'trango maji', 'nourriture'),
  ('pomme', 'pomu', 'nourriture'),
  ('pomme cannelle', 'konokono', 'nourriture'),
  ('raisin', 'zabibu', 'nourriture'),
  ('tamarin', 'uhaju', 'nourriture'),
  ('marché', 'bazari', 'commerce'),
  ('sac', 'mukoba', 'objet'),
  ('panier', 'kalaga', 'objet'),
  ('argent', 'marike', 'argent'),
  ('prix', 'thamani', 'argent'),
  ('pièces de monnaie', 'turuturu', 'argent'),
  ('c''est pourri', 'iolo', 'phrase'),
  ('c''est mûr', 'ihivu', 'phrase'),
  ('pas mûr', 'mbitsi', 'adjectif'),
  ('combien ça coûte ?', 'kisaji', 'question'),
  -- CASNAV : légumes
  ('lentilles', 'tzandzi', 'nourriture'),
  ('haricot', 'kundre', 'nourriture'),
  ('maïs (céréale)', 'mrama', 'nourriture'),
  ('concombre', 'kokobre', 'nourriture'),
  ('citrouille', 'trango', 'nourriture'),
  ('courgette', 'curgeti', 'nourriture'),
  ('piment', 'putu', 'nourriture'),
  ('pipangaille', 'dodoki', 'nourriture'),
  ('poivron', 'putu la shinzungu', 'nourriture'),
  ('aubergine', 'bengani', 'nourriture'),
  ('ail', 'shurungu vuje', 'nourriture'),
  ('taro', 'jimbi', 'nourriture'),
  ('igname', 'shihazi', 'nourriture'),
  ('carotte', 'karoti', 'nourriture'),
  ('chou', 'lushu', 'nourriture'),
  ('salade', 'saladi', 'nourriture'),
  ('cresson', 'kirison', 'nourriture'),
  ('gingembre', 'tsinguiziu', 'nourriture'),
  ('pomme de terre', 'pumditara', 'nourriture'),
  ('oignon', 'shurungu', 'nourriture'),
  ('brède', 'feliki', 'nourriture'),
  -- CASNAV : orientation
  ('en haut', 'uju', 'lieu'),
  ('en bas', 'utsini', 'lieu'),
  ('devant', 'm''beli', 'lieu'),
  ('derrière', 'niuma', 'lieu'),
  ('gauche', 'potro', 'lieu'),
  ('droite', 'kume', 'lieu'),
  ('à gauche', 'potroni', 'lieu'),
  ('à droite', 'kumeni', 'lieu'),
  ('au milieu', 'harihari', 'lieu'),
  ('tout en haut', 'uju soifi', 'lieu'),
  ('tourne à gauche', 'bouza potroni', 'phrase'),
  ('tourne à droite', 'bouza kumeni', 'phrase'),
  -- CASNAV : nombres
  ('zéro', 'kavu', 'nombre'),
  ('trois', 'traru', 'nombre'),
  ('onze', 'kumi na moja', 'nombre'),
  ('douze', 'kumi na mbili', 'nombre'),
  ('treize', 'kumi na traru', 'nombre'),
  ('quatorze', 'kumi na nne', 'nombre'),
  ('quinze', 'kumi na tsano', 'nombre'),
  ('seize', 'kumi na sita', 'nombre'),
  ('dix-sept', 'kumi na saba', 'nombre'),
  ('dix-huit', 'kumi na nane', 'nombre'),
  ('dix-neuf', 'kumi na shendra', 'nombre'),
  ('vingt', 'shirini', 'nombre'),
  ('trente', 'thelathini', 'nombre'),
  ('quarante', 'arbaini', 'nombre'),
  ('cinquante', 'hamsini', 'nombre'),
  ('soixante', 'sitini', 'nombre'),
  ('soixante-dix', 'sabwini', 'nombre'),
  ('quatre-vingts', 'thamanini', 'nombre'),
  ('quatre-vingt-dix', 'tuswini', 'nombre'),
  ('cent', 'mia', 'nombre'),
  ('deux cents', 'mia teni', 'nombre'),
  ('mille', 'alifu', 'nombre'),
  ('million', 'laki', 'nombre'),
  ('milliard', 'luku', 'nombre'),
  ('moitié', 'nusu', 'nombre'),
  ('quart', 'robo', 'nombre'),
  ('huitième', 'thumuni', 'nombre'),
  ('premier', 'wa handra', 'nombre'),
  -- CASNAV : couleurs
  ('blanc', 'ndjeu', 'couleur'),
  ('noir', 'ndzidu', 'couleur'),
  ('rouge', 'ndzukundru', 'couleur'),
  ('bleu', 'bile', 'couleur'),
  ('vert', 'mrututu', 'couleur'),
  ('jaune', 'dzindzano', 'couleur'),
  ('orange (couleur)', 'marundra', 'couleur'),
  ('violet', 'zambarao', 'couleur'),
  -- CASNAV : la femme mahoraise
  ('fête de mariage', 'manzaraka', 'fête'),
  ('salouva (pagne)', 'salouva', 'vêtement'),
  ('châle', 'kishali', 'vêtement'),
  ('masque de beauté', 'm''sindzano', 'culture'),
  ('robe', 'robo', 'vêtement'),
  ('vêtement', 'nguo', 'vêtement'),
  ('fleurs de jasmin', 'ãfu', 'culture'),
  -- CASNAV : verbes d'action
  ('apprendre', 'usoma', 'verbe'),
  ('dire', 'urongoa', 'verbe'),
  ('demander', 'udzisa', 'verbe'),
  ('parler', 'ulagua', 'verbe'),
  ('pouvoir', 'ushindra', 'verbe'),
  ('arriver', 'uaswili', 'verbe'),
  ('partir', 'ulawa', 'verbe'),
  ('quitter', 'ulawa', 'verbe'),
  ('rentrer', 'ugiya', 'verbe'),
  ('rentrer', 'uregea', 'verbe'),
  ('descendre', 'ushuka', 'verbe'),
  ('descendre en ville', 'ushuka mjini', 'verbe'),
  ('avaler', 'umedza', 'verbe'),
  ('boire', 'unwa', 'verbe'),
  ('manger', 'ula', 'verbe'),
  ('couper', 'ukatra', 'verbe'),
  ('se lever', 'uhima', 'verbe'),
  ('coucher (quelqu''un)', 'uladza', 'verbe'),
  ('se laver', 'udjihosa', 'verbe'),
  ('s''habiller', 'upindra', 'verbe'),
  ('se déshabiller', 'utsua', 'verbe'),
  ('marcher', 'uendra mundru', 'verbe'),
  ('sauter', 'uruka', 'verbe'),
  ('courir', 'uendra m''bio', 'verbe'),
  ('danser', 'uzina', 'verbe'),
  ('se mettre debout', 'uhime', 'verbe'),
  ('baisser', 'ushukidza', 'verbe'),
  ('suivre', 'udunga', 'verbe'),
  ('tourner', 'uzinga', 'verbe'),
  ('nager', 'uela', 'verbe'),
  ('choisir', 'utsahua', 'verbe'),
  ('payer', 'uliva', 'verbe'),
  ('peser', 'uvima', 'verbe'),
  ('déposer', 'uhetsi', 'verbe'),
  ('remplir', 'ujadza', 'verbe'),
  ('écouter', 'uvulikia', 'verbe'),
  ('réfléchir', 'ufikiri', 'verbe'),
  ('répéter', 'uregeza', 'verbe'),
  ('compter', 'uhisabu', 'verbe'),
  ('aimer', 'uvendza', 'verbe'),
  ('continuer', 'utikadi', 'verbe'),
  ('comprendre', 'uelewa', 'verbe'),
  -- CASNAV : géographie
  ('nord', 'kibulani', 'lieu'),
  ('sud', 'swilihini', 'lieu'),
  ('est', 'mashariki', 'lieu'),
  ('ouest', 'maharibi', 'lieu'),
  ('archipel', 'masiwa', 'lieu'),
  ('barge', 'barji', 'transport'),
  ('barrière de corail', 'mwamba', 'nature'),
  ('bâtiment', 'jumba', 'lieu'),
  ('canne à sucre', 'muwa', 'nature'),
  ('champ', 'shamba', 'lieu'),
  ('chemin', 'ndzia', 'lieu'),
  ('rue', 'ndzia', 'lieu'),
  ('ciel', 'wingu', 'nature'),
  ('continent', 'bara', 'lieu'),
  ('cyclone', 'daruba', 'météo'),
  ('frontière', 'mupaka', 'lieu'),
  ('hôpital', 'lapitali', 'lieu'),
  ('lac', 'dzia', 'nature'),
  ('montagne', 'mulima', 'nature'),
  ('pays', 'tsi', 'lieu'),
  ('plage', 'mutsanga', 'nature'),
  ('rivière', 'muro', 'nature'),
  ('route', 'pare', 'lieu'),
  ('ville', 'dago', 'lieu'),
  ('volcan', 'volcan', 'nature'),
  -- CASNAV : émotions
  ('colère', 'hasira', 'émotion'),
  ('je suis en colère', 'tsi jaya hasira', 'phrase'),
  ('se réconcilier', 'ufaniasuluhu', 'verbe'),
  ('tristesse', 'hamu', 'émotion'),
  ('je suis triste', 'tsina hamu', 'phrase'),
  ('pleurer', 'uliya', 'verbe'),
  ('faire pleurer', 'ulidza', 'verbe'),
  ('chagriner', 'usikitisha', 'verbe'),
  ('joie', 'raha', 'émotion'),
  ('je suis content', 'tsijiviwa', 'phrase'),
  ('faire plaisir', 'ujividza', 'verbe'),
  ('peur', 'trisidzo', 'émotion'),
  ('peureux', 'muhara', 'émotion'),
  ('j''ai peur', 'nisirya', 'phrase'),
  ('calme', 'utrulivu', 'émotion'),
  ('se calmer', 'utruliya', 'verbe'),
  ('calmement', 'taratibu', 'adjectif'),
  ('ça suffit !', 'basi', 'conversation'),
  ('en paix', 'salama', 'conversation'),
  ('stress', 'harama', 'émotion'),
  ('fatigue', 'ulemevu', 'santé'),
  ('être fatigué', 'ulemewa', 'verbe'),
  ('amour', 'mahaba', 'émotion'),
  ('je t''aime', 'nisihuvendza', 'phrase'),
  ('moi aussi', 'wami tsena', 'phrase'),
  ('avoir mal', 'ukodza', 'santé'),
  ('courage', 'baridjitihadi', 'émotion'),
  ('j''ai des soucis', 'tsina mashaka', 'phrase'),
  -- CASNAV : le temps
  ('seconde', 'nukta', 'temps'),
  ('minute', 'dakika', 'temps'),
  ('heure', 'sa', 'temps'),
  ('la veille', 'vojana', 'temps'),
  ('nuit', 'uku', 'temps'),
  ('soir', 'ujoni', 'temps'),
  ('moment', 'muda', 'temps'),
  ('la semaine prochaine', 'mufumo ujao', 'temps'),
  ('l''année dernière', 'mwahajana', 'temps'),
  ('le mois passé', 'mwezini yavira', 'temps'),
  ('vendredi', 'idjimwa', 'jour'),
  ('samedi', 'mufomotsi', 'jour'),
  ('dimanche', 'mufumovhili', 'jour'),
  ('année', 'mwahan', 'temps'),
  ('mois', 'mwezi', 'temps'),
  ('janvier', 'jãvye', 'date'),
  ('février', 'fevriye', 'date'),
  ('mars', 'marsi', 'date'),
  ('avril', 'avrili', 'date'),
  ('mai', 'me', 'date'),
  ('juin', 'jwî', 'date'),
  ('juillet', 'jwiye', 'date'),
  ('août', 'utu', 'date'),
  ('septembre', 'septambru', 'date'),
  ('octobre', 'oktobru', 'date'),
  ('novembre', 'novambru', 'date'),
  ('décembre', 'desambru', 'date'),
  ('aujourd''hui', 'leo', 'temps'),
  -- CASNAV : salutations, questions
  ('bonjour', 'jeje', 'salutation'),
  ('bonjour (à un aîné)', 'kwezi', 'salutation'),
  ('bonjour à tous', 'jeje wanyu', 'salutation'),
  ('ça va ?', 'wa fetre ?', 'salutation'),
  ('ça va bien', 'tsa fetre', 'salutation'),
  ('bien', 'fetre', 'adjectif'),
  ('bienvenue', 'karibu', 'salutation'),
  ('il y a quelqu''un ?', 'hodi', 'salutation'),
  ('à bientôt', 'ritsowonana', 'salutation'),
  ('à un de ces jours', 'suku yangina tsena', 'salutation'),
  ('merci beaucoup', 'marahaba nyengi', 'politesse'),
  ('quelles nouvelles ?', 'habari ?', 'salutation'),
  ('comment tu t''appelles ?', 'wawe uhiriwa mbani ?', 'phrase'),
  ('qui es-tu ?', 'wawe de mbani ?', 'phrase'),
  ('où habites-tu ?', 'wawe uketsi havi ?', 'phrase'),
  ('je ne sais pas', 'tsiji', 'phrase'),
  ('que veux-tu ?', 'utsaha trini ?', 'phrase'),
  ('quoi ?', 'trini', 'question'),
  ('qui ?', 'mbani', 'question'),
  ('combien ?', 'ngavi', 'question'),
  ('pourquoi ?', 'manatrini', 'question'),
  ('comment ?', 'jeje', 'question'),
  ('avec qui ?', 'na mbani', 'question'),
  ('quand ?', 'lini', 'question'),
  -- CASNAV : mots empruntés au français, divers
  ('gâteau', 'gato', 'nourriture'),
  ('taxi', 'taksi', 'transport'),
  ('avion', 'aeroplani', 'transport'),
  ('jardin', 'zarde', 'maison'),
  ('policier', 'polisi', 'métier'),
  ('chauffeur', 'shofera', 'métier'),
  ('docteur', 'dukutera', 'métier'),
  ('requin', 'papa', 'animal'),
  ('papa', 'baba', 'famille'),
  ('maman', 'mama', 'famille'),
  ('biberon', 'bibiro', 'objet'),
  ('pain', 'dipe', 'nourriture'),
  ('poisson', 'fi', 'nourriture'),
  ('petit', 'titi', 'adjectif'),
  ('là', 'vavo', 'lieu'),
  ('allons !', 'haya', 'conversation'),
  ('viens !', 'ko', 'conversation'),
  ('c''est', 'de', 'grammaire'),
  ('alors', 'basi', 'grammaire'),
  ('Européen', 'muzungu', 'personnes'),

  -- Manuel : salutations, expressions
  ('bonjour monsieur', 'jeje monye', 'salutation'),
  ('bonjour madame', 'jeje bweni', 'salutation'),
  ('ça ne fait rien', 'haidhuru', 'politesse'),
  ('Dieu merci', 'alhamdulillahi', 'politesse'),
  ('et toi ?', 'basi wawe ?', 'conversation'),
  ('allons-y !', 'halo', 'conversation'),
  ('un peu', 'kiasi', 'adjectif'),
  ('au revoir', 'kwaheri', 'salutation'),
  ('bonne nuit', 'uku mwema', 'salutation'),
  ('dors bien', 'lala ha unono', 'salutation'),
  ('fais de beaux rêves', 'ndzozi ndjema', 'salutation'),
  ('bonne matinée', 'asubuhi ndjema', 'salutation'),
  ('bonne année', 'mwaha mwema', 'salutation'),
  ('bonne fête de l''Aïd', 'idi mbaraka', 'fête'),
  -- Manuel : verbes
  ('savoir', 'ujua', 'verbe'),
  ('connaître', 'ujua', 'verbe'),
  ('entendre', 'ukia', 'verbe'),
  ('regarder', 'ungalia', 'verbe'),
  ('avoir', 'uka na', 'verbe'),
  ('obtenir', 'upara', 'verbe'),
  ('frapper', 'urema', 'verbe'),
  ('mettre', 'utria', 'verbe'),
  ('arriver', 'uasili', 'verbe'),
  ('échanger', 'ubadili', 'verbe'),
  ('rester', 'ubaki', 'verbe'),
  ('essayer', 'udjerebu', 'verbe'),
  ('répondre', 'udjibu', 'verbe'),
  ('penser', 'ufikiri', 'verbe'),
  ('se réjouir', 'ufurahi', 'verbe'),
  ('raconter', 'uhadisi', 'verbe'),
  ('voyager', 'usafiri', 'verbe'),
  ('saluer', 'usalimu', 'verbe'),
  ('commencer', 'uandrisa', 'verbe'),
  ('laisser', 'ulisha', 'verbe'),
  ('terminer', 'umalidza', 'verbe'),
  ('voir', 'uona', 'verbe'),
  ('aider', 'usaidia', 'verbe'),
  ('tenir', 'usika', 'verbe'),
  ('vouloir', 'utsaha', 'verbe'),
  ('passer', 'uvira', 'verbe'),
  ('arrêter', 'uzia', 'verbe'),
  ('mourir', 'ufa', 'verbe'),
  ('venir de', 'ulaa', 'verbe'),
  ('pleuvoir', 'unya', 'verbe'),
  ('donner', 'uva', 'verbe'),
  ('jouer', 'uangadza', 'verbe'),
  ('fermer', 'ubala', 'verbe'),
  ('augmenter', 'uengedza', 'verbe'),
  ('accueillir', 'ukaribisa', 'verbe'),
  ('pêcher', 'uloa', 'verbe'),
  ('revenir', 'uregeya', 'verbe'),
  ('diminuer', 'uvungudza', 'verbe'),
  ('prêter', 'uazima', 'verbe'),
  ('oublier', 'udala', 'verbe'),
  ('laver le linge', 'ufua', 'verbe'),
  ('laver la vaisselle', 'uhosa', 'verbe'),
  ('balayer', 'uhundza', 'verbe'),
  ('attendre', 'ulindra', 'verbe'),
  ('épouser', 'ulola', 'verbe'),
  ('repasser', 'upasi', 'verbe'),
  ('faire la cuisine', 'upiha', 'verbe'),
  ('enlever', 'upua', 'verbe'),
  ('essuyer', 'uvangua', 'verbe'),
  ('monter', 'uheya', 'verbe'),
  ('craindre', 'uriya', 'verbe'),
  ('enseigner', 'usomedza', 'verbe'),
  ('se laver', 'uhoa', 'verbe'),
  ('être d''accord', 'ukubali', 'verbe'),
  ('suffire', 'utosha', 'verbe'),
  ('cultiver', 'ulima', 'verbe'),
  ('obéir', 'uvulikia', 'verbe'),
  ('compter', 'uhasibu', 'verbe'),
  ('être en retard', 'uhoma', 'verbe'),
  ('entrer', 'ungia', 'verbe'),
  ('être étonné', 'ushanga', 'verbe'),
  ('traverser', 'ushia', 'verbe'),
  ('coudre', 'usona', 'verbe'),
  ('oser', 'usubutu', 'verbe'),
  ('préparer', 'utayarisha', 'verbe'),
  ('se reposer', 'uvumua', 'verbe'),
  ('construire', 'uwaha', 'verbe'),
  ('accepter', 'ukiri', 'verbe'),
  ('s''embarquer', 'upashia', 'verbe'),
  ('se dépêcher', 'usimamia', 'verbe'),
  ('pousser', 'usukuma', 'verbe'),
  ('se promener', 'utembeya', 'verbe'),
  ('aider', 'uvidza', 'verbe'),
  ('apporter', 'uvinga', 'verbe'),
  ('tuer', 'uwula', 'verbe'),
  ('vomir', 'uraviha', 'verbe'),
  ('décéder', 'ufariki dunia', 'verbe'),
  ('attacher', 'ufunga', 'verbe'),
  ('refuser', 'uharaya', 'verbe'),
  ('manquer', 'ukosa', 'verbe'),
  ('faire ses adieux', 'ulaga', 'verbe'),
  ('implorer', 'umia', 'verbe'),
  ('fêter', 'usherehi', 'verbe'),
  ('plaindre', 'usikinia', 'verbe'),
  ('se taire', 'utshipu', 'verbe'),
  ('apprendre par cœur', 'utwali', 'verbe'),
  ('partager', 'uwanisa', 'verbe'),
  ('chasser', 'ufuma', 'verbe'),
  ('changer', 'ugauha', 'verbe'),
  ('finir', 'ukoma', 'verbe'),
  ('trébucher', 'ukwala', 'verbe'),
  ('être ivre', 'ulewa', 'verbe'),
  ('sursauter', 'umaruha', 'verbe'),
  ('se perdre', 'upotea', 'verbe'),
  ('envoyer', 'uruma', 'verbe'),
  ('chuchoter', 'uvongona', 'verbe'),
  ('croquer', 'uvuruha', 'verbe'),
  ('se battre', 'uwana', 'verbe'),
  ('continuer', 'uendrelea', 'verbe'),
  ('réussir', 'ufaulu', 'verbe'),
  ('trouer', 'uforoa', 'verbe'),
  ('monter en brousse', 'uheya liju', 'verbe'),
  ('remercier', 'ushukuria', 'verbe'),
  ('conduire une voiture', 'uvinga gari', 'verbe'),
  ('prospérer', 'ubarikishiha', 'verbe'),
  ('féliciter', 'ufereshea', 'verbe'),
  ('rêver', 'uhora', 'verbe'),
  ('pourrir', 'uola', 'verbe'),
  ('saluer', 'urongodza', 'verbe'),
  ('utiliser', 'urumia', 'verbe'),
  ('rire', 'utseha', 'verbe'),
  ('souffler', 'uvuma', 'verbe'),
  ('battre', 'ububua', 'verbe'),
  ('se taire', 'uburiha', 'verbe'),
  ('détester', 'uyenga', 'verbe'),
  ('maigrir', 'uhondra', 'verbe'),
  ('être rassasié', 'ukura', 'verbe'),
  ('flâner', 'urara', 'verbe'),
  ('conseiller', 'usia', 'verbe'),
  ('harceler', 'usonga', 'verbe'),
  ('tresser', 'usuka', 'verbe'),
  ('se sauver', 'utrala', 'verbe'),
  ('élever (des bêtes)', 'utsunga', 'verbe'),
  ('chercher', 'uzunguha', 'verbe'),
  ('vieillir', 'uduha', 'verbe'),
  ('expliquer', 'ueledza', 'verbe'),
  ('voler (dérober)', 'uhiba', 'verbe'),
  ('blesser', 'uhodza', 'verbe'),
  ('tousser', 'ukohola', 'verbe'),
  ('se souvenir', 'unahana', 'verbe'),
  ('soigner', 'uzihira', 'verbe'),
  ('refroidir', 'uziliya', 'verbe'),
  ('éteindre', 'uzima', 'verbe'),
  ('réclamer', 'udai', 'verbe'),
  ('accompagner', 'udungamana', 'verbe'),
  ('visiter', 'uzuru', 'verbe'),
  ('désirer', 'utamani', 'verbe'),
  ('se ressembler', 'ufanana', 'verbe'),
  ('se rencontrer', 'uparana', 'verbe'),
  ('s''entraider', 'usaidiana', 'verbe'),
  ('se voir', 'uonana', 'verbe'),
  ('nourrir', 'ulisa', 'verbe'),
  ('montrer', 'uonesa', 'verbe'),
  ('guérir', 'uvona', 'verbe'),
  ('respirer', 'uvumua', 'verbe'),
  ('se débrouiller', 'udjiduburia', 'verbe'),
  ('se tromper', 'udjihada', 'verbe'),
  -- Manuel : personnes
  ('invité', 'mudjeni', 'personnes'),
  ('parent', 'mudzade', 'famille'),
  ('roi', 'mufalme', 'personnes'),
  ('travailleur', 'mufanyizi hazi', 'métier'),
  ('Français (personne)', 'mufarantsa', 'personnes'),
  ('Indien', 'muhindi', 'personnes'),
  ('petit-fils', 'mujuhu', 'famille'),
  ('habitant', 'mukazi', 'personnes'),
  ('cultivateur', 'mulimizi', 'métier'),
  ('mari', 'mume', 'famille'),
  ('Africain', 'mumrima', 'personnes'),
  ('Anglais (personne)', 'mungereza', 'personnes'),
  ('Dieu', 'mungu', 'religion'),
  ('acheteur', 'mununuzi', 'commerce'),
  ('camarade', 'munyawe', 'personnes'),
  ('épouse', 'mushe', 'famille'),
  ('célibataire', 'mutsumba', 'personnes'),
  ('vieux', 'muzee', 'personnes'),
  ('muezzin', 'mwadini', 'religion'),
  ('belle-sœur', 'mwamu', 'famille'),
  ('être humain', 'mwanadamu', 'personnes'),
  ('jeune', 'mwanamtsa', 'personnes'),
  ('frère ou sœur', 'mwananya', 'famille'),
  ('élève', 'mwana shioni', 'école'),
  ('bébé', 'mwana zaza', 'famille'),
  ('Arabe', 'mwarabu', 'personnes'),
  ('villageois', 'mwenyeji', 'personnes'),
  ('propriétaire', 'mwenyewe', 'personnes'),
  ('voleur', 'mwidzi', 'personnes'),
  ('frère', 'mwananya mutru baba', 'famille'),
  ('sœur', 'mwananya mutru mama', 'famille'),
  ('fils', 'mwanamtsa mutru baba', 'famille'),
  ('fille', 'mwanamtsa mutru mama', 'famille'),
  ('homme', 'mutru baba', 'personnes'),
  ('femme', 'mutru mama', 'personnes'),
  ('père', 'baba', 'famille'),
  ('mère', 'mama', 'famille'),
  ('grand-père', 'bakoko', 'famille'),
  ('grand-mère', 'koko', 'famille'),
  ('monsieur', 'monye', 'personnes'),
  ('madame', 'bweni', 'personnes'),
  ('docteur', 'duktera', 'métier'),
  ('président', 'raisi', 'personnes'),
  ('adolescent', 'shababi', 'personnes'),
  ('médecin', 'twabibu', 'métier'),
  ('oncle (maternel)', 'zama', 'famille'),
  ('tante (paternelle)', 'ngivavi', 'famille'),
  ('grand frère', 'zuki', 'famille'),
  ('gendre', 'bamuhe', 'famille'),
  ('belle-mère', 'nyadza', 'famille'),
  ('beau-frère', 'valahi', 'famille'),
  ('beau-frère', 'shemedji', 'famille'),
  ('orphelin', 'yatima', 'personnes'),
  ('témoin', 'shahidi', 'personnes'),
  ('chef', 'shefu', 'personnes'),
  ('commerçant', 'bahazazi', 'commerce'),
  ('ministre', 'waziri', 'personnes'),
  ('Malgache (personne)', 'mubushi', 'personnes'),
  ('malin', 'mudjanja', 'adjectif'),
  ('chanteur', 'muhimbizi', 'métier'),
  ('têtu', 'mukaidi', 'adjectif'),
  ('bavard', 'mulaguzi', 'adjectif'),
  ('bavard', 'mubwabwa', 'adjectif'),
  ('gourmand', 'mulamo', 'adjectif'),
  ('ivrogne', 'mulevi', 'personnes'),
  ('dragueur', 'muzinzi', 'personnes'),
  ('courageux', 'mushudjaa', 'adjectif'),
  ('vantard', 'mudjisifu', 'adjectif'),
  ('sot', 'mujinga', 'adjectif'),
  ('traître', 'munafiki', 'adjectif'),
  ('patient', 'mustahamilifu', 'adjectif'),
  ('expert', 'mutaalamu', 'adjectif'),
  ('sauvage', 'mutoro', 'adjectif'),
  ('calme', 'mutrulivu', 'adjectif'),
  ('honnête', 'mwaminifu', 'adjectif'),
  -- Manuel : arbres, plantes
  ('baobab', 'mubuyu', 'nature'),
  ('jaquier', 'mufenesi', 'nature'),
  ('arbre à pain', 'muframpe', 'nature'),
  ('manioc', 'muhogo', 'nourriture'),
  ('citronnier', 'mulimu', 'nature'),
  ('manguier', 'mumanga', 'nature'),
  ('cocotier', 'munadzi', 'nature'),
  ('papayer', 'mupapaya', 'nature'),
  ('oranger', 'murundra', 'nature'),
  ('plantes', 'mimea', 'nature'),
  ('épine', 'muba', 'nature'),
  ('palétuvier', 'muhoko', 'nature'),
  ('bananier', 'murindri', 'nature'),
  ('bananier', 'trindri', 'nature'),
  ('goyavier', 'mupwera', 'nature'),
  ('racine', 'muzi', 'nature'),
  ('badamier', 'munyamba', 'nature'),
  ('corossolier', 'mukonokono', 'nature'),
  ('régime de bananes', 'mukungu', 'nourriture'),
  ('feuille', 'wani', 'nature'),
  ('herbe', 'davu', 'nature'),
  ('fleur', 'fulera', 'nature'),
  -- Manuel : corps
  ('os', 'mubwa', 'corps'),
  ('queue', 'mushia', 'animal'),
  ('corps', 'mwili', 'corps'),
  ('aile', 'bawa', 'animal'),
  ('langue (corps)', 'ulimi', 'corps'),
  ('gorge', 'umiyo', 'corps'),
  ('salive', 'ure', 'corps'),
  ('lèvre', 'domo', 'corps'),
  ('estomac', 'trumbo', 'corps'),
  ('griffe', 'kofu', 'animal'),
  ('poil', 'puzi', 'corps'),
  ('membre', 'shiga', 'corps'),
  ('barbe', 'ndrevu', 'corps'),
  ('peau', 'ngozi', 'corps'),
  ('cheveux', 'nyele', 'corps'),
  ('cœur', 'mo', 'corps'),
  ('nez', 'mpua', 'corps'),
  ('souffle', 'pumu', 'corps'),
  ('visage', 'sura', 'corps'),
  ('foie', 'nye', 'corps'),
  ('cerveau', 'wongo', 'corps'),
  -- Manuel : objets, maison
  ('gâteau', 'muhare', 'nourriture'),
  ('râpe à coco', 'muho', 'cuisine'),
  ('ceinture', 'mukandra', 'vêtement'),
  ('échelle', 'mulingo', 'objet'),
  ('boubou', 'mulizima', 'vêtement'),
  ('tuyau', 'mupira', 'objet'),
  ('brosse à dents', 'muswaki', 'objet'),
  ('sauce', 'mutsuzi', 'nourriture'),
  ('pilon', 'mwitsi', 'cuisine'),
  ('bouilloire', 'mudila', 'cuisine'),
  ('bagage', 'mudzo', 'objet'),
  ('brochette', 'mushakiki', 'nourriture'),
  ('clou', 'mushumari', 'objet'),
  ('moustiquaire', 'mustakera', 'maison'),
  ('ligne', 'mustari', 'école'),
  ('plat de bananes vertes', 'mutsolola', 'nourriture'),
  ('oreiller', 'mutsao', 'maison'),
  ('matelas', 'godoro', 'maison'),
  ('chaussure', 'goshi', 'vêtement'),
  ('chaussure', 'kabwa', 'vêtement'),
  ('sac de jute', 'guni', 'objet'),
  ('pantalon', 'surwali', 'vêtement'),
  ('chemise', 'shemizi', 'vêtement'),
  ('pagne d''homme', 'shikoi', 'vêtement'),
  ('chambre', 'fuko', 'maison'),
  ('cuisine (pièce)', 'banga', 'maison'),
  ('véranda', 'baraza', 'maison'),
  ('fenêtre', 'dirisha', 'maison'),
  ('lit', 'shitrandra', 'maison'),
  ('vaisselle', 'shia', 'cuisine'),
  ('tasse', 'shikombe', 'cuisine'),
  ('mortier', 'shino', 'cuisine'),
  ('page', 'shikandre', 'école'),
  ('outil', 'shombo', 'objet'),
  ('fouet', 'shengwe', 'objet'),
  ('métal', 'shuma', 'objet'),
  ('terrain', 'shandza', 'lieu'),
  ('drap', 'dara', 'maison'),
  ('cour', 'lakuru', 'maison'),
  ('table', 'meza', 'maison'),
  ('table', 'latablu', 'maison'),
  ('couleur', 'range', 'couleur'),
  ('savon', 'sabuni', 'maison'),
  ('bol', 'bakuli', 'cuisine'),
  ('boîte', 'bwati', 'objet'),
  ('bois de chauffage', 'kuni', 'maison'),
  ('bateau', 'marikabu', 'transport'),
  ('marmite', 'nyungu', 'cuisine'),
  ('plateau', 'sinia', 'cuisine'),
  ('louche', 'sadu', 'cuisine'),
  ('couvercle', 'traku', 'cuisine'),
  ('parpaing', 'parape', 'maison'),
  ('palme de cocotier', 'kuri', 'nature'),
  ('natte', 'djavi', 'maison'),
  ('trou', 'foro', 'nature'),
  ('journal', 'gazeti', 'objet'),
  ('bonnet', 'kofia', 'vêtement'),
  ('planche', 'bao', 'objet'),
  ('fourchette', 'fursheti', 'cuisine'),
  ('couteau', 'sembea', 'cuisine'),
  ('cuillère', 'sutru', 'cuisine'),
  ('puits', 'shisima', 'lieu'),
  ('mur', 'uhura', 'maison'),
  ('fil', 'uzi', 'objet'),
  ('côté', 'uvandre', 'lieu'),
  ('machette', 'upanga', 'objet'),
  -- Manuel : lieux, nature, temps
  ('minaret', 'munara', 'religion'),
  ('quartier', 'mura', 'lieu'),
  ('feu', 'moro', 'nature'),
  ('contrat', 'mukataba', 'travail'),
  ('projet', 'mupango', 'travail'),
  ('jeu de bao', 'muraha', 'culture'),
  ('voyage', 'musafara', 'transport'),
  ('électricité', 'mwenge', 'maison'),
  ('lune', 'mwezi', 'nature'),
  ('fin', 'mwiso', 'temps'),
  ('endroit', 'mukabala', 'lieu'),
  ('toilettes', 'muraba', 'maison'),
  ('ombre', 'muvuli', 'nature'),
  ('examen', 'mutihani', 'école'),
  ('arc-en-ciel', 'muzia-kamba', 'nature'),
  ('tornade', 'muvumbi', 'météo'),
  ('sable', 'mutsanga', 'nature'),
  ('vent fort', 'munyombeni', 'météo'),
  ('village', 'dago', 'lieu'),
  ('boutique', 'duka', 'commerce'),
  ('tombe', 'kaburi', 'religion'),
  ('nid', 'kara', 'animal'),
  ('braise', 'kaa', 'maison'),
  ('Terre (planète)', 'ardhwi', 'nature'),
  ('soleil', 'juwa', 'nature'),
  ('chaleur', 'hari', 'météo'),
  ('air', 'hawa', 'nature'),
  ('lumière', 'nuru', 'nature'),
  ('vent', 'pevo', 'météo'),
  ('cyclone', 'sikloni', 'météo'),
  ('saison des pluies', 'kashikazi', 'météo'),
  ('saison sèche', 'kusi', 'météo'),
  ('nord', 'kibula', 'lieu'),
  ('sud', 'swilihi', 'lieu'),
  ('terre (sol)', 'trotro', 'nature'),
  ('vague', 'duja', 'nature'),
  ('ordures', 'matsaha', 'maison'),
  ('récolte', 'mavuna', 'travail'),
  ('pêche', 'ulozi', 'travail'),
  ('pêche', 'malozi', 'travail'),
  ('monde', 'dunia', 'nature'),
  ('monde', 'ulemengu', 'nature'),
  ('lundi', 'mfumoraru', 'jour'),
  ('mardi', 'mfumonne', 'jour'),
  ('mercredi', 'mfumotsano', 'jour'),
  ('vendredi', 'djimwa', 'jour'),
  ('samedi', 'mfumotsi', 'jour'),
  ('dimanche', 'mfumovili', 'jour'),
  ('il y a longtemps', 'ina hale', 'temps'),
  ('siècle', 'karne', 'temps'),
  ('l''année prochaine', 'mwahani', 'temps'),
  ('autrefois', 'zama za hale', 'temps'),
  ('de temps en temps', 'vavo na vavo', 'temps'),
  ('jusqu''à maintenant', 'ta rava', 'temps'),
  -- Manuel : animaux
  ('chauve-souris', 'ndrema', 'animal'),
  ('cheval', 'farasi', 'animal'),
  ('raie', 'kuba', 'animal'),
  ('poule', 'kuhu', 'animal'),
  ('hérisson', 'landra', 'animal'),
  ('moustique', 'mbu', 'animal'),
  ('moustique', 'dundri', 'animal'),
  ('tortue', 'nyamba', 'animal'),
  ('oiseau', 'nyunyi', 'animal'),
  ('âne', 'pundra', 'animal'),
  ('poulpe', 'pwedza', 'animal'),
  ('fourmi', 'tsutsuhu', 'animal'),
  ('maki', 'komba', 'animal'),
  ('mouche', 'ndzi', 'animal'),
  ('serpent', 'nyoha', 'animal'),
  ('souris', 'puhu', 'animal'),
  ('souris', 'trutri', 'animal'),
  ('porc', 'puruku', 'animal'),
  ('mouton', 'baribari', 'animal'),
  ('insecte', 'bibi', 'animal'),
  ('escargot', 'kowa', 'animal'),
  ('grenouille', 'shiwatrotro', 'animal'),
  ('bouc', 'bewe', 'animal'),
  ('canard', 'dzukutsi', 'animal'),
  ('sauterelle', 'furudji', 'animal'),
  ('crabe', 'kalafuba', 'animal'),
  ('crabe', 'dradraka', 'animal'),
  ('cafard', 'kalalawi', 'animal'),
  ('coq', 'kukuyi', 'animal'),
  ('dinde', 'kulukulu', 'animal'),
  ('caméléon', 'tarundru', 'animal'),
  ('scolopendre', 'trambwi', 'animal'),
  ('guêpe', 'vungovungo', 'animal'),
  -- Manuel : nourriture
  ('œuf', 'jwayi', 'nourriture'),
  ('lait', 'dzia', 'nourriture'),
  ('huile', 'matra', 'nourriture'),
  ('nourriture', 'shahula', 'nourriture'),
  ('viande', 'nyama', 'nourriture'),
  ('café', 'kafe', 'nourriture'),
  ('miel', 'ngizi', 'nourriture'),
  ('beurre', 'samuli', 'nourriture'),
  ('sel', 'shingo', 'nourriture'),
  ('sucre', 'sukari', 'nourriture'),
  ('thé', 'dite', 'nourriture'),
  ('riz', 'ntsohole', 'nourriture'),
  ('tomate', 'tomati', 'nourriture'),
  ('poivre', 'vilivili', 'nourriture'),
  ('clou de girofle', 'karafu', 'nourriture'),
  ('cardamome', 'hiliki', 'nourriture'),
  ('épices', 'masala', 'nourriture'),
  ('achards', 'tshari', 'nourriture'),
  ('mandarine', 'dandzi', 'nourriture'),
  ('papaye', 'pwapwaya', 'nourriture'),
  ('fruit', 'trundra', 'nourriture'),
  ('fruit à pain', 'frampe', 'nourriture'),
  ('banane douce', 'sindza', 'nourriture'),
  ('songe', 'jimbi', 'nourriture'),
  ('igname', 'shiazi', 'nourriture'),
  ('noix de coco verte', 'shijavu', 'nourriture'),
  -- Manuel : mots abstraits, divers
  ('lettre (courrier)', 'barua', 'objet'),
  ('petite amie', 'buledi', 'personnes'),
  ('djinn', 'djini', 'religion'),
  ('voisin', 'djirani', 'personnes'),
  ('avis', 'shauri', 'conversation'),
  ('riche', 'tadjiri', 'argent'),
  ('vie', 'maesha', 'émotion'),
  ('maladie', 'maradhi', 'santé'),
  ('parfum', 'marashi', 'objet'),
  ('soucis', 'mashaka', 'émotion'),
  ('jeu', 'dangadzo', 'culture'),
  ('incroyant', 'kafiri', 'religion'),
  ('faute', 'kosa', 'conversation'),
  ('commerce', 'biashara', 'commerce'),
  ('sommeil', 'tsindzi', 'santé'),
  ('un tel', 'fulani', 'personnes'),
  ('accident', 'adjali', 'santé'),
  ('chance', 'bahati', 'émotion'),
  ('idée', 'fikira', 'conversation'),
  ('danger', 'hatwari', 'santé'),
  ('force', 'nguvu', 'santé'),
  ('volonté', 'niya', 'émotion'),
  ('union', 'umoja', 'culture'),
  ('santé', 'unono', 'santé'),
  ('égalité', 'usawa', 'culture'),
  ('propreté', 'urahafu', 'maison'),
  ('pauvreté', 'usikini', 'argent'),
  ('enfance', 'unatsa', 'famille'),
  ('liberté', 'unafasi', 'culture'),
  ('richesse', 'utadjiri', 'argent'),
  ('vieillesse', 'uduhazi', 'famille'),
  ('oubli', 'usahau', 'émotion'),
  ('communauté', 'umati', 'culture'),
  ('âge', 'umri', 'famille'),
  ('jalousie', 'wivu', 'émotion'),
  ('promesse', 'wahadi', 'conversation'),
  ('laideur', 'urisifu', 'adjectif'),
  ('honneur', 'utukufu', 'culture'),
  ('adolescence', 'ushababi', 'famille'),
  ('envie', 'ushauku', 'émotion'),
  ('conseil', 'waswiya', 'conversation'),
  ('racisme', 'ubaguzi wa rangi', 'culture'),
  ('ivresse', 'ulevi', 'santé'),
  ('dispute', 'umani', 'émotion'),
  ('sorcellerie', 'ugangi', 'religion'),
  ('égoïsme', 'ubinafsi', 'émotion'),
  ('plaisanterie', 'ubishi', 'conversation'),
  ('ablutions', 'udhu', 'religion'),
  ('libération', 'ukombozi', 'culture'),
  ('respect', 'adabu', 'culture'),
  ('faim', 'dza', 'santé'),
  ('soif', 'nyora', 'santé'),
  ('joie', 'furaha', 'émotion'),
  ('sorte', 'kalite', 'conversation'),
  ('vérité', 'kweli', 'conversation'),
  ('permission', 'ruhusa', 'conversation'),
  ('paresse', 'shida', 'émotion'),
  ('gouvernement', 'sirikali', 'culture'),
  ('déshonneur', 'aibu', 'culture'),
  ('passion', 'ashiki', 'émotion'),
  ('bénédiction', 'baraka', 'religion'),
  ('mariage', 'harusi', 'fête'),
  ('grossesse', 'hamili', 'santé'),
  ('honte', 'haya', 'émotion'),
  ('ruse', 'hila', 'émotion'),
  ('occasion', 'nafasi', 'temps'),
  ('économies', 'akiba', 'argent'),
  ('situation', 'hali', 'conversation'),
  ('intention', 'kusudi', 'conversation'),
  ('langue (langage)', 'luha', 'conversation'),
  ('fortune', 'mali', 'argent'),
  ('fois', 'mara', 'temps'),
  ('secret', 'siri', 'conversation'),
  ('comportement', 'taia', 'émotion'),
  ('différence', 'tafauti', 'conversation'),
  ('bêtise', 'taharaki', 'conversation'),
  ('affaire', 'trongo', 'conversation'),
  ('ancre', 'nanga', 'transport'),
  ('capitaine', 'nahuda', 'métier'),
  ('jeûne (Ramadan)', 'tsumu', 'religion'),
  ('rire (nom)', 'tseso', 'émotion'),
  ('ange', 'malaika', 'religion'),
  ('rame', 'kasia', 'transport'),
  ('pique-nique', 'vule', 'culture'),
  ('association', 'shama', 'culture'),
  ('comité', 'shikao', 'culture'),
  ('armée', 'djeshi', 'culture'),
  -- Manuel : langues
  ('anjouanais (langue)', 'shindzuani', 'culture'),
  ('swahili (langue)', 'shiswahili', 'culture'),
  ('français (langue)', 'shifarantsa', 'culture'),
  ('anglais (langue)', 'shingereza', 'culture'),
  ('grand-comorien (langue)', 'shingazidja', 'culture'),
  ('arabe (langue)', 'sharabu', 'culture'),
  -- Manuel : adjectifs
  ('grand', 'mubole', 'adjectif'),
  ('fort', 'muhodari', 'adjectif'),
  ('gros', 'mutronga', 'adjectif'),
  ('sévère', 'muhali', 'adjectif'),
  ('sec', 'kavu', 'adjectif'),
  ('propre', 'murahafu', 'adjectif'),
  ('étroit', 'mwambamba', 'adjectif'),
  ('dur', 'mwangavu', 'adjectif'),
  ('beau', 'muzuri', 'adjectif'),
  ('rouge', 'mukundru', 'couleur'),
  ('long', 'mundra', 'adjectif'),
  ('entier', 'mudzima', 'adjectif'),
  ('mauvais', 'mui', 'adjectif'),
  ('nombreux', 'wengi', 'adjectif'),
  ('usé', 'bombo', 'adjectif'),
  ('meilleur', 'bora', 'adjectif'),
  ('gratuit', 'bure', 'adjectif'),
  ('fainéant', 'fenyã', 'adjectif'),
  ('cher', 'hali', 'argent'),
  ('interdit', 'haramu', 'religion'),
  ('permis (licite)', 'halali', 'religion'),
  ('vivant', 'hayi', 'adjectif'),
  ('complet', 'kamili', 'adjectif'),
  ('vrai', 'kweli', 'adjectif'),
  ('lisse', 'laini', 'adjectif'),
  ('pauvre', 'maskini', 'argent'),
  ('important', 'muhimu', 'adjectif'),
  ('tous', 'piya', 'grammaire'),
  ('bon marché', 'rahisi', 'argent'),
  ('officiel', 'rasmi', 'adjectif'),
  ('pareil', 'sawa', 'adjectif'),
  ('bizarre', 'shinamna', 'adjectif'),
  ('calme', 'shwari', 'adjectif'),
  ('prêt', 'tayari', 'adjectif'),
  ('vert', 'veri', 'couleur'),
  ('ouvert', 'wadzi', 'adjectif'),
  ('seul', 'weke', 'adjectif'),
  ('autre', 'wangina', 'adjectif'),
  -- Manuel : adverbes, prépositions, conjonctions
  ('souvent', 'dahari', 'mot outil'),
  ('toujours', 'daima', 'mot outil'),
  ('vraiment', 'halisi', 'mot outil'),
  ('vite', 'haraka', 'mot outil'),
  ('vite', 'mbio', 'mot outil'),
  ('surtout', 'haswa', 'mot outil'),
  ('tout à fait', 'kabisa', 'mot outil'),
  ('environ', 'kadiri', 'mot outil'),
  ('peut-être', 'labda', 'mot outil'),
  ('déjà', 'madza', 'mot outil'),
  ('tôt', 'mapema', 'mot outil'),
  ('mal', 'nai', 'mot outil'),
  ('d''abord', 'rabuzi', 'mot outil'),
  ('encore', 'tsena', 'mot outil'),
  ('seulement', 'tu', 'mot outil'),
  ('lentement', 'volevole', 'mot outil'),
  ('aussi', 'wajau', 'mot outil'),
  ('plus', 'zaidi', 'mot outil'),
  ('un petit peu', 'mwana pavi', 'mot outil'),
  ('entre', 'baina ya', 'mot outil'),
  ('chez', 'ha', 'mot outil'),
  ('près de', 'karibu na', 'mot outil'),
  ('loin', 'mbali', 'mot outil'),
  ('devant', 'mbeli', 'lieu'),
  ('derrière', 'nyuma', 'lieu'),
  ('dedans', 'moni', 'lieu'),
  ('jusqu''à', 'mpaka', 'mot outil'),
  ('à l''intérieur', 'ndrani', 'lieu'),
  ('dehors', 'mwendze', 'lieu'),
  ('ici', 'vanu', 'lieu'),
  ('là-bas', 'vale', 'lieu'),
  ('et', 'na', 'mot outil'),
  ('que', 'amba', 'mot outil'),
  ('ou (bien)', 'au', 'mot outil'),
  ('mais', 'lakini', 'mot outil'),
  ('mais', 'be', 'mot outil'),
  ('sans', 'bila', 'mot outil'),
  ('comme', 'mauri', 'mot outil'),
  ('si', 'neka', 'mot outil'),
  ('c''est-à-dire', 'yaani', 'mot outil'),
  ('au lieu de', 'badala ya', 'mot outil'),
  ('à cause de', 'ha sababu ya', 'mot outil'),
  ('il faut', 'ilazimu', 'mot outil'),
  ('il vaut mieux', 'hairi', 'mot outil'),
  ('il y a', 'vwa', 'mot outil'),
  ('il n''y a pas', 'kavu', 'mot outil')
on conflict (lower(french), lower(shimaore)) do nothing;

-- ============================================================================
-- 20261213000000_mots_dictionnaire_blanchy.sql
-- ============================================================================

-- BTM AI — Mots du lexique shimaore-français de Sophie Blanchy (L'Harmattan, 1996),
-- relevés dans les deux listes (mahorais-français et français-mahorais) et les
-- annexes (nombres, parenté). 20261211000000_mots_imagier_blanchy.sql n'avait
-- pris que les mots de l'introduction.
-- Les verbes sont écrits à l'infinitif en minuscules (« uFanya » → « ufanya »),
-- les adjectifs sous la forme qui va avec une chose (classe 9 : ndjema, ndzidu…).
-- Comme les migrations précédentes, rien n'est remplacé : un couple déjà connu
-- est ignoré, et un mot français qui a déjà une autre traduction devient un
-- conflit. Tamilya en fait alors une demande (20261214000000_conflits_de_mots.sql)
-- et l'administrateur choisit la bonne traduction dans /admin/lexique.

insert into public.awa_words (french, shimaore, category)
values
  -- Animaux
  ('abeille', 'nyoshi', 'animal'),
  ('âne', 'pundra', 'animal'),
  ('araignée', 'tendrabwibwi', 'animal'),
  ('baleine', 'mugombe', 'animal'),
  ('bœuf', 'nyombe', 'animal'),
  ('vache', 'nyombe', 'animal'),
  ('veau', 'mwana nyombe', 'animal'),
  ('taureau', 'kondzo', 'animal'),
  ('cabri', 'mbuzi', 'animal'),
  ('chèvre', 'mbuzi', 'animal'),
  ('caméléon', 'dzianindri', 'animal'),
  ('canard', 'dukutsi', 'animal'),
  ('chat', 'paha', 'animal'),
  ('chaton', 'mwana paha', 'animal'),
  ('chauve-souris', 'ndrema', 'animal'),
  ('cheval', 'farasi', 'animal'),
  ('chien', 'mbwa', 'animal'),
  ('civette', 'funga', 'animal'),
  ('cochon', 'puruku', 'animal'),
  ('coq', 'kukui', 'animal'),
  ('poule', 'kuhu', 'animal'),
  ('corbeau', 'gawa', 'animal'),
  ('crabe', 'dadaka', 'animal'),
  ('crabe de terre', 'kala', 'animal'),
  ('crevette', 'kamba', 'animal'),
  ('langouste', 'kamba diva', 'animal'),
  ('crocodile', 'vwai', 'animal'),
  ('dindon', 'kulukulu', 'animal'),
  ('éléphant', 'ndovu', 'animal'),
  ('escargot', 'kowa', 'animal'),
  ('fourmi', 'tsusu', 'animal'),
  ('grenouille', 'shiwatrotro', 'animal'),
  ('hérisson', 'landra', 'animal'),
  ('hibou', 'bundri', 'animal'),
  ('lièvre', 'sungura', 'animal'),
  ('maki', 'komba', 'animal'),
  ('lézard', 'ngwizi', 'animal'),
  ('lion', 'simba', 'animal'),
  ('mouche', 'ndzi', 'animal'),
  ('moustique', 'mbu', 'animal'),
  ('mouton', 'baribari', 'animal'),
  ('oiseau', 'nyunyi', 'animal'),
  ('oursin', 'gazasi', 'animal'),
  ('papillon', 'pelepeleka', 'animal'),
  ('perruche', 'kararauki', 'animal'),
  ('pigeon', 'ndiwa', 'animal'),
  ('pintade', 'kanga', 'animal'),
  ('pou', 'ndra', 'animal'),
  ('poisson', 'fii', 'animal'),
  ('poulpe', 'pwedza', 'animal'),
  ('rat', 'puhu', 'animal'),
  ('souris', 'shikwetse', 'animal'),
  ('requin', 'papa', 'animal'),
  ('dauphin', 'papa dadyi', 'animal'),
  ('sauterelle', 'pandzi', 'animal'),
  ('scolopendre', 'trambwi', 'animal'),
  ('serpent', 'nyoha', 'animal'),
  ('singe', 'djakwe', 'animal'),
  ('tortue', 'nyamba', 'animal'),
  ('ver de terre', 'murungu', 'animal'),
  ('épervier (oiseau)', 'kwezi', 'animal'),
  ('chameau', 'ngamia', 'animal'),
  ('lamantin', 'lambwara', 'animal'),
  ('insecte', 'bibi', 'animal'),
  ('huître', 'sadza', 'animal'),
  ('thon', 'mbasi', 'animal'),
  ('raie (poisson)', 'tra', 'animal'),
  ('sardine', 'muhidzi', 'animal'),
  ('mérou', 'tsehele', 'animal'),
  ('anguille', 'muhunga', 'animal'),
  ('barracuda', 'muhudana', 'animal'),
  ('espadon', 'truwaru', 'animal'),
  ('œuf', 'jwai', 'animal'),
  ('plume', 'djivuzi', 'animal'),
  ('aile', 'bawa', 'animal'),
  ('corne', 'nyonga', 'animal'),
  ('queue (animal)', 'mushia', 'animal'),

  -- Nourriture et cuisine
  ('arachide', 'ndjugu', 'nourriture'),
  ('aubergine', 'bengani', 'nourriture'),
  ('café', 'kafe', 'nourriture'),
  ('canne à sucre', 'mua', 'nourriture'),
  ('cannelle', 'daryasini', 'nourriture'),
  ('cardamome', 'hiliki', 'nourriture'),
  ('citron', 'ndrimu', 'nourriture'),
  ('citrouille', 'trango', 'nourriture'),
  ('clou de girofle', 'karafu', 'nourriture'),
  ('farine', 'kandra', 'nourriture'),
  ('farine de riz', 'hunga', 'nourriture'),
  ('fruit à pain', 'frampe', 'nourriture'),
  ('gâteau', 'muhare', 'nourriture'),
  ('gingembre', 'singiziu', 'nourriture'),
  ('haricot', 'kundre', 'nourriture'),
  ('haricot vert', 'fuu', 'nourriture'),
  ('huile', 'matra', 'nourriture'),
  ('huile de coco', 'matra ya nadzi', 'nourriture'),
  ('igname', 'shijani', 'nourriture'),
  ('jaque', 'fenesi', 'nourriture'),
  ('lait', 'dzia', 'nourriture'),
  ('lait caillé', 'dzia la lala', 'nourriture'),
  ('maïs', 'murama', 'nourriture'),
  ('mandarine', 'dandzi', 'nourriture'),
  ('mangue', 'manga', 'nourriture'),
  ('manioc', 'muhogo', 'nourriture'),
  ('feuilles de manioc', 'mataba', 'nourriture'),
  ('miel', 'ngizi ya nyoshi', 'nourriture'),
  ('muscade', 'kungumanga', 'nourriture'),
  ('noix de coco', 'nadzi', 'nourriture'),
  ('orange', 'trundra', 'nourriture'),
  ('pain', 'dipe', 'nourriture'),
  ('papaye', 'pwapwaya', 'nourriture'),
  ('patate douce', 'batata', 'nourriture'),
  ('piment', 'putu', 'nourriture'),
  ('poivre', 'vilivili manga', 'nourriture'),
  ('repas', 'shahula', 'nourriture'),
  ('riz cuit', 'matsidza', 'nourriture'),
  ('riz décortiqué', 'tsohole', 'nourriture'),
  ('riz sur pied', 'mele', 'nourriture'),
  ('sauce', 'mutsuzi', 'nourriture'),
  ('sel', 'shingo', 'nourriture'),
  ('sucre', 'sukari', 'nourriture'),
  ('taro', 'majimbi', 'nourriture'),
  ('thé', 'tshai', 'nourriture'),
  ('tomate', 'timati', 'nourriture'),
  ('viande', 'nyama', 'nourriture'),
  ('poisson séché', 'nyondra', 'nourriture'),
  ('brèdes', 'feliki', 'nourriture'),
  ('ambrevade', 'tsuzi', 'nourriture'),
  ('beurre', 'samuli', 'nourriture'),
  ('cœur de palmier', 'sale', 'nourriture'),
  ('tamarin', 'uhaju', 'nourriture'),
  ('vinaigre', 'siki', 'nourriture'),
  ('bouillon', 'ubu', 'nourriture'),
  ('beignet de viande', 'sambusa', 'nourriture'),
  ('vin', 'divai', 'nourriture'),
  ('marmite', 'nyungu', 'cuisine'),
  ('couvercle', 'shifinikio', 'cuisine'),
  ('mortier', 'shino', 'cuisine'),
  ('pilon', 'mwitsi', 'cuisine'),
  ('poêle', 'tasa', 'cuisine'),
  ('bouilloire', 'mudila', 'cuisine'),
  ('râpe à coco', 'mbuzi ya nadzi', 'cuisine'),
  ('tamis', 'shitsingio', 'cuisine'),
  ('cuisiner', 'upiha', 'cuisine'),
  ('griller', 'uoha', 'cuisine'),
  ('faire frire', 'uvisa', 'cuisine'),
  ('bouillir', 'urohora', 'cuisine'),
  ('servir le repas', 'uvahua', 'cuisine'),

  -- Corps
  ('aisselle', 'kapwa', 'corps'),
  ('bouche', 'hanyo', 'corps'),
  ('bras', 'muhono', 'corps'),
  ('main', 'muhono', 'corps'),
  ('cerveau', 'uwongo', 'corps'),
  ('cheveu', 'nyele', 'corps'),
  ('cheveux blancs', 'vi', 'corps'),
  ('cil', 'kove', 'corps'),
  ('cœur', 'mo', 'corps'),
  ('côte (corps)', 'mbavu', 'corps'),
  ('coude', 'shugunyu', 'corps'),
  ('cou', 'tsingo', 'corps'),
  ('crâne', 'daha', 'corps'),
  ('cuisse', 'paja', 'corps'),
  ('dent', 'dzinyo', 'corps'),
  ('doigt', 'sha', 'corps'),
  ('pouce', 'sha ya dume', 'corps'),
  ('orteil', 'sha ya mundru', 'corps'),
  ('dos', 'mengo', 'corps'),
  ('épaule', 'bega', 'corps'),
  ('estomac', 'trumbo', 'corps'),
  ('fesse', 'shidze', 'corps'),
  ('foie', 'nye', 'corps'),
  ('genou', 'dondro', 'corps'),
  ('gorge', 'komio', 'corps'),
  ('hanche', 'trenga', 'corps'),
  ('joue', 'savu', 'corps'),
  ('jambe', 'mundru', 'corps'),
  ('pied', 'mundru', 'corps'),
  ('langue (corps)', 'ulimi', 'corps'),
  ('lèvre', 'domo', 'corps'),
  ('mâchoire', 'ngutsa', 'corps'),
  ('menton', 'shilevu', 'corps'),
  ('nez', 'pua', 'corps'),
  ('nombril', 'truju', 'corps'),
  ('œil', 'dzitso', 'corps'),
  ('yeux', 'matso', 'corps'),
  ('ongle', 'kofu', 'corps'),
  ('oreille', 'kio', 'corps'),
  ('os', 'shiba', 'corps'),
  ('paume', 'djandza', 'corps'),
  ('peau', 'ngwezi', 'corps'),
  ('poitrine', 'shifuba', 'corps'),
  ('rein', 'ntso', 'corps'),
  ('sang', 'damu', 'corps'),
  ('sein', 'bele', 'corps'),
  ('sourcil', 'tsi', 'corps'),
  ('talon', 'tsundzuni', 'corps'),
  ('tête', 'shitswa', 'corps'),
  ('ventre', 'mimba', 'corps'),
  ('visage', 'uso', 'corps'),
  ('voix', 'ji', 'corps'),
  ('salive', 'ure', 'corps'),
  ('larme', 'tsozi', 'corps'),
  ('corps', 'mwili', 'corps'),
  ('poil', 'puzi', 'corps'),
  ('barbe', 'ndrevu', 'corps'),

  -- Santé
  ('asthme', 'pefu', 'santé'),
  ('fièvre', 'homa', 'santé'),
  ('paludisme', 'ndrerema', 'santé'),
  ('maladie', 'uwade', 'santé'),
  ('malade', 'mwade', 'santé'),
  ('médicament', 'dalao', 'santé'),
  ('hôpital', 'lopitali', 'santé'),
  ('plaie', 'shondra', 'santé'),
  ('lèpre', 'uenefu', 'santé'),
  ('épilepsie', 'kifafa', 'santé'),
  ('hoquet', 'shidedefu', 'santé'),
  ('rhume', 'jongoma', 'santé'),
  ('migraine', 'uso wa puhu', 'santé'),
  ('ampoule (peau)', 'truhu', 'santé'),
  ('bouton (peau)', 'kuruda', 'santé'),
  ('pus', 'masiya', 'santé'),
  ('guérisseur', 'mwalimu', 'santé'),
  ('grossesse', 'mimba', 'santé'),
  ('être enceinte', 'ukana mimba', 'santé'),
  ('tousser', 'ukohola', 'santé'),
  ('vomir', 'uraviha', 'santé'),
  ('guérir', 'uvona', 'santé'),
  ('soigner', 'uzihira', 'santé'),
  ('être malade', 'ukodza', 'santé'),
  ('saigner', 'ulawa damu', 'santé'),

  -- Famille et personnes
  ('père', 'baba', 'famille'),
  ('mère', 'mama', 'famille'),
  ('enfant', 'mwana', 'famille'),
  ('fille (enfant)', 'mwana mutru mushe', 'famille'),
  ('garçon', 'mwana mutru mme', 'famille'),
  ('grand-père', 'bakoko', 'famille'),
  ('grand-mère', 'koko', 'famille'),
  ('petit-enfant', 'mjuhu', 'famille'),
  ('arrière-petit-enfant', 'shilembwe', 'famille'),
  ('mari', 'mme', 'famille'),
  ('épouse', 'mshe', 'famille'),
  ('beau-frère', 'mwamu', 'famille'),
  ('belle-sœur', 'mwamu', 'famille'),
  ('belle-mère', 'niadza', 'famille'),
  ('beau-père', 'bamuhe', 'famille'),
  ('gendre', 'bamuhe', 'famille'),
  ('oncle maternel', 'zama', 'famille'),
  ('tante paternelle', 'ngivavi', 'famille'),
  ('jumeaux', 'wana mbilijuu', 'famille'),
  ('orphelin', 'mwana yatima', 'famille'),
  ('aîné', 'zuki', 'famille'),
  ('famille', 'udjama', 'famille'),
  ('parent (de la famille)', 'mudjema', 'famille'),
  ('ami', 'mwandzani', 'personnes'),
  ('amitié', 'uwandzani', 'personnes'),
  ('voisin', 'djirani', 'personnes'),
  ('homme', 'mutru mme', 'personnes'),
  ('femme', 'mutru mushe', 'personnes'),
  ('personne', 'mutru', 'personnes'),
  ('les gens', 'watru', 'personnes'),
  ('adulte', 'mutru mbole', 'personnes'),
  ('étranger', 'mudjeni', 'personnes'),
  ('invité', 'mudjeni', 'personnes'),
  ('voleur', 'mwidzi', 'personnes'),
  ('roi', 'mufalume', 'personnes'),
  ('Européen', 'muzungu', 'personnes'),
  ('Malgache', 'mubushi', 'personnes'),
  ('Français (personne)', 'mufarantsa', 'personnes'),
  ('Mahorais (personne)', 'mumaore', 'personnes'),
  ('Anjouanais', 'mundzwani', 'personnes'),
  ('Arabe (personne)', 'mwarabu', 'personnes'),
  ('célibataire', 'mutsumba', 'personnes'),
  ('enfance', 'uwana', 'personnes'),
  ('jeunesse', 'unatsa', 'personnes'),
  ('vieillesse', 'uduhazi', 'personnes'),

  -- Métiers
  ('cultivateur', 'mulimizi', 'métier'),
  ('pêcheur', 'mulozi', 'métier'),
  ('cuisinier', 'mupihizi', 'métier'),
  ('forgeron', 'mufua shuma', 'métier'),
  ('bijoutier', 'mufua dhahabu', 'métier'),
  ('instituteur', 'fundi lekoli', 'métier'),
  ('maître coranique', 'fundi wa shioni', 'métier'),
  ('tailleur', 'musonozi', 'métier'),
  ('vendeur', 'mudzizi', 'métier'),
  ('acheteur', 'mununuzi', 'métier'),
  ('chanteur', 'muhimbizi', 'métier'),
  ('travailleur', 'mufanya hazi', 'métier'),
  ('policier', 'polisi', 'métier'),
  ('cadi', 'kadhi', 'métier'),
  ('imam', 'imamu', 'métier'),
  ('muezzin', 'mwadhini', 'métier'),
  ('sage-femme', 'mudzalisa', 'métier'),
  ('interprète', 'mufaswiri', 'métier'),
  ('capitaine (bateau)', 'nahuda', 'métier'),
  ('éleveur', 'mutsunga', 'métier'),
  ('boutiquier', 'musika duka', 'métier'),

  -- Maison et objets
  ('maison', 'nyumba', 'maison'),
  ('porte', 'mulango', 'maison'),
  ('fenêtre', 'dirisha', 'maison'),
  ('toit', 'utro', 'maison'),
  ('mur', 'pesi', 'maison'),
  ('lit', 'shitandra', 'maison'),
  ('chambre', 'fuko', 'maison'),
  ('cour', 'shandza', 'maison'),
  ('puits', 'shisima', 'maison'),
  ('jardin', 'zarde', 'maison'),
  ('salon', 'salo', 'maison'),
  ('escalier', 'leskalye', 'maison'),
  ('étage', 'dari', 'maison'),
  ('véranda', 'baraza', 'maison'),
  ('latrines', 'sindrasi', 'maison'),
  ('chaise', 'shiri', 'objet'),
  ('fauteuil', 'fute', 'objet'),
  ('table', 'meza', 'objet'),
  ('natte', 'djavi', 'objet'),
  ('matelas', 'godoro', 'objet'),
  ('clé', 'lakile', 'objet'),
  ('couteau', 'sembea', 'objet'),
  ('cuillère', 'sutru', 'objet'),
  ('assiette', 'sahani', 'objet'),
  ('tasse', 'shikombe', 'objet'),
  ('bol', 'bakuli', 'objet'),
  ('verre', 'vera', 'objet'),
  ('bouteille', 'falasika', 'objet'),
  ('seau', 'sio', 'objet'),
  ('balai', 'peo', 'objet'),
  ('panier', 'kalaga', 'objet'),
  ('sac', 'mukoba', 'objet'),
  ('boîte', 'bwati', 'objet'),
  ('coffre', 'bweta', 'objet'),
  ('miroir', 'shido', 'objet'),
  ('lampe à pétrole', 'gandile', 'objet'),
  ('lampe de poche', 'ponje', 'objet'),
  ('corde', 'ngwe', 'objet'),
  ('aiguille', 'sindzano', 'objet'),
  ('ciseaux', 'makasi', 'objet'),
  ('marteau', 'nyindro', 'objet'),
  ('clou', 'mushumari', 'objet'),
  ('hache', 'soha', 'objet'),
  ('machette', 'upanga', 'objet'),
  ('échelle', 'ulingo', 'objet'),
  ('plateau', 'sinia', 'objet'),
  ('peigne', 'tsana', 'objet'),
  ('parapluie', 'mwavule', 'objet'),
  ('lunettes', 'miwani', 'objet'),
  ('savon', 'sabuni', 'objet'),
  ('réfrigérateur', 'firigo', 'objet'),
  ('tambour', 'ngoma', 'objet'),
  ('flûte', 'ndzumari', 'objet'),
  ('fusil', 'bunduki', 'objet'),
  ('papier', 'kartasi', 'objet'),
  ('cigarette', 'siga', 'objet'),
  ('tente', 'haima', 'objet'),
  ('cage', 'dao', 'objet'),
  ('drapeau', 'beramu', 'objet'),
  ('électricité', 'tereste', 'objet'),
  ('lumière', 'mwenge', 'objet'),
  ('chose', 'shitru', 'objet'),
  ('bijou', 'daiyo', 'objet'),
  ('bague', 'pere', 'objet'),
  ('collier', 'kame', 'objet'),
  ('bracelet', 'bangili', 'objet'),
  ('boucle d''oreille', 'kavi', 'objet'),

  -- Vêtements
  ('vêtement', 'nguo', 'vêtement'),
  ('chemise', 'shimizi', 'vêtement'),
  ('robe', 'robo', 'vêtement'),
  ('pantalon', 'sirwali', 'vêtement'),
  ('pagne', 'saluva', 'vêtement'),
  ('pagne d''homme', 'shikoi', 'vêtement'),
  ('chaussure', 'kabwa', 'vêtement'),
  ('ceinture', 'mukandra', 'vêtement'),
  ('chapeau', 'kofia', 'vêtement'),
  ('turban', 'kemba', 'vêtement'),
  ('voile de tête', 'kishali', 'vêtement'),
  ('soutien-gorge', 'kantshiri', 'vêtement'),
  ('costume', 'kosti', 'vêtement'),

  -- Transport
  ('voiture', 'gari', 'transport'),
  ('pirogue', 'laka', 'transport'),
  ('bateau', 'markabu', 'transport'),
  ('boutre', 'djahazi', 'transport'),
  ('avion', 'ropolano', 'transport'),
  ('pagaie', 'kasi', 'transport'),
  ('ancre', 'nanga', 'transport'),
  ('voyage', 'safari', 'transport'),
  ('voyageur', 'musafiri', 'transport'),

  -- Lieux
  ('mer', 'bahari', 'lieu'),
  ('rivière', 'muro', 'lieu'),
  ('île', 'shisiwa', 'lieu'),
  ('archipel des Comores', 'masiwa', 'lieu'),
  ('montagne', 'mulima', 'lieu'),
  ('colline', 'mulima', 'lieu'),
  ('forêt', 'shitsaha', 'lieu'),
  ('village', 'dago', 'lieu'),
  ('ville', 'muji', 'lieu'),
  ('pays', 'tsi', 'lieu'),
  ('route', 'ndzia', 'lieu'),
  ('chemin', 'ndzia', 'lieu'),
  ('pont', 'daradja', 'lieu'),
  ('port', 'bandari', 'lieu'),
  ('marché', 'bazari', 'lieu'),
  ('boutique', 'duka', 'lieu'),
  ('mosquée', 'mukiri', 'lieu'),
  ('école', 'lekoli', 'lieu'),
  ('école coranique', 'shioni', 'lieu'),
  ('cimetière', 'madzihoni', 'lieu'),
  ('mangrove', 'muhonko', 'lieu'),
  ('récif', 'mwamba', 'lieu'),
  ('cascade', 'kitululu', 'lieu'),
  ('lac', 'dzia la maji', 'lieu'),
  ('source', 'dzitso la maji', 'lieu'),
  ('grotte', 'gumbo', 'lieu'),
  ('plaine', 'bandra', 'lieu'),
  ('champ', 'shamba', 'lieu'),
  ('place publique', 'shilindro', 'lieu'),
  ('prison', 'shivani', 'lieu'),
  ('Mayotte', 'Maore', 'lieu'),
  ('Madagascar', 'Bushini', 'lieu'),
  ('Anjouan', 'Ndzwani', 'lieu'),
  ('Mohéli', 'Mwali', 'lieu'),
  ('Grande Comore', 'Ngazidja', 'lieu'),
  ('France', 'Farantsa', 'lieu'),
  ('Europe', 'Ulaya', 'lieu'),
  ('Afrique', 'Murima', 'lieu'),
  ('Inde', 'Hindi', 'lieu'),
  ('La Mecque', 'Maka', 'lieu'),

  -- Nature et météo
  ('arbre', 'mwiri', 'nature'),
  ('feuille (arbre)', 'wani', 'nature'),
  ('fleur', 'fu', 'nature'),
  ('herbe', 'davu', 'nature'),
  ('racine', 'muzi', 'nature'),
  ('branche', 'trahi', 'nature'),
  ('graine', 'mbeu', 'nature'),
  ('cocotier', 'munadzi', 'nature'),
  ('bananier', 'trindri', 'nature'),
  ('manguier', 'mumanga', 'nature'),
  ('baobab', 'mubuyo', 'nature'),
  ('palmier', 'murendre', 'nature'),
  ('liane', 'trandri', 'nature'),
  ('jasmin', 'afu', 'nature'),
  ('ylang-ylang', 'langilangi', 'nature'),
  ('bois de chauffe', 'kuni', 'nature'),
  ('pierre', 'bwe', 'nature'),
  ('sable', 'mutsanga', 'nature'),
  ('terre', 'trotro', 'nature'),
  ('boue', 'godra', 'nature'),
  ('cendre', 'vu', 'nature'),
  ('fumée', 'mwesi', 'nature'),
  ('feu', 'moro', 'nature'),
  ('eau', 'maji', 'nature'),
  ('vague', 'luja', 'nature'),
  ('corail', 'swai', 'nature'),
  ('ombre', 'muvuli', 'nature'),
  ('soleil', 'jua', 'nature'),
  ('lune', 'mwezi', 'nature'),
  ('étoile', 'nyora', 'nature'),
  ('ciel', 'uwingu', 'nature'),
  ('nuage', 'wingu', 'météo'),
  ('pluie', 'vua', 'météo'),
  ('vent', 'pevo', 'météo'),
  ('arc-en-ciel', 'mukakamba', 'météo'),
  ('tonnerre', 'guguma', 'météo'),
  ('éclair', 'peni', 'météo'),
  ('cyclone', 'daruba', 'météo'),
  ('chaleur', 'hari', 'météo'),
  ('froid', 'baridi', 'météo'),
  ('rosée', 'mamio', 'météo'),
  ('saison des pluies', 'kashkazi', 'météo'),
  ('saison sèche', 'kusi', 'météo'),

  -- Temps
  ('aujourd''hui', 'leo', 'temps'),
  ('hier', 'jana', 'temps'),
  ('demain', 'meso', 'temps'),
  ('avant-hier', 'zuzi', 'temps'),
  ('après-demain', 'baada meso', 'temps'),
  ('année', 'mwaha', 'temps'),
  ('l''année dernière', 'mwaha jana', 'temps'),
  ('mois', 'mwezi', 'temps'),
  ('semaine', 'mufumo', 'temps'),
  ('jour', 'suku', 'temps'),
  ('journée', 'mutsana', 'temps'),
  ('nuit', 'uku', 'temps'),
  ('matin', 'asubuhi', 'temps'),
  ('après-midi', 'ojoni', 'temps'),
  ('midi', 'adhuhuri', 'temps'),
  ('crépuscule', 'maharibi', 'temps'),
  ('aube', 'alifadjiri', 'temps'),
  ('heure', 'saa', 'temps'),
  ('minute', 'dakika', 'temps'),
  ('maintenant', 'avasa', 'temps'),
  ('toujours', 'daima', 'temps'),
  ('souvent', 'dahari', 'temps'),
  ('longtemps', 'hale', 'temps'),
  ('bientôt', 'tsi hale', 'temps'),
  ('tout de suite', 'rabuzi', 'temps'),
  ('tôt', 'na mapema', 'temps'),
  ('la veille', 'suku ya kabula', 'temps'),
  ('le lendemain', 'suku ya vili', 'temps'),
  ('dimanche', 'mufumovili', 'jour'),
  ('lundi', 'mufumoraru', 'jour'),
  ('mardi', 'mufumonne', 'jour'),
  ('mercredi', 'mufumotsano', 'jour'),
  ('jeudi', 'yahoa', 'jour'),
  ('vendredi', 'djumwa', 'jour'),
  ('samedi', 'mufumotsi', 'jour'),

  -- Nombres (annexe 1)
  ('un', 'moja', 'nombre'),
  ('deux', 'mbili', 'nombre'),
  ('trois', 'traru', 'nombre'),
  ('quatre', 'nne', 'nombre'),
  ('cinq', 'tsano', 'nombre'),
  ('six', 'sita', 'nombre'),
  ('sept', 'saba', 'nombre'),
  ('huit', 'nane', 'nombre'),
  ('neuf (nombre)', 'shendra', 'nombre'),
  ('dix', 'kumi', 'nombre'),
  ('onze', 'kumi na moja', 'nombre'),
  ('douze', 'kumi na mbili', 'nombre'),
  ('treize', 'kumi na traru', 'nombre'),
  ('vingt', 'shirini', 'nombre'),
  ('trente', 'thalathini', 'nombre'),
  ('quarante', 'arubaini', 'nombre'),
  ('cinquante', 'hamsini', 'nombre'),
  ('soixante', 'sitini', 'nombre'),
  ('soixante-dix', 'sabwini', 'nombre'),
  ('quatre-vingts', 'thamanini', 'nombre'),
  ('quatre-vingt-dix', 'tuswini', 'nombre'),
  ('cent', 'mia', 'nombre'),
  ('deux cents', 'miateni', 'nombre'),
  ('mille', 'alifu', 'nombre'),
  ('moitié', 'nusu', 'nombre'),
  ('premier', 'wa handra', 'nombre'),
  ('deuxième', 'wa vili', 'nombre'),
  ('troisième', 'wa raru', 'nombre'),

  -- Couleurs
  ('blanc', 'ndjeu', 'couleur'),
  ('noir', 'ndzidu', 'couleur'),
  ('rouge', 'ndzukundru', 'couleur'),
  ('jaune', 'dzindzano', 'couleur'),
  ('vert', 'murututu', 'couleur'),
  ('bleu', 'bile', 'couleur'),
  ('couleur', 'rangi', 'couleur'),

  -- Adjectifs
  ('grand', 'bole', 'adjectif'),
  ('petit', 'titi', 'adjectif'),
  ('long', 'ndrile', 'adjectif'),
  ('large', 'pana', 'adjectif'),
  ('nouveau', 'pia', 'adjectif'),
  ('bon', 'ndjema', 'adjectif'),
  ('mauvais', 'mbi', 'adjectif'),
  ('beau', 'ndzuzuri', 'adjectif'),
  ('lourd', 'ndziro', 'adjectif'),
  ('difficile', 'ndziro', 'adjectif'),
  ('facile', 'nyangu', 'adjectif'),
  ('léger', 'nyangu', 'adjectif'),
  ('court', 'kutri', 'adjectif'),
  ('mince', 'tsala', 'adjectif'),
  ('gros', 'tronga', 'adjectif'),
  ('épais', 'nene', 'adjectif'),
  ('sec', 'havu', 'adjectif'),
  ('cru', 'mbitsi', 'adjectif'),
  ('cher', 'hali', 'adjectif'),
  ('bon marché', 'rahisi', 'adjectif'),
  ('propre', 'trahafu', 'adjectif'),
  ('méchant', 'mushari', 'adjectif'),
  ('malin', 'mudjandja', 'adjectif'),
  ('têtu', 'mukaidi', 'adjectif'),
  ('paresseux', 'fenya', 'adjectif'),
  ('fou', 'mwendza masera', 'adjectif'),
  ('aveugle', 'mufumatso', 'adjectif'),
  ('sourd', 'mufumakio', 'adjectif'),
  ('muet', 'bubu', 'adjectif'),
  ('pauvre', 'masikini', 'adjectif'),
  ('riche', 'tadjiri', 'adjectif'),
  ('patient', 'musuburifu', 'adjectif'),
  ('idiot', 'daba', 'adjectif'),
  ('menteur', 'mwendza trambo', 'adjectif'),
  ('gratuit', 'bure', 'adjectif'),
  ('prêt', 'tayari', 'adjectif'),
  ('vide', 'wadzi', 'adjectif'),
  ('seul', 'weke', 'adjectif'),
  ('rond', 'buruburu', 'adjectif'),
  ('mou', 'trembwavu', 'adjectif'),
  ('vrai', 'kweli', 'adjectif'),
  ('autre', 'yangina', 'adjectif'),

  -- Verbes
  ('abandonner', 'ulisha', 'verbe'),
  ('laisser', 'ulisha', 'verbe'),
  ('aider', 'uvidza', 'verbe'),
  ('aimer', 'uvendza', 'verbe'),
  ('appeler', 'uhira', 'verbe'),
  ('apprendre', 'ufundriha', 'verbe'),
  ('enseigner', 'ufundrisa', 'verbe'),
  ('arriver', 'uwaswili', 'verbe'),
  ('attendre', 'ulindra', 'verbe'),
  ('attacher', 'ufunga', 'verbe'),
  ('avoir', 'ukana', 'verbe'),
  ('balayer', 'uhundza', 'verbe'),
  ('battre', 'urema', 'verbe'),
  ('frapper', 'urema', 'verbe'),
  ('se battre', 'uremana', 'verbe'),
  ('boire', 'unwa', 'verbe'),
  ('bouger', 'ugudzuha', 'verbe'),
  ('brûler', 'uvua', 'verbe'),
  ('cacher', 'utsitsa', 'verbe'),
  ('se cacher', 'udzama', 'verbe'),
  ('casser', 'uvundza', 'verbe'),
  ('chanter', 'uhimba', 'verbe'),
  ('chercher', 'uzunguha', 'verbe'),
  ('choisir', 'utsahua', 'verbe'),
  ('commencer', 'uandrisa', 'verbe'),
  ('comprendre', 'uelewa', 'verbe'),
  ('compter', 'uhasibu', 'verbe'),
  ('savoir', 'ujua', 'verbe'),
  ('connaître', 'ujua', 'verbe'),
  ('construire', 'uwaha', 'verbe'),
  ('coudre', 'usona', 'verbe'),
  ('couper', 'ukatra', 'verbe'),
  ('courir', 'uendra mbiyo', 'verbe'),
  ('creuser', 'utsimba', 'verbe'),
  ('croire', 'uamini', 'verbe'),
  ('cueillir', 'upua', 'verbe'),
  ('cultiver', 'ulima', 'verbe'),
  ('danser', 'uzina', 'verbe'),
  ('demander', 'udzisa', 'verbe'),
  ('descendre', 'ushuka', 'verbe'),
  ('détester', 'uyenga', 'verbe'),
  ('devenir', 'ufanyiha', 'verbe'),
  ('dire', 'urongoa', 'verbe'),
  ('parler', 'urongoa', 'verbe'),
  ('dire à', 'uambia', 'verbe'),
  ('donner', 'uva', 'verbe'),
  ('dormir', 'usindzia', 'verbe'),
  ('écouter', 'uvulishia', 'verbe'),
  ('écrire', 'uangiha', 'verbe'),
  ('égorger', 'utsindza', 'verbe'),
  ('emprunter', 'ukopa', 'verbe'),
  ('prêter', 'uazima', 'verbe'),
  ('enlever', 'utoa', 'verbe'),
  ('entendre', 'ukia', 'verbe'),
  ('enterrer', 'udziha', 'verbe'),
  ('entrer', 'ungia', 'verbe'),
  ('envoyer', 'uveleha', 'verbe'),
  ('épouser', 'ulola', 'verbe'),
  ('espérer', 'utama', 'verbe'),
  ('essayer', 'udjerebu', 'verbe'),
  ('éteindre', 'uzima', 'verbe'),
  ('étudier', 'usoma', 'verbe'),
  ('lire', 'usoma', 'verbe'),
  ('expliquer', 'ueledza', 'verbe'),
  ('fermer', 'ubala', 'verbe'),
  ('finir', 'uhisa', 'verbe'),
  ('fuir', 'utrala', 'verbe'),
  ('gagner', 'ushindra', 'verbe'),
  ('pouvoir', 'ushindra', 'verbe'),
  ('garder', 'ugamisa', 'verbe'),
  ('grandir', 'uhua', 'verbe'),
  ('habiter', 'uketsi', 'verbe'),
  ('s''asseoir', 'uketsi', 'verbe'),
  ('habiller', 'upindrisa', 'verbe'),
  ('s''habiller', 'upindra', 'verbe'),
  ('jeter', 'uvutsa', 'verbe'),
  ('jouer', 'uangadza', 'verbe'),
  ('laver', 'uhosa', 'verbe'),
  ('se laver', 'uhoa', 'verbe'),
  ('laver le linge', 'ufua', 'verbe'),
  ('manger', 'ula', 'verbe'),
  ('marcher', 'uendra ha mindru', 'verbe'),
  ('masser', 'uhandra', 'verbe'),
  ('mettre', 'utria', 'verbe'),
  ('monter', 'uhea', 'verbe'),
  ('mourir', 'ufa', 'verbe'),
  ('nager', 'uelela', 'verbe'),
  ('naître', 'udzalwa', 'verbe'),
  ('accoucher', 'udzaa', 'verbe'),
  ('allaiter', 'uhamusa', 'verbe'),
  ('élever (un enfant)', 'ulela', 'verbe'),
  ('nettoyer', 'uvanguha', 'verbe'),
  ('nier', 'uhana', 'verbe'),
  ('oublier', 'usahau', 'verbe'),
  ('pardonner', 'uswamihi', 'verbe'),
  ('partir', 'ulawa', 'verbe'),
  ('payer', 'uliva', 'verbe'),
  ('pêcher', 'uloa', 'verbe'),
  ('penser', 'ufikiri', 'verbe'),
  ('piler', 'urwa', 'verbe'),
  ('pleurer', 'ulila', 'verbe'),
  ('porter (sur la tête)', 'utrika', 'verbe'),
  ('poser', 'uhetsi', 'verbe'),
  ('pousser', 'usukuma', 'verbe'),
  ('prendre', 'urenga', 'verbe'),
  ('préparer', 'urengedza', 'verbe'),
  ('prier', 'uswali', 'verbe'),
  ('jurer', 'ulava', 'verbe'),
  ('raconter', 'uhadisi', 'verbe'),
  ('ramasser', 'urondroa', 'verbe'),
  ('regarder', 'uangalia', 'verbe'),
  ('regretter', 'ujutsa', 'verbe'),
  ('remplir', 'ujadza', 'verbe'),
  ('rencontrer', 'upara', 'verbe'),
  ('rendre', 'uregedza', 'verbe'),
  ('répondre', 'udjibu', 'verbe'),
  ('se reposer', 'uvumua', 'verbe'),
  ('respirer', 'uhedza pumu', 'verbe'),
  ('rester', 'ubaki', 'verbe'),
  ('rêver', 'uhora', 'verbe'),
  ('rire', 'utseha', 'verbe'),
  ('sauter', 'uruka', 'verbe'),
  ('sécher', 'uhuma', 'verbe'),
  ('semer', 'uyela', 'verbe'),
  ('sentir', 'unuka', 'verbe'),
  ('se taire', 'uburiha', 'verbe'),
  ('souffler', 'uvuma', 'verbe'),
  ('suivre', 'udunga', 'verbe'),
  ('tirer', 'uvura', 'verbe'),
  ('tomber', 'uwa', 'verbe'),
  ('toucher', 'ubamba', 'verbe'),
  ('traduire', 'ufaswiri', 'verbe'),
  ('travailler', 'ufanya hazi', 'verbe'),
  ('trembler', 'udidima', 'verbe'),
  ('tresser', 'usuka', 'verbe'),
  ('tuer', 'uula', 'verbe'),
  ('vivre', 'uyeshi', 'verbe'),
  ('voir', 'uona', 'verbe'),
  ('voler (dérober)', 'uhiba', 'verbe'),
  ('voler (oiseau)', 'uveuha', 'verbe'),
  ('vouloir', 'utsaha', 'verbe'),
  ('voyager', 'usafiri', 'verbe'),
  ('se lever', 'uhima', 'verbe'),
  ('réveiller', 'uhimidza', 'verbe'),
  ('avaler', 'umedza', 'verbe'),
  ('mâcher', 'utsana', 'verbe'),
  ('lécher', 'uhomba', 'verbe'),
  ('mordre', 'urema manyo', 'verbe'),
  ('embrasser', 'ubusu', 'verbe'),
  ('saluer', 'usalimu', 'verbe'),
  ('fumer', 'uvura siga', 'verbe'),
  ('conduire', 'uendresa', 'verbe'),
  ('partager', 'uwanisa', 'verbe'),
  ('mesurer', 'uvima', 'verbe'),
  ('se disputer', 'umana', 'verbe'),
  ('plonger', 'udzama biji', 'verbe'),
  ('peindre', 'utria range', 'verbe'),
  ('chuchoter', 'uvongona', 'verbe'),
  ('éternuer', 'usamua', 'verbe'),
  ('grimper', 'upandra', 'verbe'),
  ('ramer', 'uvura kasi', 'verbe'),
  ('repasser', 'upasi', 'verbe'),
  ('arroser', 'urozi', 'verbe'),
  ('avoir faim', 'uona ndza', 'verbe'),
  ('avoir soif', 'uona nyora', 'verbe'),
  ('avoir chaud', 'uona hari', 'verbe'),
  ('avoir froid', 'uona baridi', 'verbe'),
  ('avoir peur', 'uria', 'verbe'),
  ('se mettre en colère', 'uja hasira', 'verbe'),
  ('être content', 'ujiviwa', 'verbe'),
  ('être heureux', 'ufurahi', 'verbe'),
  ('se fâcher', 'ukasiri', 'verbe'),

  -- Émotions et qualités
  ('colère', 'hasira', 'émotion'),
  ('joie', 'furaha', 'émotion'),
  ('tristesse', 'hamu', 'émotion'),
  ('peur', 'fazaa', 'émotion'),
  ('honte', 'aibu', 'émotion'),
  ('amour', 'mahaba', 'émotion'),
  ('envie', 'ushauku', 'émotion'),
  ('jalousie', 'uivu', 'émotion'),
  ('patience', 'subira', 'émotion'),
  ('fatigue', 'ulemevu', 'émotion'),
  ('beauté', 'uzuri', 'émotion'),
  ('intelligence', 'akili', 'émotion'),
  ('force', 'nguvu', 'émotion'),
  ('courage', 'uhodari', 'émotion'),
  ('méchanceté', 'peu', 'émotion'),
  ('chance', 'bahati', 'émotion'),
  ('malchance', 'nuhusi', 'émotion'),
  ('mensonge', 'trambo', 'émotion'),
  ('vérité', 'kweli', 'émotion'),

  -- Religion
  ('Dieu', 'Mungu', 'religion'),
  ('prière', 'swalati', 'religion'),
  ('jeûne', 'tsumu', 'religion'),
  ('Ramadan', 'Ramadhan', 'religion'),
  ('Coran', 'Kuruani', 'religion'),
  ('ange', 'malaika', 'religion'),
  ('diable', 'shetwani', 'religion'),
  ('djinn', 'djini', 'religion'),
  ('paradis', 'pevoni', 'religion'),
  ('enfer', 'moroni', 'religion'),
  ('aumône', 'zaka', 'religion'),
  ('pèlerinage', 'hedja', 'religion'),
  ('encens', 'ubani', 'religion'),
  ('chapelet', 'tasbwihi', 'religion'),
  ('religion', 'dini', 'religion'),
  ('musulman', 'musilimu', 'religion'),

  -- Argent et commerce
  ('argent (monnaie)', 'marike', 'argent'),
  ('pièce de monnaie', 'pesa', 'argent'),
  ('prix', 'kima', 'argent'),
  ('dette', 'deni', 'argent'),
  ('salaire', 'malivo', 'argent'),
  ('pauvreté', 'umasikini', 'argent'),
  ('richesse', 'utadjiri', 'argent'),
  ('économies', 'akiba', 'argent'),
  ('acheter', 'ununua', 'commerce'),
  ('vendre', 'uudza', 'commerce'),
  ('commerce', 'biashara', 'commerce'),

  -- Culture et vie sociale
  ('danse', 'muzino', 'culture'),
  ('chant', 'himbo', 'culture'),
  ('conte', 'hale', 'culture'),
  ('mariage', 'ndrola', 'culture'),
  ('grand mariage', 'arusi', 'culture'),
  ('fête', 'ngoma', 'culture'),
  ('deuil', 'muswiba', 'culture'),
  ('tontine', 'shikoa', 'culture'),
  ('cadeau', 'zawadi', 'culture'),
  ('jeu', 'dangadzo', 'culture'),
  ('cartes à jouer', 'karata', 'culture'),
  ('coutume', 'mila', 'culture'),
  ('nom', 'dzina', 'culture'),
  ('langue (langage)', 'luha', 'culture'),
  ('parole', 'urongozi', 'culture'),
  ('mot', 'kauli', 'culture'),
  ('histoire', 'hadisi', 'culture'),
  ('nouvelle', 'habari', 'culture'),
  ('secret', 'siri', 'culture'),
  ('en shimaoré', 'shimaore', 'culture'),
  ('en français', 'shifarantsa', 'culture'),
  ('travail', 'hazi', 'travail'),
  ('leçon', 'musomo', 'école'),
  ('examen', 'mutianu', 'école'),
  ('livre', 'shio', 'école'),
  ('crayon', 'kalamu', 'école'),
  ('lettre (courrier)', 'barua', 'école'),

  -- Salutations et politesse
  ('au revoir', 'kwaheri', 'salutation'),
  ('salut', 'salamu', 'salutation'),
  ('salutation à un aîné', 'kwezi', 'salutation'),
  ('réponse à kwezi', 'mbona', 'salutation'),
  ('comment ça va ?', 'jeje', 'salutation'),
  ('très bien (réponse)', 'hairi', 'salutation'),
  ('quelles nouvelles ?', 'barza', 'salutation'),
  ('bonne nuit', 'lala ha unono', 'salutation'),
  ('puis-je entrer ?', 'hodi', 'salutation'),
  ('entre !', 'karibu', 'salutation'),
  ('merci', 'marahaba', 'politesse'),
  ('pardon', 'swamaha', 'politesse'),
  ('je t''en prie', 'tafadhali', 'politesse'),
  ('si Dieu le veut', 'inshallah', 'politesse'),
  ('oui', 'ewa', 'conversation'),
  ('oui (respectueux)', 'naam', 'conversation'),
  ('non', 'aha', 'conversation'),

  -- Questions
  ('qui ?', 'mbani', 'question'),
  ('quoi ?', 'trini', 'question'),
  ('où ?', 'havi', 'question'),
  ('quand ?', 'lini', 'question'),
  ('comment ?', 'jeje', 'question'),
  ('combien ?', 'ngavi', 'question'),
  ('combien ça coûte ?', 'kisaje', 'question'),
  ('pourquoi ?', 'mana trini', 'question'),

  -- Pronoms
  ('moi', 'wami', 'pronom'),
  ('toi', 'wawe', 'pronom'),
  ('lui, elle', 'waye', 'pronom'),
  ('nous', 'wasi', 'pronom'),
  ('vous', 'wanyu', 'pronom'),
  ('eux, elles', 'wao', 'pronom'),

  -- Mots outils
  ('et', 'na', 'mot outil'),
  ('avec', 'na', 'mot outil'),
  ('mais', 'be', 'mot outil'),
  ('ou bien', 'au', 'mot outil'),
  ('si', 'neka', 'mot outil'),
  ('sans', 'bila', 'mot outil'),
  ('après', 'baada', 'mot outil'),
  ('avant', 'kabula', 'mot outil'),
  ('encore', 'tsena', 'mot outil'),
  ('aussi', 'wajau', 'mot outil'),
  ('très', 'kabisa', 'mot outil'),
  ('seulement', 'tu', 'mot outil'),
  ('peut-être', 'labda', 'mot outil'),
  ('jusqu''à', 'ata', 'mot outil'),
  ('ici', 'vanu', 'mot outil'),
  ('là', 'vale', 'mot outil'),
  ('là-bas', 'hule', 'mot outil'),
  ('loin', 'mbali', 'mot outil'),
  ('près', 'karibu', 'mot outil'),
  ('dehors', 'vwendze', 'mot outil'),
  ('dedans', 'moni', 'mot outil'),
  ('derrière', 'nyuma', 'mot outil'),
  ('devant', 'mbeli', 'mot outil'),
  ('au-dessus', 'ujuu', 'mot outil'),
  ('en dessous', 'utsini', 'mot outil'),
  ('à droite', 'kumeni', 'mot outil'),
  ('à gauche', 'potroni', 'mot outil'),
  ('chez moi', 'hangu', 'mot outil'),
  ('chez toi', 'haho', 'mot outil'),
  ('ensemble', 'ha moja', 'mot outil'),
  ('vite', 'haraka', 'mot outil'),
  ('doucement', 'vole vole', 'mot outil'),
  ('parce que', 'mana', 'mot outil'),
  ('ensuite', 'halafu', 'mot outil'),
  ('déjà', 'madza', 'mot outil'),
  ('pas encore', 'rasa', 'mot outil'),
  ('rien', 'ata shitru', 'mot outil'),
  ('tous', 'pia', 'mot outil'),
  ('chaque', 'kula', 'mot outil'),
  ('beaucoup', 'nyengi', 'mot outil'),
  ('un peu', 'pavi', 'mot outil'),
  ('c''est', 'de', 'mot outil'),
  ('ce n''est pas', 'tsi', 'mot outil'),
  ('il faut', 'ilazimu', 'mot outil'),
  ('il y a', 'vwa', 'mot outil'),

  -- Phrases tirées des exemples du dictionnaire
  ('il pleut', 'vua isunya', 'phrase'),
  ('il fait chaud', 'vwa hari', 'phrase'),
  ('il fait froid', 'vwa baridi', 'phrase'),
  ('il fait nuit', 'ra uku', 'phrase'),
  ('il est midi', 'ra adhuhuri', 'phrase'),
  ('j''ai mal au ventre', 'mimba yangu isunihodza', 'phrase'),
  ('j''ai mal à la gorge', 'gandzi lisunihodza', 'phrase'),
  ('comment t''appelles-tu ?', 'wawe huhiriwa mbani', 'phrase'),
  ('quel âge as-tu ?', 'una maha mingavi', 'phrase'),
  ('c''est bon', 'isujiva', 'phrase'),
  ('ça me plaît', 'isunijivia', 'phrase'),
  ('c''est vrai', 'iyo kweli', 'phrase'),
  ('c''est facile', 'iyo nyangu', 'phrase'),
  ('c''est amer', 'ina nyongo', 'phrase'),
  ('c''est sucré', 'ina sukari', 'phrase'),
  ('je m''en vais', 'niswendra dzangu', 'phrase'),
  ('allez-vous en', 'namwendre dzanyu', 'phrase'),
  ('attention !', 'fahamu', 'phrase'),
  ('ça suffit', 'itosho', 'phrase'),
  ('la marée est haute', 'maji yajaya', 'phrase'),
  ('le repas est prêt', 'shahula iiva', 'phrase'),
  ('ça ne fait rien', 'kaidhuru', 'phrase'),
  ('tu entends ?', 'ukia', 'phrase'),
  ('je ne veux rien', 'tsisutsaha ata shitru', 'phrase'),
  ('j''ai un problème', 'tsina usongefu', 'phrase'),
  ('ce n''est pas grave', 'tsi trongo na hazi', 'phrase'),
  ('que veux-tu ?', 'usutsaha trini', 'phrase'),
  ('qu''est-ce que c''est ?', 'iyo trini', 'phrase')
on conflict (lower(french), lower(shimaore)) do nothing;

-- ============================================================================
-- 20261214000000_conflits_de_mots.sql
-- ============================================================================

-- BTM AI — Conflits de mots : un mot français a plusieurs traductions shimaoré
-- dans le dictionnaire (awa_words), souvent parce que deux sources ne sont pas
-- d'accord. Quand Tamilya rencontre un de ces mots en conversation, le serveur
-- (clé secrète) dépose une demande ici ; l'administrateur garde la bonne
-- traduction dans /admin/lexique (liste « À traduire »).
-- Les demandes existantes deviennent des demandes « inconnu » (mot non compris).

alter table public.awa_word_requests
  add column kind text not null default 'inconnu' check (kind in ('inconnu', 'conflit')),
  -- Conflit : le mot français ; shimaore garde les traductions, séparées par « / ».
  add column french text check (french is null or char_length(french) between 1 and 80);

-- shimaore liste toutes les traductions d'un conflit : il lui faut plus de place.
alter table public.awa_word_requests drop constraint if exists awa_word_requests_shimaore_check;
alter table public.awa_word_requests
  add constraint awa_word_requests_shimaore_check check (char_length(shimaore) between 1 and 300);

-- Un mot inconnu n'est demandé qu'une fois ; un conflit, une fois par mot français.
drop index if exists public.awa_word_requests_word_idx;
create unique index awa_word_requests_word_idx on public.awa_word_requests (lower(shimaore)) where kind = 'inconnu';
create unique index awa_word_requests_conflict_idx on public.awa_word_requests (lower(french)) where kind = 'conflit';

-- L'index devenu partiel : on conflict doit le désigner avec sa condition.
create or replace function public.report_unknown_word(p_shimaore text, p_example text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.awa_word_requests (shimaore, example)
  values (p_shimaore, left(p_example, 300))
  on conflict (lower(shimaore)) where kind = 'inconnu' do update
    set occurrences = public.awa_word_requests.occurrences + 1,
        example = excluded.example,
        last_seen_at = now();
$$;

-- Signalement d'un conflit depuis le chat (clé secrète). Les traductions sont
-- remises à jour à chaque fois. Un conflit déjà tranché revient « à traiter »
-- seulement si ses traductions ont changé (nouvel import) : le chat garde son
-- dictionnaire en cache une minute et redemanderait sinon ce qui vient d'être
-- tranché. Un conflit ignoré (« les deux se disent ») le reste.
create function public.report_word_conflict(p_french text, p_shimaore text, p_example text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.awa_word_requests (kind, french, shimaore, example)
  values ('conflit', left(p_french, 80), left(p_shimaore, 300), left(p_example, 300))
  on conflict (lower(french)) where kind = 'conflit' do update
    set occurrences = public.awa_word_requests.occurrences + 1,
        shimaore = excluded.shimaore,
        example = excluded.example,
        last_seen_at = now(),
        status = case
          when public.awa_word_requests.status = 'done' and lower(public.awa_word_requests.shimaore) <> lower(excluded.shimaore) then 'pending'
          else public.awa_word_requests.status
        end;
$$;

revoke execute on function public.report_word_conflict(text, text, text) from public, anon, authenticated;

-- ============================================================================
-- 20261215000000_widgets_developpeurs.sql
-- ============================================================================

-- BTM AI — Widgets des développeurs (bulle de Tamilya à coller sur un site, route /api/v1/widget)
--
-- Un développeur connecté crée un widget depuis /developpeurs et colle une
-- balise <script> sur son site. Les réponses sont payées par BTM : pas de
-- clé Gemini à fournir. L'identifiant public (pub_…) n'est pas un secret :
-- seuls les domaines déclarés sont acceptés, et des limites basses protègent BTM.
-- Aucune politique RLS : seul le serveur (clé secrète) lit et écrit la table,
-- après avoir vérifié la session de l'utilisateur.

create table if not exists public.developer_widgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  public_id text not null unique check (public_id ~ '^pub_[A-Za-z0-9_-]{16}$'),
  -- Origines autorisées, ex. « https://mon-site.yt » (sans chemin ni barre finale).
  origins text[] not null check (cardinality(origins) between 1 and 5),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists developer_widgets_user_idx on public.developer_widgets (user_id, created_at desc);

alter table public.developer_widgets enable row level security;
revoke all on public.developer_widgets from anon, authenticated;

-- ============================================================================
-- 20261216000000_verification_developpeurs.sql
-- ============================================================================

-- BTM AI — Vérification des développeurs et mission des widgets
--
-- Avant tout accès à Tamilya (API ou widget), le développeur envoie une demande
-- depuis /developpeurs : nom, structure, site, usage prévu et acceptation de la
-- charte. BTM la valide depuis /admin/developpeurs. Un développeur qui tente de
-- renommer Tamilya est suspendu automatiquement et doit contacter BTM.
-- Aucune politique RLS : seul le serveur (clé secrète) lit et écrit la table.

create table if not exists public.developer_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'suspended')),
  full_name text not null check (char_length(full_name) between 2 and 80),
  organization text not null check (char_length(organization) between 2 and 120),
  siret text check (siret ~ '^[0-9]{14}$'),
  website text not null check (char_length(website) between 4 and 200),
  usage text not null check (char_length(usage) between 20 and 2000),
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  -- Motif d'un refus ou d'une suspension, montré au développeur.
  review_note text check (char_length(review_note) <= 500)
);

create index if not exists developer_accounts_status_idx on public.developer_accounts (status, submitted_at desc);

alter table public.developer_accounts enable row level security;
revoke all on public.developer_accounts from anon, authenticated;

-- Mission confiée à Tamilya sur le site (rôle, sujet, ton) : réglée sur /developpeurs, jamais par le navigateur.
alter table public.developer_widgets add column if not exists mission text check (char_length(mission) <= 2000);

-- ============================================================================
-- 20261217000000_engagement_developpeurs.sql
-- ============================================================================

-- BTM AI — Accès des développeurs sans validation : un simple engagement
--
-- Remplace la demande vérifiée par BTM (20261216000000) : le développeur
-- s'engage depuis /developpeurs à ne jamais changer le nom, le shimaoré ni la
-- personnalité de Tamilya, et l'accès s'ouvre aussitôt. Une tentative de
-- renommage le suspend toujours automatiquement ; BTM le rétablit depuis
-- /admin/developpeurs. Plus de nom, structure, site ni projet à remplir.
--
-- Aucune donnée supprimée : les anciennes colonnes de la demande sont gardées
-- (devenues facultatives) pour les demandes déjà envoyées. Supabase applique
-- la migration en une seule transaction : en cas d'erreur, rien ne change.

-- Demandes en attente ou refusées : l'engagement (charte) a déjà été pris, l'accès s'ouvre.
update public.developer_accounts set status = 'approved' where status in ('pending', 'rejected');

alter table public.developer_accounts drop constraint if exists developer_accounts_status_check;
alter table public.developer_accounts
  add constraint developer_accounts_status_check check (status in ('approved', 'suspended'));
alter table public.developer_accounts alter column status set default 'approved';
alter table public.developer_accounts alter column terms_accepted_at set default now();

-- Champs de l'ancienne demande : plus demandés, mais gardés tels quels (rien n'est effacé).
alter table public.developer_accounts
  alter column full_name drop not null,
  alter column organization drop not null,
  alter column website drop not null,
  alter column usage drop not null;

-- Colonne du justificatif, présente seulement si une ancienne version de 20261216 a été appliquée.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'developer_accounts' and column_name = 'document_path'
  ) then
    alter table public.developer_accounts alter column document_path drop not null;
  end if;
end $$;

drop index if exists public.developer_accounts_status_idx;
create index if not exists developer_accounts_status_idx on public.developer_accounts (status, terms_accepted_at desc);

-- ============================================================================
-- 20261218000000_partenaire_orchestr_ai.sql
-- ============================================================================

-- BTM AI — Orchestr AI (messagerie privée du patron avec Tamilya) peut faire parler Tamilya
-- (route /api/tamilya, site « orchestr-ai »). Le secret est ajouté à part (empreinte SHA-256 seulement).
alter table public.awa_partner_keys drop constraint if exists awa_partner_keys_site_check;
alter table public.awa_partner_keys add constraint awa_partner_keys_site_check
  check (site in ('btm-batiment', 'btm-market', 'orchestr-ai'));

-- ============================================================================
-- 20261219000000_questions_de_tamilya.sql
-- ============================================================================

-- BTM AI — Questions de Tamilya (/admin/apprentissage, onglet « Questions »)
-- Quand Tamilya doute d'une phrase shimaoré qu'elle vient de dire (au chat comme
-- à la voix : même cerveau), elle l'écrit ici. L'administrateur répond :
-- « C'est juste » ou la bonne phrase, qui entre dans le lexique, ou une règle
-- qui entre dans la grammaire. Tamilya s'en sert dès le message suivant.

create table public.awa_questions (
  id uuid primary key default gen_random_uuid(),
  -- Phrase shimaoré dont Tamilya doute, telle qu'elle l'a dite.
  phrase text not null check (char_length(phrase) between 1 and 300),
  -- Ce qu'elle voulait dire, en français.
  french text check (french is null or char_length(french) <= 300),
  -- Sa question, courte (« Est-ce qu'on met le verbe avant le sujet ? »).
  question text not null check (char_length(question) between 1 and 300),
  source text not null default 'chat' check (source in ('chat', 'voix')),
  occurrences integer not null default 1 check (occurrences >= 1),
  status text not null default 'pending' check (status in ('pending', 'answered', 'ignored')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Une même phrase n'est demandée qu'une fois ; ses retours augmentent occurrences.
create unique index awa_questions_phrase_idx on public.awa_questions (lower(phrase));
create index awa_questions_pending_idx on public.awa_questions (status, last_seen_at desc);

alter table public.awa_questions enable row level security;

create policy "awa_questions_admin_all" on public.awa_questions
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

-- Signalement depuis le chat ou la voix (clé secrète) : ajoute la question ou compte un retour de plus.
create function public.report_tamilya_doubt(p_phrase text, p_french text, p_question text, p_source text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.awa_questions (phrase, french, question, source)
  values (left(p_phrase, 300), left(p_french, 300), left(p_question, 300), p_source)
  on conflict (lower(phrase)) do update
    set occurrences = public.awa_questions.occurrences + 1,
        last_seen_at = now();
$$;

revoke execute on function public.report_tamilya_doubt(text, text, text, text) from public, anon, authenticated;

-- ============================================================================
-- 20261220000000_une_seule_tamilya.sql
-- ============================================================================

-- BTM AI — Une seule Tamilya : plus de personnalités Méchante et À l'aise.
-- 1. Le lexique garde une seule phrase en shimaoré par expression (colonne shimaore,
--    qui était déjà la version professionnelle) : les autres versions sont supprimées.
-- 2. Les comptes qui avaient choisi une autre personnalité passent à la seule qui reste.
-- À appliquer APRÈS la mise en ligne du code (il ne lit plus la colonne variants).

alter table public.awa_lexicon drop column if exists variants;

alter table public.profiles drop constraint if exists profiles_personality_check;
update public.profiles set personality = 'professionnelle' where personality in ('mechante', 'cool');
alter table public.profiles
  add constraint profiles_personality_check
  check (personality is null or personality = 'professionnelle');

delete from public.awa_personalities where id in ('mechante', 'cool');

-- ============================================================================
-- 20261221000000_nettoyage_nisi_ou_hega.sql
-- ============================================================================

-- BTM AI — Conversation du 2026-11-16 : Tamilya a inventé « nisi ou hega » pour « je n'aime pas les hommes »,
-- et le relevé des mots a gardé son invention au lieu de la correction du maître.
-- 1. Les traductions inventées et les sens absurdes (« Non, c'est ça ») sont retirés du dictionnaire.
-- 2. Les deux phrases données par le maître sont ajoutées avec leur vrai sens.
-- 3. Les « souvenirs » tirés des phrases à traduire (« n'aime pas les gommes ») sont effacés.

delete from public.awa_words
where lower(shimaore) like 'nisi ou hega%'
   or lower(french) like 'littéralement%'
   or lower(french) like 'non, c''est ça%';

delete from public.awa_lexicon
where lower(shimaore) like 'nisi ou hega%'
   or lower(shimaore) like 'nisi vedzé watchu gommes%'
   or lower(french) like 'littéralement%'
   or lower(french) like 'non, c''est ça%';

insert into public.awa_words (french, shimaore, is_active)
select v.french, v.shimaore, true
from (values
  ('je n''aime pas les hommes', 'tsi vedzé watchu baba'),
  ('je n''aime pas les gommes', 'tsi vedzé gommu')
) as v (french, shimaore)
where not exists (
  select 1 from public.awa_words w
  where lower(w.french) = lower(v.french) and lower(w.shimaore) = lower(v.shimaore)
);

delete from public.awa_memories
where content ilike '%aime pas les gommes%'
   or content ilike '%aime pas les hommes%'
   or content ilike '%gent% masculin%';

-- ============================================================================
-- 20261222000000_mutsanga_plage_sable.sql
-- ============================================================================

-- BTM AI — Conversation du 2026-11-16 (« comment on dit j'aime pas aller à la plage ») : le relevé des mots a gardé
-- « je te déteste → mutsanga », et comme il remplaçait tous les autres sens du même shimaoré,
-- « plage = mutsanga » et « sable = mutsanga » ont été mis en pause.
-- 1. Le faux sens est retiré, et « nisi ou hega » une nouvelle fois s'il est revenu.
-- 2. Les vrais sens de mutsanga sont réactivés.

delete from public.awa_words
where (lower(shimaore) = 'mutsanga' and lower(french) like 'je te d%')
   or lower(shimaore) like 'nisi ou hega%';

delete from public.awa_lexicon
where (lower(shimaore) like '%mutsanga%' and lower(french) like 'je te d%')
   or lower(shimaore) like 'nisi ou hega%';

update public.awa_words
set is_active = true
where lower(shimaore) = 'mutsanga'
  and lower(french) in ('plage', 'sable');

-- ============================================================================
-- 20261223000000_plage_tsi_vedze_ou_hedrah.sql
-- ============================================================================

-- BTM AI — Phrase donnée par le maître le 2026-11-16 (« comment on dit j'aime pas aller à la plage »),
-- que le relevé des mots avait manquée.

insert into public.awa_words (french, shimaore, is_active)
select v.french, v.shimaore, true
from (values
  ('je n''aime pas aller à la plage', 'tsi vedzé ou hedrah la plagi')
) as v (french, shimaore)
where not exists (
  select 1 from public.awa_words w
  where lower(w.french) = lower(v.french) and lower(w.shimaore) = lower(v.shimaore)
);

-- ============================================================================
-- 20261224000000_fiche_developpeurs.sql
-- ============================================================================

-- BTM AI — Rattrapage de la fiche des développeurs
--
-- Sur la base en ligne, developer_accounts avait été créée par une version
-- ancienne de 20261216 (sans la fiche) : le « create table if not exists » ne
-- l'a pas complétée, et 20261217 échouait sur « full_name does not exist ».
-- Résultat : /admin/developpeurs et /developpeurs ne pouvaient pas lire la table.
--
-- Cette migration ajoute les colonnes manquantes (facultatives) puis reprend
-- 20261217. Elle peut être relancée sans risque ; aucune donnée n'est effacée.
-- Supabase l'applique en une seule transaction : en cas d'erreur, rien ne change.

-- 1. Colonnes de la fiche (20261216), facultatives comme le veut 20261217.
alter table public.developer_accounts
  add column if not exists full_name text check (char_length(full_name) between 2 and 80),
  add column if not exists organization text check (char_length(organization) between 2 and 120),
  add column if not exists siret text check (siret ~ '^[0-9]{14}$'),
  add column if not exists website text check (char_length(website) between 4 and 200),
  add column if not exists usage text check (char_length(usage) between 20 and 2000),
  add column if not exists submitted_at timestamptz not null default now();

alter table public.developer_accounts
  alter column full_name drop not null,
  alter column organization drop not null,
  alter column website drop not null,
  alter column usage drop not null;

-- 2. Accès sur simple engagement (20261217).
update public.developer_accounts set status = 'approved' where status in ('pending', 'rejected');

alter table public.developer_accounts drop constraint if exists developer_accounts_status_check;
alter table public.developer_accounts
  add constraint developer_accounts_status_check check (status in ('approved', 'suspended'));
alter table public.developer_accounts alter column status set default 'approved';
alter table public.developer_accounts alter column terms_accepted_at set default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'developer_accounts' and column_name = 'document_path'
  ) then
    alter table public.developer_accounts alter column document_path drop not null;
  end if;
end $$;

drop index if exists public.developer_accounts_status_idx;
create index if not exists developer_accounts_status_idx on public.developer_accounts (status, terms_accepted_at desc);

-- 3. Seul le serveur (clé secrète) lit et écrit la table.
alter table public.developer_accounts enable row level security;
revoke all on public.developer_accounts from anon, authenticated;
