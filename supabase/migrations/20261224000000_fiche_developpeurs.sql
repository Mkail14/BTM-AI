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
