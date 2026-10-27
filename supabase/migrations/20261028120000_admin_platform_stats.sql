-- BTM AI — statistiques du tableau de bord d'administration.
-- Uniquement des comptages : le contenu des conversations n'est jamais lu.
-- Exécutable seulement avec la clé secrète (service_role), après vérification
-- du rôle administrateur côté serveur.
--
-- Visiteurs sans compte : leurs messages ne sont pas enregistrés ; on s'appuie
-- sur les compteurs de limitation de débit (empreintes HMAC d'appareils). Les
-- fenêtres « jour » de ces compteurs commencent à minuit UTC (3 h à Mayotte).

create or replace function public.admin_platform_stats(
  p_anon_daily_limit integer,
  p_user_daily_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day_window timestamptz := to_timestamp(floor(extract(epoch from now()) / 86400) * 86400);
  v_today date := (now() at time zone 'Indian/Mayotte')::date;
begin
  return jsonb_build_object(
    'users_total', (select count(*) from auth.users),
    'users_new_today', (
      select count(*) from auth.users where (created_at at time zone 'Indian/Mayotte')::date = v_today
    ),
    'users_new_7d', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'users_unconfirmed', (select count(*) from auth.users where email_confirmed_at is null),
    'users_active_7d', (
      select count(distinct user_id) from public.messages
      where role = 'user' and created_at >= now() - interval '7 days'
    ),
    'conversations_total', (select count(*) from public.conversations),
    'questions_today', (
      select count(*) from public.messages
      where role = 'user' and (created_at at time zone 'Indian/Mayotte')::date = v_today
    ),
    'questions_7d', (
      select count(*) from public.messages where role = 'user' and created_at >= now() - interval '7 days'
    ),
    'questions_30d', (
      select count(*) from public.messages where role = 'user' and created_at >= now() - interval '30 days'
    ),
    'answers_7d', (
      select count(*) from public.messages where role = 'assistant' and created_at >= now() - interval '7 days'
    ),
    'errors_7d', (
      select count(*) from public.messages
      where role = 'assistant' and status = 'error' and created_at >= now() - interval '7 days'
    ),
    'interrupted_7d', (
      select count(*) from public.messages
      where role = 'assistant' and status = 'interrupted' and created_at >= now() - interval '7 days'
    ),
    'anon_devices_today', (
      select count(*) from private.rate_limit_counters
      where key like 'anon-dev-day:%' and window_start = v_day_window
    ),
    'anon_messages_today', (
      select coalesce(sum(least(count, p_anon_daily_limit)), 0) from private.rate_limit_counters
      where key like 'anon-dev-day:%' and window_start = v_day_window
    ),
    'anon_devices_blocked_today', (
      select count(*) from private.rate_limit_counters
      where key like 'anon-dev-day:%' and window_start = v_day_window and count > p_anon_daily_limit
    ),
    'users_blocked_today', (
      select count(*) from private.rate_limit_counters
      where key like 'user-day:%' and window_start = v_day_window and count > p_user_daily_limit
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'questions', coalesce(m.questions, 0)) order by d.day), '[]'::jsonb)
      from (
        select g::date as day
        from generate_series((v_today - 13)::timestamp, v_today::timestamp, interval '1 day') as g
      ) d
      left join (
        select (created_at at time zone 'Indian/Mayotte')::date as day, count(*) as questions
        from public.messages
        where role = 'user' and created_at >= now() - interval '15 days'
        group by 1
      ) m on m.day = d.day
    )
  );
end;
$$;

revoke all on function public.admin_platform_stats(integer, integer) from public, anon, authenticated;
grant execute on function public.admin_platform_stats(integer, integer) to service_role;
