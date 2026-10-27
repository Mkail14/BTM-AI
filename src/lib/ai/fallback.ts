import { getHealth, isCoolingDown, recordFailure, recordSuccess } from "./health";
import { AIProviderError, type AIProvider, type AIStreamChunk, type AIStreamInput } from "./types";

export type ChainEntry = { healthId: string; provider: AIProvider };

function normalize(error: unknown): AIProviderError {
  return error instanceof AIProviderError
    ? error
    : new AIProviderError("unavailable", error instanceof Error ? error.message : "Erreur inconnue", { cause: error });
}

/**
 * Essaie les API dans l'ordre. Une API qui échoue avant d'avoir écrit le
 * moindre mot (quota épuisé, clé refusée, panne…) passe la main à la
 * suivante ; une réponse déjà commencée n'est jamais recollée à une autre.
 * Les API en échec récent sont essayées en dernier.
 */
export function createFallbackProvider(entries: readonly ChainEntry[]): AIProvider {
  return {
    id: entries.map((e) => e.provider.id).join(" > "),
    async *stream(input: AIStreamInput): AsyncIterable<AIStreamChunk> {
      const now = Date.now();
      const ready = entries.filter((e) => !isCoolingDown(getHealth(e.healthId), now));
      const cooling = entries.filter((e) => isCoolingDown(getHealth(e.healthId), now));

      let lastError: AIProviderError | null = null;
      for (const { healthId, provider } of [...ready, ...cooling]) {
        if (input.signal.aborted) break;
        const startedAt = Date.now();
        let produced = false;
        try {
          for await (const chunk of provider.stream(input)) {
            if (chunk.type === "text") produced = true;
            yield chunk;
          }
          recordSuccess(healthId, Date.now() - startedAt);
          return;
        } catch (error) {
          const normalized = normalize(error);
          if (normalized.code === "aborted" || input.signal.aborted) throw normalized;
          recordFailure(healthId, normalized.code, normalized.message);
          if (produced) throw normalized;
          lastError = normalized;
        }
      }
      throw lastError ?? new AIProviderError("aborted", "Requête annulée");
    },
  };
}
