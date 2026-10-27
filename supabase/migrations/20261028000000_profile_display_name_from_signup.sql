-- Reprend le nom affiché saisi à l'inscription (options.data.display_name).
-- Ces métadonnées sont fournies par le client : la valeur est nettoyée et
-- tronquée ici, et ne sert qu'à l'affichage pour l'utilisateur lui-même.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := nullif(
    left(btrim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'display_name', ''), '\s+', ' ', 'g')), 60),
    ''
  );
  insert into public.profiles (id, display_name) values (new.id, v_name);
  return new;
end;
$$;
