-- BTM AI — Trois états du site : en ligne, maintenance, en attente d'un partenaire.
-- En attente : les visiteurs voient une page d'attente, comme en maintenance. La
-- validation du premier partenaire ouvre le site, dans la même transaction.
-- Lu et écrit seulement par le serveur (clé secrète) : aucune politique.

alter table public.site_settings
  add column status text not null default 'online'
  check (status in ('online', 'maintenance', 'waiting_partner'));
update public.site_settings set status = 'maintenance' where maintenance;
alter table public.site_settings drop column maintenance;

alter table public.site_status_log
  add column status text check (status in ('online', 'maintenance', 'waiting_partner')),
  -- Rempli quand la validation d'un partenaire a ouvert le site.
  add column partner_name text check (char_length(partner_name) <= 120);
update public.site_status_log set status = case when maintenance then 'maintenance' else 'online' end;
alter table public.site_status_log alter column status set not null;
alter table public.site_status_log drop column maintenance;

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  activity text not null default '' check (char_length(activity) <= 120),
  created_at timestamptz not null default now(),
  -- null : pas encore validé.
  validated_at timestamptz,
  validated_by uuid references auth.users (id) on delete set null
);

alter table public.partners enable row level security;
revoke all on public.partners from anon, authenticated;

drop function public.set_site_status(boolean, text, uuid, text);

-- Change l'état et l'inscrit au journal dans la même transaction : jamais l'un sans l'autre.
-- p_message null : le message actuel est gardé. Attendre un partenaire alors qu'un
-- partenaire est déjà validé est refusé : plus aucune validation n'ouvrirait le site.
create function public.set_site_status(p_status text, p_message text, p_by uuid, p_by_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message text;
begin
  if p_status = 'waiting_partner' and exists (select 1 from public.partners where validated_at is not null) then
    raise exception 'partner_already_validated';
  end if;
  update public.site_settings
  set status = p_status,
      maintenance_message = coalesce(p_message, maintenance_message),
      updated_at = now(),
      updated_by = p_by
  where id = 1
  returning maintenance_message into v_message;
  if not found then
    raise exception 'Réglages du site absents (ligne id = 1).';
  end if;
  insert into public.site_status_log (changed_by, changed_by_email, status, message)
  values (p_by, left(p_by_email, 320), p_status, v_message);
end $$;

revoke execute on function public.set_site_status(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_site_status(text, text, uuid, text) to service_role;

-- Valide un partenaire et, si le site l'attendait, l'ouvre et l'inscrit au journal.
-- Renvoie 'opened' (site ouvert), 'validated' (état inchangé) ou 'unchanged'
-- (partenaire introuvable ou déjà validé). Une maintenance n'est jamais levée ici.
create function public.validate_partner(p_partner uuid, p_by uuid, p_by_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_message text;
begin
  update public.partners
  set validated_at = now(), validated_by = p_by
  where id = p_partner and validated_at is null
  returning name into v_name;
  if not found then
    return 'unchanged';
  end if;
  update public.site_settings
  set status = 'online', updated_at = now(), updated_by = p_by
  where id = 1 and status = 'waiting_partner'
  returning maintenance_message into v_message;
  if not found then
    return 'validated';
  end if;
  insert into public.site_status_log (changed_by, changed_by_email, status, message, partner_name)
  values (p_by, left(p_by_email, 320), 'online', v_message, v_name);
  return 'opened';
end $$;

revoke execute on function public.validate_partner(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.validate_partner(uuid, uuid, text) to service_role;
