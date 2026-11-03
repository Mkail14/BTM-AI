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
      // 404 ou 405 : le site en ligne n'a pas encore cette route.
      if (response.status === 404 || response.status === 405) throw new AIProviderError("unavailable", "Relais absent du site en ligne : mettez le site à jour.");
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
