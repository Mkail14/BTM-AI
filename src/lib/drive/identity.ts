/**
 * Le Google relié au Drive est-il déjà celui du compte Tamilya ? (Sans dépendance : testé seul.)
 *
 * Le jeton d'identité vient du serveur de Google (échange du code, côté serveur) : on lit
 * seulement son identifiant (« sub ») pour le comparer aux identités du compte, sans s'en servir
 * pour donner un accès.
 */

/** Identifiant Google (« sub ») du jeton d'identité, ou null s'il est illisible. */
export function googleSubject(idToken: string): string | null {
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: unknown };
    return typeof data.sub === "string" && data.sub ? data.sub : null;
  } catch {
    return null;
  }
}

type Identity = { provider: string; id?: string; identity_id?: string; identity_data?: { sub?: unknown } | null };

/** Vrai si une identité Google du compte porte ce même identifiant. */
export function ownsGoogleIdentity(identities: readonly Identity[] | null | undefined, sub: string | null): boolean {
  if (!sub || !identities) return false;
  return identities.some((identity) => identity.provider === "google" && (identity.id === sub || identity.identity_data?.sub === sub));
}
