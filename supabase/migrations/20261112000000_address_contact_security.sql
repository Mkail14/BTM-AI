-- BTM AI — Adresse du compte, téléphone mieux protégé, e-mails jetables refusés
--
-- 1. Adresse demandée à l'inscription (options.data.address_*), reconfirmée à
--    chaque livraison (src/lib/address.ts). Position GPS facultative.
-- 2. Téléphone gardé dans le profil (lisible par son propriétaire seulement,
--    RLS) au lieu d'être laissé en clair dans le navigateur.
-- 3. Adresses e-mail jetables refusées par la base elle-même, même si
--    quelqu'un contourne le formulaire. Liste identique à
--    src/lib/auth/disposable-email.ts (vérifié par un test).

-- ---------------------------------------------------------------------------
-- 1 et 2. Profil : adresse et téléphone
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists address_commune text
    check (address_commune is null or address_commune in ('Acoua', 'Bandraboua', 'Bandrélé', 'Bouéni', 'Chiconi', 'Chirongui', 'Dembéni', 'Dzaoudzi', 'Kani-Kéli', 'Koungou', 'Mamoudzou', 'Mtsamboro', 'M''Tsangamouji', 'Ouangani', 'Pamandzi', 'Sada', 'Tsingoni')),
  add column if not exists address_line text
    check (address_line is null or char_length(address_line) between 5 and 200),
  -- Rectangle de Mayotte (Grande-Terre, Petite-Terre et le lagon).
  add column if not exists address_lat double precision
    check (address_lat is null or address_lat between -13.05 and -12.6),
  add column if not exists address_lng double precision
    check (address_lng is null or address_lng between 44.95 and 45.35),
  add column if not exists address_accuracy integer
    check (address_accuracy is null or address_accuracy between 0 and 500),
  add column if not exists address_updated_at timestamptz,
  -- Numéro français joignable, sans 08 (spéciaux, surtaxés) : voir normalizePhone.
  add column if not exists phone text
    check (phone is null or phone ~ '^0[1-79][0-9]{8}$'),
  add constraint profiles_address_geo_complete
    check ((address_lat is null) = (address_lng is null) and (address_lat is null) = (address_accuracy is null));

-- Même règle pour les demandes de réservation du code (les anciennes lignes ne sont pas revérifiées).
alter table public.code_exam_requests
  add constraint code_exam_requests_phone_reachable check (phone ~ '^0[1-79][0-9]{8}$') not valid;

