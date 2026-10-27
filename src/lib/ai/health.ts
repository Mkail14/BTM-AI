import type { AIErrorCode } from "./types";

/**
 * État de chaque API, tenu en mémoire par le serveur à partir des vraies
 * réponses (chat, essais depuis /admin). Remis à zéro au redémarrage et propre
 * à chaque instance : c'est un indicateur, pas un historique.
 */
export type AIHealth = {
  successes: number;
  failures: number;
  lastSuccessAt: number | null;
  lastLatencyMs: number | null;
  lastFailure: { code: AIErrorCode; message: string; at: number } | null;
  /** Requêtes envoyées depuis minuit UTC (heure de remise à zéro des quotas OpenRouter). */
  today: { day: string; requests: number };
};

const EMPTY_HEALTH: AIHealth = {
  successes: 0,
  failures: 0,
  lastSuccessAt: null,
  lastLatencyMs: null,
  lastFailure: null,
  today: { day: "", requests: 0 },
};

const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10);

function countRequest(health: AIHealth, now: number) {
  const day = utcDay(now);
  health.today = health.today.day === day ? { day, requests: health.today.requests + 1 } : { day, requests: 1 };
}

/** Requêtes du jour (0 si le compteur date d'un autre jour). */
export function requestsToday(health: AIHealth, now = Date.now()): number {
  return health.today.day === utcDay(now) ? health.today.requests : 0;
}

/** Durée pendant laquelle une API épuisée est passée en dernier. */
export const COOLDOWN_MS: Partial<Record<AIErrorCode, number>> = {
  rate_limited: 60_000,
  overloaded: 30_000,
  quota: 15 * 60_000,
  auth: 15 * 60_000,
};

const registry = new Map<string, AIHealth>();

function entry(id: string): AIHealth {
  let health = registry.get(id);
  if (!health) {
    health = { ...EMPTY_HEALTH };
    registry.set(id, health);
  }
  return health;
}

export function recordSuccess(id: string, latencyMs: number, now = Date.now()) {
  const health = entry(id);
  health.successes++;
  countRequest(health, now);
  health.lastSuccessAt = now;
  health.lastLatencyMs = latencyMs;
}

export function recordFailure(id: string, code: AIErrorCode, message: string, now = Date.now()) {
  if (code === "aborted") return;
  const health = entry(id);
  health.failures++;
  countRequest(health, now);
  health.lastFailure = { code, message: message.slice(0, 300), at: now };
}

export function getHealth(id: string): AIHealth {
  const health = registry.get(id) ?? EMPTY_HEALTH;
  return { ...health, today: { ...health.today } };
}

/** Vrai si la dernière réponse de l'API est un échec encore « frais ». */
export function isCoolingDown(health: AIHealth, now = Date.now()): boolean {
  const failure = health.lastFailure;
  if (!failure || (health.lastSuccessAt ?? 0) > failure.at) return false;
  return now - failure.at < (COOLDOWN_MS[failure.code] ?? 0);
}

/* -------------------------------------------------------------------------- */
/* État affiché dans /admin/modele-ia                                         */
/* -------------------------------------------------------------------------- */

export type NodeStatus = "ok" | "warning" | "exhausted" | "error" | "unknown" | "off";

/** Résultat de la vérification gratuite de la clé (sans génération). */
export type KeyCheck =
  | {
      ok: true;
      credit?: {
        usage: number;
        /** Dépense du jour (UTC), si le fournisseur la donne. */
        usageDaily: number | null;
        limit: number | null;
        remaining: number | null;
        /** Fréquence de remise à zéro du plafond (daily, weekly, monthly), si définie. */
        limitReset: string | null;
        freeTier: boolean;
      };
    }
  | { ok: false; code: AIErrorCode; message: string };

export type ModelStatus = { status: NodeStatus; label: string; reason: string };

/**
 * Règle d'OpenRouter pour les modèles gratuits (« …:free ») : 50 requêtes par
 * jour tant qu'aucun crédit n'a été acheté, 1 000 ensuite ; remise à zéro à minuit UTC.
 */
export const OPENROUTER_FREE_PER_DAY = { withoutCredits: 50, withCredits: 1000 } as const;

export function freeDailyQuota(input: {
  baseUrl: string | undefined;
  model: string;
  freeTier: boolean;
  usedToday: number;
  exhausted: boolean;
}): { limit: number; used: number; remaining: number } | null {
  if (!/openrouter\.ai/.test(input.baseUrl ?? "") || !input.model.endsWith(":free")) return null;
  const limit = input.freeTier ? OPENROUTER_FREE_PER_DAY.withoutCredits : OPENROUTER_FREE_PER_DAY.withCredits;
  // Un refus « par jour » d'OpenRouter fait foi, même si notre compteur est plus bas.
  const used = input.exhausted ? limit : Math.min(input.usedToday, limit);
  return { limit, used, remaining: limit - used };
}

const RECENT_MS = 30 * 60_000;

/**
 * Combine la configuration, la vérification de la clé et les dernières
 * réponses réelles. L'échec réel le plus récent l'emporte sur une clé valide :
 * une clé peut être acceptée alors que son quota du jour est épuisé.
 */
export function deriveModelStatus(input: {
  configProblem: string | null;
  keyCheck: KeyCheck | null;
  health: AIHealth;
  now?: number;
}): ModelStatus {
  const { configProblem, keyCheck, health, now = Date.now() } = input;
  if (configProblem) return { status: "off", label: "Mal configurée", reason: configProblem };

  const failure = health.lastFailure;
  const failureIsLatest = failure && (health.lastSuccessAt ?? 0) < failure.at && now - failure.at < RECENT_MS;
  if (failure && failureIsLatest) {
    if (failure.code === "quota") return { status: "exhausted", label: "Épuisée", reason: failure.message };
    if (failure.code === "rate_limited") {
      return { status: "exhausted", label: "Limite atteinte", reason: "Trop de requêtes : le fournisseur limite le débit." };
    }
    if (failure.code === "auth") return { status: "error", label: "Clé refusée", reason: failure.message };
  }

  if (keyCheck && !keyCheck.ok) {
    if (keyCheck.code === "auth") return { status: "error", label: "Clé refusée", reason: keyCheck.message };
    if (keyCheck.code === "quota") return { status: "exhausted", label: "Épuisée", reason: keyCheck.message };
  }
  if (keyCheck?.ok && keyCheck.credit?.remaining != null && keyCheck.credit.remaining <= 0) {
    return { status: "exhausted", label: "Crédit épuisé", reason: "Le plafond de crédit de cette clé est atteint." };
  }

  if (failure && failureIsLatest) {
    return { status: "error", label: "En erreur", reason: failure.message };
  }
  if (health.lastSuccessAt || keyCheck?.ok) {
    return { status: "ok", label: "Fonctionnelle", reason: health.lastSuccessAt ? "A répondu récemment." : "Clé acceptée." };
  }
  return { status: "unknown", label: "Non vérifiée", reason: keyCheck && !keyCheck.ok ? keyCheck.message : "Aucune réponse depuis le démarrage." };
}
