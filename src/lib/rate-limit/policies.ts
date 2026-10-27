import type { RateLimitRule } from "./types";

/**
 * Quotas de messages envoyés à l'IA. À Mayotte, beaucoup d'abonnés mobiles
 * partagent la même adresse IP (CGNAT) : la limite par IP est donc large et
 * la limite principale des visiteurs porte sur l'appareil (cookie).
 */
export const RATE_LIMIT_POLICIES = {
  anonymousDevice: [
    { name: "anon-dev-min", limit: 6, windowSeconds: 60 },
    { name: "anon-dev-day", limit: 30, windowSeconds: 86_400 },
  ],
  anonymousIp: [
    { name: "anon-ip-min", limit: 30, windowSeconds: 60 },
    { name: "anon-ip-day", limit: 300, windowSeconds: 86_400 },
  ],
  user: [
    { name: "user-min", limit: 15, windowSeconds: 60 },
    { name: "user-day", limit: 300, windowSeconds: 86_400 },
  ],
  conversationImport: [{ name: "import-hour", limit: 10, windowSeconds: 3_600 }],
} satisfies Record<string, RateLimitRule[]>;
