import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { disconnectDrive, isDriveConnected } from "@/lib/drive/connection";
import { isSameOrigin } from "@/lib/security/request";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const NO_STORE = { "Cache-Control": "no-store" };

/** Le compte a-t-il relié son Google Drive ? */
export async function GET() {
  const { user } = await getAuthContext();
  const admin = getSupabaseAdminClient();
  if (!user || !admin) return NextResponse.json({ connected: false }, { headers: NO_STORE });
  const connected = await isDriveConnected(admin, user.id).catch(() => false);
  return NextResponse.json({ connected }, { headers: NO_STORE });
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
