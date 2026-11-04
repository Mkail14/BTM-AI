import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AIProviderError, getAIProvider } from "@/lib/ai";
import { RELAY_LIMITS, relayEnabled, verifyRelay } from "@/lib/ai/relay";
import { keysSecret } from "@/lib/ai/secret-box";
import { CHAT_LIMITS } from "@/lib/chat/limits";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";

/**
 * Relais du développement local (voir src/lib/ai/relay.ts) : répond avec la
 * chaîne d'API du site en ligne, pour un poste qui signe avec AI_KEYS_SECRET.
 * Fermé sauf si RELAY_ENABLED=1 sur ce serveur. Réponse : une ligne JSON par
 * morceau (texte, fin, consommation, erreur).
 */

export const maxDuration = 120;

const bodySchema = z.object({
  system: z.string().max(RELAY_LIMITS.systemChars),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(CHAT_LIMITS.maxStoredMessageChars) }))
    .min(1)
    .max(200),
  // Au-delà de 8 000 jetons, la demande est ramenée au plafond plutôt que refusée.
  maxOutputTokens: z.number().int().min(16).max(32_000).transform((n) => Math.min(n, RELAY_LIMITS.maxOutputTokens)),
  persona: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  // Fermé : la route se comporte comme si elle n'existait pas.
  if (!relayEnabled()) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const raw = await request.text();
  if (raw.length > RELAY_LIMITS.bodyBytes) return NextResponse.json({ error: "Demande trop lourde." }, { status: 413 });
  const signed = verifyRelay(raw, request.headers.get("x-relay-time"), request.headers.get("x-relay-signature"), keysSecret() ?? undefined);
  if (!signed) return NextResponse.json({ error: "Relais refusé." }, { status: 401 });

  // Même signée, une demande ne passe pas sans limite : un secret volé ne vide pas la clé de BTM.
  try {
    const limit = await consumeRateLimits([{ key: "ai-relay", rules: RATE_LIMIT_POLICIES.aiRelay }]);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Trop de demandes." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
    }
  } catch (error) {
    console.error("[relais] Compteurs indisponibles", error);
    return NextResponse.json({ error: "Relais indisponible." }, { status: 503 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  const ai = await getAIProvider();
  if (!ai.ok) return NextResponse.json({ error: ai.reason }, { status: 503 });

  const encoder = new TextEncoder();
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(ai.config.timeoutMs)]);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      try {
        for await (const chunk of ai.provider.stream({ ...parsed.data, persona: parsed.data.persona ?? false, signal })) send(chunk);
      } catch (error) {
        const code = error instanceof AIProviderError ? error.code : "unavailable";
        console.error("[relais] Réponse impossible", error);
        send({ type: "error", code, message: error instanceof Error ? error.message.slice(0, 200) : "Erreur" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
