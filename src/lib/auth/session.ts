import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authRequiredPath } from "./redirect";
import { resolveAuthContext, userFromClient, type SessionUser } from "./identity";

export type { SessionUser };

/**
 * Lit l'utilisateur à partir du jeton de session. getClaims() vérifie la
 * signature du JWT : on ne fait jamais confiance au contenu brut du cookie.
 */
export async function getSessionUser(
  supabase?: SupabaseClient | null,
): Promise<SessionUser | null> {
  const client = supabase ?? (await createSupabaseServerClient());
  if (!client) return null;

  return userFromClient(client);
}

/**
 * Client RLS + utilisateur, pour les routes serveur. Mémorisé le temps d'un
 * rendu : la mise en page et la page lisent la session une seule fois.
 */
export const getAuthContext = cache(async () => resolveAuthContext(await createSupabaseServerClient()));

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

/** Profil de l'entreprise : 404 pour tous sauf l'administrateur principal. */
export async function requirePrincipalAdmin(currentPath: string) {
  const context = await requireUser(currentPath);
  if (!context.user.isPrincipalAdmin) notFound();
  return context;
}
