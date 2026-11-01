-- BTM AI — Consommation des API d'IA, pour la barre « Crédit Google » du tableau de bord
-- Une ligne par jour et par modèle : jetons envoyés et reçus (chiffres donnés par l'API).
-- Écrite par le serveur (clé secrète), lisible par les administrateurs.

create table public.ai_usage (
  day date not null default (now() at time zone 'Indian/Mayotte')::date,
  model text not null check (char_length(model) between 1 and 200),
  requests integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (day, model)
);

alter table public.ai_usage enable row level security;

create policy "ai_usage_admin_read" on public.ai_usage
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create function public.record_ai_usage(p_model text, p_input bigint, p_output bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.ai_usage (model, requests, input_tokens, output_tokens)
  values (p_model, 1, greatest(p_input, 0), greatest(p_output, 0))
  on conflict (day, model) do update
    set requests = public.ai_usage.requests + 1,
        input_tokens = public.ai_usage.input_tokens + excluded.input_tokens,
        output_tokens = public.ai_usage.output_tokens + excluded.output_tokens;
$$;

revoke execute on function public.record_ai_usage(text, bigint, bigint) from public, anon, authenticated;
