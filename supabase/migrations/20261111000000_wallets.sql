-- BTM AI — Portefeuille : l'utilisateur recharge un solde (5 € à 150 €, plafonné à 150 €)
-- qui sert à payer les services partenaires (réservations…). Sa carte n'est jamais
-- enregistrée chez nous : le paiement passe par Stripe Checkout.
-- Lecture : chacun voit son solde et son historique. Écriture : uniquement le
-- serveur (clé secrète), par les fonctions ci-dessous, après vérification chez Stripe.

create table public.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance_cents integer not null default 0 check (balance_cents >= 0),
  updated_at timestamptz not null default now()
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- topup : recharge ; payment : achat chez un partenaire ; refund : remboursement sur le solde.
  kind text not null check (kind in ('topup', 'payment', 'refund')),
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  label text not null check (char_length(label) between 1 and 120),
  -- Moyen de paiement lisible (« Visa •••• 4242 », « Apple Pay »…), connu une fois payé.
  method text check (char_length(method) <= 60),
  stripe_session_id text unique,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index wallet_transactions_user_idx on public.wallet_transactions (user_id, created_at desc);

alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;

create policy "wallets_select_own" on public.wallets
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "wallet_transactions_select_own" on public.wallet_transactions
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "wallets_admin_read" on public.wallets
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "wallet_transactions_admin_read" on public.wallet_transactions
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

revoke all on public.wallets, public.wallet_transactions from anon;
revoke insert, update, delete on public.wallets, public.wallet_transactions from authenticated;

-- Recharge payée : crédite le solde une seule fois, même si Stripe prévient deux fois
-- (retour sur le site + webhook). Renvoie vrai si le solde vient d'être crédité.
create function public.wallet_complete_topup(p_session_id text, p_method text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  tx public.wallet_transactions;
begin
  select * into tx from public.wallet_transactions
  where stripe_session_id = p_session_id and kind = 'topup'
  for update;
  if not found or tx.status = 'succeeded' then
    return false;
  end if;

  update public.wallet_transactions
  set status = 'succeeded', method = left(p_method, 60), completed_at = now()
  where id = tx.id;

  insert into public.wallets (user_id, balance_cents) values (tx.user_id, tx.amount_cents)
  on conflict (user_id) do update
  set balance_cents = public.wallets.balance_cents + excluded.balance_cents, updated_at = now();
  return true;
end;
$$;

-- Recharge abandonnée ou refusée.
create function public.wallet_fail_topup(p_session_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.wallet_transactions
  set status = 'failed', completed_at = now()
  where stripe_session_id = p_session_id and kind = 'topup' and status = 'pending';
$$;

-- Paiement d'un service partenaire avec le solde. Renvoie l'id de l'opération,
-- ou null si le solde ne suffit pas (rien n'est débité).
create function public.wallet_spend(p_user_id uuid, p_amount_cents integer, p_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tx_id uuid;
begin
  if p_amount_cents <= 0 then
    raise exception 'Montant invalide';
  end if;
  update public.wallets
  set balance_cents = balance_cents - p_amount_cents, updated_at = now()
  where user_id = p_user_id and balance_cents >= p_amount_cents;
  if not found then
    return null;
  end if;
  insert into public.wallet_transactions (user_id, kind, amount_cents, status, label, method, completed_at)
  values (p_user_id, 'payment', p_amount_cents, 'succeeded', left(p_label, 120), 'Portefeuille', now())
  returning id into tx_id;
  return tx_id;
end;
$$;

-- Remboursement d'un service partenaire annulé : recrédite le solde.
create function public.wallet_refund(p_user_id uuid, p_amount_cents integer, p_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tx_id uuid;
begin
  if p_amount_cents <= 0 then
    raise exception 'Montant invalide';
  end if;
  insert into public.wallets (user_id, balance_cents) values (p_user_id, p_amount_cents)
  on conflict (user_id) do update
  set balance_cents = public.wallets.balance_cents + excluded.balance_cents, updated_at = now();
  insert into public.wallet_transactions (user_id, kind, amount_cents, status, label, method, completed_at)
  values (p_user_id, 'refund', p_amount_cents, 'succeeded', left(p_label, 120), 'Portefeuille', now())
  returning id into tx_id;
  return tx_id;
end;
$$;

revoke all on function public.wallet_complete_topup(text, text) from public, anon, authenticated;
revoke all on function public.wallet_fail_topup(text) from public, anon, authenticated;
revoke all on function public.wallet_spend(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.wallet_refund(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.wallet_complete_topup(text, text) to service_role;
grant execute on function public.wallet_fail_topup(text) to service_role;
grant execute on function public.wallet_spend(uuid, integer, text) to service_role;
grant execute on function public.wallet_refund(uuid, integer, text) to service_role;
