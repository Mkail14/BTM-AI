import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { googleLoginEmail } from "@/lib/drive/identity";
import { buildDriveAuthUrl, driveConfigured } from "@/lib/drive/oauth";

/**
 * Part chez Google pour relier le Drive. Dans l'application Android, Google s'ouvre dans le navigateur.
 * Compte connecté avec Google : le Drive s'ouvre sur ce même Gmail, la personne n'a qu'à autoriser.
 * Sinon : Google laisse choisir le compte (deuxième connexion).
 */
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user || !driveConfigured()) return NextResponse.redirect(new URL("/documents?drive=echec", origin));
  const { data } = await supabase.auth.getUserIdentities().catch(() => ({ data: null }));
  const gmail = googleLoginEmail(data?.identities);
  const url = buildDriveAuthUrl(user.id, origin, Date.now(), undefined, gmail ?? user.email, Boolean(gmail));
  return NextResponse.redirect(url ?? new URL("/documents?drive=echec", origin));
}
