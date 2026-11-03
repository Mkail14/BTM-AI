-- BTM AI — Alignement des fichiers sur la base réelle (relevé du 3 novembre 2026)
-- Ne change rien en production : décrit deux éléments qui y existent déjà mais
-- qu'aucun fichier ne créait. Sur une base neuve, il les recrée à l'identique.

-- 1. RLS activé sur les tables privées (sans politique : personne ne les lit par
--    l'API ; seul le serveur, avec la clé secrète, y accède).
alter table private.rate_limit_counters enable row level security;
alter table private.protected_admins enable row level security;
alter table private.blocked_email_domains enable row level security;

-- 2. Ancienne table des places du code, remplacée par code_exam_requests.
--    Vide et utilisée par aucun code : sa suppression sera proposée à part.
create table if not exists public.code_exam_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  center_id text not null check (char_length(center_id) between 1 and 40),
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (center_id, starts_at)
);

alter table public.code_exam_bookings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'code_exam_bookings' and policyname = 'code_exam_bookings_select_own') then
    create policy "code_exam_bookings_select_own" on public.code_exam_bookings
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'code_exam_bookings' and policyname = 'code_exam_bookings_insert_own') then
    create policy "code_exam_bookings_insert_own" on public.code_exam_bookings
      for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'code_exam_bookings' and policyname = 'code_exam_bookings_delete_own') then
    create policy "code_exam_bookings_delete_own" on public.code_exam_bookings
      for delete to authenticated using ((select auth.uid()) = user_id);
  end if;
end
$$;

revoke all on public.code_exam_bookings from anon;
