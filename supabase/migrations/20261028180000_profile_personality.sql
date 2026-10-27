-- Personnalité d'Awa choisie par l'utilisateur (null tant qu'il n'a pas choisi).
-- Modifiable par l'utilisateur via la politique profiles_update_own existante.
alter table public.profiles
  add column if not exists personality text
  check (personality is null or personality in ('mechante', 'gentille', 'cool'));
