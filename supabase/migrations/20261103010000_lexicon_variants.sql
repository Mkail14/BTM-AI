-- BTM AI — Une expression du lexique, trois façons de la dire
-- { "professionnelle": "…", "mechante": "…", "cool": "…" } : Awa utilise la
-- version de la personnalité choisie, sinon la colonne shimaore.

alter table public.awa_lexicon
  add column variants jsonb not null default '{}'::jsonb check (jsonb_typeof(variants) = 'object');
