-- BTM AI — Faille S1 de l'audit : écritures par le serveur seulement
-- ⚠ À APPLIQUER APRÈS la mise en production du code qui écrit avec la clé secrète
-- (src/lib/conversations/repository.ts, src/lib/ai/memory-store.ts,
-- src/app/api/code-exam/requests/route.ts). Appliquée avant, l'ancien code ne
-- pourrait plus enregistrer les conversations.
--
-- Un compte connecté pouvait, avec la clé publique et son jeton, écrire
-- directement dans la base : faux messages de Tamilya, souvenirs inventés,
-- conversations et demandes du code sans les vérifications ni les quotas du
-- serveur. Il garde la lecture, la suppression de ses conversations et de ses
-- souvenirs (Paramètres), et le renommage d'une conversation.

drop policy if exists "messages_insert_own" on public.messages;
revoke insert, update, delete on public.messages from authenticated;

drop policy if exists "conversations_insert_own" on public.conversations;
revoke insert on public.conversations from authenticated;

drop policy if exists "awa_memories_insert_own" on public.awa_memories;
drop policy if exists "awa_memories_update_own" on public.awa_memories;
revoke insert, update on public.awa_memories from authenticated;

drop policy if exists "code_exam_requests_insert_own" on public.code_exam_requests;
revoke insert on public.code_exam_requests from authenticated;
