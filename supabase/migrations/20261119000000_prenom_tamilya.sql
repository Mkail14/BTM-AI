-- BTM AI — l'assistante change de prénom : Awa devient Tamilya.
-- Le prénom est fixé dans le code (awa-identity.ts) ; ici, les textes saisis
-- depuis l'administration sont mis à jour pour parler de Tamilya
-- (« d'Awa » → « de Tamilya », « qu'Awa » → « que Tamilya »).
-- Les conversations et souvenirs des utilisateurs ne sont pas touchés.

create or replace function pg_temp.tamilya(t text) returns text
language sql immutable as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(t, '([dD])[''’]Awa\M', '\1e Tamilya', 'g'),
      '([qQ])u[''’]Awa\M', '\1ue Tamilya', 'g'),
    '\mAwa\M', 'Tamilya', 'g')
$$;

alter table public.awa_settings alter column name set default 'Tamilya';

update public.awa_settings
set name = 'Tamilya'
where name = 'Awa';

update public.awa_settings
set identity = pg_temp.tamilya(identity),
    rules = pg_temp.tamilya(rules)
where identity ~ '\mAwa\M' or rules ~ '\mAwa\M';

update public.awa_personalities
set behavior = pg_temp.tamilya(behavior::text)::jsonb
where behavior::text ~ '\mAwa\M';

update public.awa_knowledge
set title = pg_temp.tamilya(title),
    content = pg_temp.tamilya(content)
where title ~ '\mAwa\M' or content ~ '\mAwa\M';

update public.awa_branches
set reason = pg_temp.tamilya(reason)
where reason ~ '\mAwa\M';
