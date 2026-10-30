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

export function createGeminiProvider(config: AIConfig): AIProvider {
  const model = config.model.replace(/^models\//, "");
  const endpoint = `${geminiRoot(config.baseUrl)}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;

  return {
    id: "gemini",
    async *stream({ system, messages, maxOutputTokens, signal }: AIStreamInput): AsyncIterable<AIStreamChunk> {
      const timeoutSignal = AbortSignal.timeout(config.timeoutMs);
      const combined = AbortSignal.any([signal, timeoutSignal]);

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: geminiHeaders(config.apiKey),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
            // Pas de thinkingConfig : son format change selon la génération de modèle et un
            // réglage refusé ferait échouer la requête ; le modèle garde sa réflexion par défaut.
            generationConfig: { maxOutputTokens },
          }),
          signal: combined,
        });
      } catch (error) {
        if (signal.aborted) throw new AIProviderError("aborted", "Requête annulée", { cause: error });
        if (timeoutSignal.aborted) throw new AIProviderError("timeout", "Délai dépassé", { cause: error });
        throw new AIProviderError("unavailable", "Connexion à Gemini impossible", { cause: error });
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
