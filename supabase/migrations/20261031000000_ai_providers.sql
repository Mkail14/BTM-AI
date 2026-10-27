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
