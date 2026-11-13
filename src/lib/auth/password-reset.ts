import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { normalizeEmail } from "@/lib/auth/signup";

/** Supabase n'accepte qu'un e-mail par minute pour une même adresse. */
export const PASSWORD_RESET_DELAY_SECONDS = 60;

export type PasswordResetResult = "sent" | "too_soon" | "network";

/**
 * Envoie le lien « choisir un nouveau mot de passe » (fenêtre de connexion et
 * page Mot de passe oublié). « sent » que l'adresse existe ou non : pas
 * d'énumération des comptes.
 */
export async function requestPasswordReset(email: string): Promise<PasswordResetResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return "network";
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
      // « origine=oubli » : l’e-mail de confirmation dira « nouveau mot de passe créé ».
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/nouveau-mot-de-passe?origine=oubli")}`,
    });
    if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") return "too_soon";
    return "sent";
  } catch {
    return "network";
  }
}

export const PASSWORD_RESET_ERRORS: Record<Exclude<PasswordResetResult, "sent">, string> = {
  too_soon: "Un e-mail vient déjà de partir. Patiente une minute avant d'en redemander un.",
  network: "Connexion au service impossible. Vérifie ta connexion internet.",
};
