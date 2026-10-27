import "server-only";
import type { FinishReason } from "@/lib/chat/types";
import type { AIConfig } from "../config";
import { createSseDataParser } from "../sse";
import { AIProviderError, type AIProvider, type AIStreamChunk, type AIStreamInput } from "../types";

/**
 * Fournisseur générique pour les API compatibles « Chat Completions »
 * (OpenAI, Mistral, OpenRouter, Groq, Ollama, vLLM…).
 */

type CompletionChunk = {
  choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
};

function mapFinishReason(reason: string | null | undefined): FinishReason {
  if (reason === "stop") return "stop";
  if (reason === "length") return "length";
  if (reason === "content_filter") return "refusal";
  return "other";
}

/** Un 429 qui parle de jour, de crédit ou de quota ne se lèvera pas dans la minute. */
const QUOTA_HINT = /per[-_ ]?day|daily|quota|credit|insufficient|billing|exceeded your/i;

export function errorFromStatus(status: number, body = ""): AIProviderError {
  const detail = body.slice(0, 300);
  if (status === 402) return new AIProviderError("quota", `Crédit épuisé (402) ${detail}`.trim());
  if (status === 401 || status === 403) return new AIProviderError("auth", `Clé API refusée (${status})`);
  if (status === 429) {
    return QUOTA_HINT.test(detail)
      ? new AIProviderError("quota", `Quota épuisé (429) ${detail}`.trim())
      : new AIProviderError("rate_limited", "Limite du fournisseur atteinte");
  }
  if (status === 400 || status === 404 || status === 422) {
    return new AIProviderError("bad_request", `Requête refusée par le fournisseur (${status})`);
  }
  if (status >= 500) return new AIProviderError("overloaded", `Erreur serveur du fournisseur (${status})`);
  return new AIProviderError("unavailable", `Réponse inattendue du fournisseur (${status})`);
}

export function createOpenAICompatibleProvider(config: AIConfig): AIProvider {
  const endpoint = `${(config.baseUrl ?? "").replace(/\/+$/, "")}/chat/completions`;
  // L'API OpenAI officielle attend max_completion_tokens ; la plupart des
  // autres services compatibles attendent encore max_tokens.
  const maxTokensField = endpoint.includes("api.openai.com") ? "max_completion_tokens" : "max_tokens";

  return {
    id: "openai-compatible",
    async *stream({ system, messages, maxOutputTokens, signal }: AIStreamInput): AsyncIterable<AIStreamChunk> {
      const timeoutSignal = AbortSignal.timeout(config.timeoutMs);
      const combined = AbortSignal.any([signal, timeoutSignal]);

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            stream: true,
            [maxTokensField]: maxOutputTokens,
            ...(config.disableReasoning && { reasoning: { enabled: false } }),
            messages: [{ role: "system", content: system }, ...messages],
          }),
          signal: combined,
        });
      } catch (error) {
        if (signal.aborted) throw new AIProviderError("aborted", "Requête annulée", { cause: error });
        if (timeoutSignal.aborted) throw new AIProviderError("timeout", "Délai dépassé", { cause: error });
        throw new AIProviderError("unavailable", "Connexion au fournisseur impossible", { cause: error });
      }

      if (!response.ok || !response.body) {
        const body = await response.text().catch(() => "");
        throw errorFromStatus(response.status, body);
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      const parser = createSseDataParser();
      let finish: FinishReason = "other";

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const data of parser.push(value)) {
            if (data === "[DONE]") continue;
            let chunk: CompletionChunk;
            try {
              chunk = JSON.parse(data) as CompletionChunk;
            } catch {
              continue;
            }
            const choice = chunk.choices?.[0];
            const text = choice?.delta?.content;
            if (text) yield { type: "text", text };
            if (choice?.finish_reason) finish = mapFinishReason(choice.finish_reason);
          }
        }
      } catch (error) {
        if (signal.aborted) throw new AIProviderError("aborted", "Requête annulée", { cause: error });
        if (timeoutSignal.aborted) throw new AIProviderError("timeout", "Délai dépassé", { cause: error });
        throw new AIProviderError("unavailable", "Flux interrompu par le fournisseur", { cause: error });
      } finally {
        reader.releaseLock();
      }

      yield { type: "finish", reason: finish };
    },
  };
}
