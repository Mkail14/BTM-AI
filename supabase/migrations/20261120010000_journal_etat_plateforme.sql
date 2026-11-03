-- BTM AI — État de la plateforme : journal des mises en maintenance et réouvertures
-- Chaque changement d'état garde son auteur (compte et e-mail, conservé même si le
-- compte est supprimé), la date, l'état choisi et le message affiché aux visiteurs.
-- Lu et écrit seulement par le serveur (clé secrète) : aucune politique.

create table public.site_status_log (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users (id) on delete set null,
  changed_by_email text check (char_length(changed_by_email) <= 320),
  maintenance boolean not null,
  message text not null default '' check (char_length(message) <= 300)
);

create index site_status_log_changed_at_idx on public.site_status_log (changed_at desc);

alter table public.site_status_log enable row level security;
revoke all on public.site_status_log from anon, authenticated;

-- Change l'état et l'inscrit au journal dans la même transaction : jamais l'un sans l'autre.
-- p_message null : le message actuel est gardé.
create or replace function public.set_site_status(p_maintenance boolean, p_message text, p_by uuid, p_by_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message text;
begin
  update public.site_settings
  set maintenance = p_maintenance,
      maintenance_message = coalesce(p_message, maintenance_message),
      updated_at = now(),
      updated_by = p_by
  where id = 1
  returning maintenance_message into v_message;
  if not found then
    raise exception 'Réglages du site absents (ligne id = 1).';
  end if;
  insert into public.site_status_log (changed_by, changed_by_email, maintenance, message)
  values (p_by, left(p_by_email, 320), p_maintenance, v_message);
end $$;

revoke execute on function public.set_site_status(boolean, text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_site_status(boolean, text, uuid, text) to service_role;
