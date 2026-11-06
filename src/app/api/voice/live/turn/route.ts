import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { VOICE_NODE } from "@/lib/ai/flow-events";
import { startFlowTrace } from "@/lib/ai/flow-trace";
import { getAuthContext } from "@/lib/auth/session";
import { CHAT_LIMITS } from "@/lib/chat/limits";
import { quickTitle } from "@/lib/chat/title";
import { createConversation, getConversation, insertMessage } from "@/lib/conversations/repository";
import { isSameOrigin } from "@/lib/security/request";

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

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
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
    if (parsed.data.user) await insertMessage(supabase, { conversationId, userId: user.id, role: "user", content: parsed.data.user });
    if (parsed.data.tamilya) await insertMessage(supabase, { conversationId, userId: user.id, role: "assistant", content: parsed.data.tamilya });
    flow.step("output", true);
    return NextResponse.json({ conversationId });
  } catch (error) {
    console.error("[vocal direct] Échange non enregistré", error);
    flow.step("output", false, "échange non enregistré");
    return NextResponse.json({ error: "Échange non enregistré." }, { status: 500 });
  }
}
