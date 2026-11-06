import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { chatErrorBody } from "@/lib/chat/errors";
import { conversationIdSchema } from "@/lib/chat/validation";
import { deleteConversation, getRecentMessages } from "@/lib/conversations/repository";
import { isSameOrigin } from "@/lib/security/request";

/** Tamilya Connect garde les conversations sur le téléphone : assez de messages pour les relire sans internet. */
const MESSAGES_FOR_CONNECT = 60;

/** Messages d'une conversation, pour l'écran natif de Tamilya Connect. RLS : seulement les siennes. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/conversations/[id]">) {
  const { id } = await ctx.params;
  const parsedId = conversationIdSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json(chatErrorBody("not_found"), { status: 404 });

  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return NextResponse.json(chatErrorBody("unauthorized"), { status: 401 });

  try {
    const messages = await getRecentMessages(supabase, parsedId.data, MESSAGES_FOR_CONNECT);
    return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[conversations] Lecture impossible", error);
    return NextResponse.json(chatErrorBody("internal"), { status: 500 });
  }
}

/** Supprime une conversation (et ses messages, par cascade). */
export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/conversations/[id]">,
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(chatErrorBody("invalid_request"), { status: 403 });
  }

  const { id } = await ctx.params;
  const parsedId = conversationIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json(chatErrorBody("not_found"), { status: 404 });
  }

  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) {
    return NextResponse.json(chatErrorBody("unauthorized"), { status: 401 });
  }

  try {
    // RLS : la suppression ne touche que les conversations de l'utilisateur.
    const deleted = await deleteConversation(supabase, parsedId.data);
    if (!deleted) return NextResponse.json(chatErrorBody("not_found"), { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[conversations] Suppression impossible", error);
    return NextResponse.json(chatErrorBody("internal"), { status: 500 });
  }
}
