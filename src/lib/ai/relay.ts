import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AIConfig } from "./config";
import { AIProviderError, type AIErrorCode, type AIProvider, type AIStreamChunk } from "./types";

/**
 * Relais pour le développement local. Google refuse l'API Gemini depuis
 * Mayotte : sur l'ordinateur de l'équipe, Tamilya envoie donc sa demande au site
 * en ligne (serveurs en Irlande), qui interroge Gemini avec sa propre chaîne
 * d'API et renvoie la réponse au fil de l'eau.
 *
 * Signature : HMAC de l'heure et du corps avec le secret des clés (keysSecret), qui
 * déchiffre déjà les clés d'API en base (le poste local et le site l'ont
 * toutes les deux). Valable 5 minutes ; la clé elle-même ne circule jamais.
 */

const MAX_SKEW_MS = 5 * 60_000;

/** Plafonds d'une demande relayée (plus bas que ceux d'une conversation stockée). */
export const RELAY_LIMITS = { systemChars: 200_000, maxOutputTokens: 8_000, bodyBytes: 600_000 } as const;

/**
 * Route du relais ouverte sur ce serveur ? Fermée par défaut : il faut
 * RELAY_ENABLED=1 sur le site en ligne pour que les postes de l'équipe s'en servent.
 */
export function relayEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.RELAY_ENABLED?.trim() === "1";
}

/** Adresse du site en ligne, seulement en développement local (AI_RELAY_URL). */
export function relayUrl(env: Record<string, string | undefined> = process.env): string | null {
  if (env.NODE_ENV !== "development") return null;
  const url = env.AI_RELAY_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

export function signRelay(body: string, time: number, secret: string): string {
  const hash = createHash("sha256").update(body).digest("hex");
  return createHmac("sha256", secret).update(`${time}.${hash}`).digest("hex");
}

/** Vrai si la demande vient bien d'un poste qui connaît AI_KEYS_SECRET, il y a moins de 5 minutes. */
export function verifyRelay(body: string, time: string | null, signature: string | null, secret: string | undefined, now = Date.now()): boolean {
  if (!secret || !time || !signature || !/^\d{10,16}$/.test(time) || !/^[0-9a-f]{64}$/.test(signature)) return false;
  if (Math.abs(now - Number(time)) > MAX_SKEW_MS) return false;
  const expected = Buffer.from(signRelay(body, Number(time), secret), "hex");
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

/** Réglages affichés et bornes de la chaîne locale (le site en ligne applique les siens). */
export function relayConfig(url: string): AIConfig {
  return {
    provider: "openai-compatible",
    apiKey: "relais",
    model: "relais vers le site en ligne",
    baseUrl: url,
    maxOutputTokens: 4096,
    timeoutMs: 90_000,
    effort: "low",
    disableReasoning: false,
  };
}

/** Fournisseur local qui fait répondre Tamilya par le site en ligne. */
export function createRelayProvider(url: string, secret: string): AIProvider {
  return {
    id: "relay",
    async *stream(input) {
      const body = JSON.stringify({
        system: input.system,
        messages: input.messages,
        maxOutputTokens: input.maxOutputTokens,
        persona: input.persona ?? false,
        fast: input.fast ?? false,
        ...(input.model ? { model: input.model } : {}),
      });
      const time = Date.now();
      const response = await fetch(`${url}/api/ai/relay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-relay-time": String(time), "x-relay-signature": signRelay(body, time, secret) },
        body,
        signal: input.signal,
        cache: "no-store",
      }).catch((error: unknown) => {
        if (input.signal.aborted) throw new AIProviderError("aborted", "Relais interrompu", { cause: error });
        throw new AIProviderError("unavailable", `Site en ligne injoignable (${url})`, { cause: error });
      });
      if (response.status === 401) throw new AIProviderError("auth", "Relais refusé : AI_KEYS_SECRET différente du site en ligne.");
      // 404 ou 405 : relais fermé (RELAY_ENABLED absente) ou site en ligne sans cette route.
      if (response.status === 404 || response.status === 405) {
        throw new AIProviderError("unavailable", "Relais fermé sur le site en ligne : mettez RELAY_ENABLED=1 dans ses variables (ou mettez le site à jour).");
      }
      if (response.status === 413) throw new AIProviderError("bad_request", "Relais : demande trop longue (plus de 600 Ko).");
      if (!response.ok || !response.body) throw new AIProviderError("unavailable", `Relais : erreur ${response.status}`);

      // Une ligne JSON par morceau de réponse.
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line) as AIStreamChunk | { type: "error"; code: AIErrorCode; message: string };
          if (chunk.type === "error") throw new AIProviderError(chunk.code, `Site en ligne : ${chunk.message}`);
          yield chunk;
        }
      }
    },
  };
}

/**
 * Voix de Tamilya en développement local : le site en ligne lit le texte avec
 * Gemini et renvoie le MP3 au fil de l'eau ; la réponse est transmise telle quelle.
 */
export async function relaySpeech(url: string, secret: string, payload: { text: string; voice: string }, signal: AbortSignal): Promise<Response> {
  const body = JSON.stringify(payload);
  const time = Date.now();
  // Signal de la requête suivi jusqu'aux en-têtes seulement : ensuite, c'est l'annulation du flux
  // par le navigateur qui coupe (sinon Next coupait le son en plein milieu).
  const upstream = new AbortController();
  const onAbort = () => upstream.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  const response = await fetch(`${url}/api/ai/relay/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-relay-time": String(time), "x-relay-signature": signRelay(body, time, secret) },
    body,
    signal: upstream.signal,
    cache: "no-store",
  })
    .catch((error: unknown) => {
      throw new AIProviderError("unavailable", `Site en ligne injoignable (${url})`, { cause: error });
    })
    .finally(() => signal.removeEventListener("abort", onAbort));
  if (response.status === 404 || response.status === 405) {
    throw new AIProviderError("unavailable", "Voix : relais fermé ou site en ligne pas encore à jour (route /api/ai/relay/speech).");
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: string } | null;
    throw new AIProviderError("unavailable", `Voix (site en ligne) : ${detail?.error ?? `erreur ${response.status}`}`);
  }
  return response;
}
