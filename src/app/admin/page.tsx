import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminMenu } from "@/components/admin/AdminMenu";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { IconMic } from "@/components/ui/icons";
import { buildAdminAlerts, type AdminAlert } from "@/lib/admin/alerts";
import {
  getAdminOverview,
  listAdminUsers,
  type AdminOverview,
  type AdminUserRow,
} from "@/lib/admin/stats";
import { supabaseDashboardLink } from "@/lib/admin/supabase-links";
import { getAIProvider } from "@/lib/ai";
import { requireAdmin } from "@/lib/auth/session";
import { CHAT_LIMITS } from "@/lib/chat/limits";
import { loadRateLimitSettings, type RateLimitSettings } from "@/lib/rate-limit/settings";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseUrl } from "@/lib/supabase/config";
import { SignOutButton } from "../parametres/SignOutButton";

export const metadata: Metadata = { title: "Tableau de bord", robots: { index: false, follow: false } };

/*
 * Tableau de bord sur un seul écran (ordinateur) : la page ne défile pas,
 * seule la liste des comptes défile dans son cadre. Sur petit écran, les
 * blocs s'empilent et la page défile normalement.
 */

const TZ = "Indian/Mayotte";
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const timeFormat = new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone: TZ });
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

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-bg px-4 py-3">
      <dt className="truncate text-xs text-fg-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</dd>
      {hint ? <dd className="truncate text-xs text-fg-muted">{hint}</dd> : null}
    </div>
  );
}

