import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { geminiHeaders, geminiRoot, listKeyModels, thinkingSettings } from "@/lib/ai/providers/gemini";
import { geminiKey } from "@/lib/ai/voice/gemini-tts";
import { getAuthContext } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/security/request";

/**
 * Vocal en direct : Tamilya demande ce qu'est le bruit autour de la personne.
 * Reçoit au plus 5 s de bruit (sans voix, WAV 16 kHz) et demande à Gemini de
 * le reconnaître. Le son n'est pas gardé.
 */

/** 5 s de WAV 16 kHz = 160 Ko, soit ~214 Ko en base64 : un peu de marge. */
const MAX_BASE64 = 240_000;
const TIMEOUT_MS = 8_000;
const MODEL = /^gemini-[\d.]+-flash(-lite)?$/;

const PROMPT = `Ce son a été enregistré par le micro d'un téléphone à Mayotte, pendant que personne ne parlait au téléphone. Il est passé par la réduction de bruit du téléphone, donc il peut être faible.
Dis en français, en une phrase courte, quels bruits on entend : par exemple ventilateur ou climatisation, circulation ou bruits de dehors, travaux, cris, enfants, voix au loin, musique, télévision, pluie, vent, animaux, moteur. Classe du plus fort au plus faible.
Si on n'entend presque rien, réponds « presque rien ». N'invente pas : si tu n'es pas sûr, dis « peut-être ».`;

const bodySchema = z.object({ audio: z.string().max(MAX_BASE64).regex(/^[A-Za-z0-9+/=]+$/) });

/** Le plus rapide d'abord : flash-lite, puis flash, du plus récent au plus ancien. */
function pickModels(available: string[]): string[] {
  const version = (id: string) => Number(id.match(/^gemini-([\d.]+)/)?.[1] ?? 0);
  return available
    .filter((id) => MODEL.test(id))
    .sort((a, b) => Number(b.endsWith("-lite")) - Number(a.endsWith("-lite")) || version(b) - version(a))
    .slice(0, 3);
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  const { user } = await getAuthContext();
  if (!user) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Son invalide." }, { status: 400 });

  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const key = await geminiKey();
    const models = pickModels(await listKeyModels(key, signal));
    for (const model of models.length ? models : ["gemini-2.5-flash-lite"]) {
      const response = await fetch(`${geminiRoot(key.baseUrl)}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: geminiHeaders(key.apiKey),
        body: JSON.stringify({
          contents: [{ parts: [{ inlineData: { mimeType: "audio/wav", data: parsed.data.audio } }, { text: PROMPT }] }],
          // Réflexion au plus court : réponse vite, et les jetons vont à la réponse.
          generationConfig: { maxOutputTokens: 200, temperature: 0.2, ...(thinkingSettings(model)[0] && { thinkingConfig: thinkingSettings(model)[0] }) },
        }),
        signal,
      });
      // Sans quota ou surchargé : modèle suivant.
      if (!response.ok) continue;
      const json = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const heard = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      if (heard) return NextResponse.json({ heard: heard.slice(0, 300) });
    }
    return NextResponse.json({ error: "Bruit non reconnu." }, { status: 502 });
  } catch {
    return NextResponse.json({ error: "Bruit non reconnu." }, { status: 502 });
  }
}
