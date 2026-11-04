import { NextResponse, type NextRequest } from "next/server";
import { listKeyModels } from "@/lib/ai/providers/gemini";
import { relayEnabled, verifyRelay } from "@/lib/ai/relay";
import { keysSecret } from "@/lib/ai/secret-box";
import { geminiKey } from "@/lib/ai/voice/gemini-tts";

/**
 * Modèles disponibles pour la clé Gemini du site (noms seulement, jamais la
 * clé), pour comparer les temps depuis un poste de l'équipe. Même ouverture et
 * même signature que /api/ai/relay.
 */
export async function POST(request: NextRequest) {
  if (!relayEnabled()) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  const raw = await request.text();
  const signed = verifyRelay(raw, request.headers.get("x-relay-time"), request.headers.get("x-relay-signature"), keysSecret() ?? undefined);
  if (!signed) return NextResponse.json({ error: "Relais refusé." }, { status: 401 });
  try {
    const models = await listKeyModels(await geminiKey(), AbortSignal.timeout(10_000));
    return NextResponse.json({ models: models.filter((m) => m.startsWith("gemini-")).sort() });
  } catch {
    return NextResponse.json({ error: "Liste indisponible." }, { status: 502 });
  }
}
