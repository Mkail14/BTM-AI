-- BTM AI — Voix de Tamilya
-- Voix Gemini choisie dans /admin/voix (Leda, Kore, Aoede…). Vide : Leda.

alter table public.awa_settings
  add column if not exists voice text
    check (voice is null or voice ~ '^[A-Za-z]{2,20}$');
