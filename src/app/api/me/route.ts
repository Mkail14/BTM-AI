import { NextResponse, type NextRequest } from "next/server";
import { deleteMe, getMe, patchMe, type MeResponse } from "@/lib/account/me";
import { getAuthContext } from "@/lib/auth/session";
import { chatErrorBody } from "@/lib/chat/errors";
import { isSameOrigin } from "@/lib/security/request";

/**
 * Compte de l'utilisateur connecté, pour l'application mobile (cookie ou
 * Authorization: Bearer). Toute la logique est dans src/lib/account/me.ts.
 */

function respond({ status, body, headers }: MeResponse) {
  return NextResponse.json(body, { status, headers });
}

/** Profil, personnalité choisie et personnalités disponibles. */
export async function GET() {
  const { supabase, user } = await getAuthContext();
  return respond(await getMe({ supabase, user }));
}

/** Nom affiché et/ou personnalité. */
export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json(chatErrorBody("invalid_request"), { status: 403 });
  const { supabase, user } = await getAuthContext();
  const json: unknown = await request.json().catch(() => null);
  return respond(await patchMe({ supabase, user }, json));
}

/** Suppression définitive du compte : { "confirmation": "SUPPRIMER" }. */
export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json(chatErrorBody("invalid_request"), { status: 403 });
  const { supabase, user } = await getAuthContext();
  const json: unknown = await request.json().catch(() => null);
  return respond(await deleteMe({ supabase, user }, json));
}
