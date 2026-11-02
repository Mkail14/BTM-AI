-- BTM AI — Suivi du traitement des demandes de réservation du code
-- À APPLIQUER AVEC LE PARTENARIAT LA POSTE (voir src/lib/code-exam/partner.ts).
-- La page /admin/code fonctionne déjà sans ces colonnes (traitement à la main).

alter table public.code_exam_requests
  -- Référence de la place chez La Poste (renvoyée par leur API).
  add column laposte_reference text check (char_length(laposte_reference) <= 80),
  -- Débit du portefeuille (prix de l'examen) : opération et date.
  add column fee_cents integer check (fee_cents >= 0),
  add column wallet_transaction_id uuid references public.wallet_transactions (id) on delete set null,
  add column paid_at timestamptz,
  -- Convocation La Poste envoyée au candidat.
  add column convocation_sent_at timestamptz,
  -- Qui a traité la demande, et quand.
  add column processed_by uuid references auth.users (id) on delete set null,
  add column processed_at timestamptz;
