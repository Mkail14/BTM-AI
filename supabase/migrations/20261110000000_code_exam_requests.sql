-- BTM AI — Demandes de réservation de l'examen du code (La Poste), faites depuis la conversation
-- Le candidat choisit un créneau puis donne ses informations (vérifiées par le
-- serveur, src/lib/code-exam/candidate.ts). GROUPE BTM traite la demande.
-- Données personnelles : lisibles par le candidat et par les administrateurs seulement.

create table public.code_exam_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Créneau choisi (bureau La Poste et heure de début).
  center_id text not null check (char_length(center_id) between 1 and 20),
  center_name text not null check (char_length(center_name) between 1 and 100),
  starts_at timestamptz not null,
  exam_type text not null check (exam_type in ('B', 'A', 'OC', 'OEI')),
  -- Candidat.
  civility text not null check (civility in ('Mme', 'M.')),
  last_name text not null check (char_length(last_name) between 1 and 60),
  first_name text not null check (char_length(first_name) between 1 and 60),
  birth_date date not null,
  city text not null check (char_length(city) between 2 and 60),
  phone text not null check (phone ~ '^0[1-9][0-9]{8}$'),
  email text not null check (char_length(email) between 3 and 200),
  neph text not null check (neph ~ '^[0-9]{12}$'),
  snu boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'booked', 'cancelled')),
  created_at timestamptz not null default now()
);

create index code_exam_requests_user_idx on public.code_exam_requests (user_id, created_at desc);
create index code_exam_requests_pending_idx on public.code_exam_requests (created_at) where status = 'pending';

alter table public.code_exam_requests enable row level security;

create policy "code_exam_requests_select_own" on public.code_exam_requests
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "code_exam_requests_insert_own" on public.code_exam_requests
  for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'pending');

create policy "code_exam_requests_admin_read" on public.code_exam_requests
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

revoke all on public.code_exam_requests from anon;
