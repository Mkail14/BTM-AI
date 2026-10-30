import "server-only";
import type { AIConfig, AISlot } from "./config";
import { createFallbackProvider } from "./fallback";
import { createAnthropicProvider } from "./providers/anthropic";
import { createOpenAICompatibleProvider } from "./providers/openai-compatible";
import { ALL_APIS_CUT, loadFlowCuts } from "./flow-cuts";
import { loadAIChain } from "./registry";
import type { AIProvider } from "./types";

export { buildSystemPrompt } from "./system-prompt";
export { AIProviderError } from "./types";

/** Identifiant de suivi : change si le modèle ou la clé de l'API change. */
export function slotHealthId(slotId: string, config: AIConfig): string {
  return `${slotId}:${config.provider}:${config.model}:${config.apiKey.slice(-6)}`;
}

export function createProvider(config: AIConfig): AIProvider {
  return config.provider === "anthropic" ? createAnthropicProvider(config) : createOpenAICompatibleProvider(config);
}

let cached: { key: string; provider: AIProvider; config: AIConfig } | null = null;

/**
 * Renvoie le fournisseur configuré, ou la raison pour laquelle il ne l'est pas.
 * Les API de secours (AI_2_…, puis celles ajoutées depuis /admin/modele-ia)
 * prennent le relais quand la précédente est épuisée ou en panne.
 * Aucune réponse simulée n'est produite en l'absence de configuration.
 */
export async function getAIProvider(
  /** Liens coupés déjà lus pour ce message (évite une seconde lecture). */
  knownCuts?: Set<string>,
): Promise<{ ok: true; provider: AIProvider; config: AIConfig } | { ok: false; reason: string }> {
  const [fullChain, cuts] = await Promise.all([loadAIChain(), knownCuts ?? loadFlowCuts()]);
  // API débranchées sur le schéma de /admin/modele-ia : hors de la chaîne de secours.
  const chain = fullChain.filter((s) => !cuts.has(s.id));
  const usable = chain.filter((s): s is AISlot & { result: { ok: true } } => s.result.ok);
  if (usable.length === 0) {
    if (chain.length === 0 && fullChain.length > 0) return { ok: false, reason: ALL_APIS_CUT };
    const first = chain[0]?.result;
    return first && !first.ok ? first : { ok: false, reason: "Aucune API utilisable." };
  }

  const key = JSON.stringify(usable.map((s) => [s.id, s.result.config]));
  if (cached?.key !== key) {
    const provider = createFallbackProvider(
      usable.map((s) => ({
        slotId: s.id,
        healthId: slotHealthId(s.id, s.result.config),
        provider: createProvider(s.result.config),
      })),
    );
    // Délai et plafond de la première API utilisable : ils bornent toute la chaîne.
    cached = { key, provider, config: usable[0].result.config };
  }
  return { ok: true, provider: cached.provider, config: cached.config };
}
