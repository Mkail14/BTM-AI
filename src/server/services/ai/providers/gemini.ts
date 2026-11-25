import "server-only";
import type { FinishReason } from "@/lib/chat/types";
import type { AIConfig } from "@/lib/ai/config";
import { createSseDataParser } from "@/lib/ai/sse";
import { AIProviderError, type AIProvider, type AIStreamChunk, type AIStreamInput } from "@/lib/ai/types";
import { errorFromStatus } from "@/server/services/ai/providers/openai-compatible";
import { searchBlock, searchWeb } from "@/server/services/search/web";

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

type GeminiPart = { text?: string; thought?: boolean; thoughtSignature?: string; functionCall?: { name: string; args?: Record<string, unknown> } };

type GeminiChunk = {
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
  }[];
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
 * Recherche sans Google : quand la clé refuse la recherche Google (pas de facturation),
 * Tamilya reçoit cet outil ; le serveur cherche lui-même (services/search/web.ts).
 */
export const SEARCH_TOOL_NAME = "chercher_sur_internet";
const SEARCH_TOOL = {
  functionDeclarations: [
    {
      name: SEARCH_TOOL_NAME,
      description:
        "Cherche sur internet (moteur de recherche et Wikipédia) et renvoie les résultats avec le texte des meilleures pages. " +
        "À utiliser quand tu n'as pas l'information ou qu'elle a pu changer (fait récent, personne, chiffre, date, horaire, prix, loi, actualité). " +
        "Pas pour une simple conversation ni pour ce que tu sais déjà.",
      parameters: {
        type: "object",
        properties: { requete: { type: "string", description: "La recherche en quelques mots, comme dans un moteur de recherche, en français de préférence." } },
        required: ["requete"],
      },
    },
  ],
};
/** Ajouté aux consignes quand notre outil remplace la recherche Google. */
const SEARCH_TOOL_RULE =
  `Pour chercher sur internet, tu as l'outil ${SEARCH_TOOL_NAME}. Dès que tu ne connais pas la réponse, ou qu'elle a pu changer ` +
  "(personne en poste, résultat, prix, horaire, date, actualité, loi), cherche d'abord avec cet outil au lieu de dire que tu ne sais pas " +
  "ou que tu n'as pas accès à internet. Pour une conversation ou ce que tu sais déjà, réponds directement.";
/** Au plus deux tours de recherche, puis Tamilya répond avec ce qu'elle a. */
const MAX_SEARCH_ROUNDS = 2;
const MAX_CALLS_PER_ROUND = 2;
/**
 * Réflexion réduite (AI_DISABLE_REASONING) : les modèles récents « pensent »
 * plusieurs secondes avant d'écrire. Gemini 3 et suivants : thinkingLevel ;
 * Gemini 2 : thinkingBudget. Du plus rapide au plus prudent.
 */
/** Réflexion approfondie (question complexe) : Gemini 3 et suivants « high », Gemini 2 un budget large. */
export function deepThinking(model: string): ThinkingConfig {
  const generation = Number(model.match(/^gemini-(\d+)/)?.[1] ?? 0);
  return generation >= 3 ? { thinkingLevel: "high" } : { thinkingBudget: 8192 };
}

/** Un peu de réflexion pour un message à lire avec soin : Gemini 3 « low », Gemini 2 un petit budget, sinon rien de forcé. */
export function carefulThinking(model: string): ThinkingConfig[] {
  const generation = Number(model.match(/^gemini-(\d+)/)?.[1] ?? 0);
  if (generation >= 3) return [{ thinkingLevel: "low" }];
  if (/flash/.test(model)) return [{ thinkingBudget: 1024 }];
  return [];
}

export function thinkingSettings(model: string): ThinkingConfig[] {
  const generation = Number(model.match(/^gemini-(\d+)/)?.[1] ?? 0);
  if (generation >= 3) return [{ thinkingLevel: "minimal" }, { thinkingLevel: "low" }];
  if (/flash/.test(model)) return [{ thinkingBudget: 0 }];
  return [];
}

/** Profil de Tamilya : flash ou flash-lite stables (ni « preview », ni « pro », ni image ou voix). */
const FALLBACK_MODEL = /^gemini-[\d.]+-flash(-lite)?$/;
const MAX_MODEL_TRIES = 4;
const MODELS_CACHE_MS = 60 * 60_000;
/** Un modèle sans quota est mis de côté ce temps-là avant d'être réessayé. */
const EXHAUSTED_MS = 30 * 60_000;
/** Un modèle surchargé (5xx) ou muet est mis de côté moins longtemps. */
const OVERLOADED_MS = 2 * 60_000;
/** Délai pour recevoir le premier morceau de réponse avant de passer au modèle suivant. */
const FIRST_CHUNK_MS = 8_000;

