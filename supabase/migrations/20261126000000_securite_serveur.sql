-- BTM AI — Sécurité côté serveur (corrections de l'audit).
-- Le site marche aussi sans cette migration : le code retombe sur l'ancien
-- comportement si une fonction est absente (erreur PGRST202).

-- 1. Recharge du portefeuille : plafond de 150 € contrôlé sous verrou.
-- Deux recharges lancées en même temps ne peuvent plus dépasser le plafond :
-- le solde et les recharges en cours (moins de 30 minutes) sont relus sous un
-- verrou propre au compte, puis la recharge « en attente » est créée.
-- Renvoie l'id de l'opération, ou null si le plafond serait dépassé.
create or replace function public.wallet_reserve_topup(p_user_id uuid, p_amount_cents integer, p_label text, p_max_balance_cents integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  engaged integer;
  tx_id uuid;
begin
  if p_amount_cents <= 0 or p_max_balance_cents <= 0 then
    raise exception 'Montant invalide';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('wallet-topup:' || p_user_id::text, 0));
  select coalesce((select balance_cents from public.wallets where user_id = p_user_id), 0)
    + coalesce((select sum(amount_cents) from public.wallet_transactions
                where user_id = p_user_id and kind = 'topup' and status = 'pending'
                  and created_at >= now() - interval '30 minutes'), 0)
  into engaged;
  if engaged + p_amount_cents > p_max_balance_cents then
    return null;
  end if;
  insert into public.wallet_transactions (user_id, kind, amount_cents, status, label)
  values (p_user_id, 'topup', p_amount_cents, 'pending', left(p_label, 120))
  returning id into tx_id;
  return tx_id;
end;
$$;

revoke all on function public.wallet_reserve_topup(uuid, integer, text, integer) from public, anon, authenticated;
grant execute on function public.wallet_reserve_topup(uuid, integer, text, integer) to service_role;

-- 2. Retrait d'un administrateur délégué : ses sessions sont fermées tout de
-- suite (ses jetons de rafraîchissement disparaissent avec elles). Son jeton
-- en cours est en plus refusé par le serveur, qui relit le rôle à jour.
create or replace function public.close_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed integer;
begin
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics closed = row_count;
  return closed;
end;
$$;

revoke all on function public.close_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.close_user_sessions(uuid) to service_role;
