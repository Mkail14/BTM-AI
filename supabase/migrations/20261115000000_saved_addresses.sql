-- BTM AI — Carnet d'adresses
--
-- En plus de l'adresse du compte (la maison, dans profiles), chaque personne
-- garde jusqu'à 10 adresses : travail, amis, famille… Proposées à chaque
-- livraison. Mêmes règles que l'adresse du compte (src/lib/address.ts).
-- RLS : chacun ne voit et ne modifie que les siennes.

create table if not exists public.saved_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('travail', 'ami', 'famille', 'autre')),
  label text not null check (char_length(label) between 1 and 40),
  commune text not null
    check (commune in ('Acoua', 'Bandraboua', 'Bandrélé', 'Bouéni', 'Chiconi', 'Chirongui', 'Dembéni', 'Dzaoudzi', 'Kani-Kéli', 'Koungou', 'Mamoudzou', 'Mtsamboro', 'M''Tsangamouji', 'Ouangani', 'Pamandzi', 'Sada', 'Tsingoni')),
  line text not null check (char_length(line) between 5 and 200),
  lat double precision check (lat is null or lat between -13.05 and -12.6),
  lng double precision check (lng is null or lng between 44.95 and 45.35),
  accuracy integer check (accuracy is null or accuracy between 0 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_addresses_geo_complete check ((lat is null) = (lng is null) and (lat is null) = (accuracy is null))
);

create index if not exists saved_addresses_user_idx on public.saved_addresses (user_id, created_at);

alter table public.saved_addresses enable row level security;

drop policy if exists "saved_addresses_own" on public.saved_addresses;
create policy "saved_addresses_own" on public.saved_addresses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.saved_addresses from anon;
grant select, insert, update, delete on public.saved_addresses to authenticated;

-- 10 adresses au plus par compte, vérifié par la base elle-même.
create or replace function public.saved_addresses_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.saved_addresses where user_id = new.user_id) >= 10 then
    raise exception 'Carnet plein : 10 adresses au maximum.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists saved_addresses_limit on public.saved_addresses;
create trigger saved_addresses_limit
  before insert on public.saved_addresses
  for each row execute function public.saved_addresses_limit();
