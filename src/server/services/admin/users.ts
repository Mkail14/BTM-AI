import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isPersonalityId, type PersonalityId } from "@/lib/ai/personalities";

export const USER_FILTERS = ["tous", "confirmes", "en-attente", "admins"] as const;
export type UserFilter = (typeof USER_FILTERS)[number];

export const USER_SORTS = ["recents", "connexion"] as const;
export type UserSort = (typeof USER_SORTS)[number];

export const USERS_PAGE_SIZE = 25;
// Garde-fou : au-delà, la recherche se fera côté base (fonction SQL dédiée).
const MAX_SCANNED_USERS = 10_000;

export type DirectoryUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  personality: PersonalityId | null;
  isAdmin: boolean;
  confirmed: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  conversations: number;
  messagesSent: number;
};

export type UserDirectory = {
  users: DirectoryUser[];
  /** Nombre de comptes correspondant à la recherche et au filtre. */
  matching: number;
  page: number;
  pageCount: number;
  totals: { all: number; confirmed: number; pending: number; admins: number; lastSevenDays: number };
};

async function listAllAuthUsers(admin: SupabaseClient): Promise<User[]> {
  const all: User[] = [];
  for (let page = 1; all.length < MAX_SCANNED_USERS; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return all;
}

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/**
 * Annuaire des inscrits pour l'administration (client à clé secrète).
 * Recherche sur l'e-mail et le nom affiché, filtre par statut, tri, pagination.
 */
export async function getUserDirectory(
  admin: SupabaseClient,
  options: { query: string; filter: UserFilter; sort: UserSort; page: number },
): Promise<UserDirectory> {
  const [authUsers, profilesResult] = await Promise.all([
    listAllAuthUsers(admin),
    admin.from("profiles").select("id, display_name, personality"),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  const profiles = new Map(
    (profilesResult.data ?? []).map((p: { id: string; display_name: string | null; personality: string | null }) => [
      p.id,
      p,
    ]),
  );

  const weekAgo = Date.now() - 7 * 86_400_000;
  const rows = authUsers.map((u) => {
    const profile = profiles.get(u.id);
    return {
      id: u.id,
      email: u.email ?? null,
      displayName: profile?.display_name ?? null,
      personality: isPersonalityId(profile?.personality) ? profile.personality : null,
      isAdmin: u.app_metadata?.role === "admin",
      confirmed: Boolean(u.email_confirmed_at),
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
    };
  });

  const totals = {
    all: rows.length,
    confirmed: rows.filter((r) => r.confirmed).length,
    pending: rows.filter((r) => !r.confirmed).length,
    admins: rows.filter((r) => r.isAdmin).length,
    lastSevenDays: rows.filter((r) => Date.parse(r.createdAt) >= weekAgo).length,
  };

  const q = normalize(options.query.trim());
  const filtered = rows
    .filter((r) => {
      if (options.filter === "confirmes" && !r.confirmed) return false;
      if (options.filter === "en-attente" && r.confirmed) return false;
      if (options.filter === "admins" && !r.isAdmin) return false;
      if (!q) return true;
      return normalize(`${r.email ?? ""} ${r.displayName ?? ""}`).includes(q);
    })
    .sort((a, b) =>
      options.sort === "connexion"
        ? (b.lastSignInAt ?? "").localeCompare(a.lastSignInAt ?? "")
        : b.createdAt.localeCompare(a.createdAt),
    );

  const pageCount = Math.max(1, Math.ceil(filtered.length / USERS_PAGE_SIZE));
  const page = Math.min(Math.max(1, options.page), pageCount);
  const slice = filtered.slice((page - 1) * USERS_PAGE_SIZE, page * USERS_PAGE_SIZE);

  // Compteurs uniquement pour la page affichée.
  const head = { count: "exact", head: true } as const;
  const counts = await Promise.all(
    slice.map(async (r) => {
      const [c, m] = await Promise.all([
        admin.from("conversations").select("id", head).eq("user_id", r.id),
        admin.from("messages").select("id", head).eq("user_id", r.id).eq("role", "user"),
      ]);
      if (c.error) throw c.error;
      if (m.error) throw m.error;
      return { conversations: c.count ?? 0, messagesSent: m.count ?? 0 };
    }),
  );

  return {
    users: slice.map((r, i) => ({ ...r, ...counts[i] })),
    matching: filtered.length,
    page,
    pageCount,
    totals,
  };
}
