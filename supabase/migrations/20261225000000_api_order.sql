-- BTM AI — Ordre des API choisi depuis /admin/circuit
-- Liste des identifiants d'API (« env-1 », « db-<uuid> »…), de la principale
-- au dernier secours : on la change en glissant un bloc d'API plus haut ou plus
-- bas dans le schéma. Les API absentes de la liste (ajoutées depuis) passent
-- après, dans leur ordre habituel. Vide : ordre habituel (serveur, puis admin).

alter table public.awa_settings
  add column if not exists api_order jsonb not null default '[]'::jsonb
    check (jsonb_typeof(api_order) = 'array');
