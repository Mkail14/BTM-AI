-- BTM AI — Réservations de l'examen du code de la route (La Poste), depuis la conversation
-- Un créneau = un centre + une heure de début. Une seule réservation par compte
-- (essai, sans paiement). Les créneaux eux-mêmes viennent de src/lib/code-exam.

create table public.code_exam_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  center_id text not null check (char_length(center_id) between 1 and 40),
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Un créneau ne se réserve qu'une fois, et un compte n'a qu'une réservation.
  unique (center_id, starts_at),
  unique (user_id)
);

alter table public.code_exam_bookings enable row level security;

create policy "code_exam_bookings_select_own" on public.code_exam_bookings
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "code_exam_bookings_insert_own" on public.code_exam_bookings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "code_exam_bookings_delete_own" on public.code_exam_bookings
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.code_exam_bookings from anon;
