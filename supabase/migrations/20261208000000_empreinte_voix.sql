-- BTM AI — Empreinte de voix du titulaire du compte
-- Sert à la double vérification du paiement à la voix : le code à 4 chiffres
-- ET la voix de la personne. Seule l'empreinte est gardée (256 nombres calculés
-- sur le téléphone), jamais l'enregistrement. Donnée biométrique : enregistrée
-- seulement avec l'accord de la personne (consent_at), supprimable à tout moment,
-- effacée avec le compte.
-- Lecture et écriture par le serveur seulement (clé secrète) : aucune règle RLS
-- ouverte aux comptes, l'empreinte n'est jamais renvoyée au navigateur.

create table public.voice_prints (
  user_id uuid primary key references auth.users (id) on delete cascade,
  print real[] not null check (cardinality(print) = 256),
  model text not null check (char_length(model) between 1 and 60),
  consent_at timestamptz not null,
  -- Voix refusées d'affilée : au-delà de 5, paiement à la voix bloqué 15 minutes.
  failed_checks integer not null default 0 check (failed_checks >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

alter table public.voice_prints enable row level security;
