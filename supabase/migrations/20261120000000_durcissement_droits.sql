-- BTM AI — Durcissement des droits (audit du 3 novembre 2026, failles S1 partielle, S2, S13)
-- Compatible avec le code déjà en ligne : rien de ce que fait le site n'est retiré.
-- La suite (S1 complète) est dans 20261120020000_ecritures_par_le_serveur.sql,
-- à appliquer seulement quand le code qui écrit par le serveur est en production.

-- S2 : droits inutiles. TRUNCATE ignore RLS (vider une table entière), TRIGGER et
-- REFERENCES ne servent à aucun compte. Ni les visiteurs ni les comptes ne les gardent.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from anon, authenticated;

-- S13 : fonctions de déclencheur appelables par l'API (/rest/v1/rpc/…). Un déclencheur
-- n'a pas besoin de ce droit pour s'exécuter : on le retire à tout le monde.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.saved_addresses_limit() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.touch_conversation() from public, anon, authenticated;

-- Droits des visiteurs restés sur trois tables (RLS les bloquait déjà, on ferme aussi la porte).
revoke all on public.ai_usage from anon;
revoke all on public.awa_words from anon;
revoke all on public.awa_word_requests from anon;

-- Ancienne table des places du code (vide, plus utilisée) : plus aucune écriture par l'API.
revoke insert, update, delete on public.code_exam_bookings from authenticated;

-- S1 (paiement) : un compte pouvait créer une demande du code déjà « payée »
-- (paid_at, fee_cents, laposte_reference, processed_by…) en écrivant directement
-- dans la table. Seules les colonnes saisies par le candidat restent permises ;
-- le statut reste forcé à « pending » par la politique d'insertion.
revoke insert, update, delete on public.code_exam_requests from authenticated;
grant insert (user_id, center_id, center_name, starts_at, exam_type, civility, last_name, first_name, birth_date, city, phone, email, neph, snu)
  on public.code_exam_requests to authenticated;

-- Un message appartient toujours au compte de sa conversation, quel que soit
-- celui qui écrit (y compris le serveur avec la clé secrète) : une erreur de
-- code ne peut pas glisser un message dans la conversation d'un autre.
create or replace function public.messages_owner_matches() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.conversations c where c.id = new.conversation_id and c.user_id = new.user_id
  ) then
    raise exception 'Le message n''appartient pas au compte de la conversation.' using errcode = '42501';
  end if;
  return new;
end $$;

revoke execute on function public.messages_owner_matches() from public, anon, authenticated;

create trigger messages_owner_matches
  before insert on public.messages
  for each row execute function public.messages_owner_matches();
