import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { describeDevice, describePlace, siteOrigin } from "@/lib/email/device";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { passwordChangedEmail, passwordCreatedEmail } from "@/lib/email/templates";

/**
 * E-mail de confirmation après un changement de mot de passe : « nouveau mot de
 * passe créé » (après un oubli) ou « mot de passe modifié » (depuis les
 * Paramètres). N'écrit qu'à l'adresse du compte connecté, et seulement si le
 * compte vient réellement d'être mis à jour (pas d'envoi à volonté).
 */
const RECENT_MS = 3 * 60 * 1000;

export async function POST(request: NextRequest) {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user?.email) return NextResponse.json({ ok: false }, { status: 401 });
  if (!emailConfigured()) return NextResponse.json({ ok: false });

  const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
  const { data } = await supabase.auth.getUser();
  const updatedAt = data.user?.updated_at ? Date.parse(data.user.updated_at) : 0;
  if (!updatedAt || Date.now() - updatedAt > RECENT_MS) return NextResponse.json({ ok: false });

  const ctx = {
    origin: siteOrigin(request.nextUrl.origin),
    device: describeDevice(request.headers.get("user-agent")),
    place: describePlace(request.headers),
    at: new Date(),
  };
  const email = body.reason === "oubli" ? passwordCreatedEmail(user.email, ctx) : passwordChangedEmail(user.email, ctx);

  try {
    await sendEmail(user.email, email);
  } catch (error) {
    console.error("[password-notice] Envoi impossible", error);
    return NextResponse.json({ ok: false });
  }
  return NextResponse.json({ ok: true });
}