const keyId = (apiKey: string) => apiKey.slice(-8);
const modelsCache = new Map<string, { models: string[]; expiresAt: number }>();
const exhausted = new Map<string, number>();
/** Clés qui refusent la recherche Google (429 : compte sans facturation) : réponse sans recherche ce temps-là. */
const NO_SEARCH_MS = 10 * 60_000;
const noSearch = new Map<string, number>();

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

export async function listKeyModels(config: Pick<AIConfig, "apiKey" | "baseUrl">, signal: AbortSignal): Promise<string[]> {
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
    async *stream({ system, messages, maxOutputTokens, signal, fast, model: tryModel, deep, search, careful, persona }: AIStreamInput): AsyncIterable<AIStreamChunk> {
      // Réflexion approfondie ou recherche : le premier morceau peut mettre bien plus longtemps à venir.
      const firstChunkMs = deep || search ? 45_000 : FIRST_CHUNK_MS;
      // À l'oral : modèle réservé au vocal s'il est réglé (AI_VOICE_MODEL, ex. un « flash-lite »), sinon le modèle habituel.
      // tryModel : essai d'un autre modèle par le relais signé (comparaison des temps).
      const preferred = tryModel || (fast && process.env.AI_VOICE_MODEL?.trim().replace(/^models\//, "")) || chosen;
      const timeoutSignal = AbortSignal.timeout(config.timeoutMs);
      const combined = AbortSignal.any([signal, timeoutSignal]);
      let withSearch = Boolean(search) && (noSearch.get(keyId(config.apiKey)) ?? 0) <= Date.now();

      // Réponse écrite à une personne, avec une vraie réflexion : Gemini signale ses pensées en direct,
      // et « Je réfléchis… » s'affiche pendant l'attente (pas à l'oral ni pour les tâches de fond).
      // Leur texte n'est pas montré : Gemini le résume toujours en anglais.
      const showsThoughts = (thinking: ThinkingConfig | null): thinking is ThinkingConfig =>
        Boolean(thinking && persona && !fast && !("thinkingLevel" in thinking ? thinking.thinkingLevel === "minimal" : thinking.thinkingBudget === 0));
      const withThoughts = (thinking: ThinkingConfig) => (showsThoughts(thinking) ? { ...thinking, includeThoughts: true } : thinking);

      // Recherche Google refusée par la clé : notre propre recherche, par l'outil SEARCH_TOOL.
      const tools = () => (withSearch ? { tools: [{ googleSearch: {} }] } : search ? { tools: [SEARCH_TOOL] } : {});

      // turns : échanges de recherche (appel de l'outil, résultats) ajoutés après la question.
      // lastRound : plus de recherche permise, Tamilya répond avec ce qu'elle a.
      const request = (model: string, thinkingConfig: ThinkingConfig | null, attemptSignal: AbortSignal, turns: unknown[] = [], lastRound = false) =>
        fetch(`${geminiRoot(config.baseUrl)}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
          method: "POST",
          headers: geminiHeaders(config.apiKey),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: !withSearch && search ? `${system}\n\n${SEARCH_TOOL_RULE}` : system }] },
            contents: [
              ...messages.map((m) => ({
                role: m.role === "assistant" ? "model" : "user",
                // Photo ou PDF joint : donné au modèle avant la question.
                parts: [...(m.attachment ? [{ inlineData: { mimeType: m.attachment.mimeType, data: m.attachment.data } }] : []), { text: m.content }],
              })),
              ...turns,
            ],
            generationConfig: { maxOutputTokens, ...(thinkingConfig && { thinkingConfig: withThoughts(thinkingConfig) }) },
            ...tools(),
            ...(lastRound && !withSearch && search ? { toolConfig: { functionCallingConfig: { mode: "NONE" } } } : {}),
          }),
          signal: AbortSignal.any([combined, attemptSignal]),
        });

      const rest = (model: string, ms: number) => exhausted.set(`${keyId(config.apiKey)}:${model}`, Date.now() + ms);

      /**
       * Ouvre la réponse d'un modèle et attend son premier morceau ; null si ce
       * modèle est sans quota, introuvable, surchargé ou muet trop longtemps
       * (on passe au modèle suivant de la clé).
       */
      const open = async (model: string): Promise<{ reader: ReadableStreamDefaultReader<string>; first: string; thinking: ThinkingConfig | null } | null> => {
        // Réglages de réflexion du plus rapide au plus sûr : un réglage que le modèle
        // refuse (400 qui parle de « thinking ») est retiré au lieu de faire échouer la réponse.
        // Message à lire avec soin (hors oral) : réflexion légère, même quand la réflexion est réduite par défaut.
        const attempts = deep
          ? [deepThinking(model), null]
          : careful && !fast
            ? [...carefulThinking(model), null]
            : config.disableReasoning || fast
              ? [...thinkingSettings(model), null]
              : [null];
        for (const [index, thinkingConfig] of attempts.entries()) {
          const attempt = new AbortController();
          const timer = setTimeout(() => attempt.abort(), firstChunkMs);
          const silent = (error: unknown) => {
            if (signal.aborted) return new AIProviderError("aborted", "Requête annulée", { cause: error });
            if (timeoutSignal.aborted) return new AIProviderError("timeout", "Délai dépassé", { cause: error });
            return null;
          };
          try {
            let response: Response;
            try {
              response = await request(model, thinkingConfig, attempt.signal);
            } catch (error) {
              const fatal = silent(error);
              if (fatal) throw fatal;
              if (attempt.signal.aborted) {
                rest(model, OVERLOADED_MS);
                lastError = new AIProviderError("timeout", `Gemini « ${model} » ne répond pas`, { cause: error });
                return null;
              }
              throw new AIProviderError("unavailable", "Connexion à Gemini impossible", { cause: error });
            }
            if (response.ok && response.body) {
              const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
              try {
                const { value, done } = await reader.read();
                return { reader, first: done ? "" : value, thinking: thinkingConfig };
              } catch (error) {
                reader.releaseLock();
                const fatal = silent(error);
                if (fatal) throw fatal;
                rest(model, OVERLOADED_MS);
                lastError = new AIProviderError("timeout", `Gemini « ${model} » ne répond pas`, { cause: error });
                return null;
              }
            }
            const body = await response.text().catch(() => "");
            // Recherche Google refusée (compte gratuit) : même modèle, sans la recherche, plutôt qu'aucune réponse.
            if (response.status === 429 && withSearch) {
              withSearch = false;
              noSearch.set(keyId(config.apiKey), Date.now() + NO_SEARCH_MS);
              console.warn(`[ai] Gemini « ${model} » : recherche Google refusée (429), réponse sans recherche`);
              clearTimeout(timer);
              return open(model);
            }
            if (response.status === 429 ||response.status === 404 || response.status >= 500) {
              rest(model, response.status >= 500 ? OVERLOADED_MS : EXHAUSTED_MS);
              lastError = errorFromStatus(response.status, body);
              return null;
            }
            const last = index === attempts.length - 1;
            if (last || response.status !== 400 || !/thinking/i.test(body)) throw errorFromStatus(response.status, body);
          } finally {
            clearTimeout(timer);
          }
        }
        return null;
      };

      let lastError: AIProviderError | null = null;
      const resting = (model: string) => (exhausted.get(`${keyId(config.apiKey)}:${model}`) ?? 0) > Date.now();
      let opened: Awaited<ReturnType<typeof open>> = null;
      let alternatives: string[] | null = null;
      let usedModel = preferred;
      const tried = new Set<string>();
      // Le modèle choisi d'abord (sauf s'il vient d'être refusé), puis les autres modèles de la clé.
      for (let i = 0; i < MAX_MODEL_TRIES && !opened; i++) {
        let model: string | undefined = !tried.has(preferred) && !resting(preferred) ? preferred : undefined;
        if (!model) {
          alternatives ??= fallbackModels(await listKeyModels(config, combined), preferred);
          model = alternatives.find((id) => !tried.has(id) && !resting(id)) ?? alternatives.find((id) => !tried.has(id));
        }
        if (!model) break;
        tried.add(model);
        usedModel = model;
        opened = await open(model);
        if (opened && model !== preferred) console.info(`[ai] Gemini : « ${preferred} » indisponible, réponse par « ${model} »`);
      }
      if (!opened) throw lastError ?? new AIProviderError("quota", "Aucun modèle Gemini de cette clé n'est disponible");

      let reader = opened.reader;
      let finish: FinishReason = "other";
      let pending: string | null = opened.first;
      let usage: GeminiChunk["usageMetadata"] | null = null;
      let spent = { input: 0, output: 0 };
      const sources = new Map<string, string>();
      let grounded = false;
      // Échanges de recherche (notre outil) : renvoyés à Gemini à chaque tour, avec les résultats.
      const turns: unknown[] = [];
      let rounds = 0;

      try {
        while (true) {
          const parser = createSseDataParser();
          // Tout ce que le modèle a écrit dans ce tour (avec ses signatures de pensée), à lui renvoyer s'il cherche.
          const modelParts: GeminiPart[] = [];
          const calls: NonNullable<GeminiPart["functionCall"]>[] = [];
          while (true) {
            // Le premier morceau a déjà été lu par open().
            const { value, done } = pending !== null ? { value: pending, done: false } : await reader.read();
            pending = null;
            if (done) break;
            for (const data of parser.push(value)) {
              let chunk: GeminiChunk;
              try {
                chunk = JSON.parse(data) as GeminiChunk;
              } catch {
                continue;
              }
              if (chunk.promptFeedback?.blockReason) finish = "refusal";
              // Cumul envoyé à chaque morceau : le dernier fait foi.
              if (chunk.usageMetadata) usage = chunk.usageMetadata;
              const candidate = chunk.candidates?.[0];
              for (const part of candidate?.content?.parts ?? []) {
                modelParts.push(part);
                if (part.functionCall) {
                  calls.push(part.functionCall);
                  continue;
                }
                // Les « pensées » partent à part : affichées pendant l'attente, jamais dans la réponse.
                if (part.text) yield part.thought ? { type: "thought", text: part.text } : { type: "text", text: part.text };
              }
              if (candidate?.finishReason) finish = mapFinishReason(candidate.finishReason);
              if (candidate?.groundingMetadata) grounded = true;
              for (const ground of candidate?.groundingMetadata?.groundingChunks ?? []) {
                if (ground.web?.uri) sources.set(ground.web.uri, ground.web.title ?? ground.web.uri);
              }
            }
          }
          reader.releaseLock();
          // Chaque tour a son propre cumul : on les additionne.
          const round = usage as GeminiChunk["usageMetadata"] | null;
          if (round) {
            spent = { input: spent.input + (round.promptTokenCount ?? 0), output: spent.output + (round.candidatesTokenCount ?? 0) + (round.thoughtsTokenCount ?? 0) };
            usage = null;
          }
          if (!calls.length || rounds >= MAX_SEARCH_ROUNDS) {
            if (!withSearch && search && rounds === 0) console.info(`[recherche] outil proposé à « ${usedModel} », pas utilisé`);
            break;
          }

          // Tamilya veut chercher : le serveur cherche, puis elle reprend avec les résultats.
          rounds++;
          const queries = calls.map((call) => (call.name === SEARCH_TOOL_NAME ? String(call.args?.requete ?? "").trim().slice(0, 200) : ""));
          for (const query of queries.slice(0, MAX_CALLS_PER_ROUND)) if (query) yield { type: "searching", query };
          const started = Date.now();
          const found = await Promise.all(
            queries.map((query, i) => (query && i < MAX_CALLS_PER_ROUND ? searchWeb(query, combined).catch(() => null) : Promise.resolve(null))),
          );
          console.info(`[recherche] ${queries.filter(Boolean).map((q) => `« ${q} »`).join(", ")} : ${found.map((f) => f?.results.length ?? 0).join("+")} résultat(s), ${Date.now() - started} ms`);
          for (const result of found) for (const page of result?.pages.length ? result.pages : (result?.results.slice(0, 3) ?? [])) sources.set(page.url, page.title);
          turns.push(
            { role: "model", parts: modelParts },
            {
              role: "user",
              parts: calls.map((call, i) => ({
                functionResponse: { name: call.name, response: { resultat: found[i] ? searchBlock(found[i]) : "Recherche impossible pour l'instant. Réponds avec ce que tu sais, en le disant." } },
              })),
            },
          );
          const response = await request(usedModel, opened.thinking, new AbortController().signal, turns, rounds >= MAX_SEARCH_ROUNDS);
          if (!response.ok || !response.body) throw errorFromStatus(response.status, await response.text().catch(() => ""));
          reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        }
      } catch (error) {
        if (error instanceof AIProviderError) throw error;
        if (signal.aborted) throw new AIProviderError("aborted", "Requête annulée", { cause: error });
        if (timeoutSignal.aborted) throw new AIProviderError("timeout", "Délai dépassé", { cause: error });
        throw new AIProviderError("unavailable", "Flux interrompu par Gemini", { cause: error });
      } finally {
        try {
          reader.releaseLock();
        } catch {}
      }

      if (spent.input || spent.output) yield { type: "usage", model: usedModel, inputTokens: spent.input, outputTokens: spent.output };
      // Journal : la recherche a-t-elle vraiment servi ? (sans métadonnée : réponse de mémoire)
      if (withSearch) console.info(`[ai] recherche Google (${usedModel}) : ${grounded ? `${sources.size} source(s)` : "pas utilisée"}`);
      if (sources.size) yield { type: "sources", sources: [...sources].slice(0, 6).map(([url, title]) => ({ url, title })) };
      yield { type: "finish", reason: finish };
    },
  };
}
