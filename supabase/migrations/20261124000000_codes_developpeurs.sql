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
