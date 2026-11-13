-- BTM AI — Orchestr AI (messagerie privée du patron avec Tamilya) peut faire parler Tamilya
-- (route /api/tamilya, site « orchestr-ai »). Le secret est ajouté à part (empreinte SHA-256 seulement).
alter table public.awa_partner_keys drop constraint if exists awa_partner_keys_site_check;
alter table public.awa_partner_keys add constraint awa_partner_keys_site_check
  check (site in ('btm-batiment', 'btm-market', 'orchestr-ai'));
