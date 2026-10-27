import "server-only";
import type { AIConfig } from "./config";
import type { KeyCheck } from "./health";
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
