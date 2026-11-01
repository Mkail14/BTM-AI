-- BTM AI — API retirées depuis /admin/circuit
-- Les API déclarées dans les variables du serveur (« env-1 », « env-2 »…) ne
-- peuvent pas être effacées de la base : on note seulement qu'elles sont
-- retirées de la chaîne. Vide : toutes les API du serveur sont utilisées.

alter table public.awa_settings
  add column removed_apis jsonb not null default '[]'::jsonb
    check (jsonb_typeof(removed_apis) = 'array');
