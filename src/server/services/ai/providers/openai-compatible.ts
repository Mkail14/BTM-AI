import "server-only";
import type { ChatTurn, FinishReason } from "@/lib/chat/types";
import type { AIConfig } from "@/lib/ai/config";
import { harmonyFor, withoutEmoji } from "@/lib/ai/harmonize";
import { createSseDataParser } from "@/lib/ai/sse";
import { AIProviderError, type AIProvider, type AIStreamChunk, type AIStreamInput } from "@/lib/ai/types";
import {
  MAX_SEARCH_ROUNDS,
  SEARCH_TOOL_DESCRIPTION,
  SEARCH_TOOL_NAME,
  SEARCH_TOOL_PARAMETERS,
  SEARCH_TOOL_RULE,
  runSearches,
  searchQuery,
  shownQueries,
} from "@/server/services/search/tool";

/**
 * Fournisseur générique pour les API compatibles « Chat Completions »
 * (OpenAI, Mistral, OpenRouter, Groq, Ollama, vLLM…).
 */

type ToolCallDelta = { index?: number; id?: string; function?: { name?: string; arguments?: string } };

type CompletionChunk = {
  choices?: { delta?: { content?: string | null; tool_calls?: ToolCallDelta[] }; finish_reason?: string | null }[];
};

/** Outil de recherche au format « Chat Completions ». */
const SEARCH_TOOL = { type: "function", function: { name: SEARCH_TOOL_NAME, description: SEARCH_TOOL_DESCRIPTION, parameters: SEARCH_TOOL_PARAMETERS } };

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

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
  // Google n'ouvre pas l'API Gemini partout (Mayotte comprise) : c'est le serveur appelant qui compte.
  if (status === 400 && /location is not supported/i.test(detail)) {
    return new AIProviderError(
      "bad_request",
      "Google refuse les appels venant de ce lieu (l'API Gemini n'est pas ouverte à Mayotte). Ajoutez cette API depuis le site en ligne : ses serveurs sont en Irlande.",
    );
  }
  if (status === 400 || status === 404 || status === 422) {
    return new AIProviderError("bad_request", `Requête refusée par le fournisseur (${status})`);
  }
  if (status >= 500) return new AIProviderError("overloaded", `Erreur serveur du fournisseur (${status})`);
  return new AIProviderError("unavailable", `Réponse inattendue du fournisseur (${status})`);
}

/**
 * Photo jointe : envoyée en image. Un PDF n'est pas lu par ces API : le modèle
 * est prévenu, pour dire qu'il ne le voit pas plutôt que d'inventer.
 */
