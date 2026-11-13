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
