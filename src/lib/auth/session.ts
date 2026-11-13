import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { adminGateOpen, adminLockPath, isAdminGatedPath } from "@/lib/admin/gate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authRequiredPath } from "./redirect";
import { hasAdminRole, hasPrincipalAdminRole } from "./roles";

export type SessionUser = {
  id: string;
  email: string | null;
  isAdmin: boolean;
  /** Administrateur principal (pas délégué) : seul à ouvrir le Profil de l'entreprise. */
  isPrincipalAdmin: boolean;
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
    isPrincipalAdmin: hasPrincipalAdminRole(data.claims),
  };
}

/**
 * Client RLS + utilisateur, pour les routes serveur. Mémorisé le temps d'un
 * rendu : la mise en page et la page lisent la session une seule fois.
 */
export const getAuthContext = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const user = supabase ? await getSessionUser(supabase) : null;
  return { supabase, user };
});

/** À utiliser dans les pages privées : renvoie vers l'accueil avec la fenêtre de connexion. */
export async function requireUser(currentPath: string) {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) redirect(authRequiredPath(currentPath));
  return { supabase, user };
}

/** Espace /admin seulement (pas /voix) : code d'authentification si le verrou est fermé (src/lib/admin/gate.ts). */
async function requireAdminGate(userId: string, currentPath: string) {
  if (!isAdminGatedPath(currentPath.split("?")[0])) return;
  if (!(await adminGateOpen(userId))) redirect(adminLockPath(currentPath));
}

/**
 * Pages d'administration : 404 pour les non-administrateurs (l'existence de la page n'est pas révélée),
 * puis le code d'authentification si le verrou est fermé.
 */
export async function requireAdmin(currentPath: string) {
  const context = await requireUser(currentPath);
  if (!context.user.isAdmin) notFound();
  await requireAdminGate(context.user.id, currentPath);
  return context;
}

/** Profil de l'entreprise : 404 pour tous sauf l'administrateur principal. */
export async function requirePrincipalAdmin(currentPath: string) {
  const context = await requireUser(currentPath);
  if (!context.user.isPrincipalAdmin) notFound();
  await requireAdminGate(context.user.id, currentPath);
  return context;
}
