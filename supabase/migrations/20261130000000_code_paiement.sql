-- BTM AI — Code de paiement à 4 chiffres
-- Obligatoire pour que Tamilya paie à la voix à la place de la personne.
-- Seule une empreinte est gardée (scrypt + sel), jamais le code lui-même.
-- Après 5 codes faux, le paiement à la voix est bloqué 15 minutes.
-- Lecture et écriture par le serveur seulement (clé secrète) : aucune règle RLS
-- ouverte aux comptes.

create table public.wallet_pins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pin_hash text not null check (char_length(pin_hash) between 32 and 200),
  salt text not null check (char_length(salt) between 16 and 100),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.wallet_pins enable row level security;
