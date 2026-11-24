-- BTM AI — Annuaire des entreprises de Mayotte vérifié par GROUPE BTM
--
-- Chaque année, une équipe de GROUPE BTM relève les vraies informations des
-- entreprises de l'île (numéro qui marche, adresse, horaires, date d'ouverture…).
-- Tamilya les donne en priorité sur tout le reste, avec leur source : « vérifié
-- par l'équipe Tamilya le … » ou « donné par l'entreprise le … ».
--
-- Une entreprise peut prendre la main sur sa fiche (espace /entreprise) : elle
-- donne son SIRET, puis le code reçu au numéro vérifié de sa fiche. Ses
-- changements s'affichent tout de suite, sans validation : elle en est responsable.
--
-- Lecture et écriture par le serveur seulement (clé secrète), après ses
-- vérifications : aucune politique RLS ouverte aux comptes.

create table if not exists public.business_listings (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  -- Autres noms connus : enseigne, sigle, nom que les gens disent (« chez Fatima »).
  aliases text[] not null default '{}' check (cardinality(aliases) <= 8),
  siret text check (siret ~ '^[0-9]{14}$'),
  category text check (char_length(category) between 2 and 60),
  description text check (char_length(description) <= 600),
  services text[] not null default '{}' check (cardinality(services) <= 30),
  -- Où la trouver : commune (code INSEE), village, adresse, repère, point sur la carte.
  commune text check (commune ~ '^976[0-9]{2}$'),
  village text check (char_length(village) <= 60),
  address text check (char_length(address) <= 200),
  landmark text check (char_length(landmark) <= 200),
  latitude double precision check (latitude between -13.1 and -12.5),
  longitude double precision check (longitude between 44.9 and 45.4),
  -- Contact.
  phones text[] not null default '{}' check (cardinality(phones) <= 4),
  whatsapp text check (char_length(whatsapp) <= 20),
  email text check (char_length(email) <= 120),
  website text check (website is null or website ~ '^https?://'),
  facebook text check (char_length(facebook) <= 200),
  instagram text check (char_length(instagram) <= 200),
  -- Horaires : un texte par jour ({"lun": "7h30-12h, 14h-17h", "dim": "fermé"}), plus une note
  -- (jours fériés, ramadan, vacances).
  hours jsonb not null default '{}'::jsonb check (jsonb_typeof(hours) = 'object'),
  hours_note text check (char_length(hours_note) <= 300),
  opened_on date,
  -- Pratique.
  payments text[] not null default '{}' check (cardinality(payments) <= 8),
  delivery boolean,
  parking boolean,
  wheelchair boolean,
  languages text[] not null default '{}' check (cardinality(languages) <= 6),
  status text not null default 'ouvert' check (status in ('ouvert', 'ferme_temporaire', 'ferme_definitif')),
  -- Brouillon tant que l'équipe n'a pas fini : Tamilya ne lit que les fiches publiées.
  published boolean not null default false,
  -- Source de l'information : dernière vérification de l'équipe, dernière modification de l'entreprise.
  verified_on date,
  verified_by uuid references auth.users (id) on delete set null,
  owner_id uuid references auth.users (id) on delete set null,
  owner_updated_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_listings_published on public.business_listings (published);
create index if not exists business_listings_owner on public.business_listings (owner_id);
create unique index if not exists business_listings_siret on public.business_listings (siret) where siret is not null;

drop trigger if exists business_listings_set_updated_at on public.business_listings;
create trigger business_listings_set_updated_at
  before update on public.business_listings
  for each row execute function public.set_updated_at();

-- Combien de fois Tamilya a donné la fiche, par jour : demandée par son nom (asked), ou
-- montrée dans une liste (« un plombier à Sada », listed).
create table if not exists public.business_listing_stats (
  listing_id uuid not null references public.business_listings (id) on delete cascade,
  day date not null,
  channel text not null check (channel in ('ecrit', 'vocal', 'widget')),
  asked integer not null default 0 check (asked >= 0),
  listed integer not null default 0 check (listed >= 0),
  primary key (listing_id, day, channel)
);

-- Demandes de rattachement : l'entreprise a donné son SIRET ; l'équipe lui transmet le code
-- au numéro vérifié de la fiche (appel ou SMS), elle le tape dans son espace.
create table if not exists public.business_claims (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.business_listings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  siret text not null check (siret ~ '^[0-9]{14}$'),
  contact_name text not null check (char_length(contact_name) between 2 and 80),
  code text not null check (code ~ '^[0-9]{6}$'),
  attempts integer not null default 0 check (attempts >= 0),
  status text not null default 'en_attente' check (status in ('en_attente', 'validee', 'refusee', 'expiree')),
  code_sent_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

create index if not exists business_claims_pending on public.business_claims (status, created_at desc);
create unique index if not exists business_claims_one_pending on public.business_claims (listing_id, user_id) where status = 'en_attente';

-- Widget Tamilya relié à une fiche : il répond avec les informations de l'entreprise.
alter table public.developer_widgets
  add column if not exists listing_id uuid references public.business_listings (id) on delete set null;

alter table public.business_listings enable row level security;
alter table public.business_listing_stats enable row level security;
alter table public.business_claims enable row level security;
revoke all on public.business_listings, public.business_listing_stats, public.business_claims from anon, authenticated;

-- Ajoute des demandes au compteur du jour, en une fois (appelé par le serveur après chaque réponse).
create or replace function public.count_business_listings(asked_ids uuid[], listed_ids uuid[], on_channel text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.business_listing_stats (listing_id, day, channel, asked, listed)
  select id, (now() at time zone 'Indian/Mayotte')::date, on_channel, sum(a), sum(l)
  from (
    select unnest(asked_ids) as id, 1 as a, 0 as l
    union all
    select unnest(listed_ids), 0, 1
  ) counted
  where id in (select b.id from public.business_listings b)
  group by id
  on conflict (listing_id, day, channel)
  do update set asked = business_listing_stats.asked + excluded.asked, listed = business_listing_stats.listed + excluded.listed;
$$;

revoke execute on function public.count_business_listings(uuid[], uuid[], text) from public, anon, authenticated;
grant execute on function public.count_business_listings(uuid[], uuid[], text) to service_role;
