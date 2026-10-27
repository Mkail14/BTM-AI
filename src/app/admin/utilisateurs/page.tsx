import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { PERSONALITIES } from "@/lib/ai/personalities";
import { PERSONALITY_LOOKS } from "@/lib/ai/personality-looks";
import {
  getUserDirectory,
  USER_FILTERS,
  USER_SORTS,
  type DirectoryUser,
  type UserDirectory,
  type UserFilter,
} from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/session";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Utilisateurs", robots: { index: false, follow: false } };

/*
 * Annuaire des inscrits. Uniquement des informations de compte et des
 * comptages : jamais le contenu des conversations (engagement de la page
 * Confidentialité).
 */

const TZ = "Indian/Mayotte";
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const numberFormat = new Intl.NumberFormat("fr-FR");
const relative = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });

const FILTER_LABELS: Record<UserFilter, string> = {
  tous: "Tous",
  confirmes: "Confirmés",
  "en-attente": "En attente",
  admins: "Admins",
};

function ago(iso: string | null): string {
  if (!iso) return "Jamais";
  const minutes = Math.round((Date.parse(iso) - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return relative.format(days, "day");
  return dateFormat.format(new Date(iso));
}

function pick<T extends string>(value: string | string[] | undefined, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function Status({ user }: { user: DirectoryUser }) {
  return (
    <span className="flex flex-wrap gap-1">
      {user.isAdmin ? (
        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg">Admin</span>
      ) : null}
      {user.confirmed ? (
        <span className="rounded-full bg-bg-muted px-2 py-0.5 text-[11px] font-medium">Confirmé</span>
      ) : (
        <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium">En attente</span>
      )}
    </span>
  );
}

function Personality({ user }: { user: DirectoryUser }) {
  if (!user.personality) return <span className="text-fg-muted">—</span>;
  const p = PERSONALITIES[user.personality];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden="true"
        className="size-2.5 rounded-full"
        style={{ backgroundColor: PERSONALITY_LOOKS[user.personality].color }}
      />
      {p.emoji} {p.label}
    </span>
  );
}

function Avatar({ user }: { user: DirectoryUser }) {
  const name = user.displayName || user.email || "?";
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-bg px-4 py-3">
      <dt className="truncate text-xs text-fg-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{numberFormat.format(value)}</dd>
    </div>
  );
}

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/utilisateurs">) {
  const { user } = await requireAdmin("/admin/utilisateurs");
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const filter = pick(params.statut, USER_FILTERS, "tous");
  const sort = pick(params.tri, USER_SORTS, "recents");
  const requestedPage = Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1;

  const admin = getSupabaseAdminClient();
  let directory: UserDirectory | null = null;
  let failure: string | null = null;
  if (!admin) {
    failure = "La clé secrète Supabase (SUPABASE_SECRET_KEY) n'est pas configurée : la liste des comptes est indisponible.";
  } else {
    try {
      directory = await getUserDirectory(admin, { query, filter, sort, page: requestedPage });
    } catch (error) {
      console.error("[admin] Annuaire indisponible", error);
      failure = "La liste des comptes n'a pas pu être chargée. Réessayez dans un instant.";
    }
  }

  const href = (changes: Record<string, string | number>) => {
    const next = new URLSearchParams();
    const merged = { q: query, statut: filter, tri: sort, page: 1, ...changes };
    for (const [key, value] of Object.entries(merged)) {
      const isDefault =
        (key === "q" && !value) ||
        (key === "statut" && value === "tous") ||
        (key === "tri" && value === "recents") ||
        (key === "page" && Number(value) === 1);
      if (!isDefault) next.set(key, String(value));
    }
    const qs = next.toString();
    return qs ? `/admin/utilisateurs?${qs}` : "/admin/utilisateurs";
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Utilisateurs" email={user.email} />

      <main id="contenu" className="mx-auto w-full max-w-[1600px] flex-1 space-y-5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Utilisateurs</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Les personnes inscrites sur BTM AI. Le contenu des conversations n&apos;est jamais affiché ici.
          </p>
        </div>

        {failure ? (
          <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-sm">
            {failure}
          </p>
        ) : null}

        {directory ? (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Tile label="Inscrits" value={directory.totals.all} />
              <Tile label="Confirmés" value={directory.totals.confirmed} />
              <Tile label="E-mail non confirmé" value={directory.totals.pending} />
              <Tile label="Administrateurs" value={directory.totals.admins} />
              <Tile label="Nouveaux (7 jours)" value={directory.totals.lastSevenDays} />
            </dl>

            <section aria-label="Liste des comptes" className="rounded-2xl border border-border bg-bg">
              <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
                <form action="/admin/utilisateurs" className="flex min-w-0 flex-1 gap-2" role="search">
                  {filter !== "tous" ? <input type="hidden" name="statut" value={filter} /> : null}
                  {sort !== "recents" ? <input type="hidden" name="tri" value={sort} /> : null}
                  <label htmlFor="user-search" className="sr-only">
                    Rechercher un compte
                  </label>
                  <input
                    id="user-search"
                    name="q"
                    type="search"
                    defaultValue={query}
                    placeholder="Rechercher par e-mail ou par nom…"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover"
                  >
                    Rechercher
                  </button>
                </form>

                <nav aria-label="Filtrer par statut" className="flex flex-wrap gap-1.5">
                  {USER_FILTERS.map((f) => (
                    <Link
                      key={f}
                      href={href({ statut: f })}
                      aria-current={f === filter ? "page" : undefined}
                      className={`rounded-full px-3 py-1.5 text-sm ${
                        f === filter ? "bg-fg font-medium text-bg" : "bg-bg-muted hover:bg-border"
                      }`}
                    >
                      {FILTER_LABELS[f]}
                    </Link>
                  ))}
                </nav>

                <nav aria-label="Trier" className="flex gap-1.5 text-sm lg:ml-2">
                  <Link
                    href={href({ tri: "recents" })}
                    aria-current={sort === "recents" ? "page" : undefined}
                    className={sort === "recents" ? "font-medium" : "text-fg-muted hover:text-fg"}
                  >
                    Plus récents
                  </Link>
                  <span aria-hidden="true" className="text-fg-muted">
                    ·
                  </span>
                  <Link
                    href={href({ tri: "connexion" })}
                    aria-current={sort === "connexion" ? "page" : undefined}
                    className={sort === "connexion" ? "font-medium" : "text-fg-muted hover:text-fg"}
                  >
                    Dernière connexion
                  </Link>
                </nav>
              </div>

              {directory.users.length === 0 ? (
                <p className="p-8 text-center text-sm text-fg-muted">
                  {query ? `Aucun compte ne correspond à « ${query} ».` : "Aucun compte pour ce filtre."}
                </p>
              ) : (
                <>
                  {/* Ordinateur : tableau */}
                  <table className="hidden w-full text-sm md:table">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-fg-muted">
                        <th scope="col" className="px-4 py-2.5 font-medium">Compte</th>
                        <th scope="col" className="px-4 py-2.5 font-medium">Statut</th>
                        <th scope="col" className="px-4 py-2.5 font-medium">Personnalité</th>
                        <th scope="col" className="px-4 py-2.5 font-medium">Inscription</th>
                        <th scope="col" className="px-4 py-2.5 font-medium">Dernière connexion</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-medium">Conversations</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-medium">Messages</th>
                      </tr>
                    </thead>
                    <tbody>
                      {directory.users.map((u) => (
                        <tr key={u.id} className="border-b border-border last:border-b-0 hover:bg-bg-subtle">
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-3">
                              <Avatar user={u} />
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{u.displayName || "Sans nom"}</span>
                                <span className="block truncate text-xs text-fg-muted">{u.email}</span>
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Status user={u} />
                          </td>
                          <td className="px-4 py-3">
                            <Personality user={u} />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">{dateFormat.format(new Date(u.createdAt))}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-fg-muted">{ago(u.lastSignInAt)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{numberFormat.format(u.conversations)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{numberFormat.format(u.messagesSent)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Téléphone : cartes */}
                  <ul className="divide-y divide-border md:hidden">
                    {directory.users.map((u) => (
                      <li key={u.id} className="flex gap-3 p-4">
                        <Avatar user={u} />
                        <div className="min-w-0 flex-1 space-y-1.5 text-sm">
                          <p className="truncate font-medium">{u.displayName || "Sans nom"}</p>
                          <p className="truncate text-xs text-fg-muted">{u.email}</p>
                          <Status user={u} />
                          {u.personality ? (
                            <p className="text-xs">
                              <Personality user={u} />
                            </p>
                          ) : null}
                          <p className="text-xs text-fg-muted">
                            Inscrit le {dateFormat.format(new Date(u.createdAt))} · vu {ago(u.lastSignInAt).toLowerCase()}
                          </p>
                          <p className="text-xs text-fg-muted">
                            {numberFormat.format(u.conversations)} conversation{u.conversations > 1 ? "s" : ""} ·{" "}
                            {numberFormat.format(u.messagesSent)} message{u.messagesSent > 1 ? "s" : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
                <p className="text-fg-muted">
                  {numberFormat.format(directory.matching)} compte{directory.matching > 1 ? "s" : ""}
                  {directory.pageCount > 1 ? ` · page ${directory.page} sur ${directory.pageCount}` : ""}
                </p>
                {directory.pageCount > 1 ? (
                  <nav aria-label="Pagination" className="flex gap-2">
                    {directory.page > 1 ? (
                      <Link href={href({ page: directory.page - 1 })} className="rounded-lg border border-border px-3 py-1.5 hover:bg-bg-muted">
                        ← Précédent
                      </Link>
                    ) : null}
                    {directory.page < directory.pageCount ? (
                      <Link href={href({ page: directory.page + 1 })} className="rounded-lg border border-border px-3 py-1.5 hover:bg-bg-muted">
                        Suivant →
                      </Link>
                    ) : null}
                  </nav>
                ) : null}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
