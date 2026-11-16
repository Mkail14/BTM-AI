-- BTM AI — Conversation du 2026-11-16 (« comment on dit j'aime pas aller à la plage ») : le relevé des mots a gardé
-- « je te déteste → mutsanga », et comme il remplaçait tous les autres sens du même shimaoré,
-- « plage = mutsanga » et « sable = mutsanga » ont été mis en pause.
-- 1. Le faux sens est retiré, et « nisi ou hega » une nouvelle fois s'il est revenu.
-- 2. Les vrais sens de mutsanga sont réactivés.

delete from public.awa_words
where (lower(shimaore) = 'mutsanga' and lower(french) like 'je te d%')
   or lower(shimaore) like 'nisi ou hega%';

delete from public.awa_lexicon
where (lower(shimaore) like '%mutsanga%' and lower(french) like 'je te d%')
   or lower(shimaore) like 'nisi ou hega%';

update public.awa_words
set is_active = true
where lower(shimaore) = 'mutsanga'
  and lower(french) in ('plage', 'sable');
