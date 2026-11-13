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