-- Reprend le nom et l'adresse saisis à l'inscription. Ces métadonnées viennent
-- du navigateur : chaque valeur est nettoyée, et ignorée si elle est invalide
-- (l'adresse sera redemandée à la première livraison).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text;
  v_commune text;
  v_line text;
begin
  v_name := nullif(left(btrim(regexp_replace(coalesce(v_meta ->> 'display_name', ''), '\s+', ' ', 'g')), 60), '');
  v_commune := v_meta ->> 'address_commune';
  if v_commune is null or v_commune not in ('Acoua', 'Bandraboua', 'Bandrélé', 'Bouéni', 'Chiconi', 'Chirongui', 'Dembéni', 'Dzaoudzi', 'Kani-Kéli', 'Koungou', 'Mamoudzou', 'Mtsamboro', 'M''Tsangamouji', 'Ouangani', 'Pamandzi', 'Sada', 'Tsingoni') then
    v_commune := null;
  end if;
  v_line := btrim(regexp_replace(coalesce(v_meta ->> 'address_line', ''), '\s+', ' ', 'g'));
  if v_commune is null or char_length(v_line) not between 5 and 200 then
    v_commune := null;
    v_line := null;
  end if;

  insert into public.profiles (id, display_name, address_commune, address_line, address_updated_at)
  values (new.id, v_name, v_commune, v_line, case when v_line is null then null else now() end);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. E-mails jetables
-- ---------------------------------------------------------------------------
create table if not exists private.blocked_email_domains (
  domain text primary key check (domain = lower(domain))
);
revoke all on private.blocked_email_domains from public, anon, authenticated;

insert into private.blocked_email_domains (domain) values
  ('0-mail.com'),
  ('10minutemail.com'),
  ('10minutemail.net'),
  ('10minutemail.co.uk'),
  ('20minutemail.com'),
  ('33mail.com'),
  ('anonbox.net'),
  ('anonaddy.me'),
  ('burnermail.io'),
  ('byom.de'),
  ('chacuo.net'),
  ('crazymailing.com'),
  ('cuvox.de'),
  ('dayrep.com'),
  ('deadaddress.com'),
  ('discard.email'),
  ('discardmail.com'),
  ('disposableemailaddresses.com'),
  ('dispostable.com'),
  ('dropmail.me'),
  ('einrot.com'),
  ('email-fake.com'),
  ('emailfake.com'),
  ('emailondeck.com'),
  ('emailtemporanea.com'),
  ('emailtemporanea.net'),
  ('fakeinbox.com'),
  ('fakemail.net'),
  ('fakemailgenerator.com'),
  ('fleckens.hu'),
  ('getairmail.com'),
  ('getnada.com'),
  ('gishpuppy.com'),
  ('guerrillamail.biz'),
  ('guerrillamail.com'),
  ('guerrillamail.de'),
  ('guerrillamail.info'),
  ('guerrillamail.net'),
  ('guerrillamail.org'),
  ('guerrillamailblock.com'),
  ('gustr.com'),
  ('harakirimail.com'),
  ('inboxbear.com'),
  ('inboxkitten.com'),
  ('incognitomail.org'),
  ('jetable.com'),
  ('jetable.fr.nf'),
  ('jetable.net'),
  ('jetable.org'),
  ('jourrapide.com'),
  ('kasmail.com'),
  ('linshiyouxiang.net'),
  ('mail-temp.com'),
  ('mail.tm'),
  ('mail1a.de'),
  ('mail7.io'),
  ('mailcatch.com'),
  ('maildrop.cc'),
  ('mailinator.com'),
  ('mailinator.net'),
  ('mailinator2.com'),
  ('mailnesia.com'),
  ('mailnull.com'),
  ('mailpoof.com'),
  ('mailsac.com'),
  ('meltmail.com'),
  ('minutemail.com'),
  ('moakt.com'),
  ('mohmal.com'),
  ('mintemail.com'),
  ('monemail.fr.nf'),
  ('mvrht.com'),
  ('mytemp.email'),
  ('nada.email'),
  ('nospam.ze.tc'),
  ('nwytg.net'),
  ('one-time.email'),
  ('owlymail.com'),
  ('rhyta.com'),
  ('sharklasers.com'),
  ('spam4.me'),
  ('spambox.us'),
  ('spamgourmet.com'),
  ('spamex.com'),
  ('speed.1s.fr'),
  ('superrito.com'),
  ('teleworm.us'),
  ('temp-mail.io'),
  ('temp-mail.org'),
  ('temp-mail.ru'),
  ('tempail.com'),
  ('tempemail.net'),
  ('tempinbox.com'),
  ('tempmail.com'),
  ('tempmail.dev'),
  ('tempmail.net'),
  ('tempmail.plus'),
  ('tempmailo.com'),
  ('tempmailaddress.com'),
  ('tempr.email'),
  ('throwawaymail.com'),
  ('tmail.ws'),
  ('tmailor.com'),
  ('tmpmail.net'),
  ('tmpmail.org'),
  ('trash-mail.com'),
  ('trashmail.com'),
  ('trashmail.de'),
  ('trashmail.fr'),
  ('trashmail.io'),
  ('trashmail.me'),
  ('trashmail.net'),
  ('trbvm.com'),
  ('vomoto.com'),
  ('wegwerfmail.de'),
  ('wegwerfmail.net'),
  ('wegwerfmail.org'),
  ('yopmail.com'),
  ('yopmail.fr'),
  ('yopmail.net'),
  ('cool.fr.nf'),
  ('courriel.fr.nf'),
  ('moncourrier.fr.nf'),
  ('zetmail.com')
on conflict do nothing;

-- Refuse le compte (création ou changement d'adresse) si le domaine, ou l'un
-- de ses domaines parents, est bloqué : « x.mailinator.com » compris.
create or replace function private.reject_disposable_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text := lower(split_part(coalesce(new.email, ''), '@', 2));
begin
  while v_domain like '%.%' loop
    if exists (select 1 from private.blocked_email_domains where domain = v_domain) then
      raise exception 'Adresse e-mail jetable refusée : %', v_domain using errcode = 'check_violation';
    end if;
    v_domain := substr(v_domain, strpos(v_domain, '.') + 1);
  end loop;
  return new;
end;
$$;

drop trigger if exists reject_disposable_email on auth.users;
create trigger reject_disposable_email
  before insert or update of email on auth.users
  for each row execute function private.reject_disposable_email();
