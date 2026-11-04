import { NextResponse, type NextRequest } from "next/server";
import { buildSystemPrompt } from "@/lib/ai";
import { knowledgeFor, lexiconFor, loadAwaBrain, wordsFor } from "@/lib/ai/brain";
import { DEFAULT_PERSONALITY } from "@/lib/ai/personalities";
import { loadPersonalityInstructions } from "@/lib/ai/personality-store";
import { loadVoice } from "@/lib/ai/voice/settings";
import { readChatProfile } from "@/lib/chat/profile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { chooseLiveModel, liveModels } from "@/lib/voice-live/models";
import { liveTicketSecret, readLiveTicket } from "@/lib/voice-live/ticket";

/**
 * Appelée par le relais Cloudflare à l'ouverture d'une conversation vocale en
 * direct : renvoie le « setup » de la Live API de Gemini (modèle, voix,
 * consignes complètes de Tamilya). Protégée par le ticket signé du compte.
 */

/** À l'oral en direct : la personne parle, Tamilya l'entend (pas de dictée qui se trompe). */
const LIVE_RULES =
  "Conversation à la voix, en direct : tu entends directement la voix de la personne. Elle peut parler français ou shimaoré ; reconnais les mots shimaoré d'après ton vocabulaire. Réponds comme à l'oral, en une à trois phrases courtes, chaleureuses, sans liste ni titre. Si la personne te coupe, arrête-toi et écoute-la.";

export async function POST(request: NextRequest) {
  const secret = liveTicketSecret();
  const body = (await request.json().catch(() => null)) as { ticket?: unknown } | null;
  const ticket = secret && typeof body?.ticket === "string" ? readLiveTicket(body.ticket, secret) : null;
  if (!ticket) return NextResponse.json({ error: "Ticket refusé." }, { status: 401 });

  const model = await chooseLiveModel().catch(() => null);
  if (!model) return NextResponse.json({ error: "Aucun modèle Gemini en direct pour cette clé." }, { status: 503 });

  const admin = getSupabaseAdminClient();
  const [brain, profile, voice] = await Promise.all([
    loadAwaBrain(),
    admin ? readChatProfile(admin, ticket.uid).catch(() => null) : Promise.resolve(null),
    loadVoice(),
  ]);
  const personality = profile?.personality ?? DEFAULT_PERSONALITY;
  const personalityInstructions = await loadPersonalityInstructions(personality).catch(() => undefined);

  const system = buildSystemPrompt(personality, {
    personalityInstructions,
    identity: brain.identity,
    rules: brain.rules,
    lexicon: lexiconFor(brain, personality, ""),
    grammar: brain.grammar,
    words: wordsFor(brain, "", ticket.admin),
    knowledge: knowledgeFor(brain, ""),
    teacher: ticket.admin,
    voice: true,
    home: profile?.home,
  });

  return NextResponse.json(
    {
      setup: {
        model: `models/${model}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
        systemInstruction: { parts: [{ text: `${system}\n\n${LIVE_RULES}` }] },
        // Textes de ce qui est dit des deux côtés : affichés à l'écran (et enregistrables).
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        // Fin de phrase détectée par Gemini : 0,6 s de silence suffit.
        realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 600 } },
      },
      // Pour le diagnostic de la page de test.
      models: await liveModels().catch(() => []),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
