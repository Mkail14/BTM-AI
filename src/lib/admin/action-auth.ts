import "server-only";
import { getAuthContext } from "@/lib/auth/session";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

export const NOT_ADMIN: ActionResult = { ok: false, message: "Accès réservé aux administrateurs." };

/** Les actions s'autorisent elles-mêmes : session relue, rôle revérifié (RLS aussi). */
export async function requireAdminAction() {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user?.isAdmin) return null;
  return { supabase, user };
}

export const NOT_PRINCIPAL: ActionResult = { ok: false, message: "Réservé à l'administrateur principal." };

/** Profil de l'entreprise (RIB, délégation, maintenance, mode démo) : administrateur principal seulement. */
export async function requirePrincipalAdminAction() {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user?.isPrincipalAdmin) return null;
  return { supabase, user };
}
