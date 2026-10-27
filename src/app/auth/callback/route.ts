import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Point de retour des liens envoyés par e-mail (confirmation d'inscription,
 * réinitialisation du mot de passe). Gère le flux PKCE (`code`) et le flux
 * `token_hash` recommandé par Supabase pour le rendu serveur.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const isSignupConfirmation = searchParams.get("bienvenue") === "1";
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const success = () => {
    const url = new URL(next, origin);
    if (isSignupConfirmation) url.searchParams.set("bienvenue", "1");
    return NextResponse.redirect(url);
  };

  // Supabase renvoie ?error=… quand le lien a expiré ou a déjà servi.
  if (searchParams.get("error") || searchParams.get("error_code")) {
    return NextResponse.redirect(new URL("/auth/erreur", origin));
  }

  const supabase = await createSupabaseServerClient();
  if (supabase) {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return success();
      // Avec PKCE, Supabase a déjà validé l'adresse avant de rediriger ici ;
      // l'échange échoue seulement si le lien est ouvert dans un autre
      // navigateur (souvent celui de l'application de messagerie sur mobile).
      if (isSignupConfirmation) {
        return NextResponse.redirect(new URL("/?compte=confirme", origin));
      }
    } else if (tokenHash && type && OTP_TYPES.includes(type)) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (!error) return success();
    }
  }

  return NextResponse.redirect(new URL("/auth/erreur", origin));
}
