import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { conversationIdSchema, importConversationSchema } from "@/lib/chat/validation";
import { apiError, rateLimit, readJson, type Auth } from "@/server/middlewares/api";
import { RATE_LIMIT_POLICIES } from "@/server/middlewares/rate-limit";
import * as conversations from "@/server/services/conversations/conversations.service";

/** Lecture de la requête -> appel du service -> réponse JSON. Session et origine : voir les routes. */

const NO_STORE = { "Cache-Control": "no-store" };

type ById = RouteContext<"/api/conversations/[id]">;

/** GET /api/conversations : conversations du compte connecté. */
export async function list(_request: NextRequest, { supabase }: Auth) {
  try {
    return NextResponse.json({ conversations: await conversations.listMine(supabase) }, { headers: NO_STORE });
  } catch (error) {
    console.error("[conversations] Lecture impossible", error);
    return apiError("internal", 500);
  }
}

/**
 * POST /api/conversations : enregistre dans le compte une conversation commencée
 * sans compte. Appelé uniquement après confirmation explicite de l'utilisateur.
 */
export async function importGuest(request: NextRequest, { supabase, user }: Auth) {
  const parsed = importConversationSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("invalid_request", 400);

  try {
    const limited = await rateLimit([{ key: user.id, rules: RATE_LIMIT_POLICIES.conversationImport }]);
    if (limited) return limited;
    const conversation = await conversations.importGuestConversation(supabase, user.id, parsed.data.messages);
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    console.error("[conversations] Import impossible", error);
    return apiError("internal", 500);
  }
}

/** GET /api/conversations/[id] : messages d'une conversation, pour l'écran natif de Tamilya Connect. */
export async function messages(_request: NextRequest, { supabase }: Auth, ctx: ById) {
  const id = conversationIdSchema.safeParse((await ctx.params).id);
  if (!id.success) return apiError("not_found", 404);

  try {
    return NextResponse.json({ messages: await conversations.messagesForConnect(supabase, id.data) }, { headers: NO_STORE });
  } catch (error) {
    console.error("[conversations] Lecture impossible", error);
    return apiError("internal", 500);
  }
}

/** DELETE /api/conversations/[id] : supprime une conversation et ses messages. */
export async function remove(_request: NextRequest, { supabase }: Auth, ctx: ById) {
  const id = conversationIdSchema.safeParse((await ctx.params).id);
  if (!id.success) return apiError("not_found", 404);

  try {
    if (!(await conversations.remove(supabase, id.data))) return apiError("not_found", 404);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[conversations] Suppression impossible", error);
    return apiError("internal", 500);
  }
}
