export type RateLimitRule = {
  /** Identifiant court de la règle (fait partie de la clé de stockage). */
  name: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Fin de la fenêtre courante (ms depuis epoch). */
  resetAt: number;
};

export interface RateLimitStore {
  consume(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
}
