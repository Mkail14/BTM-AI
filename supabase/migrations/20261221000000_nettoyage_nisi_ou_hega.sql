-- BTM AI — Conversation du 2026-11-16 : Tamilya a inventé « nisi ou hega » pour « je n'aime pas les hommes »,
-- et le relevé des mots a gardé son invention au lieu de la correction du maître.
-- 1. Les traductions inventées et les sens absurdes (« Non, c'est ça ») sont retirés du dictionnaire.
-- 2. Les deux phrases données par le maître sont ajoutées avec leur vrai sens.
-- 3. Les « souvenirs » tirés des phrases à traduire (« n'aime pas les gommes ») sont effacés.

delete from public.awa_words
where lower(shimaore) like 'nisi ou hega%'
   or lower(french) like 'littéralement%'
   or lower(french) like 'non, c''est ça%';

delete from public.awa_lexicon
where lower(shimaore) like 'nisi ou hega%'
   or lower(shimaore) like 'nisi vedzé watchu gommes%'
   or lower(french) like 'littéralement%'
   or lower(french) like 'non, c''est ça%';

insert into public.awa_words (french, shimaore, is_active)
select v.french, v.shimaore, true
from (values
  ('je n''aime pas les hommes', 'tsi vedzé watchu baba'),
  ('je n''aime pas les gommes', 'tsi vedzé gommu')
) as v (french, shimaore)
where not exists (
  select 1 from public.awa_words w
  where lower(w.french) = lower(v.french) and lower(w.shimaore) = lower(v.shimaore)
);

delete from public.awa_memories
where content ilike '%aime pas les gommes%'
   or content ilike '%aime pas les hommes%'
   or content ilike '%gent% masculin%';
