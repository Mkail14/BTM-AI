-- BTM AI — Aucun nouveau compte pendant la maintenance.
-- L'inscription (e-mail ou Google, site ou application) va directement à Supabase
-- sans passer par notre serveur : seule la base peut la bloquer à coup sûr.
-- Les comptes existants ne sont pas touchés : ils ne créent pas de ligne ici.

create or replace function private.reject_signup_during_maintenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.site_settings where id = 1 and status = 'maintenance') then
    raise exception 'Inscriptions fermées pendant la maintenance.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_signup_during_maintenance() from public, anon, authenticated;

drop trigger if exists reject_signup_during_maintenance on auth.users;
create trigger reject_signup_during_maintenance
  before insert on auth.users
  for each row execute function private.reject_signup_during_maintenance();
