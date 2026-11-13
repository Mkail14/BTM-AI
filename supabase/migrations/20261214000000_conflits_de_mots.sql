-- BTM AI — Conflits de mots : un mot français a plusieurs traductions shimaoré
-- dans le dictionnaire (awa_words), souvent parce que deux sources ne sont pas
-- d'accord. Quand Tamilya rencontre un de ces mots en conversation, le serveur
-- (clé secrète) dépose une demande ici ; l'administrateur garde la bonne
-- traduction dans /admin/lexique (liste « À traduire »).
-- Les demandes existantes deviennent des demandes « inconnu » (mot non compris).

alter table public.awa_word_requests
  add column kind text not null default 'inconnu' check (kind in ('inconnu', 'conflit')),
  -- Conflit : le mot français ; shimaore garde les traductions, séparées par « / ».
  add column french text check (french is null or char_length(french) between 1 and 80);

-- shimaore liste toutes les traductions d'un conflit : il lui faut plus de place.
alter table public.awa_word_requests drop constraint if exists awa_word_requests_shimaore_check;
alter table public.awa_word_requests
  add constraint awa_word_requests_shimaore_check check (char_length(shimaore) between 1 and 300);

-- Un mot inconnu n'est demandé qu'une fois ; un conflit, une fois par mot français.
drop index if exists public.awa_word_requests_word_idx;
create unique index awa_word_requests_word_idx on public.awa_word_requests (lower(shimaore)) where kind = 'inconnu';
create unique index awa_word_requests_conflict_idx on public.awa_word_requests (lower(french)) where kind = 'conflit';

-- L'index devenu partiel : on conflict doit le désigner avec sa condition.
create or replace function public.report_unknown_word(p_shimaore text, p_example text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.awa_word_requests (shimaore, example)
  values (p_shimaore, left(p_example, 300))
  on conflict (lower(shimaore)) where kind = 'inconnu' do update
    set occurrences = public.awa_word_requests.occurrences + 1,
        example = excluded.example,
        last_seen_at = now();
$$;

-- Signalement d'un conflit depuis le chat (clé secrète). Les traductions sont
-- remises à jour à chaque fois. Un conflit déjà tranché revient « à traiter »
-- seulement si ses traductions ont changé (nouvel import) : le chat garde son
-- dictionnaire en cache une minute et redemanderait sinon ce qui vient d'être
-- tranché. Un conflit ignoré (« les deux se disent ») le reste.
create function public.report_word_conflict(p_french text, p_shimaore text, p_example text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.awa_word_requests (kind, french, shimaore, example)
  values ('conflit', left(p_french, 80), left(p_shimaore, 300), left(p_example, 300))
  on conflict (lower(french)) where kind = 'conflit' do update
    set occurrences = public.awa_word_requests.occurrences + 1,
        shimaore = excluded.shimaore,
        example = excluded.example,
        last_seen_at = now(),
        status = case
          when public.awa_word_requests.status = 'done' and lower(public.awa_word_requests.shimaore) <> lower(excluded.shimaore) then 'pending'
          else public.awa_word_requests.status
        end;
$$;

revoke execute on function public.report_word_conflict(text, text, text) from public, anon, authenticated;
