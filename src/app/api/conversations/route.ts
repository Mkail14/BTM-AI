import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { chatErrorBody } from "@/lib/chat/errors";
import { deriveTitle } from "@/lib/chat/history";
import { CHAT_LIMITS } from "@/lib/chat/limits";
import { importConversationSchema } from "@/lib/chat/validation";
import { importConversation, listConversations } from "@/lib/conversations/repository";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";

/** Liste des conversations de l'utilisateur connecté. */
export async function GET() {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) {
    return NextResponse.json(chatErrorBody("unauthorized"), { status: 401 });
  }

  try {
    const conversations = await listConversations(supabase);
    return NextResponse.json({ conversations }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[conversations] Lecture impossible", error);
    return NextResponse.json(chatErrorBody("internal"), { status: 500 });
  }
}

/**
 * Enregistre dans le compte une conversation commencée sans compte.
 * Appelé uniquement après confirmation explicite de l'utilisateur.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(chatErrorBody("invalid_request"), { status: 403 });
  }

  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) {
    return NextResponse.json(chatErrorBody("unauthorized"), { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(chatErrorBody("invalid_request"), { status: 400 });
  }
  const parsed = importConversationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(chatErrorBody("invalid_request"), { status: 400 });
  }

  try {
    const decision = await consumeRateLimits([
      { key: user.id, rules: RATE_LIMIT_POLICIES.conversationImport },
    ]);
    if (!decision.allowed) {
      return NextResponse.json(chatErrorBody("rate_limited"), {
        status: 429,
        headers: { "Retry-After": String(decision.retryAfterSeconds) },
      });
    }

    const { messages } = parsed.data;
    const firstUser = messages.find((m) => m.role === "user")?.content ?? "";
    const conversation = await importConversation(
      supabase,
      user.id,
      deriveTitle(firstUser, CHAT_LIMITS.maxTitleChars),
      messages,
    );
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    console.error("[conversations] Import impossible", error);
    return NextResponse.json(chatErrorBody("internal"), { status: 500 });
  }
}
