-- BTM AI — Phrase donnée par le maître le 2026-11-16 (« comment on dit j'aime pas aller à la plage »),
-- que le relevé des mots avait manquée.

insert into public.awa_words (french, shimaore, is_active)
select v.french, v.shimaore, true
from (values
  ('je n''aime pas aller à la plage', 'tsi vedzé ou hedrah la plagi')
) as v (french, shimaore)
where not exists (
  select 1 from public.awa_words w
  where lower(w.french) = lower(v.french) and lower(w.shimaore) = lower(v.shimaore)
);
