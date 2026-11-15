-- BTM AI — Questions de Tamilya (/admin/apprentissage, onglet « Questions »)
-- Quand Tamilya doute d'une phrase shimaoré qu'elle vient de dire (au chat comme
-- à la voix : même cerveau), elle l'écrit ici. L'administrateur répond :
-- « C'est juste » ou la bonne phrase, qui entre dans le lexique, ou une règle
-- qui entre dans la grammaire. Tamilya s'en sert dès le message suivant.

create table public.awa_questions (
  id uuid primary key default gen_random_uuid(),
  -- Phrase shimaoré dont Tamilya doute, telle qu'elle l'a dite.
  phrase text not null check (char_length(phrase) between 1 and 300),
  -- Ce qu'elle voulait dire, en français.
  french text check (french is null or char_length(french) <= 300),
  -- Sa question, courte (« Est-ce qu'on met le verbe avant le sujet ? »).
  question text not null check (char_length(question) between 1 and 300),
  source text not null default 'chat' check (source in ('chat', 'voix')),
  occurrences integer not null default 1 check (occurrences >= 1),
  status text not null default 'pending' check (status in ('pending', 'answered', 'ignored')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Une même phrase n'est demandée qu'une fois ; ses retours augmentent occurrences.
create unique index awa_questions_phrase_idx on public.awa_questions (lower(phrase));
create index awa_questions_pending_idx on public.awa_questions (status, last_seen_at desc);

alter table public.awa_questions enable row level security;

create policy "awa_questions_admin_all" on public.awa_questions
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

-- Signalement depuis le chat ou la voix (clé secrète) : ajoute la question ou compte un retour de plus.
create function public.report_tamilya_doubt(p_phrase text, p_french text, p_question text, p_source text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.awa_questions (phrase, french, question, source)
  values (left(p_phrase, 300), left(p_french, 300), left(p_question, 300), p_source)
  on conflict (lower(phrase)) do update
    set occurrences = public.awa_questions.occurrences + 1,
        last_seen_at = now();
$$;

revoke execute on function public.report_tamilya_doubt(text, text, text, text) from public, anon, authenticated;
