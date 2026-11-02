-- BTM AI — Branches de la carte du shimaoré proposées par Awa
--
-- Dans /admin/lexique, le « + » de la carte demande à Awa ce qu'elle aurait
-- aimé savoir dire (d'après les mots qu'elle n'a pas compris en conversation
-- et les trous de son vocabulaire). Elle propose une branche : un nom, une
-- phrase pour expliquer pourquoi, et des mots français. La branche s'ajoute à
-- la carte ; chaque mot y attend sa traduction (enregistrée dans awa_words,
-- catégorie = nom de la branche).

create table if not exists public.awa_branches (
  id uuid primary key default gen_random_uuid(),
  label text not null unique check (char_length(label) between 2 and 30),
  emoji text check (emoji is null or char_length(emoji) <= 8),
  hue integer not null default 200 check (hue between 0 and 359),
  reason text check (reason is null or char_length(reason) <= 300),
  words text[] not null check (cardinality(words) between 1 and 30),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.awa_branches enable row level security;

drop policy if exists "awa_branches_admin_all" on public.awa_branches;
create policy "awa_branches_admin_all" on public.awa_branches
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

revoke all on public.awa_branches from anon;
grant select, insert, update, delete on public.awa_branches to authenticated;
