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

export type BearerSource =
  | { kind: "none" }
  | { kind: "bearer"; token: string }
  /** En-tête Bearer présent mais sans jeton exploitable. */
  | { kind: "bearer-malformed" };

export type AuthSource =
  /** `fallback` : l'en-tête Bearer, utilisé seulement si le cookie ne donne aucune session (voir selectClient). */
  | { kind: "cookie"; fallback: BearerSource | null }
  | BearerSource;

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
  const bearer = parseAuthorization(authorization);
  if (hasSessionCookie(cookieNames)) return { kind: "cookie", fallback: bearer.kind === "none" ? null : bearer };
  return bearer;
}

function parseAuthorization(authorization: string | null): BearerSource {
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

/** Algorithmes de signature attendus des jetons Supabase Auth (asymétriques, ou HS256 historique). */
const ALLOWED_ALGS = new Set(["ES256", "RS256", "HS256"]);

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Contrôle local, sans réseau, avant tout appel à Supabase Auth : un jeton forgé
 * (autre projet, alg inattendu, jeton d'une autre audience) ne doit pas coûter
 * de téléchargement de JWKS ni d'appel getUser.
 */
export function precheckBearerToken(token: string, url: string = supabaseUrl): boolean {
  const [rawHeader, rawPayload] = token.split(".");
  if (!rawHeader || !rawPayload) return false;
  const header = decodeSegment(rawHeader);
  const payload = decodeSegment(rawPayload);
  if (!header || !payload) return false;
  if (typeof header.alg !== "string" || !ALLOWED_ALGS.has(header.alg)) return false;
  if (payload.iss !== `${url.replace(/\/+$/, "")}/auth/v1`) return false;
  if (payload.aud !== "authenticated") return false;
  return true;
}

/**
 * Valide le jeton côté serveur : contrôle local (iss, alg, aud), puis
 * getClaims(token) qui vérifie la signature (clés JWKS du projet, ou getUser()
 * pour une clé symétrique) et l'expiration. Renvoie null si le jeton est
 * invalide, expiré, anonyme ou n'est pas celui d'un utilisateur.
 */
export async function verifyBearerClaims(client: SupabaseClient, token: string): Promise<Claims | null> {
  if (!token || !precheckBearerToken(token)) return null;
  try {
    const { data, error } = await client.auth.getClaims(token);
    const claims = data?.claims as Claims | undefined;
    if (error || !claims || typeof claims.sub !== "string" || !claims.sub) return null;
    if (claims.role !== "authenticated") return null;
    // Comptes anonymes Supabase : pas d'identité durable, pas de quota de compte.
    if (claims.is_anonymous === true) return null;
    return claims;
  } catch {
    return null;
  }
}
