import "server-only";
import type { FinishReason } from "@/lib/chat/types";
import type { AIConfig } from "../config";
import { createSseDataParser } from "../sse";
import { AIProviderError, type AIProvider, type AIStreamChunk, type AIStreamInput } from "../types";
import { errorFromStatus } from "./openai-compatible";

/**
 * Google Gemini par son API native. Les clés « AQ. » que Google AI Studio
 * délivre désormais ne passent pas par la couche compatible OpenAI
 * (…/v1beta/openai) : on parle directement à generateContent, clé dans
 * l'en-tête x-goog-api-key (valable aussi pour les anciennes clés « AIza »).
 */

export const isGeminiUrl = (baseUrl: string | undefined) => /generativelanguage\.googleapis\.com/.test(baseUrl ?? "");

/** Racine de l'API native, quelle que soit l'adresse enregistrée (avec ou sans « /openai »). */
export function geminiRoot(baseUrl: string | undefined): string {
  try {
    return `${new URL(baseUrl ?? "").origin}/v1beta`;
  } catch {
    return "https://generativelanguage.googleapis.com/v1beta";
  }
}

export const geminiHeaders = (apiKey: string) => ({ "Content-Type": "application/json", "x-goog-api-key": apiKey });

type GeminiChunk = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

function mapFinishReason(reason: string | undefined): FinishReason {
  if (reason === "STOP") return "stop";
  if (reason === "MAX_TOKENS") return "length";
  if (reason && /SAFETY|BLOCKLIST|PROHIBITED|RECITATION|SPII/.test(reason)) return "refusal";
  return "other";
}

type ThinkingConfig = { thinkingLevel: string } | { thinkingBudget: number };

/**
 * Réflexion réduite (AI_DISABLE_REASONING) : les modèles récents « pensent »
 * plusieurs secondes avant d'écrire. Gemini 3 et suivants : thinkingLevel ;
 * Gemini 2 : thinkingBudget. Du plus rapide au plus prudent.
 */
export function thinkingSettings(model: string): ThinkingConfig[] {
  const generation = Number(model.match(/^gemini-(\d+)/)?.[1] ?? 0);
  if (generation >= 3) return [{ thinkingLevel: "minimal" }, { thinkingLevel: "low" }];
  if (/flash/.test(model)) return [{ thinkingBudget: 0 }];
  return [];
}

export function createGeminiProvider(config: AIConfig): AIProvider {
  const model = config.model.replace(/^models\//, "");
  const endpoint = `${geminiRoot(config.baseUrl)}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;

  return {
    id: "gemini",
    async *stream({ system, messages, maxOutputTokens, signal }: AIStreamInput): AsyncIterable<AIStreamChunk> {
      const timeoutSignal = AbortSignal.timeout(config.timeoutMs);
      const combined = AbortSignal.any([signal, timeoutSignal]);

      const request = (thinkingConfig: ThinkingConfig | null) =>
        fetch(endpoint, {
          method: "POST",
          headers: geminiHeaders(config.apiKey),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
            generationConfig: { maxOutputTokens, ...(thinkingConfig && { thinkingConfig }) },
          }),
          signal: combined,
        });

      // Réglages de réflexion du plus rapide au plus sûr : un réglage que le modèle
      // refuse (400 qui parle de « thinking ») est retiré au lieu de faire échouer la réponse.
      const attempts = config.disableReasoning ? [...thinkingSettings(model), null] : [null];
      let response!: Response;
      for (const [index, thinkingConfig] of attempts.entries()) {
        try {
          response = await request(thinkingConfig);
        } catch (error) {
          if (signal.aborted) throw new AIProviderError("aborted", "Requête annulée", { cause: error });
          if (timeoutSignal.aborted) throw new AIProviderError("timeout", "Délai dépassé", { cause: error });
          throw new AIProviderError("unavailable", "Connexion à Gemini impossible", { cause: error });
        }
        if (response.ok && response.body) break;
        const body = await response.text().catch(() => "");
        const last = index === attempts.length - 1;
        if (last || response.status !== 400 || !/thinking/i.test(body)) throw errorFromStatus(response.status, body);
      }

      // Corps présent : la boucle ci-dessus ne sort qu'avec une réponse ok et un flux.
      const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
      const parser = createSseDataParser();
      let finish: FinishReason = "other";

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const data of parser.push(value)) {
            let chunk: GeminiChunk;
            try {
              chunk = JSON.parse(data) as GeminiChunk;
            } catch {
              continue;
            }
            if (chunk.promptFeedback?.blockReason) finish = "refusal";
            const candidate = chunk.candidates?.[0];
            for (const part of candidate?.content?.parts ?? []) {
              // Les « pensées » du modèle ne sont pas montrées.
              if (part.text && !part.thought) yield { type: "text", text: part.text };
            }
            if (candidate?.finishReason) finish = mapFinishReason(candidate.finishReason);
          }
        }
      } catch (error) {
        if (signal.aborted) throw new AIProviderError("aborted", "Requête annulée", { cause: error });
        if (timeoutSignal.aborted) throw new AIProviderError("timeout", "Délai dépassé", { cause: error });
        throw new AIProviderError("unavailable", "Flux interrompu par Gemini", { cause: error });
      } finally {
        reader.releaseLock();
      }

      yield { type: "finish", reason: finish };
    },
  };
}
