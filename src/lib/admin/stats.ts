import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRateLimitSettings } from "@/lib/rate-limit/settings";

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

/** Lignes lues par page, et pages au plus avant de compter compte par compte. */
const COUNT_PAGE = 1000;
const COUNT_MAX_PAGES = 10;

/**
 * Nombre de lignes par compte, en une requête (ou quelques pages) pour toute
 * la page de comptes, au lieu d'une requête par compte. Seule la colonne
 * user_id est lue. Au-delà de COUNT_MAX_PAGES pages (comptes très actifs), on
 * revient au comptage exact compte par compte, en parallèle.
 */
async function countByUser(
  admin: SupabaseClient,
  table: "conversations" | "messages",
  ids: readonly string[],
  onlyQuestions: boolean,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>(ids.map((id) => [id, 0]));
  for (let page = 0; page < COUNT_MAX_PAGES; page++) {
    let query = admin.from(table).select("user_id").in("user_id", ids as string[]);
    if (onlyQuestions) query = query.eq("role", "user");
    const { data, error } = await query.order("id").range(page * COUNT_PAGE, (page + 1) * COUNT_PAGE - 1);
    if (error) throw error;
    for (const row of (data ?? []) as { user_id: string }[]) counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
    if ((data ?? []).length < COUNT_PAGE) return counts;
  }
  const head = { count: "exact", head: true } as const;
  const exact = await Promise.all(
    ids.map((id) => {
      const query = admin.from(table).select("id", head).eq("user_id", id);
      return count(onlyQuestions ? query.eq("role", "user") : query);
    }),
  );
  return new Map(ids.map((id, index) => [id, exact[index]]));
}

/** Statistiques agrégées (fonction SQL public.admin_platform_stats). */
export async function getAdminOverview(admin: SupabaseClient): Promise<AdminOverview> {
  const limits = await loadRateLimitSettings();
  const anonDailyLimit = limits.anonymousDevice.day;
  const userDailyLimit = limits.user.day;
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

  const [conversationCounts, messageCounts] =
    ids.length > 0
      ? await Promise.all([countByUser(admin, "conversations", ids, false), countByUser(admin, "messages", ids, true)])
      : [new Map<string, number>(), new Map<string, number>()];

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

type AuthUser = Awaited<ReturnType<SupabaseClient["auth"]["admin"]["listUsers"]>>["data"]["users"][number];

/**
 * Tous les comptes (jusqu'à `maxPages` pages de 1000) : la première page donne
 * le nombre de pages, les suivantes sont lues en même temps au lieu de l'une
 * après l'autre. null si la liste est illisible.
 */
export async function listAllAuthUsers(admin: SupabaseClient, maxPages = 10): Promise<AuthUser[] | null> {
  const perPage = 1000;
  const first = await admin.auth.admin.listUsers({ page: 1, perPage });
  if (first.error) {
    console.error("[admin] Comptes illisibles", first.error);
    return null;
  }
  const users = [...first.data.users];
  const lastPage = Math.min(maxPages, first.data.lastPage || Math.ceil((first.data.total ?? 0) / perPage) || 1);
  if (first.data.users.length < perPage || lastPage <= 1) return users;
  const rest = await Promise.all(
    Array.from({ length: lastPage - 1 }, (_, i) => admin.auth.admin.listUsers({ page: i + 2, perPage })),
  );
  for (const page of rest) {
    if (page.error) {
      console.error("[admin] Comptes illisibles", page.error);
      return null;
    }
    users.push(...page.data.users);
  }
  return users;
}
