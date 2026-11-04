import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DEFAULT_PERSONALITY, isPersonalityId, type PersonalityCard } from "@/lib/ai/personalities";
import { loadPersonalityCards } from "@/lib/ai/personality-store";
import type { SessionUser } from "@/lib/auth/identity";
import { chatErrorBody } from "@/lib/chat/errors";
import type { ChatErrorCode } from "@/lib/chat/types";
import { profileSchema } from "@/lib/chat/validation";
import { getProfile } from "@/lib/conversations/repository";
import { bearerTokenOf, isBearerClient } from "@/lib/supabase/bearer";
import { consumeRateLimits, RATE_LIMIT_POLICIES, type RateLimitDecision } from "@/lib/rate-limit";
import { DELETE_CONFIRMATION } from "./confirmation";
import { removeAccount, saveDisplayName, savePersonality, type AccountDeps, type AccountResult } from "./settings";

/**
 * Logique de GET / PATCH / DELETE /api/me (application mobile), indépendante de
 * Next : la route fournit l'identité déjà validée et la requête déjà lue.
 * Les erreurs ont la forme des routes de conversations : { error: { code, message } }.
 */

export type MeContext = { supabase: SupabaseClient | null; user: SessionUser | null };
export type MeResponse = { status: number; body: unknown; headers?: Record<string, string> };

/** Dépendances remplaçables dans les tests (aucun appel réseau). */
export type MeDeps = Partial<AccountDeps> & {
  loadCards?: () => Promise<PersonalityCard[]>;
  rateLimit?: (userId: string) => Promise<RateLimitDecision>;
  /** Le compte existe-t-il encore côté Auth ? Par défaut : getUser(token) pour un client Bearer. */
  verifyUser?: (supabase: SupabaseClient, user: SessionUser) => Promise<boolean>;
};

type Authed = { supabase: SupabaseClient; user: SessionUser };

function unauthorized(): MeResponse {
  return { status: 401, body: chatErrorBody("unauthorized") };
}

function authed(ctx: MeContext): Authed | null {
  return ctx.supabase && ctx.user ? { supabase: ctx.supabase, user: ctx.user } : null;
}

function failure(status: number, code: ChatErrorCode, message?: string): MeResponse {
  return { status, body: chatErrorBody(code, message) };
}

function fromFailedResult(result: Extract<AccountResult, { ok: false }>): MeResponse {
  switch (result.kind) {
    case "invalid_request":
      return failure(400, "invalid_request", result.message);
    case "forbidden":
      return failure(403, "invalid_request", result.message);
    case "reauth_required":
      return failure(401, "reauth_required", result.message);
    case "wallet_not_empty":
      return failure(409, "wallet_not_empty", result.message);
    case "unavailable":
      return failure(503, "service_unavailable", result.message);
    default:
      return failure(500, "internal", result.message);
  }
}

function accountDeps(deps: MeDeps): AccountDeps | undefined {
  const { notifyChange, notifyDeleted, getAdminClient, now, readWallet } = deps;
  if (!notifyChange && !notifyDeleted && !getAdminClient && !now && !readWallet) return undefined;
  return {
    notifyChange: notifyChange ?? (async () => {}),
    notifyDeleted: notifyDeleted ?? (async () => {}),
    getAdminClient: getAdminClient ?? (() => null),
    now: now ?? (() => Date.now()),
    readWallet: readWallet ?? (async () => ({ balanceCents: 0, pendingTopup: false })),
  };
}

/**
 * Routes sensibles (PATCH, DELETE) : en plus de la signature, le serveur Auth
 * confirme que le compte existe encore et n'est pas banni (getClaims ne vérifie
 * que signature et expiration). Seulement pour un jeton Bearer : le chemin cookie
 * du site n'est pas modifié.
 */
async function accountStillValid(supabase: SupabaseClient, user: SessionUser, deps: MeDeps): Promise<boolean> {
  if (deps.verifyUser) return deps.verifyUser(supabase, user);
  if (!isBearerClient(supabase)) return true;
  try {
    const { data, error } = await supabase.auth.getUser(bearerTokenOf(supabase));
    return !error && data.user?.id === user.id;
  } catch {
    return false;
  }
}

