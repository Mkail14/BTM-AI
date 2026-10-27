-- BTM AI — compte administrateur protégé
-- Les adresses listées dans private.protected_admins reçoivent le rôle
-- administrateur (app_metadata.role = 'admin') dès que l'e-mail est confirmé,
-- et ne peuvent plus être supprimées, bannies, rétrogradées ni changer d'adresse.
-- Pour lever la protection : supprimer la ligne de private.protected_admins.

create table private.protected_admins (
  email text primary key check (email = lower(email))
);

insert into private.protected_admins (email) values ('contact@btm.yt');

create or replace function private.is_protected_admin(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.protected_admins where email = lower(p_email)
  );
$$;

-- Attribue le rôle et refuse toute modification qui ferait perdre le compte.
create or replace function private.enforce_protected_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.email_confirmed_at is not null
     and private.is_protected_admin(old.email) then
    if new.email is distinct from old.email then
      raise exception 'Compte administrateur protégé : changement d''adresse interdit.';
    end if;
    if new.deleted_at is not null then
      raise exception 'Compte administrateur protégé : suppression interdite.';
    end if;
    if new.banned_until is not null and new.banned_until > now() then
      raise exception 'Compte administrateur protégé : bannissement interdit.';
    end if;
  end if;

  -- Rôle accordé seulement après confirmation de l'e-mail : s'inscrire avec
  -- l'adresse ne suffit pas, il faut en contrôler la boîte de réception.
  if new.email_confirmed_at is not null and private.is_protected_admin(new.email) then
    new.raw_app_meta_data :=
      coalesce(new.raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb;
  end if;

  return new;
end;
$$;

create or replace function private.prevent_protected_admin_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_protected_admin(old.email) then
    raise exception 'Compte administrateur protégé : suppression interdite.';
  end if;
  return old;
end;
$$;

create trigger protected_admin_enforce
  before insert or update on auth.users
  for each row execute function private.enforce_protected_admin();

create trigger protected_admin_no_delete
  before delete on auth.users
  for each row execute function private.prevent_protected_admin_delete();

revoke all on all functions in schema private from public, anon, authenticated;

-- Compte déjà confirmé avant cette migration : rôle appliqué immédiatement.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
where email_confirmed_at is not null
  and lower(email) in (select email from private.protected_admins);
