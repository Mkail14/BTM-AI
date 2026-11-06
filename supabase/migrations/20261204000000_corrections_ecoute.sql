-- BTM AI — Corrections d'écoute du vocal : ce que Gemini entend de travers et ce qui a vraiment été dit.
-- Ajoutées par les administrateurs. Elles guident l'écoute de Tamilya et corrigent le texte enregistré.
-- Lu et écrit seulement par le serveur (clé secrète) : aucune politique.

create table public.voice_corrections (
  id uuid primary key default gen_random_uuid(),
  heard text not null check (char_length(heard) between 2 and 80),
  meant text not null check (char_length(meant) between 1 and 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index voice_corrections_heard_idx on public.voice_corrections (lower(heard));

alter table public.voice_corrections enable row level security;
revoke all on public.voice_corrections from anon, authenticated;
