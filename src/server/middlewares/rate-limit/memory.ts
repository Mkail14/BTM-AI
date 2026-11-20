import type { RateLimitResult, RateLimitRule, RateLimitStore } from "./types";

/**
 * Compteur à fenêtre fixe en mémoire. Adapté au développement ou à une
 * instance unique : les compteurs ne sont pas partagés entre instances et
 * disparaissent au redémarrage.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly counters = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async consume(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const now = this.now();
    const windowMs = rule.windowSeconds * 1000;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const storageKey = `${rule.name}:${key}:${windowStart}`;

    this.prune(now);
    const entry = this.counters.get(storageKey) ?? { count: 0, resetAt: windowStart + windowMs };
    entry.count += 1;
    this.counters.set(storageKey, entry);

    return {
      allowed: entry.count <= rule.limit,
      remaining: Math.max(rule.limit - entry.count, 0),
      resetAt: entry.resetAt,
    };
  }

  private prune(now: number) {
    if (this.counters.size < 10_000) return;
    for (const [key, entry] of this.counters) {
      if (entry.resetAt <= now) this.counters.delete(key);
    }
  }
}
