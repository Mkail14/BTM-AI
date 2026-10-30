import "server-only";
import type { AIConfig } from "./config";
import type { KeyCheck } from "./health";
import { geminiHeaders, geminiRoot, isGeminiUrl } from "./providers/gemini";
import { errorFromStatus } from "./providers/openai-compatible";

const CHECK_TIMEOUT_MS = 6_000;

type OpenRouterKey = {
  data?: {
    usage?: number;
    usage_daily?: number;
    limit?: number | null;
    limit_remaining?: number | null;
    limit_reset?: string | null;
    is_free_tier?: boolean;
  };
};

/**
 * Vérifie la clé sans rien générer (donc sans coût) : liste des modèles, ou
 * pour OpenRouter la fiche de la clé, qui donne aussi le crédit restant.
 */
export async function checkKey(config: AIConfig): Promise<KeyCheck> {
  const base = (config.baseUrl ?? "").replace(/\/+$/, "");
  const isOpenRouter = /openrouter\.ai/.test(base);

  let url: string;
  let headers: Record<string, string>;
  if (config.provider === "anthropic") {
    url = `${base || "https://api.anthropic.com"}/v1/models?limit=1`;
    headers = { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" };
  } else if (isGeminiUrl(base)) {
    url = `${geminiRoot(base)}/models?pageSize=1`;
    headers = geminiHeaders(config.apiKey);
  } else {
    url = isOpenRouter ? `${base}/key` : `${base}/models`;
    headers = { Authorization: `Bearer ${config.apiKey}` };
  }

  let response: Response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS), cache: "no-store" });
  } catch {
    return { ok: false, code: "unavailable", message: "Le fournisseur ne répond pas à la vérification." };
  }

  if (!response.ok) {
    const error = errorFromStatus(response.status, await response.text().catch(() => ""));
    return { ok: false, code: error.code, message: error.message };
  }

  if (!isOpenRouter) {
    await response.body?.cancel();
    return { ok: true };
  }
  const json = (await response.json().catch(() => ({}))) as OpenRouterKey;
  const data = json.data ?? {};
  return {
    ok: true,
    credit: {
      usage: data.usage ?? 0,
      usageDaily: data.usage_daily ?? null,
      limit: data.limit ?? null,
      remaining: data.limit_remaining ?? null,
      limitReset: data.limit_reset ?? null,
      freeTier: Boolean(data.is_free_tier),
    },
  };
}

// Modèles qui ne savent pas discuter (voix, images, embeddings…) : jamais proposés.
const NOT_CHAT = /embed|tts|whisper|dall-e|audio|realtime|image|moderation|transcribe|search|rerank|guard|safety|davinci|babbage/i;

/**
 * Modèles de discussion auxquels la clé donne accès (gratuit, rien n'est
 * généré). En cas d'échec, le message dit pourquoi (clé refusée, panne…).
 */
export async function listModels(config: Pick<AIConfig, "provider" | "baseUrl" | "apiKey">): Promise<
  { ok: true; models: string[] } | { ok: false; message: string }
> {
  const base = (config.baseUrl ?? "").replace(/\/+$/, "");
  const anthropic = config.provider === "anthropic";
  // Gemini : API native (les clés « AQ. » ne passent pas par la couche compatible OpenAI).
  const gemini = !anthropic && isGeminiUrl(base);
  const url = anthropic
    ? `${base || "https://api.anthropic.com"}/v1/models?limit=1000`
    : gemini
      ? `${geminiRoot(base)}/models?pageSize=1000`
      : `${base}/models`;
  const headers: Record<string, string> = anthropic
    ? { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" }
    : gemini
      ? geminiHeaders(config.apiKey)
      : { Authorization: `Bearer ${config.apiKey}` };

  let response: Response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS), cache: "no-store" });
  } catch {
    return { ok: false, message: "Le fournisseur ne répond pas." };
  }
  if (!response.ok) {
    const error = errorFromStatus(response.status, await response.text().catch(() => ""));
    return { ok: false, message: error.code === "auth" ? "Clé refusée par le fournisseur." : error.message };
  }
  const json = (await response.json().catch(() => ({}))) as {
    data?: { id?: unknown }[];
    models?: { name?: unknown; supportedGenerationMethods?: unknown }[];
  };
  const ids = gemini
    ? (json.models ?? [])
        .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
        .map((m) => m.name)
    : (json.data ?? []).map((m) => m.id);
  const models = ids
    .filter((id): id is string => typeof id === "string" && !NOT_CHAT.test(id))
    // Gemini préfixe ses modèles par « models/ » ; l'API compatible OpenAI les attend sans.
    .map((id) => id.replace(/^models\//, ""))
    .sort((a, b) => a.localeCompare(b));
  return models.length > 0 ? { ok: true, models } : { ok: false, message: "Aucun modèle de discussion trouvé pour cette clé." };
}
