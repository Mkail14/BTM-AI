import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { buildAdminAlerts, type AdminAlert } from "@/lib/admin/alerts";
import {
  getAdminOverview,
  listAdminUsers,
  type AdminOverview,
  type AdminUserRow,
} from "@/lib/admin/stats";
import { supabaseDashboardLink } from "@/lib/admin/supabase-links";
import { getAIProvider } from "@/lib/ai";
import { getCodeExamHealth } from "@/lib/code-exam/laposte";
import { requireAdmin } from "@/lib/auth/session";
import { getGeminiSpend, type GeminiSpend } from "@/lib/ai/usage";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseUrl } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Tableau de bord", robots: { index: false, follow: false } };

/*
 * Tableau de bord sur un seul écran (ordinateur) : la page ne défile pas,
 * seule la liste des comptes défile dans son cadre. Sur petit écran, les
 * blocs s'empilent et la page défile normalement.
 */

const TZ = "Indian/Mayotte";
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const weekdayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const numberFormat = new Intl.NumberFormat("fr-FR");

const fmt = (value: number) => numberFormat.format(value);
const pct = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)} %` : "—");
const supabaseLink = (path: string) => supabaseDashboardLink(supabaseUrl, path);

function readPage(value: string | string[] | undefined) {
  const page = Number.parseInt(typeof value === "string" ? value : "", 10);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

/* -------------------------------------------------------------------------- */
/* Éléments de mise en page                                                   */
/* -------------------------------------------------------------------------- */

function Card({
  id,
  title,
  aside,
  children,
  className = "",
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={`flex min-h-0 flex-col rounded-2xl border border-border bg-bg p-4 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-sm font-semibold">
          {title}
        </h2>
        {aside ? <span className="truncate text-xs text-fg-muted">{aside}</span> : null}
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/** Chiffre clé. Téléphone : libellé court, sans détail, pour tenir à quatre sur une ligne. */
function Tile({ label, short, value, hint }: { label: string; short: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-border bg-bg px-2.5 py-2 md:px-4 md:py-3">
      <dt className="order-2 truncate text-[11px] text-fg-muted md:order-1 md:text-xs">
        <span className="md:hidden">{short}</span>
        <span className="hidden md:inline">{label}</span>
      </dt>
      <dd className="order-1 text-lg font-semibold tracking-tight tabular-nums md:order-2 md:mt-1 md:text-2xl">{value}</dd>
      {hint ? <dd className="order-3 hidden truncate text-xs text-fg-muted md:block">{hint}</dd> : null}
    </div>
  );
}

function Unavailable({ children }: { children: ReactNode }) {
  return <p className="text-sm text-fg-muted">{children}</p>;
}

/* -------------------------------------------------------------------------- */
/* Problèmes à régler (bandeau affiché seulement s il y en a)                 */
/* -------------------------------------------------------------------------- */

const ALERT_STYLES: Record<AdminAlert["level"], { label: string; icon: string; box: string; badge: string }> = {
  critical: { label: "Bloquant", icon: "!", box: "border-danger/40 bg-danger-soft", badge: "bg-danger text-danger-fg" },
  warning: { label: "À vérifier", icon: "!", box: "border-border bg-warning-soft", badge: "bg-fg text-bg" },
  info: { label: "Info", icon: "i", box: "border-border bg-bg-subtle", badge: "bg-fg-muted text-bg" },
};

