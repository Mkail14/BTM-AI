import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AIProviderError, getAIProvider } from "@/lib/ai";
import { verifyRelay } from "@/lib/ai/relay";
import { keysSecret } from "@/lib/ai/secret-box";
import { CHAT_LIMITS } from "@/lib/chat/limits";

/**
 * Relais du développement local (voir src/lib/ai/relay.ts) : répond avec la
 * chaîne d'API du site en ligne, pour un poste qui signe avec AI_KEYS_SECRET.
 * Réponse : une ligne JSON par morceau (texte, fin, consommation, erreur).
 */

export const maxDuration = 120;

const bodySchema = z.object({
  system: z.string().max(200_000),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(CHAT_LIMITS.maxStoredMessageChars) }))
    .min(1)
    .max(200),
  maxOutputTokens: z.number().int().min(16).max(32_000),
  persona: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signed = verifyRelay(raw, request.headers.get("x-relay-time"), request.headers.get("x-relay-signature"), keysSecret() ?? undefined);
  if (!signed) return NextResponse.json({ error: "Relais refusé." }, { status: 401 });

  const parsed = bodySchema.safeParse(JSON.parse(raw));
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
