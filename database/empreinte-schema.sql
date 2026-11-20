-- Empreinte du schéma (public, private, et nos déclencheurs sur auth.users),
-- par sorte d'objet et par table. Lancée sur la base locale et sur Supabase
-- (en lecture seule) : deux empreintes différentes = la base réelle ne
-- correspond pas aux fichiers de migration pour cet objet.
with
cols as (
  select 'colonnes' as kind, table_schema || '.' || table_name as obj,
    string_agg(column_name || ' ' || data_type || case when is_nullable = 'NO' then ' not null' else '' end
      || coalesce(' default ' || column_default, ''), ', ' order by column_name collate "C") as def
  from information_schema.columns
  where table_schema in ('public', 'private')
  group by 1, 2
),
cons as (
  select 'contraintes', n.nspname || '.' || c.relname,
    string_agg(co.conname || ': ' || pg_get_constraintdef(co.oid), ' ; ' order by co.conname collate "C")
  from pg_constraint co join pg_class c on c.oid = co.conrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')
    and co.contype <> 'n' -- PostgreSQL 18 range les « not null » parmi les contraintes, pas 17
  group by 1, 2
),
idx as (
  select 'index', schemaname || '.' || tablename, string_agg(indexdef, ' ; ' order by indexname collate "C")
  from pg_indexes where schemaname in ('public', 'private') group by 1, 2
),
pol as (
  select 'politiques', schemaname || '.' || tablename,
    string_agg(policyname || ' ' || cmd || ' ' || array_to_string(roles, ',') || ' using(' || coalesce(qual, '') || ') check(' || coalesce(with_check, '') || ')', ' ; ' order by policyname collate "C")
  from pg_policies where schemaname in ('public', 'private', 'realtime') group by 1, 2
),
rls as (
  select 'rls', n.nspname || '.' || c.relname, c.relrowsecurity::text || '/' || c.relforcerowsecurity::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and n.nspname in ('public', 'private')
),
fns as (
  select 'fonctions', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    p.prosecdef::text || ' ' || coalesce(array_to_string(p.proconfig, ','), '') || ' ' || replace(p.prosrc, chr(13), '')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
),
fn_acl as (
  select 'droits_fonctions', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    coalesce((select string_agg(r, ',' order by r) from unnest(
      array(select g.grantee from information_schema.role_routine_grants g
            where g.specific_schema = n.nspname and g.specific_name = p.proname || '_' || p.oid
              and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC'))) r), '')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
),
trg as (
  select 'declencheurs', n.nspname || '.' || c.relname, string_agg(pg_get_triggerdef(t.oid), ' ; ' order by t.tgname collate "C")
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and (n.nspname in ('public', 'private')
    or (n.nspname = 'auth' and c.relname = 'users' and t.tgname not like 'on_auth_%sync%'))
  group by 1, 2
),
grants as (
  select 'droits_tables', table_schema || '.' || table_name,
    string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type)
  from information_schema.role_table_grants
  where table_schema in ('public', 'private') and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  group by 1, 2
),
everything as (
  select * from cols union all select * from cons union all select * from idx union all select * from pol
  union all select * from rls union all select * from fns union all select * from fn_acl
  union all select * from trg union all select * from grants
)
select kind || '|' || obj || '|' || left(md5(replace(def, chr(13), '')), 10)
from everything
order by kind, obj collate "C";
