-- BTM AI — Fonctionnalités allumées ou éteintes pour tous les utilisateurs (rubrique
-- Fonctionnalités de l'administration). Les administrateurs les ont toujours.
-- Une clé par fonctionnalité ({"documents": true, "livres": false}) ; une clé absente
-- prend la valeur par défaut du code (src/lib/site/features-rules.ts).
-- Dans site_settings : lu et écrit seulement par le serveur (clé secrète), aucune politique.

alter table public.site_settings
  add column if not exists features jsonb not null default '{}'::jsonb
    check (jsonb_typeof(features) = 'object');
