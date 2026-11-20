import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/server/middlewares/session";
import { disconnectDrive, driveEmail } from "@/server/services/drive/connection";
import { isSameOrigin } from "@/server/middlewares/request";
import { getSupabaseAdminClient } from "@/server/config/supabase-admin";

const NO_STORE = { "Cache-Control": "no-store" };

/** Le compte a-t-il relié son Google Drive, et lequel ? */
export async function GET() {
  const { user } = await getAuthContext();
  const admin = getSupabaseAdminClient();
  if (!user || !admin) return NextResponse.json({ connected: false }, { headers: NO_STORE });
  const link = await driveEmail(admin, user.id).catch(() => null);
  return NextResponse.json({ connected: link !== null, email: link?.email ?? null }, { headers: NO_STORE });
}

/** Déconnecte le Drive : les fichiers y restent. */
export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  const { user } = await getAuthContext();
  const admin = getSupabaseAdminClient();
  if (!user || !admin) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  try {
    await disconnectDrive(admin, user.id);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error("[documents] Déconnexion impossible", error instanceof Error ? error.message : "inconnue");
    return NextResponse.json({ error: "La déconnexion a échoué. Réessaie." }, { status: 500 });
  }
}