function toOpenAIMessage({ role, content, attachment }: ChatTurn) {
  if (!attachment) return { role, content };
  if (attachment.mimeType === "application/pdf") {
    return { role, content: `[Document joint « ${attachment.name} » : illisible par ce modèle.]\n${content}` };
  }
  return {
    role,
    content: [
      { type: "image_url", image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}` } },
      { type: "text", text: content },
    ],
  };
}

export function createOpenAICompatibleProvider(config: AIConfig): AIProvider {
  const endpoint = `${(config.baseUrl ?? "").replace(/\/+$/, "")}/chat/completions`;
  // L'API OpenAI officielle attend max_completion_tokens ; la plupart des
  // autres services compatibles attendent encore max_tokens.
  const maxTokensField = endpoint.includes("api.openai.com") ? "max_completion_tokens" : "max_tokens";
  // Modèles autres que la référence (Gemini), réponses de Tamilya seulement : rappel des consignes et température plus basse.
  const harmony = harmonyFor(config.model);

  return {
    id: "openai-compatible",
    async *stream({ system, messages, maxOutputTokens, signal, persona, search }: AIStreamInput): AsyncIterable<AIStreamChunk> {
      const timeoutSignal = AbortSignal.timeout(config.timeoutMs);
      const combined = AbortSignal.any([signal, timeoutSignal]);

      const tuned = persona ? harmony : null;
      // Recherche permise : notre outil « chercher_sur_internet » (retiré si le modèle refuse les outils).
      let withTool = Boolean(search);
      const prompt = () => (withTool ? `${system}\n\n${SEARCH_TOOL_RULE}` : system);
      // Échanges de recherche (appel de l'outil, résultats) ajoutés après la question.
      const turns: object[] = [];
      let lastRound = false;
      const send = (reasoning: object | null) =>
        fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            stream: true,
            [maxTokensField]: maxOutputTokens,
            ...(reasoning && { reasoning }),
            ...(tuned && { temperature: tuned.temperature }),
            ...(withTool && { tools: [SEARCH_TOOL], tool_choice: lastRound ? "none" : "auto" }),
            messages: [
              ...(!tuned
                ? [{ role: "system", content: prompt() }, ...messages.map(toOpenAIMessage)]
                : tuned.nearLastMessage
                  ? [
                      { role: "system", content: prompt() },
                      ...messages.slice(0, -1).map(toOpenAIMessage),
                      { role: "system", content: tuned.reminder },
                      ...messages.slice(-1).map(toOpenAIMessage),
                    ]
                  : [{ role: "system", content: `${prompt()}\n\n${tuned.reminder}` }, ...messages.map(toOpenAIMessage)]),
              ...turns,
            ],
          }),
          signal: combined,
        });

      const open = async (): Promise<Response> => {
        let response: Response;
        try {
          response = await send(config.disableReasoning ? { enabled: false } : null);
          // Certains modèles (Gemini 3 sur OpenRouter…) imposent la réflexion : on la
          // réduit au minimum, comme le fournisseur Gemini natif, au lieu d'échouer.
          if (config.disableReasoning && response.status === 400) {
            const body = await response.text().catch(() => "");
            response = /reasoning/i.test(body) ? await send({ effort: "minimal" }) : new Response(body, { status: 400 });
          }
          // Modèle qui refuse les outils : réponse sans recherche plutôt qu'aucune réponse.
          if (withTool && turns.length === 0 && (response.status === 400 || response.status === 422)) {
            const body = await response.text().catch(() => "");
            console.warn(`[recherche] « ${config.model} » refuse l'outil (${response.status}) : réponse sans recherche. ${body.slice(0, 160)}`);
            withTool = false;
            return open();
          }
        } catch (error) {
          if (signal.aborted) throw new AIProviderError("aborted", "Requête annulée", { cause: error });
          if (timeoutSignal.aborted) throw new AIProviderError("timeout", "Délai dépassé", { cause: error });
          throw new AIProviderError("unavailable", "Connexion au fournisseur impossible", { cause: error });
        }
        if (!response.ok || !response.body) {
          const body = await response.text().catch(() => "");
          throw errorFromStatus(response.status, body);
        }
        return response;
      };

      let finish: FinishReason = "other";
      const sources = new Map<string, string>();
      let rounds = 0;

      while (true) {
        const response = await open();
        const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
        const parser = createSseDataParser();
        let written = "";
        // Appels de l'outil, reçus morceau par morceau (le texte des arguments arrive en plusieurs fois).
        const calls: { id: string; name: string; args: string }[] = [];

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
              for (const delta of choice?.delta?.tool_calls ?? []) {
                const index = delta.index ?? calls.length;
                const call = (calls[index] ??= { id: "", name: "", args: "" });
                if (delta.id) call.id = delta.id;
                if (delta.function?.name) call.name += delta.function.name;
                if (delta.function?.arguments) call.args += delta.function.arguments;
              }
              const raw = choice?.delta?.content;
              const text = raw && tuned?.stripEmoji ? withoutEmoji(raw) : raw;
              if (text) {
                written += text;
                yield { type: "text", text };
              }
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

        const asked = calls.filter((call) => call?.name);
        if (!withTool || !asked.length || rounds >= MAX_SEARCH_ROUNDS) {
          if (withTool && rounds === 0) console.info(`[recherche] outil proposé à « ${config.model} », pas utilisé`);
          break;
        }

        // Tamilya veut chercher : le serveur cherche, puis elle reprend avec les résultats.
        rounds++;
        asked.forEach((call, i) => (call.id ||= `appel-${rounds}-${i}`));
        const queries = asked.map((call) => searchQuery(call.name, parseArgs(call.args)));
        for (const query of shownQueries(queries)) yield { type: "searching", query };
        const found = await runSearches(queries, combined, config.model);
        for (const page of found.sources) sources.set(page.url, page.title);
        turns.push(
          {
            role: "assistant",
            content: written || null,
            tool_calls: asked.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.args || "{}" } })),
          },
          ...asked.map((call, i) => ({ role: "tool", tool_call_id: call.id, content: found.answers[i] })),
        );
        lastRound = rounds >= MAX_SEARCH_ROUNDS;
      }

      if (sources.size) yield { type: "sources", sources: [...sources].slice(0, 6).map(([url, title]) => ({ url, title })) };
      yield { type: "finish", reason: finish };
    },
  };
}
