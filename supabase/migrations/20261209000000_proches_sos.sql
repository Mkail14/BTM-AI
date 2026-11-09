-- BTM AI — Proches à prévenir (SOS de Tamilya Connect, app Android)
-- Jusqu'à 4 adresses e-mail par compte. Quand la personne écrit « SOS » dans
-- Tamilya Connect, le message passe de téléphone en téléphone jusqu'au serveur,
-- qui écrit à ces proches (position et batterie du téléphone).
-- Lecture et écriture par le serveur seulement (clé secrète) : aucune règle RLS
-- ouverte aux comptes. Effacées avec le compte.

create table public.sos_contacts (
  user_id uuid not null references auth.users (id) on delete cascade,
  position smallint not null check (position between 1 and 4),
  email text not null check (char_length(email) between 3 and 254),
  created_at timestamptz not null default now(),
  primary key (user_id, position)
);

alter table public.sos_contacts enable row level security;

-- Alertes envoyées : trace pour l'équipe (jamais la position, gardée seulement dans le mail).
create table public.sos_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sent_to smallint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.sos_alerts enable row level security;
create index sos_alerts_user_idx on public.sos_alerts (user_id, created_at desc);
