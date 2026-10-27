-- BTM AI — comportement des 3 personnalités d'Awa, modifiable depuis /admin.
-- instructions null : le texte par défaut défini dans le code est utilisé.
-- Les garde-fous (pas d'insulte réelle, abandon du rôle en cas de détresse,
-- honnêteté, sécurité) restent fixés dans le code et ne sont pas modifiables ici.

-- Rappel de la migration 20261028180000 (sans effet si déjà appliquée).
alter table public.profiles
  add column if not exists personality text
  check (personality is null or personality in ('mechante', 'gentille', 'cool'));

create table if not exists public.awa_personalities (
  id text primary key check (id in ('mechante', 'gentille', 'cool')),
  instructions text check (instructions is null or char_length(instructions) <= 6000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.awa_personalities (id) values ('mechante'), ('gentille'), ('cool')
on conflict (id) do nothing;

create trigger awa_personalities_set_updated_at
  before update on public.awa_personalities
  for each row execute function public.set_updated_at();

alter table public.awa_personalities enable row level security;

create policy "awa_personalities_admin_all" on public.awa_personalities
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

-- Les trois lignes sont fixes : pas de suppression, même par un admin.
create policy "awa_personalities_no_delete" on public.awa_personalities
  as restrictive for delete to authenticated
  using (false);

revoke all on public.awa_personalities from anon;