function Unavailable({ children }: { children: ReactNode }) {
  return <p className="text-sm text-fg-muted">{children}</p>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 last:border-b-0">
      <dt className="truncate text-fg-muted">{label}</dt>
      <dd className="shrink-0 text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Problèmes à régler (bandeau affiché seulement s il y en a)                 */
/* -------------------------------------------------------------------------- */

const ALERT_STYLES: Record<AdminAlert["level"], { label: string; icon: string; box: string; badge: string }> = {
  critical: { label: "Bloquant", icon: "!", box: "border-danger/40 bg-danger-soft", badge: "bg-danger text-white" },
  warning: { label: "À vérifier", icon: "!", box: "border-border bg-warning-soft", badge: "bg-fg text-bg" },
  info: { label: "Info", icon: "i", box: "border-border bg-bg-subtle", badge: "bg-fg-muted text-bg" },
};

function Alerts({ alerts }: { alerts: AdminAlert[] }) {
  return (
    <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-1">
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
              {alert.action ? (
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
            {daily.map((d, index) => {
              const isToday = index === daily.length - 1;
              const height = d.questions === 0 ? 0 : Math.max((d.questions / scaleMax) * 100, 2);
              return (
                <li key={d.day} className="group relative flex h-full flex-1 items-end justify-center">
                  {/* Zone de survol plus large que la barre */}
                  <span className="absolute inset-0 rounded-md group-hover:bg-bg-muted/60" />
                  <span className="relative w-full max-w-6 rounded-t-[4px] bg-chart-1" style={{ height: `${height}%` }} />
                  {isToday && d.questions > 0 ? (
                    <span
                      className="absolute text-[11px] font-medium text-fg tabular-nums"
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
/* Qualité, comptes, réglages, raccourcis                                     */
/* -------------------------------------------------------------------------- */

function Quality({ stats }: { stats: AdminOverview }) {
  return (
    <dl className="text-sm">
      <Row label="Réponses générées">{fmt(stats.answers7d)}</Row>
      <Row label="En erreur">
        {fmt(stats.errors7d)} <span className="font-normal text-fg-muted">· {pct(stats.errors7d, stats.answers7d)}</span>
      </Row>
      <Row label="Interrompues">
        {fmt(stats.interrupted7d)}{" "}
        <span className="font-normal text-fg-muted">· {pct(stats.interrupted7d, stats.answers7d)}</span>
      </Row>
      <Row label="Visiteurs à la limite (auj.)">{fmt(stats.anonDevicesBlockedToday)}</Row>
      <Row label="Comptes à la limite (auj.)">{fmt(stats.usersBlockedToday)}</Row>
    </dl>
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

function Status({ ok, okLabel = "Configurée", koLabel = "Absente" }: { ok: boolean; okLabel?: string; koLabel?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden="true">{ok ? "✓" : "✕"}</span>
      <span className={ok ? "" : "text-danger"}>{ok ? okLabel : koLabel}</span>
    </span>
  );
}

type AIStatus = Awaited<ReturnType<typeof getAIProvider>>;

/** Réglages en vigueur. Aucune valeur secrète n'est affichée. */
function ServiceConfig({
  ai,
  limits,
  hasSecretKey,
  hasSalt,
}: {
  ai: AIStatus;
  limits: RateLimitSettings;
  hasSecretKey: boolean;
  hasSalt: boolean;
}) {
  const anonDay = limits.anonymousDevice.day;
  const userDay = limits.user.day;
  return (
    <dl className="text-sm">
      <Row label="Modèle d'IA">
        {ai.ok ? (
          <Link href="/admin/modele-ia" className="font-mono text-xs hover:underline" title={ai.config.provider}>
            {ai.config.model}
          </Link>
        ) : (
          <Status ok={false} koLabel="Non configuré" />
        )}
      </Row>
      <Row label="Quotas par jour">
        {anonDay} visiteur · {userDay} compte
      </Row>
      <Row label="Conversation sans compte">{CHAT_LIMITS.anonymousMaxMessages / 2} échanges</Row>
      <Row label="Clé secrète Supabase">
        <Status ok={hasSecretKey} />
      </Row>
      <Row label="Sel des adresses IP">
        <Status ok={hasSalt} okLabel="Configuré" koLabel="Absent" />
      </Row>
    </dl>
  );
}

const SHORTCUTS: { label: string; path: string }[] = [
  { label: "Utilisateurs", path: "auth/users" },
  { label: "Envoi des e-mails", path: "auth/smtp" },
  { label: "Modèles d'e-mails", path: "auth/templates" },
  { label: "Limites d'envoi", path: "auth/rate-limits" },
  { label: "Journaux", path: "logs/auth-logs" },
];

function Shortcuts() {
  const links = SHORTCUTS.map((s) => ({ ...s, href: supabaseLink(s.path) })).filter((s) => s.href);
  if (links.length === 0) return <Unavailable>Projet Supabase non détecté.</Unavailable>;
  return (
    <ul className="flex flex-wrap gap-1.5 text-xs">
      {links.map((s) => (
        <li key={s.path}>
          <a
            href={s.href!}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-medium hover:bg-bg-muted"
          >
            {s.label}
            <span aria-hidden="true" className="text-fg-muted">
              ↗
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  // Vérifie la session et le rôle avant toute lecture avec la clé secrète.
  const { user } = await requireAdmin("/admin");
  const page = readPage((await searchParams).page);
  const admin = getSupabaseAdminClient();
  const hasSalt = Boolean(process.env.RATE_LIMIT_SALT?.trim());
  const [ai, limits] = await Promise.all([getAIProvider(), loadRateLimitSettings()]);

  let overview: AdminOverview | null = null;
  let usersPage: Awaited<ReturnType<typeof listAdminUsers>> | null = null;
  if (admin) {
    const [overviewResult, usersResult] = await Promise.allSettled([
      getAdminOverview(admin),
      listAdminUsers(admin, page),
    ]);
    if (overviewResult.status === "fulfilled") overview = overviewResult.value;
    else console.error("[admin] Statistiques indisponibles", overviewResult.reason);
    if (usersResult.status === "fulfilled") usersPage = usersResult.value;
    else console.error("[admin] Liste des comptes indisponible", usersResult.reason);
  }

  const alerts = buildAdminAlerts({
    aiProblem: ai.ok ? null : ai.reason,
    hasSecretKey: Boolean(admin),
    hasRateLimitSalt: hasSalt,
    overview,
    supabaseLink,
  });
  const statsMissing = admin
    ? "Statistiques indisponibles : appliquez la migration 20261028120000_admin_platform_stats.sql dans Supabase."
    : "Statistiques indisponibles : SUPABASE_SECRET_KEY n'est pas définie.";

  return (
    // Tableau de bord sur un seul écran dès 1024 × 600 px (variante desk) ; en dessous, la page défile.
    <div className="flex min-h-dvh flex-col bg-bg-subtle desk:h-dvh desk:overflow-hidden">
      <header className="shrink-0 border-b border-border bg-bg">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
          <AdminMenu />
          <span className="hidden sm:block">
            <BrandLogo size="md" />
          </span>
          <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">Administration</span>
          <p className="ml-4 hidden text-xs text-fg-muted lg:block">
            Mis à jour à {timeFormat.format(new Date())} (heure de Mayotte) ·{" "}
            <Link href="/admin" className="font-medium text-fg hover:underline">
              Actualiser
            </Link>
          </p>
          <div className="ml-auto flex shrink-0 items-center gap-3 text-sm">
            <span className="hidden max-w-56 truncate text-fg-muted xl:inline">{user.email}</span>
            {/* Le globe : le maître d'Awa lui parle et lui apprend le shimaoré. */}
            <Link
              href="/voix"
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 font-medium text-accent-fg hover:bg-accent-hover"
            >
              <IconMic width={16} height={16} /> Parler à Awa
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main
        id="contenu"
        className={`mx-auto grid w-full max-w-[1600px] min-h-0 flex-1 gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:grid-cols-[minmax(0,1fr)_22rem] ${
          alerts.length > 0 ? "lg:grid-rows-[auto_minmax(0,1fr)]" : ""
        }`}
      >
        <h1 className="sr-only">Tableau de bord BTM AI</h1>

        {/* Rien quand tout va bien ; en cas de problème, en tête sur mobile et au-dessus des comptes sur ordinateur. */}
        {alerts.length > 0 ? (
          <section aria-label="Problèmes à régler" className="lg:col-start-2 lg:row-start-1">
            <Alerts alerts={alerts} />
          </section>
        ) : null}

        {/* Colonne principale : chiffres, activité, qualité, réglages */}
        <div
          className={`flex min-h-0 flex-col gap-4 lg:col-start-1 lg:row-start-1 ${alerts.length > 0 ? "lg:row-span-2" : ""}`}
        >
          {overview ? (
            <dl className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label="Chiffres clés">
              <Tile
                label="Inscriptions aujourd'hui"
                value={fmt(overview.usersNewToday)}
                hint={`${fmt(overview.usersNew7d)} sur 7 j · ${fmt(overview.usersTotal)} au total`}
              />
              <Tile
                label="Messages envoyés aujourd'hui"
                value={fmt(overview.questionsToday + overview.anonMessagesToday)}
                hint={`${fmt(overview.questionsToday)} comptes · ~${fmt(overview.anonMessagesToday)} visiteurs`}
              />
              <Tile
                label="Messages par utilisateur actif (7 j)"
                value={overview.usersActive7d > 0 ? fmt(Math.round((overview.questions7d / overview.usersActive7d) * 10) / 10) : "—"}
                hint={`${fmt(overview.usersActive7d)} utilisateurs actifs`}
              />
              <Tile label="Visiteurs sans compte (auj.)" value={fmt(overview.anonDevicesToday)} hint="Appareils, depuis 3 h" />
              {/* Paiements pas encore en place : à brancher ici (ex. Stripe) le moment venu. */}
              <Tile label="Euros générés aujourd'hui" value="— €" hint="Paiements non connectés" />
            </dl>
          ) : null}

          <Card
            id="activite"
            title="Questions des comptes connectés · 14 jours"
            aside={overview ? `${fmt(overview.questions7d)} sur 7 j · ${fmt(overview.questions30d)} sur 30 j` : undefined}
            className="min-h-64 flex-1 desk:min-h-0"
          >
            {overview ? <ActivityChart daily={overview.daily} /> : <Unavailable>{statsMissing}</Unavailable>}
          </Card>

          <div className="grid shrink-0 gap-4 md:grid-cols-2">
            <Card id="qualite" title="Qualité des réponses" aside="7 derniers jours">
              {overview ? <Quality stats={overview} /> : <Unavailable>—</Unavailable>}
            </Card>
            <Card id="service" title="Réglages en vigueur" aside="Variables du serveur">
              <ServiceConfig ai={ai} limits={limits} hasSecretKey={Boolean(admin)} hasSalt={hasSalt} />
            </Card>
          </div>
        </div>

        {/* Colonne latérale : comptes, raccourcis */}
        <div className={`flex min-h-0 flex-col gap-4 lg:col-start-2 ${alerts.length > 0 ? "lg:row-start-2" : "lg:row-start-1"}`}>
          <Card
            id="comptes"
            title={usersPage ? `Comptes (${fmt(usersPage.total)})` : "Comptes"}
            aside={overview ? `${fmt(overview.conversationsTotal)} conversations` : undefined}
            className="min-h-72 flex-1 desk:min-h-40"
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

          <Card id="raccourcis" title="Gérer dans Supabase" className="shrink-0">
            <Shortcuts />
          </Card>
        </div>
      </main>
    </div>
  );
}
