import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authRequiredPath } from "./redirect";
import { hasAdminRole } from "./roles";

export type SessionUser = {
  id: string;
  email: string | null;
  isAdmin: boolean;
};

/**
 * Lit l'utilisateur à partir du jeton de session. getClaims() vérifie la
 * signature du JWT : on ne fait jamais confiance au contenu brut du cookie.
 */
export async function getSessionUser(
  supabase?: SupabaseClient | null,
): Promise<SessionUser | null> {
  const client = supabase ?? (await createSupabaseServerClient());
  if (!client) return null;

  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  const email = data.claims.email;
  return {
    id: data.claims.sub,
    email: typeof email === "string" ? email : null,
    isAdmin: hasAdminRole(data.claims),
  };
}

/** Client RLS + utilisateur, pour les routes serveur. */
export async function getAuthContext() {
  const supabase = await createSupabaseServerClient();
  const user = supabase ? await getSessionUser(supabase) : null;
  return { supabase, user };
}

/** À utiliser dans les pages privées : renvoie vers l'accueil avec la fenêtre de connexion. */
export async function requireUser(currentPath: string) {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) redirect(authRequiredPath(currentPath));
  return { supabase, user };
}

/** Pages d'administration : 404 pour les non-administrateurs (l'existence de la page n'est pas révélée). */
export async function requireAdmin(currentPath: string) {
  const context = await requireUser(currentPath);
  if (!context.user.isAdmin) notFound();
  return context;
}
