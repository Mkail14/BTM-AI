-- BTM AI — appareils connus de chaque compte
-- Sert à prévenir par e-mail d'une connexion depuis un nouvel appareil.
-- device_hash : empreinte SHA-256 de l'identifiant aléatoire gardé dans un
-- cookie du navigateur (jamais l'identifiant lui-même). Lu et écrit seulement
-- par le serveur (clé secrète) : aucune politique pour les utilisateurs.

create table public.known_devices (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_hash text not null check (char_length(device_hash) = 64),
  label text not null default '' check (char_length(label) <= 120),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, device_hash)
);

alter table public.known_devices enable row level security;
revoke all on public.known_devices from anon, authenticated;
