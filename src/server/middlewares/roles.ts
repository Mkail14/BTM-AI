/**
 * Rôle administrateur : lu dans `app_metadata` du jeton, que seul le serveur
 * Supabase (clé secrète ou SQL) peut modifier. Jamais dans `user_metadata`,
 * que l'utilisateur peut changer lui-même.
 */
export function hasAdminRole(claims: Record<string, unknown> | null | undefined): boolean {
  const appMetadata = claims?.app_metadata;
  if (!appMetadata || typeof appMetadata !== "object") return false;
  return (appMetadata as Record<string, unknown>).role === "admin";
}

/**
 * Administrateur principal : un administrateur sans `admin_level: "secondary"`.
 * L'administrateur secondaire (délégué) a tous les droits sauf le Profil de
 * l'entreprise : RIB, délégation, maintenance et mode démo.
 */
export function hasPrincipalAdminRole(claims: Record<string, unknown> | null | undefined): boolean {
  if (!hasAdminRole(claims)) return false;
  return (claims?.app_metadata as Record<string, unknown>).admin_level !== "secondary";
}
