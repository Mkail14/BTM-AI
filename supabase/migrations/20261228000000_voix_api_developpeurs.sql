-- BTM AI — Voix de Tamilya pour l'API des développeurs (route /api/v1/tamilya/voice)
--
-- La voix coûte plus cher que le texte : elle n'est pas ouverte à tous les codes.
-- Seuls les codes autorisés à la main par BTM (voice_enabled = true) peuvent
-- l'utiliser ; tous les autres reçoivent 403 « voice_not_allowed ».
--
-- Autoriser un code (dans l'éditeur SQL de Supabase), d'après son début affiché
-- sur /developpeurs :
--   update public.developer_keys set voice_enabled = true
--   where prefix like 'tml\_XXXX%' and revoked_at is null;
-- Retirer l'accès : même requête avec false.

alter table public.developer_keys
  add column if not exists voice_enabled boolean not null default false;
