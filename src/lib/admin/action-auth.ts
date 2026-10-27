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
