-- BTM AI — Bibliothèque Mayotte de Tamilya
-- Documents (pages officielles, articles, textes collés) découpés en passages,
-- chacun avec son « empreinte de sens » (vecteur Gemini, 768 nombres) pour la
-- recherche par le sens. Apprentissage contrôlé : un document ajouté est « à
-- valider » ; seuls les documents publiés par un administrateur servent à
-- Tamilya. Chaque document garde sa source, sa date et son niveau de confiance.
-- Lecture et écriture par le serveur seulement (clé secrète) : aucune règle RLS
-- ouverte aux comptes.

create extension if not exists vector;

create table public.awa_library_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 300),
  source_url text check (source_url is null or source_url ~ '^https://'),
  source_name text not null check (char_length(source_name) between 1 and 120),
  -- officiel : administrations, services publics ; media : presse reconnue ; autre : le reste.
  trust text not null default 'autre' check (trust in ('officiel', 'media', 'autre')),
  published_at timestamptz,
  verified_at timestamptz not null default now(),
  status text not null default 'a_valider' check (status in ('a_valider', 'publie', 'rejete')),
  chars integer not null default 0,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source_url)
);

create table public.awa_library_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.awa_library_documents (id) on delete cascade,
  position integer not null,
  content text not null check (char_length(content) between 1 and 4000),
  embedding vector(768) not null
);

create index awa_library_chunks_document on public.awa_library_chunks (document_id);
create index awa_library_chunks_embedding on public.awa_library_chunks using hnsw (embedding vector_cosine_ops);
create index awa_library_documents_status on public.awa_library_documents (status);

alter table public.awa_library_documents enable row level security;
alter table public.awa_library_chunks enable row level security;

-- Passages publiés les plus proches d'une question (similarité cosinus).
create or replace function public.match_library(query vector(768), match_count integer default 5, min_similarity double precision default 0.6)
returns table (
  content text,
  title text,
  source_name text,
  source_url text,
  trust text,
  published_at timestamptz,
  verified_at timestamptz,
  similarity double precision
)
language sql
stable
set search_path = public
as $$
  select c.content, d.title, d.source_name, d.source_url, d.trust, d.published_at, d.verified_at,
         1 - (c.embedding <=> query) as similarity
  from public.awa_library_chunks c
  join public.awa_library_documents d on d.id = c.document_id
  where d.status = 'publie' and 1 - (c.embedding <=> query) >= min_similarity
  order by c.embedding <=> query
  limit least(match_count, 12);
$$;

revoke execute on function public.match_library(vector, integer, double precision) from public, anon, authenticated;
