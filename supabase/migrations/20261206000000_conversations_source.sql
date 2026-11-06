-- BTM AI — d'où vient une conversation : Tamilya normale ou Tamilya Connect (sans internet).
-- Les anciennes conversations Connect ne sont reconnaissables nulle part : elles restent « tamilya ».
alter table public.conversations
  add column if not exists source text not null default 'tamilya'
  check (source in ('tamilya', 'connect'));
