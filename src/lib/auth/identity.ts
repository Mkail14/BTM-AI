import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bearerTokenOf, isBearerClient, verifyBearerClaims } from "@/lib/supabase/bearer";
import { hasAdminRole, hasPrincipalAdminRole } from "./roles";

export type SessionUser = {
  id: string;
  email: string | null;
  isAdmin: boolean;
  /** Administrateur principal (pas délégué) : seul à ouvrir le Profil de l'entreprise. */
  isPrincipalAdmin: boolean;
};

/**
 * Utilisateur d'un client Supabase déjà créé.
 * - Client cookie : getClaims() vérifie la signature du JWT de la session stockée.
 * - Client Bearer (mobile) : pas de session stockée, le jeton est validé explicitement.
 */
export async function userFromClient(client: SupabaseClient): Promise<SessionUser | null> {
  const bearer = bearerTokenOf(client);
  let claims: Record<string, unknown> | null;
  if (bearer !== undefined) {
    claims = await verifyBearerClaims(client, bearer);
  } else {
    const { data, error } = await client.auth.getClaims();
    claims = error || !data?.claims?.sub ? null : data.claims;
  }
  if (!claims || typeof claims.sub !== "string") return null;

  const email = claims.email;
  return {
    id: claims.sub,
    email: typeof email === "string" ? email : null,
    isAdmin: hasAdminRole(claims),
    isPrincipalAdmin: hasPrincipalAdminRole(claims),
  };
}

/** Identité d'un client déjà créé, avec l'indication « jeton Bearer refusé ». */
export async function resolveAuthContext(supabase: SupabaseClient | null) {
  const user = supabase ? await userFromClient(supabase) : null;
  // Jeton Bearer fourni mais refusé (invalide, expiré, mal formé) : les routes qui
  // acceptent les invités doivent répondre 401 au lieu de traiter l'appel en invité.
  const invalidBearer = !user && isBearerClient(supabase);
  return { supabase, user, invalidBearer };
}