async function profileView(supabase: SupabaseClient, user: SessionUser) {
  const profile = await getProfile(supabase, user.id);
  return {
    email: user.email,
    displayName: profile.displayName,
    // null : jamais choisie (ou colonne absente) -> l'application propose le choix.
    personality: profile.personality ?? null,
  };
}

export async function getMe(ctx: MeContext, deps: MeDeps = {}): Promise<MeResponse> {
  const auth = authed(ctx);
  if (!auth) return unauthorized();
  try {
    const [profile, personalities] = await Promise.all([
      profileView(auth.supabase, auth.user),
      (deps.loadCards ?? loadPersonalityCards)(),
    ]);
    return {
      status: 200,
      body: { profile, personalities, defaultPersonality: DEFAULT_PERSONALITY },
      headers: { "Cache-Control": "no-store" },
    };
  } catch (error) {
    console.error("[me] Lecture impossible", error);
    return failure(500, "internal");
  }
}

const UNKNOWN_PERSONALITY = "Personnalité inconnue.";

/** Au moins un champ, aucun champ inconnu. Mêmes règles que le formulaire du site. */
export const patchMeSchema = z
  .strictObject({
    displayName: profileSchema.shape.displayName.optional(),
    personality: z
      .string({ error: UNKNOWN_PERSONALITY })
      .refine(isPersonalityId, UNKNOWN_PERSONALITY)
      .optional(),
  })
  .refine((v) => v.displayName !== undefined || v.personality !== undefined, "Aucun réglage à enregistrer.");

export async function patchMe(ctx: MeContext, raw: unknown, deps: MeDeps = {}): Promise<MeResponse> {
  const auth = authed(ctx);
  if (!auth) return unauthorized();

  const parsed = patchMeSchema.safeParse(raw);
  if (!parsed.success) return failure(400, "invalid_request", parsed.error.issues[0]?.message ?? "Valeur invalide.");
  const { displayName, personality } = parsed.data;
  if (!(await accountStillValid(auth.supabase, auth.user, deps))) return unauthorized();

  try {
    const limiter =
      deps.rateLimit ??
      ((id: string) => consumeRateLimits([{ key: `account-update:${id}`, rules: RATE_LIMIT_POLICIES.accountUpdate }]));
    const decision = await limiter(auth.user.id);
    if (!decision.allowed) {
      return {
        status: 429,
        body: chatErrorBody("rate_limited"),
        headers: { "Retry-After": String(decision.retryAfterSeconds) },
      };
    }
  } catch (error) {
    console.error("[me] Limite de débit indisponible", error);
    return failure(500, "internal");
  }

  let message = "Paramètres enregistrés.";
  if (displayName !== undefined) {
    const result = await saveDisplayName(auth.supabase, auth.user, { displayName }, accountDeps(deps));
    if (!result.ok) return fromFailedResult(result);
  }
  if (personality !== undefined) {
    const result = await savePersonality(auth.supabase, auth.user, personality);
    if (!result.ok) return fromFailedResult(result);
    if (displayName === undefined) message = result.message;
  }

  try {
    return { status: 200, body: { profile: await profileView(auth.supabase, auth.user), message } };
  } catch (error) {
    console.error("[me] Relecture du profil impossible", error);
    return failure(500, "internal");
  }
}

const deleteMeSchema = z.strictObject({ confirmation: z.literal(DELETE_CONFIRMATION) });

export async function deleteMe(ctx: MeContext, raw: unknown, deps: MeDeps = {}): Promise<MeResponse> {
  const auth = authed(ctx);
  if (!auth) return unauthorized();

  const parsed = deleteMeSchema.safeParse(raw);
  if (!parsed.success) return failure(400, "invalid_request", `Écris ${DELETE_CONFIRMATION} pour confirmer.`);

  if (!(await accountStillValid(auth.supabase, auth.user, deps))) return unauthorized();

  const result = await removeAccount(auth.supabase, auth.user, parsed.data.confirmation, accountDeps(deps));
  return result.ok ? { status: 200, body: { message: result.message } } : fromFailedResult(result);
}
