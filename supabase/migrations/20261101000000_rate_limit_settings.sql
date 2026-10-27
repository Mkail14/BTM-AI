-- BTM AI — Quotas de messages modifiables depuis /admin/modele-ia
-- null : les valeurs du code (src/lib/rate-limit/policies.ts) s'appliquent.
-- Format : { "anonymousDevice": { "minute": 6, "day": 30 }, "anonymousIp": {…}, "user": {…} }

alter table public.awa_settings
  add column rate_limits jsonb check (rate_limits is null or jsonb_typeof(rate_limits) = 'object');
