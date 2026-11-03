-- BTM AI — Bandeau de la page d'accueil (alerte, bon plan, publicité), sous la barre du haut,
-- à la manière du site d'Apple : une phrase et un lien facultatif. Modifié et
-- allumé / éteint depuis l'administration (rubrique Bandeau).
-- Dans site_settings : lu et écrit seulement par le serveur (clé secrète), aucune politique.

alter table public.site_settings
  add column announcement_enabled boolean not null default false,
  add column announcement_text text not null default '' check (char_length(announcement_text) <= 140),
  add column announcement_link_label text not null default '' check (char_length(announcement_link_label) <= 40),
  -- Lien interne (« /partenaires ») ou https:// seulement : vérifié aussi par le serveur.
  add column announcement_link_url text not null default '' check (
    char_length(announcement_link_url) <= 300
    and (announcement_link_url = '' or announcement_link_url ~ '^(/[^/\\]|/$|https://)')
  );
