-- BTM AI — BTM Market peut faire parler Tamilya (route /api/awa, site « btm-market »).
-- Le secret du site est ajouté à part (empreinte SHA-256 seulement), jamais dans une migration.
alter table public.awa_partner_keys drop constraint if exists awa_partner_keys_site_check;
alter table public.awa_partner_keys add constraint awa_partner_keys_site_check
  check (site in ('btm-batiment', 'btm-market'));
