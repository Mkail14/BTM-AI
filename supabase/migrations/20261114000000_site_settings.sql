-- BTM AI — réglages du site (une seule ligne, id = 1)
-- maintenance : le site affiche une page d'attente à tous sauf aux administrateurs.
-- demo_mode : la démonstration de commande de repas (restaurants Jéjé Livraison,
-- solde fictif) est visible des administrateurs.
-- bank_* : RIB de GROUPE BTM, vu et modifié par l'administrateur principal seulement.
-- Lu et écrit seulement par le serveur (clé secrète) : aucune politique.

create table public.site_settings (
  id smallint primary key default 1 check (id = 1),
  maintenance boolean not null default false,
  maintenance_message text not null default '' check (char_length(maintenance_message) <= 300),
  demo_mode boolean not null default false,
  bank_holder text not null default '' check (char_length(bank_holder) <= 120),
  bank_name text not null default '' check (char_length(bank_name) <= 120),
  bank_iban text not null default '' check (char_length(bank_iban) <= 34),
  bank_bic text not null default '' check (char_length(bank_bic) <= 11),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.site_settings (id) values (1);

alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
