import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { geminiHeaders, geminiRoot, listKeyModels, thinkingSettings } from "@/lib/ai/providers/gemini";
import { createSseDataParser } from "@/lib/ai/sse";
import { geminiKey } from "@/lib/ai/voice/gemini-tts";
import { loadVoice } from "@/lib/ai/voice/settings";
import { getAuthContext } from "@/lib/auth/session";
import { READING_TEXT } from "@/lib/lecture/intent";
import { loadSoundCatalog } from "@/lib/lecture/catalog-store";
import { scriptPrompt, scriptSchema } from "@/lib/lecture/prompt";
import { buildLine, buildMeta, buildScript, READING_LIMITS, type Cast } from "@/lib/lecture/script";
import { createScriptStream } from "@/lib/lecture/stream";
import { writeStory } from "@/lib/lecture/writer";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";

/**
 * Lecture en 3D : la photo d'une page de livre (ou un texte écrit dans la conversation) devient
 * un script de scène (voix, places autour de la tête, bruits), écrit par Gemini.
 * Administrateurs seulement pour l'essai. La photo n'est pas gardée.
 *
 * Réponse au fil de l'eau (une ligne JSON par événement) : `meta` (titre, lieu, intro, décor) dès
 * que Gemini l'a écrit, puis chaque `line` dès qu'elle est complète, puis `end` (ou `error`).
 * Avant, on attendait toute la page : ~13 s mesurées sur la tablette avant le premier son.
 */

/** Conteur Pro (15 s au plus) puis mise en scène Flash (55 s au plus). */
export const maxDuration = 75;

/** Photo réduite par le téléphone (1400 px, JPEG) : ~150 à 300 Ko, soit ~400 Ko en base64. Marge large. */
const MAX_BASE64 = 2_000_000;
const TIMEOUT_MS = 55_000;
/** Flash stable (pas lite : il faut bien lire la page et imaginer la scène), du plus récent au plus ancien. */
const MODEL = /^gemini-[\d.]+-flash$/;

const bodySchema = z.union([
  z.object({
    image: z.string().max(MAX_BASE64).regex(/^[A-Za-z0-9+/=]+$/),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
  }),
  z.object({ text: z.string().trim().min(20).max(READING_TEXT.max) }),
  // Histoire inventée par Tamilya : la demande de la personne (sujet, style), sur une ligne.
  z.object({ story: z.string().trim().min(1).max(400) }),
]);

function pickModels(available: string[]): string[] {
  const version = (id: string) => Number(id.match(/^gemini-([\d.]+)/)?.[1] ?? 0);
  return available.filter((id) => MODEL.test(id)).sort((a, b) => version(b) - version(a)).slice(0, 3);
}

type GeminiChunk = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };

