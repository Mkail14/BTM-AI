import "server-only";

/**
 * Accès aux API de France Travail (francetravail.io) : un jeton par groupe d'API (« scope »),
 * gardé jusqu'à une minute avant son expiration. Clés dans FRANCE_TRAVAIL_CLIENT_ID et
 * FRANCE_TRAVAIL_CLIENT_SECRET (application « tamilya » sur francetravail.io).
 */
const TOKEN_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const TIMEOUT_MS = 8_000;

const tokens = new Map<string, { value: string; expiresAt: number }>();

export function franceTravailKeys() {
  const id = process.env.FRANCE_TRAVAIL_CLIENT_ID?.trim();
  const secret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET?.trim();
  return id && secret ? { id, secret } : null;
}

/** Jeton pour ce groupe d'API ; une erreur est levée si France Travail refuse (clés ou API non ajoutée à l'application). */
export async function franceTravailToken(scope: string): Promise<string> {
  const kept = tokens.get(scope);
  if (kept && Date.now() < kept.expiresAt) return kept.value;
  const keys = franceTravailKeys();
  if (!keys) throw new Error("clés France Travail absentes");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: keys.id, client_secret: keys.secret, scope }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`jeton refusé (HTTP ${response.status})`);
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("jeton absent");
  tokens.set(scope, { value: data.access_token, expiresAt: Date.now() + ((data.expires_in ?? 1500) - 60) * 1000 });
  return data.access_token;
}

/** Jeton refusé par l'API (401) : on en redemandera un. */
export const forgetFranceTravailToken = (scope: string) => tokens.delete(scope);
