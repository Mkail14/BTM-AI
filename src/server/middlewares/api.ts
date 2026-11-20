import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { chatErrorBody } from "@/lib/chat/errors";
import type { ChatErrorCode } from "@/lib/chat/types";
import { consumeRateLimits, type RateLimitSubject } from "./rate-limit";
import { isSameOrigin } from "./request";
import { getAuthContext, type SessionUser } from "./session";

/** Session vérifiée, passée au contrôleur par signedIn. */
export type Auth = { supabase: SupabaseClient; user: SessionUser };

export type Controller<C> = (request: NextRequest, auth: Auth, context: C) => Promise<Response>;

/** Réponse d'erreur de l'API : un code et un message lisible, jamais de détail interne. */
export function apiError(code: ChatErrorCode, status: number, headers?: HeadersInit) {
  return NextResponse.json(chatErrorBody(code), { status, headers });
}

/**
 * Route réservée aux comptes connectés : la session est relue (jeton vérifié)
 * avant d'appeler le contrôleur. `write` : la requête modifie des données,
 * elle doit venir du site lui-même (protection CSRF).
 */
export function signedIn<C>(controller: Controller<C>, options: { write?: boolean } = {}) {
  return async (request: NextRequest, context: C): Promise<Response> => {
    if (options.write && !isSameOrigin(request)) return apiError("invalid_request", 403);
    const { supabase, user } = await getAuthContext();
    if (!supabase || !user) return apiError("unauthorized", 401);
    return controller(request, { supabase, user }, context);
  };
}

/** null si la limite laisse passer, sinon la réponse 429 à renvoyer. Lève si le stockage des compteurs est en panne. */
export async function rateLimit(subjects: RateLimitSubject[]): Promise<Response | null> {
  const decision = await consumeRateLimits(subjects);
  if (decision.allowed) return null;
  return apiError("rate_limited", 429, { "Retry-After": String(decision.retryAfterSeconds) });
}

/** Corps JSON de la requête, ou undefined s'il est illisible (le schéma le refusera). */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
