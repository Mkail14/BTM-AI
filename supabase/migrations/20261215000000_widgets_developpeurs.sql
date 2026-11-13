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
