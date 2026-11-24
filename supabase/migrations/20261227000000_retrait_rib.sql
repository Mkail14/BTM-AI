-- BTM AI — Retrait du RIB de GROUPE BTM
-- Le Profil de l'entreprise est devenu la rubrique Administration de Mon
-- compte, sans coordonnées bancaires : le RIB enregistré est effacé avec ses
-- colonnes (aucune copie gardée).

alter table public.site_settings
  drop column if exists bank_holder,
  drop column if exists bank_name,
  drop column if exists bank_iban,
  drop column if exists bank_bic;
