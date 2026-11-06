-- BTM AI — Autorisation du paiement à la voix, donnée une seule fois
-- La personne accepte l'avertissement une fois : il n'est plus réaffiché.
-- Le code à 4 chiffres reste demandé à chaque paiement.
-- Supprimer le code efface aussi l'autorisation (même ligne).

alter table public.wallet_pins add column voice_pay_consent_at timestamptz;
