import { averageFirstWord, getHealth, recordFailure, recordFirstWord, recordSuccess } from "./health";
import { planRoute, type SharedState } from "./switch";
import { recordAiUsage } from "@/server/services/ai/usage";
import { recordApiResult } from "@/server/services/ai/api-status";
import { AIProviderError, type AIProvider, type AIStreamChunk, type AIStreamInput } from "./types";

export type ChainEntry = { healthId: string; provider: AIProvider; slotId?: string };

export type SwitchOptions = {
  /** Dernier résultat de chaque API vu par tous les serveurs. */
  shared?: (slotId: string) => SharedState | undefined;
  /** Retest de fond des API dont la pause est finie (sans faire attendre le message). */
  retest?: (entries: ChainEntry[]) => void;
  /** Course : délai avant de lancer une seconde API (null : jamais). Par défaut : hedgeDelay. */
  hedgeMs?: (input: AIStreamInput, entry: ChainEntry) => number | null;
};

export function normalizeAIError(error: unknown): AIProviderError {
  return error instanceof AIProviderError
    ? error
    : new AIProviderError("unavailable", error instanceof Error ? error.message : "Erreur inconnue", { cause: error });
}

/** Plafond du délai de course, même pour une API lente d'habitude. */
const HEDGE_MAX_MS = 5_000;

/**
 * Course entre deux API : si l'API choisie n'a pas écrit son premier mot après ce délai,
 * la suivante est lancée en même temps et la première qui écrit gagne.
 * Jamais pour une réflexion approfondie (lente exprès : la course paierait deux fois pour rien).
 */
export function hedgeDelay(input: AIStreamInput, entry: ChainEntry): number | null {
  if (input.deep) return null;
  const base = input.fast ? 1_200 : input.search || input.careful ? 4_000 : 2_000;
  const usual = averageFirstWord(getHealth(entry.healthId));
  // Une API un peu lente d'habitude n'est pas doublée à chaque message : on lui laisse son temps habituel.
  return Math.min(Math.max(base, usual ? Math.round(usual * 1.3) : 0), HEDGE_MAX_MS);
}

type Attempt = {
  entry: ChainEntry;
  controller: AbortController;
  startedAt: number;
  /** Morceaux reçus avant le premier mot (sources…), rendus si cette API gagne. */
  held: AIStreamChunk[];
  cancelled: boolean;
};

type Event =
  | { attempt: Attempt; kind: "chunk"; chunk: AIStreamChunk }
  | { attempt: Attempt; kind: "end" }
  | { attempt: Attempt; kind: "error"; error: AIProviderError };

/**
 * Envoie le message à l'API choisie par l'aiguillage (switch.ts) : une API qui
 * marche, la plus rapide d'abord ; les API épuisées ou en panne passent en dernier
 * et sont retestées en arrière-plan. Si elle tarde à écrire son premier mot, une
 * seconde API prête fait la course (hedgeDelay) et la première qui écrit gagne.
 * Une API qui échoue avant d'avoir écrit passe la main ; une réponse déjà
 * commencée n'est jamais recollée à une autre.
 */
