import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { chatErrorBody } from "@/lib/chat/errors";
import { conversationIdSchema } from "@/lib/chat/validation";
import { deleteConversation } from "@/lib/conversations/repository";
import { isSameOrigin } from "@/lib/security/request";

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
