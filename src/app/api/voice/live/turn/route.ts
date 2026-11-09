import { after, NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai";
import { loadAwaBrain } from "@/lib/ai/brain";
import { VOICE_NODE } from "@/lib/ai/flow-events";
import { startFlowTrace } from "@/lib/ai/flow-trace";
import { extractMemories } from "@/lib/ai/memory";
import { getMemories, isMemoryOn, learnFromMessage, saveMemories } from "@/lib/ai/memory-store";
import { getAuthContext } from "@/lib/auth/session";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { CHAT_LIMITS } from "@/lib/chat/limits";
import { quickTitle } from "@/lib/chat/title";
import { learnWordsFromMessage } from "@/lib/ai/words-store";
import { createConversation, getConversation, getRecentMessages, insertMessage } from "@/lib/conversations/repository";
import { buildSnapLexicon, snapToLexicon } from "@/lib/language/snap-lexicon";
import { isSameOrigin } from "@/lib/security/request";
import { loadVoiceCorrections } from "@/lib/voice-live/corrections";
import { applyVoiceCorrections } from "@/lib/voice-live/listening";

/**
 * Vocal en direct : enregistre un échange (ce que la personne a dit, ce que
 * Tamilya a répondu, d'après les transcriptions de Gemini) dans la
 * conversation, créée au premier échange si besoin.
 */

const bodySchema = z.object({
  conversationId: z.uuid().optional(),
  user: z.string().trim().max(CHAT_LIMITS.maxUserMessageChars),
  tamilya: z.string().trim().max(CHAT_LIMITS.maxStoredMessageChars),
});

/** Même mémoire qu'à l'écrit : ce qui est dit à la voix sert dès le prochain appel. */
async function rememberSpoken(supabase: SupabaseClient, userId: string, message: string, previousReply: string | null) {
  if (!(await isMemoryOn(supabase))) return;
  await saveMemories(supabase, userId, extractMemories(message));
  const ai = await getAIProvider();
  if (!ai.ok) return;
  await learnFromMessage(supabase, userId, ai.provider, { message, previousReply, memories: await getMemories(supabase) });
}

/** Leçon de shimaoré à la voix : le mot va au dictionnaire, comme à l'écrit, et sert dès le prochain appel. */
async function learnSpokenWords(supabase: SupabaseClient, userId: string, message: string, previousReply: string | null) {
  const ai = await getAIProvider();
  if (!ai.ok) return;
  await learnWordsFromMessage(supabase, userId, ai.provider, { message, previousReply });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });
  const limit = await consumeRateLimits([{ key: `voice-live-turn:${user.id}`, rules: RATE_LIMIT_POLICIES.voiceLiveTurn }]).catch(() => null);
  if (limit && !limit.allowed) return NextResponse.json({ error: "Trop d'échanges, réessaie dans un instant." }, { status: 429 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (!parsed.data.user && !parsed.data.tamilya)) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });

  // Circuit : un échange parlé suit le même trajet qu'un message écrit, sans aucun contenu.
  const flow = startFlowTrace();
  for (const node of ["input", "guard", "prompt", VOICE_NODE]) flow.step(node, true);

  try {
    let conversationId = parsed.data.conversationId;
    // Conversation d'un autre compte (ou effacée) : on en ouvre une nouvelle.
    if (conversationId && !(await getConversation(supabase, conversationId).catch(() => null))) conversationId = undefined;
    if (!conversationId) {
      conversationId = (await createConversation(supabase, user.id, quickTitle(parsed.data.user || parsed.data.tamilya))).id;
    }
    // Texte de la personne : les mots connus pour être mal entendus sont remis d'aplomb avant l'enregistrement.
    // Puis ce que Gemini a écrit à l'oreille est rapproché des mots validés de Tamilya.
    const brain = parsed.data.user ? await loadAwaBrain().catch(() => null) : null;
    const lexicon = buildSnapLexicon(brain?.words.map((word) => word.shimaore) ?? []);
    const heard = parsed.data.user ? applyVoiceCorrections(parsed.data.user, await loadVoiceCorrections().catch(() => [])) : "";
    const spoken = heard ? snapToLexicon(heard, lexicon) : "";
    if (spoken) {
      // La question de Tamilya (« comment on dit chien ? ») donne son sens à une réponse d'un seul mot.
      const recent = await getRecentMessages(supabase, conversationId, 4).catch(() => []);
      const previousReply = recent.findLast((message) => message.role === "assistant")?.content ?? null;
      await insertMessage(supabase, { conversationId, userId: user.id, role: "user", content: spoken });
      after(() => rememberSpoken(supabase, user.id, spoken, previousReply).catch((error: unknown) => console.error("[vocal direct] Souvenir non enregistré", error)));
      // Le mot tel qu'il a été entendu, pas rapproché du lexique : un mot nouveau y deviendrait un mot déjà connu.
      if (user.isAdmin) after(() => learnSpokenWords(supabase, user.id, heard, previousReply).catch((error: unknown) => console.error("[vocal direct] Leçon de shimaoré non enregistrée", error)));
    }
    if (parsed.data.tamilya) await insertMessage(supabase, { conversationId, userId: user.id, role: "assistant", content: parsed.data.tamilya });
    flow.step("output", true);
    return NextResponse.json({ conversationId });
  } catch (error) {
    console.error("[vocal direct] Échange non enregistré", error);
    flow.step("output", false, "échange non enregistré");
    return NextResponse.json({ error: "Échange non enregistré." }, { status: 500 });
  }
}
