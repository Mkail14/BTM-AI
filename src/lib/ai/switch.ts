import { averageFirstWord, getHealth, isCoolingDown, type AIHealth } from "./health";

/**
 * Aiguillage : choisit à l'avance l'API qui répondra, pour qu'aucun message
 * n'attende derrière une API épuisée, bloquée ou en panne.
 *
 * Il croise deux sources :
 * - ce que ce serveur a vu lui-même (santé en mémoire) ;
 * - ce que tous les serveurs ont vu (dernier résultat partagé, gardé dans Supabase),
 *   pour qu'un serveur qui vient de démarrer ne reteste pas une API morte sur un vrai message.
 *
 * Chaque API va dans une file :
 * - « prête » : elle marche, les messages y vont direct (la plus rapide d'abord) ;
 * - « à retester » : sa pause est finie mais rien ne prouve qu'elle remarche ; un petit essai
 *   de fond la reteste, et en attendant elle passe après les API prêtes ;
 * - « en pause » : échec récent, essayée seulement si toutes les autres échouent.
 */

export type SharedState = { state: string; at: number };

/** Pause d'une API d'après le dernier résultat partagé (états de api-status.ts). */
export const SHARED_PAUSE_MS: Record<string, number> = {
  limit: 60_000,
  down: 30_000,
  empty: 15 * 60_000,
  refused: 15 * 60_000,
  missing: 15 * 60_000,
};

export type SwitchLane = "ready" | "retest" | "paused";

export const LANE_LABELS: Record<SwitchLane, string> = {
  ready: "prête",
  retest: "à retester",
  paused: "en pause",
};

/** Écart de vitesse (premier mot) en dessous duquel l'ordre choisi dans le circuit est gardé. */
const SPEED_STEP_MS = 1_000;

export function laneOf(health: AIHealth, shared: SharedState | undefined, now = Date.now()): SwitchLane {
  if (isCoolingDown(health, now)) return "paused";
  const lastSuccess = health.lastSuccessAt ?? 0;
  const failure = health.lastFailure && health.lastFailure.at > lastSuccess ? health.lastFailure : null;
  // Résultat partagé plus récent que ce que ce serveur sait : il fait foi.
  if (shared && shared.at > Math.max(lastSuccess, failure?.at ?? 0)) {
    if (shared.state === "ok") return "ready";
    return now - shared.at < (SHARED_PAUSE_MS[shared.state] ?? 0) ? "paused" : "retest";
  }
  return failure ? "retest" : "ready";
}

type Routable = { healthId: string; slotId?: string };

export type Route<T extends Routable> = {
  /** Ordre d'essai : prêtes (la plus rapide d'abord), puis à retester, puis en pause. */
  order: T[];
  /** API à retester en arrière-plan (seulement s'il y a une API prête pour le message). */
  retest: T[];
  lanes: Map<T, SwitchLane>;
};

export function planRoute<T extends Routable>(
  entries: readonly T[],
  options: { now?: number; shared?: (slotId: string) => SharedState | undefined; health?: (healthId: string) => AIHealth } = {},
): Route<T> {
  const now = options.now ?? Date.now();
  const healthOf = options.health ?? getHealth;
  const lanes = new Map<T, SwitchLane>();
  const speed = new Map<T, number>();
  for (const entry of entries) {
    const health = healthOf(entry.healthId);
    lanes.set(entry, laneOf(health, entry.slotId ? options.shared?.(entry.slotId) : undefined, now));
    // Vitesse inconnue : gardée à sa place (comptée comme rapide), pour être mesurée.
    speed.set(entry, Math.floor((averageFirstWord(health) ?? 0) / SPEED_STEP_MS));
  }
  const pick = (lane: SwitchLane) => entries.filter((e) => lanes.get(e) === lane);
  // Tri stable : une API n'en double une autre que si elle est plus rapide d'au moins une seconde.
  const ready = pick("ready").sort((a, b) => speed.get(a)! - speed.get(b)!);
  const retest = pick("retest");
  return { order: [...ready, ...retest, ...pick("paused")], retest: ready.length > 0 ? retest : [], lanes };
}
