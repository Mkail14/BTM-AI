-- BTM AI — personnalités d'Awa décrites par champs (attitude, façon de parler,
-- toujours, jamais, exemples) au lieu d'un bloc de texte libre.
-- behavior null : valeurs par défaut du code. L'ancienne colonne instructions
-- n'a jamais été renseignée ; elle est retirée.

alter table public.awa_personalities
  add column if not exists behavior jsonb
  check (behavior is null or (jsonb_typeof(behavior) = 'object' and octet_length(behavior::text) <= 16000));

alter table public.awa_personalities drop column if exists instructions;
