-- BTM AI — Données 100 % fictives pour la base locale de test (jamais en production).
-- Trois comptes : Alice et Bruno (utilisateurs), Admin (administrateur).
-- Identifiants fixes, réutilisés par les tests de sécurité (20_tests_securite.sql).

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', 'alice@exemple.test', now(), '{}', '{"display_name": "Alice Test", "address_commune": "Mamoudzou", "address_line": "1 rue des Essais"}'),
  ('00000000-0000-4000-8000-00000000000b', 'bruno@exemple.test', now(), '{}', '{"display_name": "Bruno Test"}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@exemple.test', now(), '{"role": "admin"}', '{"display_name": "Admin Test"}');

insert into public.conversations (id, user_id, title) values
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a', 'Conversation d''Alice'),
  ('10000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000b', 'Conversation de Bruno');

insert into public.messages (conversation_id, user_id, role, content) values
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a', 'user', 'Bonjour Tamilya'),
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a', 'assistant', 'Bonjour Alice !'),
  ('10000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000b', 'user', 'Message privé de Bruno');

insert into public.awa_memories (user_id, kind, content) values
  ('00000000-0000-4000-8000-00000000000a', 'prenom', 'Prénom : Alice'),
  ('00000000-0000-4000-8000-00000000000b', 'prenom', 'Prénom : Bruno');

-- Portefeuille : uniquement par les fonctions du serveur, comme en vrai.
insert into public.wallet_transactions (user_id, kind, amount_cents, status, label, stripe_session_id)
values ('00000000-0000-4000-8000-00000000000a', 'topup', 2000, 'pending', 'Recharge de 20 €', 'cs_test_fictif_alice');
select public.wallet_complete_topup('cs_test_fictif_alice', 'Carte de test');

insert into public.code_exam_requests (user_id, center_id, center_name, starts_at, exam_type, civility, last_name, first_name, birth_date, city, phone, email, neph)
values ('00000000-0000-4000-8000-00000000000b', 'TEST1', 'Bureau fictif', now() + interval '7 days', 'B', 'M.', 'Test', 'Bruno', '2000-01-01', 'Mamoudzou', '0639000000', 'bruno@exemple.test', '000000000000');

insert into public.saved_addresses (user_id, kind, label, commune, line) values
  ('00000000-0000-4000-8000-00000000000a', 'travail', 'Bureau', 'Mamoudzou', '2 avenue des Tests');
