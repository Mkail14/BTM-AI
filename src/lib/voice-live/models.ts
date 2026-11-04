import "server-only";
import { geminiHeaders, geminiRoot } from "@/lib/ai/providers/gemini";
import { geminiKey } from "@/lib/ai/voice/gemini-tts";

/**
 * Modèles de la clé qui parlent en direct (Live API, « bidiGenerateContent »).
 * Ordre : voix native d'abord (ils entendent et parlent sans passer par du
 * texte, les plus rapides), puis « live », puis « omni » ; flash avant pro ;
 * les plus récents d'abord. AI_LIVE_MODEL impose un modèle.
 */
export function rankLiveModels(models: { name: string; methods: string[] }[]): string[] {
  const score = (id: string) => (/native-audio/.test(id) ? 0 : /live/.test(id) ? 1 : /omni/.test(id) ? 2 : 3) * 10 + (/pro/.test(id) ? 1 : 0);
  const version = (id: string) => Number(id.match(/gemini-([\d.]+)/)?.[1] ?? 0);
  return models
    .filter((m) => m.methods.includes("bidiGenerateContent"))
    .map((m) => m.name)
    .sort((a, b) => score(a) - score(b) || version(b) - version(a));
}

let cache: { models: string[]; expiresAt: number } | null = null;

export async function liveModels(): Promise<string[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.models;
  const key = await geminiKey();
  const response = await fetch(`${geminiRoot(key.baseUrl)}/models?pageSize=1000`, { headers: geminiHeaders(key.apiKey), signal: AbortSignal.timeout(8_000) });
  if (!response.ok) return [];
  const json = (await response.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
  const models = rankLiveModels(
    (json.models ?? []).flatMap((m) => (m.name ? [{ name: m.name.replace(/^models\//, ""), methods: m.supportedGenerationMethods ?? [] }] : [])),
  );
  cache = { models, expiresAt: Date.now() + 60 * 60_000 };
  return models;
}

export async function chooseLiveModel(): Promise<string | null> {
  const forced = process.env.AI_LIVE_MODEL?.trim().replace(/^models\//, "");
  if (forced) return forced;
  return (await liveModels())[0] ?? null;
}
