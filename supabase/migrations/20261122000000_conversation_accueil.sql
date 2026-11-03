-- BTM AI — Conversation d'exemple de la page d'accueil, traduite en shimaoré par Tamilya elle-même.
-- Gardée ici pour ne pas redemander la traduction à l'IA à chaque visite. La clé résume le
-- vocabulaire de Tamilya au moment de la traduction : quand on lui apprend ou corrige un mot,
-- la clé change et la conversation est retraduite à la visite suivante.
-- Dans site_settings : lu et écrit seulement par le serveur (clé secrète), aucune politique.

alter table public.site_settings
  add column landing_demo jsonb,
  add column landing_demo_key text;
