-- BTM AI — Banque de documents
--
-- Les documents restent dans le Google Drive de la personne : ici, seul le lien
-- vers son compte Google (jeton chiffré, src/lib/drive/connection.ts).
-- RLS sans politique : seul le serveur lit et écrit, jamais le navigateur.

create table if not exists public.drive_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  google_email text,
  refresh_token text not null,
  connected_at timestamptz not null default now()
);

alter table public.drive_connections enable row level security;

revoke all on public.drive_connections from public, anon, authenticated;
