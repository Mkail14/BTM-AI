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
