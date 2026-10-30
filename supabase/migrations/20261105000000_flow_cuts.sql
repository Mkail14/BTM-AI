-- BTM AI — Liens coupés sur le schéma de /admin/modele-ia
-- Liste des blocs débranchés : « personality », « settings », « knowledge »,
-- « lexicon », « memory », ou l'identifiant d'une API (« env-2 », « db-<uuid> »).
-- Vide : tout est branché.

alter table public.awa_settings
  add column flow_cuts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(flow_cuts) = 'array');
