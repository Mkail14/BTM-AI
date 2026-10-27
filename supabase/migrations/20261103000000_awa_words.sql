-- BTM AI — Dictionnaire de mots français ↔ shimaoré (/admin/lexique)
-- À côté des expressions (awa_lexicon), des mots isolés : Awa reçoit ceux qui
-- apparaissent dans le message, et un lot plus large quand on parle shimaoré.
-- Lisible par le serveur (clé secrète) et les administrateurs uniquement.

create table public.awa_words (
  id uuid primary key default gen_random_uuid(),
  french text not null check (char_length(french) between 1 and 80),
  shimaore text not null check (char_length(shimaore) between 1 and 80),
  -- Facultatif : nom, verbe, nombre, famille…
  category text check (category is null or char_length(category) <= 40),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

-- Un même couple n'est enregistré qu'une fois (sans tenir compte des majuscules).
create unique index awa_words_pair_idx on public.awa_words (lower(french), lower(shimaore));

alter table public.awa_words enable row level security;

create policy "awa_words_admin_all" on public.awa_words
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
