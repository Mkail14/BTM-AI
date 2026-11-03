-- BTM AI — Avis des utilisateurs sur l'application, affichés sur la page d'accueil.
-- Un avis par compte (modifiable), écrit et lu uniquement par le serveur (clé
-- secrète) : le serveur vérifie la session, la note, le texte et le quota.
-- Aucun accès direct par l'API pour les visiteurs ou les comptes connectés.

create table public.app_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  -- Nom public figé par le serveur : « Fatima M. » (prénom + initiale), jamais l'e-mail.
  display_name text not null check (char_length(display_name) between 1 and 60),
  commune text check (commune is null or commune in ('Acoua', 'Bandraboua', 'Bandrélé', 'Bouéni', 'Chiconi', 'Chirongui', 'Dembéni', 'Dzaoudzi', 'Kani-Kéli', 'Koungou', 'Mamoudzou', 'Mtsamboro', 'M''Tsangamouji', 'Ouangani', 'Pamandzi', 'Sada', 'Tsingoni')),
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) between 1 and 300),
  -- hidden : retiré de la page d'accueil par un administrateur (insulte, publicité…).
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index app_reviews_published_idx on public.app_reviews (created_at desc) where status = 'published';

create trigger app_reviews_set_updated_at
  before update on public.app_reviews
  for each row execute function public.set_updated_at();

-- RLS sans politique + aucun droit : seul le serveur (service_role) lit et écrit.
alter table public.app_reviews enable row level security;
revoke all on public.app_reviews from anon, authenticated;
