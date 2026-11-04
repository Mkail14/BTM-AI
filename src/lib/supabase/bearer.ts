import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublishableKey, supabaseUrl } from "./config";

/**
 * Authentification par jeton explicite (application mobile) :
 * `Authorization: Bearer <access_token Supabase>`.
 *
 * Règles :
 * - le cookie de session Supabase PRIME : s'il existe, l'en-tête Authorization
 *   est ignoré (le comportement du site web ne change pas, et les deux
 *   identités ne sont jamais mélangées) ;
 * - sans cookie de session, un Bearer présent doit être valide : sinon la
 *   requête est refusée (401), jamais traitée comme celle d'un invité ;
 * - seul un jeton d'utilisateur (rôle « authenticated ») est accepté, jamais
 *   la clé publique ni la clé secrète.
 */

export type AuthSource =
  | { kind: "cookie" }
  | { kind: "none" }
  | { kind: "bearer"; token: string }
  /** En-tête Bearer présent mais sans jeton exploitable. */
  | { kind: "bearer-malformed" };

/** Cookies de session de @supabase/ssr : « sb-<projet>-auth-token », éventuellement découpé en « .0 », « .1 »… */
const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

export function hasSessionCookie(cookieNames: Iterable<string>): boolean {
  for (const name of cookieNames) if (SESSION_COOKIE.test(name)) return true;
  return false;
}

/** Un jeton JWT : trois segments base64url, taille raisonnable (pas de clé « sb_secret_… »). */
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MAX_TOKEN_LENGTH = 8192;

export function chooseAuthSource(cookieNames: Iterable<string>, authorization: string | null): AuthSource {
  if (hasSessionCookie(cookieNames)) return { kind: "cookie" };
  if (!authorization) return { kind: "none" };
  const match = /^\s*Bearer(?:\s+(.*))?$/i.exec(authorization);
  if (!match) return { kind: "none" }; // Autre schéma (Basic…) : pas notre affaire.
  const token = (match[1] ?? "").trim();
  if (!token || token.length > MAX_TOKEN_LENGTH || !JWT_SHAPE.test(token)) return { kind: "bearer-malformed" };
  return { kind: "bearer", token };
}

/** Jeton associé à un client créé par createBearerClient (« » = en-tête Bearer inexploitable). */
const bearerTokens = new WeakMap<object, string>();

export function bearerTokenOf(client: object | null | undefined): string | undefined {
  return client ? bearerTokens.get(client) : undefined;
}

/** Vrai si le client agit avec un jeton Bearer (et non avec les cookies). */
export function isBearerClient(client: object | null | undefined): boolean {
  return bearerTokenOf(client) !== undefined;
}

/** Marque un client comme porteur du jeton (utilisé aussi par les tests avec un double). */
export function registerBearerClient<T extends object>(client: T, token: string): T {
  bearerTokens.set(client, token);
  return client;
}

/**
 * Client sans session persistée qui envoie le jeton à PostgREST : les
 * politiques RLS s'appliquent avec l'identité de l'utilisateur.
 */
export function createBearerClient(token: string): SupabaseClient {
  const client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
  return registerBearerClient(client, token);
}

type Claims = { sub?: unknown; role?: unknown; [key: string]: unknown };

/**
 * Valide le jeton côté serveur : getClaims(token) vérifie la signature (clés
 * JWKS du projet, ou getUser() pour une clé symétrique) et l'expiration.
 * Renvoie null si le jeton est invalide, expiré, ou n'est pas celui d'un utilisateur.
 */
export async function verifyBearerClaims(client: SupabaseClient, token: string): Promise<Claims | null> {
  if (!token) return null;
  try {
    const { data, error } = await client.auth.getClaims(token);
    const claims = data?.claims as Claims | undefined;
    if (error || !claims || typeof claims.sub !== "string" || !claims.sub) return null;
    if (claims.role !== "authenticated") return null;
    return claims;
  } catch {
    return null;
  }
}