const BUSY = "Je n'arrive pas à préparer la page en ce moment : réessaie dans un instant.";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  const { user } = await getAuthContext();
  if (!user) return NextResponse.json({ error: "Connecte-toi pour que je te lise une page." }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "La lecture en 3D arrive bientôt." }, { status: 403 });
  // Les sons branchés dans /admin/sons, relus à chaque histoire (en même temps que le reste) : Gemini choisit parmi eux.
  const catalogLoad = loadSoundCatalog();
  const limit = await consumeRateLimits([{ key: `lecture:${user.id}`, rules: RATE_LIMIT_POLICIES.reading }]).catch(() => null);
  if (!limit?.allowed) return NextResponse.json({ error: "J'ai beaucoup lu : laisse-moi souffler un peu, puis réessaie." }, { status: 429 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Je n'ai rien à lire : reprends la photo ou renvoie le texte." }, { status: 400 });
  const input = parsed.data;
  const catalog = await catalogLoad;

  let upstream: Response | null = null;
  let narrator: Awaited<ReturnType<typeof loadVoice>>;
  let signal = request.signal;
  try {
    const [key, voice] = await Promise.all([geminiKey(), loadVoice()]);
    narrator = voice;
    const available = await listKeyModels(key, request.signal);
    // Histoire demandée : le conteur (Pro) l'écrit d'abord ; sans lui, Flash l'invente comme avant.
    const written = "story" in input ? await writeStory(input.story, catalog, key, available, request.signal) : null;
    const parts =
      "image" in input
        ? [{ inlineData: { mimeType: input.mimeType, data: input.image } }, { text: scriptPrompt("photo", catalog) }]
        : "text" in input
          ? [{ text: `Texte :\n\n${input.text}` }, { text: scriptPrompt("texte", catalog) }]
          : written
            ? [{ text: `Demande de la personne : « ${input.story} »\n\nL'histoire :\n\n${written}` }, { text: scriptPrompt("ecrite", catalog) }]
            : [{ text: `Demande de la personne : « ${input.story} »` }, { text: scriptPrompt("histoire", catalog) }];
    signal = AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)]);
    const models = pickModels(available);
    for (const model of models.length ? models : ["gemini-2.5-flash"]) {
      // Réflexion au plus court : la mise en scène n'en a pas besoin, et chaque seconde compte.
      const thinking = thinkingSettings(model)[0];
      const response = await fetch(`${geminiRoot(key.baseUrl)}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: geminiHeaders(key.apiKey),
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 16_384,
            responseMimeType: "application/json",
            responseSchema: scriptSchema(catalog),
            ...(thinking && { thinkingConfig: thinking }),
          },
        }),
        signal,
      });
      // Sans quota ou surchargé : modèle suivant.
      if (response.ok && response.body) {
        upstream = response;
        break;
      }
      console.error("[lecture] Gemini", model, response.status, (await response.text().catch(() => "")).slice(0, 300));
    }
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("[lecture] Préparation impossible", error);
    return NextResponse.json({ error: BUSY }, { status: 502 });
  }
  if (!upstream?.body) return NextResponse.json({ error: BUSY }, { status: 502 });

  const reader = upstream.body.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      const sse = createSseDataParser();
      const script = createScriptStream();
      let cast: Cast | null = null;
      let sent = 0;
      let failed = false;
      const emit = (pieces: { meta?: unknown; lines: unknown[] }) => {
        if (failed) return;
        if (pieces.meta !== undefined) {
          const meta = buildMeta(pieces.meta, narrator, catalog);
          if (!meta.ok) {
            failed = true;
            send({ type: "error", message: meta.reason });
            return;
          }
          cast = meta.cast;
          send({ type: "meta", meta: meta.meta });
        }
        if (!cast) return;
        for (const raw of pieces.lines) {
          if (sent >= READING_LIMITS.lines) break;
          const line = buildLine(raw, cast);
          if (!line) continue;
          sent++;
          send({ type: "line", line });
        }
      };
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const data of sse.push(decoder.decode(value, { stream: true }))) {
            let chunk: GeminiChunk;
            try {
              chunk = JSON.parse(data) as GeminiChunk;
            } catch {
              continue;
            }
            const text = (chunk.candidates?.[0]?.content?.parts ?? [])
              .filter((p) => !p.thought)
              .map((p) => p.text ?? "")
              .join("");
            if (text) emit(script.push(text));
          }
          if (failed) break;
        }
        // Découpage raté (ordre des clés inattendu) : on relit tout d'un coup.
        if (!failed && !script.started) {
          let raw: unknown = null;
          try {
            raw = JSON.parse(script.text);
          } catch {
            raw = null;
          }
          const whole = raw ? buildScript(raw, narrator, catalog) : null;
          if (!whole?.ok) {
            failed = true;
            send({ type: "error", message: whole && !whole.ok ? whole.reason : BUSY });
          } else {
            const { lines, ...meta } = whole.script;
            send({ type: "meta", meta });
            for (const line of lines) send({ type: "line", line });
            sent = lines.length;
          }
        }
        if (!failed) send(sent ? { type: "end" } : { type: "error", message: "Je n'arrive pas à lire ce texte : réessaie." });
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("[lecture] Flux coupé", error);
          send({ type: "error", message: BUSY });
        }
      } finally {
        void reader.cancel().catch(() => {});
        controller.close();
      }
    },
    cancel() {
      void reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
