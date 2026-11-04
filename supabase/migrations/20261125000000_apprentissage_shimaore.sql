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
