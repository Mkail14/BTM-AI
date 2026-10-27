-- BTM AI — la personnalité « gentille » est remplacée par « professionnelle ».
-- Les utilisateurs qui avaient choisi « gentille » passent à « professionnelle » ;
-- l'éventuel réglage admin de « gentille » ne correspond plus et est effacé.

alter table public.profiles drop constraint if exists profiles_personality_check;
update public.profiles set personality = 'professionnelle' where personality = 'gentille';
alter table public.profiles
  add constraint profiles_personality_check
  check (personality is null or personality in ('mechante', 'professionnelle', 'cool'));

alter table public.awa_personalities drop constraint if exists awa_personalities_id_check;
update public.awa_personalities set id = 'professionnelle', behavior = null where id = 'gentille';
insert into public.awa_personalities (id) values ('professionnelle') on conflict (id) do nothing;
alter table public.awa_personalities
  add constraint awa_personalities_id_check
  check (id in ('mechante', 'professionnelle', 'cool'));
