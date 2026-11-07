import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { geminiHeaders, geminiRoot, listKeyModels, thinkingSettings } from "@/lib/ai/providers/gemini";
import { geminiKey } from "@/lib/ai/voice/gemini-tts";
import { loadVoice } from "@/lib/ai/voice/settings";
import { getAuthContext } from "@/lib/auth/session";
import { SCRIPT_PROMPT, SCRIPT_SCHEMA } from "@/lib/lecture/prompt";
import { buildScript } from "@/lib/lecture/script";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";

/**
 * Lecture en 3D : la photo d'une page de livre devient un script de scène (voix, places autour
 * de la tête, bruits), écrit par Gemini. Administrateurs seulement pour l'essai. La photo n'est
 * pas gardée.
 */

export const maxDuration = 60;

/** Photo réduite par le téléphone (1400 px, JPEG) : ~150 à 300 Ko, soit ~400 Ko en base64. Marge large. */
const MAX_BASE64 = 2_000_000;
const TIMEOUT_MS = 50_000;
/** Flash stable (pas lite : il faut bien lire la page et imaginer la scène), du plus récent au plus ancien. */
const MODEL = /^gemini-[\d.]+-flash$/;

const bodySchema = z.object({
  image: z.string().max(MAX_BASE64).regex(/^[A-Za-z0-9+/=]+$/),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
});

function pickModels(available: string[]): string[] {
  const version = (id: string) => Number(id.match(/^gemini-([\d.]+)/)?.[1] ?? 0);
  return available.filter((id) => MODEL.test(id)).sort((a, b) => version(b) - version(a)).slice(0, 3);
}

type GeminiReply = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  const { user } = await getAuthContext();
  if (!user) return NextResponse.json({ error: "Connecte-toi pour que je te lise une page." }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "La lecture en 3D arrive bientôt." }, { status: 403 });
  const limit = await consumeRateLimits([{ key: `lecture:${user.id}`, rules: RATE_LIMIT_POLICIES.reading }]).catch(() => null);
  if (!limit?.allowed) return NextResponse.json({ error: "J'ai beaucoup lu : laisse-moi souffler un peu, puis réessaie." }, { status: 429 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Photo invalide, reprends-la." }, { status: 400 });

  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)]);
    const [key, narrator] = await Promise.all([geminiKey(), loadVoice()]);
    const models = pickModels(await listKeyModels(key, signal));
    for (const model of models.length ? models : ["gemini-2.5-flash"]) {
      const thinking = thinkingSettings(model).at(-1);
      const response = await fetch(`${geminiRoot(key.baseUrl)}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: geminiHeaders(key.apiKey),
        body: JSON.stringify({
          contents: [{ parts: [{ inlineData: { mimeType: parsed.data.mimeType, data: parsed.data.image } }, { text: SCRIPT_PROMPT }] }],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 16_384,
            responseMimeType: "application/json",
            responseSchema: SCRIPT_SCHEMA,
            ...(thinking && { thinkingConfig: thinking }),
          },
        }),
        signal,
      });
      // Sans quota ou surchargé : modèle suivant.
      if (!response.ok) {
        console.error("[lecture] Gemini", model, response.status, (await response.text().catch(() => "")).slice(0, 300));
        continue;
      }
      const json = (await response.json()) as GeminiReply;
      const text = (json.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("");
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        console.error("[lecture] Réponse illisible", model, text.slice(0, 200));
        continue;
      }
      const result = buildScript(raw, narrator);
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 422 });
      return NextResponse.json({ script: result.script });
    }
    return NextResponse.json({ error: "Je n'arrive pas à préparer la page en ce moment : réessaie dans un instant." }, { status: 502 });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("[lecture] Préparation impossible", error);
    return NextResponse.json({ error: "Je n'arrive pas à préparer la page en ce moment : réessaie dans un instant." }, { status: 502 });
  }
}
