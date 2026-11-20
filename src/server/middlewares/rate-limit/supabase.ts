import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RateLimitResult, RateLimitRule, RateLimitStore } from "./types";

/**
 * Compteurs partagés stockés dans Postgres via la fonction
 * public.consume_rate_limit (exécutable uniquement avec la clé secrète).
 */
export class SupabaseRateLimitStore implements RateLimitStore {
  constructor(private readonly admin: SupabaseClient) {}

  async consume(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const { data, error } = await this.admin.rpc("consume_rate_limit", {
      p_key: `${rule.name}:${key}`,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });

    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      throw new Error(
        `consume_rate_limit a échoué (migrations appliquées ?) : ${error?.message ?? "réponse vide"}`,
      );
    }

    return {
      allowed: Boolean(row.allowed),
      remaining: Number(row.remaining),
      resetAt: new Date(row.reset_at).getTime(),
    };
  }
}
