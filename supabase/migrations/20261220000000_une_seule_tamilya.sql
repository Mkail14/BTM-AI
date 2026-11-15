-- BTM AI — Une seule Tamilya : plus de personnalités Méchante et À l'aise.
-- 1. Le lexique garde une seule phrase en shimaoré par expression (colonne shimaore,
--    qui était déjà la version professionnelle) : les autres versions sont supprimées.
-- 2. Les comptes qui avaient choisi une autre personnalité passent à la seule qui reste.
-- À appliquer APRÈS la mise en ligne du code (il ne lit plus la colonne variants).

alter table public.awa_lexicon drop column if exists variants;

alter table public.profiles drop constraint if exists profiles_personality_check;
update public.profiles set personality = 'professionnelle' where personality in ('mechante', 'cool');
alter table public.profiles
  add constraint profiles_personality_check
  check (personality is null or personality = 'professionnelle');

delete from public.awa_personalities where id in ('mechante', 'cool');
