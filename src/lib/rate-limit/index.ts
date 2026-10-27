import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { MemoryRateLimitStore } from "./memory";
import { SupabaseRateLimitStore } from "./supabase";
import type { RateLimitRule, RateLimitStore } from "./types";

export { RATE_LIMIT_POLICIES } from "./policies";

let memoryStore: MemoryRateLimitStore | null = null;
let warned = false;

function getStore(): RateLimitStore {
  const admin = getSupabaseAdminClient();
  if (admin) return new SupabaseRateLimitStore(admin);

  if (!warned && process.env.NODE_ENV === "production") {
    console.warn(
      "[rate-limit] SUPABASE_SECRET_KEY absente : compteurs en mémoire, non partagés entre instances.",
    );
    warned = true;
  }
  memoryStore ??= new MemoryRateLimitStore();
  return memoryStore;
}

export type RateLimitSubject = { key: string; rules: readonly RateLimitRule[] };

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Consomme une unité sur chaque règle. Refuse si l'une d'elles est dépassée.
 * En cas d'erreur du stockage, l'appel échoue (fail closed) pour protéger les coûts.
 */
export async function consumeRateLimits(subjects: RateLimitSubject[]): Promise<RateLimitDecision> {
  const store = getStore();
  const results = await Promise.all(
    subjects.flatMap(({ key, rules }) => rules.map((rule) => store.consume(key, rule))),
  );

  const denied = results.filter((r) => !r.allowed);
  if (denied.length === 0) return { allowed: true };

  const resetAt = Math.max(...denied.map((r) => r.resetAt));
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
  };
}
