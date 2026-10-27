import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RATE_LIMIT_POLICIES } from "@/lib/rate-limit/policies";
import type { RateLimitRule } from "@/lib/rate-limit/types";

/**
 * Données de la page d'administration, lues avec le client à clé secrète
 * (contourne RLS). L'appelant doit avoir vérifié le rôle administrateur.
 * Uniquement des comptages et des métadonnées de comptes : le contenu des
 * conversations n'est jamais lu (voir la page « Données et confidentialité »).
 */

export type AdminOverview = {
  usersTotal: number;
  /** Inscriptions du jour (heure de Mayotte). */
  usersNewToday: number;
  usersNew7d: number;
  usersUnconfirmed: number;
  usersActive7d: number;
  conversationsTotal: number;
  questionsToday: number;
  questions7d: number;
  questions30d: number;
  answers7d: number;
  errors7d: number;
  interrupted7d: number;
  /** Visiteurs sans compte, depuis minuit UTC (3 h à Mayotte). */
  anonDevicesToday: number;
  anonMessagesToday: number;
  anonDevicesBlockedToday: number;
  usersBlockedToday: number;
  /** 14 derniers jours (heure de Mayotte), questions des comptes connectés. */
  daily: { day: string; questions: number }[];
  /** Quotas journaliers en vigueur, pour l'affichage. */
  anonDailyLimit: number;
  userDailyLimit: number;
};

export type AdminUserRow = {
  id: string;
  email: string | null;
  isAdmin: boolean;
  confirmed: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  conversations: number;
  /** Messages envoyés par l'utilisateur (questions), toutes conversations confondues. */
  messagesSent: number;
};

export const ADMIN_USERS_PER_PAGE = 25;


async function count(
  query: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number> {
  const { count: value, error } = await query;
  if (error) throw error;
  return value ?? 0;
}

function dailyLimit(rules: readonly RateLimitRule[]): number {
  return rules.find((rule) => rule.windowSeconds === 86_400)?.limit ?? 0;
}

/** Statistiques agrégées (fonction SQL public.admin_platform_stats). */
export async function getAdminOverview(admin: SupabaseClient): Promise<AdminOverview> {
  const anonDailyLimit = dailyLimit(RATE_LIMIT_POLICIES.anonymousDevice);
  const userDailyLimit = dailyLimit(RATE_LIMIT_POLICIES.user);
  const { data, error } = await admin.rpc("admin_platform_stats", {
    p_anon_daily_limit: anonDailyLimit,
    p_user_daily_limit: userDailyLimit,
  });
  if (error || !data) {
    throw new Error(`admin_platform_stats a échoué (migration appliquée ?) : ${error?.message ?? "réponse vide"}`);
  }

  const s = data as Record<string, unknown>;
  const n = (key: string) => Number(s[key] ?? 0);
  const daily = Array.isArray(s.daily) ? (s.daily as { day: string; questions: number }[]) : [];

  return {
    usersTotal: n("users_total"),
    usersNewToday: n("users_new_today"),
    usersNew7d: n("users_new_7d"),
    usersUnconfirmed: n("users_unconfirmed"),
    usersActive7d: n("users_active_7d"),
    conversationsTotal: n("conversations_total"),
    questionsToday: n("questions_today"),
    questions7d: n("questions_7d"),
    questions30d: n("questions_30d"),
    answers7d: n("answers_7d"),
    errors7d: n("errors_7d"),
    interrupted7d: n("interrupted_7d"),
    anonDevicesToday: n("anon_devices_today"),
    anonMessagesToday: n("anon_messages_today"),
    anonDevicesBlockedToday: n("anon_devices_blocked_today"),
    usersBlockedToday: n("users_blocked_today"),
    daily: daily.map((d) => ({ day: String(d.day), questions: Number(d.questions) })),
    anonDailyLimit,
    userDailyLimit,
  };
}

/**
 * Une page de comptes (triée du plus récent au plus ancien), avec leur nombre
 * de conversations et de messages envoyés (comptages seulement).
 */
export async function listAdminUsers(
  admin: SupabaseClient,
  page: number,
): Promise<{ users: AdminUserRow[]; total: number; hasNextPage: boolean }> {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: ADMIN_USERS_PER_PAGE });
  if (error) throw error;

  const authUsers = [...data.users].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const ids = authUsers.map((u) => u.id);
  const head = { count: "exact", head: true } as const;

  const conversationCounts = new Map<string, number>();
  const messageCounts = new Map<string, number>();
  if (ids.length > 0) {
    const [conversations, messages] = await Promise.all([
      Promise.all(ids.map((id) => count(admin.from("conversations").select("id", head).eq("user_id", id)))),
      Promise.all(
        ids.map((id) => count(admin.from("messages").select("id", head).eq("user_id", id).eq("role", "user"))),
      ),
    ]);
    ids.forEach((id, index) => {
      conversationCounts.set(id, conversations[index]);
      messageCounts.set(id, messages[index]);
    });
  }

  return {
    users: authUsers.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      isAdmin: u.app_metadata?.role === "admin",
      confirmed: Boolean(u.email_confirmed_at),
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      conversations: conversationCounts.get(u.id) ?? 0,
      messagesSent: messageCounts.get(u.id) ?? 0,
    })),
    total: data.total,
    hasNextPage: data.nextPage != null,
  };
}
