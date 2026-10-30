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

/** Profil d'Awa : flash ou flash-lite stables (ni « preview », ni « pro », ni image ou voix). */
const FALLBACK_MODEL = /^gemini-[\d.]+-flash(-lite)?$/;
const MAX_MODEL_TRIES = 4;
const MODELS_CACHE_MS = 60 * 60_000;
/** Un modèle sans quota est mis de côté ce temps-là avant d'être réessayé. */
const EXHAUSTED_MS = 30 * 60_000;

const keyId = (apiKey: string) => apiKey.slice(-8);
const modelsCache = new Map<string, { models: string[]; expiresAt: number }>();
const exhausted = new Map<string, number>();

/**
 * Autres modèles de la clé à essayer quand le modèle choisi est sans quota :
 * chez Google, chaque modèle a son propre quota (souvent 0 en gratuit pour
 * les plus récents, alors que les « flash-lite » ou versions précédentes en ont).
 * Du plus récent au plus ancien, flash avant flash-lite à version égale.
 */
export function fallbackModels(available: readonly string[], chosen: string): string[] {
  const version = (id: string) => (id.match(/^gemini-([\d.]+)/)?.[1] ?? "0").split(".").map(Number);
  const newer = (a: string, b: string) => {
    const [va, vb] = [version(a), version(b)];
    for (let i = 0; i < Math.max(va.length, vb.length); i++) if ((va[i] ?? 0) !== (vb[i] ?? 0)) return (vb[i] ?? 0) - (va[i] ?? 0);
    return Number(a.endsWith("-lite")) - Number(b.endsWith("-lite"));
  };
  return available.filter((id) => id !== chosen && FALLBACK_MODEL.test(id)).sort(newer);
}

async function listKeyModels(config: AIConfig, signal: AbortSignal): Promise<string[]> {
  const cached = modelsCache.get(keyId(config.apiKey));
  if (cached && cached.expiresAt > Date.now()) return cached.models;
  try {
    const response = await fetch(`${geminiRoot(config.baseUrl)}/models?pageSize=1000`, { headers: geminiHeaders(config.apiKey), signal });
    if (!response.ok) return [];
    const json = (await response.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
    const models = (json.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && typeof m.name === "string")
      .map((m) => m.name!.replace(/^models\//, ""));
    modelsCache.set(keyId(config.apiKey), { models, expiresAt: Date.now() + MODELS_CACHE_MS });
    return models;
  } catch {
    return [];
  }
}

export function createGeminiProvider(config: AIConfig): AIProvider {
  const chosen = config.model.replace(/^models\//, "");

  return {
    id: "gemini",
    async *stream({ system, messages, maxOutputTokens, signal }: AIStreamInput): AsyncIterable<AIStreamChunk> {
      const timeoutSignal = AbortSignal.timeout(config.timeoutMs);
      const combined = AbortSignal.any([signal, timeoutSignal]);

      const request = (model: string, thinkingConfig: ThinkingConfig | null) =>
        fetch(`${geminiRoot(config.baseUrl)}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
          method: "POST",
          headers: geminiHeaders(config.apiKey),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
            generationConfig: { maxOutputTokens, ...(thinkingConfig && { thinkingConfig }) },
          }),
          signal: combined,
        });

      /** Ouvre la réponse d'un modèle ; null si ce modèle n'a pas de quota ou n'existe pas (on passe au suivant). */
      const open = async (model: string): Promise<Response | null> => {
        // Réglages de réflexion du plus rapide au plus sûr : un réglage que le modèle
        // refuse (400 qui parle de « thinking ») est retiré au lieu de faire échouer la réponse.
        const attempts = config.disableReasoning ? [...thinkingSettings(model), null] : [null];
        for (const [index, thinkingConfig] of attempts.entries()) {
          let response: Response;
          try {
            response = await request(model, thinkingConfig);
          } catch (error) {
            if (signal.aborted) throw new AIProviderError("aborted", "Requête annulée", { cause: error });
            if (timeoutSignal.aborted) throw new AIProviderError("timeout", "Délai dépassé", { cause: error });
            throw new AIProviderError("unavailable", "Connexion à Gemini impossible", { cause: error });
          }
          if (response.ok && response.body) return response;
          const body = await response.text().catch(() => "");
          if (response.status === 429 || response.status === 404) {
            exhausted.set(`${keyId(config.apiKey)}:${model}`, Date.now() + EXHAUSTED_MS);
            lastError = errorFromStatus(response.status, body);
            return null;
          }
          const last = index === attempts.length - 1;
          if (last || response.status !== 400 || !/thinking/i.test(body)) throw errorFromStatus(response.status, body);
        }
        return null;
      };

      let lastError: AIProviderError | null = null;
      const resting = (model: string) => (exhausted.get(`${keyId(config.apiKey)}:${model}`) ?? 0) > Date.now();
      let response: Response | null = null;
      let alternatives: string[] | null = null;
      const tried = new Set<string>();
      // Le modèle choisi d'abord (sauf s'il vient d'être refusé), puis les autres modèles de la clé.
      for (let i = 0; i < MAX_MODEL_TRIES && !response; i++) {
        let model: string | undefined = !tried.has(chosen) && !resting(chosen) ? chosen : undefined;
        if (!model) {
          alternatives ??= fallbackModels(await listKeyModels(config, combined), chosen);
          model = alternatives.find((id) => !tried.has(id) && !resting(id)) ?? alternatives.find((id) => !tried.has(id));
        }
        if (!model) break;
        tried.add(model);
        response = await open(model);
        if (response && model !== chosen) console.info(`[ai] Gemini : « ${chosen} » sans quota, réponse par « ${model} »`);
      }
      if (!response) throw lastError ?? new AIProviderError("quota", "Aucun modèle Gemini de cette clé n'a de quota disponible");

      // Corps présent : open() ne renvoie qu'une réponse ok avec un flux.
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
