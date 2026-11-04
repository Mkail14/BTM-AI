-- BTM AI — Tests des droits d'accès sur la base locale (données fictives de 10_donnees_fictives.sql).
-- Chaque test se joue dans une transaction annulée : la base n'est pas modifiée.
-- On entre dans un rôle comme le fait PostgREST : SET ROLE + revendications du jeton.
--
-- Résultat de chaque test (affiché en NOTICE, compté par scripts/db/tests-securite.ts) :
--   OK              le comportement attendu est en place
--   ÉCHEC           régression : à corriger avant tout déploiement
--   FAILLE CONNUE   faille relevée par l'audit, pas encore corrigée (référence S1, S2…)
--
-- Ce que ces tests NE prouvent PAS : Supabase Auth (signature des jetons, connexion,
-- inscription), PostgREST (l'API elle-même) et Realtime. Voir supabase/local/README.md.

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

-- Résultat d'une vérification. faille : référence de l'audit si le test documente une faille ouverte.
create or replace function tests.check(name text, ok boolean, faille text default null) returns void
language plpgsql as $$
begin
  if ok then
    raise notice 'OK | %', name;
  elsif faille is not null then
    raise notice 'FAILLE CONNUE (%) | %', faille, name;
  else
    raise notice 'ÉCHEC | %', name;
  end if;
end $$;

-- L'instruction doit être refusée (droit absent, RLS, contrainte) ou ne toucher aucune ligne.
create or replace function tests.denied(name text, statement text, faille text default null) returns void
language plpgsql as $$
declare
  touched integer;
begin
  execute statement;
  get diagnostics touched = row_count;
  perform tests.check(name || ' (refusé ou sans effet)', touched = 0, faille);
exception
  when insufficient_privilege or check_violation or not_null_violation or raise_exception or foreign_key_violation or unique_violation then
    perform tests.check(name || ' (refusé ou sans effet)', true);
end $$;

-- Lecture : nombre de lignes visibles, ou -1 si la lecture est refusée.
create or replace function tests.visible(statement text) returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  execute 'select count(*) from (' || statement || ') t' into n;
  return n;
exception
  when insufficient_privilege then return -1;
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- Comptes fictifs.
create or replace function tests.alice() returns uuid language sql immutable as $$ select '00000000-0000-4000-8000-00000000000a'::uuid $$;
create or replace function tests.bruno() returns uuid language sql immutable as $$ select '00000000-0000-4000-8000-00000000000b'::uuid $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ===========================================================================
-- 1. Visiteur sans compte (anon)
-- ===========================================================================
begin;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select tests.check('Visiteur : ne lit pas les profils', tests.visible('select * from public.profiles') <= 0);
select tests.check('Visiteur : ne lit pas les conversations', tests.visible('select * from public.conversations') <= 0);
select tests.check('Visiteur : ne lit pas les messages', tests.visible('select * from public.messages') <= 0);
select tests.check('Visiteur : ne lit pas la mémoire de Tamilya', tests.visible('select * from public.awa_memories') <= 0);
select tests.check('Visiteur : ne lit pas les portefeuilles', tests.visible('select * from public.wallets') <= 0);
select tests.check('Visiteur : ne lit pas les opérations', tests.visible('select * from public.wallet_transactions') <= 0);
select tests.check('Visiteur : ne lit pas les demandes du code', tests.visible('select * from public.code_exam_requests') <= 0);
select tests.check('Visiteur : ne lit pas les clés d''API', tests.visible('select * from public.ai_providers') <= 0);
select tests.check('Visiteur : ne lit pas les réglages du site (IBAN)', tests.visible('select * from public.site_settings') <= 0);
select tests.denied('Visiteur : crée un message', $$insert into public.messages (conversation_id, user_id, role, content) values ('10000000-0000-4000-8000-00000000000a', tests.alice(), 'user', 'x')$$);
select tests.denied('Visiteur : débite un portefeuille', $$select public.wallet_spend(tests.alice(), 100, 'x')$$);
select tests.denied('Visiteur : consomme un quota', $$select public.consume_rate_limit('x', 1, 60)$$);
rollback;

select tests.check('Visiteur : ne peut pas appeler handle_new_user', not has_function_privilege('anon', 'public.handle_new_user()', 'execute'), 'S13');
select tests.check('Visiteur : ne peut pas appeler saved_addresses_limit', not has_function_privilege('anon', 'public.saved_addresses_limit()', 'execute'), 'S13');
select tests.check('Visiteur : ne réserve pas de recharge', not has_function_privilege('anon', 'public.wallet_reserve_topup(uuid, integer, text, integer)', 'execute'));
select tests.check('Compte connecté : ne réserve pas de recharge', not has_function_privilege('authenticated', 'public.wallet_reserve_topup(uuid, integer, text, integer)', 'execute'));
select tests.check('Visiteur : ne ferme pas les sessions d''un compte', not has_function_privilege('anon', 'public.close_user_sessions(uuid)', 'execute'));
select tests.check('Compte connecté : ne ferme pas les sessions d''un autre', not has_function_privilege('authenticated', 'public.close_user_sessions(uuid)', 'execute'));

-- ===========================================================================
-- 2. Alice (compte connecté) face aux données de Bruno
-- ===========================================================================
begin;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select tests.check('Alice : voit ses propres messages', tests.visible('select * from public.messages') = 2);
select tests.check('Alice : ne voit pas les messages de Bruno', tests.visible($$select * from public.messages where user_id = tests.bruno()$$) = 0);
select tests.check('Alice : ne voit pas la conversation de Bruno', tests.visible($$select * from public.conversations where user_id = tests.bruno()$$) = 0);
select tests.check('Alice : ne voit pas la mémoire de Bruno', tests.visible($$select * from public.awa_memories where user_id = tests.bruno()$$) = 0);
select tests.check('Alice : ne voit pas le profil de Bruno', tests.visible($$select * from public.profiles where id = tests.bruno()$$) = 0);
select tests.check('Alice : ne voit pas la demande du code de Bruno', tests.visible($$select * from public.code_exam_requests where user_id = tests.bruno()$$) = 0);
select tests.check('Alice : voit son solde (20 €)', (select balance_cents from public.wallets) = 2000);
select tests.denied('Alice : modifie le profil de Bruno', $$update public.profiles set display_name = 'piraté' where id = tests.bruno()$$);
select tests.denied('Alice : écrit dans la conversation de Bruno', $$insert into public.messages (conversation_id, user_id, role, content) values ('10000000-0000-4000-8000-00000000000b', tests.alice(), 'user', 'x')$$);
select tests.denied('Alice : se met un message au nom de Bruno', $$insert into public.messages (conversation_id, user_id, role, content) values ('10000000-0000-4000-8000-00000000000b', tests.bruno(), 'user', 'x')$$);
select tests.denied('Alice : efface la mémoire de Bruno', $$delete from public.awa_memories where user_id = tests.bruno()$$);
select tests.denied('Alice : supprime la conversation de Bruno', $$delete from public.conversations where user_id = tests.bruno()$$);
rollback;

-- ===========================================================================
-- 3. Alice face à l'argent et aux réglages
-- ===========================================================================
begin;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select tests.denied('Alice : augmente son solde', $$update public.wallets set balance_cents = 999999$$);
select tests.denied('Alice : crée une recharge', $$insert into public.wallet_transactions (user_id, kind, amount_cents, status, label) values (tests.alice(), 'topup', 5000, 'succeeded', 'x')$$);
select tests.denied('Alice : passe une opération en réussie', $$update public.wallet_transactions set status = 'succeeded'$$);
select tests.denied('Alice : appelle wallet_refund', $$select public.wallet_refund(tests.alice(), 5000, 'x')$$);
select tests.denied('Alice : appelle wallet_complete_topup', $$select public.wallet_complete_topup('cs_test_fictif_alice', 'x')$$);
select tests.denied('Alice : appelle admin_platform_stats', $$select public.admin_platform_stats(10, 10)$$);
select tests.check('Alice : ne lit pas les clés d''API', tests.visible('select * from public.ai_providers') <= 0);
select tests.check('Alice : ne lit pas les secrets des sites partenaires', tests.visible('select * from public.awa_partner_keys') <= 0);
select tests.check('Alice : ne lit pas les appareils connus', tests.visible('select * from public.known_devices') <= 0);
select tests.check('Alice : ne lit pas les réglages du site (IBAN)', tests.visible('select * from public.site_settings') <= 0);
select tests.check('Alice : ne lit pas le journal de la maintenance', tests.visible('select * from public.site_status_log') <= 0);
select tests.denied('Alice : met le site en maintenance', $$select public.set_site_status(true, 'piraté', tests.alice(), 'a@exemple.test')$$);
select tests.denied('Alice : écrit dans le journal de la maintenance', $$insert into public.site_status_log (maintenance) values (false)$$);
select tests.check('Alice : ne lit pas les réglages de Tamilya', tests.visible('select * from public.awa_settings') <= 0);
select tests.denied('Alice : modifie le caractère de Tamilya', $$update public.awa_settings set identity = 'x'$$);
select tests.denied('Alice : ajoute un mot au dictionnaire', $$insert into public.awa_words (french, shimaore) values ('x', 'y')$$);
select tests.denied('Alice : ajoute une connaissance', $$insert into public.awa_knowledge (title, content) values ('x', 'y')$$);
select tests.check('Alice : ne lit pas la grammaire de Tamilya', tests.visible('select * from public.awa_grammar') <= 0);
select tests.denied('Alice : ajoute une règle de grammaire', $$insert into public.awa_grammar (title, rule) values ('x', 'y')$$);
select tests.denied('Alice : masque une remarque du nettoyage', $$insert into public.awa_cleanup_ignored (ref, kind) values ('words:x', 'copie')$$);
rollback;

-- ===========================================================================
-- 4. Contournement des validations du serveur (failles S1 de l'audit)
-- ===========================================================================
begin;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select tests.denied('Alice : crée une demande du code sans passer par le serveur',
  $$insert into public.code_exam_requests (center_id, center_name, starts_at, exam_type, civility, last_name, first_name, birth_date, city, phone, email, neph)
    values ('X', 'Faux bureau', now(), 'B', 'Mme', 'A', 'A', '2000-01-01', 'Sada', '0639000000', 'a@exemple.test', '000000000000')$$, 'S1');
select tests.denied('Alice : écrit un faux message de Tamilya dans sa conversation',
  $$insert into public.messages (conversation_id, user_id, role, content) values ('10000000-0000-4000-8000-00000000000a', tests.alice(), 'assistant', 'faux')$$, 'S1');
select tests.denied('Alice : écrit un souvenir sans passer par le serveur',
  $$insert into public.awa_memories (user_id, kind, content) values (tests.alice(), 'travail', 'faux souvenir')$$, 'S1');
select tests.denied('Alice : crée une conversation sans passer par le serveur',
  $$insert into public.conversations (user_id, title) values (tests.alice(), 'x')$$, 'S1');
select tests.denied('Alice : crée une demande du code déjà payée',
  $$insert into public.code_exam_requests (center_id, center_name, starts_at, exam_type, civility, last_name, first_name, birth_date, city, phone, email, neph, paid_at, fee_cents)
    values ('X', 'Faux bureau', now(), 'B', 'Mme', 'A', 'A', '2000-01-01', 'Sada', '0639000000', 'a@exemple.test', '000000000000', now(), 0)$$);
select tests.denied('Alice : vide la table des messages (TRUNCATE)', $$truncate public.messages$$);
rollback;

-- Le serveur lui-même (clé secrète) ne peut pas glisser un message dans la conversation d'un autre.
begin;
set local role service_role;
select tests.denied('Serveur : message de Bruno dans la conversation d''Alice',
  $$insert into public.messages (conversation_id, user_id, role, content) values ('10000000-0000-4000-8000-00000000000a', tests.bruno(), 'assistant', 'x')$$);
rollback;

-- ===========================================================================
-- 5. Droits inutiles (faille S2) : vérifiés sur le catalogue
-- ===========================================================================
select tests.check('Comptes connectés : pas de TRUNCATE sur ' || t,
  not has_table_privilege('authenticated', 'public.' || t, 'TRUNCATE'), 'S2')
from unnest(array['wallets', 'wallet_transactions', 'messages', 'conversations', 'profiles', 'awa_memories', 'code_exam_requests']) t;
select tests.check('Comptes connectés : pas de TRIGGER sur ' || t,
  not has_table_privilege('authenticated', 'public.' || t, 'TRIGGER'), 'S2')
from unnest(array['wallets', 'wallet_transactions', 'messages']) t;

-- ===========================================================================
-- 6. Administrateur (rôle admin dans le jeton)
-- ===========================================================================
begin;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000ad", "role": "authenticated", "app_metadata": {"role": "admin"}}', true);
set local role authenticated;
select tests.check('Admin : lit les portefeuilles (supervision)', tests.visible('select * from public.wallets') = 1);
select tests.check('Admin : lit les demandes du code', tests.visible('select * from public.code_exam_requests') = 1);
select tests.check('Admin : ne lit pas les conversations des autres', tests.visible($$select * from public.messages where user_id <> '00000000-0000-4000-8000-0000000000ad'$$) = 0);
select tests.check('Admin : ne lit pas la mémoire des autres par l''API', tests.visible($$select * from public.awa_memories$$) = 0);
select tests.check('Admin : ne lit pas les clés d''API par l''API', tests.visible('select * from public.ai_providers') <= 0);
select tests.denied('Admin : modifie un solde', $$update public.wallets set balance_cents = 0$$);
select tests.denied('Admin : change l''état du site par l''API (seul le serveur le peut)', $$select public.set_site_status(true, 'x', '00000000-0000-4000-8000-0000000000ad', 'admin@exemple.test')$$);
rollback;

-- Serveur : la mise en maintenance et son inscription au journal vont ensemble.
begin;
set local role service_role;
select public.set_site_status(true, 'Retour à 14 h', '00000000-0000-4000-8000-0000000000ad', 'admin@exemple.test');
select tests.check('Serveur : maintenance enregistrée', (select maintenance from public.site_settings where id = 1));
select tests.check('Serveur : changement inscrit au journal (auteur, état, message)',
  exists (select 1 from public.site_status_log where maintenance and message = 'Retour à 14 h' and changed_by_email = 'admin@exemple.test'));
select public.set_site_status(false, null, '00000000-0000-4000-8000-0000000000ad', 'admin@exemple.test');
select tests.check('Serveur : réouverture, message gardé', (select not maintenance and maintenance_message = 'Retour à 14 h' from public.site_settings where id = 1));
rollback;

-- ===========================================================================
-- 7. Faux administrateur : un jeton sans le rôle admin
-- ===========================================================================
begin;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000b", "role": "authenticated", "user_metadata": {"role": "admin"}}', true);
set local role authenticated;
select tests.check('Bruno avec « admin » dans user_metadata : pas de droits admin', tests.visible('select * from public.wallets') = 0);
select tests.denied('Bruno avec « admin » dans user_metadata : modifie Tamilya', $$update public.awa_settings set identity = 'x'$$);
rollback;

-- ===========================================================================
-- 8. Avis sur l'application : écrits et lus par le serveur seulement
-- ===========================================================================
insert into public.app_reviews (user_id, display_name, rating, comment)
values (tests.bruno(), 'Bruno T.', 5, 'Avis fictif de test');

begin;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select tests.check('Visiteur : ne lit pas les avis directement', tests.visible('select * from public.app_reviews') <= 0);
select tests.denied('Visiteur : publie un avis', $$insert into public.app_reviews (user_id, display_name, rating) values (tests.alice(), 'x', 5)$$);
rollback;

begin;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select tests.denied('Alice : publie un avis sans passer par le serveur', $$insert into public.app_reviews (user_id, display_name, rating) values (tests.alice(), 'x', 5)$$);
select tests.denied('Alice : modifie l''avis de Bruno', $$update public.app_reviews set rating = 1$$);
select tests.denied('Alice : supprime l''avis de Bruno', $$delete from public.app_reviews$$);
select tests.check('Comptes connectés : pas de TRUNCATE sur app_reviews', not has_table_privilege('authenticated', 'public.app_reviews', 'TRUNCATE'));
rollback;

begin;
select tests.denied('Note hors de 1 à 5 refusée', $$insert into public.app_reviews (user_id, display_name, rating) values (tests.alice(), 'Alice T.', 6)$$);
select tests.denied('Deux avis pour un même compte refusés', $$insert into public.app_reviews (user_id, display_name, rating) values (tests.bruno(), 'Bruno T.', 4)$$);
rollback;

-- ===========================================================================
-- 9. Intégrité du portefeuille (fonctions du serveur)
-- ===========================================================================
begin;
select tests.check('Paiement refusé si le solde ne suffit pas', public.wallet_spend(tests.alice(), 999999, 'test') is null);
select tests.check('Solde inchangé après un refus', (select balance_cents from public.wallets where user_id = tests.alice()) = 2000);
select tests.check('Recharge non créditée deux fois', not public.wallet_complete_topup('cs_test_fictif_alice', 'x'));
select tests.check('Solde jamais négatif (contrainte)', (select count(*) from pg_constraint where conname = 'wallets_balance_cents_check') = 1);
select tests.check('Recharge refusée au-delà du plafond de 150 €', public.wallet_reserve_topup(tests.alice(), 14000, 'test', 15000) is null);
select tests.check('Recharge permise sous le plafond', public.wallet_reserve_topup(tests.alice(), 1000, 'test', 15000) is not null);
select tests.check('Deuxième recharge en cours comptée dans le plafond', public.wallet_reserve_topup(tests.alice(), 12500, 'test', 15000) is null);
rollback;
