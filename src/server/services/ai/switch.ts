import "server-only";
import { after } from "next/server";
import { normalizeAIError, type ChainEntry } from "@/lib/ai/fallback";
import { recordFailure, recordSuccess } from "@/lib/ai/health";
import { AIProviderError } from "@/lib/ai/types";
import { recordApiResult } from "@/server/services/ai/api-status";
import { recordAiUsage } from "@/server/services/ai/usage";

/** Un même serveur ne reteste pas une API plus d'une fois toutes les 20 s. */
const RETEST_GAP_MS = 20_000;
const RETEST_TIMEOUT_MS = 12_000;
const lastRetest = new Map<string, number>();

/**
 * Essai minuscule (quelques jetons) d'une API dont la pause est finie, après la
 * réponse au message : si elle remarche, l'aiguillage la repropose tout de suite ;
 * sinon sa pause repart, partagée avec les autres serveurs.
 */
async function probe({ healthId, provider, slotId }: ChainEntry): Promise<void> {
  const startedAt = Date.now();
  try {
    for await (const chunk of provider.stream({
      system: "Réponds seulement : ok",
      messages: [{ role: "user", content: "ok" }],
      maxOutputTokens: 16,
      fast: true,
      signal: AbortSignal.timeout(RETEST_TIMEOUT_MS),
    })) {
      if (chunk.type === "usage") recordAiUsage(chunk.model, chunk.inputTokens, chunk.outputTokens);
    }
    recordSuccess(healthId, Date.now() - startedAt);
    if (slotId) recordApiResult(slotId, null);
  } catch (error) {
    let failure = normalizeAIError(error);
    // Coupé par notre délai : l'API n'a pas répondu à temps.
    if (failure.code === "aborted") failure = new AIProviderError("timeout", "Pas de réponse au retest de l'aiguillage.");
    recordFailure(healthId, failure.code, failure.message);
    if (slotId) recordApiResult(slotId, failure);
  }
}

/** Retest de fond, sans faire attendre le message en cours. */
export function retestApis(entries: readonly ChainEntry[]): void {
  const now = Date.now();
  for (const entry of entries) {
    if (now - (lastRetest.get(entry.healthId) ?? 0) < RETEST_GAP_MS) continue;
    lastRetest.set(entry.healthId, now);
    const task = () => probe(entry);
    try {
      after(task);
    } catch {
      // Hors requête : essai lancé sans attente.
      void task();
    }
  }
}
