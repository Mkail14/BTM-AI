-- Inscription avec Google : Google ne donne pas « display_name » mais
-- « given_name » (prénom) et « full_name » / « name ». On les prend à défaut,
-- pour que le compte ait un prénom dès la création. Le reste est inchangé.
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
  v_name := nullif(left(btrim(regexp_replace(coalesce(
    nullif(btrim(v_meta ->> 'display_name'), ''),
    nullif(btrim(v_meta ->> 'given_name'), ''),
    nullif(btrim(v_meta ->> 'full_name'), ''),
    nullif(btrim(v_meta ->> 'name'), ''),
    ''
  ), '\s+', ' ', 'g')), 60), '');
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

revoke execute on function public.handle_new_user() from public, anon, authenticated;
