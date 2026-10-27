import "server-only";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { RATE_LIMIT_POLICIES } from "./policies";
import type { RateLimitRule } from "./types";

/** Quotas modifiables depuis /admin/modele-ia : messages par minute et par jour. */
export const RATE_LIMIT_SUBJECTS = ["anonymousDevice", "anonymousIp", "user"] as const;
export type RateLimitSubjectName = (typeof RATE_LIMIT_SUBJECTS)[number];
export type RateLimitSettings = Record<RateLimitSubjectName, { minute: number; day: number }>;

export const RATE_LIMIT_MAX = 100_000;

const pairSchema = z
  .object({
    minute: z.number().int().min(1, "Minimum 1 message.").max(RATE_LIMIT_MAX),
    day: z.number().int().min(1, "Minimum 1 message.").max(RATE_LIMIT_MAX),
  })
  .refine((p) => p.day >= p.minute, "La limite par jour doit être au moins égale à celle par minute.");

export const rateLimitSettingsSchema = z.object({
  anonymousDevice: pairSchema,
  anonymousIp: pairSchema,
  user: pairSchema,
});

function limitOf(rules: readonly RateLimitRule[], windowSeconds: number) {
  return rules.find((r) => r.windowSeconds === windowSeconds)?.limit ?? 1;
}

/** Valeurs du code (policies.ts), utilisées tant que rien n'est enregistré. */
export const DEFAULT_RATE_LIMITS: RateLimitSettings = Object.fromEntries(
  RATE_LIMIT_SUBJECTS.map((s) => [
    s,
    { minute: limitOf(RATE_LIMIT_POLICIES[s], 60), day: limitOf(RATE_LIMIT_POLICIES[s], 86_400) },
  ]),
) as RateLimitSettings;

const CACHE_MS = 60_000;
let cache: { settings: RateLimitSettings; expiresAt: number } | null = null;

/** Réglages en vigueur (base, sinon valeurs du code). Relus au plus toutes les 60 s. */
export async function loadRateLimitSettings(): Promise<RateLimitSettings> {
  if (cache && cache.expiresAt > Date.now()) return cache.settings;
  let settings = DEFAULT_RATE_LIMITS;
  const admin = getSupabaseAdminClient();
  if (admin) {
    const { data, error } = await admin.from("awa_settings").select("rate_limits").eq("id", 1).maybeSingle();
    if (error) console.error("[rate-limit] Quotas illisibles (migration rate_limits appliquée ?)", error);
    else if (data?.rate_limits) {
      const parsed = rateLimitSettingsSchema.safeParse(data.rate_limits);
      if (parsed.success) settings = parsed.data;
      else console.error("[rate-limit] Quotas enregistrés invalides : valeurs du code utilisées.");
    }
  }
  cache = { settings, expiresAt: Date.now() + CACHE_MS };
  return settings;
}

/** Après un enregistrement depuis /admin (les autres instances suivent sous 60 s). */
export function invalidateRateLimits() {
  cache = null;
}

/** Règles appliquées par consumeRateLimits ; les noms restent ceux du code (clés des compteurs). */
export async function loadRateLimitPolicies(): Promise<Record<RateLimitSubjectName, RateLimitRule[]>> {
  const settings = await loadRateLimitSettings();
  return Object.fromEntries(
    RATE_LIMIT_SUBJECTS.map((s) => [
      s,
      RATE_LIMIT_POLICIES[s].map((rule) => ({
        ...rule,
        limit: rule.windowSeconds === 60 ? settings[s].minute : rule.windowSeconds === 86_400 ? settings[s].day : rule.limit,
      })),
    ]),
  ) as Record<RateLimitSubjectName, RateLimitRule[]>;
}
