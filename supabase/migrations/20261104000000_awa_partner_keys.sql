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
