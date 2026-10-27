import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { FinishReason } from "@/lib/chat/types";
import type { AIConfig } from "../config";
import { AIProviderError, type AIProvider, type AIStreamChunk, type AIStreamInput } from "../types";

function mapStopReason(reason: string | null | undefined): FinishReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
    case "model_context_window_exceeded":
      return "length";
    case "refusal":
      return "refusal";
    default:
      return "other";
  }
}

function normalizeError(error: unknown): AIProviderError {
  if (error instanceof AIProviderError) return error;
  // Du plus spécifique au plus général.
  if (error instanceof Anthropic.APIUserAbortError) {
    return new AIProviderError("aborted", "Requête annulée", { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AIProviderError("timeout", "Délai dépassé", { cause: error });
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AIProviderError("auth", "Clé API refusée par Anthropic", { cause: error });
  }
  if (error instanceof Anthropic.APIError && /credit balance|billing/i.test(error.message)) {
    return new AIProviderError("quota", "Crédit Anthropic épuisé", { cause: error });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AIProviderError("rate_limited", "Limite Anthropic atteinte", { cause: error });
  }
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
    return new AIProviderError("bad_request", `Requête refusée : ${error.message}`, { cause: error });
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new AIProviderError("overloaded", `Erreur serveur Anthropic (${error.status})`, { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AIProviderError("unavailable", "Connexion à Anthropic impossible", { cause: error });
  }
  if (error instanceof Anthropic.APIError) {
    return new AIProviderError("unavailable", `Erreur Anthropic (${error.status})`, { cause: error });
  }
  return new AIProviderError("unavailable", "Erreur inconnue du fournisseur", { cause: error });
}

export function createAnthropicProvider(config: AIConfig): AIProvider {
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    timeout: config.timeoutMs,
    maxRetries: 1,
  });

  return {
    id: "anthropic",
    async *stream({ system, messages, maxOutputTokens, signal }: AIStreamInput): AsyncIterable<AIStreamChunk> {
      let finish: FinishReason = "other";
      try {
        const stream = client.beta.messages.stream(
          {
            model: config.model,
            max_tokens: maxOutputTokens,
            system,
            messages,
            // L'effort règle la profondeur de réflexion et donc le coût.
            output_config: { effort: config.effort },
            // Met en cache le préfixe de la conversation d'un tour à l'autre.
            cache_control: { type: "ephemeral" },
            // En cas de refus par un classifieur de sécurité, Anthropic peut
            // relancer la requête sur un modèle de repli adapté.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          },
          { signal },
        );

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield { type: "text", text: event.delta.text };
          } else if (event.type === "message_delta") {
            finish = mapStopReason(event.delta.stop_reason);
          }
        }
      } catch (error) {
        throw normalizeError(error);
      }
      yield { type: "finish", reason: finish };
    },
  };
}
