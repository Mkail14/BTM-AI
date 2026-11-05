-- BTM AI — Tamilya Connect (messages relayés de téléphone en téléphone, sans internet)
-- Lecture et écriture par le serveur seulement (clé secrète) : RLS active, aucune règle ouverte aux comptes.

-- Clé publique de chaque appareil (la clé privée reste dans le téléphone).
create table public.mesh_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  public_key text not null unique check (char_length(public_key) between 80 and 200),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
create index mesh_devices_user_idx on public.mesh_devices (user_id);
alter table public.mesh_devices enable row level security;

-- Chaque message une seule fois : un doublon reçoit la même réponse, sans rien refaire (jamais deux paiements).
create table public.mesh_messages (
  id uuid primary key,
  device_id uuid not null references public.mesh_devices (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reply jsonb,
  created_at timestamptz not null default now()
);
create index mesh_messages_created_idx on public.mesh_messages (created_at);
alter table public.mesh_messages enable row level security;

-- Choix proposés par Tamilya (billet, repas) : prix fixé par le serveur, utilisables une seule fois.
create table public.mesh_actions (
  id text primary key check (char_length(id) between 16 and 64),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('barge', 'food')),
  data jsonb not null,
  label text not null check (char_length(label) <= 160),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index mesh_actions_user_idx on public.mesh_actions (user_id);
alter table public.mesh_actions enable row level security;
