-- BTM AI — Index pour compter vite les messages d'un compte
-- Page /admin (questions par compte), statistiques et réponses de Tamilya aux
-- administrateurs (/admin/apprentissage) : filtres sur user_id, role et date.
-- Un index ne change aucun droit ; s'il manque, tout marche, en plus lent.

create index if not exists messages_user_role_created_idx
  on public.messages (user_id, role, created_at);