/** Téléphone : une pastille « 3 points à vérifier » ; la liste s'ouvre par-dessus la page, sans la pousser. */
function AlertsSummary({ alerts }: { alerts: AdminAlert[] }) {
  const critical = alerts.some((a) => a.level === "critical");
  return (
    <details className="group relative md:hidden">
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden ${
          critical ? "border-danger/40 bg-danger-soft text-danger" : "border-border bg-warning-soft"
        }`}
      >
        <span
          aria-hidden="true"
          className={`grid size-5 place-items-center rounded-full text-[11px] font-bold ${critical ? "bg-danger text-danger-fg" : "bg-fg text-bg"}`}
        >
          !
        </span>
        <span className="flex-1">
          {alerts.length} point{alerts.length > 1 ? "s" : ""} à vérifier
        </span>
        <span aria-hidden="true" className="text-fg-muted transition-transform group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-[60dvh] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-bg p-2 shadow-xl">
        <Alerts alerts={alerts} />
      </div>
    </details>
  );
}

function Alerts({ alerts }: { alerts: AdminAlert[] }) {
  return (
    <ul className="grid grid-cols-1 gap-2">
      {alerts.map((alert) => {
        const style = ALERT_STYLES[alert.level];
        return (
          <li key={alert.title} className={`flex gap-2.5 rounded-xl border p-3 text-xs ${style.box}`}>
            <span
              aria-hidden="true"
              className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${style.badge}`}
            >
              {style.icon}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                <span className="sr-only">{style.label} : </span>
                {alert.title}
              </p>
              <p className="mt-0.5 text-fg-muted">{alert.detail}</p>
              {alert.action?.href.startsWith("/") ? (
                <Link href={alert.action.href} className="mt-1 inline-block font-medium text-accent hover:underline">
                  {alert.action.label} →
                </Link>
              ) : alert.action ? (
                <a
                  href={alert.action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block font-medium text-accent hover:underline"
                >
                  {alert.action.label} ↗
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Activité sur 14 jours (une seule série : pas de légende, le titre la nomme) */
/* -------------------------------------------------------------------------- */

function ActivityChart({ daily }: { daily: AdminOverview["daily"] }) {
  const max = Math.max(...daily.map((d) => d.questions), 0);
  const scaleMax = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const label = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`));
  const longLabel = (day: string) => weekdayFormat.format(new Date(`${day}T00:00:00Z`));

  return (
    <div className="flex min-h-40 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 gap-2">
        {/* Graduations : valeurs rondes, quadrillage discret */}
        <div className="flex flex-col justify-between text-right text-[11px] text-fg-muted tabular-nums" aria-hidden="true">
          <span>{fmt(scaleMax)}</span>
          <span>{fmt(scaleMax / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden="true">
            <div className="border-t border-border" />
            <div className="border-t border-border" />
            <div className="border-t border-border" />
          </div>
          <ol className="relative flex h-full items-end justify-between gap-0.5" aria-hidden="true">
            {daily.map((d) => {
              const height = d.questions === 0 ? 0 : Math.max((d.questions / scaleMax) * 100, 2);
              return (
                <li key={d.day} className="group relative flex h-full flex-1 items-end justify-center">
                  {/* Zone de survol plus large que la barre */}
                  <span className="absolute inset-0 rounded-md group-hover:bg-bg-muted/60" />
                  <span className="relative w-full max-w-6 rounded-t-[4px] bg-chart-1" style={{ height: `${height}%` }} />
                  {/* Valeur au-dessus de chaque bâton */}
                  {d.questions > 0 ? (
                    <span
                      className="absolute text-[10px] font-medium text-fg tabular-nums md:text-[11px]"
                      style={{ bottom: `calc(${height}% + 4px)` }}
                    >
                      {fmt(d.questions)}
                    </span>
                  ) : null}
                  <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs shadow-lg group-hover:block">
                    <span className="block text-fg-muted">{label(d.day)}</span>
                    <span className="font-semibold tabular-nums">{fmt(d.questions)}</span> question
                    {d.questions > 1 ? "s" : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <div className="mt-1.5 flex justify-between pl-6 text-[11px] text-fg-muted" aria-hidden="true">
        <span>{daily[0] ? label(daily[0].day) : ""}</span>
        <span>Aujourd&apos;hui</span>
      </div>

      {/* Version tableau pour les lecteurs d'écran */}
      <table className="sr-only">
        <caption>Questions des comptes connectés, par jour</caption>
        <thead>
          <tr>
            <th scope="col">Jour</th>
            <th scope="col">Questions</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((d) => (
            <tr key={d.day}>
              <td>{longLabel(d.day)}</td>
              <td>{d.questions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Progression de Tamilya, crédit Google, comptes                                  */
/* -------------------------------------------------------------------------- */

/** Objectif de vocabulaire : les mots essentiels d'une conversation courante. */
const AWA_GOAL = 1000;

type AwaProgress = { known: number; week: number; toTranslate: number };

/** Mots et expressions que Tamilya connaît, appris cette semaine, et mots en attente de traduction. */
async function getAwaProgress(admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>): Promise<AwaProgress | null> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const active = (table: "awa_words" | "awa_lexicon", since?: string) => {
    const query = admin.from(table).select("id", { count: "exact", head: true }).eq("is_active", true);
    return since ? query.gte("created_at", since) : query;
  };
  const [words, lexicon, wordsWeek, lexiconWeek, requests] = await Promise.all([
    active("awa_words"),
    active("awa_lexicon"),
    active("awa_words", weekAgo),
    active("awa_lexicon", weekAgo),
    admin.from("awa_word_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  if (words.error || lexicon.error) return null;
  return {
    known: (words.count ?? 0) + (lexicon.count ?? 0),
    week: (wordsWeek.count ?? 0) + (lexiconWeek.count ?? 0),
    toTranslate: requests.count ?? 0,
  };
}

/** Barre de progression : couleur d'accent, ou d'alerte quand on approche de la limite. */
function ProgressCard({
  title,
  value,
  ratio,
  tone = "accent",
  children,
}: {
  title: string;
  value: ReactNode;
  ratio: number;
  tone?: "accent" | "warning" | "danger";
  children?: ReactNode;
}) {
  const bar = { accent: "bg-accent", warning: "bg-warning", danger: "bg-danger" }[tone];
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const percent = Math.round(clamped * 100);
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-bg px-3 py-2.5 md:px-4 md:py-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="truncate text-xs font-semibold md:text-sm">{title}</h2>
        <span className="text-xs text-fg-muted tabular-nums">{percent} %</span>
      </div>
      <p className="mt-0.5 truncate text-lg font-semibold tracking-tight tabular-nums md:mt-1 md:text-2xl">{value}</p>
      <div
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-muted md:mt-2 md:h-2.5"
      >
        {/* Au moins un trait visible dès qu'il y a quelque chose. */}
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${clamped > 0 ? Math.max(clamped * 100, 1) : 0}%` }} />
      </div>
      <p className="mt-1.5 hidden text-xs text-fg-muted md:block">{children}</p>
    </section>
  );
}

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

function AwaProgressCard({ progress }: { progress: AwaProgress | null }) {
  if (!progress) {
    return (
      <ProgressCard title="Tamilya apprend le shimaoré" value="—" ratio={0}>
        Vocabulaire illisible pour le moment.
      </ProgressCard>
    );
  }
  return (
    <ProgressCard
      title="Tamilya apprend le shimaoré"
      value={
        <>
          {fmt(progress.known)} <span className="text-base font-normal text-fg-muted">/ {fmt(AWA_GOAL)} mots</span>
        </>
      }
      ratio={progress.known / AWA_GOAL}
    >
      <span className={progress.week > 0 ? "font-medium text-success" : ""}>+{fmt(progress.week)} cette semaine</span>
      {" · "}
      <Link href="/admin/lexique" className="font-medium text-fg hover:underline">
        {progress.toTranslate > 0 ? `${fmt(progress.toTranslate)} à traduire →` : "Lexique →"}
      </Link>
    </ProgressCard>
  );
}

function GoogleCreditCard({ spend }: { spend: GeminiSpend | null }) {
  if (!spend) {
    return (
      <ProgressCard title="Crédit Google (Gemini)" value="—" ratio={0}>
        Suivi à activer : migration 20261107000000_ai_usage.sql dans Supabase.
      </ProgressCard>
    );
  }
  const ratio = spend.spentEur / spend.budgetEur;
  return (
    <ProgressCard
      title="Crédit Google (Gemini)"
      value={
        <>
          {euros.format(spend.spentEur)} <span className="text-base font-normal text-fg-muted">/ {euros.format(spend.budgetEur)}</span>
        </>
      }
      ratio={ratio}
      tone={ratio >= 0.9 ? "danger" : ratio >= 0.75 ? "warning" : "accent"}
    >
      {euros.format(spend.today)} aujourd&apos;hui · {fmt(spend.requests)} réponses · estimation
    </ProgressCard>
  );
}

function UsersList({ users }: { users: AdminUserRow[] }) {
  if (users.length === 0) return <Unavailable>Aucun compte.</Unavailable>;
  return (
    <ul className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4 text-sm">
      {users.map((u) => (
        <li key={u.id} className="border-b border-border py-2 last:border-b-0">
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate font-medium" title={u.email ?? undefined}>
              {u.email ?? "—"}
            </span>
            {u.isAdmin ? (
              <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-fg">admin</span>
            ) : null}
            {!u.confirmed ? (
              <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] text-fg-muted">
                non confirmé
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-fg-muted">
            <span className="font-medium text-fg tabular-nums">
              {fmt(u.messagesSent)} message{u.messagesSent > 1 ? "s" : ""}
            </span>{" "}
            · {fmt(u.conversations)} conversation{u.conversations > 1 ? "s" : ""} · inscrit le{" "}
            {dateFormat.format(new Date(u.createdAt))}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Pagination({ page, hasNextPage }: { page: number; hasNextPage: boolean }) {
  if (page === 1 && !hasNextPage) return null;
  const linkClass = "rounded-md px-2 py-1 font-medium hover:bg-bg-muted";
  return (
    <nav aria-label="Pages des comptes" className="mt-2 flex items-center justify-between border-t border-border pt-2 text-xs">
      {page > 1 ? (
        <Link href={`/admin?page=${page - 1}`} className={linkClass}>
          ← Précédents
        </Link>
      ) : (
        <span />
      )}
      <span className="text-fg-muted">Page {page}</span>
      {hasNextPage ? (
        <Link href={`/admin?page=${page + 1}`} className={linkClass}>
          Suivants →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

type Settled<T> = { status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown };

/** Comme Promise.allSettled, pour une seule promesse. */
function settle<T>(promise: PromiseLike<T>): Promise<Settled<T>> {
  return Promise.resolve(promise).then(
    (value) => ({ status: "fulfilled", value }),
    (reason: unknown) => ({ status: "rejected", reason }),
  );
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  // Vérifie la session et le rôle avant toute lecture avec la clé secrète.
  await requireAdmin("/admin");
  const page = readPage((await searchParams).page);
  const admin = getSupabaseAdminClient();
  const hasSalt = Boolean(process.env.RATE_LIMIT_SALT?.trim());
  // Tout part en même temps : un seul temps d'attente au lieu de trois à la suite.
  const [ai, codeExam, overviewResult, usersResult, progressResult, spendResult] = await Promise.all([
    getAIProvider(),
    getCodeExamHealth({ waitMs: 1500 }),
    admin ? settle(getAdminOverview(admin)) : null,
    admin ? settle(listAdminUsers(admin, page)) : null,
    admin ? settle(getAwaProgress(admin)) : null,
    admin ? settle(getGeminiSpend(admin)) : null,
  ]);

  let overview: AdminOverview | null = null;
  let usersPage: Awaited<ReturnType<typeof listAdminUsers>> | null = null;
  let progress: AwaProgress | null = null;
  let spend: GeminiSpend | null = null;
  if (progressResult?.status === "fulfilled") progress = progressResult.value;
  if (spendResult?.status === "fulfilled") spend = spendResult.value;
  if (overviewResult?.status === "fulfilled") overview = overviewResult.value;
  else if (overviewResult) console.error("[admin] Statistiques indisponibles", overviewResult.reason);
  if (usersResult?.status === "fulfilled") usersPage = usersResult.value;
  else if (usersResult) console.error("[admin] Liste des comptes indisponible", usersResult.reason);

  const wordsToTranslate = progress?.toTranslate ?? 0;

  const alerts = buildAdminAlerts({
    aiProblem: ai.ok ? null : ai.reason,
    hasSecretKey: Boolean(admin),
    hasRateLimitSalt: hasSalt,
    overview,
    wordsToTranslate,
    codeExamProblem: codeExam.ok ? null : codeExam.message,
    supabaseLink,
  });
  const statsMissing = admin
    ? "Statistiques indisponibles : appliquez la migration 20261028120000_admin_platform_stats.sql dans Supabase."
    : "Statistiques indisponibles : SUPABASE_SECRET_KEY n'est pas définie.";

  return (
    // Un seul écran, téléphone compris : le graphique prend la place restante, seule la liste des comptes défile.
    // Écran trop bas (moins de 600 px, téléphone couché) : la page défile normalement (voir .ecran-fixe).
    <div className="ecran-fixe flex min-h-dvh flex-col bg-bg-subtle [@media(min-height:600px)]:overflow-hidden">
      <AdminHeader />

      <main
        id="contenu"
        className={`mx-auto flex w-full max-w-[1600px] min-h-0 flex-1 flex-col gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:grid md:grid-cols-[minmax(0,1fr)_18rem] md:gap-4 md:p-4 xl:grid-cols-[minmax(0,1fr)_22rem] ${
          alerts.length > 0 ? "md:grid-rows-[auto_minmax(0,1fr)]" : ""
        }`}
      >
        <h1 className="sr-only">Tableau de bord BTM AI</h1>

        {/* Rien quand tout va bien ; en cas de problème, en tête sur mobile et au-dessus des comptes sur ordinateur. */}
        {alerts.length > 0 ? (
          <section aria-label="Problèmes à régler" className="shrink-0 md:col-start-2 md:row-start-1">
            <AlertsSummary alerts={alerts} />
            <div className="hidden md:block">
              <Alerts alerts={alerts} />
            </div>
          </section>
        ) : null}

        {/* Colonne principale : progressions, chiffres clés, activité */}
        <div
          className={`flex min-h-0 flex-1 flex-col gap-3 md:col-start-1 md:row-start-1 md:gap-4 ${alerts.length > 0 ? "md:row-span-2" : ""}`}
        >
          {/* Les deux progressions à suivre : le vocabulaire de Tamilya et le crédit payé. */}
          <div className="grid shrink-0 grid-cols-2 gap-3 md:gap-4">
            <AwaProgressCard progress={progress} />
            <GoogleCreditCard spend={spend} />
          </div>

          {overview ? (
            <dl className="grid shrink-0 grid-cols-4 gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-4" aria-label="Chiffres clés">
              <Tile
                label="Messages aujourd'hui"
                short="Messages"
                value={fmt(overview.questionsToday + overview.anonMessagesToday)}
                hint={`${fmt(overview.questionsToday)} comptes · ~${fmt(overview.anonMessagesToday)} visiteurs`}
              />
              <Tile
                label="Utilisateurs actifs (7 j)"
                short="Actifs 7 j"
                value={fmt(overview.usersActive7d)}
                hint={`${fmt(overview.usersTotal)} inscrits au total`}
              />
              <Tile label="Inscriptions (7 j)" short="Inscrits 7 j" value={fmt(overview.usersNew7d)} hint={`${fmt(overview.usersNewToday)} aujourd'hui`} />
              <Tile
                label="Réponses en erreur (7 j)"
                short="Erreurs"
                value={pct(overview.errors7d, overview.answers7d)}
                hint={`${fmt(overview.errors7d)} sur ${fmt(overview.answers7d)} réponses`}
              />
            </dl>
          ) : null}

          <Card
            id="activite"
            title="Questions des comptes connectés · 14 jours"
            aside={overview ? `${fmt(overview.questions7d)} sur 7 j · ${fmt(overview.questions30d)} sur 30 j` : undefined}
            className="min-h-64! flex-1"
          >
            {overview ? <ActivityChart daily={overview.daily} /> : <Unavailable>{statsMissing}</Unavailable>}
          </Card>
        </div>

        {/* Colonne latérale : comptes */}
        {/* Téléphone : un lien vers la page des comptes à la place de la liste. */}
        <Link
          href="/admin/utilisateurs"
          className="flex shrink-0 items-center justify-between rounded-2xl border border-border bg-bg px-4 py-3 text-sm md:hidden"
        >
          <span>
            <span className="font-semibold">Comptes{usersPage ? ` (${fmt(usersPage.total)})` : ""}</span>
            {overview ? <span className="text-fg-muted"> · {fmt(overview.conversationsTotal)} conversations</span> : null}
          </span>
          <span aria-hidden="true" className="text-fg-muted">
            →
          </span>
        </Link>

        <div className={`hidden min-h-0 flex-col gap-4 md:col-start-2 md:flex ${alerts.length > 0 ? "md:row-start-2" : "md:row-start-1"}`}>
          <Card
            id="comptes"
            title={usersPage ? `Comptes (${fmt(usersPage.total)})` : "Comptes"}
            aside={overview ? `${fmt(overview.conversationsTotal)} conversations` : undefined}
            className="min-h-0 flex-1 [@media(max-height:599px)]:min-h-64"
          >
            {usersPage ? (
              <>
                <UsersList users={usersPage.users} />
                <Pagination page={page} hasNextPage={usersPage.hasNextPage} />
              </>
            ) : (
              <Unavailable>
                {admin ? "La liste des comptes n'a pas pu être chargée." : "SUPABASE_SECRET_KEY n'est pas définie."}
              </Unavailable>
            )}
          </Card>

        </div>
      </main>
    </div>
  );
}
