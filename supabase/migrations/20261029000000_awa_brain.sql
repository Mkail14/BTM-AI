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
