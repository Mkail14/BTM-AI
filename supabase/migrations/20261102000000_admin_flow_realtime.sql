-- BTM AI — Trajet des messages en direct sur /admin/modele-ia
-- Le serveur diffuse chaque étape sur le canal privé « admin-flow » (clé
-- secrète, hors RLS). Seuls les administrateurs peuvent l'écouter.

create policy "admin_flow_admin_read" on realtime.messages
  for select to authenticated
  using (
    (select realtime.topic()) = 'admin-flow'
    and realtime.messages.extension = 'broadcast'
    and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  );
