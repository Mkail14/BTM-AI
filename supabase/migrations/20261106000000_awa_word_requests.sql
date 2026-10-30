-- BTM AI — Mots shimaoré inconnus d'Awa, à traduire par un administrateur
-- Quand un utilisateur emploie un mot shimaoré qu'Awa ne connaît pas, le
-- serveur (clé secrète) l'ajoute ici ; l'administrateur donne la traduction
-- dans /admin/lexique et le mot entre dans le dictionnaire (awa_words).

create table public.awa_word_requests (
  id uuid primary key default gen_random_uuid(),
  shimaore text not null check (char_length(shimaore) between 1 and 80),
  -- Message où le mot est apparu (dernier en date), pour aider à traduire.
  example text check (example is null or char_length(example) <= 300),
  occurrences integer not null default 1 check (occurrences >= 1),
  status text not null default 'pending' check (status in ('pending', 'done', 'ignored')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Un mot n'est demandé qu'une fois (sans tenir compte des majuscules) ; ses retours augmentent occurrences.
create unique index awa_word_requests_word_idx on public.awa_word_requests (lower(shimaore));
create index awa_word_requests_pending_idx on public.awa_word_requests (status, last_seen_at desc);

alter table public.awa_word_requests enable row level security;

create policy "awa_word_requests_admin_all" on public.awa_word_requests
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

-- Signalement depuis le chat (clé secrète) : ajoute le mot ou compte un retour de plus.
create function public.report_unknown_word(p_shimaore text, p_example text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.awa_word_requests (shimaore, example)
  values (p_shimaore, left(p_example, 300))
  on conflict (lower(shimaore)) do update
    set occurrences = public.awa_word_requests.occurrences + 1,
        example = excluded.example,
        last_seen_at = now();
$$;

revoke execute on function public.report_unknown_word(text, text) from public, anon, authenticated;