export function createFallbackProvider(entries: readonly ChainEntry[], options: SwitchOptions = {}): AIProvider {
  const hedgeOf = options.hedgeMs ?? hedgeDelay;
  return {
    id: entries.map((e) => e.provider.id).join(" > "),
    async *stream(input: AIStreamInput): AsyncIterable<AIStreamChunk> {
      const route = planRoute(entries, { shared: options.shared });
      if (route.retest.length > 0) options.retest?.(route.retest);

      const pending = [...route.order];
      const running = new Set<Attempt>();
      const events: Event[] = [];
      let wake: (() => void) | null = null;
      const push = (event: Event) => {
        events.push(event);
        wake?.();
      };

      const start = (entry: ChainEntry) => {
        const controller = new AbortController();
        const attempt: Attempt = { entry, controller, startedAt: Date.now(), held: [], cancelled: false };
        running.add(attempt);
        const signal = AbortSignal.any([input.signal, controller.signal]);
        void (async () => {
          try {
            for await (const chunk of entry.provider.stream({ ...input, signal })) push({ attempt, kind: "chunk", chunk });
            push({ attempt, kind: "end" });
          } catch (error) {
            push({ attempt, kind: "error", error: normalizeAIError(error) });
          }
        })();
      };
      const cancel = (attempt: Attempt) => {
        attempt.cancelled = true;
        running.delete(attempt);
        attempt.controller.abort();
      };

      let winner: Attempt | null = null;
      let lastError: AIProviderError | null = null;
      const win = (attempt: Attempt) => {
        winner = attempt;
        for (const other of [...running]) if (other !== attempt) cancel(other);
        if (attempt.entry.slotId) input.onAttempt?.(attempt.entry.slotId);
      };
      // Délai avant la course, ou null : déjà deux API lancées, réponse commencée,
      // ou pas d'autre API « prête » (doubler avec une API en pause ne servirait à rien).
      const raceIn = (): number | null => {
        if (winner || running.size !== 1 || pending.length === 0 || route.lanes.get(pending[0]) !== "ready") return null;
        const [leader] = running;
        const delay = hedgeOf(input, leader.entry);
        return delay === null ? null : delay - (Date.now() - leader.startedAt);
      };

      try {
        while (true) {
          if (input.signal.aborted) throw new AIProviderError("aborted", "Requête annulée");
          if (!winner && running.size === 0) {
            const next = pending.shift();
            if (!next) throw lastError ?? new AIProviderError("aborted", "Requête annulée");
            start(next);
          }

          if (events.length === 0) {
            const waitMs = raceIn();
            if (waitMs !== null && waitMs <= 0) {
              start(pending.shift()!);
              continue;
            }
            await new Promise<void>((resolve) => {
              const timer = waitMs === null ? null : setTimeout(finish, waitMs);
              function finish() {
                if (timer) clearTimeout(timer);
                input.signal.removeEventListener("abort", finish);
                wake = null;
                resolve();
              }
              wake = finish;
              input.signal.addEventListener("abort", finish, { once: true });
            });
            continue;
          }

          const event = events.shift()!;
          const { attempt } = event;
          // Consommation : enregistrée pour toutes les API lancées (même perdantes), jamais transmise.
          if (event.kind === "chunk" && event.chunk.type === "usage") {
            recordAiUsage(event.chunk.model, event.chunk.inputTokens, event.chunk.outputTokens);
            continue;
          }
          if (attempt.cancelled) continue;
          const { healthId, slotId } = attempt.entry;

          if (event.kind === "chunk") {
            const { chunk } = event;
            if (winner === attempt) {
              yield chunk;
            } else if (chunk.type !== "text") {
              attempt.held.push(chunk);
            } else {
              // Premier mot : cette API gagne la course.
              win(attempt);
              recordFirstWord(healthId, Date.now() - attempt.startedAt);
              yield* attempt.held;
              attempt.held = [];
              yield chunk;
            }
            continue;
          }

          running.delete(attempt);
          if (event.kind === "end") {
            if (winner !== attempt) {
              // Fin sans aucun mot : c'est quand même la réponse.
              win(attempt);
              yield* attempt.held;
            }
            recordSuccess(healthId, Date.now() - attempt.startedAt);
            // Tableau de bord et aiguillage : ce que ce vrai message a obtenu de cette API.
            if (slotId) recordApiResult(slotId, null);
            return;
          }

          const { error } = event;
          if (error.code === "aborted" || input.signal.aborted) throw error;
          recordFailure(healthId, error.code, error.message);
          if (slotId) recordApiResult(slotId, error);
          // Réponse déjà commencée : jamais recollée à une autre API.
          if (winner === attempt) throw error;
          if (slotId) input.onAttempt?.(slotId, error.code);
          lastError = error;
        }
      } finally {
        for (const attempt of [...running]) cancel(attempt);
      }
    },
  };
}
